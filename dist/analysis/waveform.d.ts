/**
 * Waveform downsample: 2048 (fft time-domain) → 256 samples for viz.
 *
 * Strategy: simple block-average. For each output index `j`, average the
 * corresponding stride of input samples. This is a cheap anti-aliasing pass
 * that avoids the ringing you'd get from naive stride-sampling a waveform
 * with high-frequency content.
 *
 *   stride = input.length / out.length    (integer division; input must be a
 *                                          multiple of out)
 *
 * Input/output are both in [-1, 1] — Web Audio's `getFloatTimeDomainData`
 * shape. Output is written in-place into `out`.
 */
export declare function downsampleWaveform(input: Float32Array, out: Float32Array): Float32Array;
//# sourceMappingURL=waveform.d.ts.map