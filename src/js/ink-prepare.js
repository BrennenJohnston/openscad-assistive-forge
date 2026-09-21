/**
 * The photo defaults (DP-79, D-173, D-176): what a camera picture goes through
 * before it is traced, and the one place both roads to the tracer call.
 *
 * A photograph of a printed symbol has no transparency, paper grain, and
 * twenty times the pixels a 14 mm charm can print. Traced at the file's own
 * resolution every mode made thousands of shapes of the grain (MEASURED,
 * DP-77: the panel photo 1,270 / 341 / 3,686 / 3,939 across the four modes;
 * the sharpie drawing's advisory read 0.01 mm for a 0.28 mm line, because
 * the thinnest things in the mask were specks). Three steps change that, and
 * every one is measured in build/dp-r6/dp-79/p0.log:
 *
 *   - THE WORKING RESOLUTION: the picture is resampled so that one pixel is
 *     PRINT_CELL_MM at the width the design prints (forty pixels per printed
 *     millimeter; 560 px at the editor's 14 mm), never up, never under
 *     WORKING_MIN_PX on the long side. The panel photo goes from 1331 to 560
 *     px and its Line art from 1,303 shapes to 384 by this step alone.
 *   - THE MEDIAN (`smooth`): the 3x3 median ink-extraction.js already offered
 *     for photographs, on for a camera picture. 384 to 224.
 *   - THE SPECK FLOOR (`speckFloor`): pieces of the ink mask under 0.1 mm² at
 *     the printed size are dropped and counted, and Potrace's turdsize is set
 *     to the same number so the two engines agree. 224 to 25; the sharpie's
 *     advisory 0.014 to 0.275 mm, because the widths are measured after it.
 *   - THE CLOSE, on Solid shape only: a 0.1 mm close bridges the gaps crayon
 *     leaves, so the panel's glove and sponge come out whole (8 to 6). Line
 *     art gets no close; closing a line drawing fills its counters.
 *
 * A FILE is left exactly as it was: the nine library icons, the owner's logo
 * and the repo's fixtures are pinned unchanged, because the floor that helps
 * a photograph deletes a logo's small text (145 shapes to 22, the DP-48 P2
 * refusal). Which picture is a camera's is the quick look's `camera` verdict
 * (quick-look.js): no transparency, and a ground that is not flat at the
 * thumbnail scale. The host passes it with `mmPerPixel`, `smooth` and
 * `speckFloor`; with none of them set, nothing here runs and the trace is the
 * trace it was before DP-79.
 *
 * Pure arithmetic over pixel buffers, no DOM: it runs in the trace worker,
 * and the main-thread converter in image-import.js calls the same functions
 * so the two roads cannot drift (the D-138 lesson: a setting the host passes
 * is not a setting the worker uses until the worker names it).
 *
 * @license GPL-3.0-or-later
 */

import { PRINT_CELL_MM } from './print-cell.js';
import {
  extractInk,
  maskToImageData,
  floorPx,
  dropSmallPieces,
  closeMask,
} from './ink-extraction.js';

/** The long side never goes under this many pixels, however small the print. */
export const WORKING_MIN_PX = 400;

/** The speck floor, in square millimeters at the printed size (floorPx's own). */
export const SPECK_FLOOR_MM2 = 0.1;

/** The close on a Solid shape, in millimeters at the printed size. */
export const CLOSE_MM = 0.1;

/**
 * By how much a picture is shrunk to be worked at the print's cell.
 *
 * @param {number} width - The picture's pixels across
 * @param {number} height
 * @param {number} printedWidthMm - How wide it will print
 * @returns {number} A factor above 1 to shrink by, or 1 to leave it alone
 */
export function workingFactor(width, height, printedWidthMm) {
  if (!(width > 0) || !(height > 0) || !(printedWidthMm > 0)) return 1;
  const target = Math.round(printedWidthMm / PRINT_CELL_MM);
  let factor = width / target;
  factor = Math.min(factor, Math.max(width, height) / WORKING_MIN_PX);
  return factor > 1 ? factor : 1;
}

/**
 * Shrink a picture by a fractional factor with a box filter: every output
 * pixel is the area-weighted mean of the source pixels under it, edge
 * pixels weighted by how much of them is under it. `downscaleToCap` takes
 * whole-number steps, which would halve a 600 px picture asked for 560.
 *
 * @param {{width: number, height: number, data: Uint8ClampedArray}} imageData
 * @param {number} factor - Above 1
 * @returns {{imageData: object, factor: number}} The picture and the exact
 *   factor applied (the widths are whole pixels)
 */
