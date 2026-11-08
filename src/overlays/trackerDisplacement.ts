/**
 * Drift - Tracker Motion Displacement Math
 * CPU port of the WebGL particle vertex shader displacement, noise,
 * interactive pointer/impulse forces, device orientation rotation,
 * and camera view-projection matrix screen mapping.
 *
 * Ensures technical HUD trackers and link overlays strictly follow the 3D particles
 * across all motion modes: DRIFT, SPLASH, GATHER, DEPTH, TRAVEL, SWARM, MELT.
 */
import type { ModeName } from '../types';

export const MODE_INDICES: Record<ModeName, number> = {
  DRIFT: 0,
  SPLASH: 1,
  GATHER: 2,
  DEPTH: 3,
  TRAVEL: 4,
  SWARM: 5,
  MELT: 6,
};

export interface TrackerDisplacementParams {
  time: number;
  depthScale: number;
  noiseSpeed: number;
  noiseFrequency: number;
  noiseStrength: number;
  splashStrength: number;
  mode: ModeName;
  prevMode?: ModeName;
  modeTransition?: number;
  pointerPos?: [number, number];
  pointerDown?: boolean;
  pointerVelocity?: [number, number];
  pointerRadius?: number;
  orientation?: [number, number];
  impulseCenter?: [number, number];
  impulseStrength?: number;
}

export interface ProjectResult {
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  ndcZ: number;
  inFrustum: boolean;
  opacityMod: number;
}

// --- 3D Simplex Noise by Stefan Gustavson & Ian McEwan (Ashima Arts) ported to TypeScript ---

function mod289(x: number): number {
  return x - Math.floor(x * (1.0 / 289.0)) * 289.0;
}

function permute(x: number): number {
  return mod289(((x * 34.0) + 1.0) * x);
}

function taylorInvSqrt(r: number): number {
  return 1.79284291400159 - 0.85373472095314 * r;
}

/**
 * GLSL mod operator: x - y * floor(x / y)
 */
export function glslMod(x: number, y: number): number {
  return x - y * Math.floor(x / y);
}

/**
 * GLSL smoothstep operator
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3.0 - 2.0 * t);
}

/**
 * 3D Simplex noise matching the GLSL snoise implementation.
 */
export function snoise(x: number, y: number, z: number): number {
  const C_x = 1.0 / 6.0;
  const C_y = 1.0 / 3.0;

  // First corner
  const s = (x + y + z) * C_y;
  const ix = Math.floor(x + s);
  const iy = Math.floor(y + s);
  const iz = Math.floor(z + s);

  const t = (ix + iy + iz) * C_x;
  const x0x = x - ix + t;
  const x0y = y - iy + t;
  const x0z = z - iz + t;

  // Other corners
  const gx = x0x >= x0y ? 1.0 : 0.0;
  const gy = x0y >= x0z ? 1.0 : 0.0;
  const gz = x0z >= x0x ? 1.0 : 0.0;

  const lx = 1.0 - gx;
  const ly = 1.0 - gy;
  const lz = 1.0 - gz;

  const i1x = Math.min(gx, lz);
  const i1y = Math.min(gy, lx);
  const i1z = Math.min(gz, ly);

  const i2x = Math.max(gx, lz);
  const i2y = Math.max(gy, lx);
  const i2z = Math.max(gz, ly);

  const x1x = x0x - i1x + C_x;
  const x1y = x0y - i1y + C_x;
  const x1z = x0z - i1z + C_x;

  const x2x = x0x - i2x + 2.0 * C_x;
  const x2y = x0y - i2y + 2.0 * C_x;
  const x2z = x0z - i2z + 2.0 * C_x;

  const x3x = x0x - 1.0 + 3.0 * C_x;
  const x3y = x0y - 1.0 + 3.0 * C_x;
  const x3z = x0z - 1.0 + 3.0 * C_x;

  // Permutations
  const iix = mod289(ix);
  const iiy = mod289(iy);
  const iiz = mod289(iz);

  const p0 = permute(permute(permute(iiz) + iiy) + iix);
  const p1 = permute(permute(permute(iiz + i1z) + iiy + i1y) + iix + i1x);
  const p2 = permute(permute(permute(iiz + i2z) + iiy + i2y) + iix + i2x);
  const p3 = permute(permute(permute(iiz + 1.0) + iiy + 1.0) + iix + 1.0);

  // Gradients
  const ns_x = 2.0 / 7.0;
  const ns_y = -13.0 / 14.0;
  const ns_z = 1.0 / 7.0;

  function corner(p: number, xk: number, yk: number, zk: number): number {
    const j = p - 49.0 * Math.floor(p * ns_z * ns_z);
    const x_ = Math.floor(j * ns_z);
    const y_ = Math.floor(j - 7.0 * x_);
    const cx = x_ * ns_x + ns_y;
    const cy = y_ * ns_x + ns_y;
    const ch = 1.0 - Math.abs(cx) - Math.abs(cy);

    const bx = cx;
    const by = cy;
    const sx = Math.floor(bx) * 2.0 + 1.0;
    const sy = Math.floor(by) * 2.0 + 1.0;
    const sh = ch < 0.0 ? -1.0 : 0.0;

    let px = bx + sx * sh;
    let py = by + sy * sh;
    let pz = ch;

    const norm = taylorInvSqrt(px * px + py * py + pz * pz);
    px *= norm;
    py *= norm;
    pz *= norm;

    const d = xk * xk + yk * yk + zk * zk;
    const m = Math.max(0.6 - d, 0.0);
    const m2 = m * m;
    return m2 * m2 * (px * xk + py * yk + pz * zk);
  }

  return 42.0 * (
    corner(p0, x0x, x0y, x0z) +
    corner(p1, x1x, x1y, x1z) +
    corner(p2, x2x, x2y, x2z) +
    corner(p3, x3x, x3y, x3z)
  );
}

