/**
 * Drift - Marks Overlay
 * Technical registration crosses, micro grid ticks, framing corners,
 * camera-projected image crop marks, and aerospace blueprint telemetry.
 */
import type { EngineRenderState, OverlaySettings } from '../types';
import { projectWorldToScreen, type ProjectResult } from './trackerDisplacement';

/**
 * Render camera-projected crop marks around the fitted image bounds.
 * Follows 3D zoom and pan precisely via the viewProjectionMatrix.
 * Gracefully hides or clips marks when off-screen.
 */
function renderCropMarks(
  ctx: CanvasRenderingContext2D,
  renderState: EngineRenderState,
  settings: OverlaySettings
): void {
  const { width, height, viewProjectionMatrix, viewMatrix, projectionMatrix } = renderState;
  if (!viewProjectionMatrix) return;

  const aspect = renderState.imageAspect || 1.0;
  const hw = 0.5 * aspect;
  const hh = 0.5;

  // Project the 4 world-space corners of the fitted image (plane Z=0)
  const tl = projectWorldToScreen([-hw, hh, 0], viewProjectionMatrix, width, height, viewMatrix, projectionMatrix);
  const tr = projectWorldToScreen([hw, hh, 0], viewProjectionMatrix, width, height, viewMatrix, projectionMatrix);
  const br = projectWorldToScreen([hw, -hh, 0], viewProjectionMatrix, width, height, viewMatrix, projectionMatrix);
  const bl = projectWorldToScreen([-hw, -hh, 0], viewProjectionMatrix, width, height, viewMatrix, projectionMatrix);

  const isCornerValid = (c: ProjectResult): boolean => {
    if (c.ndcZ > 1.0 || c.opacityMod <= 0.05) return false;
    // Hide if pushed far beyond the viewport boundaries (>120px)
    if (c.x < -120 || c.x > width + 120 || c.y < -120 || c.y > height + 120) return false;
    return true;
  };

  const tlValid = isCornerValid(tl);
  const trValid = isCornerValid(tr);
  const brValid = isCornerValid(br);
  const blValid = isCornerValid(bl);

  // If all corners are off-screen or behind the camera, skip entirely
  if (!tlValid && !trValid && !brValid && !blValid) return;

  ctx.save();
  // Clip to viewport rectangle to ensure all marks extending off-canvas clip gracefully
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();

  const isOnWhite = renderState.colorMode === 'ON_WHITE';
  const baseAlpha = isOnWhite ? 0.38 : 0.32;
  const strokeColor = isOnWhite
    ? `rgba(20, 25, 35, ${baseAlpha})`
    : `rgba(140, 220, 255, ${baseAlpha})`;
  const labelColor = isOnWhite
    ? 'rgba(20, 25, 35, 0.45)'
    : 'rgba(140, 220, 255, 0.40)';

  const lineWeight = Math.max(0.5, settings.lineWeight || 1.0);
  ctx.lineWidth = Math.max(0.75, lineWeight * 0.85);
  ctx.strokeStyle = strokeColor;

  // Compute unit direction vectors along top and left edges for perspective alignment
  const dTopX = tr.x - tl.x;
  const dTopY = tr.y - tl.y;
  const lenTop = Math.hypot(dTopX, dTopY) || 1;
  const uTopX = dTopX / lenTop;
  const uTopY = dTopY / lenTop;

  const dLeftX = bl.x - tl.x;
  const dLeftY = bl.y - tl.y;
  const lenLeft = Math.hypot(dLeftX, dLeftY) || 1;
  const uLeftX = dLeftX / lenLeft;
  const uLeftY = dLeftY / lenLeft;

  const gap = 6;
  const markLen = 14;
  const armLen = 12;

  ctx.beginPath();

  // 1. Top-Left Crop Marks & Inward L-Bracket
  if (tlValid) {
    // Outward horizontal trim tick (pointing left)
    ctx.moveTo(tl.x - uTopX * gap, tl.y - uTopY * gap);
    ctx.lineTo(tl.x - uTopX * (gap + markLen), tl.y - uTopY * (gap + markLen));

    // Outward vertical trim tick (pointing up)
    ctx.moveTo(tl.x - uLeftX * gap, tl.y - uLeftY * gap);
    ctx.lineTo(tl.x - uLeftX * (gap + markLen), tl.y - uLeftY * (gap + markLen));

    // Inward framing L-bracket
    ctx.moveTo(tl.x + uTopX * armLen, tl.y + uTopY * armLen);
    ctx.lineTo(tl.x, tl.y);
    ctx.lineTo(tl.x + uLeftX * armLen, tl.y + uLeftY * armLen);
  }

  // 2. Top-Right Crop Marks & Inward L-Bracket
  if (trValid) {
    // Outward horizontal trim tick (pointing right)
    ctx.moveTo(tr.x + uTopX * gap, tr.y + uTopY * gap);
    ctx.lineTo(tr.x + uTopX * (gap + markLen), tr.y + uTopY * (gap + markLen));

    // Outward vertical trim tick (pointing up)
    ctx.moveTo(tr.x - uLeftX * gap, tr.y - uLeftY * gap);
    ctx.lineTo(tr.x - uLeftX * (gap + markLen), tr.y - uLeftY * (gap + markLen));

    // Inward framing L-bracket
    ctx.moveTo(tr.x - uTopX * armLen, tr.y - uTopY * armLen);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(tr.x + uLeftX * armLen, tr.y + uLeftY * armLen);
  }

  // 3. Bottom-Right Crop Marks & Inward L-Bracket
  if (brValid) {
    // Outward horizontal trim tick (pointing right)
    ctx.moveTo(br.x + uTopX * gap, br.y + uTopY * gap);
    ctx.lineTo(br.x + uTopX * (gap + markLen), br.y + uTopY * (gap + markLen));

    // Outward vertical trim tick (pointing down)
    ctx.moveTo(br.x + uLeftX * gap, br.y + uLeftY * gap);
    ctx.lineTo(br.x + uLeftX * (gap + markLen), br.y + uLeftY * (gap + markLen));

    // Inward framing L-bracket
    ctx.moveTo(br.x - uTopX * armLen, br.y - uTopY * armLen);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(br.x - uLeftX * armLen, br.y - uLeftY * armLen);
  }

  // 4. Bottom-Left Crop Marks & Inward L-Bracket
  if (blValid) {
    // Outward horizontal trim tick (pointing left)
    ctx.moveTo(bl.x - uTopX * gap, bl.y - uTopY * gap);
    ctx.lineTo(bl.x - uTopX * (gap + markLen), bl.y - uTopY * (gap + markLen));

    // Outward vertical trim tick (pointing down)
    ctx.moveTo(bl.x + uLeftX * gap, bl.y + uLeftY * gap);
    ctx.lineTo(bl.x + uLeftX * (gap + markLen), bl.y + uLeftY * (gap + markLen));

    // Inward framing L-bracket
    ctx.moveTo(bl.x + uTopX * armLen, bl.y + uTopY * armLen);
    ctx.lineTo(bl.x, bl.y);
    ctx.lineTo(bl.x - uLeftX * armLen, bl.y - uLeftY * armLen);
  }

  // 5. Edge Midpoint Registration Ticks
  const midTick = 8;
  if (tlValid && trValid) {
    const mtx = (tl.x + tr.x) * 0.5;
    const mty = (tl.y + tr.y) * 0.5;
    ctx.moveTo(mtx - uLeftX * gap, mty - uLeftY * gap);
    ctx.lineTo(mtx - uLeftX * (gap + midTick), mty - uLeftY * (gap + midTick));
  }

  if (blValid && brValid) {
    const mbx = (bl.x + br.x) * 0.5;
    const mby = (bl.y + br.y) * 0.5;
    ctx.moveTo(mbx + uLeftX * gap, mby + uLeftY * gap);
    ctx.lineTo(mbx + uLeftX * (gap + midTick), mby + uLeftY * (gap + midTick));
  }

  if (tlValid && blValid) {
    const mlx = (tl.x + bl.x) * 0.5;
    const mly = (tl.y + bl.y) * 0.5;
    ctx.moveTo(mlx - uTopX * gap, mly - uTopY * gap);
    ctx.lineTo(mlx - uTopX * (gap + midTick), mly - uTopY * (gap + midTick));
  }

  if (trValid && brValid) {
    const mrx = (tr.x + br.x) * 0.5;
    const mry = (tr.y + br.y) * 0.5;
    ctx.moveTo(mrx + uTopX * gap, mry + uTopY * gap);
    ctx.lineTo(mrx + uTopX * (gap + midTick), mry + uTopY * (gap + midTick));
  }

  ctx.stroke();

  // 6. Monospace Crop Aspect Ratio Metadata Tag
  if (tlValid) {
    const fontSize = Math.round(8.5 * Math.min(1.2, Math.max(0.85, lineWeight * 0.85)));
    ctx.font = `${fontSize}px "SF Mono", Menlo, Consolas, Monaco, monospace`;
    ctx.fillStyle = labelColor;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText(`CROP // ${aspect.toFixed(2)}:1`, tl.x + 8, tl.y - 8);
  }

  ctx.restore();
}

