/**
 * Common scaffolding shared by every source adapter: owns the AudioContext,
 * the AnalyzerReader, the FramePipeline, and the rAF loop. Adapters only
 * supply the source-specific "connect this AudioNode into the analyzer"
 * logic.
 *
 * This is the one place start()/stop()/onFrame()/currentFrame() live — so
 * every adapter behaves identically for the consumer.
 */

import type {
  AudioSource,
  AudioSourceKind,
  AudioSourceUnavailableReason,
  AnalyzerOptions,
  Capabilities,
  AudioFrame,
  FrameListener,
  Unsubscribe,
} from '../../types.js';
import { AudioSourceUnavailableError } from '../../types.js';
import { getAudioContext, unlockAudioContext } from './audioContext.js';
import { createAnalyserNodeAnalyzer } from '../../analysis/analyserNodeAnalyzer.js';
import { createFramePipeline } from '../../frame/buildFrame.js';

/** How the base source drives its per-frame tick. */
export interface Ticker {
  start(cb: (nowMs: number) => void): void;
  stop(): void;
}

/** Default ticker: requestAnimationFrame, with setTimeout fallback for non-DOM envs. */
function createRafTicker(): Ticker {
  let raf: number | null = null;
  let tm: ReturnType<typeof setTimeout> | null = null;
  return {
    start(cb) {
      const hasRaf = typeof requestAnimationFrame === 'function';
      const loopRaf = (now: number) => {
        cb(now);
        raf = requestAnimationFrame(loopRaf);
      };
      const loopTimer = () => {
        cb(typeof performance !== 'undefined' ? performance.now() : Date.now());
        tm = setTimeout(loopTimer, 16);
      };
      if (hasRaf) raf = requestAnimationFrame(loopRaf);
      else tm = setTimeout(loopTimer, 16);
    },
    stop() {
      if (raf !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(raf);
      }
      if (tm !== null) clearTimeout(tm);
      raf = null;
      tm = null;
    },
  };
}

export interface BaseSourceConfig {
  kind: AudioSourceKind;
  capabilities: Capabilities;
  analyzer?: AnalyzerOptions;
  /**
   * Adapter-specific start hook. Called AFTER the AudioContext is unlocked and
   * an AnalyserNode has been created. Must connect the source-specific node
   * into `analyzerInput` (e.g. `mediaElementSource.connect(analyzerInput)`).
   *
   * Throw `AudioSourceUnavailableError` to surface a recoverable failure
   * (permission-denied, no-audio-track, etc).
   */
  onStart(args: {
    ctx: AudioContext;
    analyzerInput: AudioNode;
  }): Promise<void> | void;
  /** Adapter-specific teardown. Called on `stop()` before the analyzer disposes. */
  onStop?(): void;
  /** Injection seam for tests. */
  ticker?: Ticker;
}

/** Build an AudioSource from a minimal adapter config. */
export function createBaseSource(config: BaseSourceConfig): AudioSource {
  const listeners = new Set<FrameListener>();
  let started = false;
  let starting: Promise<void> | null = null;
  let lastTimeMs = 0;
  let startTimeMs = 0;
  let analyzer: ReturnType<typeof createAnalyserNodeAnalyzer> | null = null;
  let pipeline: ReturnType<typeof createFramePipeline> | null = null;
  const viewport = { w: 0, h: 0 };
  const ticker = config.ticker ?? createRafTicker();

  const fail = (reason: AudioSourceUnavailableReason, message?: string): never => {
    throw new AudioSourceUnavailableError(config.kind, reason, message);
  };

  const start = async (): Promise<void> => {
    if (started) return;
    if (starting) return starting;
    starting = (async () => {
      const ctx = getAudioContext();
      unlockAudioContext();
      const a = createAnalyserNodeAnalyzer(ctx, {
        fftSize: config.analyzer?.fftSize,
      });
      analyzer = a;
      try {
        await config.onStart({ ctx, analyzerInput: a.input });
      } catch (err) {
        a.dispose();
        analyzer = null;
        if (err instanceof AudioSourceUnavailableError) throw err;
        fail('unsupported', err instanceof Error ? err.message : String(err));
      }
      const p = createFramePipeline(a, config.analyzer);
      p.setViewport(viewport.w, viewport.h);
      pipeline = p;

      startTimeMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      lastTimeMs = startTimeMs;

      ticker.start((nowMs) => {
        if (!pipeline) return;
        const dt = Math.max(0, (nowMs - lastTimeMs) / 1000);
        const t = (nowMs - startTimeMs) / 1000;
        lastTimeMs = nowMs;
        const frame = pipeline.tick(t, dt);
        for (const cb of listeners) {
          try {
            cb(frame);
          } catch {
            // swallow — listener errors must not break the loop
          }
        }
      });
      started = true;
    })();
    try {
      await starting;
    } finally {
      starting = null;
    }
  };

  const stop = (): void => {
    if (!started && !starting) return;
    ticker.stop();
    config.onStop?.();
    if (analyzer) analyzer.dispose();
    analyzer = null;
    pipeline = null;
    started = false;
  };

  const onFrame = (cb: FrameListener): Unsubscribe => {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  };

  const currentFrame = (): AudioFrame | null => pipeline?.frame ?? null;

  const setViewport = (width: number, height: number): void => {
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
