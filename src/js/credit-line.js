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
  if (!svgString) return none('no drawing');

  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return none('no drawing');
  const size = sizeOf(svg);
  if (!size) return none('the drawing does not say how big it is');

  const bandTop = (1 - r.bandFromBottom) * size.height;
  let count = 0;
  let box = null;
  for (const path of svg.querySelectorAll('path')) {
    for (const piece of subpathsOf(path.getAttribute('d'))) {
      let b;
      try {
        b = getPathBBox(piece);
      } catch {
        continue;
      }
      if (b.width > r.maxShapeWidthShare * size.width) continue;
      if (b.height > r.maxShapeHeightShare * size.height) continue;
      if (b.y + b.height / 2 < bandTop) continue;
      count++;
      box = box
        ? {
            minX: Math.min(box.minX, b.x),
            minY: Math.min(box.minY, b.y),
            maxX: Math.max(box.maxX, b.x + b.width),
            maxY: Math.max(box.maxY, b.y + b.height),
          }
        : { minX: b.x, minY: b.y, maxX: b.x + b.width, maxY: b.y + b.height };
    }
  }

  if (count < r.minShapes) {
    return none(`only ${count} small shapes along the bottom edge`);
  }
  const clusterHeight = box.maxY - box.minY;
  if (clusterHeight > r.maxClusterHeightShare * size.height) {
    return none('the small shapes are scattered, not in a line');
  }
  return { found: true, count, box, reason: `${count} shapes in a line` };
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
      let b;
      try {
        b = getPathBBox(piece);
      } catch {
        kept.push(piece);
        continue;
      }
      const isLetter =
        b.width <= r.maxShapeWidthShare * size.width &&
        b.height <= r.maxShapeHeightShare * size.height &&
        b.y + b.height / 2 >= bandTop;
      if (isLetter) removed++;
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
