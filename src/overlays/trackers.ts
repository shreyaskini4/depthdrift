/**
 * Drift - Trackers Overlay
 * Technical HUD bracket boxes, target reticles, corner ticks, and compact monospace telemetry labels.
 */
import type { EngineRenderState, OverlaySettings } from '../types';

export interface TrackersRenderOptions {
  maxTrackers?: number;
}

/**
 * Render technical HUD trackers over salient feature points.
 */
export function renderTrackers(
  ctx: CanvasRenderingContext2D,
  renderState: EngineRenderState,
  settings: OverlaySettings,
  options: TrackersRenderOptions = {}
): void {
  const { trackers, width, height, time } = renderState;
  if (!trackers || trackers.length === 0) return;

  const lineWeight = Math.max(0.5, settings.lineWeight || 1.0);
  const density = Math.max(0.05, Math.min(1.0, settings.trackerDensity ?? 0.5));
  const maxLimit = options.maxTrackers ?? 50;

  // Determine how many trackers to render based on density
  const count = Math.min(
    maxLimit,
    Math.max(2, Math.round(trackers.length * density))
  );

  // Use stable copy sorted by intensity descending
  const sorted = [...trackers].sort((a, b) => b.intensity - a.intensity).slice(0, count);

  ctx.save();
  ctx.lineWidth = Math.max(0.75, lineWeight * 0.9);
  ctx.font = `${Math.round(8.5 * Math.min(1.3, Math.max(0.85, lineWeight * 0.85)))}px "SF Mono", Menlo, Consolas, monospace`;
  ctx.textBaseline = 'middle';

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const px = p.x * width;
    const py = p.y * height;

    // Check canvas bounds
    if (px < -20 || px > width + 20 || py < -20 || py > height + 20) continue;

    // Subtle breathing pulse animation based on time and point id
    const pulse = Math.sin(time * 2.5 + p.id * 1.3);
    const boxSize = 8 + p.z * 3 + pulse * 1.0;
    const tickLen = Math.max(2.5, boxSize * 0.4);

    // Alpha modulated by intensity and depth
    const baseAlpha = 0.5 + 0.4 * p.intensity;
    ctx.strokeStyle = `rgba(100, 210, 255, ${baseAlpha.toFixed(2)})`;
    ctx.fillStyle = `rgba(100, 210, 255, ${baseAlpha.toFixed(2)})`;

    // 1. Draw 4 Corner HUD Brackets
    ctx.beginPath();
    // Top-Left
    ctx.moveTo(px - boxSize, py - boxSize + tickLen);
    ctx.lineTo(px - boxSize, py - boxSize);
    ctx.lineTo(px - boxSize + tickLen, py - boxSize);

    // Top-Right
    ctx.moveTo(px + boxSize - tickLen, py - boxSize);
    ctx.lineTo(px + boxSize, py - boxSize);
    ctx.lineTo(px + boxSize, py - boxSize + tickLen);

    // Bottom-Left
    ctx.moveTo(px - boxSize, py + boxSize - tickLen);
    ctx.lineTo(px - boxSize, py + boxSize);
    ctx.lineTo(px - boxSize + tickLen, py + boxSize);

    // Bottom-Right
    ctx.moveTo(px + boxSize - tickLen, py + boxSize);
    ctx.lineTo(px + boxSize, py + boxSize);
    ctx.lineTo(px + boxSize, py + boxSize - tickLen);
    ctx.stroke();

    // 2. Center Reticle Pip or Micro Crosshair
    if (p.intensity > 0.6) {
      ctx.beginPath();
      ctx.arc(px, py, 1.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(px - 0.75, py - 0.75, 1.5, 1.5);
    }

    // 3. Compact Monospace Telemetry Tag
    // Render leader line and telemetry data
    const labelX = px + boxSize + 4;
    const labelY = py - boxSize - 2;

    // Leader dogleg line
    ctx.beginPath();
    ctx.moveTo(px + boxSize, py - boxSize);
    ctx.lineTo(labelX, labelY);
    ctx.lineTo(labelX + 8, labelY);
    ctx.stroke();

    // Text readouts
    const tagId = p.label || `TRK-${String(p.id % 100).padStart(2, '0')}`;
    const zText = `[Z:${p.z.toFixed(2)}]`;
    const valText = `VAL:${Math.round(p.intensity * 100)}%`;

    // First line
    ctx.fillStyle = `rgba(220, 235, 248, ${(baseAlpha * 0.95).toFixed(2)})`;
    ctx.fillText(`${tagId} ${zText}`, labelX + 11, labelY - 2);

    // Second line (fainter telemetry)
    ctx.fillStyle = `rgba(154, 154, 162, ${(baseAlpha * 0.75).toFixed(2)})`;
    ctx.fillText(valText, labelX + 11, labelY + 8);
  }

  ctx.restore();
}
