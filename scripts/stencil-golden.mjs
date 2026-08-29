#!/usr/bin/env node
/**
 * The stencil acceptance oracle: does Forge cut the same shapes the owner cut?
 *
 * The owner made six stencil plates for their cat by hand - Illustrator to
 * Fusion 360 to STL - and those seven files (six plates plus the jig) are in
 * `tests/fixtures/harley/`. They are the answer sheet. This harness puts a
 * Forge plate beside the reference plate of the same number and reports
 * intersection over union of the two cuts.
 *
 * WHY THE NUMBER COMES FROM GEOMETRY AND NOT FROM A PICTURE. The obvious
 * design is to render both plates top-down with OpenSCAD and compare the
 * pixels. It was not taken, for two reasons that are not matters of taste:
 * CI has no desktop OpenSCAD, so an oracle built on renders could never run
 * there; and a render adds a rasteriser, a camera and a colour threshold
 * between the geometry and the verdict, each able to move the number on its
 * own. So the cut is read straight out of the artefacts - the boundary loops
 * of a plate STL's top face, or the subpaths of a plate SVG - and rasterised
 * here, in one place, at a resolution this file sets.
 * To reverse: add a `--from-render` mode that shells out to the pinned
 * nightly and decodes the PNGs instead.
 * Pictures for the eyes-on gates are a separate job: `--render` writes the
 * top views with the pinned nightly and compares nothing.
 *
 * WHAT IS COMPARED. The cut, normalised to its OWN bounding box. Where the
 * cut sits on the plate and how big it is are the person's parameters
 * (plate size, margin, design scale); which shapes are cut is the engine's
 * business, and that is what this measures. Registration features and the
 * plate numeral are dropped first - any cut whose centre sits within
 * EDGE_BAND of the plate edge is a hole, a notch or a numeral, never art.
 *
 * Usage:
 *   node scripts/stencil-golden.mjs --self-check
 *   node scripts/stencil-golden.mjs --plate <a.svg|a.stl> --reference <b.stl>
 *   node scripts/stencil-golden.mjs --fixture harley          (wired in DP-17)
 *   node scripts/stencil-golden.mjs --render <file.stl> --out <file.png>
 */

import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  parsePathString,
  pathToAbsolute,
  pathToCurve,
} from 'svg-path-commander';
import { polygonFromPathData, boundsOf, signedArea } from '../src/js/svg-nesting.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, '..');

/** Raster side, in pixels, for every comparison. */
export const GRID = 512;

/**
 * How close to the plate edge a cut's centre has to be before it counts as
 * registration rather than art, as a fraction of the plate's shorter side.
 * The reference plates put peg holes and the numeral 2.5 mm in on a 60 mm
 * plate (4.2%); the cat's own centre sits 33% in. 0.08 separates them with
 * room on both sides.
 */
export const EDGE_BAND = 0.08;

/** The pinned verification binary. Pictures only; no number depends on it. */
export const OPENSCAD =
  process.env.OPENSCAD_BIN ||
  'C:/Program Files/OpenSCAD (Nightly)/openscad.com';

// ---------------------------------------------------------------------------
// Reading a plate
// ---------------------------------------------------------------------------

/**
 * Split path data into one ring per subpath.
 *
 * `polygonFromPathData` concatenates every subpath into a single point list,
 * which is right for a nesting bound and wrong for a hole: the joining
 * segment between two subpaths is not an edge of either. Everything is put
 * through `pathToCurve` first, so each subpath starts at an absolute M.
 *
 * @param {string} d - Path data
 * @returns {Array<Array<{x:number,y:number}>>} One closed ring per subpath
 */
export function subpathRings(d) {
  if (!d || typeof d !== 'string') return [];
  let curve;
  try {
    curve = pathToCurve(pathToAbsolute(parsePathString(d)));
  } catch {
    return [];
  }
  const groups = [];
  let current = null;
  for (const seg of curve) {
    if (seg[0] === 'M') {
      current = [seg];
      groups.push(current);
    } else if (current) {
      current.push(seg);
    }
  }
  const rings = [];
  for (const g of groups) {
    const text = g.map((s) => s[0] + ' ' + s.slice(1).join(' ')).join(' ');
    const { points } = polygonFromPathData(text);
    if (points.length >= 3) rings.push(points);
  }
  return rings;
}

/**
 * Read a binary STL and return its triangles.
 *
 * @param {string} file
 * @returns {Array<Array<{x:number,y:number,z:number}>>}
 */
