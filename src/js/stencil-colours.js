/**
 * The Harley law: a layer is a paint COLOUR a person assigns to regions.
 *
 * Named after the drawing that taught it. The owner made a six-plate spray
 * stencil of their cat by hand and the plates say plainly what a layer is:
 * plate 1 cuts the whole silhouette and the base coat goes through it; plates
 * 2 to 6 cut the regions of one colour each; the black lines between regions
 * are not cut by anything, because they are the base coat showing through.
 * Depth, which the app used to decide layers by, is at best a hint.
 *
 * So this module is the model the app was missing:
 *
 *   REGION      a closed area a person can point at.
 *   COLOUR      a named swatch. "Base coat" and "Unpainted" are colours too,
 *               and a colour may appear MORE THAN ONCE in the order - which
 *               is how the owner avoided islands without a single bridge.
 *   ASSIGNMENT  region -> colour.
 *   ORDER       the colours, in spray order.
 *   PLATE k     under the stacked rule, the union of the regions of colours
 *               k..N, so a cut is always solid and never a ring; under the
 *               own rule, the regions of colour k alone, which is the hand
 *               method and can leave islands.
 *
 * ★ WHAT A REGION IS IN A LINE DRAWING, which is the thing the old engine got
 * wrong. `sketch4.svg` is an Illustrator "Outline Stroke" export: the lines
 * are thin filled BANDS, and every element is unfilled black. Union those
 * bands and the result is one solid with holes in it - and the holes are the
 * FACES of the line network, which is exactly what the owner painted. The
 * bands themselves are never regions. MEASURED on the cat: 25 elements union
 * to one solid, 4 solid rings and 23 holes, of which 21 have area and 2 are
 * 0.0001-unit slivers; those 21 faces contain every one of the sixteen
 * regions the reference plates cut, each within a tenth of a unit of the
 * point measured out of the owner's own STLs.
 *
 * Nothing here draws, and nothing here knows about millimetres: regions are
 * found in the drawing's own units and become millimetres only when a plate
 * size says so. D-122 was what happens when a module is not sure which space
 * it is in.
 *
 * @license GPL-3.0-or-later
 */

import {
  buildRingTree,
  ringsFromPathData,
  areaOf,
  regionArea,
  union,
  evenOddUnion,
  orientRegion,
} from './ring-geometry.js';
import { boundsOf, interiorPoint, pointInPolygon } from './svg-nesting.js';
import { STENCIL_PLATE_CAP } from './stencil-limits.js';

/** The colour every region starts at when the art has no colours of its own. */
export const BASE_COLOUR_ID = 'base';

/** A region the person wants left as the wall behind the stencil. */
export const UNPAINTED = 'unpainted';

/** A region the person has taken out of the design entirely. */
export const REMOVED = 'removed';

/**
 * How thin the ink of a drawing has to be before its holes are read as faces
 * rather than as holes in filled shapes.
 *
 * MEASURED, as the ratio of hole area to the area of the outer contour:
 *   sketch4.svg (a line drawing)          0.943   ink covers 5.7%
 *   trace-503px.svg (three nested solids) 0.355   ink covers 64%
 *   bird-drawing.svg (filled art)         0.287   ink covers 71%
 * The gap between filled art and line art is 0.36 to 0.94, and 0.60 sits in
 * the middle of it. It is a threshold on a continuum and it will be wrong for
 * something eventually, which is why the person can override it.
 */
export const LINE_ART_HOLE_RATIO = 0.6;

/**
 * Faces smaller than this fraction of the silhouette are boolean litter, not
 * regions. MEASURED on the cat: the two rings the union leaves behind are
 * 0.0001 and 0.0000 units² against a silhouette of 12,603, while the smallest
 * face a person actually painted is 13.98. The floor sits a hundred times
 * below the real face and a thousand above the litter.
 */
export const MIN_FACE_AREA_FRACTION = 1e-5;

/**
 * Every sentence this module can say about an island, in one place.
 *
 * STRINGS: owner review pending (DP-R2 text pack). US English, no em dashes.
 * They are written as advice a person can act on rather than as a diagnosis:
 * an island is not a mistake, it is a consequence of a paint order, and the
 * three ways out are all legitimate.
 */
