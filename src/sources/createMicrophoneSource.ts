/**
 * Microphone source via `navigator.mediaDevices.getUserMedia({ audio: true })`.
 *
 * Universal browser support, but:
 * - Requires HTTPS (except localhost).
 * - iOS Safari re-prompts on route changes and locks AudioContext to the mic
 *   sample rate.
 * - `constraints` lets callers pick an `audioinput` device via `deviceId`
 *   (useful with virtual devices like BlackHole for system-audio capture on
 *   macOS).
 *
 * Error mapping:
 *   NotAllowedError     → permission-denied
 *   NotFoundError       → no-audio-track
 *   <anything else>     → unsupported
 */

import type { AnalyzerOptions, AudioSource, Capabilities } from '../types.js';
import { AudioSourceUnavailableError } from '../types.js';
import { createBaseSource, type Ticker } from './shared/baseSource.js';

export interface MicrophoneSourceOptions extends AnalyzerOptions {
  /** Passed to getUserMedia. Default: `true` (any mic). */
  constraints?: MediaTrackConstraints | boolean;
  /** Test hook. */
  ticker?: Ticker;
}

export function createMicrophoneSource(
  opts: MicrophoneSourceOptions = {},
): AudioSource {
  const capabilities: Capabilities = {
    mediaElement: false,
    microphone:
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function',
    displayMedia: false,
    file: false,
  };

  let stream: MediaStream | null = null;
  let streamNode: MediaStreamAudioSourceNode | null = null;

  return createBaseSource({
    kind: 'microphone',
    capabilities,
    analyzer: opts,
    ticker: opts.ticker,
    async onStart({ ctx, analyzerInput }) {
      if (!capabilities.microphone) {
        throw new AudioSourceUnavailableError(
          'microphone',
          'unsupported',
          'getUserMedia is not available in this environment',
        );
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: opts.constraints ?? true,
        });
      } catch (err) {
        const name = err instanceof Error ? err.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          throw new AudioSourceUnavailableError('microphone', 'permission-denied');
        }
        if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          throw new AudioSourceUnavailableError('microphone', 'no-audio-track');
        }
        throw new AudioSourceUnavailableError(
          'microphone',
          'unsupported',
          err instanceof Error ? err.message : String(err),
        );
      }
      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
        throw new AudioSourceUnavailableError('microphone', 'no-audio-track');
      }
      streamNode = ctx.createMediaStreamSource(stream);
      streamNode.connect(analyzerInput);
      // Intentionally NOT connected to ctx.destination — echoing the mic back
      // to speakers would produce feedback.
    },
    onStop() {
      if (streamNode) {
        try {
          streamNode.disconnect();
        } catch {
          // already disconnected
        }
        streamNode = null;
      }
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
    },
  });
}
