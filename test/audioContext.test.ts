import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getAudioContext,
  unlockAudioContext,
  __resetAudioContextForTests,
} from '../src/sources/shared/audioContext.js';

class MockAudioContext {
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  resume = vi.fn(async () => {
    this.state = 'running';
  });
}

beforeEach(() => {
  __resetAudioContextForTests();
  // @ts-expect-error — mock on globalThis for test env
  globalThis.AudioContext = MockAudioContext;
});

describe('getAudioContext', () => {
  it('returns the same instance across calls (singleton)', () => {
    const a = getAudioContext();
    const b = getAudioContext();
    expect(a).toBe(b);
  });

  it('throws if neither AudioContext nor webkitAudioContext exists', () => {
    __resetAudioContextForTests();
    // @ts-expect-error — simulate missing constructor
    delete globalThis.AudioContext;
    expect(() => getAudioContext()).toThrow(/AudioContext is not available/);
  });
});

describe('unlockAudioContext', () => {
  it('installs listeners that resume the context on user gesture', () => {
    const target = new EventTarget();
    unlockAudioContext(target);
    const ctx = getAudioContext() as unknown as MockAudioContext;
    expect(ctx.resume).not.toHaveBeenCalled();

    target.dispatchEvent(new Event('click'));
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('is a no-op if context is already running', () => {
    const ctx = getAudioContext() as unknown as MockAudioContext;
    ctx.state = 'running';
    const target = new EventTarget();
    const addSpy = vi.spyOn(target, 'addEventListener');
    unlockAudioContext(target);
    expect(addSpy).not.toHaveBeenCalled();
  });

  it('is idempotent across repeat calls', () => {
    const target = new EventTarget();
    const addSpy = vi.spyOn(target, 'addEventListener');
    unlockAudioContext(target);
    unlockAudioContext(target);
    unlockAudioContext(target);
    // Only the first call attached listeners
    expect(addSpy.mock.calls.length).toBeGreaterThan(0);
    const firstCallCount = addSpy.mock.calls.length;
    unlockAudioContext(target);
    expect(addSpy.mock.calls.length).toBe(firstCallCount);
  });
});
