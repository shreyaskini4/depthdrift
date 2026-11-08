/**
 * Drift - High-Resolution PNG Snapshot Exporter
 * Composites the 3D particle WebGL canvas and 2D HUD overlay canvas
 * into a single full-resolution composite image and triggers download.
 */

import type { ColorMode } from '../types';

export interface SnapshotOptions {
  particleCanvas: HTMLCanvasElement;
  overlayCanvas: HTMLCanvasElement;
  colorMode: ColorMode;
  filenamePrefix?: string;
}

/**
 * Generates an ISO-like timestamp string safe for filenames: YYYY-MM-DD-HHmmss
 */
export function getExportTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}-${mm}-${dd}-${hh}${min}${ss}`;
}

/**
 * Returns background fill color string based on active color rendering mode.
 */
export function getBackgroundColor(colorMode: ColorMode): string {
  return colorMode === 'ON_WHITE' ? '#ffffff' : '#050506';
}

/**
 * Captures and composites the particle and overlay canvases into a full-resolution PNG
 * and triggers an automatic browser download.
 *
 * @param options Export configuration including canvas references and color mode
 * @returns Promise resolving to the downloaded filename
 */
export async function exportSnapshot(options: SnapshotOptions): Promise<string> {
  const { particleCanvas, overlayCanvas, colorMode, filenamePrefix = 'drift-snapshot' } = options;

  if (!particleCanvas || !overlayCanvas) {
    throw new Error('[Drift Export] Particle or overlay canvas reference missing.');
  }

  // Use the native physical pixel resolution of the canvas buffers
  const width = Math.max(particleCanvas.width, overlayCanvas.width);
  const height = Math.max(particleCanvas.height, overlayCanvas.height);

  if (width <= 0 || height <= 0) {
    throw new Error(`[Drift Export] Invalid canvas dimensions: ${width}x${height}`);
  }

  // Create high-resolution composite canvas
  const compositeCanvas = document.createElement('canvas');
  compositeCanvas.width = width;
  compositeCanvas.height = height;

  const ctx = compositeCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('[Drift Export] Could not obtain 2D rendering context for composite canvas.');
  }

  // 1. Fill solid background (preserves clean contrast without WebGL alpha bleed)
  ctx.fillStyle = getBackgroundColor(colorMode);
  ctx.fillRect(0, 0, width, height);

  // 2. Render 3D particle canvas
  ctx.drawImage(particleCanvas, 0, 0, width, height);

  // 3. Render 2D overlay canvas (HUD, links, trackers, scan, trails, marks, draw)
  ctx.drawImage(overlayCanvas, 0, 0, width, height);

  // 4. Generate timestamped filename
  const timestamp = getExportTimestamp();
  const filename = `${filenamePrefix}-${timestamp}.png`;

  // 5. Convert to Blob and trigger browser download
  return new Promise<string>((resolve, reject) => {
    compositeCanvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('[Drift Export] Failed to serialize composite canvas to PNG blob.'));
        return;
      }

      const blobUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.style.display = 'none';
      downloadLink.href = blobUrl;
      downloadLink.download = filename;

      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      // Clean up object URL after download initiated
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 5000);

      resolve(filename);
    }, 'image/png');
  });
}
