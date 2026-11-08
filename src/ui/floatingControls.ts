/**
 * Floating Bottom Controls for Drift
 * Glassmorphic HUD interface:
 * 1. Bottom-centre dock (ONE row):
 *    - Segmented control with 7 modes: Drift, Splash, Gather, Depth, Travel, Swarm, Melt.
 *      (Number hints 1-7 shown on hover/focus only, clean sentence case, active mode is full pill chip).
 *    - Overlays popover trigger with active indicator dot.
 *    - Three 20px round swatches for palette: True, Negative, Paper (ON_WHITE) with tooltips and aria-labels.
 *    - Horizontal scroll with edge fade masks at narrow widths.
 * 2. Overlays Popover:
 *    - Overlays (Links, Trackers, Scan, Trails, Marks, Draw) in clean popup menu.
 *    - Dot indicator on trigger when any overlay is active.
 * 3. Bottom-right floating group:
 *    - Zoom group: [-], [100% reset], [+] buttons.
 *    - Actions group: Hand pan toggle (zoom > 1), Record button (turns --rec with timer), Snapshot, Settings, Credits.
 *    - Responsive: hides [-] and [+] on narrow screens while keeping [100%] reset visible.
 */

import type { ColorMode, ModeName, OverlayName, OverlaySettings } from '@/types';
import { ICONS } from './icons';

export interface FloatingControlsOptions {
  onModeSelect: (mode: ModeName) => void;
  onOverlayToggle: (overlay: OverlayName) => void;
  onColorModeSelect: (colorMode: ColorMode) => void;
  onOpenSettings: () => void;
  onOpenCredits: () => void;
  onExport: () => void;
  onToggleRecordVideo: () => void;
  onToggleHandTool?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
}

const MODES: { name: ModeName; label: string; shortcut: string }[] = [
  { name: 'DRIFT', label: 'Drift', shortcut: '1' },
  { name: 'SPLASH', label: 'Splash', shortcut: '2' },
  { name: 'GATHER', label: 'Gather', shortcut: '3' },
  { name: 'DEPTH', label: 'Depth', shortcut: '4' },
  { name: 'TRAVEL', label: 'Travel', shortcut: '5' },
  { name: 'SWARM', label: 'Swarm', shortcut: '6' },
  { name: 'MELT', label: 'Melt', shortcut: '7' },
];

const OVERLAYS: { name: OverlayName; label: string }[] = [
  { name: 'LINKS', label: 'Links' },
  { name: 'TRACKERS', label: 'Trackers' },
  { name: 'SCAN', label: 'Scan' },
  { name: 'TRAILS', label: 'Trails' },
  { name: 'MARKS', label: 'Marks' },
  { name: 'DRAW', label: 'Draw' },
];

const PALETTES: { name: ColorMode; label: string; tooltip: string; swatchClass: string }[] = [
  {
    name: 'TRUE',
    label: 'True',
    tooltip: 'Palette: True (original colors)',
    swatchClass: 'swatch-true',
  },
  {
    name: 'NEGATIVE',
    label: 'Negative',
    tooltip: 'Palette: Negative (monochrome inverted)',
    swatchClass: 'swatch-negative',
  },
  {
    name: 'ON_WHITE',
    label: 'Paper',
    tooltip: 'Palette: Paper (ink on white)',
    swatchClass: 'swatch-paper',
  },
];

export class FloatingControls {
  private container: HTMLElement;
  private options: FloatingControlsOptions;

  private currentMode: ModeName = 'DRIFT';
  private currentColorMode: ColorMode = 'TRUE';
  private currentZoom: number = 1.0;
  private isRecording: boolean = false;
  private isHandToolActive: boolean = false;
  private recordingDurationText: string = '00:00';
  private isOverlaysPopoverOpen: boolean = false;

  private overlaySettings: OverlaySettings = {
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
  };

  private resizeObserver: ResizeObserver | null = null;

  constructor(parent: HTMLElement, options: FloatingControlsOptions) {
    this.options = options;
    this.container = document.createElement('div');
    this.container.className = 'floating-controls';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Particle Motion and HUD Controls');

    this.render();
    parent.appendChild(this.container);

    window.addEventListener('click', this.onDocumentClick);
    window.addEventListener('keydown', this.onDocumentKeyDown);
    window.addEventListener('resize', this.updateScrollMask);

    this.setupResizeObserver();
  }

  private isAnyOverlayActive(): boolean {
    return Object.values(this.overlaySettings.active).some(Boolean);
  }

