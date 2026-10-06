/**
 * Per-city street-tree species and canopy forms.
 *
 * A per-city species table as cited design data, assigned per tree, driving
 * height and canopy form. One tree for every city would be the same shrub in
 * Seattle and in Albuquerque.
 *
 * The tables are design data, not a tree census. Municipal per-tree
 * inventories exist for at least three of the four cities, but ingesting
 * them would be a new bulk pipeline with a license to read per portal, for
 * variety the game can get from what it already has. Every table below is
 * the published composition of that city's street trees, cited, turned into
 * five rows:
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
 * Why Albuquerque matters most. It is the control city, and the honest thing
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
 * to: the player walks under a street tree, and a crown at head
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
 * The cited heights can be compressed before anything is drawn: the excess
 * above a floor is scaled by HEIGHT_SQUASH. Small trees keep their size, the
 * giants come down, and every cited relative difference survives. The tables
 * below keep the cited numbers so the citation stays checkable, and this is
 * the one place they are bent.
 *
 * The reason to compress is density. A mature oak is genuinely 25 m tall
 * with an 18 m spread, but this city plants an infill tree every 18 m on
 * every road, which is denser than any real street, and at that density
 * solid full-size crowns overlap into a continuous ceiling that hides the
 * skyline.
 */
const HEIGHT_FLOOR_M = 4;
/**
 * 1 draws the trees at their full cited heights; 0.5 halves the excess above
 * the floor. Full height works because the crown is a sparse ring-branch
 * system with real gaps rather than a solid blob, so a street of full-height
 * trees does not paint a ceiling.
 */
const HEIGHT_SQUASH = 1;

/** Trunk side length as a fraction of tree height, floored so a young tree
 * still has a stem the sampler can find. */
const TRUNK_SIDE_SHARE = 0.022;
const TRUNK_SIDE_MIN_M = 0.28;

/**
 * The four city tables. `h` is the canopy TOP above the ground, in meters,
 * from the cited height ranges for each species as a street tree.
 *
 * `deciduous` separates the broadleaves from the conifers for `pickSpecies`.
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
 * than to nothing: a city with no table should still have varied trees.
 */
export function treeTableFor(cityName) {
  return CITY_TREES[cityName] ?? CITY_TREES.seattle;
}

/**
 * A conifer for a city whose table does not name one.
 *
 * Seattle's extract records 34 needleleaved trees and Denver's records 3,
 * and neither city's published street-tree composition has a conifer in its
 * top five. Without this, those 37 real, mapped conifers would be drawn as
 * maples.
 *
 * The map is telling us a form - this tree has needles. The design table is
 * telling us which species this city plants. A city can honestly have both:
 * broadleaves in its table and a conifer on the corner. So a needleleaved tree
 * with no row to land on gets the form the map gave it and no name it cannot
 * back up. The height range is the overlap of the two cited conifer ranges
 * (Albuquerque's pine 10-18, Burnaby's cedar 15-30), widened a little in
 * each direction rather than borrowed from either city.
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
    // The trunk is the leader - it runs the full height and the branch rings
    // hang off it.
    trunkHeightM: topM,
    stacks: form.stacks,
  };
}

// ---------------------------------------------------------------------------
// The ring-branch system
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
 * a conifer whorls and droops at the base). Every rule is a
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

/** The square trunk has four faces, and that is the hard cap. */
export const BRANCHES_PER_RING_MAX = 4;

/**
 * The crown-cluster parameters. Leaf runs that only trace the branches give
 * structure without mass and do not read as a tree. A crown needs five cues
 * (ragged outline, sky punctures, clumping, a crown envelope, a value
 * gradient), and the assembly that delivers them is a hollow shell of
 * overlapping masses filling the species' envelope, sparse interior fill,
 * larger masses low, free rotation. Alpha-cutout leaves are deliberately not
 * used: the converter samples one or two pixels per cell and re-rolls them
 * in motion, so sub-cell texture holes would flicker leaf/sky per frame. The
 * punctures live at box scale instead, where a gap is cell-legible and
 * stays put.
 */
