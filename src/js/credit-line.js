/**
 * The credit line a stock icon carries, and how to take it off.
 *
 * An icon downloaded from a stock library usually arrives with its attribution
 * printed along the bottom edge: "Created by Ilham Fitrotul Hayat from Noun
 * Project". Traced, that sentence is not a caption any more - it is forty-odd
 * separate shapes, each one a letter, and on a charm fourteen millimeters wide
 * they come out as unreadable specks that soak up print time and cannot be
 * felt. MEASURED across nine icons: 45 to 60 of every 49 to 74 shapes were the
 * caption. The icon was the small part.
 *
 * So the picture a person chose is not the picture they got, and this finds the
 * difference and offers to remove it.
 *
 * ── What counts as a credit line ─────────────────────────────────────────
 *
 * A cluster of at least eight shapes, each small in both directions, whose
 * centers sit in the bottom band, and which together occupy a short strip.
 * Every clause earns its place:
 *
 *   - EIGHT, because a sentence has many letters and a drawing rarely has
 *     eight separate small marks in a row along its bottom edge. It is also
 *     what protects a drawing that legitimately ends in a few dots.
 *   - SMALL IN BOTH DIRECTIONS, because a letter is small; a baseline rule or
 *     a wide shadow is not.
 *   - IN THE BOTTOM BAND, because that is where attribution is printed.
 *   - A SHORT STRIP, because a line of text is one or two lines tall. Detail
 *     scattered through the lower third of a drawing is drawing, not a caption.
 *
 * MEASURED with these numbers on both tracing engines, over the nine icons and
 * three control pictures: it fires on all nine icons and on the one control
 * that genuinely has a printed line along its bottom edge, never on the two
 * hand-drawn fixtures, and NOTHING of a caption is left behind - zero kept
 * shapes inside the band, on every picture, on both engines.
 *
 * ── Undo ─────────────────────────────────────────────────────────────────
 *
 * The original SVG is handed back with the result. Undo puts that string back
 * rather than reassembling the removed pieces: reassembly is a second chance to
 * be wrong, and there is nothing to gain from taking it.
 *
 * @license GPL-3.0-or-later
 */

import { getPathBBox } from 'svg-path-commander';

/**
 * The rule, as signed. Exported so a test can state what it is testing and so
 * the numbers live in one place rather than in four conditions.
 */
export const CREDIT_LINE_RULE = Object.freeze({
  /** Fewer shapes than this is not a sentence. */
  minShapes: 8,
  /** A shape wider than this share of the picture is not a letter. */
  maxShapeWidthShare: 0.06,
  /** Nor is a taller one. */
  maxShapeHeightShare: 0.06,
  /** How far up from the bottom edge to look. */
  bandFromBottom: 0.2,
  /** A line of text is a short strip, not a scattering. */
  maxClusterHeightShare: 0.12,
});

/** The picture's own size, from whichever attribute carries it. */
function sizeOf(svg) {
  const width = parseFloat(svg.getAttribute('width'));
  const height = parseFloat(svg.getAttribute('height'));
  if (width > 0 && height > 0) return { width, height };
  const box = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/);
  if (box.length === 4) {
    const w = parseFloat(box[2]);
    const h = parseFloat(box[3]);
    if (w > 0 && h > 0) return { width: w, height: h };
  }
  return null;
}

/** Split one `d` into its closed subpaths, on the move commands. */
function subpathsOf(pathData) {
  if (!pathData) return [];
  const parts = [];
  const re = /[Mm][^Mm]*/g;
  let match;
  while ((match = re.exec(pathData)) !== null) {
    const piece = match[0].trim();
    if (piece) parts.push(piece);
  }
  return parts.length > 0 ? parts : [pathData.trim()];
}

/**
 * How many pieces the sliced pass takes between two checkpoints (DP-78 P3,
 * D-171). MEASURED in Chromium at 4x on a 900-ring traced drawing: the
 * whole pass is 210 ms, one box per ring; a hundred rings is about 25 ms.
 */
const CREDIT_SLICE = 100;

