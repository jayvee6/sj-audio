/**
 * Public types for SJAudio. See README + chunked plan for API shape rationale.
 */
/**
 * One frame of audio analysis, emitted per rAF tick while a source is active.
 * Consumers (viz) read this via `source.onFrame(cb)` or `source.currentFrame()`.
 *
 * Field semantics mirror musicplayer-viz/audio-engine.js so existing viz port over
 * with no tuning changes. See `src/analysis/` for per-field computation.
 */
export interface AudioFrame {
    /** Seconds since the source started. Monotonic. */
    time: number;
    /** Low-frequency energy (mel bins [0..3]). */
    bass: number;
    /** Mid-frequency energy (mel bins [3..14]). */
    mid: number;
    /** High-frequency energy (mel bins [14..32]). */
    treble: number;
    /** Exp-decay envelope from last detected onset, in [0..1]. */
    beatPulse: number;
    /** Rolling median BPM from onset intervals. 0 if unknown. */
    bpm: number;
    /** True on the single frame an onset was detected. */
    isBeatNow: boolean;
    /** Ring buffer of recent bass energy (age=0 is current). Length 16. */
    bassHistory: Float32Array;
    /** 32-bin mel-scale AGC'd magnitudes, raw (unsmoothed). */
    magnitudes: Float32Array;
    /** 32-bin mel-scale EMA-smoothed (attack 10ms, release 120ms). */
    magnitudesSmooth: Float32Array;
    /** Downsampled waveform in [-1..1]. Length 256. */
    waveform: Float32Array;
    /** Track valence, typically from Spotify audio features. */
    valence: number;
    /** Track energy, typically from Spotify audio features. */
    energy: number;
    /** Track danceability, typically from Spotify audio features. */
    danceability: number;
    /** Track tempo override (BPM); falls through to `bpm` if unset. */
    tempoBPM: number;
    /** Current viewport width in CSS pixels. */
    width: number;
    /** Current viewport height in CSS pixels. */
    height: number;
}
/** Per-browser/per-environment capability report. Pure feature detection. */
export interface Capabilities {
    mediaElement: boolean;
    microphone: boolean;
    displayMedia: boolean;
    file: boolean;
}
/** Discriminator for `AudioSource.kind` and `AudioSourceUnavailableError.kind`. */
export type AudioSourceKind = 'mediaElement' | 'microphone' | 'displayMedia' | 'file';
/** Callback for frame subscription. Returned Unsubscribe detaches the listener. */
export type FrameListener = (frame: AudioFrame) => void;
export type Unsubscribe = () => void;
/**
 * Common interface for every source adapter. Construction is always cheap and
 * never throws — `capabilities` tells you whether `start()` will work.
 */
export interface AudioSource {
    readonly kind: AudioSourceKind;
    /** This adapter's own capability report (not the whole engine's). */
    readonly capabilities: Capabilities;
    /**
     * Begin capture. Must be called from a user gesture for mic/displayMedia.
     * Rejects with AudioSourceUnavailableError if unsupported or denied.
     */
    start(): Promise<void>;
    /** Stop capture, release tracks, suspend context if owned. Idempotent. */
    stop(): void;
    /** Subscribe to frame emissions. Returns an unsubscribe function. */
    onFrame(cb: FrameListener): Unsubscribe;
    /** Pull-style: latest frame or null if not started. */
    currentFrame(): AudioFrame | null;
    /** Caller-set viewport dimensions (copied into every emitted frame). */
    setViewport(width: number, height: number): void;
}
/** Why an adapter cannot run in the current environment / under current conditions. */
export type AudioSourceUnavailableReason = 'unsupported' | 'permission-denied' | 'no-audio-track' | 'decode-failed' | 'aborted';
export declare class AudioSourceUnavailableError extends Error {
    readonly kind: AudioSourceKind;
    readonly reason: AudioSourceUnavailableReason;
    constructor(kind: AudioSourceKind, reason: AudioSourceUnavailableReason, message?: string);
}
/** Tuning knobs for the analyzer pipeline. Sensible defaults ship; override per-source. */
export interface AnalyzerOptions {
    /** FFT size. Default 2048. */
    fftSize?: 1024 | 2048 | 4096;
    /** Number of mel bands. Default 32. Must match consumer viz expectations. */
    bands?: number;
    /** Waveform sample count (downsampled from time-domain). Default 256. */
    waveformSize?: number;
    /** EMA attack time-constant in ms for magnitudesSmooth. Default 10. */
    attackMs?: number;
    /** EMA release time-constant in ms for magnitudesSmooth. Default 120. */
    releaseMs?: number;
    /** Optional external mood/tempo overrides (e.g. from Spotify audio features). */
    mood?: Partial<Pick<AudioFrame, 'valence' | 'energy' | 'danceability' | 'tempoBPM'>>;
}
/** Options for `createAudioEngine`. */
export interface AudioEngineOptions {
    /** First kind to try; defaults to the head of `fallbackChain`. */
    preferredSource?: AudioSourceKind;
    /** Ordered fallback kinds. Default: `['displayMedia', 'microphone', 'file']`. */
    fallbackChain?: AudioSourceKind[];
    /** Required if `mediaElement` is in the chain. */
    mediaElement?: HTMLMediaElement;
    /** Required if `file` is in the chain. */
    file?: Blob | File;
    /** Analyzer options applied to whichever source the engine picks. */
    analyzer?: AnalyzerOptions;
}
/** The orchestrator. Delegates every AudioSource method to the currently-active adapter. */
export interface AudioEngine extends AudioSource {
    /** Which adapter is currently active, or null if `start()` has not been called. */
    readonly activeKind: AudioSourceKind | null;
    /** Swap to a different source at runtime. Stops the current, starts the new. */
    switchTo(kind: AudioSourceKind): Promise<void>;
}
//# sourceMappingURL=types.d.ts.map