export const CROWN_CLUSTER = {
  /** Share of the envelope's surface the shell boxes claim; the remainder
   * is the sky punctures. A leaf texture wants 35-60%
   * coverage; geometry reads denser than texture, so the shell sits just
   * above that band and the punctures stay real. */
  coverage: 0.62,
  /** Interior boxes as a share of the shell count. Pixel rendering wants
   * 20-30% for depth behind the punctures. At 30% ASCII cells an interior
   * box shows only through an aligned pair of punctures, where near-black
   * reads as depth with or without it, so the share runs at half that and
   * saves triangles (interiors were ~12% of a city's crown triangles). */
  innerShare: 0.15,
  /** Box edge as a share of the crown's vertical extent, and its bounds.
   * A mass, not a bead: the floor keeps a hawthorn's clumps chunky at
   * 30% cells, the cap keeps an oak from being four giant crates. The
   * size is the near-field knob: at 0.25 / 3.4 max a near crown's single
   * face (5.7 m) fills a quarter of the frame as one flat glyph field -
   * an awning, not foliage. The floor is also a budget: count scales
   * with 1/size^2, and the small infill species are most of a city's
   * trees. */
  sizeShare: 0.18,
  sizeMinM: 1.05,
  sizeMaxM: 2.6,
  /** Scale jitter, and the larger-low gradient:
   * bottom boxes larger, top boxes down to 0.75x, so the crown is
   * bottom-heavy and the top edge is the raggedest. */
  scaleJitter: 0.3,
  lowBoost: 1.18,
  topDrop: 0.75,
  /** Tilt range in radians (~10 degrees). Yaw is free. */
  tiltMaxRad: 0.17,
  /** Shell boxes may sink up to this share of the radius into the
   * envelope, so the shell is a band rather than a polished skin. */
  shellSinkShare: 0.15,
  /** Interior boxes live between these radial shares - deep enough to be
   * inside, never at the trunk. */
  innerRadial: [0.3, 0.65],
  /** Shell floor and cap per tree: a tiny crown is still a cluster, a
   * giant one still a bounded merge. The cap is the giants' budget rung -
   * Denver's table is all 15-25 m trees and paid the most triangles - and
   * a capped giant's coverage thins before its shape goes. */
  shellMin: 10,
  shellMax: 80,
};

/** Conifer whorls (a conifer is stacked layers,
 * never a round cluster - drooping rings of masses with sky between the
 * tiers). Spacing is in box sizes; over 1 keeps the between-tier gaps. */
export const CONIFER_WHORLS = {
  sizeShare: 0.13,
  sizeMinM: 0.7,
  sizeMaxM: 2.4,
  tierSpacingShare: 1.35,
  ringCoverage: 0.75,
  /** Ring radius tapers to this share of the base by the top tier. */
  topTaper: 0.08,
  ringMin: 3,
  ringMax: 18,
  droopRad: 0.12,
};

/** The value gradient (cue five): per-box luminance tier offsets the
 * caller applies around the tree's own palette tier - top shell lighter,
 * interior darker, a little per-box jitter so no two neighbors match.
 * Palette CHOICE stays in city-scene; these are offsets, not colors. */
export const CROWN_TONE = {
  heightSpan: 0.16,
  interiorDrop: 0.12,
  jitter: 0.03,
  tierMin: 0.45,
  tierMax: 0.78,
};

/** The base flare: species-appropriate on the big trees, skipped on small
 * ones (a hawthorn has no buttress). Sides as a multiple of the trunk's. */
const FLARE_SIDE_SHARE = 1.7;
const FLARE_HEIGHT_M = 0.9;
const FLARE_MIN_TREE_M = 10;

/** Tiny deterministic LCG over a derived seed - a PRIVATE stream per tree,
 * so the generator can draw freely without re-dealing anybody else's
 * randomness (the species/tier draws above keep their
 * exact bits). */
