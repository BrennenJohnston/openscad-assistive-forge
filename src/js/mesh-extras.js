/**
 * The two pieces of geometry work the charm preview does after a mesh loads,
 * as pure functions of typed arrays, so they can run in a worker (DP-52 P4,
 * D-143).
 *
 * MEASURED on the built app with the logo's Line art design (211,700
 * triangles): the cavity-tint classification and three.js' EdgesGeometry ran
 * on the main thread in ONE task after the mesh loaded - 1.3 s at 1x and
 * 6.4 s at 4x CPU - and the page answered nothing for that long. Neither
 * touches the DOM, three.js objects or the GPU: they read positions and
 * normals and produce a per-vertex flag and a list of segments. That is work
 * for a worker, and the main thread applies the answers when they arrive.
 *
 * The classifier is `PreviewManager._classifyInnerFaces` moved here without a
 * change to its arithmetic; the edge builder is three.js' EdgesGeometry
 * algorithm (edges hashed on positions rounded to four decimals, kept when
 * the faces either side meet at more than the threshold angle or the edge has
 * one face) with the display options' longest-segments budget clip, so a
 * worker does not need three.js at all.
 *
 * @license GPL-3.0-or-later
 */

/**
 * Which faces are inner (a cavity or a cut-out), as a per-vertex float
 * attribute: 1.0 inner, 0.0 outer.
 *
 * Pass 1: dot(faceNormal, faceCentroid) < 0 on centered geometry (baseline).
 * Pass 2: edge adjacency via hashed vertex positions (4 decimal places).
 * Pass 3: concave-edge correction, then a majority vote per smooth component.
 *
 * @param {Float32Array|number[]} pos - Positions, 9 numbers per triangle
 * @param {Float32Array|number[]} norm - Vertex normals, 9 per triangle
 * @returns {Float32Array} One flag per vertex (3 per triangle)
 */
