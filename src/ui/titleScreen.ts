/**
 * Title Screen and Drop Zone for Drift
 * Minimalist opening overlay and drag-and-drop ingestion interface.
 */

import { ICONS } from './icons';

export interface TitleScreenOptions {
  onFilesSelected: (files: File[]) => void;
  onDemoArtRequested: () => void;
  onClose?: () => void;
}

export class TitleScreen {
  private container: HTMLElement;
  private options: TitleScreenOptions;
  private fileInput: HTMLInputElement;
  private isVisible: boolean = true;
  private isDragOver: boolean = false;
  private hasExistingImages: boolean = false;

  constructor(parent: HTMLElement, options: TitleScreenOptions) {
    this.options = options;

    this.container = document.createElement('div');
    this.container.className = 'title-screen';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Image Upload and Intro Screen');

    // Hidden file input
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/*';
    this.fileInput.multiple = true;
    this.fileInput.className = 'visually-hidden-file-input';
    this.fileInput.style.display = 'none';

    this.fileInput.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        this.handleFiles(Array.from(target.files));
        target.value = ''; // Reset for re-selection
      }
    });

    this.render();
    this.setupDragAndDrop();
    parent.appendChild(this.container);
    parent.appendChild(this.fileInput);
  }

  public setHasExistingImages(hasImages: boolean): void {
    this.hasExistingImages = hasImages;
    this.render();
  }

  public show(): void {
    this.isVisible = true;
    this.container.classList.remove('hidden');
    this.container.classList.add('visible');
  }

  public hide(): void {
    this.isVisible = false;
    this.container.classList.remove('visible');
    this.container.classList.add('hidden');
  }

  public isOpen(): boolean {
    return this.isVisible;
  }

  private handleFiles(files: File[]): void {
    const valid = files.filter((f) => f.type.startsWith('image/'));
    if (valid.length === 0) return;
    // Enforce max 4 images
    const limited = valid.slice(0, 4);
    this.options.onFilesSelected(limited);
  }

  private setupDragAndDrop(): void {
    // Window-wide drag and drop detection
    window.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      if (!this.isDragOver) {
        this.isDragOver = true;
        this.container.classList.add('drag-active');
      }
    });

    window.addEventListener('dragleave', (e: DragEvent) => {
      // Check if left the window
      if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
        this.isDragOver = false;
        this.container.classList.remove('drag-active');
      }
    });

    window.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      this.isDragOver = false;
      this.container.classList.remove('drag-active');

      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        this.handleFiles(Array.from(e.dataTransfer.files));
      }
    });
  }

  public render(): void {
    this.container.innerHTML = `
      <div class="title-screen-inner">
        ${this.hasExistingImages ? `
          <button class="title-close-btn" aria-label="Close dialog" title="Return to canvas">
            ${ICONS.close}
          </button>
        ` : ''}

        <div class="brand-header">
          <h1 class="brand-title">Drift</h1>
          <p class="brand-tagline">Generative Particle Depth Canvas</p>
          <p class="brand-subtext">Interactive client-side depth estimation and real-time GPU particle simulation.</p>
        </div>

        <div class="drop-zone" id="drop-zone" tabindex="0" role="button" aria-label="Drop up to 4 pictures or click to browse">
          <div class="drop-zone-glow"></div>
          <div class="drop-zone-content">
            <div class="drop-zone-icon">
              ${ICONS.upload}
            </div>
            <div class="drop-zone-text-primary">DROP UP TO FOUR PICTURES</div>
            <div class="drop-zone-text-secondary">PNG, JPEG, WEBP • Max 4 images</div>
          </div>
        </div>

        <div class="title-action-buttons">
          <button class="btn btn-primary" id="btn-add-pictures">
            <span>ADD PICTURES</span>
          </button>
          
          <button class="btn btn-secondary" id="btn-try-demo">
            ${ICONS.sparkles}
            <span>Try with Demo Art</span>
          </button>
        </div>

        <div class="title-footer-hint">
          <span>Client-side inference • Depth Anything V2 Small • Private & offline</span>
        </div>
      </div>
    `;

    // Bind local click events
    const dropZone = this.container.querySelector('#drop-zone');
    dropZone?.addEventListener('click', () => {
      this.fileInput.click();
    });
    dropZone?.addEventListener('keydown', (e: Event) => {
      const keyEvent = e as KeyboardEvent;
      if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
        keyEvent.preventDefault();
        this.fileInput.click();
      }
    });

    const addBtn = this.container.querySelector('#btn-add-pictures');
    addBtn?.addEventListener('click', () => {
      this.fileInput.click();
    });

    const demoBtn = this.container.querySelector('#btn-try-demo');
    demoBtn?.addEventListener('click', () => {
      this.options.onDemoArtRequested();
    });

    const closeBtn = this.container.querySelector('.title-close-btn');
    closeBtn?.addEventListener('click', () => {
      if (this.options.onClose) {
        this.options.onClose();
      } else {
        this.hide();
      }
    });
  }
}
