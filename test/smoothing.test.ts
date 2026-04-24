import { describe, it, expect } from 'vitest';
import { emaAlpha, asymmetricEmaStep, createSmoother } from '../src/analysis/smoothing.js';

describe('emaAlpha', () => {
  it('returns 1 when tau is 0', () => {
    expect(emaAlpha(0.016, 0)).toBe(1);
  });

  it('returns near-0 when dt is tiny relative to tau', () => {
    expect(emaAlpha(0.001, 10)).toBeCloseTo(0.0001, 3);
  });

  it('at dt = tau, alpha = 1 - 1/e ≈ 0.632', () => {
    const a = emaAlpha(0.010, 0.010);
    expect(a).toBeCloseTo(1 - 1 / Math.E, 4);
  });

  it('clamps output to [0, 1]', () => {
    expect(emaAlpha(1e9, 0.010)).toBeLessThanOrEqual(1);
    expect(emaAlpha(-1, 0.010)).toBeGreaterThanOrEqual(0);
  });
});

describe('asymmetricEmaStep', () => {
  it('moves state toward input using attackAlpha when input rises', () => {
    const input = new Float32Array([1.0, 1.0, 1.0]);
    const state = new Float32Array([0, 0, 0]);
    asymmetricEmaStep(input, state, 0.5, 0.1);
    for (const v of state) expect(v).toBeCloseTo(0.5);
  });

  it('moves state toward input using releaseAlpha when input falls', () => {
    const input = new Float32Array([0, 0, 0]);
    const state = new Float32Array([1.0, 1.0, 1.0]);
    asymmetricEmaStep(input, state, 0.5, 0.1);
    for (const v of state) expect(v).toBeCloseTo(0.9);
  });

  it('equal input and state → no change', () => {
    const input = new Float32Array([0.5, 0.5]);
    const state = new Float32Array([0.5, 0.5]);
    asymmetricEmaStep(input, state, 0.5, 0.1);
    for (const v of state) expect(v).toBeCloseTo(0.5);
  });
});

describe('createSmoother', () => {
  it('initializes state to zeros of correct length', () => {
    const s = createSmoother(32);
    expect(s.state.length).toBe(32);
    for (const v of s.state) expect(v).toBe(0);
  });

  it('step input rises to ≈63% after attackTau seconds', () => {
    const s = createSmoother(1, { attackMs: 10, releaseMs: 120 });
    // Drive with constant input=1.0 for 10ms total in 1ms steps.
    const input = new Float32Array([1.0]);
    for (let i = 0; i < 10; i++) s.process(input, 0.001);
    // After 1 tau, should be close to 1 - 1/e ≈ 0.632
    expect(s.state[0]!).toBeCloseTo(1 - 1 / Math.E, 2);
  });

  it('step drop falls at release tau (slower than attack)', () => {
    const s = createSmoother(1, { attackMs: 10, releaseMs: 120 });
    s.state[0] = 1.0;
    const input = new Float32Array([0]);
    // Advance 10ms total — release tau is 120ms, so should have fallen ~8%
    for (let i = 0; i < 10; i++) s.process(input, 0.001);
    // 1 - exp(-0.010 / 0.120) = ~0.0800
    expect(s.state[0]!).toBeCloseTo(1 - (1 - Math.exp(-10 / 120)), 2);
    // Equivalent: remaining ~= exp(-10/120) ≈ 0.9200
    expect(s.state[0]!).toBeCloseTo(Math.exp(-10 / 120), 2);
  });

  it('reset() zeros state', () => {
    const s = createSmoother(4);
    s.state[0] = 1;
    s.state[1] = 2;
    s.reset();
    for (const v of s.state) expect(v).toBe(0);
  });
});
