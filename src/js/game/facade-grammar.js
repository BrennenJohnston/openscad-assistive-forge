/**
 * FACADE GRAMMAR (CW-73): what a building's TYPE says about its windows, and
 * how many rows and bays actually FIT on it.
 *
 * Before this module a facade was a texture chosen by `hash % 9` (a mapped
 * `building:material` narrowing the choice where one existed), laid onto the
 * wall in world metres. Two things followed from that, and both of them are
 * what this module exists to remove:
 *
 *   1. A block of flats and an office tower had the same chance of every
 *      glazing kind, so the ASCII could not tell them apart. The map data
 *      says which is which - `building=apartments` on 605 buildings across
 *      the four extracts, `commercial` on 266, `office` on 91 - and nothing
 *      read it.
 *   2. UVs in world metres mean the tile starts wherever the building happens
 *      to stand, so a wall of arbitrary width carries a FRACTIONAL BAY at its
 *      corner and a building of arbitrary height a fractional row at its top.
 *      CW-34 and CW-46 fixed the PHASE (the per-building shift moves in whole
 *      bays); the WIDTH and the HEIGHT were never fitted.
 *
 * Everything here is pure arithmetic and a table. The mesh side of it - which
 * vertices get which u and v - lives in city-scene.js, because that is where
 * the geometry is.
 *
 * ★ THE DEFAULT FAMILY IS ALL NINE ARCHETYPES, NOT ONE. `building=yes` is the
 * commonest value in three of the four cities (1,168 of 2,793 buildings; 511
 * of Albuquerque's 640), so a default that named a single family would trade
 * this release's gain for a monoculture across most of the city - the exact
 * fault CW-34 was written to remove. No data means no claim.
 */

/**
 * THE CENSUS the table is built over, re-measured at HEAD on 2026-08-29 from
 * the four shipped extracts (`public/examples/ascii-city/*.json`), counting
 * elements carrying a `building` tag:
 *
 *   Seattle      1,387 buildings, 766 with levels, 127 with material
 *   Denver         330 buildings, 271 with levels,  47 with material
 *   Albuquerque    640 buildings, 159 with levels,   0 with material
 *   Burnaby        436 buildings, 258 with levels,   5 with material
 *
 * 43 distinct `building` values in all. Every one of them is either in
 * FACADE_FAMILY_BY_TYPE below or deliberately left to the default family, and
 * the unit suite holds the whole census so a rebake that brings a new value
 * cannot slip past unnoticed.
 */

/** The storey height assumed when a building carries no `building:levels`. */
export const FACADE_LEVEL_M_DEFAULT = 3.2;

/**
 * A wall narrower than this fraction of its family's bay carries NO window at
 * all rather than a squeezed one. Stretching one bay across a 1.2 m return
 * gives a window wider than the wall it sits on; a dark wall is the honest
 * picture, and the count of them goes in the release record.
 */
export const BLANK_WALL_MIN_BAY_FRACTION = 0.6;

/**
 * ★★ A WALL LOWER THAN THIS IS NOT A STOREY - AND THE RULE THAT WOULD BLANK IT
 * WAS MEASURED AND REFUSED. `tooShort` is reported, and COUNTED in the scene
 * statistics, but nothing acts on it.
 *
 * The symmetric rule looked obviously right: a wall too NARROW for one bay
 * carries no window, so a wall too SHORT for one row should carry none either.
 * The Space Needle's thirteen parts include 0.9 m and 1.2 m bands between
 * volumes, and each is given a whole row of windows squashed into it.
 *
 * Then it was measured on all four cities, and the cure is worse:
 *
 *   threshold        Denver blank walls        Seattle
 *   none (shipped)   2.10 % of wall metres     2.14 %
 *   1.0 m           12.90 % (232 volumes)      2.69 % (16)
 *   1.3 m           18.24 % (343)              3.10 % (31)
 *   1.8 m           20.49 % (380)              4.61 % (68)
 *   0.6 of a storey 24.93 % (488)              5.32 % (86)
 *
 * Denver's 330 buildings carry 3,013 `building:part` prisms, stacked slabs
 * with long perimeters and sub-metre heights, and blanking them takes an
 * eighth to a quarter of the whole city's facade away at EVERY threshold that
 * catches the artefact. A squashed strip of window on a 0.9 m band is a few
 * pixels seen from the street; a fifth of Denver going dark is not. The
 * measurement is kept here and in `stats.shortWalls` so that CW-74, which owns
 * the ground-floor band, inherits the number rather than the surprise.
 */
