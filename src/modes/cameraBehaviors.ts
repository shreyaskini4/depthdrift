import * as THREE from 'three';
import type { CameraPose } from './types';

export function createDefaultCameraPose(): CameraPose {
  return {
    position: new THREE.Vector3(0, 0, 2.5),
    target: new THREE.Vector3(0, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    fov: 48,
  };
}

/**
 * 1. DRIFT Camera: Subtle organic breathing and gentle Lissajous oscillation
 */
export function calculateDriftCameraPose(time: number, outPose: CameraPose): CameraPose {
  const t = time * 0.35;
  const swayX = Math.sin(t * 0.7) * 0.08;
  const swayY = Math.cos(t * 0.9) * 0.06;
  const breathZ = Math.sin(t * 0.5) * 0.04;

  outPose.position.set(swayX, swayY, 2.5 + breathZ);
  outPose.target.set(swayX * 0.25, swayY * 0.25, 0);
  outPose.up.set(0, 1, 0);
  outPose.fov = 48;
  return outPose;
}

/**
 * 2. SPLASH Camera: Recoil zoom impulse on impact with damped harmonic rebound
 */
export function calculateSplashCameraPose(
  splashTime: number,
  splashStrength: number,
  outPose: CameraPose
): CameraPose {
  // Damped harmonic recoil pulse: pulls camera back slightly on splash shockwave
  const recoil =
    Math.sin(splashTime * 12.0) * Math.exp(-splashTime * 2.5) * (splashStrength * 0.12);

  outPose.position.set(0, 0, 2.5 + recoil);
  outPose.target.set(0, 0, 0);
  outPose.up.set(0, 1, 0);
  outPose.fov = 48 + recoil * 4.0;
  return outPose;
}

/**
 * 3. GATHER Camera: Dynamic focus compression during collapse settling into base framing
 */
export function calculateGatherCameraPose(gatherProgress: number, outPose: CameraPose): CameraPose {
  // Momentum bounce during vortex implosion
  const p = gatherProgress;
  const momentum = Math.sin(p * Math.PI * 1.5) * Math.exp(-p * 3.0);
  const zoomOffset = momentum * 0.25;

  outPose.position.set(0, 0, 2.5 - zoomOffset);
  outPose.target.set(0, 0, 0);
  outPose.up.set(0, 1, 0);
  outPose.fov = 48 - zoomOffset * 5.0;
  return outPose;
}

/**
 * 4. DEPTH Camera: Interactive 3D parallax tilt & shift responsive to pointer and gyro
 */
export function calculateDepthParallaxPose(
  parallax: THREE.Vector2,
  gyroPitch: number,
  gyroRoll: number,
  depthScale: number,
  outPose: CameraPose
): CameraPose {
  // Combine smoothed pointer parallax [-1..1] with gyro orientation (radians)
  const angleX = parallax.x * 0.38 + gyroRoll * 0.35;
  const angleY = -parallax.y * 0.28 + gyroPitch * 0.3;

  const baseDist = 2.5;
  const cosY = Math.cos(angleY);

  const posX = Math.sin(angleX) * cosY * baseDist;
  const posY = Math.sin(angleY) * baseDist;
  const posZ = Math.cos(angleX) * cosY * baseDist;

  outPose.position.set(posX, posY, posZ);
  outPose.target.set(0, 0, (depthScale - 1.0) * 0.05);
  outPose.up.set(0, 1, 0);
  outPose.fov = 48;
  return outPose;
}

/**
 * 5. TRAVEL Camera: Cinematic dolly slowly moving through particle depth planes
 */
export function calculateTravelCameraPose(
  time: number,
  travelProgress: number,
  outPose: CameraPose
): CameraPose {
  // Dolly along Z: cycles continuously through the particle volume
  const zDolly = 2.4 - (travelProgress % 1.0) * 1.8;

  // Gentle banking and swaying like flying through a constellation
  const swayX = Math.sin(time * 0.4) * 0.12;
  const swayY = Math.cos(time * 0.35) * 0.08;
  const bankRoll = -Math.sin(time * 0.4) * 0.05;

  outPose.position.set(swayX, swayY, zDolly);
  outPose.target.set(swayX * 0.5, swayY * 0.5, zDolly - 2.5);
  outPose.up.set(bankRoll, 1.0 - Math.abs(bankRoll) * 0.5, 0).normalize();
  outPose.fov = 52;
  return outPose;
}

/**
 * 6. SWARM Camera: Orbital swirling around depth focal points
 */
export function calculateSwarmCameraPose(time: number, outPose: CameraPose): CameraPose {
  const orbitAngle = time * 0.28;
  const radius = 2.45 + Math.sin(time * 0.2) * 0.15;

  const posX = Math.sin(orbitAngle) * 0.55;
  const posY = Math.cos(time * 0.22) * 0.22;
  const posZ = Math.cos(orbitAngle) * radius;

  // Camera subtly tracks the swarm center
  const targetX = Math.sin(time * 0.3) * 0.12;
  const targetY = Math.cos(time * 0.35) * 0.08;
  const targetZ = Math.sin(time * 0.25) * 0.1;

  outPose.position.set(posX, posY, posZ);
  outPose.target.set(targetX, targetY, targetZ);
  outPose.up.set(0, 1, 0);
  outPose.fov = 50;
  return outPose;
}

/**
 * 7. MELT Camera: Slow upward framing offset counteracting downward drip
 */
export function calculateMeltCameraPose(
  time: number,
  meltProgress: number,
  outPose: CameraPose
): CameraPose {
  const elevateY = meltProgress * 0.15;
  const subtleSway = Math.sin(time * 0.3) * 0.04;

  outPose.position.set(subtleSway, elevateY, 2.5);
  outPose.target.set(0, -meltProgress * 0.1, 0);
  outPose.up.set(0, 1, 0);
  outPose.fov = 48;
  return outPose;
}

/**
 * Zero-allocation camera pose interpolation for smooth mode transitions
 */
export function blendCameraPoses(
  poseA: CameraPose,
  poseB: CameraPose,
  t: number,
  outPose: CameraPose
): CameraPose {
  // Cubic smoothstep easing
  const ease = t * t * (3 - 2 * t);

  outPose.position.lerpVectors(poseA.position, poseB.position, ease);
  outPose.target.lerpVectors(poseA.target, poseB.target, ease);
  outPose.up.lerpVectors(poseA.up, poseB.up, ease).normalize();
  outPose.fov = THREE.MathUtils.lerp(poseA.fov, poseB.fov, ease);

  return outPose;
}

