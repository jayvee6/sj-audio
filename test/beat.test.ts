import { describe, it, expect } from 'vitest';
import { createOnsetDetector } from '../src/analysis/beat.js';

describe('createOnsetDetector', () => {
  it('returns isBeatNow=false and beatPulse=0 while history fills', () => {
    const d = createOnsetDetector();
    for (let i = 0; i < 8; i++) {
      const r = d.ingest(0.3, i * 0.01);
      expect(r.isBeatNow).toBe(false);
      expect(r.beatPulse).toBe(0);
    }
  });

  it('detects an onset when bass exceeds μ+1.3σ threshold, past silence floor, past min-gap', () => {
    const d = createOnsetDetector();
    // Fill 16 frames of low-level baseline noise (above silence floor, but steady)
    for (let i = 0; i < 16; i++) d.ingest(0.20, i * 0.02);
    // Now a sharp spike
    const r = d.ingest(0.9, 16 * 0.02);
    expect(r.isBeatNow).toBe(true);
    expect(r.beatPulse).toBeGreaterThan(0);
  });

  it('rejects onsets below silenceFloor even if locally loud', () => {
    const d = createOnsetDetector();
    // Baseline = 0 → silence. Even a 0.1 "spike" is below floor (0.15).
    for (let i = 0; i < 20; i++) d.ingest(0.01, i * 0.02);
    const r = d.ingest(0.1, 20 * 0.02);
    expect(r.isBeatNow).toBe(false);
  });

  it('debounces beats faster than minGapSec (0.2s)', () => {
    const d = createOnsetDetector();
    for (let i = 0; i < 16; i++) d.ingest(0.2, i * 0.02);
    const a = d.ingest(0.9, 16 * 0.02);
    const b = d.ingest(0.9, 16 * 0.02 + 0.1); // 100ms later — below 200ms
    expect(a.isBeatNow).toBe(true);
    expect(b.isBeatNow).toBe(false);
  });

  it('beatPulse decays exp(-8 dt) from the onset instant', () => {
    const d = createOnsetDetector();
    for (let i = 0; i < 16; i++) d.ingest(0.2, i * 0.02);
    const onset = d.ingest(0.9, 16 * 0.02);
    expect(onset.isBeatNow).toBe(true);
    // 125ms later — expected decay = exp(-8 * 0.125) = exp(-1) ≈ 0.368
    const later = d.ingest(0.2, 16 * 0.02 + 0.125);
    expect(later.beatPulse).toBeCloseTo(Math.exp(-1), 2);
  });

  it('retains onsets up to MAX_ONSETS (16) in a FIFO window', () => {
    const d = createOnsetDetector();
    for (let i = 0; i < 16; i++) d.ingest(0.2, i * 0.02); // fill history
    // 20 spikes, each > 200ms apart
    for (let i = 0; i < 20; i++) {
      // each iteration: baseline for 3 frames then a spike
      d.ingest(0.2, 16 * 0.02 + i * 0.3);
      d.ingest(0.2, 16 * 0.02 + i * 0.3 + 0.05);
      d.ingest(0.2, 16 * 0.02 + i * 0.3 + 0.1);
      d.ingest(0.9, 16 * 0.02 + i * 0.3 + 0.15);
    }
    expect(d.onsets.length).toBeLessThanOrEqual(16);
  });

  it('reset() clears history and lastBeatT', () => {
    const d = createOnsetDetector();
    for (let i = 0; i < 16; i++) d.ingest(0.2, i * 0.02);
    d.ingest(0.9, 16 * 0.02);
    expect(d.lastBeatT).toBeGreaterThan(0);
    d.reset();
    expect(d.lastBeatT).toBe(0);
    expect(d.onsets.length).toBe(0);
  });

  it('returns bpm=0 when no estimator is injected', () => {
    const d = createOnsetDetector();
    for (let i = 0; i < 16; i++) d.ingest(0.2, i * 0.02);
    const r = d.ingest(0.9, 16 * 0.02);
    expect(r.bpm).toBe(0);
  });
});
