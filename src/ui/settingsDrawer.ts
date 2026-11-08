/**
 * Collapsible Settings Drawer for Drift
 * Sliders with live numeric feedback, adaptive FPS switch, and reset action.
 */

import type { ParticleSettings } from '@/types';
import { ICONS } from './icons';

export interface SettingsDrawerOptions {
  onSettingsChange: (settings: Partial<ParticleSettings>) => void;
  onResetDefaults: () => void;
  onClose: () => void;
  onToggleDepthView?: () => void;
}

export class SettingsDrawer {
  private container: HTMLElement;
  private backdrop: HTMLElement;
  private options: SettingsDrawerOptions;
  private settings: ParticleSettings;
  private isOpen: boolean = false;

  constructor(parent: HTMLElement, initialSettings: ParticleSettings, options: SettingsDrawerOptions) {
    this.options = options;
    this.settings = JSON.parse(JSON.stringify(initialSettings));

    this.backdrop = document.createElement('div');
    this.backdrop.className = 'drawer-backdrop';
    this.backdrop.addEventListener('click', () => this.close());

    this.container = document.createElement('div');
    this.container.className = 'settings-drawer-panel';
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-modal', 'true');
    this.container.setAttribute('aria-label', 'Engine Settings');

    this.render();
    parent.appendChild(this.backdrop);
    parent.appendChild(this.container);
  }

  public updateSettings(settings: ParticleSettings): void {
    this.settings = JSON.parse(JSON.stringify(settings));
    this.render();
  }

  public open(): void {
    this.isOpen = true;
    this.backdrop.classList.add('active');
    this.container.classList.add('open');
  }

