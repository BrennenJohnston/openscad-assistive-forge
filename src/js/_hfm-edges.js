/**
 * @license GPL-3.0-or-later
 */
// The vector look's edge table: every edge of a mesh once, with the normals
// of the two faces that share it, and the lines chosen from it that the
// creases alone cannot give. The silhouette for one camera is the set of
// edges where one face turns to the eye and the other away: Elite (1984)
// drew an edge when one of its faces was visible, and Hertzmann's notes
// define a mesh's silhouette as exactly those edges, re-tested whenever the
// camera moves. The dim wireframe snaps each face's normal to the nearest
// of 32 directions spread over the sphere and draws an edge whose two faces
// snap to different ones: the few lines a low-polygon model of the era
// showed where a surface turns, with the mesh itself untouched. The creases
// come from display-options-controller.js as before; both sets here leave
// them out.

/** The directions a face's normal snaps to for the wireframe. */
export const WIREFRAME_DIRECTIONS = 32;

// Positions within a ten-thousandth of each other are one vertex, as the
// crease builder has it.
const PRECISION = 1e4;
// An edge's key packs its two vertex ids; this many ids fit.
const VERTEX_LIMIT = 4194304;

/**
 * @typedef {Object} EdgeTable
 * @property {number} count
 * @property {Float32Array} vertices - 3 numbers a vertex, merged by position
 * @property {Uint32Array} a - an edge's first vertex
 * @property {Uint32Array} b - its second
 * @property {Float32Array} n1 - the first face's unit normal, 3 an edge
 * @property {Float32Array} n2 - the second face's, 0 0 0 while unpaired
 * @property {Uint8Array} paired - 1 where two faces share the edge
 */

/**
 * Every edge once, with its faces' normals.
 * @param {ArrayLike<number>} positions - 3 numbers a vertex
 * @param {ArrayLike<number>|null} [index] - 3 vertex ids a triangle; without
 *   one the positions are a soup, 9 numbers a triangle
 * @returns {EdgeTable}
 */
