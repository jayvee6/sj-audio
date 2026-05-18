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
import { AudioSourceUnavailableError } from '../types.js';

export interface AudioInputDevice {
  /** Opaque, origin-scoped id. Pass to `createDeviceSource({ deviceId })`. */
  deviceId: string;
  /** Human label, or a stable fallback when the browser withholds it. */
  label: string;
  /** Groups a physical device's in/out endpoints. */
  groupId: string;
}

function hasMediaDevices(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.enumerateDevices === 'function'
  );
}

/**
 * List connected audio INPUT devices.
 *
 * Throws `AudioSourceUnavailableError`:
 *   'unsupported'       — mediaDevices / enumerateDevices not present
 *   'permission-denied' — user blocked the one-time label-unlock prompt
 */
export async function listAudioInputDevices(): Promise<AudioInputDevice[]> {
  if (!hasMediaDevices()) {
    throw new AudioSourceUnavailableError(
      'device',
      'unsupported',
      'navigator.mediaDevices.enumerateDevices is not available',
    );
  }
  // Label unlock: enumerateDevices() yields empty labels until the page has
  // held an audio stream once. Grab one, release it immediately.
  if (typeof navigator.mediaDevices.getUserMedia === 'function') {
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((t) => t.stop());
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        throw new AudioSourceUnavailableError('device', 'permission-denied');
      }
      // NotFoundError (no input hardware) etc — still enumerate; labels just
      // stay blank but deviceIds remain usable.
    }
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d) => ({
      deviceId: d.deviceId,
      label: d.label || `Audio input (${d.deviceId.slice(0, 8) || 'default'})`,
      groupId: d.groupId,
    }));
}

/**
 * Subscribe to hardware add/remove (USB interface plugged, headset connected…).
 * Returns an unsubscribe fn; a no-op unsubscribe where unsupported.
 */
export function onDeviceChange(cb: () => void): Unsubscribe {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.addEventListener !== 'function'
  ) {
    return () => {};
  }
  const md = navigator.mediaDevices;
  md.addEventListener('devicechange', cb);
  return () => md.removeEventListener('devicechange', cb);
}
