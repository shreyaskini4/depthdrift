/**
 * Top Bar and Image Carousel Component for Drift
 * Displays active image status, thumbnail strip, navigation cycling, and system telemetry pills.
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
  private dpr: number = 1.0;

  constructor(parent: HTMLElement, options: TopBarOptions) {
    this.options = options;
    this.container = document.createElement('div');
    this.container.className = 'top-bar';

    // Auto-detect WebGPU vs WASM support for initial badge
    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      this.pipelineProvider = 'WEBGPU';
    } else {
      this.pipelineProvider = 'WASM';
    }

    if (typeof window !== 'undefined' && window.devicePixelRatio) {
      this.dpr = Math.min(window.devicePixelRatio, 2.0);
    }

    this.render();
    parent.appendChild(this.container);
  }

  public setPipelineProvider(provider: string): void {
    const formatted = provider.toUpperCase();
    if (this.pipelineProvider !== formatted) {
      this.pipelineProvider = formatted;
      this.render();
    }
  }

  public setDpr(dpr: number): void {
    const clamped = Math.round(dpr * 10) / 10;
    if (Math.abs(this.dpr - clamped) >= 0.1) {
      this.dpr = clamped;
      const dprLabel = this.container.querySelector('.dpr-label');
      if (dprLabel) {
        dprLabel.textContent = `DPR: ${clamped.toFixed(1)}`;
      }
    }
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
      <!-- Left cluster: Branding & Pipeline Provider Badge -->
      <div class="top-bar-left">
        <div class="app-branding">
          <span class="app-branding-title">Drift</span>
          <span class="app-branding-badge">${this.pipelineProvider}</span>
        </div>

        ${this.isLoading ? `
          <div class="top-bar-loading-pill" title="${this.loadingMessage}">
            <div class="pulse-dot" aria-hidden="true"></div>
            <span class="loading-label">${this.loadingMessage || 'Processing...'}</span>
          </div>
        ` : ''}
      </div>

      <!-- Center cluster: Image carousel / thumbnail strip (Responsive & Scrollable) -->
      <div class="top-bar-carousel" role="region" aria-label="Image Carousel">
        ${hasImages && this.images.length > 1 ? `
          <button class="carousel-btn btn-prev" aria-label="Previous image" title="Previous image">
            ${ICONS.chevronLeft}
          </button>
        ` : ''}

        <div class="carousel-thumbnails" role="tablist" aria-label="Loaded images">
          ${this.images.map((img, idx) => {
            const isActive = idx === this.currentIndex;
            const isProcessing = img.status === 'processing';
            return `
              <button 
                class="thumb-pill ${isActive ? 'active' : ''} ${isProcessing ? 'processing' : ''}" 
                data-index="${idx}"
                role="tab"
                aria-selected="${isActive}"
                aria-label="Image ${idx + 1}: ${img.fileName}"
                title="${img.fileName}"
              >
                ${img.previewUrl ? `<img src="${img.previewUrl}" alt="" class="thumb-img" />` : ''}
                <span class="thumb-number">${idx + 1}</span>
                ${isProcessing ? '<div class="thumb-spinner" aria-hidden="true"></div>' : ''}
              </button>
            `;
          }).join('')}
        </div>

        ${hasImages && this.images.length > 1 ? `
          <button class="carousel-btn btn-next" aria-label="Next image (Spacebar)" title="Next image (Spacebar)">
            ${ICONS.chevronRight}
          </button>
        ` : ''}

        ${hasImages ? `
          <div class="image-indicator" title="${displayName}">
            <span class="image-counter">${countText}</span>
            <span class="image-separator" aria-hidden="true">•</span>
            <span class="image-filename">${displayName}</span>
          </div>
        ` : ''}
      </div>

      <!-- Right cluster: System telemetry pills & action buttons -->
      <div class="top-bar-right">
        <div class="sys-dpr-pill" title="System Status: Ready | Device Pixel Ratio: ${this.dpr.toFixed(1)}">
          <span class="sys-dot" aria-hidden="true"></span>
          <span class="sys-label">SYS: OK</span>
          <span class="pill-divider" aria-hidden="true">|</span>
          <span class="dpr-label">DPR: ${this.dpr.toFixed(1)}</span>
        </div>

        <button class="top-bar-btn btn-depth-inspector" aria-label="Depth Map Inspector (D)" title="Depth Map Inspector (D)">
          ${ICONS.layers}
          <span class="btn-text">Depth</span>
        </button>

        <button class="top-bar-btn btn-add-images" aria-label="Add Pictures" title="Add Pictures (up to 4)">
          ${ICONS.plus}
          <span class="btn-text">Add</span>
        </button>
      </div>
    `;

    // Bind event handlers
    const prevBtn = this.container.querySelector('.btn-prev');
    prevBtn?.addEventListener('click', () => this.options.onPrev());

    const nextBtn = this.container.querySelector('.btn-next');
    nextBtn?.addEventListener('click', () => this.options.onNext());

    const addBtn = this.container.querySelector('.btn-add-images');
    addBtn?.addEventListener('click', () => this.options.onAddImages());

    const depthBtn = this.container.querySelector('.btn-depth-inspector');
    depthBtn?.addEventListener('click', () => this.options.onToggleDepthView?.());

    const thumbPills = this.container.querySelectorAll('.thumb-pill');
    thumbPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const idx = parseInt(pill.getAttribute('data-index') || '0', 10);
        this.options.onSelect(idx);
      });
    });
  }
}
