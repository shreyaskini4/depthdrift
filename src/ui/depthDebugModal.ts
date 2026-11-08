/**
 * Depth Map Debug Inspector Modal for Drift
 * 
 * Provides an instant visual verification HUD of the computed monocular depth map:
 * - 1.0 (White): Closest to camera / foreground extrusion
 * - 0.0 (Black): Furthest away / background plane
 * - Real-time statistics telemetry (Min, Max, Mean, Std, Resolution)
 * - Inversion toggle to inspect metric vs disparity orientations
 * - Depth map PNG export for debugging and analysis
 */

import type { DepthResult } from '@/types';
import { computeDepthStats } from '@/depth';
import { ICONS } from './icons';

export interface DepthDebugModalOptions {
  onClose: () => void;
}

export class DepthDebugModal {
  private container: HTMLElement;
  private backdrop: HTMLElement;
  private options: DepthDebugModalOptions;
  private activeDepthResult?: DepthResult;
  private activeFileName: string = '';
  private isInverted: boolean = false;
  private isModalOpen: boolean = false;

  constructor(parent: HTMLElement, options: DepthDebugModalOptions) {
    this.options = options;

    this.backdrop = document.createElement('div');
    this.backdrop.className = 'depth-debug-backdrop';
    this.backdrop.addEventListener('click', () => this.close());

    this.container = document.createElement('div');
    this.container.className = 'depth-debug-panel glassmorphic-panel';
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-modal', 'true');
    this.container.setAttribute('aria-label', 'Monocular Depth Map Inspector');

    this.render();
    parent.appendChild(this.backdrop);
    parent.appendChild(this.container);
  }

  public open(depthResult?: DepthResult, fileName?: string): void {
    this.activeDepthResult = depthResult;
    this.activeFileName = fileName || 'Current Image';
    this.isModalOpen = true;

    this.render();
    this.backdrop.classList.add('active');
    this.container.classList.add('open');
  }

  public close(): void {
    this.isModalOpen = false;
    this.backdrop.classList.remove('active');
    this.container.classList.remove('open');
    this.options.onClose();
  }

  public toggle(depthResult?: DepthResult, fileName?: string): void {
    if (this.isModalOpen) {
      this.close();
    } else {
      this.open(depthResult, fileName);
    }
  }

  public getIsOpen(): boolean {
    return this.isModalOpen;
  }

  public updateDepth(depthResult?: DepthResult, fileName?: string): void {
    this.activeDepthResult = depthResult;
    if (fileName) this.activeFileName = fileName;
    if (this.isModalOpen) {
      this.render();
    }
  }

