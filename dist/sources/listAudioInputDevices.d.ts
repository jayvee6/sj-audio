/**
 * Audio-input device enumeration with label unlock.
 *
 * `navigator.mediaDevices.enumerateDevices()` returns blank `label`s until the
 * page has held a getUserMedia audio stream at least once in the session. We
 * grab a throwaway stream, stop it immediately, then enumerate — so a picker UI
 * gets human-readable device names. (Same trick wwwtyro/syzygy uses.)
 *
 * This is the served-site, zero-install enumeration primitive: any HTTPS page
 * can list the visitor's inputs — including OS loopback / virtual devices
 * (BlackHole / Stereo Mix / VB-Cable) which is how system audio is captured
 * without a native helper.
 *
 * Credit: technique ported from syzygy by Rye Terrell
 * (https://github.com/wwwtyro/syzygy).
 */
import type { Unsubscribe } from '../types.js';
export interface AudioInputDevice {
    /** Opaque, origin-scoped id. Pass to `createDeviceSource({ deviceId })`. */
    deviceId: string;
    /** Human label, or a stable fallback when the browser withholds it. */
    label: string;
    /** Groups a physical device's in/out endpoints. */
    groupId: string;
}
/**
 * List connected audio INPUT devices.
 *
 * Throws `AudioSourceUnavailableError`:
 *   'unsupported'       — mediaDevices / enumerateDevices not present
 *   'permission-denied' — user blocked the one-time label-unlock prompt
 */
export declare function listAudioInputDevices(): Promise<AudioInputDevice[]>;
/**
 * Subscribe to hardware add/remove (USB interface plugged, headset connected…).
 * Returns an unsubscribe fn; a no-op unsubscribe where unsupported.
 */
export declare function onDeviceChange(cb: () => void): Unsubscribe;
//# sourceMappingURL=listAudioInputDevices.d.ts.map