/**
 * 3D Curl noise derivation from 3D scalar potential matching GLSL curlNoise.
 */
export function curlNoise(x: number, y: number, z: number): [number, number, number] {
  const n1 = snoise(x, y, z);
  const n2 = snoise(x + 31.416, y - 47.153, z + 12.879);
  const n3 = snoise(x - 15.732, y + 28.321, z - 63.125);
  return [n2 - n3, n3 - n1, n1 - n2];
}

// --- Mode Displacement Functions (Matching PARTICLE_VERTEX_SHADER in shaders.ts) ---

/**
 * Mode 0: DRIFT - organic floating turbulence
 */
export function computeDrift(
  p: [number, number, number],
  seed: number,
  sal: number,
  t: number,
  noiseFrequency: number,
  noiseSpeed: number,
  noiseStrength: number
): [number, number, number] {
  const npX = p[0] * noiseFrequency + seed * 2.5;
  const npY = p[1] * noiseFrequency + t * noiseSpeed * 0.4;
  const npZ = p[2] * noiseFrequency + seed * 1.5;
  const curl = curlNoise(npX, npY, npZ);
  const zFloat = Math.sin(t * noiseSpeed * 1.5 + p[0] * 4.0 + p[1] * 3.0 + seed * 6.28) * 0.05;
  const salFactor = 1.0 + (1.0 - sal) * 0.7;
  const scale = noiseStrength * 0.15 * salFactor;
  return [curl[0] * scale, curl[1] * scale, curl[2] * scale + zFloat];
}

/**
 * Mode 1: SPLASH - explosive shockwave scatter
 */
export function computeSplash(
  p: [number, number, number],
  _seed: number,
  _sal: number,
  t: number,
  splashStrength: number,
  pointerPos: [number, number]
): [number, number, number] {
  const diffX = p[0] - pointerPos[0];
  const diffY = p[1] - pointerPos[1];
  const dist = Math.hypot(diffX, diffY);
  const dirX = dist > 0.001 ? diffX / dist : 0.0;
  const dirY = dist > 0.001 ? diffY / dist : 1.0;

  const wave = Math.sin(Math.max(0.0, dist * 12.0 - t * 5.0)) * Math.exp(-dist * 2.5);
  const impulse = (1.0 - smoothstep(0.0, 1.0, dist)) * splashStrength;

  const burstXYMag = wave * 0.25 + impulse * 0.4;
  let bx = dirX * burstXYMag;
  let by = dirY * burstXYMag;
  let bz = wave * 0.5 + impulse * 0.3;

  const curl = curlNoise(p[0] * 2.5 + t * 0.8, p[1] * 2.5 + t * 0.8, p[2] * 2.5 + t * 0.8);
  const curlScale = impulse * 0.2;
  bx += curl[0] * curlScale;
  by += curl[1] * curlScale;
  bz += curl[2] * curlScale;

  return [bx, by, bz];
}

/**
 * Mode 2: GATHER - gravitational convergence & vortex
 */
