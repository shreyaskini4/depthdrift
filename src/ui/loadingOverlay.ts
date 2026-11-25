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

  constructor(parent: HTMLElement, options: LoadingOverlayOptions) {
    this.options = options;
    this.container = document.createElement('div');
    this.container.className = 'loading-overlay hidden';
    this.container.setAttribute('role', 'status');
    this.container.setAttribute('aria-live', 'polite');
    this.render();
    parent.appendChild(this.container);
  }

  public showProgress(stage: string, progress: number, _detailText?: string): void {
    this.isVisible = true;
    this.isError = false;
    this.stage = stage;
    this.progress = Math.min(100, Math.max(0, progress));
    this.container.setAttribute('role', 'status');
    this.container.setAttribute('aria-live', 'polite');
    this.container.classList.remove('hidden');
    this.render();
  }

  public showError(message: string): void {
    this.isVisible = true;
    this.isError = true;
    this.errorMessage = message;
    this.container.setAttribute('role', 'alert');
    this.container.setAttribute('aria-live', 'assertive');
    this.container.classList.remove('hidden');
    this.render();
  }

  public hide(): void {
    this.isVisible = false;
    this.isError = false;
    this.container.classList.add('hidden');
  }

  private formatErrorMessage(raw: string): string {
    if (!raw) {
      return 'The on-device depth model could not be loaded right now.';
    }
    const lower = raw.toLowerCase();
    if (
      lower.includes('onnx') ||
      lower.includes('wasm') ||
      lower.includes('webgpu') ||
      lower.includes('fetch') ||
      lower.includes('network') ||
      lower.includes('typeerror') ||
      raw.includes('\n') ||
      raw.length > 140
    ) {
      return 'The on-device depth model could not be loaded right now.';
    }
    return raw;
  }

  public render(): void {
    if (!this.isVisible) {
      this.container.innerHTML = '';
      return;
    }

    if (this.isError) {
      const description = this.formatErrorMessage(this.errorMessage);
      this.container.innerHTML = `
        <div class="loading-card error-card glassmorphic-panel">
          <h3 class="loading-title">Depth model unavailable</h3>
          <p class="error-description">${description}</p>
          <div class="error-action-row">
            <button type="button" class="btn btn-primary btn-retry" id="btn-err-retry">
              ${ICONS.refresh}
              <span>Retry</span>
            </button>
            <button type="button" class="btn btn-secondary btn-fallback" id="btn-err-fallback">
              <span>Continue with approximate depth</span>
            </button>
          </div>
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
    const stageLabel = this.stage === 'inferring'
      ? 'Estimating depth'
      : 'Preparing depth model';

    this.container.innerHTML = `
      <div class="loading-card glassmorphic-panel">
        <div class="loading-header-row">
          <span class="loading-title">${stageLabel},</span>
          <span class="loading-pct">${pct}%</span>
        </div>

        <div
          class="progress-track"
          role="progressbar"
          aria-valuenow="${pct}"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label="${stageLabel}"
        >
          <div class="progress-fill" style="width: ${pct}%;"></div>
        </div>
      </div>
    `;
  }
}
