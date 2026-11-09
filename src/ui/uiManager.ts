/**
 * UIManager for Drift
 * Coordinates all UI components and bridges interactions with the main application loop.
 */

import type {
  AppState,
  ColorMode,
  DepthResult,
  ImageItem,
  ModeName,
  OverlayName,
  ParticleSettings,
} from '@/types';
import { CreditsModal } from './creditsModal';
import { DepthDebugModal } from './depthDebugModal';
import { generateAllDemoArt } from './demoArt';
import { FloatingControls } from './floatingControls';
import { LoadingOverlay } from './loadingOverlay';
import { SettingsDrawer } from './settingsDrawer';
import { TitleScreen } from './titleScreen';
import { TopBar } from './topBar';
import { TelemetryBadge } from './telemetryBadge';

export interface UIManagerCallbacks {
  onModeChange: (mode: ModeName) => void;
  onColorModeChange: (colorMode: ColorMode) => void;
  onOverlayToggle: (overlay: OverlayName) => void;
  onSettingsChange: (settings: Partial<ParticleSettings>) => void;
  onImagesAdded: (files: File[]) => void;
  onSelectImage: (index: number) => void;
  onNextImage: () => void;
  onPrevImage: () => void;
  onExport: () => void;
  onToggleRecordVideo: () => void;
  onResetDefaults: () => void;
  onRetryModel: () => void;
  onUseProceduralFallback: () => void;
  onToggleDepthView?: () => void;
  onToggleHandTool?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  onDriftChange?: (drift: Partial<{ pos: number; angleDeg: number; feather: number }>) => void;
}

export class UIManager {
  private titleScreen: TitleScreen;
  private topBar: TopBar;
  private floatingControls: FloatingControls;
  private settingsDrawer: SettingsDrawer;
  private loadingOverlay: LoadingOverlay;
  private creditsModal: CreditsModal;
  private depthDebugModal: DepthDebugModal;
  private telemetryBadge: TelemetryBadge;

  private state: AppState;
  private callbacks: UIManagerCallbacks;

  private inactivityTimer: number | null = null;
  private isChromeHidden: boolean = false;
  private readonly autoHideDelayMs: number = 3000;
  private activityListeners: Array<() => void> = [];

