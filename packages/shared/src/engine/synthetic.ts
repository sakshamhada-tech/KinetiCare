/**
 * Synthetic landmark generator for deterministic engine tests.
 *
 * Produces 33-landmark MediaPipe-style frames for a squat and a standing
 * shoulder external rotation. All geometry is parametric: you specify depth,
 * valgus offset, asymmetry, and noise; a seeded RNG makes every run
 * deterministic.
 *
 * Coordinates are normalized image space (x, y in [0,1], y down, z depth).
 * These are deliberately simple idealized skeletons -- not anatomical ground
 * truth -- sufficient to exercise the angle, fault, and rep-machine logic.
 */

import type { Landmark, LandmarkFrame } from './types';

// MediaPipe pose indices used by the generator.
const IDX = {
  Nose: 0,
  LShoulder: 11,
  RShoulder: 12,
  LElbow: 13,
  RElbow: 14,
  LWrist: 15,
  RWrist: 16,
  LHip: 23,
  RHip: 24,
  LKnee: 25,
  RKnee: 26,
  LAnkle: 27,
  RAnkle: 28,
  LHeel: 29,
  RHeel: 30,
  LFoot: 31,
  RFoot: 32,
} as const;

/* ------------------------------------------------------------------ */
/* Seeded RNG (LCG) + Gaussian (Box-Muller)                           */
/* ------------------------------------------------------------------ */

export interface SeededRNG {
  next: () => number;
  gaussian: (mean: number, std: number) => number;
}

export function createSeededRNG(seed: number): SeededRNG {
  let state = seed >>> 0;
  if (state === 0) state = 0x6c_73_2e_54;
  const next = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
  let gaussAvailable = false;
  let gaussCached = 0;
  const gaussian = (mean: number, std: number): number => {
    if (gaussAvailable) {
      gaussAvailable = false;
      return mean + std * gaussCached;
    }
    let u1, u2, w;
    do {
      u1 = next() * 2 - 1;
      u2 = next() * 2 - 1;
      w = u1 * u1 + u2 * u2;
    } while (w >= 1 || w === 0);
    const mult = Math.sqrt((-2 * Math.log(w)) / w);
    gaussCached = u2 * mult;
    gaussAvailable = true;
    return mean + std * u1 * mult;
  };
  return { next, gaussian };
}

/* ------------------------------------------------------------------ */
/* Base frontal standing skeleton                                     */
/* ------------------------------------------------------------------ */

const NOISE_VIS = 0.98;

function lm(index: number, x: number, y: number, z = 0, visibility = NOISE_VIS): Landmark {
  return { index, x, y, z, visibility };
}

function baseSkeleton(): Landmark[] {
  const cx = 0.5;
  return [
    lm(IDX.Nose, cx, 0.14),
    lm(IDX.LShoulder, 0.42, 0.26),
    lm(IDX.RShoulder, 0.58, 0.26),
    lm(IDX.LElbow, 0.41, 0.42),
    lm(IDX.RElbow, 0.59, 0.42),
    lm(IDX.LWrist, 0.4, 0.58),
    lm(IDX.RWrist, 0.6, 0.58),
    lm(IDX.LHip, 0.45, 0.55),
    lm(IDX.RHip, 0.55, 0.55),
    lm(IDX.LKnee, 0.45, 0.78),
    lm(IDX.RKnee, 0.55, 0.78),
    lm(IDX.LAnkle, 0.45, 0.97),
    lm(IDX.RAnkle, 0.55, 0.97),
    lm(IDX.LHeel, 0.44, 0.985),
    lm(IDX.RHeel, 0.56, 0.985),
    lm(IDX.LFoot, 0.43, 0.995),
    lm(IDX.RFoot, 0.57, 0.995),
    // remaining face/hands indices (not used by squat math) - placed sensibly
    lm(1, 0.47, 0.12),
    lm(2, 0.485, 0.11),
    lm(3, 0.5, 0.12),
    lm(4, 0.515, 0.11),
    lm(5, 0.53, 0.12),
    lm(6, 0.545, 0.11),
    lm(7, 0.41, 0.185),
    lm(8, 0.59, 0.185),
    lm(9, 0.485, 0.155),
    lm(10, 0.515, 0.155),
    lm(17, 0.405, 0.6),
    lm(18, 0.595, 0.6),
    lm(19, 0.402, 0.62),
    lm(20, 0.598, 0.62),
    lm(21, 0.4, 0.64),
    lm(22, 0.6, 0.64),
  ];
}

/**
 * Landmarks for a squat at a given knee flexion angle (degrees).
 * Both knees flex equally unless `asymmetryDeg` shifts the right knee.
 * `valgusOffset` shifts both knees medially (toward each other) by that
 * fraction of leg length, simulating valgus.
 */
