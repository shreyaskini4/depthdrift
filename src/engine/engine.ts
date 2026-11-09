/**
 * ThreeParticleEngine - 3D WebGL Particle Engine for Drift
 * Implements the ParticleEngine interface using Three.js and custom GLSL shaders.
 */

import * as THREE from 'three';
import type {
  ColorMode,
  DepthResult,
  DriftBar,
  EngineRenderState,
  ModeName,
  ParticleEngine,
  ParticleSettings,
  TrackerPoint,
  UserDrawingPoint,
} from '../types';
import { FPSRegulator } from './fpsRegulator';
import {
  type BaseTracker,
  createDefaultParticles,
  MAX_PARTICLE_CAPACITY,
  sampleImageAndDepth,
  type SampledParticles,
  type SampleOptions,
} from './sampling';
import { PARTICLE_FRAGMENT_SHADER, PARTICLE_VERTEX_SHADER } from './shaders';
import {
  computeTrackerWorldPosition,
  type TrackerDisplacementParams,
} from '../overlays/trackerDisplacement';

export const MODE_INDICES: Record<ModeName, number> = {
  DRIFT: 0,
  SPLASH: 1,
  GATHER: 2,
  DEPTH: 3,
  TRAVEL: 4,
  SWARM: 5,
  MELT: 6,
};

export const COLOR_MODE_INDICES: Record<ColorMode, number> = {
  TRUE: 0,
  NEGATIVE: 1,
  ON_WHITE: 2,
};

export const MAX_YAW = (Math.PI * 70) / 180;
export const MAX_PITCH = (Math.PI * 45) / 180;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 12.0;

export class ThreeParticleEngine implements ParticleEngine {
  public readonly canvas: HTMLCanvasElement;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  private points: THREE.Points;

  private settings: ParticleSettings;
  private fpsRegulator: FPSRegulator;

  private width: number = 800;
  private height: number = 600;
  private dpr: number = 1.0;

  // Trackers and interactive state
  private baseTrackers: BaseTracker[] = [];
  private pointerState = {
    x: 0,
    y: 0,
    isDown: false,
    vx: 0,
    vy: 0,
  };
  private pointerWorld = new THREE.Vector2(0, 0);
  private lastPointerWorld = new THREE.Vector2(0, 0);
  private lastPointerTime: number = 0;
  private lastBurstAt: number = -100;
  private orientation = new THREE.Vector2(0, 0);
  private impulseStrength: number = 0.0;
  private impulseCenter = new THREE.Vector2(0, 0);

  // Transitions
  private prevMode: ModeName = 'DRIFT';
  private modeTransitionStartTime: number = 0;
  private modeTransitionDuration: number = 500;

  private isMorphing: boolean = false;
  private morphStartTime: number = 0;
  private morphDuration: number = 800;
  private currentDataCount: number = MAX_PARTICLE_CAPACITY;
  private lastPixels: HTMLCanvasElement | ImageBitmap | ImageData | null = null;
  private lastDepth: DepthResult | null = null;
  private imageAspect: number = 1.0;
  private baseCamZ = 2.0;
  private travelBlend: number = 0;

  // Spherical orbit, pan, and zoom state
  private view = {
    zoom: 1,
    zoomT: 1,
    panX: 0,
    panY: 0,
    panTX: 0,
    panTY: 0,
    yaw: 0,
    yawT: 0,
    pitch: 0,
    pitchT: 0,
  };

  // Render timing & caching
  private startMs: number = typeof performance !== 'undefined' ? performance.now() : Date.now();
  private lastTime: number = -1;
  private latestRenderState: EngineRenderState | null = null;
  private tempVec = new THREE.Vector3();
  private tempDriftAxis = new THREE.Vector2(1, 0);

  // Drift state
  public drift = { pos: 0.65, angleDeg: 0, feather: 0.35 };
  private posSmooth: number = 0.65;
  private isDriftDragging: boolean = false;
  private currentDriftBar: DriftBar | null = null;

