/** Core types shared by the kinematics engine. Framework-free, no DOM. */

export interface Point2 {
  x: number;
  y: number;
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface Landmark {
  /** MediaPipe landmark index (0-32 for pose). */
  index: number;
  x: number;
  y: number;
  z: number;
  visibility: number;
  presence?: number;
}

export interface LandmarkFrame {
  timestampMs: number;
  /** 33 pose landmarks, index-aligned with MediaPipe PoseLandmarker output. */
  landmarks: Landmark[];
}

export interface AngleResult {
  /** Angle in degrees [0, 180], or null if the vector is degenerate. */
  deg: number | null;
  /** Which landmark indices were used. */
  indices: [number, number, number];
}

export interface RepRecord {
  repIndex: number;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  minAngleDeg: number | null;
  maxAngleDeg: number | null;
  romDeg: number;
  peakVelocityDegPerS: number;
  faults: string[];
}

export interface SessionSummaryNumbers {
  reps: RepRecord[];
  faultCounts: Record<string, number>;
  durationMs: number;
}

/* ------------------------------------------------------------------ */
/* Rep state machine                                                  */
/* ------------------------------------------------------------------ */

export type RepState = 'idle' | 'descending' | 'bottom' | 'ascending';

export interface RepMachineConfig {
  /** How the primary angle moves from rest to the exercise extreme. */
  direction: 'decreasing' | 'increasing';
  /** Minimum duration (ms) for a completed rep. */
  minRepDurationMs: number;
  /** Minimum range of motion (deg) for a completed rep. */
  minRepRomDeg: number;
  /** Hysteresis band (deg) preventing double-counting on noise. */
  hysteresisDeg: number;
  /** Max gap (ms) of invalid frames before an in-progress rep is aborted. */
  dropoutTimeoutMs: number;
}

export interface RepMachineOutcome {
  state: RepState;
  event: 'none' | 'rep-completed' | 'rep-aborted';
  rep?: RepRecord;
}

/* ------------------------------------------------------------------ */
/* Faults / fatigue                                                   */
/* ------------------------------------------------------------------ */

export type FaultType =
  | 'knee-valgus'
  | 'insufficient-depth'
  | 'excessive-trunk-lean'
  | 'asymmetry'
  | 'too-fast-descent'
  | 'elbow-drift'
  | 'shrugging'
  | 'insufficient-range'
  | 'elbow-angle-deviation';

export interface FaultEvent {
  faultType: FaultType;
  timestampMs: number;
  cue: string;
  value?: number;
  threshold?: number;
}

export interface FatigueIndicators {
  romDecline: { value: number | null; flagged: boolean };
  concentricSlowdown: { value: number | null; flagged: boolean };
  faultRateRise: { value: number | null; flagged: boolean };
  asymmetryRise: { value: number | null; flagged: boolean };
  anyFlagged: boolean;
}
