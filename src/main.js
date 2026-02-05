import './style.css'
import * as PIXI from 'pixi.js'
import { Pane } from 'tweakpane'

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

// Fragment shader using PixiJS v8 compatible syntax (texture2D + gl_FragColor)
const fragment = `
  in vec2 vTextureCoord;

  uniform sampler2D uTexture;
  uniform sampler2D uBW;

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
    vec4 bw = texture2D(uBW, vTextureCoord);

    float luma = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    if (uInvert > 0.5) {
      luma = 1.0 - luma;
    }

    float n = 0.0;
    if (uNoiseStrength > 0.0) {
      vec2 p = vTextureCoord * uNoiseScale * 200.0 + vec2(uTime * 0.15, uTime * 0.11);
      n = (noise(p) - 0.5) * 2.0;
    }

    float v = luma + n * uNoiseStrength;
    float mask = smoothstep(uThreshold - uFeather, uThreshold + uFeather, v);

    vec3 outRgb = mix(bw.rgb, c.rgb, mask);
    gl_FragColor = vec4(outRgb, 1.0);
  }
`;

async function init() {
  try {
    await app.init({
      resizeTo: window,
      backgroundAlpha: 0,
      antialias: true,
    })

    document.querySelector('#app').appendChild(app.canvas)

    // Load textures
    const colorTex = await PIXI.Assets.load('/image-color.jpg')
    const bwTex = await PIXI.Assets.load('/image-bw.jpg')

    // Create the sprite
    const sprite = new PIXI.Sprite(colorTex)
    sprite.anchor.set(0.5)
    app.stage.addChild(sprite)

    // Create filter using official PixiJS v8 pattern
    const filter = new PIXI.Filter({
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
        uBW: bwTex.source,
      },
    })

    sprite.filters = [filter]

    function resize() {
      const w = app.renderer.width
      const h = app.renderer.height

      sprite.position.set(w / 2, h / 2)

      const texW = colorTex.width
      const texH = colorTex.height
      const scale = Math.max(w / texW, h / texH)
      sprite.scale.set(scale)
    }

    window.addEventListener('resize', resize)
    resize()

    // UI
    const pane = new Pane({ title: 'Threshold Mask Lab' })
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
      const u = filter.resources.thresholdUniforms.uniforms
      u.uThreshold = state.threshold
      u.uFeather = state.feather
      u.uTime = state.time
      u.uNoiseStrength = state.noiseStrength
      u.uNoiseScale = state.noiseScale
      u.uInvert = state.direction === 'bright-to-dark' ? 1.0 : 0.0
    })

    console.log('Threshold Mask Lab initialized successfully')
  } catch (error) {
    console.error('Init error:', error)
  }
}

init()