  constructor(canvas?: HTMLCanvasElement, initialSettings?: Partial<ParticleSettings>) {
    this.canvas = canvas ?? document.createElement('canvas');

    const isDebug =
      (typeof window !== 'undefined' && window.location.search.includes('debug')) ||
      !!initialSettings?.debug;

    const isCoarse =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;

    const defaultQuality: 'STANDARD' | 'HIGH' | 'ULTRA' = isCoarse
      ? 'STANDARD'
      : 'HIGH';
    const defaultParticleCount = isCoarse ? 200_000 : 450_000;

    // Default settings
    this.settings = {
      particleCount: initialSettings?.particleCount ?? defaultParticleCount,
      pointSize: initialSettings?.pointSize ?? 1.0,
      depthScale: initialSettings?.depthScale ?? 0.3,
      intensity: initialSettings?.intensity ?? 1.35,
      quality: initialSettings?.quality ?? defaultQuality,
      noiseSpeed: initialSettings?.noiseSpeed ?? 0.6,
      noiseFrequency: initialSettings?.noiseFrequency ?? 1.2,
      noiseStrength: initialSettings?.noiseStrength ?? 0.8,
      splashStrength: initialSettings?.splashStrength ?? 1.5,
      mode: initialSettings?.mode ?? 'DRIFT',
      colorMode: initialSettings?.colorMode ?? 'TRUE',
      overlays: initialSettings?.overlays ?? {
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
      },
      adaptiveFPS: initialSettings?.adaptiveFPS ?? true,
      debug: isDebug,
    };

    this.fpsRegulator = new FPSRegulator(this.settings.particleCount, this.settings.adaptiveFPS);

    // Initial width & height
    this.width = this.canvas.clientWidth || 800;
    this.height = this.canvas.clientHeight || 600;
    this.dpr = this.effectivePixelRatio();

    // Three.js renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: true,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.width, this.height, false);

    // Camera setup
    this.camera = new THREE.PerspectiveCamera(50, this.width / this.height, 0.1, 50);
    this.camera.zoom = this.view.zoom;
    this.fitCamera();
    this.camera.lookAt(0, 0, 0);

    // Scene
    this.scene = new THREE.Scene();

    // Geometry buffers for MAX_PARTICLE_CAPACITY
    this.geometry = new THREE.BufferGeometry();
    const capacity = MAX_PARTICLE_CAPACITY;

    const positions = new Float32Array(capacity * 3);
    const targetPositions = new Float32Array(capacity * 3);
    const colors = new Float32Array(capacity * 3);
    const targetColors = new Float32Array(capacity * 3);
    const randomSeeds = new Float32Array(capacity * 2);
    const saliences = new Float32Array(capacity);
    const targetSaliences = new Float32Array(capacity);
    const sourceDepths = new Float32Array(capacity);
    const targetDepths = new Float32Array(capacity);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('targetPosition', new THREE.BufferAttribute(targetPositions, 3));
    this.geometry.setAttribute('sourceColor', new THREE.BufferAttribute(colors, 3));
    this.geometry.setAttribute('targetColor', new THREE.BufferAttribute(targetColors, 3));
    this.geometry.setAttribute('randomSeed', new THREE.BufferAttribute(randomSeeds, 2));
    this.geometry.setAttribute('salience', new THREE.BufferAttribute(saliences, 1));
    this.geometry.setAttribute('targetSalience', new THREE.BufferAttribute(targetSaliences, 1));
    this.geometry.setAttribute('sourceDepth', new THREE.BufferAttribute(sourceDepths, 1));
    this.geometry.setAttribute('targetDepth', new THREE.BufferAttribute(targetDepths, 1));

    // Shader Material
    this.material = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERTEX_SHADER,
      fragmentShader: PARTICLE_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0.0 },
        uPointSize: { value: this.settings.pointSize },
        uDepthScale: { value: this.settings.depthScale },
        uNoiseSpeed: { value: this.settings.noiseSpeed },
        uNoiseFrequency: { value: this.settings.noiseFrequency },
        uNoiseStrength: { value: this.settings.noiseStrength },
        uSplashStrength: { value: this.settings.splashStrength },
        uMode: { value: MODE_INDICES[this.settings.mode] },
        uPrevMode: { value: MODE_INDICES[this.settings.mode] },
        uModeTransition: { value: 1.0 },
        uColorMode: { value: COLOR_MODE_INDICES[this.settings.colorMode] },
        uPointer: { value: new THREE.Vector3(999, 999, 0) },
        uPointerVelocity: { value: new THREE.Vector2(0, 0) },
        uPointerRadius: { value: 0.5 },
        uBurst: { value: new THREE.Vector3(0, 0, -100) },
        uAttractor: { value: new THREE.Vector3(0, 0, 0.6) },
        uOrientation: { value: new THREE.Vector2(0, 0) },
        uPixelRatio: { value: this.dpr },
        uZoom: { value: this.view.zoom },
        uIntensity: { value: this.settings.intensity },
        uMorphProgress: { value: 0.0 },
        uImpulseCenter: { value: new THREE.Vector2(0, 0) },
        uImpulseStrength: { value: 0.0 },
        uDebug: { value: isDebug ? 1 : 0 },
        uDriftAxis: { value: new THREE.Vector2(1, 0) },
        uDriftOrigin: { value: 0 },
        uDriftFeather: { value: 0.35 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending:
        this.settings.colorMode === 'ON_WHITE' ? THREE.NormalBlending : THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
      blendEquation: THREE.AddEquation,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    // Initial default particles: allocate full capacity so all buffer indices are populated
    const defaultData = createDefaultParticles(MAX_PARTICLE_CAPACITY);
    this.applySampledData(defaultData, false);

    // Initial clear color
    this.updateClearColor(this.settings.colorMode);
  }

  private effectivePixelRatio(): number {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const ss = { STANDARD: 1, HIGH: 2, ULTRA: 3 }[this.settings.quality];
    const cap = Math.sqrt(14e6 / Math.max(1, this.width * this.height));
    return Math.max(1, Math.min(Math.max(dpr, ss), cap));
  }

  private fitCamera(): void {
    if (!this.camera) return;
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const viewAspect = this.width / this.height;
    const fill = 0.82; // leaves room for the dock
    const distH = 0.5 / (t * fill);
    const distW = (0.5 * this.imageAspect) / (t * viewAspect * fill);
    this.baseCamZ = Math.max(distH, distW);
    this.camera.position.z = this.baseCamZ;
  }

  private updateClearColor(colorMode: ColorMode): void {
    if (colorMode === 'ON_WHITE') {
      this.renderer.setClearColor(0xfcfcfd, 1.0);
      this.material.blending = THREE.NormalBlending;
    } else {
      this.renderer.setClearColor(0x050506, 1.0);
      this.material.blending = THREE.CustomBlending;
      this.material.blendSrc = THREE.SrcAlphaFactor;
      this.material.blendDst = THREE.OneFactor;
      this.material.blendEquation = THREE.AddEquation;
    }
    this.material.needsUpdate = true;
  }

