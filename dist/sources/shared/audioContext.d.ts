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
/** Returns the singleton AudioContext, creating it on first call. */
export declare function getAudioContext(): AudioContext;
/**
 * Installs one-shot gesture listeners that call `ctx.resume()` when the user
 * interacts. Idempotent — repeat calls are no-ops.
 *
 * Caller should invoke this before starting any source, then invoke the source's
 * own `start()` from a user-gesture handler (mic/displayMedia require it anyway).
 */
export declare function unlockAudioContext(target?: EventTarget): void;
/**
 * Resets the singleton. Test-only — in production, an AudioContext lives for
 * the page lifetime.
 */
export declare function __resetAudioContextForTests(): void;
//# sourceMappingURL=audioContext.d.ts.map