export function readStlTriangles(file) {
  const buf = readFileSync(file);
  const n = buf.readUInt32LE(80);
  if (84 + n * 50 > buf.length) {
    throw new Error(`${basename(file)} is not a binary STL of ${n} triangles`);
  }
  const tris = [];
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50;
    const v = [];
    for (let k = 0; k < 3; k++) {
      const b = o + 12 + k * 12;
      v.push({
        x: buf.readFloatLE(b),
        y: buf.readFloatLE(b + 4),
        z: buf.readFloatLE(b + 8),
      });
    }
    tris.push(v);
  }
  return tris;
}

/**
 * The boundary loops of a flat slab's top face, in the STL's own units.
 *
 * A stencil plate is a slab: every triangle at max z belongs to the face the
 * paint passes through, and an edge shared by two of those triangles is
 * interior. What is left, chained head to tail, is the plate outline plus
 * every hole in it.
 *
 * @param {Array<Array<{x:number,y:number,z:number}>>} tris
 * @param {number} [eps] - Tolerance on "at max z", in the STL's units
 * @returns {{maxZ:number, minZ:number, loops:Array<Array<{x:number,y:number}>>}}
 */
export function topFaceLoops(tris, eps = 1e-3) {
  let maxZ = -Infinity;
  let minZ = Infinity;
  for (const t of tris)
    for (const v of t) {
      if (v.z > maxZ) maxZ = v.z;
      if (v.z < minZ) minZ = v.z;
    }
  const key = (p) => `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)}`;
  const edges = new Map();
  const pt = new Map();
  for (const t of tris) {
    if (!t.every((v) => Math.abs(v.z - maxZ) < eps)) continue;
    for (let i = 0; i < 3; i++) {
      const ka = key(t[i]);
      const kb = key(t[(i + 1) % 3]);
      if (ka === kb) continue;
      pt.set(ka, t[i]);
      pt.set(kb, t[(i + 1) % 3]);
      if (edges.has(`${kb}|${ka}`)) edges.delete(`${kb}|${ka}`);
      else edges.set(`${ka}|${kb}`, [ka, kb]);
    }
  }
  const next = new Map();
  for (const [, [a, b]] of edges) {
    if (!next.has(a)) next.set(a, []);
    next.get(a).push(b);
  }
  const loops = [];
  const usedEdge = new Set();
  for (const [, [start]] of edges) {
    if (usedEdge.has(`from:${start}`)) continue;
    let cur = start;
    const loop = [];
    for (;;) {
      const outs = next.get(cur);
      if (!outs) break;
      const nxt = outs.find((c) => !usedEdge.has(`${cur}|${c}`));
      if (nxt === undefined) break;
      usedEdge.add(`${cur}|${nxt}`);
      usedEdge.add(`from:${cur}`);
      loop.push({ x: pt.get(cur).x, y: pt.get(cur).y });
      cur = nxt;
      if (cur === start) break;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return { maxZ, minZ, loops };
}

const ringBox = (ring) => {
  const b = boundsOf(ring);
  return {
    ...b,
    w: b.maxX - b.minX,
    h: b.maxY - b.minY,
    cx: (b.minX + b.maxX) / 2,
    cy: (b.minY + b.maxY) / 2,
    area: Math.abs(signedArea(ring)),
  };
};

/**
 * Separate a plate's rings into its outline and the cuts that are art.
 *
 * The outline is the ring that encloses the others - the largest by area.
 * A cut whose centre lies within EDGE_BAND of that outline is a peg hole, a
 * key notch or the plate numeral, and is dropped: those are registration,
 * they differ by design between a hand-made plate and a generated one, and
 * comparing them would drown the thing being measured.
 *
 * @param {Array<Array<{x:number,y:number}>>} loops
 * @returns {{outline:object, cuts:Array, dropped:Array}}
 */
export function splitPlateRings(loops) {
  const boxed = loops
    .map((ring) => ({ ring, ...ringBox(ring) }))
    .sort((a, b) => b.area - a.area);
  if (boxed.length === 0) return { outline: null, cuts: [], dropped: [] };
  const outline = boxed[0];
  const band = EDGE_BAND * Math.min(outline.w, outline.h);
  const cuts = [];
  const dropped = [];
  for (const c of boxed.slice(1)) {
    const nearEdge =
      c.cx - outline.minX < band ||
      outline.maxX - c.cx < band ||
      c.cy - outline.minY < band ||
      outline.maxY - c.cy < band;
    (nearEdge ? dropped : cuts).push(c);
  }
  return { outline, cuts, dropped };
}

/**
 * Every cut of a plate, however the plate arrived.
 *
 * @param {string} file - A plate STL or a plate SVG
 * @returns {{cuts:Array, outline:object, dropped:Array, kind:string}}
 */
export function readPlate(file) {
  const lower = file.toLowerCase();
  let loops;
  let kind;
  if (lower.endsWith('.stl')) {
    kind = 'stl';
    loops = topFaceLoops(readStlTriangles(file)).loops;
  } else if (lower.endsWith('.svg')) {
    kind = 'svg';
    const text = readFileSync(file, 'utf8');
    const d = / d="([^"]*)"/.exec(text)?.[1];
    if (!d) throw new Error(`${basename(file)} has no path data`);
    loops = subpathRings(d);
  } else {
    throw new Error(`${basename(file)}: expected a .stl or .svg plate`);
  }
  return { ...splitPlateRings(loops), kind };
}

