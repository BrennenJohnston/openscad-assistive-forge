/**
 * The ring flatten: a drawing's shapes folded into one printable region.
 *
 * It lives apart from the editor that shows the result because a worker has to
 * import it and the editor's own module builds a DOM. What is here touches
 * nothing but arrays of numbers and strings, which is what makes moving the
 * work off the main thread possible at all.
 *
 * ★ WHY IT HAD TO MOVE. MEASURED in Chromium, on the main thread, over traced
 * curves, with the engine that ships today:
 *
 *     shapes   ring points   flatten
 *         50         8,750       485 ms
 *        100        16,140     2,306 ms
 *        200        34,382    14,702 ms
 *        400        70,368    87,023 ms
 *        800       132,892   507,242 ms   (eight and a half minutes)
 *
 * The page could not answer for any of it. DP-34 moved the TRACE off the main
 * thread; this is the same defect one stage later.
 *
 * @license GPL-3.0-or-later
 */

import { offsetRing } from './svg-offset.js';

/**
 * D-120 (DP-26 P1): flatten classified elements through the ring engine.
 *
 * The old road, `flattenToCompoundPath`, unions the elements PAIRWISE with
 * path-bool under even-odd, which is order-dependent once shapes overlap -
 * and on this app's own logo (139 converted strokes) the pairwise chain
 * does not merely corrupt: MEASURED, it exhausts an 8 GB node heap and
 * dies. The ring road reads each element on its own terms (even-odd, so a
 * counter stays a counter), then combines every region in one NonZero
 * union - order-independent, and the same fixture finishes in seconds
 * (1,280 rings, area 1,265 svg units squared).
 *
 * The cost, stated: rings are polylines, so curves leave at the ring
 * engine's resolution - the same trade the stencil lane shipped with
 * (plates reproduced at IoU 0.952). An element whose rings cannot be read
 * is appended verbatim on its own even-odd path, counted into the warning,
 * and never dropped.
 *
 * The engine arrives as an argument so the workspace stays out of the lazy
 * chunk's way: this file is core, clipper is not.
 *
 * @param {object} engine - The ring-geometry module
 * @param {Array} classifiedElements - Output of classifyElements()
 * @param {object} [svgMeta]
 * @param {string[]} [warningsOut]
 * @returns {string|null}
 */
export function flattenWithRings(
  engine,
  classifiedElements,
  svgMeta = {},
  warningsOut = null
) {
  const foreground = classifiedElements.filter(
    (el) => el.role === 'foreground' && el.pathData
  );
  const holes = classifiedElements.filter(
    (el) => el.role === 'hole' && el.pathData
  );
  if (foreground.length === 0) return null;

  const fallbacks = [];
  const readRegion = (el) => {
    try {
      const rings = engine.evenOddUnion(engine.ringsFromPathData(el.pathData));
      if (rings.length === 0) {
        fallbacks.push(el.pathData);
        return null;
      }
      return rings;
    } catch {
      fallbacks.push(el.pathData);
      return null;
    }
  };

  // ★ Regions are combined ONE AT A TIME, subject against clip - never by
  // pouring every region's rings into a single NonZero subject. In one
  // list the windings sum ACROSS regions: element B's solid ring inside
  // element A's counter counts +1 - 1 = 0 and the area vanishes. MEASURED
  // on the bird fixture: six healthy foreground regions one-shot-unioned
  // to an EMPTY result, while the logo survived only because its bands'
  // windings happened not to cancel. A fold of true unions is
  // order-independent in the only sense that matters: the union of sets
  // does not care what order it was taken in.
  const combine = (elements) => {
    let region = null;
    for (const el of elements) {
      const rings = readRegion(el);
      if (!rings) continue;
      region = region === null ? rings : engine.union(region, rings);
    }
    return region || [];
  };

  let region = combine(foreground);
  // Holes cut ONE AT A TIME, and a hole that would erase the whole drawing
  // is the PAPER, not a cut. The bird fixture is the measured case: its
  // full-bleed background rect is auto-classified as a hole, and
  // subtracting it legally empties everything - the old flatten hid this
  // by silently discarding an empty difference. The same law the
  // silhouette already states ("a root classified as a hole is a
  // background") is applied here explicitly, per hole, and said out loud.
  let paperHoles = 0;
  for (const el of holes) {
    if (region.length === 0) break;
    const rings = readRegion(el);
    if (!rings) continue;
    const cut = engine.difference(region, rings);
    if (cut.length === 0) {
      paperHoles += 1;
      continue;
    }
    region = cut;
  }
  if (paperHoles > 0 && Array.isArray(warningsOut)) {
    warningsOut.push(
      `${paperHoles} cut-out(s) would have erased the whole drawing and were treated as the background`
    );
  }
  return regionSvg(engine, region, fallbacks, svgMeta, warningsOut);
}

/**
 * The SVG both flattens hand back: the region as one nonzero path, and the
 * shapes that could not be read appended verbatim on an even-odd path of
 * their own, counted into the warning and never dropped.
 */
