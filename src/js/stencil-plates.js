/**
 * Bridge-less multi-layer stencil plates (DP-12).
 *
 * The method, in the owner's own words and worked through here so the code
 * can be checked against it:
 *
 *   Every enclosed shape is an island, and an island inside an island gets the
 *   next layer number. Plate 1 cuts EVERY layer - 1, 2 and 3 together - and
 *   the first coat of paint goes through all of it. Plate 2 makes the
 *   background AND layer 1 solid, so they are protected, and cuts layers 2
 *   and 3; the second coat covers only those. Plate 3 protects the background
 *   and layers 1 and 2, and cuts only layer 3.
 *
 *   So with black, then white, then black:
 *     background  no paint at all
 *     layer 1     black          (one coat)
 *     layer 2     black, white   (ends white)
 *     layer 3     black, white, black
 *
 * ★ WHY THERE ARE NO BRIDGES, which is the whole point of the method. Plate
 * k's cut is the union of layers k..N, so it is always a SOLID region, never
 * a ring. The counter of a letter A is not a separate island on plate 1: it
 * is cut along WITH the A, because it belongs to a deeper layer. Nothing is
 * ever left connected to nothing, so nothing needs a tie holding it, so no
 * bridge ever crosses the artwork and no bridge scar appears in the paint.
 *
 * That is why this is a better stencil than a cut sheet, and it is the reason
 * this file forces every element solid rather than honouring hole roles: see
 * flattenLayers' `solid` option.
 *
 * The plate SVG carries EVERYTHING - the plate outline, the cuts, and the
 * registration marks - as one even-odd path in millimetres, so the .scad that
 * extrudes it stays a dumb extruder and the preview cannot drift from the
 * export.
 *
 * @license GPL-3.0-or-later
 */

import {
  parsePathString,
  pathToAbsolute,
  pathToCurve,
} from 'svg-path-commander';

/** Registration cross arm length and stroke, in millimetres. */
export const MARK_ARM_MM = 6;
export const MARK_WIDTH_MM = 1;

/**
 * Every plate carries the SAME marks in the SAME places. They are how a
 * person lines plate 2 up over paint that plate 1 laid down; a plate whose
 * marks moved would register the second colour a few millimetres out and
 * there is no way to tell until the paint is on.
 *
 * @param {number} w - Plate width in mm
 * @param {number} h - Plate height in mm
 * @param {number} inset - Distance from each corner
 * @returns {string} Path data for four crosses
 */
export function registrationMarks(w, h, inset = 8) {
  const a = MARK_ARM_MM / 2;
  const t = MARK_WIDTH_MM / 2;
  const corners = [
    [inset, inset],
    [w - inset, inset],
    [inset, h - inset],
    [w - inset, h - inset],
  ];
  let d = '';
  for (const [cx, cy] of corners) {
    // A plus sign drawn as two rectangles. Two separate subpaths rather than
    // one cross outline: under even-odd their overlap would cancel and leave
    // a square hole in the middle of each mark.
    d += ` M ${cx - a} ${cy - t} H ${cx + a} V ${cy + t} H ${cx - a} Z`;
    d += ` M ${cx - t} ${cy - a} H ${cx + t} V ${cy + a} H ${cx - t} Z`;
  }
  return d.trim();
}

/**
 * The transform that puts a normalized cut file onto the plate, centred.
 *
 * The cut arrives on the shared canvas every layer file uses, so all plates
 * take the SAME transform and the colours land on each other.
 *
 * @param {object} args
 * @param {number} args.canvasSpan - Width of the layer canvas
 * @param {number} args.canvasHeight - Height of the layer canvas
 * @param {number} args.plateW - Plate width in mm
 * @param {number} args.plateH - Plate height in mm
 * @param {number} args.marginMm - Clear margin around the design
 * @param {number} [args.scalePercent] - Design size, 100 fills the margin box
 * @returns {{scale: number, dx: number, dy: number}}
 */
export function plateFit({
  canvasSpan,
  canvasHeight,
  plateW,
  plateH,
  marginMm,
  scalePercent = 100,
}) {
  const boxW = Math.max(1, plateW - 2 * marginMm) * (scalePercent / 100);
  const boxH = Math.max(1, plateH - 2 * marginMm) * (scalePercent / 100);
  const scale = Math.min(boxW / canvasSpan, boxH / canvasHeight);
  return {
    scale,
    dx: plateW / 2 - (canvasSpan * scale) / 2,
    dy: plateH / 2 - (canvasHeight * scale) / 2,
  };
}

