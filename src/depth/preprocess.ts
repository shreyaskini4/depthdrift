/**
 * Preprocessing utilities for Depth Anything ONNX Models
 * 
 * Prepares image bitmaps for model ingestion:
 * - Resizes to model dimensions (e.g. 518x518) via OffscreenCanvas
 * - Normalizes RGB channels using ImageNet mean [0.485, 0.456, 0.406] and std [0.229, 0.224, 0.225]
 * - Converts to planar Float32Array NCHW tensor layout: [1, 3, height, width]
 * 
 * License: Apache-2.0
 */

import * as ort from 'onnxruntime-web';

export interface PreprocessOptions {
  targetWidth: number;
  targetHeight: number;
  mean?: [number, number, number];
  std?: [number, number, number];
}

const DEFAULT_MEAN: [number, number, number] = [0.485, 0.456, 0.406];
const DEFAULT_STD: [number, number, number] = [0.229, 0.224, 0.225];

/**
 * Preprocesses an ImageBitmap into an ONNX Float32 tensor with shape [1, 3, targetHeight, targetWidth].
 */
export function preprocessImage(
  imageBitmap: ImageBitmap,
  options: PreprocessOptions
): { tensor: ort.Tensor; originalWidth: number; originalHeight: number } {
  const {
    targetWidth,
    targetHeight,
    mean = DEFAULT_MEAN,
    std = DEFAULT_STD,
  } = options;

  const originalWidth = imageBitmap.width;
  const originalHeight = imageBitmap.height;

  // Use OffscreenCanvas to resize cleanly
  const canvas = new OffscreenCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Failed to obtain 2D rendering context from OffscreenCanvas.');
  }

  // Draw scaled image
  ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);
  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const rgba = imageData.data;

  const pixelCount = targetWidth * targetHeight;
  const tensorData = new Float32Array(3 * pixelCount);

  const rOffset = 0;
  const gOffset = pixelCount;
  const bOffset = 2 * pixelCount;

  const [meanR, meanG, meanB] = mean;
  const [stdR, stdG, stdB] = std;

  for (let i = 0; i < pixelCount; i++) {
    const srcIndex = i * 4;
    const r = rgba[srcIndex] / 255.0;
    const g = rgba[srcIndex + 1] / 255.0;
    const b = rgba[srcIndex + 2] / 255.0;

    tensorData[rOffset + i] = (r - meanR) / stdR;
    tensorData[gOffset + i] = (g - meanG) / stdG;
    tensorData[bOffset + i] = (b - meanB) / stdB;
  }

  const tensor = new ort.Tensor('float32', tensorData, [1, 3, targetHeight, targetWidth]);

  return {
    tensor,
    originalWidth,
    originalHeight,
  };
}
