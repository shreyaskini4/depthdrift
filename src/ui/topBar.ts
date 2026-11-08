/**
 * Top Bar and Image Carousel Component for Drift
 * Displays active image status, thumbnail strip, and prev/next cycling controls.
 */

import type { ImageItem } from '@/types';
import { ICONS } from './icons';

export interface TopBarOptions {
  onNext: () => void;
  onPrev: () => void;
  onSelect: (index: number) => void;
  onAddImages: () => void;
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
      <div class="top-bar-left">
        <div class="app-branding">
          <span class="app-branding-title">DRIFT</span>
          <span class="app-branding-badge">GPU</span>
        </div>

        ${hasImages ? `
          <div class="image-indicator" title="${displayName}">
            <span class="image-counter">${countText}</span>
            <span class="image-separator">•</span>
            <span class="image-filename">${displayName}</span>
          </div>
        ` : ''}

        ${this.isLoading ? `
          <div class="top-bar-loading-pill" title="${this.loadingMessage}">
            <div class="pulse-dot"></div>
            <span class="loading-label">${this.loadingMessage || 'Processing...'}</span>
          </div>
        ` : ''}
      </div>

      <div class="top-bar-right">
        ${hasImages && this.images.length > 1 ? `
          <div class="carousel-nav" role="toolbar" aria-label="Image Cycling">
            <button class="carousel-btn btn-prev" aria-label="Previous image" title="Previous image">
              ${ICONS.chevronLeft}
              <span class="nav-text">PREV</span>
            </button>
            <button class="carousel-btn btn-next" aria-label="Next image (Spacebar)" title="Next image (Spacebar)">
              <span class="nav-text">NEXT</span>
              ${ICONS.chevronRight}
              <kbd class="key-shortcut">Space</kbd>
            </button>
          </div>
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
                ${isProcessing ? '<div class="thumb-spinner"></div>' : ''}
              </button>
            `;
          }).join('')}
        </div>

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

    const thumbPills = this.container.querySelectorAll('.thumb-pill');
    thumbPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const idx = parseInt(pill.getAttribute('data-index') || '0', 10);
        this.options.onSelect(idx);
      });
    });
  }
}
