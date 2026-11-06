/**
 * Repetition state machine. Pure and framework-free: time is passed in as
 * timestamps, no clocks, no DOM, no React.
 *
 * States: idle -> descending -> bottom -> ascending -> (rep complete / aborted) -> idle
 *
 * A rep is counted only when it reaches the extreme and returns toward rest,
 * clears the minimum duration and minimum ROM, and the hysteresis band prevents
 * double-counting on noisy frames around the reversal.
 */

import type { RepMachineConfig, RepMachineOutcome, RepRecord, RepState } from './types';

export interface AngleSample {
  t: number;
  angle: number;
}

const DEFAULT_CONFIG: RepMachineConfig = {
  direction: 'decreasing',
  minRepDurationMs: 800,
  minRepRomDeg: 40,
  hysteresisDeg: 5,
  dropoutTimeoutMs: 1500,
};

function isExtremeReversal(
  direction: 'decreasing' | 'increasing',
  angle: number,
  extreme: number,
  hysteresis: number
): boolean {
  return direction === 'decreasing' ? angle > extreme + hysteresis : angle < extreme - hysteresis;
}

function isPastRest(
  direction: 'decreasing' | 'increasing',
  angle: number,
  rest: number,
  hysteresis: number
): boolean {
  return direction === 'decreasing' ? angle > rest - hysteresis : angle < rest + hysteresis;
}

function romDeg(direction: 'decreasing' | 'increasing', rest: number, extreme: number): number {
  return direction === 'decreasing' ? rest - extreme : extreme - rest;
}

export class RepMachine {
  private state: RepState = 'idle';
  private config: RepMachineConfig;

  private repIndex = 0;
  private repStartTime = 0;
  private repStartAngle = 0; // rest angle, established when entering idle
  private repExtreme = 0;
  private samples: AngleSample[] = [];
  private lastValidTime = 0;
  private restAngleSet = false;

  constructor(config: Partial<RepMachineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.validate();
  }

  private validate(): void {
    const { minRepDurationMs, minRepRomDeg, hysteresisDeg, dropoutTimeoutMs } = this.config;
    if (!(minRepDurationMs > 0) || Number.isNaN(minRepDurationMs)) {
      throw new Error('RepMachine: minRepDurationMs must be > 0');
    }
    if (!(minRepRomDeg > 0) || Number.isNaN(minRepRomDeg)) {
      throw new Error('RepMachine: minRepRomDeg must be > 0');
    }
    if (!(hysteresisDeg > 0) || Number.isNaN(hysteresisDeg)) {
      throw new Error('RepMachine: hysteresisDeg must be > 0');
    }
    if (!(dropoutTimeoutMs > 0) || Number.isNaN(dropoutTimeoutMs)) {
      throw new Error('RepMachine: dropoutTimeoutMs must be > 0');
    }
  }

  /** Current state. */
  get currentState(): RepState {
    return this.state;
  }

  /** Total completed reps. */
  get count(): number {
    return this.repIndex;
  }

  /**
   * Feed one frame. `angleDeg` is null when tracking is lost for this frame.
   * Returns the machine outcome.
   */
  update(angleDeg: number | null, t: number): RepMachineOutcome {
    if (!Number.isFinite(t)) throw new Error('RepMachine: t must be finite');
    if (angleDeg !== null && !Number.isFinite(angleDeg)) {
      throw new Error('RepMachine: angleDeg must be finite or null');
    }

    // --- tracking dropout handling -------------------------------------
    if (angleDeg === null) {
      if (this.state !== 'idle' && t - this.lastValidTime > this.config.dropoutTimeoutMs) {
        return this.abort();
      }
      return { state: this.state, event: 'none' };
    }

    this.lastValidTime = t;
    this.samples.push({ t, angle: angleDeg });

    switch (this.state) {
      case 'idle':
        return this.handleIdle(angleDeg, t);
      case 'descending':
        return this.handleDescending(angleDeg, t);
      case 'bottom':
        return this.handleBottom(angleDeg, t);
      case 'ascending':
        return this.handleAscending(angleDeg, t);
    }
  }

