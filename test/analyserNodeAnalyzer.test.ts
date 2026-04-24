import { describe, it, expect, vi } from 'vitest';
import { createAnalyserNodeAnalyzer } from '../src/analysis/analyserNodeAnalyzer.js';

function makeMockContext(sampleRate = 48000) {
  const analyser = {
    fftSize: 0,
    smoothingTimeConstant: 0,
    get frequencyBinCount() {
      return this.fftSize / 2;
    },
    getFloatFrequencyData: vi.fn((out: Float32Array) => {
      for (let i = 0; i < out.length; i++) out[i] = -30 - i;
    }),
    getFloatTimeDomainData: vi.fn((out: Float32Array) => {
      for (let i = 0; i < out.length; i++) out[i] = Math.sin(i * 0.01);
    }),
    disconnect: vi.fn(),
  };
  return {
    sampleRate,
    createAnalyser: () => analyser,
    _analyser: analyser,
  } as unknown as AudioContext & { _analyser: typeof analyser };
}

describe('createAnalyserNodeAnalyzer', () => {
  it('configures fftSize 2048 and smoothing 0.8 by default', () => {
    const ctx = makeMockContext();
    const a = createAnalyserNodeAnalyzer(ctx);
    expect(a.fftSize).toBe(2048);
    expect(a.frequencyBinCount).toBe(1024);
    // @ts-expect-error internal access for assertion
    expect(ctx._analyser.smoothingTimeConstant).toBe(0.8);
  });

  it('honors fftSize override', () => {
    const ctx = makeMockContext();
    const a = createAnalyserNodeAnalyzer(ctx, { fftSize: 4096 });
    expect(a.fftSize).toBe(4096);
    expect(a.frequencyBinCount).toBe(2048);
  });

  it('reads frequency data into caller-owned buffer', () => {
    const ctx = makeMockContext();
    const a = createAnalyserNodeAnalyzer(ctx);
    const out = new Float32Array(a.frequencyBinCount);
    const returned = a.readFrequency(out);
    expect(returned).toBe(out);
    expect(out[0]).toBe(-30);
    expect(out[10]).toBe(-40);
  });

  it('reads time-domain data into caller-owned buffer', () => {
    const ctx = makeMockContext();
    const a = createAnalyserNodeAnalyzer(ctx);
    const out = new Float32Array(a.fftSize);
    a.readTime(out);
    expect(out[0]).toBeCloseTo(Math.sin(0));
    expect(out[100]).toBeCloseTo(Math.sin(1));
  });

  it('disposes idempotently and stops reading after dispose', () => {
    const ctx = makeMockContext();
    const a = createAnalyserNodeAnalyzer(ctx);
    a.dispose();
    a.dispose();
    // @ts-expect-error internal access
    expect(ctx._analyser.disconnect).toHaveBeenCalledTimes(1);
    const out = new Float32Array(a.frequencyBinCount);
    out[0] = 42;
    a.readFrequency(out);
    expect(out[0]).toBe(42); // untouched after dispose
  });

  it('exposes the underlying node as `input`', () => {
    const ctx = makeMockContext();
    const a = createAnalyserNodeAnalyzer(ctx);
    expect(a.input).toBe(ctx._analyser);
  });
});
