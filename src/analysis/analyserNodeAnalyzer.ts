/**
 * Thin wrapper around a Web Audio AnalyserNode. Provides per-frame
 * readFrequency() / readTime() that return internal Float32Arrays (no
 * allocation per frame — hot path).
 *
 * v1 uses fftSize 2048 with AnalyserNode's built-in smoothing (0.8). A future
 * Worklet-based implementation can slot in behind this same interface.
 */

export interface AnalyzerReader {
  /** FFT size (power of two). */
  readonly fftSize: number;
  /** Number of frequency bins (fftSize / 2). */
  readonly frequencyBinCount: number;
  /** Underlying AudioContext sample rate (Hz). */
  readonly sampleRate: number;
  /** The AudioNode that the source should connect into. */
  readonly input: AudioNode;
  /**
   * Fills the caller-owned Float32Array with dBFS magnitudes (negative values,
   * typically -100 to 0). Returns the array for convenience.
   */
  readFrequency(out: Float32Array): Float32Array;
  /**
   * Fills the caller-owned Float32Array with time-domain samples in [-1..1].
   * Returns the array for convenience.
   */
  readTime(out: Float32Array): Float32Array;
  /** Releases internal buffers. Idempotent. */
  dispose(): void;
}

export interface AnalyserNodeAnalyzerOptions {
  /** Power of two, default 2048. */
  fftSize?: 1024 | 2048 | 4096;
  /** AnalyserNode smoothingTimeConstant, default 0.8. Matches musicplayer-viz. */
  smoothingTimeConstant?: number;
}

/**
 * Creates an AnalyzerReader backed by a Web Audio AnalyserNode on the given
 * context. Caller is responsible for connecting their source into `input`.
 */
export function createAnalyserNodeAnalyzer(
  ctx: AudioContext,
  opts: AnalyserNodeAnalyzerOptions = {},
): AnalyzerReader {
  const fftSize = opts.fftSize ?? 2048;
  const smoothingTimeConstant = opts.smoothingTimeConstant ?? 0.8;

  const node = ctx.createAnalyser();
  node.fftSize = fftSize;
  node.smoothingTimeConstant = smoothingTimeConstant;

  let disposed = false;

  return {
    fftSize,
    frequencyBinCount: node.frequencyBinCount,
    sampleRate: ctx.sampleRate,
    input: node,
    readFrequency(out) {
      if (disposed) return out;
      node.getFloatFrequencyData(out);
      return out;
    },
    readTime(out) {
      if (disposed) return out;
      node.getFloatTimeDomainData(out);
      return out;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        node.disconnect();
      } catch {
        // already disconnected
      }
    },
  };
}
