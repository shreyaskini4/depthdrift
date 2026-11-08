/**
 * DepthEstimator Manager for Drift
 * 
 * Manages the background Depth Estimation Web Worker:
 * - Worker lifecycle management and message correlation
 * - Vite module worker integration
 * - Zero-copy transfer of ImageBitmap and depth Float32Array buffers
 * - Graceful fallback to synthetic depth generation if worker/model is unavailable
 * 
 * Model Attribution & License:
 * Depth Anything V2 Small ONNX (Quantized Q8)
 * Apache License 2.0 (Apache-2.0)
 * https://www.apache.org/licenses/LICENSE-2.0
 */

import type {
  DepthEstimator,
  DepthProgressEvent,
  DepthResult,
  DepthWorkerRequest,
  DepthWorkerResponse,
} from '@/types';
import { createSyntheticDepth } from './synthetic';

interface PendingRequest {
  resolve: (value?: DepthResult) => void;
  reject: (reason?: unknown) => void;
  onProgress?: (progress: DepthProgressEvent) => void;
}

export class DepthEstimatorImpl implements DepthEstimator {
  private worker: Worker | null = null;
  private ready: boolean = false;
  private initializing: boolean = false;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private requestCounter: number = 0;
  private fallbackOnly: boolean = false;

  constructor() {
    this.ensureWorker();
  }

