/**
 * Is there enough material around the hole? (DP-11)
 *
 * When a pendant takes its shape from someone's own drawing, the outline is
 * whatever they drew, and "the top middle" is no longer a safe place to put a
 * keychain hole. It might be a wingtip. It might be nothing at all.
 *
 * This module answers one question - can a ring hole be cut here without
 * breaking out of the shape or leaving a wall too thin to survive - and says
 * so in a sentence rather than a code.
 *
 * IT NEVER MOVES THE HOLE. A hole that does not fit is reported with its
 * numbers so the person can decide. Sliding it somewhere legal would put the
 * ring where they did not choose, on a pendant shaped like their own drawing,
 * and they would have no idea it had happened.
 *
 * @license GPL-3.0-or-later
 */

import { polygonFromPathData, boundsOf, holeFits } from './svg-nesting.js';

/**
 * The thinnest wall worth printing between a hole and an edge.
 *
 * A safety-critical printability value: below this the ring tears out the
 * first time the charm is pulled. Not to be changed without the owner.
 */
export const MIN_WEB_MM = 1.2;

/**
 * Read the outline out of a companion SVG the app wrote, in millimetres.
 *
 * The outline arrives on the normalized canvas, so its own units are scaled
 * to the model's real width before anything is measured. Measuring in canvas
 * units and comparing against a millimetre web would be off by whatever the
 * scale happens to be, which is the kind of mistake that looks fine at one
 * pendant size and fails at another.
 *
 * @param {string} svgText - The outline companion
 * @param {number} widthMm - The width the model gives the body
 * @returns {{polygon: Array<{x: number, y: number}>, scale: number}|null}
 */
export function outlineInMm(svgText, widthMm) {
  if (!svgText || !(widthMm > 0)) return null;
  const d = /\sd="([^"]*)"/.exec(svgText);
  if (!d) return null;
  const { points } = polygonFromPathData(d[1]);
  const box = boundsOf(points);
  if (!box || box.maxX - box.minX <= 0) return null;

  const scale = widthMm / (box.maxX - box.minX);
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  // Centred on the origin, the way the model places it.
  return {
    polygon: points.map((p) => ({
      x: (p.x - cx) * scale,
      y: (p.y - cy) * scale,
    })),
    scale,
  };
}

/**
 * Check a hole against an outline and produce something worth reading.
 *
 * @param {object} args
 * @param {string} args.outlineSvg - The outline companion the app wrote
 * @param {number} args.widthMm - The width the model gives the body
 * @param {number} args.holeDiameterMm
 * @param {number} args.offsetXMm - Hole offset from the model's own anchor
 * @param {number} args.offsetYMm
 * @param {number} [args.anchorYMm] - Where the model puts the hole before the
 *   offsets; defaults to just inside the top of the outline
 * @param {number} [args.webMm]
 * @returns {{ok: boolean, message: string|null, clearanceMm: number,
 *   requiredMm: number, reason: string|null}}
 */
export function checkHolePlacement({
  outlineSvg,
  widthMm,
  holeDiameterMm,
  offsetXMm = 0,
  offsetYMm = 0,
  anchorYMm = null,
  webMm = MIN_WEB_MM,
}) {
  const outline = outlineInMm(outlineSvg, widthMm);
  const radius = (holeDiameterMm || 0) / 2;
  if (!outline) {
    // Nothing to check against is not the same as a problem: an ordinary
    // circular pendant has no drawn outline and needs no warning.
    return {
      ok: true,
      message: null,
      clearanceMm: 0,
      requiredMm: radius + webMm,
      reason: null,
    };
  }

  const box = boundsOf(outline.polygon);
  const anchorY = anchorYMm === null ? box.maxY - radius - 1 : anchorYMm;
  const centre = { x: offsetXMm, y: anchorY + offsetYMm };
  const r = holeFits(outline.polygon, centre, radius, webMm);

  return {
    ok: r.fits,
    reason: r.reason,
    clearanceMm: r.clearance,
    requiredMm: r.required,
    message: r.fits ? null : messageFor(r, webMm),
  };
}

/**
 * The warning, said to a person.
 * STRINGS: owner review pending (accessibility-critical, DP-R1 text pack).
 */
function messageFor(result, webMm) {
  const need = result.required.toFixed(1);
  if (result.reason === 'outside') {
    return (
      'The hole is outside the shape of your design, so it would not be ' +
      'cut into anything. Move it back over the design.'
    );
  }
  if (result.reason === 'no-outline') {
    return 'There is no design outline to place the hole in yet.';
  }
  const have = result.clearance.toFixed(1);
  return (
    `The hole is ${have} mm from the edge of your design and it needs ` +
    `${need} mm, so the ring would have less than ${webMm} mm of material ` +
    'holding it. Move it further in, or make the hole smaller.'
  );
}
