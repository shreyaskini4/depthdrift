/**
 * Drift - Draw Overlay
 * User interactive drawing paths with smooth tapered glowing strokes,
 * attraction vector flow chevrons, and automatic time-based fading.
 */
import type { EngineRenderState, OverlaySettings, UserDrawingPoint } from '../types';

export const DRAW_POINT_LIFETIME = 3.5; // Seconds before drawing points completely decay

export class DrawManager {
  private points: UserDrawingPoint[] = [];

  /**
   * Add a drawing point to the active path.
   * Coordinates can be normalized [0..1] or in canvas pixel space.
   */
  public addPoint(x: number, y: number, canvasWidth: number, canvasHeight: number, time?: number): void {
    const normX = canvasWidth > 0 && x > 1.0 ? x / canvasWidth : x;
    const normY = canvasHeight > 0 && y > 1.0 ? y / canvasHeight : y;

    const clampedX = Math.max(0.0, Math.min(1.0, normX));
    const clampedY = Math.max(0.0, Math.min(1.0, normY));
    const t = time ?? performance.now() / 1000;

    // Reject duplicate points within small distance threshold
    const len = this.points.length;
    if (len > 0) {
      const last = this.points[len - 1];
      const dx = clampedX - last.x;
      const dy = clampedY - last.y;
      if (dx * dx + dy * dy < 0.00001) {
        return;
      }
    }

    this.points.push({ x: clampedX, y: clampedY, time: t });
  }

  /**
   * Return the current array of active drawing points.
   */
  public getPoints(): UserDrawingPoint[] {
    return this.points;
  }

  /**
   * Clear all drawing points.
   */
  public clear(): void {
    this.points = [];
  }

  /**
   * Prune expired points based on current time.
   */
  public prune(currentTime: number): void {
    const cutoff = currentTime - DRAW_POINT_LIFETIME;
    // Find first non-expired point index
    let keepIndex = 0;
    while (keepIndex < this.points.length && this.points[keepIndex].time < cutoff) {
      keepIndex++;
    }
    if (keepIndex > 0) {
      this.points = this.points.slice(keepIndex);
    }
  }

  /**
   * Render active drawing path and update pointer points.
   */
  public render(
    ctx: CanvasRenderingContext2D,
    renderState: EngineRenderState,
    settings: OverlaySettings
  ): void {
    const { pointer, width, height, time } = renderState;
    const currentTime = time > 0 ? time : performance.now() / 1000;

    // 1. Capture pointer input when pointer is dragging and DRAW overlay is enabled
    if (pointer && pointer.isDown && pointer.x >= 0 && pointer.x <= width && pointer.y >= 0 && pointer.y <= height) {
      this.addPoint(pointer.x, pointer.y, width, height, currentTime);
    }

    // 2. Prune expired points
    this.prune(currentTime);

    const pts = this.points;
    if (pts.length === 0) return;

    const lineWeight = Math.max(0.5, settings.lineWeight || 1.0);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // If only a single point exists, draw a glowing bead
    if (pts.length === 1) {
      const p = pts[0];
      const px = p.x * width;
      const py = p.y * height;
      const age = currentTime - p.time;
      const life = Math.max(0, 1.0 - age / DRAW_POINT_LIFETIME);
      const alpha = life * life;

      ctx.fillStyle = `rgba(100, 210, 255, ${(alpha * 0.4).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(px, py, 6 * lineWeight, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(255, 255, 255, ${(alpha * 0.9).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(px, py, 2.5 * lineWeight, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // 3. Multi-segment tapered ribbon rendering with two passes (glow + core)
    // Pass A: Outer Cyan Glow
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const age = currentTime - p2.time;
      const life = Math.max(0, 1.0 - age / DRAW_POINT_LIFETIME);
      const alpha = life * life;
      if (alpha <= 0.01) continue;

      const segWidth = (1.5 + 4.5 * life) * lineWeight;
      ctx.lineWidth = segWidth;
      ctx.strokeStyle = `rgba(100, 210, 255, ${(alpha * 0.35).toFixed(2)})`;

      ctx.beginPath();
      ctx.moveTo(p1.x * width, p1.y * height);
      ctx.lineTo(p2.x * width, p2.y * height);
      ctx.stroke();
    }

    // Pass B: Crisp Core Stroke
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const age = currentTime - p2.time;
      const life = Math.max(0, 1.0 - age / DRAW_POINT_LIFETIME);
      const alpha = life * life;
      if (alpha <= 0.01) continue;

      const segWidth = (0.75 + 2.0 * life) * lineWeight;
      ctx.lineWidth = segWidth;
      ctx.strokeStyle = `rgba(240, 250, 255, ${(alpha * 0.9).toFixed(2)})`;

      ctx.beginPath();
      ctx.moveTo(p1.x * width, p1.y * height);
      ctx.lineTo(p2.x * width, p2.y * height);
      ctx.stroke();

      // Draw subtle attraction flow chevrons along path every few points
      if (i > 0 && i % 4 === 0 && life > 0.3) {
        const x1 = p1.x * width;
        const y1 = p1.y * height;
        const x2 = p2.x * width;
        const y2 = p2.y * height;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const arrowLen = 5 * lineWeight;

        ctx.strokeStyle = `rgba(255, 214, 10, ${(alpha * 0.75).toFixed(2)})`;
        ctx.lineWidth = Math.max(0.7, lineWeight * 0.8);
        ctx.beginPath();
        ctx.moveTo(
          x2 - arrowLen * Math.cos(angle - Math.PI / 6),
          y2 - arrowLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(x2, y2);
        ctx.lineTo(
          x2 - arrowLen * Math.cos(angle + Math.PI / 6),
          y2 - arrowLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      }
    }

    // 4. Glowing Leading Tip Indicator
    const tip = pts[pts.length - 1];
    const tipAge = currentTime - tip.time;
    if (tipAge < 0.6) {
      const tipX = tip.x * width;
      const tipY = tip.y * height;
      const tipPulse = 1.0 + 0.3 * Math.sin(currentTime * 12);

      // Amber reticle ring
      ctx.strokeStyle = 'rgba(255, 214, 10, 0.85)';
      ctx.lineWidth = Math.max(0.75, lineWeight * 0.9);
      ctx.beginPath();
      ctx.arc(tipX, tipY, 5 * tipPulse * lineWeight, 0, Math.PI * 2);
      ctx.stroke();

      // White center spark
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(tipX, tipY, 1.8 * lineWeight, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