export const REMEDY_SENTENCES = Object.freeze({
  'paint-later':
    'Move {colour} later in the paint order. Then this piece is held by the plate before it and cannot fall out.',
  'paint-again':
    'Paint {colour} twice: once here and once later in the order. That is what holds this piece, and it is what the reference stencil does with black.',
  'support-bar':
    'Add a support bar across this opening. It leaves a small unpainted line where the bar sits.',
});

/** What an island is, said once, before any remedy. */
export const ISLAND_SENTENCE =
  'On plate {plate}, {region} is a loose piece: it is surrounded by the cut and nothing holds it.';

/** The nine position words a region name can carry. */
const POSITION_WORDS = [
  ['top left', 'top', 'top right'],
  ['left', 'middle', 'right'],
  ['bottom left', 'bottom', 'bottom right'],
];

const round4 = (n) => Math.round(n * 1e4) / 1e4;

/**
 * A region's stable name, so a saved plan survives the regions being found
 * again. The interior point is a property of the SHAPE; an index is a
 * property of whatever listed it.
 *
 * @param {{x: number, y: number}} point
 * @returns {string}
 */
export function regionKey(point) {
  return `${round4(point.x)}:${round4(point.y)}`;
}

/**
 * Is this drawing made of lines between regions, or of shapes to paint?
 *
 * Two conditions, and both have to hold. Every element is unfilled or black,
 * because a drawing that names its own colours is telling you what it is; and
 * the union's holes cover most of its outer contour, because that is what
 * "thin lines" means when you measure it rather than look at it.
 *
 * @param {Array<{pathData: string, fill: string|null}>} elements
 * @returns {{isLineArt: boolean, holeRatio: number, allInk: boolean,
 *   distinctFills: number, reason: string}}
 */
export function detectLineArt(elements) {
  const list = Array.isArray(elements) ? elements : [];
  const fills = new Set();
  for (const el of list) {
    const f = (el.fill || '').trim().toLowerCase();
    fills.add(f === '' || f === 'none' ? '(unset)' : f);
  }
  const isInk = (f) =>
    f === '(unset)' ||
    f === '#000' ||
    f === '#000000' ||
    f === 'black' ||
    f === 'rgb(0,0,0)';
  const allInk = [...fills].every(isInk);

  const rings = [];
  for (const el of list) rings.push(...ringsFromPathData(el.pathData));
  if (rings.length === 0) {
    return {
      isLineArt: false,
      holeRatio: 0,
      allInk,
      distinctFills: fills.size,
      reason: 'nothing to read',
    };
  }
  const tree = buildRingTree(rings);
  const outerArea = tree.roots.reduce((s, n) => s + Math.abs(n.area), 0);
  const holeArea = tree.nodes
    .filter((n) => n.isHole)
    .reduce((s, n) => s + Math.abs(n.area), 0);
  const holeRatio = outerArea > 0 ? holeArea / outerArea : 0;
  const isLineArt = allInk && holeRatio >= LINE_ART_HOLE_RATIO;
  return {
    isLineArt,
    holeRatio,
    allInk,
    distinctFills: fills.size,
    reason: !allInk
      ? 'the drawing names colours of its own'
      : holeRatio < LINE_ART_HOLE_RATIO
        ? 'the marks are too thick to be lines between regions'
        : 'unfilled marks with faces between them',
  };
}

/**
 * A position word for a point in a box, so a region can be named by where it
 * is rather than by what index it happened to get.
 *
 * @param {{x: number, y: number}} point
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} box
 * @returns {string}
 */
export function positionWord(point, box) {
  const w = box.maxX - box.minX || 1;
  const h = box.maxY - box.minY || 1;
  const col = Math.min(
    2,
    Math.max(0, Math.floor(((point.x - box.minX) / w) * 3))
  );
  const row = Math.min(
    2,
    Math.max(0, Math.floor(((point.y - box.minY) / h) * 3))
  );
  return POSITION_WORDS[row][col];
}

function describeRegion(index, interior, box, parent) {
  const where = positionWord(interior, box);
  // STRINGS: owner review pending. "Region 7, top left" reads as a name;
  // "Path 12" reads as a file format.
  return parent
    ? `Region ${index + 1}, ${where}, inside ${parent}`
    : `Region ${index + 1}, ${where}`;
}

