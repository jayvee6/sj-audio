'use strict';

/**
 * Public types for SJAudio. See README + chunked plan for API shape rationale.
 */
class AudioSourceUnavailableError extends Error {
    constructor(kind, reason, message) {
        super(message ?? `${kind} source unavailable: ${reason}`);
        this.name = 'AudioSourceUnavailableError';
        this.kind = kind;
        this.reason = reason;
    }
}

/**
 * Lazy AudioContext singleton + one-shot user-gesture unlock.
 *
 * Browsers (especially Safari + any page without `allow=autoplay`) suspend
 * AudioContext until a user gesture. `unlockAudioContext()` installs one-shot
 * `touchstart/touchend/mousedown/keydown` listeners that call `resume()` once,
 * then self-remove.
 *
 * The singleton is shared across every adapter so mic + media-element + file
 * sources all live under the same context (required — cross-context MediaStreams
 * are not permitted).
 */
let ctx = null;
let unlockAttached = false;
/** Returns the singleton AudioContext, creating it on first call. */
function getAudioContext() {
    if (ctx)
        return ctx;
    const Ctor = typeof AudioContext !== 'undefined'
        ? AudioContext
        : globalThis.webkitAudioContext;
    if (!Ctor) {
        throw new Error('AudioContext is not available in this environment');
    }
    ctx = new Ctor();
    return ctx;
}
/**
 * Installs one-shot gesture listeners that call `ctx.resume()` when the user
 * interacts. Idempotent — repeat calls are no-ops.
 *
 * Caller should invoke this before starting any source, then invoke the source's
 * own `start()` from a user-gesture handler (mic/displayMedia require it anyway).
 */
function unlockAudioContext(target = globalThis) {
    if (unlockAttached)
        return;
    const context = getAudioContext();
    if (context.state === 'running') {
        unlockAttached = true;
        return;
    }
    // Silently no-op in environments without a DOM (e.g. vitest node env) —
    // callers should `resume()` manually there, or swap `target` for a real
    // DOM node in browser.
    if (typeof target.addEventListener !== 'function') {
        return;
    }
    const events = [
        'touchstart',
        'touchend',
        'mousedown',
        'keydown',
        'click',
    ];
    const handler = () => {
        void context.resume();
        for (const ev of events) {
            target.removeEventListener(ev, handler);
        }
    };
    for (const ev of events) {
        target.addEventListener(ev, handler, { once: false, passive: true });
    }
    unlockAttached = true;
}

/**
 * Thin wrapper around a Web Audio AnalyserNode. Provides per-frame
 * readFrequency() / readTime() that return internal Float32Arrays (no
 * allocation per frame — hot path).
 *
 * v1 uses fftSize 2048 with AnalyserNode's built-in smoothing (0.8). A future
 * Worklet-based implementation can slot in behind this same interface.
 */
/**
 * Creates an AnalyzerReader backed by a Web Audio AnalyserNode on the given
 * context. Caller is responsible for connecting their source into `input`.
 */
function createAnalyserNodeAnalyzer(ctx, opts = {}) {
    const fftSize = opts.fftSize ?? 2048;
    const smoothingTimeConstant = opts.smoothingTimeConstant ?? 0.8;
    const node = ctx.createAnalyser();
    node.fftSize = fftSize;
    node.smoothingTimeConstant = smoothingTimeConstant;
    let disposed = false;
    return {
        fftSize,
        frequencyBinCount: node.frequencyBinCount,
        sampleRate: ctx.sampleRate,
        input: node,
        readFrequency(out) {
            if (disposed)
                return out;
            node.getFloatFrequencyData(out);
            return out;
        },
        readTime(out) {
            if (disposed)
                return out;
            node.getFloatTimeDomainData(out);
            return out;
        },
        dispose() {
            if (disposed)
                return;
            disposed = true;
            try {
                node.disconnect();
            }
            catch {
                // already disconnected
            }
        },
    };
}

/**
 * 32-band mel-scale projection, ported verbatim from
 * `musicplayer-viz/audio-engine.js` so existing visualizers port over with
 * identical reactive behavior.
 *
 * Input: dBFS Float32Array of length fftSize/2 (from `getFloatFrequencyData`).
 *        Values in ~[-140, 0], -Infinity for silent bins, NaN guarded.
 * Output: linear-magnitude Float32Array of length BIN_COUNT (32) with a
 *         perceptual treble-boost curve applied (1.0× → ~3.5×).
 *
 * The projection is: dB → linear → mel-bin average → sqrt → ×binGain.
 * The sqrt step matches the iOS Metal pipeline so viz read the same shape
 * on both platforms.
 */
const BIN_COUNT = 32;
/** Convert Hz to mel (O’Shaughnessy 1987). */
function hzToMel(hz) {
    return 2595 * Math.log10(1 + hz / 700);
}
/** Convert mel to Hz. */
function melToHz(mel) {
    return 700 * (Math.pow(10, mel / 2595) - 1);
}
/**
 * Compute the FFT-bin boundaries for BIN_COUNT mel bands across [0, sampleRate/2].
 * Guarantees strictly increasing bounds so each bin averages ≥1 FFT bin.
 */
function computeMelBoundaries(fftSize, sampleRate) {
    const halfN = fftSize / 2;
    const melMin = hzToMel(0);
    const melMax = hzToMel(sampleRate / 2);
    const bounds = new Int32Array(BIN_COUNT + 1);
    for (let i = 0; i <= BIN_COUNT; i++) {
        const mel = melMin + ((melMax - melMin) * i) / BIN_COUNT;
        const hz = melToHz(mel);
        bounds[i] = Math.min(halfN, Math.max(0, Math.floor((hz / sampleRate) * fftSize)));
    }
    // Guarantee strictly increasing so each bin averages ≥1 FFT bin.
    for (let i = 1; i <= BIN_COUNT; i++) {
        if (bounds[i] <= bounds[i - 1]) {
            bounds[i] = Math.min(halfN, bounds[i - 1] + 1);
        }
    }
    return bounds;
}
/**
 * Perceptual treble-boost curve: g[b] = 1.0 + (b/(BIN_COUNT-1))^1.3 × 2.5.
 * Boosts the top band to ~3.5× so high-frequency motion is visible in viz.
 */