  constructor(initialState: AppState, callbacks: UIManagerCallbacks) {
    this.state = initialState;
    this.callbacks = callbacks;

    const header = document.getElementById('app-header') || document.body;
    const main = document.getElementById('app-main') || document.body;
    const drawer = document.getElementById('app-drawer') || document.body;
    const footer = document.getElementById('app-footer') || document.body;
    const uiLayer = document.getElementById('ui-layer') || document.body;

    // 1. Top Bar
    this.topBar = new TopBar(header, {
      onNext: () => this.callbacks.onNextImage(),
      onPrev: () => this.callbacks.onPrevImage(),
      onSelect: (idx) => this.callbacks.onSelectImage(idx),
      onAddImages: () => this.openAddImagesDialog(),
      onToggleDepthView: () => {
        if (this.callbacks.onToggleDepthView) {
          this.callbacks.onToggleDepthView();
        } else {
          this.toggleDepthDebug();
        }
      },
    });

    // 2. Title Screen & Drop Zone
    this.titleScreen = new TitleScreen(main, {
      onFilesSelected: (files) => {
        this.titleScreen.hide();
        this.callbacks.onImagesAdded(files);
      },
      onDemoArtRequested: async () => {
        this.titleScreen.hide();
        this.showLoading('inferring', 25, 'Generating artistic procedural demo canvases...');
        try {
          const files = await generateAllDemoArt();
          this.callbacks.onImagesAdded(files);
        } catch (err) {
          console.error('[UIManager] Failed to generate demo art:', err);
          this.showError('Could not generate demo artwork canvas.');
        }
      },
      onClose: () => {
        this.titleScreen.hide();
      },
    });

    // 3. Floating Bottom Controls
    this.floatingControls = new FloatingControls(footer, {
      onModeSelect: (mode) => this.callbacks.onModeChange(mode),
      onOverlayToggle: (overlay) => this.callbacks.onOverlayToggle(overlay),
      onColorModeSelect: (colorMode) => this.callbacks.onColorModeChange(colorMode),
      onOpenSettings: () => this.openSettings(),
      onOpenCredits: () => this.openCredits(),
      onExport: () => this.callbacks.onExport(),
      onToggleRecordVideo: () => this.callbacks.onToggleRecordVideo(),
      onToggleHandTool: () => this.callbacks.onToggleHandTool?.(),
      onZoomIn: () => this.callbacks.onZoomIn?.(),
      onZoomOut: () => this.callbacks.onZoomOut?.(),
      onZoomReset: () => this.callbacks.onZoomReset?.(),
      onDriftChange: (drift) => this.callbacks.onDriftChange?.(drift),
      onPopoverToggle: (isOpen) => {
        if (isOpen) {
          this.revealChrome();
        }
        this.resetActivityTimer();
      },
    });

    // 4. Settings Drawer
    this.settingsDrawer = new SettingsDrawer(drawer, this.state.settings, {
      onSettingsChange: (settings) => this.callbacks.onSettingsChange(settings),
      onResetDefaults: () => this.callbacks.onResetDefaults(),
      onClose: () => {
        this.state.drawerOpen = false;
      },
      onToggleDepthView: () => {
        if (this.callbacks.onToggleDepthView) {
          this.callbacks.onToggleDepthView();
        } else {
          this.toggleDepthDebug();
        }
      },
    });

    // 5. Loading & Error Overlay
    this.loadingOverlay = new LoadingOverlay(main, {
      onRetry: () => this.callbacks.onRetryModel(),
      onUseProceduralFallback: () => this.callbacks.onUseProceduralFallback(),
    });

    // 6. Credits Modal
    this.creditsModal = new CreditsModal(main, {
      onClose: () => {
        this.state.creditsOpen = false;
      },
    });

    // 7. Depth Map Inspector Modal
    this.depthDebugModal = new DepthDebugModal(main, {
      onClose: () => {
        // Closed
      },
    });

    // 8. Live Real-Time Telemetry Badge
    this.telemetryBadge = new TelemetryBadge(uiLayer);
    this.telemetryBadge.setDebug(!!this.state.settings.debug);

    // Initial state reflection
    this.update(initialState);

    // Setup Chrome Auto-Hide
    this.setupAutoHide();
  }

  private setupAutoHide(): void {
    const onActivity = () => {
      this.revealChrome();
    };

    window.addEventListener('mousemove', onActivity, { passive: true });
    window.addEventListener('pointermove', onActivity, { passive: true });
    window.addEventListener('touchstart', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity, { passive: true });

    this.activityListeners.push(() => {
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('pointermove', onActivity);
      window.removeEventListener('touchstart', onActivity);
      window.removeEventListener('keydown', onActivity);
    });

    this.resetActivityTimer();
  }

  public isAnyOverlayOrModalOpen(): boolean {
    if (this.floatingControls.getIsOverlaysPopoverOpen?.()) return true;
    if (this.settingsDrawer.getIsOpen()) return true;
    if (this.creditsModal.getIsOpen()) return true;
    if (this.depthDebugModal.getIsOpen()) return true;
    if (this.titleScreen.isOpen()) return true;
    if (this.state.isLoading) return true;
    if (typeof document !== 'undefined') {
      const activeDialog = document.querySelector(
        '.popover.open, [data-popover-open="true"], .drawer-backdrop.active, .credits-modal-backdrop.active, .depth-debug-backdrop.active'
      );
      if (activeDialog) return true;
    }
    return false;
  }

  public revealChrome(): void {
    if (this.isChromeHidden) {
      this.isChromeHidden = false;
      document.body.classList.remove('chrome-hidden');
    }
    this.resetActivityTimer();
  }

