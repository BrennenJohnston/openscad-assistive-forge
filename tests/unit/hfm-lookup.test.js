import { describe, it, expect } from 'vitest'
import {
  quantKey6,
  createLookup,
  QUANT_RANGE,
} from '../../src/js/_hfm-lookup.js'

function vec(...values) {
  return Float32Array.from(values)
}

describe('quantKey6', () => {
  it('produces stable keys for identical vectors', () => {
    const a = vec(0.1, 0.2, 0.3, 0.4, 0.5, 0.6)
    const b = vec(0.1, 0.2, 0.3, 0.4, 0.5, 0.6)
    expect(quantKey6(a)).toBe(quantKey6(b))
  })

  it('maps vectors in the same quantization bucket to the same key', () => {
    // Bucket width is 1/QUANT_RANGE; both values land in bucket 5 of 11
    const a = vec(0.5, 0.5, 0.5, 0.5, 0.5, 0.5)
    const b = vec(0.5 + 0.4 / QUANT_RANGE, 0.5, 0.5, 0.5, 0.5, 0.5)
    expect(quantKey6(a)).toBe(quantKey6(b))
  })

  it('maps distinct buckets to distinct keys', () => {
    const a = vec(0, 0, 0, 0, 0, 0)
    const b = vec(0.99, 0, 0, 0, 0, 0)
    expect(quantKey6(a)).not.toBe(quantKey6(b))
  })

  it('clamps out-of-range components into the key space', () => {
    const low = vec(-1, -1, -1, -1, -1, -1)
    const high = vec(2, 2, 2, 2, 2, 2)
    expect(quantKey6(low)).toBe(0)
    expect(quantKey6(high)).toBe(QUANT_RANGE ** 6 - 1)
  })
})

describe('createLookup', () => {
  // Three well-separated glyph vectors: "dark", "top-heavy", "bright"
  const vectors = [
    vec(0, 0, 0, 0, 0, 0),
    vec(1, 1, 0, 0, 0, 0),
    vec(1, 1, 1, 1, 1, 1),
  ]

  it('returns the nearest glyph index by squared distance', () => {
    const lookup = createLookup(vectors)
    expect(lookup.nearestIndex(vec(0.05, 0, 0.05, 0, 0, 0))).toBe(0)
    expect(lookup.nearestIndex(vec(0.9, 0.95, 0.1, 0, 0.05, 0))).toBe(1)
    expect(lookup.nearestIndex(vec(0.9, 0.9, 0.9, 0.95, 1, 0.85))).toBe(2)
  })

  it('lazily fills the cache: miss computes and stores, hit skips the scan', () => {
    const lookup = createLookup(vectors)
    expect(lookup.size()).toBe(0)

    const q = vec(0.05, 0, 0, 0, 0, 0)
    lookup.nearestIndex(q)
    expect(lookup.size()).toBe(1)

    // Same bucket — cache hit, no new entry
    lookup.nearestIndex(q)
    expect(lookup.size()).toBe(1)

    // Different bucket — new entry
    lookup.nearestIndex(vec(1, 1, 1, 1, 1, 1))
    expect(lookup.size()).toBe(2)
  })

  it('cached results match fresh brute-force results', () => {
    const lookup = createLookup(vectors)
    const q = vec(0.9, 1, 0, 0.1, 0, 0)
    const first = lookup.nearestIndex(q)
    const second = lookup.nearestIndex(q)
    expect(second).toBe(first)
  })

  it('reset() clears the cache (used on glyph model rebuild)', () => {
    const lookup = createLookup(vectors)
    lookup.nearestIndex(vec(0, 0, 0, 0, 0, 0))
    lookup.nearestIndex(vec(1, 1, 1, 1, 1, 1))
    expect(lookup.size()).toBe(2)

    lookup.reset()
    expect(lookup.size()).toBe(0)

    // Still functional after reset
    expect(lookup.nearestIndex(vec(0, 0, 0, 0, 0, 0))).toBe(0)
    expect(lookup.size()).toBe(1)
  })
})
