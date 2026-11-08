/**
 * Drift - Links Overlay
 * Connects nearby salient tracker points with glowing distance-attenuated lines.
 */
import type { EngineRenderState, OverlaySettings, TrackerPoint } from '../types';

export interface LinksRenderOptions {
  maxTrackers?: number;
  color?: string; // Base RGBA color prefix, e.g. "100, 210, 255"
}

/**
 * Render fine glowing connection links between nearby tracker points.
 */
export function renderLinks(
  ctx: CanvasRenderingContext2D,
  renderState: EngineRenderState,
  settings: OverlaySettings,
  options: LinksRenderOptions = {}
): void {
  const { trackers, width, height } = renderState;
  if (!trackers || trackers.length < 2) return;

  const threshold = Math.max(0.005, settings.linkDistanceThreshold || 0.05);
  const lineWeight = Math.max(0.5, settings.lineWeight || 1.0);
  const maxTrackers = options.maxTrackers ?? 120;

  // Select active trackers based on trackerDensity setting
  const effectiveDensity = Math.max(0.1, Math.min(1.0, settings.trackerDensity || 0.5));
  const activeCount = Math.min(
    maxTrackers,
    Math.max(2, Math.round(trackers.length * effectiveDensity))
  );

  const activeTrackers: TrackerPoint[] = trackers.slice(0, activeCount);
  const n = activeTrackers.length;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = lineWeight * 0.85;

  const thresholdSq = threshold * threshold;
  const aspect = width / Math.max(1, height);

  // Group links by alpha buckets to reduce state changes
  // Bucket 0: 0.1 - 0.35, Bucket 1: 0.35 - 0.65, Bucket 2: 0.65 - 1.0
  const bucket0: [number, number, number, number][] = [];
  const bucket1: [number, number, number, number][] = [];
  const bucket2: [number, number, number, number][] = [];

  for (let i = 0; i < n; i++) {
    const p1 = activeTrackers[i];
    const x1 = p1.x * width;
    const y1 = p1.y * height;

    for (let j = i + 1; j < n; j++) {
      const p2 = activeTrackers[j];

      // Normalized coordinates distance check with aspect correction
      const dxNorm = (p1.x - p2.x) * aspect;
      const dyNorm = p1.y - p2.y;
      const distSq = dxNorm * dxNorm + dyNorm * dyNorm;

      if (distSq < thresholdSq && distSq > 0.000001) {
        const dist = Math.sqrt(distSq);
        const factor = 1.0 - dist / threshold;
        const intensityFactor = (p1.intensity + p2.intensity) * 0.5;
        const alpha = factor * factor * (0.3 + 0.7 * intensityFactor);

        const x2 = p2.x * width;
        const y2 = p2.y * height;

        if (alpha > 0.65) {
          bucket2.push([x1, y1, x2, y2]);
        } else if (alpha > 0.35) {
          bucket1.push([x1, y1, x2, y2]);
        } else if (alpha > 0.08) {
          bucket0.push([x1, y1, x2, y2]);
        }
      }
    }
  }

  // Draw Bucket 0 (faint outer links)
  if (bucket0.length > 0) {
    ctx.strokeStyle = 'rgba(100, 210, 255, 0.22)';
    ctx.beginPath();
    for (let i = 0; i < bucket0.length; i++) {
      const [x1, y1, x2, y2] = bucket0[i];
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }

  // Draw Bucket 1 (medium links)
  if (bucket1.length > 0) {
    ctx.strokeStyle = 'rgba(100, 210, 255, 0.50)';
    ctx.beginPath();
    for (let i = 0; i < bucket1.length; i++) {
      const [x1, y1, x2, y2] = bucket1[i];
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }

  // Draw Bucket 2 (close, high-intensity links with subtle glow)
  if (bucket2.length > 0) {
    ctx.strokeStyle = 'rgba(160, 230, 255, 0.85)';
    ctx.beginPath();
    for (let i = 0; i < bucket2.length; i++) {
      const [x1, y1, x2, y2] = bucket2[i];
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();

    // Subtle midpoint nodes on strongest links
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    for (let i = 0; i < bucket2.length; i++) {
      const [x1, y1, x2, y2] = bucket2[i];
      const mx = (x1 + x2) * 0.5;
      const my = (y1 + y2) * 0.5;
      ctx.fillRect(mx - 0.75, my - 0.75, 1.5, 1.5);
    }
  }

  ctx.restore();
}
