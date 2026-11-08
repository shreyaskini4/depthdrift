/**
 * Web Worker for Client-Side Depth Estimation in Drift
 * 
 * ============================================================================
 * MODEL ATTRIBUTION & LICENSE NOTICE:
 * Target Model: Depth Anything V2 Small ONNX (Quantized Q8)
 * Hugging Face: https://huggingface.co/onnx-community/Depth-Anything-V2-Small-ONNX
 * Model URL: https://huggingface.co/onnx-community/Depth-Anything-V2-Small-ONNX/resolve/main/onnx/model_quantized.onnx
 * Fallback URL: https://huggingface.co/onnx-community/Depth-Anything-V2-Small-ONNX/resolve/main/onnx/model_q8.onnx
 * 
 * Original Authors: Lihe Yang et al. (TikTok / ByteDance / Univ of Hong Kong)
 * License: Apache License 2.0 (Apache-2.0)
 * https://www.apache.org/licenses/LICENSE-2.0
 * 
 * Features:
 * - Cache API persistence under 'drift-models-v1'
 * - Streaming download with percent progress reporting
 * - Automatic retry on network failure
 * - Execution provider fallback: WebGPU -> WASM
 * - ImageNet normalization [0.485, 0.456, 0.406] / [0.229, 0.224, 0.225]
 * - Min-max depth normalization to [0.0, 1.0] (1.0 = foreground, 0.0 = background)
 * - Offline / Failure Heuristic Fallback (luminance + radial center falloff)
 * - Extensible ModelPipeline architecture (supports FastDepth / alternate models)
 * ============================================================================
 */

import type {
  DepthProgressEvent,
  DepthWorkerRequest,
  DepthWorkerResponse,
} from '@/types';
import {
  CompositeModelPipeline,
  DEPTH_ANYTHING_V2_CONFIG,
  HeuristicModelPipeline,
  ONNXModelPipeline,
} from './pipeline';
import { computeDepthStats } from './postprocess';

// Worker context abstraction to ensure clean typings in DOM/Worker mixed environments
interface WorkerContext {
  postMessage(message: DepthWorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<DepthWorkerRequest>) => void) | null;
}

const workerScope = self as unknown as WorkerContext;

// Pipeline instance
let compositePipeline: CompositeModelPipeline | null = null;

function getOrCreatePipeline(preferWebGPU: boolean = true, customModelUrl?: string): CompositeModelPipeline {
  if (compositePipeline) {
    return compositePipeline;
  }

  const primaryConfig = { ...DEPTH_ANYTHING_V2_CONFIG };
  if (customModelUrl) {
    primaryConfig.primaryUrl = customModelUrl;
  }

  const primaryPipeline = new ONNXModelPipeline(primaryConfig, {
    preferWebGPU,
    cacheName: 'drift-models-v1',
  });

  const heuristicFallback = new HeuristicModelPipeline();

  compositePipeline = new CompositeModelPipeline(
    [primaryPipeline],
    heuristicFallback
  );

  return compositePipeline;
}

workerScope.onmessage = async (event: MessageEvent<DepthWorkerRequest>) => {
  const request = event.data;
  if (!request || !request.type) return;

  const { type, id, imageBitmap, modelUrl, options } = request;

  try {
    switch (type) {
      case 'INIT': {
        const preferWebGPU = options?.preferWebGPU ?? true;
        const pipeline = getOrCreatePipeline(preferWebGPU, modelUrl);

        const onProgress = (prog: DepthProgressEvent) => {
          const response: DepthWorkerResponse = {
            type: 'INIT_PROGRESS',
            id,
            progress: prog,
          };
          workerScope.postMessage(response);
        };

        await pipeline.init(onProgress);

        const completeResponse: DepthWorkerResponse = {
          type: 'INIT_COMPLETE',
          id,
          progress: {
            stage: 'ready',
            progress: 100,
            message: `Depth pipeline initialized (${pipeline.provider})`,
          },
        };
        workerScope.postMessage(completeResponse);
        break;
      }

      case 'ESTIMATE': {
        if (!imageBitmap) {
          throw new Error('ESTIMATE request received without an ImageBitmap payload.');
        }

        const preferWebGPU = options?.preferWebGPU ?? true;
        const pipeline = getOrCreatePipeline(preferWebGPU, modelUrl);

        if (!pipeline.isReady) {
          await pipeline.init((prog) => {
            workerScope.postMessage({
              type: 'INIT_PROGRESS',
              id,
              progress: prog,
            });
          });
        }

        // Notify inference beginning
        workerScope.postMessage({
          type: 'INIT_PROGRESS',
          id,
          progress: {
            stage: 'inferring',
            progress: 50,
            message: 'Calculating monocular depth tensor...',
          },
        });

        const depthResult = await pipeline.estimate(imageBitmap, {
          maxDimension: options?.maxDimension,
        });

        // Tag provider and high-level source
        depthResult.provider = pipeline.provider;
        depthResult.source = pipeline.provider === 'heuristic' ? 'heuristic' : 'model';

        // Dev Telemetry & Logging
        const stats = computeDepthStats(depthResult.data);
        console.log(
          `[Drift Depth Worker] Depth result: min=${stats.min.toFixed(4)}, max=${stats.max.toFixed(4)}, mean=${stats.mean.toFixed(4)}, std=${stats.std.toFixed(4)} | Provider: ${pipeline.provider.toUpperCase()} | Source: ${depthResult.source.toUpperCase()}`
        );

        // Close input bitmap to free GPU/worker memory
        try {
          imageBitmap.close();
        } catch {
          // Best effort
        }

        const estimateResponse: DepthWorkerResponse = {
          type: 'ESTIMATE_RESULT',
          id,
          result: depthResult,
        };

        // Transfer raw depth buffer for zero-copy performance
        workerScope.postMessage(estimateResponse, [depthResult.data.buffer]);
        break;
      }

      default:
        throw new Error(`Unknown DepthWorkerRequest type: ${(request as DepthWorkerRequest).type}`);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[DepthWorker] Error handling ${type} request [id=${id}]:`, error);

    // If an ImageBitmap was passed, close it
    if (imageBitmap) {
      try {
        imageBitmap.close();
      } catch {
        // Best effort
      }
    }

    const errorResponse: DepthWorkerResponse = {
      type: 'ERROR',
      id,
      error: errorMsg,
    };
    workerScope.postMessage(errorResponse);
  }
};
