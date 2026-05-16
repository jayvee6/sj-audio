import { describe, it, expect } from 'vitest';
import { version } from '../src/index.js';

describe('smoke', () => {
  it('exports the package version', () => {
    expect(version).toBe('0.2.0');
  });
});
