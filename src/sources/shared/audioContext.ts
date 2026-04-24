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

interface WindowWithWebkit extends Window {
  webkitAudioContext?: typeof AudioContext;
}

let ctx: AudioContext | null = null;
let unlockAttached = false;

/** Returns the singleton AudioContext, creating it on first call. */
export function getAudioContext(): AudioContext {
  if (ctx) return ctx;
  const Ctor =
    typeof AudioContext !== 'undefined'
      ? AudioContext
      : (globalThis as unknown as WindowWithWebkit).webkitAudioContext;
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
export function unlockAudioContext(target: EventTarget = globalThis): void {
  if (unlockAttached) return;
  const context = getAudioContext();
  if (context.state === 'running') {
    unlockAttached = true;
    return;
  }
  const events: Array<keyof DocumentEventMap> = [
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
 * Resets the singleton. Test-only — in production, an AudioContext lives for
 * the page lifetime.
 */
export function __resetAudioContextForTests(): void {
  ctx = null;
  unlockAttached = false;
}
