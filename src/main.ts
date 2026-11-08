/**
 * Drift - Generative Particle Depth Canvas
 * Main Application Orchestrator and Render Loop
 */

import './style.css';
import { createDepthEstimator, createSyntheticDepth } from './depth';
import { createParticleEngine } from './engine';
import { exportSnapshot, VideoRecorder } from './export';
import { OverlayRendererImpl } from './overlays';
import type {
  AppState,
  ColorMode,
  DepthProgressEvent,
  ImageItem,
  ModeName,
  OverlayName,
  ParticleSettings,
} from './types';
import { UIManager } from './ui';

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

const MODE_MAP: Record<string, ModeName> = {
  '1': 'DRIFT',
  '2': 'SPLASH',
  '3': 'GATHER',
  '4': 'DEPTH',
  '5': 'TRAVEL',
  '6': 'SWARM',
  '7': 'MELT',
};

function disposeImageItem(item: ImageItem): void {
  try {
    if (item.imageBitmap && typeof item.imageBitmap.close === 'function') {
      item.imageBitmap.close();
    }
  } catch {
    // ignore
  }
  try {
    if (item.previewUrl && item.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(item.previewUrl);
    }
  } catch {
    // ignore
  }
}

class DriftApp {
  private state: AppState = {
    images: [],
    currentIndex: -1,
    settings: { ...DEFAULT_SETTINGS, overlays: { ...DEFAULT_SETTINGS.overlays, active: { ...DEFAULT_SETTINGS.overlays.active } } },
    isLoading: false,
    loadingMessage: '',
    loadingProgress: 0,
    error: null,
    drawerOpen: false,
    creditsOpen: false,
  };

  private particleCanvas: HTMLCanvasElement;
  private overlayCanvas: HTMLCanvasElement;

  private depthEstimator = createDepthEstimator();
  private particleEngine = createParticleEngine();
  private overlayRenderer = new OverlayRendererImpl();
  private videoRecorder!: VideoRecorder;
  private uiManager!: UIManager;

  private isPointerDown: boolean = false;
  private animationFrameId: number | null = null;
  private useProceduralFallbackOnly: boolean = false;

  constructor() {
    this.particleCanvas = document.getElementById('particle-canvas') as HTMLCanvasElement;
    this.overlayCanvas = document.getElementById('overlay-canvas') as HTMLCanvasElement;

    if (!this.particleCanvas || !this.overlayCanvas) {
      throw new Error('[Drift] Canvas elements not found in DOM.');
    }

    // Replace default canvas instances with the DOM elements
    this.particleEngine = createParticleEngine(this.particleCanvas, this.state.settings);
    this.overlayRenderer = new OverlayRendererImpl(this.overlayCanvas);

    // Initialize Video Recorder
    this.videoRecorder = new VideoRecorder({
      particleCanvas: this.particleCanvas,
      overlayCanvas: this.overlayCanvas,
      getColorMode: () => this.state.settings.colorMode,
      fps: 60,
      maxDurationSeconds: 60,
      onStatusChange: (status) => {
        if (status === 'recording') {
          this.uiManager.setRecordingState(true, '00:00');
        } else if (status === 'processing') {
          this.uiManager.setRecordingState(true, 'SAVING');
        } else {
          this.uiManager.setRecordingState(false);
        }
      },
      onTimeUpdate: (_sec, formatted) => {
        this.uiManager.setRecordingState(true, formatted);
      },
      onError: (err) => {
        console.error('[Drift Video] Recording error:', err);
        this.uiManager.setRecordingState(false);
      },
    });

    // Initialize UI Manager
    this.uiManager = new UIManager(this.state, {
      onModeChange: (mode) => this.setMode(mode),
      onColorModeChange: (colorMode) => this.setColorMode(colorMode),
      onOverlayToggle: (overlay) => this.toggleOverlay(overlay),
      onSettingsChange: (settings) => this.updateSettings(settings),
      onImagesAdded: (files) => this.addImages(files),
      onSelectImage: (index) => this.selectImage(index),
      onNextImage: () => this.nextImage(),
      onPrevImage: () => this.prevImage(),
      onExport: () => this.exportSnapshot(),
      onToggleRecordVideo: () => this.toggleRecordVideo(),
      onResetDefaults: () => this.resetSettings(),
      onRetryModel: () => this.initDepthModel(),
      onUseProceduralFallback: () => this.enableProceduralFallback(),
    });

    this.setupWindowEvents();
    this.setupPointerEvents();
    this.setupOrientationEvents();
    this.setupKeyboardEvents();

    this.handleResize();
    this.startAnimationLoop();

    // Start background model download & initialization
    this.initDepthModel();
  }

