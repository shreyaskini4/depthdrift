/**
 * Adaptive FPS Regulator for Drift Particle Engine
 * Monitors frame times and adjusts particle draw count to maintain 60 FPS.
 */

export class FPSRegulator {
  private frameTimes: number[] = [];
  private readonly maxSamples: number = 60;
  private currentFPS: number = 60;
  private lowFPSTime: number = 0; // Cumulative seconds below 50 FPS
  private highFPSTime: number = 0; // Cumulative seconds above 58 FPS
  private readonly minParticles: number = 50_000;
  private readonly maxParticles: number = 600_000;
  private targetParticles: number = 450_000;
  private currentParticles: number = 450_000;
  private enabled: boolean = true;

  constructor(targetParticles: number = 450_000, enabled: boolean = true) {
    this.targetParticles = Math.max(this.minParticles, Math.min(targetParticles, this.maxParticles));
    this.currentParticles = this.targetParticles;
    this.enabled = enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.currentParticles = this.targetParticles;
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setTargetCount(count: number): void {
    this.targetParticles = Math.max(this.minParticles, Math.min(count, this.maxParticles));
    if (!this.enabled || this.currentParticles > this.targetParticles) {
      this.currentParticles = this.targetParticles;
    }
  }

  public getTargetCount(): number {
    return this.targetParticles;
  }

  public update(deltaTimeSec: number): { fps: number; effectiveParticleCount: number } {
    const dt = Math.max(0.001, Math.min(deltaTimeSec, 0.2));
    const instantFPS = 1.0 / dt;

    this.frameTimes.push(instantFPS);
    if (this.frameTimes.length > this.maxSamples) {
      this.frameTimes.shift();
    }

    const sum = this.frameTimes.reduce((acc, val) => acc + val, 0);
    this.currentFPS = Math.round((sum / this.frameTimes.length) * 10) / 10;

    if (this.enabled) {
      if (this.currentFPS < 50.0) {
        this.lowFPSTime += dt;
        this.highFPSTime = 0;

        // If below 50fps for 2.5 seconds, reduce particle count by 15%
        if (this.lowFPSTime >= 2.5) {
          const reduced = Math.max(this.minParticles, Math.floor(this.currentParticles * 0.85));
          this.currentParticles = reduced;
          this.lowFPSTime = 0;
        }
      } else if (this.currentFPS >= 58.0) {
        this.highFPSTime += dt;
        this.lowFPSTime = 0;

        // If above 58fps for 5 seconds and below configured target, recover gradually
        if (this.highFPSTime >= 5.0 && this.currentParticles < this.targetParticles) {
          const recovered = Math.min(this.targetParticles, this.currentParticles + 10_000);
          this.currentParticles = recovered;
          this.highFPSTime = 0;
        }
      } else {
        this.lowFPSTime = 0;
        this.highFPSTime = 0;
      }
    } else {
      this.currentParticles = this.targetParticles;
    }

    return {
      fps: this.currentFPS,
      effectiveParticleCount: this.currentParticles,
    };
  }

  public getFPS(): number {
    return this.currentFPS;
  }

  public getEffectiveParticleCount(): number {
    return this.currentParticles;
  }

  public reset(): void {
    this.frameTimes = [];
    this.currentFPS = 60;
    this.lowFPSTime = 0;
    this.highFPSTime = 0;
    this.currentParticles = this.targetParticles;
  }
}
