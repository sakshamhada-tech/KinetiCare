import { describe, expect, it } from 'vitest';
import { OneEuroFilter } from '../src/engine/one-euro';

describe('OneEuroFilter parameter validation', () => {
  it('throws on invalid config', () => {
    // Runtime validation (types allow these, constructor throws):
    expect(() => new OneEuroFilter({ freq: 0 })).toThrow();
    expect(() => new OneEuroFilter({ freq: -5 })).toThrow();
    expect(() => new OneEuroFilter({ minCutoff: 0 })).toThrow();
    expect(() => new OneEuroFilter({ minCutoff: -1 })).toThrow();
    expect(() => new OneEuroFilter({ dCutoff: 0 })).toThrow();
    expect(() => new OneEuroFilter({ beta: NaN })).toThrow();
  });

  it('rejects non-finite inputs', () => {
    const f = new OneEuroFilter();
    expect(() => f.filter(NaN, 0)).toThrow();
    expect(() => f.filter(1, NaN)).toThrow();
  });
});

describe('OneEuroFilter behavior', () => {
  it('constant signal stays constant after first sample', () => {
    const f = new OneEuroFilter({ freq: 30, minCutoff: 1.0, beta: 0.0 });
    const out: number[] = [];
    for (let i = 0; i < 20; i++) out.push(f.filter(5.0, (i * 1000) / 30));
    // first sample passes through unchanged
    expect(out[0]).toBe(5.0);
    // subsequent samples stay at 5 (constant -> no change to smooth)
    for (let i = 1; i < out.length; i++) {
      expect(out[i]).toBeCloseTo(5.0, 6);
    }
  });

  it('step response eventually converges to the new value', () => {
    const f = new OneEuroFilter({ freq: 30, minCutoff: 1.0, beta: 0.0 });
    const out: number[] = [];
    for (let i = 0; i < 90; i++) out.push(f.filter(i < 30 ? 0.0 : 10.0, (i * 1000) / 30));
    const last = out[out.length - 1];
    expect(last).toBeCloseTo(10.0, 1); // converged toward 10
    expect(out[0]).toBe(0.0);
  });

  it('jitter reduction on noisy sine (seeded deterministic)', () => {
    const f = new OneEuroFilter({ freq: 60, minCutoff: 3.0, beta: 0.0, dCutoff: 1.0 });
    const clean: number[] = [];
    const noisy: number[] = [];
    const filtered: number[] = [];
    for (let i = 0; i < 600; i++) {
      const t = (i * 1000) / 60;
      const c = Math.sin((2 * Math.PI * 2 * i) / 600);
      clean.push(c);
      // deterministic pseudo-noise
      const n = ((i * 37 + 11) % 97) / 97 - 0.5;
      noisy.push(c + 0.4 * n);
      filtered.push(f.filter(c + 0.4 * n, t));
    }
    const noisyVar = variance(noisy);
    const filteredVar = variance(filtered);
    expect(filteredVar).toBeLessThan(noisyVar); // reduces jitter variance
    // tracking: filtered should not deviate wildly from clean
    let maxDiff = 0;
    for (let i = 0; i < clean.length; i++)
      maxDiff = Math.max(maxDiff, Math.abs(filtered[i] - clean[i]));
    expect(maxDiff).toBeLessThan(0.6);
  });

  it('higher minCutoff tracks faster but passes more jitter', () => {
    const slow = new OneEuroFilter({ freq: 60, minCutoff: 0.5, beta: 0.0 });
    const fast = new OneEuroFilter({ freq: 60, minCutoff: 10.0, beta: 0.0 });
    const sOut: number[] = [];
    const fOut: number[] = [];
    for (let i = 0; i < 60; i++) {
      const v = i < 30 ? 0.0 : 10.0;
      sOut.push(slow.filter(v, (i * 1000) / 60));
      fOut.push(fast.filter(v, (i * 1000) / 60));
    }
    // After the step, fast filter tracks closer to 10 at an intermediate point
    expect(Math.abs(fOut[33] - 10)).toBeLessThanOrEqual(Math.abs(sOut[33] - 10));
    // Both converge to 10 by the end
    expect(fOut[fOut.length - 1]).toBeCloseTo(10, 1);
    expect(sOut[sOut.length - 1]).toBeCloseTo(10, 1);
  });

  it('deterministic: same inputs yield same outputs', () => {
    const a = new OneEuroFilter({ freq: 30, minCutoff: 1.0, beta: 0.3, dCutoff: 1.0 });
    const b = new OneEuroFilter({ freq: 30, minCutoff: 1.0, beta: 0.3, dCutoff: 1.0 });
    const xs = [0, 1, 0.5, 2, 1.5, 0];
    for (let i = 0; i < xs.length; i++) {
      expect(a.filter(xs[i], i * 100)).toBe(b.filter(xs[i], i * 100));
    }
  });

  it('lastRaw reports the last value fed in', () => {
    const f = new OneEuroFilter({ freq: 30, minCutoff: 1.0, beta: 0.3 });
    expect(f.lastRaw).toBeNull();
    f.filter(7.5, 0);
    expect(f.lastRaw).toBe(7.5);
    f.filter(2.5, 100);
    expect(f.lastRaw).toBe(2.5);
  });
});

function variance(xs: number[]): number {
  const m = xs.reduce((s, v) => s + v, 0) / xs.length;
  return xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length;
}
