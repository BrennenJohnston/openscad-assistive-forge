/**
 * STL statistics and comparison for the desktop-parity harness.
 *
 * Pure Node, zero dependencies. Parses binary and ASCII STL, computes
 * print-relevant geometry statistics, and compares two stat sets under
 * named tolerance profiles.
 *
 * Design notes:
 * - Volume/bbox are what affect a physical print; facet counts legitimately
 *   differ across Manifold versions, so profiles treat them as soft unless
 *   comparing against our own golden manifest.
 * - canonicalHash is emission-order independent: identical triangle sets
 *   hash identically no matter what order the engine wrote them in.
 *
 * @license GPL-3.0-or-later
 */

import { createHash } from 'node:crypto';

const BINARY_HEADER_BYTES = 80;
const BINARY_RECORD_BYTES = 50;

/**
 * Tolerance profiles for compareStats().
 *
 * matched:       same engine version on both sides (desktop 2026.04.03 vs
 *                WASM 2026.04.03). FDM printing resolves ~0.05 mm; braille
 *                dots are ~1.5 mm diameter, so 0.01 mm bbox tolerance
 *                guards tactile geometry with wide margin.
 * cross-version: different engine versions; tessellation may differ.
 * golden:        WASM output vs our own committed golden manifest — must
 *                be effectively identical, including the canonical hash.
 *
 * facetRelDiff: null = report-only (never fails the comparison).
 */
export const TOLERANCE_PROFILES = {
  matched: {
    volumeRelDiff: 0.001,
    bboxMaxAxisDiff: 0.01,
    facetRelDiff: null,
    facetWarnAbove: 0.01,
    hashRequired: false,
  },
  'cross-version': {
    volumeRelDiff: 0.005,
    bboxMaxAxisDiff: 0.05,
    facetRelDiff: null,
    facetWarnAbove: null,
    hashRequired: false,
  },
  golden: {
    volumeRelDiff: 0.0001,
    bboxMaxAxisDiff: 0.001,
    facetRelDiff: 0,
    facetWarnAbove: null,
    hashRequired: true,
  },
};

function toUint8(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  throw new TypeError('parseSTL expects an ArrayBuffer, TypedArray, or Buffer');
}

/**
 * Parse an STL file (binary or ASCII, auto-detected).
 *
 * Binary detection uses the length equation (84 + count*50 === byteLength),
 * which is reliable even for binary files whose 80-byte header happens to
 * start with "solid".
 *
 * @param {ArrayBuffer|Uint8Array|Buffer} data
 * @returns {{ triangles: Float64Array, count: number, format: 'binary'|'ascii' }}
 *   triangles is a flat array of 9 doubles per triangle (v0 v1 v2, xyz each).
 */
export function parseSTL(data) {
  const bytes = toUint8(data);

  if (bytes.byteLength >= BINARY_HEADER_BYTES + 4) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getUint32(BINARY_HEADER_BYTES, true);
    if (
      BINARY_HEADER_BYTES + 4 + count * BINARY_RECORD_BYTES ===
      bytes.byteLength
    ) {
      return parseBinary(view, count);
    }
  }

  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (/^\s*solid\b/.test(text)) {
    return parseAscii(text);
  }

  throw new Error(
    `Not a valid STL: length equation failed (${bytes.byteLength} bytes) and no ASCII "solid" header`
  );
}

function parseBinary(view, count) {
  const triangles = new Float64Array(count * 9);
  let offset = BINARY_HEADER_BYTES + 4;
  for (let t = 0; t < count; t++) {
    offset += 12; // skip the normal vector; recomputable from vertices
    for (let c = 0; c < 9; c++) {
      triangles[t * 9 + c] = view.getFloat32(offset, true);
      offset += 4;
    }
    offset += 2; // attribute byte count
  }
  return { triangles, count, format: 'binary' };
}

