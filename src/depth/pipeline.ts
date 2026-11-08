/**
 * Extensible Model Pipeline Architecture for Drift
 * 
 * Model Attribution & License Notice:
 * - Depth Anything V2 Small ONNX (Quantized Q8 and FP16 WebGPU)
 *   Repository: onnx-community/Depth-Anything-V2-Small-ONNX
 *   Original Authors: Lihe Yang et al. (TikTok / ByteDance / Univ of Hong Kong)
 *   License: Apache License 2.0 (Apache-2.0)
 *   https://www.apache.org/licenses/LICENSE-2.0
 * 
 * Provides:
 * - IModelPipeline abstraction
 * - ONNXModelPipeline (with WebGPU -> WASM fallback & Cache API integration)
 * - HeuristicModelPipeline (procedural / offline fallback)
 * - CompositeModelPipeline (orchestration with automatic fallback chains)
 */

import * as ort from 'onnxruntime-web/webgpu';
import type {
  DepthProgressEvent,
  DepthResult,
  ExecutionProvider,
  ModelConfig,
  ModelPipeline,
} from './types';
import { ModelCacheManager } from './cache';
import { preprocessImage } from './preprocess';
import { postprocessDepthTensor } from './postprocess';
import { createSyntheticDepth } from './synthetic';

// Configure ONNX Runtime Web local WASM binaries paths
try {
  ort.env.wasm.wasmPaths = '/wasm/';
  ort.env.wasm.numThreads = typeof navigator !== 'undefined'
    ? Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 2) - 1))
    : 1;
} catch {
  // Best-effort config
}

/**
 * Verified Hugging Face ONNX Model URLs for Depth Anything V2 Small.
 * - WebGPU: FP16 ONNX weights
 * - WASM: Q8 Quantized ONNX weights
 */
export const HF_MODEL_FP16_URL =
  'https://huggingface.co/onnx-community/Depth-Anything-V2-Small-ONNX/resolve/main/onnx/model_fp16.onnx';
export const HF_MODEL_Q8_URL =
  'https://huggingface.co/onnx-community/Depth-Anything-V2-Small-ONNX/resolve/main/onnx/model_quantized.onnx';

/**
 * Depth Anything V2 Small configuration.
 * License: Apache-2.0
 */
export const DEPTH_ANYTHING_V2_CONFIG: ModelConfig = {
  id: 'depth-anything-v2-small',
  name: 'Depth Anything V2 Small',
  primaryUrl: HF_MODEL_FP16_URL,
  wasmUrl: HF_MODEL_Q8_URL,
  fallbackUrls: [HF_MODEL_Q8_URL],
  license: 'Apache-2.0',
  licenseUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
  inputWidth: 518,
  inputHeight: 518,
  mean: [0.485, 0.456, 0.406],
  std: [0.229, 0.224, 0.225],
  layout: 'NCHW',
  outputType: 'disparity',
};

/**
 * FastDepth lightweight alternative configuration (for extensibility demonstration).
 */
export const FAST_DEPTH_CONFIG: ModelConfig = {
  id: 'fast-depth-small',
  name: 'FastDepth Mobile ONNX',
  primaryUrl:
    'https://huggingface.co/onnx-community/fastdepth-onnx/resolve/main/model.onnx',
  fallbackUrls: [],
  license: 'Apache-2.0',
  licenseUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
  inputWidth: 224,
  inputHeight: 224,
  mean: [0.485, 0.456, 0.406],
  std: [0.229, 0.224, 0.225],
  layout: 'NCHW',
  outputType: 'metric',
};

/**
 * Standard ONNX Runtime Depth Model Pipeline.
 * Supports WebGPU (FP16) with resilient WASM (Q8) session recreation and inference retry.
 */
export class ONNXModelPipeline implements ModelPipeline {
  public readonly id: string;
  public readonly name: string;
  private readonly config: ModelConfig;
  private readonly cacheManager: ModelCacheManager;
  private session: ort.InferenceSession | null = null;
  private activeProvider: ExecutionProvider = 'wasm';
  private ready: boolean = false;
  private preferWebGPU: boolean = true;

