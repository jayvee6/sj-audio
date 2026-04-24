import { describe, it, expect } from 'vitest';
import { createFramePipeline, BASS_HISTORY_LEN } from '../src/frame/buildFrame.js';
import type { AnalyzerReader } from '../src/analysis/analyserNodeAnalyzer.js';

function makeFakeReader(dbValue = -40): AnalyzerReader {
  return {
    fftSize: 2048,
    frequencyBinCount: 1024,
    sampleRate: 48000,
    input: {} as AudioNode,
    readFrequency(out) {
      for (let i = 0; i < out.length; i++) out[i] = dbValue;
      return out;
    },
    readTime(out) {
      for (let i = 0; i < out.length; i++) out[i] = Math.sin(i * 0.01);
      return out;
    },
    dispose() {},
  };
}

describe('createFramePipeline', () => {
  it('produces an AudioFrame with all fields populated on first tick', () => {
    const p = createFramePipeline(makeFakeReader());
    const f = p.tick(0.016, 0.016);
    expect(f.time).toBe(0.016);
    expect(f.magnitudes.length).toBe(32);
    expect(f.magnitudesSmooth.length).toBe(32);
    expect(f.waveform.length).toBe(256);
    expect(f.bassHistory.length).toBe(BASS_HISTORY_LEN);
    expect(typeof f.bass).toBe('number');
    expect(typeof f.mid).toBe('number');
    expect(typeof f.treble).toBe('number');
    expect(typeof f.beatPulse).toBe('number');
    expect(typeof f.bpm).toBe('number');
    expect(typeof f.isBeatNow).toBe('boolean');
    expect(f.valence).toBe(0.5);
    expect(f.energy).toBe(0.5);
    expect(f.danceability).toBe(0.5);
    expect(f.tempoBPM).toBe(0);
  });

  it('returns the SAME AudioFrame reference across ticks (zero-alloc hot path)', () => {
    const p = createFramePipeline(makeFakeReader());
    const a = p.tick(0.016, 0.016);
    const b = p.tick(0.032, 0.016);
    expect(a).toBe(b);
    expect(a.magnitudes).toBe(b.magnitudes);
    expect(a.bassHistory).toBe(b.bassHistory);
  });

  it('pushes current bass into bassHistory[0]; older values shift right', () => {
    const p = createFramePipeline(makeFakeReader(-30));
    // Drive a few frames, then check the shift behavior.
    const bassValues: number[] = [];
    for (let i = 0; i < 5; i++) {
      const f = p.tick(i * 0.016, 0.016);
      bassValues.push(f.bass);
    }
    const f = p.frame;
    // Most recent at index 0, previous at 1, etc.
    expect(f.bassHistory[0]).toBeCloseTo(bassValues[4]!, 5);
    expect(f.bassHistory[1]).toBeCloseTo(bassValues[3]!, 5);
    expect(f.bassHistory[2]).toBeCloseTo(bassValues[2]!, 5);
  });

  it('setViewport updates width/height on subsequent frames', () => {
    const p = createFramePipeline(makeFakeReader());
    p.setViewport(1920, 1080);
    const f = p.tick(0, 0.016);
    expect(f.width).toBe(1920);
    expect(f.height).toBe(1080);
  });

  it('setMood updates valence/energy/danceability/tempoBPM', () => {
    const p = createFramePipeline(makeFakeReader());
    p.setMood({ valence: 0.8, energy: 0.4, danceability: 0.9, tempoBPM: 128 });
    const f = p.tick(0, 0.016);
    expect(f.valence).toBe(0.8);
    expect(f.energy).toBe(0.4);
    expect(f.danceability).toBe(0.9);
    expect(f.tempoBPM).toBe(128);
  });

  it('reset() clears state but keeps frame buffers (stable refs)', () => {
    const p = createFramePipeline(makeFakeReader(-30));
    for (let i = 0; i < 10; i++) p.tick(i * 0.016, 0.016);
    const magsRef = p.frame.magnitudes;
    const histRef = p.frame.bassHistory;
    p.reset();
    expect(p.frame.magnitudes).toBe(magsRef); // buffer reference stable
    expect(p.frame.bassHistory).toBe(histRef);
    for (const v of p.frame.bassHistory) expect(v).toBe(0);
    expect(p.frame.time).toBe(0);
    expect(p.frame.bass).toBe(0);
  });

  it('magnitudesSmooth points at the smoother state (stable reference)', () => {
    const p = createFramePipeline(makeFakeReader(-30));
    const ref = p.frame.magnitudesSmooth;
    p.tick(0.016, 0.016);
    p.tick(0.032, 0.016);
    expect(p.frame.magnitudesSmooth).toBe(ref);
  });
});