export function resampleBy(imageData, factor) {
  const { width, height, data } = imageData;
  if (!(factor > 1)) return { imageData, factor: 1 };
  const w = Math.max(1, Math.round(width / factor));
  const h = Math.max(1, Math.round(height / factor));
  const spans = (n, limit) => {
    const s = limit / n;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const start = i * s;
      const end = Math.min(limit, (i + 1) * s);
      const idx = [];
      const wt = [];
      for (let p = Math.floor(start); p < Math.ceil(end); p++) {
        const overlap = Math.min(end, p + 1) - Math.max(start, p);
        if (overlap > 1e-9) {
          idx.push(p);
          wt.push(overlap);
        }
      }
      out[i] = { idx, wt };
    }
    return out;
  };
  const xs = spans(w, width);
  const ys = spans(h, height);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const { idx: yi, wt: yw } = ys[y];
    for (let x = 0; x < w; x++) {
      const { idx: xi, wt: xw } = xs[x];
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let j = 0; j < yi.length; j++) {
        const row = yi[j] * width;
        for (let i = 0; i < xi.length; i++) {
          const wgt = yw[j] * xw[i];
          const o = (row + xi[i]) * 4;
          r += data[o] * wgt;
          g += data[o + 1] * wgt;
          b += data[o + 2] * wgt;
          a += data[o + 3] * wgt;
          n += wgt;
        }
      }
      const d = (y * w + x) * 4;
      out[d] = r / n;
      out[d + 1] = g / n;
      out[d + 2] = b / n;
      out[d + 3] = a / n;
    }
  }
  return { imageData: { width: w, height: h, data: out }, factor: width / w };
}

/**
 * The picture the trace works on. A camera picture with a known printed
 * width is resampled to the print's cell; anything else is handed back as
 * it came, with the millimeters per pixel it arrived with.
 *
 * @param {{width: number, height: number, data: Uint8ClampedArray}} pixels
 * @param {object|null} ink - The ink settings; `camera` and `mmPerPixel`
 *   (millimeters one SOURCE pixel prints as) decide
 * @returns {{pixels: object, mmPerPixel: number, working: object|null}}
 *   `mmPerPixel` is for the pixels handed back; `working` says what was done
 */
export function workingPicture(pixels, ink) {
  const mmPerPixel = ink && ink.mmPerPixel > 0 ? ink.mmPerPixel : 0;
  if (!ink || !ink.camera || !(mmPerPixel > 0)) {
    return { pixels, mmPerPixel, working: null };
  }
  const printedWidthMm = mmPerPixel * pixels.width;
  const factor = workingFactor(pixels.width, pixels.height, printedWidthMm);
  if (!(factor > 1)) return { pixels, mmPerPixel, working: null };
  const { imageData } = resampleBy(pixels, factor);
  return {
    pixels: imageData,
    mmPerPixel: printedWidthMm / imageData.width,
    working: {
      from: pixels.width,
      width: imageData.width,
      height: imageData.height,
      factor: +(pixels.width / imageData.width).toFixed(2),
      printedWidthMm: +printedWidthMm.toFixed(2),
    },
  };
}

/**
 * The ink stage with the photo defaults: the median (through extractInk's
 * own `denoise`), the speck floor, the close on a Solid shape. The mask that
 * comes back is the one to measure line widths on and to trace.
 *
 * @param {object} pixels - The picture the trace works on (see workingPicture)
 * @param {object} ink - The ink settings, `mmPerPixel` being the one for
 *   THESE pixels
 * @param {{makeImageData: Function}} deps
 * @returns {{pixels: object, mask: Uint8Array|null, summary: object,
 *   turdsize: number|undefined}} `turdsize` is the floor for Potrace, when
 *   the floor ran
 */
export function inkStage(pixels, ink, { makeImageData }) {
  const extracted = extractInk(pixels, {
    ...ink,
    denoise: !!ink.smooth,
    makeImageData,
  });
  const { width, height } = pixels;
  let mask = extracted.mask;
  const mmPerPixel = ink.mmPerPixel > 0 ? ink.mmPerPixel : 0;
  const floor =
    mask && ink.speckFloor && mmPerPixel > 0 ? floorPx(mmPerPixel) : 0;
  let specks = 0;
  let closed = false;
  if (floor > 0) {
    mask = new Uint8Array(mask);
    specks = dropSmallPieces(mask, width, height, floor);
  }
  if (mask && ink.mode === 'silhouette' && ink.camera && mmPerPixel > 0) {
    const radius = Math.max(1, Math.round(CLOSE_MM / mmPerPixel));
    mask = closeMask(mask, width, height, radius);
    // A close can leave a sliver where two gaps met; the floor takes it, and
    // what it takes here is not a speck a person would count.
    if (floor > 0) dropSmallPieces(mask, width, height, floor);
    closed = true;
  }
  const changed = mask !== extracted.mask;
  return {
    pixels: changed
      ? maskToImageData(mask, width, height, makeImageData)
      : extracted.imageData,
    mask,
    summary: {
      ...extracted.summary,
      specksDropped: specks,
      speckFloorMm2: floor > 0 ? SPECK_FLOOR_MM2 : null,
      closed,
      ...(mmPerPixel > 0
        ? { printedWidthMm: +(mmPerPixel * width).toFixed(2) }
        : {}),
    },
    turdsize: floor > 0 ? Math.round(floor) : undefined,
  };
}
