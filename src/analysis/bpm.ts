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
export const MIN_ONSETS = 4;
/** Valid interval range in seconds (30..300 BPM). */
export const MIN_INTERVAL_SEC = 0.2;
export const MAX_INTERVAL_SEC = 2.0;
/** EMA weight on new estimate when a previous BPM exists. */
export const BPM_SMOOTH_NEW = 0.3;
export const BPM_SMOOTH_OLD = 0.7;

export const estimateBpm: BpmEstimator = (onsets, lastBpm) => {
  if (onsets.length < MIN_ONSETS) return lastBpm;
  const intervals: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    const d = onsets[i]! - onsets[i - 1]!;
    if (d > MIN_INTERVAL_SEC && d < MAX_INTERVAL_SEC) intervals.push(d);
  }
  if (intervals.length === 0) return lastBpm;
  intervals.sort((a, b) => a - b);
  const median = intervals[intervals.length >> 1]!;
  const fresh = 60 / median;
  return lastBpm > 0 ? lastBpm * BPM_SMOOTH_OLD + fresh * BPM_SMOOTH_NEW : fresh;
};
