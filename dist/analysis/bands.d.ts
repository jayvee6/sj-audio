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
export declare const BASS_LO = 0;
export declare const BASS_HI = 3;
export declare const MID_LO = 3;
export declare const MID_HI = 14;
export declare const TREBLE_LO = 14;
export declare const TREBLE_HI = 32;
export interface BandAverages {
    bass: number;
    mid: number;
    treble: number;
}
/**
 * Compute bass/mid/treble averages of a 32-bin mel magnitude array.
 * Writes into `out` (or allocates a new object if not provided) and returns it.
 */
export declare function computeBandAverages(mags: Float32Array, out?: BandAverages): BandAverages;
//# sourceMappingURL=bands.d.ts.map