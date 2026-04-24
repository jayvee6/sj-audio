import { describe, it, expect } from 'vitest';
import {
  computeBandAverages,
  BASS_LO,
  BASS_HI,
  MID_LO,
  MID_HI,
  TREBLE_LO,
  TREBLE_HI,
} from '../src/analysis/bands.js';

describe('computeBandAverages', () => {
  it('averages the declared ranges', () => {
    const mags = new Float32Array(32);
    // Known values: [0..3)=1.0, [3..14)=0.5, [14..32)=0.25
    for (let i = BASS_LO; i < BASS_HI; i++) mags[i] = 1.0;
    for (let i = MID_LO; i < MID_HI; i++) mags[i] = 0.5;
    for (let i = TREBLE_LO; i < TREBLE_HI; i++) mags[i] = 0.25;
    const b = computeBandAverages(mags);
    expect(b.bass).toBeCloseTo(1.0);
    expect(b.mid).toBeCloseTo(0.5);
    expect(b.treble).toBeCloseTo(0.25);
  });

  it('returns the provided out object for zero-allocation use', () => {
    const mags = new Float32Array(32).fill(0.1);
    const out = { bass: -1, mid: -1, treble: -1 };
    const ret = computeBandAverages(mags, out);
    expect(ret).toBe(out);
  });

  it('all zeros input → all zeros output', () => {
    const mags = new Float32Array(32);
    const b = computeBandAverages(mags);
    expect(b.bass).toBe(0);
    expect(b.mid).toBe(0);
    expect(b.treble).toBe(0);
  });

  it('ranges match musicplayer-viz prior art', () => {
    expect([BASS_LO, BASS_HI]).toEqual([0, 3]);
    expect([MID_LO, MID_HI]).toEqual([3, 14]);
    expect([TREBLE_LO, TREBLE_HI]).toEqual([14, 32]);
  });
});
