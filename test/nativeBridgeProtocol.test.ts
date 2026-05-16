import { describe, it, expect } from 'vitest';
import {
  decodeBridgeMessage,
  buildAuthMessage,
  BridgeProtocolError,
  BRIDGE_PROTOCOL_VERSION,
} from '../src/sources/nativeBridgeProtocol.js';

describe('buildAuthMessage', () => {
  it('produces the exact auth JSON the bridge expects', () => {
    expect(JSON.parse(buildAuthMessage('abc123'))).toEqual({
      type: 'auth',
      token: 'abc123',
    });
  });
});

describe('decodeBridgeMessage — control', () => {
  it('parses hello', () => {
    expect(decodeBridgeMessage('{"type":"hello","protocol":1}')).toEqual({
      kind: 'hello',
      protocol: 1,
    });
  });

  it('parses a valid ready', () => {
    const r = decodeBridgeMessage(
      '{"type":"ready","sampleRate":48000,"channels":1,"blockSize":1024,"format":"f32le","protocol":1}',
    );
    expect(r).toEqual({
      kind: 'ready',
      sampleRate: 48000,
      channels: 1,
      blockSize: 1024,
      format: 'f32le',
      protocol: 1,
    });
  });

  it('throws on unsupported PCM format', () => {
    expect(() =>
      decodeBridgeMessage(
        '{"type":"ready","sampleRate":48000,"channels":1,"blockSize":1024,"format":"s16le","protocol":1}',
      ),
    ).toThrow(BridgeProtocolError);
  });

  it('throws on protocol mismatch', () => {
    expect(() =>
      decodeBridgeMessage(
        '{"type":"ready","sampleRate":48000,"channels":1,"blockSize":1024,"format":"f32le","protocol":999}',
      ),
    ).toThrow(/protocol mismatch/);
  });

  it('throws on invalid ready params', () => {
    expect(() =>
      decodeBridgeMessage(
        '{"type":"ready","sampleRate":0,"channels":1,"blockSize":0,"format":"f32le","protocol":1}',
      ),
    ).toThrow(/invalid ready params/);
  });

  it('throws on malformed JSON', () => {
    expect(() => decodeBridgeMessage('{not json')).toThrow(BridgeProtocolError);
  });

  it('returns unknown for unrecognized type', () => {
    expect(decodeBridgeMessage('{"type":"bye"}')).toEqual({
      kind: 'unknown',
      raw: { type: 'bye' },
    });
  });

  it('client protocol constant is 1', () => {
    expect(BRIDGE_PROTOCOL_VERSION).toBe(1);
  });
});

describe('decodeBridgeMessage — PCM', () => {
  it('decodes an ArrayBuffer of Float32 LE into samples', () => {
    const src = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const msg = decodeBridgeMessage(src.buffer);
    expect(msg.kind).toBe('pcm');
    if (msg.kind === 'pcm') {
      expect(Array.from(msg.samples)).toEqual([0, 0.5, -0.5, 1, -1]);
    }
  });

  it('decodes an ArrayBufferView (offset-safe)', () => {
    const backing = new Float32Array([9, 1, 2, 3, 9]);
    const view = backing.subarray(1, 4); // [1,2,3], byteOffset != 0
    const msg = decodeBridgeMessage(view);
    expect(msg.kind).toBe('pcm');
    if (msg.kind === 'pcm') {
      expect(Array.from(msg.samples)).toEqual([1, 2, 3]);
    }
  });

  it('handles a full 1024-sample block (4096 bytes)', () => {
    const block = new Float32Array(1024).map((_, i) => Math.sin(i * 0.01));
    const msg = decodeBridgeMessage(block.buffer);
    expect(msg.kind).toBe('pcm');
    if (msg.kind === 'pcm') expect(msg.samples.length).toBe(1024);
  });

  it('throws when byte length is not a multiple of 4', () => {
    const bad = new Uint8Array([1, 2, 3, 4, 5]).buffer; // 5 bytes
    expect(() => decodeBridgeMessage(bad)).toThrow(/multiple of 4/);
  });
});