export function buildEdgeTable(positions, index = null) {
  const triangles = Math.floor(
    (index ? index.length : positions.length / 3) / 3
  );
  const idByKey = new Map();
  const vertices = [];
  const idOf = (i) => {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const key = `${Math.round(x * PRECISION)},${Math.round(y * PRECISION)},${Math.round(z * PRECISION)}`;
    let id = idByKey.get(key);
    if (id === undefined) {
      id = vertices.length / 3;
      if (id >= VERTEX_LIMIT) {
        throw new Error('The edge table holds at most 4,194,304 vertices');
      }
      idByKey.set(key, id);
      vertices.push(x, y, z);
    }
    return id;
  };
  const edgeAt = new Map();
  const a = [];
  const b = [];
  const n1 = [];
  const n2 = [];
  const paired = [];
  const corner = [0, 0, 0];
  for (let t = 0; t < triangles; t++) {
    for (let k = 0; k < 3; k++) {
      corner[k] = index ? index[t * 3 + k] : t * 3 + k;
    }
    const [i0, i1, i2] = corner;
    const ax = positions[i1 * 3] - positions[i0 * 3];
    const ay = positions[i1 * 3 + 1] - positions[i0 * 3 + 1];
    const az = positions[i1 * 3 + 2] - positions[i0 * 3 + 2];
    const bx = positions[i2 * 3] - positions[i0 * 3];
    const by = positions[i2 * 3 + 1] - positions[i0 * 3 + 1];
    const bz = positions[i2 * 3 + 2] - positions[i0 * 3 + 2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (length === 0) continue;
    nx /= length;
    ny /= length;
    nz /= length;
    const v0 = idOf(i0);
    const v1 = idOf(i1);
    const v2 = idOf(i2);
    const ids = [v0, v1, v2];
    for (let k = 0; k < 3; k++) {
      const p = ids[k];
      const q = ids[(k + 1) % 3];
      if (p === q) continue;
      const lo = p < q ? p : q;
      const hi = p < q ? q : p;
      const key = lo * VERTEX_LIMIT + hi;
      let e = edgeAt.get(key);
      if (e === undefined) {
        e = a.length;
        edgeAt.set(key, e);
        a.push(lo);
        b.push(hi);
        n1.push(nx, ny, nz);
        n2.push(0, 0, 0);
        paired.push(0);
      } else if (!paired[e]) {
        n2[e * 3] = nx;
        n2[e * 3 + 1] = ny;
        n2[e * 3 + 2] = nz;
        paired[e] = 1;
      }
    }
  }
  return {
    count: a.length,
    vertices: Float32Array.from(vertices),
    a: Uint32Array.from(a),
    b: Uint32Array.from(b),
    n1: Float32Array.from(n1),
    n2: Float32Array.from(n2),
    paired: Uint8Array.from(paired),
  };
}

// k directions spread evenly over the sphere (a Fibonacci sphere).
function sphereDirections(k) {
  const out = new Float32Array(k * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < k; i++) {
    const y = 1 - (2 * (i + 0.5)) / k;
    const r = Math.sqrt(1 - y * y);
    const t = golden * i;
    out[i * 3] = Math.cos(t) * r;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = Math.sin(t) * r;
  }
  return out;
}

function nearestDirection(x, y, z, dirs) {
  let best = -1;
  let bestDot = -2;
  for (let i = 0; i < dirs.length; i += 3) {
    const dot = x * dirs[i] + y * dirs[i + 1] + z * dirs[i + 2];
    if (dot > bestDot) {
      bestDot = dot;
      best = i;
    }
  }
  return best;
}

function pushEdge(out, table, e) {
  const { vertices, a, b } = table;
  const p = a[e] * 3;
  const q = b[e] * 3;
  out.push(
    vertices[p],
    vertices[p + 1],
    vertices[p + 2],
    vertices[q],
    vertices[q + 1],
    vertices[q + 2]
  );
}

const facesDot = (table, e) =>
  table.n1[e * 3] * table.n2[e * 3] +
  table.n1[e * 3 + 1] * table.n2[e * 3 + 1] +
  table.n1[e * 3 + 2] * table.n2[e * 3 + 2];

/**
 * The dim wireframe: the edges, not creases, whose two faces snap to
 * different directions.
 * @param {EdgeTable} table
 * @param {{creaseDeg?: number, directions?: number}} [options] - the crease
 *   angle in degrees (those edges are drawn already) and how many
 *   directions the sphere is cut into
 * @returns {Float32Array} 6 numbers a segment
 */
export function wireframeSegments(
  table,
  { creaseDeg = 15, directions = WIREFRAME_DIRECTIONS } = {}
) {
  const dirs = sphereDirections(directions);
  const cosCrease = Math.cos((creaseDeg * Math.PI) / 180);
  const { n1, n2, paired } = table;
  const out = [];
  for (let e = 0; e < table.count; e++) {
    if (!paired[e] || facesDot(table, e) <= cosCrease) continue;
    const i = e * 3;
    if (
      nearestDirection(n1[i], n1[i + 1], n1[i + 2], dirs) !==
      nearestDirection(n2[i], n2[i + 1], n2[i + 2], dirs)
    ) {
      pushEdge(out, table, e);
    }
  }
  return Float32Array.from(out);
}

/**
 * The silhouette for one view: the edges, not creases, with one face turned
 * to the eye and the other away.
 * @param {EdgeTable} table
 * @param {{eye?: number[], direction?: number[]}} view - the eye's place in
 *   the mesh's own space (a perspective camera), or the view's direction
 *   (an orthographic one)
 * @param {{creaseDeg?: number}} [options]
 * @returns {Float32Array} 6 numbers a segment
 */
export function silhouetteSegments(table, view, { creaseDeg = 15 } = {}) {
  const cosCrease = Math.cos((creaseDeg * Math.PI) / 180);
  const { vertices, a, b, n1, n2, paired } = table;
  const eye = view.eye ?? null;
  const [dx, dy, dz] = view.direction ?? [0, 0, 0];
  if (!eye && !view.direction) {
    throw new Error('A silhouette needs an eye or a direction');
  }
  const out = [];
  for (let e = 0; e < table.count; e++) {
    if (!paired[e] || facesDot(table, e) <= cosCrease) continue;
    const i = e * 3;
    let vx = dx;
    let vy = dy;
    let vz = dz;
    if (eye) {
      const p = a[e] * 3;
      const q = b[e] * 3;
      vx = eye[0] - (vertices[p] + vertices[q]) / 2;
      vy = eye[1] - (vertices[p + 1] + vertices[q + 1]) / 2;
      vz = eye[2] - (vertices[p + 2] + vertices[q + 2]) / 2;
    }
    const s1 = n1[i] * vx + n1[i + 1] * vy + n1[i + 2] * vz;
    const s2 = n2[i] * vx + n2[i + 1] * vy + n2[i + 2] * vz;
    if (s1 * s2 < 0) pushEdge(out, table, e);
  }
  return Float32Array.from(out);
}
