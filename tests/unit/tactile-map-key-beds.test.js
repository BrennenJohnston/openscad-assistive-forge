/**
 * The key's pieces on the printer's beds: each row stays a piece of its own,
 * laid with others on as few beds as they fit, 5 mm apart, and each bed's
 * rendered pieces joined into one file, every piece moved to its place.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
  KEY_BED_GAP_MM,
  KEY_BED_MARGIN_MM,
  layKeyOnBeds,
  joinStl,
  join3mf,
} from '../../src/js/tactile-map/key-beds.js';

const BED = { w: 256, d: 256 };
const piece = (n, w, h) => ({ id: `key-${n}`, w, h });

/** Do two placed pieces keep the gap between them? */
function apart(a, b, gap) {
  return (
    a.x + a.w + gap <= b.x + 1e-9 ||
    b.x + b.w + gap <= a.x + 1e-9 ||
    a.y + a.h + gap <= b.y + 1e-9 ||
    b.y + b.h + gap <= a.y + 1e-9
  );
}

describe('the key laid on beds', () => {
  it('keeps 5 mm between pieces and 2 mm from the bed edge', () => {
    expect(KEY_BED_GAP_MM).toBe(5);
    expect(KEY_BED_MARGIN_MM).toBe(2);
  });

  it('stacks twelve rows 240 by 33 mm six to a bed, from the front, on two beds', () => {
    const pieces = Array.from({ length: 12 }, (_, i) => piece(i + 1, 240, 33));
    const beds = layKeyOnBeds(pieces, BED);
    expect(beds.map((b) => b.id)).toEqual(['key-bed-1', 'key-bed-2']);
    expect(beds.map((b) => b.pieces.length)).toEqual([6, 6]);
    expect(beds[0].pieces.map((p) => p.y)).toEqual([2, 40, 78, 116, 154, 192]);
    for (const p of beds[0].pieces) expect(p.x).toBe(2);
    // The rows keep the key's order on each bed.
    expect(beds[0].pieces.map((p) => p.id)).toEqual([
      'key-1',
      'key-2',
      'key-3',
      'key-4',
      'key-5',
      'key-6',
    ]);
  });

  it('puts two short rows side by side and a short piece beside a tall one, the tallest first, every piece inside the bed and apart from the rest', () => {
    const pieces = [
      piece(1, 120, 33),
      piece(2, 200, 144),
      piece(3, 120, 33),
      piece(4, 40, 33),
      piece(5, 250, 49),
    ];
    const beds = layKeyOnBeds(pieces, BED);
    expect(beds).toHaveLength(1);
    const placed = beds[0].pieces;
    expect(placed.map((p) => p.id).sort()).toEqual(
      pieces.map((p) => p.id).sort()
    );
    expect(placed[0].id).toBe('key-2');
    expect(placed[1]).toMatchObject({ id: 'key-4', x: 207, y: 2 });
    for (const p of placed) {
      expect(p.x).toBeGreaterThanOrEqual(2);
      expect(p.y).toBeGreaterThanOrEqual(2);
      expect(p.x + p.w).toBeLessThanOrEqual(254 + 1e-9);
      expect(p.y + p.h).toBeLessThanOrEqual(254 + 1e-9);
    }
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(apart(placed[i], placed[j], 5), `${i} ${j}`).toBe(true);
      }
    }
    // Front to back, each row left to right.
    const order = placed.map((p) => [p.y, p.x]);
    const sorted = [...order].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    expect(order).toEqual(sorted);
  });

  it('gives a lone piece a bed of its own, and no beds to no pieces', () => {
    expect(layKeyOnBeds([piece(1, 100, 33)], BED)).toEqual([
      {
        id: 'key-bed-1',
        pieces: [{ id: 'key-1', x: 2, y: 2, w: 100, h: 33 }],
      },
    ]);
    expect(layKeyOnBeds([], BED)).toEqual([]);
  });
});

/** A tetrahedron's four corners, from (x, y, 0), 3 by 4 by 5 mm. */
const tetra = (x, y) => {
  const a = [x, y, 0];
  const b = [x + 3, y, 0];
  const c = [x, y + 4, 0];
  const d = [x, y, 5];
  return [
    [a, c, b],
    [a, b, d],
    [a, d, c],
    [b, c, d],
  ];
};

function binaryStl(triangles) {
  const out = new DataView(new ArrayBuffer(84 + 50 * triangles.length));
  out.setUint32(80, triangles.length, true);
  triangles.forEach((t, i) => {
    const o = 84 + 50 * i;
    out.setFloat32(o + 8, 1, true);
    t.forEach((v, j) =>
      v.forEach((c, k) => out.setFloat32(o + 12 + 12 * j + 4 * k, c, true))
    );
  });
  return new Uint8Array(out.buffer);
}

function asciiStl(triangles) {
  const facets = triangles
    .map(
      (t) =>
        '  facet normal 0 0 1\n    outer loop\n' +
        t.map((v) => `      vertex ${v.join(' ')}\n`).join('') +
        '    endloop\n  endfacet\n'
    )
    .join('');
  return new TextEncoder().encode(
    `solid OpenSCAD_Model\n${facets}endsolid OpenSCAD_Model\n`
  );
}