  constructor(
    config: ModelConfig = DEPTH_ANYTHING_V2_CONFIG,
    options: { preferWebGPU?: boolean; cacheName?: string } = {}
  ) {
    this.config = config;
    this.id = config.id;
    this.name = config.name;
    this.preferWebGPU = options.preferWebGPU ?? true;
    this.cacheManager = new ModelCacheManager(options.cacheName || 'drift-models-v1');
  }

  public get provider(): ExecutionProvider {
    return this.activeProvider;
  }

  public get isReady(): boolean {
    return this.ready && this.session !== null;
  }

  private async createSessionForProvider(
    targetProvider: 'webgpu' | 'wasm',
    onProgress?: (event: DepthProgressEvent) => void
  ): Promise<ort.InferenceSession> {
    const isGpu = targetProvider === 'webgpu';
    const modelUrl = isGpu ? this.config.primaryUrl : (this.config.wasmUrl || this.config.primaryUrl);

    if (onProgress) {
      onProgress({
        stage: 'downloading',
        progress: 10,
        message: `Loading ${this.name} (${isGpu ? 'FP16 WebGPU' : 'Q8 WASM'})...`,
      });
    }

    const { modelBuffer, externalData } = await this.cacheManager.getModelWithExternalData(
      modelUrl,
      (dl) => {
        if (onProgress) {
          onProgress({
            stage: 'downloading',
            progress: Math.min(85, Math.round(dl.percent * 0.85)),
            message: `Downloading ${isGpu ? 'FP16' : 'Q8'} weights (${Math.round(dl.loaded / (1024 * 1024))} MB)...`,
          });
        }
      }
    );

    if (onProgress) {
      onProgress({
        stage: 'compiling',
        progress: 90,
        message: `Compiling ONNX session with ${targetProvider.toUpperCase()} provider...`,
      });
    }

    const sessionOptions: ort.InferenceSession.SessionOptions = {
      graphOptimizationLevel: 'all',
      enableCpuMemArena: true,
      enableMemPattern: true,
      executionMode: 'sequential',
      executionProviders: [targetProvider],
    };

    if (externalData) {
      sessionOptions.externalData = [externalData];
    }

    const session = await ort.InferenceSession.create(modelBuffer, sessionOptions);
    this.activeProvider = targetProvider;
    console.log(`[ONNXModelPipeline] Active execution provider: ${targetProvider.toUpperCase()} (${isGpu ? 'FP16' : 'Q8'})`);
    return session;
  }

  public async init(onProgress?: (event: DepthProgressEvent) => void): Promise<void> {
    if (this.isReady) {
      if (onProgress) {
        onProgress({ stage: 'ready', progress: 100, message: `${this.name} already initialized.` });
      }
      return;
    }

    const canAttemptWebGPU = this.preferWebGPU && typeof navigator !== 'undefined' && 'gpu' in navigator && !!navigator.gpu;

    // Attempt 1: WebGPU execution provider with FP16 model
    if (canAttemptWebGPU) {
      try {
        console.log('[ONNXModelPipeline] Attempting WebGPU initialization (FP16 model)...');
        this.session = await this.createSessionForProvider('webgpu', onProgress);
        this.ready = true;
        if (onProgress) {
          onProgress({
            stage: 'ready',
            progress: 100,
            message: `${this.name} initialized with WebGPU provider (FP16).`,
          });
        }
        return;
      } catch (gpuError) {
        console.warn('[ONNXModelPipeline] WebGPU session creation failed; recreating session with WASM:', gpuError);
        this.dispose();
      }
    }

    // Attempt 2: WASM execution provider with Q8 model
    try {
      console.log('[ONNXModelPipeline] Initializing with WASM provider (Q8 model)...');
      this.session = await this.createSessionForProvider('wasm', onProgress);
      this.ready = true;
      if (onProgress) {
        onProgress({
          stage: 'ready',
          progress: 100,
          message: `${this.name} initialized with WASM provider (Q8).`,
        });
      }
    } catch (wasmError) {
      console.error('[ONNXModelPipeline] WASM session creation failed:', wasmError);
      this.dispose();
      throw wasmError;
    }
  }

