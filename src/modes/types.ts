import * as THREE from 'three';
import type { ModeName, ColorMode, ParticleSettings } from '../types';

export { ModeName, ColorMode, ParticleSettings };

export const MODE_INDICES: Record<ModeName, number> = {
  DRIFT: 0,
  SPLASH: 1,
  GATHER: 2,
  DEPTH: 3,
  TRAVEL: 4,
  SWARM: 5,
  MELT: 6,
};

export const COLOR_MODE_INDICES: Record<ColorMode, number> = {
  TRUE: 0,
  NEGATIVE: 1,
  ON_WHITE: 2,
};

export const MODE_NAMES: readonly ModeName[] = [
  'DRIFT',
  'SPLASH',
  'GATHER',
  'DEPTH',
  'TRAVEL',
  'SWARM',
  'MELT',
] as const;

export interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
  fov: number;
}

export interface TransitionState {
  fromMode: ModeName;
  toMode: ModeName;
  progress: number; // 0.0 to 1.0 (eased)
  rawProgress: number; // 0.0 to 1.0 (linear)
  duration: number; // in seconds
  elapsed: number; // in seconds
  isTransitioning: boolean;
}

export interface MotionInteractionState {
  pointer: THREE.Vector2; // Normalized screen space [-1, 1]
  targetPointer: THREE.Vector2;
  pointerDown: boolean;
  pointerVelocity: THREE.Vector2;
  pitch: number; // gyro pitch in radians
  roll: number; // gyro roll in radians
  splashTime: number; // time since last splash impulse in seconds
  splashOrigin: THREE.Vector2;
}

export interface ModeUniforms {
  uTime: { value: number };
  uDeltaTime: { value: number };
  uCurrentMode: { value: number };
  uPrevMode: { value: number };
  uTransition: { value: number };
  uPointer: { value: THREE.Vector2 };
  uPointerDown: { value: number };
  uPointerVelocity: { value: THREE.Vector2 };
  uSplashStrength: { value: number };
  uSplashTime: { value: number };
  uSplashOrigin: { value: THREE.Vector2 };
  uDepthScale: { value: number };
  uNoiseSpeed: { value: number };
  uNoiseFrequency: { value: number };
  uNoiseStrength: { value: number };
  uParallaxOffset: { value: THREE.Vector2 };
  uTravelProgress: { value: number };
  uTravelSpeed: { value: number };
  uGatherProgress: { value: number };
  uMeltProgress: { value: number };
  uColorMode: { value: number };
}

export interface ModeManagerOptions {
  initialMode?: ModeName;
  initialColorMode?: ColorMode;
  transitionDurationMs?: number; // Default 800ms
  pointerSmoothing?: number; // Lerp factor, default 0.15
  gyroSensitivity?: number; // Default 0.8
}
