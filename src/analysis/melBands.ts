/**
 * 32-band mel-scale projection, ported verbatim from
 * `musicplayer-viz/audio-engine.js` so existing visualizers port over with
 * identical reactive behavior.
 *
 * Input: dBFS Float32Array of length fftSize/2 (from `getFloatFrequencyData`).
 *        Values in ~[-140, 0], -Infinity for silent bins, NaN guarded.
 * Output: linear-magnitude Float32Array of length BIN_COUNT (32) with a
 *         perceptual treble-boost curve applied (1.0× → ~3.5×).
 *
 * The projection is: dB → linear → mel-bin average → sqrt → ×binGain.
 * The sqrt step matches the iOS Metal pipeline so viz read the same shape
 * on both platforms.
 */

export const BIN_COUNT = 32;

/** Convert Hz to mel (O’Shaughnessy 1987). */
export function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

/** Convert mel to Hz. */
export function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

/**
 * Compute the FFT-bin boundaries for BIN_COUNT mel bands across [0, sampleRate/2].
 * Guarantees strictly increasing bounds so each bin averages ≥1 FFT bin.
 */
export function computeMelBoundaries(fftSize: number, sampleRate: number): Int32Array {
  const halfN = fftSize / 2;
  const melMin = hzToMel(0);
  const melMax = hzToMel(sampleRate / 2);
  const bounds = new Int32Array(BIN_COUNT + 1);
  for (let i = 0; i <= BIN_COUNT; i++) {
    const mel = melMin + ((melMax - melMin) * i) / BIN_COUNT;
    const hz = melToHz(mel);
    bounds[i] = Math.min(halfN, Math.max(0, Math.floor((hz / sampleRate) * fftSize)));
  }
  // Guarantee strictly increasing so each bin averages ≥1 FFT bin.
  for (let i = 1; i <= BIN_COUNT; i++) {
    if (bounds[i]! <= bounds[i - 1]!) {
      bounds[i] = Math.min(halfN, bounds[i - 1]! + 1);
    }
  }
  return bounds;
}

/**
 * Perceptual treble-boost curve: g[b] = 1.0 + (b/(BIN_COUNT-1))^1.3 × 2.5.
 * Boosts the top band to ~3.5× so high-frequency motion is visible in viz.
 */
export function computeBinGain(): Float32Array {
  const g = new Float32Array(BIN_COUNT);
  for (let b = 0; b < BIN_COUNT; b++) {
    const t = b / (BIN_COUNT - 1);
    g[b] = 1.0 + Math.pow(t, 1.3) * 2.5;
  }
  return g;
}

export interface MelProjector {
  readonly bounds: Int32Array;
  readonly binGain: Float32Array;
  /**
   * Project a dBFS spectrum (length fftSize/2) into a 32-bin mel magnitude array.
   * Writes into `out` (length 32). Returns `out` for convenience.
   */
  project(db: Float32Array, out: Float32Array): Float32Array;
}

/** Create a projector. Precomputes boundaries and gain for the given config. */
export function createMelProjector(fftSize: number, sampleRate: number): MelProjector {
  const bounds = computeMelBoundaries(fftSize, sampleRate);
  const binGain = computeBinGain();

  const project = (db: Float32Array, out: Float32Array): Float32Array => {
    for (let b = 0; b < BIN_COUNT; b++) {
      const lo = bounds[b]!;
      const hi = Math.max(lo + 1, bounds[b + 1]!);
      let sum = 0;
      for (let i = lo; i < hi; i++) {
        const v = db[i]!;
        // Guard -Infinity and NaN: Math.pow(10, -Infinity/20) = 0 but Math ops on NaN propagate.
        sum += v === -Infinity || v !== v ? 0 : Math.pow(10, v * 0.05);
      }
      const avg = sum / (hi - lo);
      out[b] = Math.sqrt(avg > 0 ? avg : 0) * binGain[b]!;
    }
    return out;
  };

  return { bounds, binGain, project };
}
