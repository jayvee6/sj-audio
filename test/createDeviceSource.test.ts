import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDeviceSource } from '../src/sources/createDeviceSource.js';
import { AudioSourceUnavailableError } from '../src/types.js';
import { __resetAudioContextForTests } from '../src/sources/shared/audioContext.js';
import type { Ticker } from '../src/sources/shared/baseSource.js';

class MockAnalyserNode {
  fftSize = 0;
  smoothingTimeConstant = 0;
  get frequencyBinCount() {
    return this.fftSize / 2;
  }
  getFloatFrequencyData(o: Float32Array) {
    o.fill(-40);
  }
  getFloatTimeDomainData(o: Float32Array) {
    o.fill(0);
  }
  disconnect = vi.fn();
}
class MockMediaStreamSource {
  connect = vi.fn();
  disconnect = vi.fn();
}
class MockAudioContext {
  sampleRate = 48000;
  state = 'running';
  destination = {};
  createAnalyser() {
    return new MockAnalyserNode();
  }
  createMediaStreamSource() {
    return new MockMediaStreamSource();
  }
  async resume() {}
}

function track(kind = 'audio') {
  return { kind, stop: vi.fn() };
}
function makeStream(tracks = [track()]) {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
  };
}

function manualTicker(): Ticker {
  return { start() {}, stop() {} };
}

let getUserMedia: ReturnType<typeof vi.fn>;

function installBrowser(gum?: (c: unknown) => Promise<unknown>) {
  getUserMedia = vi.fn(gum ?? (async () => makeStream()));
  vi.stubGlobal('AudioContext', MockAudioContext);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
}

beforeEach(() => {
  __resetAudioContextForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createDeviceSource', () => {
  it('passes deviceId as an exact constraint with DSP disabled by default', async () => {
    installBrowser();
    const src = createDeviceSource({ deviceId: 'bh-1', ticker: manualTicker() });
    await src.start();
    const arg = getUserMedia.mock.calls[0][0] as { audio: Record<string, unknown> };
    expect(arg.audio.deviceId).toEqual({ exact: 'bh-1' });
    expect(arg.audio.noiseSuppression).toBe(false);
    expect(arg.audio.echoCancellation).toBe(false);
    expect(arg.audio.autoGainControl).toBe(false);
    src.stop();
  });

  it('disableProcessing:false keeps browser DSP (no flags sent)', async () => {
    installBrowser();
    const src = createDeviceSource({
      deviceId: 'x',
      disableProcessing: false,
      ticker: manualTicker(),
    });
    await src.start();
    const arg = getUserMedia.mock.calls[0][0] as { audio: Record<string, unknown> };
    expect('noiseSuppression' in arg.audio).toBe(false);
    expect(arg.audio.deviceId).toEqual({ exact: 'x' });
    src.stop();
  });

  it('omitting deviceId captures the default input (no deviceId constraint)', async () => {
    installBrowser();
    const src = createDeviceSource({ ticker: manualTicker() });
    await src.start();
    const arg = getUserMedia.mock.calls[0][0] as { audio: Record<string, unknown> };
    expect('deviceId' in arg.audio).toBe(false);
    src.stop();
  });

  it('caller constraints override the DSP-off defaults', async () => {
    installBrowser();
    const src = createDeviceSource({
      deviceId: 'x',
      constraints: { echoCancellation: true, channelCount: 2 },
      ticker: manualTicker(),
    });
    await src.start();
    const arg = getUserMedia.mock.calls[0][0] as { audio: Record<string, unknown> };
    expect(arg.audio.echoCancellation).toBe(true);
    expect(arg.audio.channelCount).toBe(2);
    expect(arg.audio.noiseSuppression).toBe(false);
    src.stop();
  });

  it('maps NotAllowedError to permission-denied and tags kind=device', async () => {
    installBrowser(async () => {
      throw Object.assign(new Error('no'), { name: 'NotAllowedError' });
    });
    const src = createDeviceSource({ deviceId: 'x', ticker: manualTicker() });
    const err = await src.start().catch((e) => e);
    expect(err).toBeInstanceOf(AudioSourceUnavailableError);
    expect(err.kind).toBe('device');
    expect(err.reason).toBe('permission-denied');
  });

  it('maps NotFoundError to no-audio-track', async () => {
    installBrowser(async () => {
      throw Object.assign(new Error('none'), { name: 'NotFoundError' });
    });
    const src = createDeviceSource({ deviceId: 'x', ticker: manualTicker() });
    const err = await src.start().catch((e) => e);
    expect(err.reason).toBe('no-audio-track');
  });

  it('rejects no-audio-track and stops tracks when the stream has no audio', async () => {
    const t = track('video');
    installBrowser(async () => makeStream([t]));
    const src = createDeviceSource({ deviceId: 'x', ticker: manualTicker() });
    const err = await src.start().catch((e) => e);
    expect(err.reason).toBe('no-audio-track');
    expect(t.stop).toHaveBeenCalled();
  });

  it('onStop stops the captured tracks', async () => {
    const t = track();
    installBrowser(async () => makeStream([t]));
    const src = createDeviceSource({ deviceId: 'x', ticker: manualTicker() });
    await src.start();
    src.stop();
    expect(t.stop).toHaveBeenCalled();
  });

  it('kind is "device"', () => {
    installBrowser();
    expect(createDeviceSource().kind).toBe('device');
  });
});