/** The drawing to look at, or the reason there is none. */
function drawingOf(svgString) {
  if (!svgString) return { reason: 'no drawing' };
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return { reason: 'no drawing' };
  const size = sizeOf(svg);
  if (!size) return { reason: 'the drawing does not say how big it is' };
  return { svg, size };
}

/** Every path's pieces in document order, each with its path's index. */
function piecesOf(paths) {
  const out = [];
  paths.forEach((path, index) => {
    for (const piece of subpathsOf(path.getAttribute('d'))) {
      out.push({ index, piece });
    }
  });
  return out;
}

/** One piece's box, or null when its path data cannot be read. */
function boxOfPiece(piece) {
  try {
    return getPathBBox(piece);
  } catch {
    return null;
  }
}

/** Letter-sized in both directions, and centered in the bottom band. */
function isLetterBox(b, size, r, bandTop) {
  return (
    b.width <= r.maxShapeWidthShare * size.width &&
    b.height <= r.maxShapeHeightShare * size.height &&
    b.y + b.height / 2 >= bandTop
  );
}

/** Count the letter-sized pieces `from` to `to` (exclusive) into the tally. */
function tallyPieces(pieces, from, to, size, r, bandTop, tally) {
  const end = Math.min(to, pieces.length);
  for (let i = from; i < end; i++) {
    const b = boxOfPiece(pieces[i].piece);
    if (!b || !isLetterBox(b, size, r, bandTop)) continue;
    tally.count++;
    tally.box = tally.box
      ? {
          minX: Math.min(tally.box.minX, b.x),
          minY: Math.min(tally.box.minY, b.y),
          maxX: Math.max(tally.box.maxX, b.x + b.width),
          maxY: Math.max(tally.box.maxY, b.y + b.height),
        }
      : { minX: b.x, minY: b.y, maxX: b.x + b.width, maxY: b.y + b.height };
  }
}

/** The verdict on a tally: a line, too few, or scattered. */
function creditVerdict(tally, size, r, none) {
  const { count, box } = tally;
  if (count < r.minShapes) {
    return none(`only ${count} small shapes along the bottom edge`);
  }
  const clusterHeight = box.maxY - box.minY;
  if (clusterHeight > r.maxClusterHeightShare * size.height) {
    return none('the small shapes are scattered, not in a line');
  }
  return { found: true, count, box, reason: `${count} shapes in a line` };
}

/** The slicing options of the async passes, with their defaults. */
function sliceOptions(options = {}) {
  return {
    checkpoint:
      typeof options.checkpoint === 'function'
        ? options.checkpoint
        : async () => {},
    every: options.every > 0 ? options.every : CREDIT_SLICE,
  };
}

/**
 * Look for a credit line.
 *
 * @param {string} svgString a traced drawing
 * @param {object} [rule] any of CREDIT_LINE_RULE's numbers, to override
 * @returns {{found: boolean, count: number, box: object|null, reason: string}}
 *   `reason` says which clause decided it, which is what a test asserts on and
 *   what a person would want if they ever asked why.
 */
export function findCreditLine(svgString, rule = {}) {
  const r = { ...CREDIT_LINE_RULE, ...rule };
  const none = (reason) => ({ found: false, count: 0, box: null, reason });
  const drawing = drawingOf(svgString);
  if (drawing.reason) return none(drawing.reason);
  const { svg, size } = drawing;

  const bandTop = (1 - r.bandFromBottom) * size.height;
  const pieces = piecesOf(Array.from(svg.querySelectorAll('path')));
  const tally = { count: 0, box: null };
  tallyPieces(pieces, 0, pieces.length, size, r, bandTop, tally);
  return creditVerdict(tally, size, r, none);
}

/**
 * findCreditLine a slice at a time (DP-78 P3, D-171): `checkpoint` is
 * awaited every `every` pieces, so a Cancel pressed while a traced drawing
 * is looked over lands within one slice. The answer is findCreditLine's.
 *
 * @param {string} svgString
 * @param {object} [rule]
 * @param {{checkpoint?: Function, every?: number}} [options]
 */
