/**
 * Floating Bottom Controls for Drift
 * Glassmorphic, dark HUD interface with Mode Selector, Overlay Toggles,
 * Color Mode Selector, and Quick Actions (Snapshot, Record Video, Settings, Credits).
 */

import type { ColorMode, ModeName, OverlayName, OverlaySettings } from '@/types';
import { ICONS } from './icons';

export interface FloatingControlsOptions {
  onModeSelect: (mode: ModeName) => void;
  onOverlayToggle: (overlay: OverlayName) => void;
  onColorModeSelect: (colorMode: ColorMode) => void;
  onOpenSettings: () => void;
  onOpenCredits: () => void;
  onExport: () => void;
  onToggleRecordVideo: () => void;
}

const MODES: { name: ModeName; label: string; shortcut: string }[] = [
  { name: 'DRIFT', label: 'Drift', shortcut: '1' },
  { name: 'SPLASH', label: 'Splash', shortcut: '2' },
  { name: 'GATHER', label: 'Gather', shortcut: '3' },
  { name: 'DEPTH', label: 'Depth', shortcut: '4' },
  { name: 'TRAVEL', label: 'Travel', shortcut: '5' },
  { name: 'SWARM', label: 'Swarm', shortcut: '6' },
  { name: 'MELT', label: 'Melt', shortcut: '7' },
];

const OVERLAYS: { name: OverlayName; label: string }[] = [
  { name: 'LINKS', label: 'Links' },
  { name: 'TRACKERS', label: 'Trackers' },
  { name: 'SCAN', label: 'Scan' },
  { name: 'TRAILS', label: 'Trails' },
  { name: 'MARKS', label: 'Marks' },
  { name: 'DRAW', label: 'Draw' },
];

const COLOR_MODES: { name: ColorMode; label: string }[] = [
  { name: 'TRUE', label: 'True' },
  { name: 'NEGATIVE', label: 'Negative' },
  { name: 'ON_WHITE', label: 'On White' },
];

export class FloatingControls {
  private container: HTMLElement;
  private options: FloatingControlsOptions;

  private currentMode: ModeName = 'DRIFT';
  private currentColorMode: ColorMode = 'TRUE';
  private isRecording: boolean = false;
  private recordingDurationText: string = '00:00';

  private overlaySettings: OverlaySettings = {
    active: {
      LINKS: false,
      TRACKERS: true,
      SCAN: false,
      TRAILS: false,
      MARKS: true,
      DRAW: false,
    },
    lineWeight: 1.0,
    trackerDensity: 0.5,
    linkDistanceThreshold: 0.05,
    scanSpeed: 1.0,
    trailFade: 0.15,
  };

  constructor(parent: HTMLElement, options: FloatingControlsOptions) {
    this.options = options;
    this.container = document.createElement('div');
    this.container.className = 'floating-controls';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Particle Motion and HUD Controls');
    this.render();
    parent.appendChild(this.container);
  }

  public update(mode: ModeName, colorMode: ColorMode, overlays: OverlaySettings): void {
    this.currentMode = mode;
    this.currentColorMode = colorMode;
    this.overlaySettings = overlays;
    this.render();
  }

  public setRecordingState(isRecording: boolean, timeStr?: string): void {
    this.isRecording = isRecording;
    if (timeStr) {
      this.recordingDurationText = timeStr;
    }

    const recordBtn = this.container.querySelector('.btn-record');
    const badge = this.container.querySelector('.recording-badge');
    const actionsGroup = this.container.querySelector('.actions-group');

    if (recordBtn) {
      if (isRecording) {
        recordBtn.classList.add('is-recording');
        recordBtn.innerHTML = ICONS.stop;
        recordBtn.setAttribute('aria-label', 'Stop Video Recording');
        recordBtn.setAttribute('title', 'Stop Video Recording');
      } else {
        recordBtn.classList.remove('is-recording');
        recordBtn.innerHTML = ICONS.video;
        recordBtn.setAttribute('aria-label', 'Record Video Loop (R)');
        recordBtn.setAttribute('title', 'Record Video Loop (R)');
      }
    }

    if (isRecording) {
      if (!badge && actionsGroup) {
        const badgeEl = document.createElement('div');
        badgeEl.className = 'recording-badge';
        badgeEl.setAttribute('aria-live', 'polite');
        badgeEl.innerHTML = `
          <span class="recording-pulse-dot" aria-hidden="true"></span>
          <span class="recording-timer">REC ${this.recordingDurationText}</span>
        `;
        actionsGroup.insertBefore(badgeEl, recordBtn);
      } else if (badge) {
        const timerEl = badge.querySelector('.recording-timer');
        if (timerEl) {
          timerEl.textContent = `REC ${this.recordingDurationText}`;
        }
      }
    } else {
      badge?.remove();
    }
  }

