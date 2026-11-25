/**
 * Collapsible Settings Drawer for Drift
 * Real-time particle geometry, rendering quality, motion dynamics, HUD overlay toggles,
 * debug telemetry control, and Depth Anything V2 ONNX architecture details.
 */

import type { ColorMode, OverlayName, ParticleSettings, QualityLevel } from '@/types';
import { ICONS } from './icons';

export interface SettingsDrawerOptions {
  onSettingsChange: (settings: Partial<ParticleSettings>) => void;
  onResetDefaults: () => void;
  onClose: () => void;
  onToggleDepthView?: () => void;
  onZoomReset?: () => void;
  onOpenCredits?: () => void;
}

const QUALITY_NOTES: Record<QualityLevel, string> = {
  STANDARD: 'Standard: 1x DPR, lowest GPU load and best battery life.',
  HIGH: 'High: 2x supersampling, balanced clarity and frame rate.',
  ULTRA: 'Ultra: 3x supersampling, highest fidelity with heavy GPU load.',
};

const PALETTE_OPTIONS: { value: ColorMode; label: string }[] = [
  { value: 'TRUE', label: 'True' },
  { value: 'NEGATIVE', label: 'Negative' },
  { value: 'ON_WHITE', label: 'Paper' },
];

const OVERLAYS_LIST: { name: OverlayName; label: string }[] = [
  { name: 'MARKS', label: 'Marks' },
  { name: 'TRACKERS', label: 'Trackers' },
  { name: 'LINKS', label: 'Links' },
  { name: 'SCAN', label: 'Scan' },
  { name: 'TRAILS', label: 'Trails' },
  { name: 'DRAW', label: 'Draw' },
];

export class SettingsDrawer {
  private container: HTMLElement;
  private backdrop: HTMLElement;
  private options: SettingsDrawerOptions;
  private settings: ParticleSettings;
  private isOpen: boolean = false;
  private depthMode: 'MODEL' | 'HEURISTIC' = 'MODEL';
  private pipelineProvider: string = 'WEBGPU';
  private driftFeather: number = 0.35;
  private previousFocus: HTMLElement | null = null;
  private handleKeyDown: (e: KeyboardEvent) => void;

  constructor(parent: HTMLElement, initialSettings: ParticleSettings, options: SettingsDrawerOptions) {
    this.options = options;
    this.settings = JSON.parse(JSON.stringify(initialSettings));

    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      this.pipelineProvider = 'WEBGPU';
    } else {
      this.pipelineProvider = 'WASM';
    }

    this.backdrop = document.createElement('div');
    this.backdrop.className = 'drawer-backdrop';
    this.backdrop.addEventListener('click', () => this.close());

    this.container = document.createElement('div');
    this.container.className = 'settings-drawer-panel';
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-modal', 'true');
    this.container.setAttribute('aria-label', 'Simulation settings');