export function classifyInnerFaces(pos, norm) {
  const vertCount = Math.floor(pos.length / 3);
  const faceCount = Math.floor(vertCount / 3);
  const faceIsInner = new Uint8Array(faceCount);
  const faceDot = new Float32Array(faceCount);
  const faceNx = new Float32Array(faceCount);
  const faceNy = new Float32Array(faceCount);
  const faceNz = new Float32Array(faceCount);

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    if (pos[i] < minX) minX = pos[i];
    if (pos[i] > maxX) maxX = pos[i];
    if (pos[i + 1] < minY) minY = pos[i + 1];
    if (pos[i + 1] > maxY) maxY = pos[i + 1];
    if (pos[i + 2] < minZ) minZ = pos[i + 2];
    if (pos[i + 2] > maxZ) maxZ = pos[i + 2];
  }
  const mcx = (minX + maxX) / 2;
  const mcy = (minY + maxY) / 2;
  const mcz = (minZ + maxZ) / 2;

  for (let f = 0; f < faceCount; f++) {
    const b = f * 9;
    const cx = (pos[b] + pos[b + 3] + pos[b + 6]) / 3;
    const cy = (pos[b + 1] + pos[b + 4] + pos[b + 7]) / 3;
    const cz = (pos[b + 2] + pos[b + 5] + pos[b + 8]) / 3;
    const nx = norm[b];
    const ny = norm[b + 1];
    const nz = norm[b + 2];

    faceNx[f] = nx;
    faceNy[f] = ny;
    faceNz[f] = nz;

    const rcx = cx - mcx,
      rcy = cy - mcy,
      rcz = cz - mcz;
    const cLen = Math.sqrt(rcx * rcx + rcy * rcy + rcz * rcz) || 1;
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    faceDot[f] =
      (nx / nLen) * (rcx / cLen) +
      (ny / nLen) * (rcy / cLen) +
      (nz / nLen) * (rcz / cLen);
  }

  const edgeMap = new Map();
  const r = (v) => v.toFixed(4);

  for (let f = 0; f < faceCount; f++) {
    const b = f * 9;
    const v0 = `${r(pos[b])},${r(pos[b + 1])},${r(pos[b + 2])}`;
    const v1 = `${r(pos[b + 3])},${r(pos[b + 4])},${r(pos[b + 5])}`;
    const v2 = `${r(pos[b + 6])},${r(pos[b + 7])},${r(pos[b + 8])}`;

    const edges = [
      v0 < v1 ? `${v0}|${v1}` : `${v1}|${v0}`,
      v1 < v2 ? `${v1}|${v2}` : `${v2}|${v1}`,
      v2 < v0 ? `${v2}|${v0}` : `${v0}|${v2}`,
    ];

    for (const key of edges) {
      const list = edgeMap.get(key);
      if (list) list.push(f);
      else edgeMap.set(key, [f]);
    }
  }

  const smoothAdj = Array.from({ length: faceCount }, () => []);
  const concaveAdj = Array.from({ length: faceCount }, () => []);

  for (const faces of edgeMap.values()) {
    if (faces.length !== 2) continue;
    const [a, b] = faces;

    const l1 =
      Math.sqrt(
        faceNx[a] * faceNx[a] + faceNy[a] * faceNy[a] + faceNz[a] * faceNz[a]
      ) || 1;
    const l2 =
      Math.sqrt(
        faceNx[b] * faceNx[b] + faceNy[b] * faceNy[b] + faceNz[b] * faceNz[b]
      ) || 1;
    const nDot =
      (faceNx[a] / l1) * (faceNx[b] / l2) +
      (faceNy[a] / l1) * (faceNy[b] / l2) +
      (faceNz[a] / l1) * (faceNz[b] / l2);

    if (nDot > 0.999) {
      smoothAdj[a].push(b);
      smoothAdj[b].push(a);
    }

    if (nDot < -0.5) {
      concaveAdj[a].push(b);
      concaveAdj[b].push(a);
    }
  }

  for (let f = 0; f < faceCount; f++) {
    faceIsInner[f] = faceDot[f] < 0 ? 1 : 0;
  }

  let promotionCount = 0;
  const bfsQueue = [];
  for (let f = 0; f < faceCount; f++) {
    if (faceIsInner[f]) bfsQueue.push(f);
  }

  while (bfsQueue.length) {
    const src = bfsQueue.pop();
    for (let i = 0; i < concaveAdj[src].length; i++) {
      const tgt = concaveAdj[src][i];
      if (faceIsInner[tgt] || faceDot[tgt] >= 0.85) continue;
      faceIsInner[tgt] = 1;
      promotionCount++;
      bfsQueue.push(tgt);
    }
  }

  if (faceCount && promotionCount / faceCount > 0.15) {
    // Too much promotion is a mesh the rule does not fit; the baseline stands.
    promotionCount = 0;
    for (let f = 0; f < faceCount; f++) {
      faceIsInner[f] = faceDot[f] < 0 ? 1 : 0;
    }
  }

  const componentId = new Int32Array(faceCount).fill(-1);
  let numComponents = 0;
  for (let f = 0; f < faceCount; f++) {
    if (componentId[f] >= 0) continue;
    const cid = numComponents++;
    const queue = [f];
    componentId[f] = cid;
    while (queue.length) {
      const cur = queue.pop();
      for (const neighbor of smoothAdj[cur]) {
        if (componentId[neighbor] >= 0) continue;
        componentId[neighbor] = cid;
        queue.push(neighbor);
      }
    }
  }

  const compInnerCount = new Uint32Array(numComponents);
  const compFaceCount = new Uint32Array(numComponents);
  for (let f = 0; f < faceCount; f++) {
    compFaceCount[componentId[f]]++;
    if (faceIsInner[f]) compInnerCount[componentId[f]]++;
  }

  for (let f = 0; f < faceCount; f++) {
    const cid = componentId[f];
    const majorityInner = compInnerCount[cid] * 2 > compFaceCount[cid];
    faceIsInner[f] = majorityInner ? 1 : 0;
  }

  const isInner = new Float32Array(vertCount);
  for (let f = 0; f < faceCount; f++) {
    const val = faceIsInner[f];
    isInner[f * 3] = val;
    isInner[f * 3 + 1] = val;
    isInner[f * 3 + 2] = val;
  }
  return isInner;
}

