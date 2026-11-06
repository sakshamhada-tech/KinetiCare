/**
 * pose-source.ts
 *
 * Framework-free PoseSource interface shared by engine and web layers.
 * Implementations live in apps/web (browser-only APIs: FilesetResolver,
 * PoseLandmarker, getUserMedia).
 */

import type { Landmark, LandmarkFrame } from './types.js';

/**
 * A single pose detection result emitted by a PoseSource.
 */
export interface PoseResult {
  /** 33 pose landmarks, index-aligned with MediaPipe PoseLandmarker output. */
  landmarks: Landmark[];
  /** Timestamp in milliseconds (monotonic, source-specific). */
  timestampMs: number;
}

/**
 * Configuration shared by all PoseSource implementations.
 */
export interface PoseSourceConfig {
  /** Confidence threshold for landmark presence (0-1). Default 0.5. */
  minLandmarkConfidence?: number;
  /** Whether to emit only frames where all 33 landmarks pass confidence. */
  requireAllLandmarks?: boolean;
}

/**
 * Callback type for pose results.
 */
export type PoseResultCallback = (result: PoseResult) => void;

/**
 * PoseSource contract: start a source, receive results, stop it.
 */
export interface PoseSource {
  /** Start the source (open camera, load model, begin emitting). */
  start(): Promise<void>;
  /** Stop the source (release camera, dispose model). */
  stop(): Promise<void>;
  /** Register a callback invoked for every emitted PoseResult. */
  onResult(callback: PoseResultCallback): void;
  /** Whether the source is currently active/emitting. */
  isActive(): boolean;
}

/**
 * Normalise a raw LandmarkFrame into a PoseResult, applying optional
 * confidence gating.
 */
export function normaliseResult(
  frame: LandmarkFrame,
  config: PoseSourceConfig = {}
): PoseResult | null {
  const { minLandmarkConfidence = 0.5, requireAllLandmarks = false } = config;

  const landmarks = frame.landmarks.filter((l) => l.visibility >= minLandmarkConfidence);

  if (requireAllLandmarks && landmarks.length !== 33) {
    return null;
  }

  return {
    landmarks,
    timestampMs: frame.timestampMs,
  };
}