function computeBinGain() {
    const g = new Float32Array(BIN_COUNT);
    for (let b = 0; b < BIN_COUNT; b++) {
        const t = b / (BIN_COUNT - 1);
        g[b] = 1.0 + Math.pow(t, 1.3) * 2.5;
    }
    return g;
}
/** Create a projector. Precomputes boundaries and gain for the given config. */
function createMelProjector(fftSize, sampleRate) {
    const bounds = computeMelBoundaries(fftSize, sampleRate);
    const binGain = computeBinGain();
    const project = (db, out) => {
        for (let b = 0; b < BIN_COUNT; b++) {
            const lo = bounds[b];
            const hi = Math.max(lo + 1, bounds[b + 1]);
            let sum = 0;
            for (let i = lo; i < hi; i++) {
                const v = db[i];
                // Guard -Infinity and NaN: Math.pow(10, -Infinity/20) = 0 but Math ops on NaN propagate.
                sum += v === -Infinity || v !== v ? 0 : Math.pow(10, v * 0.05);
            }
            const avg = sum / (hi - lo);
            out[b] = Math.sqrt(avg > 0 ? avg : 0) * binGain[b];
        }
        return out;
    };
    return { bounds, binGain, project };
}

/**
 * AGC (automatic gain control) + per-band noise gate, ported verbatim from
 * `musicplayer-viz/audio-engine.js` (_gate + _agc).
 *
 * Pipeline order (run in sequence on the 32-bin mel magnitudes):
 *   1. `gate(mags)`  — per-bin noise floor descent/relax, subtract 1.8× floor, clamp ≥0
 *   2. `agc(mags)`   — global peak envelope (instant attack, 0.995/frame decay),
 *                      normalize so the loudest band ≈ 1.0
 *
 * Both operate in-place on the caller's Float32Array (length BIN_COUNT).
 * State persists across frames.
 */
// ── Gate constants (verbatim from prior art) ──────────────────────────────────
/** Initial per-bin noise floor estimate. */
const NOISE_FLOOR_INIT = 0.01;
/** Blend weight toward input when input is below current floor (fast descent). */
const GATE_DESCENT_ALPHA = 0.2;
/** Per-frame relax multiplier when input is above current floor. */
const GATE_RELAX = 1.00005;
/** Over-subtraction factor — subtract `OVER_SUB × noiseFloor` from input. */
const GATE_OVER_SUB = 1.8;
// ── AGC constants (verbatim from prior art) ───────────────────────────────────
/** Initial global peak-floor estimate, also used as div-by-zero guard. */
const PEAK_FLOOR_INIT = 0.0001;
/** Per-frame decay multiplier on the peak envelope (~3s half-life @ 86 fps). */
const PEAK_DECAY = 0.995;
/** Create a noise gate with fresh per-bin state. */
function createGate() {
    const noiseFloor = new Float32Array(BIN_COUNT).fill(NOISE_FLOOR_INIT);
    const process = (m) => {
        for (let b = 0; b < BIN_COUNT; b++) {
            const v = m[b];
            if (v < noiseFloor[b]) {
                noiseFloor[b] = v * GATE_DESCENT_ALPHA + noiseFloor[b] * (1 - GATE_DESCENT_ALPHA);
            }
            else {
                noiseFloor[b] = noiseFloor[b] * GATE_RELAX;
            }
            const gated = v - noiseFloor[b] * GATE_OVER_SUB;
            m[b] = gated > 0 ? gated : 0;
        }
        return m;
    };
    const reset = () => {
        noiseFloor.fill(NOISE_FLOOR_INIT);
    };
    return { noiseFloor, process, reset };
}
/** Create an AGC with fresh state. */
function createAgc() {
    const state = { peakFloor: PEAK_FLOOR_INIT };
    const process = (m) => {
        let max = 0;
        for (let b = 0; b < BIN_COUNT; b++) {
            if (m[b] > max)
                max = m[b];
        }
        state.peakFloor = Math.max(max, state.peakFloor * PEAK_DECAY);
        const inv = 1.0 / Math.max(state.peakFloor, PEAK_FLOOR_INIT);
        for (let b = 0; b < BIN_COUNT; b++)
            m[b] *= inv;
        return m;
    };
    const reset = () => {
        state.peakFloor = PEAK_FLOOR_INIT;
    };
    return {
        get peakFloor() {
            return state.peakFloor;
        },
        set peakFloor(v) {
            state.peakFloor = v;
        },
        process,
        reset,
    };
}

/**
 * Asymmetric EMA (exponential moving average) smoothing for per-bin magnitudes.
 *
 * Two time-constants — attack (fast rise) and release (slow fall). On each
 * element, if the new value is >= the current smoothed value, we apply the
 * attack coefficient; otherwise we apply the release coefficient. This
 * produces "punchy but smooth" viz behavior: sharp transients pop through,
 * quiet moments decay gracefully.
 *
 * Defaults (10ms attack, 120ms release) match the AudioFrame.magnitudesSmooth
 * contract documented in src/types.ts.
 *
 * Pure (stateless) math helpers + a stateful `createSmoother` factory. The
 * factory allocates its own state buffer so callers don't need to manage it.
 */
/**
 * Compute the single-frame EMA coefficient (alpha) from a time-constant.
 *
 *   alpha = 1 - exp(-dt / tau)
 *
 * Larger alpha = faster response. alpha=1 snaps to input; alpha=0 never moves.
 * Clamped to [0, 1].
 */
function emaAlpha(dt, tauSeconds) {
    if (tauSeconds <= 0)
        return 1;
    const a = 1 - Math.exp(-dt / tauSeconds);
    return a < 0 ? 0 : a > 1 ? 1 : a;
}
/**
 * Apply one step of asymmetric EMA in-place. For each i:
 *   if input[i] >= state[i]: state[i] += attackAlpha * (input[i] - state[i])
 *   else:                    state[i] += releaseAlpha * (input[i] - state[i])
 *
 * Writes result to `state` and returns it.
 */
function asymmetricEmaStep(input, state, attackAlpha, releaseAlpha) {
    const n = state.length;
    for (let i = 0; i < n; i++) {
        const v = input[i];
        const s = state[i];
        const alpha = v >= s ? attackAlpha : releaseAlpha;
        state[i] = s + alpha * (v - s);
    }
    return state;
}
/** Create a stateful smoother with its own state buffer of `length`. */
function createSmoother(length, opts = {}) {
    const attackTau = (opts.attackMs ?? 10) / 1000;
    const releaseTau = (opts.releaseMs ?? 120) / 1000;
    const state = new Float32Array(length);
    return {
        state,
        process(input, dt) {
            const aAttack = emaAlpha(dt, attackTau);
            const aRelease = emaAlpha(dt, releaseTau);
            return asymmetricEmaStep(input, state, aAttack, aRelease);
        },
        reset() {
            state.fill(0);
        },
    };
}