/**
 * Render technical blueprint registration marks, framing brackets, and image crop marks.
 */
export function renderMarks(
  ctx: CanvasRenderingContext2D,
  renderState: EngineRenderState,
  settings: OverlaySettings
): void {
  // Render camera-projected crop marks around the fitted image bounds
  if (settings.cropMarks !== false) {
    renderCropMarks(ctx, renderState, settings);
  }

  const { width, height } = renderState;
  const lineWeight = Math.max(0.5, settings.lineWeight || 1.0);

  ctx.save();
  ctx.lineWidth = Math.max(0.6, lineWeight * 0.75);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.40)';

  const margin = Math.max(16, Math.min(28, Math.min(width, height) * 0.035));
  const arm = 14;

  // 1. Viewport Framing Corners (4 L-Brackets)
  ctx.beginPath();
  // Top-Left
  ctx.moveTo(margin, margin + arm);
  ctx.lineTo(margin, margin);
  ctx.lineTo(margin + arm, margin);

  // Top-Right
  ctx.moveTo(width - margin - arm, margin);
  ctx.lineTo(width - margin, margin);
  ctx.lineTo(width - margin, margin + arm);

  // Bottom-Left
  ctx.moveTo(margin, height - margin - arm);
  ctx.lineTo(margin, height - margin);
  ctx.lineTo(margin + arm, height - margin);

  // Bottom-Right
  ctx.moveTo(width - margin - arm, height - margin);
  ctx.lineTo(width - margin, height - margin);
  ctx.lineTo(width - margin, height - margin - arm);
  ctx.stroke();

  // 2. Center Reticle & Registration Cross
  const cx = width * 0.5;
  const cy = height * 0.5;
  const centerGap = 5;
  const crossLen = 12;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.beginPath();
  // Horizontal center cross arms
  ctx.moveTo(cx - centerGap - crossLen, cy);
  ctx.lineTo(cx - centerGap, cy);
  ctx.moveTo(cx + centerGap, cy);
  ctx.lineTo(cx + centerGap + crossLen, cy);

  // Vertical center cross arms
  ctx.moveTo(cx, cy - centerGap - crossLen);
  ctx.lineTo(cx, cy - centerGap);
  ctx.moveTo(cx, cy + centerGap);
  ctx.lineTo(cx, cy + centerGap + crossLen);
  ctx.stroke();

  // Center ring (radius 22px) with 4 quadrant notches
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  ctx.stroke();

  // 3. Grid / Rule of Thirds Registration Crosses (+)
  const oneThirdX = width * 0.333;
  const twoThirdsX = width * 0.667;
  const oneThirdY = height * 0.333;
  const twoThirdsY = height * 0.667;
  const regArm = 3.5;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.beginPath();
  const intersections: [number, number][] = [
    [oneThirdX, oneThirdY],
    [twoThirdsX, oneThirdY],
    [oneThirdX, twoThirdsY],
    [twoThirdsX, twoThirdsY],
  ];

  for (let i = 0; i < intersections.length; i++) {
    const [ix, iy] = intersections[i];
    ctx.moveTo(ix - regArm, iy);
    ctx.lineTo(ix + regArm, iy);
    ctx.moveTo(ix, iy - regArm);
    ctx.lineTo(ix, iy + regArm);
  }
  ctx.stroke();

  // 4. Perimeter Precision Ruler Ticks
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.beginPath();
  const tickSpacing = 24;
  for (let x = margin + 30; x <= width - margin - 30; x += tickSpacing) {
    const isMajor = (x - margin) % 120 < tickSpacing;
    const tLen = isMajor ? 5 : 2.5;
    // Top border ticks
    ctx.moveTo(x, margin);
    ctx.lineTo(x, margin + tLen);
    // Bottom border ticks
    ctx.moveTo(x, height - margin);
    ctx.lineTo(x, height - margin - tLen);
  }
  ctx.stroke();

  // 5. Inward Blueprint Monospace Annotations (Inward, away from perimeter UI collisions)
  const fontSize = Math.round(8.5 * Math.min(1.2, Math.max(0.85, lineWeight * 0.85)));
  ctx.font = `${fontSize}px "SF Mono", Menlo, Consolas, Monaco, monospace`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('OPTICAL // RETICLE', cx + 28, cy - 8);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.fillText(`AXIS: 0.0, 0.0`, cx + 28, cy + 8);

  ctx.restore();
}
