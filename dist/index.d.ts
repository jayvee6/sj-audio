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
interface AudioFrame {
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
interface Capabilities {
    mediaElement: boolean;
    microphone: boolean;
    displayMedia: boolean;
    file: boolean;
}
/** Discriminator for `AudioSource.kind` and `AudioSourceUnavailableError.kind`. */
type AudioSourceKind = 'mediaElement' | 'microphone' | 'displayMedia' | 'file';
/** Callback for frame subscription. Returned Unsubscribe detaches the listener. */
type FrameListener = (frame: AudioFrame) => void;
type Unsubscribe = () => void;
/**
 * Common interface for every source adapter. Construction is always cheap and
 * never throws — `capabilities` tells you whether `start()` will work.
 */
interface AudioSource {
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
type AudioSourceUnavailableReason = 'unsupported' | 'permission-denied' | 'no-audio-track' | 'decode-failed' | 'aborted';
declare class AudioSourceUnavailableError extends Error {
    readonly kind: AudioSourceKind;
    readonly reason: AudioSourceUnavailableReason;
    constructor(kind: AudioSourceKind, reason: AudioSourceUnavailableReason, message?: string);
}
/** Tuning knobs for the analyzer pipeline. Sensible defaults ship; override per-source. */
interface AnalyzerOptions {
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
interface AudioEngineOptions {
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
interface AudioEngine extends AudioSource {
    /** Which adapter is currently active, or null if `start()` has not been called. */
    readonly activeKind: AudioSourceKind | null;
    /** Swap to a different source at runtime. Stops the current, starts the new. */
    switchTo(kind: AudioSourceKind): Promise<void>;
}

/**
 * Common scaffolding shared by every source adapter: owns the AudioContext,
 * the AnalyzerReader, the FramePipeline, and the rAF loop. Adapters only
 * supply the source-specific "connect this AudioNode into the analyzer"
 * logic.
 *
 * This is the one place start()/stop()/onFrame()/currentFrame() live — so
 * every adapter behaves identically for the consumer.
 */

/** How the base source drives its per-frame tick. */
interface Ticker {
    start(cb: (nowMs: number) => void): void;
    stop(): void;
}

/**
 * Media-element source — analyzes audio from a page-owned `<audio>` or
 * `<video>` element via `createMediaElementSource`.
 *
 * Caveats:
 * - Only ONE `MediaElementSource` may exist per HTMLMediaElement per context.
 *   Calling twice throws `InvalidStateError`. We detect and map this to
 *   `unsupported`.
 * - Cross-origin `src` requires `audioEl.crossOrigin = 'anonymous'` BEFORE
 *   the `src` is assigned AND server-side `Access-Control-Allow-Origin`;
 *   otherwise AnalyserNode reads silence (no error surfaced by the browser).
 * - The adapter also connects the element source to `ctx.destination` so
 *   the audio remains audible — without this, `<audio>` plays visually but
 *   outputs silence.
 */

interface MediaElementSourceOptions extends AnalyzerOptions {
    /** Test hook — manual ticker instead of requestAnimationFrame. */
    ticker?: Ticker;
}
declare function createMediaElementSource(el: HTMLMediaElement, opts?: MediaElementSourceOptions): AudioSource;

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

interface MicrophoneSourceOptions extends AnalyzerOptions {
    /** Passed to getUserMedia. Default: `true` (any mic). */
    constraints?: MediaTrackConstraints | boolean;
    /** Test hook. */
    ticker?: Ticker;
}
declare function createMicrophoneSource(opts?: MicrophoneSourceOptions): AudioSource;

/**
 * Display / tab audio source via `navigator.mediaDevices.getDisplayMedia`.
 *
 * Cross-browser reality (as of 2026):
 *   Chrome / Edge desktop: works. Tab audio always; system audio on
 *     Windows/ChromeOS with "entire screen" picked. macOS has no
 *     system-audio path here.
 *   Safari:  `audio: true` is silently ignored — resulting stream has
 *            only a video track. We detect this and surface
 *            `no-audio-track`.
 *   Firefox: same — explicitly marked low-priority at Mozilla.
 *   Mobile:  unsupported everywhere.
 *
 * Proactive Chromium check: `isLikelyChromium()` sniffs the UA for Chrome
 * or Edge on desktop. Used for capability reporting; the actual adapter
 * always tries the call so we don't gate behind UA strings.
 */

interface DisplayMediaSourceOptions extends AnalyzerOptions {
    /** Forwarded to getDisplayMedia. Defaults to `{ audio: true, video: true }`. */
    constraints?: DisplayMediaStreamOptions;
    /** Test hook. */
    ticker?: Ticker;
}
/**
 * Chromium-family (Chrome/Edge) on desktop — the only browsers that actually
 * deliver an audio track from getDisplayMedia as of 2026. UA-sniff is fragile
 * but sufficient for capability reporting / UI hints; the actual capture
 * call will fail cleanly on unsupported browsers regardless.
 */
declare function isLikelyChromium(): boolean;
declare function createDisplayMediaSource(opts?: DisplayMediaSourceOptions): AudioSource;

/**
 * File source — decodes a Blob/File via `AudioContext.decodeAudioData` and
 * plays it once through the analyzer + device output. Analyze-only: no
 * play/pause/seek/loop API. If you want transport controls, use an
 * `<audio>` element + `createMediaElementSource` instead.
 *
 * Codec support varies — MP3/AAC/WAV/FLAC universal; OGG Vorbis + Opus
 * need Safari 18.4+ (April 2025). `decode-failed` is the error taxonomy
 * hit for unsupported codecs.
 */

interface FileSourceOptions extends AnalyzerOptions {
    /** Loop the buffer when it ends. Default false (plays once then stops). */
    loop?: boolean;
    /** Test hook. */
    ticker?: Ticker;
}
declare function createFileSource(file: Blob | File, opts?: FileSourceOptions): AudioSource;

/**
 * Pure, synchronous feature detection — no side effects, no prompts, no
 * async work. Callers can use this to show/hide UI (e.g. "Capture Tab"
 * buttons) without performing any permission request.
 *
 * Note: `displayMedia` requires BOTH the API existing AND the browser being
 * Chromium desktop. On Safari/Firefox the API exists but silently drops the
 * audio flag — we surface that as `false` up-front.
 */

declare function detectCapabilities(): Capabilities;

/**
 * The orchestrator — chains through source kinds in a user-supplied order,
 * using the first one that succeeds. Exposes the full `AudioSource` interface
 * (delegated to the active adapter) plus `activeKind` and `switchTo()`.
 *
 * Fallback chain default: `['displayMedia', 'microphone', 'file']` — tab audio
 * if available (Chromium desktop), otherwise mic, otherwise file upload.
 */

declare function createAudioEngine(opts?: AudioEngineOptions): AudioEngine;

/**
 * SJAudio — cross-browser web audio capture + analysis library for music viz.
 *
 * Four source adapters (mediaElement, microphone, displayMedia, file) plus a
 * unified `createAudioEngine` orchestrator with graceful fallback. Ships as
 * ESM + CJS + UMD (global: `window.SJAudio`).
 */
declare const version = "0.1.0";

export { AudioSourceUnavailableError, createAudioEngine, createDisplayMediaSource, createFileSource, createMediaElementSource, createMicrophoneSource, detectCapabilities, isLikelyChromium, version };
export type { AnalyzerOptions, AudioEngine, AudioEngineOptions, AudioFrame, AudioSource, AudioSourceKind, AudioSourceUnavailableReason, Capabilities, FrameListener, Unsubscribe };