/**
 * Bass / mid / treble band-average computation over the 32-bin mel magnitudes.
 *
 * Ranges match musicplayer-viz/audio-engine.js:
 *   bass   = mean of bins [0..3)
 *   mid    = mean of bins [3..14)
 *   treble = mean of bins [14..32)
 *
 * Returns values in the same scale as the input (post-AGC, so ~[0..1]).
 */
const BASS_LO = 0;
const BASS_HI = 3; // exclusive
const MID_LO = 3;
const MID_HI = 14; // exclusive
const TREBLE_LO = 14;
const TREBLE_HI = 32; // exclusive
/**
 * Compute bass/mid/treble averages of a 32-bin mel magnitude array.
 * Writes into `out` (or allocates a new object if not provided) and returns it.
 */
function computeBandAverages(mags, out = { bass: 0, mid: 0, treble: 0 }) {
    out.bass = averageSlice(mags, BASS_LO, BASS_HI);
    out.mid = averageSlice(mags, MID_LO, MID_HI);
    out.treble = averageSlice(mags, TREBLE_LO, TREBLE_HI);
    return out;
}
function averageSlice(arr, lo, hi) {
    let sum = 0;
    for (let i = lo; i < hi; i++)
        sum += arr[i];
    return sum / (hi - lo);
}

/**
 * Onset detector + beatPulse envelope, ported verbatim from
 * `musicplayer-viz/audio-engine.js` (OnsetBPMDetector).
 *
 * Detection is a classic "μ + kσ" threshold over a ring buffer of recent bass
 * energy, with a debounce gap (0.2s min between beats) and a silence floor
 * (reject below 0.15). `beatPulse` is an exponential decay since the last
 * detected onset: `exp(-(t - lastBeatT) * 8.0)`.
 *
 * This module returns raw onsets. BPM estimation lives in `bpm.ts` and is
 * wired into `ingest()` via dependency injection so the files stay focused.
 */
// ── Constants (verbatim from prior art) ───────────────────────────────────────
const HISTORY_LEN = 32;
const MAX_ONSETS = 16;
const MIN_GAP_SEC = 0.2;
const K_SIGMA = 1.3;
const SILENCE_FLOOR = 0.15;
const DECAY_RATE = 8.0;
/** Create an onset detector with fresh state. */
function createOnsetDetector(opts = {}) {
    const bassHistory = new Float32Array(HISTORY_LEN);
    let bassWriteIdx = 0;
    let bassCount = 0;
    const onsets = [];
    let lastBeatT = 0;
    let lastBpm = 0;
    const estimator = opts.estimateBpm;
    const decay = (t) => {
        if (lastBeatT <= 0)
            return 0;
        return Math.exp(-(t - lastBeatT) * DECAY_RATE);
    };
    const ingest = (bass, t) => {
        bassHistory[bassWriteIdx] = bass;
        bassWriteIdx = (bassWriteIdx + 1) % HISTORY_LEN;
        if (bassCount < HISTORY_LEN)
            bassCount++;
        // Not enough history yet — decay only.
        if (bassCount < HISTORY_LEN / 2) {
            return { bpm: lastBpm, beatPulse: decay(t), isBeatNow: false };
        }
        // Threshold = μ + kσ over history, excluding the just-written sample.
        const currentIdx = (bassWriteIdx - 1 + HISTORY_LEN) % HISTORY_LEN;
        const nSamples = bassCount - 1;
        let mu = 0;
        for (let i = 0; i < nSamples; i++) {
            const idx = (currentIdx - 1 - i + HISTORY_LEN) % HISTORY_LEN;
            mu += bassHistory[idx];
        }
        mu /= nSamples;
        let varSum = 0;
        for (let i = 0; i < nSamples; i++) {
            const idx = (currentIdx - 1 - i + HISTORY_LEN) % HISTORY_LEN;
            const d = bassHistory[idx] - mu;
            varSum += d * d;
        }
        const sigma = Math.sqrt(varSum / nSamples);
        const threshold = mu + K_SIGMA * sigma;
        const rising = bass > threshold;
        const debounced = t - lastBeatT > MIN_GAP_SEC;
        const detected = rising && debounced && bass > SILENCE_FLOOR;
        if (detected) {
            onsets.push(t);
            if (onsets.length > MAX_ONSETS)
                onsets.shift();
            lastBeatT = t;
            if (estimator)
                lastBpm = estimator(onsets, lastBpm);
        }
        return { bpm: lastBpm, beatPulse: decay(t), isBeatNow: detected };
    };
    const reset = () => {
        bassHistory.fill(0);
        bassWriteIdx = 0;
        bassCount = 0;
        onsets.length = 0;
        lastBeatT = 0;
        lastBpm = 0;
    };
    return {
        get onsets() {
            return onsets;
        },
        get lastBeatT() {
            return lastBeatT;
        },
        ingest,
        reset,
    };
}

/**
 * BPM estimator from an onsets timeline, ported verbatim from
 * `musicplayer-viz/audio-engine.js` (_estimateBpm).
 *
 * Strategy: take the intervals between successive onsets, keep only those in
 * the plausible tempo range (200ms..2s → 30..300 BPM), take the median,
 * convert to BPM. Smooth against the previous estimate so a single missed
 * beat doesn't cause the tempo to jump.
 *
 *   smoothedBpm = lastBpm > 0 ? lastBpm * 0.7 + fresh * 0.3 : fresh
 */
/** Minimum onset count before returning any estimate (falls through to lastBpm). */
const MIN_ONSETS = 4;
/** Valid interval range in seconds (30..300 BPM). */
const MIN_INTERVAL_SEC = 0.2;
const MAX_INTERVAL_SEC = 2.0;
/** EMA weight on new estimate when a previous BPM exists. */
const BPM_SMOOTH_NEW = 0.3;
const BPM_SMOOTH_OLD = 0.7;
const estimateBpm = (onsets, lastBpm) => {
    if (onsets.length < MIN_ONSETS)
        return lastBpm;
    const intervals = [];
    for (let i = 1; i < onsets.length; i++) {
        const d = onsets[i] - onsets[i - 1];
        if (d > MIN_INTERVAL_SEC && d < MAX_INTERVAL_SEC)
            intervals.push(d);
    }
    if (intervals.length === 0)
        return lastBpm;
    intervals.sort((a, b) => a - b);
    const median = intervals[intervals.length >> 1];
    const fresh = 60 / median;
    return lastBpm > 0 ? lastBpm * BPM_SMOOTH_OLD + fresh * BPM_SMOOTH_NEW : fresh;
};

