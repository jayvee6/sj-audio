/**
 * BPM estimator from an onsets timeline, ported verbatim from
 * `musicplayer-viz/audio-engine.js` (_estimateBpm).
 *
 * Strategy: take the intervals between successive onsets, keep only those in
 * the plausible tempo range (200ms..2s → 30..300 BPM), take the median,
 * convert to BPM. Smooth against the previous estimate so a single missed
 * beat doesn't cause the tempo to jump.
 *
 *   smoothedBpm = lastBpm > 0 ? lastBpm * 0.7 + fresh * 0.3 : fresh
 */
import type { BpmEstimator } from './beat.js';
/** Minimum onset count before returning any estimate (falls through to lastBpm). */
export declare const MIN_ONSETS = 4;
/** Valid interval range in seconds (30..300 BPM). */
export declare const MIN_INTERVAL_SEC = 0.2;
export declare const MAX_INTERVAL_SEC = 2;
/** EMA weight on new estimate when a previous BPM exists. */
export declare const BPM_SMOOTH_NEW = 0.3;
export declare const BPM_SMOOTH_OLD = 0.7;
export declare const estimateBpm: BpmEstimator;
//# sourceMappingURL=bpm.d.ts.map