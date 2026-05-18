import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  listAudioInputDevices,
  onDeviceChange,
} from '../src/sources/listAudioInputDevices.js';
import { AudioSourceUnavailableError } from '../src/types.js';

function makeStream() {
  const stop = vi.fn();
  return { _stop: stop, getTracks: () => [{ stop }] };
}

function installNav(over: Record<string, unknown> = {}) {
  const stream = makeStream();
  const getUserMedia = vi.fn(async () => stream);
  const enumerateDevices = vi.fn(async () => [
    { kind: 'audioinput', deviceId: 'mic-1', label: 'Built-in Mic', groupId: 'g1' },
    { kind: 'audioinput', deviceId: 'blackhole-2', label: '', groupId: 'g2' },
    { kind: 'audiooutput', deviceId: 'spk-1', label: 'Speakers', groupId: 'g1' },
    { kind: 'videoinput', deviceId: 'cam-1', label: 'Webcam', groupId: 'g3' },
  ]);
  const nav = { mediaDevices: { getUserMedia, enumerateDevices, ...over } };
  vi.stubGlobal('navigator', nav);
  return { stream, getUserMedia, enumerateDevices };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listAudioInputDevices', () => {
  it('unlocks labels (temp getUserMedia, tracks stopped) then filters to audioinput', async () => {
    const { getUserMedia, stream } = installNav();
    const devices = await listAudioInputDevices();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(stream._stop).toHaveBeenCalled();
    expect(devices.map((d) => d.deviceId)).toEqual(['mic-1', 'blackhole-2']);
  });

  it('falls back to a stable label when the browser withholds it', async () => {
    installNav();
    const devices = await listAudioInputDevices();
    const bh = devices.find((d) => d.deviceId === 'blackhole-2');
    expect(bh?.label).toBe('Audio input (blackhol)');
  });

  it('maps NotAllowedError on the label-unlock prompt to permission-denied', async () => {
    installNav({
      getUserMedia: vi.fn(async () => {
        throw Object.assign(new Error('no'), { name: 'NotAllowedError' });
      }),
    });
    const err = await listAudioInputDevices().catch((e) => e);
    expect(err).toBeInstanceOf(AudioSourceUnavailableError);
    expect(err.reason).toBe('permission-denied');
    expect(err.kind).toBe('device');
  });

  it('swallows NotFoundError and still enumerates (labels just blank)', async () => {
    const enumerateDevices = vi.fn(async () => [
      { kind: 'audioinput', deviceId: 'x', label: '', groupId: 'g' },
    ]);
    installNav({
      getUserMedia: vi.fn(async () => {
        throw Object.assign(new Error('none'), { name: 'NotFoundError' });
      }),
      enumerateDevices,
    });
    const devices = await listAudioInputDevices();
    expect(enumerateDevices).toHaveBeenCalled();
    expect(devices).toHaveLength(1);
  });

  it('throws unsupported when mediaDevices is absent', async () => {
    vi.stubGlobal('navigator', {});
    const err = await listAudioInputDevices().catch((e) => e);
    expect(err).toBeInstanceOf(AudioSourceUnavailableError);
    expect(err.reason).toBe('unsupported');
  });

  it('onDeviceChange is a safe no-op when unsupported', () => {
    vi.stubGlobal('navigator', {});
    const unsub = onDeviceChange(() => {});
    expect(() => unsub()).not.toThrow();
  });

  it('onDeviceChange subscribes and unsubscribes when supported', () => {
    const add = vi.fn();
    const remove = vi.fn();
    vi.stubGlobal('navigator', {
      mediaDevices: { addEventListener: add, removeEventListener: remove },
    });
    const cb = () => {};
    const unsub = onDeviceChange(cb);
    expect(add).toHaveBeenCalledWith('devicechange', cb);
    unsub();
    expect(remove).toHaveBeenCalledWith('devicechange', cb);
  });
});
