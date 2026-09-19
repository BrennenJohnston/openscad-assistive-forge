/**
 * The preview's post-load geometry work as pure functions (DP-52 P4, D-143).
 * The classifier's two cases are the same arrays preview.test.js runs through
 * `_classifyInnerFaces`, so moving the arithmetic changed nothing.
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import {
  classifyInnerFaces,
  buildEdgeSegments,
  clipEdgeSegments,
  computeMeshExtras,
  offFaceCount,
  parseOFF,
  computeFlatNormals,
  centerPositions,
  prepareOFF,
} from '../../src/js/mesh-extras.js';

function cavityMesh() {
  const outerPos = [];
  const outerNrm = [];
  for (let i = 0; i < 6; i++) {
    const x = 20 + i * 3;
    outerPos.push(x, 0, 0, x, 1, 0, x, 0, 1);
    outerNrm.push(1, 0, 0, 1, 0, 0, 1, 0, 0);
  }
  for (let i = 0; i < 6; i++) {
    const x = -20 - i * 3;
    outerPos.push(x, 0, 0, x, -1, 0, x, 0, 1);
    outerNrm.push(-1, 0, 0, -1, 0, 0, -1, 0, 0);
  }
  const positions = new Float32Array([
    0, 0, 2, 1, 0, 2, 0.5, 1, 2, 0, 0, 2, 1, 0, 2, 0.5, -5, 3, ...outerPos,
  ]);
  const normals = new Float32Array([
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 1, ...outerNrm,
  ]);
  return { positions, normals };
}

/** A unit cube as 12 triangles, outward normals. */
function cube() {
  const p = [];
  const quad = (a, b, c, d) => {
    p.push(...a, ...b, ...c, ...a, ...c, ...d);
  };
  const v = (x, y, z) => [x, y, z];
  quad(v(0, 0, 0), v(0, 1, 0), v(1, 1, 0), v(1, 0, 0)); // z = 0
  quad(v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)); // z = 1
  quad(v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)); // y = 0
  quad(v(0, 1, 0), v(0, 1, 1), v(1, 1, 1), v(1, 1, 0)); // y = 1
  quad(v(0, 0, 0), v(0, 0, 1), v(0, 1, 1), v(0, 1, 0)); // x = 0
  quad(v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1)); // x = 1
  return Float32Array.from(p);
}

describe('classifyInnerFaces (moved from PreviewManager, unchanged)', () => {
  it('classifies the cavity face inner and promotes across the concave edge', () => {
    const { positions, normals } = cavityMesh();
    const inner = classifyInnerFaces(positions, normals);
    expect(inner.length).toBe(positions.length / 3);
    expect(inner[0]).toBe(1);
    expect(inner[3]).toBe(1);
    for (let v = 6; v < inner.length; v += 3) expect(inner[v]).toBe(0);
  });

  it('coplanar smoothing settles a component by majority', () => {
    const positions = new Float32Array([
      0, 0, 0.5, 2, 0, 0.5, 0, 2, 0.5, 2, 0, 0.5, 2, 2, 0.5, 0, 2, 0.5, 2, 0,
      0.5, 4, 0, 0.5, 2, 2, 0.5, 40, 0, 0, 42, 0, 0, 41, 1, 0,
    ]);
    const normals = new Float32Array([
      0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
      0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    ]);
    const inner = classifyInnerFaces(positions, normals);
    expect(inner[0]).toBe(1);
    expect(inner[3]).toBe(1);
    expect(inner[6]).toBe(1);
    expect(inner[9]).toBe(0);
  });
});

