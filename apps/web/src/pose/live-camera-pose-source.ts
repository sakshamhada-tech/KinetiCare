/**
 * live-camera-pose-source.ts
 *
 * Browser-only PoseSource backed by MediaPipe PoseLandmarker (Tasks Vision).
 * Loads WASM + model from same-origin local assets (no CDN URLs). Handles
 * getUserMedia permission failures gracefully with specific error categories.
 *
 * This module is framework-free (no React). UI components consume it through
 * the PoseSource interface from packages/shared.
 */

import { PoseLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { Landmark } from '@kineticare/shared';
import type { PoseResult, PoseSource, PoseSourceConfig } from '@kineticare/shared';

/** Error category for camera/permission failures. */
export type CameraErrorKind =
  | 'permission-denied'
  | 'no-device'
  | 'device-in-use'
  | 'not-allowed'
  | 'not-found'
  | 'not-supported'
  | 'aborted'
  | 'overconstrained'
  | 'unknown';

export interface CameraError {
  kind: CameraErrorKind;
  message: string;
  original?: Error;
}

/** Default confidence threshold for emitting a landmark. */
const DEFAULT_MIN_CONFIDENCE = 0.5;

/** Paths relative to the serving origin. */
const WASM_DIR = '/mediapipe/wasm';
const MODEL_PATH = '/models/pose_landmarker_lite.task';

function categoriseCameraError(err: unknown): CameraError {
  const name = err instanceof Error ? err.name : String(err);
  const message = err instanceof Error ? err.message : String(err);
  const lower = (name + ' ' + message).toLowerCase();

  if (lower.includes('permission denied') || lower.includes('notallowed')) {
    return { kind: 'permission-denied', message, original: err instanceof Error ? err : undefined };
  }
  if (lower.includes('no device') || lower.includes('devicenotfound')) {
    return { kind: 'no-device', message, original: err instanceof Error ? err : undefined };
  }
  if (lower.includes('in use') || lower.includes('notreadable')) {
    return { kind: 'device-in-use', message, original: err instanceof Error ? err : undefined };
  }
  if (lower.includes('not allowed') || lower.includes('securityerror')) {
    return { kind: 'not-allowed', message, original: err instanceof Error ? err : undefined };
  }
  if (lower.includes('not found')) {
    return { kind: 'not-found', message, original: err instanceof Error ? err : undefined };
  }
  if (lower.includes('not supported')) {
    return { kind: 'not-supported', message, original: err instanceof Error ? err : undefined };
  }
  if (lower.includes('aborted')) {
    return { kind: 'aborted', message, original: err instanceof Error ? err : undefined };
  }
  if (lower.includes('overconstrained')) {
    return { kind: 'overconstrained', message, original: err instanceof Error ? err : undefined };
  }
  return { kind: 'unknown', message, original: err instanceof Error ? err : undefined };
}

/**
 * LiveCameraPoseSource — streams camera frames through MediaPipe PoseLandmarker
 * and emits PoseResult events.
 */
export class LiveCameraPoseSource implements PoseSource {
  private poseLandmarker: PoseLandmarker | null = null;
  private stream: MediaStream | null = null;
  private animationFrameId: number | null = null;
  private callbacks: Set<(result: PoseResult) => void> = new Set();
  private config: PoseSourceConfig;
  private active = false;
  private cameraError: CameraError | null = null;
  private _videoElement: HTMLVideoElement | null = null;

  constructor(config: PoseSourceConfig = {}) {
    this.config = {
      minLandmarkConfidence: DEFAULT_MIN_CONFIDENCE,
      requireAllLandmarks: false,
      ...config,
    };
  }

  /** Last camera error, if any. Null when no error has occurred. */
  get error(): CameraError | null {
    return this.cameraError;
  }

  /** The underlying <video> element (created in start()). Null until started. */
  get videoElement(): HTMLVideoElement | null {
    return this._videoElement;
  }

  /** Whether the source is currently active/emitting. */
  isActive(): boolean {
    return this.active;
  }

  /** Register a result callback. */
  onResult(callback: (result: PoseResult) => void): void {
    this.callbacks.add(callback);
  }

  /** Remove a previously registered callback. */
  offResult(callback: (result: PoseResult) => void): void {
    this.callbacks.delete(callback);
  }

  private emit(result: PoseResult): void {
    for (const cb of this.callbacks) {
      try {
        cb(result);
      } catch {
        // Swallow callback errors so one bad listener doesn't break the stream.
      }
    }
  }

  /**
   * Start the source: request camera, load MediaPipe model, begin detection loop.
   * Rejects with a CameraError on any failure.
   */
  async start(): Promise<void> {
    if (this.active) {
      return;
    }

    this.cameraError = null;

    try {
      const videoEl = document.createElement('video');
      videoEl.playsInline = true;
      videoEl.muted = true;
      this._videoElement = videoEl;

      const stream = await this.requestCameraStream();
      this.stream = stream;
      videoEl.srcObject = stream;

      await new Promise<void>((resolve, reject) => {
        const onLoaded = () => {
          videoEl.removeEventListener('loadeddata', onLoaded);
          resolve();
        };
        const onError = (evt: Event) => {
          videoEl.removeEventListener('loadeddata', onLoaded);
          reject(new Error(`Video element failed to load: ${evt.type}`));
        };
        videoEl.addEventListener('loadeddata', onLoaded, { once: true });
        videoEl.addEventListener('error', onError, { once: true });
        videoEl.play().catch((err) => {
          // play() may fail before loadeddata fires; that's OK, we wait for loadeddata.
          console.warn('[LiveCameraPoseSource] video.play() warning:', err);
        });
      });

      await this.loadPoseLandmarker();

      this.active = true;
      this.requestAnimationFrame();
    } catch (err) {
      this.cameraError = categoriseCameraError(err);
      await this.cleanup();
      throw this.cameraError;
    }
  }

  private async requestCameraStream(): Promise<MediaStream> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      throw new Error('navigator.mediaDevices is not available in this environment');
    }

    try {
      return await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
    } catch (err) {
      const cameraErr = categoriseCameraError(err);
      throw cameraErr.original ?? cameraErr;
    }
  }

  private async loadPoseLandmarker(): Promise<void> {
    if (!this._videoElement) {
      throw new Error('Video element not initialised before loading PoseLandmarker');
    }

    // FilesetResolver loads the WASM runtime from a same-origin directory.
    const wasmFileset = await FilesetResolver.forVisionTasks(WASM_DIR);

    this.poseLandmarker = await PoseLandmarker.createFromOptions(wasmFileset, {
      baseOptions: {
        modelAssetPath: MODEL_PATH,
        delegate: 'CPU',
      },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: this.config.minLandmarkConfidence,
      minPosePresenceConfidence: this.config.minLandmarkConfidence,
      minTrackingConfidence: this.config.minLandmarkConfidence,
    });
  }

  private requestAnimationFrame(): void {
    if (!this.active || !this._videoElement || !this.poseLandmarker) {
      return;
    }

    // MediaPipe VIDEO mode: synchronously detect landmarks on each frame.
    const nowMs = performance.now();
    const result = this.poseLandmarker.detectForVideo(this._videoElement, nowMs);

    const landmarks: Landmark[] = (result.landmarks[0] ?? []).map(
      (lm: NormalizedLandmark, index: number) => ({
        index,
        x: lm.x,
        y: lm.y,
        z: lm.z,
        visibility: lm.visibility,
      })
    );

    this.emit({
      landmarks,
      timestampMs: nowMs,
    });

    this.animationFrameId = requestAnimationFrame(() => this.requestAnimationFrame());
  }

  /**
   * Stop the source: release camera, dispose model, stop detection loop.
   */
  async stop(): Promise<void> {
    if (!this.active) {
      return;
    }

    this.active = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.poseLandmarker) {
      try {
        this.poseLandmarker.close();
      } catch {
        // Best-effort disposal.
      }
      this.poseLandmarker = null;
    }

    await this.cleanup();
  }

  private async cleanup(): Promise<void> {
    if (this.stream) {
      try {
        this.stream.getTracks().forEach((track) => track.stop());
      } catch {
        // Best-effort track stop.
      }
      this.stream = null;
    }

    if (this._videoElement) {
      this._videoElement.srcObject = null;
      this._videoElement = null;
    }
  }
}
