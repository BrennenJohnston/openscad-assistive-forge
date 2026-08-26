/**
 * Per-city street-tree species and canopy forms (CW-56, CW-Q55).
 *
 * Round 4 gave every city in the game the same tree: one 0.3 m trunk and one
 * detail-0 icosahedron of radius 1.25 m, topping out at 4.5 m. That is a
 * shrub, and it is the same shrub in Seattle and in Albuquerque. CW-Q55 signs
 * the alternative: a per-city species TABLE as cited design data, assigned per
 * tree, driving height and canopy form.
 *
 * THE TABLES ARE DESIGN DATA, NOT A TREE CENSUS, and they are owner-vetoable
 * row by row. Municipal per-tree inventories exist for at least three of the
 * four cities, but ingesting them would be a new bulk pipeline with a licence
 * to read per portal, for variety the game can get from what it already has.
 * Every table below is the published COMPOSITION of that city's street trees,
 * cited, turned into five rows. Sources, in full, in plan section 3b:
 *
 * - Seattle: SDOT street-tree composition - roughly 21% flowering cherry and
 *   plum, roughly 20% maples, then hawthorn, crabapple, oak, linden.
 * - Denver: the city forestry street-tree guide - silver maple, elm and ash
 *   together about 40% of street trees, with honeylocust and linden common.
 * - Albuquerque: USDA Forest Service Municipal Forest Resource Analysis
 *   (cufr_674) - Siberian elm dominant at 27.7% of replacement value, with
 *   honeylocust, ash, London planetree, desert willow and Austrian pine.
 * - Burnaby: City of Burnaby State of the Urban Forest Report (Aug 2023) -
 *   32,500+ street trees, Acer over 20% and Prunus over 20%, with cedar and
 *   Douglas-fir carrying the large trees.
 *
 * WHY ALBUQUERQUE MATTERS MOST. It is the control city, and the honest thing
 * for a control to do is wear its own trees: a desert willow and a piñon pine,
 * not a Seattle maple. The same argument makes Burnaby's conifers the point of
 * Burnaby.
 *
 * Pure geometry and table lookup - no placement, no palette choice, no DOM -
 * so every range and form is unit-testable.
 *
 * @license GPL-3.0-or-later
 */

import { IcosahedronGeometry } from 'three';

/**
 * The five canopy forms, and what each is actually made of.
 *
 * A form is a scaling of the same faceted crown the game already draws,
 * except the cone, which stacks three shrinking ones. The facets are the
 * point: flat facets give the sampler the luminance steps that read as leaves
 * rather than as a blob, so no form smooths the crown out.
 *
 * `baseShare` is where the crown starts as a fraction of the tree's height,
 * and `widthRatio` is how wide the crown is against its own vertical extent.
 * A vase is wide and starts high; a columnar is narrow and starts low.
 */
export const CANOPY_FORMS = {
  round: { baseShare: 0.35, widthRatio: 1.15, stacks: 1 },
  oval: { baseShare: 0.32, widthRatio: 0.72, stacks: 1 },
  vase: { baseShare: 0.45, widthRatio: 1.35, stacks: 1 },
  columnar: { baseShare: 0.28, widthRatio: 0.5, stacks: 1 },
  cone: { baseShare: 0.12, widthRatio: 0.55, stacks: 3 },
};

/**
 * The crown never starts below this, whatever the form's baseShare works out
 * to (CW-16's law): the player walks UNDER a street tree, and a crown at head
 * height is a wall the collision grid does not know about.
 *
 * A conifer that skirts to the ground is the truer shape, and this is what
 * says no to it. The alternative was stamping the skirt into collision, which
 * turns every fir into an obstacle a cane would have to find - a real change
 * to how the city walks, for a silhouette. One line to lower it, and the
 * collision question comes back with it.
 */
export const CANOPY_BASE_MIN_M = 2;

