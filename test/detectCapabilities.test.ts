import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { detectCapabilities } from '../src/engine/detectCapabilities.js';

function mockBrowser(env: {
  hasAudioContext: boolean;
  userAgent: string;
  hasGetUserMedia?: boolean;
  hasGetDisplayMedia?: boolean;
}) {
  if (env.hasAudioContext) vi.stubGlobal('AudioContext', class {});
  else vi.stubGlobal('AudioContext', undefined);
  vi.stubGlobal('HTMLMediaElement', class {});
  vi.stubGlobal(
    'Blob',
    class {
      async arrayBuffer() {
        return new ArrayBuffer(0);
      }
    },
  );
  vi.stubGlobal('navigator', {
    userAgent: env.userAgent,
    mediaDevices: {
      getUserMedia: env.hasGetUserMedia !== false ? () => Promise.resolve({}) : undefined,
      getDisplayMedia:
        env.hasGetDisplayMedia !== false ? () => Promise.resolve({}) : undefined,
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('detectCapabilities', () => {
  it('Chrome desktop → everything true', () => {
    mockBrowser({
      hasAudioContext: true,
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    });
    const c = detectCapabilities();
    expect(c).toEqual({
      mediaElement: true,
      microphone: true,
      displayMedia: true,
      file: true,
    });
  });

  it('Safari desktop → displayMedia false, others true', () => {
    mockBrowser({
      hasAudioContext: true,
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    });
    const c = detectCapabilities();
    expect(c.mediaElement).toBe(true);
    expect(c.microphone).toBe(true);
    expect(c.displayMedia).toBe(false);
    expect(c.file).toBe(true);
  });

  it('Firefox desktop → displayMedia false, others true', () => {
    mockBrowser({
      hasAudioContext: true,
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0',
    });
    const c = detectCapabilities();
    expect(c.displayMedia).toBe(false);
    expect(c.microphone).toBe(true);
  });

  it('Mobile Chrome → displayMedia false (mobile excluded by UA check)', () => {
    mockBrowser({
      hasAudioContext: true,
      userAgent:
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
    });
    const c = detectCapabilities();
    expect(c.displayMedia).toBe(false);
    expect(c.microphone).toBe(true);
  });

  it('no AudioContext → everything false', () => {
    mockBrowser({
      hasAudioContext: false,
      userAgent: 'anything',
    });
    const c = detectCapabilities();
    expect(c.mediaElement).toBe(false);
    expect(c.microphone).toBe(false);
    expect(c.displayMedia).toBe(false);
    expect(c.file).toBe(false);
  });
});
