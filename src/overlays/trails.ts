/**
 * Drift - Trails Overlay
 * Decaying motion trails using Canvas 2D alpha composite blending.
 * Preserves ghostly traces of cursor motions and active points.
 */
import type { EngineRenderState, OverlaySettings } from '../types';

export class TrailsBuffer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private lastPointerX = -1;
  private lastPointerY = -1;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false });
  }

  /**
   * Resize the offscreen trails buffer.
   */
  public resize(width: number, height: number, dpr = 1): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;

    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    this.clear();
  }

  /**
   * Clear the trails buffer completely.
   */
  public clear(): void {
    if (!this.ctx) return;
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
    this.lastPointerX = -1;
    this.lastPointerY = -1;
  }

  /**
   * Fade existing trail buffer and stamp current motion elements.
   */
  public update(renderState: EngineRenderState, settings: OverlaySettings): void {
    const ctx = this.ctx;
    if (!ctx || this.width <= 0 || this.height <= 0) return;

    const { pointer, trackers } = renderState;
    const fadeRate = Math.max(0.02, Math.min(0.5, settings.trailFade ?? 0.15));

    // 1. Decay previous contents via destination-out
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0, 0, 0, ${fadeRate.toFixed(3)})`;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 2. Draw new traces in logical screen space
    ctx.globalCompositeOperation = 'source-over';
    ctx.scale(this.dpr, this.dpr);

    // Tracker motion stamp
    if (trackers && trackers.length > 0) {
      const stampCount = Math.min(30, trackers.length);
      ctx.fillStyle = 'rgba(100, 210, 255, 0.18)';
      for (let i = 0; i < stampCount; i++) {
        const p = trackers[i];
        const px = p.x * this.width;
        const py = p.y * this.height;
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Pointer motion trace
    if (pointer) {
      const px = pointer.x;
      const py = pointer.y;
      const isMoving =
        Math.abs(pointer.vx) > 0.05 ||
        Math.abs(pointer.vy) > 0.05 ||
        (this.lastPointerX >= 0 && (Math.abs(px - this.lastPointerX) > 1 || Math.abs(py - this.lastPointerY) > 1));

      if (isMoving && px >= 0 && px <= this.width && py >= 0 && py <= this.height) {
        if (pointer.isDown) {
          // Intense amber/gold drag streak
          ctx.strokeStyle = 'rgba(255, 214, 10, 0.4)';
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          if (this.lastPointerX >= 0) {
            ctx.beginPath();
            ctx.moveTo(this.lastPointerX, this.lastPointerY);
            ctx.lineTo(px, py);
            ctx.stroke();
          }

          ctx.fillStyle = 'rgba(255, 230, 120, 0.7)';
          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Cyan hover particle trace
          ctx.fillStyle = 'rgba(100, 210, 255, 0.35)';
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fill();
        }

        this.lastPointerX = px;
        this.lastPointerY = py;
      }
    }

    ctx.restore();
  }

  /**
   * Render the trails buffer to the target canvas.
   */
  public renderTo(targetCtx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.ctx || this.canvas.width === 0 || this.canvas.height === 0) return;
    targetCtx.save();
    targetCtx.drawImage(this.canvas, 0, 0, width, height);
    targetCtx.restore();
  }

  public dispose(): void {
    this.clear();
    this.canvas.width = 0;
    this.canvas.height = 0;
    this.ctx = null;
  }
}
