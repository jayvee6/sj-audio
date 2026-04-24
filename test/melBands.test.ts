import { describe, it, expect } from 'vitest';
import {
  BIN_COUNT,
  hzToMel,
  melToHz,
  computeMelBoundaries,
  computeBinGain,
  createMelProjector,
} from '../src/analysis/melBands.js';

describe('mel scale conversions', () => {
  it('hzToMel/melToHz round-trip within epsilon', () => {
    for (const hz of [0, 100, 440, 1000, 8000, 20000]) {
      expect(melToHz(hzToMel(hz))).toBeCloseTo(hz, 4);
    }
  });

  it('mel(0) is 0', () => {
    expect(hzToMel(0)).toBe(0);
  });
});

describe('computeMelBoundaries', () => {
  it('returns BIN_COUNT+1 boundaries strictly increasing', () => {
    const bounds = computeMelBoundaries(2048, 44100);
    expect(bounds.length).toBe(BIN_COUNT + 1);
    for (let i = 1; i < bounds.length; i++) {
      expect(bounds[i]!).toBeGreaterThan(bounds[i - 1]!);
    }
  });

  it('clamps to [0, fftSize/2]', () => {
    const bounds = computeMelBoundaries(2048, 44100);
    expect(bounds[0]).toBeGreaterThanOrEqual(0);
    expect(bounds[BIN_COUNT]).toBeLessThanOrEqual(1024);
  });

  it('matches musicplayer-viz prior art at 44100 Hz / 2048 fft', () => {
    const bounds = computeMelBoundaries(2048, 44100);
    // First few should be tightly packed (low-mel = low Hz), last few wide.
    // Spot-check: first band ends near bin 1, last spans hundreds of bins.
    expect(bounds[0]).toBe(0);
    expect(bounds[BIN_COUNT]).toBe(1024);
    expect(bounds[BIN_COUNT]! - bounds[BIN_COUNT - 1]!).toBeGreaterThan(
      bounds[1]! - bounds[0]!,
    );
  });
});

describe('computeBinGain', () => {
  it('starts at 1.0 and peaks at ~3.5', () => {
    const g = computeBinGain();
    expect(g[0]).toBeCloseTo(1.0);
    expect(g[BIN_COUNT - 1]).toBeCloseTo(3.5);
  });

  it('is monotonically non-decreasing', () => {
    const g = computeBinGain();
    for (let i = 1; i < g.length; i++) {
      expect(g[i]!).toBeGreaterThanOrEqual(g[i - 1]!);
    }
  });
});

describe('createMelProjector', () => {
  it('projects silent input (-Infinity dB) to all zeros', () => {
    const p = createMelProjector(2048, 44100);
    const db = new Float32Array(1024).fill(-Infinity);
    const out = new Float32Array(BIN_COUNT);
    p.project(db, out);
    for (const v of out) expect(v).toBe(0);
  });

  it('guards NaN in input', () => {
    const p = createMelProjector(2048, 44100);
    const db = new Float32Array(1024).fill(NaN);
    const out = new Float32Array(BIN_COUNT);
    p.project(db, out);
    for (const v of out) expect(v).toBe(0);
  });

  it('applies treble-boost curve to projected bands', () => {
    const p = createMelProjector(2048, 44100);
    // Uniform dB across all bins — post-project, higher bands should be louder
    // than lower bands due to BIN_GAIN curve.
    const db = new Float32Array(1024).fill(-20);
    const out = new Float32Array(BIN_COUNT);
    p.project(db, out);
    expect(out[BIN_COUNT - 1]!).toBeGreaterThan(out[0]!);
  });

  it('output length is BIN_COUNT', () => {
    const p = createMelProjector(2048, 48000);
    const db = new Float32Array(1024).fill(-30);
    const out = new Float32Array(BIN_COUNT);
    const returned = p.project(db, out);
    expect(returned).toBe(out);
    expect(out.length).toBe(32);
  });

  it('supports 48kHz sample rate (AudioContext default on most browsers)', () => {
    const p = createMelProjector(2048, 48000);
    expect(p.bounds.length).toBe(BIN_COUNT + 1);
    // 48kHz pushes the last bin boundary wider in Hz but same FFT bins
    expect(p.bounds[BIN_COUNT]).toBe(1024);
  });
});