  private renderDepthToCanvas(canvas: HTMLCanvasElement, depth: DepthResult, invert: boolean): void {
    const { width, height, data } = depth;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = ctx.createImageData(width, height);
    const rgba = imgData.data;
    const totalPixels = width * height;

    for (let i = 0; i < totalPixels; i++) {
      let val = data[i];
      if (invert) {
        val = 1.0 - val;
      }
      const byteVal = Math.max(0, Math.min(255, Math.round(val * 255)));
      const idx = i * 4;
      rgba[idx] = byteVal;
      rgba[idx + 1] = byteVal;
      rgba[idx + 2] = byteVal;
      rgba[idx + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);
  }

  private downloadDepthPng(): void {
    if (!this.activeDepthResult) return;

    const tempCanvas = document.createElement('canvas');
    this.renderDepthToCanvas(tempCanvas, this.activeDepthResult, this.isInverted);

    const baseName = this.activeFileName
      ? this.activeFileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_')
      : 'image';
    const link = document.createElement('a');
    link.download = `drift-depth-${baseName}-${Date.now()}.png`;
    link.href = tempCanvas.toDataURL('image/png');
    link.click();
  }

  public render(): void {
    const depth = this.activeDepthResult;
    const stats = depth ? computeDepthStats(depth.data) : null;

    this.container.innerHTML = `
      <div class="depth-modal-header">
        <div class="depth-modal-title-group">
          <div class="depth-modal-title-row">
            <h2 class="depth-modal-title">Depth Map Inspector</h2>
            <span class="depth-modal-badge">DEV TOOL</span>
          </div>
          <span class="depth-modal-subtitle">
            ${this.activeFileName ? `[${this.activeFileName}] • ` : ''}Depth Anything V2 • 1.0 = White (Closest / Extruded) • 0.0 = Black (Furthest)
          </span>
        </div>
        <button class="depth-modal-close-btn" aria-label="Close Depth Inspector (Esc)" title="Close (Esc)">
          ${ICONS.close}
        </button>
      </div>

      <div class="depth-modal-body">
        ${depth ? `
          <div class="depth-canvas-frame">
            <canvas id="depth-inspector-canvas" class="depth-inspector-canvas"></canvas>
          </div>

          <!-- Telemetry Stats Panel -->
          <div class="depth-telemetry-grid">
            <div class="telemetry-card">
              <span class="telemetry-label">Resolution</span>
              <span class="telemetry-value">${depth.width} × ${depth.height}</span>
            </div>
            <div class="telemetry-card">
              <span class="telemetry-label">Min Disparity</span>
              <span class="telemetry-value">${stats ? stats.min.toFixed(4) : '--'}</span>
            </div>
            <div class="telemetry-card">
              <span class="telemetry-label">Max Disparity</span>
              <span class="telemetry-value">${stats ? stats.max.toFixed(4) : '--'}</span>
            </div>
            <div class="telemetry-card">
              <span class="telemetry-label">Mean</span>
              <span class="telemetry-value">${stats ? stats.mean.toFixed(4) : '--'}</span>
            </div>
            <div class="telemetry-card">
              <span class="telemetry-label">Std Dev</span>
              <span class="telemetry-value">${stats ? stats.std.toFixed(4) : '--'}</span>
            </div>
          </div>

          <!-- Footer Controls -->
          <div class="depth-modal-footer">
            <label class="depth-toggle-label">
              <input type="checkbox" id="depth-invert-checkbox" ${this.isInverted ? 'checked' : ''} />
              <span>Invert Grayscale (Metric Preview)</span>
            </label>

            <div class="depth-actions-group">
              <button id="btn-save-depth-png" class="btn-depth-action" title="Save Depth Map as PNG">
                ${ICONS.sparkles}
                <span>Export PNG</span>
              </button>
              <button id="btn-close-depth-modal" class="btn-depth-action primary" title="Done (Esc)">
                Done
              </button>
            </div>
          </div>
        ` : `
          <div class="depth-empty-state">
            <div class="empty-icon">${ICONS.sparkles}</div>
            <h3 class="empty-title">No Active Depth Map Available</h3>
            <p class="empty-desc">
              Load an image or click demo artwork from the top bar to inspect its neural depth map.
            </p>
          </div>
        `}
      </div>
    `;

    // Render depth onto canvas if available
    if (depth) {
      const canvas = this.container.querySelector<HTMLCanvasElement>('#depth-inspector-canvas');
      if (canvas) {
        this.renderDepthToCanvas(canvas, depth, this.isInverted);
      }

      // Invert checkbox listener
      const invertCheck = this.container.querySelector<HTMLInputElement>('#depth-invert-checkbox');
      invertCheck?.addEventListener('change', () => {
        this.isInverted = !!invertCheck.checked;
        if (canvas && this.activeDepthResult) {
          this.renderDepthToCanvas(canvas, this.activeDepthResult, this.isInverted);
        }
      });

      // Save PNG listener
      const saveBtn = this.container.querySelector('#btn-save-depth-png');
      saveBtn?.addEventListener('click', () => {
        this.downloadDepthPng();
      });

      // Done button
      const doneBtn = this.container.querySelector('#btn-close-depth-modal');
      doneBtn?.addEventListener('click', () => this.close());
    }

    // Close button
    const closeBtn = this.container.querySelector('.depth-modal-close-btn');
    closeBtn?.addEventListener('click', () => this.close());
  }
}
