/**
 * A shape's own thickness, at the printed size and in the picture (DP-54 P1).
 *
 * DP-36 measures the whole drawing's line width with a ridge: a distance
 * transform over the ink, and on the ridge of a stroke (the pixels that are
 * local maxima of that distance) twice the distance is the stroke's width.
 * Here the same measure is taken over ONE shape at a time, so the editor can
 * say which shapes are too thin rather than that the drawing is. The shape's
 * rings are rasterized into a small mask of that shape alone, twice: at
 * 0.025 mm per cell at the width the design will print, for the print floor
 * (what a 0.4 mm nozzle can lay); and at one cell per picture unit, for the
 * picture floor (a shape under three pixels in the picture was never traced
 * faithfully, whatever size it prints at).
 *
 * MEASURED at P0 on the owner's logo (206 shapes): both measures in about
 * 65 ms, and 1,200 rectangles in 95 ms, so the cheaper stand-in the plan
 * held in reserve (2A/P from the rings) is not needed. It would also have
 * halved a blob's width, which this does not: for a disc the ridge is about
 * its diameter, and a 0.5 mm dot prints or not by its diameter.
 *
 * Both floors are PROPOSED (accessibility rule 11: a physical readability
 * threshold is proposed, never set) and asked at DP-Q58 with P0's table.
 * A shape's rings decide only the width; the cell size caps the mask at 256
 * cells on the long side, so a shape the size of the whole picture costs
 * the same as a large one.
 *
 * @license GPL-3.0-or-later
 */

import { ringsFromPathData } from './ring-geometry.js';
import { lineWidthPercentiles } from './ink-extraction.js';

/** Under this a 0.4 mm nozzle cannot be relied on to lay a line (proposed). */
export const THIN_PRINT_MM = 0.5;
/** Under this in the picture the shape was never traced faithfully (proposed). */
export const THIN_PICTURE_PX = 3;
/** The print measure's cell, in mm. */
export const PRINT_CELL_MM = 0.025;
/** The most cells a mask has on its long side. */
export const MAX_CELLS = 256;

/**
 * Even-odd scanline fill of rings, already in cell coordinates, into a byte
 * mask. A cell is ink when its center is inside an odd number of rings.
 *
 * @param {Array<Array<{x: number, y: number}>>} rings
 * @param {number} width - cells
 * @param {number} height - cells
 * @returns {Uint8Array}
 */
export function rasterizeRings(rings, width, height) {
  const mask = new Uint8Array(width * height);
  const xs = [];
  for (let y = 0; y < height; y++) {
    const cy = y + 0.5;
    xs.length = 0;
    for (const ring of rings) {
      const n = ring.length;
      for (let i = 0; i < n; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % n];
        if (a.y === b.y) continue;
        if (cy < Math.min(a.y, b.y) || cy >= Math.max(a.y, b.y)) continue;
        xs.push(a.x + ((cy - a.y) * (b.x - a.x)) / (b.y - a.y));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k] - 0.5));
      const x1 = Math.min(width - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = x0; x <= x1; x++) mask[y * width + x] = 1;
    }
  }
  return mask;
}

function boundsOf(rings) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const p of ring) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return { minX, minY, maxX, maxY };
}

/**
 * The ridge width of the rings, in the rings' own units, measured at about
 * `cellUnits` units per cell (coarser when the shape would need more than
 * MAX_CELLS cells on its long side).
 *
 * @param {Array<Array<{x: number, y: number}>>} rings
 * @param {number} cellUnits
 * @returns {number} the p50 width in units; 0 when nothing is thicker than a cell
 */
export function ridgeWidthOfRings(rings, cellUnits) {
  if (!rings.length || !(cellUnits > 0)) return 0;
  const { minX, minY, maxX, maxY } = boundsOf(rings);
  const long = Math.max(maxX - minX, maxY - minY);
  if (!(long > 0)) return 0;
  const cell = Math.max(cellUnits, long / MAX_CELLS);
  const width = Math.ceil((maxX - minX) / cell) + 2;
  const height = Math.ceil((maxY - minY) / cell) + 2;
  const scaled = rings.map((ring) =>
    ring.map((p) => ({
      x: (p.x - minX) / cell + 1,
      y: (p.y - minY) / cell + 1,
    }))
  );
  const mask = rasterizeRings(scaled, width, height);
  return lineWidthPercentiles(mask, width, height).p50 * cell;
}

/**
 * The ridge width of a path, in its own units, at about `cellUnits` per cell.
 *
 * @param {string} pathData
 * @param {number} cellUnits
 * @returns {number}
 */
export function ridgeWidth(pathData, cellUnits) {
  return ridgeWidthOfRings(ringsFromPathData(pathData), cellUnits);
}

/**
 * One shape's thickness, both ways, and what each floor says of it.
 *
 * @param {string} pathData
 * @param {object} options
 * @param {number} options.viewBoxWidth - the drawing's width in its units
 * @param {number} options.designWidthMm - how wide the drawing will print
 * @param {number} [options.thinPrintMm] - the print floor; THIN_PRINT_MM
 * @param {number} [options.thinPicturePx] - the picture floor; THIN_PICTURE_PX
 * @returns {{measure: 'ridge'|'none', printedMm: number, picturePx: number, tooThinToPrint: boolean, tooSmallToTrace: boolean}}
 */
export function measureShapeThickness(pathData, options = {}) {
  const {
    viewBoxWidth,
    designWidthMm,
    thinPrintMm = THIN_PRINT_MM,
    thinPicturePx = THIN_PICTURE_PX,
  } = options;
  const none = {
    measure: 'none',
    printedMm: 0,
    picturePx: 0,
    tooThinToPrint: false,
    tooSmallToTrace: false,
  };
  const rings = ringsFromPathData(pathData);
  if (!rings.length || !(viewBoxWidth > 0) || !(designWidthMm > 0)) {
    return none;
  }
  const unitsPerMm = viewBoxWidth / designWidthMm;
  const printedMm =
    ridgeWidthOfRings(rings, PRINT_CELL_MM * unitsPerMm) / unitsPerMm;
  const picturePx = ridgeWidthOfRings(rings, 1);
  return {
    measure: 'ridge',
    printedMm,
    picturePx,
    tooThinToPrint: printedMm < thinPrintMm,
    tooSmallToTrace: picturePx < thinPicturePx,
  };
}

/**
 * Every shape of a drawing, in order, with the counts a notice needs.
 *
 * @param {Array<string>} pathDatas - one per shape; an empty or missing one
 *   measures as 'none'
 * @param {object} options - as measureShapeThickness
 * @returns {{shapes: Array<object>, tooThinToPrint: number, tooSmallToTrace: number, ms: number}}
 */
export function measureAllThickness(pathDatas, options = {}) {
  const started =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  const shapes = pathDatas.map((d) => measureShapeThickness(d || '', options));
  let tooThinToPrint = 0;
  let tooSmallToTrace = 0;
  for (const s of shapes) {
    if (s.tooThinToPrint) tooThinToPrint += 1;
    if (s.tooSmallToTrace) tooSmallToTrace += 1;
  }
  const ended =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { shapes, tooThinToPrint, tooSmallToTrace, ms: ended - started };
}
