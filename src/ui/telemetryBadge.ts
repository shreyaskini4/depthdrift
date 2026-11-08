/**
 * Live Debug Telemetry Readout for Drift
 * Displays compact real-time FPS, Canvas Resolution, Point Count, DPR, and Execution Provider (WebGPU/WASM/Heuristic).
 * Positioned in the bottom-left corner and visible ONLY when URL contains `?debug` or debug toggle is active.
 * Throttled to ~250ms to prevent visual jitter and layout thrashing.
 */

export interface TelemetryData {
  fps: number;
  width: number;
  height: number;
  particleCount?: number;
  dpr?: number;
  provider?: string;
}

export class TelemetryBadge {
  private container: HTMLElement;
  private lastUpdateTime: number = 0;
  private readonly updateIntervalMs: number = 250; // Throttled updates to prevent flickering

  private fpsEl: HTMLElement | null = null;
  private resEl: HTMLElement | null = null;
  private dotEl: HTMLElement | null = null;
  private ptsEl: HTMLElement | null = null;
  private dprEl: HTMLElement | null = null;
  private providerEl: HTMLElement | null = null;

  private currentFps: number = 60;
  private currentWidth: number = 0;
  private currentHeight: number = 0;
  private currentPts: number = 450000;
  private currentDpr: number = 1.0;
  private currentProvider: 'WebGPU' | 'WASM' | 'Heuristic' = 'WebGPU';
  private isDebugMode: boolean = false;

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'telemetry-badge glassmorphic-panel debug-readout';
    this.container.setAttribute('role', 'status');
    this.container.setAttribute('aria-label', 'System Debug Telemetry Readout');

    // Auto-detect default provider capability
    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      this.currentProvider = 'WebGPU';
    } else {
      this.currentProvider = 'WASM';
    }

    if (typeof window !== 'undefined' && window.devicePixelRatio) {
      this.currentDpr = Math.min(window.devicePixelRatio, 3.0);
    }

    this.render();
    parent.appendChild(this.container);

    // Initial visibility check against URL '?debug' and debug flag
    this.updateVisibility();
  }

  public isDebugActive(): boolean {
    const urlHasDebug =
      typeof window !== 'undefined' &&
      window.location.search.toLowerCase().includes('debug');
    return urlHasDebug || this.isDebugMode;
  }

  public setDebug(debug: boolean): void {
    this.isDebugMode = debug;
    this.updateVisibility();
  }

  public setProvider(provider: string): void {
    const p = provider.toLowerCase();
    if (p.includes('webgpu')) {
      this.currentProvider = 'WebGPU';
    } else if (p.includes('wasm')) {
      this.currentProvider = 'WASM';
    } else {
      this.currentProvider = 'Heuristic';
    }
    if (this.providerEl) {
      this.providerEl.textContent = this.currentProvider;
    }
  }

  public updateVisibility(): void {
    const active = this.isDebugActive();
    this.container.style.display = active ? 'block' : 'none';
  }

  public update(data: TelemetryData): void {
    const now = performance.now();
    this.currentFps = data.fps;
    this.currentWidth = Math.round(data.width);
    this.currentHeight = Math.round(data.height);
    if (data.particleCount !== undefined) {
      this.currentPts = data.particleCount;
    }
    if (data.dpr !== undefined) {
      this.currentDpr = data.dpr;
    }
    if (data.provider !== undefined) {
      this.setProvider(data.provider);
    }

    // Always recheck visibility in case URL or state changed
    this.updateVisibility();

    // Throttle DOM mutations to ~250ms to prevent visual jitter
    if (now - this.lastUpdateTime < this.updateIntervalMs) {
      return;
    }
    this.lastUpdateTime = now;
    this.applyDomUpdate();
  }

  private applyDomUpdate(): void {
    if (!this.isDebugActive()) {
      this.container.style.display = 'none';
      return;
    }

    if (!this.fpsEl || !this.resEl) return;

    const fpsRound = Math.round(this.currentFps);
    this.fpsEl.textContent = `${fpsRound} FPS`;

    // Dynamic color dot based on performance
    if (this.dotEl) {
      this.dotEl.className = 'telemetry-dot';
      if (fpsRound >= 55) {
        this.dotEl.classList.add('dot-good');
      } else if (fpsRound >= 35) {
        this.dotEl.classList.add('dot-warn');
      } else {
        this.dotEl.classList.add('dot-poor');
      }
    }

    this.resEl.textContent = `${this.currentWidth}×${this.currentHeight}`;

    if (this.ptsEl) {
      const kPts = Math.round(this.currentPts / 1000);
      this.ptsEl.textContent = `${kPts}k pts`;
    }

    if (this.dprEl) {
      this.dprEl.textContent = `${this.currentDpr.toFixed(1)}x DPR`;
    }

    if (this.providerEl) {
      this.providerEl.textContent = this.currentProvider;
    }
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="telemetry-pill-inner">
        <span class="telemetry-dot dot-good" aria-hidden="true"></span>
        <span class="telemetry-item telemetry-fps">60 FPS</span>
        <span class="telemetry-sep" aria-hidden="true">·</span>
        <span class="telemetry-item telemetry-res">--×--</span>
        <span class="telemetry-sep" aria-hidden="true">·</span>
        <span class="telemetry-item telemetry-pts">--k pts</span>
        <span class="telemetry-sep" aria-hidden="true">·</span>
        <span class="telemetry-item telemetry-dpr">1.0x DPR</span>
        <span class="telemetry-sep" aria-hidden="true">·</span>
        <span class="telemetry-item telemetry-provider">${this.currentProvider}</span>
      </div>
    `;

    this.fpsEl = this.container.querySelector('.telemetry-fps');
    this.resEl = this.container.querySelector('.telemetry-res');
    this.dotEl = this.container.querySelector('.telemetry-dot');
    this.ptsEl = this.container.querySelector('.telemetry-pts');
    this.dprEl = this.container.querySelector('.telemetry-dpr');
    this.providerEl = this.container.querySelector('.telemetry-provider');
  }

  public setVisible(visible: boolean): void {
    this.container.style.display = visible && this.isDebugActive() ? 'block' : 'none';
  }

  public destroy(): void {
    this.container.remove();
  }
}
