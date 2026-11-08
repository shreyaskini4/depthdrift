import * as THREE from 'three';
import type { ModeName, ColorMode, ParticleSettings } from '../types';
import {
  MODE_INDICES,
  COLOR_MODE_INDICES,
  type CameraPose,
  type TransitionState,
  type MotionInteractionState,
  type ModeUniforms,
  type ModeManagerOptions,
} from './types';
import {
  createDefaultCameraPose,
  calculateDriftCameraPose,
  calculateSplashCameraPose,
  calculateGatherCameraPose,
  calculateDepthParallaxPose,
  calculateTravelCameraPose,
  calculateSwarmCameraPose,
  calculateMeltCameraPose,
  blendCameraPoses,
} from './cameraBehaviors';

/**
 * ModeManager (also MotionController)
 * High-performance state controller managing mode lifecycles, cross-mode transitions,
 * smoothed user interaction (mouse/touch/gyro), camera poses, and shader uniforms.
 *
 * Guarantees ZERO allocations in the update and render loops.
 */
export class ModeManager {
  private currentMode: ModeName = 'DRIFT';
  private previousMode: ModeName = 'DRIFT';
  private colorMode: ColorMode = 'TRUE';

  // Transition state
  private transitionDuration: number = 0.8; // seconds
  private transitionElapsed: number = 0.8; // seconds
  private transitionProgress: number = 1.0; // 0..1 (eased)
  private isCurrentlyTransitioning: boolean = false;

  // Interaction state
  private readonly interaction: MotionInteractionState;
  private readonly pointerSmoothing: number;
  private readonly gyroSensitivity: number;

  // Animation cycle variables
  private totalTime: number = 0;
  private travelProgress: number = 0;
  private travelSpeed: number = 0.15;
  private gatherProgress: number = 1.0;
  private meltProgress: number = 0;
  private splashDuration: number = 2.5; // seconds before splash resets

  // Configurable particle parameters
  private depthScale: number = 1.0;
  private noiseSpeed: number = 0.6;
  private noiseFrequency: number = 1.2;
  private noiseStrength: number = 0.8;
  private splashStrength: number = 1.5;

  // Pre-allocated Camera Poses for zero-allocation updates
  private readonly posePrev: CameraPose = createDefaultCameraPose();
  private readonly poseCurr: CameraPose = createDefaultCameraPose();
  private readonly poseBlended: CameraPose = createDefaultCameraPose();

  // Pre-allocated temporary vectors
  private readonly _tempVec2A = new THREE.Vector2();
  private readonly _tempVec2B = new THREE.Vector2();

  // Uniform dictionary for Three.js ShaderMaterial
  public readonly uniforms: ModeUniforms;