export const BLANK_WALL_MIN_ROW_M = 1.8;

/** Two consecutive wall edges within this angle are ONE wall for the fit. */
export const WALL_RUN_MAX_TURN_DEG = 12;

/**
 * The families, each a shortlist of window archetypes and the storey height
 * to assume when the data does not say.
 *
 * The archetypes are named, not indexed: city-scene.js owns the table they
 * name and resolves them, so a reordering there cannot silently re-point a
 * family here. The names must match `WINDOW_ARCHETYPE_NAMES` exactly, and a
 * unit test proves they all do.
 *
 * These are TASTE, one line each to reverse, and they are shortlists rather
 * than single answers on purpose: 605 apartment buildings all wearing one
 * face is the same monoculture at a finer grain.
 */
export const FACADE_FAMILIES = Object.freeze({
  // A grid of small punched windows, floor after identical floor.
  apartments: Object.freeze({
    archetypes: Object.freeze(['narrow', 'plain', 'cross']),
    levelM: 3,
  }),
  // Domestic: fewer, smaller openings, and blinds that are not all at the
  // same height.
  house: Object.freeze({
    archetypes: Object.freeze(['narrow', 'blinds']),
    levelM: 3,
  }),
  // Curtain wall: glazing bars and continuous bands, not holes in masonry.
  office: Object.freeze({
    archetypes: Object.freeze(['stripes', 'band', 'pair']),
    levelM: 3.8,
  }),
  // Wide letterbox glazing over the shopfront the ground floor already wears.
  retail: Object.freeze({
    archetypes: Object.freeze(['wide', 'band']),
    levelM: 4,
  }),
  // Paired windows, one per room, and the blinds down in half of them.
  hotel: Object.freeze({
    archetypes: Object.freeze(['pair', 'blinds']),
    levelM: 3.2,
  }),
  // Institutional: tall openings in a heavy wall, floors further apart.
  civic: Object.freeze({
    archetypes: Object.freeze(['slot', 'cross', 'plain']),
    levelM: 4,
  }),
  // One tall slot, and a storey height nothing else in the city has.
  church: Object.freeze({
    archetypes: Object.freeze(['slot']),
    levelM: 6,
  }),
  // Mostly solid wall with occasional openings, and big floor-to-floor.
  industrial: Object.freeze({
    archetypes: Object.freeze(['slot', 'narrow']),
    levelM: 4.5,
  }),
  // An open deck reads as a continuous horizontal band, which is what a
  // parking structure actually looks like from the pavement.
  parking: Object.freeze({
    archetypes: Object.freeze(['band', 'stripes']),
    levelM: 3,
  }),
  // THE DEFAULT. All nine, the hash choosing, exactly as the city has always
  // looked. See the note at the top of this file for why it is not one.
  mixed: Object.freeze({
    archetypes: Object.freeze([
      'plain',
      'slot',
      'pair',
      'blinds',
      'stripes',
      'wide',
      'cross',
      'narrow',
      'band',
    ]),
    levelM: FACADE_LEVEL_M_DEFAULT,
  }),
});

/** The family a building falls to when its type says nothing useful. */
export const FACADE_FAMILY_DEFAULT = 'mixed';

/**
 * `building=*` to family. Exhaustive over the census above; the values left
 * out of it (`yes`, `roof`, `no`) are left out ON PURPOSE and take the
 * default.
 */
