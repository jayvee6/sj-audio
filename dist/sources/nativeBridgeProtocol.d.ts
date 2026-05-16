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
export declare const BRIDGE_PROTOCOL_VERSION = 1;
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
export declare class BridgeProtocolError extends Error {
    constructor(message: string);
}
/** Build the client→server auth frame (a JSON string). */
export declare function buildAuthMessage(token: string): string;
/**
 * Decode one inbound WS message.
 * - string  → parsed JSON control message (hello/ready/unknown)
 * - ArrayBuffer/typed buffer → PCM (Float32, little-endian)
 *
 * Throws BridgeProtocolError on malformed control JSON or a PCM buffer whose
 * byte length isn't a multiple of 4 (Float32).
 */
export declare function decodeBridgeMessage(data: string | ArrayBuffer | ArrayBufferView): BridgeMessage;
//# sourceMappingURL=nativeBridgeProtocol.d.ts.map