/**
 * Every region of a drawing.
 *
 * In `edges` mode the regions are the faces of the line network: each hole of
 * the union of every element, carrying any solid island directly inside it as
 * its own hole, plus the silhouette (the outer contour with its holes filled)
 * as the base region. In `shapes` mode every element is a region and its own
 * subpath holes are honoured.
 *
 * @param {Array<{pathData: string, fill: string|null, role: string}>} elements
 * @param {{lineMode?: 'edges'|'shapes'}} [options]
 * @returns {{regions: Array<object>, silhouette: Array<Array<object>>|null,
 *   lineMode: string, droppedFaces: number, detection: object}}
 */
export function buildRegions(elements, options = {}) {
  const list = (Array.isArray(elements) ? elements : []).filter(
    (el) => el && el.role !== 'ignore'
  );
  const detection = detectLineArt(list);
  const lineMode =
    options.lineMode || (detection.isLineArt ? 'edges' : 'shapes');

  const perElement = list.map((el) => ringsFromPathData(el.pathData));
  const all = perElement.flat();
  if (all.length === 0) {
    return {
      regions: [],
      silhouette: null,
      lineMode,
      droppedFaces: 0,
      detection,
    };
  }
  const box = boundsOf(all.flat());

  if (lineMode === 'edges') {
    const tree = buildRingTree(all);
    const outerArea = tree.roots.reduce((s, n) => s + Math.abs(n.area), 0);
    const floor = outerArea * MIN_FACE_AREA_FRACTION;
    const holes = tree.nodes
      .filter((n) => n.isHole)
      .sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
    const kept = holes.filter((h) => Math.abs(h.area) >= floor);

    // The silhouette is the outer contour with every face filled in: the
    // shape the base coat is sprayed through, and plate 1 under the stacked
    // rule. Taking the root rings alone does that, because a root ring IS the
    // outline of the whole line network.
    const silhouette = tree.roots.map((n) => n.ring);

    const regions = kept.map((hole, i) => {
      // A face is a HOLE of the drawing's union, so it arrives wound inside
      // out: its own ring is negative and the islands in it are positive. Put
      // it the right way up here, once, or every NonZero union downstream
      // returns the complement of what was meant.
      const rings = orientRegion([
        hole.ring,
        ...hole.children.filter((c) => !c.isHole).map((c) => c.ring),
      ]);
      const interior = interiorPoint(hole.ring) || {
        x: (boundsOf(hole.ring).minX + boundsOf(hole.ring).maxX) / 2,
        y: (boundsOf(hole.ring).minY + boundsOf(hole.ring).maxY) / 2,
      };
      return {
        index: i,
        key: regionKey(interior),
        elementIndex: null,
        rings,
        area: Math.abs(regionArea(rings)),
        outerArea: Math.abs(areaOf(hole.ring)),
        bbox: boundsOf(hole.ring),
        interior,
        depth: hole.depth,
        fill: null,
        name: describeRegion(i, interior, box, null),
      };
    });
    return {
      regions,
      silhouette,
      lineMode,
      droppedFaces: holes.length - kept.length,
      detection,
    };
  }

  // Filled art: one region per element. The backdrop is stepped over by the
  // same area rule the stencil layering uses - a root that covers essentially
  // the whole picture is the paper, and colour cannot tell you that.
  const canvasArea =
    (box.maxX - box.minX) * (box.maxY - box.minY) || Number.POSITIVE_INFINITY;
  const regions = [];
  list.forEach((el, elementIndex) => {
    // One element read the way an SVG reads it, so a shape drawn with a
    // counter keeps its counter, and wound the way everything downstream
    // expects.
    const rings = evenOddUnion(perElement[elementIndex]);
    if (rings.length === 0) return;
    const area = Math.abs(regionArea(rings));
    if (area >= canvasArea * 0.98) return;
    const outer = rings.reduce((best, r) =>
      Math.abs(areaOf(r)) > Math.abs(areaOf(best)) ? r : best
    );
    const interior = interiorPoint(outer);
    if (!interior) return;
    const i = regions.length;
    regions.push({
      index: i,
      key: regionKey(interior),
      elementIndex,
      rings,
      area,
      outerArea: Math.abs(areaOf(outer)),
      bbox: boundsOf(outer),
      interior,
      depth: 0,
      fill: el.fill || null,
      name: describeRegion(i, interior, box, null),
    });
  });
  return {
    regions,
    silhouette: evenOddUnion(all).filter((r) => areaOf(r) > 0),
    lineMode,
    droppedFaces: 0,
    detection,
  };
}

