/**
 * Media-element source — analyzes audio from a page-owned `<audio>` or
 * `<video>` element via `createMediaElementSource`.
 *
 * Caveats:
 * - Only ONE `MediaElementSource` may exist per HTMLMediaElement per context.
 *   Calling twice throws `InvalidStateError`. We detect and map this to
 *   `unsupported`.
 * - Cross-origin `src` requires `audioEl.crossOrigin = 'anonymous'` BEFORE
 *   the `src` is assigned AND server-side `Access-Control-Allow-Origin`;
 *   otherwise AnalyserNode reads silence (no error surfaced by the browser).
 * - The adapter also connects the element source to `ctx.destination` so
 *   the audio remains audible — without this, `<audio>` plays visually but
 *   outputs silence.
 */

import type { AnalyzerOptions, AudioSource, Capabilities } from '../types.js';
import { AudioSourceUnavailableError } from '../types.js';
import { createBaseSource, type Ticker } from './shared/baseSource.js';

export interface MediaElementSourceOptions extends AnalyzerOptions {
  /** Test hook — manual ticker instead of requestAnimationFrame. */
  ticker?: Ticker;
}

export function createMediaElementSource(
  el: HTMLMediaElement,
  opts: MediaElementSourceOptions = {},
): AudioSource {
  const capabilities: Capabilities = {
    mediaElement: typeof AudioContext !== 'undefined' && !!el,
    // These are not this adapter's concern; detectCapabilities() covers them.
    microphone: false,
    displayMedia: false,
    file: false,
  };

  let mediaNode: MediaElementAudioSourceNode | null = null;

  return createBaseSource({
    kind: 'mediaElement',
    capabilities,
    analyzer: opts,
    ticker: opts.ticker,
    onStart({ ctx, analyzerInput }) {
      try {
        mediaNode = ctx.createMediaElementSource(el);
      } catch (err) {
        // Most common cause: element already has a MediaElementSource on this
        // context. Not recoverable — caller must reuse the existing source.
        throw new AudioSourceUnavailableError(
          'mediaElement',
          'unsupported',
          err instanceof Error ? err.message : String(err),
        );
      }
      mediaNode.connect(analyzerInput);
      // Keep audio audible: also route to the device output.
      mediaNode.connect(ctx.destination);
    },
    onStop() {
      if (mediaNode) {
        try {
          mediaNode.disconnect();
        } catch {
          // already disconnected
        }
        mediaNode = null;
      }
    },
  });
}