  /**
   * Initializes the Depth Estimator Web Worker and model weights.
   */
  private async initDepthModel(): Promise<void> {
    this.useProceduralFallbackOnly = false;
    this.state.error = null;
    this.state.isLoading = true;
    this.state.loadingMessage = 'Downloading Depth Anything V2 Small...';
    this.state.loadingProgress = 10;
    this.uiManager.update({
      isLoading: true,
      error: null,
      loadingProgress: 10,
      loadingMessage: 'Downloading Depth Anything V2 Small (q8)...',
    });

    try {
      await this.depthEstimator.init((prog: DepthProgressEvent) => {
        this.state.loadingProgress = prog.progress;
        this.state.loadingMessage = prog.message || `${prog.stage}...`;
        this.uiManager.showLoading(prog.stage, prog.progress, prog.message);
      });

      this.state.isLoading = false;
      this.uiManager.hideLoading();
    } catch (err: unknown) {
      console.warn('[Drift] Depth model init failed. Procedural fallback available:', err);
      const msg = err instanceof Error ? err.message : 'Failed to download or compile ONNX depth model.';
      this.state.isLoading = false;
      this.state.error = msg;
      this.uiManager.showError(msg);
    }
  }

  /**
   * Enables immediate local procedural depth fallback.
   */
  private enableProceduralFallback(): void {
    this.useProceduralFallbackOnly = true;
    this.state.error = null;
    this.state.isLoading = false;
    this.uiManager.hideLoading();

    // If an image was pending, recompute depth now
    if (this.state.currentIndex >= 0 && this.state.currentIndex < this.state.images.length) {
      const cur = this.state.images[this.state.currentIndex];
      if (!cur.depthResult) {
        this.processImageDepth(cur);
      }
    }
  }

  /**
   * Ingests up to 4 image files and enqueues them for depth processing.
   */
  private async addImages(files: File[]): Promise<void> {
    if (!files || files.length === 0) return;

    // Limit to max 4 images total
    const remainingSlots = Math.max(0, 4 - this.state.images.length);
    const toAdd = files.slice(0, remainingSlots > 0 ? remainingSlots : 4);

    if (toAdd.length === 0) {
      // If already at 4, replace from beginning and free memory
      toAdd.push(...files.slice(0, 4));
      this.state.images.forEach((img) => disposeImageItem(img));
      this.state.images = [];
      this.state.currentIndex = -1;
    }

    const startIndex = this.state.images.length;

    for (let i = 0; i < toAdd.length; i++) {
      const file = toAdd[i];
      const previewUrl = URL.createObjectURL(file);
      let bitmap: ImageBitmap;

      try {
        bitmap = await createImageBitmap(file);
      } catch (err) {
        console.error('[Drift] Could not create ImageBitmap from file:', file.name, err);
        continue;
      }

      const item: ImageItem = {
        id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        fileName: file.name,
        fileSize: file.size,
        imageBitmap: bitmap,
        previewUrl,
        status: 'pending',
      };

      this.state.images.push(item);
    }

    if (this.state.images.length > 0 && this.state.currentIndex === -1) {
      this.state.currentIndex = startIndex;
    }

    this.uiManager.updateImages(this.state.images, this.state.currentIndex);

    // Process depth for added images
    for (let idx = startIndex; idx < this.state.images.length; idx++) {
      await this.processImageDepth(this.state.images[idx]);
    }
  }

