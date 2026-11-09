/**
 * Live Debug Telemetry Readout for Drift
 * Displays compact real-time FPS, Canvas Resolution, Point Count, DPR, Execution Provider (WebGPU/WASM/Heuristic),
 * and iCamera telemetry: yaw (deg), pitch (deg), zoom, pan (x, y), and the pointerdown target tag / element name.
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
  yaw?: number;
  pitch?: number;
  zoom?: number;
  panX?: number;
  panY?: number;
  pointerTarget?: string;
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
  private yawEl: HTMLElement | null = null;
  private pitchEl: HTMLElement | null = null;
  private zoomEl: HTMLElement | null = null;
  private panEl: HTMLElement | null = null;
  private targetEl: HTMLElement | null = null;

  private currentFps: number = 60;
  private currentWidth: number = 0;
  private currentHeight: number = 0;
  private currentPts: number = 450000;
  private currentDpr: number = 1.0;
  private currentProvider: 'WebGPU' | 'WASM' | 'Heuristic' = 'WebGPU';
  private currentYaw: number = 0;
  private currentPitch: number = 0;
  private currentZoom: number = 1.0;
  private currentPanX: number = 0;
  private currentPanY: number = 0;
  private currentPointerTarget: string = 'canvas#particle-canvas';
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

    // Global capture listener to track exact pointerdown target element name & tag
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', this.onGlobalPointerDown, {
        capture: true,
        passive: true,
      });
    }

    // Initial visibility check against URL '?debug' and debug flag
    this.updateVisibility();
  }

  private onGlobalPointerDown = (e: PointerEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target) {
      const tag = target.tagName ? target.tagName.toLowerCase() : '';
      let desc = tag;
      if (target.id) {
        desc += `#${target.id}`;
      } else if (target.className && typeof target.className === 'string') {
        const cls = target.className.trim().split(/\s+/)[0];
        if (cls) desc += `.${cls}`;
      }

      // If clicked inside a button or control, include host container
      const hostBtn = target.closest('button');
      if (hostBtn && hostBtn !== target) {
        let btnDesc = hostBtn.tagName.toLowerCase();
        if (hostBtn.id) {
          btnDesc += `#${hostBtn.id}`;
        } else if (hostBtn.className && typeof hostBtn.className === 'string') {
          const btnCls = hostBtn.className.trim().split(/\s+/)[0];
          if (btnCls) btnDesc += `.${btnCls}`;
        }
        desc = `${btnDesc} > ${desc}`;
      }

      this.currentPointerTarget = desc || tag || 'canvas';
      if (this.targetEl) {
        this.targetEl.textContent = `target: <${this.currentPointerTarget}>`;
        this.targetEl.setAttribute('data-target', this.currentPointerTarget);
        this.targetEl.setAttribute('data-tag', tag);
      }
    }
  };

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
    if (data.yaw !== undefined) {
      this.currentYaw = data.yaw;
    }
    if (data.pitch !== undefined) {
      this.currentPitch = data.pitch;
    }
    if (data.zoom !== undefined) {
      this.currentZoom = data.zoom;
    }
    if (data.panX !== undefined) {
      this.currentPanX = data.panX;
    }
    if (data.panY !== undefined) {
      this.currentPanY = data.panY;
    }
    if (data.pointerTarget !== undefined) {
      this.currentPointerTarget = data.pointerTarget;
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

    if (this.yawEl) {
      const yawDeg = (this.currentYaw * 180) / Math.PI;
      this.yawEl.textContent = `yaw: ${yawDeg >= 0 ? '+' : ''}${yawDeg.toFixed(1)}°`;
      this.yawEl.setAttribute('data-yaw-deg', yawDeg.toFixed(1));
    }

    if (this.pitchEl) {
      const pitchDeg = (this.currentPitch * 180) / Math.PI;
      this.pitchEl.textContent = `pitch: ${pitchDeg >= 0 ? '+' : ''}${pitchDeg.toFixed(1)}°`;
      this.pitchEl.setAttribute('data-pitch-deg', pitchDeg.toFixed(1));
    }

    if (this.zoomEl) {
      this.zoomEl.textContent = `zoom: ${this.currentZoom.toFixed(2)}x`;
      this.zoomEl.setAttribute('data-zoom', this.currentZoom.toFixed(2));
    }

    if (this.panEl) {
      this.panEl.textContent = `pan: (${this.currentPanX.toFixed(2)}, ${this.currentPanY.toFixed(2)})`;
      this.panEl.setAttribute('data-pan-x', this.currentPanX.toFixed(2));
      this.panEl.setAttribute('data-pan-y', this.currentPanY.toFixed(2));
    }

    if (this.targetEl) {
      this.targetEl.textContent = `target: <${this.currentPointerTarget}>`;
      this.targetEl.setAttribute('data-target', this.currentPointerTarget);
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
        <span class="telemetry-sep" aria-hidden="true">·</span>
        <span class="telemetry-item telemetry-yaw" title="Camera Yaw (deg)">yaw: +0.0°</span>
        <span class="telemetry-sep" aria-hidden="true">·</span>
        <span class="telemetry-item telemetry-pitch" title="Camera Pitch (deg)">pitch: +0.0°</span>
        <span class="telemetry-sep" aria-hidden="true">·</span>
        <span class="telemetry-item telemetry-zoom" title="Camera Zoom">zoom: 1.00x</span>
        <span class="telemetry-sep" aria-hidden="true">·</span>
        <span class="telemetry-item telemetry-pan" title="Camera Pan (x, y)">pan: (0.00, 0.00)</span>
        <span class="telemetry-sep" aria-hidden="true">·</span>
        <span class="telemetry-item telemetry-target" title="Last pointerdown target element">target: &lt;${this.currentPointerTarget}&gt;</span>
      </div>
    `;

    this.fpsEl = this.container.querySelector('.telemetry-fps');
    this.resEl = this.container.querySelector('.telemetry-res');
    this.dotEl = this.container.querySelector('.telemetry-dot');
    this.ptsEl = this.container.querySelector('.telemetry-pts');
    this.dprEl = this.container.querySelector('.telemetry-dpr');
    this.providerEl = this.container.querySelector('.telemetry-provider');
    this.yawEl = this.container.querySelector('.telemetry-yaw');
    this.pitchEl = this.container.querySelector('.telemetry-pitch');
    this.zoomEl = this.container.querySelector('.telemetry-zoom');
    this.panEl = this.container.querySelector('.telemetry-pan');
    this.targetEl = this.container.querySelector('.telemetry-target');
  }

  public setVisible(visible: boolean): void {
    this.container.style.display = visible && this.isDebugActive() ? 'block' : 'none';
  }

  public destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.onGlobalPointerDown, {
        capture: true,
      });
    }
    this.container.remove();
  }
}
