/**
 * @license GPL-3.0-or-later
 */
// CW-85 - the backing behind the characters ("Day").
//
// The pure half: given the frame's surface classes and its linear depth, what
// colour goes behind each cell. No DOM, no three.js, no canvas - the
// controller hands this the two byte arrays the class pass already produced
// and hands the result to the converter, which paints it under the glyphs.
//
// WHY IT IS A LAYER AND NOT A DECISION. Everything else the converter does to
// a cell is a CHOICE about that cell - which glyph, which palette entry,
// solid or characters. This is not: it is paint that goes down before the
// glyph and is overwritten by it. It is computed after the glyphs are chosen
// and cannot be read by anything that chooses them, which is why "Day changes
// no glyph" is a fact about the shape of the code and not a promise anybody
// has to keep.
//
// WHY THE DEPTH IS LINEAR. The class pass already carried a depth BUFFER for
// occlusion, but that one is the GPU's non-linear curve; a tint faded on it
// would collapse in the first few metres and then barely move for two
// hundred. CW-85 writes metres into the pass's free B channel instead.

import { driveColor } from '../_hfm-paint.js';
import { CLASS_DEPTH_FAR_M } from './city-class-pass.js';
import {
  CITY_BACKING_COLOUR,
  CITY_BACKING_MONO_DRIVE,
  CITY_BACKING_EXEMPT_CLASS_IDS,
  CITY_BACKING_NEAR_M,
  CITY_BACKING_FAR_M,
} from './hc-palettes.js';

/**
 * The metres a depth byte from the class pass stands for.
 *
 * @param {number} byte 0..255 as written into the B channel
 * @returns {number} metres from the eye
 */
export function depthMetres(byte) {
  return (byte / 255) * CLASS_DEPTH_FAR_M;
}

/**
 * How strongly a surface at `metres` is backed: 1 near, 0 at the fog's far.
 *
 * Straight-line between the two, because the thing it has to agree with is
 * the scene's own linear fog. A curve here would put the tint and the fog on
 * different schedules and draw a band where they disagree.
 *
 * @param {number} metres
 * @returns {number} 0..1
 */
export function backingFade(metres) {
  if (!(metres > 0)) return 1;
  if (metres <= CITY_BACKING_NEAR_M) return 1;
  if (metres >= CITY_BACKING_FAR_M) return 0;
  return (
    (CITY_BACKING_FAR_M - metres) / (CITY_BACKING_FAR_M - CITY_BACKING_NEAR_M)
  );
}

/** '#rrggbb' -> [r, g, b] 0..255. */
function hexBytes(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Pack an opaque colour the way a Uint32 view over RGBA bytes reads it.
 *
 * The frame buffer is a Uint32Array over an ImageData's bytes, so on a
 * little-endian machine one cell is 0xAABBGGRR. Every platform this ships to
 * is little-endian; the converter's own atlas cache has read pixels this way
 * since CW-22.
 *
 * @param {number} r 0..255
 * @param {number} g
 * @param {number} b
 * @returns {number}
 */
export function packRGBA(r, g, b) {
  return (((255 << 24) | (b << 16) | (g << 8) | r) >>> 0) >>> 0;
}

const EXEMPT = new Set(CITY_BACKING_EXEMPT_CLASS_IDS);

/**
 * The colour table for one frame's palette and mode, as packed pixels.
 *
 * Built per (mode, palette) and cached by the caller: the tables never move
 * at run time, and rebuilding 15 entries per converted frame would be work
 * for nothing.
 *
 * @param {{mono: boolean, palette: 'green'|'amber', phosphor: string}} opts
 * @returns {Uint32Array} indexed by SURFACE_CLASS id
 */
export function backingTable({ mono, palette, phosphor }) {
  const table = CITY_BACKING_COLOUR[palette] ?? CITY_BACKING_COLOUR.green;
  const drives =
    CITY_BACKING_MONO_DRIVE[palette] ?? CITY_BACKING_MONO_DRIVE.green;
  const ids = Object.keys(table).map(Number);
  const out = new Uint32Array(Math.max(...ids) + 1);
  for (const id of ids) {
    if (EXEMPT.has(id)) {
      out[id] = 0;
      continue;
    }
    const hex = mono ? driveColor(phosphor, drives[id] ?? 0) : table[id];
    const [r, g, b] = hexBytes(hex);
    out[id] = packRGBA(r, g, b);
  }
  return out;
}

/**
 * CW-85's SECOND tint source, measured against the class table before either
 * shipped: the cell's OWN colour, driven down to a fixed low luminance.
 *
 * Where the table says "a road is slate", this says "whatever this cell came
 * out, but dark". It needs no table and can never miss a class, which sounds
 * like the better idea until you look at it - see the record for what the
 * pictures said.
 *
 * @param {string[]} palette the entries the converter is drawing with
 * @param {number} drive
 * @returns {Uint32Array} indexed by palette entry
 */
export function sampledTable(palette, drive) {
  const out = new Uint32Array(palette.length);
  for (let i = 0; i < palette.length; i++) {
    const [r, g, b] = hexBytes(driveColor(palette[i], drive));
    out[i] = packRGBA(r, g, b);
  }
  return out;
}

/** How far down the sampled source drives a cell's own colour. */
export const SAMPLED_BACKING_DRIVE = 0.1;

/**
 * One frame's backing, one packed colour per cell (0 = leave the cell bare).
 *
 * @param {object} args
 * @param {Uint8Array} args.classMap one SURFACE_CLASS id per cell
 * @param {Uint8Array} args.depthMap the same cells' linear depth bytes
 * @param {Uint32Array} args.table from backingTable()
 * @param {Uint32Array} [args.sampled] from sampledTable(), to use the cell's
 *   own colour instead of its class - the CW-85 experiment, off by default
 * @param {Uint8Array} [args.colorIndices] the cells' palette entries
 * @param {Uint32Array} [args.out] reused between frames
 * @returns {Uint32Array}
 */
export function buildBacking({
  classMap,
  depthMap,
  table,
  sampled = null,
  colorIndices = null,
  out,
}) {
  const n = classMap.length;
  const dst = out && out.length === n ? out : new Uint32Array(n);
  const bySample = Boolean(sampled && colorIndices);
  for (let i = 0; i < n; i++) {
    const id = classMap[i];
    // The exemptions are a CLASS question either way: the sky is not a
    // surface, whatever colour the converter picked for it.
    const base =
      table[id] === 0 || table[id] === undefined
        ? 0
        : bySample
          ? (sampled[colorIndices[i]] ?? 0)
          : table[id];
    if (base === 0) {
      dst[i] = 0;
      continue;
    }
    const fade = backingFade(depthMetres(depthMap[i]));
    if (fade <= 0) {
      dst[i] = 0;
      continue;
    }
    if (fade >= 1) {
      dst[i] = base;
      continue;
    }
    // Fading toward the page's own black is a scale, not a blend: the canvas
    // sits on black, so a dimmer opaque pixel and a translucent one land on
    // the same colour and the opaque one costs no per-pixel arithmetic in the
    // paint loop.
    const r = ((base & 255) * fade) | 0;
    const g = (((base >> 8) & 255) * fade) | 0;
    const b = (((base >> 16) & 255) * fade) | 0;
    dst[i] = r === 0 && g === 0 && b === 0 ? 0 : packRGBA(r, g, b);
  }
  return dst;
}