/**
 * The edges worth drawing: every edge with one face, and every edge whose two
 * faces meet at more than `thresholdDeg`. Three.js' EdgesGeometry, without
 * three.js. Face normals are computed from the positions, as it does.
 *
 * @param {Float32Array|number[]} pos - Positions, 9 numbers per triangle
 * @param {number} [thresholdDeg=15]
 * @returns {Float32Array} Segments, 6 numbers each (two endpoints)
 */
export function buildEdgeSegments(pos, thresholdDeg = 15) {
  const faceCount = Math.floor(pos.length / 9);
  const thresholdDot = Math.cos((thresholdDeg * Math.PI) / 180);
  const precision = Math.pow(10, 4);
  const key = (x, y, z) =>
    `${Math.round(x * precision)},${Math.round(y * precision)},${Math.round(z * precision)}`;

  const faceNormal = new Float32Array(faceCount * 3);
  for (let f = 0; f < faceCount; f++) {
    const b = f * 9;
    const ax = pos[b + 3] - pos[b],
      ay = pos[b + 4] - pos[b + 1],
      az = pos[b + 5] - pos[b + 2];
    const bx = pos[b + 6] - pos[b],
      by = pos[b + 7] - pos[b + 1],
      bz = pos[b + 8] - pos[b + 2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    faceNormal[f * 3] = nx / len;
    faceNormal[f * 3 + 1] = ny / len;
    faceNormal[f * 3 + 2] = nz / len;
  }

  // Each edge: the first face that had it, and its endpoints' offsets; when a
  // second face brings the same edge, the two normals decide and the edge is
  // settled. An edge seen once keeps its single face.
  const edges = new Map();
  const out = [];
  for (let f = 0; f < faceCount; f++) {
    const b = f * 9;
    const keys = [
      key(pos[b], pos[b + 1], pos[b + 2]),
      key(pos[b + 3], pos[b + 4], pos[b + 5]),
      key(pos[b + 6], pos[b + 7], pos[b + 8]),
    ];
    for (let j = 0; j < 3; j++) {
      const k1 = keys[j];
      const k2 = keys[(j + 1) % 3];
      const hash = k1 < k2 ? `${k1}_${k2}` : `${k2}_${k1}`;
      const seen = edges.get(hash);
      const o1 = b + j * 3;
      const o2 = b + ((j + 1) % 3) * 3;
      if (seen === undefined) {
        edges.set(hash, { f, o1, o2 });
        continue;
      }
      if (seen === null) continue;
      const dot =
        faceNormal[f * 3] * faceNormal[seen.f * 3] +
        faceNormal[f * 3 + 1] * faceNormal[seen.f * 3 + 1] +
        faceNormal[f * 3 + 2] * faceNormal[seen.f * 3 + 2];
      if (dot <= thresholdDot) {
        out.push(pos[seen.o1], pos[seen.o1 + 1], pos[seen.o1 + 2]);
        out.push(pos[seen.o2], pos[seen.o2 + 1], pos[seen.o2 + 2]);
      }
      edges.set(hash, null);
    }
  }
  for (const seen of edges.values()) {
    if (!seen) continue;
    out.push(pos[seen.o1], pos[seen.o1 + 1], pos[seen.o1 + 2]);
    out.push(pos[seen.o2], pos[seen.o2 + 1], pos[seen.o2 + 2]);
  }
  return Float32Array.from(out);
}

/**
 * Keep the longest `budget` segments of a set (the display options' rule:
 * silhouettes and structural lines survive; short tessellation facets on
 * cylinders and fillets are dropped).
 *
 * @param {Float32Array} segments - 6 numbers each
 * @param {number} budget - How many to keep; 0 or less keeps all
 * @returns {{segments: Float32Array, total: number, shown: number}}
 */
export function clipEdgeSegments(segments, budget) {
  const total = Math.floor(segments.length / 6);
  if (!total || !(budget > 0) || total <= budget) {
    return { segments, total, shown: total };
  }
  const lengthsSq = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const a = i * 6;
    const dx = segments[a + 3] - segments[a];
    const dy = segments[a + 4] - segments[a + 1];
    const dz = segments[a + 5] - segments[a + 2];
    lengthsSq[i] = dx * dx + dy * dy + dz * dz;
  }
  const cutoff = lengthsSq.slice().sort()[total - budget];
  const kept = new Float32Array(budget * 6);
  let shown = 0;
  for (let i = 0; i < total && shown < budget; i++) {
    if (lengthsSq[i] < cutoff) continue;
    const a = i * 6;
    const o = shown * 6;
    for (let k = 0; k < 6; k++) kept[o + k] = segments[a + k];
    shown++;
  }
  return { segments: kept.subarray(0, shown * 6), total, shown };
}

