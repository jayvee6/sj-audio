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
/** Length of the exposed bassHistory ring buffer (age=0 is current frame). */
export declare const BASS_HISTORY_LEN = 16;
export interface FramePipeline {
    /** Stable AudioFrame reference. Its typed-array fields are mutated in place. */
    readonly frame: AudioFrame;
    /** Advance by dt seconds, absolute time t, returns the frame (same reference). */
    tick(t: number, dt: number): AudioFrame;
    /** Update viewport dimensions copied into every subsequent frame. */
    setViewport(width: number, height: number): void;
    /** Update mood/tempo overrides (Spotify features or similar). */
    setMood(mood: Partial<Pick<AudioFrame, 'valence' | 'energy' | 'danceability' | 'tempoBPM'>>): void;
    /** Reset internal state (gate floor, AGC peak, smoother, onset history). */
    reset(): void;
}
export declare function createFramePipeline(reader: AnalyzerReader, opts?: AnalyzerOptions): FramePipeline;
//# sourceMappingURL=buildFrame.d.ts.map