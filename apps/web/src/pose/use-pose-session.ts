/**
 * use-pose-session.ts
 *
 * Zustand store for live pose session state. Framework-agnostic state
 * (no React in the store itself, just the hook). Consumed by Live Session
 * UI components to show rep counter, fault banner, and audio cues.
 */

import { create } from 'zustand';
import type { FaultType } from '@kineticare/shared';

export interface RepRecordSummary {
  repIndex: number;
  durationMs: number;
  romDeg: number;
  peakVelocityDegPerS: number;
  faults: FaultType[];
}

export interface PoseSessionState {
  // Session control
  isActive: boolean;
  sourceType: 'camera' | 'replay' | null;
  cameraError: string | null;

  // Live data
  landmarks: { index: number; x: number; y: number; z: number; visibility: number }[] | null;
  timestampMs: number;

  // Rep counting
  repCount: number;
  targetReps: number;
  currentRep: RepRecordSummary | null;
  completedReps: RepRecordSummary[];

  // Faults
  activeFault: FaultType | null;
  faultCue: string | null;
  faultHistory: { faultType: FaultType; timestampMs: number }[];

  // Actions
  startSession: (sourceType: 'camera' | 'replay', targetReps?: number) => void;
  stopSession: () => void;
  setLandmarks: (landmarks: PoseSessionState['landmarks'], timestampMs: number) => void;
  setCameraError: (error: string | null) => void;
  setRepCount: (count: number) => void;
  setCurrentRep: (rep: RepRecordSummary | null) => void;
  addCompletedRep: (rep: RepRecordSummary) => void;
  setActiveFault: (fault: FaultType | null, cue: string | null) => void;
  addFaultEvent: (faultType: FaultType, timestampMs: number) => void;
  resetSession: () => void;
}

const INITIAL_STATE: Pick<
  PoseSessionState,
  | 'isActive'
  | 'sourceType'
  | 'cameraError'
  | 'landmarks'
  | 'timestampMs'
  | 'repCount'
  | 'targetReps'
  | 'currentRep'
  | 'completedReps'
  | 'activeFault'
  | 'faultCue'
  | 'faultHistory'
> = {
  isActive: false,
  sourceType: null,
  cameraError: null,
  landmarks: null,
  timestampMs: 0,
  repCount: 0,
  targetReps: 10,
  currentRep: null,
  completedReps: [],
  activeFault: null,
  faultCue: null,
  faultHistory: [],
};

export const usePoseSession = create<PoseSessionState>((set) => ({
  ...INITIAL_STATE,

  startSession: (sourceType, targetReps = 10) =>
    set((state) => ({
      ...state,
      isActive: true,
      sourceType,
      targetReps: targetReps ?? 10,
      repCount: 0,
      completedReps: [],
      activeFault: null,
      faultCue: null,
      faultHistory: [],
      cameraError: null,
    })),

  stopSession: () =>
    set((state) => ({
      ...state,
      isActive: false,
      sourceType: null,
      cameraError: null,
      activeFault: null,
      faultCue: null,
      currentRep: null,
    })),

  setLandmarks: (landmarks, timestampMs) =>
    set((state) => ({
      ...state,
      landmarks,
      timestampMs,
    })),

  setCameraError: (error) =>
    set((state) => ({
      ...state,
      cameraError: error,
    })),

  setRepCount: (count) =>
    set((state) => ({
      ...state,
      repCount: count,
    })),

  setCurrentRep: (rep) =>
    set((state) => ({
      ...state,
      currentRep: rep,
    })),

  addCompletedRep: (rep) =>
    set((state) => ({
      ...state,
      completedReps: [...state.completedReps, rep],
      repCount: state.completedReps.length + 1,
    })),

  setActiveFault: (fault, cue) =>
    set((state) => ({
      ...state,
      activeFault: fault,
      faultCue: cue,
    })),

  addFaultEvent: (faultType, timestampMs) =>
    set((state) => ({
      ...state,
      faultHistory: [...state.faultHistory, { faultType, timestampMs }],
    })),

  resetSession: () => set({ ...INITIAL_STATE }),
}));
