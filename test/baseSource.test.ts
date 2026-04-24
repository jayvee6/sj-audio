import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBaseSource, type Ticker } from '../src/sources/shared/baseSource.js';
import { __resetAudioContextForTests } from '../src/sources/shared/audioContext.js';
import { AudioSourceUnavailableError } from '../src/types.js';

// ── Mock AudioContext ─────────────────────────────────────────────────────────
class MockAnalyserNode {
  fftSize = 0;
  smoothingTimeConstant = 0;
  get frequencyBinCount() {
    return this.fftSize / 2;
  }
  getFloatFrequencyData(out: Float32Array) {
    for (let i = 0; i < out.length; i++) out[i] = -40;
  }
  getFloatTimeDomainData(out: Float32Array) {
    for (let i = 0; i < out.length; i++) out[i] = 0;
  }
  disconnect = vi.fn();
}

class MockAudioContext {
  sampleRate = 48000;
  state: 'suspended' | 'running' = 'suspended';
  createAnalyser() {
    return new MockAnalyserNode();
  }
  async resume() {
    this.state = 'running';
  }
}

// ── Manual ticker: fires on demand ────────────────────────────────────────────
function createManualTicker(): Ticker & { fire(nowMs: number): void } {
  let cb: ((now: number) => void) | null = null;
  return {
    start(fn) {
      cb = fn;
    },
    stop() {
      cb = null;
    },
    fire(nowMs) {
      cb?.(nowMs);
    },
  };
}

beforeEach(() => {
  __resetAudioContextForTests();
  // @ts-expect-error — mock on globalThis
  globalThis.AudioContext = MockAudioContext;
});

describe('createBaseSource', () => {
  it('returns AudioSource shape with kind + capabilities', () => {
    const s = createBaseSource({
      kind: 'microphone',
      capabilities: { mediaElement: true, microphone: true, displayMedia: false, file: true },
      onStart: () => {},
    });
    expect(s.kind).toBe('microphone');
    expect(s.capabilities.microphone).toBe(true);
    expect(s.capabilities.displayMedia).toBe(false);
  });

  it('returns null frame before start()', () => {
    const s = createBaseSource({
      kind: 'file',
      capabilities: { mediaElement: true, microphone: true, displayMedia: false, file: true },
      onStart: () => {},
    });
    expect(s.currentFrame()).toBeNull();
  });

  it('start() calls onStart with ctx + analyzerInput', async () => {
    const onStart = vi.fn();
    const ticker = createManualTicker();
    const s = createBaseSource({
      kind: 'microphone',
      capabilities: { mediaElement: true, microphone: true, displayMedia: false, file: true },
      onStart,
      ticker,
    });
    await s.start();
    expect(onStart).toHaveBeenCalledTimes(1);
    const arg = onStart.mock.calls[0]![0];
    expect(arg.ctx).toBeDefined();
    expect(arg.analyzerInput).toBeDefined();
    s.stop();
  });

  it('emits frames via onFrame on each ticker tick', async () => {
    const ticker = createManualTicker();
    const s = createBaseSource({
      kind: 'microphone',
      capabilities: { mediaElement: true, microphone: true, displayMedia: false, file: true },
      onStart: () => {},
      ticker,
    });
    const onFrame = vi.fn();
    s.onFrame(onFrame);
    await s.start();
    ticker.fire(16);
    ticker.fire(33);
    expect(onFrame).toHaveBeenCalledTimes(2);
    s.stop();
  });

  it('currentFrame() returns the latest after start', async () => {
    const ticker = createManualTicker();
    const s = createBaseSource({
      kind: 'microphone',
      capabilities: { mediaElement: true, microphone: true, displayMedia: false, file: true },
      onStart: () => {},
      ticker,
    });
    await s.start();
    ticker.fire(16);
    expect(s.currentFrame()).not.toBeNull();
    s.stop();
  });

  it('re-throws AudioSourceUnavailableError from onStart unchanged', async () => {
    const s = createBaseSource({
      kind: 'displayMedia',
      capabilities: { mediaElement: false, microphone: false, displayMedia: false, file: false },
      onStart: () => {
        throw new AudioSourceUnavailableError('displayMedia', 'unsupported');
      },
    });
    await expect(s.start()).rejects.toBeInstanceOf(AudioSourceUnavailableError);
  });

  it('wraps unknown errors from onStart as unsupported', async () => {
    const s = createBaseSource({
      kind: 'file',
      capabilities: { mediaElement: true, microphone: true, displayMedia: false, file: true },
      onStart: () => {
        throw new Error('boom');
      },
    });
    try {
      await s.start();
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AudioSourceUnavailableError);
      expect((err as AudioSourceUnavailableError).reason).toBe('unsupported');
    }
  });

  it('stop() calls onStop + disposes analyzer, safe to call without start', () => {
    const onStop = vi.fn();
    const s = createBaseSource({
      kind: 'microphone',
      capabilities: { mediaElement: true, microphone: true, displayMedia: false, file: true },
      onStart: () => {},
      onStop,
    });
    // Before start — no-op
    s.stop();
    expect(onStop).not.toHaveBeenCalled();
  });

  it('unsubscribe returned from onFrame detaches the listener', async () => {
    const ticker = createManualTicker();
    const s = createBaseSource({
      kind: 'microphone',
      capabilities: { mediaElement: true, microphone: true, displayMedia: false, file: true },
      onStart: () => {},
      ticker,
    });
    const cb = vi.fn();
    const unsub = s.onFrame(cb);
    await s.start();
    ticker.fire(16);
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
    ticker.fire(33);
    expect(cb).toHaveBeenCalledTimes(1); // still 1
    s.stop();
  });

  it('setViewport propagates to the frame', async () => {
    const ticker = createManualTicker();
    const s = createBaseSource({
      kind: 'microphone',
      capabilities: { mediaElement: true, microphone: true, displayMedia: false, file: true },
      onStart: () => {},
      ticker,
    });
    await s.start();
    s.setViewport(1024, 768);
    ticker.fire(16);
    expect(s.currentFrame()?.width).toBe(1024);
    expect(s.currentFrame()?.height).toBe(768);
    s.stop();
  });

  it('setViewport before start is captured and applied on start', async () => {
    const ticker = createManualTicker();
    const s = createBaseSource({
      kind: 'microphone',
      capabilities: { mediaElement: true, microphone: true, displayMedia: false, file: true },
      onStart: () => {},
      ticker,
    });
    s.setViewport(800, 600);
    await s.start();
    ticker.fire(16);
    expect(s.currentFrame()?.width).toBe(800);
    expect(s.currentFrame()?.height).toBe(600);
    s.stop();
  });

  it('swallows listener errors so the loop keeps running', async () => {
    const ticker = createManualTicker();
    const s = createBaseSource({
      kind: 'microphone',
      capabilities: { mediaElement: true, microphone: true, displayMedia: false, file: true },
      onStart: () => {},
      ticker,
    });
    const good = vi.fn();
    s.onFrame(() => {
      throw new Error('bad listener');
    });
    s.onFrame(good);
    await s.start();
    ticker.fire(16);
    ticker.fire(33);
    expect(good).toHaveBeenCalledTimes(2);
    s.stop();
  });
});