  private async runInference(
    imageBitmap: ImageBitmap,
    options?: { maxDimension?: number }
  ): Promise<DepthResult> {
    if (!this.session) {
      throw new Error(`Pipeline ${this.name} session is not active.`);
    }

    // 1. Preprocess Image
    const { tensor, originalWidth, originalHeight } = preprocessImage(imageBitmap, {
      targetWidth: this.config.inputWidth,
      targetHeight: this.config.inputHeight,
      mean: this.config.mean,
      std: this.config.std,
    });

    // 2. Determine input node name dynamically
    const inputName = this.session.inputNames[0] || 'pixel_values';
    const feeds: Record<string, ort.Tensor> = {
      [inputName]: tensor,
    };

    // 3. Run Inference
    const outputMap = await this.session.run(feeds);
    const outputName = this.session.outputNames[0] || 'predicted_depth';
    const outputTensor = outputMap[outputName];

    if (!outputTensor) {
      throw new Error(`Expected output tensor "${outputName}" not found in model outputs.`);
    }

    // 4. Postprocess Tensor
    const result = postprocessDepthTensor(outputTensor, originalWidth, originalHeight, {
      invert: this.config.outputType === 'metric',
      resampleToOriginal: true,
      maxDimension: options?.maxDimension,
    });

    result.provider = this.activeProvider;
    result.source = 'model';
    return result;
  }

  public async estimate(
    imageBitmap: ImageBitmap,
    options?: { maxDimension?: number }
  ): Promise<DepthResult> {
    if (!this.session) {
      throw new Error(`Pipeline ${this.name} is not initialized.`);
    }

    try {
      return await this.runInference(imageBitmap, options);
    } catch (inferenceErr) {
      // On runtime failure during WebGPU inference, recreate session with WASM and retry before falling back to heuristic
      if (this.activeProvider === 'webgpu') {
        console.warn(
          '[ONNXModelPipeline] Runtime failure during WebGPU inference; recreating session with WASM and retrying:',
          inferenceErr
        );
        try {
          this.dispose();
          this.session = await this.createSessionForProvider('wasm');
          this.ready = true;
          return await this.runInference(imageBitmap, options);
        } catch (wasmRetryErr) {
          console.error('[ONNXModelPipeline] WASM retry after WebGPU failure also failed:', wasmRetryErr);
          this.dispose();
          throw wasmRetryErr;
        }
      }
      throw inferenceErr;
    }
  }

  public dispose(): void {
    if (this.session) {
      try {
        this.session.release();
      } catch (err) {
        console.warn(`[ONNXModelPipeline] Error releasing session:`, err);
      }
      this.session = null;
    }
    this.ready = false;
  }
}

/**
 * Heuristic Procedural Depth Pipeline for instant offline fallback.
 */
export class HeuristicModelPipeline implements ModelPipeline {
  public readonly id = 'heuristic-fallback';
  public readonly name = 'Procedural Heuristic Depth (Offline Fallback)';
  public readonly provider: ExecutionProvider = 'heuristic';
  private ready: boolean = false;

  public get isReady(): boolean {
    return this.ready;
  }

  public async init(onProgress?: (event: DepthProgressEvent) => void): Promise<void> {
    this.ready = true;
    if (onProgress) {
      onProgress({
        stage: 'ready',
        progress: 100,
        message: 'Procedural heuristic depth pipeline active (offline fallback).',
      });
    }
  }

