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
import type { AnalyzerOptions, AudioSource } from '../types.js';
import { type Ticker } from './shared/baseSource.js';
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
export declare function isLikelyChromium(): boolean;
export declare function createDisplayMediaSource(opts?: DisplayMediaSourceOptions): AudioSource;
//# sourceMappingURL=createDisplayMediaSource.d.ts.map