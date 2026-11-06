import { describe, expect, it } from 'vitest';
import { elbowFlexion, frontalPoints, kneeFlexion, trunkLean } from '../src/engine/angles';

const standing = {
  timestampMs: 0,
  landmarks: [
    { index: 23, x: 0, y: 0, z: 0, visibility: 1 }, // left hip
    { index: 25, x: 0, y: 1, z: 0, visibility: 1 }, // left knee
    { index: 27, x: 0, y: 2, z: 0, visibility: 1 }, // left ankle
    { index: 11, x: 0, y: -1, z: 0, visibility: 1 }, // left shoulder
    { index: 13, x: 0, y: -2, z: 0, visibility: 1 }, // left elbow
    { index: 15, x: 0, y: -3, z: 0, visibility: 1 }, // left wrist
  ],
};

describe('joint angles', () => {
  it('knee flexion standing ~180', () => {
    expect(kneeFlexion(standing, 'left')).toBeCloseTo(180, 1);
  });

  it('elbow flexion straight arm ~180', () => {
    expect(elbowFlexion(standing, 'left')).toBeCloseTo(180, 1);
  });

  it('returns null when a landmark is missing', () => {
    const noKnee = {
      ...standing,
      landmarks: standing.landmarks.filter((lm) => lm.index !== 25),
    };
    expect(kneeFlexion(noKnee, 'left')).toBeNull();
    const noElbow = {
      ...standing,
      landmarks: standing.landmarks.filter((lm) => lm.index !== 13),
    };
    expect(elbowFlexion(noElbow, 'left')).toBeNull();
  });

  it('returns null when a landmark has non-finite coordinates', () => {
    const bad = {
      ...standing,
      landmarks: standing.landmarks.map((lm) => (lm.index === 25 ? { ...lm, x: NaN } : lm)),
    };
    expect(kneeFlexion(bad, 'left')).toBeNull();
  });

  it('trunk lean', () => {
    expect(trunkLean(standing)).toBeCloseTo(180, 1);
  });

  it('right side knee flexion', () => {
    const right = {
      ...standing,
      landmarks: [
        { index: 24, x: 0, y: 0, z: 0, visibility: 1 },
        { index: 26, x: 0, y: 1, z: 0, visibility: 1 },
        { index: 28, x: 0, y: 2, z: 0, visibility: 1 },
      ],
    };
    expect(kneeFlexion(right, 'right')).toBeCloseTo(180, 1);
  });

  it('right side frontal points', () => {
    const right = {
      ...standing,
      landmarks: [
        { index: 24, x: 5, y: 0, z: 0, visibility: 1 },
        { index: 26, x: 5, y: 1, z: 0, visibility: 1 },
        { index: 28, x: 5, y: 2, z: 0, visibility: 1 },
      ],
    };
    expect(frontalPoints(right, 'right')).toEqual({
      hip: { x: 5, y: 0 },
      knee: { x: 5, y: 1 },
      ankle: { x: 5, y: 2 },
    });
  });
});

describe('frontalPoints', () => {
  it('returns hip/knee/ankle xy for a side', () => {
    const pts = frontalPoints(standing, 'left');
    expect(pts).toEqual({
      hip: { x: 0, y: 0 },
      knee: { x: 0, y: 1 },
      ankle: { x: 0, y: 2 },
    });
  });

  it('returns null when a landmark is missing', () => {
    const bad = {
      ...standing,
      landmarks: standing.landmarks.filter((lm) => lm.index !== 27),
    };
    expect(frontalPoints(bad, 'left')).toBeNull();
  });
});