  /**
   * Calculates depth for an image item and applies it if it is active.
   */
  private async processImageDepth(item: ImageItem): Promise<void> {
    item.status = 'processing';
    this.state.isLoading = true;
    this.state.loadingMessage = `Analyzing depth: ${item.fileName}`;
    this.state.loadingProgress = 30;
    this.uiManager.update({
      isLoading: true,
      loadingProgress: 30,
      loadingMessage: `Analyzing depth geometry for ${item.fileName}...`,
    });

    try {
      let depthResult;

      if (this.useProceduralFallbackOnly) {
        // Fast procedural heuristic depth
        const offCanvas = document.createElement('canvas');
        offCanvas.width = item.imageBitmap.width;
        offCanvas.height = item.imageBitmap.height;
        const ctx = offCanvas.getContext('2d');
        let imgData: ImageData | undefined;
        if (ctx) {
          ctx.drawImage(item.imageBitmap, 0, 0);
          imgData = ctx.getImageData(0, 0, offCanvas.width, offCanvas.height);
        }
        depthResult = createSyntheticDepth(item.imageBitmap.width, item.imageBitmap.height, imgData);
      } else {
        // Run neural depth estimation
        depthResult = await this.depthEstimator.estimateDepth(
          item.imageBitmap,
          (prog: DepthProgressEvent) => {
            this.state.loadingProgress = prog.progress;
            this.state.loadingMessage = prog.message || 'Estimating depth...';
            this.uiManager.showLoading('inferring', prog.progress, prog.message);
          }
        );
      }

      item.depthResult = depthResult;
      item.status = 'ready';

      // If this item is currently selected, apply to engine
      const current = this.state.images[this.state.currentIndex];
      if (current && current.id === item.id) {
        this.particleEngine.setImage(item.imageBitmap, depthResult);
      }
    } catch (err) {
      console.warn('[Drift] Depth estimation failed, using procedural fallback:', err);
      // Heuristic fallback so image is always rendered
      const fallback = createSyntheticDepth(item.imageBitmap.width, item.imageBitmap.height);
      item.depthResult = fallback;
      item.status = 'ready';

      const current = this.state.images[this.state.currentIndex];
      if (current && current.id === item.id) {
        this.particleEngine.setImage(item.imageBitmap, fallback);
      }
    } finally {
      this.state.isLoading = false;
      this.uiManager.hideLoading();
      this.uiManager.updateImages(this.state.images, this.state.currentIndex);
    }
  }

  /**
   * Jump to selected image index.
   */
  private selectImage(index: number): void {
    if (index < 0 || index >= this.state.images.length || index === this.state.currentIndex) return;
    this.state.currentIndex = index;
    const item = this.state.images[index];

    if (item.depthResult) {
      this.particleEngine.setImage(item.imageBitmap, item.depthResult);
    }

    this.uiManager.updateImages(this.state.images, index);
  }

  /**
   * Cycle to next loaded image with smooth particle morphing.
   */
  public nextImage(): void {
    if (this.state.images.length <= 1) return;
    const nextIdx = (this.state.currentIndex + 1) % this.state.images.length;
    this.selectImage(nextIdx);
  }

  /**
   * Cycle to previous loaded image.
   */
  public prevImage(): void {
    if (this.state.images.length <= 1) return;
    const prevIdx = (this.state.currentIndex - 1 + this.state.images.length) % this.state.images.length;
    this.selectImage(prevIdx);
  }

  /**
   * Changes motion mode.
   */
  public setMode(mode: ModeName): void {
    this.state.settings.mode = mode;
    this.particleEngine.setMode(mode, 500);
    this.uiManager.update({ settings: this.state.settings });
  }

  /**
   * Changes color rendering palette.
   */
  public setColorMode(colorMode: ColorMode): void {
    this.state.settings.colorMode = colorMode;
    this.particleEngine.setColorMode(colorMode);
    this.uiManager.update({ settings: this.state.settings });
  }

  /**
   * Toggles an overlay layer on or off.
   */
  public toggleOverlay(overlay: OverlayName): void {
    const cur = !!this.state.settings.overlays.active[overlay];
    this.state.settings.overlays.active[overlay] = !cur;

    if (overlay === 'DRAW' && !this.state.settings.overlays.active.DRAW) {
      this.overlayRenderer.clearDrawPoints();
    }

    this.uiManager.update({ settings: this.state.settings });
  }

  /**
   * Updates partial particle and overlay settings live.
   */
  public updateSettings(partial: Partial<ParticleSettings>): void {
    if (partial.overlays) {
      this.state.settings.overlays = {
        ...this.state.settings.overlays,
        ...partial.overlays,
        active: {
          ...this.state.settings.overlays.active,
          ...(partial.overlays.active || {}),
        },
      };
    }

    Object.assign(this.state.settings, partial);
    this.particleEngine.setSettings(this.state.settings);
    this.uiManager.update({ settings: this.state.settings });
  }

  /**
   * Resets simulation settings to default values.
   */
  public resetSettings(): void {
    this.state.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    this.particleEngine.setSettings(this.state.settings);
    this.particleEngine.setMode(this.state.settings.mode);
    this.particleEngine.setColorMode(this.state.settings.colorMode);
    this.uiManager.update({ settings: this.state.settings });
  }

