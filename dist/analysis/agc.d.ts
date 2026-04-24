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
export interface Gate {
    /** Per-bin noise floor state (length BIN_COUNT). Readable for introspection. */
    readonly noiseFloor: Float32Array;
    /** Process one frame in-place. */
    process(mags: Float32Array): Float32Array;
    /** Reset state to initial values. */
    reset(): void;
}
export interface Agc {
    /** Current global peak-floor estimate. */
    peakFloor: number;
    /** Process one frame in-place. */
    process(mags: Float32Array): Float32Array;
    /** Reset state to initial values. */
    reset(): void;
}
/** Create a noise gate with fresh per-bin state. */
export declare function createGate(): Gate;
/** Create an AGC with fresh state. */
export declare function createAgc(): Agc;
//# sourceMappingURL=agc.d.ts.map