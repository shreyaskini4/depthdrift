/**
 * Cache API and Resilient Model Downloader for Drift
 * 
 * Manages model caching under CacheStorage 'drift-models-v1'
 * with streaming progress calculation and exponential backoff retry.
 * 
 * License: Apache-2.0
 */

export interface DownloadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export class ModelCacheManager {
  private readonly cacheName: string;

  constructor(cacheName: string = 'drift-models-v1') {
    this.cacheName = cacheName;
  }

  /**
   * Check if Cache API is available in the current execution context.
   */
  private isCacheAvailable(): boolean {
    return typeof caches !== 'undefined' && typeof caches.open === 'function';
  }

  /**
   * Open the Drift models cache storage.
   */
  private async getCache(): Promise<Cache | null> {
    if (!this.isCacheAvailable()) return null;
    try {
      return await caches.open(this.cacheName);
    } catch (err) {
      console.warn(`[ModelCacheManager] Unable to open cache "${this.cacheName}":`, err);
      return null;
    }
  }

  /**
   * Check if a model URL is already cached.
   */
  public async isCached(url: string): Promise<boolean> {
    const cache = await this.getCache();
    if (!cache) return false;
    try {
      const match = await cache.match(url);
      return !!match;
    } catch {
      return false;
    }
  }

  /**
   * Retrieve cached model ArrayBuffer or fetch from network with progress and retry.
   */
  public async getOrFetch(
    primaryUrl: string,
    fallbackUrls: string[] = [],
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<ArrayBuffer> {
    const cache = await this.getCache();

    // 1. Check cache for primary URL
    if (cache) {
      try {
        const cachedResponse = await cache.match(primaryUrl);
        if (cachedResponse) {
          const buffer = await cachedResponse.arrayBuffer();
          if (onProgress) {
            onProgress({ loaded: buffer.byteLength, total: buffer.byteLength, percent: 100 });
          }
          return buffer;
        }

        // Check fallback URLs in cache
        for (const fbUrl of fallbackUrls) {
          const fbResponse = await cache.match(fbUrl);
          if (fbResponse) {
            const buffer = await fbResponse.arrayBuffer();
            if (onProgress) {
              onProgress({ loaded: buffer.byteLength, total: buffer.byteLength, percent: 100 });
            }
            return buffer;
          }
        }
      } catch (cacheErr) {
        console.warn('[ModelCacheManager] Cache lookup error, falling back to network:', cacheErr);
      }
    }

    // 2. Fetch with retries
    const urlsToTry = [primaryUrl, ...fallbackUrls];
    let lastError: Error | null = null;

    for (const url of urlsToTry) {
      try {
        const buffer = await this.fetchWithRetry(url, onProgress, 1);
        
        // Cache the downloaded buffer
        if (cache) {
          try {
            const responseToCache = new Response(buffer.slice(0), {
              headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Length': buffer.byteLength.toString(),
              },
            });
            await cache.put(url, responseToCache);
          } catch (putErr) {
            console.warn('[ModelCacheManager] Failed to write downloaded model to cache:', putErr);
          }
        }

        return buffer;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`[ModelCacheManager] Attempt for ${url} failed: ${lastError.message}`);
      }
    }

    throw lastError || new Error(`Failed to download model from all configured URLs.`);
  }

  /**
   * Retrieves an ONNX model buffer and any associated external data file (.onnx_data).
   */
  public async getModelWithExternalData(
    modelUrl: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<{ modelBuffer: ArrayBuffer; externalData?: { path: string; data: Uint8Array } }> {
    // 1. Fetch primary .onnx graph definition
    const modelBuffer = await this.getOrFetch(modelUrl);

    // 2. Check and fetch associated .onnx_data file if present
    if (modelUrl.endsWith('.onnx')) {
      const dataUrl = modelUrl.replace(/\.onnx$/, '.onnx_data');
      const dataFileName = dataUrl.split('/').pop() || 'model.onnx_data';

      try {
        const dataBuffer = await this.getOrFetch(dataUrl, [], onProgress);
        return {
          modelBuffer,
          externalData: {
            path: dataFileName,
            data: new Uint8Array(dataBuffer),
          },
        };
      } catch (dataErr) {
        // Model might be self-contained without a separate external data file
        console.log(`[ModelCacheManager] No external data file loaded for ${modelUrl}:`, dataErr);
      }
    }

    return { modelBuffer };
  }

  /**
   * Fetch a resource with ReadableStream progress tracking and at least 1 retry.
   */
  private async fetchWithRetry(
    url: string,
    onProgress?: (progress: DownloadProgress) => void,
    maxRetries: number = 1
  ): Promise<ArrayBuffer> {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        return await this.streamingFetch(url, onProgress);
      } catch (err) {
        attempt++;
        if (attempt > maxRetries) {
          throw err;
        }
        // Wait 1 second before retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw new Error(`Exceeded max retries for ${url}`);
  }

  /**
   * Stream download using fetch and ReadableStream reader to calculate exact percentage.
   */
  private async streamingFetch(
    url: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<ArrayBuffer> {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} (${response.statusText}) while fetching ${url}`);
    }

    const contentLengthHeader = response.headers.get('content-length');
    const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;

    if (!response.body) {
      // Body stream not available; fallback to standard arrayBuffer()
      const buffer = await response.arrayBuffer();
      if (onProgress) {
        onProgress({ loaded: buffer.byteLength, total: buffer.byteLength, percent: 100 });
      }
      return buffer;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loadedBytes = 0;

    let doneReading = false;
    while (!doneReading) {
      const { done, value } = await reader.read();
      if (done) {
        doneReading = true;
        break;
      }

      if (value) {
        chunks.push(value);
        loadedBytes += value.byteLength;

        if (onProgress) {
          const percent = totalBytes > 0
            ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100))
            : 0;
          onProgress({ loaded: loadedBytes, total: totalBytes, percent });
        }
      }
    }

    // Combine chunks into single ArrayBuffer
    const combined = new Uint8Array(loadedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }

    if (onProgress) {
      onProgress({ loaded: loadedBytes, total: loadedBytes, percent: 100 });
    }

    return combined.buffer;
  }
}
