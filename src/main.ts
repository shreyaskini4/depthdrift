/**
 * Drift - Generative Particle Depth Canvas
 * Application Entry Point
 */
import './style.css';
import type { AppState, ParticleSettings } from './types';

export const DEFAULT_SETTINGS: ParticleSettings = {
  particleCount: 120_000,
  pointSize: 2.0,
  depthScale: 1.0,
  noiseSpeed: 0.6,
  noiseFrequency: 1.2,
  noiseStrength: 0.8,
  splashStrength: 1.5,
  mode: 'DRIFT',
  colorMode: 'TRUE',
  overlays: {
    active: {
      LINKS: false,
      TRACKERS: true,
      SCAN: false,
      TRAILS: false,
      MARKS: true,
      DRAW: false,
    },
    lineWeight: 1.0,
    trackerDensity: 0.5,
    linkDistanceThreshold: 0.05,
    scanSpeed: 1.0,
    trailFade: 0.15,
  },
  adaptiveFPS: true,
};

export const initialState: AppState = {
  images: [],
  currentIndex: -1,
  settings: DEFAULT_SETTINGS,
  isLoading: false,
  loadingMessage: '',
  loadingProgress: 0,
  error: null,
  drawerOpen: false,
  creditsOpen: false,
};

console.log('[Drift] Initialized generative particle depth canvas scaffold.');
