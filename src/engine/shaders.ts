/**
 * WebGL Shaders for Drift 3D Particle Engine
 */

export const PARTICLE_VERTEX_SHADER = /* glsl */ `
precision highp float;

// Standard Three.js uniforms
// uniform mat4 modelViewMatrix;
// uniform mat4 projectionMatrix;
// uniform mat4 viewMatrix;

// Custom Uniforms
uniform float uTime;
uniform float uPointSize;
uniform float uDepthScale;
uniform float uNoiseSpeed;
uniform float uNoiseFrequency;
uniform float uNoiseStrength;
uniform float uSplashStrength;
uniform int uMode;
uniform int uPrevMode;
uniform float uModeTransition;
uniform int uColorMode;
uniform vec3 uPointer;        // (x, y, isDown) default: (999.0, 999.0, 0.0)
uniform vec2 uPointerVelocity;
uniform float uPointerRadius;
uniform vec2 uOrientation;    // (pitch, roll)
uniform float uPixelRatio;
uniform float uMorphProgress;
uniform vec2 uImpulseCenter;
uniform float uImpulseStrength;
uniform vec3 uBurst;          // (x, y, startTimeSec) of the last splash burst
uniform vec3 uAttractor;      // (x, y, amount 0..1) smoothed attractor for GATHER/SWARM
uniform int uDebug;
uniform float uZoom;
uniform float uIntensity;
uniform vec2 uDriftAxis;
uniform float uDriftOrigin;
uniform float uDriftFeather;

// Custom Attributes
attribute vec3 sourceColor;
attribute vec3 targetPosition;
attribute vec3 targetColor;
attribute vec2 randomSeed;
attribute float salience;
attribute float targetSalience;
attribute float sourceDepth;
attribute float targetDepth;

// Varyings to Fragment Shader
varying vec3 vColor;
varying float vAlpha;

// --- Simplex 3D Noise by Stefan Gustavson & Ian McEwan ---
vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

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
  float n_ = 0.142857142857; // 1.0/7.0
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

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

// Curl noise derivation from 3D scalar potential
vec3 curlNoise(vec3 p) {
  float n1 = snoise(p);
  float n2 = snoise(p + vec3(31.416, -47.153, 12.879));
  float n3 = snoise(p + vec3(-15.732, 28.321, -63.125));
  return vec3(n2 - n3, n3 - n1, n1 - n2);
}

float gFade = 1.0;   // per-particle alpha multiplier written by each mode
float gSeed2 = 0.5;  // randomSeed.y, set at the top of main()

float hash11(float x) { return fract(sin(x * 127.1) * 43758.5453); }

float lifeFade(float ph, float fadeIn, float fadeOutStart) {
  return smoothstep(0.0, fadeIn, ph) * (1.0 - smoothstep(fadeOutStart, 1.0, ph));
}

// DRIFT: one-way drift across dissolve front with cycle fading.
vec3 computeDrift(vec3 p, float seed, float sal, float t) {
  gFade = 1.0;
  vec3 idle = curlNoise(vec3(p.xy * uNoiseFrequency, t * 0.2 + seed * 5.0)) * 0.005;

  // e: 0 behind the bar, 1 well past it (in the wind direction)
  float e = smoothstep(0.0, 1.0,
      (dot(p.xy, uDriftAxis) - uDriftOrigin) / max(uDriftFeather, 0.02));
  if (e <= 0.0) return idle;

  float rate = 0.05 + uNoiseSpeed * 0.12;
  float cyc = t * rate + seed;
  float ph = fract(cyc);

  // each particle joins a given cycle with probability e; the weight eases
  // in over 0.12 so moving the bar never pops
  float r = hash11(floor(cyc) * 1.731 + seed * 311.7 + gSeed2 * 17.3);
  float w = smoothstep(r, r + 0.12, e);
  if (w <= 0.0) return idle;

  float u = clamp((ph - 0.08) / 0.92, 0.0, 1.0);   // 0 = home, 1 = gone
  float reach = (0.4 + uNoiseStrength * 0.9) * (0.6 + 0.8 * seed) * (1.0 - 0.3 * sal);
  vec3 turb = curlNoise(vec3(p.xy * uNoiseFrequency + uDriftAxis * u,
                             t * 0.2 + gSeed2 * 4.0));
  // away: along the wind axis and INTO the screen (never toward the camera)
  vec3 flow = vec3(uDriftAxis * reach, -0.15 * reach) + turb * 0.35;

  float fadeOut = 1.0 - smoothstep(0.55, 1.0, u);
  float fadeIn = smoothstep(0.0, 0.06, ph);        // appears in place, never drifts in
  gFade = mix(1.0, fadeOut * fadeIn, w);
  return flow * u * w + idle;
}

// SPLASH: event-driven shockwave from uBurst. Each particle is kicked
// outward when the front reaches it, then eases back home.
vec3 computeSplash(vec3 p, float seed, float sal, float t) {
  gFade = 1.0;
  float age = t - uBurst.z;
  if (age < 0.0 || age > 8.0) return vec3(0.0);
  vec2 diff = p.xy - uBurst.xy;
  float d = length(diff);
  vec2 dir = d > 1e-4 ? diff / d : vec2(0.0, 1.0);
  float tau = age - d / 1.6;
  if (tau <= 0.0) return vec3(0.0);
  float k = 1.4;
  float f = tau * k * exp(1.0 - tau * k);
  float amp = uSplashStrength * (0.7 + 0.6 * seed) / (1.0 + d * 1.2);
  vec2 perp = vec2(-dir.y, dir.x);
  vec2 xy = dir * (0.32 * amp * f) + perp * (0.06 * amp * f * (seed - 0.5) * 2.0);
  gFade = 1.0 - 0.3 * clamp(f, 0.0, 1.0);
  return vec3(xy, 0.45 * amp * f);
}

// GATHER: particles are drawn toward the attractor with an orbital swirl.
vec3 computeGather(vec3 p, float seed, float sal, float t) {
  vec2 toT = uAttractor.xy - p.xy;
  float dist = length(toT);
  vec2 dir = toT / max(dist, 1e-4);
  vec2 perp = vec2(-dir.y, dir.x);
  float w = 1.0 - smoothstep(0.0, 1.9, dist);
  float pull = w * w * (0.55 + 0.4 * seed) * uAttractor.z;
  float swirl = pull * (0.4 + 0.3 * sin(seed * 6.2831 + t * 1.3)) * min(dist, 0.6);
  float z = -pull * 0.2 + sin(t * 2.0 + seed * 6.2831) * 0.03 * pull;
  gFade = 1.0 - 0.45 * pull;   // dim as they stack so additive blending doesn't blow out
  return vec3(toT * pull + perp * swirl, z);
}

// Mode 3: DEPTH - stratified topographic relief extrusion
vec3 computeDepthMode(vec3 p, float dep, float seed, float sal, float t) {
  float slice = sin(dep * 35.0 - t * 2.5) * 0.04 * uNoiseStrength;
  float steppedZ = floor(dep * 16.0) / 16.0 * 0.25;
  return vec3(0.0, 0.0, (steppedZ + slice));
}

// TRAVEL: exaggerate the depth relief (3x total). The ENGINE dollies the
// camera through it (Task 3). Near particles fade out as they pass the camera.
vec3 computeTravel(vec3 p, float seed, float sal, float t) {
  gFade = 1.0;
  vec3 sway = curlNoise(vec3(p.xy * 1.5, t * 0.2 + seed)) * 0.02;
  return vec3(sway.xy, p.z * 2.0 + sway.z);
}

// SWARM: coherent, bounded vortex around the attractor. Inner rings rotate
// more (differential rotation), the swirl swells and unwinds, never shears away.
vec3 computeSwarm(vec3 p, float seed, float sal, float t) {
  vec2 c = uAttractor.xy;
  vec2 off = p.xy - c;
  float r = length(off);
  float fall = 1.0 - smoothstep(0.0, 1.8, r);
  float spin = (1.1 + 0.9 * sin(t * 0.45)) * uAttractor.z;
  float ang = spin * fall * (1.0 + (seed - 0.5) * 0.35);
  float cs = cos(ang);
  float sn = sin(ang);
  vec2 rot = vec2(cs * off.x - sn * off.y, sn * off.x + cs * off.y);
  float squeeze = 1.0 - 0.3 * fall * uAttractor.z * (0.5 + 0.5 * sin(t * 0.45 + 1.0));
  vec3 turb = curlNoise(vec3(p.xy * 2.0, t * 0.4 + gSeed2 * 2.0)) * 0.05 * fall;
  gFade = squeeze;
  return vec3(c + rot * squeeze - p.xy + turb.xy,
              turb.z + fall * 0.12 * sin(t * 1.2 + seed * 6.2831));
}

// MELT: ~60% of particles sag downward with gravity, fade out, and reform
// at the top of their column. No teleport pop.
vec3 computeMelt(vec3 p, float seed, float sal, float t) {
  gFade = 1.0;
  if (gSeed2 > 0.6) return vec3(0.0);
  float ph = fract(t * (0.07 + uNoiseStrength * 0.05) + seed);
  float len = (0.55 + (1.0 - sal) * 0.9) * (0.6 + 0.8 * gSeed2);
  float x = sin(ph * 7.0 + seed * 6.2831) * 0.03 * ph * (1.0 - sal);
  gFade = lifeFade(ph, 0.06, 0.45);
  return vec3(x, -(ph * ph) * len, -ph * 0.12);
}

vec3 getModeDisplacement(int mode, vec3 p, float dep, float seed, float sal, float t) {
  gFade = 1.0;
  if (mode == 0) return computeDrift(p, seed, sal, t);
  if (mode == 1) return computeSplash(p, seed, sal, t);
  if (mode == 2) return computeGather(p, seed, sal, t);
  if (mode == 3) return computeDepthMode(p, dep, seed, sal, t);
  if (mode == 4) return computeTravel(p, seed, sal, t);
  if (mode == 5) return computeSwarm(p, seed, sal, t);
  if (mode == 6) return computeMelt(p, seed, sal, t);
  return vec3(0.0);
}

void main() {
  // Interpolate between current and target image during morphing
  vec3 basePos = mix(position, targetPosition, uMorphProgress);
  vec3 baseColor = mix(sourceColor, targetColor, uMorphProgress);
  float sal = mix(salience, targetSalience, uMorphProgress);
  float dep = mix(sourceDepth, targetDepth, uMorphProgress);
  float seed = randomSeed.x;
  gSeed2 = randomSeed.y;

  // Apply base depth scale
  basePos.z = (dep - 0.5) * uDepthScale;

  // Mode displacement blending between previous mode and active mode
  float fadePrev = 1.0;
  vec3 dispPrev = vec3(0.0);
  if (uModeTransition < 1.0) {      // skip the old mode once the blend is done
    dispPrev = getModeDisplacement(uPrevMode, basePos, dep, seed, sal, uTime);
    fadePrev = gFade;
  }
  vec3 dispCurr = getModeDisplacement(uMode, basePos, dep, seed, sal, uTime);
  float fadeCurr = gFade;
  float tm = clamp(uModeTransition, 0.0, 1.0);
  vec3 modeDisp = mix(dispPrev, dispCurr, tm);
  float modeFade = mix(fadePrev, fadeCurr, tm);

  // User interactive draw impulse
  vec3 impulseDisp = vec3(0.0);
  if (uImpulseStrength > 0.001) {
    float impDist = length(basePos.xy - uImpulseCenter);
    float impWave = sin(impDist * 20.0 - uTime * 10.0) * exp(-impDist * 3.5) * uImpulseStrength;
    impulseDisp.z += impWave * 0.3;
    impulseDisp.xy += normalize(basePos.xy - uImpulseCenter + 0.0001) * (impWave * 0.15);
  }

  // Pointer hover subtle displacement
  vec3 pointerDisp = vec3(0.0);
  float pDist = length(basePos.xy - uPointer.xy);
  if (pDist < uPointerRadius && pDist > 0.001) {
    float pFactor = (1.0 - pDist / uPointerRadius);
    pointerDisp.xy += uPointerVelocity * (pFactor * 0.04);
    pointerDisp.z += (uPointer.z > 0.5 ? 0.08 : 0.03) * pFactor;
  }

  vec3 finalPos = basePos + modeDisp + impulseDisp + pointerDisp;

  // Apply device tilt / orientation parallax
  mat2 rotX = mat2(cos(uOrientation.x * 0.4), -sin(uOrientation.x * 0.4),
                   sin(uOrientation.x * 0.4),  cos(uOrientation.x * 0.4));
  mat2 rotY = mat2(cos(uOrientation.y * 0.4), -sin(uOrientation.y * 0.4),
                   sin(uOrientation.y * 0.4),  cos(uOrientation.y * 0.4));
  finalPos.yz = rotX * finalPos.yz;
  finalPos.xz = rotY * finalPos.xz;

  // Transform to clip space
  vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);

  // Near plane safety guard
  float viewZ = -mvPosition.z;
  float nearFade = smoothstep(0.18, 0.6, viewZ);
  if (mvPosition.z > -0.15) mvPosition.z = -0.15;
  gl_Position = projectionMatrix * mvPosition;

  // Adaptive Point Size with distance attenuation and DPI scaling
  float zs = pow(max(uZoom, 0.05), 0.65);
  float pSize = uPointSize * uPixelRatio * (0.8 + sal * 0.5) * zs;
  float viewDepth = max(0.15, -mvPosition.z);
  gl_PointSize = clamp(pSize * (2.0 / viewDepth),
                       0.7 * uPixelRatio, 48.0 * uPixelRatio);

  // Color Mode processing
  if (uColorMode == 0) {
    // TRUE: Crisp stipple print look without artificial luminance floor
    vec3 c = clamp((baseColor - 0.04) * 1.12, 0.0, 1.0) * uIntensity;
    vColor = c;
    vAlpha = 0.9;
  } else if (uColorMode == 1) {
    // NEGATIVE: Inverted colors with tuned contrast floor so inverted dark/neon tones stay saturated without wash-out
    vec3 inverted = vec3(1.0) - baseColor;
    float invLuma = dot(inverted, vec3(0.299, 0.587, 0.114));
    vec3 saturatedInv = mix(vec3(invLuma), inverted, 1.12);
    vColor = max(vec3(0.16, 0.16, 0.20), clamp(saturatedInv, 0.0, 1.0));
    vColor *= uIntensity;
    vAlpha = 0.45;
  } else {
    // ON_WHITE: High-contrast ink on white background
    float luma = dot(baseColor, vec3(0.299, 0.587, 0.114));
    // Dark ink pigment mapping: dark areas get deep charcoal/black, light areas get soft graphite
    vec3 ink = mix(vec3(0.03, 0.04, 0.06), vec3(0.38, 0.40, 0.45), luma);
    vColor = ink;
    vAlpha = mix(0.90, 0.50, luma);
    vAlpha = clamp(vAlpha * uIntensity, 0.0, 1.0);
  }

  vAlpha *= modeFade * nearFade;

  // Debug mode override: flat bright neon cyan, fixed size 4.0 * uPixelRatio, alpha 1.0
  if (uDebug == 1) {
    vColor = vec3(0.0, 1.0, 0.8);
    gl_PointSize = 4.0 * uPixelRatio;
    vAlpha = 1.0;
  }
}
`;

export const PARTICLE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec3 vColor;
varying float vAlpha;

uniform int uColorMode;
uniform int uDebug;

void main() {
  // Distance from center of point [0..1] -> [-0.5..0.5]
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);

  // Soft circular particle with anti-aliasing
  if (dist > 0.5) {
    discard;
  }

  // Debug mode renders solid bright neon dots
  if (uDebug == 1) {
    gl_FragColor = vec4(vColor, 1.0);
    return;
  }

  // Crisp circular edge with subtle subpixel anti-aliasing
  float edgeAlpha = 1.0 - smoothstep(0.38, 0.5, dist);
  float alpha = vAlpha * edgeAlpha;

  gl_FragColor = vec4(vColor, alpha);
}
`;
