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
export interface PcmInjector {
    /** Connect this into the analyzer input (AnalyserNodeAnalyzer.input). */
    readonly node: AudioNode;
    /** Enqueue a mono Float32 block from the bridge (buffer is transferred). */
    push(samples: Float32Array): void;
    /** Tear down the worklet node. Idempotent. */
    dispose(): void;
}
/**
 * Create a PCM injector on `ctx`. Caller connects `injector.node` into the
 * analyzer input and feeds bridge PCM via `injector.push(...)`.
 */
export declare function createPcmInjector(ctx: AudioContext): Promise<PcmInjector>;
/** Test seam — reset the cached module registration. */
export declare function __resetPcmInjectorModuleForTests(): void;
//# sourceMappingURL=pcmInjector.d.ts.map