function regionSvg(engine, region, fallbacks, svgMeta, warningsOut) {
  if (region.length === 0 && fallbacks.length === 0) return null;

  if (fallbacks.length > 0 && Array.isArray(warningsOut)) {
    warningsOut.push(
      `${fallbacks.length} shape(s) could not be merged and were appended as-is`
    );
  }

  const { viewBox, width, height } = svgMeta;
  let attrs = 'xmlns="http://www.w3.org/2000/svg"';
  if (viewBox) attrs += ` viewBox="${viewBox}"`;
  if (width) attrs += ` width="${width}"`;
  if (height) attrs += ` height="${height}"`;

  let body = '';
  if (region.length > 0) {
    body += `<path d="${engine.ringsToPathData(region)}" fill="black" fill-rule="nonzero"/>`;
  }
  if (fallbacks.length > 0) {
    body += `<path d="${fallbacks.join(' ')}" fill="black" fill-rule="evenodd"/>`;
  }
  return `<svg ${attrs}>${body}</svg>`;
}

/**
 * A set of rings read as ONE drawing, each ring offset by its own amount,
 * folded into a region (DP-82, D-174).
 *
 * The rings are read the way an even-odd fill reads them: a ring inside a
 * ring is a hole, a ring inside that is solid again. "+" is more ink on
 * every ring, so a solid ring grows by its offset and a hole ring SHRINKS
 * by its (the sign is the ring's parity, applied here to the amount the
 * caller hands in); a drawn line, two rings, thickens by twice the offset.
 * A hole shrunk to nothing is closed; a solid shrunk to nothing is gone.
 *
 * Then each solid ring, minus the holes directly inside it, is one region,
 * and the regions are folded together as `flattenWithRings` folds a
 * drawing's shapes: a NonZero union, so a ring grown into its neighbor
 * merges with it instead of inverting it, which is what the even-odd
 * concatenation did to the sharpie's pump at +1 mm (DP-77 P0d). And an
 * island inside a hole is its own region and survives: the same rings
 * handed to `flattenWithRings` one per element lose it, because the island
 * is unioned into the outer ring and cut away with the hole (MEASURED,
 * `dp82-nesting-probe`: 3,600 of 4,800 units squared kept).
 *
 * @param {object} engine - The ring-geometry module
 * @param {Array<Array<{x: number, y: number}>>} rings
 * @param {(index: number) => number} deltaOf - Each ring's offset in the
 *   drawing's units, before the parity sign; 0 for none
 * @returns {Array<Array<{x: number, y: number}>>} The region, clipper's
 *   convention (solids positive, holes negative); empty when nothing is left
 */
export function offsetDrawing(engine, rings, deltaOf) {
  const nesting = engine.nestingOf(rings);
  const parts = rings.map((ring, i) => {
    const solid = nesting[i].depth % 2 === 0;
    const positive = engine.areaOf(ring) < 0 ? [...ring].reverse() : ring;
    const delta = (deltaOf(i) || 0) * (solid ? 1 : -1);
    if (!delta) return [positive];
    const offset = offsetRing(positive, delta);
    // A ring the builder could not offset (fewer than three usable edges)
    // stays as drawn; one that collapsed is gone.
    return offset === null ? [positive] : offset;
  });

  let region = null;
  nesting.forEach((node, i) => {
    if (node.depth % 2 !== 0 || parts[i].length === 0) return;
    let solidRegion = engine.union(parts[i]);
    const holes = [];
    nesting.forEach((other, j) => {
      if (other.parent === i) holes.push(...parts[j]);
    });
    if (holes.length > 0) {
      solidRegion = engine.difference(solidRegion, engine.union(holes));
    }
    if (solidRegion.length === 0) return;
    region = region === null ? solidRegion : engine.union(region, solidRegion);
  });
  return region || [];
}

/**
 * The compound road's combine when any row carries an offset (DP-82).
 *
 * A traced drawing is one path whose rings are the editor's rows, and with
 * no offset set the rows are concatenated back into one even-odd path,
 * which is exact and instant. An offset ring can no longer be read that
 * way: the concatenation's fill inverts wherever a grown ring reaches a
 * neighbor. So the rows go through `offsetDrawing` as one drawing, each
 * with its own offset, read by the parity of the rows a person KEPT (an Off
 * row is out before the parity is read, as it was out of the concatenation).
 * The roles On and Cut out are the same here as they were in the
 * concatenation: labels on rings whose meaning the drawing's own nesting
 * decides.
 *
 * The cost, stated as the ring road states it: the rings leave as
 * polylines at the ring engine's resolution.
 *
 * @param {object} engine - The ring-geometry module
 * @param {Array<{pathData: string, role: string, offset?: number}>} elements
 *   - The rows, `offset` in the drawing's units (svg units)
 * @param {object} [svgMeta]
 * @param {string[]} [warningsOut]
 * @returns {string|null}
 */
export function flattenCompoundRings(
  engine,
  elements,
  svgMeta = {},
  warningsOut = null
) {
  const included = elements.filter((el) => el.role !== 'ignore' && el.pathData);
  if (included.length === 0) return null;

  const fallbacks = [];
  const rings = [];
  const offsets = [];
  for (const el of included) {
    let read = [];
    try {
      read = engine.ringsFromPathData(el.pathData);
    } catch {
      read = [];
    }
    if (read.length === 0) {
      fallbacks.push(el.pathData);
      continue;
    }
    // A row on this road is one ring; a row that reads as several keeps its
    // offset on each of them.
    for (const ring of read) {
      rings.push(ring);
      offsets.push(Number.isFinite(el.offset) ? el.offset : 0);
    }
  }

  const region = offsetDrawing(engine, rings, (i) => offsets[i]);
  return regionSvg(engine, region, fallbacks, svgMeta, warningsOut);
}
