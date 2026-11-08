/**
 * Drift - Gestures & Viewport Navigation Controller
 * Handles wheel zooming, trackpad pinch, two-pointer touch pinch & pan,
 * middle-click/shift-drag/hand-tool panning, double-click/tap zoom,
 * and keyboard navigation shortcuts.
 */

import type { ModeName, ParticleEngine } from '@/types';

export const PAN_ELIGIBLE_MODES: ReadonlySet<ModeName> = new Set([
  'DRIFT',
  'DEPTH',
  'TRAVEL',
  'MELT',
]);

export interface GestureControllerOptions {
  /** The WebGL particle canvas */
  canvas: HTMLCanvasElement;
  /** Particle engine instance */
  engine: ParticleEngine;
  /** Function returning the current active mode name */
  getMode: () => ModeName;
  /** Function returning whether the DRAW overlay is active */
  isDrawActive: () => boolean;
  /** Callback when user is drawing a stroke */
  onDrawPoint?: (clientX: number, clientY: number) => void;
  /** Callback when user finishes drawing a stroke */
  onDrawEnd?: () => void;
  /** Callback when Hand tool state changes */
  onHandToolChange?: (active: boolean) => void;
}

interface PointerCoord {
  clientX: number;
  clientY: number;
}

export class GestureController {
  private canvas: HTMLCanvasElement;
  private engine: ParticleEngine;
  private options: GestureControllerOptions;

  // Active pointer map for multi-touch gestures
  private activePointers = new Map<number, PointerCoord>();

  // State flags
  private handToolActive: boolean = false;
  private isPanning: boolean = false;
  private isSinglePointerDown: boolean = false;
  private pinchSuppressedSingle: boolean = false;
  private isDestroyed: boolean = false;

  // Pointer position tracking for deltas
  private lastPointerX: number = 0;
  private lastPointerY: number = 0;

  // Two-pointer pinch & pan metrics
  private prevPinchDistance: number = 0;
  private prevMidX: number = 0;
  private prevMidY: number = 0;

  // Tap & double-tap metrics
  private pointerDownTime: number = 0;
  private pointerDownPos = { x: 0, y: 0 };
  private lastTapTime: number = 0;
  private lastTapPos = { x: 0, y: 0 };
  private lastDoubleActionTime: number = 0;

  constructor(options: GestureControllerOptions) {
    this.options = options;
    this.canvas = options.canvas;
    this.engine = options.engine;

    // Apply strict non-blocking gesture rules to canvas & viewport
    this.applyViewportStyles();

    // Attach event listeners
    this.attachEvents();

    // Initial cursor update
    this.updateCursor(false);
  }

  /**
   * Enforces touch-action: none and overscroll-behavior: none on canvas and viewports
   */
  private applyViewportStyles(): void {
    this.canvas.style.touchAction = 'none';
    this.canvas.style.overscrollBehavior = 'none';

    if (this.canvas.parentElement) {
      this.canvas.parentElement.style.touchAction = 'none';
      this.canvas.parentElement.style.overscrollBehavior = 'none';
    }

    const app = document.getElementById('app');
    if (app) {
      app.style.touchAction = 'none';
      app.style.overscrollBehavior = 'none';
    }
  }

