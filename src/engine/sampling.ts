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
  /** Actual normalized monocular depth [0.0..1.0] (1.0 = near, 0.0 = far) */
  rawDepth: number;
  intensity: number;
  label: string;
  seed?: number;
  salience?: number;
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

export interface SampleOptions {
  count?: number;
  targetCount?: number;
}

export const MAX_PARTICLE_CAPACITY = 600_000;

/**
 * Shuffles particle attributes in-place using the Fisher-Yates shuffle algorithm.
 * All attribute arrays are permuted with an identical permutation so positions,
 * colors, randomSeeds, saliences, and depths stay strictly linked.
 */
export function shuffleParticles(
  positions: Float32Array,
  colors: Float32Array,
  randomSeeds: Float32Array,
  saliences: Float32Array,
  depths: Float32Array,
  count?: number
): void;
export function shuffleParticles(particles: {
  positions: Float32Array;
  colors: Float32Array;
  randomSeeds: Float32Array;
  saliences: Float32Array;
  depths: Float32Array;
  count?: number;
}): void;
export function shuffleParticles(
  first:
    | {
        positions: Float32Array;
        colors: Float32Array;
        randomSeeds: Float32Array;
        saliences: Float32Array;
        depths: Float32Array;
        count?: number;
      }
    | Float32Array,
  colorsArg?: Float32Array,
  randomSeedsArg?: Float32Array,
  saliencesArg?: Float32Array,
  depthsArg?: Float32Array,
  countArg?: number
): void {
  let positions: Float32Array;
  let colors: Float32Array;
  let randomSeeds: Float32Array;
  let saliences: Float32Array;
  let depths: Float32Array;
  let n: number;

  if (first instanceof Float32Array) {
    positions = first;
    colors = colorsArg!;
    randomSeeds = randomSeedsArg!;
    saliences = saliencesArg!;
    depths = depthsArg!;
    n = countArg !== undefined ? countArg : saliences.length;
  } else {
    positions = first.positions;
    colors = first.colors;
    randomSeeds = first.randomSeeds;
    saliences = first.saliences;
    depths = first.depths;
    n = first.count !== undefined ? first.count : saliences.length;
  }

  if (n <= 1) return;

  for (let i = n - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    if (i === j) continue;

    const i3 = i * 3;
    const j3 = j * 3;

    // Swap positions (stride 3)
    let temp = positions[i3];
    positions[i3] = positions[j3];
    positions[j3] = temp;

    temp = positions[i3 + 1];
    positions[i3 + 1] = positions[j3 + 1];
    positions[j3 + 1] = temp;

    temp = positions[i3 + 2];
    positions[i3 + 2] = positions[j3 + 2];
    positions[j3 + 2] = temp;

    // Swap colors (stride 3)
    temp = colors[i3];
    colors[i3] = colors[j3];
    colors[j3] = temp;

    temp = colors[i3 + 1];
    colors[i3 + 1] = colors[j3 + 1];
    colors[j3 + 1] = temp;

    temp = colors[i3 + 2];
    colors[i3 + 2] = colors[j3 + 2];
    colors[j3 + 2] = temp;

    // Swap randomSeeds (stride 2)
    const i2 = i * 2;
    const j2 = j * 2;
    temp = randomSeeds[i2];
    randomSeeds[i2] = randomSeeds[j2];
    randomSeeds[j2] = temp;

    temp = randomSeeds[i2 + 1];
    randomSeeds[i2 + 1] = randomSeeds[j2 + 1];
    randomSeeds[j2 + 1] = temp;

    // Swap saliences (stride 1)
    temp = saliences[i];
    saliences[i] = saliences[j];
    saliences[j] = temp;

    // Swap depths (stride 1)
    temp = depths[i];
    depths[i] = depths[j];
    depths[j] = temp;
  }
}

/**
 * Extracts raw ImageData from HTMLCanvasElement, ImageBitmap, or ImageData.
 * Resamples to at most 2048px on the long edge so fine detail survives zoom.
 */
