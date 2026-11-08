/**
 * Top Bar and Filmstrip Component for Drift
 * Displays wordmark branding, loading indicator, filmstrip thumbnails, inline image counter, and add action.
 */

import type { ImageItem } from '@/types';
import { ICONS } from './icons';

export interface TopBarOptions {
  onNext: () => void;
  onPrev: () => void;
  onSelect: (index: number) => void;
  onAddImages: () => void;
  onToggleDepthView?: () => void;
}

export class TopBar {
  private container: HTMLElement;
  private options: TopBarOptions;
  private images: ImageItem[] = [];
  private currentIndex: number = -1;
  private isLoading: boolean = false;
  private loadingMessage: string = '';
  private pipelineProvider: string = 'WEBGPU';
  private depthMode: 'MODEL' | 'HEURISTIC' = 'MODEL';

  constructor(parent: HTMLElement, options: TopBarOptions) {
    this.options = options;
    this.container = document.createElement('div');
    this.container.className = 'top-bar';

    // Auto-detect WebGPU vs WASM support for initial pipeline detection
    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      this.pipelineProvider = 'WEBGPU';
    } else {
      this.pipelineProvider = 'WASM';
    }

    this.render();
    parent.appendChild(this.container);
  }

  public setPipelineProvider(provider: string): void {
    const formatted = provider.toUpperCase();
    if (this.pipelineProvider !== formatted) {
      this.pipelineProvider = formatted;
      if (formatted === 'PROCEDURAL' || formatted === 'HEURISTIC') {
        this.depthMode = 'HEURISTIC';
      }
      if (this.isLoading) {
        this.render();
      }
    }
  }

  public setDepthMode(mode: 'MODEL' | 'HEURISTIC', provider?: string): void {
    let changed = false;
    if (this.depthMode !== mode) {
      this.depthMode = mode;
      changed = true;
    }
    if (provider) {
      const formatted = provider.toUpperCase();
      if (this.pipelineProvider !== formatted) {
        this.pipelineProvider = formatted;
        changed = true;
      }
    }
    if (changed && this.isLoading) {
      this.render();
    }
  }

  /**
   * Retained for API compatibility with UIManager telemetry stream.
   * Realtime telemetry is rendered in TelemetryBadge / debug readout.
   */
  public setDpr(_dpr: number): void {
    // No-op: telemetry pills removed from top bar
  }

  public update(images: ImageItem[], currentIndex: number, isLoading: boolean, loadingMessage = ''): void {
    this.images = images;
    this.currentIndex = currentIndex;
    this.isLoading = isLoading;
    this.loadingMessage = loadingMessage;
    this.render();
  }

  public render(): void {
    const hasImages = this.images.length > 0;
    const current = hasImages && this.currentIndex >= 0 && this.currentIndex < this.images.length
      ? this.images[this.currentIndex]
      : null;

    const countText = hasImages
      ? `${this.currentIndex + 1} / ${this.images.length}`
      : '0 / 0';

    const displayName = current ? current.fileName : 'No images loaded';

    this.container.innerHTML = `
      <!-- Left cluster: Wordmark ("Drift" and "浮流") & Loading indicator -->
      <div class="top-bar-left">
        <div class="app-branding" aria-label="Drift">
          <span class="app-branding-title">Drift</span>
          <span class="app-branding-sub" aria-hidden="true">浮流</span>
        </div>

        ${this.isLoading ? `
          <div 
            class="top-bar-loading-pill" 
            role="status" 
            aria-live="polite" 
            title="${this.loadingMessage || 'Processing'} (${this.depthMode} / ${this.pipelineProvider})"
          >
            <div class="pulse-dot" aria-hidden="true"></div>
            <span class="loading-label">${this.loadingMessage || 'Processing...'}</span>
            <span class="depth-hud-pill depth-hud-${this.depthMode.toLowerCase()}">
              <span class="depth-hud-dot" aria-hidden="true"></span>
              <span class="depth-hud-mode">${this.depthMode}</span>
              <span class="depth-hud-divider" aria-hidden="true">/</span>
              <span class="depth-hud-provider">${this.pipelineProvider}</span>
            </span>
          </div>
        ` : ''}
      </div>

      <!-- Right cluster: Filmstrip thumbnails, inline nowrap image counter, and Add button -->
      <div class="top-bar-right">
        <div class="filmstrip-thumbnails carousel-thumbnails" role="tablist" aria-label="Loaded images">
          ${this.images.map((img, idx) => {
            const isActive = idx === this.currentIndex;
            const isProcessing = img.status === 'processing';
            return `
              <button 
                type="button"
                class="thumb-pill ${isActive ? 'active' : ''} ${isProcessing ? 'processing' : ''}" 
                data-index="${idx}"
                role="tab"
                aria-selected="${isActive}"
                aria-label="Image ${idx + 1}: ${img.fileName}"
                title="${img.fileName}"
              >
                ${img.previewUrl ? `<img src="${img.previewUrl}" alt="${img.fileName}" class="thumb-img" />` : ''}
                <span class="thumb-number">${idx + 1}</span>
                ${isProcessing ? '<div class="thumb-spinner" aria-hidden="true"></div>' : ''}
              </button>
            `;
          }).join('')}
        </div>

        <span class="image-counter" ${hasImages ? '' : 'style="display: none;"'} title="${displayName}">${countText}</span>

        <button 
          type="button" 
          class="top-bar-btn btn-add-images" 
          aria-label="Add image" 
          title="Add image"
        >
          ${ICONS.plus}
          <span class="btn-text">Add</span>
        </button>
      </div>
    `;

    // Bind event handlers
    const addBtn = this.container.querySelector('.btn-add-images');
    addBtn?.addEventListener('click', () => this.options.onAddImages());

    const thumbPills = this.container.querySelectorAll('.thumb-pill');
    thumbPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const idx = parseInt(pill.getAttribute('data-index') || '0', 10);
        this.options.onSelect(idx);
      });
    });
  }
}
