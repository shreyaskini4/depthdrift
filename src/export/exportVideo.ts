/**
 * Drift - WebM / MP4 Video Recording Exporter
 * Captures real-time generative particle loops and HUD overlays using
 * MediaRecorder and an offscreen composite stream.
 */

import type { ColorMode } from '../types';
import { getBackgroundColor, getExportTimestamp } from './exportSnapshot';

export type RecordingStatus = 'idle' | 'recording' | 'processing';

export interface CodecOption {
  mimeType: string;
  extension: 'webm' | 'mp4';
}

export interface VideoRecorderOptions {
  particleCanvas: HTMLCanvasElement;
  overlayCanvas: HTMLCanvasElement;
  getColorMode: () => ColorMode;
  fps?: number;
  maxDurationSeconds?: number;
  onStatusChange?: (status: RecordingStatus) => void;
  onTimeUpdate?: (elapsedSeconds: number, formattedTime: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Probes browser MediaRecorder capabilities and returns best available codec.
 */
export function getSupportedVideoMimeType(): CodecOption {
  if (typeof MediaRecorder === 'undefined') {
    return { mimeType: '', extension: 'webm' };
  }

  const candidates: CodecOption[] = [
    { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
    { mimeType: 'video/mp4;codecs=avc1', extension: 'mp4' },
    { mimeType: 'video/mp4', extension: 'mp4' },
  ];

  for (const candidate of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(candidate.mimeType)) {
        return candidate;
      }
    } catch {
      // Continue searching
    }
  }

  return { mimeType: '', extension: 'webm' };
}

/**
 * Formats elapsed seconds into MM:SS display string.
 */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export class VideoRecorder {
  private options: VideoRecorderOptions;
  private status: RecordingStatus = 'idle';

  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private compositeCanvas: HTMLCanvasElement | null = null;
  private compositeCtx: CanvasRenderingContext2D | null = null;

  private startTime: number = 0;
  private timerIntervalId: number | null = null;
  private internalRafId: number | null = null;

  private width: number = 0;
  private height: number = 0;
  private codec: CodecOption = { mimeType: '', extension: 'webm' };

  constructor(options: VideoRecorderOptions) {
    this.options = {
      fps: 60,
      maxDurationSeconds: 60,
      ...options,
    };
  }

  /**
   * Checks whether canvas stream recording is supported in this browser.
   */
  public static isSupported(): boolean {
    return (
      typeof HTMLCanvasElement !== 'undefined' &&
      'captureStream' in HTMLCanvasElement.prototype &&
      typeof MediaRecorder !== 'undefined'
    );
  }

  public getStatus(): RecordingStatus {
    return this.status;
  }

  public isRecording(): boolean {
    return this.status === 'recording';
  }

  /**
   * Begins canvas stream capture and starts MediaRecorder.
   */
  public start(): boolean {
    if (this.status !== 'idle') {
      return false;
    }

    if (!VideoRecorder.isSupported()) {
      const err = new Error('Video recording is not supported in this browser environment.');
      this.options.onError?.(err);
      return false;
    }

    const { particleCanvas, overlayCanvas, fps = 60 } = this.options;

    // Derive dimensions - clamp to max 1920 to keep encoding performant
    const maxDimension = 1920;
    let w = Math.max(particleCanvas.width, overlayCanvas.width);
    let h = Math.max(particleCanvas.height, overlayCanvas.height);

    if (w <= 0 || h <= 0) {
      w = window.innerWidth || 1280;
      h = window.innerHeight || 720;
    }

    if (w > maxDimension || h > maxDimension) {
      const scale = maxDimension / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    // Video encoders require even dimensions
    if (w % 2 !== 0) w -= 1;
    if (h % 2 !== 0) h -= 1;

    this.width = w;
    this.height = h;

    // Create offscreen composite canvas
    this.compositeCanvas = document.createElement('canvas');
    this.compositeCanvas.width = this.width;
    this.compositeCanvas.height = this.height;
    this.compositeCtx = this.compositeCanvas.getContext('2d', { alpha: false });

    if (!this.compositeCtx) {
      const err = new Error('Could not create composite canvas 2D context for video recording.');
      this.options.onError?.(err);
      return false;
    }

    // Draw initial frame
    this.compositeFrame();

    // Capture media stream
    try {
      this.stream = this.compositeCanvas.captureStream(fps);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.options.onError?.(error);
      this.cleanup();
      return false;
    }

    // Detect best available codec
    this.codec = getSupportedVideoMimeType();
    this.recordedChunks = [];

    const recorderOptions: MediaRecorderOptions = {};
    if (this.codec.mimeType) {
      recorderOptions.mimeType = this.codec.mimeType;
    }
    // High-quality bitrate target
    recorderOptions.videoBitsPerSecond = 8_000_000;

    try {
      this.mediaRecorder = new MediaRecorder(this.stream, recorderOptions);
    } catch {
      // Fallback without bitrate or mimeType constraints
      try {
        this.mediaRecorder = new MediaRecorder(this.stream);
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error('Failed to initialize MediaRecorder.');
        this.options.onError?.(error);
        this.cleanup();
        return false;
      }
    }

    this.mediaRecorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    this.mediaRecorder.onerror = (e: Event) => {
      const error = new Error(`MediaRecorder error: ${(e as ErrorEvent).message || 'Unknown recorder error'}`);
      this.options.onError?.(error);
      this.stop();
    };

    this.mediaRecorder.onstop = () => {
      this.handleRecorderStopped();
    };

    // Request data slice every 1000ms for robust chunk streaming
    this.mediaRecorder.start(1000);
    this.status = 'recording';
    this.startTime = performance.now();
    this.options.onStatusChange?.('recording');
    this.options.onTimeUpdate?.(0, '00:00');

    // Timer tick interval
    this.timerIntervalId = window.setInterval(() => {
      if (this.status !== 'recording') return;
      const elapsedSec = Math.floor((performance.now() - this.startTime) / 1000);
      const formatted = formatDuration(elapsedSec);
      this.options.onTimeUpdate?.(elapsedSec, formatted);

      if (this.options.maxDurationSeconds && elapsedSec >= this.options.maxDurationSeconds) {
        this.stop();
      }
    }, 250);

    // Fallback RAF loop to ensure frames are continuously pushed even if main loop pauses
    this.startInternalLoop();

    return true;
  }

  /**
   * Internal RAF backup loop ensuring frames are composited continuously
   */
  private startInternalLoop(): void {
    const renderTick = () => {
      if (this.status !== 'recording') return;
      this.compositeFrame();
      this.internalRafId = requestAnimationFrame(renderTick);
    };
    this.internalRafId = requestAnimationFrame(renderTick);
  }

  /**
   * Composites the current particle and overlay frames onto the recording canvas.
   * Can be invoked from the main animation loop or internal RAF.
   */
  public compositeFrame(): void {
    if (this.status !== 'recording' || !this.compositeCtx || !this.compositeCanvas) {
      return;
    }

    const { particleCanvas, overlayCanvas, getColorMode } = this.options;
    const ctx = this.compositeCtx;
    const w = this.width;
    const h = this.height;

    // 1. Fill solid background based on color mode
    ctx.fillStyle = getBackgroundColor(getColorMode());
    ctx.fillRect(0, 0, w, h);

    // 2. Draw particle canvas
    if (particleCanvas && particleCanvas.width > 0 && particleCanvas.height > 0) {
      ctx.drawImage(particleCanvas, 0, 0, w, h);
    }

    // 3. Draw overlay canvas
    if (overlayCanvas && overlayCanvas.width > 0 && overlayCanvas.height > 0) {
      ctx.drawImage(overlayCanvas, 0, 0, w, h);
    }
  }

  /**
   * Stops video recording and processes the final video file.
   */
  public stop(): void {
    if (this.status !== 'recording') {
      return;
    }

    this.status = 'processing';
    this.options.onStatusChange?.('processing');

    if (this.timerIntervalId !== null) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }

    if (this.internalRafId !== null) {
      cancelAnimationFrame(this.internalRafId);
      this.internalRafId = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (err) {
        console.warn('[Drift Export] Error stopping MediaRecorder:', err);
        this.handleRecorderStopped();
      }
    } else {
      this.handleRecorderStopped();
    }
  }

  /**
   * Handles packaging chunks into blob, downloading, and stream track cleanup.
   */
  private handleRecorderStopped(): void {
    try {
      const mime = this.codec.mimeType || 'video/webm';
      const blob = new Blob(this.recordedChunks, { type: mime });

      if (blob.size > 0) {
        const timestamp = getExportTimestamp();
        const ext = this.codec.extension || 'webm';
        const filename = `drift-recording-${timestamp}.${ext}`;

        const blobUrl = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.style.display = 'none';
        downloadLink.href = blobUrl;
        downloadLink.download = filename;

        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
        }, 5000);
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error('Failed to create video file blob.');
      this.options.onError?.(error);
    } finally {
      this.cleanup();
      this.status = 'idle';
      this.options.onStatusChange?.('idle');
    }
  }

  /**
   * Disposes stream tracks and resources
   */
  public cleanup(): void {
    if (this.timerIntervalId !== null) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }

    if (this.internalRafId !== null) {
      cancelAnimationFrame(this.internalRafId);
      this.internalRafId = null;
    }

    if (this.stream) {
      try {
        this.stream.getTracks().forEach((track) => track.stop());
      } catch {
        // ignore
      }
      this.stream = null;
    }

    this.compositeCanvas = null;
    this.compositeCtx = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];
  }

  public dispose(): void {
    if (this.isRecording()) {
      this.stop();
    }
    this.cleanup();
  }
}
