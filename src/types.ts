/**
 * Shared Type Definitions for Drift - Browser Generative Art Tool
 */

export interface DepthResult {
  width: number;
  height: number;
  /** Normalized depth values in range [0.0, 1.0], Float32Array of length width * height */
  data: Float32Array;
  /** Active execution provider used to compute this depth map */
  provider?: 'webgpu' | 'wasm' | 'heuristic';
  /** High-level pipeline classification */
  source?: 'model' | 'heuristic';
}

export type ModeName = 'DRIFT' | 'SPLASH' | 'GATHER' | 'DEPTH' | 'TRAVEL' | 'SWARM' | 'MELT';

export type OverlayName = 'LINKS' | 'TRACKERS' | 'SCAN' | 'TRAILS' | 'MARKS' | 'DRAW';

export type ColorMode = 'TRUE' | 'NEGATIVE' | 'ON_WHITE';

export interface OverlaySettings {
  /** Active overlays toggled on/off */
  active: Record<OverlayName, boolean>;
  /** Line weight for links, marks, trackers, scan (e.g. 0.5 to 4.0) */
  lineWeight: number;
  /** Tracker density: 0.0 (SPARSE) to 1.0 (DENSE) */
  trackerDensity: number;
  /** Link distance threshold in normalized canvas space (0.01 to 0.15) */
  linkDistanceThreshold: number;
  /** Scan plane animation speed */
  scanSpeed: number;
  /** Trails persistence / alpha fade factor (0.05 to 0.5) */
  trailFade: number;
}

export interface ParticleSettings {
  /** Target particle count between 50,000 and 200,000 (default: 200,000) */
  particleCount: number;
  /** Point rendering size in physical pixels (default: 1.3) */
  pointSize: number;
  /** Max depth extrusion along Z axis (default: 0.3) */
  depthScale: number;
  /** Turbulence / noise animation speed */
  noiseSpeed: number;
  /** Noise spatial frequency */
  noiseFrequency: number;
  /** Noise displacement amplitude */
  noiseStrength: number;
  /** Scatter impulse strength for SPLASH mode */
  splashStrength: number;
  /** Current active motion mode */
  mode: ModeName;
  /** Current color rendering palette mode */
  colorMode: ColorMode;
  /** Overlays configuration */
  overlays: OverlaySettings;
  /** Whether to dynamically adapt particle count to maintain 60 FPS */
  adaptiveFPS: boolean;
  /** Debug mode flag */
  debug?: boolean;
}

export interface TrackerPoint {
  id: number;
  /** Normalized screen space coordinate [0..1] */
  x: number;
  y: number;
  /** Depth value [0..1] */
  z: number;
  /** Luminance or contrast intensity */
  intensity: number;
  /** Optional descriptive tag or index label */
  label: string;
  /** Base 3D position in world coordinates before displacement */
  baseX?: number;
  baseY?: number;
  baseZ?: number;
  rawDepth?: number;
  seed?: number;
  salience?: number;
}

export interface EngineRenderState {
  time: number;
  deltaTime: number;
  width: number;
  height: number;
  dpr: number;
  fps: number;
  particleCount: number;
  activeMode: ModeName;
  colorMode: ColorMode;
  /** Pointer position in canvas space [0..width, 0..height] */
  pointer: { x: number; y: number; isDown: boolean; vx: number; vy: number };
  /** Camera projection and view matrix (4x4 Float32Array or array) */
  viewMatrix: Float32Array;
  projectionMatrix: Float32Array;
  /** Combined view-projection matrix (4x4 Float32Array) */
  viewProjectionMatrix?: Float32Array;
  /** Camera position in 3D world space */
  cameraPosition: [number, number, number];
  /** Sampled salient points for overlays (trackers, markers, links) in normalized [0..1] canvas coordinates */
  trackers: TrackerPoint[];
  /** Motion and simulation parameters for overlay synchronization */
  depthScale?: number;
  noiseSpeed?: number;
  noiseFrequency?: number;
  noiseStrength?: number;
  splashStrength?: number;
  orientation?: [number, number];
  pointerWorld?: [number, number];
  pointerRadius?: number;
  impulseCenter?: [number, number];
  impulseStrength?: number;
  prevMode?: ModeName;
  modeTransition?: number;
}

export interface UserDrawingPoint {
  x: number;
  y: number;
  time: number;
}

export interface DepthProgressEvent {
  stage: 'downloading' | 'compiling' | 'inferring' | 'ready';
  progress: number; // 0..100
  message?: string;
}

export interface DepthWorkerRequest {
  type: 'INIT' | 'ESTIMATE';
  id: string;
  imageBitmap?: ImageBitmap;
  modelUrl?: string;
  options?: {
    preferWebGPU?: boolean;
    maxDimension?: number;
  };
}

export interface DepthWorkerResponse {
  type: 'INIT_PROGRESS' | 'INIT_COMPLETE' | 'ESTIMATE_RESULT' | 'ERROR';
  id: string;
  result?: DepthResult;
  progress?: DepthProgressEvent;
  error?: string;
}

/**
 * Interface for Depth Estimation Module (/src/depth/)
 */
export interface DepthEstimator {
  init(onProgress?: (progress: DepthProgressEvent) => void): Promise<void>;
  estimateDepth(
    source: ImageBitmap | HTMLImageElement | HTMLCanvasElement | ImageData,
    onProgress?: (progress: DepthProgressEvent) => void
  ): Promise<DepthResult>;
  isReady(): boolean;
  dispose(): void;
}

/**
 * Interface for Particle Engine (/src/engine/)
 */
export interface ParticleEngine {
  readonly canvas: HTMLCanvasElement;
  setImage(
    pixels: HTMLCanvasElement | ImageBitmap | ImageData,
    depth: DepthResult,
    options?: { count?: number; targetCount?: number } | number
  ): void;
  setSettings(settings: Partial<ParticleSettings>): void;
  getSettings(): ParticleSettings;
  setMode(mode: ModeName, transitionDurationMs?: number): void;
  setColorMode(colorMode: ColorMode): void;
  setPointer(x: number, y: number, isDown: boolean): void;
  setOrientation(pitch: number, roll: number): void;
  addDrawImpulse(points: UserDrawingPoint[]): void;
  resize(width: number, height: number, dpr?: number): void;
  render(t?: number): EngineRenderState;
  getRenderState(): EngineRenderState;
  setDebug?(debug: boolean): void;
  dispose(): void;
}

/**
 * Interface for Overlay Layer (/src/overlays/)
 */
export interface OverlayRenderer {
  readonly canvas: HTMLCanvasElement;
  resize(width: number, height: number, dpr?: number): void;
  render(renderState: EngineRenderState, settings: OverlaySettings): void;
  addDrawPoint(x: number, y: number): void;
  clearDrawPoints(): void;
  getDrawPoints(): UserDrawingPoint[];
  dispose(): void;
}

/**
 * Image Item metadata handled by UI
 */
export interface ImageItem {
  id: string;
  fileName: string;
  fileSize: number;
  imageBitmap: ImageBitmap;
  previewUrl: string;
  depthResult?: DepthResult;
  status: 'pending' | 'processing' | 'ready' | 'error';
  errorMessage?: string;
}

/**
 * Top level App State
 */
export interface AppState {
  images: ImageItem[];
  currentIndex: number;
  settings: ParticleSettings;
  isLoading: boolean;
  loadingMessage: string;
  loadingProgress: number;
  error: string | null;
  drawerOpen: boolean;
  creditsOpen: boolean;
}