  private ensureWorker(): Worker | null {
    if (this.fallbackOnly) return null;
    if (this.worker) return this.worker;

    try {
      this.worker = new Worker(
        new URL('./depth.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = this.handleWorkerMessage.bind(this);
      this.worker.onerror = this.handleWorkerError.bind(this);
      return this.worker;
    } catch (err) {
      console.warn('[DepthEstimator] Failed to instantiate Web Worker. Entering fallback mode:', err);
      this.fallbackOnly = true;
      this.ready = true;
      return null;
    }
  }

  private handleWorkerMessage(event: MessageEvent<DepthWorkerResponse>): void {
    const data = event.data;
    if (!data || !data.id) return;

    const pending = this.pendingRequests.get(data.id);
    if (!pending) return;

    switch (data.type) {
      case 'INIT_PROGRESS':
        if (data.progress && pending.onProgress) {
          pending.onProgress(data.progress);
        }
        break;

      case 'INIT_COMPLETE':
        this.ready = true;
        this.pendingRequests.delete(data.id);
        pending.resolve(undefined);
        break;

      case 'ESTIMATE_RESULT':
        this.pendingRequests.delete(data.id);
        if (data.result) {
          pending.resolve(data.result);
        } else {
          pending.reject(new Error('Depth worker returned empty result.'));
        }
        break;

      case 'ERROR':
        this.pendingRequests.delete(data.id);
        pending.reject(new Error(data.error || 'Unknown worker error occurred.'));
        break;
    }
  }

  private handleWorkerError(err: ErrorEvent): void {
    console.error('[DepthEstimator] Unhandled Web Worker error:', err);
    // Reject all active pending requests
    for (const [id, req] of this.pendingRequests) {
      req.reject(new Error(`Worker error: ${err.message || 'Worker encountered an uncaught error'}`));
      this.pendingRequests.delete(id);
    }
  }

  private nextId(prefix: string = 'req'): string {
    return `${prefix}_${Date.now()}_${++this.requestCounter}`;
  }

  public isReady(): boolean {
    return this.ready;
  }

  public async init(onProgress?: (progress: DepthProgressEvent) => void): Promise<void> {
    if (this.ready) {
      if (onProgress) {
        onProgress({ stage: 'ready', progress: 100, message: 'Depth model already ready.' });
      }
      return;
    }

    if (this.fallbackOnly) {
      this.ready = true;
      if (onProgress) {
        onProgress({
          stage: 'ready',
          progress: 100,
          message: 'Offline procedural fallback active.',
        });
      }
      return;
    }

    if (this.initializing) {
      // Wait for existing initialization to complete
      return new Promise<void>((resolve, reject) => {
        const check = () => {
          if (this.ready) resolve();
          else if (!this.initializing) reject(new Error('Initialization failed previously.'));
          else setTimeout(check, 50);
        };
        check();
      });
    }

    this.initializing = true;
    const worker = this.ensureWorker();

    if (!worker) {
      this.ready = true;
      this.initializing = false;
      return;
    }

    const reqId = this.nextId('init');

    return new Promise<void>((resolve) => {
      this.pendingRequests.set(reqId, {
        resolve: () => {
          this.initializing = false;
          resolve();
        },
        reject: (err) => {
          this.initializing = false;
          console.warn('[DepthEstimator] Remote model init failed, switching to procedural fallback:', err);
          // Don't leave app stranded; mark fallback as active
          this.ready = true;
          if (onProgress) {
            onProgress({
              stage: 'ready',
              progress: 100,
              message: 'Using heuristic fallback depth estimator.',
            });
          }
          resolve();
        },
        onProgress,
      });

      const request: DepthWorkerRequest = {
        type: 'INIT',
        id: reqId,
        options: {
          preferWebGPU: true,
        },
      };

      worker.postMessage(request);
    });
  }

  public async estimateDepth(
    source: ImageBitmap | HTMLImageElement | HTMLCanvasElement | ImageData,
    onProgress?: (progress: DepthProgressEvent) => void
  ): Promise<DepthResult> {
    // 1. Create a dedicated ImageBitmap so the source element is not transferred/neutered
    const imageBitmap = await createImageBitmap(source);

    // If running in local fallback mode
    const worker = this.worker;
    if (this.fallbackOnly || !worker) {
      return this.computeLocalFallback(imageBitmap, onProgress);
    }

    const reqId = this.nextId('estimate');

    return new Promise<DepthResult>((resolve, reject) => {
      this.pendingRequests.set(reqId, {
        resolve: (result?: DepthResult) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error('Depth worker returned empty result.'));
          }
        },
        reject: async (err) => {
          console.warn('[DepthEstimator] Worker depth estimation failed, computing procedural fallback:', err);
          try {
            const fallbackResult = await this.computeLocalFallback(imageBitmap, onProgress);
            resolve(fallbackResult);
          } catch (fbErr) {
            reject(fbErr);
          }
        },
        onProgress,
      });

      const request: DepthWorkerRequest = {
        type: 'ESTIMATE',
        id: reqId,
        imageBitmap,
        options: {
          preferWebGPU: true,
          maxDimension: 518,
        },
      };

      // Transfer ImageBitmap for zero-copy transmission to worker
      worker.postMessage(request, [imageBitmap]);
    });
  }

  /**
   * Generates a procedural heuristic depth map on the main thread
   * if the worker is unavailable or fails.
   */
  private async computeLocalFallback(
    imageBitmap: ImageBitmap,
    onProgress?: (progress: DepthProgressEvent) => void
  ): Promise<DepthResult> {
    if (onProgress) {
      onProgress({
        stage: 'inferring',
        progress: 50,
        message: 'Calculating procedural depth map...',
      });
    }

    const w = imageBitmap.width;
    const h = imageBitmap.height;

    // Read pixel data via offscreen canvas
    let imgData: ImageData | undefined;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(imageBitmap, 0, 0);
        imgData = ctx.getImageData(0, 0, w, h);
      }
    } catch (e) {
      console.warn('[DepthEstimator] Failed to read ImageData for fallback:', e);
    }

    const result = createSyntheticDepth(w, h, imgData);

    if (onProgress) {
      onProgress({
        stage: 'ready',
        progress: 100,
        message: 'Procedural depth map generated.',
      });
    }

    return result;
  }

  public dispose(): void {
    if (this.worker) {
      // Reject any pending requests
      for (const [id, req] of this.pendingRequests) {
        req.reject(new Error('DepthEstimator was disposed.'));
        this.pendingRequests.delete(id);
      }
      this.worker.terminate();
      this.worker = null;
    }
    this.ready = false;
    this.initializing = false;
  }
}

/**
 * Creates and returns a DepthEstimator instance.
 */
export function createDepthEstimator(): DepthEstimator {
  return new DepthEstimatorImpl();
}

export { createSyntheticDepth };
