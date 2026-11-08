/**
 * ThreeParticleEngine - 3D WebGL Particle Engine for Drift
 * Implements the ParticleEngine interface using Three.js and custom GLSL shaders.
 */

import * as THREE from 'three';
import type {
  ColorMode,
  DepthResult,
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
} from './sampling';
import { PARTICLE_FRAGMENT_SHADER, PARTICLE_VERTEX_SHADER } from './shaders';

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

  // Render timing & caching
  private lastTime: number = 0;
  private latestRenderState: EngineRenderState | null = null;
  private tempVec = new THREE.Vector3();

  constructor(canvas?: HTMLCanvasElement, initialSettings?: Partial<ParticleSettings>) {
    this.canvas = canvas ?? document.createElement('canvas');

    const isDebug =
      (typeof window !== 'undefined' && window.location.search.includes('debug')) ||
      !!initialSettings?.debug;

    // Default settings
    this.settings = {
      particleCount: initialSettings?.particleCount ?? 120_000,
      pointSize: initialSettings?.pointSize ?? 2.0,
      depthScale: initialSettings?.depthScale ?? 1.0,
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
    this.dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2.0);

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
    this.camera.position.set(0, 0, 2.0);
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
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
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
        uPointer: { value: new THREE.Vector3(0, 0, 0) },
        uPointerVelocity: { value: new THREE.Vector2(0, 0) },
        uPointerRadius: { value: 0.5 },
        uOrientation: { value: new THREE.Vector2(0, 0) },
        uPixelRatio: { value: this.dpr },
        uMorphProgress: { value: 0.0 },
        uImpulseCenter: { value: new THREE.Vector2(0, 0) },
        uImpulseStrength: { value: 0.0 },
        uDebug: { value: isDebug ? 1 : 0 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending:
        this.settings.colorMode === 'ON_WHITE' ? THREE.NormalBlending : THREE.AdditiveBlending,
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

  private updateClearColor(colorMode: ColorMode): void {
    if (colorMode === 'ON_WHITE') {
      this.renderer.setClearColor(0xfcfcfd, 1.0);
      this.material.blending = THREE.NormalBlending;
    } else {
      this.renderer.setClearColor(0x050506, 1.0);
      this.material.blending = THREE.AdditiveBlending;
    }
    this.material.needsUpdate = true;
  }

  private applySampledData(data: SampledParticles, morph: boolean = true): void {
    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const tgtPosAttr = this.geometry.getAttribute('targetPosition') as THREE.BufferAttribute;
    const colAttr = this.geometry.getAttribute('color') as THREE.BufferAttribute;
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

    this.baseTrackers = data.trackers;
    this.geometry.setDrawRange(0, count);
  }

  public setImage(
    pixels: HTMLCanvasElement | ImageBitmap | ImageData,
    depth: DepthResult
  ): void {
    const sampled = sampleImageAndDepth(pixels, depth, MAX_PARTICLE_CAPACITY);
    this.applySampledData(sampled, true);
  }

  public setSettings(settings: Partial<ParticleSettings>): void {
    if (settings.particleCount !== undefined) {
      this.settings.particleCount = settings.particleCount;
      this.fpsRegulator.setTargetCount(settings.particleCount);
      const effectiveCount = this.fpsRegulator.getEffectiveParticleCount();
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

  public setPointer(x: number, y: number, isDown: boolean): void {
    this.pointerState.x = x;
    this.pointerState.y = y;
    this.pointerState.isDown = isDown;

    // Convert screen coordinates to world coordinates on the Z=0 plane
    const ndcX = (x / Math.max(1, this.width)) * 2 - 1;
    const ndcY = -(y / Math.max(1, this.height)) * 2 + 1;

    // Raycast to Z=0 plane
    this.tempVec.set(ndcX, ndcY, 0.5).unproject(this.camera);
    const dir = this.tempVec.sub(this.camera.position).normalize();
    const distance = -this.camera.position.z / dir.z;
    const worldX = this.camera.position.x + dir.x * distance;
    const worldY = this.camera.position.y + dir.y * distance;

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
    const ndcX = (last.x / Math.max(1, this.width)) * 2 - 1;
    const ndcY = -(last.y / Math.max(1, this.height)) * 2 + 1;

    this.tempVec.set(ndcX, ndcY, 0.5).unproject(this.camera);
    const dir = this.tempVec.sub(this.camera.position).normalize();
    const dist = -this.camera.position.z / dir.z;
    const wx = this.camera.position.x + dir.x * dist;
    const wy = this.camera.position.y + dir.y * dist;

    this.impulseCenter.set(wx, wy);
    this.impulseStrength = 1.0;

    this.material.uniforms.uImpulseCenter.value.set(wx, wy);
    this.material.uniforms.uImpulseStrength.value = 1.0;
  }

  public resize(width: number, height: number, dpr?: number): void {
    if (width <= 0 || height <= 0) return;

    const targetDpr = Math.min(
      dpr ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1),
      2.0
    );

    this.width = width;
    this.height = height;
    this.dpr = targetDpr;

    this.renderer.setPixelRatio(targetDpr);
    this.renderer.setSize(width, height, false);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.material.uniforms.uPixelRatio.value = targetDpr;
  }

  public setDebug(debug: boolean): void {
    this.settings.debug = debug;
    this.material.uniforms.uDebug.value = debug ? 1 : 0;
  }

  public render(t: number): EngineRenderState {
    const tSec = t > 1e6 ? t / 1000 : t;
    const dt = this.lastTime > 0 ? Math.max(0.001, Math.min(0.2, tSec - this.lastTime)) : 0.016;
    this.lastTime = tSec;

    // Adaptive FPS regulation
    const { fps, effectiveParticleCount } = this.fpsRegulator.update(dt);
    const drawCount = Math.max(1, Math.min(this.currentDataCount, effectiveParticleCount));
    this.geometry.setDrawRange(0, drawCount);

    // Uniform updates
    this.material.uniforms.uTime.value = tSec;

    // Mode transition animation
    const now = performance.now();
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
        const colAttr = this.geometry.getAttribute('color') as THREE.BufferAttribute;
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

    // Subtle interactive camera parallax
    const targetCamX =
      ((this.pointerState.x / Math.max(1, this.width) - 0.5) * 0.15 + this.orientation.y * 0.2);
    const targetCamY =
      (-(this.pointerState.y / Math.max(1, this.height) - 0.5) * 0.15 - this.orientation.x * 0.2);

    this.camera.position.x += (targetCamX - this.camera.position.x) * 0.05;
    this.camera.position.y += (targetCamY - this.camera.position.y) * 0.05;
    this.camera.lookAt(0, 0, 0);

    // Render WebGL
    this.renderer.render(this.scene, this.camera);

    // Transform salient tracker points to normalized [0..1] canvas coordinates
    const computedTrackers: TrackerPoint[] = [];
    const numTrackers = this.baseTrackers.length;

    for (let i = 0; i < numTrackers; i++) {
      const trk = this.baseTrackers[i];
      // World 3D position aligned with extruded particle relief
      this.tempVec.set(trk.baseX, trk.baseY, (trk.rawDepth - 0.5) * this.settings.depthScale);
      this.tempVec.project(this.camera);

      // Filter out points behind camera (Three.js NDC z > 1.0)
      if (this.tempVec.z > 1.0) continue;

      // Normalized screen coordinates
      const screenX = (this.tempVec.x + 1.0) * 0.5;
      const screenY = (1.0 - this.tempVec.y) * 0.5;

      // Filter out points out of frustum [-0.1, 1.1]
      if (screenX < -0.1 || screenX > 1.1 || screenY < -0.1 || screenY > 1.1) {
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
      });
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
      pointer: { ...this.pointerState },
      viewMatrix: new Float32Array(this.camera.matrixWorldInverse.elements),
      projectionMatrix: new Float32Array(this.camera.projectionMatrix.elements),
      cameraPosition: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      trackers: computedTrackers,
    };

    return this.latestRenderState;
  }

  public getRenderState(): EngineRenderState {
    if (this.latestRenderState) {
      return this.latestRenderState;
    }
    return this.render(performance.now() / 1000);
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
    this.scene.clear();
  }
}
