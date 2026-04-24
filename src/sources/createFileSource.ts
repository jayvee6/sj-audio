/**
 * File source — decodes a Blob/File via `AudioContext.decodeAudioData` and
 * plays it once through the analyzer + device output. Analyze-only: no
 * play/pause/seek/loop API. If you want transport controls, use an
 * `<audio>` element + `createMediaElementSource` instead.
 *
 * Codec support varies — MP3/AAC/WAV/FLAC universal; OGG Vorbis + Opus
 * need Safari 18.4+ (April 2025). `decode-failed` is the error taxonomy
 * hit for unsupported codecs.
 */

import type { AnalyzerOptions, AudioSource, Capabilities } from '../types.js';
import { AudioSourceUnavailableError } from '../types.js';
import { createBaseSource, type Ticker } from './shared/baseSource.js';

export interface FileSourceOptions extends AnalyzerOptions {
  /** Loop the buffer when it ends. Default false (plays once then stops). */
  loop?: boolean;
  /** Test hook. */
  ticker?: Ticker;
}

export function createFileSource(
  file: Blob | File,
  opts: FileSourceOptions = {},
): AudioSource {
  const capabilities: Capabilities = {
    mediaElement: false,
    microphone: false,
    displayMedia: false,
    file:
      typeof AudioContext !== 'undefined' &&
      typeof file.arrayBuffer === 'function',
  };

  let bufferSource: AudioBufferSourceNode | null = null;

  return createBaseSource({
    kind: 'file',
    capabilities,
    analyzer: opts,
    ticker: opts.ticker,
    async onStart({ ctx, analyzerInput }) {
      if (!capabilities.file) {
        throw new AudioSourceUnavailableError(
          'file',
          'unsupported',
          'AudioContext or Blob.arrayBuffer not available in this environment',
        );
      }
      let buffer: AudioBuffer;
      try {
        const arr = await file.arrayBuffer();
        buffer = await ctx.decodeAudioData(arr.slice(0));
      } catch (err) {
        throw new AudioSourceUnavailableError(
          'file',
          'decode-failed',
          err instanceof Error ? err.message : String(err),
        );
      }
      bufferSource = ctx.createBufferSource();
      bufferSource.buffer = buffer;
      bufferSource.loop = opts.loop ?? false;
      bufferSource.connect(analyzerInput);
      bufferSource.connect(ctx.destination);
      bufferSource.start(0);
    },
    onStop() {
      if (bufferSource) {
        try {
          bufferSource.stop();
        } catch {
          // already stopped — AudioBufferSourceNode throws if stop() is called twice
        }
        try {
          bufferSource.disconnect();
        } catch {
          // already disconnected
        }
        bufferSource = null;
      }
    },
  });
}
