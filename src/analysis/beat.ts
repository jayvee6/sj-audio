/**
 * Onset detector + beatPulse envelope, ported verbatim from
 * `musicplayer-viz/audio-engine.js` (OnsetBPMDetector).
 *
 * Detection is a classic "μ + kσ" threshold over a ring buffer of recent bass
 * energy, with a debounce gap (0.2s min between beats) and a silence floor
 * (reject below 0.15). `beatPulse` is an exponential decay since the last
 * detected onset: `exp(-(t - lastBeatT) * 8.0)`.
 *
 * This module returns raw onsets. BPM estimation lives in `bpm.ts` and is
 * wired into `ingest()` via dependency injection so the files stay focused.
 */

/** Signature of a BPM estimator — see `./bpm.ts` for the stock implementation. */
export type BpmEstimator = (onsets: readonly number[], lastBpm: number) => number;

// ── Constants (verbatim from prior art) ───────────────────────────────────────
const HISTORY_LEN = 32;
const MAX_ONSETS = 16;
const MIN_GAP_SEC = 0.2;
const K_SIGMA = 1.3;
const SILENCE_FLOOR = 0.15;
const DECAY_RATE = 8.0;

export interface OnsetFrame {
  /** Current BPM estimate. 0 until a valid tempo lock is established. */
  bpm: number;
  /** Exponentially-decayed envelope since last onset, in [0..1]. */
  beatPulse: number;
  /** True on the single frame an onset was detected. */
  isBeatNow: boolean;
}

export interface OnsetDetector {
  /** Number of onsets retained (rolling). Capped at MAX_ONSETS. */
  readonly onsets: number[];
  /** Timestamp of the last detected onset, seconds. */
  readonly lastBeatT: number;
  /**
   * Feed the current bass-band energy and time (seconds). Updates internal
   * state and returns the derived onset frame.
   */
  ingest(bass: number, t: number): OnsetFrame;
  /** Reset to initial state. */
  reset(): void;
}

export interface OnsetDetectorOptions {
  /**
   * BPM estimator implementation. Injected so beat.ts and bpm.ts can evolve
   * independently. Pass `estimateBpm` from './bpm.js' for default behavior.
   */
  estimateBpm?: BpmEstimator;
}

/** Create an onset detector with fresh state. */
export function createOnsetDetector(opts: OnsetDetectorOptions = {}): OnsetDetector {
  const bassHistory = new Float32Array(HISTORY_LEN);
  let bassWriteIdx = 0;
  let bassCount = 0;
  const onsets: number[] = [];
  let lastBeatT = 0;
  let lastBpm = 0;
  const estimator = opts.estimateBpm;

  const decay = (t: number): number => {
    if (lastBeatT <= 0) return 0;
    return Math.exp(-(t - lastBeatT) * DECAY_RATE);
  };

  const ingest = (bass: number, t: number): OnsetFrame => {
    bassHistory[bassWriteIdx] = bass;
    bassWriteIdx = (bassWriteIdx + 1) % HISTORY_LEN;
    if (bassCount < HISTORY_LEN) bassCount++;

    // Not enough history yet — decay only.
    if (bassCount < HISTORY_LEN / 2) {
      return { bpm: lastBpm, beatPulse: decay(t), isBeatNow: false };
    }

    // Threshold = μ + kσ over history, excluding the just-written sample.
    const currentIdx = (bassWriteIdx - 1 + HISTORY_LEN) % HISTORY_LEN;
    const nSamples = bassCount - 1;
    let mu = 0;
    for (let i = 0; i < nSamples; i++) {
      const idx = (currentIdx - 1 - i + HISTORY_LEN) % HISTORY_LEN;
      mu += bassHistory[idx]!;
    }
    mu /= nSamples;
    let varSum = 0;
    for (let i = 0; i < nSamples; i++) {
      const idx = (currentIdx - 1 - i + HISTORY_LEN) % HISTORY_LEN;
      const d = bassHistory[idx]! - mu;
      varSum += d * d;
    }
    const sigma = Math.sqrt(varSum / nSamples);

    const threshold = mu + K_SIGMA * sigma;
    const rising = bass > threshold;
    const debounced = t - lastBeatT > MIN_GAP_SEC;
    const detected = rising && debounced && bass > SILENCE_FLOOR;

    if (detected) {
      onsets.push(t);
      if (onsets.length > MAX_ONSETS) onsets.shift();
      lastBeatT = t;
      if (estimator) lastBpm = estimator(onsets, lastBpm);
    }

    return { bpm: lastBpm, beatPulse: decay(t), isBeatNow: detected };
  };

  const reset = (): void => {
    bassHistory.fill(0);
    bassWriteIdx = 0;
    bassCount = 0;
    onsets.length = 0;
    lastBeatT = 0;
    lastBpm = 0;
  };

  return {
    get onsets() {
      return onsets;
    },
    get lastBeatT() {
      return lastBeatT;
    },
    ingest,
    reset,
  };
}
