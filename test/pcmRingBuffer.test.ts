import { describe, it, expect } from 'vitest';
import { PcmRingBuffer } from '../src/sources/pcmRingBuffer.js';

const f = (...xs: number[]) => Float32Array.from(xs);

describe('PcmRingBuffer', () => {
  it('rejects non-positive capacity', () => {
    expect(() => new PcmRingBuffer(0)).toThrow();
  });

  it('push then pull preserves order', () => {
    const rb = new PcmRingBuffer(16);
    rb.push(f(1, 2, 3, 4));
    const out = new Float32Array(4);
    expect(rb.pull(out)).toBe(4);
    expect(Array.from(out)).toEqual([1, 2, 3, 4]);
    expect(rb.available).toBe(0);
  });

  it('underrun zero-fills the shortfall and reports real count', () => {
    const rb = new PcmRingBuffer(16);
    rb.push(f(9, 8));
    const out = new Float32Array(5);
    const real = rb.pull(out);
    expect(real).toBe(2);
    expect(Array.from(out)).toEqual([9, 8, 0, 0, 0]);
    expect(rb.underrunSamples).toBe(3);
  });

  it('wraps around the ring correctly', () => {
    const rb = new PcmRingBuffer(4);
    rb.push(f(1, 2, 3));
    const a = new Float32Array(2);
    rb.pull(a); // consumes 1,2
    rb.push(f(4, 5)); // wraps
    const b = new Float32Array(3);
    expect(rb.pull(b)).toBe(3);
    expect(Array.from(b)).toEqual([3, 4, 5]);
  });

  it('overrun drops oldest to stay within capacity', () => {
    const rb = new PcmRingBuffer(4);
    rb.push(f(1, 2, 3, 4));
    rb.push(f(5, 6)); // drops 1,2
    expect(rb.available).toBe(4);
    expect(rb.droppedSamples).toBe(2);
    const out = new Float32Array(4);
    rb.pull(out);
    expect(Array.from(out)).toEqual([3, 4, 5, 6]);
  });

  it('a block larger than capacity keeps only its tail', () => {
    const rb = new PcmRingBuffer(3);
    rb.push(f(1, 2, 3, 4, 5)); // keep last 3
    expect(rb.available).toBe(3);
    expect(rb.droppedSamples).toBe(2);
    const out = new Float32Array(3);
    rb.pull(out);
    expect(Array.from(out)).toEqual([3, 4, 5]);
  });

  it('reset clears buffered audio', () => {
    const rb = new PcmRingBuffer(8);
    rb.push(f(1, 2, 3));
    rb.reset();
    expect(rb.available).toBe(0);
    const out = new Float32Array(2);
    expect(rb.pull(out)).toBe(0);
    expect(Array.from(out)).toEqual([0, 0]);
  });

  it('empty push is a no-op', () => {
    const rb = new PcmRingBuffer(4);
    rb.push(new Float32Array(0));
    expect(rb.available).toBe(0);
  });

  it('sustained 1024-in / 128-out cadence stays stable', () => {
    const rb = new PcmRingBuffer(4096);
    const block = new Float32Array(1024).map((_, i) => i);
    const quantum = new Float32Array(128);
    let totalReal = 0;
    for (let k = 0; k < 50; k++) {
      rb.push(block);
      for (let q = 0; q < 8; q++) totalReal += rb.pull(quantum); // 1024 consumed
    }
    expect(totalReal).toBe(50 * 1024);
    expect(rb.underrunSamples).toBe(0);
  });
});