export const FACADE_FAMILY_BY_TYPE = new Map([
  ['apartments', 'apartments'],
  ['residential', 'apartments'],
  ['terrace', 'apartments'],
  ['dormitory', 'apartments'],

  ['house', 'house'],
  ['detached', 'house'],
  ['semidetached_house', 'house'],
  ['bungalow', 'house'],
  ['hut', 'house'],
  ['cabin', 'house'],
  ['prefabricated', 'house'],

  ['office', 'office'],
  ['commercial', 'office'],
  ['government', 'office'],
  ['public', 'office'],
  ['data_center', 'office'],
  // A skybridge is a glazed link between two towers, not a shed.
  ['bridge', 'office'],

  ['retail', 'retail'],
  ['supermarket', 'retail'],
  ['kiosk', 'retail'],
  ['shop', 'retail'],
  ['mall', 'retail'],

  ['hotel', 'hotel'],
  ['motel', 'hotel'],

  ['civic', 'civic'],
  ['hospital', 'civic'],
  ['school', 'civic'],
  ['university', 'civic'],
  ['college', 'civic'],
  ['museum', 'civic'],
  ['library', 'civic'],
  ['pavilion', 'civic'],
  ['fire_station', 'civic'],
  ['train_station', 'civic'],
  ['transportation', 'civic'],
  ['stadium', 'civic'],

  ['church', 'church'],
  ['cathedral', 'church'],
  ['chapel', 'church'],
  ['mosque', 'church'],
  ['synagogue', 'church'],
  ['temple', 'church'],

  ['industrial', 'industrial'],
  ['warehouse', 'industrial'],
  ['shed', 'industrial'],
  ['service', 'industrial'],
  ['garage', 'industrial'],
  ['garages', 'industrial'],
  ['carport', 'industrial'],
  ['greenhouse', 'industrial'],
  ['construction', 'industrial'],
  ['tower', 'industrial'],

  ['parking', 'parking'],
]);

/**
 * @param {string|undefined|null} buildingType the raw `building` tag
 * @returns {string} a key of FACADE_FAMILIES, never undefined
 */
export function facadeFamilyFor(buildingType) {
  if (typeof buildingType !== 'string') return FACADE_FAMILY_DEFAULT;
  return (
    FACADE_FAMILY_BY_TYPE.get(buildingType.trim().toLowerCase()) ??
    FACADE_FAMILY_DEFAULT
  );
}

/**
 * Which archetypes a building may wear, TYPE first and MATERIAL second.
 *
 * ★ WHERE THE TWO DISAGREE, THE MATERIAL WINS. A type is what a building is
 * USED for; `building:material` is what its wall is actually MADE of, and a
 * glass-walled block of flats has a curtain wall whatever the flats inside it
 * are for. So the intersection is preferred, and where it is empty the
 * material's own shortlist is taken rather than the family's.
 *
 * @param {string} family a key of FACADE_FAMILIES
 * @param {readonly string[]|undefined|null} materialNames
 * @returns {readonly string[]} never empty
 */
export function facadeCandidates(family, materialNames) {
  const familyNames =
    FACADE_FAMILIES[family]?.archetypes ??
    FACADE_FAMILIES[FACADE_FAMILY_DEFAULT].archetypes;
  if (!materialNames || materialNames.length === 0) return familyNames;
  const both = familyNames.filter((n) => materialNames.includes(n));
  return both.length > 0 ? both : materialNames;
}

/**
 * How many window rows fit between a wall's base and its top, and how tall
 * each one is.
 *
 * `building:levels` wins outright where it exists (766 + 271 + 159 + 258
 * buildings across the four cities have it), because it is a statement about
 * the building rather than an inference from its height. Where it does not,
 * the family's storey height divides the wall and the remainder is spread
 * back over the rows, which is what makes the top row full instead of cut.
 *
 * ★ THE GROUND FLOOR IS RESERVED, NOT COUNTED. Pass `baseM` and the grid
 * starts above it; a tagged level count then loses one storey to it, because
 * the ground floor is one of the levels the mapper counted. CW-74 owns what
 * is drawn in that reserved band; this release only keeps the window grid out
 * of it.
 *
 * @param {{heightM:number, baseM?:number, levels?:number|null, levelM?:number}} spec
 * @returns {{rows:number, rowHeightM:number, baseM:number, usableM:number,
 *   tooShort:boolean}|null} `tooShort` means the caller should draw NO window
 *   row here at all - see BLANK_WALL_MIN_ROW_M.
 */
