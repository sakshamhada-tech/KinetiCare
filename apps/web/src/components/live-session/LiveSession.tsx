/**
 * LiveSession.tsx
 *
 * Live Session screen: camera-based pose tracking with rep counting, fault
 * detection, and audio cues. Can also run in replay mode from a recorded
 * fixture for offline testing/demos.
 *
 * Wires LiveCameraPoseSource / ReplayPoseSource through the PoseSource
 * interface into the UI: overlay canvas, rep counter, fault banner, audio cues.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePoseSession } from '../../pose/use-pose-session';
import { LiveCameraPoseSource, type CameraErrorKind } from '../../pose/live-camera-pose-source';
import type { ReplayPoseSource } from '../../pose/replay-pose-source';
import { PoseOverlay } from './PoseOverlay';
import { RepCounter } from './RepCounter';
import { FaultBanner } from './FaultBanner';
import { AudioCues } from './AudioCues';
import { RepMachine } from '@kineticare/shared';
import type { PoseResult, Landmark, FaultType } from '@kineticare/shared';
import type { RepRecordSummary } from '../../pose/use-pose-session';

const DEFAULT_TARGET_REPS = 10;

export function LiveSession() {
  const [sourceType, setSourceType] = useState<'camera' | 'replay' | null>(null);
  const [cameraError, setCameraError] = useState<CameraErrorKind | null>(null);
  const displayVideoRef = useRef<HTMLVideoElement | null>(null);

  const poseSourceRef = useRef<LiveCameraPoseSource | ReplayPoseSource | null>(null);
  const repMachineRef = useRef<RepMachine>(new RepMachine());

  const {
    startSession,
    stopSession,
    setLandmarks,
    setCameraError: storeSetCameraError,
    setRepCount,
    setCurrentRep,
    addCompletedRep,
    setActiveFault,
    isActive,
    repCount,
  } = usePoseSession();

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (poseSourceRef.current) {
        poseSourceRef.current.stop().catch(() => {
          // Best-effort cleanup.
        });
      }
    };
  }, []);

  // When the camera source starts, mirror its stream to the display video.
  useEffect(() => {
    if (
      sourceType === 'camera' &&
      poseSourceRef.current instanceof LiveCameraPoseSource &&
      poseSourceRef.current.videoElement &&
      displayVideoRef.current
    ) {
      displayVideoRef.current.srcObject = poseSourceRef.current.videoElement.srcObject;
    }
  }, [sourceType]);

  const handlePoseResult = useCallback(
    (result: PoseResult) => {
      setLandmarks(result.landmarks, result.timestampMs);

      // Compute knee flexion angle (right side, 2D image plane).
      const angle = kneeFlexionAngle(result.landmarks);
      const outcome = repMachineRef.current.update(angle, result.timestampMs);

      if (outcome.event === 'rep-completed' && outcome.rep) {
        const summary: RepRecordSummary = {
          repIndex: outcome.rep.repIndex,
          durationMs: outcome.rep.durationMs,
          romDeg: outcome.rep.romDeg,
          peakVelocityDegPerS: outcome.rep.peakVelocityDegPerS,
          faults: outcome.rep.faults as FaultType[],
        };
        addCompletedRep(summary);
        setRepCount(repCount + 1);
        setCurrentRep(null);
      } else if (outcome.event === 'rep-aborted') {
        setCurrentRep(null);
      }

      // Simple fault detection: knee valgus proxy using hip-knee-ankle.
      const fault = detectKneeValgusFault(result.landmarks);
      setActiveFault(fault.fault ? fault.type : null, fault.fault ? fault.cue : null);

      if (outcome.event === 'rep-completed' && outcome.rep) {
        setCurrentRep({
          repIndex: outcome.rep.repIndex,
          durationMs: outcome.rep.durationMs,
          romDeg: outcome.rep.romDeg,
          peakVelocityDegPerS: outcome.rep.peakVelocityDegPerS,
          faults: outcome.rep.faults as FaultType[],
        });
      }
    },
    [addCompletedRep, setRepCount, setCurrentRep, setActiveFault, setLandmarks, repCount]
  );

  const startCamera = useCallback(async () => {
    setCameraError(null);
    const source = new LiveCameraPoseSource({
      minLandmarkConfidence: 0.5,
      requireAllLandmarks: false,
    });

    source.onResult(handlePoseResult);

    try {
      await source.start();
      setSourceType('camera');
      poseSourceRef.current = source;
      startSession('camera', DEFAULT_TARGET_REPS);
    } catch (err) {
      const cameraErr = err as { kind?: CameraErrorKind; message?: string };
      setCameraError(cameraErr.kind ?? 'unknown');
      storeSetCameraError(cameraErr.message ?? 'Camera start failed');
    }
  }, [handlePoseResult, startSession, storeSetCameraError]);

  const startReplay = useCallback(async () => {
    setCameraError(null);
    setSourceType('replay');
    startSession('replay', DEFAULT_TARGET_REPS);
  }, [startSession]);

  const handleStop = useCallback(async () => {
    if (poseSourceRef.current) {
      await poseSourceRef.current.stop();
      poseSourceRef.current = null;
    }
    setSourceType(null);
    if (displayVideoRef.current) {
      displayVideoRef.current.srcObject = null;
    }
    stopSession();
  }, [stopSession]);

  // Resolve the video element for the overlay: camera source exposes its
  // internal <video> element; replay mode has no video.
  const overlayVideo =
    sourceType === 'camera' && poseSourceRef.current instanceof LiveCameraPoseSource
      ? poseSourceRef.current.videoElement
      : null;

  return (
    <div className="live-session relative min-h-screen bg-slate-50">
      <AudioCues />
      <FaultBanner />

      {/* Camera error banner */}
      {cameraError && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 shadow-lg"
          role="alert"
          aria-live="polite"
        >
          <span className="font-medium">Camera unavailable</span>
          <span className="text-sm">{cameraError}</span>
        </div>
      )}

      <main className="relative z-10 max-w-6xl mx-auto p-6">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Live Session</h1>
          <p className="text-slate-600">
            Real-time pose tracking with rep counting and form feedback.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video + canvas area */}
          <div className="lg:col-span-2 relative aspect-video w-full rounded-xl border border-slate-200 bg-slate-900 overflow-hidden shadow-lg">
            <video ref={displayVideoRef} autoPlay playsInline muted className="w-full h-full" />
            {overlayVideo ? (
              <PoseOverlay video={overlayVideo} />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                {sourceType === 'camera' && cameraError === null ? (
                  <p className="animate-pulse">Loading camera…</p>
                ) : (
                  <p>Start session to enable camera tracking.</p>
                )}
              </div>
            )}
          </div>

          {/* Controls panel */}
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900 mb-3">Controls</h2>
              <div className="flex gap-2">
                <button
                  onClick={startCamera}
                  disabled={isActive || sourceType === 'camera'}
                  className="flex-1 px-4 py-2 rounded-md border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:pointer-events-none"
                >
                  Start Camera
                </button>
                <button
                  onClick={startReplay}
                  disabled={isActive || sourceType === 'replay'}
                  className="flex-1 px-4 py-2 rounded-md border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:pointer-events-none"
                >
                  Replay Fixture
                </button>
              </div>
              {isActive && (
                <button
                  onClick={handleStop}
                  className="mt-3 w-full px-4 py-2 rounded-md border border-red-200 bg-red-50 text-sm font-medium text-red-700 hover:bg-red-100"
                >
                  Stop Session
                </button>
              )}
            </div>

            <RepCounter />
          </div>
        </div>

        <footer className="mt-8 text-xs text-slate-500">
          Pose data stays in the browser — no video or landmarks leave this device.
        </footer>
      </main>
    </div>
  );
}

