/**
 * replay-pose-source.ts
 *
 * Browser-only PoseSource that replays recorded landmark JSON fixtures.
 * Useful for offline testing, demos, and CI without a camera or model download.
 *
 * Framework-free. Consumed through the PoseSource interface from
 * packages/shared.
 */

import type { Landmark } from '@kineticare/shared';
import type { PoseResult, PoseSource, PoseSourceConfig } from '@kineticare/shared';

export interface ReplayFrame {
  timestampMs: number;
  landmarks: Landmark[];
}

export interface ReplayPoseSourceConfig extends PoseSourceConfig {
  /** Array of frames to replay, sorted by timestampMs ascending. */
  frames: ReplayFrame[];
  /** If true, loop the fixture when it reaches the end. Default false. */
  loop?: boolean;
  /** Playback speed multiplier. 1.0 = real time. Default 1.0. */
  speed?: number;
}

/**
 * ReplayPoseSource — emits PoseResult events from a recorded fixture at the
 * recorded timestamps (optionally sped up and looped).
 */
export class ReplayPoseSource implements PoseSource {
  private config: ReplayPoseSourceConfig;
  private callbacks: Set<(result: PoseResult) => void> = new Set();
  private active = false;
  private animationFrameId: number | null = null;
  private startTimeMs = 0;
  private frameIndex = 0;

  constructor(config: ReplayPoseSourceConfig) {
    if (!config.frames || config.frames.length === 0) {
      throw new Error('ReplayPoseSource requires a non-empty frames array');
    }

    // Sort frames by timestamp to guarantee monotonic playback.
    const sorted = [...config.frames].sort((a, b) => a.timestampMs - b.timestampMs);

    this.config = {
      minLandmarkConfidence: 0.5,
      requireAllLandmarks: false,
      loop: false,
      speed: 1.0,
      ...config,
      frames: sorted,
    };
  }

  isActive(): boolean {
    return this.active;
  }

  onResult(callback: (result: PoseResult) => void): void {
    this.callbacks.add(callback);
  }

  offResult(callback: (result: PoseResult) => void): void {
    this.callbacks.delete(callback);
  }

  private emit(result: PoseResult): void {
    for (const cb of this.callbacks) {
      try {
        cb(result);
      } catch {
        // Swallow callback errors.
      }
    }
  }

  async start(): Promise<void> {
    if (this.active) {
      return;
    }
    this.active = true;
    this.startTimeMs = performance.now();
    this.frameIndex = 0;
    this.scheduleNext();
  }

  async stop(): Promise<void> {
    if (!this.active) {
      return;
    }
    this.active = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private scheduleNext(): void {
    if (!this.active) {
      return;
    }

    const now = performance.now();
    const speed = this.config.speed ?? 1.0;
    const elapsedMs = (now - this.startTimeMs) * speed;

    // Find all frames due for emission at this elapsed time.
    while (this.frameIndex < this.config.frames.length) {
      const frame = this.config.frames[this.frameIndex];
      if (!frame) break;
      if (frame.timestampMs > elapsedMs) break;
      this.emit({
        landmarks: [...frame.landmarks],
        timestampMs: frame.timestampMs,
      });
      this.frameIndex += 1;
    }

    if (this.frameIndex >= this.config.frames.length) {
      if (this.config.loop) {
        const lastFrame = this.config.frames[this.config.frames.length - 1];
        const lastTs = lastFrame ? lastFrame.timestampMs : 0;
        this.startTimeMs = performance.now() - (elapsedMs % (lastTs || 1));
        this.frameIndex = 0;
      } else {
        this.active = false;
        return;
      }
    }

    this.animationFrameId = requestAnimationFrame(() => this.scheduleNext());
  }
}