  private triggerBurst(x: number, y: number): void {
    const t = (performance.now() - this.startMs) / 1000;
    this.material.uniforms.uBurst.value.set(x, y, t);
    this.lastBurstAt = t;
  }

  private applySampledData(data: SampledParticles, morph: boolean = true): void {
    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const tgtPosAttr = this.geometry.getAttribute('targetPosition') as THREE.BufferAttribute;
    const colAttr = this.geometry.getAttribute('sourceColor') as THREE.BufferAttribute;
    const tgtColAttr = this.geometry.getAttribute('targetColor') as THREE.BufferAttribute;
    const seedAttr = this.geometry.getAttribute('randomSeed') as THREE.BufferAttribute;
    const salAttr = this.geometry.getAttribute('salience') as THREE.BufferAttribute;
    const tgtSalAttr = this.geometry.getAttribute('targetSalience') as THREE.BufferAttribute;
    const depAttr = this.geometry.getAttribute('sourceDepth') as THREE.BufferAttribute;
    const tgtDepAttr = this.geometry.getAttribute('targetDepth') as THREE.BufferAttribute;

    const count = Math.max(1, Math.min(MAX_PARTICLE_CAPACITY, data.count));

    if (morph) {
      // Current rendered positions become source, new data becomes target
      (tgtPosAttr.array as Float32Array).set(data.positions.subarray(0, count * 3));
      (tgtColAttr.array as Float32Array).set(data.colors.subarray(0, count * 3));
      (tgtSalAttr.array as Float32Array).set(data.saliences.subarray(0, count));
      (tgtDepAttr.array as Float32Array).set(data.depths.subarray(0, count));

      tgtPosAttr.needsUpdate = true;
      tgtColAttr.needsUpdate = true;
      tgtSalAttr.needsUpdate = true;
      tgtDepAttr.needsUpdate = true;

      if (data.randomSeeds) {
        (seedAttr.array as Float32Array).set(data.randomSeeds.subarray(0, count * 2));
        seedAttr.needsUpdate = true;
      }

      // If particle count increased, populate source buffers for new particles
      if (count > this.currentDataCount) {
        const start = this.currentDataCount;
        (posAttr.array as Float32Array).set(data.positions.subarray(start * 3, count * 3), start * 3);
        (colAttr.array as Float32Array).set(data.colors.subarray(start * 3, count * 3), start * 3);
        (salAttr.array as Float32Array).set(data.saliences.subarray(start, count), start);
        (depAttr.array as Float32Array).set(data.depths.subarray(start, count), start);

        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        salAttr.needsUpdate = true;
        depAttr.needsUpdate = true;
      }

      this.currentDataCount = count;
      this.isMorphing = true;
      this.morphStartTime = performance.now();
      this.morphDuration = 800;
    } else {
      (posAttr.array as Float32Array).set(data.positions.subarray(0, count * 3));
      (tgtPosAttr.array as Float32Array).set(data.positions.subarray(0, count * 3));
      (colAttr.array as Float32Array).set(data.colors.subarray(0, count * 3));
      (tgtColAttr.array as Float32Array).set(data.colors.subarray(0, count * 3));
      (seedAttr.array as Float32Array).set(data.randomSeeds.subarray(0, count * 2));
      (salAttr.array as Float32Array).set(data.saliences.subarray(0, count));
      (tgtSalAttr.array as Float32Array).set(data.saliences.subarray(0, count));
      (depAttr.array as Float32Array).set(data.depths.subarray(0, count));
      (tgtDepAttr.array as Float32Array).set(data.depths.subarray(0, count));

      posAttr.needsUpdate = true;
      tgtPosAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      tgtColAttr.needsUpdate = true;
      seedAttr.needsUpdate = true;
      salAttr.needsUpdate = true;
      tgtSalAttr.needsUpdate = true;
      depAttr.needsUpdate = true;
      tgtDepAttr.needsUpdate = true;

      this.material.uniforms.uMorphProgress.value = 0.0;
      this.isMorphing = false;
      this.currentDataCount = count;
    }

    if (data.aspect) {
      this.imageAspect = data.aspect;
      this.fitCamera();
      this.clampPan();
    }

    this.baseTrackers = data.trackers;
    if (this.baseTrackers.length > 0) {
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let i = 0; i < this.baseTrackers.length; i++) {
        const d = this.baseTrackers[i].rawDepth;
        if (d < minZ) minZ = d;
        if (d > maxZ) maxZ = d;
      }
      console.log(
        `[Drift Engine] Trackers updated: count=${this.baseTrackers.length}, zMin=${minZ.toFixed(4)}, zMax=${maxZ.toFixed(4)}, zSpan=${(maxZ - minZ).toFixed(4)}`
      );
    }
    const effectiveCount = this.fpsRegulator
      ? Math.min(count, this.fpsRegulator.getEffectiveParticleCount())
      : Math.min(count, this.settings.particleCount);
    this.geometry.setDrawRange(0, effectiveCount);
  }

  public setImage(
    pixels: HTMLCanvasElement | ImageBitmap | ImageData,
    depth: DepthResult,
    options?: number | SampleOptions
  ): void {
    this.lastPixels = pixels;
    this.lastDepth = depth;
    void options;
    // Always sample at full MAX_PARTICLE_CAPACITY; the user's particleCount only changes the draw range
    const targetCount = MAX_PARTICLE_CAPACITY;
    const sampled = sampleImageAndDepth(pixels, depth, targetCount);
    this.imageAspect = sampled.aspect || (pixels.width / Math.max(1, pixels.height)) || 1.0;
    this.fitCamera();
    this.clampPan();
    this.applySampledData(sampled, true);
  }

  public setSettings(settings: Partial<ParticleSettings>): void {
    if (settings.particleCount !== undefined) {
      this.settings.particleCount = settings.particleCount;
      this.fpsRegulator.setTargetCount(settings.particleCount);
      const effectiveCount = this.fpsRegulator.getEffectiveParticleCount();
      if (this.lastPixels && this.lastDepth && settings.particleCount > this.currentDataCount) {
        const sampled = sampleImageAndDepth(this.lastPixels, this.lastDepth, settings.particleCount);
        this.applySampledData(sampled, false);
      }
      this.geometry.setDrawRange(0, effectiveCount);
    }

    if (settings.pointSize !== undefined) {
      this.settings.pointSize = settings.pointSize;
      this.material.uniforms.uPointSize.value = settings.pointSize;
    }

    if (settings.depthScale !== undefined) {
      this.settings.depthScale = settings.depthScale;
      this.material.uniforms.uDepthScale.value = settings.depthScale;
    }

    if (settings.intensity !== undefined) {
      this.settings.intensity = settings.intensity;
      this.material.uniforms.uIntensity.value = settings.intensity;
    }

    if (settings.quality !== undefined) {
      this.settings.quality = settings.quality;
      const targetDpr = this.effectivePixelRatio();
      this.dpr = targetDpr;
      this.renderer.setPixelRatio(targetDpr);
      this.renderer.setSize(this.width, this.height, false);
      this.material.uniforms.uPixelRatio.value = targetDpr;
    }

    if (settings.noiseSpeed !== undefined) {
      this.settings.noiseSpeed = settings.noiseSpeed;
      this.material.uniforms.uNoiseSpeed.value = settings.noiseSpeed;
    }

    if (settings.noiseFrequency !== undefined) {
      this.settings.noiseFrequency = settings.noiseFrequency;
      this.material.uniforms.uNoiseFrequency.value = settings.noiseFrequency;
    }

    if (settings.noiseStrength !== undefined) {
      this.settings.noiseStrength = settings.noiseStrength;
      this.material.uniforms.uNoiseStrength.value = settings.noiseStrength;
    }

    if (settings.splashStrength !== undefined) {
      this.settings.splashStrength = settings.splashStrength;
      this.material.uniforms.uSplashStrength.value = settings.splashStrength;
    }

    if (settings.mode !== undefined && settings.mode !== this.settings.mode) {
      this.setMode(settings.mode);
    }

    if (settings.colorMode !== undefined && settings.colorMode !== this.settings.colorMode) {
      this.setColorMode(settings.colorMode);
    }

    if (settings.adaptiveFPS !== undefined) {
      this.settings.adaptiveFPS = settings.adaptiveFPS;
      this.fpsRegulator.setEnabled(settings.adaptiveFPS);
    }

    if (settings.debug !== undefined) {
      this.settings.debug = settings.debug;
      this.material.uniforms.uDebug.value = settings.debug ? 1 : 0;
    }

    if (settings.overlays !== undefined) {
      this.settings.overlays = {
        ...this.settings.overlays,
        ...settings.overlays,
        active: {
          ...this.settings.overlays.active,
          ...(settings.overlays.active || {}),
        },
      };
    }
  }

  public getSettings(): ParticleSettings {
    return {
      ...this.settings,
      overlays: {
        ...this.settings.overlays,
        active: { ...this.settings.overlays.active },
      },
    };
  }

  public setMode(mode: ModeName, transitionDurationMs: number = 600): void {
    if (this.settings.mode === mode) return;

    this.prevMode = this.settings.mode;
    this.settings.mode = mode;

    if (mode === 'SPLASH') {
      this.triggerBurst(0, 0);
    }

    this.modeTransitionStartTime = performance.now();
    this.modeTransitionDuration = Math.max(100, transitionDurationMs);

    this.material.uniforms.uPrevMode.value = MODE_INDICES[this.prevMode];
    this.material.uniforms.uMode.value = MODE_INDICES[mode];
    this.material.uniforms.uModeTransition.value = 0.0;
  }

  public setColorMode(colorMode: ColorMode): void {
    this.settings.colorMode = colorMode;
    this.material.uniforms.uColorMode.value = COLOR_MODE_INDICES[colorMode];
    this.updateClearColor(colorMode);
  }

  public screenToWorld(x: number, y: number): THREE.Vector2 {
    const ndcX = (x / Math.max(1, this.width)) * 2 - 1;
    const ndcY = -(y / Math.max(1, this.height)) * 2 + 1;

    this.camera.updateMatrixWorld();
    this.tempVec.set(ndcX, ndcY, 0.5).unproject(this.camera);
    const dir = this.tempVec.sub(this.camera.position).normalize();
    const distance = Math.abs(dir.z) > 1e-6 ? -this.camera.position.z / dir.z : 0;
    const worldX = this.camera.position.x + dir.x * distance;
    const worldY = this.camera.position.y + dir.y * distance;

    return new THREE.Vector2(worldX, worldY);
  }

  public setDrift(partial: Partial<{ pos: number; angleDeg: number; feather: number }>): void {
    if (partial.pos !== undefined) {
      this.drift.pos = THREE.MathUtils.clamp(partial.pos, 0, 1);
    }
    if (partial.angleDeg !== undefined) {
      this.drift.angleDeg = partial.angleDeg;
    }
    if (partial.feather !== undefined) {
      this.drift.feather = THREE.MathUtils.clamp(partial.feather, 0.01, 2.0);
    }
  }

  public getDrift(): { pos: number; angleDeg: number; feather: number } {
    return { ...this.drift };
  }

  public setDriftFromScreen(x: number, y: number): void {
    const w = this.screenToWorld(x, y);
    const a = THREE.MathUtils.degToRad(this.drift.angleDeg);
    const axis = new THREE.Vector2(Math.cos(a), Math.sin(a));
    const half = 0.5 * (Math.abs(axis.x) * this.imageAspect + Math.abs(axis.y));
    if (half <= 1e-6) return;
    const s = w.x * axis.x + w.y * axis.y;
    this.drift.pos = THREE.MathUtils.clamp((s + half) / (2 * half), 0, 1);
  }

  private distToSegment(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number
  ): number {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-6) {
      return Math.hypot(px - ax, py - ay);
    }
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    const projX = ax + t * dx;
    const projY = ay + t * dy;
    return Math.hypot(px - projX, py - projY);
  }

  public hitDriftBar(x: number, y: number): boolean {
    if (this.settings.mode !== 'DRIFT') return false;
    const bar = this.latestRenderState?.driftBar ?? this.currentDriftBar;
    if (!bar) return false;
    return this.distToSegment(x, y, bar.a.x, bar.a.y, bar.b.x, bar.b.y) <= 14;
  }

  public setDriftDragging(dragging: boolean): void {
    this.isDriftDragging = dragging;
  }

  public burstAt(x: number, y: number): void {
    const world = this.screenToWorld(x, y);
    this.triggerBurst(world.x, world.y);
  }

  public setPointer(x: number, y: number, isDown: boolean): void {
    this.pointerState.x = x;
    this.pointerState.y = y;
    this.pointerState.isDown = isDown;

    const world = this.screenToWorld(x, y);
    const worldX = world.x;
    const worldY = world.y;

    const now = performance.now();
    const dt = Math.max(0.001, (now - this.lastPointerTime) / 1000);

    if (this.lastPointerTime > 0) {
      this.pointerState.vx = (worldX - this.lastPointerWorld.x) / dt;
      this.pointerState.vy = (worldY - this.lastPointerWorld.y) / dt;
    }

    this.lastPointerWorld.set(worldX, worldY);
    this.pointerWorld.set(worldX, worldY);
    this.lastPointerTime = now;

    this.material.uniforms.uPointer.value.set(worldX, worldY, isDown ? 1.0 : 0.0);
    this.material.uniforms.uPointerVelocity.value.set(this.pointerState.vx, this.pointerState.vy);
  }

  public setOrientation(pitch: number, roll: number): void {
    this.orientation.set(pitch, roll);
    this.material.uniforms.uOrientation.value.set(pitch, roll);
  }

  public addDrawImpulse(points: UserDrawingPoint[]): void {
    if (!points || points.length === 0) return;

    const last = points[points.length - 1];
    const world = this.screenToWorld(last.x, last.y);

    this.impulseCenter.set(world.x, world.y);
    this.impulseStrength = 1.0;

    this.material.uniforms.uImpulseCenter.value.set(world.x, world.y);
    this.material.uniforms.uImpulseStrength.value = 1.0;
  }

  public resize(width: number, height: number, _dpr?: number): void {
    if (width <= 0 || height <= 0) return;

    this.width = width;
    this.height = height;
    const targetDpr = this.effectivePixelRatio();
    this.dpr = targetDpr;

    this.renderer.setPixelRatio(targetDpr);
    this.renderer.setSize(width, height, false);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.fitCamera();
    this.clampPan();

    this.material.uniforms.uPixelRatio.value = targetDpr;
  }

  private halfExtents(z: number): { hw: number; hh: number } {
    const hh = (this.baseCamZ * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / z;
    return { hw: (hh * this.width) / Math.max(1, this.height), hh };
  }

  public zoomAt(factor: number, ndcX: number = 0, ndcY: number = 0): void {
    const z1 = THREE.MathUtils.clamp(this.view.zoomT * factor, MIN_ZOOM, MAX_ZOOM);
    const a = this.halfExtents(this.view.zoomT);
    const b = this.halfExtents(z1);
    this.view.panTX += ndcX * (a.hw - b.hw); // keeps the point under the cursor fixed
    this.view.panTY += ndcY * (a.hh - b.hh);
    this.view.zoomT = z1;
    this.clampPan();
  }

  public setZoom(zoom: number): void {
    this.view.zoomT = THREE.MathUtils.clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    this.clampPan();
  }

  public orbitByPixels(dx: number, dy: number): void {
    this.view.yawT = THREE.MathUtils.clamp(this.view.yawT - dx * 0.005, -MAX_YAW, MAX_YAW);
    this.view.pitchT = THREE.MathUtils.clamp(this.view.pitchT + dy * 0.005, -MAX_PITCH, MAX_PITCH);
  }

  public panByPixels(dx: number, dy: number): void {
    const e = this.halfExtents(this.view.zoomT);
    this.view.panTX -= (dx / Math.max(1, this.width)) * 2 * e.hw;
    this.view.panTY += (dy / Math.max(1, this.height)) * 2 * e.hh; // screen dy is down, y is up
    this.clampPan();
  }

  public clampPan(): void {
    const maxBoundX = Math.max(2.5, this.imageAspect * 2.5);
    const maxBoundY = 2.5;
    this.view.panTX = THREE.MathUtils.clamp(this.view.panTX, -maxBoundX, maxBoundX);
    this.view.panTY = THREE.MathUtils.clamp(this.view.panTY, -maxBoundY, maxBoundY);
  }

  public resetView(): void {
    this.view.zoomT = 1.0;
    this.view.panTX = 0;
    this.view.panTY = 0;
    this.view.yawT = 0;
    this.view.pitchT = 0;
  }

  public getView(): { zoom: number; panX: number; panY: number; yaw: number; pitch: number } {
    return {
      zoom: this.view.zoom,
      panX: this.view.panX,
      panY: this.view.panY,
      yaw: this.view.yaw,
      pitch: this.view.pitch,
    };
  }

  public setDebug(debug: boolean): void {
    this.settings.debug = debug;
    this.material.uniforms.uDebug.value = debug ? 1 : 0;
  }

  private updateCamera(dt: number, _tSec: number, dolly: number): void {
    const v = this.view;
    const k = 1 - Math.exp(-dt * 12); // ease zoom, pan, yaw, pitch to targets
    v.zoom += (v.zoomT - v.zoom) * k;
    v.panX += (v.panTX - v.panX) * k;
    v.panY += (v.panTY - v.panY) * k;
    v.yaw += (v.yawT - v.yaw) * k;
    v.pitch += (v.pitchT - v.pitch) * k;
    const px = this.pointerState.x / Math.max(1, this.width) - 0.5;
    const py = this.pointerState.y / Math.max(1, this.height) - 0.5;
    const yaw = v.yaw + px * 0.10 + this.orientation.y * 0.15; // light parallax
    const pitch = v.pitch - py * 0.07 - this.orientation.x * 0.15;
    const r = this.baseCamZ - dolly; // Travel dolly
    this.camera.position.set(
      v.panX + r * Math.sin(yaw) * Math.cos(pitch),
      v.panY + r * Math.sin(pitch),
      r * Math.cos(yaw) * Math.cos(pitch)
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(v.panX, v.panY, 0);
    this.camera.zoom = v.zoom;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  public render(_t?: number): EngineRenderState {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this.startMs === 0) {
      this.startMs = now;
    }
    const tSec = (now - this.startMs) / 1000;
    const dt = this.lastTime >= 0 ? Math.max(0.001, Math.min(0.2, tSec - this.lastTime)) : 0.016;
    this.lastTime = tSec;

    // 1. Velocity decay
    const dec = Math.exp(-dt * 6);
    this.pointerState.vx *= dec;
    this.pointerState.vy *= dec;
    this.material.uniforms.uPointerVelocity.value.set(this.pointerState.vx, this.pointerState.vy);

    // 2. Splash auto-burst
    if (this.settings.mode === 'SPLASH' && tSec - this.lastBurstAt > 6) {
      this.triggerBurst((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.4);
    }

    // 3. Attractor smoothing
    const recent = this.lastPointerTime > 0 && (performance.now() - this.lastPointerTime < 2500);
    let tx: number, ty: number, amt: number;
    if (this.pointerState.isDown || recent) {
      tx = this.pointerWorld.x;
      ty = this.pointerWorld.y;
      amt = this.pointerState.isDown ? 1.0 : 0.8;
    } else {
      tx = 0.28 * Math.sin(tSec * 0.4);
      ty = 0.2 * Math.cos(tSec * 0.33);
      amt = 0.6;
    }
    const kAttractor = 1 - Math.exp(-dt * 3.0);
    const att = this.material.uniforms.uAttractor.value;
    att.x += (tx - att.x) * kAttractor;
    att.y += (ty - att.y) * kAttractor;
    att.z += (amt - att.z) * kAttractor;

    // Adaptive FPS regulation
    const { fps, effectiveParticleCount } = this.fpsRegulator.update(dt);
    const drawCount = Math.max(1, Math.min(this.currentDataCount, effectiveParticleCount));
    this.geometry.setDrawRange(0, drawCount);

    // Uniform updates
    this.material.uniforms.uTime.value = tSec;

    // Drift parameters
    const a = THREE.MathUtils.degToRad(this.drift.angleDeg);
    const axis = this.tempDriftAxis.set(Math.cos(a), Math.sin(a));
    const half = 0.5 * (Math.abs(axis.x) * this.imageAspect + Math.abs(axis.y));
    this.posSmooth += (this.drift.pos - this.posSmooth) * (1 - Math.exp(-dt * 10));
    const origin = -half + 2 * half * this.posSmooth;
    this.material.uniforms.uDriftOrigin.value = origin;
    this.material.uniforms.uDriftAxis.value.copy(axis);
    this.material.uniforms.uDriftFeather.value = this.drift.feather;

    // Mode transition animation
    if (this.material.uniforms.uModeTransition.value < 1.0) {
      const elapsed = now - this.modeTransitionStartTime;
      const progress = Math.min(1.0, elapsed / this.modeTransitionDuration);
      this.material.uniforms.uModeTransition.value = progress;
    }

    // Image morph transition animation
    if (this.isMorphing) {
      const morphElapsed = now - this.morphStartTime;
      const morphProgress = Math.min(1.0, morphElapsed / this.morphDuration);
      this.material.uniforms.uMorphProgress.value = morphProgress;

      if (morphProgress >= 1.0) {
        // Morph complete: promote target to source
        const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute;
        const tgtPosAttr = this.geometry.getAttribute('targetPosition') as THREE.BufferAttribute;
        const colAttr = this.geometry.getAttribute('sourceColor') as THREE.BufferAttribute;
        const tgtColAttr = this.geometry.getAttribute('targetColor') as THREE.BufferAttribute;
        const salAttr = this.geometry.getAttribute('salience') as THREE.BufferAttribute;
        const tgtSalAttr = this.geometry.getAttribute('targetSalience') as THREE.BufferAttribute;
        const depAttr = this.geometry.getAttribute('sourceDepth') as THREE.BufferAttribute;
        const tgtDepAttr = this.geometry.getAttribute('targetDepth') as THREE.BufferAttribute;

        (posAttr.array as Float32Array).set(tgtPosAttr.array as Float32Array);
        (colAttr.array as Float32Array).set(tgtColAttr.array as Float32Array);
        (salAttr.array as Float32Array).set(tgtSalAttr.array as Float32Array);
        (depAttr.array as Float32Array).set(tgtDepAttr.array as Float32Array);

        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        salAttr.needsUpdate = true;
        depAttr.needsUpdate = true;

        this.material.uniforms.uMorphProgress.value = 0.0;
        this.isMorphing = false;
      }
    }

    // Decay draw impulse
    if (this.impulseStrength > 0.001) {
      this.impulseStrength *= 0.94;
      this.material.uniforms.uImpulseStrength.value = this.impulseStrength;
    } else if (this.impulseStrength !== 0.0) {
      this.impulseStrength = 0.0;
      this.material.uniforms.uImpulseStrength.value = 0.0;
    }

    // Travel camera dolly motion
    const target = this.settings.mode === 'TRAVEL' ? 1 : 0;
    this.travelBlend += (target - this.travelBlend) * (1 - Math.exp(-dt * 2.0));
    const dolly = 0.5 * (1 - Math.cos(tSec * 0.3)) * 1.5 * this.travelBlend;

    this.updateCamera(dt, tSec, dolly);
    this.material.uniforms.uZoom.value = this.view.zoom;
    this.material.uniforms.uIntensity.value = this.settings.intensity;

    // Render WebGL
    this.renderer.render(this.scene, this.camera);

    // Combined view-projection matrix for overlay projection
    const vpm = new THREE.Matrix4().multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );
    const viewProjElements = new Float32Array(vpm.elements);

    // Motion parameters for CPU tracker displacement
    const dispParams: TrackerDisplacementParams = {
      time: tSec,
      depthScale: this.settings.depthScale,
      noiseSpeed: this.settings.noiseSpeed,
      noiseFrequency: this.settings.noiseFrequency,
      noiseStrength: this.settings.noiseStrength,
      splashStrength: this.settings.splashStrength,
      mode: this.settings.mode,
      prevMode: this.prevMode,
      modeTransition: this.material.uniforms.uModeTransition.value,
      pointerPos: [this.pointerWorld.x, this.pointerWorld.y],
      pointerDown: this.pointerState.isDown,
      pointerVelocity: [this.pointerState.vx, this.pointerState.vy],
      pointerRadius: 0.5,
      orientation: [this.orientation.x, this.orientation.y],
      impulseCenter: [this.impulseCenter.x, this.impulseCenter.y],
      impulseStrength: this.impulseStrength,
      driftAxis: [axis.x, axis.y],
      driftOrigin: origin,
      driftFeather: this.drift.feather,
    };

    // Transform salient tracker points with mode displacement to normalized [0..1] canvas coordinates
    // Suppress trackers in TRAVEL mode or when non-DEPTH travel dolly is blending/active
    const hideTrackers =
      this.settings.mode === 'TRAVEL' ||
      (this.settings.mode !== 'DEPTH' && this.travelBlend > 0.05);
    const computedTrackers: TrackerPoint[] = [];

    if (!hideTrackers) {
      const numTrackers = this.baseTrackers.length;

      for (let i = 0; i < numTrackers; i++) {
        const trk = this.baseTrackers[i];
        const seed = trk.seed ?? ((trk.id * 0.1337 + 0.1) % 1.0);
        const sal = trk.salience ?? trk.intensity;

        // Displaced 3D world position matching particle vertex shader
        const [wx, wy, wz] = computeTrackerWorldPosition(
          trk.baseX,
          trk.baseY,
          trk.rawDepth,
          seed,
          sal,
          dispParams
        );

        this.tempVec.set(wx, wy, wz);
        this.tempVec.project(this.camera);

        // Filter out points behind camera (Three.js NDC z > 1.0)
        if (this.tempVec.z > 1.0) continue;

        // Normalized screen coordinates
        const screenX = (this.tempVec.x + 1.0) * 0.5;
        const screenY = (1.0 - this.tempVec.y) * 0.5;

        // Filter out points out of frustum [-0.15, 1.15]
        if (screenX < -0.15 || screenX > 1.15 || screenY < -0.15 || screenY > 1.15) {
          continue;
        }

        // Real normalized monocular depth [0.0..1.0] (1.0 = near, 0.0 = far)
        const screenZ = trk.rawDepth;

        computedTrackers.push({
          id: trk.id,
          x: screenX,
          y: screenY,
          z: screenZ,
          intensity: trk.intensity,
          label: trk.label,
          baseX: trk.baseX,
          baseY: trk.baseY,
          baseZ: trk.baseZ,
          rawDepth: trk.rawDepth,
          seed,
          salience: sal,
        });
      }
    }

    // Drift bar projection in DRIFT mode (canvas CSS pixels)
    let driftBar: DriftBar | undefined = undefined;
    if (this.settings.mode === 'DRIFT') {
      // centre c = axis * origin (world)
      const cx = axis.x * origin;
      const cy = axis.y * origin;
      // perpendicular n = (-axis.y, axis.x)
      const nx = -axis.y;
      const ny = axis.x;
      const perpHalf = 0.5 * (Math.abs(axis.y) * this.imageAspect + Math.abs(axis.x)) + 0.06;
      const worldAx = cx + nx * perpHalf;
      const worldAy = cy + ny * perpHalf;
      const worldBx = cx - nx * perpHalf;
      const worldBy = cy - ny * perpHalf;

      // Project world points through camera (z = 0)
      this.tempVec.set(worldAx, worldAy, 0).project(this.camera);
      const scrAx = (this.tempVec.x + 1.0) * 0.5 * this.width;
      const scrAy = (1.0 - this.tempVec.y) * 0.5 * this.height;

      this.tempVec.set(worldBx, worldBy, 0).project(this.camera);
      const scrBx = (this.tempVec.x + 1.0) * 0.5 * this.width;
      const scrBy = (1.0 - this.tempVec.y) * 0.5 * this.height;

      this.tempVec.set(cx, cy, 0).project(this.camera);
      const handleX = (this.tempVec.x + 1.0) * 0.5 * this.width;
      const handleY = (1.0 - this.tempVec.y) * 0.5 * this.height;

      this.tempVec.set(cx + axis.x * 0.1, cy + axis.y * 0.1, 0).project(this.camera);
      const tgtX = (this.tempVec.x + 1.0) * 0.5 * this.width;
      const tgtY = (1.0 - this.tempVec.y) * 0.5 * this.height;

      const dDirX = tgtX - handleX;
      const dDirY = tgtY - handleY;
      const lenDir = Math.hypot(dDirX, dDirY);
      const dir = lenDir > 1e-6 ? { x: dDirX / lenDir, y: dDirY / lenDir } : { x: 1, y: 0 };

      const isHovered =
        this.distToSegment(this.pointerState.x, this.pointerState.y, scrAx, scrAy, scrBx, scrBy) <= 14;

      driftBar = {
        a: { x: scrAx, y: scrAy },
        b: { x: scrBx, y: scrBy },
        handle: { x: handleX, y: handleY },
        dir,
        hovered: isHovered,
        dragging: this.isDriftDragging,
      };
      this.currentDriftBar = driftBar;
    } else {
      this.currentDriftBar = null;
    }

    this.latestRenderState = {
      time: tSec,
      deltaTime: dt,
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      fps,
      particleCount: effectiveParticleCount,
      activeMode: this.settings.mode,
      colorMode: this.settings.colorMode,
      overlays: {
        ...this.settings.overlays,
        active: { ...this.settings.overlays.active },
      },
      pointer: { ...this.pointerState },
      zoom: this.view.zoom,
      panX: this.view.panX,
      panY: this.view.panY,
      yaw: this.view.yaw,
      pitch: this.view.pitch,
      viewMatrix: new Float32Array(this.camera.matrixWorldInverse.elements),
      projectionMatrix: new Float32Array(this.camera.projectionMatrix.elements),
      viewProjectionMatrix: viewProjElements,
      cameraPosition: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      imageAspect: this.imageAspect,
      trackers: computedTrackers,
      depthScale: this.settings.depthScale,
      noiseSpeed: this.settings.noiseSpeed,
      noiseFrequency: this.settings.noiseFrequency,
      noiseStrength: this.settings.noiseStrength,
      splashStrength: this.settings.splashStrength,
      orientation: [this.orientation.x, this.orientation.y],
      pointerWorld: [this.pointerWorld.x, this.pointerWorld.y],
      pointerRadius: 0.5,
      impulseCenter: [this.impulseCenter.x, this.impulseCenter.y],
      impulseStrength: this.impulseStrength,
      prevMode: this.prevMode,
      modeTransition: this.material.uniforms.uModeTransition.value,
      drift: { pos: this.drift.pos, angleDeg: this.drift.angleDeg, feather: this.drift.feather },
      driftBar,
    };

    return this.latestRenderState;
  }

  public getRenderState(): EngineRenderState {
    if (this.latestRenderState) {
      if (
        this.settings.mode === 'TRAVEL' ||
        (this.settings.mode !== 'DEPTH' && this.travelBlend > 0.05)
      ) {
        return {
          ...this.latestRenderState,
          trackers: [],
        };
      }
      return this.latestRenderState;
    }
    return this.render();
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
    this.scene.clear();
  }
}
