/**
 * The registration jig: a base sheet with pegs, and the holes every plate
 * carries so it drops onto them the same way every time.
 *
 * Corner crosses tell a person where to put the plate. Pegs do not ask: the
 * plate can only sit one way, and a six-plate stencil sprayed six times is
 * only as good as the sixth alignment. This is the owner's own design,
 * measured off the base plate they printed:
 *
 *   a 0.6 mm sheet the size of the plate, with four pegs 4.4 mm tall;
 *   ROUND, 3.00 mm across, at the two TOP corners;
 *   RECTANGULAR, 3.00 x 2.00 mm, at the two BOTTOM corners;
 *   every centre 2.50 mm in from both edges.
 *
 * ★ ROUND AT ONE END AND RECTANGULAR AT THE OTHER IS THE WHOLE POINT. Four
 * identical pegs let a plate go on rotated a half turn, and a stencil laid on
 * backwards paints a mirror image of one colour over five correct ones. Two
 * shapes make that impossible without anyone having to notice.
 *
 * ★ THE OWNER'S OWN PLATES MODEL NO CLEARANCE AT ALL: the holes are exactly
 * the size of the pegs, 6.99 mm² against 6.99 and 6.00 against 6.00, measured
 * off the STLs. That works in CAD and does not work in a printer, where a
 * 3.00 mm hole comes out under 3.00 and a 3.00 mm peg comes out over it. So
 * `holeClearance` exists, it is added to the hole and never taken off the peg,
 * and its value is the owner's to confirm - it is a print-fit number, and
 * nobody can choose it from a screen.
 *
 * Coordinates here are the PLATE's own millimetres with y measured DOWN from
 * the top left, which is what an SVG uses. OpenSCAD flips y on import, so a
 * feature written at y = inset comes out at the top of the model, which is
 * where the reference has its round pegs.
 *
 * @license GPL-3.0-or-later
 */

export { JIG_DEFAULTS } from './stencil-limits.js';
import { JIG_DEFAULTS } from './stencil-limits.js';

/** How close a feature may come to the plate edge before it breaks the frame. */
export const MIN_FEATURE_EDGE_MM = 0.8;

/**
 * Where the four registration features sit on a plate.
 *
 * @param {number} plateW - mm
 * @param {number} plateH - mm
 * @param {number} [inset] - Centre distance from both edges, mm
 * @returns {Array<{kind: 'round'|'key', cx: number, cy: number}>} Top two
 *   round, bottom two rectangular, in reading order
 */
export function jigFeatureCentres(
  plateW,
  plateH,
  inset = JIG_DEFAULTS.featureInset
) {
  return [
    { kind: 'round', cx: inset, cy: inset },
    { kind: 'round', cx: plateW - inset, cy: inset },
    { kind: 'key', cx: inset, cy: plateH - inset },
    { kind: 'key', cx: plateW - inset, cy: plateH - inset },
  ];
}

/**
 * Whether a plate of this size can carry this jig at all.
 *
 * @param {object} spec - plateW, plateH, marginMm and the jig numbers
 * @returns {{ok: boolean, reason: string|null}}
 */
export function jigFits({
  plateW,
  plateH,
  marginMm,
  pegDiameter = JIG_DEFAULTS.pegDiameter,
  keyWidth = JIG_DEFAULTS.keyWidth,
  keyDepth = JIG_DEFAULTS.keyDepth,
  featureInset = JIG_DEFAULTS.featureInset,
  holeClearance = JIG_DEFAULTS.holeClearance,
}) {
  const widest = Math.max(pegDiameter, keyWidth) + holeClearance;
  const tallest = Math.max(pegDiameter, keyDepth) + holeClearance;
  if (featureInset - widest / 2 < MIN_FEATURE_EDGE_MM) {
    return {
      ok: false,
      // STRINGS: owner review pending (DP-R2 text pack).
      reason:
        'The registration holes would break the edge of the plate. Move them further in, or make them smaller.',
    };
  }
  if (featureInset + tallest / 2 > marginMm) {
    return {
      ok: false,
      reason:
        'The registration holes would reach into the design area. Widen the margin, or move them closer to the edge.',
    };
  }
  if (2 * featureInset + widest >= Math.min(plateW, plateH)) {
    return { ok: false, reason: 'The plate is too small to carry the jig.' };
  }
  return { ok: true, reason: null };
}

const r = (n) => Math.round(n * 1e4) / 1e4;

/** A circle as a closed polygon path, since a plate is one even-odd path. */
function circlePath(cx, cy, radius, segments = 48) {
  let d = '';
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const x = r(cx + radius * Math.cos(t));
    const y = r(cy + radius * Math.sin(t));
    d += `${i === 0 ? 'M' : ' L'} ${x} ${y}`;
  }
  return `${d} Z`;
}

/**
 * The holes and notches a plate needs, as path data in plate millimetres.
 *
 * They are subpaths of the plate's ONE even-odd path, like every other cut: a
 * hole in a path of its own is not a hole, it is more material (T22, measured
 * against OpenSCAD 2026.01.03).
 *
 * @param {object} spec
 * @returns {string} Path data, empty when there is nothing to cut
 */
export function jigHolePathData({
  plateW,
  plateH,
  pegDiameter = JIG_DEFAULTS.pegDiameter,
  keyWidth = JIG_DEFAULTS.keyWidth,
  keyDepth = JIG_DEFAULTS.keyDepth,
  featureInset = JIG_DEFAULTS.featureInset,
  holeClearance = JIG_DEFAULTS.holeClearance,
  segments = 48,
}) {
  const parts = [];
  for (const f of jigFeatureCentres(plateW, plateH, featureInset)) {
    if (f.kind === 'round') {
      parts.push(
        circlePath(f.cx, f.cy, (pegDiameter + holeClearance) / 2, segments)
      );
    } else {
      const w = keyWidth + holeClearance;
      const h = keyDepth + holeClearance;
      const x0 = r(f.cx - w / 2);
      const y0 = r(f.cy - h / 2);
      parts.push(
        `M ${x0} ${y0} L ${r(x0 + w)} ${y0} L ${r(x0 + w)} ${r(y0 + h)} L ${x0} ${r(y0 + h)} Z`
      );
    }
  }
  return parts.join(' ');
}

/**
 * The pegs themselves, for the base part and for a preview: centre, shape and
 * true size, with no clearance anywhere.
 *
 * @param {object} spec
 * @returns {Array<object>}
 */
export function jigPegs({
  plateW,
  plateH,
  pegDiameter = JIG_DEFAULTS.pegDiameter,
  keyWidth = JIG_DEFAULTS.keyWidth,
  keyDepth = JIG_DEFAULTS.keyDepth,
  featureInset = JIG_DEFAULTS.featureInset,
  pegHeight = JIG_DEFAULTS.pegHeight,
}) {
  return jigFeatureCentres(plateW, plateH, featureInset).map((f) =>
    f.kind === 'round'
      ? { ...f, diameter: pegDiameter, height: pegHeight }
      : { ...f, width: keyWidth, depth: keyDepth, height: pegHeight }
  );
}