/**
 * Both answers for one mesh. What the worker runs, and what the main thread
 * runs itself for a mesh small enough not to be worth the trip.
 *
 * @param {{positions: Float32Array, normals: Float32Array, wantInner?: boolean, wantEdges?: boolean, thresholdDeg?: number, edgeBudget?: number}} request
 * @returns {{isInner: Float32Array|null, edges: Float32Array|null, edgeTotal: number, edgeShown: number}}
 */
export function computeMeshExtras({
  positions,
  normals,
  wantInner = true,
  wantEdges = true,
  thresholdDeg = 15,
  edgeBudget = 0,
}) {
  const isInner =
    wantInner && normals ? classifyInnerFaces(positions, normals) : null;
  let edges = null;
  let edgeTotal = 0;
  let edgeShown = 0;
  if (wantEdges) {
    const clipped = clipEdgeSegments(
      buildEdgeSegments(positions, thresholdDeg),
      edgeBudget
    );
    edges = clipped.segments;
    edgeTotal = clipped.total;
    edgeShown = clipped.shown;
  }
  return { isInner, edges, edgeTotal, edgeShown };
}

/**
 * How many faces an OFF text declares, read from its header alone: the
 * first two non-comment lines, without splitting the whole text. A large
 * text is what this is for, and splitting it is itself a cost.
 *
 * @param {string} text
 * @returns {number} The face count, or 0 when the header cannot be read
 */
export function offFaceCount(text) {
  let pos = 0;
  const lines = [];
  while (lines.length < 2 && pos < text.length) {
    let end = text.indexOf('\n', pos);
    if (end === -1) end = text.length;
    const line = text.slice(pos, end).trim();
    pos = end + 1;
    if (line.length === 0 || line.startsWith('#')) continue;
    lines.push(line);
  }
  if (lines.length === 0) return 0;
  const headerParts = lines[0].split(/\s+/);
  const counts =
    headerParts.length >= 3 && !isNaN(Number(headerParts[1]))
      ? headerParts.slice(1)
      : (lines[1] || '').split(/\s+/);
  const faces = Number(counts[1]);
  return Number.isFinite(faces) && faces > 0 ? faces : 0;
}

/**
 * Parse an OFF or COFF text into a triangle soup, as the preview always did
 * (moved out of `PreviewManager.loadOFF` unchanged in what it accepts and
 * produces, so the same parser runs in the worker for a big file).
 *
 * OpenSCAD's export_off.cc writes colors inline after each face's vertex
 * indices under an "OFF" header, as integers 0-255; COFF files from other
 * tools use floats 0-1; both are taken. Uniform inline colors carry no
 * information (a colorless model rendered with render-colors on, or one
 * wrapped in a single color()), and are dropped so the cavity tint can do
 * its job instead.
 *
 * @param {string} text
 * @returns {{positions: Float32Array, colors: Float32Array|null, hasColors: boolean, numVerts: number, numFaces: number, isCOFF: boolean}}
 */
