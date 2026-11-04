import { describe, expect, it } from 'vitest';
import { RepMachine } from '../src/engine/rep-machine';
import type { RepRecord } from '../src/engine/types';

describe('RepMachine configuration validation', () => {
  it('throws on invalid config values', () => {
    expect(() => new RepMachine({ minRepDurationMs: 0 })).toThrow();
    expect(() => new RepMachine({ minRepRomDeg: 0 })).toThrow();
    expect(() => new RepMachine({ hysteresisDeg: 0 })).toThrow();
    expect(() => new RepMachine({ dropoutTimeoutMs: 0 })).toThrow();
    expect(() => new RepMachine({ minRepDurationMs: -1 })).toThrow();
  });

  it('accepts valid config and starts idle', () => {
    const m = new RepMachine();
    expect(m.currentState).toBe('idle');
    expect(m.count).toBe(0);
  });
});

describe('RepMachine input validation', () => {
  it('throws on non-finite angleDeg', () => {
    const m = new RepMachine();
    expect(() => m.update(Infinity, 0)).toThrow('angleDeg must be finite or null');
    expect(() => m.update(NaN, 0)).toThrow('angleDeg must be finite or null');
    // null is allowed (tracking lost)
    expect(() => m.update(null, 0)).not.toThrow();
  });
});

describe('RepMachine counting clean reps (direction decreasing)', () => {
  it('counts N clean squat reps exactly', () => {
    const m = new RepMachine({
      direction: 'decreasing',
      minRepDurationMs: 400,
      minRepRomDeg: 30,
      hysteresisDeg: 5,
      dropoutTimeoutMs: 1000,
    });
    // Standing ~170, squat bottom ~90. Descend then ascend.
    const frames: [number, number | null][] = [
      [0, 170],
      [100, 150],
      [200, 120],
      [300, 95],
      [400, 90], // descend
      [500, 95],
      [600, 120],
      [700, 150],
      [800, 170], // ascend -> rep 1
      [900, 170],
      [1000, 150],
      [1100, 120],
      [1200, 95],
      [1300, 90], // descend 2
      [1400, 95],
      [1500, 120],
      [1600, 150],
      [1700, 170], // ascend -> rep 2
    ];
    let completed = 0;
    for (const [t, angle] of frames) {
      const out = m.update(angle, t);
      if (out.event === 'rep-completed') completed++;
    }
    expect(completed).toBe(2);
    expect(m.count).toBe(2);
  });

  it('rep record contains duration, ROM, min/max angle, peak velocity', () => {
    const m = new RepMachine({ minRepDurationMs: 100, minRepRomDeg: 10, hysteresisDeg: 2 });
    let captured: RepRecord | null = null;
    const frames = [
      [0, 170],
      [50, 140],
      [100, 100],
      [150, 100],
      [200, 140],
      [250, 170],
    ];
    for (const [t, angle] of frames) {
      const out = m.update(angle, t);
      if (out.event === 'rep-completed' && out.rep) captured = out.rep;
    }
    expect(captured).not.toBeNull();
    expect(captured.repIndex).toBe(1);
    expect(captured.durationMs).toBe(200);
    expect(captured.romDeg).toBeCloseTo(70, 0);
    expect(captured.minAngleDeg).toBeCloseTo(100, 0);
    expect(captured.maxAngleDeg).toBeCloseTo(170, 0);
    expect(captured.peakVelocityDegPerS).toBeGreaterThan(0);
    expect(captured.faults).toEqual([]);
  });
});

describe('RepMachine hysteresis prevents double counting', () => {
  it('no double count when noise wobbles near the bottom within hysteresis', () => {
    const m = new RepMachine({
      direction: 'decreasing',
      minRepDurationMs: 200,
      minRepRomDeg: 30,
      hysteresisDeg: 8,
      dropoutTimeoutMs: 1000,
    });
    let completed = 0;
    // Descend past hysteresis, wobble around bottom (within band), ascend once.
    const frames: [number, number | null][] = [
      [0, 170],
      [100, 150],
      [200, 120],
      [300, 95],
      [400, 90],
      [500, 88],
      [600, 91],
      [700, 89],
      [800, 92], // wobble within hysteresis band around bottom
      [900, 110],
      [1000, 140],
      [1100, 170], // ascend
    ];
    for (const [t, angle] of frames) {
      const out = m.update(angle, t);
      if (out.event === 'rep-completed') completed++;
    }
    expect(completed).toBe(1);
    expect(m.count).toBe(1);
  });

  it('direction increasing counts reps too', () => {
    const m = new RepMachine({
      direction: 'increasing',
      minRepDurationMs: 200,
      minRepRomDeg: 30,
      hysteresisDeg: 5,
      dropoutTimeoutMs: 1000,
    });
    // Rest 0, exercise extreme 100, back to 0.
    const frames = [
      [0, 0],
      [100, 40],
      [200, 80],
      [300, 110],
      [400, 100],
      [500, 70],
      [600, 30],
      [700, 0],
    ];
    let completed = 0;
    for (const [t, angle] of frames) {
      const out = m.update(angle, t);
      if (out.event === 'rep-completed') completed++;
    }
    expect(completed).toBe(1);
  });
});