describe('buildEdgeSegments (EdgesGeometry without three.js)', () => {
  it('a cube has twelve edges; the diagonals across its faces are not edges', () => {
    const segs = buildEdgeSegments(cube(), 15);
    expect(segs.length / 6).toBe(12);
    // Every segment is a unit-length axis-aligned edge.
    for (let i = 0; i < segs.length; i += 6) {
      const dx = Math.abs(segs[i + 3] - segs[i]);
      const dy = Math.abs(segs[i + 4] - segs[i + 1]);
      const dz = Math.abs(segs[i + 5] - segs[i + 2]);
      expect(dx + dy + dz).toBeCloseTo(1, 5);
      expect([dx, dy, dz].filter((d) => d > 0.5)).toHaveLength(1);
    }
  });

  it('a lone triangle shows all three of its edges', () => {
    const segs = buildEdgeSegments(
      Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      15
    );
    expect(segs.length / 6).toBe(3);
  });

  it('a gentle bend under the threshold is not an edge', () => {
    // Two triangles sharing an edge, bent by 10 degrees.
    const a = (10 * Math.PI) / 180;
    const segs = buildEdgeSegments(
      Float32Array.from([
        0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
      ]).map((v, i) => v),
      15
    );
    // Flat: only the four outer edges (the shared diagonal is not one).
    expect(segs.length / 6).toBe(4);
    const bent = Float32Array.from([
      0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, Math.cos(a), Math.sin(a), 0, 1, 0,
    ]);
    // Still under 15 degrees at the shared edge: four edges.
    expect(buildEdgeSegments(bent, 15).length / 6).toBe(4);
    // And over it once the threshold is tightened: the shared edge appears.
    expect(buildEdgeSegments(bent, 5).length / 6).toBe(5);
  });
});

describe('clipEdgeSegments (the longest survive the budget)', () => {
  it('keeps everything under the budget and the longest above it', () => {
    const segs = Float32Array.from([
      0, 0, 0, 1, 0, 0, // length 1
      0, 0, 0, 3, 0, 0, // length 3
      0, 0, 0, 0, 2, 0, // length 2
    ]);
    expect(clipEdgeSegments(segs, 0).shown).toBe(3);
    expect(clipEdgeSegments(segs, 5).shown).toBe(3);
    const clipped = clipEdgeSegments(segs, 2);
    expect(clipped.total).toBe(3);
    expect(clipped.shown).toBe(2);
    expect(Array.from(clipped.segments)).toEqual([
      0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 2, 0,
    ]);
  });
});

describe('computeMeshExtras', () => {
  it('answers both questions for one mesh, or only the ones asked', () => {
    const { positions, normals } = cavityMesh();
    const both = computeMeshExtras({ positions, normals });
    expect(both.isInner).toBeInstanceOf(Float32Array);
    expect(both.edges).toBeInstanceOf(Float32Array);
    expect(both.edgeTotal).toBeGreaterThan(0);
    const inner = computeMeshExtras({ positions, normals, wantEdges: false });
    expect(inner.edges).toBeNull();
    const edges = computeMeshExtras({ positions, normals: null });
    expect(edges.isInner).toBeNull();
    const budgeted = computeMeshExtras({ positions, normals, edgeBudget: 2 });
    expect(budgeted.edgeShown).toBe(2);
    expect(budgeted.edges.length).toBe(12);
  });
});

