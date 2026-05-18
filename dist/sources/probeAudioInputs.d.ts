/**
 * "Listen" to audio inputs and rank them by signal level — the autodetect
 * primitive (port of wwwtyro/syzygy's "Autodetect" button / `measureDeviceRms`).
 *
 * Lets you (or the user) discover which of several inputs — mic, line-in,
 * BlackHole, Stereo Mix, VB-Cable — is actually playing right now, instead of
 * guessing from labels. Essential UX for the loopback/system-audio case where
 * the right device has an opaque name.
 *
 * Each probe uses a DEDICATED, throwaway `AudioContext` (never the library
 * singleton from `shared/audioContext.ts`) so it can be fully closed and never
 * disturbs a live capture pipeline.
 *
 * Credit: RMS autodetect ported from syzygy's `measureDeviceRms` by Rye Terrell
 * (https://github.com/wwwtyro/syzygy).
 */
import type { AudioInputDevice } from './listAudioInputDevices.js';
export interface AudioInputLevel {
    deviceId: string;
    label: string;
    /** Mean RMS of byte-frequency magnitudes over the window (~0..255). 0 = silent or probe failed. */
    rms: number;
}
export interface ProbeOptions {
    /** RMS samples per device. Default 10. */
    samples?: number;
    /** Delay between samples, ms. Default 200 (→ ~2s/device, matching syzygy). */
    intervalMs?: number;
    /** Abort the probe early; un-probed devices resolve to rms 0. */
    signal?: AbortSignal;
}
/**
 * Probe every input in parallel and return them sorted by signal level
 * (loudest first). Per-device failures resolve to rms 0 — the batch never
 * rejects. Omit `devices` to enumerate first via `listAudioInputDevices()`.
 */
export declare function probeAudioInputLevels(devices?: AudioInputDevice[], opts?: ProbeOptions): Promise<AudioInputLevel[]>;
/**
 * One-call autodetect: enumerate → probe → return the loudest device with a
 * non-zero signal, or `null` if every input is silent.
 */
export declare function detectActiveAudioInput(opts?: ProbeOptions): Promise<AudioInputDevice | null>;
//# sourceMappingURL=probeAudioInputs.d.ts.map