/**
 * Fatigue indicators computed from completed rep records over a set.
 * Pure functions; thresholds configurable per exercise.
 */

import type { RepRecord } from './types';

export interface FatigueIndicator {
  value: number | null;
  flagged: boolean;
}

export interface FatigueResult {
  romDecline: FatigueIndicator;
  concentricSlowdown: FatigueIndicator;
  faultRateRise: FatigueIndicator;
  asymmetryRise: FatigueIndicator;
  anyFlagged: boolean;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return Number.NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Fractional ROM decline from first half to last half of reps. */
export function romDecline(reps: RepRecord[], threshold: number): FatigueIndicator {
  const vals = reps.map((r) => r.romDeg).filter((v): v is number => v !== null && v > 0);
  if (vals.length < 2) return { value: null, flagged: false };
  const split = Math.ceil(vals.length / 2);
  const first = mean(vals.slice(0, split));
  const last = mean(vals.slice(split));
  if (!Number.isFinite(first) || first === 0) return { value: null, flagged: false };
  const decline = (first - last) / first; // positive = range shrinking
  return { value: decline, flagged: decline > threshold };
}

/** Concentric slowdown: peak velocity first half vs last half. */
export function concentricSlowdown(reps: RepRecord[], threshold: number): FatigueIndicator {
  const vals = reps.map((r) => r.peakVelocityDegPerS).filter((v) => v > 0);
  if (vals.length < 2) return { value: null, flagged: false };
  const split = Math.ceil(vals.length / 2);
  const first = mean(vals.slice(0, split));
  const last = mean(vals.slice(split));
  if (!Number.isFinite(first) || first === 0) return { value: null, flagged: false };
  const slowdown = (first - last) / first; // positive = slowing
  return { value: slowdown, flagged: slowdown > threshold };
}

/** Fault rate rise: faults per rep, first half vs last half. */
export function faultRateRise(reps: RepRecord[], threshold: number): FatigueIndicator {
  if (reps.length < 2) return { value: null, flagged: false };
  const split = Math.ceil(reps.length / 2);
  const rate = (rs: RepRecord[]) => rs.reduce((sum, r) => sum + r.faults.length, 0) / rs.length;
  const first = rate(reps.slice(0, split));
  const last = rate(reps.slice(split));
  const rise = last - first; // faults per rep increase
  return { value: rise, flagged: rise > threshold };
}

/** Asymmetry rise — placeholder computed from rep ROM symmetry proxy. */
export function asymmetryRise(reps: RepRecord[], threshold: number): FatigueIndicator {
  // We only have a single primary angle per rep in this MVP; use ROM variance
  // across reps as an asymmetry surrogate. flagged when variability rises.
  const vals = reps.map((r) => r.romDeg).filter((v): v is number => v > 0);
  if (vals.length < 2) return { value: null, flagged: false };
  const m = mean(vals);
  const spread = Math.sqrt(mean(vals.map((v) => (v - m) ** 2)));
  const relative = m === 0 ? 0 : spread / m;
  return { value: relative, flagged: relative > threshold };
}

export function computeFatigue(
  reps: RepRecord[],
  config: {
    romDeclineThreshold: number;
    concentricSlowdownThreshold: number;
    faultRateRiseThreshold: number;
    asymmetryRiseThreshold: number;
  }
): FatigueResult {
  const romDeclineRes = romDecline(reps, config.romDeclineThreshold);
  const concentricSlowdownRes = concentricSlowdown(reps, config.concentricSlowdownThreshold);
  const faultRateRiseRes = faultRateRise(reps, config.faultRateRiseThreshold);
  const asymmetryRiseRes = asymmetryRise(reps, config.asymmetryRiseThreshold);
  const anyFlagged =
    romDeclineRes.flagged ||
    concentricSlowdownRes.flagged ||
    faultRateRiseRes.flagged ||
    asymmetryRiseRes.flagged;
  return {
    romDecline: romDeclineRes,
    concentricSlowdown: concentricSlowdownRes,
    faultRateRise: faultRateRiseRes,
    asymmetryRise: asymmetryRiseRes,
    anyFlagged,
  };
}