  /**
   * Exports a combined high-resolution PNG snapshot of the 3D particles and 2D HUD.
   */
  public async exportSnapshot(): Promise<void> {
    try {
      await exportSnapshot({
        particleCanvas: this.particleCanvas,
        overlayCanvas: this.overlayCanvas,
        colorMode: this.state.settings.colorMode,
      });
    } catch (err) {
      console.error('[Drift] Failed to export snapshot:', err);
    }
  }

  /**
   * Toggles canvas stream video recording on/off.
   */
  public toggleRecordVideo(): void {
    if (this.videoRecorder.isRecording()) {
      this.videoRecorder.stop();
    } else {
      this.videoRecorder.start();
    }
  }

  private setupPointerEvents(): void {
    const onPointerMove = (e: PointerEvent) => {
      this.particleEngine.setPointer(e.clientX, e.clientY, this.isPointerDown);

      if (this.isPointerDown && this.state.settings.overlays.active.DRAW) {
        this.overlayRenderer.addDrawPoint(e.clientX, e.clientY);
        this.particleEngine.addDrawImpulse(this.overlayRenderer.getDrawPoints());
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      // Don't interact if clicked on UI layer elements
      const target = e.target as HTMLElement;
      if (target && target.closest('.ui-layer') && !target.classList.contains('canvas-layer')) {
        return;
      }

      this.isPointerDown = true;
      this.particleEngine.setPointer(e.clientX, e.clientY, true);

      if (this.state.settings.overlays.active.DRAW) {
        this.overlayRenderer.addDrawPoint(e.clientX, e.clientY);
        this.particleEngine.addDrawImpulse(this.overlayRenderer.getDrawPoints());
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      this.isPointerDown = false;
      this.particleEngine.setPointer(e.clientX, e.clientY, false);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    // Prevent pull-to-refresh on mobile canvas
    this.particleCanvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    this.particleCanvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  private setupOrientationEvents(): void {
    if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      window.addEventListener(
        'deviceorientation',
        (e: DeviceOrientationEvent) => {
          if (e.beta !== null && e.gamma !== null) {
            // Beta: pitch [-180, 180], Gamma: roll [-90, 90]
            const pitch = (e.beta / 180) * Math.PI * 0.5;
            const roll = (e.gamma / 90) * Math.PI * 0.5;
            this.particleEngine.setOrientation(pitch, roll);
          }
        },
        { passive: true }
      );
    }
  }

  private setupKeyboardEvents(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      // Ignore when focused in text inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Space: Cycle to next image
      if (e.code === 'Space') {
        e.preventDefault();
        this.nextImage();
        return;
      }

      // 1-7: Mode shortcuts
      if (MODE_MAP[e.key]) {
        e.preventDefault();
        this.setMode(MODE_MAP[e.key]);
        return;
      }

      // S: Export High-Res Snapshot
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        this.exportSnapshot();
        return;
      }

      // R: Record Video Loop
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        this.toggleRecordVideo();
        return;
      }

      // O: Toggle Settings Drawer
      if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        this.uiManager.toggleSettings();
        return;
      }

      // C: Toggle Credits Modal
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        this.uiManager.toggleCredits();
        return;
      }

      // Escape: Close any open modal or drawer
      if (e.key === 'Escape') {
        this.uiManager.closeAllModals();
        return;
      }
    });
  }

  private setupWindowEvents(): void {
    window.addEventListener('resize', () => this.handleResize());
  }

  private handleResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.0);

    this.particleEngine.resize(width, height, dpr);
    this.overlayRenderer.resize(width, height, dpr);
  }

  private startAnimationLoop(): void {
    const loop = (timestamp: number) => {
      this.animationFrameId = requestAnimationFrame(loop);

      // 1. Render 3D particle state
      const renderState = this.particleEngine.render(timestamp);

      // 2. Render 2D overlays synchronized with particle camera and tracker points
      this.overlayRenderer.render(renderState, this.state.settings.overlays);

      // 3. Composite video stream frame if currently recording
      if (this.videoRecorder && this.videoRecorder.isRecording()) {
        this.videoRecorder.compositeFrame();
      }
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  public dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.videoRecorder.dispose();
    this.particleEngine.dispose();
    this.overlayRenderer.dispose();
    this.depthEstimator.dispose();
    this.state.images.forEach((img) => disposeImageItem(img));
  }
}

// Instantiate Drift App on DOM Ready
let appInstance: DriftApp | null = null;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    appInstance = new DriftApp();
  });
} else {
  appInstance = new DriftApp();
}

export { DriftApp, appInstance };
