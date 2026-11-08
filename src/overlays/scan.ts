/**
 * Drift - Scan Overlay
 * Animated sweeping laser beam with gradient fade tail, telemetry readouts,
 * and depth slice highlighting.
 */
import type { EngineRenderState, OverlaySettings } from '../types';

export interface ScanRenderOptions {
  orientation?: 'vertical' | 'horizontal';
}

/**
 * Render sweeping scan beam, gradient tail, and depth slice telemetry.
 */
export function renderScan(
  ctx: CanvasRenderingContext2D,
  renderState: EngineRenderState,
  settings: OverlaySettings,
  _options: ScanRenderOptions = {}
): void {
  const { trackers, width, height, time } = renderState;
  const lineWeight = Math.max(0.5, settings.lineWeight || 1.0);
  const scanSpeed = Math.max(0.1, settings.scanSpeed || 1.0);

  // Normalized sweeping position: 0 -> 1 loop
  const progress = ((time * scanSpeed * 0.12) % 1.0 + 1.0) % 1.0;
  const scanY = progress * height;

  // Depth slice oscillation synced with time
  const scanZ = 0.5 + 0.5 * Math.sin(time * scanSpeed * 0.8);

  ctx.save();

  // 1. Luminous Gradient Fade Tail behind the sweeping beam
  const tailHeight = Math.min(height * 0.2, 50 * Math.max(0.7, lineWeight));
  if (tailHeight > 2) {
    const tailTop = scanY - tailHeight;
    const gradient = ctx.createLinearGradient(0, tailTop, 0, scanY);
    gradient.addColorStop(0.0, 'rgba(100, 210, 255, 0.0)');
    gradient.addColorStop(0.7, 'rgba(100, 210, 255, 0.04)');
    gradient.addColorStop(1.0, 'rgba(100, 210, 255, 0.18)');

    ctx.fillStyle = gradient;
    if (tailTop < 0) {
      // Wrapped tail at top of screen
      ctx.fillRect(0, 0, width, scanY);
      const wrapGrad = ctx.createLinearGradient(0, height + tailTop, 0, height);
      wrapGrad.addColorStop(0.0, 'rgba(100, 210, 255, 0.0)');
      wrapGrad.addColorStop(1.0, 'rgba(100, 210, 255, 0.12)');
      ctx.fillStyle = wrapGrad;
      ctx.fillRect(0, height + tailTop, width, -tailTop);
    } else {
      ctx.fillRect(0, tailTop, width, tailHeight);
    }
  }

  // 2. Multi-Pass Laser-Fine Sweep Line
  // Outer soft glow line
  ctx.strokeStyle = 'rgba(100, 210, 255, 0.35)';
  ctx.lineWidth = Math.max(1.8, lineWeight * 2.4);
  ctx.beginPath();
  ctx.moveTo(0, scanY);
  ctx.lineTo(width, scanY);
  ctx.stroke();

  // Razor core line
  ctx.strokeStyle = 'rgba(215, 245, 255, 0.95)';
  ctx.lineWidth = Math.max(0.75, lineWeight * 0.9);
  ctx.beginPath();
  ctx.moveTo(0, scanY);
  ctx.lineTo(width, scanY);
  ctx.stroke();

  // 3. Ruler Ticks Along Scan Line
  ctx.strokeStyle = 'rgba(100, 210, 255, 0.6)';
  ctx.lineWidth = Math.max(0.5, lineWeight * 0.7);
  const tickSpacing = 40;
  ctx.beginPath();
  for (let x = 20; x < width - 20; x += tickSpacing) {
    const isMajor = (x % 120) < tickSpacing;
    const tickLen = isMajor ? 5 : 2.5;
    ctx.moveTo(x, scanY - tickLen);
    ctx.lineTo(x, scanY + tickLen);
  }
  ctx.stroke();

  // 4. Telemetry Readouts
  ctx.font = `${Math.round(8.5 * Math.min(1.2, Math.max(0.85, lineWeight * 0.85)))}px "SF Mono", Menlo, Consolas, monospace`;
  ctx.fillStyle = 'rgba(100, 210, 255, 0.85)';
  ctx.textBaseline = 'bottom';

  const leftTag = `SCAN // BEAM ${(progress * 100).toFixed(1)}%`;
  const rightTag = `Z-SLICE: ${scanZ.toFixed(3)}  |  ELEV: ${(scanZ * 100).toFixed(0)}m`;

  ctx.fillText(leftTag, 24, Math.max(14, scanY - 6));
  const rightWidth = ctx.measureText(rightTag).width;
  ctx.fillText(rightTag, Math.max(width - rightWidth - 24, 150), Math.max(14, scanY - 6));

  // 5. Highlight Salient Tracker Points Intersecting Scan Line or Depth Slice
  if (trackers && trackers.length > 0) {
    for (let i = 0; i < trackers.length; i++) {
      const p = trackers[i];
      const py = p.y * height;
      const px = p.x * width;
      const distY = Math.abs(py - scanY);
      const distZ = Math.abs(p.z - scanZ);

      // Trigger ping if beam is passing over point or if point matches current depth slice
      const isBeamHit = distY < 18;
      const isDepthHit = distZ < 0.04;

      if (isBeamHit || isDepthHit) {
        const pingAlpha = isBeamHit ? 1.0 - distY / 18 : 1.0 - distZ / 0.04;
        const radius = 6 + (1.0 - pingAlpha) * 8;

        // Amber/gold accent ping
        ctx.strokeStyle = `rgba(255, 214, 10, ${(pingAlpha * 0.85).toFixed(2)})`;
        ctx.lineWidth = Math.max(0.75, lineWeight * 0.8);
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Fine spark line connecting tracker point to scan beam
        if (isBeamHit) {
          ctx.strokeStyle = `rgba(255, 214, 10, ${(pingAlpha * 0.45).toFixed(2)})`;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px, scanY);
          ctx.stroke();
        }
      }
    }
  }

  ctx.restore();
}