export function computeGather(
  p: [number, number, number],
  _seed: number,
  _sal: number,
  t: number,
  pointerPos: [number, number],
  pointerDown: boolean
): [number, number, number] {
  const targetX = pointerDown ? pointerPos[0] : 0.0;
  const targetY = pointerDown ? pointerPos[1] : 0.0;
  const toTargetX = targetX - p[0];
  const toTargetY = targetY - p[1];
  const dist = Math.hypot(toTargetX, toTargetY);
  const dirX = dist > 0.001 ? toTargetX / dist : 0.0;
  const dirY = dist > 0.001 ? toTargetY / dist : 0.0;
  const perpX = -dirY;
  const perpY = dirX;

  const pull = 1.0 - smoothstep(0.05, 2.0, dist);
  const swirl = Math.sin(dist * 7.0 - t * 4.0);
  const motionX = dirX * (pull * 0.5) + perpX * (pull * swirl * 0.35);
  const motionY = dirY * (pull * 0.5) + perpY * (pull * swirl * 0.35);
  const zPull = -pull * 0.2 + Math.sin(t * 2.0 + dist * 6.0) * 0.06;
  return [motionX, motionY, zPull];
}

/**
 * Mode 3: DEPTH - stratified topographic relief extrusion
 */
export function computeDepthMode(
  _p: [number, number, number],
  dep: number,
  _seed: number,
  _sal: number,
  t: number,
  noiseStrength: number
): [number, number, number] {
  const slice = Math.sin(dep * 35.0 - t * 2.5) * 0.04 * noiseStrength;
  const steppedZ = (Math.floor(dep * 16.0) / 16.0) * 0.25;
  return [0.0, 0.0, steppedZ + slice];
}

/**
 * Mode 4: TRAVEL - starfield hyperspace flythrough
 */
export function computeTravel(
  p: [number, number, number],
  seed: number,
  _sal: number,
  t: number,
  noiseSpeed: number
): [number, number, number] {
  const speed = (0.6 + seed * 0.8) * (noiseSpeed + 0.5);
  const zSpan = 2.6;
  let zOff = glslMod(p[2] + t * speed, zSpan) - 1.5;
  zOff = Math.min(zOff, 1.1);
  const expand = (zOff + 1.5) * 0.18;
  return [p[0] * expand, p[1] * expand, zOff - p[2]];
}

/**
 * Mode 5: SWARM - flocking orbital vortices
 */
export function computeSwarm(
  p: [number, number, number],
  seed: number,
  _sal: number,
  t: number,
  noiseStrength: number,
  pointerPos: [number, number],
  pointerDown: boolean
): [number, number, number] {
  const centerX = pointerDown ? pointerPos[0] : 0.0;
  const centerY = pointerDown ? pointerPos[1] : 0.0;
  const offX = p[0] - centerX;
  const offY = p[1] - centerY;
  const r = Math.hypot(offX, offY);
  const angle = Math.atan2(offY, offX) + t * (1.5 + seed * 1.2);

  const orbitR = r + Math.sin(t * 2.5 + seed * 6.28) * 0.1 * noiseStrength;
  const swarmTargetX = centerX + Math.cos(angle) * orbitR;
  const swarmTargetY = centerY + Math.sin(angle) * orbitR;
  const curl = curlNoise(p[0] * 2.0 + t * 0.6, p[1] * 2.0 + t * 0.6, p[2] * 2.0 + t * 0.6);
  return [swarmTargetX - p[0], swarmTargetY - p[1], curl[2] * 0.12];
}

/**
 * Mode 6: MELT - downward liquid drip distortion
 */
export function computeMelt(
  _p: [number, number, number],
  seed: number,
  sal: number,
  t: number,
  noiseStrength: number
): [number, number, number] {
  const speed = (0.35 + (1.0 - sal) * 0.8 + seed * 0.5) * (noiseStrength + 0.3);
  const drip = glslMod(t * speed + seed * 4.0, 2.0);
  const yDisp = -Math.pow(drip, 1.7) * 0.45;
  const xDisp = Math.sin(drip * 9.0 + seed * 6.28) * 0.04 * (1.0 - sal);
  return [xDisp, yDisp, -drip * 0.1];
}

/**
 * Dispatcher evaluating mode displacement vector.
 */
export function getModeDisplacement(
  mode: ModeName | number,
  p: [number, number, number],
  dep: number,
  seed: number,
  sal: number,
  t: number,
  params: TrackerDisplacementParams
): [number, number, number] {
  const modeIdx = typeof mode === 'number' ? mode : MODE_INDICES[mode] ?? 0;
  switch (modeIdx) {
    case 0: // DRIFT
      return computeDrift(p, seed, sal, t, params.noiseFrequency, params.noiseSpeed, params.noiseStrength);
    case 1: // SPLASH
      return computeSplash(p, seed, sal, t, params.splashStrength, params.pointerPos ?? [0, 0]);
    case 2: // GATHER
      return computeGather(p, seed, sal, t, params.pointerPos ?? [0, 0], params.pointerDown ?? false);
    case 3: // DEPTH
      return computeDepthMode(p, dep, seed, sal, t, params.noiseStrength);
    case 4: // TRAVEL
      return computeTravel(p, seed, sal, t, params.noiseSpeed);
    case 5: // SWARM
      return computeSwarm(p, seed, sal, t, params.noiseStrength, params.pointerPos ?? [0, 0], params.pointerDown ?? false);
    case 6: // MELT
      return computeMelt(p, seed, sal, t, params.noiseStrength);
    default:
      return [0, 0, 0];
  }
}