export function fitRows({
  heightM,
  baseM = 0,
  levels = null,
  levelM = FACADE_LEVEL_M_DEFAULT,
}) {
  const base = Number.isFinite(baseM) && baseM > 0 ? baseM : 0;
  const usableM = (Number.isFinite(heightM) ? heightM : 0) - base;
  if (!(usableM > 0)) return null;
  const pitch =
    Number.isFinite(levelM) && levelM > 0 ? levelM : FACADE_LEVEL_M_DEFAULT;

  let rows;
  if (Number.isFinite(levels) && levels >= 1) {
    rows = Math.max(1, Math.round(levels) - (base > 0 ? 1 : 0));
  } else {
    rows = Math.max(1, Math.floor(usableM / pitch));
  }
  return {
    rows,
    rowHeightM: usableM / rows,
    baseM: base,
    usableM,
    tooShort: usableM < BLANK_WALL_MIN_ROW_M,
  };
}

/**
 * How many bays fit across one wall, and how wide each one is.
 *
 * ★ THE EDGE RULE IS TO STRETCH, NOT TO CENTRE. The bay count is the nearest
 * whole number of the family's pitch, and the bays then share the wall
 * exactly, so there is no leftover to centre and no bay cut at a corner. A
 * 17.3 m wall at a 4 m pitch is four bays of 4.325 m; the alternative - four
 * 4 m bays and a 1.3 m gap - puts the very fraction at the corner that this
 * release exists to remove.
 *
 * @param {{widthM:number, pitchM:number}} spec
 * @returns {{bays:number, bayWidthM:number}} bays 0 means a BLANK wall
 */
export function fitBays({ widthM, pitchM }) {
  const w = Number.isFinite(widthM) ? widthM : 0;
  const pitch = Number.isFinite(pitchM) && pitchM > 0 ? pitchM : 0;
  if (!(w > 0) || !(pitch > 0)) return { bays: 0, bayWidthM: 0 };
  if (w < pitch * BLANK_WALL_MIN_BAY_FRACTION) return { bays: 0, bayWidthM: 0 };
  const bays = Math.max(1, Math.round(w / pitch));
  return { bays, bayWidthM: w / bays };
}

/**
 * Group a wall's edges into RUNS, so a straight wall the map data happens to
 * have split at a node is fitted as one wall rather than two.
 *
 * OSM footprints split straight walls all the time - a node shared with a
 * neighbouring building, a kerb, a survey point. Fitting bays per EDGE would
 * put a different bay width either side of such a node, and the join is
 * exactly where the eye looks. Two edges join a run when they share an
 * endpoint and turn by less than `maxTurnDeg`.
 *
 * The segments come from the MESH, in the order the extruder emitted them,
 * not from the source ring: the extruder is free to reverse a contour's
 * winding, and a run built from the ring would then be pointing at the wrong
 * walls. Requiring a shared endpoint also stops a run crossing from the outer
 * contour into a hole, because those are never joined.
 *
 * @param {ReadonlyArray<readonly [readonly [number, number], readonly [number, number]]>} segments
 * @param {number} [maxTurnDeg]
 * @returns {Array<{start:number, count:number, lengthM:number}>}
 */
export function groupWallRuns(segments, maxTurnDeg = WALL_RUN_MAX_TURN_DEG) {
  const runs = [];
  const cosLimit = Math.cos((Math.max(0, maxTurnDeg) * Math.PI) / 180);
  const EPS = 1e-4;
  let run = null;
  let prev = null;

  for (let i = 0; i < segments.length; i++) {
    const [a, b] = segments[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (!(len > 0)) {
      // A zero-length edge is not a wall; it ends the run so the walls either
      // side of it are not silently welded together.
      run = null;
      prev = null;
      continue;
    }
    const dir = [dx / len, dy / len];
    const joins =
      run !== null &&
      prev !== null &&
      Math.abs(a[0] - prev.end[0]) < EPS &&
      Math.abs(a[1] - prev.end[1]) < EPS &&
      dir[0] * prev.dir[0] + dir[1] * prev.dir[1] >= cosLimit;

    if (joins) {
      run.count++;
      run.lengthM += len;
    } else {
      run = { start: i, count: 1, lengthM: len };
      runs.push(run);
    }
    prev = { end: b, dir };
  }
  return runs;
}
