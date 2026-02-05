precision mediump float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform sampler2D uTexture;
uniform sampler2D uBW;

uniform float uThreshold;
uniform float uFeather;
uniform float uTime;
uniform float uNoiseStrength;
uniform float uNoiseScale;
uniform int uInvert;

// Small, cheap noise for organic threshold wobble
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
  vec4 c = texture(uTexture, vTextureCoord);
  vec4 bw = texture(uBW, vTextureCoord);

  float luma = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  if (uInvert == 1) {
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
  fragColor = vec4(outRgb, 1.0);
}
