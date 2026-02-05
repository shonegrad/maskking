import './style.css'
import * as PIXI from 'pixi.js'
import { Pane } from 'tweakpane'

// Unsplash API key from environment
const UNSPLASH_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY

const state = {
  threshold: 0.0,
  feather: 0.06,
  speed: 0.18,
  direction: 'dark-to-bright',
  paused: false,
  noiseStrength: 0.0,
  noiseScale: 2.5,
  time: 0.0,
}

const app = new PIXI.Application()

// Helper: Set or hide credit attribution
function setCredit({ text, url } = {}) {
  const credit = document.querySelector('#credit')
  if (!credit) return
  if (!text || !url) {
    credit.hidden = true
    credit.innerHTML = ''
    return
  }
  credit.hidden = false
  credit.innerHTML = `Photo: <a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`
}

// Helper: Load texture from URL (handles async loading)
async function loadTextureFromUrl(url) {
  return await PIXI.Assets.load(url)
}

// Helper: Fetch random photo from Unsplash API
async function fetchRandomUnsplash({ query = 'nature', orientation = 'landscape' } = {}) {
  if (!UNSPLASH_KEY) {
    throw new Error('Missing VITE_UNSPLASH_ACCESS_KEY in .env.local')
  }

  const endpoint = new URL('https://api.unsplash.com/photos/random')
  endpoint.searchParams.set('orientation', orientation)
  endpoint.searchParams.set('query', query)

  const res = await fetch(endpoint.toString(), {
    headers: {
      Authorization: `Client-ID ${UNSPLASH_KEY}`,
      'Accept-Version': 'v1',
    },
  })

  if (!res.ok) {
    const msg = await res.text().catch(() => '')
    throw new Error(`Unsplash error ${res.status}: ${msg || res.statusText}`)
  }

  const data = await res.json()

  const imageUrl = data?.urls?.regular || data?.urls?.full
  const photographer = data?.user?.name || 'Unsplash photographer'
  const creditUrl = data?.links?.html || 'https://unsplash.com'

  return { imageUrl, photographer, creditUrl }
}

// Standard PixiJS v8 vertex shader
const vertex = `
  in vec2 aPosition;
  out vec2 vTextureCoord;

  uniform vec4 uInputSize;
  uniform vec4 uOutputFrame;
  uniform vec4 uOutputTexture;

  vec4 filterVertexPosition( void )
  {
      vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
      position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
      position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
      return vec4(position, 0.0, 1.0);
  }

  vec2 filterTextureCoord( void )
  {
      return aPosition * (uOutputFrame.zw * uInputSize.zw);
  }

  void main(void)
  {
      gl_Position = filterVertexPosition();
      vTextureCoord = filterTextureCoord();
  }
`;

// Fragment shader - single image mode (generates B/W from color internally)
const fragment = `
  in vec2 vTextureCoord;

  uniform sampler2D uTexture;

  uniform float uThreshold;
  uniform float uFeather;
  uniform float uTime;
  uniform float uNoiseStrength;
  uniform float uNoiseScale;
  uniform float uInvert;

  // Simple hash-based noise
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) +
           (c - a) * u.y * (1.0 - u.x) +
           (d - b) * u.x * u.y;
  }

  void main() {
    vec4 c = texture2D(uTexture, vTextureCoord);

    // Generate grayscale from the same image
    float luma = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    vec3 bw = vec3(luma);

    float maskLuma = luma;
    if (uInvert > 0.5) {
      maskLuma = 1.0 - maskLuma;
    }

    float n = 0.0;
    if (uNoiseStrength > 0.0) {
      vec2 p = vTextureCoord * uNoiseScale * 200.0 + vec2(uTime * 0.15, uTime * 0.11);
      n = (noise(p) - 0.5) * 2.0;
    }

    float v = maskLuma + n * uNoiseStrength;
    float mask = smoothstep(uThreshold - uFeather, uThreshold + uFeather, v);

    vec3 outRgb = mix(bw, c.rgb, mask);
    gl_FragColor = vec4(outRgb, 1.0);
  }
`;

// Store references for dynamic texture swapping
let currentSprite = null
let currentFilter = null
let currentTexture = null

