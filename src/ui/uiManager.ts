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

    // Initial state reflection
    this.update(initialState);
  }

  public openAddImagesDialog(): void {
    this.titleScreen.setHasExistingImages(this.state.images.length > 0);
    this.titleScreen.show();
  }

  public openSettings(): void {
    this.state.drawerOpen = true;
    this.settingsDrawer.open();
  }

  public closeSettings(): void {
    this.state.drawerOpen = false;
    this.settingsDrawer.close();
  }

  public toggleSettings(): void {
    if (this.settingsDrawer.getIsOpen()) {
      this.closeSettings();
    } else {
      this.openSettings();
    }
  }

  public openCredits(): void {
    this.state.creditsOpen = true;
    this.creditsModal.open();
  }

  public closeCredits(): void {
    this.state.creditsOpen = false;
    this.creditsModal.close();
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
    const cur = this.getCurrentImage();
    const dr = depthResult ?? cur?.depthResult;
    const fn = fileName ?? cur?.fileName;
    this.depthDebugModal.open(dr, fn);
  }

  public closeDepthDebug(): void {
    this.depthDebugModal.close();
  }

  public toggleDepthDebug(depthResult?: DepthResult, fileName?: string): void {
    const cur = this.getCurrentImage();
    const dr = depthResult ?? cur?.depthResult;
    const fn = fileName ?? cur?.fileName;
    this.depthDebugModal.toggle(dr, fn);
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
  }): void {
    this.telemetryBadge.update(data);
    if (data.dpr) {
      this.topBar.setDpr(data.dpr);
    }
  }

  public setPipelineProvider(provider: string): void {
    this.topBar.setPipelineProvider(provider);
  }

  private getCurrentImage(): ImageItem | undefined {
    if (this.state.currentIndex >= 0 && this.state.currentIndex < this.state.images.length) {
      return this.state.images[this.state.currentIndex];
    }
    return undefined;
  }

  public closeAllModals(): boolean {
    let closedAny = false;
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
    return closedAny;
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