/**
 * Waveform downsample: 2048 (fft time-domain) → 256 samples for viz.
 *
 * Strategy: simple block-average. For each output index `j`, average the
 * corresponding stride of input samples. This is a cheap anti-aliasing pass
 * that avoids the ringing you'd get from naive stride-sampling a waveform
 * with high-frequency content.
 *
 *   stride = input.length / out.length    (integer division; input must be a
 *                                          multiple of out)
 *
 * Input/output are both in [-1, 1] — Web Audio's `getFloatTimeDomainData`
 * shape. Output is written in-place into `out`.
 */
function downsampleWaveform(input, out) {
    const stride = Math.floor(input.length / out.length);
    if (stride <= 0) {
        throw new Error(`downsampleWaveform: input length ${input.length} must be >= output length ${out.length}`);
    }
    if (stride === 1) {
        // Equal lengths — straight copy.
        out.set(input.subarray(0, out.length));
        return out;
    }
    for (let j = 0; j < out.length; j++) {
        const start = j * stride;
        let sum = 0;
        for (let k = 0; k < stride; k++)
            sum += input[start + k];
        out[j] = sum / stride;
    }
    return out;
}

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
/** Length of the exposed bassHistory ring buffer (age=0 is current frame). */
const BASS_HISTORY_LEN = 16;
function createFramePipeline(reader, opts = {}) {
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
    const bandAvgs = { bass: 0, mid: 0, treble: 0 };
    const detector = createOnsetDetector({ estimateBpm });
    const bassHistory = new Float32Array(BASS_HISTORY_LEN);
    const waveform = new Float32Array(waveformSize);
    // ── Stable, reusable frame shell ────────────────────────────────────────────
    const frame = {
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
    const tick = (t, dt) => {
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
            bassHistory[i] = bassHistory[i - 1];
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
    const setViewport = (width, height) => {
        frame.width = width;
        frame.height = height;
    };
    const setMood = (mood) => {
        if (mood.valence !== undefined)
            frame.valence = mood.valence;
        if (mood.energy !== undefined)
            frame.energy = mood.energy;
        if (mood.danceability !== undefined)
            frame.danceability = mood.danceability;
        if (mood.tempoBPM !== undefined)
            frame.tempoBPM = mood.tempoBPM;
    };
    const reset = () => {
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

/**
 * Common scaffolding shared by every source adapter: owns the AudioContext,
 * the AnalyzerReader, the FramePipeline, and the rAF loop. Adapters only
 * supply the source-specific "connect this AudioNode into the analyzer"
 * logic.
 *
 * This is the one place start()/stop()/onFrame()/currentFrame() live — so
 * every adapter behaves identically for the consumer.
 */
/** Default ticker: requestAnimationFrame, with setTimeout fallback for non-DOM envs. */
function createRafTicker() {
    let raf = null;
    let tm = null;
    return {
        start(cb) {
            const hasRaf = typeof requestAnimationFrame === 'function';
            const loopRaf = (now) => {
                cb(now);
                raf = requestAnimationFrame(loopRaf);
            };
            const loopTimer = () => {
                cb(typeof performance !== 'undefined' ? performance.now() : Date.now());
                tm = setTimeout(loopTimer, 16);
            };
            if (hasRaf)
                raf = requestAnimationFrame(loopRaf);
            else
                tm = setTimeout(loopTimer, 16);
        },
        stop() {
            if (raf !== null && typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(raf);
            }
            if (tm !== null)
                clearTimeout(tm);
            raf = null;
            tm = null;
        },
    };
}
/** Build an AudioSource from a minimal adapter config. */
function createBaseSource(config) {
    const listeners = new Set();
    let started = false;
    let starting = null;
    let lastTimeMs = 0;
    let startTimeMs = 0;
    let analyzer = null;
    let pipeline = null;
    const viewport = { w: 0, h: 0 };
    const ticker = config.ticker ?? createRafTicker();
    const fail = (reason, message) => {
        throw new AudioSourceUnavailableError(config.kind, reason, message);
    };
    const start = async () => {
        if (started)
            return;
        if (starting)
            return starting;
        starting = (async () => {
            const ctx = getAudioContext();
            unlockAudioContext();
            const a = createAnalyserNodeAnalyzer(ctx, {
                fftSize: config.analyzer?.fftSize,
            });
            analyzer = a;
            try {
                await config.onStart({ ctx, analyzerInput: a.input });
            }
            catch (err) {
                a.dispose();
                analyzer = null;
                if (err instanceof AudioSourceUnavailableError)
                    throw err;
                fail('unsupported', err instanceof Error ? err.message : String(err));
            }
            const p = createFramePipeline(a, config.analyzer);
            p.setViewport(viewport.w, viewport.h);
            pipeline = p;
            startTimeMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
            lastTimeMs = startTimeMs;
            ticker.start((nowMs) => {
                if (!pipeline)
                    return;
                const dt = Math.max(0, (nowMs - lastTimeMs) / 1000);
                const t = (nowMs - startTimeMs) / 1000;
                lastTimeMs = nowMs;
                const frame = pipeline.tick(t, dt);
                for (const cb of listeners) {
                    try {
                        cb(frame);
                    }
                    catch {
                        // swallow — listener errors must not break the loop
                    }
                }
            });
            started = true;
        })();
        try {
            await starting;
        }
        finally {
            starting = null;
        }
    };
    const stop = () => {
        if (!started && !starting)
            return;
        ticker.stop();
        config.onStop?.();
        if (analyzer)
            analyzer.dispose();
        analyzer = null;
        pipeline = null;
        started = false;
    };
    const onFrame = (cb) => {
        listeners.add(cb);
        return () => {
            listeners.delete(cb);
        };
    };
    const currentFrame = () => pipeline?.frame ?? null;
    const setViewport = (width, height) => {
        viewport.w = width;
        viewport.h = height;
        pipeline?.setViewport(width, height);
    };
    return {
        kind: config.kind,
        capabilities: config.capabilities,
        start,
        stop,
        onFrame,
        currentFrame,
        setViewport,
    };
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
function createMediaElementSource(el, opts = {}) {
    const capabilities = {
        mediaElement: typeof AudioContext !== 'undefined' && !!el,
        // These are not this adapter's concern; detectCapabilities() covers them.
        microphone: false,
        displayMedia: false,
        file: false,
    };
    let mediaNode = null;
    return createBaseSource({
        kind: 'mediaElement',
        capabilities,
        analyzer: opts,
        ticker: opts.ticker,
        onStart({ ctx, analyzerInput }) {
            try {
                mediaNode = ctx.createMediaElementSource(el);
            }
            catch (err) {
                // Most common cause: element already has a MediaElementSource on this
                // context. Not recoverable — caller must reuse the existing source.
                throw new AudioSourceUnavailableError('mediaElement', 'unsupported', err instanceof Error ? err.message : String(err));
            }
            mediaNode.connect(analyzerInput);
            // Keep audio audible: also route to the device output.
            mediaNode.connect(ctx.destination);
        },
        onStop() {
            if (mediaNode) {
                try {
                    mediaNode.disconnect();
                }
                catch {
                    // already disconnected
                }
                mediaNode = null;
            }
        },
    });
}

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
function createMicrophoneSource(opts = {}) {
    const capabilities = {
        mediaElement: false,
        microphone: typeof navigator !== 'undefined' &&
            !!navigator.mediaDevices &&
            typeof navigator.mediaDevices.getUserMedia === 'function',
        displayMedia: false,
        file: false,
    };
    let stream = null;
    let streamNode = null;
    return createBaseSource({
        kind: 'microphone',
        capabilities,
        analyzer: opts,
        ticker: opts.ticker,
        async onStart({ ctx, analyzerInput }) {
            if (!capabilities.microphone) {
                throw new AudioSourceUnavailableError('microphone', 'unsupported', 'getUserMedia is not available in this environment');
            }
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: opts.constraints ?? true,
                });
            }
            catch (err) {
                const name = err instanceof Error ? err.name : '';
                if (name === 'NotAllowedError' || name === 'SecurityError') {
                    throw new AudioSourceUnavailableError('microphone', 'permission-denied');
                }
                if (name === 'NotFoundError' || name === 'OverconstrainedError') {
                    throw new AudioSourceUnavailableError('microphone', 'no-audio-track');
                }
                throw new AudioSourceUnavailableError('microphone', 'unsupported', err instanceof Error ? err.message : String(err));
            }
            if (stream.getAudioTracks().length === 0) {
                stream.getTracks().forEach((t) => t.stop());
                stream = null;
                throw new AudioSourceUnavailableError('microphone', 'no-audio-track');
            }
            streamNode = ctx.createMediaStreamSource(stream);
            streamNode.connect(analyzerInput);
            // Intentionally NOT connected to ctx.destination — echoing the mic back
            // to speakers would produce feedback.
        },
        onStop() {
            if (streamNode) {
                try {
                    streamNode.disconnect();
                }
                catch {
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
/**
 * Chromium-family (Chrome/Edge) on desktop — the only browsers that actually
 * deliver an audio track from getDisplayMedia as of 2026. UA-sniff is fragile
 * but sufficient for capability reporting / UI hints; the actual capture
 * call will fail cleanly on unsupported browsers regardless.
 */
function isLikelyChromium() {
    if (typeof navigator === 'undefined')
        return false;
    const ua = navigator.userAgent || '';
    const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
    if (isMobile)
        return false;
    // Chrome, Edge, Brave, Opera all match /Chrome\//; exclude Firefox + Safari.
    const hasChrome = /Chrome\//.test(ua);
    const isFirefox = /Firefox\//.test(ua);
    const isSafari = /Safari\//.test(ua) && !hasChrome;
    return hasChrome && !isFirefox && !isSafari;
}
function createDisplayMediaSource(opts = {}) {
    const hasApi = typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices &&
        typeof navigator.mediaDevices.getDisplayMedia === 'function';
    const capabilities = {
        mediaElement: false,
        microphone: false,
        // getDisplayMedia exists on most browsers but audio capture only works on Chromium desktop.
        displayMedia: hasApi && isLikelyChromium(),
        file: false,
    };
    let stream = null;
    let streamNode = null;
    return createBaseSource({
        kind: 'displayMedia',
        capabilities,
        analyzer: opts,
        ticker: opts.ticker,
        async onStart({ ctx, analyzerInput }) {
            if (!hasApi) {
                throw new AudioSourceUnavailableError('displayMedia', 'unsupported', 'getDisplayMedia is not available in this environment');
            }
            try {
                stream = await navigator.mediaDevices.getDisplayMedia(opts.constraints ?? { audio: true, video: true });
            }
            catch (err) {
                const name = err instanceof Error ? err.name : '';
                if (name === 'NotAllowedError') {
                    throw new AudioSourceUnavailableError('displayMedia', 'permission-denied');
                }
                throw new AudioSourceUnavailableError('displayMedia', 'unsupported', err instanceof Error ? err.message : String(err));
            }
            if (stream.getAudioTracks().length === 0) {
                // Safari / Firefox silently drop the audio flag. No recovery path.
                stream.getTracks().forEach((t) => t.stop());
                stream = null;
                throw new AudioSourceUnavailableError('displayMedia', 'no-audio-track', 'Stream returned no audio track — Safari and Firefox do not support audio capture via getDisplayMedia.');
            }
            streamNode = ctx.createMediaStreamSource(stream);
            streamNode.connect(analyzerInput);
            // NOT routed to destination — would double up audio the user is
            // already hearing from the shared tab.
        },
        onStop() {
            if (streamNode) {
                try {
                    streamNode.disconnect();
                }
                catch {
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
function createFileSource(file, opts = {}) {
    const capabilities = {
        mediaElement: false,
        microphone: false,
        displayMedia: false,
        file: typeof AudioContext !== 'undefined' &&
            typeof file.arrayBuffer === 'function',
    };
    let bufferSource = null;
    return createBaseSource({
        kind: 'file',
        capabilities,
        analyzer: opts,
        ticker: opts.ticker,
        async onStart({ ctx, analyzerInput }) {
            if (!capabilities.file) {
                throw new AudioSourceUnavailableError('file', 'unsupported', 'AudioContext or Blob.arrayBuffer not available in this environment');
            }
            let buffer;
            try {
                const arr = await file.arrayBuffer();
                buffer = await ctx.decodeAudioData(arr.slice(0));
            }
            catch (err) {
                throw new AudioSourceUnavailableError('file', 'decode-failed', err instanceof Error ? err.message : String(err));
            }
            bufferSource = ctx.createBufferSource();
            bufferSource.buffer = buffer;
            bufferSource.loop = opts.loop ?? false;
            bufferSource.connect(analyzerInput);
            bufferSource.connect(ctx.destination);
            bufferSource.start(0);
        },
        onStop() {
            if (bufferSource) {
                try {
                    bufferSource.stop();
                }
                catch {
                    // already stopped — AudioBufferSourceNode throws if stop() is called twice
                }
                try {
                    bufferSource.disconnect();
                }
                catch {
                    // already disconnected
                }
                bufferSource = null;
            }
        },
    });
}

/**
 * SJAudioBridge wire protocol v1 — pure decoder/encoder (no WebSocket dep, so
 * it unit-tests in isolation). Mirrors sj-audio-bridge's Swift WSServer.
 *
 *   server → client  text    {"type":"hello","protocol":1}
 *   client → server  text    {"type":"auth","token":"<hex>"}
 *   server → client  text    {"type":"ready","sampleRate":48000,"channels":1,
 *                             "blockSize":1024,"format":"f32le","protocol":1}
 *   server → client  BINARY  blockSize little-endian Float32 mono samples
 */
const BRIDGE_PROTOCOL_VERSION = 1;
class BridgeProtocolError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BridgeProtocolError';
    }
}
/** Build the client→server auth frame (a JSON string). */
function buildAuthMessage(token) {
    return JSON.stringify({ type: 'auth', token });
}
/**
 * Decode one inbound WS message.
 * - string  → parsed JSON control message (hello/ready/unknown)
 * - ArrayBuffer/typed buffer → PCM (Float32, little-endian)
 *
 * Throws BridgeProtocolError on malformed control JSON or a PCM buffer whose
 * byte length isn't a multiple of 4 (Float32).
 */
function decodeBridgeMessage(data) {
    if (typeof data === 'string')
        return decodeControl(data);
    const buf = isArrayBufferView(data)
        ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        : data;
    if (buf.byteLength % 4 !== 0) {
        throw new BridgeProtocolError(`PCM frame byte length ${buf.byteLength} is not a multiple of 4 (Float32)`);
    }
    // Web Audio + every target platform is little-endian; the bridge sends
    // native-endian Float32 (documented f32le). new Float32Array(buf) reads LE.
    return { kind: 'pcm', samples: new Float32Array(buf) };
}
function decodeControl(text) {
    let obj;
    try {
        obj = JSON.parse(text);
    }
    catch {
        throw new BridgeProtocolError(`control message is not valid JSON: ${text.slice(0, 80)}`);
    }
    if (typeof obj !== 'object' || obj === null || !('type' in obj)) {
        return { kind: 'unknown', raw: obj };
    }
    const o = obj;
    switch (o.type) {
        case 'hello':
            return { kind: 'hello', protocol: numberOr(o.protocol, 0) };
        case 'ready': {
            const ready = {
                kind: 'ready',
                sampleRate: numberOr(o.sampleRate, 0),
                channels: numberOr(o.channels, 1),
                blockSize: numberOr(o.blockSize, 0),
                format: o.format === 'f32le' ? 'f32le' : 'f32le',
                protocol: numberOr(o.protocol, 0),
            };
            if (o.format !== 'f32le') {
                throw new BridgeProtocolError(`unsupported PCM format "${String(o.format)}" (expected f32le)`);
            }
            if (ready.protocol !== BRIDGE_PROTOCOL_VERSION) {
                throw new BridgeProtocolError(`protocol mismatch: bridge=${ready.protocol}, client=${BRIDGE_PROTOCOL_VERSION}`);
            }
            if (ready.sampleRate <= 0 || ready.blockSize <= 0) {
                throw new BridgeProtocolError(`invalid ready params sampleRate=${ready.sampleRate} blockSize=${ready.blockSize}`);
            }
            return ready;
        }
        default:
            return { kind: 'unknown', raw: obj };
    }
}
function numberOr(v, fallback) {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function isArrayBufferView(v) {
    return ArrayBuffer.isView(v);
}

/**
 * AudioWorklet PCM injector — pumps native-bridge Float32 blocks into the
 * Web Audio graph so the EXISTING AnalyserNodeAnalyzer + FramePipeline run
 * unchanged (zero analysis edits → automatic viz parity with every other
 * sj-audio source).
 *
 * The worklet processor is shipped as an inline Blob URL (no separate file to
 * host — works for both the ESM and UMD builds). Its queue mirrors
 * PcmRingBuffer's policy: underrun → brief silence (never stall), backlog
 * capped (drop oldest) so latency stays bounded.
 *
 * Browser-only glue — the queue *policy* is unit-tested via PcmRingBuffer;
 * this wiring is exercised end-to-end by the W4 demo.
 */
const PROCESSOR_NAME = 'sj-pcm-injector';
// Inline worklet processor. Runs in AudioWorkletGlobalScope (no imports).
const PROCESSOR_SRC = /* js */ `
class SJPcmInjector extends AudioWorkletProcessor {
  constructor() {
    super();
    this._q = [];        // queued Float32Array chunks
    this._off = 0;        // read offset into _q[0]
    this._buffered = 0;   // total queued samples
    this._cap = 48000;    // ~1s @ 48k latency ceiling
    this.port.onmessage = (e) => {
      const chunk = e.data;
      if (!(chunk instanceof Float32Array) || chunk.length === 0) return;
      this._q.push(chunk);
      this._buffered += chunk.length;
      // Backlog cap: drop oldest whole chunks until under the ceiling.
      while (this._buffered > this._cap && this._q.length > 1) {
        const dropped = this._q.shift();
        this._buffered -= (dropped.length - this._off);
        this._off = 0;
      }
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const frames = out[0].length;
    const mono = new Float32Array(frames);
    let i = 0;
    while (i < frames && this._q.length > 0) {
      const head = this._q[0];
      const avail = head.length - this._off;
      const take = Math.min(avail, frames - i);
      mono.set(head.subarray(this._off, this._off + take), i);
      this._off += take;
      this._buffered -= take;
      i += take;
      if (this._off >= head.length) { this._q.shift(); this._off = 0; }
    }
    // i..frames stays zero (underrun → silence).
    for (let c = 0; c < out.length; c++) out[c].set(mono);
    return true;
  }
}
registerProcessor(${JSON.stringify(PROCESSOR_NAME)}, SJPcmInjector);
`;
let modulePromise = null;
/** Lazily registers the worklet module once per AudioContext-bearing realm. */
async function ensureModule(ctx) {
    if (!modulePromise) {
        const blob = new Blob([PROCESSOR_SRC], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        modulePromise = ctx.audioWorklet.addModule(url).finally(() => {
            URL.revokeObjectURL(url);
        });
    }
    return modulePromise;
}
/**
 * Create a PCM injector on `ctx`. Caller connects `injector.node` into the
 * analyzer input and feeds bridge PCM via `injector.push(...)`.
 */
async function createPcmInjector(ctx) {
    await ensureModule(ctx);
    const node = new AudioWorkletNode(ctx, PROCESSOR_NAME, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
    });
    let disposed = false;
    return {
        node,
        push(samples) {
            if (disposed)
                return;
            // Transfer the underlying buffer to avoid a copy across the thread.
            node.port.postMessage(samples, [samples.buffer]);
        },
        dispose() {
            if (disposed)
                return;
            disposed = true;
            try {
                node.disconnect();
            }
            catch {
                /* already disconnected */
            }
        },
    };
}

/**
 * Native-bridge source — consumes system audio from the SJAudioBridge macOS
 * helper (https://github.com/jayvee6/sj-audio-bridge) over a token-gated
 * localhost WebSocket, injects it through an AudioWorklet into the EXISTING
 * analyzer + FramePipeline. Works in EVERY browser (it's just a WebSocket),
 * including Safari/Firefox where getDisplayMedia audio is unavailable.
 *
 * Handshake (wire protocol v1, see nativeBridgeProtocol.ts):
 *   hello → send auth(token) → ready → binary PCM → injector → analyzer.
 *
 * Error mapping → AudioSourceUnavailableError.reason:
 *   socket never opens / refused        → bridge-unreachable
 *   closed after auth, before ready     → auth-failed (bad/absent token)
 *   no hello/ready within timeout       → bridge-unreachable
 *   stop() during startup               → aborted
 */
const DEFAULT_URL = 'ws://127.0.0.1:17653';
function createNativeBridgeSource(opts) {
    // Not one of the four browser-feature sources — report them false, exactly
    // like createMicrophoneSource does for the others. Reachability is
    // discovered at start() (throws bridge-unreachable / auth-failed).
    const capabilities = {
        mediaElement: false,
        microphone: false,
        displayMedia: false,
        file: false,
    };
    const url = opts.url ?? DEFAULT_URL;
    const readyTimeoutMs = opts.readyTimeoutMs ?? 5000;
    let ws = null;
    let injector = null;
    return createBaseSource({
        kind: 'nativeBridge',
        capabilities,
        analyzer: opts,
        ticker: opts.ticker,
        onStart: ({ ctx, analyzerInput }) => new Promise((resolve, reject) => {
            if (typeof WebSocket === 'undefined') {
                reject(new AudioSourceUnavailableError('nativeBridge', 'bridge-unreachable', 'WebSocket is not available in this environment'));
                return;
            }
            let settled = false;
            let sentAuth = false;
            const fail = (reason, msg) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                try {
                    ws?.close();
                }
                catch {
                    /* noop */
                }
                reject(new AudioSourceUnavailableError('nativeBridge', reason, msg));
            };
            const timer = setTimeout(() => fail('bridge-unreachable', `no "ready" within ${readyTimeoutMs}ms`), readyTimeoutMs);
            let socket;
            try {
                socket = new WebSocket(url);
            }
            catch (e) {
                clearTimeout(timer);
                reject(new AudioSourceUnavailableError('nativeBridge', 'bridge-unreachable', e instanceof Error ? e.message : String(e)));
                return;
            }
            ws = socket;
            socket.binaryType = 'arraybuffer';
            socket.onmessage = (ev) => {
                let msg;
                try {
                    msg = decodeBridgeMessage(ev.data);
                }
                catch {
                    return; // ignore undecodable frames
                }
                if (msg.kind === 'hello') {
                    sentAuth = true;
                    socket.send(buildAuthMessage(opts.token));
                }
                else if (msg.kind === 'ready') {
                    void (async () => {
                        try {
                            const inj = await createPcmInjector(ctx);
                            injector = inj;
                            inj.node.connect(analyzerInput);
                            if (settled) {
                                inj.dispose(); // stop() raced us
                                return;
                            }
                            settled = true;
                            clearTimeout(timer);
                            resolve();
                        }
                        catch (e) {
                            fail('bridge-unreachable', e instanceof Error ? e.message : 'injector init failed');
                        }
                    })();
                }
                else if (msg.kind === 'pcm') {
                    injector?.push(msg.samples);
                }
            };
            socket.onerror = () => {
                // Browsers don't expose connect-refused detail; classify by phase.
                fail(sentAuth ? 'auth-failed' : 'bridge-unreachable', 'WebSocket error');
            };
            socket.onclose = () => {
                // Closed before ready → if we'd authed, the bridge rejected the
                // token; otherwise it was never reachable / handshake stalled.
                if (!settled)
                    fail(sentAuth ? 'auth-failed' : 'bridge-unreachable');
            };
        }),
        onStop: () => {
            try {
                injector?.dispose();
            }
            catch {
                /* noop */
            }
            injector = null;
            try {
                ws?.close();
            }
            catch {
                /* noop */
            }
            ws = null;
        },
    });
}

/**
 * Pure, synchronous feature detection — no side effects, no prompts, no
 * async work. Callers can use this to show/hide UI (e.g. "Capture Tab"
 * buttons) without performing any permission request.
 *
 * Note: `displayMedia` requires BOTH the API existing AND the browser being
 * Chromium desktop. On Safari/Firefox the API exists but silently drops the
 * audio flag — we surface that as `false` up-front.
 */
function detectCapabilities() {
    const hasAudioContext = typeof AudioContext !== 'undefined' ||
        (typeof globalThis !== 'undefined' &&
            typeof globalThis.webkitAudioContext !==
                'undefined');
    const hasMediaDevices = typeof navigator !== 'undefined' && !!navigator.mediaDevices;
    const hasGetUserMedia = hasMediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
    const hasGetDisplayMedia = hasMediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function';
    const hasBlobArrayBuffer = typeof Blob !== 'undefined' &&
        typeof Blob.prototype.arrayBuffer === 'function';
    return {
        mediaElement: hasAudioContext && typeof HTMLMediaElement !== 'undefined',
        microphone: hasAudioContext && hasGetUserMedia,
        // API must exist AND browser must actually deliver an audio track.
        displayMedia: hasAudioContext && hasGetDisplayMedia && isLikelyChromium(),
        file: hasAudioContext && hasBlobArrayBuffer,
    };
}

/**
 * The orchestrator — chains through source kinds in a user-supplied order,
 * using the first one that succeeds. Exposes the full `AudioSource` interface
 * (delegated to the active adapter) plus `activeKind` and `switchTo()`.
 *
 * Fallback chain default: `['displayMedia', 'microphone', 'file']` — tab audio
 * if available (Chromium desktop), otherwise mic, otherwise file upload.
 */
/** The four synchronously feature-detectable kinds (keys of Capabilities). */
const isBrowserCap = (k) => k === 'mediaElement' || k === 'microphone' || k === 'displayMedia' || k === 'file';
const DEFAULT_CHAIN = ['displayMedia', 'microphone', 'file'];
function createAudioEngine(opts = {}) {
    const baseChain = opts.fallbackChain ?? DEFAULT_CHAIN.slice();
    const chain = opts.preferredSource
        ? [opts.preferredSource, ...baseChain.filter((k) => k !== opts.preferredSource)]
        : baseChain;
    const capabilities = detectCapabilities();
    const listeners = new Set();
    let active = null;
    let activeKind = null;
    const viewport = { w: 0, h: 0 };
    // We wire every adapter's onFrame through a stable republisher so swapping
    // the active source doesn't force consumers to re-subscribe.
    let activeUnsub = null;
    const buildSource = (kind) => {
        switch (kind) {
            case 'mediaElement':
                if (!opts.mediaElement) {
                    throw new AudioSourceUnavailableError('mediaElement', 'unsupported', 'AudioEngineOptions.mediaElement was not provided');
                }
                return createMediaElementSource(opts.mediaElement, opts.analyzer);
            case 'microphone':
                return createMicrophoneSource(opts.analyzer);
            case 'displayMedia':
                return createDisplayMediaSource(opts.analyzer);
            case 'file':
                if (!opts.file) {
                    throw new AudioSourceUnavailableError('file', 'unsupported', 'AudioEngineOptions.file was not provided');
                }
                return createFileSource(opts.file, opts.analyzer);
            case 'nativeBridge':
                if (!opts.nativeBridge?.token) {
                    throw new AudioSourceUnavailableError('nativeBridge', 'unsupported', 'AudioEngineOptions.nativeBridge.token was not provided');
                }
                return createNativeBridgeSource({
                    token: opts.nativeBridge.token,
                    url: opts.nativeBridge.url,
                    ...opts.analyzer,
                });
        }
    };
    const attach = async (kind) => {
        const src = buildSource(kind);
        src.setViewport(viewport.w, viewport.h);
        activeUnsub = src.onFrame((frame) => {
            for (const cb of listeners) {
                try {
                    cb(frame);
                }
                catch {
                    // isolate
                }
            }
        });
        await src.start();
        active = src;
        activeKind = kind;
    };
    const detach = () => {
        if (activeUnsub) {
            activeUnsub();
            activeUnsub = null;
        }
        if (active) {
            active.stop();
            active = null;
        }
        activeKind = null;
    };
    const start = async () => {
        if (active)
            return;
        let lastErr = null;
        for (const kind of chain) {
            // Fast-skip: if static capability says false AND caller didn't force it
            // via preferredSource, skip. (Still try if explicitly preferred, so the
            // caller can see the real error.)
            // nativeBridge has no synchronous capability — its reachability is only
            // known at start(); never fast-skip it on static caps.
            if (isBrowserCap(kind) &&
                !capabilities[kind] &&
                opts.preferredSource !== kind) {
                continue;
            }
            // Fast-skip: payload-requiring kinds with no payload provided.
            if (kind === 'mediaElement' && !opts.mediaElement)
                continue;
            if (kind === 'file' && !opts.file)
                continue;
            if (kind === 'nativeBridge' && !opts.nativeBridge?.token)
                continue;
            try {
                await attach(kind);
                return;
            }
            catch (err) {
                lastErr = err;
                detach();
                // keep trying the next kind
            }
        }
        if (lastErr)
            throw lastErr;
        throw new AudioSourceUnavailableError(chain[0] ?? 'microphone', 'unsupported', 'No source in the fallback chain was available');
    };
    const stop = () => {
        detach();
    };
    const switchTo = async (kind) => {
        detach();
        await attach(kind);
    };
    const onFrame = (cb) => {
        listeners.add(cb);
        return () => {
            listeners.delete(cb);
        };
    };
    const currentFrame = () => active?.currentFrame() ?? null;
    const setViewport = (width, height) => {
        viewport.w = width;
        viewport.h = height;
        active?.setViewport(width, height);
    };
    const engine = {
        get kind() {
            return (activeKind ?? chain[0] ?? 'microphone');
        },
        get capabilities() {
            return capabilities;
        },
        get activeKind() {
            return activeKind;
        },
        start,
        stop,
        switchTo,
        onFrame,
        currentFrame,
        setViewport,
    };
    return engine;
}

/**
 * SJAudio — cross-browser web audio capture + analysis library for music viz.
 *
 * Four source adapters (mediaElement, microphone, displayMedia, file) plus a
 * unified `createAudioEngine` orchestrator with graceful fallback. Ships as
 * ESM + CJS + UMD (global: `window.SJAudio`).
 */
const version = '0.2.0';

exports.AudioSourceUnavailableError = AudioSourceUnavailableError;
exports.createAudioEngine = createAudioEngine;
exports.createDisplayMediaSource = createDisplayMediaSource;
exports.createFileSource = createFileSource;
exports.createMediaElementSource = createMediaElementSource;
exports.createMicrophoneSource = createMicrophoneSource;
exports.createNativeBridgeSource = createNativeBridgeSource;
exports.detectCapabilities = detectCapabilities;
exports.isLikelyChromium = isLikelyChromium;
exports.version = version;
//# sourceMappingURL=sj-audio.cjs.js.map