function branchLcg(seed) {
  let s = (seed ^ 0x5eaf94) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * The branch rings for one tree, as data.
 *
 * Each branch is a straight member leaving one of the square trunk's four
 * faces: `bearingRad` (world compass), `pitchRad` above horizontal,
 * `lengthM`, `thickM`, and `z0` where it leaves the trunk. The taper law is
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

/** Knud Thomsen's ellipsoid surface approximation (about 1% error) - the
 * coverage arithmetic needs an area, not an exact one. */
function ellipsoidSurfaceM2(a, b, c) {
  const p = 1.6075;
  const ap = Math.pow(a, p);
  const bp = Math.pow(b, p);
  const cp = Math.pow(c, p);
  return 4 * Math.PI * Math.pow((ap * bp + ap * cp + bp * cp) / 3, 1 / p);
}

/**
 * The crown as a cluster of masses, in the game's own vocabulary of opaque
 * boxes.
 *
 * Broadleaf forms fill the species' ellipsoid envelope (the spec's own
 * radius and crown height, so a vase is still wide and a columnar still
 * narrow) with a hollow shell of boxes plus sparse interior fill. The
 * shell is sampled on a Fibonacci spiral - even without being regular,
 * like a Poisson distribution without a rejection loop - then
 * jittered, sunk, scaled larger-low, and freely rotated. The cone form is
 * different in kind: stacked whorl rings that taper to a tip,
 * with sky between the tiers.
 *
 * Everything is drawn from one private seeded stream (the species and size
 * draws keep their exact bits), so one seed is one crown, every load.
 * Positions are tree-local (trunk axis at 0,0; ground at z 0); the caller
 * places the tree, clips against buildings, and keeps leaf mass above head
 * height, because only the caller knows the tree's neighbors.
 *
 * @param {ReturnType<typeof treeSpec>} spec
 * @param {number} seed - the tree's existing integer seed
 * @returns {Array<{x:number,y:number,z:number,sizeM:number,yawRad:number,
 *   tiltARad:number,tiltBRad:number,heightFrac:number,interior:boolean,
 *   toneJitter:number}>}
 */
export function crownCluster(spec, seed) {
  const rng = branchLcg((seed ^ 0xc10b5) >>> 0);
  return spec.form === 'cone'
    ? coniferWhorls(spec, rng)
    : broadleafCluster(spec, rng);
}

function broadleafCluster(spec, rng) {
  const P = CROWN_CLUSTER;
  const hr = Math.max(0.6, spec.radiusM);
  const hz = Math.max(0.5, spec.crownM / 2);
  const centreZ = spec.baseM + hz;
  const sizeBase = Math.min(
    P.sizeMaxM,
    Math.max(P.sizeMinM, spec.crownM * P.sizeShare)
  );
  const surfaceM2 = ellipsoidSurfaceM2(hr, hr, hz);
  const shellCount = Math.min(
    P.shellMax,
    Math.max(P.shellMin, Math.round((surfaceM2 * P.coverage) / sizeBase ** 2))
  );
  const innerCount = Math.round(shellCount * P.innerShare);
  const boxes = [];
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < shellCount; i++) {
    // Fibonacci latitude, jittered by up to half a step either way so the
    // spiral never reads as a pattern.
    const zu = Math.max(
      -1,
      Math.min(1, 1 - (2 * (i + 0.5 + (rng() - 0.5))) / shellCount)
    );
    const ru = Math.sqrt(Math.max(0, 1 - zu * zu));
    const theta = golden * i + rng() * 0.9;
    // Sink into the envelope by a seeded share: a band, not a skin.
    const sink = 1 - rng() * P.shellSinkShare;
    boxes.push(
      crownBox(
        rng,
        spec,
        Math.cos(theta) * ru * hr * sink,
        Math.sin(theta) * ru * hr * sink,
        centreZ + zu * hz * sink,
        sizeBase,
        (zu + 1) / 2,
        false
      )
    );
  }

  for (let i = 0; i < innerCount; i++) {
    const zu = rng() * 2 - 1;
    const ru = Math.sqrt(Math.max(0, 1 - zu * zu));
    const theta = rng() * Math.PI * 2;
    const radial =
      P.innerRadial[0] + rng() * (P.innerRadial[1] - P.innerRadial[0]);
    boxes.push(
      crownBox(
        rng,
        spec,
        Math.cos(theta) * ru * hr * radial,
        Math.sin(theta) * ru * hr * radial,
        centreZ + zu * hz * radial,
        sizeBase,
        (zu * radial + 1) / 2,
        true
      )
    );
  }
  return boxes;
}

