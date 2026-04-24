/**
 * AGC (automatic gain control) + per-band noise gate, ported verbatim from
 * `musicplayer-viz/audio-engine.js` (_gate + _agc).
 *
 * Pipeline order (run in sequence on the 32-bin mel magnitudes):
 *   1. `gate(mags)`  — per-bin noise floor descent/relax, subtract 1.8× floor, clamp ≥0
 *   2. `agc(mags)`   — global peak envelope (instant attack, 0.995/frame decay),
 *                      normalize so the loudest band ≈ 1.0
 *
 * Both operate in-place on the caller's Float32Array (length BIN_COUNT).
 * State persists across frames.
 */

import { BIN_COUNT } from './melBands.js';

// ── Gate constants (verbatim from prior art) ──────────────────────────────────
/** Initial per-bin noise floor estimate. */
const NOISE_FLOOR_INIT = 0.01;
/** Blend weight toward input when input is below current floor (fast descent). */
const GATE_DESCENT_ALPHA = 0.2;
/** Per-frame relax multiplier when input is above current floor. */
const GATE_RELAX = 1.00005;
/** Over-subtraction factor — subtract `OVER_SUB × noiseFloor` from input. */
const GATE_OVER_SUB = 1.8;

// ── AGC constants (verbatim from prior art) ───────────────────────────────────
/** Initial global peak-floor estimate, also used as div-by-zero guard. */
const PEAK_FLOOR_INIT = 0.0001;
/** Per-frame decay multiplier on the peak envelope (~3s half-life @ 86 fps). */
const PEAK_DECAY = 0.995;

export interface Gate {
  /** Per-bin noise floor state (length BIN_COUNT). Readable for introspection. */
  readonly noiseFloor: Float32Array;
  /** Process one frame in-place. */
  process(mags: Float32Array): Float32Array;
  /** Reset state to initial values. */
  reset(): void;
}

export interface Agc {
  /** Current global peak-floor estimate. */
  peakFloor: number;
  /** Process one frame in-place. */
  process(mags: Float32Array): Float32Array;
  /** Reset state to initial values. */
  reset(): void;
}

/** Create a noise gate with fresh per-bin state. */
export function createGate(): Gate {
  const noiseFloor = new Float32Array(BIN_COUNT).fill(NOISE_FLOOR_INIT);

  const process = (m: Float32Array): Float32Array => {
    for (let b = 0; b < BIN_COUNT; b++) {
      const v = m[b]!;
      if (v < noiseFloor[b]!) {
        noiseFloor[b] = v * GATE_DESCENT_ALPHA + noiseFloor[b]! * (1 - GATE_DESCENT_ALPHA);
      } else {
        noiseFloor[b] = noiseFloor[b]! * GATE_RELAX;
      }
      const gated = v - noiseFloor[b]! * GATE_OVER_SUB;
      m[b] = gated > 0 ? gated : 0;
    }
    return m;
  };

  const reset = (): void => {
    noiseFloor.fill(NOISE_FLOOR_INIT);
  };

  return { noiseFloor, process, reset };
}

/** Create an AGC with fresh state. */
export function createAgc(): Agc {
  const state = { peakFloor: PEAK_FLOOR_INIT };

  const process = (m: Float32Array): Float32Array => {
    let max = 0;
    for (let b = 0; b < BIN_COUNT; b++) {
      if (m[b]! > max) max = m[b]!;
    }
    state.peakFloor = Math.max(max, state.peakFloor * PEAK_DECAY);
    const inv = 1.0 / Math.max(state.peakFloor, PEAK_FLOOR_INIT);
    for (let b = 0; b < BIN_COUNT; b++) m[b] *= inv;
    return m;
  };

  const reset = (): void => {
    state.peakFloor = PEAK_FLOOR_INIT;
  };

  return {
    get peakFloor() {
      return state.peakFloor;
    },
    set peakFloor(v: number) {
      state.peakFloor = v;
    },
    process,
    reset,
  };
}
