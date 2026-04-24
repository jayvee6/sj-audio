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
export declare const BIN_COUNT = 32;
/** Convert Hz to mel (O’Shaughnessy 1987). */
export declare function hzToMel(hz: number): number;
/** Convert mel to Hz. */
export declare function melToHz(mel: number): number;
/**
 * Compute the FFT-bin boundaries for BIN_COUNT mel bands across [0, sampleRate/2].
 * Guarantees strictly increasing bounds so each bin averages ≥1 FFT bin.
 */
export declare function computeMelBoundaries(fftSize: number, sampleRate: number): Int32Array;
/**
 * Perceptual treble-boost curve: g[b] = 1.0 + (b/(BIN_COUNT-1))^1.3 × 2.5.
 * Boosts the top band to ~3.5× so high-frequency motion is visible in viz.
 */
export declare function computeBinGain(): Float32Array;
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
export declare function createMelProjector(fftSize: number, sampleRate: number): MelProjector;
//# sourceMappingURL=melBands.d.ts.map