export function extractImageData(
  pixels: HTMLCanvasElement | ImageBitmap | ImageData,
  maxDimension: number = 2048
): ImageData {
  const width = (pixels as { width: number }).width;
  const height = (pixels as { height: number }).height;
  const longEdge = Math.max(width, height);

  let targetWidth = width;
  let targetHeight = height;

  if (maxDimension > 0 && longEdge > maxDimension) {
    const scale = maxDimension / longEdge;
    targetWidth = Math.max(1, Math.round(width * scale));
    targetHeight = Math.max(1, Math.round(height * scale));
  }

  // If already ImageData and no resize needed, return directly
  if (typeof ImageData !== 'undefined' && pixels instanceof ImageData) {
    if (targetWidth === width && targetHeight === height) {
      return pixels;
    }
  }

  const createCanvas = (w: number, h: number): HTMLCanvasElement | OffscreenCanvas => {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(w, h);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  };

  const canvas = createCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;

  if (!ctx) {
    throw new Error('Unable to acquire 2D rendering context for image sampling.');
  }

  if (typeof ImageData !== 'undefined' && pixels instanceof ImageData) {
    const tempCanvas = createCanvas(width, height);
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true }) as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (tempCtx) {
      tempCtx.putImageData(pixels, 0, 0);
      ctx.drawImage(tempCanvas as CanvasImageSource, 0, 0, targetWidth, targetHeight);
    }
  } else {
    ctx.drawImage(pixels as CanvasImageSource, 0, 0, targetWidth, targetHeight);
  }

  return ctx.getImageData(0, 0, targetWidth, targetHeight);
}

/**
 * Samples RGB color with bilinear interpolation from ImageData at normalized (u, v) coordinates.
 * Writes normalized [0..1] values into out array at offset o.
 */
export function sampleColorBilinear(
  img: ImageData,
  u: number,
  v: number,
  out: Float32Array,
  o: number
): void {
  const { width: w, height: h, data } = img;
  const x = Math.min(w - 1, Math.max(0, u * w - 0.5));
  const y = Math.min(h - 1, Math.max(0, v * h - 0.5));
  const x0 = x | 0, y0 = y | 0;
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const a = (y0 * w + x0) * 4, b = (y0 * w + x1) * 4;
  const c = (y1 * w + x0) * 4, d = (y1 * w + x1) * 4;
  for (let k = 0; k < 3; k++) {
    const top = data[a + k] * (1 - fx) + data[b + k] * fx;
    const bot = data[c + k] * (1 - fx) + data[d + k] * fx;
    out[o + k] = (top * (1 - fy) + bot * fy) / 255;
  }
}

/**
 * Bilinearly samples a normalized depth map [0..1] at (u, v) normalized coordinates [0..1].
 */
