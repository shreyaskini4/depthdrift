/**
 * Depth Estimation Types & Model Pipeline Interfaces for Drift
 * 
 * Model Attribution & License Notice:
 * Target Model: Depth Anything V2 Small ONNX (quantized q8)
 * Repository: onnx-community/Depth-Anything-V2-Small-ONNX
 * Original Work: Depth Anything V2 (Lihe Yang et al.)
 * License: Apache-2.0 (https://www.apache.org/licenses/LICENSE-2.0)
 */

import type {
  DepthProgressEvent,
  DepthResult,
  DepthEstimator,
  DepthWorkerRequest,
  DepthWorkerResponse,
} from '@/types';

export type {
  DepthProgressEvent,
  DepthResult,
  DepthEstimator,
  DepthWorkerRequest,
  DepthWorkerResponse,
};

export type ExecutionProvider = 'webgpu' | 'wasm' | 'heuristic';

export interface ModelConfig {
  id: string;
  name: string;
  primaryUrl: string;
  wasmUrl?: string;
  fallbackUrls?: string[];
  license: string;
  licenseUrl: string;
  inputWidth: number;
  inputHeight: number;
  mean: [number, number, number];
  std: [number, number, number];
  layout: 'NCHW' | 'NHWC';
  /**
   * Disparity: higher value = closer to camera (1.0 = foreground, 0.0 = background)
   * Metric: higher value = further distance (must be inverted for 1.0 = foreground)
   */
  outputType: 'disparity' | 'metric';
}

export interface ModelPipeline {
  readonly id: string;
  readonly name: string;
  readonly provider: ExecutionProvider;
  readonly isReady: boolean;

  init(onProgress?: (event: DepthProgressEvent) => void): Promise<void>;
  estimate(
    imageBitmap: ImageBitmap,
    options?: { maxDimension?: number }
  ): Promise<DepthResult>;
  dispose(): void;
}

export interface ProgressCallback {
  (event: DepthProgressEvent): void;
}
