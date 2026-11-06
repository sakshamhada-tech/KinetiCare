/**
 * Pure vector / angle math.
 *
 * All angles are the smaller angle between two vectors in degrees [0, 180].
 * Degenerate (zero-length) vectors return null -- callers must gate on null,
 * never produce NaN.
 */

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export function sub(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function dot(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function norm(a: Vector3): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

export function sqNorm(a: Vector3): number {
  return a.x * a.x + a.y * a.y + a.z * a.z;
}

export function distance(a: Vector3, b: Vector3): number {
  return norm(sub(a, b));
}

/**
 * Angle ABC at B, in degrees [0, 180].
 * Returns null if BA or BC is degenerate (zero length).
 * Never returns NaN (cosine clamped to [-1, 1]).
 */
export function angleABC(a: Vector3, b: Vector3, c: Vector3): number | null {
  const ba = sub(a, b);
  const bc = sub(c, b);
  const na = norm(ba);
  const nb = norm(bc);
  if (na === 0 || nb === 0 || !Number.isFinite(na) || !Number.isFinite(nb)) {
    return null;
  }
  let cos = dot(ba, bc) / (na * nb);
  // Clamp against floating-point drift outside [-1, 1].
  if (cos > 1) cos = 1;
  if (cos < -1) cos = -1;
  if (!Number.isFinite(cos)) return null;
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * 2D variant (z ignored) for normalized image landmarks.
 */
export function angleABC2d(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
): number | null {
  return angleABC({ x: a.x, y: a.y, z: 0 }, { x: b.x, y: b.y, z: 0 }, { x: c.x, y: c.y, z: 0 });
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function isFiniteVector(v: Vector3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}
