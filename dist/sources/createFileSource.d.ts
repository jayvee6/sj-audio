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
import type { AnalyzerOptions, AudioSource } from '../types.js';
import { type Ticker } from './shared/baseSource.js';
export interface FileSourceOptions extends AnalyzerOptions {
    /** Loop the buffer when it ends. Default false (plays once then stops). */
    loop?: boolean;
    /** Test hook. */
    ticker?: Ticker;
}
export declare function createFileSource(file: Blob | File, opts?: FileSourceOptions): AudioSource;
//# sourceMappingURL=createFileSource.d.ts.map