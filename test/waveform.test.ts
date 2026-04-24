import { describe, it, expect } from 'vitest';
import { downsampleWaveform } from '../src/analysis/waveform.js';

describe('downsampleWaveform', () => {
  it('writes into the provided out buffer', () => {
    const input = new Float32Array(2048).fill(0.5);
    const out = new Float32Array(256);
    const ret = downsampleWaveform(input, out);
    expect(ret).toBe(out);
    for (const v of out) expect(v).toBeCloseTo(0.5);
  });

  it('block-averages with stride = 8 for 2048 → 256', () => {
    const input = new Float32Array(2048);
    // Fill input so each 8-sample block averages to j/256.
    for (let j = 0; j < 256; j++) {
      const base = j / 256;
      for (let k = 0; k < 8; k++) input[j * 8 + k] = base;
    }
    const out = new Float32Array(256);
    downsampleWaveform(input, out);
    for (let j = 0; j < 256; j++) expect(out[j]!).toBeCloseTo(j / 256, 5);
  });

  it('stride 1 does a straight copy (no averaging)', () => {
    const input = new Float32Array([1, -1, 0.5, -0.5]);
    const out = new Float32Array(4);
    downsampleWaveform(input, out);
    expect(Array.from(out)).toEqual([1, -1, 0.5, -0.5]);
  });

  it('throws when input is shorter than output', () => {
    const input = new Float32Array(100);
    const out = new Float32Array(200);
    expect(() => downsampleWaveform(input, out)).toThrow(/input length .* must be >=/);
  });

  it('anti-aliasing: high-frequency tone averages close to zero', () => {
    // Generate a sample-rate-nyquist alternating signal (+1, -1, +1, -1, ...).
    // Block average over 8 samples should average to zero.
    const input = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) input[i] = i % 2 === 0 ? 1 : -1;
    const out = new Float32Array(256);
    downsampleWaveform(input, out);
    for (const v of out) expect(Math.abs(v)).toBeLessThan(0.001);
  });
});