  private handleIdle(angle: number, t: number): RepMachineOutcome {
    // Establish the rest angle on the first idle frame, then keep it stable.
    if (!this.restAngleSet) {
      this.repStartAngle = angle;
      this.restAngleSet = true;
      return { state: this.state, event: 'none' };
    }
    // Movement away from rest starts a rep.
    const threshold =
      this.config.direction === 'decreasing'
        ? this.repStartAngle - this.config.hysteresisDeg
        : this.repStartAngle + this.config.hysteresisDeg;
    const started = this.config.direction === 'decreasing' ? angle < threshold : angle > threshold;
    if (started) {
      this.state = 'descending';
      this.repStartTime = t;
      this.repExtreme = angle;
      this.samples = [{ t, angle }];
      return { state: this.state, event: 'none' };
    }
    return { state: this.state, event: 'none' };
  }

  private handleDescending(angle: number, t: number): RepMachineOutcome {
    const newExtreme =
      this.config.direction === 'decreasing'
        ? Math.min(this.repExtreme, angle)
        : Math.max(this.repExtreme, angle);
    this.repExtreme = newExtreme;
    // Reversal away from the extreme -> bottom -> ascending.
    if (
      isExtremeReversal(this.config.direction, angle, this.repExtreme, this.config.hysteresisDeg)
    ) {
      this.state = 'bottom';
      return this.handleBottom(angle, t);
    }
    return { state: this.state, event: 'none' };
  }

  private handleBottom(angle: number, t: number): RepMachineOutcome {
    // Bottom is transient: as soon as we move past the reversal band we ascend.
    if (
      isExtremeReversal(this.config.direction, angle, this.repExtreme, this.config.hysteresisDeg)
    ) {
      this.state = 'ascending';
      // The reversal frame may already be past rest (fast movement); evaluate now.
      return this.handleAscending(angle, t);
    }
    // Still at/below the extreme: keep tracking it.
    if (
      (this.config.direction === 'decreasing' && angle < this.repExtreme) ||
      (this.config.direction === 'increasing' && angle > this.repExtreme)
    ) {
      this.repExtreme = angle;
    }
    return { state: this.state, event: 'none' };
  }

  private handleAscending(angle: number, t: number): RepMachineOutcome {
    if (isPastRest(this.config.direction, angle, this.repStartAngle, this.config.hysteresisDeg)) {
      return this.complete(t);
    }
    return { state: this.state, event: 'none' };
  }

  private complete(t: number): RepMachineOutcome {
    const durationMs = t - this.repStartTime;
    const rom = romDeg(this.config.direction, this.repStartAngle, this.repExtreme);
    const peakVelocity = this.peakVelocity();
    const startedAt = this.repStartTime;
    const minAngleDeg =
      this.config.direction === 'decreasing' ? this.repExtreme : this.repStartAngle;
    const maxAngleDeg =
      this.config.direction === 'decreasing' ? this.repStartAngle : this.repExtreme;

    const ok = durationMs >= this.config.minRepDurationMs && rom >= this.config.minRepRomDeg;

    this.state = 'idle';
    this.restAngleSet = false; // will be re-established on next idle frame
    this.samples = [];

    if (!ok) {
      // Partial / failed rep: discarded, no index assigned.
      return { state: this.state, event: 'rep-aborted', rep: undefined };
    }

    this.repIndex += 1;
    const rep: RepRecord = {
      repIndex: this.repIndex,
      startedAt,
      endedAt: t,
      durationMs,
      minAngleDeg,
      maxAngleDeg,
      romDeg: rom,
      peakVelocityDegPerS: peakVelocity,
      faults: [],
    };
    return { state: this.state, event: 'rep-completed', rep };
  }

  private abort(): RepMachineOutcome {
    this.state = 'idle';
    this.restAngleSet = false;
    this.samples = [];
    return { state: this.state, event: 'rep-aborted', rep: undefined };
  }

  /** Reset machine to idle, discarding any in-progress rep. */
  reset(): void {
    this.state = 'idle';
    this.restAngleSet = false;
    this.samples = [];
    this.lastValidTime = 0;
  }

  private peakVelocity(): number {
    let peak = 0;
    for (let i = 1; i < this.samples.length; i++) {
      const cur = this.samples[i];
      const prev = this.samples[i - 1];
      if (!cur || !prev) continue;
      const dt = (cur.t - prev.t) / 1000;
      if (dt <= 0) continue;
      const vel = Math.abs((cur.angle - prev.angle) / dt);
      if (vel > peak) peak = vel;
    }
    return peak;
  }
}
