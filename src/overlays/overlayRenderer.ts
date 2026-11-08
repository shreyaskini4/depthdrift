/**
 * Drift - Overlay Renderer Implementation
 * Manages 2D HTML5 canvas overlays synchronized with 3D particle state,
 * rendering Links, Trackers, Scan beam, Trails, Marks, and Interactive Draw vectors.
 */
import type {
  EngineRenderState,
  OverlayRenderer,
  OverlaySettings,
  UserDrawingPoint,
} from '../types';
import { DrawManager } from './draw';
import { renderLinks } from './links';
import { renderMarks } from './marks';
import { renderScan } from './scan';
import { renderTrackers } from './trackers';
import { TrailsBuffer } from './trails';

export class OverlayRendererImpl implements OverlayRenderer {
  public readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private trailsBuffer: TrailsBuffer;
  private drawManager: DrawManager;

  private width = 0;
  private height = 0;
  private dpr = 1;

  constructor(canvas?: HTMLCanvasElement) {
    if (canvas) {
      this.canvas = canvas;
    } else {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'overlay-canvas';
    }

    this.ctx = this.canvas.getContext('2d', {
      alpha: true,
      desynchronized: true,
    });

    this.trailsBuffer = new TrailsBuffer();
    this.drawManager = new DrawManager();
  }

  /**
   * Resize overlay canvas to match viewport and DPR.
   */
  public resize(width: number, height: number, dpr = window.devicePixelRatio || 1): void {
    if (width <= 0 || height <= 0) return;

    this.width = width;
    this.height = height;
    this.dpr = dpr;

    // High-DPI buffer scaling
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));

    // CSS display style dimensions
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    // Resize trail buffer
    this.trailsBuffer.resize(width, height, dpr);
  }

  /**
   * Main overlay render loop pass. Synchronized with EngineRenderState and OverlaySettings.
   */
  public render(renderState: EngineRenderState, settings: OverlaySettings): void {
    const ctx = this.ctx;
    if (!ctx) return;

    // Auto-resync dimensions if state changed
    if (
      renderState.width !== this.width ||
      renderState.height !== this.height ||
      (renderState.dpr && renderState.dpr !== this.dpr)
    ) {
      this.resize(renderState.width, renderState.height, renderState.dpr || 1);
    }

    if (this.width <= 0 || this.height <= 0) return;

    // 1. Reset and Clear canvas for this frame
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 2. High-DPI Context Scaling: maps [0..width, 0..height] logical screen coordinates
    ctx.scale(this.dpr, this.dpr);

    const active = settings.active;

    // 3. Render TRAILS (Motion trail composite)
    if (active.TRAILS) {
      this.trailsBuffer.update(renderState, settings);
      this.trailsBuffer.renderTo(ctx, this.width, this.height);
    } else {
      this.trailsBuffer.clear();
    }

    // 4. Render MARKS (Blueprint corners, registration reticles, telemetry readouts)
    if (active.MARKS) {
      renderMarks(ctx, renderState, settings);
    }

    // 5. Render LINKS (Glowing lines connecting salient tracker points)
    if (active.LINKS) {
      renderLinks(ctx, renderState, settings);
    }

    // 6. Render TRACKERS (Technical HUD brackets, target reticles, monospace labels)
    if (active.TRACKERS) {
      renderTrackers(ctx, renderState, settings);
    }

    // 7. Render SCAN (Sweeping laser beam, gradient tail, depth slice ping)
    if (active.SCAN) {
      renderScan(ctx, renderState, settings);
    }

    // 8. Render DRAW (User interactive path ribbons & attraction vector chevrons)
    if (active.DRAW) {
      this.drawManager.render(ctx, renderState, settings);
    } else {
      // Even if inactive, prune expired points to keep memory clean
      this.drawManager.prune(renderState.time || performance.now() / 1000);
    }

    ctx.restore();
  }

  /**
   * Add a user drawing point (normalized or canvas pixel space).
   */
  public addDrawPoint(x: number, y: number): void {
    this.drawManager.addPoint(x, y, this.width, this.height);
  }

  /**
   * Clear all active user drawing points.
   */
  public clearDrawPoints(): void {
    this.drawManager.clear();
  }

  /**
   * Get active user drawing points for particle engine attraction forces.
   */
  public getDrawPoints(): UserDrawingPoint[] {
    return this.drawManager.getPoints();
  }

  /**
   * Clean up resources and offscreen buffers.
   */
  public dispose(): void {
    this.trailsBuffer.dispose();
    this.drawManager.clear();
    if (this.ctx) {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.ctx = null;
  }
}

/**
 * Factory function to create an OverlayRenderer.
 */
export function createOverlayRenderer(canvas?: HTMLCanvasElement): OverlayRenderer {
  return new OverlayRendererImpl(canvas);
}