export async function findCreditLineAsync(svgString, rule = {}, options = {}) {
  const { checkpoint, every } = sliceOptions(options);
  const r = { ...CREDIT_LINE_RULE, ...rule };
  const none = (reason) => ({ found: false, count: 0, box: null, reason });
  const drawing = drawingOf(svgString);
  if (drawing.reason) return none(drawing.reason);
  const { svg, size } = drawing;

  const bandTop = (1 - r.bandFromBottom) * size.height;
  const pieces = piecesOf(Array.from(svg.querySelectorAll('path')));
  const tally = { count: 0, box: null };
  for (let from = 0; from < pieces.length; from += every) {
    if (from > 0) await checkpoint();
    tallyPieces(pieces, from, from + every, size, r, bandTop, tally);
  }
  return creditVerdict(tally, size, r, none);
}

/**
 * Take a credit line off a traced drawing.
 *
 * Works whichever way the tracer grouped its output: one compound path holding
 * every shape, or one element per shape with holes folded in. Shapes are
 * dropped subpath by subpath and an element left with nothing is removed.
 *
 * @param {string} svgString
 * @param {object} [rule]
 * @returns {{svg: string, removed: number, original: string, box: object|null}}
 *   `svg` is unchanged and `removed` is 0 when no credit line was found.
 */
export function removeCreditLine(svgString, rule = {}) {
  const r = { ...CREDIT_LINE_RULE, ...rule };
  const unchanged = {
    svg: svgString,
    removed: 0,
    original: svgString,
    box: null,
  };

  const look = findCreditLine(svgString, r);
  if (!look.found) return unchanged;

  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  const size = sizeOf(svg);
  const bandTop = (1 - r.bandFromBottom) * size.height;

  let removed = 0;
  for (const path of Array.from(svg.querySelectorAll('path'))) {
    const kept = [];
    for (const piece of subpathsOf(path.getAttribute('d'))) {
      const b = boxOfPiece(piece);
      if (b && isLetterBox(b, size, r, bandTop)) removed++;
      else kept.push(piece);
    }
    if (kept.length === 0) path.parentNode.removeChild(path);
    else path.setAttribute('d', kept.join(''));
  }

  if (removed === 0) return unchanged;
  return {
    svg: new XMLSerializer().serializeToString(svg),
    removed,
    original: svgString,
    box: look.box,
  };
}

/**
 * removeCreditLine a slice at a time (DP-78 P3, D-171): both passes, the
 * look and the removal, await `checkpoint` every `every` pieces. The result
 * is removeCreditLine's, to the byte.
 *
 * @param {string} svgString
 * @param {object} [rule]
 * @param {{checkpoint?: Function, every?: number}} [options]
 */
export async function removeCreditLineAsync(
  svgString,
  rule = {},
  options = {}
) {
  const { checkpoint, every } = sliceOptions(options);
  const r = { ...CREDIT_LINE_RULE, ...rule };
  const unchanged = {
    svg: svgString,
    removed: 0,
    original: svgString,
    box: null,
  };

  const look = await findCreditLineAsync(svgString, r, options);
  if (!look.found) return unchanged;

  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  const size = sizeOf(svg);
  const bandTop = (1 - r.bandFromBottom) * size.height;

  const paths = Array.from(svg.querySelectorAll('path'));
  const pieces = piecesOf(paths);
  const kept = paths.map(() => []);
  let removed = 0;
  for (let i = 0; i < pieces.length; i++) {
    if (i > 0 && i % every === 0) await checkpoint();
    const { index, piece } = pieces[i];
    const b = boxOfPiece(piece);
    if (b && isLetterBox(b, size, r, bandTop)) removed++;
    else kept[index].push(piece);
  }
  paths.forEach((path, index) => {
    if (kept[index].length === 0) path.parentNode.removeChild(path);
    else path.setAttribute('d', kept[index].join(''));
  });

  if (removed === 0) return unchanged;
  return {
    svg: new XMLSerializer().serializeToString(svg),
    removed,
    original: svgString,
    box: look.box,
  };
}
