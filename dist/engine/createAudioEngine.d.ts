/**
 * The orchestrator — chains through source kinds in a user-supplied order,
 * using the first one that succeeds. Exposes the full `AudioSource` interface
 * (delegated to the active adapter) plus `activeKind` and `switchTo()`.
 *
 * Fallback chain default: `['displayMedia', 'microphone', 'file']` — tab audio
 * if available (Chromium desktop), otherwise mic, otherwise file upload.
 */
import type { AudioEngine, AudioEngineOptions } from '../types.js';
export declare function createAudioEngine(opts?: AudioEngineOptions): AudioEngine;
//# sourceMappingURL=createAudioEngine.d.ts.map