/**
 * The key's pieces on the printer's beds. The key is a piece a row
 * (key-layout.js), so a row prints on its own and can be kept for another
 * map; printed one file a piece, a key of 48 rows is 48 prints. Laid side by
 * side, the same pieces fit a few beds: each bed is one file, every piece
 * on it a piece of its own, 5 mm from the next.
 *
 * The layout is shelves across the bed, the tallest pieces first, from the
 * bed's front, each shelf filled left to right, a piece going to the first
 * shelf with room. Each bed's rendered pieces are then joined into one STL
 * (binary or ASCII in, binary out) or one 3MF (each piece an object of its
 * own), every piece moved so its corner stands at its place.
 *
 * No DOM here: a worker may import this file.
 *
 * @license GPL-3.0-or-later
 */

/** Between two pieces on a bed, so they print apart. */
export const KEY_BED_GAP_MM = 5;
/** Kept clear at the bed's edge. */
export const KEY_BED_MARGIN_MM = 2;

/**
 * The key's pieces laid on beds.
 *
 * @param {Array<{id: string, w: number, h: number}>} pieces - in the key's order
 * @param {{w: number, d: number}} bed - the printer's bed, mm
 * @returns {Array<{id: string, pieces: Array<{id: string, x: number, y: number, w: number, h: number}>}>}
 *   each bed's pieces front to back, each shelf left to right; x and y the
 *   piece's corner nearest the bed's front left
 */
export function layKeyOnBeds(pieces, bed) {
  const gap = KEY_BED_GAP_MM;
  const margin = KEY_BED_MARGIN_MM;
  const right = bed.w - margin;
  const back = bed.d - margin;
  const order = pieces
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.h - a.p.h || b.p.w - a.p.w || a.i - b.i);
  const beds = [];
  for (const { p, i } of order) {
    let placed = false;
    for (const b of beds) {
      const shelf = b.shelves.find((s) => s.x + p.w <= right && p.h <= s.h);
      if (shelf) {
        b.items.push({ p, i, x: shelf.x, y: shelf.y, shelf: shelf.n });
        shelf.x += p.w + gap;
        placed = true;
        break;
      }
      if (b.next + p.h <= back) {
        const n = b.shelves.length;
        b.shelves.push({ n, x: margin + p.w + gap, y: b.next, h: p.h });
        b.items.push({ p, i, x: margin, y: b.next, shelf: n });
        b.next += p.h + gap;
        placed = true;
        break;
      }
    }
    if (!placed) {
      beds.push({
        next: margin + p.h + gap,
        shelves: [{ n: 0, x: margin + p.w + gap, y: margin, h: p.h }],
        items: [{ p, i, x: margin, y: margin, shelf: 0 }],
      });
    }
  }
  return beds.map((b, n) => ({
    id: `key-bed-${n + 1}`,
    pieces: b.items
      .sort((a, c) => a.shelf - c.shelf || a.x - c.x)
      .map(({ p, x, y }) => ({ id: p.id, x, y, w: p.w, h: p.h })),
  }));
}

/** A number for a 3MF vertex: six places at most, no trailing zeros. */
const coord = (n) => String(Math.round(n * 1e6) / 1e6);

/** The corners of an STL's triangles, and their normals. */
function stlTriangles(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const n = data.byteLength >= 84 ? view.getUint32(80, true) : -1;
  const out = [];
  if (n >= 0 && data.byteLength === 84 + 50 * n) {
    for (let i = 0; i < n; i++) {
      const o = 84 + 50 * i;
      const f = (k) => view.getFloat32(o + 4 * k, true);
      out.push({
        normal: [f(0), f(1), f(2)],
        corners: [0, 1, 2].map((j) => [
          f(3 + 3 * j),
          f(4 + 3 * j),
          f(5 + 3 * j),
        ]),
      });
    }
    return out;
  }
  const text = new TextDecoder().decode(data);
  const facet =
    /facet\s+normal\s+(\S+)\s+(\S+)\s+(\S+)\s+outer\s+loop\s+vertex\s+(\S+)\s+(\S+)\s+(\S+)\s+vertex\s+(\S+)\s+(\S+)\s+(\S+)\s+vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
  for (const m of text.matchAll(facet)) {
    const v = m.slice(1).map(Number);
    out.push({
      normal: v.slice(0, 3),
      corners: [v.slice(3, 6), v.slice(6, 9), v.slice(9, 12)],
    });
  }
  return out;
}

/** The lowest x and y of some corners. */
function lowestXY(points) {
  let x = Infinity;
  let y = Infinity;
  for (const p of points) {
    if (p[0] < x) x = p[0];
    if (p[1] < y) y = p[1];
  }
  return [x, y];
}

/**
 * One bed's pieces as one binary STL, each piece moved so its lowest x and y
 * stand at its place.
 *
 * @param {Array<{bytes: ArrayBuffer|Uint8Array, x: number, y: number}>} parts
 * @returns {Uint8Array}
 */