  public hideChrome(): void {
    // Guard: NEVER hide chrome while any modal, drawer, or popover is open
    if (this.isAnyOverlayOrModalOpen()) {
      return;
    }

    // Guard: do not hide if cursor is hovering over interactive chrome
    if (typeof document !== 'undefined') {
      const isHovering = document.querySelector(
        '.app-header:hover, .app-footer:hover, .floating-controls:hover, .top-bar:hover, .settings-drawer-panel:hover'
      );
      if (isHovering) {
        this.resetActivityTimer();
        return;
      }
    }

    this.isChromeHidden = true;
    document.body.classList.add('chrome-hidden');
  }

  public resetActivityTimer(): void {
    if (this.inactivityTimer !== null) {
      window.clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }

    if (this.isAnyOverlayOrModalOpen()) {
      if (this.isChromeHidden) {
        this.revealChrome();
      }
      return;
    }

    this.inactivityTimer = window.setTimeout(() => {
      this.hideChrome();
    }, this.autoHideDelayMs);
  }

  public openAddImagesDialog(): void {
    this.revealChrome();
    this.titleScreen.setHasExistingImages(this.state.images.length > 0);
    this.titleScreen.show();
  }

  public openSettings(): void {
    this.revealChrome();
    this.state.drawerOpen = true;
    this.settingsDrawer.open();
  }

  public closeSettings(): void {
    this.state.drawerOpen = false;
    this.settingsDrawer.close();
    this.resetActivityTimer();
  }

  public toggleSettings(): void {
    if (this.settingsDrawer.getIsOpen()) {
      this.closeSettings();
    } else {
      this.openSettings();
    }
  }

  public openCredits(): void {
    this.revealChrome();
    this.state.creditsOpen = true;
    this.creditsModal.open();
  }

  public closeCredits(): void {
    this.state.creditsOpen = false;
    this.creditsModal.close();
    this.resetActivityTimer();
  }

  public toggleCredits(): void {
    if (this.creditsModal.getIsOpen()) {
      this.closeCredits();
    } else {
      this.openCredits();
    }
  }

  public setRecordingState(isRecording: boolean, timeStr?: string): void {
    this.floatingControls.setRecordingState(isRecording, timeStr);
  }

  public openDepthDebug(depthResult?: DepthResult, fileName?: string): void {
    this.revealChrome();
    const cur = this.getCurrentImage();
    const dr = depthResult ?? cur?.depthResult;
    const fn = fileName ?? cur?.fileName;
    this.depthDebugModal.open(dr, fn);
  }

  public closeDepthDebug(): void {
    this.depthDebugModal.close();
    this.resetActivityTimer();
  }

  public toggleDepthDebug(depthResult?: DepthResult, fileName?: string): void {
    const cur = this.getCurrentImage();
    const dr = depthResult ?? cur?.depthResult;
    const fn = fileName ?? cur?.fileName;
    if (this.depthDebugModal.getIsOpen()) {
      this.depthDebugModal.close();
      this.resetActivityTimer();
    } else {
      this.revealChrome();
      this.depthDebugModal.open(dr, fn);
    }
  }

  public updateDepthDebug(depthResult?: DepthResult, fileName?: string): void {
    const cur = this.getCurrentImage();
    const dr = depthResult ?? cur?.depthResult;
    const fn = fileName ?? cur?.fileName;
    this.depthDebugModal.updateDepth(dr, fn);
  }

  public isDepthDebugOpen(): boolean {
    return this.depthDebugModal.getIsOpen();
  }

  public updateTelemetry(data: {
    fps: number;
    width: number;
    height: number;
    particleCount?: number;
    dpr?: number;
    zoom?: number;
    drift?: { pos: number; angleDeg: number; feather: number };
    yaw?: number;
    pitch?: number;
    panX?: number;
    panY?: number;
    pointerTarget?: string;
  }): void {
    this.telemetryBadge.update(data);
    if (data.dpr) {
      this.topBar.setDpr(data.dpr);
    }
    if (data.zoom !== undefined) {
      this.floatingControls.setZoom(data.zoom);
    }
    if (data.drift) {
      this.floatingControls.setDrift(data.drift);
    }
  }