/**
 * The palette a drawing brings with it, or the one colour it does not.
 *
 * @param {Array<object>} regions
 * @param {{baseName?: string, baseHex?: string}} [options]
 * @returns {Array<{id: string, name: string, hex: string}>}
 */
export function paletteFromFills(regions, options = {}) {
  const base = {
    id: BASE_COLOUR_ID,
    // STRINGS: owner review pending.
    name: options.baseName || 'Base coat',
    hex: options.baseHex || '#171411',
  };
  const seen = new Map();
  for (const r of regions || []) {
    const hex = (r.fill || '').trim().toLowerCase();
    if (!hex || hex === 'none' || !/^#[0-9a-f]{3,8}$/.test(hex)) continue;
    if (!seen.has(hex)) seen.set(hex, 0);
    seen.set(hex, seen.get(hex) + (r.area || 0));
  }
  if (seen.size < 2) return [base];
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([hex], i) => ({
      id: `colour-${i + 1}`,
      name: colourLabel(hex),
      hex,
    }));
}

/**
 * A plain-language name for a colour, so a plate can be called "the brown
 * one" rather than "#997048".
 *
 * Ported from the owner's stencil-forge `colorName` (color-separation.js,
 * GPL-3.0-or-later) with the same eighteen anchors.
 *
 * STRINGS: owner review pending - these names are rendered.
 *
 * @param {string} hex
 * @returns {string}
 */
export function colourLabel(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return 'Colour';
  const v = parseInt(m[1], 16);
  const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  let best = NAMED_COLOURS[0];
  let bestDist = Infinity;
  for (const named of NAMED_COLOURS) {
    const d =
      (c[0] - named.rgb[0]) ** 2 +
      (c[1] - named.rgb[1]) ** 2 +
      (c[2] - named.rgb[2]) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = named;
    }
  }
  return best.name;
}

const NAMED_COLOURS = [
  { name: 'Black', rgb: [0, 0, 0] },
  { name: 'White', rgb: [255, 255, 255] },
  { name: 'Gray', rgb: [128, 128, 128] },
  { name: 'Light gray', rgb: [200, 200, 200] },
  { name: 'Dark gray', rgb: [64, 64, 64] },
  { name: 'Red', rgb: [220, 40, 40] },
  { name: 'Dark red', rgb: [130, 20, 20] },
  { name: 'Orange', rgb: [245, 140, 30] },
  { name: 'Yellow', rgb: [245, 220, 40] },
  { name: 'Green', rgb: [60, 160, 70] },
  { name: 'Dark green', rgb: [25, 90, 40] },
  { name: 'Teal', rgb: [40, 160, 160] },
  { name: 'Blue', rgb: [50, 100, 220] },
  { name: 'Navy blue', rgb: [25, 40, 120] },
  { name: 'Purple', rgb: [130, 60, 180] },
  { name: 'Pink', rgb: [240, 140, 190] },
  { name: 'Brown', rgb: [130, 85, 50] },
  { name: 'Tan', rgb: [200, 170, 130] },
];

/**
 * The region a point is in.
 *
 * ★ TWO WAYS TO GET THIS WRONG, and this session found both of them.
 *
 * 1. SMALLEST WINS. A face nested inside another face is inside both outer
 *    rings, so a search that takes the first match in any other order hands
 *    back the eye when it was asked about the pupil. MEASURED on the cat:
 *    matching largest-first gave the pupils' colour to the eyes, emptied the
 *    green plate, and put two islands on the black plate that were nothing
 *    but the eye rings.
 * 2. SMALLEST BY THE OUTER RING, not by the region's paintable area. A
 *    region's area is its ring minus whatever is nested in it, and on the cat
 *    the right pupil (82.0) is bigger by that measure than the eye that
 *    CONTAINS it (168.8 minus its 109.5 band = 59.4). Sorting on the net area
 *    picks the parent for a point in the child.
 *
 * A point that lands on a line between faces - inside a solid nested in a
 * face - belongs to the face around it, which is what the smallest ENCLOSING
 * outer ring gives. That is also what a person means when they click a line.
 *
 * @param {Array<object>} regions
 * @param {{x: number, y: number}} point
 * @returns {object|null}
 */
export function regionAt(regions, point) {
  let best = null;
  for (const r of regions || []) {
    if (!r.rings || r.rings.length === 0) continue;
    if (!pointInPolygon(point, r.rings[0])) continue;
    if (!best || r.outerArea < best.outerArea) best = r;
  }
  return best;
}

