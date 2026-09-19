/**
 * @license GPL-3.0-or-later
 */
// Lazy glyph-lookup cache for the alternate ASCII view.
//
// Maps quantized 6D shape vectors to glyph indices. Following the technique
// described in the shape-vector ASCII research this project credits (see
// CREDITS.md / THIRD_PARTY_NOTICES.md), the cache is populated lazily: on a
// miss we brute-force scan all glyph vectors (95-way squared distance) and
// memoize the winner. Real frames only ever touch a small fraction of the
// 11^6 key space, so this stays tiny compared to a precomputed table.

/** Quantization buckets per dimension. 11^6 possible keys. */
export const QUANT_RANGE = 11;

/**
 * Pack a 6D shape vector (components in [0, 1]) into a single integer key
 * in base QUANT_RANGE.
 *
 * @param {Float32Array|number[]} v - 6-element shape vector
 * @returns {number} integer key in [0, QUANT_RANGE^6)
 */
export function quantKey6(v) {
  const r = QUANT_RANGE;
  const q0 = Math.min(r - 1, Math.max(0, (v[0] * r) | 0));
  const q1 = Math.min(r - 1, Math.max(0, (v[1] * r) | 0));
  const q2 = Math.min(r - 1, Math.max(0, (v[2] * r) | 0));
  const q3 = Math.min(r - 1, Math.max(0, (v[3] * r) | 0));
  const q4 = Math.min(r - 1, Math.max(0, (v[4] * r) | 0));
  const q5 = Math.min(r - 1, Math.max(0, (v[5] * r) | 0));
  return (((((q0 * r + q1) * r + q2) * r + q3) * r + q4) * r + q5) | 0;
}

/**
 * Create a lazy lookup over a set of glyph shape vectors.
 *
 * @param {Float32Array[]} vectors - one 6-element vector per glyph
 * @returns {{
 *   nearestIndex: (v: Float32Array|number[]) => number,
 *   reset: () => void,
 *   size: () => number
 * }} lookup API; nearestIndex returns the index of the closest glyph
 */
export function createLookup(vectors) {
  const cache = new Map();

  function nearestIndex(v) {
    const key = quantKey6(v);
    const hit = cache.get(key);
    if (hit !== undefined) return hit;

    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < vectors.length; i++) {
      const cv = vectors[i];
      const d0 = v[0] - cv[0];
      const d1 = v[1] - cv[1];
      const d2 = v[2] - cv[2];
      const d3 = v[3] - cv[3];
      const d4 = v[4] - cv[4];
      const d5 = v[5] - cv[5];
      const d = d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3 + d4 * d4 + d5 * d5;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }

    cache.set(key, best);
    return best;
  }

  return {
    nearestIndex,
    reset() {
      cache.clear();
    },
    size() {
      return cache.size;
    },
  };
}
