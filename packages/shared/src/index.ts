export * from './schemas';

// Engine-specific types not present in schemas (no name conflicts).
export type {
  Landmark,
  Point2,
  Point3,
  LandmarkFrame,
  AngleResult,
  SessionSummaryNumbers,
  RepState,
  RepMachineConfig,
  RepMachineOutcome,
  FatigueIndicators,
} from './engine/types';

// PoseSource interface and helpers (no conflicts with schemas).
export type { PoseSource, PoseResult, PoseSourceConfig } from './engine/pose-source';
export { normaliseResult } from './engine/pose-source';

// Pure engine functions.
export * from './engine/math';
export * from './engine/one-euro';
export * from './engine/smoothing';
export * from './engine/angles';
export * from './engine/rep-machine';
export * from './engine/faults';
export * from './engine/fatigue';
export * from './engine/synthetic';
