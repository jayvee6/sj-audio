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
export declare function emaAlpha(dt: number, tauSeconds: number): number;
/**
 * Apply one step of asymmetric EMA in-place. For each i:
 *   if input[i] >= state[i]: state[i] += attackAlpha * (input[i] - state[i])
 *   else:                    state[i] += releaseAlpha * (input[i] - state[i])
 *
 * Writes result to `state` and returns it.
 */
export declare function asymmetricEmaStep(input: Float32Array, state: Float32Array, attackAlpha: number, releaseAlpha: number): Float32Array;
export interface Smoother {
    /** Current smoothed output. Length matches `process` inputs. */
    readonly state: Float32Array;
    /**
     * Advance one frame with the given dt (seconds) and read the caller's raw
     * input. Returns `state` for chaining.
     */
    process(input: Float32Array, dt: number): Float32Array;
    /** Reset the smoother state to zeros. */
    reset(): void;
}
export interface SmootherOptions {
    /** Attack time-constant in ms. Default 10. */
    attackMs?: number;
    /** Release time-constant in ms. Default 120. */
    releaseMs?: number;
}
/** Create a stateful smoother with its own state buffer of `length`. */
export declare function createSmoother(length: number, opts?: SmootherOptions): Smoother;
//# sourceMappingURL=smoothing.d.ts.map