/**
 * Display / tab audio source via `navigator.mediaDevices.getDisplayMedia`.
 *
 * Cross-browser reality (as of 2026):
 *   Chrome / Edge desktop: works. Tab audio always; system audio on
 *     Windows/ChromeOS with "entire screen" picked. macOS has no
 *     system-audio path here.
 *   Safari:  `audio: true` is silently ignored — resulting stream has
 *            only a video track. We detect this and surface
 *            `no-audio-track`.
 *   Firefox: same — explicitly marked low-priority at Mozilla.
 *   Mobile:  unsupported everywhere.
 *
 * Proactive Chromium check: `isLikelyChromium()` sniffs the UA for Chrome
 * or Edge on desktop. Used for capability reporting; the actual adapter
 * always tries the call so we don't gate behind UA strings.
 */

import type { AnalyzerOptions, AudioSource, Capabilities } from '../types.js';
import { AudioSourceUnavailableError } from '../types.js';
import { createBaseSource, type Ticker } from './shared/baseSource.js';

export interface DisplayMediaSourceOptions extends AnalyzerOptions {
  /** Forwarded to getDisplayMedia. Defaults to `{ audio: true, video: true }`. */
  constraints?: DisplayMediaStreamOptions;
  /** Test hook. */
  ticker?: Ticker;
}

/**
 * Chromium-family (Chrome/Edge) on desktop — the only browsers that actually
 * deliver an audio track from getDisplayMedia as of 2026. UA-sniff is fragile
 * but sufficient for capability reporting / UI hints; the actual capture
 * call will fail cleanly on unsupported browsers regardless.
 */
export function isLikelyChromium(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  if (isMobile) return false;
  // Chrome, Edge, Brave, Opera all match /Chrome\//; exclude Firefox + Safari.
  const hasChrome = /Chrome\//.test(ua);
  const isFirefox = /Firefox\//.test(ua);
  const isSafari = /Safari\//.test(ua) && !hasChrome;
  return hasChrome && !isFirefox && !isSafari;
}

export function createDisplayMediaSource(
  opts: DisplayMediaSourceOptions = {},
): AudioSource {
  const hasApi =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === 'function';

  const capabilities: Capabilities = {
    mediaElement: false,
    microphone: false,
    // getDisplayMedia exists on most browsers but audio capture only works on Chromium desktop.
    displayMedia: hasApi && isLikelyChromium(),
    file: false,
  };

  let stream: MediaStream | null = null;
  let streamNode: MediaStreamAudioSourceNode | null = null;

  return createBaseSource({
    kind: 'displayMedia',
    capabilities,
    analyzer: opts,
    ticker: opts.ticker,
    async onStart({ ctx, analyzerInput }) {
      if (!hasApi) {
        throw new AudioSourceUnavailableError(
          'displayMedia',
          'unsupported',
          'getDisplayMedia is not available in this environment',
        );
      }
      try {
        stream = await navigator.mediaDevices.getDisplayMedia(
          opts.constraints ?? { audio: true, video: true },
        );
      } catch (err) {
        const name = err instanceof Error ? err.name : '';
        if (name === 'NotAllowedError') {
          throw new AudioSourceUnavailableError('displayMedia', 'permission-denied');
        }
        throw new AudioSourceUnavailableError(
          'displayMedia',
          'unsupported',
          err instanceof Error ? err.message : String(err),
        );
      }
      if (stream.getAudioTracks().length === 0) {
        // Safari / Firefox silently drop the audio flag. No recovery path.
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
        throw new AudioSourceUnavailableError(
          'displayMedia',
          'no-audio-track',
          'Stream returned no audio track — Safari and Firefox do not support audio capture via getDisplayMedia.',
        );
      }
      streamNode = ctx.createMediaStreamSource(stream);
      streamNode.connect(analyzerInput);
      // NOT routed to destination — would double up audio the user is
      // already hearing from the shared tab.
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
