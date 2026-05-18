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

import type { AnalyzerOptions, AudioSource, Capabilities } from '../types.js';
import { AudioSourceUnavailableError } from '../types.js';
import { createBaseSource, type Ticker } from './shared/baseSource.js';

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

export function createDeviceSource(
  opts: DeviceSourceOptions = {},
): AudioSource {
  const capabilities: Capabilities = {
    mediaElement: false,
    microphone:
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function',
    displayMedia: false,
    file: false,
  };

  let stream: MediaStream | null = null;
  let streamNode: MediaStreamAudioSourceNode | null = null;

  return createBaseSource({
    kind: 'device',
    capabilities,
    analyzer: opts,
    ticker: opts.ticker,
    async onStart({ ctx, analyzerInput }) {
      if (!capabilities.microphone) {
        throw new AudioSourceUnavailableError(
          'device',
          'unsupported',
          'getUserMedia is not available in this environment',
        );
      }
      const dspOff = opts.disableProcessing !== false;
      const audio: MediaTrackConstraints = {
        ...(dspOff
          ? {
              noiseSuppression: false,
              echoCancellation: false,
              autoGainControl: false,
            }
          : {}),
        ...opts.constraints,
      };
      if (opts.deviceId) {
        audio.deviceId = { exact: opts.deviceId };
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio });
      } catch (err) {
        const name = err instanceof Error ? err.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          throw new AudioSourceUnavailableError('device', 'permission-denied');
        }
        if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          throw new AudioSourceUnavailableError('device', 'no-audio-track');
        }
        throw new AudioSourceUnavailableError(
          'device',
          'unsupported',
          err instanceof Error ? err.message : String(err),
        );
      }
      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
        throw new AudioSourceUnavailableError('device', 'no-audio-track');
      }
      streamNode = ctx.createMediaStreamSource(stream);
      streamNode.connect(analyzerInput);
      // Intentionally NOT connected to ctx.destination — echoing input back to
      // speakers would feed back / double audio the user already hears.
    },
    onStop() {
      if (streamNode) {
        try {
          streamNode.disconnect();
        } catch {
          // already disconnected
        }
        streamNode = null;
      }
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
    },
  });
}