export function squatFrameAtAngle(
  kneeFlexionDeg: number,
  options: {
    valgusOffset?: number; // 0..1 fraction of leg length, medial shift
    asymmetryDeg?: number; // extra degrees on right knee vs left
    cx?: number; // horizontal center
  }
): Landmark[] {
  const { valgusOffset = 0, asymmetryDeg = 0, cx = 0.5 } = options;
  const theta = (kneeFlexionDeg * Math.PI) / 180;
  const shinLen = 0.19;
  const thighLen = 0.24;
  const ay = 0.97; // ankle y (fixed)
  const ky = ay - shinLen; // knee y (shin vertical)

  // Hip placed so knee angle at knee = kneeFlexionDeg (see derivation).
  // hip x offset = thighLen * sin(theta); hip y = ky + thighLen * cos(theta)
  const hipOffset = thighLen * Math.sin(theta);

  // Medial valgus shift: move both knees inward (toward center cx).
  const kneeShift = valgusOffset * shinLen; // magnitude
  const lKneeX = 0.45 + kneeShift;
  const rKneeX = 0.55 - kneeShift;

  // Hip is placed laterally out from the knee by thighLen*sin(theta) so that
  // |knee->hip| == thighLen and the knee angle comes out exactly theta.
  const lHipX = lKneeX - hipOffset;
  const rHipX = rKneeX + hipOffset;
  const lHipY = ky + thighLen * Math.cos(theta);
  const rHipY = ky + thighLen * Math.cos(theta);

  const lAnkleX = lKneeX;
  const rAnkleX = rKneeX;

  // Asymmetry: right knee flexes a different amount -> shift right knee y.
  const rKy = ky + (asymmetryDeg > 0 ? (asymmetryDeg / 180) * 0.05 : 0);

  return [
    lm(IDX.Nose, cx, 0.14),
    lm(IDX.LShoulder, lHipX - 0.03, 0.26),
    lm(IDX.RShoulder, rHipX + 0.03, 0.26),
    lm(IDX.LElbow, lHipX - 0.05, 0.42),
    lm(IDX.RElbow, rHipX + 0.05, 0.42),
    lm(IDX.LWrist, lHipX - 0.06, 0.58),
    lm(IDX.RWrist, rHipX + 0.06, 0.58),
    lm(IDX.LHip, lHipX, lHipY),
    lm(IDX.RHip, rHipX, rHipY),
    lm(IDX.LKnee, lKneeX, ky),
    lm(IDX.RKnee, rKneeX, rKy),
    lm(IDX.LAnkle, lAnkleX, ay),
    lm(IDX.RAnkle, rAnkleX, ay),
    lm(IDX.LHeel, lAnkleX - 0.01, 0.985),
    lm(IDX.RHeel, rAnkleX + 0.01, 0.985),
    lm(IDX.LFoot, lAnkleX - 0.02, 0.995),
    lm(IDX.RFoot, rAnkleX + 0.02, 0.995),
    lm(1, cx - 0.03, 0.12),
    lm(2, cx - 0.015, 0.11),
    lm(3, cx, 0.12),
    lm(4, cx, 0.11),
    lm(5, cx + 0.015, 0.12),
    lm(6, cx + 0.03, 0.11),
    lm(7, cx - 0.09, 0.185),
    lm(8, cx + 0.09, 0.185),
    lm(9, cx - 0.015, 0.155),
    lm(10, cx + 0.015, 0.155),
    lm(17, lHipX - 0.055, 0.6),
    lm(18, rHipX + 0.055, 0.6),
    lm(19, lHipX - 0.058, 0.62),
    lm(20, rHipX + 0.058, 0.62),
    lm(21, lHipX - 0.06, 0.64),
    lm(22, rHipX + 0.06, 0.64),
  ];
}

function addNoise(landmarks: Landmark[], rng: SeededRNG, noise: number): Landmark[] {
  if (noise <= 0) return landmarks;
  return landmarks.map((lm) => ({
    ...lm,
    x: clamp01(lm.x + rng.gaussian(0, noise)),
    y: clamp01(lm.y + rng.gaussian(0, noise)),
    z: lm.z + rng.gaussian(0, noise),
  }));
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Generate a squat sequence: `reps` repetitions, each descending from standing
 * (~170 deg) to `depthDeg` and back, at `fps` frames per second.
 * Each rep lasts `repDurationMs`. Returns frames with timestamps (ms).
 */
export function generateSquatSequence(options: {
  reps: number;
  depthDeg: number;
  fps: number;
  repDurationMs?: number;
  valgusOffset?: number;
  asymmetryDeg?: number;
  noise?: number;
  seed?: number;
  cx?: number;
}): LandmarkFrame[] {
  const {
    reps,
    depthDeg,
    fps,
    repDurationMs = 1200,
    valgusOffset = 0,
    asymmetryDeg = 0,
    noise = 0,
    seed = 42,
    cx = 0.5,
  } = options;
  const rng = createSeededRNG(seed);
  const frames: LandmarkFrame[] = [];
  const msPerFrame = 1000 / fps;
  const standingDeg = 170;
  let t = 0;

  for (let r = 0; r < reps; r++) {
    const steps = Math.max(2, Math.round((repDurationMs / 1000) * fps));
    for (let s = 0; s <= steps; s++) {
      const phase = s / steps; // 0 -> 1 -> 0 over the rep
      // triangle wave: descend then ascend
      const tNorm = phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
      const angle = standingDeg - (standingDeg - depthDeg) * tNorm;
      let frame = {
        timestampMs: t,
        landmarks: squatFrameAtAngle(angle, { valgusOffset, asymmetryDeg, cx }),
      };
      if (noise > 0) frame = { timestampMs: t, landmarks: addNoise(frame.landmarks, rng, noise) };
      frames.push(frame);
      t += msPerFrame;
    }
  }
  return frames;
}

/**
 * Standing shoulder external rotation frame: elbows fixed ~90 deg flexion,
 * forearms rotated by `rotationDeg` relative to neutral.
 * Simplified: only shoulder/elbow/wrist x positions shift with rotation.
 */
export function shoulderExternalRotationFrame(rotationDeg: number): Landmark[] {
  const base = baseSkeleton();
  const rot = (rotationDeg * Math.PI) / 180;
  const swing = 0.03 * Math.sin(rot); // forearm horizontal swing
  // left and right forearms swing opposite (external rotation)
  return base.map((landmark) => {
    if (landmark.index === IDX.LWrist) return lm(IDX.LWrist, 0.4 - swing, 0.58);
    if (landmark.index === IDX.RWrist) return lm(IDX.RWrist, 0.6 + swing, 0.58);
    return landmark;
  });
}
