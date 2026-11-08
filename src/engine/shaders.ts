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
uniform vec3 uPointer;        // (x, y, isDown)
uniform vec2 uPointerVelocity;
uniform float uPointerRadius;
uniform vec2 uOrientation;    // (pitch, roll)
uniform float uPixelRatio;
uniform float uMorphProgress;
uniform vec2 uImpulseCenter;
uniform float uImpulseStrength;
uniform int uDebug;

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

// Mode 0: DRIFT - organic floating turbulence
vec3 computeDrift(vec3 p, float seed, float sal, float t) {
  vec3 np = p * uNoiseFrequency + vec3(seed * 2.5, t * uNoiseSpeed * 0.4, seed * 1.5);
  vec3 curl = curlNoise(np);
  float zFloat = sin(t * uNoiseSpeed * 1.5 + p.x * 4.0 + p.y * 3.0 + seed * 6.28) * 0.05;
  float salFactor = 1.0 + (1.0 - sal) * 0.7;
  return curl * uNoiseStrength * 0.15 * salFactor + vec3(0.0, 0.0, zFloat);
}

// Mode 1: SPLASH - explosive shockwave scatter
vec3 computeSplash(vec3 p, float seed, float sal, float t) {
  vec2 diff = p.xy - uPointer.xy;
  float dist = length(diff);
  vec2 dir = dist > 0.001 ? normalize(diff) : vec2(0.0, 1.0);

  float wave = sin(max(0.0, dist * 12.0 - t * 5.0)) * exp(-dist * 2.5);
  float impulse = (1.0 - smoothstep(0.0, 1.0, dist)) * uSplashStrength;

  vec3 burst = vec3(dir * (wave * 0.25 + impulse * 0.4), wave * 0.5 + impulse * 0.3);
  burst += curlNoise(p * 2.5 + t * 0.8) * impulse * 0.2;
  return burst;
}

// Mode 2: GATHER - gravitational convergence & vortex
vec3 computeGather(vec3 p, float seed, float sal, float t) {
  vec2 target = uPointer.z > 0.5 ? uPointer.xy : vec2(0.0);
  vec2 toTarget = target - p.xy;
  float dist = length(toTarget);
  vec2 dir = dist > 0.001 ? normalize(toTarget) : vec2(0.0);
  vec2 perp = vec2(-dir.y, dir.x);

  float pull = 1.0 - smoothstep(0.05, 2.0, dist);
  float swirl = sin(dist * 7.0 - t * 4.0);
  vec2 motion = dir * (pull * 0.5) + perp * (pull * swirl * 0.35);
  float zPull = -pull * 0.2 + sin(t * 2.0 + dist * 6.0) * 0.06;
  return vec3(motion, zPull);
}

// Mode 3: DEPTH - stratified topographic relief extrusion
vec3 computeDepthMode(vec3 p, float dep, float seed, float sal, float t) {
  float slice = sin(dep * 35.0 - t * 2.5) * 0.04 * uNoiseStrength;
  float steppedZ = floor(dep * 16.0) / 16.0 * 0.25;
  return vec3(0.0, 0.0, (steppedZ + slice));
}

// Mode 4: TRAVEL - starfield hyperspace flythrough
vec3 computeTravel(vec3 p, float seed, float sal, float t) {
  float speed = (0.6 + seed * 0.8) * (uNoiseSpeed + 0.5);
  float zSpan = 2.6;
  float zOff = mod(p.z + t * speed, zSpan) - 1.5;
  zOff = min(zOff, 1.1);
  float expand = (zOff + 1.5) * 0.18;
  return vec3(p.x * expand, p.y * expand, zOff - p.z);
}

// Mode 5: SWARM - flocking orbital vortices
vec3 computeSwarm(vec3 p, float seed, float sal, float t) {
  vec2 center = uPointer.z > 0.5 ? uPointer.xy : vec2(0.0);
  vec2 offset = p.xy - center;
  float r = length(offset);
  float angle = atan(offset.y, offset.x) + t * (1.5 + seed * 1.2);

  float orbitR = r + sin(t * 2.5 + seed * 6.28) * 0.1 * uNoiseStrength;
  vec2 swarmTarget = center + vec2(cos(angle), sin(angle)) * orbitR;
  vec3 curl = curlNoise(p * 2.0 + t * 0.6) * 0.12;
  return vec3(swarmTarget - p.xy, curl.z);
}

