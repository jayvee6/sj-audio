/**
 * SJAudioBridge wire protocol v1 — pure decoder/encoder (no WebSocket dep, so
 * it unit-tests in isolation). Mirrors sj-audio-bridge's Swift WSServer.
 *
 *   server → client  text    {"type":"hello","protocol":1}
 *   client → server  text    {"type":"auth","token":"<hex>"}
 *   server → client  text    {"type":"ready","sampleRate":48000,"channels":1,
 *                             "blockSize":1024,"format":"f32le","protocol":1}
 *   server → client  BINARY  blockSize little-endian Float32 mono samples
 */

export const BRIDGE_PROTOCOL_VERSION = 1;

export interface BridgeHello {
  kind: 'hello';
  protocol: number;
}

export interface BridgeReady {
  kind: 'ready';
  sampleRate: number;
  channels: number;
  blockSize: number;
  format: 'f32le';
  protocol: number;
}

export interface BridgePcm {
  kind: 'pcm';
  /** Mono Float32 samples (length === negotiated blockSize). */
  samples: Float32Array;
}

export interface BridgeUnknown {
  kind: 'unknown';
  raw: unknown;
}

export type BridgeMessage = BridgeHello | BridgeReady | BridgePcm | BridgeUnknown;

export class BridgeProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BridgeProtocolError';
  }
}

/** Build the client→server auth frame (a JSON string). */
export function buildAuthMessage(token: string): string {
  return JSON.stringify({ type: 'auth', token });
}

/**
 * Decode one inbound WS message.
 * - string  → parsed JSON control message (hello/ready/unknown)
 * - ArrayBuffer/typed buffer → PCM (Float32, little-endian)
 *
 * Throws BridgeProtocolError on malformed control JSON or a PCM buffer whose
 * byte length isn't a multiple of 4 (Float32).
 */
export function decodeBridgeMessage(data: string | ArrayBuffer | ArrayBufferView): BridgeMessage {
  if (typeof data === 'string') return decodeControl(data);

  const buf: ArrayBuffer = isArrayBufferView(data)
    ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    : data;

  if (buf.byteLength % 4 !== 0) {
    throw new BridgeProtocolError(
      `PCM frame byte length ${buf.byteLength} is not a multiple of 4 (Float32)`,
    );
  }
  // Web Audio + every target platform is little-endian; the bridge sends
  // native-endian Float32 (documented f32le). new Float32Array(buf) reads LE.
  return { kind: 'pcm', samples: new Float32Array(buf) };
}

function decodeControl(text: string): BridgeMessage {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new BridgeProtocolError(`control message is not valid JSON: ${text.slice(0, 80)}`);
  }
  if (typeof obj !== 'object' || obj === null || !('type' in obj)) {
    return { kind: 'unknown', raw: obj };
  }
  const o = obj as Record<string, unknown>;
  switch (o.type) {
    case 'hello':
      return { kind: 'hello', protocol: numberOr(o.protocol, 0) };
    case 'ready': {
      const ready: BridgeReady = {
        kind: 'ready',
        sampleRate: numberOr(o.sampleRate, 0),
        channels: numberOr(o.channels, 1),
        blockSize: numberOr(o.blockSize, 0),
        format: o.format === 'f32le' ? 'f32le' : ('f32le' as const),
        protocol: numberOr(o.protocol, 0),
      };
      if (o.format !== 'f32le') {
        throw new BridgeProtocolError(`unsupported PCM format "${String(o.format)}" (expected f32le)`);
      }
      if (ready.protocol !== BRIDGE_PROTOCOL_VERSION) {
        throw new BridgeProtocolError(
          `protocol mismatch: bridge=${ready.protocol}, client=${BRIDGE_PROTOCOL_VERSION}`,
        );
      }
      if (ready.sampleRate <= 0 || ready.blockSize <= 0) {
        throw new BridgeProtocolError(
          `invalid ready params sampleRate=${ready.sampleRate} blockSize=${ready.blockSize}`,
        );
      }
      return ready;
    }
    default:
      return { kind: 'unknown', raw: obj };
  }
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function isArrayBufferView(v: unknown): v is ArrayBufferView {
  return ArrayBuffer.isView(v);
}
