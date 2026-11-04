import { describe, expect, it } from 'vitest';
import {
  detectAsymmetry,
  detectExcessiveTrunkLean,
  detectInsufficientDepth,
  detectKneeValgus,
  detectTooFastDescent,
  valgusIndexPercent,
} from '../src/engine/faults';

const points = (hipX: number, kneeX: number, ankleX: number, y = 1) => ({
  hip: { x: hipX, y },
  knee: { x: kneeX, y },
  ankle: { x: ankleX, y },
});

describe('valgusIndexPercent', () => {
  it('knee on the hip-ankle line -> 0 deviation', () => {
    // hip(0,0), knee(0.5,1), ankle(1,0): knee exactly on the line
    expect(valgusIndexPercent(points(0, 0.5, 1))).toBeCloseTo(0, 10);
  });

  it('knee off the line -> positive deviation scaled by leg length', () => {
    // hip(0,0), ankle(2,0), knee(1,0.5): perpendicular distance 0.5, line length 2 -> d/line=0.25
    const custom = { hip: { x: 0, y: 0 }, knee: { x: 1, y: 0.5 }, ankle: { x: 2, y: 0 } };
    expect(valgusIndexPercent(custom)).toBeGreaterThan(0);
  });

  it('degenerate zero-length line -> null', () => {
    expect(
      valgusIndexPercent({ hip: { x: 0, y: 0 }, knee: { x: 0.5, y: 1 }, ankle: { x: 0, y: 0 } })
    ).toBeNull();
    expect(
      valgusIndexPercent({ hip: { x: 0, y: 0 }, knee: { x: 0, y: 0 }, ankle: { x: 1, y: 0 } })
    ).toBeNull();
  });

  it('symmetry: mirror image gives same magnitude', () => {
    const a = valgusIndexPercent({
      hip: { x: 0, y: 0 },
      knee: { x: 1, y: 0.5 },
      ankle: { x: 2, y: 0 },
    });
    const b = valgusIndexPercent({
      hip: { x: 2, y: 0 },
      knee: { x: 1, y: 0.5 },
      ankle: { x: 0, y: 0 },
    });
    expect(a).toBeCloseTo(b as number, 10);
  });
});

describe('detectKneeValgus', () => {
  const base = { hip: { x: 0, y: 0 }, knee: { x: 1, y: 0.5 }, ankle: { x: 2, y: 0 } };

  it('flags valgus when index exceeds threshold (true positive)', () => {
    const vi = valgusIndexPercent(base) as number;
    expect(detectKneeValgus(base, vi - 1).fault).toBe(true);
  });

  it('does not flag when below threshold (true negative)', () => {
    const vi = valgusIndexPercent(base) as number;
    expect(detectKneeValgus(base, vi + 10).fault).toBe(false);
  });

  it('threshold boundary: exactly at threshold is not a fault', () => {
    const vi = valgusIndexPercent(base) as number;
    expect(detectKneeValgus(base, vi).fault).toBe(false);
  });

  it('returns the measured value', () => {
    const vi = valgusIndexPercent(base) as number;
    const res = detectKneeValgus(base, vi + 10);
    expect(res.value).toBeCloseTo(vi, 10);
  });

  it('degenerate points -> no fault, null value', () => {
    const res = detectKneeValgus(
      { hip: { x: 0, y: 0 }, knee: { x: 0, y: 0 }, ankle: { x: 1, y: 0 } },
      5
    );
    expect(res.fault).toBe(false);
    expect(res.value).toBeNull();
  });
});

describe('detectInsufficientDepth', () => {
  it('flags when knee flexion below minimum (TP)', () => {
    expect(detectInsufficientDepth(80, 100).fault).toBe(true);
  });
  it('does not flag when depth sufficient (TN)', () => {
    expect(detectInsufficientDepth(110, 100).fault).toBe(false);
  });
  it('boundary exactly at min is not a fault', () => {
    expect(detectInsufficientDepth(100, 100).fault).toBe(false);
  });
  it('null angle -> no fault', () => {
    expect(detectInsufficientDepth(null, 100).fault).toBe(false);
    expect(detectInsufficientDepth(null, 100).value).toBeNull();
  });
});

describe('detectExcessiveTrunkLean', () => {
  it('flags when lean above max (TP)', () => {
    expect(detectExcessiveTrunkLean(50, 35).fault).toBe(true);
  });
  it('does not flag within limit (TN)', () => {
    expect(detectExcessiveTrunkLean(20, 35).fault).toBe(false);
  });
  it('boundary exactly at max is not a fault', () => {
    expect(detectExcessiveTrunkLean(35, 35).fault).toBe(false);
  });
});

describe('detectAsymmetry', () => {
  it('flags when left/right difference exceeds tolerance (TP)', () => {
    expect(detectAsymmetry(100, 115, 10).fault).toBe(true);
  });
  it('does not flag within tolerance (TN)', () => {
    expect(detectAsymmetry(100, 105, 10).fault).toBe(false);
  });
  it('null inputs -> no fault', () => {
    expect(detectAsymmetry(null, 100, 10).fault).toBe(false);
    expect(detectAsymmetry(100, null, 10).fault).toBe(false);
  });
});

describe('detectTooFastDescent', () => {
  it('flags when peak velocity above limit (TP)', () => {
    expect(detectTooFastDescent(180, 120).fault).toBe(true);
  });
  it('does not flag below limit (TN)', () => {
    expect(detectTooFastDescent(100, 120).fault).toBe(false);
  });
  it('boundary exactly at limit is not a fault', () => {
    expect(detectTooFastDescent(120, 120).fault).toBe(false);
  });
});