// ---------------------------------------------------------------------------
// Comparing two cuts
// ---------------------------------------------------------------------------

/**
 * Rasterise rings into a square mask under the even-odd rule.
 *
 * Even-odd is the rule the plates are written in - a hole inside a cut is a
 * ring inside a ring, and a scanline crossing both is outside again - so the
 * crossings of every ring are counted together and the parity decides.
 *
 * @param {Array<Array<{x:number,y:number}>>} rings
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} box - What maps
 *   onto the raster. Aspect is preserved: the longer side fills the grid and
 *   the shorter one is centred, so a cut of the wrong proportions scores as
 *   the wrong shape rather than being stretched into agreement.
 * @param {number} [size]
 * @returns {Uint8Array} size*size, 1 inside
 */
export function rasterizeRings(rings, box, size = GRID) {
  const mask = new Uint8Array(size * size);
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  if (!(w > 0) || !(h > 0)) return mask;
  const scale = (size - 2) / Math.max(w, h);
  const ox = 1 + (size - 2 - w * scale) / 2;
  const oy = 1 + (size - 2 - h * scale) / 2;
  const px = rings.map((r) =>
    r.map((p) => ({
      x: (p.x - box.minX) * scale + ox,
      y: (p.y - box.minY) * scale + oy,
    }))
  );
  const xs = [];
  for (let row = 0; row < size; row++) {
    const y = row + 0.5;
    xs.length = 0;
    for (const ring of px) {
      const n = ring.length;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const a = ring[i];
        const b = ring[j];
        if (a.y > y !== b.y > y) {
          xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
        }
      }
    }
    if (xs.length < 2) continue;
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const from = Math.max(0, Math.ceil(xs[i] - 0.5));
      const to = Math.min(size - 1, Math.floor(xs[i + 1] - 0.5));
      for (let c = from; c <= to; c++) mask[row * size + c] = 1;
    }
  }
  return mask;
}

/**
 * Intersection over union of two masks of the same size.
 *
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @returns {{iou:number, intersection:number, union:number, onlyA:number, onlyB:number}}
 */
export function iouOfMasks(a, b) {
  if (a.length !== b.length) throw new Error('masks differ in size');
  let inter = 0;
  let union = 0;
  let onlyA = 0;
  let onlyB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x && y) inter++;
    if (x || y) union++;
    if (x && !y) onlyA++;
    if (!x && y) onlyB++;
  }
  return { iou: union ? inter / union : 1, intersection: inter, union, onlyA, onlyB };
}

/** The bounding box of a set of cuts. */
export function cutsBox(cuts) {
  if (cuts.length === 0) return null;
  return {
    minX: Math.min(...cuts.map((c) => c.minX)),
    minY: Math.min(...cuts.map((c) => c.minY)),
    maxX: Math.max(...cuts.map((c) => c.maxX)),
    maxY: Math.max(...cuts.map((c) => c.maxY)),
  };
}

/**
 * Compare two plates' cuts, each normalised to its own bounding box.
 *
 * @param {{cuts:Array}} a
 * @param {{cuts:Array}} b
 * @param {{size?:number, flipY?:boolean}} [options] - `flipY` mirrors the
 *   second plate's y, for comparing CAD output (y up) with an SVG (y down).
 * @returns {object}
 */
export function comparePlates(a, b, options = {}) {
  const size = options.size || GRID;
  const boxA = cutsBox(a.cuts);
  const boxB = cutsBox(b.cuts);
  if (!boxA || !boxB) {
    return { iou: 0, note: 'one of the plates cuts nothing', cutsA: a.cuts.length, cutsB: b.cuts.length };
  }
  const ringsA = a.cuts.map((c) => c.ring);
  let ringsB = b.cuts.map((c) => c.ring);
  let useBoxB = boxB;
  if (options.flipY) {
    ringsB = ringsB.map((r) => r.map((p) => ({ x: p.x, y: -p.y })));
    useBoxB = { minX: boxB.minX, maxX: boxB.maxX, minY: -boxB.maxY, maxY: -boxB.minY };
  }
  const ma = rasterizeRings(ringsA, boxA, size);
  const mb = rasterizeRings(ringsB, useBoxB, size);
  const r = iouOfMasks(ma, mb);
  return {
    ...r,
    cutsA: a.cuts.length,
    cutsB: b.cuts.length,
    aspectA: (boxA.maxX - boxA.minX) / (boxA.maxY - boxA.minY),
    aspectB: (boxB.maxX - boxB.minX) / (boxB.maxY - boxB.minY),
  };
}