/**
 * One complete plate: outline, cuts and marks, as a single even-odd path.
 *
 * @param {object} args
 * @param {string|null} args.cutPathData - The layer's cut, on the layer canvas
 * @param {number} args.canvasSpan
 * @param {number} args.canvasHeight
 * @param {number} args.plateW - mm
 * @param {number} args.plateH - mm
 * @param {number} args.marginMm
 * @param {number} [args.scalePercent]
 * @param {boolean} [args.marks]
 * @param {number} args.layer - Which plate this is, 1-based
 * @param {number} args.layerCount - How many plates the design makes
 * @returns {{svg: string, label: string}}
 */
export function buildStencilPlate({
  cutPathData,
  canvasSpan,
  canvasHeight,
  plateW,
  plateH,
  marginMm,
  scalePercent = 100,
  marks = true,
  layer,
  layerCount,
}) {
  const fit = plateFit({
    canvasSpan,
    canvasHeight,
    plateW,
    plateH,
    marginMm,
    scalePercent,
  });

  let d = `M 0 0 H ${plateW} V ${plateH} H 0 Z`;
  if (marks) d += ` ${registrationMarks(plateW, plateH)}`;
  if (cutPathData) {
    // ★ ONE PATH, always. MEASURED against OpenSCAD 2026.01.03: two separate
    // <path> elements are UNIONED on import - a 40 mm square with a 20 mm
    // square in a second path came back as 12 facets, a plain solid square,
    // the hole gone. The same two shapes as subpaths of ONE path came back as
    // 32: a square with a hole in it. Even-odd applies WITHIN a path and not
    // across paths, so a cut in its own <path>, however correctly placed,
    // cuts nothing. The first version of this file did exactly that and
    // produced solid plates that looked like plates.
    //
    // So the fit is baked into the coordinates rather than carried by a
    // <g transform>, and everything joins one `d`.
    d += ` ${scaleTranslatePath(cutPathData, fit.scale, fit.dx, fit.dy)}`;
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${round(plateW)}mm" ` +
    `height="${round(plateH)}mm" viewBox="0 0 ${round(plateW)} ` +
    `${round(plateH)}"><path d="${d}" fill="black" ` +
    `fill-rule="evenodd"/></svg>`;

  return { svg, label: plateLabel(layer, layerCount) };
}

/**
 * Layer per element for a stencil, with the background left uncut (DP-12).
 *
 * ★ A TRACED PHOTOGRAPH'S OUTERMOST SHAPE IS THE PAPER, NOT THE DRAWING, and
 * this is the second place in this round that has had to learn it. Measured on
 * the owner's own mark: its trace has a full-bleed light rectangle as the only
 * root, so plate 1 - which cuts the union of every layer - cut a rectangle the
 * size of the whole image. A stencil that cuts everything is a hole.
 *
 * A root classified as a hole is a background: it is never cut, and the depth
 * that decides the layers is counted from the shapes drawn ON it. An ignored
 * element is skipped outright.
 *
 * @param {{nodes: Array, roots: Array<number>}} tree
 * @param {Array<string>} roles - Role per element, positionally aligned
 * @param {number} cap - Most plates to make
 * @returns {{layers: Array<number>, plateCount: number}} layer 0 means "never
 *   cut": the background, and anything ignored
 */
export function stencilLayers(tree, roles, cap = 3) {
  const layers = [];
  if (!tree || !Array.isArray(tree.nodes)) return { layers, plateCount: 0 };
  const roleAt = (i) => (Array.isArray(roles) ? roles[i] : 'foreground');

  for (let i = 0; i < tree.nodes.length; i++) layers[i] = 0;

  // The largest area anything covers, for the full-bleed test below.
  let widest = 0;
  for (const n of tree.nodes) if (n.area > widest) widest = n.area;

  /**
   * Is this root the paper rather than the drawing?
   *
   * COLOUR CANNOT ANSWER THIS, and is not consulted. The bird fixture's
   * background is a light `<rect fill="#efe9dc">`; the owner's traced mark
   * has a DARK one, rgb(54,59,127). Both are the paper. What they share is
   * that they span the whole artwork and something is drawn on them.
   *
   * JUDGEMENT CALL, stated plainly: a root covering essentially everything
   * AND having children is treated as background. A deliberate filled panel
   * with art on it - a sign, a badge - trips this too, and its panel will not
   * be cut. That is the safer way round: an uncut panel is a stencil that
   * paints the art, where a cut one is a plate with its middle missing.
   */
  const isBackdrop = (index) => {
    const n = tree.nodes[index];
    return n.children.length > 0 && widest > 0 && n.area >= widest * 0.95;
  };

  let deepest = 0;
  const visit = (index, depth) => {
    const node = tree.nodes[index];
    if (!node) return;
    const role = roleAt(index);
    // A background or an ignored shape is not the design; step past it
    // WITHOUT spending a layer on it, so the drawing on top starts at 1.
    // Colour is deliberately NOT consulted. It cannot tell paper from
    // drawing, and using it here also mis-skipped the first LIGHT shape of a
    // light-on-dark design, which is content, not paper.
    const isDesign = role !== 'ignore' && !(depth === 0 && isBackdrop(index));
    const next = isDesign ? depth + 1 : depth;
    if (isDesign) {
      const layer = Math.min(next, cap);
      layers[index] = layer;
      if (layer > deepest) deepest = layer;
    }
    for (const child of node.children) visit(child, next);
  };
  for (const root of tree.roots || []) visit(root, 0);

  return { layers, plateCount: deepest };
}

/**
 * Apply a scale and a translate to path data, in its coordinates.
 *
 * Needed because the fit cannot be carried by a group transform: the cut has
 * to end up in the SAME path as the plate outline to be a hole rather than
 * more material. Everything is converted to absolute cubics first, so one
 * coordinate map covers every command.
 *
 * @param {string} d - Path data
 * @param {number} s - Uniform scale
 * @param {number} dx - Translate, applied after the scale
 * @param {number} dy
 * @returns {string} Transformed path data
 */
export function scaleTranslatePath(d, s, dx, dy) {
  if (!d) return '';
  let curve;
  try {
    curve = pathToCurve(pathToAbsolute(parsePathString(d)));
  } catch {
    return '';
  }
  // pathToCurve DISCARDS Z, the same trap svg-nesting hit. A filled subpath is
  // implicitly closed either way, but an unclosed one in a stencil cut is not
  // worth the argument, so each subpath is closed explicitly.
  const out = [];
  let open = false;
  for (const seg of curve) {
    const op = seg[0];
    if (op === 'Z' || op === 'z') continue;
    if (op === 'M') {
      if (open) out.push('Z');
      open = true;
    }
    const nums = [];
    for (let i = 1; i < seg.length; i += 2) {
      nums.push(round(seg[i] * s + dx), round(seg[i + 1] * s + dy));
    }
    out.push(op + ' ' + nums.join(' '));
  }
  if (open) out.push('Z');
  return out.join(' ');
}

/**
 * What this plate is called, and what to do with it.
 * STRINGS: owner review pending (DP-R1 text pack).
 */
export function plateLabel(layer, layerCount) {
  return `Plate ${layer} of ${layerCount}`;
}

/**
 * The order the plates are used, said once, plainly.
 *
 * Getting this wrong ruins the piece and there is no undo once paint is down,
 * so it is spelled out rather than left to be inferred from a number.
 * STRINGS: owner review pending (DP-R1 text pack).
 *
 * @param {number} layerCount
 * @returns {string[]} One sentence per plate, in order
 */
export function paintSequence(layerCount) {
  const steps = [];
  for (let n = 1; n <= layerCount; n++) {
    if (n === 1) {
      steps.push(
        `Plate 1: lay it on the bare surface and paint. This coat reaches ` +
          `every part of the design.`
      );
    } else {
      steps.push(
        `Plate ${n}: line it up on the marks over the paint that is already ` +
          `there and paint again. This coat reaches only the parts nested ` +
          `${n} deep or deeper, and covers what the last coat put there.`
      );
    }
  }
  return steps;
}

function round(n) {
  return Math.round(n * 1e4) / 1e4;
}
