import { describe, expect, it } from 'vitest';
import {
  createSeededRNG,
  generateSquatSequence,
  shoulderExternalRotationFrame,
} from '../src/engine/synthetic';
import { kneeFlexion } from '../src/engine/angles';

describe('seeded RNG', () => {
  it('is deterministic: same seed yields same sequence', () => {
    const a = createSeededRNG(123);
    const b = createSeededRNG(123);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqB).toEqual(seqA);
  });

  it('different seeds yield different sequences', () => {
    const a = createSeededRNG(1);
    const b = createSeededRNG(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqB).not.toEqual(seqA);
  });

  it('gaussian is bounded-ish and deterministic', () => {
    const a = createSeededRNG(5);
    const b = createSeededRNG(5);
    const gaussA = Array.from({ length: 20 }, () => a.gaussian(0, 1));
    const gaussB = Array.from({ length: 20 }, () => b.gaussian(0, 1));
    expect(gaussB).toEqual(gaussA);
  });

  it('seed 0 substitutes the default constant', () => {
    const a = createSeededRNG(0);
    const b = createSeededRNG(0);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(
      Array.from({ length: 5 }, () => b.next())
    );
    // should not degenerate to all zeros
    const seq = Array.from({ length: 20 }, () => a.next());
    expect(new Set(seq).size).toBeGreaterThan(1);
  });

  it('zero noise passes landmarks through unchanged (addNoise early return)', () => {
    const frames = generateSquatSequence({
      reps: 1,
      depthDeg: 100,
      fps: 30,
      repDurationMs: 400,
      noise: 0,
    });
    expect(frames.length).toBeGreaterThan(0);
    // every landmark should be a clean 0..1 value with no NaN
    for (const f of frames) {
      for (const lm of f.landmarks) {
        expect(Number.isFinite(lm.x)).toBe(true);
        expect(Number.isFinite(lm.y)).toBe(true);
        expect(Number.isFinite(lm.z)).toBe(true);
      }
    }
  });
});

describe('generateSquatSequence', () => {
  it('produces 33 landmarks per frame and correct frame count', () => {
    const frames = generateSquatSequence({ reps: 2, depthDeg: 100, fps: 30, repDurationMs: 800 });
    expect(frames.length).toBeGreaterThan(0);
    for (const f of frames) {
      expect(f.landmarks.length).toBe(33);
      expect(f.timestampMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('is deterministic: same options yield identical frames', () => {
    const opts = { reps: 2, depthDeg: 90, fps: 30, seed: 7, noise: 0.01 };
    const a = generateSquatSequence(opts);
    const b = generateSquatSequence(opts);
    expect(b.length).toBe(a.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].timestampMs).toBe(b[i].timestampMs);
      for (const lm of a[i].landmarks) {
        const other = b[i].landmarks.find((x) => x.index === lm.index);
        expect(other).toBeDefined();
        expect(other!.x).toBeCloseTo(lm.x, 6);
        expect(other!.y).toBeCloseTo(lm.y, 6);
      }
    }
  });

  it('reaches approximately the target depth angle at rep bottoms', () => {
    const frames = generateSquatSequence({ reps: 1, depthDeg: 100, fps: 60, repDurationMs: 1000 });
    let minAngle = 180;
    for (const f of frames) {
      const ang = kneeFlexion(f, 'left');
      if (ang !== null && ang < minAngle) minAngle = ang;
    }
    expect(minAngle).toBeCloseTo(100, 5); // within 5 deg of target depth
  });

  it('valgus offset shifts knees inward', () => {
    const a = generateSquatSequence({ reps: 1, depthDeg: 100, fps: 30, valgusOffset: 0 });
    const b = generateSquatSequence({ reps: 1, depthDeg: 100, fps: 30, valgusOffset: 0.2 });
    const fa = a[Math.floor(a.length / 2)].landmarks;
    const fb = b[Math.floor(b.length / 2)].landmarks;
    const lkA = fa.find((l) => l.index === 25)!.x;
    const lkB = fb.find((l) => l.index === 25)!.x;
    const rkA = fa.find((l) => l.index === 26)!.x;
    const rkB = fb.find((l) => l.index === 26)!.x;
    // Left knee (x~0.45) shifts right (toward center); right knee shifts left.
    expect(lkB).toBeGreaterThan(lkA);
    expect(rkB).toBeLessThan(rkA);
  });

  it('asymmetry shifts right knee depth vs left', () => {
    const frames = generateSquatSequence({ reps: 1, depthDeg: 100, fps: 60, asymmetryDeg: 15 });
    let lMin = 180,
      rMin = 180;
    for (const f of frames) {
      const la = kneeFlexion(f, 'left');
      const ra = kneeFlexion(f, 'right');
      if (la !== null && la < lMin) lMin = la;
      if (ra !== null && ra < rMin) rMin = ra;
    }
    // right knee should be less flexed (higher angle) due to asymmetry
    expect(rMin).toBeGreaterThan(lMin);
  });
});

describe('shoulderExternalRotationFrame', () => {
  it('produces 33 landmarks and rotates wrists with rotationDeg', () => {
    const a = shoulderExternalRotationFrame(0);
    const b = shoulderExternalRotationFrame(90);
    expect(a.length).toBe(33);
    expect(b.length).toBe(33);
    const wa = a.find((l) => l.index === 15)!.x;
    const wb = b.find((l) => l.index === 15)!.x;
    expect(wb).not.toBe(wa);
  });
});