// ---------------------------------------------------------------------------
// Pictures (eyes-on only; nothing here feeds a number)
// ---------------------------------------------------------------------------

/**
 * Render one plate top-down with the pinned nightly.
 *
 * @param {string} file - .stl or .svg
 * @param {string} out - .png to write
 * @returns {string} The command output
 */
export function renderTopView(file, out) {
  const viewer = resolve(REPO, 'scripts/stencil-golden-view.scad');
  mkdirSync(dirname(out), { recursive: true });
  return execFileSync(
    OPENSCAD,
    [
      '--imgsize=800,800',
      '--projection=o',
      '--camera=0,0,0,0,0,0,100',
      '--viewall',
      '--autocenter',
      '--render',
      '-D',
      `file="${file.replace(/\\/g, '/')}"`,
      '-D',
      `is_svg=${file.toLowerCase().endsWith('.svg') ? 'true' : 'false'}`,
      '-o',
      out,
      viewer,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const REFERENCE_DIR = resolve(REPO, 'tests/fixtures/harley');
export const referencePlate = (n) => resolve(REFERENCE_DIR, `plate-${n}.stl`);

function fmt(n, w = 6) {
  return n.toFixed(3).padStart(w);
}

function selfCheck() {
  console.log('--- self-check: every reference plate against itself\n');
  let worst = 1;
  for (let n = 1; n <= 6; n++) {
    const p = readPlate(referencePlate(n));
    const r = comparePlates(p, p);
    worst = Math.min(worst, r.iou);
    console.log(
      `  plate ${n}: ${r.cutsA} cuts (${p.dropped.length} registration features dropped)  IoU ${fmt(r.iou)}`
    );
  }
  console.log('\n--- discrimination: plate 2 against every other plate\n');
  const p2 = readPlate(referencePlate(2));
  const others = [];
  for (let n = 1; n <= 6; n++) {
    if (n === 2) continue;
    const r = comparePlates(p2, readPlate(referencePlate(n)));
    others.push(r.iou);
    console.log(`  plate 2 vs plate ${n}: IoU ${fmt(r.iou)}`);
  }
  const loudest = Math.max(...others);
  console.log(
    `\nself IoU floor ${fmt(worst)}; loudest false match ${fmt(loudest)}`
  );
  const ok = worst > 0.999 && loudest < 0.5;
  console.log(ok ? '\nSELF-CHECK PASSED' : '\nSELF-CHECK FAILED');
  return ok ? 0 : 1;
}

function comparePair(plateFile, referenceFile, flipY) {
  const a = readPlate(plateFile);
  const b = readPlate(referenceFile);
  const r = comparePlates(a, b, { flipY });
  console.log(`  ${basename(plateFile)} vs ${basename(referenceFile)}`);
  console.log(
    `    cuts ${r.cutsA} vs ${r.cutsB}   aspect ${fmt(r.aspectA ?? 0)} vs ${fmt(r.aspectB ?? 0)}`
  );
  console.log(
    `    IoU ${fmt(r.iou)}   only in the first ${r.onlyA}, only in the second ${r.onlyB} of ${r.union} pixels`
  );
  return r;
}

function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : null;
  };
  if (argv.includes('--self-check')) return selfCheck();

  const render = arg('--render');
  if (render) {
    const out = arg('--out') || resolve(REPO, 'build/plate-top.png');
    console.log(renderTopView(render, out));
    console.log(`wrote ${out}: ${existsSync(out)}`);
    return existsSync(out) ? 0 : 1;
  }

  const plate = arg('--plate');
  const reference = arg('--reference');
  if (plate && reference) {
    const r = comparePair(plate, reference, argv.includes('--flip-y'));
    return r.iou > 0 ? 0 : 1;
  }

  if (arg('--fixture') === 'harley') {
    console.error(
      'The harley comparison needs the colour engine. It is wired in DP-17;\n' +
        'until then use --self-check, or --plate and --reference.'
    );
    return 2;
  }

  console.error(
    'usage: stencil-golden.mjs --self-check\n' +
      '       stencil-golden.mjs --plate <a.svg|a.stl> --reference <b.stl> [--flip-y]\n' +
      '       stencil-golden.mjs --render <file> --out <file.png>'
  );
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