export function parseOFF(text) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  if (lines.length === 0) {
    throw new Error('OFF data is empty');
  }

  const firstLine = lines[0].toUpperCase();
  const isCOFF = firstLine.startsWith('COFF');
  const isOFF = firstLine.startsWith('OFF');
  if (!isOFF && !isCOFF) {
    throw new Error(`Not a valid OFF file (header: "${lines[0]}")`);
  }

  // OFF/COFF format allows counts on the header line ("OFF 100 200 0") or on
  // a separate second line.
  const headerParts = lines[0].split(/\s+/);
  let countLineIdx;
  if (headerParts.length >= 3 && !isNaN(Number(headerParts[1]))) {
    countLineIdx = 0;
  } else {
    countLineIdx = 1;
  }
  const countParts =
    countLineIdx === 0
      ? headerParts.slice(1)
      : lines[countLineIdx].split(/\s+/);
  const numVerts = Number(countParts[0]);
  const numFaces = Number(countParts[1]);
  const dataStartLine = countLineIdx + 1;

  const vertices = [];
  for (let i = 0; i < numVerts; i++) {
    const [x, y, z] = lines[dataStartLine + i].split(/\s+/).map(Number);
    vertices.push(x, y, z);
  }

  const positions = [];
  const rawColors = [];
  let hasColors = false;
  let rawColorMax = 0;

  const faceStart = dataStartLine + numVerts;
  for (let i = 0; i < numFaces; i++) {
    const parts = lines[faceStart + i].split(/\s+/).map(Number);
    const n = parts[0];
    if (n < 3) continue;

    // RGB only: per-face alpha (parts[n+4]) is not read; transparency is
    // the debug highlight overlay's business.
    const hasInlineColor = parts.length >= n + 4;

    const v0 = parts[1];
    for (let t = 1; t < n - 1; t++) {
      const va = parts[1 + t];
      const vb = parts[1 + t + 1];
      positions.push(
        vertices[v0 * 3],
        vertices[v0 * 3 + 1],
        vertices[v0 * 3 + 2],
        vertices[va * 3],
        vertices[va * 3 + 1],
        vertices[va * 3 + 2],
        vertices[vb * 3],
        vertices[vb * 3 + 1],
        vertices[vb * 3 + 2]
      );
      if (hasInlineColor) {
        const rawR = parts[n + 1];
        const rawG = parts[n + 2];
        const rawB = parts[n + 3];
        rawColorMax = Math.max(rawColorMax, rawR, rawG, rawB);
        rawColors.push(rawR, rawG, rawB, rawR, rawG, rawB, rawR, rawG, rawB);
        hasColors = true;
      }
    }
  }

  if (hasColors && rawColors.length > 0) {
    const uniqueFaceColors = new Set();
    for (let i = 0; i < rawColors.length; i += 9) {
      uniqueFaceColors.add(
        `${rawColors[i]},${rawColors[i + 1]},${rawColors[i + 2]}`
      );
      if (uniqueFaceColors.size > 1) break;
    }
    if (uniqueFaceColors.size <= 1) {
      hasColors = false;
      rawColors.length = 0;
    }
  }

  let colors = null;
  if (hasColors && rawColors.length > 0) {
    // The global max across all inline colors, so a first face that happens
    // to be black does not decide the scale.
    const colorScale = rawColorMax > 1 ? 1 / 255 : 1;
    colors = new Float32Array(rawColors.length);
    for (let i = 0; i < rawColors.length; i++) {
      colors[i] = rawColors[i] * colorScale;
    }
  }

  return {
    positions: Float32Array.from(positions),
    colors,
    hasColors,
    numVerts,
    numFaces,
    isCOFF,
  };
}