  public close(): void {
    this.isOpen = false;
    this.backdrop.classList.remove('active');
    this.container.classList.remove('open');
    this.options.onClose();
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

  public render(): void {
    const s = this.settings;
    const ov = s.overlays;

    this.container.innerHTML = `
      <div class="drawer-header">
        <div class="drawer-title-group">
          <h2 class="drawer-title">Simulation Settings</h2>
          <span class="drawer-subtitle">Particle & HUD Parameters</span>
        </div>
        <button class="drawer-close-btn" aria-label="Close Settings (Esc)" title="Close Settings (Esc)">
          ${ICONS.close}
        </button>
      </div>

      <div class="drawer-body">
        <!-- Section: Particles & Depth -->
        <div class="settings-section">
          <h3 class="section-title">Particles & Geometry</h3>

          <!-- Particle Count -->
          <div class="setting-item">
            <div class="setting-label-row">
              <label for="slider-particle-count">Particle Count</label>
              <span class="setting-value" id="val-particle-count">${this.formatCount(s.particleCount)}</span>
            </div>
            <input 
              type="range" 
              id="slider-particle-count" 
              min="50000" 
              max="200000" 
              step="5000" 
              value="${s.particleCount}" 
              class="range-slider"
            />
          </div>

          <!-- Point Size -->
          <div class="setting-item">
            <div class="setting-label-row">
              <label for="slider-point-size">Point Size</label>
              <span class="setting-value" id="val-point-size">${s.pointSize.toFixed(1)}px</span>
            </div>
            <input 
              type="range" 
              id="slider-point-size" 
              min="1.0" 
              max="6.0" 
              step="0.1" 
              value="${s.pointSize}" 
              class="range-slider"
            />
          </div>

          <!-- Depth Scale -->
          <div class="setting-item">
            <div class="setting-label-row">
              <label for="slider-depth-scale">Depth Extrusion Scale</label>
              <span class="setting-value" id="val-depth-scale">${s.depthScale.toFixed(2)}x</span>
            </div>
            <input 
              type="range" 
              id="slider-depth-scale" 
              min="0.2" 
              max="3.0" 
              step="0.05" 
              value="${s.depthScale}" 
              class="range-slider"
            />
          </div>

          <!-- Adaptive 60 FPS Toggle -->
          <div class="setting-item toggle-item">
            <div class="toggle-text">
              <label for="toggle-adaptive-fps" class="toggle-label">Adaptive 60 FPS</label>
              <span class="toggle-description">Dynamically tunes particle count on mobile/low-end GPUs</span>
            </div>
            <label class="switch">
              <input type="checkbox" id="toggle-adaptive-fps" ${s.adaptiveFPS ? 'checked' : ''} />
              <span class="slider-switch"></span>
            </label>
          </div>

          <!-- Inspect Depth Map -->
          <div class="setting-item action-item">
            <div class="setting-label-row">
              <label>Depth Map Inspector</label>
              <span class="setting-shortcut">Key [D]</span>
            </div>
            <button id="btn-show-depth-map" class="btn-drawer-action" title="View 2D Monocular Depth Map">
              ${ICONS.layers}
              <span>Inspect Depth Map (D)</span>
            </button>
          </div>
        </div>

        <!-- Section: Motion & Dynamics -->
        <div class="settings-section">
          <h3 class="section-title">Motion Dynamics</h3>

          <!-- Noise Speed -->
          <div class="setting-item">
            <div class="setting-label-row">
              <label for="slider-noise-speed">Noise Animation Speed</label>
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

          <!-- Noise Strength -->
          <div class="setting-item">
            <div class="setting-label-row">
              <label for="slider-noise-strength">Noise Displacement Amplitude</label>
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

          <!-- Splash Strength -->
          <div class="setting-item">
            <div class="setting-label-row">
              <label for="slider-splash-strength">Splash Impulse Strength</label>
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
        </div>

        <!-- Section: HUD & Overlays -->
        <div class="settings-section">
          <h3 class="section-title">HUD & Overlay Parameters</h3>

          <!-- Line Weight -->
          <div class="setting-item">
            <div class="setting-label-row">
              <label for="slider-line-weight">Overlay Line Weight</label>
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

          <!-- Tracker Density -->
          <div class="setting-item">
            <div class="setting-label-row">
              <label for="slider-tracker-density">Tracker Density</label>
              <span class="setting-value" id="val-tracker-density">
                ${ov.trackerDensity <= 0.3 ? 'SPARSE' : ov.trackerDensity >= 0.7 ? 'DENSE' : 'BALANCED'} (${ov.trackerDensity.toFixed(2)})
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

          <!-- Link Distance Threshold -->
          <div class="setting-item">
            <div class="setting-label-row">
              <label for="slider-link-distance">Link Distance Threshold</label>
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

          <!-- Scan Speed -->
          <div class="setting-item">
            <div class="setting-label-row">
              <label for="slider-scan-speed">Scan Plane Speed</label>
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

          <!-- Trail Persistence / Fade -->
          <div class="setting-item">
            <div class="setting-label-row">
              <label for="slider-trail-fade">Trail Persistence (Fade)</label>
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
        </div>

        <!-- Section: Actions -->
        <div class="settings-actions">
          <button class="btn btn-secondary btn-reset-defaults" id="btn-reset-defaults">
            ${ICONS.refresh}
            <span>Reset to Defaults</span>
          </button>
        </div>
      </div>
    `;

    this.bindInputs();
  }

  private bindInputs(): void {
    const closeBtn = this.container.querySelector('.drawer-close-btn');
    closeBtn?.addEventListener('click', () => this.close());

    // Particle Count
    const pCountSlider = this.container.querySelector<HTMLInputElement>('#slider-particle-count');
    const pCountVal = this.container.querySelector('#val-particle-count');
    pCountSlider?.addEventListener('input', () => {
      const count = parseInt(pCountSlider.value, 10);
      if (pCountVal) pCountVal.textContent = this.formatCount(count);
      this.settings.particleCount = count;
      this.options.onSettingsChange({ particleCount: count });
    });

    // Point Size
    const pSizeSlider = this.container.querySelector<HTMLInputElement>('#slider-point-size');
    const pSizeVal = this.container.querySelector('#val-point-size');
    pSizeSlider?.addEventListener('input', () => {
      const size = parseFloat(pSizeSlider.value);
      if (pSizeVal) pSizeVal.textContent = size.toFixed(1) + 'px';
      this.settings.pointSize = size;
      this.options.onSettingsChange({ pointSize: size });
    });

    // Depth Scale
    const dScaleSlider = this.container.querySelector<HTMLInputElement>('#slider-depth-scale');
    const dScaleVal = this.container.querySelector('#val-depth-scale');
    dScaleSlider?.addEventListener('input', () => {
      const scale = parseFloat(dScaleSlider.value);
      if (dScaleVal) dScaleVal.textContent = scale.toFixed(2) + 'x';
      this.settings.depthScale = scale;
      this.options.onSettingsChange({ depthScale: scale });
    });

    // Adaptive FPS
    const fpsCheck = this.container.querySelector<HTMLInputElement>('#toggle-adaptive-fps');
    fpsCheck?.addEventListener('change', () => {
      const adaptive = fpsCheck.checked;
      this.settings.adaptiveFPS = adaptive;
      this.options.onSettingsChange({ adaptiveFPS: adaptive });
    });

    // Inspect Depth Map
    const depthBtn = this.container.querySelector('#btn-show-depth-map');
    depthBtn?.addEventListener('click', () => {
      if (this.options.onToggleDepthView) {
        this.options.onToggleDepthView();
      }
    });

    // Noise Speed
    const nSpeedSlider = this.container.querySelector<HTMLInputElement>('#slider-noise-speed');
    const nSpeedVal = this.container.querySelector('#val-noise-speed');
    nSpeedSlider?.addEventListener('input', () => {
      const speed = parseFloat(nSpeedSlider.value);
      if (nSpeedVal) nSpeedVal.textContent = speed.toFixed(2);
      this.settings.noiseSpeed = speed;
      this.options.onSettingsChange({ noiseSpeed: speed });
    });

    // Noise Strength
    const nStrSlider = this.container.querySelector<HTMLInputElement>('#slider-noise-strength');
    const nStrVal = this.container.querySelector('#val-noise-strength');
    nStrSlider?.addEventListener('input', () => {
      const str = parseFloat(nStrSlider.value);
      if (nStrVal) nStrVal.textContent = str.toFixed(2);
      this.settings.noiseStrength = str;
      this.options.onSettingsChange({ noiseStrength: str });
    });

    // Splash Strength
    const splSlider = this.container.querySelector<HTMLInputElement>('#slider-splash-strength');
    const splVal = this.container.querySelector('#val-splash-strength');
    splSlider?.addEventListener('input', () => {
      const spl = parseFloat(splSlider.value);
      if (splVal) splVal.textContent = spl.toFixed(2);
      this.settings.splashStrength = spl;
      this.options.onSettingsChange({ splashStrength: spl });
    });

    // Line Weight
    const lwSlider = this.container.querySelector<HTMLInputElement>('#slider-line-weight');
    const lwVal = this.container.querySelector('#val-line-weight');
    lwSlider?.addEventListener('input', () => {
      const lw = parseFloat(lwSlider.value);
      if (lwVal) lwVal.textContent = lw.toFixed(1) + 'px';
      this.settings.overlays.lineWeight = lw;
      this.options.onSettingsChange({ overlays: { ...this.settings.overlays, lineWeight: lw } });
    });

    // Tracker Density
    const tdSlider = this.container.querySelector<HTMLInputElement>('#slider-tracker-density');
    const tdVal = this.container.querySelector('#val-tracker-density');
    tdSlider?.addEventListener('input', () => {
      const td = parseFloat(tdSlider.value);
      const desc = td <= 0.3 ? 'SPARSE' : td >= 0.7 ? 'DENSE' : 'BALANCED';
      if (tdVal) tdVal.textContent = `${desc} (${td.toFixed(2)})`;
      this.settings.overlays.trackerDensity = td;
      this.options.onSettingsChange({ overlays: { ...this.settings.overlays, trackerDensity: td } });
    });

    // Link Distance Threshold
    const ldSlider = this.container.querySelector<HTMLInputElement>('#slider-link-distance');
    const ldVal = this.container.querySelector('#val-link-distance');
    ldSlider?.addEventListener('input', () => {
      const ld = parseFloat(ldSlider.value);
      if (ldVal) ldVal.textContent = ld.toFixed(3);
      this.settings.overlays.linkDistanceThreshold = ld;
      this.options.onSettingsChange({ overlays: { ...this.settings.overlays, linkDistanceThreshold: ld } });
    });

    // Scan Speed
    const scSlider = this.container.querySelector<HTMLInputElement>('#slider-scan-speed');
    const scVal = this.container.querySelector('#val-scan-speed');
    scSlider?.addEventListener('input', () => {
      const sc = parseFloat(scSlider.value);
      if (scVal) scVal.textContent = sc.toFixed(2) + 'x';
      this.settings.overlays.scanSpeed = sc;
      this.options.onSettingsChange({ overlays: { ...this.settings.overlays, scanSpeed: sc } });
    });

    // Trail Fade
    const tfSlider = this.container.querySelector<HTMLInputElement>('#slider-trail-fade');
    const tfVal = this.container.querySelector('#val-trail-fade');
    tfSlider?.addEventListener('input', () => {
      const tf = parseFloat(tfSlider.value);
      if (tfVal) tfVal.textContent = tf.toFixed(2);
      this.settings.overlays.trailFade = tf;
      this.options.onSettingsChange({ overlays: { ...this.settings.overlays, trailFade: tf } });
    });

    // Reset Defaults
    const resetBtn = this.container.querySelector('#btn-reset-defaults');
    resetBtn?.addEventListener('click', () => {
      this.options.onResetDefaults();
    });
  }
}