  public async estimate(
    imageBitmap: ImageBitmap,
    options?: { maxDimension?: number }
  ): Promise<DepthResult> {
    let targetW = imageBitmap.width;
    let targetH = imageBitmap.height;

    if (options?.maxDimension && (targetW > options.maxDimension || targetH > options.maxDimension)) {
      const aspect = targetW / targetH;
      if (targetW > targetH) {
        targetW = options.maxDimension;
        targetH = Math.max(1, Math.round(targetW / aspect));
      } else {
        targetH = options.maxDimension;
        targetW = Math.max(1, Math.round(targetH * aspect));
      }
    }

    const canvas = new OffscreenCanvas(targetW, targetH);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Failed to create OffscreenCanvas 2d context for heuristic depth.');
    }
    ctx.drawImage(imageBitmap, 0, 0, targetW, targetH);
    const imgData = ctx.getImageData(0, 0, targetW, targetH);

    const result = createSyntheticDepth(targetW, targetH, imgData);
    result.provider = 'heuristic';
    result.source = 'heuristic';
    return result;
  }

  public dispose(): void {
    this.ready = false;
  }
}

/**
 * Composite Pipeline with automatic fallback chain:
 * Primary Model (WebGPU FP16) -> WASM Retry (Q8) -> Heuristic Offline Fallback.
 */
export class CompositeModelPipeline implements ModelPipeline {
  public readonly id = 'composite-depth-pipeline';
  public readonly name = 'Drift Composite Depth Pipeline';
  private readonly candidates: ModelPipeline[];
  private activePipeline: ModelPipeline;
  private readonly fallbackPipeline: HeuristicModelPipeline;

  constructor(
    primaryPipelines: ModelPipeline[] = [
      new ONNXModelPipeline(DEPTH_ANYTHING_V2_CONFIG),
    ],
    fallbackPipeline: HeuristicModelPipeline = new HeuristicModelPipeline()
  ) {
    this.candidates = primaryPipelines;
    this.fallbackPipeline = fallbackPipeline;
    this.activePipeline = this.fallbackPipeline;
  }

  public get provider(): ExecutionProvider {
    return this.activePipeline.provider;
  }

  public get isReady(): boolean {
    return this.activePipeline.isReady;
  }

  public get activeModelName(): string {
    return this.activePipeline.name;
  }

  public async init(onProgress?: (event: DepthProgressEvent) => void): Promise<void> {
    let initialized = false;

    for (const pipeline of this.candidates) {
      try {
        console.log(`[CompositePipeline] Attempting initialization of ${pipeline.name}...`);
        await pipeline.init(onProgress);
        this.activePipeline = pipeline;
        initialized = true;
        console.log(`[CompositePipeline] Successfully initialized ${pipeline.name} [provider: ${pipeline.provider}].`);
        break;
      } catch (candidateErr) {
        console.warn(
          `[CompositePipeline] Candidate ${pipeline.name} failed initialization:`,
          candidateErr
        );
      }
    }

    if (!initialized) {
      console.warn(
        '[CompositePipeline] All remote models failed to initialize. Falling back to heuristic procedural mode.'
      );
      await this.fallbackPipeline.init(onProgress);
      this.activePipeline = this.fallbackPipeline;
      if (onProgress) {
        onProgress({
          stage: 'ready',
          progress: 100,
          message: 'Offline fallback mode active: Procedural depth estimation enabled.',
        });
      }
    }
  }

  public async estimate(
    imageBitmap: ImageBitmap,
    options?: { maxDimension?: number }
  ): Promise<DepthResult> {
    try {
      return await this.activePipeline.estimate(imageBitmap, options);
    } catch (err) {
      console.error(
        `[CompositePipeline] Active pipeline (${this.activePipeline.name}) inference failed, falling back to heuristic:`,
        err
      );
      if (this.activePipeline !== this.fallbackPipeline) {
        await this.fallbackPipeline.init();
        this.activePipeline = this.fallbackPipeline;
        return await this.fallbackPipeline.estimate(imageBitmap, options);
      }
      throw err;
    }
  }

  public dispose(): void {
    for (const candidate of this.candidates) {
      candidate.dispose();
    }
    this.fallbackPipeline.dispose();
  }
}
