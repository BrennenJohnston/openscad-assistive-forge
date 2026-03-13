// Character shape-vector lookup table (LUT) module
//
// Precomputed flat Uint8Array mapping every quantized 6D shape vector to the
// index of the nearest-matching character. Replaces the brute-force + Map
// cache in _hfm.js with an O(1) array lookup.
//
// Key calculation matches _quantKey6() in _hfm.js exactly (base-RANGE encoding).

const RANGE = 11; // quantization buckets per dimension — must match _CACHE_RANGE in _hfm.js
const LUT_SIZE = RANGE ** 6; // 11^6 = 1,771,561 entries (~1.77 MB)

/**
 * Compute the flat LUT index for a quantized 6D shape vector.
 * Must produce the same integer as the legacy _quantKey6() in _hfm.js.
 *
 * @param {number} v0
 * @param {number} v1
 * @param {number} v2
 * @param {number} v3
 * @param {number} v4
 * @param {number} v5
 * @returns {number} integer in [0, LUT_SIZE)
 */
export function lutKey(v0, v1, v2, v3, v4, v5) {
  const r = RANGE;
  const q0 = Math.min(r - 1, Math.max(0, (v0 * r) | 0));
  const q1 = Math.min(r - 1, Math.max(0, (v1 * r) | 0));
  const q2 = Math.min(r - 1, Math.max(0, (v2 * r) | 0));
  const q3 = Math.min(r - 1, Math.max(0, (v3 * r) | 0));
  const q4 = Math.min(r - 1, Math.max(0, (v4 * r) | 0));
  const q5 = Math.min(r - 1, Math.max(0, (v5 * r) | 0));
  return (((((q0 * r + q1) * r + q2) * r + q3) * r + q4) * r + q5) | 0;
}

/**
 * Find the index of the character in charModel.vectors whose shape vector is
 * nearest to v in Euclidean distance.
 *
 * @param {Float32Array} v - 6-element shape vector
 * @param {Object} charModel - { chars: string[], vectors: Float32Array[] }
 * @returns {number} index into charModel.chars
 */
function _findNearestIndex(v, charModel) {
  const { vectors } = charModel;
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
  return best;
}

/**
 * Build a precomputed flat Uint8Array LUT for character lookup.
 *
 * Synchronous — runs approximately 250 ms on desktop.
 * Use buildLUTAsync() for non-blocking initialization.
 *
 * @param {Object} charModel - { chars: string[], vectors: Float32Array[] }
 * @returns {Uint8Array} lut where lut[key] = index into charModel.chars
 */
export function buildLUT(charModel) {
  const lut = new Uint8Array(LUT_SIZE);
  const v = new Float32Array(6);
  const r = RANGE;
  const r1 = r - 1;

  for (let key = 0; key < LUT_SIZE; key++) {
    let k = key;
    for (let d = 5; d >= 0; d--) {
      v[d] = (k % r) / r1;
      k = (k / r) | 0;
    }
    lut[key] = _findNearestIndex(v, charModel);
  }
  return lut;
}

/**
 * Build the LUT asynchronously, yielding to the event loop between chunks so
 * the UI stays responsive. Uses requestIdleCallback when available, falling
 * back to setTimeout(,0).
 *
 * @param {Object} charModel - { chars: string[], vectors: Float32Array[] }
 * @param {Function} [onProgress] - optional callback(fraction: 0..1) during build
 * @returns {Promise<Uint8Array>}
 */
export function buildLUTAsync(charModel, onProgress) {
  return new Promise((resolve) => {
    const lut = new Uint8Array(LUT_SIZE);
    const v = new Float32Array(6);
    const r = RANGE;
    const r1 = r - 1;

    // ~200 K entries per chunk ≈ 25–50 ms per idle slice; 9 total yields
    const CHUNK = 200_000;
    let cursor = 0;

    function processChunk() {
      const end = Math.min(LUT_SIZE, cursor + CHUNK);
      for (; cursor < end; cursor++) {
        let k = cursor;
        for (let d = 5; d >= 0; d--) {
          v[d] = (k % r) / r1;
          k = (k / r) | 0;
        }
        lut[cursor] = _findNearestIndex(v, charModel);
      }

      if (onProgress) onProgress(cursor / LUT_SIZE);

      if (cursor < LUT_SIZE) {
        schedule();
      } else {
        resolve(lut);
      }
    }

    function schedule() {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(processChunk, { timeout: 500 });
      } else {
        setTimeout(processChunk, 0);
      }
    }

    schedule();
  });
}

/**
 * Look up the best-matching character for a 6D shape vector using the
 * precomputed LUT.
 *
 * @param {Uint8Array} lut - built by buildLUT() or buildLUTAsync()
 * @param {Float32Array|number[]} v - 6-element shape vector
 * @param {string[]} chars - character array from charModel.chars
 * @returns {string} single character
 */
export function lookupChar(lut, v, chars) {
  const key = lutKey(v[0], v[1], v[2], v[3], v[4], v[5]);
  return chars[lut[key]];
}
