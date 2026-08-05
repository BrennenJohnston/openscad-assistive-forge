/**
 * Unit tests for src/worker/mesh-stats.js (F-1: OFF triangle counting for
 * buffer-delivered outputs).
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { parseOffTriangleCount } from '../../src/worker/mesh-stats.js';

const OFF_INLINE = 'OFF 8 12 24\n0 0 0\n1 0 0\n';
const OFF_NEXT_LINE = 'OFF\n8 12 24\n0 0 0\n1 0 0\n';
const COFF = 'COFF 4 6 12\n0 0 0 255 0 0 255\n';

describe('parseOffTriangleCount', () => {
  it('parses the inline-header face count from a string', () => {
    expect(parseOffTriangleCount(OFF_INLINE)).toBe(12);
  });

  it('parses the counts-on-second-line variant', () => {
    expect(parseOffTriangleCount(OFF_NEXT_LINE)).toBe(12);
  });

  it('parses COFF (per-vertex color) headers', () => {
    expect(parseOffTriangleCount(COFF)).toBe(6);
  });

  it('parses an ArrayBuffer payload (the render-colors default path)', () => {
    const buffer = new TextEncoder().encode(OFF_INLINE).buffer;
    expect(parseOffTriangleCount(buffer)).toBe(12);
  });

  it('parses a Uint8Array payload', () => {
    const bytes = new TextEncoder().encode(OFF_NEXT_LINE);
    expect(parseOffTriangleCount(bytes)).toBe(12);
  });

  it('only decodes the head of a large buffer', () => {
    const big = OFF_INLINE + 'x'.repeat(5 * 1024 * 1024);
    const buffer = new TextEncoder().encode(big).buffer;
    expect(parseOffTriangleCount(buffer)).toBe(12);
  });

  it('returns 0 for garbage or non-OFF payloads', () => {
    expect(parseOffTriangleCount('solid box\nfacet normal 0 0 1\n')).toBe(0);
    expect(parseOffTriangleCount(new Uint8Array([0, 1, 2, 3, 255]).buffer)).toBe(
      0
    );
    expect(parseOffTriangleCount(null)).toBe(0);
    expect(parseOffTriangleCount(42)).toBe(0);
  });
});
