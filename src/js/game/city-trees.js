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
/**
 * ★★ CW-94 (CW-Q94): THE COMPRESSION IS RETIRED - trees stand at their full
 * cited heights. The paragraph above records why it existed (full crowns at
 * this planting density closed the sky), and that reason is not deleted, it
 * is DECIDED DIFFERENTLY: the crown is no longer a solid blob but a sparse
 * ring-branch system with real gaps (the reference's own look), so a street
 * of full-height trees no longer paints a ceiling - and the sky-closure
 * photograph at a Seattle infill street is in the CW-94 record so the trade
 * is judged on a picture. One number to reverse, exactly as promised.
 */
const HEIGHT_SQUASH = 1;

/** Trunk side length as a fraction of tree height, floored so a young tree
 * still has a stem the sampler can find. */
const TRUNK_SIDE_SHARE = 0.022;
const TRUNK_SIDE_MIN_M = 0.28;

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
    // CW-94: the trunk is the LEADER now - it runs the full height and the
    // branch rings hang off it. The old baseM + overlap stem belonged to the
    // blob crown, which the near build no longer draws.
    trunkHeightM: topM,
    stacks: form.stacks,
  };
}

// ---------------------------------------------------------------------------
// CW-94 (CW-Q94): the ring-branch system - the owner's own specification
// ---------------------------------------------------------------------------

/**
 * Per-form ring/branch/leaf parameters. The species tables above already
 * carry the cited HEIGHTS and the form each species takes; what a form
 * means in branches is written here, once per form, so a vase-elm and a
 * vase-honeylocust differ by their cited sizes rather than by two copies of
 * the same numbers.
 *
 * The numbers are design values in the same sense the canopy forms above
 * are: the cited quantities remain the heights and spreads in CITY_TREES;
 * ring spacing, branch counts and pitches are the drawn interpretation of
 * each form's published silhouette (a vase branches upward, an oak spreads,
 * a conifer whorls and droops at the base). Every law the owner named is a
 * unit case: counts within range and never above 4, lower rings longer and
 * thicker, ring budget falling as rings climb.
 *
 * `lenShare` is [bottom, top] branch length as a share of the tree's crown
 * radius; `pitchDeg` is [bottom, top] elevation above horizontal;
 * `countBudget` is [bottom, top] the per-ring cap the seeded draw picks
 * under (never above BRANCHES_PER_RING_MAX).
 */
export const BRANCH_SYSTEM = {
  round: {
    ringSpacingM: 2.8,
    countBudget: [4, 1],
    lenShare: [1.0, 0.3],
    pitchDeg: [15, 45],
    thickShare: 0.09,
  },
  oval: {
    ringSpacingM: 2.5,
    countBudget: [3, 1],
    lenShare: [0.75, 0.3],
    pitchDeg: [25, 55],
    thickShare: 0.08,
  },
  vase: {
    ringSpacingM: 2.7,
    countBudget: [3, 2],
    lenShare: [0.85, 0.5],
    pitchDeg: [35, 60],
    thickShare: 0.08,
  },
  columnar: {
    ringSpacingM: 2.0,
    countBudget: [3, 1],
    lenShare: [0.5, 0.2],
    pitchDeg: [30, 65],
    thickShare: 0.07,
  },
  cone: {
    ringSpacingM: 1.9,
    countBudget: [4, 1],
    lenShare: [1.0, 0.12],
    pitchDeg: [-10, 8],
    thickShare: 0.07,
  },
};

/** The square trunk has four faces, and that is the hard cap the owner set. */
export const BRANCHES_PER_RING_MAX = 4;

/** Leaf cubes are about twice the branch member's cross-section - drawn a
 * shade over (2.4) so a run reads chunky at 30 % cells, the same kind of
 * drawn-width call the diagrid and the cane made. */
export const LEAF_CUBE_SHARE = 3;
export const LEAF_CUBE_MIN_M = 0.45;
/**
 * Centre-to-centre spacing of successive leaf cubes along a branch, in cube
 * sizes. JUST OVER 1: the cubes of one branch overlap into a single
 * enveloping run - the owner's "foliage wraps the branch, the branch
 * travels inside its leaf run" - photographed at 1.8 first, which read as
 * winter buds dotted along bare wood. The sparseness the reference's look
 * needs (CW94-STEP0-LEAF-TECHNIQUE.md) lives BETWEEN runs: the bare inner
 * share below, the gaps between branches, and the rings' own spacing.
 */
export const LEAF_SPACING_SHARE = 1.15;
/** The bare inner share of a branch: leaves wrap the outer run only. Part
 * budget, part constraint (e) - the run nearest the trunk stays clear. */
export const LEAF_BARE_INNER_SHARE = 0.45;

/** The base flare: species-appropriate on the big trees, skipped on small
 * ones (a hawthorn has no buttress). Sides as a multiple of the trunk's. */
const FLARE_SIDE_SHARE = 1.7;
const FLARE_HEIGHT_M = 0.9;
const FLARE_MIN_TREE_M = 10;

/** Tiny deterministic LCG over a derived seed - a PRIVATE stream per tree,
 * so the generator can draw freely without re-dealing anybody else's
 * randomness (the CW-46 seed law; the species/tier draws above keep their
 * exact bits). */
