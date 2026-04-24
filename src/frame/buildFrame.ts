/**
 * AudioFrame assembler. Glues the analysis primitives into a single pipeline
 * that converts `AnalyzerReader` output into an `AudioFrame`.
 *
 * Per-frame order (matches musicplayer-viz/audio-engine.js):
 *   1. Read dBFS spectrum (frequencyBinCount floats)
 *   2. Read time-domain waveform (fftSize floats)
 *   3. Mel-project dB → 32 bins (sqrt'd, treble-boosted)
 *   4. Gate (noise floor per bin)
 *   5. AGC (global peak envelope, normalize)
 *   6. Copy to `magnitudes` (raw)
 *   7. EMA smooth into `magnitudesSmooth`
 *   8. Compute bass / mid / treble
 *   9. Ingest bass into onset detector → { bpm, beatPulse, isBeatNow }
 *  10. Push current bass into the exposed 16-slot bassHistory ring (age=0 is current)
 *  11. Downsample time-domain → waveform (length 256)
 *  12. Publish the AudioFrame (stable buffer references; values mutated in place)
 */

import type { AnalyzerReader } from '../analysis/analyserNodeAnalyzer.js';
import type { AudioFrame, AnalyzerOptions } from '../types.js';
import { createMelProjector } from '../analysis/melBands.js';
import { createGate, createAgc } from '../analysis/agc.js';
import { createSmoother } from '../analysis/smoothing.js';
import { computeBandAverages, type BandAverages } from '../analysis/bands.js';
import { createOnsetDetector } from '../analysis/beat.js';
import { estimateBpm } from '../analysis/bpm.js';
import { downsampleWaveform } from '../analysis/waveform.js';

/** Length of the exposed bassHistory ring buffer (age=0 is current frame). */
export const BASS_HISTORY_LEN = 16;

export interface FramePipeline {
  /** Stable AudioFrame reference. Its typed-array fields are mutated in place. */
  readonly frame: AudioFrame;
  /** Advance by dt seconds, absolute time t, returns the frame (same reference). */
  tick(t: number, dt: number): AudioFrame;
  /** Update viewport dimensions copied into every subsequent frame. */
  setViewport(width: number, height: number): void;
  /** Update mood/tempo overrides (Spotify features or similar). */
  setMood(
    mood: Partial<Pick<AudioFrame, 'valence' | 'energy' | 'danceability' | 'tempoBPM'>>,
  ): void;
  /** Reset internal state (gate floor, AGC peak, smoother, onset history). */
  reset(): void;
}

export function createFramePipeline(
  reader: AnalyzerReader,
  opts: AnalyzerOptions = {},
): FramePipeline {
  const bands = opts.bands ?? 32;
  const waveformSize = opts.waveformSize ?? 256;
  const attackMs = opts.attackMs ?? 10;
  const releaseMs = opts.releaseMs ?? 120;

  // ── Scratch / persistent buffers (allocated once, reused per frame) ─────────
  const dbSpectrum = new Float32Array(reader.frequencyBinCount);
  const timeDomain = new Float32Array(reader.fftSize);
  const mags = new Float32Array(bands);

  const projector = createMelProjector(reader.fftSize, reader.sampleRate);
  const gate = createGate();
  const agc = createAgc();
  const smoother = createSmoother(bands, { attackMs, releaseMs });
  const bandAvgs: BandAverages = { bass: 0, mid: 0, treble: 0 };
  const detector = createOnsetDetector({ estimateBpm });

  const bassHistory = new Float32Array(BASS_HISTORY_LEN);
  const waveform = new Float32Array(waveformSize);

  // ── Stable, reusable frame shell ────────────────────────────────────────────
  const frame: AudioFrame = {
    time: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    beatPulse: 0,
    bpm: 0,
    isBeatNow: false,
    bassHistory,
    magnitudes: mags,
    magnitudesSmooth: smoother.state,
    waveform,
    valence: opts.mood?.valence ?? 0.5,
    energy: opts.mood?.energy ?? 0.5,
    danceability: opts.mood?.danceability ?? 0.5,
    tempoBPM: opts.mood?.tempoBPM ?? 0,
    width: 0,
    height: 0,
  };

  const tick = (t: number, dt: number): AudioFrame => {
    // 1. Read analyzer
    reader.readFrequency(dbSpectrum);
    reader.readTime(timeDomain);

    // 2. Mel project
    projector.project(dbSpectrum, mags);

    // 3. Gate + AGC
    gate.process(mags);
    agc.process(mags);

    // 4. Smooth (magnitudesSmooth already points at smoother.state)
    smoother.process(mags, dt);

    // 5. Band averages
    computeBandAverages(mags, bandAvgs);

    // 6. Onset / beat
    const onset = detector.ingest(bandAvgs.bass, t);

    // 7. Push current bass into exposed ring, age=0 at index 0
    for (let i = BASS_HISTORY_LEN - 1; i > 0; i--) {
      bassHistory[i] = bassHistory[i - 1]!;
    }
    bassHistory[0] = bandAvgs.bass;

    // 8. Waveform
    downsampleWaveform(timeDomain, waveform);

    // 9. Publish scalar fields
    frame.time = t;
    frame.bass = bandAvgs.bass;
    frame.mid = bandAvgs.mid;
    frame.treble = bandAvgs.treble;
    frame.beatPulse = onset.beatPulse;
    frame.bpm = onset.bpm;
    frame.isBeatNow = onset.isBeatNow;

    return frame;
  };

  const setViewport = (width: number, height: number): void => {
    frame.width = width;
    frame.height = height;
  };

  const setMood: FramePipeline['setMood'] = (mood) => {
    if (mood.valence !== undefined) frame.valence = mood.valence;
    if (mood.energy !== undefined) frame.energy = mood.energy;
    if (mood.danceability !== undefined) frame.danceability = mood.danceability;
    if (mood.tempoBPM !== undefined) frame.tempoBPM = mood.tempoBPM;
  };

  const reset = (): void => {
    gate.reset();
    agc.reset();
    smoother.reset();
    detector.reset();
    bassHistory.fill(0);
    waveform.fill(0);
    mags.fill(0);
    frame.time = 0;
    frame.bass = 0;
    frame.mid = 0;
    frame.treble = 0;
    frame.beatPulse = 0;
    frame.bpm = 0;
    frame.isBeatNow = false;
  };

  return { frame, tick, setViewport, setMood, reset };
}