/**
 * ★ THE CITED HEIGHTS ARE COMPRESSED BEFORE ANYTHING IS DRAWN, and the
 * photographs are why.
 *
 * Built at their cited heights, these tables close the sky. A mature oak is
 * genuinely 25 m tall with an 18 m spread, and that is genuinely what a real
 * street of oaks does - but this city plants an infill tree every 18 m on
 * every road, which is denser than any real street, and at that density
 * full-size crowns overlap into a continuous ceiling. Photographed standing
 * where the trees are thickest, all four cities read as forest interior:
 * trunks, a canopy roof, and no skyline at all. The acceptance this release
 * is measured against asks for each city's skyline and streets, and you
 * cannot see a skyline through a closed canopy.
 *
 * So the excess above a floor is halved. Small trees keep their size (a
 * hawthorn was never the problem), the giants come down, and every cited
 * RELATIVE difference survives: an oak is still taller than a maple, a
 * Douglas-fir is still the tallest thing on a Burnaby street, a desert willow
 * is still small. The tables below keep the CITED numbers so the citation
 * stays checkable, and this is the one place they are bent.
 *
 * Two lines to reverse, and the reversal is what a denser-planting release
 * would want: raise SQUASH to 1 and the cited heights are drawn as cited.
 */
const HEIGHT_FLOOR_M = 4;
const HEIGHT_SQUASH = 0.5;

/** Trunk side length as a fraction of tree height, floored so a young tree
 * still has a stem the sampler can find. */
const TRUNK_SIDE_SHARE = 0.022;
const TRUNK_SIDE_MIN_M = 0.28;
/** The trunk runs a little into the crown so no seam opens between them. */
const TRUNK_OVERLAP_M = 0.5;

/**
 * The four city tables. `h` is the canopy TOP above the ground, in metres,
 * from the cited height ranges for each species as a street tree.
 *
 * `deciduous` drives CW-56's fallen leaves and nothing else here.
 */
export const CITY_TREES = {
  seattle: [
    { name: 'cherry', form: 'columnar', h: [6, 12], deciduous: true },
    { name: 'maple', form: 'round', h: [10, 20], deciduous: true },
    { name: 'hawthorn', form: 'round', h: [5, 8], deciduous: true },
    { name: 'oak', form: 'round', h: [15, 25], deciduous: true },
    { name: 'linden', form: 'oval', h: [12, 20], deciduous: true },
  ],
  denver: [
    { name: 'silver maple', form: 'round', h: [15, 25], deciduous: true },
    { name: 'American elm', form: 'vase', h: [15, 25], deciduous: true },
    { name: 'green ash', form: 'oval', h: [12, 18], deciduous: true },
    { name: 'honeylocust', form: 'vase', h: [12, 20], deciduous: true },
    { name: 'linden', form: 'oval', h: [12, 20], deciduous: true },
  ],
  albuquerque: [
    { name: 'Siberian elm', form: 'vase', h: [15, 20], deciduous: true },
    { name: 'honeylocust', form: 'vase', h: [10, 20], deciduous: true },
    { name: 'ash', form: 'oval', h: [10, 15], deciduous: true },
    { name: 'desert willow', form: 'vase', h: [5, 8], deciduous: true },
    { name: 'pine', form: 'cone', h: [10, 18], deciduous: false },
  ],
  burnaby: [
    { name: 'maple', form: 'round', h: [10, 20], deciduous: true },
    { name: 'cherry', form: 'columnar', h: [6, 12], deciduous: true },
    { name: 'oak', form: 'round', h: [15, 25], deciduous: true },
    { name: 'western redcedar', form: 'cone', h: [15, 30], deciduous: false },
    { name: 'Douglas-fir', form: 'cone', h: [20, 30], deciduous: false },
  ],
};

/**
 * The table a city walks in. An unknown city falls back to Seattle's rather
 * than to nothing: a city with no table should still have varied trees, and
 * silently planting one shrub everywhere is the failure this release exists
 * to end.
 */
export function treeTableFor(cityName) {
  return CITY_TREES[cityName] ?? CITY_TREES.seattle;
}

/**
 * A conifer for a city whose table does not name one.
 *
 * ★ MEASURED, and it is the reason this exists: Seattle's extract records 34
 * needleleaved trees and Denver's records 3, and NEITHER city's published
 * street-tree composition has a conifer in its top five. Without this, those
 * 37 real, mapped conifers would be drawn as maples.
 *
 * The way out is to notice that two different questions were being conflated.
 * The map is telling us a FORM - this tree has needles. The design table is
 * telling us which species this city PLANTS. A city can honestly have both:
 * broadleaves in its table and a conifer on the corner. So a needleleaved tree
 * with no row to land on gets the form the map gave it and no name it cannot
 * back up. The height range is the overlap of the two cited conifer ranges
 * this round has (Albuquerque's pine 10-18, Burnaby's cedar 15-30), widened a
 * little in each direction rather than borrowed from either city.
 */