/**
 * Compute knee flexion angle (degrees) from 2D landmarks.
 * Angle at the knee between hip->knee and ankle->knee vectors.
 */
function kneeFlexionAngle(landmarks: Landmark[]): number | null {
  const get = (index: number): { x: number; y: number } | null => {
    const lm = landmarks.find((l) => l.index === index);
    return lm ? { x: lm.x, y: lm.y } : null;
  };

  const hip = get(23);
  const knee = get(25);
  const ankle = get(27);

  if (!hip || !knee || !ankle) return null;

  const ba = { x: hip.x - knee.x, y: hip.y - knee.y };
  const bc = { x: ankle.x - knee.x, y: ankle.y - knee.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const magBA = Math.hypot(ba.x, ba.y);
  const magBC = Math.hypot(bc.x, bc.y);
  if (magBA === 0 || magBC === 0) return null;
  const cos = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Simple knee valgus fault detection from landmarks.
 * Returns the fault type and cue if detected.
 */
function detectKneeValgusFault(landmarks: Landmark[]): {
  fault: boolean;
  type: FaultType | null;
  cue: string;
} {
  const getXY = (index: number): { x: number; y: number } | null => {
    const lm = landmarks.find((l) => l.index === index);
    return lm ? { x: lm.x, y: lm.y } : null;
  };

  const hip = getXY(23); // right hip
  const knee = getXY(25); // right knee
  const ankle = getXY(27); // right ankle

  if (!hip || !knee || !ankle) {
    return { fault: false, type: null, cue: '' };
  }

  // Valgus index: perpendicular distance of knee from hip->ankle line,
  // as % of leg length.
  const ahX = ankle.x - hip.x;
  const ahY = ankle.y - hip.y;
  const akX = knee.x - hip.x;
  const akY = knee.y - hip.y;
  const denom = Math.hypot(ahX, ahY);
  const legLen =
    Math.hypot(hip.x - knee.x, hip.y - knee.y) + Math.hypot(knee.x - ankle.x, knee.y - ankle.y);
  if (denom === 0 || legLen === 0) {
    return { fault: false, type: null, cue: '' };
  }
  const crossMag = Math.abs(ahX * akY - ahY * akX);
  const deviation = crossMag / denom;
  const valgusIndex = (deviation / legLen) * 100;

  // Threshold: 8% of leg length (matches squat thresholds default).
  if (valgusIndex > 8) {
    return {
      fault: true,
      type: 'knee-valgus',
      cue: 'Knees tracking inward - push them out over your toes',
    };
  }

  return { fault: false, type: null, cue: '' };
}
