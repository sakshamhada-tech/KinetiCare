/**
 * Joint angles from landmarks.
 *
 * 3D world landmarks are used when present and finite (depth-aware, robust to
 * subject distance). 2D normalized image landmarks are the fallback. The choice
 * is documented per function.
 *
 * MediaPipe pose landmark indices used:
 *   11 L shoulder, 12 R shoulder
 *   13 L elbow, 14 R elbow
 *   15 L wrist, 16 R wrist
 *   23 L hip, 24 R hip
 *   25 L knee, 26 R knee
 *   27 L ankle, 28 R ankle
 */

import { angleABC } from './math';
import type { Vector3 } from './math';
import type { Landmark, LandmarkFrame } from './types';

export enum LandmarkIndex {
  LeftShoulder = 11,
  RightShoulder = 12,
  LeftElbow = 13,
  RightElbow = 14,
  LeftWrist = 15,
  RightWrist = 16,
  LeftHip = 23,
  RightHip = 24,
  LeftKnee = 25,
  RightKnee = 26,
  LeftAnkle = 27,
  RightAnkle = 28,
}

export interface JointTriple {
  a: LandmarkIndex;
  b: LandmarkIndex; // vertex
  c: LandmarkIndex;
}

export const KNEE_FLEXION_LEFT: JointTriple = {
  a: LandmarkIndex.LeftHip,
  b: LandmarkIndex.LeftKnee,
  c: LandmarkIndex.LeftAnkle,
};
export const KNEE_FLEXION_RIGHT: JointTriple = {
  a: LandmarkIndex.RightHip,
  b: LandmarkIndex.RightKnee,
  c: LandmarkIndex.RightAnkle,
};

export const ELBOW_FLEXION_LEFT: JointTriple = {
  a: LandmarkIndex.LeftShoulder,
  b: LandmarkIndex.LeftElbow,
  c: LandmarkIndex.LeftWrist,
};
export const ELBOW_FLEXION_RIGHT: JointTriple = {
  a: LandmarkIndex.RightShoulder,
  b: LandmarkIndex.RightElbow,
  c: LandmarkIndex.RightWrist,
};

export const TRUNK_LEAN: JointTriple = {
  // hip-shoulder-nose: angle of torso relative to vertical via shoulder-hip
  a: LandmarkIndex.LeftShoulder,
  b: LandmarkIndex.LeftHip,
  c: LandmarkIndex.LeftKnee,
};

function toVector3(lm: Landmark | undefined): Vector3 | null {
  if (!lm) return null;
  if (!Number.isFinite(lm.x) || !Number.isFinite(lm.y) || !Number.isFinite(lm.z)) return null;
  return { x: lm.x, y: lm.y, z: lm.z };
}

function landmarkByIndex(frame: LandmarkFrame, index: number): Landmark | undefined {
  return frame.landmarks.find((lm) => lm.index === index);
}

/**
 * Compute angle at joint b for landmarks a-b-c.
 * Prefers 3D world coordinates when all three are finite; falls back to 2D.
 * Returns null if any landmark missing or vectors degenerate.
 */
export function jointAngle(frame: LandmarkFrame, triple: JointTriple): number | null {
  const la = landmarkByIndex(frame, triple.a);
  const lb = landmarkByIndex(frame, triple.b);
  const lc = landmarkByIndex(frame, triple.c);
  if (!la || !lb || !lc) return null;

  const va = toVector3(la);
  const vb = toVector3(lb);
  const vc = toVector3(lc);
  if (!va || !vb || !vc) return null;

  // 3D when all three world coordinates are finite and non-degenerate.
  return angleABC(va, vb, vc);
}

/**
 * Knee flexion angle (degrees) for a leg. ~180 standing, smaller when flexed.
 */
export function kneeFlexion(frame: LandmarkFrame, side: 'left' | 'right'): number | null {
  const triple = side === 'left' ? KNEE_FLEXION_LEFT : KNEE_FLEXION_RIGHT;
  return jointAngle(frame, triple);
}

/**
 * Elbow flexion angle (degrees). ~180 arm straight, smaller when flexed.
 */
export function elbowFlexion(frame: LandmarkFrame, side: 'left' | 'right'): number | null {
  const triple = side === 'left' ? ELBOW_FLEXION_LEFT : ELBOW_FLEXION_RIGHT;
  return jointAngle(frame, triple);
}

/**
 * Trunk lean estimate (degrees) from the torso-leg angle on one side.
 */
export function trunkLean(frame: LandmarkFrame): number | null {
  return jointAngle(frame, TRUNK_LEAN);
}

/**
 * Frontal-plane projected points for valgus math: use x (horizontal) and y
 * (vertical, image-down). Returns {hip, knee, ankle} as {x,y} or null.
 */
export function frontalPoints(
  frame: LandmarkFrame,
  side: 'left' | 'right'
): {
  hip: { x: number; y: number };
  knee: { x: number; y: number };
  ankle: { x: number; y: number };
} | null {
  const hipIdx = side === 'left' ? LandmarkIndex.LeftHip : LandmarkIndex.RightHip;
  const kneeIdx = side === 'left' ? LandmarkIndex.LeftKnee : LandmarkIndex.RightKnee;
  const ankleIdx = side === 'left' ? LandmarkIndex.LeftAnkle : LandmarkIndex.RightAnkle;
  const h = landmarkByIndex(frame, hipIdx);
  const k = landmarkByIndex(frame, kneeIdx);
  const a = landmarkByIndex(frame, ankleIdx);
  if (!h || !k || !a) return null;
  return { hip: { x: h.x, y: h.y }, knee: { x: k.x, y: k.y }, ankle: { x: a.x, y: a.y } };
}
