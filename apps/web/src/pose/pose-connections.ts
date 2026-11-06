/**
 * pose-connections.ts
 *
 * MediaPipe PoseLandmarker skeleton connections (pose_landmarks_connections).
 * Each pair is [landmarkIndexA, landmarkIndexB]. Used by PoseOverlay to draw
 * the skeleton on the canvas.
 */

export const POSE_LANDMARKS_CONNECTIONS: [number, number][] = [
  // Face
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 7],
  [0, 4],
  [4, 5],
  [5, 6],
  [6, 8],
  // Upper body
  [9, 10],
  [11, 12],
  [11, 13],
  [13, 15],
  [15, 17],
  [15, 19],
  [15, 21],
  [17, 19],
  [12, 14],
  [14, 16],
  [16, 18],
  [16, 20],
  [16, 22],
  [18, 20],
  // Torso
  [11, 23],
  [12, 24],
  [23, 24],
  // Lower body
  [23, 25],
  [25, 27],
  [27, 29],
  [29, 31],
  [27, 31],
  [24, 26],
  [26, 28],
  [28, 30],
  [30, 32],
  [28, 32],
];
