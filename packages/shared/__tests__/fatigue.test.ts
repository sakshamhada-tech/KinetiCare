import { describe, expect, it } from 'vitest';
import { computeFatigue, romDecline } from '../src/engine/fatigue';
import type { RepRecord } from '../src/engine/types';

function rep(rom: number, velocity: number, faults: string[] = []): RepRecord {
  return {
    repIndex: 0,
    startedAt: 0,
    endedAt: 0,
    durationMs: 1000,
    minAngleDeg: 90,
    maxAngleDeg: 170,
    romDeg: rom,
    peakVelocityDegPerS: velocity,
    faults,
  };
}

describe('fatigue indicators', () => {
  it('declining ROM across reps flags romDecline', () => {
    const reps = [rep(80, 100), rep(75, 100), rep(70, 100), rep(65, 100)];
    const r = romDecline(reps, 0.1);
    expect(r.value).toBeGreaterThan(0.1);
    expect(r.flagged).toBe(true);
  });

  it('stable ROM does not flag romDecline', () => {
    const reps = [rep(80, 100), rep(80, 100), rep(80, 100)];
    const r = romDecline(reps, 0.1);
    expect(r.value).toBeCloseTo(0, 6);
    expect(r.flagged).toBe(false);
  });

  it('computeFatigue: stable set yields no indicators', () => {
    const reps = [rep(80, 100, []), rep(80, 100, []), rep(80, 100, [])];
    const f = computeFatigue(reps, {
      romDeclineThreshold: 0.1,
      concentricSlowdownThreshold: 0.2,
      faultRateRiseThreshold: 0.5,
      asymmetryRiseThreshold: 0.3,
    });
    expect(f.anyFlagged).toBe(false);
    expect(f.romDecline.flagged).toBe(false);
    expect(f.concentricSlowdown.flagged).toBe(false);
    expect(f.faultRateRise.flagged).toBe(false);
    expect(f.asymmetryRise.flagged).toBe(false);
  });

  it('rising fault rate flags faultRateRise', () => {
    const reps = [rep(80, 100, []), rep(80, 100, []), rep(80, 100, ['knee-valgus', 'knee-valgus'])];
    const f = computeFatigue(reps, {
      romDeclineThreshold: 0.5,
      concentricSlowdownThreshold: 0.5,
      faultRateRiseThreshold: 0.2,
      asymmetryRiseThreshold: 0.5,
    });
    expect(f.faultRateRise.value).toBeGreaterThan(0.2);
    expect(f.faultRateRise.flagged).toBe(true);
    expect(f.anyFlagged).toBe(true);
  });

  it('concentric slowdown flags when velocity drops', () => {
    const reps = [rep(80, 200, []), rep(80, 200, []), rep(80, 100, []), rep(80, 80, [])];
    const f = computeFatigue(reps, {
      romDeclineThreshold: 0.5,
      concentricSlowdownThreshold: 0.2,
      faultRateRiseThreshold: 0.5,
      asymmetryRiseThreshold: 0.5,
    });
    expect(f.concentricSlowdown.value).toBeGreaterThan(0.2);
    expect(f.concentricSlowdown.flagged).toBe(true);
  });

  it('too few reps -> no indicators, null values', () => {
    const f = computeFatigue([rep(80, 100)], {
      romDeclineThreshold: 0.1,
      concentricSlowdownThreshold: 0.2,
      faultRateRiseThreshold: 0.5,
      asymmetryRiseThreshold: 0.3,
    });
    expect(f.anyFlagged).toBe(false);
    expect(f.romDecline.value).toBeNull();
  });
});