/**
 * Mode-level tracker opacity policy.
 * If any mode is deemed too costly or chaotic on CPU for all active trackers,
 * return 0.0 to smoothly fade trackers out in that mode.
 */
export function getModeTrackerOpacity(_mode: ModeName | number): number {
  // All 7 Drift modes are lightweight and smoothly computed on CPU (< 0.05ms for all trackers).
  return 1.0;
}

/**
 * Compute the displaced 3D world position of a tracker point,
 * including mode transitions, interactive impulse shockwave, pointer drag,
 * and device orientation tilt rotation.
 */
export function computeTrackerWorldPosition(
  baseX: number,
  baseY: number,
  rawDepth: number,
  seed: number,
  salience: number,
  params: TrackerDisplacementParams
): [number, number, number] {
  const {
    time,
    depthScale,
    mode,
    prevMode = mode,
    modeTransition = 1.0,
    impulseCenter = [0, 0],
    impulseStrength = 0.0,
    pointerPos = [0, 0],
    pointerDown = false,
    pointerVelocity = [0, 0],
    pointerRadius = 0.5,
    orientation = [0, 0],
  } = params;

  // 1. Base 3D position
  const baseZ = (rawDepth - 0.5) * depthScale;
  const basePos: [number, number, number] = [baseX, baseY, baseZ];

  // 2. Mode displacement blending
  const dispCurr = getModeDisplacement(mode, basePos, rawDepth, seed, salience, time, params);
  let modeDisp: [number, number, number] = dispCurr;

  const progress = Math.max(0.0, Math.min(1.0, modeTransition));
  if (progress < 0.999 && prevMode !== mode) {
    const dispPrev = getModeDisplacement(prevMode, basePos, rawDepth, seed, salience, time, params);
    modeDisp = [
      dispPrev[0] + (dispCurr[0] - dispPrev[0]) * progress,
      dispPrev[1] + (dispCurr[1] - dispPrev[1]) * progress,
      dispPrev[2] + (dispCurr[2] - dispPrev[2]) * progress,
    ];
  }

  // 3. User interactive draw impulse
  let impX = 0.0;
  let impY = 0.0;
  let impZ = 0.0;
  if (impulseStrength > 0.001) {
    const diffX = basePos[0] - impulseCenter[0];
    const diffY = basePos[1] - impulseCenter[1];
    const impDist = Math.hypot(diffX, diffY);
    const impWave = Math.sin(impDist * 20.0 - time * 10.0) * Math.exp(-impDist * 3.5) * impulseStrength;
    const normX = diffX + 0.0001;
    const normY = diffY + 0.0001;
    const normLen = Math.hypot(normX, normY);
    const invNorm = normLen > 0.00001 ? 1.0 / normLen : 1.0;
    impX = normX * invNorm * (impWave * 0.15);
    impY = normY * invNorm * (impWave * 0.15);
    impZ = impWave * 0.3;
  }

  // 4. Pointer hover subtle displacement
  let pDispX = 0.0;
  let pDispY = 0.0;
  let pDispZ = 0.0;
  const pDiffX = basePos[0] - pointerPos[0];
  const pDiffY = basePos[1] - pointerPos[1];
  const pDist = Math.hypot(pDiffX, pDiffY);
  if (pDist < pointerRadius && pDist > 0.001) {
    const pFactor = 1.0 - pDist / pointerRadius;
    pDispX = pointerVelocity[0] * (pFactor * 0.04);
    pDispY = pointerVelocity[1] * (pFactor * 0.04);
    pDispZ = (pointerDown ? 0.08 : 0.03) * pFactor;
  }

  let finalX = basePos[0] + modeDisp[0] + impX + pDispX;
  let finalY = basePos[1] + modeDisp[1] + impY + pDispY;
  let finalZ = basePos[2] + modeDisp[2] + impZ + pDispZ;

  // 5. Device tilt / orientation parallax rotation
  // mat2 rotX = mat2(cos(uOrientation.x * 0.4), -sin(uOrientation.x * 0.4), sin(uOrientation.x * 0.4), cos(uOrientation.x * 0.4));
  // finalPos.yz = rotX * finalPos.yz;
  const cx = Math.cos(orientation[0] * 0.4);
  const sx = Math.sin(orientation[0] * 0.4);
  const rotY = cx * finalY + sx * finalZ;
  const rotZ1 = -sx * finalY + cx * finalZ;
  finalY = rotY;
  finalZ = rotZ1;

  // mat2 rotY = mat2(cos(uOrientation.y * 0.4), -sin(uOrientation.y * 0.4), sin(uOrientation.y * 0.4), cos(uOrientation.y * 0.4));
  // finalPos.xz = rotY * finalPos.xz;
  const cy = Math.cos(orientation[1] * 0.4);
  const sy = Math.sin(orientation[1] * 0.4);
  const rotX = cy * finalX + sy * finalZ;
  const rotZ2 = -sy * finalX + cy * finalZ;
  finalX = rotX;
  finalZ = rotZ2;

  return [finalX, finalY, finalZ];
}