const UNNAMED_CONIFER = {
  name: 'conifer',
  form: 'cone',
  h: [12, 22],
  deciduous: false,
};

/**
 * Which species this tree is.
 *
 * `leafType` is OpenStreetMap's own answer where a mapper gave one, and it
 * WINS: broadleaved picks among the table's deciduous rows, needleleaved
 * among its conifers - or the unnamed conifer above, where the table has
 * none. Where the data is silent - which is most trees, and EVERY tree in
 * Albuquerque - the hash decides from the whole table.
 *
 * @param {Array} table - one of CITY_TREES
 * @param {number} draw - an integer; the caller supplies bits of an EXISTING
 *   seed rather than a new random stream, so nothing else reshuffles
 * @param {string|undefined} leafType - OSM leaf_type, where present
 */
export function pickSpecies(table, draw, leafType) {
  let pool = table;
  if (leafType === 'needleleaved') {
    const conifers = table.filter((s) => !s.deciduous);
    if (conifers.length === 0) return UNNAMED_CONIFER;
    pool = conifers;
  } else if (leafType === 'broadleaved') {
    const broadleaves = table.filter((s) => s.deciduous);
    if (broadleaves.length > 0) pool = broadleaves;
  }
  return pool[Math.abs(draw) % pool.length];
}

/**
 * The measurements one tree gets: how tall, where its crown starts and ends,
 * how wide the crown is, how thick the stem.
 *
 * `t` is a 0..1 position inside the species' own height range, so the same
 * tree is the same size on every load and two trees of one species still
 * differ.
 */
export function treeSpec(species, t) {
  const form = CANOPY_FORMS[species.form] ?? CANOPY_FORMS.round;
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const citedM = species.h[0] + (species.h[1] - species.h[0]) * clamped;
  const topM = HEIGHT_FLOOR_M + (citedM - HEIGHT_FLOOR_M) * HEIGHT_SQUASH;
  const baseM = Math.max(CANOPY_BASE_MIN_M, topM * form.baseShare);
  const crownM = Math.max(0.5, topM - baseM);
  return {
    name: species.name,
    form: species.form,
    deciduous: species.deciduous,
    citedTopM: citedM,
    topM,
    baseM,
    crownM,
    radiusM: (crownM / 2) * form.widthRatio,
    trunkSideM: Math.max(TRUNK_SIDE_MIN_M, topM * TRUNK_SIDE_SHARE),
    trunkHeightM: baseM + TRUNK_OVERLAP_M,
    stacks: form.stacks,
  };
}

/**
 * The crown geometries for one tree, already positioned. One icosahedron for
 * every form but the cone, which is three shrinking ones stacked - a cone
 * built as a smooth cone would lose the facets, and the facets are what read
 * as needles.
 *
 * Returned as a list so the caller merges them the way it merges everything
 * else; the caller also owns the tint, because palette CHOICE lives in
 * city-scene.
 */
export function makeCanopyGeoms(x, y, spec) {
  const geoms = [];
  const n = spec.stacks;
  const sliceH = spec.crownM / n;
  for (let i = 0; i < n; i++) {
    // Each stack takes a slice of the crown's height and shrinks across.
    const shrink = n === 1 ? 1 : 1 - (i / n) * 0.6;
    const g = new IcosahedronGeometry(1, 0);
    g.scale(
      spec.radiusM * shrink,
      spec.radiusM * shrink,
      // The stacks overlap by a third so no gap opens between them; a single
      // crown fills its slice exactly.
      (sliceH / 2) * (n === 1 ? 1 : 1.35)
    );
    // ★ THE CROWN IS PLACED BY ITS MEASURED BOTTOM, not by its centre. A
    // unit icosahedron does not extend a full 1 along z - its vertices sit
    // where they sit - so a crown positioned by arithmetic lands somewhere
    // the arithmetic did not predict. Measured: the first version put
    // Albuquerque's pine crown at 1.50 m, under the 1.7 m a walker's eye is
    // at, and the unit guard caught it on its first run. Reading the box the
    // geometry actually has is immune to the solid's proportions.
    g.computeBoundingBox();
    const box = g.boundingBox;
    const wantBottom = spec.baseM + sliceH * i;
    g.translate(x, y, wantBottom - box.min.z);
    geoms.push(g);
  }
  return geoms;
}
