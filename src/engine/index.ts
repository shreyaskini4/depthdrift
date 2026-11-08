/**
 * Drift 3D Particle Engine Module
 */

import type { ParticleEngine, ParticleSettings } from '../types';
import { ThreeParticleEngine } from './engine';

export { COLOR_MODE_INDICES, MODE_INDICES, ThreeParticleEngine } from './engine';
export { FPSRegulator } from './fpsRegulator';
export {
  createDefaultParticles,
  extractImageData,
  MAX_PARTICLE_CAPACITY,
  sampleDepth,
  sampleImageAndDepth,
  shuffleParticles,
  type BaseTracker,
  type SampledParticles,
  type SampleOptions,
} from './sampling';
export { PARTICLE_FRAGMENT_SHADER, PARTICLE_VERTEX_SHADER } from './shaders';

/**
 * Factory function to create and initialize a 3D Particle Engine instance.
 */
export function createParticleEngine(
  canvas?: HTMLCanvasElement,
  initialSettings?: Partial<ParticleSettings>
): ParticleEngine {
  return new ThreeParticleEngine(canvas, initialSettings);
}
