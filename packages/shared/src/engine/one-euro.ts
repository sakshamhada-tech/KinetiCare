/**
 * One-Euro filter per signal.
 *
 * Adaptive low-pass filter: smooths slow signals heavily, tracks fast signals
 * lightly. Cutoff adapts to the signal's derivative (fast motion -> higher
 * cutoff -> less lag).
 *
 * Implementation follows the original "One Euro Filter" (T. Coupey / G. Casiez
 * et al.). Deterministic given the same inputs and sample times.
 */

export interface OneEuroFilterConfig {
  freq?: number; // expected sampling frequency (Hz), fallback when dt unavailable
  minCutoff?: number; // baseline cutoff (Hz)
  beta?: number; // responsiveness to derivative
  dCutoff?: number; // cutoff for the derivative filter (Hz)
}

const DEFAULT_CONFIG: Required<OneEuroFilterConfig> = {
  freq: 30,
  minCutoff: 1.0,
  beta: 0.0,
  dCutoff: 1.0,
};

/** Smoothing coefficient alpha for a cutoff (Hz) at sampling frequency freq (Hz). */
function alpha(cutoff: number, freq: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  const te = 1 / freq;
  return 1 / (1 + tau / te);
}

export class OneEuroFilter {
  private _freq: number;
  private _minCutoff: number;
  private _beta: number;
  private _dCutoff: number;

  private _xPrev: number | null = null;
  private _dxPrev: number | null = null;
  private _tPrev: number | null = null;

  constructor(config: OneEuroFilterConfig = {}) {
    const { freq, minCutoff, beta, dCutoff } = { ...DEFAULT_CONFIG, ...config };
    if (!(freq > 0) || Number.isNaN(freq)) throw new Error('OneEuroFilter: freq must be > 0');
    if (!(minCutoff > 0) || Number.isNaN(minCutoff))
      throw new Error('OneEuroFilter: minCutoff must be > 0');
    if (Number.isNaN(beta)) throw new Error('OneEuroFilter: beta must be a number');
    if (!(dCutoff > 0) || Number.isNaN(dCutoff))
      throw new Error('OneEuroFilter: dCutoff must be > 0');
    this._freq = freq;
    this._minCutoff = minCutoff;
    this._beta = beta;
    this._dCutoff = dCutoff;
  }

  /** Filter raw value `x` at time `t` (ms). Returns the filtered value. */
  filter(x: number, t: number): number {
    if (!Number.isFinite(x)) throw new Error(`OneEuroFilter: x must be finite, got ${x}`);
    if (!Number.isFinite(t)) throw new Error(`OneEuroFilter: t must be finite, got ${t}`);

    const dt = this._tPrev === null ? 1 / this._freq : (t - this._tPrev) / 1000;
    const freq = dt > 0 ? 1 / dt : this._freq;

    // First sample: no smoothing yet.
    if (this._xPrev === null) {
      this._tPrev = t;
      this._xPrev = x;
      this._dxPrev = 0;
      return x;
    }

    const dx = (x - (this._xPrev as number)) * freq;
    const filteredDx = this._filter(dx, alpha(this._dCutoff, freq), this._dxPrev as number);

    const cutoff = this._minCutoff + this._beta * Math.abs(filteredDx);
    const result = this._filter(x, alpha(cutoff, freq), this._xPrev as number);

    this._tPrev = t;
    this._xPrev = x;
    this._dxPrev = filteredDx;
    return result;
  }

  private _filter(value: number, a: number, prev: number): number {
    return a * value + (1 - a) * prev;
  }

  /** Last raw value fed in (null until first call). */
  get lastRaw(): number | null {
    return this._xPrev;
  }
}
