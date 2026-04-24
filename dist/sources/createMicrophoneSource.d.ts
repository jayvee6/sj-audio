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
import type { AnalyzerOptions, AudioSource } from '../types.js';
import { type Ticker } from './shared/baseSource.js';
export interface MicrophoneSourceOptions extends AnalyzerOptions {
    /** Passed to getUserMedia. Default: `true` (any mic). */
    constraints?: MediaTrackConstraints | boolean;
    /** Test hook. */
    ticker?: Ticker;
}
export declare function createMicrophoneSource(opts?: MicrophoneSourceOptions): AudioSource;
//# sourceMappingURL=createMicrophoneSource.d.ts.map