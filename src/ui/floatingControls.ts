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
  onPopoverToggle?: (isOpen: boolean) => void;
  onDriftChange?: (drift: Partial<{ pos: number; angleDeg: number; feather: number }>) => void;
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

  private currentDrift = {
    pos: 0.65,
    angleDeg: 0,
    feather: 0.35,
  };
  private isInputtingStart = false;
  private isInputtingSoftness = false;

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

    window.addEventListener('pointerdown', this.onDocumentPointerDown);
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

  private onDocumentPointerDown = (e: PointerEvent): void => {
    if (!this.isOverlaysPopoverOpen) return;
    const path = e.composedPath();
    const popover = this.container.querySelector('.overlays-popover');
    const triggerBtn = this.container.querySelector('.dock-overlays-btn');
    if (
      (popover && path.includes(popover)) ||
      (triggerBtn && path.includes(triggerBtn))
    ) {
      return;
    }
    this.closeOverlaysPopover(true);
  };

  private onDocumentKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.isOverlaysPopoverOpen) {
      e.stopPropagation();
      e.preventDefault();
      this.closeOverlaysPopover(true);
    }
  };

  public toggleOverlaysPopover(): void {
    this.isOverlaysPopoverOpen = !this.isOverlaysPopoverOpen;
    this.updatePopoverVisibility();
    this.options.onPopoverToggle?.(this.isOverlaysPopoverOpen);
  }

  public closeOverlaysPopover(returnFocus: boolean = false): void {
    if (this.isOverlaysPopoverOpen) {
      this.isOverlaysPopoverOpen = false;
      this.updatePopoverVisibility();
      this.options.onPopoverToggle?.(false);
      if (returnFocus) {
        const triggerBtn = this.container.querySelector<HTMLButtonElement>('.dock-overlays-btn');
        triggerBtn?.focus();
      }
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

  public update(
    mode: ModeName,
    colorMode: ColorMode,
    overlays: OverlaySettings,
    drift?: { pos: number; angleDeg: number; feather: number }
  ): void {
    this.currentMode = mode;
    this.currentColorMode = colorMode;
    this.overlaySettings = overlays;
    if (drift) {
      this.currentDrift = { ...drift };
    }
    this.syncControls();
  }

  public setDrift(drift: { pos: number; angleDeg: number; feather: number }): void {
    this.currentDrift = { ...drift };
    this.syncDriftControls();
  }

  public syncControls(): void {
    // 1. Sync Overlays Popover switches
    const popover = this.container.querySelector('.overlays-popover');
    if (popover) {
      const overlayBtns = popover.querySelectorAll<HTMLButtonElement>('button[data-overlay]');
      overlayBtns.forEach((btn) => {
        const name = btn.dataset.overlay as OverlayName | undefined;
        if (!name) return;
        const isActive = !!this.overlaySettings.active[name];
        btn.classList.toggle('is-on', isActive);
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
      });
    }

    const anyActive = this.isAnyOverlayActive();
    const dot = this.container.querySelector('.dock-overlays-dot');
    dot?.classList.toggle('visible', anyActive);
    const trigger = this.container.querySelector('.dock-overlays-btn');
    trigger?.classList.toggle('has-active', anyActive);

    // 2. Sync Mode selection
    const modePills = this.container.querySelectorAll('.mode-pill');
    modePills.forEach((p) => {
      const isMatch = p.getAttribute('data-mode') === this.currentMode;
      p.classList.toggle('active', isMatch);
      p.setAttribute('aria-checked', isMatch ? 'true' : 'false');
    });

    // 3. Sync Palette swatches
    const swatchBtns = this.container.querySelectorAll('.palette-swatch-btn');
    swatchBtns.forEach((b) => {
      const isMatch = b.getAttribute('data-color') === this.currentColorMode;
      b.classList.toggle('active', isMatch);
      b.setAttribute('aria-checked', isMatch ? 'true' : 'false');
    });

    // 4. Sync Drift Strip visibility & controls
    const driftStrip = this.container.querySelector('.drift-strip');
    if (driftStrip) {
      driftStrip.classList.toggle('is-visible', this.currentMode === 'DRIFT');
    }
    this.syncDriftControls();
  }

  private syncDriftControls(): void {
    // Direction buttons
    const dirBtns = this.container.querySelectorAll<HTMLButtonElement>('.drift-dir-btn');
    const normAngle = ((Math.round(this.currentDrift.angleDeg) % 360) + 360) % 360;
    dirBtns.forEach((btn) => {
      const btnAngle = Number(btn.dataset.angle);
      const isActive =
        Math.abs(normAngle - btnAngle) < 15 || Math.abs(normAngle - (btnAngle + 360)) < 15;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });

    // Start slider
    const startSlider = this.container.querySelector<HTMLInputElement>('#drift-start-slider');
    const startVal = this.container.querySelector<HTMLElement>('#drift-start-val');
    const startPercent = Math.round(this.currentDrift.pos * 100);
    if (startVal) {
      startVal.textContent = `${startPercent}%`;
    }
    if (startSlider && !this.isInputtingStart) {
      startSlider.value = String(startPercent);
    }

    // Softness slider
    const softnessSlider = this.container.querySelector<HTMLInputElement>('#drift-softness-slider');
    const softnessVal = this.container.querySelector<HTMLElement>('#drift-softness-val');
    const softnessPercent = Math.round(this.currentDrift.feather * 100);
    if (softnessVal) {
      softnessVal.textContent = `${softnessPercent}%`;
    }
    if (softnessSlider && !this.isInputtingSoftness) {
      softnessSlider.value = String(this.currentDrift.feather);
    }
  }

  public setZoom(zoom: number): void {
    this.currentZoom = zoom;
    const zoomValText = this.container.querySelector('.zoom-val-text');
    if (zoomValText) {
      zoomValText.textContent = `${Math.round(zoom * 100)}%`;
    }
    const zoomResetBtn = this.container.querySelector('.btn-zoom-reset');
    if (zoomResetBtn && !zoomValText) {
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
          <!-- Drift Control Strip (compact strip above dock) -->
          <div 
            class="drift-strip glassmorphic-panel ${this.currentMode === 'DRIFT' ? 'is-visible' : ''}" 
            role="toolbar" 
            aria-label="Drift Parameters"
          >
            <div class="drift-dir-group" role="radiogroup" aria-label="Drift Direction">
              <button 
                class="drift-dir-btn ${Math.round(this.currentDrift.angleDeg) === 180 ? 'active' : ''}" 
                data-angle="180" 
                role="radio" 
                aria-checked="${Math.round(this.currentDrift.angleDeg) === 180}"
                aria-label="Drift Left (180°)" 
                title="Drift Left (180°)"
              >
                ${ICONS.arrowLeft}
              </button>
              <button 
                class="drift-dir-btn ${Math.round(this.currentDrift.angleDeg) === 90 ? 'active' : ''}" 
                data-angle="90" 
                role="radio" 
                aria-checked="${Math.round(this.currentDrift.angleDeg) === 90}"
                aria-label="Drift Up (90°)" 
                title="Drift Up (90°)"
              >
                ${ICONS.arrowUp}
              </button>
              <button 
                class="drift-dir-btn ${Math.round(this.currentDrift.angleDeg) === 270 ? 'active' : ''}" 
                data-angle="270" 
                role="radio" 
                aria-checked="${Math.round(this.currentDrift.angleDeg) === 270}"
                aria-label="Drift Down (270°)" 
                title="Drift Down (270°)"
              >
                ${ICONS.arrowDown}
              </button>
              <button 
                class="drift-dir-btn ${Math.round(this.currentDrift.angleDeg) === 0 ? 'active' : ''}" 
                data-angle="0" 
                role="radio" 
                aria-checked="${Math.round(this.currentDrift.angleDeg) === 0}"
                aria-label="Drift Right (0°)" 
                title="Drift Right (0°)"
              >
                ${ICONS.arrowRight}
              </button>
            </div>

            <div class="dock-divider" aria-hidden="true"></div>

            <div class="drift-slider-group">
              <label class="drift-slider-label" for="drift-start-slider">Start</label>
              <input 
                type="range" 
                id="drift-start-slider" 
                class="drift-slider" 
                min="0" 
                max="100" 
                step="1" 
                value="${Math.round(this.currentDrift.pos * 100)}" 
                aria-label="Drift start position (0-100%)"
              />
              <span class="drift-slider-val" id="drift-start-val">${Math.round(this.currentDrift.pos * 100)}%</span>
            </div>

            <div class="dock-divider" aria-hidden="true"></div>

            <div class="drift-slider-group">
              <label class="drift-slider-label" for="drift-softness-slider">Softness</label>
              <input 
                type="range" 
                id="drift-softness-slider" 
                class="drift-slider" 
                min="0.05" 
                max="1.0" 
                step="0.01" 
                value="${this.currentDrift.feather}" 
                aria-label="Drift softness feather (0.05 - 1.0)"
              />
              <span class="drift-slider-val" id="drift-softness-val">${Math.round(this.currentDrift.feather * 100)}%</span>
            </div>
          </div>

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
                    class="popover-overlay-pill ${isActive ? 'is-on active' : ''}" 
                    data-overlay="${ov.name}"
                    role="switch"
                    aria-checked="${isActive ? 'true' : 'false'}"
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
              <span class="zoom-val-text" aria-label="Current zoom" title="Current Zoom">${Math.round(this.currentZoom * 100)}%</span>
              <button class="action-icon-btn btn-zoom btn-zoom-reset" aria-label="Reset View (0)" title="Reset View (0)">
                ${ICONS.refresh}
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
    // Drift Direction buttons
    const dirBtns = this.container.querySelectorAll<HTMLButtonElement>('.drift-dir-btn');
    dirBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const angleDeg = Number(btn.dataset.angle);
        this.currentDrift.angleDeg = angleDeg;
        this.syncDriftControls();
        this.options.onDriftChange?.({ angleDeg });
      });
    });

    // Drift Start Slider (two-way bound)
    const startSlider = this.container.querySelector<HTMLInputElement>('#drift-start-slider');
    const startVal = this.container.querySelector<HTMLElement>('#drift-start-val');
    if (startSlider) {
      startSlider.addEventListener('input', () => {
        this.isInputtingStart = true;
        const pos = Number(startSlider.value) / 100;
        this.currentDrift.pos = pos;
        if (startVal) {
          startVal.textContent = `${Math.round(pos * 100)}%`;
        }
        this.options.onDriftChange?.({ pos });
      });
      startSlider.addEventListener('change', () => {
        this.isInputtingStart = false;
      });
    }

    // Drift Softness Slider (feather 0.05 - 1.0)
    const softnessSlider = this.container.querySelector<HTMLInputElement>('#drift-softness-slider');
    const softnessVal = this.container.querySelector<HTMLElement>('#drift-softness-val');
    if (softnessSlider) {
      softnessSlider.addEventListener('input', () => {
        this.isInputtingSoftness = true;
        const feather = Number(softnessSlider.value);
        this.currentDrift.feather = feather;
        if (softnessVal) {
          softnessVal.textContent = `${Math.round(feather * 100)}%`;
        }
        this.options.onDriftChange?.({ feather });
      });
      softnessSlider.addEventListener('change', () => {
        this.isInputtingSoftness = false;
      });
    }

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

    // Overlays Popover container event handling
    const popover = this.container.querySelector<HTMLElement>('.overlays-popover');
    if (popover) {
      // Stop propagation on pointerdown and mousedown so canvas gestures and outside-click handlers don't intercept
      popover.addEventListener('pointerdown', (e) => e.stopPropagation());
      popover.addEventListener('mousedown', (e) => e.stopPropagation());

      // Single delegated click handler on the popover using data-overlay attributes
      popover.addEventListener('click', (e) => {
        const target = e.target as HTMLElement | null;
        const btn = target?.closest<HTMLButtonElement>('button[data-overlay]');
        if (!btn) return;
        e.stopPropagation();
        const overlay = btn.dataset.overlay as OverlayName | undefined;
        if (overlay) {
          this.options.onOverlayToggle(overlay);
        }
      });
    }

    // Overlays Popover Trigger
    const overlaysTrigger = this.container.querySelector<HTMLButtonElement>('.dock-overlays-btn');
    overlaysTrigger?.addEventListener('pointerdown', (e) => e.stopPropagation());
    overlaysTrigger?.addEventListener('mousedown', (e) => e.stopPropagation());
    overlaysTrigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleOverlaysPopover();
    });

    // Popover Close Button
    const popoverCloseBtn = this.container.querySelector<HTMLButtonElement>('.popover-close-btn');
    popoverCloseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeOverlaysPopover(true);
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
    window.removeEventListener('pointerdown', this.onDocumentPointerDown);
    window.removeEventListener('keydown', this.onDocumentKeyDown);
    window.removeEventListener('resize', this.updateScrollMask);
    this.container.remove();
  }
}
