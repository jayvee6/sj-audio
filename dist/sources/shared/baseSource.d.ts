/**
 * Common scaffolding shared by every source adapter: owns the AudioContext,
 * the AnalyzerReader, the FramePipeline, and the rAF loop. Adapters only
 * supply the source-specific "connect this AudioNode into the analyzer"
 * logic.
 *
 * This is the one place start()/stop()/onFrame()/currentFrame() live — so
 * every adapter behaves identically for the consumer.
 */
import type { AudioSource, AudioSourceKind, AnalyzerOptions, Capabilities } from '../../types.js';
/** How the base source drives its per-frame tick. */
export interface Ticker {
    start(cb: (nowMs: number) => void): void;
    stop(): void;
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
export declare function createBaseSource(config: BaseSourceConfig): AudioSource;
//# sourceMappingURL=baseSource.d.ts.map