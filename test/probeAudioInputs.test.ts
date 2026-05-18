import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  probeAudioInputLevels,
  detectActiveAudioInput,
} from '../src/sources/probeAudioInputs.js';

let closeSpy: ReturnType<typeof vi.fn>;
let ctxCount = 0;

class MockAnalyser {
  fftSize = 0;
  constructor(private fill: number) {}
  get frequencyBinCount() {
    return this.fftSize / 2;
  }
  getByteFrequencyData(arr: Uint8Array) {
    arr.fill(this.fill);
  }
}
class MockMediaStreamSource {
  connect = vi.fn();
}

function installAudio(fill = 0) {
  ctxCount = 0;
  closeSpy = vi.fn(async () => {});
  class MockAudioContext {
    constructor() {
      ctxCount++;
    }
    createMediaStreamSource() {
      return new MockMediaStreamSource();
    }
    createAnalyser() {
      return new MockAnalyser(fill);
    }
    close = closeSpy;
  }
  vi.stubGlobal('AudioContext', MockAudioContext);
}

interface Dev {
  deviceId: string;
  label: string;
  groupId: string;
}

function installNav(
  devices: Dev[],
  opts: { getUserMedia?: ReturnType<typeof vi.fn> } = {},
) {
  const getUserMedia =
    opts.getUserMedia ??
    vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] }));
  const enumerateDevices = vi.fn(async () =>
    devices.map((d) => ({ kind: 'audioinput', ...d })),
  );
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia, enumerateDevices },
  });
  return { getUserMedia, enumerateDevices };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const FAST = { samples: 1, intervalMs: 0 };

describe('probeAudioInputLevels', () => {
  it('probes each device on its own throwaway context and closes it', async () => {
    installAudio(0);
    installNav([
      { deviceId: 'a', label: 'A', groupId: 'g' },
      { deviceId: 'b', label: 'B', groupId: 'g' },
    ]);
    const levels = await probeAudioInputLevels(undefined, FAST);
    expect(levels).toHaveLength(2);
    expect(ctxCount).toBe(2);
    expect(closeSpy).toHaveBeenCalledTimes(2);
  });

  it('returns levels sorted by rms descending', async () => {
    installAudio(100);
    installNav([
      { deviceId: 'a', label: 'A', groupId: 'g' },
      { deviceId: 'b', label: 'B', groupId: 'g' },
    ]);
    const levels = await probeAudioInputLevels(undefined, FAST);
    expect(levels[0].rms).toBeGreaterThan(0);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i - 1].rms).toBeGreaterThanOrEqual(levels[i].rms);
    }
  });

  it('per-device failure resolves to rms 0 (batch never rejects)', async () => {
    installAudio(100);
    installNav([{ deviceId: 'a', label: 'A', groupId: 'g' }], {
      getUserMedia: vi.fn(async () => {
        throw new Error('busy');
      }),
    });
    const levels = await probeAudioInputLevels(
      [{ deviceId: 'a', label: 'A', groupId: 'g' }],
      FAST,
    );
    expect(levels).toEqual([{ deviceId: 'a', label: 'A', rms: 0 }]);
  });

  it('a pre-aborted signal skips capture entirely', async () => {
    installAudio(100);
    const { getUserMedia } = installNav([
      { deviceId: 'a', label: 'A', groupId: 'g' },
    ]);
    const ac = new AbortController();
    ac.abort();
    const levels = await probeAudioInputLevels(
      [{ deviceId: 'a', label: 'A', groupId: 'g' }],
      { ...FAST, signal: ac.signal },
    );
    expect(levels[0].rms).toBe(0);
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});

describe('detectActiveAudioInput', () => {
  it('returns the loudest device when something is playing', async () => {
    installAudio(80);
    installNav([
      { deviceId: 'a', label: 'A', groupId: 'g' },
      { deviceId: 'b', label: 'B', groupId: 'g' },
    ]);
    const best = await detectActiveAudioInput(FAST);
    expect(best).not.toBeNull();
    expect(['a', 'b']).toContain(best!.deviceId);
  });

  it('returns null when every input is silent', async () => {
    installAudio(0);
    installNav([{ deviceId: 'a', label: 'A', groupId: 'g' }]);
    const best = await detectActiveAudioInput(FAST);
    expect(best).toBeNull();
  });

  it('returns null when there are no input devices', async () => {
    installAudio(0);
    installNav([]);
    const best = await detectActiveAudioInput(FAST);
    expect(best).toBeNull();
  });
});