/**
 * Projects a 3D world point to 2D screen canvas coordinates using
 * the camera's viewProjectionMatrix (or separated viewMatrix + projectionMatrix),
 * applying near-plane safety guards and edge frustum checks.
 */
export function projectWorldToScreen(
  worldPos: [number, number, number],
  viewProjectionMatrix: Float32Array,
  width: number,
  height: number,
  viewMatrix?: Float32Array,
  projectionMatrix?: Float32Array
): ProjectResult {
  let clipX: number;
  let clipY: number;
  let clipZ: number;
  let clipW: number;

  const vx = worldPos[0];
  const vy = worldPos[1];
  const vz = worldPos[2];

  if (viewMatrix && projectionMatrix) {
    // 2-step transform with near-plane safety guard matching shader
    const vm = viewMatrix;
    const mvX = vm[0] * vx + vm[4] * vy + vm[8] * vz + vm[12];
    const mvY = vm[1] * vx + vm[5] * vy + vm[9] * vz + vm[13];
    let mvZ = vm[2] * vx + vm[6] * vy + vm[10] * vz + vm[14];
    const mvW = vm[3] * vx + vm[7] * vy + vm[11] * vz + vm[15];

    // Near plane safety guard matching WebGL vertex shader
    if (mvZ > -0.15) {
      mvZ = -0.15;
    }

    const pm = projectionMatrix;
    clipX = pm[0] * mvX + pm[4] * mvY + pm[8] * mvZ + pm[12] * mvW;
    clipY = pm[1] * mvX + pm[5] * mvY + pm[9] * mvZ + pm[13] * mvW;
    clipZ = pm[2] * mvX + pm[6] * mvY + pm[10] * mvZ + pm[14] * mvW;
    clipW = pm[3] * mvX + pm[7] * mvY + pm[11] * mvZ + pm[15] * mvW;
  } else {
    const vpm = viewProjectionMatrix;
    clipX = vpm[0] * vx + vpm[4] * vy + vpm[8] * vz + vpm[12];
    clipY = vpm[1] * vx + vpm[5] * vy + vpm[9] * vz + vpm[13];
    clipZ = vpm[2] * vx + vpm[6] * vy + vpm[10] * vz + vpm[14];
    clipW = vpm[3] * vx + vpm[7] * vy + vpm[11] * vz + vpm[15];
  }

  // Behind camera or too close to lens
  if (clipW <= 0.001) {
    return {
      x: -9999,
      y: -9999,
      screenX: -99,
      screenY: -99,
      ndcZ: 2.0,
      inFrustum: false,
      opacityMod: 0.0,
    };
  }

  const invW = 1.0 / clipW;
  const ndcX = clipX * invW;
  const ndcY = clipY * invW;
  const ndcZ = clipZ * invW;

  const screenX = (ndcX + 1.0) * 0.5;
  const screenY = (1.0 - ndcY) * 0.5;
  const px = screenX * width;
  const py = screenY * height;

  // Frustum check with comfortable boundary padding
  const inFrustum = ndcZ <= 1.0 && screenX >= -0.15 && screenX <= 1.15 && screenY >= -0.15 && screenY <= 1.15;

  // Smooth fade as point approaches near plane
  let opacityMod = 1.0;
  if (clipW < 0.25) {
    opacityMod = Math.max(0.0, (clipW - 0.1) / 0.15);
  }

  return {
    x: px,
    y: py,
    screenX,
    screenY,
    ndcZ,
    inFrustum,
    opacityMod,
  };
}
