/**
 * Drift - Marks Overlay
 * Technical registration crosses, micro grid ticks, framing corners,
 * and aerospace blueprint telemetry.
 */
import type { EngineRenderState, OverlaySettings } from '../types';

/**
 * Render technical blueprint registration marks and framing brackets.
 * Note: Corner text readouts have been relocated to dedicated DOM badges (TelemetryBadge & TopBar)
 * to prevent layout collisions with interactive header and footer controls.
 */
export function renderMarks(
  ctx: CanvasRenderingContext2D,
  renderState: EngineRenderState,
  settings: OverlaySettings
): void {
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
