import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createNativeBridgeSource } from '../src/sources/createNativeBridgeSource.js';
import { AudioSourceUnavailableError } from '../src/types.js';
import { __resetAudioContextForTests } from '../src/sources/shared/audioContext.js';
import { __resetPcmInjectorModuleForTests } from '../src/sources/pcmInjector.js';
import type { Ticker } from '../src/sources/shared/baseSource.js';

// ── Mock WebSocket (test drives the events) ───────────────────────────────────
let lastWS: MockWS | null = null;
let throwOnConstruct = false;

class MockWS {
  static OPEN = 1;
  binaryType = 'blob';
  sent: string[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    if (throwOnConstruct) throw new Error('connection refused');
    lastWS = this;
  }
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    this.closed = true;
  }
  // helpers
  rxHello() {
    this.onmessage?.({ data: '{"type":"hello","protocol":1}' });
  }
  rxReady() {
    this.onmessage?.({
      data: '{"type":"ready","sampleRate":48000,"channels":1,"blockSize":1024,"format":"f32le","protocol":1}',
    });
  }
}

class MockAnalyser {
  fftSize = 0;
  smoothingTimeConstant = 0;
  get frequencyBinCount() {
    return this.fftSize / 2;
  }
  getFloatFrequencyData(o: Float32Array) {
    o.fill(-60);
  }
  getFloatTimeDomainData(o: Float32Array) {
    o.fill(0);
  }
  disconnect = vi.fn();
}
class MockAudioContext {
  sampleRate = 48000;
  state = 'running';
  audioWorklet = { addModule: vi.fn(async () => {}) };
  createAnalyser() {
    return new MockAnalyser();
  }
  async resume() {}
}

function manualTicker(): Ticker & { fire(n: number): void } {
  let cb: ((n: number) => void) | null = null;
  return { start(fn) { cb = fn; }, stop() { cb = null; }, fire(n) { cb?.(n); } };
}

beforeEach(() => {
  __resetAudioContextForTests();
  __resetPcmInjectorModuleForTests();
  lastWS = null;
  throwOnConstruct = false;
  // @ts-expect-error test globals
  globalThis.AudioContext = MockAudioContext;
  // @ts-expect-error test globals
  globalThis.WebSocket = MockWS;
  // @ts-expect-error test globals
  globalThis.AudioWorkletNode = class {
    port = { postMessage: vi.fn() };
    connect = vi.fn();
    disconnect = vi.fn();
  };
  // @ts-expect-error test globals
  globalThis.Blob = class {
    constructor(public parts: unknown[], public opts: unknown) {}
  };
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock');
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe('createNativeBridgeSource handshake', () => {
  it('hello → sends auth(token) → ready resolves start()', async () => {
    const src = createNativeBridgeSource({ token: 'tok-123', ticker: manualTicker() });
    const started = src.start();
    await Promise.resolve();
    expect(lastWS).not.toBeNull();
    lastWS!.rxHello();
    expect(JSON.parse(lastWS!.sent[0]!)).toEqual({ type: 'auth', token: 'tok-123' });
    lastWS!.rxReady();
    await expect(started).resolves.toBeUndefined();
    src.stop();
  });

  it('binaryType is set to arraybuffer', async () => {
    const src = createNativeBridgeSource({ token: 't', ticker: manualTicker() });
    const p = src.start();
    await Promise.resolve();
    expect(lastWS!.binaryType).toBe('arraybuffer');
    lastWS!.rxHello();
    lastWS!.rxReady();
    await p;
    src.stop();
  });

  it('close after auth, before ready → rejects auth-failed', async () => {
    const src = createNativeBridgeSource({ token: 'bad', ticker: manualTicker() });
    const started = src.start();
    await Promise.resolve();
    lastWS!.rxHello(); // we send auth
    lastWS!.onclose?.(); // server rejects the token
    await expect(started).rejects.toMatchObject({
      name: 'AudioSourceUnavailableError',
      reason: 'auth-failed',
    });
  });

  it('close before any hello → rejects bridge-unreachable', async () => {
    const src = createNativeBridgeSource({ token: 't', ticker: manualTicker() });
    const started = src.start();
    await Promise.resolve();
    lastWS!.onclose?.();
    await expect(started).rejects.toMatchObject({ reason: 'bridge-unreachable' });
  });

  it('WebSocket constructor throw → rejects bridge-unreachable', async () => {
    throwOnConstruct = true;
    const src = createNativeBridgeSource({ token: 't', ticker: manualTicker() });
    await expect(src.start()).rejects.toMatchObject({
      reason: 'bridge-unreachable',
    });
  });

  it('no ready within readyTimeoutMs → rejects bridge-unreachable', async () => {
    const src = createNativeBridgeSource({
      token: 't',
      readyTimeoutMs: 30,
      ticker: manualTicker(),
    });
    const started = src.start();
    await Promise.resolve();
    lastWS!.rxHello(); // auth sent but server never says ready
    await expect(started).rejects.toMatchObject({ reason: 'bridge-unreachable' });
  });

  it('error event before hello → bridge-unreachable; after → auth-failed', async () => {
    const a = createNativeBridgeSource({ token: 't', ticker: manualTicker() });
    const pa = a.start();
    await Promise.resolve();
    lastWS!.onerror?.();
    await expect(pa).rejects.toMatchObject({ reason: 'bridge-unreachable' });

    const b = createNativeBridgeSource({ token: 't', ticker: manualTicker() });
    const pb = b.start();
    await Promise.resolve();
    lastWS!.rxHello();
    lastWS!.onerror?.();
    await expect(pb).rejects.toMatchObject({ reason: 'auth-failed' });
  });

  it('kind is nativeBridge and is an AudioSourceUnavailableError instance', async () => {
    throwOnConstruct = true;
    const src = createNativeBridgeSource({ token: 't', ticker: manualTicker() });
    const err = await src.start().catch((e) => e);
    expect(err).toBeInstanceOf(AudioSourceUnavailableError);
    expect(err.kind).toBe('nativeBridge');
    expect(src.kind).toBe('nativeBridge');
  });
});
