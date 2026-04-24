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

export function downsampleWaveform(input: Float32Array, out: Float32Array): Float32Array {
  const stride = Math.floor(input.length / out.length);
  if (stride <= 0) {
    throw new Error(
      `downsampleWaveform: input length ${input.length} must be >= output length ${out.length}`,
    );
  }
  if (stride === 1) {
    // Equal lengths — straight copy.
    out.set(input.subarray(0, out.length));
    return out;
  }
  for (let j = 0; j < out.length; j++) {
    const start = j * stride;
    let sum = 0;
    for (let k = 0; k < stride; k++) sum += input[start + k]!;
    out[j] = sum / stride;
  }
  return out;
}
