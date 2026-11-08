/**
 * Drift - Trackers Overlay
 * Technical HUD bracket boxes, target reticles, corner ticks, and collision-free monospace telemetry labels.
 */
import type { EngineRenderState, OverlaySettings, TrackerPoint } from '../types';
import {
  computeTrackerWorldPosition,
  getModeTrackerOpacity,
  projectWorldToScreen,
  type TrackerDisplacementParams,
} from './trackerDisplacement';

export interface TrackersRenderOptions {
  maxTrackers?: number;
}

interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

type Direction = 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';

interface DirectionCandidate {
  dir: Direction;
  anchorX: number;
  anchorY: number;
  elbowX: number;
  elbowY: number;
  stubX: number;
  stubY: number;
  textX: number;
  textY: number;
  labelBox: BoundingBox;
}

function boxesIntersect(a: BoundingBox, b: BoundingBox, padding: number = 0): boolean {
  return !(
    a.x2 + padding < b.x1 ||
    a.x1 - padding > b.x2 ||
    a.y2 + padding < b.y1 ||
    a.y1 - padding > b.y2
  );
}

/**
 * Render technical HUD trackers with greedy 2D bounding-box collision avoidance.
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
  const density = Math.max(0.0, Math.min(1.0, settings.trackerDensity ?? 0.5));
  const maxLimit = options.maxTrackers ?? 100;

  // SPARSE to DENSE: 8 trackers at 0.0, up to 80 trackers at 1.0
  const targetCount = Math.min(
    maxLimit,
    Math.round(8 + density * 72)
  );

  // Stable copy sorted by prominence/intensity descending
  const sorted = [...trackers].sort((a, b) => b.intensity - a.intensity).slice(0, targetCount);
  if (sorted.length === 0) return;

  ctx.save();
  // Readable 10-11px monospace typography
  const fontSize = Math.max(10, Math.min(11.5, 10.5 * Math.min(1.2, Math.max(0.9, lineWeight * 0.95))));
  ctx.font = `${fontSize}px "SF Mono", Menlo, Consolas, Monaco, monospace`;
  ctx.lineWidth = Math.max(0.75, lineWeight * 0.9);
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';

  const lineH = fontSize + 2.5; // ~13px line height
  const textH = lineH * 2;

  // Motion parameters for displacement computation
  const dispParams: TrackerDisplacementParams = {
    time: renderState.time,
    depthScale: renderState.depthScale ?? 1.0,
    noiseSpeed: renderState.noiseSpeed ?? 0.6,
    noiseFrequency: renderState.noiseFrequency ?? 1.2,
    noiseStrength: renderState.noiseStrength ?? 0.8,
    splashStrength: renderState.splashStrength ?? 1.5,
    mode: renderState.activeMode,
    prevMode: renderState.prevMode ?? renderState.activeMode,
    modeTransition: renderState.modeTransition ?? 1.0,
    pointerPos: renderState.pointerWorld ?? [0, 0],
    pointerDown: renderState.pointer?.isDown ?? false,
    pointerVelocity: [renderState.pointer?.vx ?? 0, renderState.pointer?.vy ?? 0],
    pointerRadius: renderState.pointerRadius ?? 0.5,
    orientation: renderState.orientation ?? [0, 0],
    impulseCenter: renderState.impulseCenter ?? [0, 0],
    impulseStrength: renderState.impulseStrength ?? 0.0,
  };

  // Smooth mode opacity fade policy (Requirement 3: fade out if costly/chaotic)
  const prevModeOpacity = getModeTrackerOpacity(dispParams.prevMode ?? dispParams.mode);
  const currModeOpacity = getModeTrackerOpacity(dispParams.mode);
  const transition = Math.max(0.0, Math.min(1.0, dispParams.modeTransition ?? 1.0));
  const modeOpacity = prevModeOpacity + (currModeOpacity - prevModeOpacity) * transition;
  if (modeOpacity <= 0.001) {
    ctx.restore();
    return;
  }

  // Precalculate screen positions, pulses, and reticle boxes for all active trackers
  const trackerMeta: Array<{
    p: TrackerPoint;
    px: number;
    py: number;
    boxSize: number;
    tickLen: number;
    baseAlpha: number;
    reticleBox: BoundingBox;
    line1: string;
    line2: string;
    textW: number;
  }> = [];

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    let px = p.x * width;
    let py = p.y * height;
    let alphaMod = modeOpacity;
    let currentZ = p.z;

    // Use displacement function and engine viewProjectionMatrix if available
    if (
      p.baseX !== undefined &&
      p.baseY !== undefined &&
      p.rawDepth !== undefined &&
      renderState.viewProjectionMatrix
    ) {
      const seed = p.seed ?? ((p.id * 0.1337 + 0.1) % 1.0);
      const sal = p.salience ?? p.intensity;

      // 1. Compute displaced 3D world position
      const worldPos = computeTrackerWorldPosition(
        p.baseX,
        p.baseY,
        p.rawDepth,
        seed,
        sal,
        dispParams
      );

      // 2. Project displaced 3D world position to 2D screen coordinates with engine's viewProjectionMatrix
      const proj = projectWorldToScreen(
        worldPos,
        renderState.viewProjectionMatrix,
        width,
        height,
        renderState.viewMatrix,
        renderState.projectionMatrix
      );

      if (!proj.inFrustum || proj.opacityMod <= 0.01) {
        continue;
      }

      px = proj.x;
      py = proj.y;
      alphaMod *= proj.opacityMod;
      currentZ = p.rawDepth;
    }

    if (px < -40 || px > width + 40 || py < -40 || py > height + 40) {
      continue;
    }

    const pulse = Math.sin(time * 2.5 + p.id * 1.3);
    const boxSize = 8 + currentZ * 3 + pulse * 1.0;
    const tickLen = Math.max(2.5, boxSize * 0.4);
    const baseAlpha = (0.5 + 0.4 * p.intensity) * alphaMod;

    if (baseAlpha <= 0.01) {
      continue;
    }

    const tagId = p.label || `TRK-${String(p.id % 100).padStart(2, '0')}`;
    const line1 = `${tagId} [Z: ${currentZ.toFixed(2)}]`;
    const line2 = `VAL: ${Math.round(p.intensity * 100)}%`;

    const w1 = ctx.measureText(line1).width;
    const w2 = ctx.measureText(line2).width;
    const textW = Math.max(w1, w2);

    const reticleBox: BoundingBox = {
      x1: px - boxSize - 2,
      y1: py - boxSize - 2,
      x2: px + boxSize + 2,
      y2: py + boxSize + 2,
    };

    trackerMeta.push({
      p,
      px,
      py,
      boxSize,
      tickLen,
      baseAlpha,
      reticleBox,
      line1,
      line2,
      textW,
    });
  }

  const allReticles = trackerMeta.map((m) => m.reticleBox);
  const placedLabels: BoundingBox[] = [];

  // Dogleg leader line geometric constants
  const dogX = 8;
  const dogY = 8;
  const stubLen = 10;

  for (let i = 0; i < trackerMeta.length; i++) {
    const meta = trackerMeta[i];
    const { px, py, boxSize, tickLen, baseAlpha, line1, line2, textW, p } = meta;

    // Build the 4 candidate directions: top-right, bottom-right, top-left, bottom-left
    const candidateDirs: DirectionCandidate[] = [
      // 0: top-right
      (() => {
        const anchorX = px + boxSize;
        const anchorY = py - boxSize;
        const elbowX = anchorX + dogX;
        const elbowY = anchorY - dogY;
        const stubX = elbowX + stubLen;
        const stubY = elbowY;
        const textX = stubX + 4;
        const textY = stubY - lineH * 0.5 - 1;
        return {
          dir: 'top-right' as Direction,
          anchorX,
          anchorY,
          elbowX,
          elbowY,
          stubX,
          stubY,
          textX,
          textY,
          labelBox: {
            x1: anchorX - 2,
            y1: textY - 2,
            x2: textX + textW + 4,
            y2: textY + textH + 2,
          },
        };
      })(),

      // 1: bottom-right
      (() => {
        const anchorX = px + boxSize;
        const anchorY = py + boxSize;
        const elbowX = anchorX + dogX;
        const elbowY = anchorY + dogY;
        const stubX = elbowX + stubLen;
        const stubY = elbowY;
        const textX = stubX + 4;
        const textY = stubY - lineH * 0.5 - 1;
        return {
          dir: 'bottom-right' as Direction,
          anchorX,
          anchorY,
          elbowX,
          elbowY,
          stubX,
          stubY,
          textX,
          textY,
          labelBox: {
            x1: anchorX - 2,
            y1: textY - 2,
            x2: textX + textW + 4,
            y2: textY + textH + 2,
          },
        };
      })(),

      // 2: top-left
      (() => {
        const anchorX = px - boxSize;
        const anchorY = py - boxSize;
        const elbowX = anchorX - dogX;
        const elbowY = anchorY - dogY;
        const stubX = elbowX - stubLen;
        const stubY = elbowY;
        const textX = stubX - 4 - textW;
        const textY = stubY - lineH * 0.5 - 1;
        return {
          dir: 'top-left' as Direction,
          anchorX,
          anchorY,
          elbowX,
          elbowY,
          stubX,
          stubY,
          textX,
          textY,
          labelBox: {
            x1: textX - 4,
            y1: textY - 2,
            x2: anchorX + 2,
            y2: textY + textH + 2,
          },
        };
      })(),

      // 3: bottom-left
      (() => {
        const anchorX = px - boxSize;
        const anchorY = py + boxSize;
        const elbowX = anchorX - dogX;
        const elbowY = anchorY + dogY;
        const stubX = elbowX - stubLen;
        const stubY = elbowY;
        const textX = stubX - 4 - textW;
        const textY = stubY - lineH * 0.5 - 1;
        return {
          dir: 'bottom-left' as Direction,
          anchorX,
          anchorY,
          elbowX,
          elbowY,
          stubX,
          stubY,
          textX,
          textY,
          labelBox: {
            x1: textX - 4,
            y1: textY - 2,
            x2: anchorX + 2,
            y2: textY + textH + 2,
          },
        };
      })(),
    ];

    // Find the first non-colliding direction
    let chosenCandidate: DirectionCandidate | null = null;
    const screenMargin = 6;

    for (let d = 0; d < candidateDirs.length; d++) {
      const cand = candidateDirs[d];
      const box = cand.labelBox;

      // 1. Boundary check: must stay within canvas viewport
      if (
        box.x1 < screenMargin ||
        box.x2 > width - screenMargin ||
        box.y1 < screenMargin ||
        box.y2 > height - screenMargin
      ) {
        continue;
      }

      // 2. Collision with already placed labels (6px safety margin)
      let collidesWithLabel = false;
      for (let j = 0; j < placedLabels.length; j++) {
        if (boxesIntersect(box, placedLabels[j], 6)) {
          collidesWithLabel = true;
          break;
        }
      }
      if (collidesWithLabel) continue;

      // 3. Collision with reticles of OTHER trackers (4px safety margin)
      let collidesWithReticle = false;
      for (let j = 0; j < allReticles.length; j++) {
        if (j === i) continue;
        if (boxesIntersect(box, allReticles[j], 4)) {
          collidesWithReticle = true;
          break;
        }
      }
      if (collidesWithReticle) continue;

      // Found a clean non-colliding placement!
      chosenCandidate = cand;
      break;
    }

    if (chosenCandidate) {
      // Register label bounding box to protect it from subsequent lower-priority trackers
      placedLabels.push(chosenCandidate.labelBox);

      // Render full HUD brackets, center pip, dogleg leader line, and monospace telemetry
      renderFullTracker(
        ctx,
        px,
        py,
        boxSize,
        tickLen,
        baseAlpha,
        p,
        chosenCandidate,
        line1,
        line2,
        lineH
      );
    } else {
      // Space is constrained or all 4 directions collide:
      // Collapse label and render ONLY the minimal center reticle pip
      renderCollapsedTracker(ctx, px, py, baseAlpha, p);
    }
  }

  ctx.restore();
}

/**
 * Render a full HUD tracker with brackets, center reticle, dogleg leader line, and telemetry tags.
 */
