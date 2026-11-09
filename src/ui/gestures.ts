/**
 * Drift - Gestures & Viewport Navigation Controller
 * Handles spherical orbit, pan, wheel zoom, touch pinch-to-zoom & pan,
 * keyboard shortcuts, and canvas-isolated interactions.
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

interface ActivePointerInfo {
  clientX: number;
  clientY: number;
  downX: number;
  downY: number;
  downTime: number;
  hasCaptured: boolean;
}

type DragAction = 'ORBIT' | 'PAN' | 'INTERACT' | 'BAR';

export class GestureController {
  private canvas: HTMLCanvasElement;
  private engine: ParticleEngine;
  private options: GestureControllerOptions;

  // Active pointers for multi-touch & mouse
  private activePointers = new Map<number, ActivePointerInfo>();

  // State flags
  private handToolActive: boolean = false;
  private isSpaceDown: boolean = false;
  private isDragging: boolean = false;
  private currentDragMode: DragAction | null = null;
  private isDestroyed: boolean = false;

  // Pointer hover tracking
  private lastHoverX: number = -9999;
  private lastHoverY: number = -9999;

  // Pointer position tracking for deltas
  private lastPointerX: number = 0;
  private lastPointerY: number = 0;

  // Two-pointer pinch & pan metrics
  private prevPinchDistance: number = 0;
  private prevMidX: number = 0;
  private prevMidY: number = 0;

  // Double-tap metrics for touch
  private lastTapTime: number = 0;
  private lastTapPos = { x: 0, y: 0 };
  private lastDoubleActionTime: number = 0;

  constructor(options: GestureControllerOptions) {
    this.options = options;
    this.canvas = options.canvas;
    this.engine = options.engine;

    // Apply strict non-blocking gesture rules to canvas
    this.applyViewportStyles();

    // Attach event listeners to canvas element only (and window for keys)
    this.attachEvents();

    // Initial cursor update
    this.updateCursor();
  }

  /**
   * Enforces touch-action: none and overscroll-behavior: none on the canvas element only.
   */
  private applyViewportStyles(): void {
    this.canvas.style.touchAction = 'none';
    this.canvas.style.overscrollBehavior = 'none';
  }

  /**
   * Attaches pointer, wheel, dblclick, and contextmenu listeners to the canvas element ONLY.
   */
  private attachEvents(): void {
    // Wheel zoom on canvas
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });

    // Pointer events on canvas ONLY
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);

    // Double-click on canvas ONLY
    this.canvas.addEventListener('dblclick', this.onDoubleClick);

    // Context menu prevention on canvas
    this.canvas.addEventListener('contextmenu', this.onContextMenu);

    // Prevent default browser touch scrolling/gestures on canvas
    this.canvas.addEventListener('touchstart', this.preventDefaultTouch, { passive: false });
    this.canvas.addEventListener('touchmove', this.preventDefaultTouch, { passive: false });

    // Global keyboard navigation shortcuts
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
  }

  private preventDefaultTouch = (e: TouchEvent): void => {
    if (e.target === this.canvas) {
      e.preventDefault();
    }
  };

  private onContextMenu = (e: MouseEvent): void => {
    if (e.target === this.canvas) {
      e.preventDefault();
    }
  };

  /**
   * Determines if a pointer action corresponds to panning.
   * Right drag, middle drag, Shift + left drag, Space + left drag, or Hand tool.
   */
  private isPanModifier(e: PointerEvent): boolean {
    // Right drag (button 2 or buttons & 2)
    if (e.button === 2 || (e.buttons & 2) !== 0) {
      return true;
    }
    // Middle drag (button 1 or buttons & 4)
    if (e.button === 1 || (e.buttons & 4) !== 0) {
      return true;
    }
    // Shift + left drag
    if (e.shiftKey && (e.button === 0 || (e.buttons & 1) !== 0)) {
      return true;
    }
    // Space + left drag
    if (this.isSpaceDown && (e.button === 0 || (e.buttons & 1) !== 0)) {
      return true;
    }
    // Hand tool toggle active
    if (this.handToolActive && (e.button === 0 || (e.buttons & 1) !== 0)) {
      return true;
    }
    return false;
  }

  /**
   * Resolves the active drag mode according to current state and modifiers:
   * - Pan modifier held: PAN
   * - Draw overlay ON: plain drag = INTERACT / draw, Alt + left drag = ORBIT
   * - Draw overlay OFF: plain drag = ORBIT, Alt + left drag = INTERACT
   */
  private resolveDragMode(e: PointerEvent): DragAction {
    if (this.isPanModifier(e)) {
      return 'PAN';
    }

    const drawActive = this.options.isDrawActive();
    if (drawActive) {
      return e.altKey ? 'ORBIT' : 'INTERACT';
    } else {
      return e.altKey ? 'INTERACT' : 'ORBIT';
    }
  }

  /**
   * Wheel event handler:
   * factor = Math.exp(-deltaY * (e.ctrlKey ? 0.01 : 0.0015)); engine.zoomAt(factor, ndcX, ndcY);
   */
  private onWheel = (e: WheelEvent): void => {
    if (e.target !== this.canvas) return;
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
    this.updateCursor();
  };

  /**
   * Pointer down handler: registers pointer, sets initial state without capturing immediately.
   */
  private onPointerDown = (e: PointerEvent): void => {
    if (e.target !== this.canvas) return;

    this.activePointers.set(e.pointerId, {
      clientX: e.clientX,
      clientY: e.clientY,
      downX: e.clientX,
      downY: e.clientY,
      downTime: performance.now(),
      hasCaptured: false,
    });

    if (this.activePointers.size >= 2) {
      // 2 fingers on touch: pinch-zoom and pan together
      this.currentDragMode = 'PAN';
      this.isDragging = true;
      this.engine.setPointer(e.clientX, e.clientY, false);

      const pts = Array.from(this.activePointers.values());
      const p1 = pts[0];
      const p2 = pts[1];
      this.prevPinchDistance = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);
      this.prevMidX = (p1.clientX + p2.clientX) / 2;
      this.prevMidY = (p1.clientY + p2.clientY) / 2;

      this.updateCursor();
      return;
    }

    // Single pointer down
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.isDragging = false;

    // Check DRIFT bar hit on pointerdown (takes priority over orbit)
    if (this.options.getMode() === 'DRIFT' && this.engine.hitDriftBar(e.clientX, e.clientY)) {
      this.currentDragMode = 'BAR';
      this.isDragging = true;
      this.engine.setDriftDragging?.(true);
      this.engine.setDriftFromScreen(e.clientX, e.clientY);
      const pt = this.activePointers.get(e.pointerId);
      if (pt && !pt.hasCaptured) {
        pt.hasCaptured = true;
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch {
          // Ignored
        }
      }
      this.engine.setPointer(e.clientX, e.clientY, false);
      this.updateCursor();
      return;
    }

    this.currentDragMode = this.resolveDragMode(e);

    if (this.currentDragMode === 'INTERACT') {
      if (this.options.isDrawActive()) {
        this.options.onDrawPoint?.(e.clientX, e.clientY);
      } else {
        // Alt + left drag: burst on press when in SPLASH mode
        if (this.options.getMode() === 'SPLASH') {
          this.engine.burstAt(e.clientX, e.clientY);
        }
      }
      this.engine.setPointer(e.clientX, e.clientY, true);
    } else {
      // For ORBIT and PAN, do not trigger interactive down
      this.engine.setPointer(e.clientX, e.clientY, false);
    }

    this.updateCursor();
  };

  /**
   * Pointer move handler: manages 2-finger pinch/pan, single-pointer orbit, pan, or interact.
   * Sets pointer capture only after a drag begins (threshold >= 3px).
   */
  private onPointerMove = (e: PointerEvent): void => {
    if (!this.activePointers.has(e.pointerId)) {
      // Hover event when no buttons are held
      this.lastHoverX = e.clientX;
      this.lastHoverY = e.clientY;
      if (this.activePointers.size === 0 && e.target === this.canvas) {
        this.engine.setPointer(e.clientX, e.clientY, false);
        this.updateCursor();
      }
      return;
    }

    const pt = this.activePointers.get(e.pointerId)!;
    pt.clientX = e.clientX;
    pt.clientY = e.clientY;

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

        if (
          Math.abs(distanceRatio - 1) > 0.0005 &&
          distanceRatio > 0.2 &&
          distanceRatio < 5
        ) {
          this.engine.zoomAt(distanceRatio, midNdcX, midNdcY);
        }

        if (Math.abs(midDeltaX) > 0.01 || Math.abs(midDeltaY) > 0.01) {
          this.engine.panByPixels(midDeltaX, midDeltaY);
        }
      }

      this.prevPinchDistance = currDistance;
      this.prevMidX = midX;
      this.prevMidY = midY;

      this.engine.setPointer(midX, midY, false);
      this.updateCursor();
      return;
    }

    // --- SINGLE-POINTER DRAG ---
    const moveDist = Math.hypot(e.clientX - pt.downX, e.clientY - pt.downY);

    if (!this.isDragging && moveDist >= 3) {
      this.isDragging = true;
      if (!pt.hasCaptured) {
        pt.hasCaptured = true;
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch {
          // Ignored if target cannot capture pointer
        }
      }
    }

    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    const mode = this.currentDragMode ?? this.resolveDragMode(e);

    if (mode === 'BAR') {
      this.engine.setDriftFromScreen(e.clientX, e.clientY);
      this.engine.setPointer(e.clientX, e.clientY, false);
      this.updateCursor();
      return;
    } else if (mode === 'ORBIT') {
      if (this.isDragging) {
        this.engine.orbitByPixels(dx, dy);
      }
      this.engine.setPointer(e.clientX, e.clientY, false);
    } else if (mode === 'PAN') {
      if (this.isDragging) {
        this.engine.panByPixels(dx, dy);
      }
      this.engine.setPointer(e.clientX, e.clientY, false);
    } else if (mode === 'INTERACT') {
      if (this.options.isDrawActive()) {
        this.options.onDrawPoint?.(e.clientX, e.clientY);
      }
      this.engine.setPointer(e.clientX, e.clientY, true);
    }

    this.updateCursor();
  };

  /**
   * Pointer up / cancel handler
   */
  private onPointerUp = (e: PointerEvent): void => {
    if (!this.activePointers.has(e.pointerId)) return;

    const pt = this.activePointers.get(e.pointerId)!;
    const duration = performance.now() - pt.downTime;
    const moveDist = Math.hypot(e.clientX - pt.downX, e.clientY - pt.downY);

    if (pt.hasCaptured) {
      try {
        if (this.canvas.hasPointerCapture(e.pointerId)) {
          this.canvas.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignored
      }
    }

    this.activePointers.delete(e.pointerId);

    // If still 2 or more pointers active
    if (this.activePointers.size >= 2) {
      const pts = Array.from(this.activePointers.values());
      this.prevPinchDistance = Math.hypot(pts[1].clientX - pts[0].clientX, pts[1].clientY - pts[0].clientY);
      this.prevMidX = (pts[0].clientX + pts[1].clientX) / 2;
      this.prevMidY = (pts[0].clientY + pts[1].clientY) / 2;
      return;
    }

    // If 1 pointer remains after pinch
    if (this.activePointers.size === 1) {
      this.prevPinchDistance = 0;
      const remaining = this.activePointers.values().next().value;
      if (remaining) {
        this.lastPointerX = remaining.clientX;
        this.lastPointerY = remaining.clientY;
      }
      this.isDragging = false;
      this.currentDragMode = null;
      return;
    }

    // All pointers released
    const wasDragging = this.isDragging;
    const prevDragMode = this.currentDragMode;
    this.isDragging = false;
    this.currentDragMode = null;

    if (prevDragMode === 'BAR') {
      this.engine.setDriftDragging?.(false);
    }

    if (this.options.isDrawActive()) {
      this.options.onDrawEnd?.();
    }

    this.engine.setPointer(e.clientX, e.clientY, false);
    this.updateCursor();

    // Tap in SPLASH (moved < 5px and duration < 350ms): engine.burstAt(x, y)
    if (!wasDragging && moveDist < 5 && duration < 350) {
      if (this.options.getMode() === 'SPLASH') {
        this.engine.burstAt(e.clientX, e.clientY);
      }
    }

    // Touch double-tap detection to reset view
    if (e.pointerType === 'touch' && !wasDragging && moveDist < 15 && duration < 320) {
      const now = performance.now();
      const timeSinceLastTap = now - this.lastTapTime;
      const tapDist = Math.hypot(e.clientX - this.lastTapPos.x, e.clientY - this.lastTapPos.y);

      if (timeSinceLastTap > 40 && timeSinceLastTap < 350 && tapDist < 35) {
        this.lastDoubleActionTime = now;
        this.engine.resetView();
        this.lastTapTime = 0;
      } else {
        this.lastTapTime = now;
        this.lastTapPos = { x: e.clientX, y: e.clientY };
      }
    }
  };

  /**
   * Pointer leave handler: clears hover pointer when not dragging
   */
  private onPointerLeave = (e: PointerEvent): void => {
    this.lastHoverX = -9999;
    this.lastHoverY = -9999;
    if (this.activePointers.size === 0 && e.target === this.canvas) {
      this.engine.setPointer(9999, 9999, false);
      this.updateCursor();
    }
  };

  /**
   * Double-click on canvas (not on Drift bar): resets view back to defaults.
   */
  private onDoubleClick = (e: MouseEvent): void => {
    if (e.target !== this.canvas) return;
    if (performance.now() - this.lastDoubleActionTime < 450) return;
    this.lastDoubleActionTime = performance.now();
    this.engine.resetView();
    this.updateCursor();
  };

  private isTextInput(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!(
      el &&
      (el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.isContentEditable)
    );
  }

  /**
   * Keyboard shortcuts:
   * '+' / '-' -> zoom
   * '0' -> resetView()
   * Arrow keys -> pan only when zoom > 1
   * 'h' / 'H' -> toggle hand tool
   * Space -> hold to pan
   */
  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.isTextInput(e.target)) return;

    // Space key tracking for Space + left drag PAN
    if (e.code === 'Space') {
      e.preventDefault();
      this.isSpaceDown = true;
      this.updateCursor();
      return;
    }

    // Zoom In: '+' or '=' or NumpadAdd
    if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
      e.preventDefault();
      this.engine.zoomAt(1.25, 0, 0);
      this.updateCursor();
      return;
    }

    // Zoom Out: '-' or '_' or NumpadSubtract
    if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
      e.preventDefault();
      this.engine.zoomAt(0.8, 0, 0);
      this.updateCursor();
      return;
    }

    // Reset View: key '0'
    if (
      (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      e.preventDefault();
      this.engine.resetView();
      this.updateCursor();
      return;
    }

    // Arrow keys: pan only when zoom > 1
    const zoom = this.engine.getView().zoom;
    if (zoom > 1.0) {
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

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space') {
      this.isSpaceDown = false;
      this.updateCursor();
    }
  };

  private onWindowBlur = (): void => {
    this.isSpaceDown = false;
    this.updateCursor();
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
      this.updateCursor();
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

  private getDriftBarCursor(): string {
    const drift = this.engine.getDrift();
    const deg = ((drift.angleDeg % 360) + 360) % 360;
    // Horizontal drift (0° or 180°): the bar is vertical and moves left/right -> ew-resize
    if ((deg >= 337.5 || deg <= 22.5) || (deg >= 157.5 && deg <= 202.5)) {
      return 'ew-resize';
    }
    // Vertical drift (90° or 270°): the bar is horizontal and moves up/down -> ns-resize
    if ((deg >= 67.5 && deg <= 112.5) || (deg >= 247.5 && deg <= 292.5)) {
      return 'ns-resize';
    }
    return 'move';
  }

  /**
   * Updates canvas cursor styling:
   * - 'ew-resize' / 'ns-resize' / 'move' while hovering/dragging DRIFT bar
   * - 'grabbing' while orbiting
   * - 'move' while panning
   * - 'crosshair' when drawing
   * - 'grab' when idle/hovering
   */
  public updateCursor(_isDragging?: boolean): void {
    if (this.isDestroyed) return;

    if (this.isDragging) {
      if (this.currentDragMode === 'BAR') {
        this.canvas.style.cursor = this.getDriftBarCursor();
        return;
      }
      if (this.currentDragMode === 'ORBIT') {
        this.canvas.style.cursor = 'grabbing';
        return;
      }
      if (this.currentDragMode === 'PAN') {
        this.canvas.style.cursor = 'move';
        return;
      }
      if (this.currentDragMode === 'INTERACT') {
        this.canvas.style.cursor = this.options.isDrawActive() ? 'crosshair' : 'default';
        return;
      }
    }

    // Hovering over DRIFT bar in DRIFT mode
    if (
      this.options.getMode() === 'DRIFT' &&
      this.engine.hitDriftBar(this.lastHoverX, this.lastHoverY)
    ) {
      this.canvas.style.cursor = this.getDriftBarCursor();
      return;
    }

    if (this.options.isDrawActive()) {
      this.canvas.style.cursor = 'crosshair';
      return;
    }

    if (this.handToolActive || this.isSpaceDown) {
      this.canvas.style.cursor = 'move';
      return;
    }

    this.canvas.style.cursor = 'grab';
  }

  /**
   * Destroys event listeners and frees references
   */
  public dispose(): void {
    this.isDestroyed = true;
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('dblclick', this.onDoubleClick);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('touchstart', this.preventDefaultTouch);
    this.canvas.removeEventListener('touchmove', this.preventDefaultTouch);

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    this.activePointers.clear();
  }
}