  public render(): void {
    this.container.innerHTML = `
      <div class="controls-panel glassmorphic-panel">
        <!-- Row 1: Mode Selector (Horizontal Scrollable with Touch Momentum) -->
        <div class="controls-row mode-row" role="radiogroup" aria-label="Particle Modes">
          <span class="row-label">MODE</span>
          <div class="mode-scroll-container">
            ${MODES.map((m) => {
              const isActive = m.name === this.currentMode;
              return `
                <button 
                  class="mode-pill ${isActive ? 'active' : ''}" 
                  data-mode="${m.name}"
                  role="radio"
                  aria-checked="${isActive}"
                  title="Switch to ${m.label} mode (${m.shortcut})"
                >
                  <span class="mode-text">${m.label}</span>
                  <span class="mode-key">${m.shortcut}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Row 2: Secondary Controls (Overlays, Palette & Anchored Actions) -->
        <div class="controls-row secondary-row">
          <!-- Scrollable Overlays & Palette Container -->
          <div class="secondary-scroll-area">
            <!-- Overlays Group -->
            <div class="overlays-group" role="group" aria-label="HUD Overlays">
              <span class="row-label">HUD</span>
              <div class="overlay-scroll-container">
                ${OVERLAYS.map((ov) => {
                  const isActive = !!this.overlaySettings.active[ov.name];
                  return `
                    <button 
                      class="overlay-pill ${isActive ? 'active' : ''}" 
                      data-overlay="${ov.name}"
                      aria-pressed="${isActive}"
                      title="Toggle ${ov.label} overlay"
                    >
                      <span class="indicator-dot" aria-hidden="true"></span>
                      <span class="pill-text">${ov.label}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- Divider -->
            <div class="controls-divider" aria-hidden="true"></div>

            <!-- Color Mode Group -->
            <div class="color-modes-group" role="radiogroup" aria-label="Color Modes">
              <span class="row-label">PALETTE</span>
              <div class="color-scroll-container">
                ${COLOR_MODES.map((cm) => {
                  const isActive = cm.name === this.currentColorMode;
                  return `
                    <button 
                      class="color-pill ${isActive ? 'active' : ''}" 
                      data-color="${cm.name}"
                      role="radio"
                      aria-checked="${isActive}"
                      title="Palette: ${cm.label}"
                    >
                      <span class="pill-text">${cm.label}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
          </div>

          <!-- Divider between scrollable settings and anchored actions -->
          <div class="controls-divider fixed-divider" aria-hidden="true"></div>

          <!-- Action Buttons Group (Always anchored and accessible) -->
          <div class="actions-group" role="toolbar" aria-label="Quick Actions">
            ${this.isRecording ? `
              <div class="recording-badge" aria-live="polite">
                <span class="recording-pulse-dot" aria-hidden="true"></span>
                <span class="recording-timer">REC ${this.recordingDurationText}</span>
              </div>
            ` : ''}
            <button 
              class="action-icon-btn btn-record ${this.isRecording ? 'is-recording' : ''}" 
              aria-label="${this.isRecording ? 'Stop Recording Video' : 'Record Video Loop (R)'}" 
              title="${this.isRecording ? 'Stop Recording Video' : 'Record Video Loop (R)'}"
            >
              ${this.isRecording ? ICONS.stop : ICONS.video}
            </button>
            <button class="action-icon-btn btn-export" aria-label="Export Snapshot (S)" title="Export High-Res Snapshot (S)">
              ${ICONS.camera}
            </button>
            <button class="action-icon-btn btn-settings" aria-label="Settings Drawer (O)" title="Open Settings (O)">
              ${ICONS.settings}
            </button>
            <button class="action-icon-btn btn-credits" aria-label="Credits & Licenses (C)" title="Credits & Licenses (C)">
              ${ICONS.info}
            </button>
          </div>
        </div>
      </div>
    `;

    // Bind event handlers
    const modePills = this.container.querySelectorAll('.mode-pill');
    modePills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const mode = pill.getAttribute('data-mode') as ModeName;
        if (mode) this.options.onModeSelect(mode);
      });
    });

    const overlayPills = this.container.querySelectorAll('.overlay-pill');
    overlayPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const overlay = pill.getAttribute('data-overlay') as OverlayName;
        if (overlay) this.options.onOverlayToggle(overlay);
      });
    });

    const colorPills = this.container.querySelectorAll('.color-pill');
    colorPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const color = pill.getAttribute('data-color') as ColorMode;
        if (color) this.options.onColorModeSelect(color);
      });
    });

    const recordBtn = this.container.querySelector('.btn-record');
    recordBtn?.addEventListener('click', () => this.options.onToggleRecordVideo());

    const exportBtn = this.container.querySelector('.btn-export');
    exportBtn?.addEventListener('click', () => this.options.onExport());

    const settingsBtn = this.container.querySelector('.btn-settings');
    settingsBtn?.addEventListener('click', () => this.options.onOpenSettings());

    const creditsBtn = this.container.querySelector('.btn-credits');
    creditsBtn?.addEventListener('click', () => this.options.onOpenCredits());
  }
}
