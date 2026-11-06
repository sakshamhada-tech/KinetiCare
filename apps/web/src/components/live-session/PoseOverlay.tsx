/**
 * PoseOverlay.tsx
 *
 * Canvas overlay that draws MediaPipe pose landmarks and skeleton connections
 * on top of the camera video. Mirrors the video element's size and draws at
 * each PoseResult.
 *
 * Landmarks are normalised [0,1] coordinates; the canvas scales them to the
 * element's bounding box.
 */

import { useEffect, useRef, useCallback } from 'react';
import { usePoseSession } from '../../pose/use-pose-session';
import { POSE_LANDMARKS_CONNECTIONS } from '../../pose/pose-connections';
import type { PoseResult } from '@kineticare/shared';

interface PoseOverlayProps {
  /** Video element whose dimensions the canvas mirrors. */
  video: HTMLVideoElement | null;
  /** Optional callback fired whenever landmarks are drawn. */
  onPoseResult?: (result: PoseResult) => void;
}

export function PoseOverlay({ video, onPoseResult }: PoseOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { landmarks, timestampMs } = usePoseSession();

  // Resize canvas to match video dimensions.
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const vid = video;
    if (!canvas || !vid) return;
    const rect = vid.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }, [video]);

  useEffect(() => {
    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    const vid = video;
    if (vid) ro.observe(vid);
    return () => ro.disconnect();
  }, [video, resizeCanvas]);

  // Draw whenever landmarks change.
  useEffect(() => {
    if (!landmarks || !video) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    if (width === 0 || height === 0) return;

    ctx.clearRect(0, 0, width, height);

    // Draw skeleton connections.
    ctx.strokeStyle = '#10b981'; // emerald-500
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const [a, b] of POSE_LANDMARKS_CONNECTIONS) {
      const la = landmarks.find((l) => l.index === a);
      const lb = landmarks.find((l) => l.index === b);
      if (!la || !lb) continue;
      if (la.visibility < 0.3 || lb.visibility < 0.3) continue;
      ctx.beginPath();
      ctx.moveTo(la.x * width, la.y * height);
      ctx.lineTo(lb.x * width, lb.y * height);
      ctx.stroke();
    }

    // Draw landmark points.
    ctx.fillStyle = '#34d399'; // emerald-400
    for (const lm of landmarks) {
      if (lm.visibility < 0.3) continue;
      ctx.beginPath();
      ctx.arc(lm.x * width, lm.y * height, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (onPoseResult) {
      onPoseResult({ landmarks: [...landmarks], timestampMs });
    }
  }, [landmarks, timestampMs, video, onPoseResult]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
    />
  );
}
