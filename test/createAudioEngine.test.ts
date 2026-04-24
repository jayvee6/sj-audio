import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAudioEngine } from '../src/engine/createAudioEngine.js';
import { __resetAudioContextForTests } from '../src/sources/shared/audioContext.js';

// ── Install a minimal Chrome-desktop environment for every test ──────────────

class MockAnalyserNode {
  fftSize = 0;
  smoothingTimeConstant = 0;
  get frequencyBinCount() {
    return this.fftSize / 2;
  }
  getFloatFrequencyData(out: Float32Array) {
    out.fill(-40);
  }
  getFloatTimeDomainData(out: Float32Array) {
    out.fill(0);
  }
  disconnect = vi.fn();
}

class MockMediaStreamSource {
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockAudioContext {
  sampleRate = 48000;
  state: 'suspended' | 'running' = 'running';
  destination = {};
  createAnalyser() {
    return new MockAnalyserNode();
  }
  createMediaStreamSource() {
    return new MockMediaStreamSource();
  }
  async resume() {}
}

function installBrowser() {
  vi.stubGlobal('AudioContext', MockAudioContext);
  vi.stubGlobal('HTMLMediaElement', class {});
  vi.stubGlobal(
    'MediaStream',
    class {
      tracks: { kind: string; stop: () => void }[];
      constructor(tracks: { kind: string; stop: () => void }[] = []) {
        this.tracks = tracks;
      }
      getTracks() {
        return this.tracks;
      }
      getAudioTracks() {
        return this.tracks.filter((t) => t.kind === 'audio');
      }
    },
  );
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
    return setTimeout(() => cb(performance.now()), 0);
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));

  const navMock = {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    mediaDevices: {
      getUserMedia: vi.fn(async () => {
        // @ts-expect-error use the mock
        const MS = globalThis.MediaStream as unknown as new (
          t: { kind: string; stop: () => void }[],
        ) => MediaStream;
        return new MS([{ kind: 'audio', stop: () => {} }]);
      }),
      getDisplayMedia: vi.fn(async () => {
        // @ts-expect-error
        const MS = globalThis.MediaStream as unknown as new (
          t: { kind: string; stop: () => void }[],
        ) => MediaStream;
        return new MS([
          { kind: 'audio', stop: () => {} },
          { kind: 'video', stop: () => {} },
        ]);
      }),
    },
  };
  vi.stubGlobal('navigator', navMock);
  return navMock;
}

beforeEach(() => {
  __resetAudioContextForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createAudioEngine', () => {
  it('defaults to ["displayMedia","microphone","file"] fallback chain', async () => {
    installBrowser();
    const engine = createAudioEngine();
    await engine.start();
    expect(engine.activeKind).toBe('displayMedia');
    engine.stop();
  });

  it('honors preferredSource = microphone even when displayMedia is available', async () => {
    installBrowser();
    const engine = createAudioEngine({ preferredSource: 'microphone' });
    await engine.start();
    expect(engine.activeKind).toBe('microphone');
    engine.stop();
  });

  it('falls back to microphone when displayMedia fails', async () => {
    const nav = installBrowser();
    nav.mediaDevices.getDisplayMedia = vi.fn(async () => {
      throw Object.assign(new Error('nope'), { name: 'NotAllowedError' });
    });
    const engine = createAudioEngine();
    await engine.start();
    expect(engine.activeKind).toBe('microphone');
    engine.stop();
  });

  it('skips kinds without their required payload (file without opts.file)', async () => {
    installBrowser();
    const engine = createAudioEngine({ fallbackChain: ['file', 'microphone'] });
    await engine.start();
    expect(engine.activeKind).toBe('microphone');
    engine.stop();
  });

  it('switchTo() swaps the active kind', async () => {
    installBrowser();
    const engine = createAudioEngine();
    await engine.start();
    expect(engine.activeKind).toBe('displayMedia');
    await engine.switchTo('microphone');
    expect(engine.activeKind).toBe('microphone');
    engine.stop();
  });

  it('onFrame listeners persist across switchTo()', async () => {
    installBrowser();
    const engine = createAudioEngine();
    const cb = vi.fn();
    engine.onFrame(cb);
    await engine.start();
    await new Promise((r) => setTimeout(r, 20));
    const beforeSwap = cb.mock.calls.length;
    expect(beforeSwap).toBeGreaterThan(0);
    await engine.switchTo('microphone');
    await new Promise((r) => setTimeout(r, 20));
    expect(cb.mock.calls.length).toBeGreaterThan(beforeSwap);
    engine.stop();
  });

  it('capabilities reflects detectCapabilities()', async () => {
    installBrowser();
    const engine = createAudioEngine();
    expect(engine.capabilities.microphone).toBe(true);
    expect(engine.capabilities.displayMedia).toBe(true);
  });

  it('activeKind is null before start() and after stop()', async () => {
    installBrowser();
    const engine = createAudioEngine();
    expect(engine.activeKind).toBeNull();
    await engine.start();
    expect(engine.activeKind).not.toBeNull();
    engine.stop();
    expect(engine.activeKind).toBeNull();
  });

  it('throws the last error when every kind in the chain fails', async () => {
    const nav = installBrowser();
    nav.mediaDevices.getDisplayMedia = vi.fn(async () => {
      throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    });
    nav.mediaDevices.getUserMedia = vi.fn(async () => {
      throw Object.assign(new Error('no mic'), { name: 'NotFoundError' });
    });
    const engine = createAudioEngine({ fallbackChain: ['displayMedia', 'microphone'] });
    await expect(engine.start()).rejects.toThrow();
  });

  it('setViewport is applied to subsequent active source', async () => {
    installBrowser();
    const engine = createAudioEngine();
    engine.setViewport(1200, 800);
    await engine.start();
    await new Promise((r) => setTimeout(r, 10));
    expect(engine.currentFrame()?.width).toBe(1200);
    expect(engine.currentFrame()?.height).toBe(800);
    engine.stop();
  });
});
