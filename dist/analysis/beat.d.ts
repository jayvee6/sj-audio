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
export declare function createOnsetDetector(opts?: OnsetDetectorOptions): OnsetDetector;
//# sourceMappingURL=beat.d.ts.map