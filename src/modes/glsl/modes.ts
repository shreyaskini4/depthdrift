/**
 * Motion Modes GLSL Shader Chunk
 * Implements GPU motion physics for all 7 Drift modes:
 * DRIFT, SPLASH, GATHER, DEPTH, TRAVEL, SWARM, MELT,
 * along with smooth cross-mode transition blending.
 */

export const modesGLSL = /* glsl */ `
#define MODE_DRIFT 0
#define MODE_SPLASH 1
#define MODE_GATHER 2
#define MODE_DEPTH 3
#define MODE_TRAVEL 4
#define MODE_SWARM 5
#define MODE_MELT 6

// --- Uniform Declarations ---
uniform float uTime;
uniform float uDeltaTime;
uniform int uCurrentMode;
uniform int uPrevMode;
uniform float uTransition;
uniform vec2 uPointer;
uniform float uPointerDown;
uniform vec2 uPointerVelocity;
uniform float uSplashStrength;
uniform float uSplashTime;
uniform vec2 uSplashOrigin;
uniform float uDepthScale;
uniform float uNoiseSpeed;
uniform float uNoiseFrequency;
uniform float uNoiseStrength;
uniform vec2 uParallaxOffset;
uniform float uTravelProgress;
uniform float uTravelSpeed;
uniform float uGatherProgress;
uniform float uMeltProgress;

// --- 1. DRIFT: Multi-octave 3D curl/simplex noise floating effect ---
vec3 calcDriftDisplacement(vec3 pos, float depth, vec2 uv, out float alphaMod, out float sizeMod) {
  alphaMod = 1.0;
  sizeMod = 1.0;

  vec3 sampleCoord = pos * (uNoiseFrequency * 1.4) + vec3(0.0, 0.0, uTime * uNoiseSpeed * 0.2);
  vec3 curl = curlNoiseFbm(sampleCoord, uTime * uNoiseSpeed);

  // Gentle bounded oscillation around anchor position
  vec3 disp = curl * (uNoiseStrength * 0.12);

  // Subtle breathing wave along depth
  disp.z += sin(uTime * (uNoiseSpeed * 0.5) + depth * 6.28318) * (uNoiseStrength * 0.02);
  disp.xy += vec2(
    cos(uTime * 0.4 + pos.y * 3.0),
    sin(uTime * 0.35 + pos.x * 3.0)
  ) * 0.008;

  return disp;
}

// --- 2. SPLASH: Scatter impulse outward radially with spring return physics ---
vec3 calcSplashDisplacement(vec3 pos, float depth, vec2 uv, out float alphaMod, out float sizeMod) {
  alphaMod = 1.0;
  sizeMod = 1.0;

  vec3 disp = vec3(0.0);

  // Impulse shockwave originating from click/tap position
  vec2 toOrigin = pos.xy - uSplashOrigin;
  float distOrigin = length(toOrigin);
  vec2 dirOrigin = distOrigin > 0.0001 ? toOrigin / distOrigin : vec2(0.0, 1.0);

  // Damped harmonic oscillation: exp(-gamma * t) * sin(omega * t - k * r)
  float wavePhase = max(0.0, uSplashTime * 14.0 - distOrigin * 16.0);
  float impulseEnvelope = exp(-uSplashTime * 2.6) * exp(-distOrigin * 1.8);
  float springWave = sin(wavePhase) * impulseEnvelope;

  disp.xy += dirOrigin * springWave * (uSplashStrength * 0.35);
  disp.z += springWave * (uSplashStrength * 0.25) * (1.0 + depth * 0.5);

  // Continuous pointer wake / dynamic repulsion when moving pointer over canvas
  vec2 toPointer = pos.xy - uPointer;
  float distPointer = length(toPointer);
  float pointerInfluence = 1.0 - smoothstep(0.0, 0.4, distPointer);

  if (pointerInfluence > 0.001) {
    vec2 pDir = distPointer > 0.0001 ? toPointer / distPointer : vec2(0.0, 1.0);
    float pushForce = pointerInfluence * pointerInfluence;

    if (uPointerDown > 0.5) {
      pushForce *= 1.8;
    }

    // Tangential fluid drag from pointer velocity
    vec2 drag = uPointerVelocity * (pointerInfluence * 0.3);
    disp.xy += (pDir * pushForce * 0.15 + drag) * uSplashStrength;
    disp.z += pushForce * 0.1 * uSplashStrength;
    sizeMod += pushForce * 0.3;
  }

  // Micro spring rebound settling back to rest
  disp += sin(disp * 8.0 - uTime * 4.0) * (impulseEnvelope * 0.03);

  return disp;
}

// --- 3. GATHER: Particles collapse/converge with momentum and ease-out snapping ---
vec3 calcGatherDisplacement(vec3 pos, float depth, vec2 uv, out float alphaMod, out float sizeMod) {
  alphaMod = 1.0;
  sizeMod = 1.0;

  // Center of vortex convergence
  vec2 toCenter = pos.xy;
  float dist = length(toCenter);
  vec2 tangent = vec2(-toCenter.y, toCenter.x) / max(dist, 0.08);

  // Convergence cycle driven by uGatherProgress (0..1) with elastic momentum
  float p = uGatherProgress;

  // Elastic momentum overshoot formula: sin(p * PI * 1.5) * exp(-p * 3.0)
  float momentum = sin(p * 4.71238) * exp(-p * 2.8);
  float swirlFactor = (1.0 - p) * (1.0 - p);

  vec3 disp = vec3(0.0);
  // Swirling vortex collapsing inward
  disp.xy += (-toCenter * 0.65 + tangent * 0.45 * (1.0 + depth)) * momentum;
  // Depth implosion
  disp.z += (0.5 - depth) * 0.4 * momentum;

  // Particle size focuses as they snap into place
  sizeMod = 1.0 + momentum * 0.5;

  return disp;
}

// --- 4. DEPTH: Interactive 3D parallax responsive to mouse / gyro with layer separation ---
vec3 calcDepthDisplacement(vec3 pos, float depth, vec2 uv, out float alphaMod, out float sizeMod) {
  alphaMod = 1.0;
  sizeMod = 1.0;

  // Normalize depth around center [-1..1]
  float depthLayer = (depth - 0.5) * 2.0;

  // Parallax displacement: foreground layers shift more strongly than background layers
  vec3 disp = vec3(0.0);
  disp.xy += uParallaxOffset * (depthLayer * 0.45);

  // Depth extrusion projection along Z
  disp.z += depthLayer * (uDepthScale * 0.35);

  // Surface relief accentuation from micro-noise
  vec3 relief = curlNoise(vec3(uv * 7.0, depth * 4.0)) * (0.015 * uDepthScale);
  disp += relief;

  // Size modulation based on depth perspective
  sizeMod = clamp(0.7 + depth * 0.6, 0.5, 2.0);

  return disp;
}

// --- 5. TRAVEL: Cinematic camera dolly through particle depth planes with near/far fading ---
vec3 calcTravelDisplacement(vec3 pos, float depth, vec2 uv, out float alphaMod, out float sizeMod) {
  // Depth travel wrapping loop: particles cycle along Z axis
  float cycleSpan = 2.0;
  float rawZ = pos.z + depth * uDepthScale * 0.5;
  float loopedZ = fract((rawZ * 0.5 + 0.5) + uTravelProgress) * cycleSpan - (cycleSpan * 0.5);

  // Near plane fade & Far plane fade
  float normZ = (loopedZ + cycleSpan * 0.5) / cycleSpan; // 0..1
  float nearFade = smoothstep(0.0, 0.15, normZ);
  float farFade = 1.0 - smoothstep(0.82, 1.0, normZ);
  alphaMod = nearFade * farFade;

  // Particle size expands as it approaches viewer, fades out cleanly
  sizeMod = mix(0.4, 2.2, normZ) * nearFade;

  // Subtle flight turbulence sway
  vec3 sway = vec3(
    sin(loopedZ * 4.0 + uTime * 0.8) * 0.025,
    cos(loopedZ * 3.5 + uTime * 0.7) * 0.02,
    loopedZ - pos.z
  );

  return sway;
}

// --- 6. SWARM: Flocking/vortex-like clustering swirling around focal centers ---
vec3 calcSwarmDisplacement(vec3 pos, float depth, vec2 uv, out float alphaMod, out float sizeMod) {
  alphaMod = 1.0;
  sizeMod = 1.0;

  // Multiple moving dynamic focal vortex centers
  float t = uTime * 0.45;
  vec3 focusA = vec3(sin(t * 0.8) * 0.35, cos(t * 0.6) * 0.25, sin(t * 0.4) * 0.2);
  vec3 focusB = vec3(cos(t * 0.7) * -0.35, sin(t * 0.9) * -0.25, cos(t * 0.5) * 0.2);

  // Distances to vortex centers
  vec3 rA = pos - focusA;
  vec3 rB = pos - focusB;
  float lenA = length(rA);
  float lenB = length(rB);

  // Vortex swirl forces around Z axis
  vec3 swirlA = vec3(-rA.y, rA.x, sin(t + rA.z * 6.0) * 0.4) / (0.15 + lenA * 2.0);
  vec3 swirlB = vec3(rB.y, -rB.x, cos(t + rB.z * 6.0) * 0.4) / (0.15 + lenB * 2.0);

  // Organic flocking curl noise
  vec3 flockCurl = curlNoiseFbm(pos * 2.0, uTime * 0.5) * 0.08;

  vec3 disp = (swirlA * 0.06 + swirlB * 0.05 + flockCurl) * (1.0 + (1.0 - depth) * 0.5);

  // Breathing size variation like bioluminescent fireflies
  sizeMod = 0.85 + sin(uTime * 3.0 + pos.x * 10.0 + pos.y * 10.0) * 0.3;

  return disp;
}

// --- 7. MELT: Downward fluid-like dripping dissolve with noise decay and gravity pull ---
vec3 calcMeltDisplacement(vec3 pos, float depth, vec2 uv, out float alphaMod, out float sizeMod) {
  // Vertical dripping modulated by noise columns and depth
  float columnNoise = snoise(vec3(pos.x * 7.5, 0.0, depth * 3.5)) * 0.5 + 0.5;
  float dripIntensity = pow(columnNoise, 2.2) * (uMeltProgress * 1.7);

  // Gravity acceleration downwards
  float dripY = dripIntensity * 1.2;

  // Fluid viscous wobble as particles drip down
  float wobbleX = sin(pos.y * 14.0 + uTime * 3.5) * (dripIntensity * 0.06);
  float wobbleZ = cos(pos.y * 12.0 + uTime * 3.0) * (dripIntensity * 0.04);

  vec3 disp = vec3(wobbleX, -dripY, wobbleZ);

  // Dissolve fade: particles fade out as they melt past the bottom
  alphaMod = clamp(1.0 - dripIntensity * 1.15, 0.0, 1.0);

  // Droplet beading effect: particles stretch slightly
  sizeMod = clamp(1.0 + dripIntensity * 0.6, 0.2, 1.8);

  return disp;
}

// --- Mode Dispatcher ---
vec3 calcModeDisplacement(int mode, vec3 pos, float depth, vec2 uv, out float alphaMod, out float sizeMod) {
  if (mode == MODE_DRIFT) {
    return calcDriftDisplacement(pos, depth, uv, alphaMod, sizeMod);
  } else if (mode == MODE_SPLASH) {
    return calcSplashDisplacement(pos, depth, uv, alphaMod, sizeMod);
  } else if (mode == MODE_GATHER) {
    return calcGatherDisplacement(pos, depth, uv, alphaMod, sizeMod);
  } else if (mode == MODE_DEPTH) {
    return calcDepthDisplacement(pos, depth, uv, alphaMod, sizeMod);
  } else if (mode == MODE_TRAVEL) {
    return calcTravelDisplacement(pos, depth, uv, alphaMod, sizeMod);
  } else if (mode == MODE_SWARM) {
    return calcSwarmDisplacement(pos, depth, uv, alphaMod, sizeMod);
  } else if (mode == MODE_MELT) {
    return calcMeltDisplacement(pos, depth, uv, alphaMod, sizeMod);
  }
  alphaMod = 1.0;
  sizeMod = 1.0;
  return vec3(0.0);
}

// --- Smooth Blended Displacement for Transitions ---
vec3 calcBlendedDisplacement(vec3 pos, float depth, vec2 uv, out float outAlphaMod, out float outSizeMod) {
  if (uTransition >= 0.999) {
    return calcModeDisplacement(uCurrentMode, pos, depth, uv, outAlphaMod, outSizeMod);
  }

  float alphaPrev, alphaCurr;
  float sizePrev, sizeCurr;

  vec3 dispPrev = calcModeDisplacement(uPrevMode, pos, depth, uv, alphaPrev, sizePrev);
  vec3 dispCurr = calcModeDisplacement(uCurrentMode, pos, depth, uv, alphaCurr, sizeCurr);

  // Smooth blending
  outAlphaMod = mix(alphaPrev, alphaCurr, uTransition);
  outSizeMod = mix(sizePrev, sizeCurr, uTransition);

  return mix(dispPrev, dispCurr, uTransition);
}
`;
