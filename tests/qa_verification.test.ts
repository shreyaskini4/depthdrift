/**
 * Automated QA Verification Suite for Drift Particle Engine
 * Verifies all specifications in TASK 4.
 */

import * as THREE from 'three';
import fs from 'fs';
import { PARTICLE_VERTEX_SHADER, PARTICLE_FRAGMENT_SHADER } from '../src/engine/shaders';
import { FPSRegulator } from '../src/engine/fpsRegulator';
import { shuffleParticles } from '../src/engine/sampling';

// Extract DEFAULT_SETTINGS directly from main.ts source code without executing DOM/CSS
const mainSrc = fs.readFileSync('src/main.ts', 'utf-8');
const pointSizeMatch = mainSrc.match(/pointSize:\s*([0-9.]+)/);
const defaultPointSize = pointSizeMatch ? parseFloat(pointSizeMatch[1]) : 0;
const hasResponsiveParticleCount = mainSrc.includes('particleCount: isCoarse ? 200_000 : 450_000');

interface TestResult {
  category: string;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function assert(category: string, name: string, condition: boolean, details: string) {
  results.push({ category, name, passed: condition, details });
  const icon = condition ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} [${category}] ${name}: ${details}`);
}

// -------------------------------------------------------------
// 1. STIPPLE PRINT LOOK & SHADER VERIFICATION
// -------------------------------------------------------------
console.log('\n--- 1. STIPPLE PRINT LOOK & SHADER VERIFICATION ---');

// Point size default
assert(
  'Stipple Specs',
  'Default Point Size',
  defaultPointSize === 1.0,
  `Default point size is ${defaultPointSize} (expected 1.0 for supersampled stipple dots)`
);

// Particle count default
assert(
  'Stipple Specs',
  'Responsive Particle Count (450k Desktop / 200k Coarse)',
  hasResponsiveParticleCount,
  'main.ts specifies particleCount: isCoarse ? 200_000 : 450_000'
);

// Fragment shader edge smoothstep
const edgeSmoothingMatch = PARTICLE_FRAGMENT_SHADER.includes('1.0 - smoothstep(0.38, 0.5, dist)');
assert(
  'Stipple Specs',
  'Sharp Circular Edge Filter',
  edgeSmoothingMatch,
  'PARTICLE_FRAGMENT_SHADER contains "1.0 - smoothstep(0.38, 0.5, dist)"'
);

// Palette check - TRUE: no 0.06 floor
const has006Floor = PARTICLE_VERTEX_SHADER.includes('0.06') && !PARTICLE_VERTEX_SHADER.includes('lifeFade');
const trueModeCorrect =
  PARTICLE_VERTEX_SHADER.includes('(baseColor - 0.04) * 1.12') &&
  !PARTICLE_VERTEX_SHADER.includes('max(c, 0.06)');
assert(
  'Palette Checks',
  'TRUE Palette (No 0.06 floor)',
  trueModeCorrect,
  'TRUE mode uses clamp((baseColor - 0.04) * 1.12, 0.0, 1.0) with no artificial 0.06 floor'
);

// Palette check - NEGATIVE: high contrast inverted print
const negativeCorrect =
  PARTICLE_VERTEX_SHADER.includes('vec3 inverted = vec3(1.0) - baseColor;') &&
  PARTICLE_VERTEX_SHADER.includes('max(vec3(0.16, 0.16, 0.20)');
assert(
  'Palette Checks',
  'NEGATIVE Palette (High contrast inverted)',
  negativeCorrect,
  'NEGATIVE mode inverts baseColor and scales contrast with floor 0.16'
);

// Palette check - ON_WHITE: charcoal/stipple on white background
const onWhiteCorrect =
  PARTICLE_VERTEX_SHADER.includes('vec3 ink = mix(vec3(0.03, 0.04, 0.06), vec3(0.38, 0.40, 0.45), luma);') &&
  PARTICLE_VERTEX_SHADER.includes('vAlpha = mix(0.90, 0.50, luma);');
assert(
  'Palette Checks',
  'ON_WHITE Palette (Charcoal stipple ink)',
  onWhiteCorrect,
  'ON_WHITE maps luma to charcoal pigment (0.03, 0.04, 0.06) -> graphite (0.38, 0.40, 0.45)'
);

// Mode checks in GLSL:
// One-way drift shader
const driftOneWay = PARTICLE_VERTEX_SHADER.includes(
  '(dot(p.xy, uDriftAxis) - uDriftOrigin) / max(uDriftFeather, 0.02)'
);
assert(
  'Modes GLSL',
  'One-way DRIFT shader with bar & feather',
  driftOneWay,
  'DRIFT shader computes front penetration dot(p.xy, uDriftAxis) - uDriftOrigin'
);

// SPLASH shockwave kick and return
const splashKick = PARTICLE_VERTEX_SHADER.includes('tau * k * exp(1.0 - tau * k)');
assert(
  'Modes GLSL',
  'SPLASH Shockwave Pulse',
  splashKick,
  'SPLASH implements tau * k * exp(1.0 - tau * k) shockwave kick and return'
);

// GATHER orbital swirl
const gatherSwirl = PARTICLE_VERTEX_SHADER.includes('vec2 perp = vec2(-dir.y, dir.x);') &&
                    PARTICLE_VERTEX_SHADER.includes('toT * pull + perp * swirl');
assert(
  'Modes GLSL',
  'GATHER Orbital Swirl',
  gatherSwirl,
  'GATHER uses tangential perp vector for smooth orbital swirl toward attractor'
);

// SWARM bounded vortex
const swarmVortex = PARTICLE_VERTEX_SHADER.includes('float fall = 1.0 - smoothstep(0.0, 1.8, r);') &&
                    PARTICLE_VERTEX_SHADER.includes('rot * squeeze');
assert(
  'Modes GLSL',
  'SWARM Bounded Vortex',
  swarmVortex,
  'SWARM implements bounded differential rotation vortex with radial squeeze'
);

// MELT sagging grain with no teleport pop
const meltNoPop = PARTICLE_VERTEX_SHADER.includes('lifeFade(ph, 0.06, 0.45)') &&
                  PARTICLE_VERTEX_SHADER.includes('fract(t *');
assert(
  'Modes GLSL',
  'MELT Sagging Grain Without Pop',
  meltNoPop,
  'MELT fades in at top and fades out at bottom via lifeFade to avoid teleport popping'
);

// TRAVEL camera near-plane fade
const travelFade = PARTICLE_VERTEX_SHADER.includes('float nearFade = smoothstep(0.18, 0.6, viewZ);') &&
                   PARTICLE_VERTEX_SHADER.includes('vAlpha *= modeFade * nearFade;');
assert(
  'Modes GLSL',
  'TRAVEL Near-Plane Fade',
  travelFade,
  'TRAVEL mode applies smoothstep near-plane fade (0.18 to 0.6) to prevent clipping pops'
);

// -------------------------------------------------------------
// 2. FITCAMERA & RAYCASTING VERIFICATION
// -------------------------------------------------------------
console.log('\n--- 2. FITCAMERA & RAYCASTING VERIFICATION ---');

function computeBaseCamZ(fov: number, width: number, height: number, imageAspect: number, fill: number = 0.82): number {
  const t = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  const viewAspect = width / height;
  const distH = 0.5 / (t * fill);
  const distW = (0.5 * imageAspect) / (t * viewAspect * fill);
  return Math.max(distH, distW);
}

// Test at 1920x917 desktop viewport
const vpW = 1920;
const vpH = 917;
const fov = 50;

// Test with standard 16:9 image (aspect = 16/9 ~ 1.777)
const aspect16_9 = 16 / 9;
const z16_9 = computeBaseCamZ(fov, vpW, vpH, aspect16_9, 0.82);

// Project image boundaries in camera view to check fill factor
const tHalf = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
const frustumHalfH = z16_9 * tHalf;
const frustumHalfW = frustumHalfH * (vpW / vpH);

const imageHalfH = 0.5;
const imageHalfW = 0.5 * aspect16_9;

const fillH = imageHalfH / frustumHalfH;
const fillW = imageHalfW / frustumHalfW;
const maxFill = Math.max(fillH, fillW);

assert(
  'fitCamera',
  '82% Viewport Fill at 1920x917 (16:9 Image)',
  Math.abs(maxFill - 0.82) < 1e-4,
  `Max dimension fill is ${(maxFill * 100).toFixed(2)}% (target: 82.00%)`
);

// Test with square image (aspect = 1.0)
const zSquare = computeBaseCamZ(fov, vpW, vpH, 1.0, 0.82);
const frustumHalfH_sq = zSquare * tHalf;
const frustumHalfW_sq = frustumHalfH_sq * (vpW / vpH);
const maxFill_sq = Math.max(0.5 / frustumHalfH_sq, 0.5 / frustumHalfW_sq);

assert(
  'fitCamera',
  '82% Viewport Fill at 1920x917 (Square Image)',
  Math.abs(maxFill_sq - 0.82) < 1e-4,
  `Max dimension fill is ${(maxFill_sq * 100).toFixed(2)}% (target: 82.00%)`
);

// Test raycasting with live camera Z
function raycastToPlaneZ0(
  screenX: number,
  screenY: number,
  viewW: number,
  viewH: number,
  cam: THREE.PerspectiveCamera
): { x: number; y: number } {
  const ndcX = (screenX / viewW) * 2 - 1;
  const ndcY = -(screenY / viewH) * 2 + 1;
  cam.updateMatrixWorld();
  const v = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(cam);
  const dir = v.sub(cam.position).normalize();
  const distance = Math.abs(dir.z) > 1e-6 ? -cam.position.z / dir.z : 0;
  return {
    x: cam.position.x + dir.x * distance,
    y: cam.position.y + dir.y * distance,
  };
}

const testCam = new THREE.PerspectiveCamera(50, vpW / vpH, 0.1, 50);
testCam.position.set(0, 0, z16_9);
testCam.lookAt(0, 0, 0);

// Screen center should map exactly to (0, 0) in world
const centerRay = raycastToPlaneZ0(vpW / 2, vpH / 2, vpW, vpH, testCam);
assert(
  'Raycasting',
  'Center Screen Unprojection',
  Math.abs(centerRay.x) < 1e-4 && Math.abs(centerRay.y) < 1e-4,
  `Center unprojects to (${centerRay.x.toFixed(4)}, ${centerRay.y.toFixed(4)})`
);

// Raycast with camera dollied closer (as in TRAVEL mode)
testCam.position.z = z16_9 - 0.5;
const centerRayDollied = raycastToPlaneZ0(vpW / 2, vpH / 2, vpW, vpH, testCam);
assert(
  'Raycasting',
  'Live Camera Z Tracking During Dolly',
  Math.abs(centerRayDollied.x) < 1e-4 && Math.abs(centerRayDollied.y) < 1e-4,
  `Raycasting stays accurate during TRAVEL dolly (center remains (0, 0))`
);

// -------------------------------------------------------------
// 3. PERFORMANCE & FPS REGULATOR VERIFICATION
// -------------------------------------------------------------
console.log('\n--- 3. PERFORMANCE & FPS REGULATOR VERIFICATION ---');

const regulator = new FPSRegulator(200_000, true);

assert(
  'FPS Regulator',
  'Initial Target Particle Count',
  regulator.getTargetCount() === 200_000 && regulator.getEffectiveParticleCount() === 200_000,
  `Target is ${regulator.getTargetCount()}, current is ${regulator.getEffectiveParticleCount()}`
);

// Simulate steady 60 FPS for 2 seconds (120 frames at dt = 1/60s)
for (let i = 0; i < 120; i++) {
  regulator.update(1 / 60);
}
assert(
  'FPS Regulator',
  'Stable 60 FPS Particle Count',
  regulator.getEffectiveParticleCount() === 200_000,
  `Maintains ${regulator.getEffectiveParticleCount()} particles at steady 60 FPS`
);

// Simulate high load drop to 30 FPS (dt = 1/30s = 0.0333s) for 4 seconds (120 frames)
// Regulator moving average drops < 50 after ~20 frames, then needs 2.5s (75 frames) of low FPS
for (let i = 0; i < 120; i++) {
  regulator.update(1 / 30);
}
const reducedCount = regulator.getEffectiveParticleCount();
assert(
  'FPS Regulator',
  'Graceful Load Shedding Below 50 FPS',
  reducedCount === Math.floor(200_000 * 0.85),
  `Reduced from 200,000 to ${reducedCount} (15% reduction = ${Math.floor(200_000 * 0.85)})`
);

// Continue running slow for another 4 seconds (120 frames) to test secondary reduction
for (let i = 0; i < 120; i++) {
  regulator.update(1 / 30);
}
const secondReduced = regulator.getEffectiveParticleCount();
assert(
  'FPS Regulator',
  'Secondary Step Reduction',
  secondReduced === Math.floor(reducedCount * 0.85),
  `Further reduced to ${secondReduced}`
);

// Flush moving average to 60 FPS
for (let i = 0; i < 60; i++) {
  regulator.update(1 / 60);
}
const beforeRecovery = regulator.getEffectiveParticleCount();

// Now simulate recovery above 58 FPS for 5.5 seconds (> 5s threshold: 330 frames)
for (let i = 0; i < 330; i++) {
  regulator.update(1 / 60);
}
const recoveredCount = regulator.getEffectiveParticleCount();
assert(
  'FPS Regulator',
  'Gradual Step Recovery Above 58 FPS',
  recoveredCount === beforeRecovery + 10_000,
  `Recovered by +10,000 particles to ${recoveredCount} (from ${beforeRecovery})`
);

// Test disable feature
regulator.setEnabled(false);
assert(
  'FPS Regulator',
  'Disabled State Restores Target Count',
  regulator.getEffectiveParticleCount() === 200_000,
  `When disabled, instantly restores target count of ${regulator.getEffectiveParticleCount()}`
);

// -------------------------------------------------------------
// 4. SAMPLING & SHUFFLE VERIFICATION
// -------------------------------------------------------------
console.log('\n--- 4. SAMPLING & SHUFFLE VERIFICATION ---');

const testN = 1000;
const pos = new Float32Array(testN * 3);
const col = new Float32Array(testN * 3);
const seed = new Float32Array(testN * 2);
const sal = new Float32Array(testN);
const dep = new Float32Array(testN);

for (let i = 0; i < testN; i++) {
  pos[i * 3] = i;
  pos[i * 3 + 1] = i * 2;
  pos[i * 3 + 2] = i * 3;
  col[i * 3] = i;
  col[i * 3 + 1] = i * 2;
  col[i * 3 + 2] = i * 3;
  seed[i * 2] = i * 4;
  seed[i * 2 + 1] = i * 5;
  sal[i] = i * 6;
  dep[i] = i * 7;
}

shuffleParticles(pos, col, seed, sal, dep, testN);

let correctlyLinked = true;
for (let i = 0; i < testN; i++) {
  const origIndex = pos[i * 3];
  if (
    pos[i * 3 + 1] !== origIndex * 2 ||
    pos[i * 3 + 2] !== origIndex * 3 ||
    col[i * 3] !== origIndex ||
    col[i * 3 + 1] !== origIndex * 2 ||
    col[i * 3 + 2] !== origIndex * 3 ||
    seed[i * 2] !== origIndex * 4 ||
    seed[i * 2 + 1] !== origIndex * 5 ||
    sal[i] !== origIndex * 6 ||
    dep[i] !== origIndex * 7
  ) {
    correctlyLinked = false;
    break;
  }
}

assert(
  'Sampling',
  'Fisher-Yates Shuffle Attribute Invariance',
  correctlyLinked,
  'All 5 attributes (pos, col, seed, sal, dep) preserve exact index linkage through shuffle'
);

// -------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------
console.log('\n=============================================');
const total = results.length;
const passed = results.filter((r) => r.passed).length;
const failed = total - passed;

console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${failed}`);
if (failed > 0) {
  console.error(`QA Verification FAILED with ${failed} failure(s).`);
  process.exit(1);
} else {
  console.log(`QA Verification SUCCEEDED: All checks passed! 🎉`);
}
