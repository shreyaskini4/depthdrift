/**
 * Postprocessing utilities for Depth ONNX Models
 * 
 * - Extracts depth predictions from ONNX output tensors
 * - Dynamically normalizes disparity to [0.0, 1.0] using 2% - 98% percentile clipping
 * - Strict orientation convention:
 *     near = 1.0 (closest to camera, maximum forward displacement / extrusion)
 *     far  = 0.0 (furthest in background, base plane / recession)
 * - Bilinear resamples depth grid to match destination dimensions for particle mapping
 * - Computes statistical telemetry (min, max, mean, std) for dev verification
 * 
 * License: Apache-2.0
 */

import type { DepthResult } from '@/types';
import * as ort from 'onnxruntime-web';

export interface PostprocessOptions {
  invert?: boolean;
  resampleToOriginal?: boolean;
  maxDimension?: number;
  lowerPercentile?: number;
  upperPercentile?: number;
}

export interface DepthStats {
  min: number;
  max: number;
  mean: number;
  std: number;
}

/**
 * Computes statistical metrics across a depth buffer:
 * min, max, mean, and standard deviation.
 */
export function computeDepthStats(data: Float32Array): DepthStats {
  const len = data.length;
  if (len === 0) {
    return { min: 0, max: 0, mean: 0, std: 0 };
  }

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;

  for (let i = 0; i < len; i++) {
    const val = data[i];
    if (val < min) min = val;
    if (val > max) max = val;
    sum += val;
  }

  const mean = sum / len;
  let sumSqDiff = 0;
  for (let i = 0; i < len; i++) {
    const diff = data[i] - mean;
    sumSqDiff += diff * diff;
  }
  const std = Math.sqrt(sumSqDiff / len);

  return { min, max, mean, std };
}

/**
 * Resamples a 2D float depth grid to target dimensions using bilinear interpolation.
 * Correctly maps the continuous boundary of source coordinates to destination coordinates.
 */
