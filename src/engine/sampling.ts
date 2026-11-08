/**
 * Particle and Depth Sampling Pipeline
 * Handles image & depth map analysis, salience map calculation,
 * importance sampling for edge/feature density, and salient tracker extraction.
 */

import type { DepthResult } from '../types';

export interface BaseTracker {
  id: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  intensity: number;
  label: string;
}

export interface SampledParticles {
  positions: Float32Array;
  colors: Float32Array;
  randomSeeds: Float32Array;
  saliences: Float32Array;
  depths: Float32Array;
  trackers: BaseTracker[];
  aspect: number;
  count: number;
}

export const MAX_PARTICLE_CAPACITY = 200_000;

/**
 * Extracts raw ImageData from HTMLCanvasElement, ImageBitmap, or ImageData.
 */
export function extractImageData(pixels: HTMLCanvasElement | ImageBitmap | ImageData): ImageData {
  if (typeof ImageData !== 'undefined' && pixels instanceof ImageData) {
    return pixels;
  }

  const width = (pixels as { width: number }).width;
  const height = (pixels as { height: number }).height;

  // Offscreen canvas or standard canvas element
  let canvas: HTMLCanvasElement | OffscreenCanvas;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width, height);
  } else {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;

  if (!ctx) {
    throw new Error('Unable to acquire 2D rendering context for image sampling.');
  }

  ctx.drawImage(pixels as CanvasImageSource, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

/**
 * Bilinearly samples a normalized depth map [0..1] at (u, v) normalized coordinates [0..1].
 */
export function sampleDepth(depth: DepthResult, u: number, v: number): number {
  const { width, height, data } = depth;
  const cu = Math.max(0, Math.min(1, u));
  const cv = Math.max(0, Math.min(1, v));

  const x = cu * (width - 1);
  const y = cv * (height - 1);

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);

  const dx = x - x0;
  const dy = y - y0;

  const d00 = data[y0 * width + x0] ?? 0.5;
  const d10 = data[y0 * width + x1] ?? 0.5;
  const d01 = data[y1 * width + x0] ?? 0.5;
  const d11 = data[y1 * width + x1] ?? 0.5;

  const top = d00 * (1 - dx) + d10 * dx;
  const bottom = d01 * (1 - dx) + d11 * dx;
  return top * (1 - dy) + bottom * dy;
}

/**
 * Samples particles from RGB image and depth map with hybrid uniform + importance edge sampling.
 */
export function sampleImageAndDepth(
  pixelsSource: HTMLCanvasElement | ImageBitmap | ImageData,
  depth: DepthResult,
  targetCount: number = MAX_PARTICLE_CAPACITY
): SampledParticles {
  const imgData = extractImageData(pixelsSource);
  const imgWidth = imgData.width;
  const imgHeight = imgData.height;
  const aspect = imgWidth / Math.max(1, imgHeight);
  const imgBytes = imgData.data;

  // Analysis grid dimensions (downscaled for fast salience computation)
  const gridW = Math.min(256, imgWidth);
  const gridH = Math.min(256, imgHeight);
  const totalCells = gridW * gridH;

  const luminanceGrid = new Float32Array(totalCells);
  const depthGrid = new Float32Array(totalCells);
  const salienceGrid = new Float32Array(totalCells);

  // 1. Compute downsampled luminance and depth grid
  for (let gy = 0; gy < gridH; gy++) {
    const v = (gy + 0.5) / gridH;
    const py = Math.min(imgHeight - 1, Math.floor(v * imgHeight));

    for (let gx = 0; gx < gridW; gx++) {
      const u = (gx + 0.5) / gridW;
      const px = Math.min(imgWidth - 1, Math.floor(u * imgWidth));
      const pIdx = (py * imgWidth + px) * 4;

      const r = imgBytes[pIdx] / 255.0;
      const g = imgBytes[pIdx + 1] / 255.0;
      const b = imgBytes[pIdx + 2] / 255.0;

      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const dep = sampleDepth(depth, u, v);

      const cellIdx = gy * gridW + gx;
      luminanceGrid[cellIdx] = luma;
      depthGrid[cellIdx] = dep;
    }
  }

  // 2. Compute edge gradients and salience
  const cdf = new Float64Array(totalCells);
  let cumulativeSalience = 0;

  for (let gy = 0; gy < gridH; gy++) {
    const ym1 = Math.max(0, gy - 1) * gridW;
    const yp1 = Math.min(gridH - 1, gy + 1) * gridW;
    const yRow = gy * gridW;

    for (let gx = 0; gx < gridW; gx++) {
      const xm1 = Math.max(0, gx - 1);
      const xp1 = Math.min(gridW - 1, gx + 1);

      // Luminance gradients
      const lx = luminanceGrid[yRow + xp1] - luminanceGrid[yRow + xm1];
      const ly = luminanceGrid[yp1 + gx] - luminanceGrid[ym1 + gx];
      const lumaGrad = Math.sqrt(lx * lx + ly * ly);

      // Depth gradients
      const dx = depthGrid[yRow + xp1] - depthGrid[yRow + xm1];
      const dy = depthGrid[yp1 + gx] - depthGrid[ym1 + gx];
      const depthGrad = Math.sqrt(dx * dx + dy * dy);

      const luma = luminanceGrid[yRow + gx];

      // Salience: combined feature contrast, depth boundary, and tonal prominence
      const sal = Math.max(0.04, Math.min(1.0, 0.55 * lumaGrad + 0.85 * depthGrad + 0.15 * luma));
      const cellIdx = yRow + gx;
      salienceGrid[cellIdx] = sal;

      cumulativeSalience += sal;
      cdf[cellIdx] = cumulativeSalience;
    }
  }

  // 3. Extract 60-120 salient trackers using spatial block maximums
  const trackers: BaseTracker[] = [];
  const blockCols = 10;
  const blockRows = 10;
  let trackerId = 0;

  for (let by = 0; by < blockRows; by++) {
    const yStart = Math.floor((by / blockRows) * gridH);
    const yEnd = Math.floor(((by + 1) / blockRows) * gridH);

    for (let bx = 0; bx < blockCols; bx++) {
      const xStart = Math.floor((bx / blockCols) * gridW);
      const xEnd = Math.floor(((bx + 1) / blockCols) * gridW);

      let maxSal = -1;
      let maxGx = xStart;
      let maxGy = yStart;

      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          const s = salienceGrid[y * gridW + x];
          if (s > maxSal) {
            maxSal = s;
            maxGx = x;
            maxGy = y;
          }
        }
      }

      if (maxSal > 0.08) {
        const u = (maxGx + 0.5) / gridW;
        const v = (maxGy + 0.5) / gridH;
        const dep = sampleDepth(depth, u, v);

        const baseX = (u - 0.5) * aspect;
        const baseY = 0.5 - v;
        const baseZ = dep - 0.5;

        const prefixes = ['TRK', 'NODE', 'DEPTH', 'MARK', 'EDGE'];
        const prefix = prefixes[trackerId % prefixes.length];

        trackers.push({
          id: trackerId,
          baseX,
          baseY,
          baseZ,
          intensity: Math.round(maxSal * 100) / 100,
          label: `${prefix}-${String(trackerId + 1).padStart(2, '0')}`,
        });
        trackerId++;
      }
    }
  }

  // 4. Sample particles
  const count = Math.min(MAX_PARTICLE_CAPACITY, targetCount);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const randomSeeds = new Float32Array(count * 2);
  const saliences = new Float32Array(count);
  const depths = new Float32Array(count);

  // 60% uniform stratified jittered points, 40% importance sampled points
  const uniformCount = Math.floor(count * 0.6);
  const importanceCount = count - uniformCount;

  const uCols = Math.round(Math.sqrt(uniformCount * aspect));
  const uRows = Math.ceil(uniformCount / Math.max(1, uCols));

  let p = 0;

  // A. Stratified jittered sampling
  for (let r = 0; r < uRows && p < uniformCount; r++) {
    for (let c = 0; c < uCols && p < uniformCount; c++) {
      const u = (c + Math.random()) / uCols;
      const v = (r + Math.random()) / uRows;

      if (u > 1.0 || v > 1.0) continue;

      const px = Math.min(imgWidth - 1, Math.max(0, Math.floor(u * imgWidth)));
      const py = Math.min(imgHeight - 1, Math.max(0, Math.floor(v * imgHeight)));
      const pIdx = (py * imgWidth + px) * 4;

      const red = imgBytes[pIdx] / 255.0;
      const green = imgBytes[pIdx + 1] / 255.0;
      const blue = imgBytes[pIdx + 2] / 255.0;

      const dep = sampleDepth(depth, u, v);

      const gx = Math.min(gridW - 1, Math.floor(u * gridW));
      const gy = Math.min(gridH - 1, Math.floor(v * gridH));
      const sal = salienceGrid[gy * gridW + gx];

      const p3 = p * 3;
      positions[p3] = (u - 0.5) * aspect;
      positions[p3 + 1] = 0.5 - v;
      positions[p3 + 2] = dep - 0.5;

      colors[p3] = red;
      colors[p3 + 1] = green;
      colors[p3 + 2] = blue;

      const p2 = p * 2;
      randomSeeds[p2] = Math.random();
      randomSeeds[p2 + 1] = Math.random();

      saliences[p] = sal;
      depths[p] = dep;

      p++;
    }
  }

  // B. Importance sampling based on salience CDF
  for (let i = 0; i < importanceCount && p < count; i++) {
    const targetVal = Math.random() * cumulativeSalience;

    // Binary search on CDF
    let low = 0;
    let high = totalCells - 1;
    let foundCell = 0;

    while (low <= high) {
      const mid = (low + high) >> 1;
      if (cdf[mid] >= targetVal) {
        foundCell = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    const cellY = Math.floor(foundCell / gridW);
    const cellX = foundCell % gridW;

    const u = (cellX + Math.random()) / gridW;
    const v = (cellY + Math.random()) / gridH;

    const px = Math.min(imgWidth - 1, Math.max(0, Math.floor(u * imgWidth)));
    const py = Math.min(imgHeight - 1, Math.max(0, Math.floor(v * imgHeight)));
    const pIdx = (py * imgWidth + px) * 4;

    const red = imgBytes[pIdx] / 255.0;
    const green = imgBytes[pIdx + 1] / 255.0;
    const blue = imgBytes[pIdx + 2] / 255.0;

    const dep = sampleDepth(depth, u, v);
    const sal = salienceGrid[foundCell];

    const p3 = p * 3;
    positions[p3] = (u - 0.5) * aspect;
    positions[p3 + 1] = 0.5 - v;
    positions[p3 + 2] = dep - 0.5;

    colors[p3] = red;
    colors[p3 + 1] = green;
    colors[p3 + 2] = blue;

    const p2 = p * 2;
    randomSeeds[p2] = Math.random();
    randomSeeds[p2 + 1] = Math.random();

    saliences[p] = sal;
    depths[p] = dep;

    p++;
  }

  return {
    positions,
    colors,
    randomSeeds,
    saliences,
    depths,
    trackers,
    aspect,
    count: p,
  };
}

/**
 * Creates default generative surface particles when no user image has been loaded yet.
 */
export function createDefaultParticles(count: number = MAX_PARTICLE_CAPACITY): SampledParticles {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const randomSeeds = new Float32Array(count * 2);
  const saliences = new Float32Array(count);
  const depths = new Float32Array(count);
  const aspect = 1.0;

  const cols = Math.round(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  const trackers: BaseTracker[] = [];
  const trackerStep = Math.floor(count / 80);

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);

    const u = (col + (Math.random() - 0.5) * 0.7) / cols;
    const v = (row + (Math.random() - 0.5) * 0.7) / rows;

    const x = (u - 0.5) * 1.4;
    const y = (0.5 - v) * 1.4;

    // Mathematical ripple wave depth surface
    const r = Math.sqrt(x * x + y * y);
    const wave1 = Math.sin(r * 14.0) * 0.25;
    const wave2 = Math.cos(x * 8.0) * Math.sin(y * 8.0) * 0.15;
    const dep = Math.max(0.0, Math.min(1.0, 0.5 + wave1 + wave2));

    const i3 = i * 3;
    positions[i3] = x;
    positions[i3 + 1] = y;
    positions[i3 + 2] = dep - 0.5;

    // Luminous generative palette: deep teal -> electric cyan -> amber/coral
    const tCol = Math.sin(u * 3.1415) * 0.5 + 0.5;
    const rCol = 0.15 + 0.75 * Math.pow(tCol, 2.0);
    const gCol = 0.55 + 0.4 * Math.sin(v * 3.1415);
    const bCol = 0.85 - 0.3 * tCol;

    colors[i3] = rCol;
    colors[i3 + 1] = gCol;
    colors[i3 + 2] = bCol;

    const i2 = i * 2;
    randomSeeds[i2] = Math.random();
    randomSeeds[i2 + 1] = Math.random();

    const sal = Math.max(0.1, Math.min(1.0, Math.abs(wave1 * 3.0) + 0.2));
    saliences[i] = sal;
    depths[i] = dep;

    if (i % trackerStep === 0 && trackers.length < 80) {
      trackers.push({
        id: trackers.length,
        baseX: x,
        baseY: y,
        baseZ: dep - 0.5,
        intensity: Math.round(sal * 100) / 100,
        label: `TRK-${String(trackers.length + 1).padStart(2, '0')}`,
      });
    }
  }

  return {
    positions,
    colors,
    randomSeeds,
    saliences,
    depths,
    trackers,
    aspect,
    count,
  };
}