    this.handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isOpen) {
        e.preventDefault();
        this.close();
      }
    };
    window.addEventListener('keydown', this.handleKeyDown);

    this.render();
    parent.appendChild(this.backdrop);
    parent.appendChild(this.container);
  }

  public updateSettings(settings: ParticleSettings): void {
    this.settings = JSON.parse(JSON.stringify(settings));
    if (this.container.querySelector('.drawer-body')) {
      this.syncDOM();
    } else {
      this.render();
    }
  }

  public setPipelineProvider(provider: string): void {
    const formatted = provider.toUpperCase();
    if (this.pipelineProvider !== formatted) {
      this.pipelineProvider = formatted;
      if (formatted === 'PROCEDURAL' || formatted === 'HEURISTIC') {
        this.depthMode = 'HEURISTIC';
      }
      this.syncProviderStatus();
    }
  }

  public setDepthMode(mode: 'MODEL' | 'HEURISTIC', provider?: string): void {
    let changed = false;
    if (this.depthMode !== mode) {
      this.depthMode = mode;
      changed = true;
    }
    if (provider) {
      const formatted = provider.toUpperCase();
      if (this.pipelineProvider !== formatted) {
        this.pipelineProvider = formatted;
        changed = true;
      }
    }
    if (changed) {
      this.syncProviderStatus();
    }
  }

  public open(): void {
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.syncFeatherFromDock();
    this.isOpen = true;
    this.backdrop.classList.add('active');
    this.container.classList.add('open');
    const closeBtn = this.container.querySelector<HTMLButtonElement>('.drawer-close-btn');
    closeBtn?.focus();
  }

  public close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.backdrop.classList.remove('active');
    this.container.classList.remove('open');
    this.options.onClose();
    if (this.previousFocus && this.previousFocus.isConnected) {
      this.previousFocus.focus();
    }
    this.previousFocus = null;
  }

  public toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public getIsOpen(): boolean {
    return this.isOpen;
  }

  private formatCount(val: number): string {
    return (val / 1000).toFixed(0) + 'k';
  }

  private formatTrackerDensity(val: number): string {
    const label = val <= 0.3 ? 'Sparse' : val >= 0.7 ? 'Dense' : 'Balanced';
    return `${label} (${val.toFixed(2)})`;
  }

  private formatModeLabel(): string {
    return this.depthMode === 'MODEL' ? 'Model' : 'Heuristic';
  }

  private formatProviderLabel(): string {
    if (this.pipelineProvider === 'WEBGPU') return 'WebGPU';
    if (this.pipelineProvider === 'WASM') return 'WASM';
    if (this.pipelineProvider === 'PROCEDURAL') return 'Procedural';
    return this.pipelineProvider;
  }

  private syncFeatherFromDock(): void {
    const dockSlider = document.querySelector<HTMLInputElement>('#drift-softness-slider');
    if (dockSlider) {
      const val = parseFloat(dockSlider.value);
      if (!Number.isNaN(val)) {
        this.driftFeather = val;
        const drawerSlider = this.container.querySelector<HTMLInputElement>('#slider-drift-feather');
        const drawerVal = this.container.querySelector('#val-drift-feather');
        if (drawerSlider) drawerSlider.value = String(val);
        if (drawerVal) drawerVal.textContent = `${Math.round(val * 100)}%`;
      }
    }
  }

  private syncProviderStatus(): void {
    const pill = this.container.querySelector('.depth-hud-pill');
    const modeEl = this.container.querySelector('.depth-hud-mode');
    const provEl = this.container.querySelector('.depth-hud-provider');
    if (pill) {
      pill.className = `depth-hud-pill depth-hud-${this.depthMode.toLowerCase()}`;
    }
    if (modeEl) modeEl.textContent = this.formatModeLabel();
    if (provEl) provEl.textContent = this.formatProviderLabel();
  }

  private syncDOM(): void {
    const s = this.settings;
    const ov = s.overlays;

    // Palette
    this.container.querySelectorAll<HTMLButtonElement>('.palette-seg-btn').forEach((btn) => {
      const active = btn.dataset.color === s.colorMode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });

    // Quality
    this.container.querySelectorAll<HTMLButtonElement>('.quality-seg-btn').forEach((btn) => {
      const active = btn.dataset.quality === s.quality;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });
    const qualityNote = this.container.querySelector('#quality-cost-note');
    if (qualityNote) {
      qualityNote.textContent = QUALITY_NOTES[s.quality] || QUALITY_NOTES.HIGH;
    }

    // Sliders
    this.setSlider('#slider-intensity', '#val-intensity', s.intensity, `${s.intensity.toFixed(2)}x`);
    this.setSlider('#slider-point-size', '#val-point-size', s.pointSize, `${s.pointSize.toFixed(1)}px`);
    this.setSlider('#slider-noise-speed', '#val-noise-speed', s.noiseSpeed, s.noiseSpeed.toFixed(2));
    this.setSlider('#slider-noise-strength', '#val-noise-strength', s.noiseStrength, s.noiseStrength.toFixed(2));
    this.setSlider('#slider-splash-strength', '#val-splash-strength', s.splashStrength, s.splashStrength.toFixed(2));
    this.setSlider('#slider-depth-scale', '#val-depth-scale', s.depthScale, `${s.depthScale.toFixed(2)}x`);
    this.setSlider('#slider-particle-count', '#val-particle-count', s.particleCount, this.formatCount(s.particleCount));
    this.setSlider('#slider-line-weight', '#val-line-weight', ov.lineWeight, `${ov.lineWeight.toFixed(1)}px`);
    this.setSlider(
      '#slider-tracker-density',
      '#val-tracker-density',
      ov.trackerDensity,
      this.formatTrackerDensity(ov.trackerDensity)
    );
    this.setSlider(
      '#slider-link-distance',
      '#val-link-distance',
      ov.linkDistanceThreshold,
      ov.linkDistanceThreshold.toFixed(3)
    );
    this.setSlider('#slider-scan-speed', '#val-scan-speed', ov.scanSpeed, `${ov.scanSpeed.toFixed(2)}x`);
    this.setSlider('#slider-trail-fade', '#val-trail-fade', ov.trailFade, ov.trailFade.toFixed(2));

    // Checkboxes
    const fpsCheck = this.container.querySelector<HTMLInputElement>('#toggle-adaptive-fps');
    if (fpsCheck) fpsCheck.checked = !!s.adaptiveFPS;

    const centerCheck = this.container.querySelector<HTMLInputElement>('#toggle-center-on-content');
    if (centerCheck) centerCheck.checked = s.centerOnContent !== false;

    const debugCheck = this.container.querySelector<HTMLInputElement>('#toggle-debug-readout');
    if (debugCheck) debugCheck.checked = !!s.debug;

    // Overlays
    this.container.querySelectorAll<HTMLButtonElement>('.drawer-overlay-btn').forEach((btn) => {
      const overlayName = btn.dataset.overlay as OverlayName | undefined;
      const toggleType = btn.dataset.toggle;
      if (toggleType === 'cropMarks') {
        const active = ov.cropMarks !== false;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      } else if (overlayName) {
        const active = !!ov.active[overlayName];
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    });
  }

  private setSlider(sliderSel: string, valSel: string, numValue: number, textValue: string): void {
    const slider = this.container.querySelector<HTMLInputElement>(sliderSel);
    const valEl = this.container.querySelector(valSel);
    if (slider) slider.value = String(numValue);
    if (valEl) valEl.textContent = textValue;
  }

  public render(): void {
    const s = this.settings;
    const ov = s.overlays;
    const isCropMarksActive = ov.cropMarks !== false;

    this.container.innerHTML = `
      <div class="drawer-header">
        <div class="drawer-title-group">
          <h2 class="drawer-title">Settings</h2>
          <span class="drawer-subtitle">Particle &amp; HUD parameters</span>
        </div>
        <button type="button" class="drawer-close-btn" aria-label="Close settings (Esc)" title="Close settings (Esc)">
          ${ICONS.close}
        </button>
      </div>

      <div class="drawer-body">
        <!-- Section: Look -->
        <div class="settings-section">
          <h3 class="section-title">Look</h3>

          <!-- Intensity Slider (0.5 to 2.0) -->
          <div class="setting-item">
            <div class="setting-label-row">
              <label for="slider-intensity">Intensity</label>
              <span class="setting-value" id="val-intensity">${s.intensity.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              id="slider-intensity"
              min="0.5"
              max="2.0"
              step="0.05"
              value="${s.intensity}"
              class="range-slider"
            />
          </div>

          <!-- Point Size Slider (0.6 to 3.0) -->
          <div class="setting-item">
            <div class="setting-label-row">
              <label for="slider-point-size">Point size</label>
              <span class="setting-value" id="val-point-size">${s.pointSize.toFixed(1)}px</span>
            </div>
            <input
              type="range"
              id="slider-point-size"
              min="0.6"
              max="3.0"
              step="0.1"
              value="${s.pointSize}"
              class="range-slider"
            />
          </div>

          <!-- Palette Selector -->
          <div class="setting-item">
            <span class="setting-subhead" id="label-palette-select">Palette</span>
            <div class="quality-segmented-control" role="radiogroup" aria-labelledby="label-palette-select">
              ${PALETTE_OPTIONS.map((opt) => {
                const active = s.colorMode === opt.value;
                return `
                  <button
                    type="button"
                    class="quality-seg-btn palette-seg-btn ${active ? 'active' : ''}"
                    data-color="${opt.value}"
                    role="radio"
                    aria-checked="${active}"
                  >
                    ${opt.label}
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- Section: Motion -->
        <div class="settings-section">
          <h3 class="section-title">Motion</h3>

          <!-- Speed Slider -->
          <div class="setting-item">
            <div class="setting-label-row">
              <label for="slider-noise-speed">Speed</label>
              <span class="setting-value" id="val-noise-speed">${s.noiseSpeed.toFixed(2)}</span>
            </div>
            <input
              type="range"
              id="slider-noise-speed"
              min="0.0"
              max="2.5"
              step="0.05"
              value="${s.noiseSpeed}"
              class="range-slider"
            />
          </div>

          <!-- Strength Slider -->
          <div class="setting-item">
            <div class="setting-label-row">
              <label for="slider-noise-strength">Strength</label>
              <span class="setting-value" id="val-noise-strength">${s.noiseStrength.toFixed(2)}</span>
            </div>
            <input
              type="range"
              id="slider-noise-strength"
              min="0.0"
              max="3.0"
              step="0.05"
              value="${s.noiseStrength}"
              class="range-slider"
            />
          </div>

          <!-- Splash Impulse Slider -->
          <div class="setting-item">
            <div class="setting-label-row">
              <label for="slider-splash-strength">Splash impulse</label>
              <span class="setting-value" id="val-splash-strength">${s.splashStrength.toFixed(2)}</span>
            </div>
            <input
              type="range"
              id="slider-splash-strength"
              min="0.2"
              max="4.0"
              step="0.1"
              value="${s.splashStrength}"
              class="range-slider"
            />
          </div>

          <!-- Softness (Drift feather) Slider -->
          <div class="setting-item">
            <div class="setting-label-row">
              <label for="slider-drift-feather">Softness</label>
              <span class="setting-value" id="val-drift-feather">${Math.round(this.driftFeather * 100)}%</span>
            </div>
            <input
              type="range"
              id="slider-drift-feather"
              min="0.05"
              max="1.0"
              step="0.05"
              value="${this.driftFeather}"
              class="range-slider"
            />
          </div>

          <!-- Depth Extrusion Slider (0.0 to 1.0) -->
          <div class="setting-item">
            <div class="setting-label-row">
              <label for="slider-depth-scale">Depth</label>
              <span class="setting-value" id="val-depth-scale">${s.depthScale.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              id="slider-depth-scale"
              min="0.0"
              max="1.0"
              step="0.05"
              value="${s.depthScale}"
              class="range-slider"
            />
          </div>
        </div>

        <!-- Section: Quality -->
        <div class="settings-section">
          <h3 class="section-title">Quality</h3>

          <!-- Particle Count Slider (100k to 600k) -->
          <div class="setting-item">
            <div class="setting-label-row">
              <label for="slider-particle-count">Particle count</label>
              <span class="setting-value" id="val-particle-count">${this.formatCount(s.particleCount)}</span>
            </div>
            <input
              type="range"
              id="slider-particle-count"
              min="100000"
              max="600000"
              step="25000"
              value="${s.particleCount}"
              class="range-slider"
            />
          </div>

          <!-- Render Quality Segmented Control -->
          <div class="setting-item">
            <span class="setting-subhead" id="label-render-quality">Render quality</span>
            <div class="quality-segmented-control" role="radiogroup" aria-labelledby="label-render-quality">
              <button
                type="button"
                class="quality-seg-btn ${s.quality === 'STANDARD' ? 'active' : ''}"
                data-quality="STANDARD"
                role="radio"
                aria-checked="${s.quality === 'STANDARD'}"
              >
                Standard
              </button>
              <button
                type="button"
                class="quality-seg-btn ${s.quality === 'HIGH' ? 'active' : ''}"
                data-quality="HIGH"
                role="radio"
                aria-checked="${s.quality === 'HIGH'}"
              >
                High
              </button>
              <button
                type="button"
                class="quality-seg-btn ${s.quality === 'ULTRA' ? 'active' : ''}"
                data-quality="ULTRA"
                role="radio"
                aria-checked="${s.quality === 'ULTRA'}"
              >
                Ultra
              </button>
            </div>
            <span class="quality-note" id="quality-cost-note">
              ${QUALITY_NOTES[s.quality] || QUALITY_NOTES.HIGH}
            </span>
          </div>

          <!-- Adaptive 60 FPS Toggle -->
          <div class="setting-item toggle-item">
            <div class="toggle-text">
              <label for="toggle-adaptive-fps" class="toggle-label">Adaptive 60 FPS</label>
              <span class="toggle-description">Balances particle count to maintain 60 FPS</span>
            </div>
            <label class="switch">
              <input type="checkbox" id="toggle-adaptive-fps" ${s.adaptiveFPS ? 'checked' : ''} />
              <span class="slider-switch"></span>
            </label>
          </div>
        </div>

        <!-- Section: View -->
        <div class="settings-section">
          <h3 class="section-title">View</h3>

          <!-- Centre on subject Toggle -->
          <div class="setting-item toggle-item">
            <div class="toggle-text">
              <label for="toggle-center-on-content" class="toggle-label">Centre on subject</label>
              <span class="toggle-description">Centers viewport on subject visual mass</span>
            </div>
            <label class="switch">
              <input type="checkbox" id="toggle-center-on-content" ${s.centerOnContent !== false ? 'checked' : ''} />
              <span class="slider-switch"></span>
            </label>
          </div>

          <!-- Reset View -->
          <div class="setting-item action-item">
            <div class="setting-label-row">
              <span class="setting-label-text">Viewport camera</span>
              <span class="setting-shortcut">Key [0]</span>
            </div>
            <button type="button" id="btn-reset-view" class="btn-drawer-action" title="Reset camera zoom and pan (0)">
              ${ICONS.refresh}
              <span>Reset view</span>
            </button>
          </div>

          <!-- Inspect Depth Map -->
          <div class="setting-item action-item">
            <div class="setting-label-row">
              <span class="setting-label-text">Depth map inspector</span>
              <span class="setting-shortcut">Key [D]</span>
            </div>
            <button type="button" id="btn-show-depth-map" class="btn-drawer-action" title="View 2D monocular depth map">
              ${ICONS.layers}
              <span>Inspect depth map (D)</span>
            </button>
          </div>

          <!-- Active Overlays Pills -->
          <div class="setting-item">
            <span class="setting-subhead" id="label-overlay-layers">Overlay layers</span>
            <div class="drawer-overlays-grid" role="group" aria-labelledby="label-overlay-layers">
              ${OVERLAYS_LIST.map((item) => {
                const active = !!ov.active[item.name];
                return `
                  <button
                    type="button"
                    class="drawer-overlay-btn ${active ? 'active' : ''}"
                    data-overlay="${item.name}"
                    aria-pressed="${active}"
                  >
                    <span class="indicator-dot" aria-hidden="true"></span>
                    <span>${item.label}</span>
                  </button>
                `;
              }).join('')}
              <button
                type="button"
                class="drawer-overlay-btn ${isCropMarksActive ? 'active' : ''}"
                data-toggle="cropMarks"
                aria-pressed="${isCropMarksActive}"
              >
                <span class="indicator-dot" aria-hidden="true"></span>
                <span>Crop marks</span>
              </button>
            </div>
          </div>

          <!-- Line Weight Slider -->
          <div class="setting-item">
            <div class="setting-label-row">
              <label for="slider-line-weight">Overlay line weight</label>
              <span class="setting-value" id="val-line-weight">${ov.lineWeight.toFixed(1)}px</span>
            </div>
            <input
              type="range"
              id="slider-line-weight"
              min="0.5"
              max="4.0"
              step="0.1"
              value="${ov.lineWeight}"
              class="range-slider"
            />
          </div>

          <!-- Tracker Density Slider -->
          <div class="setting-item">
            <div class="setting-label-row">
              <label for="slider-tracker-density">Tracker density</label>
              <span class="setting-value" id="val-tracker-density">
                ${this.formatTrackerDensity(ov.trackerDensity)}
              </span>
            </div>
            <input
              type="range"
              id="slider-tracker-density"
              min="0.1"
              max="1.0"
              step="0.05"
              value="${ov.trackerDensity}"
              class="range-slider"
            />
          </div>

          <!-- Link Distance Threshold Slider -->
          <div class="setting-item">
            <div class="setting-label-row">
              <label for="slider-link-distance">Link distance threshold</label>
              <span class="setting-value" id="val-link-distance">${ov.linkDistanceThreshold.toFixed(3)}</span>
            </div>
            <input
              type="range"
              id="slider-link-distance"
              min="0.01"
              max="0.15"
              step="0.005"
              value="${ov.linkDistanceThreshold}"
              class="range-slider"
            />
          </div>

          <!-- Scan Speed Slider -->
          <div class="setting-item">
            <div class="setting-label-row">
              <label for="slider-scan-speed">Scan plane speed</label>
              <span class="setting-value" id="val-scan-speed">${ov.scanSpeed.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              id="slider-scan-speed"
              min="0.2"
              max="3.0"
              step="0.1"
              value="${ov.scanSpeed}"
              class="range-slider"
            />
          </div>

          <!-- Trail Persistence / Fade Slider -->
          <div class="setting-item">
            <div class="setting-label-row">
              <label for="slider-trail-fade">Trail persistence</label>
              <span class="setting-value" id="val-trail-fade">${ov.trailFade.toFixed(2)}</span>
            </div>
            <input
              type="range"
              id="slider-trail-fade"
              min="0.05"
              max="0.50"
              step="0.01"
              value="${ov.trailFade}"
              class="range-slider"
            />
          </div>

          <!-- Debug Readout Toggle -->
          <div class="setting-item toggle-item">
            <div class="toggle-text">
              <label for="toggle-debug-readout" class="toggle-label">Debug readout HUD</label>
              <span class="toggle-description">Compact readout (FPS, resolution, points, DPR, provider)</span>
            </div>
            <label class="switch">
              <input type="checkbox" id="toggle-debug-readout" ${s.debug ? 'checked' : ''} />
              <span class="slider-switch"></span>
            </label>
          </div>
        </div>

        <!-- Section: About -->
        <div class="settings-section">
          <h3 class="section-title">About</h3>

          <div class="about-card">
            <div class="about-card-header">
              <span class="about-model-name">Depth Anything V2 Small</span>
              <div class="depth-hud-pill depth-hud-${this.depthMode.toLowerCase()}">
                <span class="depth-hud-dot" aria-hidden="true"></span>
                <span class="depth-hud-mode">${this.formatModeLabel()}</span>
                <span class="depth-hud-divider" aria-hidden="true">/</span>
                <span class="depth-hud-provider">${this.formatProviderLabel()}</span>
              </div>
            </div>
            <p class="about-desc">
              Relative monocular depth estimation quantized for web deployment via ONNX Runtime Web. Computes continuous depth geometry directly in your browser.
            </p>
            <div class="about-security-badge">
              <span class="security-dot" aria-hidden="true"></span>
              <span>100% client-side. No telemetry or images leave your machine.</span>
            </div>
          </div>

          <div class="about-licenses">
            <span class="about-licenses-title">Open-source licenses</span>
            <ul class="license-list">
              <li><strong>Drift Engine:</strong> MIT License</li>
              <li><strong>Depth Anything V2:</strong> Apache License 2.0</li>
              <li><strong>ONNX Runtime Web:</strong> MIT License</li>
              <li><strong>Three.js:</strong> MIT License</li>
            </ul>
          </div>

          <button type="button" id="btn-open-credits" class="btn-drawer-action" title="View credits and full license text (C)">
            ${ICONS.info}
            <span>Credits &amp; licenses</span>
          </button>
        </div>

        <!-- Section: Reset Actions -->
        <div class="settings-actions">
          <button type="button" class="btn btn-secondary btn-reset-defaults" id="btn-reset-defaults">
            ${ICONS.refresh}
            <span>Reset to defaults</span>
          </button>
        </div>
      </div>
    `;

    this.bindInputs();
  }

  private bindInputs(): void {
    const closeBtn = this.container.querySelector('.drawer-close-btn');
    closeBtn?.addEventListener('click', () => this.close());

    // Palette Segmented Buttons
    const paletteBtns = this.container.querySelectorAll<HTMLButtonElement>('.palette-seg-btn');
    paletteBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const cm = btn.dataset.color as ColorMode | undefined;
        if (!cm) return;
        paletteBtns.forEach((b) => {
          b.classList.toggle('active', b === btn);
          b.setAttribute('aria-checked', b === btn ? 'true' : 'false');
        });
        this.settings.colorMode = cm;
        const dockSwatch = document.querySelector<HTMLButtonElement>(`.palette-swatch-btn[data-color="${cm}"]`);
        if (dockSwatch) {
          dockSwatch.click();
        } else {
          this.options.onSettingsChange({ colorMode: cm });
        }
      });
    });

    // Quality Preset Segmented Buttons
    const qualityBtns = this.container.querySelectorAll<HTMLButtonElement>('.quality-seg-btn');
    const qualityNote = this.container.querySelector('#quality-cost-note');
    qualityBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = btn.dataset.quality as QualityLevel | undefined;
        if (!q) return;
        qualityBtns.forEach((b) => {
          b.classList.toggle('active', b === btn);
          b.setAttribute('aria-checked', b === btn ? 'true' : 'false');
        });
        if (qualityNote) {
          qualityNote.textContent = QUALITY_NOTES[q];
        }
        this.settings.quality = q;
        this.options.onSettingsChange({ quality: q });
      });
    });

    // Intensity Slider
    const intSlider = this.container.querySelector<HTMLInputElement>('#slider-intensity');
    const intVal = this.container.querySelector('#val-intensity');
    intSlider?.addEventListener('input', () => {
      const val = parseFloat(intSlider.value);
      if (intVal) intVal.textContent = val.toFixed(2) + 'x';
      this.settings.intensity = val;
      this.options.onSettingsChange({ intensity: val });
    });

    // Particle Count Slider
    const pCountSlider = this.container.querySelector<HTMLInputElement>('#slider-particle-count');
    const pCountVal = this.container.querySelector('#val-particle-count');
    pCountSlider?.addEventListener('input', () => {
      const count = parseInt(pCountSlider.value, 10);
      if (pCountVal) pCountVal.textContent = this.formatCount(count);
      this.settings.particleCount = count;
      this.options.onSettingsChange({ particleCount: count });
    });

    // Point Size Slider
    const pSizeSlider = this.container.querySelector<HTMLInputElement>('#slider-point-size');
    const pSizeVal = this.container.querySelector('#val-point-size');
    pSizeSlider?.addEventListener('input', () => {
      const size = parseFloat(pSizeSlider.value);
      if (pSizeVal) pSizeVal.textContent = size.toFixed(1) + 'px';
      this.settings.pointSize = size;
      this.options.onSettingsChange({ pointSize: size });
    });

    // Depth Scale Slider
    const dScaleSlider = this.container.querySelector<HTMLInputElement>('#slider-depth-scale');
    const dScaleVal = this.container.querySelector('#val-depth-scale');
    dScaleSlider?.addEventListener('input', () => {
      const scale = parseFloat(dScaleSlider.value);
      if (dScaleVal) dScaleVal.textContent = scale.toFixed(2) + 'x';
      this.settings.depthScale = scale;
      this.options.onSettingsChange({ depthScale: scale });
    });

    // Softness (Drift Feather) Slider
    const featherSlider = this.container.querySelector<HTMLInputElement>('#slider-drift-feather');
    const featherVal = this.container.querySelector('#val-drift-feather');
    featherSlider?.addEventListener('input', () => {
      const feather = parseFloat(featherSlider.value);
      this.driftFeather = feather;
      if (featherVal) featherVal.textContent = `${Math.round(feather * 100)}%`;
      const dockSlider = document.querySelector<HTMLInputElement>('#drift-softness-slider');
      if (dockSlider) {
        dockSlider.value = String(feather);
        dockSlider.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    // Adaptive FPS Checkbox
    const fpsCheck = this.container.querySelector<HTMLInputElement>('#toggle-adaptive-fps');
    fpsCheck?.addEventListener('change', () => {
      const adaptive = fpsCheck.checked;
      this.settings.adaptiveFPS = adaptive;
      this.options.onSettingsChange({ adaptiveFPS: adaptive });
    });

    // Centre on subject Checkbox
    const centerOnContentCheck = this.container.querySelector<HTMLInputElement>('#toggle-center-on-content');
    centerOnContentCheck?.addEventListener('change', () => {
      const center = centerOnContentCheck.checked;
      this.settings.centerOnContent = center;
      this.options.onSettingsChange({ centerOnContent: center });
    });

    // Reset View Button
    const resetViewBtn = this.container.querySelector('#btn-reset-view');
    resetViewBtn?.addEventListener('click', () => {
      if (this.options.onZoomReset) {
        this.options.onZoomReset();
      } else {
        document.querySelector<HTMLButtonElement>('.btn-zoom-reset')?.click();
      }
    });

    // Debug Readout Toggle
    const debugCheck = this.container.querySelector<HTMLInputElement>('#toggle-debug-readout');
    debugCheck?.addEventListener('change', () => {
      const debug = debugCheck.checked;
      this.settings.debug = debug;
      this.options.onSettingsChange({ debug });
    });

    // Inspect Depth Map
    const depthBtn = this.container.querySelector('#btn-show-depth-map');
    depthBtn?.addEventListener('click', () => {
      if (this.options.onToggleDepthView) {
        this.options.onToggleDepthView();
      }
    });

    // Noise Speed Slider
    const nSpeedSlider = this.container.querySelector<HTMLInputElement>('#slider-noise-speed');
    const nSpeedVal = this.container.querySelector('#val-noise-speed');
    nSpeedSlider?.addEventListener('input', () => {
      const speed = parseFloat(nSpeedSlider.value);
      if (nSpeedVal) nSpeedVal.textContent = speed.toFixed(2);
      this.settings.noiseSpeed = speed;
      this.options.onSettingsChange({ noiseSpeed: speed });
    });

    // Noise Strength Slider
    const nStrSlider = this.container.querySelector<HTMLInputElement>('#slider-noise-strength');
    const nStrVal = this.container.querySelector('#val-noise-strength');
    nStrSlider?.addEventListener('input', () => {
      const str = parseFloat(nStrSlider.value);
      if (nStrVal) nStrVal.textContent = str.toFixed(2);
      this.settings.noiseStrength = str;
      this.options.onSettingsChange({ noiseStrength: str });
    });

    // Splash Strength Slider
    const splSlider = this.container.querySelector<HTMLInputElement>('#slider-splash-strength');
    const splVal = this.container.querySelector('#val-splash-strength');
    splSlider?.addEventListener('input', () => {
      const spl = parseFloat(splSlider.value);
      if (splVal) splVal.textContent = spl.toFixed(2);
      this.settings.splashStrength = spl;
      this.options.onSettingsChange({ splashStrength: spl });
    });

    // Overlay Toggles Grid
    const overlayBtns = this.container.querySelectorAll<HTMLButtonElement>('.drawer-overlay-btn');
    overlayBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const overlayName = btn.dataset.overlay as OverlayName | undefined;
        const toggleType = btn.dataset.toggle;

        if (toggleType === 'cropMarks') {
          const current = this.settings.overlays.cropMarks !== false;
          const updated = !current;
          btn.classList.toggle('active', updated);
          btn.setAttribute('aria-pressed', updated ? 'true' : 'false');
          this.settings.overlays.cropMarks = updated;
          this.options.onSettingsChange({ overlays: { ...this.settings.overlays, cropMarks: updated } });
          return;
        }

        if (overlayName) {
          const current = !!this.settings.overlays.active[overlayName];
          const updated = !current;
          btn.classList.toggle('active', updated);
          btn.setAttribute('aria-pressed', updated ? 'true' : 'false');
          this.settings.overlays.active[overlayName] = updated;
          this.options.onSettingsChange({
            overlays: {
              ...this.settings.overlays,
              active: { ...this.settings.overlays.active, [overlayName]: updated },
            },
          });
        }
      });
    });

    // Line Weight Slider
    const lwSlider = this.container.querySelector<HTMLInputElement>('#slider-line-weight');
    const lwVal = this.container.querySelector('#val-line-weight');
    lwSlider?.addEventListener('input', () => {
      const lw = parseFloat(lwSlider.value);
      if (lwVal) lwVal.textContent = lw.toFixed(1) + 'px';
      this.settings.overlays.lineWeight = lw;
      this.options.onSettingsChange({ overlays: { ...this.settings.overlays, lineWeight: lw } });
    });

    // Tracker Density Slider
    const tdSlider = this.container.querySelector<HTMLInputElement>('#slider-tracker-density');
    const tdVal = this.container.querySelector('#val-tracker-density');
    tdSlider?.addEventListener('input', () => {
      const td = parseFloat(tdSlider.value);
      if (tdVal) tdVal.textContent = this.formatTrackerDensity(td);
      this.settings.overlays.trackerDensity = td;
      this.options.onSettingsChange({ overlays: { ...this.settings.overlays, trackerDensity: td } });
    });

    // Link Distance Threshold Slider
    const ldSlider = this.container.querySelector<HTMLInputElement>('#slider-link-distance');
    const ldVal = this.container.querySelector('#val-link-distance');
    ldSlider?.addEventListener('input', () => {
      const ld = parseFloat(ldSlider.value);
      if (ldVal) ldVal.textContent = ld.toFixed(3);
      this.settings.overlays.linkDistanceThreshold = ld;
      this.options.onSettingsChange({ overlays: { ...this.settings.overlays, linkDistanceThreshold: ld } });
    });

    // Scan Speed Slider
    const scSlider = this.container.querySelector<HTMLInputElement>('#slider-scan-speed');
    const scVal = this.container.querySelector('#val-scan-speed');
    scSlider?.addEventListener('input', () => {
      const sc = parseFloat(scSlider.value);
      if (scVal) scVal.textContent = sc.toFixed(2) + 'x';
      this.settings.overlays.scanSpeed = sc;
      this.options.onSettingsChange({ overlays: { ...this.settings.overlays, scanSpeed: sc } });
    });

    // Trail Fade Slider
    const tfSlider = this.container.querySelector<HTMLInputElement>('#slider-trail-fade');
    const tfVal = this.container.querySelector('#val-trail-fade');
    tfSlider?.addEventListener('input', () => {
      const tf = parseFloat(tfSlider.value);
      if (tfVal) tfVal.textContent = tf.toFixed(2);
      this.settings.overlays.trailFade = tf;
      this.options.onSettingsChange({ overlays: { ...this.settings.overlays, trailFade: tf } });
    });

    // Credits Button
    const creditsBtn = this.container.querySelector('#btn-open-credits');
    creditsBtn?.addEventListener('click', () => {
      this.close();
      if (this.options.onOpenCredits) {
        this.options.onOpenCredits();
      } else {
        document.querySelector<HTMLButtonElement>('.btn-credits')?.click();
      }
    });

    // Reset Defaults
    const resetBtn = this.container.querySelector('#btn-reset-defaults');
    resetBtn?.addEventListener('click', () => {
      this.driftFeather = 0.35;
      const dockSlider = document.querySelector<HTMLInputElement>('#drift-softness-slider');
      if (dockSlider) {
        dockSlider.value = '0.35';
        dockSlider.dispatchEvent(new Event('input', { bubbles: true }));
      }
      this.setSlider('#slider-drift-feather', '#val-drift-feather', 0.35, '35%');
      this.options.onResetDefaults();
    });
  }
}
