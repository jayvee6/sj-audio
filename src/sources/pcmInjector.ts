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

export interface PcmInjector {
  /** Connect this into the analyzer input (AnalyserNodeAnalyzer.input). */
  readonly node: AudioNode;
  /** Enqueue a mono Float32 block from the bridge (buffer is transferred). */
  push(samples: Float32Array): void;
  /** Tear down the worklet node. Idempotent. */
  dispose(): void;
}

let modulePromise: Promise<void> | null = null;

/** Lazily registers the worklet module once per AudioContext-bearing realm. */
async function ensureModule(ctx: AudioContext): Promise<void> {
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
export async function createPcmInjector(ctx: AudioContext): Promise<PcmInjector> {
  await ensureModule(ctx);
  const node = new AudioWorkletNode(ctx, PROCESSOR_NAME, {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
  let disposed = false;
  return {
    node,
    push(samples: Float32Array) {
      if (disposed) return;
      // Transfer the underlying buffer to avoid a copy across the thread.
      node.port.postMessage(samples, [samples.buffer]);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        node.disconnect();
      } catch {
        /* already disconnected */
      }
    },
  };
}

/** Test seam — reset the cached module registration. */
export function __resetPcmInjectorModuleForTests(): void {
  modulePromise = null;
}
