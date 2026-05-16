/**
 * Bounded mono Float32 ring buffer for the native-bridge PCM path.
 *
 * WS delivers ~46.9 blocks/s of 1024 samples; the Web Audio graph pulls in
 * 128-sample render quanta at the AudioContext rate. This buffer reconciles
 * the two:
 *   - `push` enqueues bridge PCM.
 *   - `pull` fills a render quantum; underrun → zero-fill (brief silence,
 *     never a throw) so the audio graph never stalls.
 *   - On overrun the OLDEST samples are dropped so latency stays bounded —
 *     realtime audio: stale samples are useless, fresh is what matters.
 *
 * Pure + framework-free so it unit-tests in node. The AudioWorklet processor
 * in pcmInjector.ts mirrors this exact policy in worklet scope.
 */
export declare class PcmRingBuffer {
    private buf;
    private readonly capacity;
    private writeIdx;
    private readIdx;
    private filled;
    /** Count of samples zero-filled due to underrun (diagnostics). */
    underrunSamples: number;
    /** Count of samples dropped due to overrun (diagnostics). */
    droppedSamples: number;
    /** @param capacity max buffered samples (latency ceiling). */
    constructor(capacity: number);
    /** Samples currently buffered. */
    get available(): number;
    /** Enqueue PCM. If it would overflow, drop oldest to stay within capacity. */
    push(samples: Float32Array): void;
    /**
     * Fill `out` with buffered samples; zero-fill any shortfall (underrun).
     * Returns the number of real (non-zero-filled) samples written.
     */
    pull(out: Float32Array): number;
    /** Drop all buffered audio (e.g. on reconnect). */
    reset(): void;
}
//# sourceMappingURL=pcmRingBuffer.d.ts.map