describe('parseOFF (moved from PreviewManager.loadOFF, unchanged in what it accepts)', () => {
  const OFF_TWO_TRIANGLES = ['OFF', '4 2 0', '0 0 0', '1 0 0', '1 1 0', '0 1 0', '3 0 1 2', '3 0 2 3'].join('\n');
  const OFF_QUAD = ['OFF', '4 1 0', '0 0 0', '1 0 0', '1 1 0', '0 1 0', '4 0 1 2 3'].join('\n');
  const OFF_COLORS = ['OFF', '4 2 0', '0 0 0', '1 0 0', '1 1 0', '0 1 0', '3 0 1 2 249 215 44 255', '3 0 2 3 157 203 81 255'].join('\n');
  const OFF_UNIFORM = ['OFF', '4 2 0', '0 0 0', '1 0 0', '1 1 0', '0 1 0', '3 0 1 2 249 215 44 255', '3 0 2 3 249 215 44 255'].join('\n');
  const OFF_HEADER_COUNTS = ['OFF 3 1 0', '0 0 0', '1 0 0', '0 1 0', '3 0 1 2'].join('\n');

  it('reads the face count from the header without touching the rest', () => {
    expect(offFaceCount(OFF_TWO_TRIANGLES)).toBe(2);
    expect(offFaceCount(OFF_HEADER_COUNTS)).toBe(1);
    expect(offFaceCount('# a comment\n\nOFF\n4 2 0\n')).toBe(2);
    expect(offFaceCount('')).toBe(0);
    expect(offFaceCount('not off')).toBe(0);
  });

  it('parses triangles into a soup, nine numbers each', () => {
    const p = parseOFF(OFF_TWO_TRIANGLES);
    expect(p.numVerts).toBe(4);
    expect(p.numFaces).toBe(2);
    expect(p.hasColors).toBe(false);
    expect(p.colors).toBeNull();
    expect(Array.from(p.positions)).toEqual([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0]);
  });

  it('fans a quad into two triangles, and reads counts on the header line', () => {
    expect(parseOFF(OFF_QUAD).positions.length).toBe(18);
    const p = parseOFF(OFF_HEADER_COUNTS);
    expect(p.numFaces).toBe(1);
    expect(p.positions.length).toBe(9);
  });

  it('keeps inline face colors scaled from 0-255, and drops uniform ones', () => {
    const c = parseOFF(OFF_COLORS);
    expect(c.hasColors).toBe(true);
    expect(c.colors.length).toBe(c.positions.length);
    expect(c.colors[0]).toBeCloseTo(249 / 255, 5);
    expect(c.colors[9]).toBeCloseTo(157 / 255, 5);
    const u = parseOFF(OFF_UNIFORM);
    expect(u.hasColors).toBe(false);
    expect(u.colors).toBeNull();
  });

  it('refuses what is not an OFF, with the sentences the loader used', () => {
    expect(() => parseOFF('')).toThrow('OFF data is empty');
    expect(() => parseOFF('PLY\n')).toThrow(/Not a valid OFF file/);
  });
});

describe('computeFlatNormals and centerPositions', () => {
  it('gives every vertex of a triangle its face normal, unit length', () => {
    const n = computeFlatNormals(Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]));
    expect(Array.from(n)).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  });

  it('agrees with three.js on a non-indexed geometry', () => {
    const positions = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1]);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions.slice(), 3));
    geometry.computeVertexNormals();
    const three = geometry.getAttribute('normal').array;
    const mine = computeFlatNormals(positions);
    for (let i = 0; i < mine.length; i++) expect(mine[i]).toBeCloseTo(three[i], 5);
  });

  it('centers a soup on its bounding box, as three.js center() does', () => {
    const positions = Float32Array.from([2, 2, 2, 4, 2, 2, 2, 6, 2]);
    const offset = centerPositions(positions);
    expect(offset).toMatchObject({ x: -3, y: -4, z: -2, min: [-1, -2, 0], max: [1, 2, 0] });
    expect(Array.from(positions)).toEqual([-1, -2, 0, 1, -2, 0, -1, 2, 0]);
  });

  it('prepareOFF does the whole job for a worker', () => {
    const OFF = ['OFF', '4 2 0', '0 0 0', '1 0 0', '1 1 0', '0 1 0', '3 0 1 2', '3 0 2 3'].join('\n');
    const r = prepareOFF(OFF);
    expect(r.hasColors).toBe(false);
    expect(r.positions.length).toBe(18);
    expect(r.normals.length).toBe(18);
    expect(r.isInner.length).toBe(6);
    expect(r.edges.length / 6).toBe(4);
    // Centered: the square that ran 0..1 now runs -0.5..0.5.
    expect(Math.min(...r.positions)).toBeCloseTo(-0.5, 5);
    expect(Math.max(...r.positions)).toBeCloseTo(0.5, 5);
  });
});
