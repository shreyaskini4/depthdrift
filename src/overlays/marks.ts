/**
 * Drift - Marks Overlay
 * Technical registration crosses, micro grid ticks, framing corners,
 * and aerospace blueprint telemetry.
 */
import type { EngineRenderState, OverlaySettings } from '../types';

/**
 * Render technical blueprint registration marks and framing brackets.
 */
export function renderMarks(
  ctx: CanvasRenderingContext2D,
  renderState: EngineRenderState,
  settings: OverlaySettings
): void {
  const { width, height, dpr, fps, particleCount, activeMode, colorMode, cameraPosition, time } =
    renderState;
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

  // 5. Technical Blueprint Monospace Telemetry
  const fontSize = Math.round(8.5 * Math.min(1.2, Math.max(0.85, lineWeight * 0.85)));
  ctx.font = `${fontSize}px "SF Mono", Menlo, Consolas, Monaco, monospace`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.36)';

  // Top-Left corner telemetry
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText('DRIFT // OPTICAL TELEMETRY', margin + 6, margin + 4);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.fillText(`SYS: READY | DPR: ${dpr.toFixed(1)}`, margin + 6, margin + 15);

  // Top-Right corner telemetry
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.36)';
  const fpsText = fps > 0 ? `${Math.round(fps)} FPS` : '60 FPS';
  ctx.fillText(`${fpsText} | ${particleCount.toLocaleString()} PTS`, width - margin - 6, margin + 4);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.fillText(`RES: ${Math.round(width)}x${Math.round(height)}`, width - margin - 6, margin + 15);

  // Bottom-Left corner telemetry
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  const camStr = cameraPosition ? cameraPosition.map((c) => c.toFixed(1)).join(', ') : '0.0, 0.0, 2.0';
  ctx.fillText(`CAM: [${camStr}]`, margin + 6, height - margin - 15);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.36)';
  ctx.fillText(`MODE: ${activeMode || 'DRIFT'}`, margin + 6, height - margin - 4);

  // Bottom-Right corner telemetry
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.fillText(`PALETTE: ${colorMode || 'TRUE'}`, width - margin - 6, height - margin - 15);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.36)';
  ctx.fillText(`T+${time.toFixed(1)}s`, width - margin - 6, height - margin - 4);

  ctx.restore();
}