function branchLcg(seed) {
  let s = (seed ^ 0x5eaf94) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * The branch rings for one tree: the owner's system, as data.
 *
 * Each branch is a straight member leaving one of the square trunk's four
 * faces: `bearingRad` (world compass), `pitchRad` above horizontal,
 * `lengthM`, `thickM`, and `z0` where it leaves the trunk. The TAPER LAW is
 * in the envelopes: `ringFrac` runs 0 at the lowest ring to 1 at the top,
 * and length, thickness and the count budget all fall with it. The seeded
 * jitter varies trees; the envelopes bound every one of them.
 *
 * @param {ReturnType<typeof treeSpec>} spec
 * @param {number} seed - the tree's existing integer seed
 * @returns {Array<{z0:number,bearingRad:number,pitchRad:number,lengthM:number,thickM:number,ringFrac:number}>}
 */
export function treeBranches(spec, seed) {
  const sys = BRANCH_SYSTEM[spec.form] ?? BRANCH_SYSTEM.round;
  const rng = branchLcg(seed);
  const branches = [];
  const crownBase = spec.baseM;
  const crownTop = spec.topM - Math.max(0.6, spec.topM * 0.04);
  const span = crownTop - crownBase;
  if (span <= 0.5) return branches;
  const rings = Math.max(2, Math.round(span / sys.ringSpacingM));
  const maxLenM = Math.max(0.8, spec.radiusM);
  const thickBase = Math.max(0.12, spec.trunkSideM * 0.55);

  for (let r = 0; r < rings; r++) {
    const ringFrac = rings === 1 ? 0 : r / (rings - 1);
    const z0 = crownBase + span * ringFrac;
    const budget = Math.round(
      sys.countBudget[0] + (sys.countBudget[1] - sys.countBudget[0]) * ringFrac
    );
    const cap = Math.min(BRANCHES_PER_RING_MAX, Math.max(0, budget));
    // 0..cap, seeded: a ring may honestly carry nothing.
    const count = Math.min(cap, Math.floor(rng() * (cap + 1)));
    // The four faces, dealt in seeded order so consecutive rings do not
    // stripe one side of the tree.
    const faceOffset = Math.floor(rng() * 4);
    for (let b = 0; b < count; b++) {
      const face = (faceOffset + b) % 4;
      const bearingRad = (face * Math.PI) / 2 + (rng() - 0.5) * (Math.PI / 5);
      const lenEnvelope =
        sys.lenShare[0] + (sys.lenShare[1] - sys.lenShare[0]) * ringFrac;
      const lengthM = Math.max(
        0.6,
        maxLenM * lenEnvelope * (0.75 + rng() * 0.35)
      );
      const pitchDeg =
        sys.pitchDeg[0] + (sys.pitchDeg[1] - sys.pitchDeg[0]) * ringFrac;
      const pitchRad = ((pitchDeg + (rng() - 0.5) * 10) * Math.PI) / 180;
      const thickM = Math.max(0.1, thickBase * (1 - 0.6 * ringFrac));
      branches.push({ z0, bearingRad, pitchRad, lengthM, thickM, ringFrac });
    }
  }
  return branches;
}

/**
 * The leaf cubes wrapping one branch: opaque cubes at ~2x the branch's
 * cross-section, spaced with deliberate gaps, enveloping the OUTER run of
 * the member (the branch travels inside its leaf run). Returned in the
 * branch's own frame as distances along it; the caller places them in the
 * world and enforces constraint (e) - no leaf below head height - because
 * only the caller knows the tree's ground.
 *
 * @param {{lengthM:number,thickM:number}} branch
 * @returns {Array<{alongM:number,sizeM:number}>}
 */
export function branchLeafCubes(branch) {
  const sizeM = Math.max(LEAF_CUBE_MIN_M, branch.thickM * LEAF_CUBE_SHARE);
  const startM = branch.lengthM * LEAF_BARE_INNER_SHARE;
  const step = sizeM * LEAF_SPACING_SHARE;
  const cubes = [];
  for (let a = startM; a <= branch.lengthM; a += step) {
    cubes.push({ alongM: a, sizeM });
  }
  // The tip always carries one, so no branch ends in a bare spike.
  const last = cubes[cubes.length - 1];
  if (!last || branch.lengthM - last.alongM > step * 0.5) {
    cubes.push({ alongM: branch.lengthM, sizeM });
  }
  return cubes;
}

/**
 * The base flare, where species-appropriate: a short wider collar at the
 * foot of a big tree's trunk. Small species return null - a hawthorn has no
 * buttress and a false one would read as a planter.
 *
 * @param {ReturnType<typeof treeSpec>} spec
 * @returns {{sideM:number,heightM:number}|null}
 */
export function trunkFlare(spec) {
  if (spec.topM < FLARE_MIN_TREE_M) return null;
  return {
    sideM: spec.trunkSideM * FLARE_SIDE_SHARE,
    heightM: FLARE_HEIGHT_M,
  };
}

/**
 * The crown geometries for one tree, already positioned. One icosahedron for
 * every form but the cone, which is three shrinking ones stacked - a cone
 * built as a smooth cone would lose the facets, and the facets are what read
 * as needles.
 *
 * CW-94: the near build no longer calls this - trees are their ring-branch
 * system now - but the function stays exactly as shipped, because CW-82's
 * far tier keeps SIMPLE crowns (no branch cubes ride the far mesh) and this
 * is the crown it will draw.
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