export function resampleDepthBilinear(
  source: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Float32Array {
  if (srcW === dstW && srcH === dstH) {
    return new Float32Array(source);
  }

  const output = new Float32Array(dstW * dstH);
  const xRatio = srcW > 1 && dstW > 1 ? (srcW - 1) / (dstW - 1) : 0;
  const yRatio = srcH > 1 && dstH > 1 ? (srcH - 1) / (dstH - 1) : 0;

  for (let y = 0; y < dstH; y++) {
    const srcY = y * yRatio;
    const y0 = Math.floor(srcY);
    const y1 = Math.min(y0 + 1, srcH - 1);
    const yWeight = srcY - y0;
    const yWeightInv = 1.0 - yWeight;

    const dstRowOffset = y * dstW;
    const srcRow0Offset = y0 * srcW;
    const srcRow1Offset = y1 * srcW;

    for (let x = 0; x < dstW; x++) {
      const srcX = x * xRatio;
      const x0 = Math.floor(srcX);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const xWeight = srcX - x0;
      const xWeightInv = 1.0 - xWeight;

      const p00 = source[srcRow0Offset + x0];
      const p10 = source[srcRow0Offset + x1];
      const p01 = source[srcRow1Offset + x0];
      const p11 = source[srcRow1Offset + x1];

      const top = p00 * xWeightInv + p10 * xWeight;
      const bottom = p01 * xWeightInv + p11 * xWeight;

      output[dstRowOffset + x] = top * yWeightInv + bottom * yWeight;
    }
  }

  return output;
}

/**
 * Normalizes an array of raw depth/disparity values to [0.0, 1.0] with percentile clipping.
 * 
 * Orientation Convention:
 * In Depth Anything V2, disparity is high for near objects and low for far objects:
 * - near = 1.0 (closest to camera, maximum displacement / extrusion)
 * - far  = 0.0 (furthest in background)
 * 
 * When `invert` is true (e.g. for metric depth models where distance is small for near objects):
 * - lowest distance  = 1.0 (closest to camera)
 * - highest distance = 0.0 (furthest in background)
 * 
 * Percentile clipping (default 2% to 98%) suppresses single-pixel sensor noise and disparity spikes,
 * expanding the dynamic range across the full [0.0, 1.0] span for rich depth extrusion.
 */
export function normalizeDepthArray(
  rawData: Float32Array,
  invert: boolean = false,
  lowerPercentile: number = 0.02,
  upperPercentile: number = 0.98
): Float32Array {
  const len = rawData.length;
  if (len === 0) return new Float32Array(0);

  // Stride-sample up to 65,536 values for lightning-fast percentile extraction (<2ms)
  const maxSamples = Math.min(len, 65536);
  const stride = len / maxSamples;
  const sampleBuffer = new Float32Array(maxSamples);
  let validCount = 0;

  for (let i = 0; i < maxSamples; i++) {
    const val = rawData[Math.floor(i * stride)];
    if (Number.isFinite(val)) {
      sampleBuffer[validCount++] = val;
    }
  }

  if (validCount === 0) {
    return new Float32Array(len);
  }

  const validSamples = sampleBuffer.subarray(0, validCount);
  validSamples.sort();

  const lowIdx = Math.max(0, Math.min(validCount - 1, Math.floor(validCount * lowerPercentile)));
  const highIdx = Math.max(0, Math.min(validCount - 1, Math.floor(validCount * upperPercentile)));

  let minVal = validSamples[lowIdx];
  let maxVal = validSamples[highIdx];

  // If percentiles collapse, fallback to absolute min/max
  if (maxVal <= minVal) {
    minVal = validSamples[0];
    maxVal = validSamples[validCount - 1];
  }

  const range = maxVal - minVal;
  const invRange = range > 1e-7 ? 1.0 / range : 1.0;
  const normalized = new Float32Array(len);

  for (let i = 0; i < len; i++) {
    const val = rawData[i];
    if (!Number.isFinite(val)) {
      normalized[i] = 0.0;
      continue;
    }

    // Clamp strictly within the clipped dynamic window
    const clamped = Math.max(minVal, Math.min(maxVal, val));
    let norm = (clamped - minVal) * invRange;
    if (invert) {
      norm = 1.0 - norm;
    }
    // Clamp strictly to [0.0, 1.0]
    normalized[i] = Math.max(0.0, Math.min(1.0, norm));
  }

  return normalized;
}

/**
 * Extracts and postprocesses the depth output tensor from ONNX inference session.
 */
export function postprocessDepthTensor(
  tensor: ort.Tensor,
  originalWidth: number,
  originalHeight: number,
  options: PostprocessOptions = {}
): DepthResult {
  const {
    invert = false,
    resampleToOriginal = true,
    maxDimension,
    lowerPercentile = 0.02,
    upperPercentile = 0.98,
  } = options;

  const rawData = tensor.data as Float32Array;
  const dims = tensor.dims; // e.g. [1, 518, 518] or [1, 1, 518, 518] or [518, 518]
  const tensorHeight = dims[dims.length - 2];
  const tensorWidth = dims[dims.length - 1];

  // 1. Robust min-max normalization with 2%-98% percentile clipping
  const normalizedModelDepth = normalizeDepthArray(rawData, invert, lowerPercentile, upperPercentile);

  // 2. If resample is not requested, return model resolution
  if (!resampleToOriginal) {
    return {
      width: tensorWidth,
      height: tensorHeight,
      data: normalizedModelDepth,
    };
  }

  // Determine target dimensions
  let targetW = originalWidth;
  let targetH = originalHeight;

  if (maxDimension && (targetW > maxDimension || targetH > maxDimension)) {
    const aspect = targetW / targetH;
    if (targetW > targetH) {
      targetW = maxDimension;
      targetH = Math.max(1, Math.round(targetW / aspect));
    } else {
      targetH = maxDimension;
      targetW = Math.max(1, Math.round(targetH * aspect));
    }
  }

  // 3. Resample bilinear to target image dimensions
  const resampledData = resampleDepthBilinear(
    normalizedModelDepth,
    tensorWidth,
    tensorHeight,
    targetW,
    targetH
  );

  return {
    width: targetW,
    height: targetH,
    data: resampledData,
  };
}
