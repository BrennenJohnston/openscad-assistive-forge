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
import { ringsToPathData } from './ring-geometry.js';
import { jigHolePathData } from './stencil-jig.js';

/**
 * Colour is how laser software decides what to DO with a line: it maps each
 * colour to an operation and an order, so two operations need two colours.
 *
 * These are the ordinary defaults. The guide tells a LightBurn user to set
 * black to Cut and red to Score or Fill once, after which the machine
 * remembers. Anything is possible; what matters is that the file DISTINGUISHES
 * them, because a single colour cannot be split back apart afterwards.
 */
export const CUT_COLOR = '#000000';
export const ENGRAVE_COLOR = '#FF0000';

/** Registration cross arm length and stroke, in millimetres. */
export const MARK_ARM_MM = 6;
export const MARK_WIDTH_MM = 1;

export { STENCIL_PLATE_CAP } from './stencil-limits.js';

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
 * One transform out of two, so path data is mapped exactly once.
 *
 * ★ D-122 again, from the other side. A cut can arrive already carrying a
 * transform onto the layer canvas (see svg-preparer's readLayerFile), and the
 * fit is a second transform from that canvas onto the plate. Applying them one
 * after the other means walking every curve twice; applying only the second
 * means the first is silently dropped, which is the defect. Both are uniform
 * scales with a translate, so they compose into one:
 *
 *   p_mm = fit.s * (pre.s * p + pre.d) + fit.d
 *        = (fit.s * pre.s) * p + (fit.s * pre.d + fit.d)
 *
 * @param {{scale: number, dx: number, dy: number}} fit - Canvas to plate
 * @param {{scale: number, dx: number, dy: number}|null} [pre] - Data to canvas
 * @returns {{scale: number, dx: number, dy: number}}
 */
export function composeFit(fit, pre) {
  if (!pre) return fit;
  return {
    scale: fit.scale * pre.scale,
    dx: fit.scale * pre.dx + fit.dx,
    dy: fit.scale * pre.dy + fit.dy,
  };
}

/**
 * One complete plate: outline, cuts and marks, as a single even-odd path.
 *
 * @param {object} args
 * @param {string|null} args.cutPathData - The layer's cut. On the layer canvas
 *   already, unless `cutTransform` says what still has to be applied to get
 *   it there.
 * @param {{scale: number, dx: number, dy: number}} [args.cutTransform] - The
 *   transform from the cut's own units onto the layer canvas, composed with
 *   the fit so the coordinates are mapped once (D-122).
 * @param {number} args.canvasSpan
 * @param {number} args.canvasHeight
 * @param {number} args.plateW - mm
 * @param {number} args.plateH - mm
 * @param {number} args.marginMm
 * @param {number} [args.scalePercent]
 * @param {boolean} [args.marks]
 * @param {boolean} [args.engraveLabel] - Add the plate's name as an engraved
 *   layer in its own colour. Off by default: it only helps a machine that can
 *   engrave, and an SVG <text> element depends on the reader's font handling.
 * @param {number} args.layer - Which plate this is, 1-based
 * @param {number} args.layerCount - How many plates the design makes
 * @returns {{svg: string, label: string}}
 */
export function buildStencilPlate({
  cutPathData,
  cutTransform = null,
  rings = null,
  canvasSpan,
  canvasHeight,
  plateW,
  plateH,
  marginMm,
  scalePercent = 100,
  marks = true,
  pegs = null,
  engraveLabel = false,
  layer,
  layerCount,
  colourName = null,
}) {
  const fit = composeFit(
    plateFit({
      canvasSpan: canvasSpan || 100,
      canvasHeight: canvasHeight || 100,
      plateW,
      plateH,
      marginMm,
      scalePercent,
    }),
    cutTransform
  );

  let d = `M 0 0 H ${plateW} V ${plateH} H 0 Z`;
  if (marks) d += ` ${registrationMarks(plateW, plateH)}`;
  // The jig's holes and notches are subpaths of the SAME path as everything
  // else, for the reason in the comment below: a hole in a path of its own is
  // not a hole.
  if (pegs) d += ` ${jigHolePathData({ ...pegs, plateW, plateH })}`;
  // Rings arrive already in plate millimetres (fitRingsToPlate did that, once)
  // so there is nothing here to scale. This is the D-122-free path; the
  // cutPathData one below is what the charm-era callers still use.
  if (rings && rings.length > 0) {
    d += ` ${ringsToPathData(rings)}`;
  } else if (cutPathData) {
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

  const text = plateLabel(layer, layerCount, colourName);
  // The label rides as its own colour so it arrives as a separate layer a
  // laser can engrave rather than cut. Left out entirely when not wanted -
  // an empty layer is a thing to explain rather than a thing to use.
  const engraved = engraveLabel
    ? `<text x="${round(plateW / 2)}" y="${round(plateH - 4)}" ` +
      `font-size="6" text-anchor="middle" fill="none" ` +
      `stroke="${ENGRAVE_COLOR}" stroke-width="0.2">${text}</text>`
    : '';

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${round(plateW)}mm" ` +
    `height="${round(plateH)}mm" viewBox="0 0 ${round(plateW)} ` +
    `${round(plateH)}"><path d="${d}" fill="${CUT_COLOR}" ` +
    `fill-rule="evenodd"/>${engraved}</svg>`;

  return { svg, label: text };
}

/**
 * One laser-ready sheet: everything cut, with bridges holding the islands.
 *
 * A laser cuts one sheet once, so an enclosed shape falls out unless a rib of
 * material holds it. Bridges are SUBTRACTED from the cut, which restores that
 * material. This is the opposite situation from the layered 3D print, where
 * the stacked-mask law means nothing is ever an island in the first place.
 *
 * The result is true size on purpose: kerf belongs to the laser's own software,
 * which knows the material and the beam. Two corrections make a part undersized
 * by a full kerf with nothing on screen to show it.
 *
 * @param {object} args
 * @param {string|null} args.cutPathData - The whole design's cut
 * @param {{scale: number, dx: number, dy: number}} [args.cutTransform] - The
 *   transform onto the layer canvas, composed with the fit (D-122). The
 *   bridges take the SAME one: they are built in the design's units too.
 * @param {string} [args.bridgePathData] - Ribs to restore, same coordinates
 * @param {number} args.canvasSpan
 * @param {number} args.canvasHeight
 * @param {number} args.plateW
 * @param {number} args.plateH
 * @param {number} args.marginMm
 * @param {number} [args.scalePercent]
 * @param {boolean} [args.marks]
 * @returns {{svg: string}}
 */
export function buildLaserSheet({
  cutPathData,
  cutTransform = null,
  bridgePathData = '',
  canvasSpan,
  canvasHeight,
  plateW,
  plateH,
  marginMm,
  scalePercent = 100,
  marks = true,
}) {
  const fit = composeFit(
    plateFit({
      canvasSpan,
      canvasHeight,
      plateW,
      plateH,
      marginMm,
      scalePercent,
    }),
    cutTransform
  );

  let d = `M 0 0 H ${plateW} V ${plateH} H 0 Z`;
  if (marks) d += ` ${registrationMarks(plateW, plateH)}`;
  if (cutPathData) {
    d += ` ${scaleTranslatePath(cutPathData, fit.scale, fit.dx, fit.dy)}`;
  }
  // A rib inside a cut cancels back to material under even-odd, which is
  // exactly what a bridge is: the cut with a piece put back.
  if (bridgePathData) {
    d += ` ${scaleTranslatePath(bridgePathData, fit.scale, fit.dx, fit.dy)}`;
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${round(plateW)}mm" ` +
    `height="${round(plateH)}mm" viewBox="0 0 ${round(plateW)} ` +
    `${round(plateH)}"><path d="${d}" fill="${CUT_COLOR}" ` +
    `fill-rule="evenodd"/></svg>`;

  return { svg };
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
 * @param {{width: number, height: number}} [canvas] - The artwork's own
 *   viewBox. Without it nothing is treated as paper, which is the safe way to
 *   be wrong: a stencil with an extra plate beats one with its middle missing.
 * @returns {{layers: Array<number>, plateCount: number}} layer 0 means "never
 *   cut": the background, and anything ignored
 */
export function stencilLayers(tree, roles, cap = 3, canvas = null) {
  const layers = [];
  if (!tree || !Array.isArray(tree.nodes)) return { layers, plateCount: 0 };
  const roleAt = (i) => (Array.isArray(roles) ? roles[i] : 'foreground');

  for (let i = 0; i < tree.nodes.length; i++) layers[i] = 0;

  const canvasArea =
    canvas && canvas.width > 0 && canvas.height > 0
      ? canvas.width * canvas.height
      : 0;

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
    // Against the CANVAS, not against the other shapes. The first version of
    // this compared a root's area with the LARGEST area in the drawing - but
    // the outermost shape is always the largest, so every root with children
    // was called paper. Three nested squares lost their outer square and the
    // stencil came out a plate short.
    //
    // The paper is the thing that fills the picture: a traced photograph's
    // background rect IS the viewBox. A drawing's outer shape has margin
    // around it - three nested squares in a 40-unit box cover 81 per cent,
    // well under this.
    if (!canvasArea || n.children.length === 0) return false;
    return n.area >= canvasArea * 0.98;
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
export function plateLabel(layer, layerCount, colourName = null) {
  return colourName
    ? `Plate ${layer} of ${layerCount}, ${colourName}`
    : `Plate ${layer} of ${layerCount}`;
}

/**
 * Put rings on the plate, ONCE.
 *
 * ★ D-122 BY CONSTRUCTION. The rings arrive in the drawing's own units and
 * `contentBox` says where the drawing is in them; this returns rings in plate
 * millimetres, and it is the only place the two spaces meet. Nothing
 * downstream fits anything again, because there is nothing left to fit.
 *
 * The whole DESIGN is fitted, not each plate: every plate takes the same
 * transform, so the colours land on each other. Passing plate 3's own bounds
 * as `contentBox` would blow a two-region plate up to fill the sheet.
 *
 * @param {Array<Array<{x: number, y: number}>>} rings
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} contentBox
 *   The whole design's bounds, in the rings' units
 * @param {{plateW: number, plateH: number, marginMm: number,
 *   scalePercent?: number, offsetX?: number, offsetY?: number}} plate
 * @returns {Array<Array<{x: number, y: number}>>} Rings in plate millimetres
 */
export function fitRingsToPlate(rings, contentBox, plate) {
  const span = contentBox.maxX - contentBox.minX;
  const height = contentBox.maxY - contentBox.minY;
  if (!(span > 0) || !(height > 0)) return [];
  const fit = plateFit({
    canvasSpan: span,
    canvasHeight: height,
    plateW: plate.plateW,
    plateH: plate.plateH,
    marginMm: plate.marginMm,
    scalePercent: plate.scalePercent ?? 100,
  });
  const dx = fit.dx - fit.scale * contentBox.minX + (plate.offsetX || 0);
  const dy = fit.dy - fit.scale * contentBox.minY + (plate.offsetY || 0);
  return rings.map((ring) =>
    ring.map((p) => ({ x: p.x * fit.scale + dx, y: p.y * fit.scale + dy }))
  );
}

/**
 * The order the plates are used, said once, plainly.
 *
 * Getting this wrong ruins the piece and there is no undo once paint is down,
 * so it is spelled out rather than left to be inferred from a number.
 * STRINGS: owner review pending (DP-R1 text pack).
 *
 * @param {number|string[]} layerCountOrNames - How many plates, or the colour
 *   names in paint order when the caller knows them
 * @returns {string[]} One sentence per plate, in order
 */
export function paintSequence(layerCountOrNames) {
  // A colour name says more than a number, so when the caller knows the
  // colours the sentence uses them. Callers that only have a count still get
  // the sentences they had.
  const names = Array.isArray(layerCountOrNames) ? layerCountOrNames : null;
  const layerCount = names ? names.length : layerCountOrNames;
  if (names) {
    return names.map((name, i) =>
      i === 0
        ? `Plate 1, ${name}: lay it on the bare surface and paint. This coat is the ground every later colour sits on.`
        : `Plate ${i + 1}, ${name}: line it up on the marks or drop it over the pegs, then paint. This coat covers part of what the last one put down.`
    );
  }
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
