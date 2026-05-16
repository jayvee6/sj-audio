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
export class PcmRingBuffer {
  private buf: Float32Array;
  private readonly capacity: number;
  private writeIdx = 0;
  private readIdx = 0;
  private filled = 0;
  /** Count of samples zero-filled due to underrun (diagnostics). */
  underrunSamples = 0;
  /** Count of samples dropped due to overrun (diagnostics). */
  droppedSamples = 0;

  /** @param capacity max buffered samples (latency ceiling). */
  constructor(capacity: number) {
    if (capacity <= 0) throw new Error('PcmRingBuffer capacity must be > 0');
    this.capacity = capacity;
    this.buf = new Float32Array(capacity);
  }

  /** Samples currently buffered. */
  get available(): number {
    return this.filled;
  }

  /** Enqueue PCM. If it would overflow, drop oldest to stay within capacity. */
  push(samples: Float32Array): void {
    const n = samples.length;
    if (n === 0) return;

    // If the incoming block alone exceeds capacity, keep only its tail.
    if (n >= this.capacity) {
      this.buf.set(samples.subarray(n - this.capacity));
      this.writeIdx = 0;
      this.readIdx = 0;
      this.filled = this.capacity;
      this.droppedSamples += n - this.capacity;
      return;
    }

    const overflow = this.filled + n - this.capacity;
    if (overflow > 0) {
      // Advance read past the oldest `overflow` samples.
      this.readIdx = (this.readIdx + overflow) % this.capacity;
      this.filled -= overflow;
      this.droppedSamples += overflow;
    }

    for (let i = 0; i < n; i++) {
      this.buf[this.writeIdx] = samples[i]!;
      this.writeIdx = (this.writeIdx + 1) % this.capacity;
    }
    this.filled += n;
  }

  /**
   * Fill `out` with buffered samples; zero-fill any shortfall (underrun).
   * Returns the number of real (non-zero-filled) samples written.
   */
  pull(out: Float32Array): number {
    const want = out.length;
    const got = Math.min(want, this.filled);
    for (let i = 0; i < got; i++) {
      out[i] = this.buf[this.readIdx]!;
      this.readIdx = (this.readIdx + 1) % this.capacity;
    }
    this.filled -= got;
    if (got < want) {
      out.fill(0, got);
      this.underrunSamples += want - got;
    }
    return got;
  }

  /** Drop all buffered audio (e.g. on reconnect). */
  reset(): void {
    this.writeIdx = 0;
    this.readIdx = 0;
    this.filled = 0;
  }
}
