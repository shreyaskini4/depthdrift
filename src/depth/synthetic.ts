/**
 * Procedural and Heuristic Synthetic Depth Map Generator
 * 
 * Generates high-quality procedural depth maps when:
 * 1. Working in offline mode or when network download fails
 * 2. Instant fallback is required
 * 3. Unit testing without requiring ONNX model weights
 * 
 * Heuristic combines:
 * - Luminance / photometric contrast
 * - Subject centrality (radial Gaussian/cosine falloff)
 * - Atmospheric perspective (ground vs sky vertical gradient)
 * - High-frequency edge saliency
 * 
 * License: Apache-2.0
 */

import type { DepthResult } from '@/types';

/**
 * Creates a synthetic depth map using image luminance and spatial heuristics,
 * or pure procedural geometric curves if no pixel data is provided.
 * 
 * Returns Float32Array in range [0.0, 1.0] where 1.0 is foreground and 0.0 is background.
 */
export function createSyntheticDepth(
  width: number,
  height: number,
  imagePixels?: ImageData | Uint8ClampedArray | Uint8Array | Float32Array
): DepthResult {
  const pixelCount = width * height;
  const depthData = new Float32Array(pixelCount);

  if (pixelCount === 0) {
    return { width, height, data: depthData };
  }

  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.hypot(cx, cy);

  let rawRgba: Uint8ClampedArray | Uint8Array | Float32Array | null = null;
  if (imagePixels) {
    if ('data' in imagePixels && imagePixels.data instanceof Uint8ClampedArray) {
      rawRgba = imagePixels.data;
    } else if (
      imagePixels instanceof Uint8ClampedArray ||
      imagePixels instanceof Uint8Array ||
      imagePixels instanceof Float32Array
    ) {
      rawRgba = imagePixels;
    }
  }

  if (rawRgba && rawRgba.length >= pixelCount * 4) {
    // 1. Calculate luminance map for all pixels
    const luminanceMap = new Float32Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 4;
      const r = rawRgba[idx];
      const g = rawRgba[idx + 1];
      const b = rawRgba[idx + 2];
      // Rec. 709 luminance
      luminanceMap[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0;
    }

    // 2. Synthesize depth combining radial centrality, vertical perspective, luminance, and edge gradient
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      const dy = y - cy;
      const verticalWeight = 0.25 * (1.0 - y / height); // Ground is closer, sky further

      for (let x = 0; x < width; x++) {
        const dx = x - cx;
        const distNorm = Math.min(1.0, Math.hypot(dx, dy) / maxRadius);
        // Cosine falloff from center: 1.0 at center, 0.0 at corners
        const radialFalloff = Math.cos(distNorm * (Math.PI / 2));

        const pixelIndex = rowOffset + x;
        const lum = luminanceMap[pixelIndex];

        // Simple edge contrast estimation with adjacent neighbors
        const leftLum = x > 0 ? luminanceMap[pixelIndex - 1] : lum;
        const rightLum = x < width - 1 ? luminanceMap[pixelIndex + 1] : lum;
        const topLum = y > 0 ? luminanceMap[pixelIndex - width] : lum;
        const bottomLum = y < height - 1 ? luminanceMap[pixelIndex + width] : lum;

        const edgeStrength = Math.min(1.0, Math.hypot(rightLum - leftLum, bottomLum - topLum) * 2.0);

        // Weighted heuristic combination
        const depthVal =
          0.38 * radialFalloff +
          0.27 * lum +
          0.20 * verticalWeight +
          0.15 * edgeStrength;

        depthData[pixelIndex] = depthVal;
      }
    }
  } else {
    // Pure geometric procedural depth (smooth dome with harmonic relief)
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      const ny = (y - cy) / cy; // [-1..1]
      const nyRamp = 0.2 * (1.0 - y / height);

      for (let x = 0; x < width; x++) {
        const nx = (x - cx) / cx; // [-1..1]
        const r2 = nx * nx + ny * ny;
        const dome = Math.max(0.0, 1.0 - Math.sqrt(r2));
        const waves = 0.08 * (Math.cos(nx * 6.28) * Math.sin(ny * 6.28));
        const val = dome + nyRamp + waves;
        depthData[rowOffset + x] = val;
      }
    }
  }

  // Normalize array to strict [0.0, 1.0] range
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < pixelCount; i++) {
    const v = depthData[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }

  const range = max - min;
  const invRange = range > 1e-6 ? 1.0 / range : 1.0;
  for (let i = 0; i < pixelCount; i++) {
    depthData[i] = Math.max(0.0, Math.min(1.0, (depthData[i] - min) * invRange));
  }

  return {
    width,
    height,
    data: depthData,
  };
}
