import { describe, expect, it } from 'vitest';
import {
  angleABC,
  angleABC2d,
  clamp,
  cross,
  degToRad,
  distance,
  dot,
  isFiniteVector,
  norm,
  radToDeg,
  sqNorm,
  sub,
} from '../src/engine/math';

describe('vector math', () => {
  it('sub computes component-wise difference', () => {
    expect(sub({ x: 3, y: 4, z: 5 }, { x: 1, y: 1, z: 1 })).toEqual({
      x: 2,
      y: 3,
      z: 4,
    });
  });

  it('dot product', () => {
    expect(dot({ x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBe(1);
    expect(dot({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toBe(0);
  });

  it('norm and distance', () => {
    expect(norm({ x: 3, y: 4, z: 0 })).toBe(5);
    expect(distance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBe(5);
  });

  it('cross product orthogonality', () => {
    const c = cross({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    expect(dot(c, { x: 1, y: 0, z: 0 })).toBeCloseTo(0, 10);
    expect(dot(c, { x: 0, y: 1, z: 0 })).toBeCloseTo(0, 10);
  });
});

describe('angleABC', () => {
  it('90 degree angle', () => {
    // A=(0,1,0), B=(0,0,0), C=(1,0,0) -> BA up, BC right -> 90 deg
    expect(angleABC({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBeCloseTo(
      90,
      10
    );
  });

  it('180 degree straight angle', () => {
    // A and C on opposite rays from B
    expect(angleABC({ x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })).toBeCloseTo(
      180,
      10
    );
  });

  it('0 degree angle (A and C same direction)', () => {
    expect(angleABC({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 2, z: 0 })).toBeCloseTo(
      0,
      10
    );
  });

  it('45 degree angle', () => {
    // BA=(0,1,0), BC=(1,1,0) -> cos = 1/sqrt(2)
    expect(angleABC({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 })).toBeCloseTo(
      45,
      10
    );
  });

  it('symmetry: angle(a,b,c) == angle(c,b,a)', () => {
    const a = { x: 0, y: 1, z: 0 };
    const b = { x: 0, y: 0, z: 0 };
    const c = { x: 1, y: 1, z: 0 };
    expect(angleABC(a, b, c)).toBeCloseTo(angleABC(c, b, a) as number, 10);
  });

  it('degenerate zero vector returns null (not NaN)', () => {
    expect(angleABC({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBeNull();
    expect(angleABC({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toBeNull();
  });

  it('NaN/Infinity inputs return null', () => {
    expect(angleABC({ x: NaN, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBeNull();
    expect(
      angleABC({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: Infinity, y: 0, z: 0 })
    ).toBeNull();
  });

  it('result always within [0, 180]', () => {
    for (let i = 0; i < 50; i++) {
      const a = { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() * 2 - 1 };
      const b = { x: 0, y: 0, z: 0 };
      const c = { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() * 2 - 1 };
      const ang = angleABC(a, b, c);
      if (ang !== null) {
        expect(ang).toBeGreaterThanOrEqual(0);
        expect(ang).toBeLessThanOrEqual(180);
      }
    }
  });
});

describe('angleABC2d', () => {
  it('matches angleABC with z=0', () => {
    expect(angleABC2d({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(90, 10);
  });
});

describe('degrees/radians', () => {
  it('round trips', () => {
    expect(radToDeg(degToRad(90))).toBeCloseTo(90, 10);
    expect(degToRad(radToDeg(Math.PI))).toBeCloseTo(Math.PI, 10);
  });
});

describe('sqNorm', () => {
  it('returns sum of squared components', () => {
    expect(sqNorm({ x: 1, y: 2, z: 3 })).toBe(14);
    expect(sqNorm({ x: 0, y: 0, z: 0 })).toBe(0);
  });
});

describe('clamp', () => {
  it('clamps to [min, max]', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(100, 0, 10)).toBe(10);
  });
});

describe('isFiniteVector', () => {
  it('detects finite and non-finite vectors', () => {
    expect(isFiniteVector({ x: 1, y: 2, z: 3 })).toBe(true);
    expect(isFiniteVector({ x: NaN, y: 2, z: 3 })).toBe(false);
    expect(isFiniteVector({ x: 1, y: Infinity, z: 3 })).toBe(false);
  });
});

describe('angleABC cosine clamping (floating-point drift)', () => {
  it('clamps cosine slightly above 1 back to 0 degrees', () => {
    // near-identical large vectors can produce cos = 1.0000000000000002 > 1
    const v = { x: 1738164447566461.5, y: -4252136873238741, z: 1661709052586721.8 };
    expect(angleABC(v, { x: 0, y: 0, z: 0 }, v)).toBe(0);
  });

  it('clamps cosine slightly below -1 back to 180 degrees', () => {
    // near-opposite large vectors can produce cos = -1.0000000000000002 < -1
    const v = { x: -4584289762936828, y: -9376401921781036, z: 1797515951745367.5 };
    expect(angleABC(v, { x: 0, y: 0, z: 0 }, { x: -v.x, y: -v.y, z: -v.z })).toBe(180);
  });

  it('overflow produces NaN cosine -> null (not a thrown error)', () => {
    expect(
      angleABC({ x: 1e200, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1e200, y: 0, z: 0 })
    ).toBeNull();
  });
});