  constructor(options: ModeManagerOptions = {}) {
    this.currentMode = options.initialMode ?? 'DRIFT';
    this.previousMode = this.currentMode;
    this.colorMode = options.initialColorMode ?? 'TRUE';
    this.transitionDuration = (options.transitionDurationMs ?? 800) / 1000.0;
    this.transitionElapsed = this.transitionDuration;
    this.transitionProgress = 1.0;
    this.pointerSmoothing = options.pointerSmoothing ?? 0.15;
    this.gyroSensitivity = options.gyroSensitivity ?? 0.8;

    this.interaction = {
      pointer: new THREE.Vector2(0, 0),
      targetPointer: new THREE.Vector2(0, 0),
      pointerDown: false,
      pointerVelocity: new THREE.Vector2(0, 0),
      pitch: 0,
      roll: 0,
      splashTime: 99.0, // inactive initial state
      splashOrigin: new THREE.Vector2(0, 0),
    };

    // Initialize uniforms dictionary with persistent Three.js objects
    this.uniforms = {
      uTime: { value: 0 },
      uDeltaTime: { value: 0.016 },
      uCurrentMode: { value: MODE_INDICES[this.currentMode] },
      uPrevMode: { value: MODE_INDICES[this.previousMode] },
      uTransition: { value: 1.0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uPointerDown: { value: 0.0 },
      uPointerVelocity: { value: new THREE.Vector2(0, 0) },
      uSplashStrength: { value: this.splashStrength },
      uSplashTime: { value: 99.0 },
      uSplashOrigin: { value: new THREE.Vector2(0, 0) },
      uDepthScale: { value: this.depthScale },
      uNoiseSpeed: { value: this.noiseSpeed },
      uNoiseFrequency: { value: this.noiseFrequency },
      uNoiseStrength: { value: this.noiseStrength },
      uParallaxOffset: { value: new THREE.Vector2(0, 0) },
      uTravelProgress: { value: 0 },
      uTravelSpeed: { value: this.travelSpeed },
      uGatherProgress: { value: 1.0 },
      uMeltProgress: { value: 0.0 },
      uColorMode: { value: COLOR_MODE_INDICES[this.colorMode] },
    };
  }

  /**
   * Switches to a new motion mode with seamless smooth transition
   * @param nextMode Target ModeName
   * @param durationMs Transition duration in milliseconds (e.g. 600 - 1200ms)
   */
  public setMode(nextMode: ModeName, durationMs?: number): void {
    if (nextMode === this.currentMode && !this.isCurrentlyTransitioning) {
      return;
    }

    if (durationMs !== undefined && durationMs > 0) {
      this.transitionDuration = durationMs / 1000.0;
    }

    this.previousMode = this.currentMode;
    this.currentMode = nextMode;
    this.transitionElapsed = 0;
    this.transitionProgress = 0;
    this.isCurrentlyTransitioning = true;

    // Mode-specific initialization resets
    if (nextMode === 'GATHER') {
      this.gatherProgress = 0;
    } else if (nextMode === 'MELT') {
      this.meltProgress = 0;
    } else if (nextMode === 'SPLASH') {
      // Auto-trigger a gentle splash at center if none occurred
      if (this.interaction.splashTime > 1.0) {
        this.triggerSplash(this.interaction.pointer.x, this.interaction.pointer.y);
      }
    }
  }

  /**
   * Sets color palette rendering mode
   */
  public setColorMode(colorMode: ColorMode): void {
    this.colorMode = colorMode;
    this.uniforms.uColorMode.value = COLOR_MODE_INDICES[colorMode];
  }

  public getColorMode(): ColorMode {
    return this.colorMode;
  }

  public getMode(): ModeName {
    return this.currentMode;
  }

  public getPreviousMode(): ModeName {
    return this.previousMode;
  }

  public isTransitioning(): boolean {
    return this.isCurrentlyTransitioning;
  }

  public getTransitionProgress(): number {
    return this.transitionProgress;
  }

  public getTransitionState(): TransitionState {
    const raw =
      this.transitionDuration > 0
        ? Math.min(1.0, this.transitionElapsed / this.transitionDuration)
        : 1.0;
    return {
      fromMode: this.previousMode,
      toMode: this.currentMode,
      progress: this.transitionProgress,
      rawProgress: raw,
      duration: this.transitionDuration,
      elapsed: this.transitionElapsed,
      isTransitioning: this.isCurrentlyTransitioning,
    };
  }

  /**
   * Updates pointer position and interaction state
   * @param normX Normalized X [-1..1]
   * @param normY Normalized Y [-1..1]
   * @param isDown Mouse button / touch active
   */
  public setPointer(normX: number, normY: number, isDown: boolean): void {
    this.interaction.targetPointer.set(normX, normY);
    this.interaction.pointerDown = isDown;

    if (isDown && (this.currentMode === 'SPLASH' || this.previousMode === 'SPLASH')) {
      this.triggerSplash(normX, normY);
    }
  }

  /**
   * Sets device orientation in radians (e.g. from DeviceOrientationEvent)
   * @param pitch Pitch angle in radians
   * @param roll Roll angle in radians
   */
  public setOrientation(pitch: number, roll: number): void {
    this.interaction.pitch = pitch * this.gyroSensitivity;
    this.interaction.roll = roll * this.gyroSensitivity;
  }

  /**
   * Triggers a radial splash impulse at specified normalized coordinates
   */
  public triggerSplash(
    normX: number = this.interaction.pointer.x,
    normY: number = this.interaction.pointer.y,
    strength?: number
  ): void {
    this.interaction.splashTime = 0.0;
    this.interaction.splashOrigin.set(normX, normY);
    if (strength !== undefined) {
      this.splashStrength = strength;
    }
  }

  /**
   * Syncs configuration parameters from ParticleSettings
   */
  public syncSettings(settings: Partial<ParticleSettings>): void {
    if (settings.mode !== undefined && settings.mode !== this.currentMode) {
      this.setMode(settings.mode);
    }
    if (settings.colorMode !== undefined && settings.colorMode !== this.colorMode) {
      this.setColorMode(settings.colorMode);
    }
    if (settings.depthScale !== undefined) {
      this.depthScale = settings.depthScale;
    }
    if (settings.noiseSpeed !== undefined) {
      this.noiseSpeed = settings.noiseSpeed;
    }
    if (settings.noiseFrequency !== undefined) {
      this.noiseFrequency = settings.noiseFrequency;
    }
    if (settings.noiseStrength !== undefined) {
      this.noiseStrength = settings.noiseStrength;
    }
    if (settings.splashStrength !== undefined) {
      this.splashStrength = settings.splashStrength;
    }
  }

  /**
   * Main per-frame update tick
   * @param deltaTime Elapsed frame time in seconds
   * @param settings Optional settings update
   */
  public update(deltaTime: number, settings?: Partial<ParticleSettings>): void {
    // Clamp delta time to avoid large jumps on background tab resume
    const dt = Math.min(deltaTime, 0.1);
    this.totalTime += dt;

    if (settings) {
      this.syncSettings(settings);
    }

    // 1. Advance mode transition progress
    if (this.isCurrentlyTransitioning) {
      this.transitionElapsed += dt;
      const rawProgress = Math.min(1.0, this.transitionElapsed / this.transitionDuration);
      // Cubic smoothstep easing: 3t^2 - 2t^3
      this.transitionProgress = rawProgress * rawProgress * (3 - 2 * rawProgress);

      if (rawProgress >= 1.0) {
        this.transitionProgress = 1.0;
        this.isCurrentlyTransitioning = false;
        this.previousMode = this.currentMode;
      }
    } else {
      this.transitionProgress = 1.0;
    }

    // 2. Smooth pointer position and compute velocity
    this._tempVec2A.copy(this.interaction.pointer);
    this.interaction.pointer.lerp(this.interaction.targetPointer, this.pointerSmoothing);

    if (dt > 0.0001) {
      this.interaction.pointerVelocity
        .subVectors(this.interaction.pointer, this._tempVec2A)
        .divideScalar(dt);
    }

    // 3. Advance splash timer
    if (this.interaction.splashTime < this.splashDuration) {
      this.interaction.splashTime += dt;
    }

    // 4. Advance TRAVEL mode progress
    this.travelProgress += dt * this.travelSpeed;

    // 5. Advance GATHER progress
    if (this.currentMode === 'GATHER' || this.previousMode === 'GATHER') {
      if (this.gatherProgress < 1.0) {
        this.gatherProgress = Math.min(1.0, this.gatherProgress + dt * 0.85);
      }
    }

    // 6. Advance MELT progress
    if (this.currentMode === 'MELT' || this.previousMode === 'MELT') {
      if (this.meltProgress < 1.0) {
        this.meltProgress = Math.min(1.0, this.meltProgress + dt * 0.45);
      }
    }

    // 7. Compute Parallax offset combining pointer and gyro
    this._tempVec2B.set(
      this.interaction.pointer.x * 0.5 + this.interaction.roll * 0.5,
      this.interaction.pointer.y * 0.5 + this.interaction.pitch * 0.5
    );

    // 8. Update Shader Uniforms in-place
    this.uniforms.uTime.value = this.totalTime;
    this.uniforms.uDeltaTime.value = dt;
    this.uniforms.uCurrentMode.value = MODE_INDICES[this.currentMode];
    this.uniforms.uPrevMode.value = MODE_INDICES[this.previousMode];
    this.uniforms.uTransition.value = this.transitionProgress;
    this.uniforms.uPointer.value.copy(this.interaction.pointer);
    this.uniforms.uPointerDown.value = this.interaction.pointerDown ? 1.0 : 0.0;
    this.uniforms.uPointerVelocity.value.copy(this.interaction.pointerVelocity);
    this.uniforms.uSplashStrength.value = this.splashStrength;
    this.uniforms.uSplashTime.value = this.interaction.splashTime;
    this.uniforms.uSplashOrigin.value.copy(this.interaction.splashOrigin);
    this.uniforms.uDepthScale.value = this.depthScale;
    this.uniforms.uNoiseSpeed.value = this.noiseSpeed;
    this.uniforms.uNoiseFrequency.value = this.noiseFrequency;
    this.uniforms.uNoiseStrength.value = this.noiseStrength;
    this.uniforms.uParallaxOffset.value.copy(this._tempVec2B);
    this.uniforms.uTravelProgress.value = this.travelProgress;
    this.uniforms.uTravelSpeed.value = this.travelSpeed;
    this.uniforms.uGatherProgress.value = this.gatherProgress;
    this.uniforms.uMeltProgress.value = this.meltProgress;
    this.uniforms.uColorMode.value = COLOR_MODE_INDICES[this.colorMode];
  }

  /**
   * Evaluates camera pose for a given mode into outPose
   */
  private evaluateCameraPoseForMode(mode: ModeName, outPose: CameraPose): CameraPose {
    switch (mode) {
      case 'DRIFT':
        return calculateDriftCameraPose(this.totalTime, outPose);
      case 'SPLASH':
        return calculateSplashCameraPose(
          this.interaction.splashTime,
          this.splashStrength,
          outPose
        );
      case 'GATHER':
        return calculateGatherCameraPose(this.gatherProgress, outPose);
      case 'DEPTH':
        return calculateDepthParallaxPose(
          this._tempVec2B,
          this.interaction.pitch,
          this.interaction.roll,
          this.depthScale,
          outPose
        );
      case 'TRAVEL':
        return calculateTravelCameraPose(this.totalTime, this.travelProgress, outPose);
      case 'SWARM':
        return calculateSwarmCameraPose(this.totalTime, outPose);
      case 'MELT':
        return calculateMeltCameraPose(this.totalTime, this.meltProgress, outPose);
      default:
        return calculateDriftCameraPose(this.totalTime, outPose);
    }
  }

  /**
   * Computes the current active camera pose, interpolating between modes during transitions
   */
  public getCameraPose(): CameraPose {
    if (this.transitionProgress >= 0.999 || this.previousMode === this.currentMode) {
      return this.evaluateCameraPoseForMode(this.currentMode, this.poseBlended);
    }

    this.evaluateCameraPoseForMode(this.previousMode, this.posePrev);
    this.evaluateCameraPoseForMode(this.currentMode, this.poseCurr);
    return blendCameraPoses(
      this.posePrev,
      this.poseCurr,
      this.transitionProgress,
      this.poseBlended
    );
  }

  /**
   * Updates a Three.js PerspectiveCamera with current mode behaviors and transitions
   */
  public updateCamera(camera: THREE.PerspectiveCamera, _deltaTime?: number): void {
    const pose = this.getCameraPose();

    camera.position.copy(pose.position);
    camera.up.copy(pose.up);
    camera.lookAt(pose.target);

    if (Math.abs(camera.fov - pose.fov) > 0.01) {
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
  }

  /**
   * Returns uniforms object for shader material integration
   */
  public getUniforms(): ModeUniforms {
    return this.uniforms;
  }

  /**
   * Reset state
   */
  public reset(): void {
    this.travelProgress = 0;
    this.gatherProgress = 1.0;
    this.meltProgress = 0;
    this.interaction.splashTime = 99.0;
    this.transitionElapsed = this.transitionDuration;
    this.transitionProgress = 1.0;
    this.isCurrentlyTransitioning = false;
  }

  public dispose(): void {
    // Clean up if needed
  }
}

/** Alias for MotionController matching naming convention */
export const MotionController = ModeManager;