// Mode 6: MELT - downward liquid drip distortion
vec3 computeMelt(vec3 p, float seed, float sal, float t) {
  float speed = (0.35 + (1.0 - sal) * 0.8 + seed * 0.5) * (uNoiseStrength + 0.3);
  float drip = mod(t * speed + seed * 4.0, 2.0);
  float yDisp = -pow(drip, 1.7) * 0.45;
  float xDisp = sin(drip * 9.0 + seed * 6.28) * 0.04 * (1.0 - sal);
  return vec3(xDisp, yDisp, -drip * 0.1);
}

vec3 getModeDisplacement(int mode, vec3 p, float dep, float seed, float sal, float t) {
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

  // Apply base depth scale
  basePos.z = (dep - 0.5) * uDepthScale;

  // Mode displacement blending between previous mode and active mode
  vec3 dispCurr = getModeDisplacement(uMode, basePos, dep, seed, sal, uTime);
  vec3 dispPrev = getModeDisplacement(uPrevMode, basePos, dep, seed, sal, uTime);
  vec3 modeDisp = mix(dispPrev, dispCurr, clamp(uModeTransition, 0.0, 1.0));

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

  // Near plane safety guard:
  // When camera is at [0, 0.1, 2.0] or dollying, ensure points are never behind or clipped by near plane (0.1)
  if (mvPosition.z > -0.15) {
    mvPosition.z = -0.15;
  }
  gl_Position = projectionMatrix * mvPosition;

  // Adaptive Point Size with distance attenuation and DPI scaling
  float pSize = uPointSize * uPixelRatio * (0.85 + sal * 0.6);
  float viewDepth = max(0.15, -mvPosition.z);
  gl_PointSize = max(1.5 * uPixelRatio, clamp(pSize * (2.2 / viewDepth), 1.5 * uPixelRatio, 80.0 * uPixelRatio));

  // Color Mode processing
  if (uColorMode == 0) {
    // TRUE: Source image RGB with enhanced chroma to retain vivid color and definition under additive accumulation
    float luma = dot(baseColor, vec3(0.299, 0.587, 0.114));
    vec3 saturated = mix(vec3(luma), baseColor, 1.15);
    vColor = max(vec3(0.04), clamp(saturated, 0.0, 1.0));
    // Reduced additive particle opacity: prevents excessive white burn / blowout across dense clusters
    vAlpha = 0.42;
  } else if (uColorMode == 1) {
    // NEGATIVE: Inverted colors with tuned contrast floor so inverted dark/neon tones stay saturated without wash-out
    vec3 inverted = vec3(1.0) - baseColor;
    float invLuma = dot(inverted, vec3(0.299, 0.587, 0.114));
    vec3 saturatedInv = mix(vec3(invLuma), inverted, 1.12);
    vColor = max(vec3(0.16, 0.16, 0.20), clamp(saturatedInv, 0.0, 1.0));
    vAlpha = 0.45;
  } else {
    // ON_WHITE: High-contrast ink on white background
    float luma = dot(baseColor, vec3(0.299, 0.587, 0.114));
    // Dark ink pigment mapping: dark areas get deep charcoal/black, light areas get soft graphite
    vec3 ink = mix(vec3(0.03, 0.04, 0.06), vec3(0.38, 0.40, 0.45), luma);
    vColor = ink;
    vAlpha = mix(0.90, 0.50, luma);
  }

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

  // Crisp yet smooth circular falloff from center to edge to avoid harsh additive overlap hotspots
  float edgeAlpha = smoothstep(0.5, 0.05, dist);
  float alpha = vAlpha * edgeAlpha;

  gl_FragColor = vec4(vColor, alpha);
}
`;
