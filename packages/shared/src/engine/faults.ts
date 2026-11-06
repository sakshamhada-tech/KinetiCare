/**
 * Form-fault detectors. Pure functions: give values + thresholds, get a boolean
 * fault decision plus the measured value. Thresholds come from the exercise
 * definition (DB-backed), never hardcoded here.
 *
 * Valgus formula (frontal-plane proxy, see docs/KINEMATICS.md):
 *   d    = signed perpendicular distance of knee from the hip->ankle line
 *   legL = |hip-knee| + |knee-ankle|
 *   vi   = |d| / legL * 100   (dimensionless, % of leg length)
 * Fault when vi > threshold. Not clinical-grade; camera-angle dependent.
 */

import { distance, sub } from './math';
import type { FaultType } from './types';

export interface ValgusPoints {
  hip: { x: number; y: number };
  knee: { x: number; y: number };
  ankle: { x: number; y: number };
}

/**
 * Knee valgus index (% of leg length). Returns null if points are degenerate.
 * sign: positive = knee medial to the hip->ankle line (valgus for the leg as
 * viewed); callers use the absolute value against a threshold.
 */
export function valgusIndexPercent(p: ValgusPoints): number | null {
  const h = { x: p.hip.x, y: p.hip.y, z: 0 };
  const k = { x: p.knee.x, y: p.knee.y, z: 0 };
  const a = { x: p.ankle.x, y: p.ankle.y, z: 0 };
  const ah = sub(a, h);
  const ak = sub(k, h);
  const denom = distance(a, h);
  const legLen = distance(h, k) + distance(k, a);
  if (denom === 0 || legLen === 0 || distance(h, k) === 0 || distance(k, a) === 0) return null;
  // |cross(A-H, K-H)| / |A-H|  = perpendicular distance of K from line H->A
  const crossMag = Math.abs(ah.x * ak.y - ah.y * ak.x);
  const deviation = crossMag / denom;
  if (!Number.isFinite(deviation)) return null;
  return (deviation / legLen) * 100;
}

/** Knee valgus fault decision. */
export function detectKneeValgus(
  p: ValgusPoints,
  thresholdPercent: number
): { fault: boolean; value: number | null } {
  const vi = valgusIndexPercent(p);
  return { fault: vi !== null && vi > thresholdPercent, value: vi };
}

/** Insufficient depth: knee flexion below minimum. */
export function detectInsufficientDepth(
  angleDeg: number | null,
  minDeg: number
): { fault: boolean; value: number | null } {
  return { fault: angleDeg !== null && angleDeg < minDeg, value: angleDeg };
}

/** Excessive forward trunk lean. */
export function detectExcessiveTrunkLean(
  angleDeg: number | null,
  maxDeg: number
): { fault: boolean; value: number | null } {
  return { fault: angleDeg !== null && angleDeg > maxDeg, value: angleDeg };
}

/** Left/right asymmetry beyond tolerance (degrees difference). */
export function detectAsymmetry(
  leftDeg: number | null,
  rightDeg: number | null,
  maxDeg: number
): { fault: boolean; value: number | null } {
  if (leftDeg === null || rightDeg === null) return { fault: false, value: null };
  const diff = Math.abs(leftDeg - rightDeg);
  return { fault: diff > maxDeg, value: diff };
}

/** Too-fast descent: peak angular velocity exceeds limit. */
export function detectTooFastDescent(
  peakVelocityDegPerS: number,
  maxDegPerS: number
): { fault: boolean; value: number } {
  return { fault: peakVelocityDegPerS > maxDegPerS, value: peakVelocityDegPerS };
}

export const faultCue: Record<FaultType, string> = {
  'knee-valgus': 'Knees tracking inward - push them out over your toes',
  'insufficient-depth': 'Squat a little deeper - aim for hips below knees',
  'excessive-trunk-lean': 'Keep your chest more upright - reduce forward lean',
  asymmetry: 'Work both sides evenly - one side is lagging',
  'too-fast-descent': 'Slow the descent - control the movement',
  'elbow-drift': 'Keep your elbow tucked at your side',
  shrugging: 'Keep your shoulders down - avoid shrugging',
  'insufficient-range': 'Move through a fuller range of motion',
  'elbow-angle-deviation': 'Keep your elbow near 90 degrees',
};
