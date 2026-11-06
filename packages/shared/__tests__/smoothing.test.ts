import { describe, expect, it } from 'vitest';
import { LandmarkSmoother } from '../src/engine/smoothing';

const frame = {
  timestampMs: 0,
  landmarks: [
    { index: 0, x: 0, y: 0, z: 0, visibility: 1 },
    { index: 1, x: 1, y: 2, z: 3, visibility: 1 },
  ],
};

describe('LandmarkSmoother', () => {
  it('smoothes coordinates without mutating input', () => {
    const smoother = new LandmarkSmoother();
    const out = smoother.smooth(frame);
    expect(out).not.toBe(frame);
    expect(out.landmarks[0].x).toBeCloseTo(0);
    expect(out.landmarks[1].y).toBeCloseTo(2);
    // input untouched
    expect(frame.landmarks[1].y).toBe(2);
  });

  it('first sample passes values through', () => {
    const smoother = new LandmarkSmoother({ freq: 30 });
    const out = smoother.smooth({ ...frame, timestampMs: 100 });
    expect(out.landmarks[1].x).toBeCloseTo(1);
  });

  it('subsequent samples smooth toward previous', () => {
    const smoother = new LandmarkSmoother({ freq: 30, minCutoff: 1 });
    smoother.smooth({ ...frame, timestampMs: 0 });
    const second = smoother.smooth({
      ...frame,
      timestampMs: 33,
      landmarks: frame.landmarks.map((lm) => (lm.index === 1 ? { ...lm, x: 10 } : lm)),
    });
    const smoothed = second.landmarks.find((lm) => lm.index === 1);
    expect(smoothed).toBeDefined();
    expect(smoothed!.x).toBeLessThan(10);
    expect(smoothed!.x).toBeGreaterThan(1);
  });

  it('reset clears filters', () => {
    const smoother = new LandmarkSmoother();
    smoother.smooth(frame);
    smoother.reset();
    const out = smoother.smooth({ ...frame, timestampMs: 500 });
    expect(out.landmarks[1].x).toBeCloseTo(1);
  });

  it('passes through missing (not visible) landmarks', () => {
    const smoother = new LandmarkSmoother();
    const out = smoother.smooth({
      ...frame,
      landmarks: [{ index: 9, x: 5, y: 5, z: 5, visibility: 0 }],
    });
    expect(out.landmarks[0].x).toBe(5);
  });
});
