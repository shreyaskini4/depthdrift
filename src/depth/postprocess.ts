/**
 * Postprocessing utilities for Depth ONNX Models
 * 
 * - Extracts depth predictions from ONNX output tensors
 * - Dynamically normalizes disparity to [0.0, 1.0] (1.0 = foreground/closest, 0.0 = background)
 * - Bilinear resamples depth grid to match destination dimensions for particle mapping
 * 
 * License: Apache-2.0
 */

import type { DepthResult } from '@/types';
import * as ort from 'onnxruntime-web';

export interface PostprocessOptions {
  invert?: boolean;
  resampleToOriginal?: boolean;
  maxDimension?: number;
}

/**
 * Resamples a 2D float depth grid to target dimensions using bilinear interpolation.
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
 * Normalizes an array of raw depth/disparity values to [0.0, 1.0].
 * By default for Depth Anything (disparity), highest disparity = 1.0 (foreground/closest).
 * If invert is true (for metric depth), lowest distance = 1.0 (foreground/closest).
 */
export function normalizeDepthArray(rawData: Float32Array, invert: boolean = false): Float32Array {
  const len = rawData.length;
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < len; i++) {
    const val = rawData[i];
    if (val < min) min = val;
    if (val > max) max = val;
  }

  const range = max - min;
  const invRange = range > 1e-7 ? 1.0 / range : 1.0;
  const normalized = new Float32Array(len);

  for (let i = 0; i < len; i++) {
    let norm = (rawData[i] - min) * invRange;
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
  } = options;

  const rawData = tensor.data as Float32Array;
  const dims = tensor.dims; // e.g. [1, 518, 518] or [1, 1, 518, 518] or [518, 518]
  const tensorHeight = dims[dims.length - 2];
  const tensorWidth = dims[dims.length - 1];

  // 1. Normalize depth values to [0.0, 1.0]
  const normalizedModelDepth = normalizeDepthArray(rawData, invert);

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
