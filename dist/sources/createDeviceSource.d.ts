/**
 * Explicit audio-INPUT-device source — `getUserMedia` pinned to a chosen
 * `deviceId` (from `listAudioInputDevices()` / `detectActiveAudioInput()`).
 *
 * The served-site, zero-install capture path: any HTTPS page can capture the
 * input the visitor picks, including an OS loopback device (BlackHole / Stereo
 * Mix / VB-Cable) for system audio — no native helper required. Mirrors
 * wwwtyro/syzygy's capture, including browser DSP disabled by default
 * (noiseSuppression / echoCancellation / autoGainControl wreck music, line-in,
 * and loopback analysis).
 *
 * Omitting `deviceId` captures the system default input (≈ microphone, but
 * with DSP off).
 *
 * Error mapping (identical to the microphone source):
 *   NotAllowedError / SecurityError       → permission-denied
 *   NotFoundError / OverconstrainedError  → no-audio-track
 *   <anything else>                       → unsupported
 *
 * Credit: capture approach ported from syzygy by Rye Terrell
 * (https://github.com/wwwtyro/syzygy).
 */
import type { AnalyzerOptions, AudioSource } from '../types.js';
import { type Ticker } from './shared/baseSource.js';
export interface DeviceSourceOptions extends AnalyzerOptions {
    /** Target `audioinput` deviceId. Omit → system default input. */
    deviceId?: string;
    /**
     * Extra getUserMedia audio constraints, shallow-merged OVER the DSP-off
     * defaults (so you can re-enable a flag, set channelCount, etc).
     */
    constraints?: MediaTrackConstraints;
    /**
     * Set `false` to keep the browser's DSP (noiseSuppression /
     * echoCancellation / autoGainControl) at its defaults. Unset (or `true`) →
     * DSP disabled, which is correct for music / line-in / loopback capture.
     */
    disableProcessing?: boolean;
    /** Test hook. */
    ticker?: Ticker;
}
export declare function createDeviceSource(opts?: DeviceSourceOptions): AudioSource;
//# sourceMappingURL=createDeviceSource.d.ts.map