/**
 * Flat normals for a triangle soup: three.js' `computeVertexNormals` on a
 * non-indexed geometry does exactly this (one normal per face, given to each
 * of its three vertices), and the same arithmetic here lets a worker hand the
 * page a mesh that needs no pass of its own.
 *
 * @param {Float32Array} pos - 9 numbers per triangle
 * @returns {Float32Array} 9 numbers per triangle
 */
export function computeFlatNormals(pos) {
  const out = new Float32Array(pos.length);
  for (let b = 0; b + 8 < pos.length; b += 9) {
    const ax = pos[b + 3] - pos[b],
      ay = pos[b + 4] - pos[b + 1],
      az = pos[b + 5] - pos[b + 2];
    const bx = pos[b + 6] - pos[b],
      by = pos[b + 7] - pos[b + 1],
      bz = pos[b + 8] - pos[b + 2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    }
    for (let k = 0; k < 9; k += 3) {
      out[b + k] = nx;
      out[b + k + 1] = ny;
      out[b + k + 2] = nz;
    }
  }
  return out;
}

/**
 * Move a triangle soup so its bounding box is centered on the origin, in
 * place, as three.js' `BufferGeometry.center()` does.
 *
 * @param {Float32Array} pos
 * @returns {{x: number, y: number, z: number, min: number[], max: number[]}} The offset that was applied, and the bounds after it
 */
export function centerPositions(pos) {
  if (pos.length < 3)
    return { x: 0, y: 0, z: 0, min: [0, 0, 0], max: [0, 0, 0] };
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    if (pos[i] < minX) minX = pos[i];
    if (pos[i] > maxX) maxX = pos[i];
    if (pos[i + 1] < minY) minY = pos[i + 1];
    if (pos[i + 1] > maxY) maxY = pos[i + 1];
    if (pos[i + 2] < minZ) minZ = pos[i + 2];
    if (pos[i + 2] > maxZ) maxZ = pos[i + 2];
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] -= cx;
    pos[i + 1] -= cy;
    pos[i + 2] -= cz;
  }
  return {
    x: -cx,
    y: -cy,
    z: -cz,
    min: [minX - cx, minY - cy, minZ - cz],
    max: [maxX - cx, maxY - cy, maxZ - cz],
  };
}

/**
 * Everything the page used to do on its own thread when an OFF arrived,
 * done once here for a worker: parse, center, flat normals, then the cavity
 * tint (unless the file brought colors of its own) and the edge segments.
 *
 * @param {string} text
 * @param {{wantEdges?: boolean, thresholdDeg?: number, edgeBudget?: number}} [options]
 * @returns {object} positions, normals, colors, hasColors, isInner, edges, edgeTotal, edgeShown, numVerts, numFaces
 */
export function prepareOFF(text, options = {}) {
  const parsed = parseOFF(text);
  const { positions, colors, hasColors, numVerts, numFaces } = parsed;
  if (positions.length === 0) {
    return {
      positions,
      normals: new Float32Array(0),
      colors,
      hasColors: false,
      bounds: null,
      isInner: null,
      edges: null,
      edgeTotal: 0,
      edgeShown: 0,
      numVerts,
      numFaces,
      isCOFF: parsed.isCOFF,
    };
  }
  const bounds = centerPositions(positions);
  const normals = computeFlatNormals(positions);
  const extras = computeMeshExtras({
    positions,
    normals,
    wantInner: !hasColors,
    wantEdges: options.wantEdges !== false,
    thresholdDeg: options.thresholdDeg,
    edgeBudget: options.edgeBudget,
  });
  return {
    positions,
    normals,
    colors,
    hasColors,
    bounds: { min: bounds.min, max: bounds.max },
    isInner: extras.isInner,
    edges: extras.edges,
    edgeTotal: extras.edgeTotal,
    edgeShown: extras.edgeShown,
    numVerts,
    numFaces,
    isCOFF: parsed.isCOFF,
  };
}
