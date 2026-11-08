/**
 * Simplex & Curl Noise GLSL Shader Chunk
 * Provides 3D Simplex noise, 3D analytical / finite-difference Curl noise,
 * and Fractal Brownian Motion (fBm) for generative particle motion.
 */

export const noiseGLSL = /* glsl */ `
// --- 3D Simplex Noise by Ian McEwan, Stefan Gustavson (Ashima Arts) ---
vec4 permute(vec4 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

vec4 taylorInvSqrt(vec4 r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  // First corner
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  // Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

  // Permutations
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  // Gradients
  float n_ = 0.142857142857; // 1.0 / 7.0
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z); // mod(p, 7*7)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  // Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  // Mix contributions
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// --- 3D Curl Noise (Divergence-free fluid flow field) ---
vec3 curlNoise(vec3 p) {
  const float e = 0.001;
  const float inv2e = 500.0; // 1.0 / (2.0 * e)

  // Potential field psi with decorrelated offsets
  vec3 offset1 = vec3(31.416, -47.853, 12.987);
  vec3 offset2 = vec3(-53.123, 18.456, -39.123);

  // Partial derivatives of psi_z
  float pz_y1 = snoise(p + offset2 + vec3(0.0, e, 0.0));
  float pz_y0 = snoise(p + offset2 - vec3(0.0, e, 0.0));
  float dpz_dy = (pz_y1 - pz_y0) * inv2e;

  // Partial derivatives of psi_y
  float py_z1 = snoise(p + offset1 + vec3(0.0, 0.0, e));
  float py_z0 = snoise(p + offset1 - vec3(0.0, 0.0, e));
  float dpy_dz = (py_z1 - py_z0) * inv2e;

  // Partial derivatives of psi_x
  float px_z1 = snoise(p + vec3(0.0, 0.0, e));
  float px_z0 = snoise(p - vec3(0.0, 0.0, e));
  float dpx_dz = (px_z1 - px_z0) * inv2e;

  float pz_x1 = snoise(p + offset2 + vec3(e, 0.0, 0.0));
  float pz_x0 = snoise(p + offset2 - vec3(e, 0.0, 0.0));
  float dpz_dx = (pz_x1 - pz_x0) * inv2e;

  float py_x1 = snoise(p + offset1 + vec3(e, 0.0, 0.0));
  float py_x0 = snoise(p + offset1 - vec3(e, 0.0, 0.0));
  float dpy_dx = (py_x1 - py_x0) * inv2e;

  float px_y1 = snoise(p + vec3(0.0, e, 0.0));
  float px_y0 = snoise(p - vec3(0.0, e, 0.0));
  float dpx_dy = (px_y1 - px_y0) * inv2e;

  return vec3(
    dpz_dy - dpy_dz,
    dpx_dz - dpz_dx,
    dpy_dx - dpx_dy
  );
}

// --- Multi-Octave Fractal Simplex Noise (fBm) ---
float fbm3D(vec3 p, int octaves, float lacunarity, float gain) {
  float sum = 0.0;
  float amp = 1.0;
  float totalAmp = 0.0;
  vec3 current = p;

  for (int i = 0; i < 4; i++) {
    if (i >= octaves) break;
    sum += snoise(current) * amp;
    totalAmp += amp;
    current *= lacunarity;
    amp *= gain;
  }
  return sum / totalAmp;
}

// --- Multi-Octave Curl Noise ---
vec3 curlNoiseFbm(vec3 p, float speedTime) {
  vec3 c1 = curlNoise(p + vec3(0.0, 0.0, speedTime * 0.15));
  vec3 c2 = curlNoise(p * 2.15 + vec3(19.2, -31.4, 7.8) + vec3(0.0, 0.0, speedTime * 0.25)) * 0.45;
  return c1 + c2;
}
`;