function crownBox(rng, spec, x, y, z, sizeBase, heightFrac, interior) {
  const P = CROWN_CLUSTER;
  const jitter = 1 - P.scaleJitter + rng() * P.scaleJitter * 2;
  const lowGrade = P.lowBoost + (P.topDrop - P.lowBoost) * heightFrac;
  return {
    x,
    y,
    z,
    sizeM: Math.max(0.4, sizeBase * jitter * lowGrade),
    yawRad: rng() * Math.PI * 0.5,
    tiltARad: (rng() * 2 - 1) * P.tiltMaxRad,
    tiltBRad: (rng() * 2 - 1) * P.tiltMaxRad,
    heightFrac,
    interior,
    toneJitter: (rng() * 2 - 1) * CROWN_TONE.jitter,
  };
}

function coniferWhorls(spec, rng) {
  const W = CONIFER_WHORLS;
  const hr = Math.max(0.5, spec.radiusM);
  const sizeBase = Math.min(
    W.sizeMaxM,
    Math.max(W.sizeMinM, spec.crownM * W.sizeShare)
  );
  const spacing = sizeBase * W.tierSpacingShare;
  const tiers = Math.max(3, Math.round(spec.crownM / spacing));
  const boxes = [];
  for (let t = 0; t < tiers; t++) {
    const frac = tiers === 1 ? 0 : t / (tiers - 1);
    const z = spec.baseM + spec.crownM * frac;
    const ringR = hr * (1 - (1 - W.topTaper) * frac);
    const size = Math.max(0.4, sizeBase * (1.05 - 0.45 * frac));
    const count = Math.min(
      W.ringMax,
      Math.max(
        W.ringMin,
        Math.round((2 * Math.PI * ringR * W.ringCoverage) / size)
      )
    );
    const phase = rng() * Math.PI * 2;
    for (let b = 0; b < count; b++) {
      const a = phase + (b / count) * Math.PI * 2 + (rng() - 0.5) * 0.5;
      const r = ringR * (0.85 + rng() * 0.25);
      boxes.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        z: z + (rng() - 0.5) * size * 0.4,
        sizeM: size * (0.8 + rng() * 0.4),
        yawRad: a + (rng() - 0.5) * 0.4,
        // The droop: the outer edge of a whorl hangs, so each box pitches
        // outward-down about the axis tangent to its ring.
        tiltARad: -Math.sin(a) * W.droopRad,
        tiltBRad: Math.cos(a) * W.droopRad,
        heightFrac: frac,
        interior: false,
        toneJitter: (rng() * 2 - 1) * CROWN_TONE.jitter,
      });
    }
  }
  // The tip: one apex box, so the tree ends in a point rather than a ring.
  boxes.push({
    x: 0,
    y: 0,
    z: spec.topM - sizeBase * 0.3,
    sizeM: Math.max(0.4, sizeBase * 0.7),
    yawRad: rng() * Math.PI * 0.5,
    tiltARad: 0,
    tiltBRad: 0,
    heightFrac: 1,
    interior: false,
    toneJitter: (rng() * 2 - 1) * CROWN_TONE.jitter,
  });
  return boxes;
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
 * The near build does not call this - near trees are their ring-branch
 * system - but the far tier keeps simple crowns (no branch cubes ride the
 * far mesh) and this is the crown it will draw.
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
    // The crown is placed by its measured bottom, not by its center. A unit
    // icosahedron does not extend a full 1 along z - its vertices sit where
    // they sit - so a crown positioned by arithmetic lands somewhere the
    // arithmetic did not predict (Albuquerque's pine crown at 1.50 m, under
    // the 1.7 m a walker's eye is at). Reading the box the geometry actually
    // has is immune to the solid's proportions.
    g.computeBoundingBox();
    const box = g.boundingBox;
    const wantBottom = spec.baseM + sliceH * i;
    g.translate(x, y, wantBottom - box.min.z);
    geoms.push(g);
  }
  return geoms;
}