  private setupResizeObserver(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.updateScrollMask();
      });
      const dockViewport = this.container.querySelector('.dock-scroll-viewport');
      if (dockViewport) {
        this.resizeObserver.observe(dockViewport);
      }
    }
  }

  private updateScrollMask = (): void => {
    const viewport = this.container.querySelector<HTMLElement>('.dock-scroll-viewport');
    if (!viewport) return;
    const isOverflowing = viewport.scrollWidth > viewport.clientWidth + 2;
    viewport.classList.toggle('has-overflow', isOverflowing);
  };

  private onDocumentClick = (e: MouseEvent): void => {
    if (!this.isOverlaysPopoverOpen) return;
    const target = e.target as Node | null;
    const popover = this.container.querySelector('.overlays-popover');
    const triggerBtn = this.container.querySelector('.dock-overlays-btn');
    if (popover && !popover.contains(target) && triggerBtn && !triggerBtn.contains(target)) {
      this.closeOverlaysPopover();
    }
  };

  private onDocumentKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.isOverlaysPopoverOpen) {
      this.closeOverlaysPopover();
    }
  };

  public toggleOverlaysPopover(): void {
    this.isOverlaysPopoverOpen = !this.isOverlaysPopoverOpen;
    this.updatePopoverVisibility();
  }

  public closeOverlaysPopover(): void {
    if (this.isOverlaysPopoverOpen) {
      this.isOverlaysPopoverOpen = false;
      this.updatePopoverVisibility();
    }
  }

  public getIsOverlaysPopoverOpen(): boolean {
    return this.isOverlaysPopoverOpen;
  }

  private updatePopoverVisibility(): void {
    const popover = this.container.querySelector('.overlays-popover');
    const triggerBtn = this.container.querySelector('.dock-overlays-btn');
    if (popover) {
      popover.classList.toggle('is-open', this.isOverlaysPopoverOpen);
    }
    if (triggerBtn) {
      triggerBtn.classList.toggle('popover-open', this.isOverlaysPopoverOpen);
      triggerBtn.setAttribute('aria-expanded', this.isOverlaysPopoverOpen ? 'true' : 'false');
    }
  }

  public update(mode: ModeName, colorMode: ColorMode, overlays: OverlaySettings): void {
    this.currentMode = mode;
    this.currentColorMode = colorMode;
    this.overlaySettings = overlays;
    this.render();
  }

  public setZoom(zoom: number): void {
    this.currentZoom = zoom;
    const zoomResetBtn = this.container.querySelector('.btn-zoom-reset');
    if (zoomResetBtn) {
      zoomResetBtn.textContent = `${Math.round(zoom * 100)}%`;
    }
    const handBtn = this.container.querySelector<HTMLElement>('.btn-hand');
    if (handBtn) {
      handBtn.style.display = zoom > 1.01 ? 'inline-flex' : 'none';
    }
  }

  public setRecordingState(isRecording: boolean, timeStr?: string): void {
    this.isRecording = isRecording;
    if (timeStr) {
      this.recordingDurationText = timeStr;
    }

    const recordBtn = this.container.querySelector('.btn-record');
    if (recordBtn) {
      if (isRecording) {
        recordBtn.classList.add('is-recording');
        recordBtn.setAttribute('aria-label', 'Stop Video Recording');
        recordBtn.setAttribute('title', 'Stop Video Recording');
        recordBtn.innerHTML = `
          ${ICONS.stop}
          <span class="rec-timer-inline">REC ${this.recordingDurationText}</span>
        `;
      } else {
        recordBtn.classList.remove('is-recording');
        recordBtn.setAttribute('aria-label', 'Record Video Loop (R)');
        recordBtn.setAttribute('title', 'Record Video Loop (R)');
        recordBtn.innerHTML = ICONS.video;
      }
    }
  }

  public setHandToolActive(active: boolean): void {
    this.isHandToolActive = active;
    const handBtn = this.container.querySelector('.btn-hand');
    if (handBtn) {
      handBtn.classList.toggle('active', active);
      handBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  public render(): void {
    const isAnyActive = this.isAnyOverlayActive();

    this.container.innerHTML = `
      <div class="floating-controls-inner">
        <!-- 1. Bottom-Centre Dock (ONE row) -->
        <div class="dock-wrapper">
          <!-- Overlays Popover (positioned directly above trigger/dock) -->
          <div 
            class="overlays-popover glassmorphic-panel ${this.isOverlaysPopoverOpen ? 'is-open' : ''}" 
            role="dialog" 
            aria-label="HUD Overlays Menu"
            aria-modal="false"
          >
            <div class="popover-header">
              <span class="popover-title">HUD Overlays</span>
              <button class="popover-close-btn" aria-label="Close Overlays Popover" title="Close">
                ${ICONS.close}
              </button>
            </div>
            <div class="popover-grid" role="group" aria-label="Overlay toggles">
              ${OVERLAYS.map((ov) => {
                const isActive = !!this.overlaySettings.active[ov.name];
                return `
                  <button 
                    class="popover-overlay-pill ${isActive ? 'active' : ''}" 
                    data-overlay="${ov.name}"
                    role="switch"
                    aria-checked="${isActive}"
                    title="Toggle ${ov.label} overlay"
                  >
                    <span class="indicator-dot" aria-hidden="true"></span>
                    <span class="pill-text">${ov.label}</span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Bottom-centre dock panel: ONE row -->
          <nav class="bottom-dock glassmorphic-panel" aria-label="Modes, Overlays, and Palette">
            <div class="dock-scroll-viewport">
              <!-- Segmented Control with 7 modes -->
              <div class="modes-segmented-control" role="radiogroup" aria-label="Particle Modes">
                ${MODES.map((m) => {
                  const isActive = m.name === this.currentMode;
                  return `
                    <button 
                      class="mode-pill ${isActive ? 'active' : ''}" 
                      data-mode="${m.name}"
                      role="radio"
                      aria-checked="${isActive}"
                      title="Switch to ${m.label} mode (${m.shortcut})"
                    >
                      <span class="mode-text">${m.label}</span>
                      <span class="mode-key" aria-hidden="true">${m.shortcut}</span>
                    </button>
                  `;
                }).join('')}
              </div>

              <div class="dock-divider" aria-hidden="true"></div>

              <!-- Overlays Popover Trigger Button -->
              <button 
                class="dock-overlays-btn ${isAnyActive ? 'has-active' : ''} ${this.isOverlaysPopoverOpen ? 'popover-open' : ''}" 
                aria-haspopup="dialog"
                aria-expanded="${this.isOverlaysPopoverOpen}"
                title="HUD Overlays"
                aria-label="HUD Overlays"
              >
                <span class="dock-overlays-icon">${ICONS.layers}</span>
                <span class="dock-overlays-text">Overlays</span>
                <span class="dock-overlays-dot ${isAnyActive ? 'visible' : ''}" aria-hidden="true"></span>
              </button>

              <div class="dock-divider" aria-hidden="true"></div>

              <!-- Three 20px round swatches for palette: True, Negative, Paper (ON_WHITE) -->
              <div class="palette-swatches-group" role="radiogroup" aria-label="Color Palette">
                ${PALETTES.map((p) => {
                  const isActive = p.name === this.currentColorMode;
                  return `
                    <button 
                      class="palette-swatch-btn ${isActive ? 'active' : ''}" 
                      data-color="${p.name}" 
                      role="radio" 
                      aria-checked="${isActive}" 
                      title="${p.tooltip}" 
                      aria-label="${p.tooltip}"
                    >
                      <span class="swatch-circle ${p.swatchClass}" aria-hidden="true"></span>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
          </nav>
        </div>

        <!-- 2. Bottom-Right Floating Group -->
        <div class="bottom-right-floating-wrapper">
          <div class="floating-actions-dock glassmorphic-panel" role="toolbar" aria-label="Zoom and Quick Actions">
            <!-- Zoom Controls Group -->
            <div class="zoom-group" role="group" aria-label="Zoom Controls">
              <button class="action-icon-btn btn-zoom btn-zoom-out" aria-label="Zoom Out (-)" title="Zoom Out (-)">
                ${ICONS.minus}
              </button>
              <button class="action-icon-btn btn-zoom btn-zoom-reset" aria-label="Reset View (0)" title="Reset View (0)">
                ${Math.round(this.currentZoom * 100)}%
              </button>
              <button class="action-icon-btn btn-zoom btn-zoom-in" aria-label="Zoom In (+)" title="Zoom In (+)">
                ${ICONS.plus}
              </button>
            </div>

            <div class="dock-divider" aria-hidden="true"></div>

            <!-- Actions Controls Group -->
            <div class="actions-group" role="toolbar" aria-label="Quick Actions">
              <button 
                class="action-icon-btn btn-hand ${this.isHandToolActive ? 'active' : ''}" 
                style="${this.currentZoom > 1.01 ? '' : 'display: none;'}"
                aria-label="Hand Tool - Pan View (H)" 
                title="Hand Tool - Pan View (H)"
                aria-pressed="${this.isHandToolActive}"
              >
                ${ICONS.hand}
              </button>
              <button 
                class="action-icon-btn btn-record ${this.isRecording ? 'is-recording' : ''}" 
                aria-label="${this.isRecording ? 'Stop Recording Video' : 'Record Video Loop (R)'}" 
                title="${this.isRecording ? 'Stop Recording Video' : 'Record Video Loop (R)'}"
              >
                ${this.isRecording ? ICONS.stop : ICONS.video}
                ${this.isRecording ? `<span class="rec-timer-inline">REC ${this.recordingDurationText}</span>` : ''}
              </button>
              <button class="action-icon-btn btn-export" aria-label="Export Snapshot (S)" title="Export High-Res Snapshot (S)">
                ${ICONS.camera}
              </button>
              <button class="action-icon-btn btn-settings" aria-label="Settings Drawer (O)" title="Open Settings (O)">
                ${ICONS.settings}
              </button>
              <button class="action-icon-btn btn-credits" aria-label="Credits & Licenses (C)" title="Credits & Licenses (C)">
                ${ICONS.info}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
    this.updateScrollMask();
  }

  private bindEvents(): void {
    // Mode Selection
    const modePills = this.container.querySelectorAll('.mode-pill');
    modePills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const mode = pill.getAttribute('data-mode') as ModeName;
        if (mode) {
          this.currentMode = mode;
          modePills.forEach((p) => {
            const isMatch = p.getAttribute('data-mode') === mode;
            p.classList.toggle('active', isMatch);
            p.setAttribute('aria-checked', isMatch ? 'true' : 'false');
          });
          this.closeOverlaysPopover();
          this.options.onModeSelect(mode);
        }
      });
    });

    // Overlays Popover Trigger
    const overlaysTrigger = this.container.querySelector('.dock-overlays-btn');
    overlaysTrigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleOverlaysPopover();
    });

    // Popover Close Button
    const popoverCloseBtn = this.container.querySelector('.popover-close-btn');
    popoverCloseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeOverlaysPopover();
    });

    // Overlay Toggles inside Popover
    const overlayPills = this.container.querySelectorAll('.popover-overlay-pill');
    overlayPills.forEach((pill) => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        const overlay = pill.getAttribute('data-overlay') as OverlayName;
        if (overlay) {
          const nextActive = !this.overlaySettings.active[overlay];
          this.overlaySettings.active[overlay] = nextActive;
          pill.classList.toggle('active', nextActive);
          pill.setAttribute('aria-checked', nextActive ? 'true' : 'false');

          const anyActive = this.isAnyOverlayActive();
          const dot = this.container.querySelector('.dock-overlays-dot');
          dot?.classList.toggle('visible', anyActive);
          const trigger = this.container.querySelector('.dock-overlays-btn');
          trigger?.classList.toggle('has-active', anyActive);

          this.options.onOverlayToggle(overlay);
        }
      });
    });

    // Palette Swatches
    const swatchBtns = this.container.querySelectorAll('.palette-swatch-btn');
    swatchBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const color = btn.getAttribute('data-color') as ColorMode;
        if (color) {
          this.currentColorMode = color;
          swatchBtns.forEach((b) => {
            const isMatch = b.getAttribute('data-color') === color;
            b.classList.toggle('active', isMatch);
            b.setAttribute('aria-checked', isMatch ? 'true' : 'false');
          });
          this.options.onColorModeSelect(color);
        }
      });
    });

    // Zoom Buttons
    const zoomOutBtn = this.container.querySelector('.btn-zoom-out');
    zoomOutBtn?.addEventListener('click', () => {
      this.options.onZoomOut?.();
    });

    const zoomResetBtn = this.container.querySelector('.btn-zoom-reset');
    zoomResetBtn?.addEventListener('click', () => {
      this.options.onZoomReset?.();
    });

    const zoomInBtn = this.container.querySelector('.btn-zoom-in');
    zoomInBtn?.addEventListener('click', () => {
      this.options.onZoomIn?.();
    });

    // Action Buttons
    const handBtn = this.container.querySelector('.btn-hand');
    handBtn?.addEventListener('click', () => this.options.onToggleHandTool?.());

    const recordBtn = this.container.querySelector('.btn-record');
    recordBtn?.addEventListener('click', () => this.options.onToggleRecordVideo());

    const exportBtn = this.container.querySelector('.btn-export');
    exportBtn?.addEventListener('click', () => this.options.onExport());

    const settingsBtn = this.container.querySelector('.btn-settings');
    settingsBtn?.addEventListener('click', () => this.options.onOpenSettings());

    const creditsBtn = this.container.querySelector('.btn-credits');
    creditsBtn?.addEventListener('click', () => this.options.onOpenCredits());
  }

  public dispose(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    window.removeEventListener('click', this.onDocumentClick);
    window.removeEventListener('keydown', this.onDocumentKeyDown);
    window.removeEventListener('resize', this.updateScrollMask);
    this.container.remove();
  }
}
