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

  constructor(parent: HTMLElement, options: TopBarOptions) {
    this.options = options;
    this.container = document.createElement('div');
    this.container.className = 'top-bar';

    this.render();
    parent.appendChild(this.container);
  }

  /**
   * Retained for API compatibility with UIManager.
   * Model/provider status is displayed in Settings > About and ?debug telemetry.
   */
  public setPipelineProvider(_provider: string): void {
    // No-op: developer telemetry removed from main top bar
  }

  /**
   * Retained for API compatibility with UIManager.
   * Model/provider status is displayed in Settings > About and ?debug telemetry.
   */
  public setDepthMode(_mode: 'MODEL' | 'HEURISTIC', _provider?: string): void {
    // No-op: developer telemetry removed from main top bar
  }

  /**
   * Retained for API compatibility with UIManager telemetry stream.
   * Realtime telemetry is rendered in TelemetryBadge / debug readout.
   */
  public setDpr(_dpr: number): void {
    // No-op: telemetry pills removed from top bar
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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

    const displayName = this.escapeHtml(current ? current.fileName : 'No images loaded');
    const loadingText = this.escapeHtml(this.loadingMessage || 'Processing...');

    this.container.innerHTML = `
      <!-- Left cluster: Wordmark ("Drift" and "浮流") & Loading indicator -->
      <div class="top-bar-left">
        <div class="app-branding" aria-label="Drift">
          <span class="app-branding-title">Drift</span>
          <span class="app-branding-sub" lang="zh-Hant" aria-hidden="true">浮流</span>
        </div>

        ${this.isLoading ? `
          <div 
            class="top-bar-loading-pill" 
            role="status" 
            aria-live="polite" 
            title="${loadingText}"
          >
            <div class="pulse-dot" aria-hidden="true"></div>
            <span class="loading-label">${loadingText}</span>
          </div>
        ` : ''}
      </div>

      <!-- Right cluster: Filmstrip thumbnails, inline nowrap image counter, and Add button -->
      <div class="top-bar-right">
        <div class="filmstrip-thumbnails carousel-thumbnails" role="tablist" aria-label="Loaded images">
          ${this.images.map((img, idx) => {
            const isActive = idx === this.currentIndex;
            const isProcessing = img.status === 'processing';
            const safeName = this.escapeHtml(img.fileName);
            return `
              <button 
                type="button"
                class="thumb-pill ${isActive ? 'active' : ''} ${isProcessing ? 'processing' : ''}" 
                data-index="${idx}"
                role="tab"
                aria-selected="${isActive}"
                aria-label="Image ${idx + 1}: ${safeName}"
                title="${safeName}"
              >
                ${img.previewUrl ? `<img src="${this.escapeHtml(img.previewUrl)}" alt="${safeName}" class="thumb-img" />` : ''}
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
