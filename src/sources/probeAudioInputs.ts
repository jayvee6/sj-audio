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
import { listAudioInputDevices } from './listAudioInputDevices.js';
import { AudioSourceUnavailableError } from '../types.js';

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

interface WindowWithWebkit extends Window {
  webkitAudioContext?: typeof AudioContext;
}

function resolveAudioContextCtor(): typeof AudioContext {
  const Ctor =
    typeof AudioContext !== 'undefined'
      ? AudioContext
      : (globalThis as unknown as WindowWithWebkit).webkitAudioContext;
  if (!Ctor) {
    throw new AudioSourceUnavailableError(
      'device',
      'unsupported',
      'AudioContext is not available in this environment',
    );
  }
  return Ctor;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/**
 * Open one device, measure mean spectral RMS over the sampling window, then
 * fully tear down (stop tracks + close the throwaway context). Never throws —
 * any failure resolves to 0.
 */
async function measureDeviceRms(
  deviceId: string,
  samples: number,
  intervalMs: number,
  signal?: AbortSignal,
): Promise<number> {
  if (signal?.aborted) return 0;
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  ) {
    return 0;
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: deviceId },
      noiseSuppression: false,
      echoCancellation: false,
      autoGainControl: false,
    },
  });
  const Ctor = resolveAudioContextCtor();
  const ctx = new Ctor();
  try {
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    let total = 0;
    let taken = 0;
    for (let i = 0; i < samples; i++) {
      if (signal?.aborted) break;
      await sleep(intervalMs);
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let j = 0; j < data.length; j++) sum += data[j] * data[j];
      total += Math.sqrt(sum / data.length);
      taken++;
    }
    return taken > 0 ? total / taken : 0;
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    try {
      await ctx.close();
    } catch {
      // already closed / mock context without close()
    }
  }
}

/**
 * Probe every input in parallel and return them sorted by signal level
 * (loudest first). Per-device failures resolve to rms 0 — the batch never
 * rejects. Omit `devices` to enumerate first via `listAudioInputDevices()`.
 */
export async function probeAudioInputLevels(
  devices?: AudioInputDevice[],
  opts: ProbeOptions = {},
): Promise<AudioInputLevel[]> {
  const list = devices ?? (await listAudioInputDevices());
  const samples = opts.samples ?? 10;
  const intervalMs = opts.intervalMs ?? 200;
  const results = await Promise.all(
    list.map(async (d) => ({
      deviceId: d.deviceId,
      label: d.label,
      rms: await measureDeviceRms(
        d.deviceId,
        samples,
        intervalMs,
        opts.signal,
      ).catch(() => 0),
    })),
  );
  return results.sort((a, b) => b.rms - a.rms);
}

/**
 * One-call autodetect: enumerate → probe → return the loudest device with a
 * non-zero signal, or `null` if every input is silent.
 */
export async function detectActiveAudioInput(
  opts: ProbeOptions = {},
): Promise<AudioInputDevice | null> {
  const devices = await listAudioInputDevices();
  if (devices.length === 0) return null;
  const levels = await probeAudioInputLevels(devices, opts);
  const top = levels.find((l) => l.rms > 0);
  if (!top) return null;
  return devices.find((d) => d.deviceId === top.deviceId) ?? null;
}
