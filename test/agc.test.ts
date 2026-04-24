import { describe, it, expect } from 'vitest';
import { createGate, createAgc } from '../src/analysis/agc.js';
import { BIN_COUNT } from '../src/analysis/melBands.js';

describe('createGate', () => {
  it('initializes noise floor to 0.01 per bin', () => {
    const g = createGate();
    for (const v of g.noiseFloor) expect(v).toBeCloseTo(0.01);
  });

  it('clamps below-floor input to zero', () => {
    const g = createGate();
    const mags = new Float32Array(BIN_COUNT).fill(0.001);
    g.process(mags);
    for (const v of mags) expect(v).toBe(0);
  });

  it('passes above-floor input minus over-subtracted floor', () => {
    const g = createGate();
    const mags = new Float32Array(BIN_COUNT).fill(1.0);
    g.process(mags);
    // At input=1.0, noiseFloor relaxes upward by 1.00005, but oversub=1.8 →
    // output ≈ 1.0 - 0.01*1.00005*1.8 ≈ 0.982
    for (const v of mags) {
      expect(v).toBeGreaterThan(0.98);
      expect(v).toBeLessThan(1.0);
    }
  });

  it('descends fast toward quieter input (noise adapts)', () => {
    const g = createGate();
    const mags = new Float32Array(BIN_COUNT).fill(0.005);
    const before = g.noiseFloor[0]!;
    g.process(mags);
    const after = g.noiseFloor[0]!;
    expect(after).toBeLessThan(before); // descended
    expect(after).toBeGreaterThan(0);
  });

  it('reset() restores initial floor', () => {
    const g = createGate();
    const mags = new Float32Array(BIN_COUNT).fill(0.5);
    for (let i = 0; i < 100; i++) g.process(mags);
    expect(g.noiseFloor[0]!).not.toBeCloseTo(0.01);
    g.reset();
    expect(g.noiseFloor[0]!).toBeCloseTo(0.01);
  });
});

describe('createAgc', () => {
  it('initializes peakFloor to 0.0001', () => {
    const a = createAgc();
    expect(a.peakFloor).toBeCloseTo(0.0001);
  });

  it('normalizes steady-state input to near-1.0 on the loudest band', () => {
    const a = createAgc();
    const mags = new Float32Array(BIN_COUNT);
    mags[5] = 0.5; // single loud band
    // First frame: peak jumps to 0.5, divides by 0.5 → band 5 becomes 1.0.
    const copy = new Float32Array(mags);
    a.process(copy);
    expect(copy[5]!).toBeCloseTo(1.0);
  });

  it('attacks instantly to new peaks', () => {
    const a = createAgc();
    const m1 = new Float32Array(BIN_COUNT).fill(0.1);
    a.process(m1);
    const peakAfterQuiet = a.peakFloor;
    const m2 = new Float32Array(BIN_COUNT).fill(0.9);
    a.process(m2);
    expect(a.peakFloor).toBeGreaterThan(peakAfterQuiet);
    expect(a.peakFloor).toBeCloseTo(0.9, 4);
  });

  it('decays at 0.995 per frame when input is quiet', () => {
    const a = createAgc();
    // Force peak to known value
    a.peakFloor = 1.0;
    const quiet = new Float32Array(BIN_COUNT).fill(0);
    a.process(quiet);
    expect(a.peakFloor).toBeCloseTo(0.995, 5);
  });

  it('guards against div-by-zero on pure silence', () => {
    const a = createAgc();
    const silence = new Float32Array(BIN_COUNT).fill(0);
    for (let i = 0; i < 10000; i++) a.process(silence);
    // Output should still be finite even if peakFloor has decayed to ~0
    expect(silence.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('reset() restores initial peakFloor', () => {
    const a = createAgc();
    const mags = new Float32Array(BIN_COUNT).fill(0.5);
    a.process(mags);
    expect(a.peakFloor).not.toBeCloseTo(0.0001);
    a.reset();
    expect(a.peakFloor).toBeCloseTo(0.0001);
  });
});