function parseAscii(text) {
  const coords = [];
  const vertexRe =
    /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  let m;
  while ((m = vertexRe.exec(text)) !== null) {
    coords.push(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  if (coords.length === 0 || coords.length % 9 !== 0) {
    throw new Error(
      `ASCII STL vertex count not a multiple of 3 (got ${coords.length / 3} vertices)`
    );
  }
  return {
    triangles: Float64Array.from(coords),
    count: coords.length / 9,
    format: 'ascii',
  };
}

/**
 * Compute print-relevant statistics for a parsed mesh.
 *
 * @param {{ triangles: Float64Array, count: number }} mesh
 * @returns {{
 *   facets: number,
 *   volume: number,
 *   surfaceArea: number,
 *   bbox: { min: number[], max: number[] },
 *   dims: number[],
 *   canonicalHash: string,
 * }} volumes/areas/lengths in mm³/mm²/mm
 */
export function computeStats(mesh) {
  const { triangles, count } = mesh;

  let volumeSum = 0;
  let areaSum = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let t = 0; t < count; t++) {
    const b = t * 9;
    const ax = triangles[b], ay = triangles[b + 1], az = triangles[b + 2];
    const bx = triangles[b + 3], by = triangles[b + 4], bz = triangles[b + 5];
    const cx = triangles[b + 6], cy = triangles[b + 7], cz = triangles[b + 8];

    // Signed tetrahedron volume: dot(a, cross(b, c)) / 6
    volumeSum +=
      (ax * (by * cz - bz * cy) +
        ay * (bz * cx - bx * cz) +
        az * (bx * cy - by * cx)) /
      6;

    // Triangle area: |cross(b - a, c - a)| / 2
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    areaSum += Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;

    for (let v = 0; v < 3; v++) {
      for (let c = 0; c < 3; c++) {
        const val = triangles[b + v * 3 + c];
        if (val < min[c]) min[c] = val;
        if (val > max[c]) max[c] = val;
      }
    }
  }

  return {
    facets: count,
    volume: Math.abs(volumeSum),
    surfaceArea: areaSum,
    bbox: { min, max },
    dims: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    canonicalHash: canonicalHash(mesh),
  };
}

/**
 * Emission-order-independent SHA-256 of the triangle set.
 *
 * Each vertex is rounded to 1e-6 mm; each triangle is rotated (winding
 * preserved — rotations only, never permutations) so its lexicographically
 * smallest vertex comes first; the triangle strings are sorted and hashed.
 *
 * @param {{ triangles: Float64Array, count: number }} mesh
 * @returns {string} hex SHA-256
 */
export function canonicalHash(mesh) {
  const { triangles, count } = mesh;
  const keys = new Array(count);

  for (let t = 0; t < count; t++) {
    const b = t * 9;
    const verts = [
      `${triangles[b].toFixed(6)},${triangles[b + 1].toFixed(6)},${triangles[b + 2].toFixed(6)}`,
      `${triangles[b + 3].toFixed(6)},${triangles[b + 4].toFixed(6)},${triangles[b + 5].toFixed(6)}`,
      `${triangles[b + 6].toFixed(6)},${triangles[b + 7].toFixed(6)},${triangles[b + 8].toFixed(6)}`,
    ];
    let start = 0;
    if (verts[1] < verts[start]) start = 1;
    if (verts[2] < verts[start]) start = 2;
    keys[t] = `${verts[start]}|${verts[(start + 1) % 3]}|${verts[(start + 2) % 3]}`;
  }

  keys.sort();
  return createHash('sha256').update(keys.join('\n')).digest('hex');
}

/**
 * Compare two stat sets under a tolerance profile.
 *
 * @param {ReturnType<typeof computeStats>} a - candidate (e.g. WASM output)
 * @param {ReturnType<typeof computeStats>} b - reference (e.g. desktop/golden)
 * @param {keyof typeof TOLERANCE_PROFILES|object} profile
 * @returns {{ pass: boolean, metrics: object, failures: string[], warnings: string[] }}
 */
export function compareStats(a, b, profile = 'cross-version') {
  const p =
    typeof profile === 'string' ? TOLERANCE_PROFILES[profile] : profile;
  if (!p) {
    throw new Error(
      `Unknown tolerance profile "${profile}" (valid: ${Object.keys(TOLERANCE_PROFILES).join(', ')})`
    );
  }

  const volumeRelDiff =
    Math.abs(a.volume - b.volume) / Math.max(Math.abs(b.volume), 1e-9);

  let bboxMaxAxisDiff = 0;
  for (let c = 0; c < 3; c++) {
    bboxMaxAxisDiff = Math.max(
      bboxMaxAxisDiff,
      Math.abs(a.bbox.min[c] - b.bbox.min[c]),
      Math.abs(a.bbox.max[c] - b.bbox.max[c])
    );
  }

  const facetRelDiff = Math.abs(a.facets - b.facets) / Math.max(b.facets, 1);
  const hashEqual = a.canonicalHash === b.canonicalHash;

  const failures = [];
  const warnings = [];

  if (volumeRelDiff > p.volumeRelDiff) {
    failures.push(
      `volume differs ${(volumeRelDiff * 100).toFixed(4)}% (limit ${(p.volumeRelDiff * 100).toFixed(2)}%): ${a.volume.toFixed(3)} vs ${b.volume.toFixed(3)} mm³`
    );
  }
  if (bboxMaxAxisDiff > p.bboxMaxAxisDiff) {
    failures.push(
      `bbox differs ${bboxMaxAxisDiff.toFixed(4)} mm (limit ${p.bboxMaxAxisDiff} mm)`
    );
  }
  if (p.facetRelDiff !== null && facetRelDiff > p.facetRelDiff) {
    failures.push(
      `facet count differs ${(facetRelDiff * 100).toFixed(2)}%: ${a.facets} vs ${b.facets}`
    );
  } else if (p.facetWarnAbove !== null && facetRelDiff > p.facetWarnAbove) {
    warnings.push(
      `facet count differs ${(facetRelDiff * 100).toFixed(2)}% (report-only): ${a.facets} vs ${b.facets}`
    );
  }
  if (p.hashRequired && !hashEqual) {
    failures.push('canonical hash mismatch');
  }

  return {
    pass: failures.length === 0,
    metrics: { volumeRelDiff, bboxMaxAxisDiff, facetRelDiff, hashEqual },
    failures,
    warnings,
  };
}
