/**
 * Live Telemetry Badge for Drift
 * Displays real-time FPS, Canvas Resolution, and DPR/Particle metrics in a dedicated non-overlapping pill.
 * Throttled to ~250ms to prevent visual jitter and layout thrashing while reflecting actual frame performance.
 */

export interface TelemetryData {
  fps: number;
  width: number;
  height: number;
  particleCount?: number;
  dpr?: number;
}

export class TelemetryBadge {
  private container: HTMLElement;
  private lastUpdateTime: number = 0;
  private readonly updateIntervalMs: number = 250; // Throttled updates to prevent flickering

  private fpsEl: HTMLElement | null = null;
  private resEl: HTMLElement | null = null;
  private dotEl: HTMLElement | null = null;
  private ptsEl: HTMLElement | null = null;

  private currentFps: number = 60;
  private currentWidth: number = 0;
  private currentHeight: number = 0;
  private currentPts: number = 0;

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'telemetry-badge glassmorphic-panel';
    this.container.setAttribute('role', 'status');
    this.container.setAttribute('aria-label', 'Realtime System Telemetry');
    this.render();
    parent.appendChild(this.container);
  }

  public update(data: TelemetryData): void {
    const now = performance.now();
    this.currentFps = data.fps;
    this.currentWidth = Math.round(data.width);
    this.currentHeight = Math.round(data.height);
    if (data.particleCount !== undefined) {
      this.currentPts = data.particleCount;
    }

    // Throttle DOM mutations to ~250ms to prevent visual jitter
    if (now - this.lastUpdateTime < this.updateIntervalMs) {
      return;
    }
    this.lastUpdateTime = now;
    this.applyDomUpdate();
  }

  private applyDomUpdate(): void {
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
      if (this.currentPts > 0) {
        const kPts = Math.round(this.currentPts / 1000);
        this.ptsEl.textContent = `${kPts}K PTS`;
        this.ptsEl.style.display = 'inline';
      } else {
        this.ptsEl.style.display = 'none';
      }
    }
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="telemetry-pill-inner">
        <span class="telemetry-dot dot-good" aria-hidden="true"></span>
        <span class="telemetry-item telemetry-fps">60 FPS</span>
        <span class="telemetry-sep" aria-hidden="true">/</span>
        <span class="telemetry-item telemetry-res">--×--</span>
        <span class="telemetry-sep telemetry-pts-sep" aria-hidden="true">/</span>
        <span class="telemetry-item telemetry-pts"></span>
      </div>
    `;

    this.fpsEl = this.container.querySelector('.telemetry-fps');
    this.resEl = this.container.querySelector('.telemetry-res');
    this.dotEl = this.container.querySelector('.telemetry-dot');
    this.ptsEl = this.container.querySelector('.telemetry-pts');
  }

  public setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'block' : 'none';
  }

  public destroy(): void {
    this.container.remove();
  }
}