export function joinStl(parts) {
  const pieces = parts.map((part) => {
    const triangles = stlTriangles(part.bytes);
    const [lx, ly] = lowestXY(triangles.flatMap((t) => t.corners));
    return { triangles, dx: part.x - lx, dy: part.y - ly };
  });
  const count = pieces.reduce((sum, p) => sum + p.triangles.length, 0);
  const out = new DataView(new ArrayBuffer(84 + 50 * count));
  const header = new TextEncoder().encode('tactile map key bed');
  header.forEach((b, i) => out.setUint8(i, b));
  out.setUint32(80, count, true);
  let o = 84;
  for (const { triangles, dx, dy } of pieces) {
    for (const t of triangles) {
      t.normal.forEach((c, k) => out.setFloat32(o + 4 * k, c, true));
      t.corners.forEach((v, j) => {
        out.setFloat32(o + 12 + 12 * j, v[0] + dx, true);
        out.setFloat32(o + 16 + 12 * j, v[1] + dy, true);
        out.setFloat32(o + 20 + 12 * j, v[2], true);
      });
      o += 50;
    }
  }
  return new Uint8Array(out.buffer);
}

/** An XML attribute's value, matched as a whole name ("x", not "pindex"). */
const attr = (attrs, name) => {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return m ? m[1] : null;
};

/**
 * A 3MF's printed meshes as one: every build item's object, its build
 * transform applied (3MF's row-vector affine, twelve numbers).
 */
function threeMfMesh(xml) {
  const objects = new Map();
  for (const m of xml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
    const vertices = [...m[2].matchAll(/<vertex\b([^>]*)\/>/g)].map((v) => [
      Number(attr(v[1], 'x')),
      Number(attr(v[1], 'y')),
      Number(attr(v[1], 'z')),
    ]);
    const triangles = [...m[2].matchAll(/<triangle\b([^>]*)\/>/g)].map((t) => [
      Number(attr(t[1], 'v1')),
      Number(attr(t[1], 'v2')),
      Number(attr(t[1], 'v3')),
    ]);
    objects.set(attr(m[1], 'id'), { vertices, triangles });
  }
  const vertices = [];
  const triangles = [];
  for (const item of xml.matchAll(/<item\b([^>]*)\/?>/g)) {
    const object = objects.get(attr(item[1], 'objectid'));
    if (!object || !object.triangles.length) continue;
    const t = (attr(item[1], 'transform') || '1 0 0 0 1 0 0 0 1 0 0 0')
      .trim()
      .split(/\s+/)
      .map(Number);
    const base = vertices.length;
    for (const [x, y, z] of object.vertices) {
      vertices.push([
        x * t[0] + y * t[3] + z * t[6] + t[9],
        x * t[1] + y * t[4] + z * t[7] + t[10],
        x * t[2] + y * t[5] + z * t[8] + t[11],
      ]);
    }
    for (const [a, b, c] of object.triangles) {
      triangles.push([a + base, b + base, c + base]);
    }
  }
  return { vertices, triangles };
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="utf-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />' +
  '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" /></Types>\n';
const RELS =
  '<?xml version="1.0" encoding="utf-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/3D/3dmodel.model" Id="rel0" /></Relationships>\n';

const escapeXml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');

/**
 * One bed's pieces as one 3MF, each piece an object of its own, named, moved
 * so its lowest x and y stand at its place.
 *
 * @param {Array<{bytes: ArrayBuffer|Uint8Array, x: number, y: number, name: string}>} parts
 * @returns {Promise<Uint8Array>}
 */
export async function join3mf(parts) {
  const { default: JSZip } = await import('jszip');
  const objects = [];
  for (const part of parts) {
    const zip = await JSZip.loadAsync(part.bytes);
    const file = zip.file(/\.model$/i)[0];
    const mesh = file
      ? threeMfMesh(await file.async('string'))
      : { vertices: [], triangles: [] };
    if (!mesh.triangles.length) {
      throw new Error(
        `${part.name} came back from the engine with no shape in its 3MF.`
      );
    }
    const [lx, ly] = lowestXY(mesh.vertices);
    const dx = part.x - lx;
    const dy = part.y - ly;
    const id = objects.length + 1;
    objects.push(
      `<object id="${id}" name="${escapeXml(part.name)}" type="model"><mesh><vertices>` +
        mesh.vertices
          .map(
            ([x, y, z]) =>
              `<vertex x="${coord(x + dx)}" y="${coord(y + dy)}" z="${coord(z)}" />`
          )
          .join('') +
        '</vertices><triangles>' +
        mesh.triangles
          .map(([a, b, c]) => `<triangle v1="${a}" v2="${b}" v3="${c}" />`)
          .join('') +
        '</triangles></mesh></object>'
    );
  }
  const items = objects.map((_, i) => `<item objectid="${i + 1}" />`).join('');
  const model =
    '<?xml version="1.0" encoding="utf-8"?>\n<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" unit="millimeter" xml:lang="en-US">' +
    `<resources>${objects.join('')}</resources><build>${items}</build></model>\n`;
  const out = new JSZip();
  out.file('[Content_Types].xml', CONTENT_TYPES);
  out.file('_rels/.rels', RELS);
  out.file('3D/3dmodel.model', model);
  return out.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
  });
}
