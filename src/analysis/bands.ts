/**
 * Bass / mid / treble band-average computation over the 32-bin mel magnitudes.
 *
 * Ranges match musicplayer-viz/audio-engine.js:
 *   bass   = mean of bins [0..3)
 *   mid    = mean of bins [3..14)
 *   treble = mean of bins [14..32)
 *
 * Returns values in the same scale as the input (post-AGC, so ~[0..1]).
 */

export const BASS_LO = 0;
export const BASS_HI = 3;    // exclusive
export const MID_LO = 3;
export const MID_HI = 14;    // exclusive
export const TREBLE_LO = 14;
export const TREBLE_HI = 32; // exclusive

export interface BandAverages {
  bass: number;
  mid: number;
  treble: number;
}

/**
 * Compute bass/mid/treble averages of a 32-bin mel magnitude array.
 * Writes into `out` (or allocates a new object if not provided) and returns it.
 */
export function computeBandAverages(
  mags: Float32Array,
  out: BandAverages = { bass: 0, mid: 0, treble: 0 },
): BandAverages {
  out.bass = averageSlice(mags, BASS_LO, BASS_HI);
  out.mid = averageSlice(mags, MID_LO, MID_HI);
  out.treble = averageSlice(mags, TREBLE_LO, TREBLE_HI);
  return out;
}

function averageSlice(arr: Float32Array, lo: number, hi: number): number {
  let sum = 0;
  for (let i = lo; i < hi; i++) sum += arr[i]!;
  return sum / (hi - lo);
}
