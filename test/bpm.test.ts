import { describe, it, expect } from 'vitest';
import { estimateBpm, MIN_ONSETS } from '../src/analysis/bpm.js';
import { createOnsetDetector } from '../src/analysis/beat.js';

describe('estimateBpm (pure)', () => {
  it('returns lastBpm when onset count below MIN_ONSETS', () => {
    expect(estimateBpm([], 42)).toBe(42);
    expect(estimateBpm([0.1, 0.2, 0.3], 88)).toBe(88);
    expect(MIN_ONSETS).toBe(4);
  });

  it('computes 120 BPM from steady 0.5s intervals', () => {
    const onsets = [0, 0.5, 1.0, 1.5, 2.0, 2.5];
    expect(estimateBpm(onsets, 0)).toBeCloseTo(120, 1);
  });

  it('filters out intervals outside [200ms, 2s]', () => {
    // Tight interval (100ms) should be ignored; only 0.5s survives.
    const onsets = [0, 0.1, 0.6, 1.1, 1.6];
    // Surviving intervals: [0.5, 0.5, 0.5] (0.1 ignored, 1.6-1.1=0.5, etc.)
    expect(estimateBpm(onsets, 0)).toBeCloseTo(120, 1);
  });

  it('smooths against lastBpm using 0.7/0.3 EMA when one exists', () => {
    const onsets = [0, 0.5, 1.0, 1.5]; // 120 BPM
    const smoothed = estimateBpm(onsets, 100);
    // 100 * 0.7 + 120 * 0.3 = 70 + 36 = 106
    expect(smoothed).toBeCloseTo(106, 1);
  });

  it('first estimate (lastBpm=0) does not smooth — returns fresh', () => {
    const onsets = [0, 0.5, 1.0, 1.5];
    expect(estimateBpm(onsets, 0)).toBeCloseTo(120, 1);
  });

  it('returns lastBpm if all intervals are outside the valid range', () => {
    const onsets = [0, 0.05, 0.08, 0.12]; // all <200ms
    expect(estimateBpm(onsets, 77)).toBe(77);
  });
});

describe('OnsetDetector with BPM estimator wired', () => {
  it('reports a BPM close to the synthesized tempo', () => {
    const d = createOnsetDetector({ estimateBpm });

    // Fill history with quiet baseline.
    for (let i = 0; i < 16; i++) d.ingest(0.2, i * 0.02);

    // Inject 8 onsets at 0.5s spacing (120 BPM). Between each spike, feed
    // several low-level frames so the μ+1.3σ threshold stays stable.
    const tStart = 16 * 0.02;
    let last: ReturnType<typeof d.ingest> | null = null;
    for (let k = 0; k < 8; k++) {
      const tSpike = tStart + k * 0.5;
      for (let f = 0; f < 15; f++) {
        d.ingest(0.2, tSpike - 0.5 + f * 0.03);
      }
      last = d.ingest(0.9, tSpike);
    }
    expect(last!.bpm).toBeGreaterThan(100);
    expect(last!.bpm).toBeLessThan(140);
  });
});
