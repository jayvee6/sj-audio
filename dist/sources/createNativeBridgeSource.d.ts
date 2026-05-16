/**
 * Native-bridge source — consumes system audio from the SJAudioBridge macOS
 * helper (https://github.com/jayvee6/sj-audio-bridge) over a token-gated
 * localhost WebSocket, injects it through an AudioWorklet into the EXISTING
 * analyzer + FramePipeline. Works in EVERY browser (it's just a WebSocket),
 * including Safari/Firefox where getDisplayMedia audio is unavailable.
 *
 * Handshake (wire protocol v1, see nativeBridgeProtocol.ts):
 *   hello → send auth(token) → ready → binary PCM → injector → analyzer.
 *
 * Error mapping → AudioSourceUnavailableError.reason:
 *   socket never opens / refused        → bridge-unreachable
 *   closed after auth, before ready     → auth-failed (bad/absent token)
 *   no hello/ready within timeout       → bridge-unreachable
 *   stop() during startup               → aborted
 */
import type { AnalyzerOptions, AudioSource } from '../types.js';
import { type Ticker } from './shared/baseSource.js';
export interface NativeBridgeSourceOptions extends AnalyzerOptions {
    /** Per-launch token (menubar “Copy Connection Token”). Required. */
    token: string;
    /** Bridge endpoint. Default `ws://127.0.0.1:17653`. */
    url?: string;
    /** Milliseconds to wait for `ready` before failing. Default 5000. */
    readyTimeoutMs?: number;
    /** Test hook. */
    ticker?: Ticker;
}
export declare function createNativeBridgeSource(opts: NativeBridgeSourceOptions): AudioSource;
//# sourceMappingURL=createNativeBridgeSource.d.ts.map