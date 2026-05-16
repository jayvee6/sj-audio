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

import type { AnalyzerOptions, AudioSource, Capabilities } from '../types.js';
import { AudioSourceUnavailableError } from '../types.js';
import { createBaseSource, type Ticker } from './shared/baseSource.js';
import {
  decodeBridgeMessage,
  buildAuthMessage,
} from './nativeBridgeProtocol.js';
import { createPcmInjector, type PcmInjector } from './pcmInjector.js';

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

const DEFAULT_URL = 'ws://127.0.0.1:17653';

export function createNativeBridgeSource(
  opts: NativeBridgeSourceOptions,
): AudioSource {
  // Not one of the four browser-feature sources — report them false, exactly
  // like createMicrophoneSource does for the others. Reachability is
  // discovered at start() (throws bridge-unreachable / auth-failed).
  const capabilities: Capabilities = {
    mediaElement: false,
    microphone: false,
    displayMedia: false,
    file: false,
  };

  const url = opts.url ?? DEFAULT_URL;
  const readyTimeoutMs = opts.readyTimeoutMs ?? 5000;

  let ws: WebSocket | null = null;
  let injector: PcmInjector | null = null;

  return createBaseSource({
    kind: 'nativeBridge',
    capabilities,
    analyzer: opts,
    ticker: opts.ticker,
    onStart: ({ ctx, analyzerInput }) =>
      new Promise<void>((resolve, reject) => {
        if (typeof WebSocket === 'undefined') {
          reject(
            new AudioSourceUnavailableError(
              'nativeBridge',
              'bridge-unreachable',
              'WebSocket is not available in this environment',
            ),
          );
          return;
        }

        let settled = false;
        let sentAuth = false;
        const fail = (
          reason: 'bridge-unreachable' | 'auth-failed' | 'aborted',
          msg?: string,
        ) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try {
            ws?.close();
          } catch {
            /* noop */
          }
          reject(new AudioSourceUnavailableError('nativeBridge', reason, msg));
        };

        const timer = setTimeout(
          () => fail('bridge-unreachable', `no "ready" within ${readyTimeoutMs}ms`),
          readyTimeoutMs,
        );

        let socket: WebSocket;
        try {
          socket = new WebSocket(url);
        } catch (e) {
          clearTimeout(timer);
          reject(
            new AudioSourceUnavailableError(
              'nativeBridge',
              'bridge-unreachable',
              e instanceof Error ? e.message : String(e),
            ),
          );
          return;
        }
        ws = socket;
        socket.binaryType = 'arraybuffer';

        socket.onmessage = (ev: MessageEvent) => {
          let msg;
          try {
            msg = decodeBridgeMessage(
              ev.data as string | ArrayBuffer,
            );
          } catch {
            return; // ignore undecodable frames
          }
          if (msg.kind === 'hello') {
            sentAuth = true;
            socket.send(buildAuthMessage(opts.token));
          } else if (msg.kind === 'ready') {
            void (async () => {
              try {
                const inj = await createPcmInjector(ctx);
                injector = inj;
                inj.node.connect(analyzerInput);
                if (settled) {
                  inj.dispose(); // stop() raced us
                  return;
                }
                settled = true;
                clearTimeout(timer);
                resolve();
              } catch (e) {
                fail(
                  'bridge-unreachable',
                  e instanceof Error ? e.message : 'injector init failed',
                );
              }
            })();
          } else if (msg.kind === 'pcm') {
            injector?.push(msg.samples);
          }
        };

        socket.onerror = () => {
          // Browsers don't expose connect-refused detail; classify by phase.
          fail(
            sentAuth ? 'auth-failed' : 'bridge-unreachable',
            'WebSocket error',
          );
        };

        socket.onclose = () => {
          // Closed before ready → if we'd authed, the bridge rejected the
          // token; otherwise it was never reachable / handshake stalled.
          if (!settled) fail(sentAuth ? 'auth-failed' : 'bridge-unreachable');
        };
      }),
    onStop: () => {
      try {
        injector?.dispose();
      } catch {
        /* noop */
      }
      injector = null;
      try {
        ws?.close();
      } catch {
        /* noop */
      }
      ws = null;
    },
  });
}
