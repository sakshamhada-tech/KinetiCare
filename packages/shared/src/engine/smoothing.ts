/**
 * Per-landmark, per-coordinate One-Euro smoothing.
 *
 * Wraps one OneEuroFilter per (landmark index, coordinate) so a landmark frame
 * is smoothed deterministically. Missing (not visible) landmarks pass through.
 */

import { OneEuroFilter } from './one-euro';
import type { OneEuroFilterConfig } from './one-euro';
import type { LandmarkFrame } from './types';

export type SmootherConfig = OneEuroFilterConfig;

function coordKey(landmarkIndex: number, coord: 'x' | 'y' | 'z'): string {
  return `${landmarkIndex}:${coord}`;
}

export class LandmarkSmoother {
  private filters = new Map<string, OneEuroFilter>();

  constructor(private config: SmootherConfig = {}) {}

  /** Return a new frame with smoothed coordinates. Input frame is not mutated. */
  smooth(frame: LandmarkFrame): LandmarkFrame {
    const { timestampMs, landmarks } = frame;
    const smoothed = landmarks.map((lm) => {
      const fx = this.getFilter(coordKey(lm.index, 'x')).filter(lm.x, timestampMs);
      const fy = this.getFilter(coordKey(lm.index, 'y')).filter(lm.y, timestampMs);
      const fz = this.getFilter(coordKey(lm.index, 'z')).filter(lm.z, timestampMs);
      return { ...lm, x: fx, y: fy, z: fz };
    });
    return { timestampMs, landmarks: smoothed };
  }

  /** Reset all filters (e.g. when a new session starts). */
  reset(): void {
    this.filters.clear();
  }

  private getFilter(key: string): OneEuroFilter {
    let f = this.filters.get(key);
    if (!f) {
      f = new OneEuroFilter(this.config);
      this.filters.set(key, f);
    }
    return f;
  }
}