/** Every triangle of a binary STL: its normal and its three corners. */
function readStl(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = view.getUint32(80, true);
  expect(bytes.byteLength).toBe(84 + 50 * n);
  return Array.from({ length: n }, (_, i) => {
    const o = 84 + 50 * i;
    const f = (k) => view.getFloat32(o + 4 * k, true);
    return {
      normal: [f(0), f(1), f(2)],
      corners: [0, 1, 2].map((j) => [f(3 + 3 * j), f(4 + 3 * j), f(5 + 3 * j)]),
    };
  });
}

const lowest = (points) => [
  Math.min(...points.map((p) => p[0])),
  Math.min(...points.map((p) => p[1])),
  Math.min(...points.map((p) => p[2])),
];

describe("a bed's pieces joined into one file", () => {
  it('joins binary and ASCII STL pieces into one binary STL, each piece moved so its corner stands at its place', () => {
    const joined = joinStl([
      { bytes: binaryStl(tetra(10, 20)), x: 2, y: 2 },
      { bytes: asciiStl(tetra(-7, 3)), x: 50, y: 2 },
    ]);
    const triangles = readStl(joined);
    expect(triangles).toHaveLength(8);
    const first = triangles.slice(0, 4).flatMap((t) => t.corners);
    const second = triangles.slice(4).flatMap((t) => t.corners);
    expect(lowest(first)).toEqual([2, 2, 0]);
    expect(lowest(second)).toEqual([50, 2, 0]);
    expect(Math.max(...second.map((p) => p[2]))).toBe(5);
    // Moving a piece leaves its faces' normals as they were.
    expect(triangles[0].normal).toEqual([0, 0, 1]);
  });

  it('joins 3MF pieces into one 3MF, each piece an object of its own at its place, its objects merged and its build transform kept', async () => {
    const model = (objects, items) =>
      '<?xml version="1.0" encoding="utf-8"?>\n<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" unit="millimeter">' +
      '<resources><basematerials id="1"><base name="Default" displaycolor="#F9D72C00" /></basematerials>' +
      objects
        .map(
          (t, n) =>
            `<object id="${n + 2}" type="model" pid="1" pindex="0"><mesh><vertices>` +
            [...new Set(t.flat().map((v) => v.join(',')))]
              .map((v) => v.split(',').map(Number))
              .map((v) => `<vertex x="${v[0]}" y="${v[1]}" z="${v[2]}" />`)
              .join('') +
            '</vertices><triangles>' +
            t
              .map((tri) => {
                const order = [...new Set(t.flat().map((v) => v.join(',')))];
                const [v1, v2, v3] = tri.map((v) => order.indexOf(v.join(',')));
                return `<triangle v1="${v1}" v2="${v2}" v3="${v3}" pid="1" p1="0" />`;
              })
              .join('') +
            '</triangles></mesh></object>'
        )
        .join('') +
      `</resources><build>${items}</build></model>`;
    const pack = async (xml) => {
      const zip = new JSZip();
      zip.file('3D/3dmodel.model', xml);
      return zip.generateAsync({ type: 'uint8array' });
    };
    // A piece of two objects (lazy union), and a piece placed by a build
    // transform 20 mm along x.
    const two = await pack(
      model(
        [tetra(0, 0), tetra(10, 0)],
        '<item objectid="2" /><item objectid="3" />'
      )
    );
    const moved = await pack(
      model(
        [tetra(0, 0)],
        '<item objectid="2" transform="1 0 0 0 1 0 0 0 1 20 0 0" />'
      )
    );
    const joined = await join3mf([
      { bytes: two, x: 2, y: 2, name: 'Key 1' },
      { bytes: moved, x: 2, y: 60, name: 'Key 2' },
    ]);
    const out = await JSZip.loadAsync(joined);
    expect(Object.keys(out.files).sort()).toEqual([
      '3D/',
      '3D/3dmodel.model',
      '[Content_Types].xml',
      '_rels/',
      '_rels/.rels',
    ]);
    const xml = await out.file('3D/3dmodel.model').async('string');
    const objects = [...xml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)];
    expect(objects.map((o) => o[1].match(/name="([^"]*)"/)[1])).toEqual([
      'Key 1',
      'Key 2',
    ]);
    const points = (body) =>
      [...body.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)].map(
        (m) => m.slice(1).map(Number)
      );
    const tris = (body) => [...body.matchAll(/<triangle\b/g)].length;
    expect(tris(objects[0][2])).toBe(8);
    expect(lowest(points(objects[0][2]))).toEqual([2, 2, 0]);
    expect(Math.max(...points(objects[0][2]).map((p) => p[0]))).toBe(15);
    expect(lowest(points(objects[1][2]))).toEqual([2, 60, 0]);
    expect(
      [...xml.matchAll(/<item objectid="(\d+)"/g)].map((m) => m[1])
    ).toEqual(['1', '2']);
  });

  it('refuses a 3MF with no mesh in it, in a sentence', async () => {
    const zip = new JSZip();
    zip.file(
      '3D/3dmodel.model',
      '<model><resources></resources><build></build></model>'
    );
    const empty = await zip.generateAsync({ type: 'uint8array' });
    await expect(
      join3mf([{ bytes: empty, x: 2, y: 2, name: 'Key 1' }])
    ).rejects.toThrow(
      'Key 1 came back from the engine with no shape in its 3MF.'
    );
  });
});