/**
 * Every region's first colour.
 *
 * When the art has colours of its own, each region keeps the one it is drawn
 * in. When it does not, every region starts at the base coat, so the first
 * preview a person sees is the honest base coat and they paint from there
 * rather than from a guess the app made for them.
 *
 * @param {Array<object>} regions
 * @param {Array<{id: string, hex: string}>} palette
 * @returns {Object<string, string>} region key -> colour id
 */
export function autoAssign(regions, palette) {
  const list = palette || [];
  const byHex = new Map(list.map((c) => [c.hex.toLowerCase(), c.id]));
  // The base is whatever the palette calls its ground, and a palette that
  // does not have one starts at its first colour. Hard-coding 'base' here
  // wrote an id no palette contained and every region came out assigned to a
  // colour that did not exist.
  const base =
    list.find((c) => c.id === BASE_COLOUR_ID)?.id ||
    list[0]?.id ||
    BASE_COLOUR_ID;
  const out = {};
  for (const r of regions || []) {
    const hex = (r.fill || '').trim().toLowerCase();
    out[r.key] = byHex.get(hex) || base;
  }
  return out;
}

/**
 * The order to spray in: the base first, then the largest area first.
 *
 * Ported from stencil-forge's measured default (`defaultPaintOrder`). Largest
 * first because a big field is easier to cover than to cut around, and
 * because it is what the owner did by hand.
 *
 * @param {Array<object>} regions
 * @param {Object<string, string>} assignment
 * @param {Array<{id: string}>} palette
 * @returns {Array<string>} colour ids
 */
export function defaultOrder(regions, assignment, palette) {
  const total = new Map();
  for (const c of palette || []) total.set(c.id, 0);
  for (const r of regions || []) {
    const id = assignment?.[r.key];
    if (!id || id === UNPAINTED || id === REMOVED) continue;
    total.set(id, (total.get(id) || 0) + (r.area || 0));
  }
  const rest = [...total.entries()]
    .filter(([id]) => id !== BASE_COLOUR_ID)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  return total.has(BASE_COLOUR_ID) ||
    (palette || []).some((c) => c.id === BASE_COLOUR_ID)
    ? [BASE_COLOUR_ID, ...rest]
    : rest;
}

/**
 * The rings each plate cuts.
 *
 * ★ The two rules are different laws, not a preference:
 *
 *   stacked  plate k cuts colours k..N together, so every cut is SOLID and no
 *            plate ever has an island. Plate 1 is the whole silhouette. This
 *            is the 3D-printed multi-plate method, and it is the reason the
 *            method needs no bridges.
 *   own      plate k cuts colour k alone, which is the hand method and what
 *            the reference plates do. It can leave islands, and the owner's
 *            answer to that was to paint black twice.
 *
 * @param {{palette: Array, order: Array<string>, assignment: object,
 *   rule?: string}} plan
 * @param {Array<object>} regions
 * @param {Array<Array<object>>|null} [silhouette] - Plate 1 under the stacked
 *   rule, when the drawing has one
 * @param {{absorbEnclosedLines?: boolean}} [options] - See
 *   `absorbEnclosedLines` below. Off by default: closing a line changes which
 *   colour lands on it.
 * @returns {Array<{colourId: string, rings: Array, regionKeys: Array<string>}>}
 */
