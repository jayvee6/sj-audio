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
import type { AnalyzerOptions, AudioSource } from '../types.js';
import { type Ticker } from './shared/baseSource.js';
export interface MediaElementSourceOptions extends AnalyzerOptions {
    /** Test hook — manual ticker instead of requestAnimationFrame. */
    ticker?: Ticker;
}
export declare function createMediaElementSource(el: HTMLMediaElement, opts?: MediaElementSourceOptions): AudioSource;
//# sourceMappingURL=createMediaElementSource.d.ts.map