async function init() {
  try {
    await app.init({
      resizeTo: window,
      backgroundAlpha: 0,
      antialias: true,
    })

    document.querySelector('#app').appendChild(app.canvas)

    // Load initial texture
    const baseUrl = import.meta.env.BASE_URL
    currentTexture = await PIXI.Assets.load(`${baseUrl}image-color.jpg`)

    // Create the sprite
    currentSprite = new PIXI.Sprite(currentTexture)
    currentSprite.anchor.set(0.5)
    app.stage.addChild(currentSprite)

    // Create filter
    currentFilter = new PIXI.Filter({
      glProgram: new PIXI.GlProgram({
        fragment,
        vertex,
      }),
      resources: {
        thresholdUniforms: {
          uThreshold: { value: state.threshold, type: 'f32' },
          uFeather: { value: state.feather, type: 'f32' },
          uTime: { value: state.time, type: 'f32' },
          uNoiseStrength: { value: state.noiseStrength, type: 'f32' },
          uNoiseScale: { value: state.noiseScale, type: 'f32' },
          uInvert: { value: 0.0, type: 'f32' },
        },
      },
    })

    currentSprite.filters = [currentFilter]

    function resize() {
      const w = app.renderer.width
      const h = app.renderer.height

      currentSprite.position.set(w / 2, h / 2)

      const texW = currentTexture.width
      const texH = currentTexture.height
      const scale = Math.max(w / texW, h / texH)
      currentSprite.scale.set(scale)
    }

    window.addEventListener('resize', resize)
    resize()

    // Tweakpane UI
    const pane = new Pane({ title: 'MaskKing' })
    pane.addBinding(state, 'threshold', { min: 0, max: 1, step: 0.001 })
    pane.addBinding(state, 'feather', { min: 0, max: 0.2, step: 0.001 })
    pane.addBinding(state, 'speed', { min: 0, max: 1.5, step: 0.01 })
    pane.addBinding(state, 'noiseStrength', { min: 0, max: 0.35, step: 0.001 })
    pane.addBinding(state, 'noiseScale', { min: 0.5, max: 8, step: 0.01 })
    pane.addBinding(state, 'direction', {
      options: {
        'dark-to-bright': 'dark-to-bright',
        'bright-to-dark': 'bright-to-dark',
      },
    })
    pane.addBinding(state, 'paused')

    pane.addButton({ title: 'Reset' }).on('click', () => {
      state.threshold = 0.0
      state.time = 0.0
      pane.refresh()
    })

    // Wire up Upload button
    const btnUpload = document.querySelector('#btnUpload')
    const btnUnsplash = document.querySelector('#btnUnsplash')
    const fileInput = document.querySelector('#file')

    if (btnUpload && fileInput) {
      btnUpload.addEventListener('click', () => fileInput.click())
    }

    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0]
        if (!file) return

        const url = URL.createObjectURL(file)

        try {
          const tex = await loadTextureFromUrl(url)
          currentTexture = tex
          currentSprite.texture = tex

          setCredit() // hide credit for local upload
          resize()
        } finally {
          setTimeout(() => URL.revokeObjectURL(url), 5000)
        }
      })
    }

    // Wire up Unsplash button
    if (btnUnsplash) {
      btnUnsplash.addEventListener('click', async () => {
        btnUnsplash.disabled = true
        const oldText = btnUnsplash.textContent
        btnUnsplash.textContent = 'Loading…'

        try {
          // Random query from climate-related topics
          const queries = ['climate change', 'wildfire', 'flood', 'drought', 'melting ice', 'heatwave', 'storm', 'nature']
          const query = queries[Math.floor(Math.random() * queries.length)]

          const { imageUrl, photographer, creditUrl } = await fetchRandomUnsplash({
            query,
            orientation: 'landscape',
          })

          const tex = await loadTextureFromUrl(imageUrl)
          currentTexture = tex
          currentSprite.texture = tex

          setCredit({ text: photographer, url: creditUrl })
          resize()
        } catch (err) {
          console.error(err)
          setCredit()
          alert(err?.message || 'Failed to load Unsplash image')
        } finally {
          btnUnsplash.disabled = false
          btnUnsplash.textContent = oldText
        }
      })
    }

    // Animation loop
    app.ticker.add((ticker) => {
      const dt = ticker.deltaMS / 1000

      if (!state.paused) {
        state.time += dt

        const dirInvert = state.direction === 'bright-to-dark' ? 1 : 0
        state.threshold += dt * state.speed * (dirInvert ? -1 : 1)

        if (state.threshold > 1) state.threshold = 0
        if (state.threshold < 0) state.threshold = 1
      }

      // Update uniforms
      const u = currentFilter.resources.thresholdUniforms.uniforms
      u.uThreshold = state.threshold
      u.uFeather = state.feather
      u.uTime = state.time
      u.uNoiseStrength = state.noiseStrength
      u.uNoiseScale = state.noiseScale
      u.uInvert = state.direction === 'bright-to-dark' ? 1.0 : 0.0
    })

    console.log('MaskKing initialized successfully')
  } catch (error) {
    console.error('Init error:', error)
  }
}

init()
