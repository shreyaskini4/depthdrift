/**
 * Drift - Drift Bar Overlay Renderer
 * Renders the interactive dissolve front bar with rounded grip handle,
 * groove indicators, and direction chevrons on the overlay canvas.
 */

import type { ColorMode, DriftBar } from '../types';

export function renderDriftBar(
  ctx: CanvasRenderingContext2D,
  bar: DriftBar,
  colorMode: ColorMode
): void {
  const isActive = !!(bar.hovered || bar.dragging);
  const isOnWhite = colorMode === 'ON_WHITE';
  const inkBase = isOnWhite ? '20, 25, 35' : '236, 232, 225';
  const alpha = isActive ? 1.0 : 0.55;
  const strokeColor = `rgba(${inkBase}, ${alpha})`;

  ctx.save();

  // 1. Draw 1px line in --ink at 55% opacity (100% on hover/drag)
  ctx.lineWidth = 1;
  ctx.strokeStyle = strokeColor;
  ctx.beginPath();
  ctx.moveTo(bar.a.x, bar.a.y);
  ctx.lineTo(bar.b.x, bar.b.y);
  ctx.stroke();

  // 2. 28x28 rounded grip at handle with two short grooves & two direction chevrons
  const angle = Math.atan2(bar.dir.y, bar.dir.x);
  ctx.save();
  ctx.translate(bar.handle.x, bar.handle.y);
  ctx.rotate(angle);

  const size = 28;
  const radius = 6;

  // Grip background fill
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(-size / 2, -size / 2, size, size, radius);
  } else {
    ctx.rect(-size / 2, -size / 2, size, size);
  }
  ctx.fillStyle = isOnWhite
    ? `rgba(252, 252, 253, ${isActive ? 0.95 : 0.85})`
    : `rgba(12, 12, 14, ${isActive ? 0.95 : 0.85})`;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Two short grooves inside the grip (along Y-axis, perpendicular to drift movement)
  const grooveColor = `rgba(${inkBase}, ${isActive ? 0.85 : 0.50})`;
  ctx.strokeStyle = grooveColor;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-3, -6);
  ctx.lineTo(-3, 6);
  ctx.moveTo(3, -6);
  ctx.lineTo(3, 6);
  ctx.stroke();

  // 3. Two small chevrons on the drift side showing the direction (+X)
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const c1x = 21;
  const c2x = 27;
  const chH = 4;
  const chW = 3;

  ctx.beginPath();
  ctx.moveTo(c1x - chW, -chH);
  ctx.lineTo(c1x, 0);
  ctx.lineTo(c1x - chW, chH);

  ctx.moveTo(c2x - chW, -chH);
  ctx.lineTo(c2x, 0);
  ctx.lineTo(c2x - chW, chH);
  ctx.stroke();

  ctx.restore();
  ctx.restore();
}