export function sampleDepth(depth: DepthResult, u: number, v: number): number {
  const { width, height, data } = depth;
  const cu = u < 0 ? 0 : u > 1 ? 1 : u;
  const cv = v < 0 ? 0 : v > 1 ? 1 : v;

  const x = cu * (width - 1);
  const y = cv * (height - 1);

  const x0 = x | 0;
  const y0 = y | 0;
  const x1 = x0 + 1 < width ? x0 + 1 : width - 1;
  const y1 = y0 + 1 < height ? y0 + 1 : height - 1;

  const dx = x - x0;
  const dy = y - y0;

  const r0 = y0 * width;
  const r1 = y1 * width;

  const d00 = data[r0 + x0];
  const d10 = data[r0 + x1];
  const d01 = data[r1 + x0];
  const d11 = data[r1 + x1];

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
  targetCountOrOptions: number | SampleOptions = MAX_PARTICLE_CAPACITY
): SampledParticles {
  const tStart = performance.now();
  let targetCount = MAX_PARTICLE_CAPACITY;
  if (typeof targetCountOrOptions === 'number') {
    targetCount = targetCountOrOptions;
  } else if (targetCountOrOptions && typeof targetCountOrOptions === 'object') {
    if (typeof targetCountOrOptions.count === 'number') {
      targetCount = targetCountOrOptions.count;
    } else if (typeof targetCountOrOptions.targetCount === 'number') {
      targetCount = targetCountOrOptions.targetCount;
    }
  }

  if (!targetCount || targetCount <= 0) {
    targetCount = MAX_PARTICLE_CAPACITY;
  }
  const imgData = extractImageData(pixelsSource, 2048);
  const imgWidth = imgData.width;
  const imgHeight = imgData.height;
  const aspect = imgWidth / Math.max(1, imgHeight);
  const imgBytes = imgData.data;

  // Analysis grid dimensions (downscaled for fast salience computation)
  const gridW = Math.min(512, imgWidth);
  const gridH = Math.min(512, imgHeight);
  const totalCells = gridW * gridH;
  const invGridW = 1.0 / gridW;
  const invGridH = 1.0 / gridH;

  const luminanceGrid = new Float32Array(totalCells);
  const depthGrid = new Float32Array(totalCells);
  const salienceGrid = new Float32Array(totalCells);

  // 1. Compute downsampled luminance and depth grid
  for (let gy = 0; gy < gridH; gy++) {
    const v = (gy + 0.5) * invGridH;
    const py = Math.min(imgHeight - 1, (v * imgHeight) | 0);
    const rowOffset = py * imgWidth;
    const gRowOffset = gy * gridW;

    for (let gx = 0; gx < gridW; gx++) {
      const u = (gx + 0.5) * invGridW;
      const px = Math.min(imgWidth - 1, (u * imgWidth) | 0);
      const pIdx = (rowOffset + px) * 4;

      const r = imgBytes[pIdx];
      const g = imgBytes[pIdx + 1];
      const b = imgBytes[pIdx + 2];

      const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
      const dep = sampleDepth(depth, u, v);

      const cellIdx = gRowOffset + gx;
      luminanceGrid[cellIdx] = luma;
      depthGrid[cellIdx] = dep;
    }
  }

  // 2. Compute edge gradients and salience
  const cdf = new Float64Array(totalCells);
  let cumulativeWeight = 0;

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

      // Salience: combined depth boundary, luminance gradient, and tonal prominence
      const sal = Math.max(0.02, Math.min(1.0, 0.45 * depthGrad + 0.40 * lumaGrad + 0.15 * luma));
      const cellIdx = yRow + gx;
      salienceGrid[cellIdx] = sal;

      const w = 0.05 + 0.5 * Math.pow(luma, 1.4) + 0.45 * Math.max(lumaGrad, depthGrad * 0.6);
      cumulativeWeight += w;
      cdf[cellIdx] = cumulativeWeight;
    }
  }

  // Acceleration LUT for fast CDF importance sampling
  const LUT_SIZE = 65536;
  const lut = new Int32Array(LUT_SIZE);
  let curLutIdx = 0;
  for (let i = 0; i < LUT_SIZE; i++) {
    const threshold = (i / LUT_SIZE) * cumulativeWeight;
    while (curLutIdx < totalCells - 1 && cdf[curLutIdx] < threshold) {
      curLutIdx++;
    }
    lut[i] = curLutIdx;
  }
  const lutScale = LUT_SIZE / cumulativeWeight;

  // 3. Extract salient trackers: strictly local maxima of depth gradient, edge strength, and luminance (NMS)
  // Non-maximum suppression (NMS) local peaks across the grid
  interface PeakCandidate {
    gx: number;
    gy: number;
    u: number;
    v: number;
    sal: number;
  }
  const candidatePeaks: PeakCandidate[] = [];

  for (let gy = 1; gy < gridH - 1; gy++) {
    const yRow = gy * gridW;
    for (let gx = 1; gx < gridW - 1; gx++) {
      const idx = yRow + gx;
      const s = salienceGrid[idx];
      if (s < 0.05) continue; // Filter out flat/low-salience background

      let isPeak = true;
      for (let dy = -1; dy <= 1 && isPeak; dy++) {
        const nyRow = (gy + dy) * gridW;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nIdx = nyRow + (gx + dx);
          const ns = salienceGrid[nIdx];
          if (ns > s || (ns === s && nIdx < idx)) {
            isPeak = false;
            break;
          }
        }
      }

      if (isPeak) {
        candidatePeaks.push({
          gx,
          gy,
          u: (gx + 0.5) / gridW,
          v: (gy + 0.5) / gridH,
          sal: s,
        });
      }
    }
  }

  // Sort candidate peaks strictly by prominence (salience descending)
  candidatePeaks.sort((a, b) => b.sal - a.sal);

  // Enforce minimum spatial spacing in image/grid space (>=60px on ~1000px screen => ~0.06 normalized distance)
  const selectedCandidates: PeakCandidate[] = [];
  const maxTrackerCandidates = 100;
  const minSpacing = 0.06;
  const minSpacingSq = minSpacing * minSpacing;

  for (let i = 0; i < candidatePeaks.length && selectedCandidates.length < maxTrackerCandidates; i++) {
    const cp = candidatePeaks[i];
    let tooClose = false;
    for (let j = 0; j < selectedCandidates.length; j++) {
      const sc = selectedCandidates[j];
      const dx = (cp.u - sc.u) * aspect;
      const dy = cp.v - sc.v;
      if (dx * dx + dy * dy < minSpacingSq) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) {
      selectedCandidates.push(cp);
    }
  }

  // Relaxed second pass if image features are sparse
  if (selectedCandidates.length < 40) {
    const relaxedSpacingSq = minSpacingSq * 0.45;
    for (let i = 0; i < candidatePeaks.length && selectedCandidates.length < maxTrackerCandidates; i++) {
      const cp = candidatePeaks[i];
      if (selectedCandidates.includes(cp)) continue;
      let tooClose = false;
      for (let j = 0; j < selectedCandidates.length; j++) {
        const sc = selectedCandidates[j];
        const dx = (cp.u - sc.u) * aspect;
        const dy = cp.v - sc.v;
        if (dx * dx + dy * dy < relaxedSpacingSq) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        selectedCandidates.push(cp);
      }
    }
  }

  // Fallback for uniform images to ensure sufficient candidate coverage
  if (selectedCandidates.length < 16) {
    const step = Math.max(2, Math.floor(gridW / 10));
    for (let gy = step; gy < gridH - step && selectedCandidates.length < maxTrackerCandidates; gy += step) {
      for (let gx = step; gx < gridW - step && selectedCandidates.length < maxTrackerCandidates; gx += step) {
        const u = (gx + 0.5) / gridW;
        const v = (gy + 0.5) / gridH;
        let tooClose = false;
        for (let j = 0; j < selectedCandidates.length; j++) {
          const sc = selectedCandidates[j];
          const dx = (u - sc.u) * aspect;
          const dy = v - sc.v;
          if (dx * dx + dy * dy < 0.035 * 0.035) {
            tooClose = true;
            break;
          }
        }
        if (!tooClose) {
          selectedCandidates.push({
            gx,
            gy,
            u,
            v,
            sal: salienceGrid[gy * gridW + gx],
          });
        }
      }
    }
  }

  // Re-sort to guarantee prominence order
  selectedCandidates.sort((a, b) => b.sal - a.sal);

  const trackers: BaseTracker[] = [];
  const prefixes = ['TRK', 'NODE', 'MARK', 'DEPTH', 'EDGE'];

  for (let i = 0; i < selectedCandidates.length; i++) {
    const c = selectedCandidates[i];
    const dep = sampleDepth(depth, c.u, c.v);
    const baseX = (c.u - 0.5) * aspect;
    const baseY = 0.5 - c.v;
    const baseZ = dep - 0.5;
    const prefix = prefixes[i % prefixes.length];

    trackers.push({
      id: i,
      baseX,
      baseY,
      baseZ,
      rawDepth: dep,
      intensity: Math.max(0.05, Math.min(1.0, Math.round(c.sal * 100) / 100)),
      label: `${prefix}-${String(i + 1).padStart(2, '0')}`,
      seed: ((c.u * 12.9898 + c.v * 78.233) % 1.0 + 1.0) % 1.0,
      salience: c.sal,
    });
  }

  // 4. Sample particles
  const count = Math.min(MAX_PARTICLE_CAPACITY, targetCount);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const randomSeeds = new Float32Array(count * 2);
  const saliences = new Float32Array(count);
  const depths = new Float32Array(count);

  // 20% uniform stratified jittered points, 80% importance sampled points
  const uniformCount = Math.floor(count * 0.2);
  const importanceCount = count - uniformCount;

  const uCols = Math.round(Math.sqrt(uniformCount * aspect));
  const uRows = Math.ceil(uniformCount / Math.max(1, uCols));
  const invUCols = 1.0 / uCols;
  const invURows = 1.0 / uRows;

  let p = 0;

  // A. Stratified jittered sampling
  for (let r = 0; r < uRows && p < uniformCount; r++) {
    for (let c = 0; c < uCols && p < uniformCount; c++) {
      const u = (c + Math.random()) * invUCols;
      const v = (r + Math.random()) * invURows;

      if (u > 1.0 || v > 1.0) continue;

      const dep = sampleDepth(depth, u, v);

      const gx = Math.min(gridW - 1, (u * gridW) | 0);
      const gy = Math.min(gridH - 1, (v * gridH) | 0);
      const sal = salienceGrid[gy * gridW + gx];

      const p3 = p * 3;
      positions[p3] = (u - 0.5) * aspect;
      positions[p3 + 1] = 0.5 - v;
      positions[p3 + 2] = dep - 0.5;

      sampleColorBilinear(imgData, u, v, colors, p3);

      const p2 = p * 2;
      randomSeeds[p2] = Math.random();
      randomSeeds[p2 + 1] = Math.random();

      saliences[p] = sal;
      depths[p] = dep;

      p++;
    }
  }

  // B. Importance sampling based on tone & edge CDF
  for (let i = 0; i < importanceCount && p < count; i++) {
    const targetVal = Math.random() * cumulativeWeight;

    // Fast LUT-bounded binary search on CDF
    const bin = Math.min(LUT_SIZE - 1, (targetVal * lutScale) | 0);
    let low = bin > 0 ? lut[bin] - 1 : 0;
    let high = bin + 1 < LUT_SIZE ? lut[bin + 1] : totalCells - 1;
    let foundCell = high;

    while (low <= high) {
      const mid = (low + high) >> 1;
      if (cdf[mid] >= targetVal) {
        foundCell = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    const cellY = (foundCell / gridW) | 0;
    const cellX = foundCell - cellY * gridW;

    const u = (cellX + Math.random()) * invGridW;
    const v = (cellY + Math.random()) * invGridH;

    const dep = sampleDepth(depth, u, v);
    const sal = salienceGrid[foundCell];

    const p3 = p * 3;
    positions[p3] = (u - 0.5) * aspect;
    positions[p3 + 1] = 0.5 - v;
    positions[p3 + 2] = dep - 0.5;

    sampleColorBilinear(imgData, u, v, colors, p3);

    const p2 = p * 2;
    randomSeeds[p2] = Math.random();
    randomSeeds[p2 + 1] = Math.random();

    saliences[p] = sal;
    depths[p] = dep;

    p++;
  }

  // Shuffle particles using Fisher-Yates so lower particle counts thin evenly across the whole image
  shuffleParticles(positions, colors, randomSeeds, saliences, depths, p);

  const durationMs = performance.now() - tStart;
  console.log(`[Drift Sampling] Sampled ${p} particles at full capacity in ${durationMs.toFixed(1)}ms`);

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

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);

    const u = (col + (Math.random() - 0.5) * 0.7) / cols;
    const v = (row + (Math.random() - 0.5) * 0.7) / rows;

    const x = (u - 0.5);
    const y = (0.5 - v);

    // Mathematical ripple wave depth surface
    const r = Math.sqrt(x * x + y * y);
    const wave1 = Math.sin(r * 18.0) * 0.25;
    const wave2 = Math.cos(x * 10.0) * Math.sin(y * 10.0) * 0.15;
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

    const sal = Math.max(0.1, Math.min(1.0, Math.abs(wave1 * 3.0) + Math.abs(wave2 * 2.0) + 0.15));
    saliences[i] = sal;
    depths[i] = dep;
  }

  // Generate up to 100 well-separated salient trackers from wave surface peaks
  const defaultCandidates: { x: number; y: number; dep: number; sal: number }[] = [];
  const sampleSteps = 24;
  for (let gy = 0; gy < sampleSteps; gy++) {
    const v = (gy + 0.5) / sampleSteps;
    const y = (0.5 - v) * 1.4;
    for (let gx = 0; gx < sampleSteps; gx++) {
      const u = (gx + 0.5) / sampleSteps;
      const x = (u - 0.5) * 1.4;
      const r = Math.sqrt(x * x + y * y);
      const wave1 = Math.sin(r * 14.0) * 0.25;
      const wave2 = Math.cos(x * 8.0) * Math.sin(y * 8.0) * 0.15;
      const dep = Math.max(0.0, Math.min(1.0, 0.5 + wave1 + wave2));
      const sal = Math.max(0.1, Math.min(1.0, Math.abs(wave1 * 3.0) + Math.abs(wave2 * 2.0) + 0.15));
      defaultCandidates.push({ x, y, dep, sal });
    }
  }

  defaultCandidates.sort((a, b) => b.sal - a.sal);
  const minDefaultSpacingSq = 0.08 * 0.08;
  const prefixes = ['TRK', 'NODE', 'MARK', 'DEPTH', 'EDGE'];

  for (let i = 0; i < defaultCandidates.length && trackers.length < 100; i++) {
    const cand = defaultCandidates[i];
    let tooClose = false;
    for (let j = 0; j < trackers.length; j++) {
      const t = trackers[j];
      const dx = cand.x - t.baseX;
      const dy = cand.y - t.baseY;
      if (dx * dx + dy * dy < minDefaultSpacingSq) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) {
      const id = trackers.length;
      const prefix = prefixes[id % prefixes.length];
      trackers.push({
        id,
        baseX: cand.x,
        baseY: cand.y,
        baseZ: cand.dep - 0.5,
        rawDepth: cand.dep,
        intensity: Math.round(cand.sal * 100) / 100,
        label: `${prefix}-${String(id + 1).padStart(2, '0')}`,
        seed: ((cand.x * 12.9898 + cand.y * 78.233) % 1.0 + 1.0) % 1.0,
        salience: cand.sal,
      });
    }
  }

  // Shuffle particles using Fisher-Yates so lower particle counts thin evenly
  shuffleParticles(positions, colors, randomSeeds, saliences, depths, count);

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