  private attachEvents(): void {
    // Wheel zoom (including trackpad pinch which arrives as wheel with e.ctrlKey=true)
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });

    // Pointer events on canvas (captured for consistent multi-touch and mouse dragging)
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove, { passive: false });
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);

    // Double-click for mouse
    this.canvas.addEventListener('dblclick', this.onDoubleClick);

    // Keyboard navigation shortcuts
    window.addEventListener('keydown', this.onKeyDown);

    // Prevent default browser touch gestures on canvas
    this.canvas.addEventListener('touchstart', this.preventDefaultTouch, { passive: false });
    this.canvas.addEventListener('touchmove', this.preventDefaultTouch, { passive: false });
  }

  private preventDefaultTouch = (e: TouchEvent): void => {
    e.preventDefault();
  };

  /**
   * Evaluates if a single-pointer interaction should pan the view
   */
  private shouldPanSingle(e: PointerEvent): boolean {
    // 1. Middle mouse button drag (button 1 or button mask 4)
    if (e.button === 1 || (e.buttons & 4) !== 0) {
      return true;
    }

    // 2. Shift + Left click drag
    if (e.shiftKey && (e.button === 0 || (e.buttons & 1) !== 0)) {
      return true;
    }

    // 3. Hand tool toggle active
    if (this.handToolActive) {
      return true;
    }

    // 4. In SPLASH, GATHER, and SWARM, single-finger drag is kept for interactive particle effects
    const mode = this.options.getMode();
    if (!PAN_ELIGIBLE_MODES.has(mode)) {
      return false;
    }

    // 5. Draw overlay active: plain drag is reserved for drawing
    if (this.options.isDrawActive()) {
      return false;
    }

    // 6. Plain drag when zoom > 1.05 and mode is in DRIFT, DEPTH, TRAVEL, MELT
    const zoom = this.engine.getView().zoom;
    if (zoom > 1.05) {
      return true;
    }

    return false;
  }

  /**
   * Wheel event handler:
   * Normalizes deltaMode (pixels, lines, pages).
   * Computes factor = Math.exp(-deltaY * (e.ctrlKey ? 0.01 : 0.0015)).
   * Calls engine.zoomAt(factor, ndcX, ndcY) at cursor NDC.
   */
  private onWheel = (e: WheelEvent): void => {
    // Ignore wheel if scrolling inside UI modal dialogs or settings drawer
    const target = e.target as HTMLElement | null;
    if (
      target &&
      target.closest(
        '.settings-drawer, .depth-debug-modal, .credits-modal, .title-screen'
      )
    ) {
      return;
    }

    e.preventDefault();

    let deltaY = e.deltaY;
    if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      deltaY *= 20;
    } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      deltaY *= 600;
    }

    const factor = Math.exp(-deltaY * (e.ctrlKey ? 0.01 : 0.0015));

    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ndcY = -(((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);

    this.engine.zoomAt(factor, ndcX, ndcY);
    this.updateCursor(false);
  };

  /**
   * Pointer down handler: tracks active pointers and resolves single vs multi-touch gesture
   */
  private onPointerDown = (e: PointerEvent): void => {
    // Ignore clicks on semantic UI buttons/controls outside canvas
    const target = e.target as HTMLElement | null;
    if (
      target &&
      target.closest('.ui-layer') &&
      !target.classList.contains('canvas-layer')
    ) {
      return;
    }

    this.activePointers.set(e.pointerId, {
      clientX: e.clientX,
      clientY: e.clientY,
    });

    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignored if target cannot capture pointer
    }

    if (this.activePointers.size >= 2) {
      // Transitioning to two-pointer pinch/pan
      this.pinchSuppressedSingle = true;
      this.isSinglePointerDown = false;
      this.isPanning = true;

      // While two fingers are down, release/suppress any single-pointer interaction with the particle engine
      this.engine.setPointer(e.clientX, e.clientY, false);

      const pts = Array.from(this.activePointers.values());
      const p1 = pts[0];
      const p2 = pts[1];
      this.prevPinchDistance = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);
      this.prevMidX = (p1.clientX + p2.clientX) / 2;
      this.prevMidY = (p1.clientY + p2.clientY) / 2;

      this.updateCursor(true);
      return;
    }

    // Single pointer down
    this.pinchSuppressedSingle = false;
    this.pointerDownTime = performance.now();
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    const isPan = this.shouldPanSingle(e);

    if (isPan) {
      this.isPanning = true;
      this.isSinglePointerDown = false;
      this.engine.setPointer(e.clientX, e.clientY, false);
      this.updateCursor(true);
    } else {
      this.isPanning = false;
      this.isSinglePointerDown = true;

      if (this.options.isDrawActive()) {
        this.options.onDrawPoint?.(e.clientX, e.clientY);
      } else {
        this.engine.setPointer(e.clientX, e.clientY, true);
      }
      this.updateCursor(false);
    }
  };

  /**
   * Pointer move handler: manages two-pointer pinch/pan, single-pointer pan,
   * single-pointer draw, particle interaction, and hover parallax.
   */
  private onPointerMove = (e: PointerEvent): void => {
    if (!this.activePointers.has(e.pointerId)) {
      // Hover event when no buttons are held down
      if (this.activePointers.size === 0) {
        const isOverUI =
          (e.target as HTMLElement | null)?.closest('.ui-layer') &&
          !(e.target as HTMLElement | null)?.classList.contains('canvas-layer');
        if (!isOverUI) {
          this.engine.setPointer(e.clientX, e.clientY, false);
          this.updateCursor(false);
        }
      }
      return;
    }

    // Update active pointer position
    this.activePointers.set(e.pointerId, {
      clientX: e.clientX,
      clientY: e.clientY,
    });

    // --- TWO-POINTER PINCH & PAN ---
    if (this.activePointers.size >= 2) {
      const pts = Array.from(this.activePointers.values());
      const p1 = pts[0];
      const p2 = pts[1];

      const currDistance = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);
      const midX = (p1.clientX + p2.clientX) / 2;
      const midY = (p1.clientY + p2.clientY) / 2;

      if (this.prevPinchDistance > 0 && currDistance > 0) {
        const distanceRatio = currDistance / this.prevPinchDistance;
        const midDeltaX = midX - this.prevMidX;
        const midDeltaY = midY - this.prevMidY;

        const rect = this.canvas.getBoundingClientRect();
        const midNdcX = ((midX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
        const midNdcY = -(((midY - rect.top) / Math.max(1, rect.height)) * 2 - 1);

        // Apply zoom ratio centered at midpoint NDC
        if (
          Math.abs(distanceRatio - 1) > 0.0005 &&
          distanceRatio > 0.2 &&
          distanceRatio < 5
        ) {
          this.engine.zoomAt(distanceRatio, midNdcX, midNdcY);
        }

        // Apply midpoint translation
        if (Math.abs(midDeltaX) > 0.01 || Math.abs(midDeltaY) > 0.01) {
          this.engine.panByPixels(midDeltaX, midDeltaY);
        }
      }

      this.prevPinchDistance = currDistance;
      this.prevMidX = midX;
      this.prevMidY = midY;

      // Keep single-pointer interaction suppressed
      this.engine.setPointer(midX, midY, false);
      this.updateCursor(true);
      return;
    }

    // --- SINGLE-POINTER DRAG ---
    if (this.pinchSuppressedSingle) {
      // Transitioning after pinch gesture: absorb initial delta to avoid jump
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      return;
    }

    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    if (this.isPanning) {
      this.engine.panByPixels(dx, dy);
      this.engine.setPointer(e.clientX, e.clientY, false);
      this.updateCursor(true);
    } else {
      if (this.options.isDrawActive() && this.isSinglePointerDown) {
        this.options.onDrawPoint?.(e.clientX, e.clientY);
      } else {
        this.engine.setPointer(e.clientX, e.clientY, this.isSinglePointerDown);
      }
      this.updateCursor(false);
    }
  };

  /**
   * Pointer up / cancel handler
   */
  private onPointerUp = (e: PointerEvent): void => {
    try {
      if (this.canvas.hasPointerCapture(e.pointerId)) {
        this.canvas.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignored
    }

    this.activePointers.delete(e.pointerId);

    // If still 2 or more pointers active
    if (this.activePointers.size >= 2) {
      const pts = Array.from(this.activePointers.values());
      const p1 = pts[0];
      const p2 = pts[1];
      this.prevPinchDistance = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);
      this.prevMidX = (p1.clientX + p2.clientX) / 2;
      this.prevMidY = (p1.clientY + p2.clientY) / 2;
      return;
    }

    // If 1 pointer remains after pinch
    if (this.activePointers.size === 1) {
      this.prevPinchDistance = 0;
      this.pinchSuppressedSingle = true;
      const remaining = this.activePointers.values().next().value;
      if (remaining) {
        this.lastPointerX = remaining.clientX;
        this.lastPointerY = remaining.clientY;
      }
      return;
    }

    // All pointers released (count === 0)
    const hadPinch = this.pinchSuppressedSingle;
    this.prevPinchDistance = 0;
    this.pinchSuppressedSingle = false;
    const wasPanning = this.isPanning;
    this.isPanning = false;
    this.isSinglePointerDown = false;

    this.engine.setPointer(e.clientX, e.clientY, false);
    this.updateCursor(false);

    if (this.options.isDrawActive()) {
      this.options.onDrawEnd?.();
    }

    // Touch double-tap detection
    if (!wasPanning && !hadPinch && e.pointerType === 'touch') {
      const duration = performance.now() - this.pointerDownTime;
      const moveDist = Math.hypot(
        e.clientX - this.pointerDownPos.x,
        e.clientY - this.pointerDownPos.y
      );

      if (duration < 320 && moveDist < 20) {
        const now = performance.now();
        const timeSinceLastTap = now - this.lastTapTime;
        const tapDist = Math.hypot(
          e.clientX - this.lastTapPos.x,
          e.clientY - this.lastTapPos.y
        );

        if (timeSinceLastTap > 40 && timeSinceLastTap < 350 && tapDist < 35) {
          this.lastDoubleActionTime = now;
          this.handleDoubleAction(e.clientX, e.clientY);
          this.lastTapTime = 0;
        } else {
          this.lastTapTime = now;
          this.lastTapPos = { x: e.clientX, y: e.clientY };
        }
      }
    }
  };

  /**
   * Double-click event handler (desktop mouse)
   */
  private onDoubleClick = (e: MouseEvent): void => {
    // Ignore if touch double-tap recently handled this gesture
    if (performance.now() - this.lastDoubleActionTime < 450) {
      return;
    }

    const target = e.target as HTMLElement | null;
    if (
      target &&
      target.closest('.ui-layer') &&
      !target.classList.contains('canvas-layer')
    ) {
      return;
    }

    this.lastDoubleActionTime = performance.now();
    this.handleDoubleAction(e.clientX, e.clientY);
  };

  /**
   * Double-tap / Double-click execution:
   * If already zoomed (> 1.2), reset view.
   * If not zoomed, zoom 2.5x centered at click NDC.
   */
  private handleDoubleAction(clientX: number, clientY: number): void {
    const currentZoom = this.engine.getView().zoom;
    if (currentZoom > 1.2) {
      this.engine.resetView();
    } else {
      const rect = this.canvas.getBoundingClientRect();
      const clickNdcX = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      const clickNdcY = -(((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
      this.engine.zoomAt(2.5, clickNdcX, clickNdcY);
    }
    this.updateCursor(false);
  }

  /**
   * Keyboard shortcuts:
   * + / = -> zoom in 1.25x (zoomAt(1.25, 0, 0))
   * - / _ -> zoom out 0.8x (zoomAt(0.8, 0, 0))
   * 0 -> reset view (resetView())
   * Arrow keys -> pan only when zoom > 1.05 (panByPixels by 40px)
   * H -> Hand tool toggle
   * Space and 1-7 keys are not captured so main application bindings are preserved.
   */
  private onKeyDown = (e: KeyboardEvent): void => {
    // Ignore when focus is inside text inputs
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return;
    }

    // Zoom In: '+' or '='
    if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
      e.preventDefault();
      this.engine.zoomAt(1.25, 0, 0);
      this.updateCursor(false);
      return;
    }

    // Zoom Out: '-' or '_'
    if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
      e.preventDefault();
      this.engine.zoomAt(0.8, 0, 0);
      this.updateCursor(false);
      return;
    }

    // Reset View: '0'
    if (
      (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      e.preventDefault();
      this.engine.resetView();
      this.updateCursor(false);
      return;
    }

    // Arrow keys: pan only when zoom > 1.05
    const zoom = this.engine.getView().zoom;
    if (zoom > 1.05) {
      const step = 40;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.engine.panByPixels(step, 0);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.engine.panByPixels(-step, 0);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.engine.panByPixels(0, step);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.engine.panByPixels(0, -step);
        return;
      }
    }

    // Hand tool toggle: 'h' or 'H'
    if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      this.toggleHandTool();
      return;
    }
  };

  /**
   * Toggles the Hand tool on or off
   */
  public toggleHandTool(): boolean {
    return this.setHandToolActive(!this.handToolActive);
  }

  /**
   * Sets the Hand tool state explicitly
   */
  public setHandToolActive(active: boolean): boolean {
    if (this.handToolActive !== active) {
      this.handToolActive = active;
      this.updateCursor(false);
      this.options.onHandToolChange?.(active);
    }
    return this.handToolActive;
  }

  /**
   * Checks whether the Hand tool is active
   */
  public isHandToolActive(): boolean {
    return this.handToolActive;
  }

  /**
   * Updates canvas cursor styling depending on zoom, pan mode, draw mode, and dragging state
   */
  public updateCursor(isDragging: boolean = false): void {
    if (this.isDestroyed) return;

    if (isDragging) {
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    if (this.handToolActive) {
      this.canvas.style.cursor = 'grab';
      return;
    }

    if (this.options.isDrawActive()) {
      this.canvas.style.cursor = 'crosshair';
      return;
    }

    const zoom = this.engine.getView().zoom;
    const mode = this.options.getMode();
    if (zoom > 1.05 && PAN_ELIGIBLE_MODES.has(mode)) {
      this.canvas.style.cursor = 'grab';
      return;
    }

    this.canvas.style.cursor = '';
  }

  /**
   * Destroys event listeners and frees references
   */
  public dispose(): void {
    this.isDestroyed = true;
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('dblclick', this.onDoubleClick);
    window.removeEventListener('keydown', this.onKeyDown);
    this.canvas.removeEventListener('touchstart', this.preventDefaultTouch);
    this.canvas.removeEventListener('touchmove', this.preventDefaultTouch);
    this.activePointers.clear();
  }
}