function renderFullTracker(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  boxSize: number,
  tickLen: number,
  baseAlpha: number,
  p: TrackerPoint,
  dir: DirectionCandidate,
  line1: string,
  line2: string,
  lineH: number
): void {
  ctx.save();
  ctx.strokeStyle = `rgba(100, 210, 255, ${baseAlpha.toFixed(2)})`;
  ctx.fillStyle = `rgba(100, 210, 255, ${baseAlpha.toFixed(2)})`;

  // 1. Four HUD Corner Brackets
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
    ctx.arc(px, py, 1.3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillRect(px - 0.75, py - 0.75, 1.5, 1.5);
  }

  // 3. Dogleg Leader Line
  ctx.beginPath();
  ctx.moveTo(dir.anchorX, dir.anchorY);
  ctx.lineTo(dir.elbowX, dir.elbowY);
  ctx.lineTo(dir.stubX, dir.stubY);
  ctx.stroke();

  // 4. Telemetry Text Tags (Real depth & real feature intensity metric)
  ctx.textBaseline = 'top';

  // Primary tag: crisp, high-luminance cyan-white
  ctx.fillStyle = `rgba(225, 240, 255, ${(baseAlpha * 0.95).toFixed(2)})`;
  ctx.fillText(line1, dir.textX, dir.textY);

  // Secondary telemetry: softer ice-blue
  ctx.fillStyle = `rgba(145, 185, 215, ${(baseAlpha * 0.75).toFixed(2)})`;
  ctx.fillText(line2, dir.textX, dir.textY + lineH);

  ctx.restore();
}

/**
 * Render minimal center reticle pip when label collides or space is constrained.
 */
function renderCollapsedTracker(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  baseAlpha: number,
  p: TrackerPoint
): void {
  ctx.save();
  const alpha = baseAlpha * 0.75;
  ctx.strokeStyle = `rgba(100, 210, 255, ${alpha.toFixed(2)})`;
  ctx.fillStyle = `rgba(100, 210, 255, ${alpha.toFixed(2)})`;

  if (p.intensity > 0.6) {
    // Micro center dot
    ctx.beginPath();
    ctx.arc(px, py, 1.4, 0, Math.PI * 2);
    ctx.fill();

    // Precision micro crosshair ticks
    ctx.beginPath();
    ctx.moveTo(px - 3.5, py);
    ctx.lineTo(px - 1.5, py);
    ctx.moveTo(px + 1.5, py);
    ctx.lineTo(px + 3.5, py);
    ctx.moveTo(px, py - 3.5);
    ctx.lineTo(px, py - 1.5);
    ctx.moveTo(px, py + 1.5);
    ctx.lineTo(px, py + 3.5);
    ctx.stroke();
  } else {
    ctx.fillRect(px - 1, py - 1, 2, 2);
  }

  ctx.restore();
}