export function platesFor(plan, regions, silhouette = null, options = {}) {
  const rule = plan?.rule === 'own' ? 'own' : 'stacked';
  const absorb = options.absorbEnclosedLines === true;
  const order = plan?.order || [];
  const assignment = plan?.assignment || {};
  const byColour = new Map(order.map((id) => [id, []]));
  for (const r of regions || []) {
    const id = assignment[r.key];
    if (!id || id === UNPAINTED || id === REMOVED) continue;
    if (byColour.has(id)) byColour.get(id).push(r);
  }

  const hasSilhouette = Array.isArray(silhouette) && silhouette.length > 0;
  // Where in the paint order each region's colour falls, so a hole can be
  // asked whether filling it would paint over something.
  const at = new Map(order.map((id, i) => [id, i]));
  const rank = new Map();
  for (const r of regions || []) {
    const id = assignment[r.key];
    if (at.has(id)) rank.set(r.key, at.get(id));
  }

  return order.map((colourId, k) => {
    const mine = byColour.get(colourId) || [];

    // ★ PLATE 1 IS THE SILHOUETTE FOR A LINE DRAWING, under BOTH rules, and
    // the reason is the lines. In line art the marks between the faces are
    // not regions at all: they are where the base coat shows through, and no
    // later plate ever cuts them. A first plate built from the union of the
    // faces would leave every line uncut, so the base coat would never reach
    // them and the drawing would come out as a field of separated patches.
    // The reference set is the OWN rule and its plate 1 is the silhouette,
    // which is what says this is not a property of the rule.
    //
    // Filled art has no lines to account for, so there plate 1 follows the
    // rule like every other plate - and a region marked Unpainted stays
    // unpainted, which a full silhouette would override.
    // Reverse: make this stacked-only.
    const isGround = k === 0 && plan?.lineMode !== 'shapes';
    if (isGround && hasSilhouette) {
      return {
        colourId,
        rings: union(silhouette),
        regionKeys:
          rule === 'stacked'
            ? order.flatMap((id) => (byColour.get(id) || []).map((r) => r.key))
            : mine.map((r) => r.key),
      };
    }

    const cutting =
      rule === 'own'
        ? mine
        : order.slice(k).flatMap((id) => byColour.get(id) || []);
    return {
      colourId,
      rings: absorbEnclosedLines(
        union(cutting.flatMap((r) => r.rings)),
        regions,
        absorb,
        rank,
        k
      ),
      regionKeys: cutting.map((r) => r.key),
    };
  });
}

/**
 * Optionally close the LINES a plate's cut has surrounded.
 *
 * ★ THE STACKED RULE DOES NOT GUARANTEE A SOLID CUT, and the plan said it
 * did. MEASURED on the cat: under the stacked rule, plate 2 cuts every colour
 * from brown onwards, which includes both the eye faces and the pupil faces -
 * but the thin black BAND between an eye and its pupil is a line, not a
 * region, so it is not cut, and it ends up a ring of material with cut on
 * both sides. Two islands, 109.4 and 94.3 units², on three plates. The
 * stacked rule removes every island caused by NESTED REGIONS; it cannot
 * remove one caused by a line between two regions that are both cut.
 *
 * The owner's own answer was to cut the eye solid, band and all, which is
 * what this option does: any hole in the cut that contains no region at all
 * is a line, and it is filled in. It is NOT the default, because it changes
 * the picture - the band gets painted this colour instead of staying base
 * coat - and that is the person's decision, not the engine's.
 *
 * @param {Array<Array<object>>} rings
 * @param {Array<object>} regions
 * @param {boolean} on
 * @returns {Array<Array<object>>}
 */
function absorbEnclosedLines(rings, regions, on, rank, position) {
  if (!on || rings.length === 0) return rings;
  const tree = buildRingTree(rings);
  const keep = [];
  // Fill a hole only if everything inside it is painted by this plate or by a
  // later one. A region painted EARLIER would be destroyed by the paint that
  // comes through the filled hole, so that hole stays and the island stands,
  // which is the honest answer and is what the island report is for.
  const wouldLose = (ring) =>
    (regions || []).some((r) => {
      if (!r.interior || !pointInPolygon(r.interior, ring)) return false;
      const at = rank.get(r.key);
      return at === undefined || at < position;
    });
  // ★ A filled hole takes its whole SUBTREE with it. Dropping the ring alone
  // leaves the rings nested inside it one parity out: MEASURED on the cat,
  // filling the band between an eye and its pupil turned the PUPIL into a
  // hole, and the two islands moved rather than went away.
  const walk = (node) => {
    if (node.isHole && !wouldLose(node.ring)) return;
    keep.push(node.ring);
    for (const child of node.children) walk(child);
  };
  for (const root of tree.roots) walk(root);
  return keep;
}

/**
 * The loose pieces on a plate.
 *
 * A hole in a plate's cut is material with cut all round it: it falls out the
 * moment the plate is printed, and takes the paint mask with it. Reported,
 * with the ways out named, and never quietly reassigned - which colour goes
 * where is the person's decision, and an island is a consequence of their
 * paint order rather than an error in it.
 *
 * @param {Array<Array<object>>} plateRings
 * @param {Array<object>} [regions] - To name what is sitting in the island
 * @returns {Array<{area: number, interior: object, regionKeys: Array<string>,
 *   remedies: Array<string>}>}
 */