describe('RepMachine rejects partial reps', () => {
  it('ignores a rep below min ROM', () => {
    const m = new RepMachine({
      direction: 'decreasing',
      minRepDurationMs: 200,
      minRepRomDeg: 50,
      hysteresisDeg: 5,
      dropoutTimeoutMs: 1000,
    });
    // Only 20 deg ROM (below 50) -> not counted
    const frames = [
      [0, 170],
      [100, 160],
      [200, 150],
      [300, 160],
      [400, 170],
    ];
    let completed = 0;
    for (const [t, angle] of frames) {
      const out = m.update(angle, t);
      if (out.event === 'rep-completed') completed++;
    }
    expect(completed).toBe(0);
    expect(m.count).toBe(0);
  });

  it('ignores a rep below min duration', () => {
    const m = new RepMachine({
      direction: 'decreasing',
      minRepDurationMs: 1000,
      minRepRomDeg: 30,
      hysteresisDeg: 5,
      dropoutTimeoutMs: 1000,
    });
    const frames = [
      [0, 170],
      [100, 90],
      [200, 170],
    ]; // too fast (200ms < 1000)
    let completed = 0;
    for (const [t, angle] of frames) {
      const out = m.update(angle, t);
      if (out.event === 'rep-completed') completed++;
    }
    expect(completed).toBe(0);
    expect(m.count).toBe(0);
  });
});

describe('RepMachine tracking dropouts', () => {
  it('brief null frames mid-rep do not abort', () => {
    const m = new RepMachine({
      direction: 'decreasing',
      minRepDurationMs: 200,
      minRepRomDeg: 30,
      hysteresisDeg: 5,
      dropoutTimeoutMs: 1000,
    });
    let completed = 0;
    const frames: [number, number | null][] = [
      [0, 170],
      [100, 140],
      [200, null],
      [300, null],
      [400, 100],
      [500, 120],
      [600, 150],
      [700, 170],
    ];
    for (const [t, angle] of frames) {
      const out = m.update(angle, t);
      if (out.event === 'rep-completed') completed++;
    }
    expect(completed).toBe(1);
  });

  it('prolonged dropout aborts the in-progress rep', () => {
    const m = new RepMachine({
      direction: 'decreasing',
      minRepDurationMs: 200,
      minRepRomDeg: 30,
      hysteresisDeg: 5,
      dropoutTimeoutMs: 400,
    });
    let aborted = 0;
    const frames: [number, number | null][] = [
      [0, 170],
      [100, 140],
      [200, 110], // descending
      [1000, null],
      [1500, null],
      [2000, null], // dropout > 400ms
      [2500, 170],
    ];
    for (const [t, angle] of frames) {
      const out = m.update(angle, t);
      if (out.event === 'rep-aborted') aborted++;
    }
    expect(aborted).toBe(1);
    expect(m.currentState).toBe('idle');
  });
});

describe('RepMachine idle edge cases', () => {
  it('idle frame at rest angle after rest is set does not start a rep', () => {
    const m = new RepMachine({
      direction: 'decreasing',
      minRepDurationMs: 100,
      minRepRomDeg: 10,
      hysteresisDeg: 5,
      dropoutTimeoutMs: 1000,
    });
    m.update(170, 0); // establishes rest angle 170
    m.update(170, 50); // at rest, movement not past hysteresis -> idle 'none'
    expect(m.currentState).toBe('idle');
    expect(m.count).toBe(0);
  });

  it('direction increasing: idle frame at rest does not start a rep', () => {
    const m = new RepMachine({
      direction: 'increasing',
      minRepDurationMs: 100,
      minRepRomDeg: 10,
      hysteresisDeg: 5,
      dropoutTimeoutMs: 1000,
    });
    m.update(0, 0); // establishes rest angle 0
    m.update(0, 50); // at rest, not started -> idle 'none'
    expect(m.currentState).toBe('idle');
    expect(m.count).toBe(0);
  });
});

describe('RepMachine reset', () => {
  it('returns to idle and discards in-progress rep', () => {
    const m = new RepMachine({ minRepDurationMs: 100, minRepRomDeg: 10, hysteresisDeg: 2 });
    m.update(170, 0);
    m.update(100, 100); // descending
    expect(m.currentState).toBe('descending');
    m.reset();
    expect(m.currentState).toBe('idle');
    expect(m.count).toBe(0);
  });
});