  public setPipelineProvider(provider: string): void {
    this.topBar.setPipelineProvider(provider);
    this.telemetryBadge.setProvider(provider);
    this.settingsDrawer.setPipelineProvider(provider);
  }

  public setDepthMode(mode: 'MODEL' | 'HEURISTIC', provider?: string): void {
    this.topBar.setDepthMode(mode, provider);
    if (provider) {
      this.telemetryBadge.setProvider(provider);
    }
    this.settingsDrawer.setDepthMode(mode, provider);
  }

  private getCurrentImage(): ImageItem | undefined {
    if (this.state.currentIndex >= 0 && this.state.currentIndex < this.state.images.length) {
      return this.state.images[this.state.currentIndex];
    }
    return undefined;
  }

  public closeAllModals(): boolean {
    let closedAny = false;
    if (this.floatingControls.getIsOverlaysPopoverOpen()) {
      this.floatingControls.closeOverlaysPopover(true);
      closedAny = true;
    }
    if (this.depthDebugModal.getIsOpen()) {
      this.closeDepthDebug();
      closedAny = true;
    }
    if (this.creditsModal.getIsOpen()) {
      this.closeCredits();
      closedAny = true;
    }
    if (this.settingsDrawer.getIsOpen()) {
      this.closeSettings();
      closedAny = true;
    }
    if (this.titleScreen.isOpen() && this.state.images.length > 0) {
      this.titleScreen.hide();
      closedAny = true;
    }
    if (closedAny) {
      this.resetActivityTimer();
    }
    return closedAny;
  }

  public setHandToolActive(active: boolean): void {
    this.floatingControls.setHandToolActive(active);
  }

  public setZoom(zoom: number): void {
    this.floatingControls.setZoom(zoom);
  }

  public showLoading(stage: string, progress: number, message?: string): void {
    this.loadingOverlay.showProgress(stage, progress, message);
  }

  public showError(message: string): void {
    this.loadingOverlay.showError(message);
  }

  public hideLoading(): void {
    this.loadingOverlay.hide();
  }

  public update(newState: Partial<AppState>): void {
    Object.assign(this.state, newState);

    const hasImages = this.state.images.length > 0;
    this.titleScreen.setHasExistingImages(hasImages);

    // If there are no images loaded and no dialog open, keep title screen visible
    if (!hasImages) {
      this.titleScreen.show();
    }

    // Top Bar
    this.topBar.update(
      this.state.images,
      this.state.currentIndex,
      this.state.isLoading,
      this.state.loadingMessage
    );

    // Floating Controls
    this.floatingControls.update(
      this.state.settings.mode,
      this.state.settings.colorMode,
      this.state.settings.overlays
    );

    // Settings Drawer
    this.settingsDrawer.updateSettings(this.state.settings);

    // Telemetry Badge Debug Visibility
    this.telemetryBadge.setDebug(!!this.state.settings.debug);

    // Modals
    if (this.state.drawerOpen && !this.settingsDrawer.getIsOpen()) {
      this.settingsDrawer.open();
    } else if (!this.state.drawerOpen && this.settingsDrawer.getIsOpen()) {
      this.settingsDrawer.close();
    }

    if (this.state.creditsOpen && !this.creditsModal.getIsOpen()) {
      this.creditsModal.open();
    } else if (!this.state.creditsOpen && this.creditsModal.getIsOpen()) {
      this.creditsModal.close();
    }

    if (this.state.isLoading) {
      this.showLoading(
        'inferring',
        this.state.loadingProgress,
        this.state.loadingMessage
      );
    } else if (this.state.error) {
      this.showError(this.state.error);
    } else {
      this.hideLoading();
    }
  }

  public updateImages(images: ImageItem[], currentIndex: number): void {
    this.state.images = images;
    this.state.currentIndex = currentIndex;
    this.titleScreen.setHasExistingImages(images.length > 0);
    this.topBar.update(images, currentIndex, this.state.isLoading, this.state.loadingMessage);
  }
}