export function islandsOf(plateRings, regions = []) {
  if (!plateRings || plateRings.length === 0) return [];
  const tree = buildRingTree(plateRings);
  const out = [];
  for (const node of tree.nodes) {
    if (!node.isHole) continue;
    const interior = interiorPoint(node.ring);
    const inside = (regions || []).filter(
      (r) => r.interior && pointInPolygon(r.interior, node.ring)
    );
    out.push({
      area: Math.abs(node.area),
      interior,
      bbox: boundsOf(node.ring),
      regionKeys: inside.map((r) => r.key),
      regionNames: inside.map((r) => r.name),
      remedies: ['paint-later', 'paint-again', 'support-bar'],
    });
  }
  return out.sort((a, b) => b.area - a.area);
}

/**
 * What is wrong with a plan, in sentences a person can act on.
 *
 * STRINGS: owner review pending.
 *
 * @param {object} plan
 * @param {Array<object>} [regions]
 * @returns {Array<{code: string, message: string}>}
 */
export function validatePlan(plan, regions = []) {
  const problems = [];
  const ids = new Set((plan?.palette || []).map((c) => c.id));
  for (const id of plan?.order || []) {
    if (!ids.has(id)) {
      problems.push({
        code: 'unknown-colour',
        message: `The paint order names a colour that is not in the palette: ${id}.`,
      });
    }
  }
  const assigned = new Set(Object.values(plan?.assignment || {}));
  for (const id of assigned) {
    if (id === UNPAINTED || id === REMOVED) continue;
    if (!ids.has(id)) {
      problems.push({
        code: 'unknown-colour',
        message: `A region is assigned to a colour that is not in the palette: ${id}.`,
      });
    }
  }
  const order = plan?.order || [];
  if (order.length > STENCIL_PLATE_CAP) {
    problems.push({
      code: 'too-many-plates',
      message: `This plan needs ${order.length} plates and the most that can be made is ${STENCIL_PLATE_CAP}. Give two colours the same plate, or take one out.`,
    });
  }
  const used = new Set(
    (regions || [])
      .map((r) => plan?.assignment?.[r.key])
      .filter((id) => id && id !== UNPAINTED && id !== REMOVED)
  );
  for (const id of order) {
    if (!used.has(id) && id !== BASE_COLOUR_ID) {
      problems.push({
        code: 'empty-plate',
        message: `No region is painted ${id}, so its plate would be a sheet with nothing cut in it.`,
      });
    }
  }
  return problems;
}

/**
 * The plan, as something a saved project can hold.
 *
 * Keyed by region key, which is a property of the SHAPE, and also by original
 * element index where a region has one, so a filled drawing can be matched
 * back either way. A saved plan therefore survives the regions being found
 * again, which an index-keyed plan does not.
 *
 * @param {object} plan
 * @param {Array<object>} [regions]
 * @returns {object}
 */
export function serialisePlan(plan, regions = []) {
  const byElement = {};
  for (const r of regions || []) {
    if (r.elementIndex === null || r.elementIndex === undefined) continue;
    const id = plan?.assignment?.[r.key];
    if (id) byElement[r.elementIndex] = id;
  }
  return {
    version: 1,
    palette: (plan?.palette || []).map((c) => ({
      id: c.id,
      name: c.name,
      hex: c.hex,
      ...(c.note ? { note: c.note } : {}),
    })),
    order: [...(plan?.order || [])],
    assignment: { ...(plan?.assignment || {}) },
    byElement,
    rule: plan?.rule === 'own' ? 'own' : 'stacked',
    lineMode: plan?.lineMode === 'shapes' ? 'shapes' : 'edges',
  };
}

/**
 * A saved plan back into one this module can use. Anything unreadable comes
 * back as null rather than as a plan with silent holes in it.
 *
 * @param {object|string|null} saved
 * @returns {object|null}
 */
export function parsePlan(saved) {
  let raw = saved;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== 'object') return null;
  if (!Array.isArray(raw.palette) || !Array.isArray(raw.order)) return null;
  return {
    palette: raw.palette.filter((c) => c && c.id && c.hex),
    order: raw.order.filter((id) => typeof id === 'string'),
    assignment:
      raw.assignment && typeof raw.assignment === 'object'
        ? raw.assignment
        : {},
    byElement:
      raw.byElement && typeof raw.byElement === 'object' ? raw.byElement : {},
    rule: raw.rule === 'own' ? 'own' : 'stacked',
    lineMode: raw.lineMode === 'shapes' ? 'shapes' : 'edges',
  };
}
