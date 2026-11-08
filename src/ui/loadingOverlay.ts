/**
 * Loading & Error Overlay for Drift
 * Handles model download progress, depth inference status, and failure recovery.
 */

import { ICONS } from './icons';

export interface LoadingOverlayOptions {
  onRetry: () => void;
  onUseProceduralFallback: () => void;
}

export class LoadingOverlay {
  private container: HTMLElement;
  private options: LoadingOverlayOptions;

  private isVisible: boolean = false;
  private isError: boolean = false;
  private errorMessage: string = '';
  private stage: string = '';
  private progress: number = 0;
  private detailText: string = '';

  constructor(parent: HTMLElement, options: LoadingOverlayOptions) {
    this.options = options;
    this.container = document.createElement('div');
    this.container.className = 'loading-overlay hidden';
    this.container.setAttribute('role', 'status');
    this.container.setAttribute('aria-live', 'polite');
    this.render();
    parent.appendChild(this.container);
  }

  public showProgress(stage: string, progress: number, detailText?: string): void {
    this.isVisible = true;
    this.isError = false;
    this.stage = stage;
    this.progress = Math.min(100, Math.max(0, progress));
    this.detailText = detailText || '';
    this.container.classList.remove('hidden');
    this.render();
  }

  public showError(message: string): void {
    this.isVisible = true;
    this.isError = true;
    this.errorMessage = message;
    this.container.classList.remove('hidden');
    this.render();
  }

  public hide(): void {
    this.isVisible = false;
    this.isError = false;
    this.container.classList.add('hidden');
  }

  public render(): void {
    if (!this.isVisible) {
      this.container.innerHTML = '';
      return;
    }

    if (this.isError) {
      this.container.innerHTML = `
        <div class="loading-card error-card glassmorphic-panel">
          <div class="error-badge">ATTENTION</div>
          <h3 class="loading-title">Depth Model Loading Issue</h3>
          <p class="error-description">
            ${this.errorMessage || 'Failed to initialize the client-side ONNX depth estimation model.'}
          </p>
          <div class="error-action-row">
            <button class="btn btn-primary btn-retry" id="btn-err-retry">
              ${ICONS.refresh}
              <span>Retry Download</span>
            </button>
            <button class="btn btn-secondary btn-fallback" id="btn-err-fallback">
              ${ICONS.sparkles}
              <span>Use Instant Procedural Depth</span>
            </button>
          </div>
          <span class="error-subtext">Procedural depth runs instantly in offline mode using image luminance & geometry heuristics.</span>
        </div>
      `;

      this.container.querySelector('#btn-err-retry')?.addEventListener('click', () => {
        this.options.onRetry();
      });

      this.container.querySelector('#btn-err-fallback')?.addEventListener('click', () => {
        this.options.onUseProceduralFallback();
      });
      return;
    }

    // Normal Loading state
    const pct = Math.round(this.progress);
    const stageDisplay = this.stage === 'downloading'
      ? 'Downloading Depth Anything V2 Small (q8)...'
      : this.stage === 'compiling'
      ? 'Compiling WebGPU / WASM execution graph...'
      : this.stage === 'inferring'
      ? 'Estimating depth geometry...'
      : 'Preparing model...';

    this.container.innerHTML = `
      <div class="loading-card glassmorphic-panel">
        <div class="loading-spinner-wrap">
          <div class="hud-spinner"></div>
        </div>

        <div class="loading-text-group">
          <div class="loading-header-row">
            <span class="loading-title">${stageDisplay}</span>
            <span class="loading-pct">${pct}%</span>
          </div>

          <div class="progress-track">
            <div class="progress-fill" style="width: ${pct}%;"></div>
          </div>

          ${this.detailText ? `<p class="loading-detail">${this.detailText}</p>` : ''}
        </div>
      </div>
    `;
  }
}
