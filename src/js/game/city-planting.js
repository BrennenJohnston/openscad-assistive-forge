/**
 * Planters, flowerbeds and picnic tables (CW-57, CW-Q55).
 *
 * CW-55's rebake carried the seeds; this is what renders them. Everything here
 * is pure geometry and table lookup - no placement, no palette CHOICE, no DOM -
 * so every size and hue is unit-testable.
 *
 * THE FLOWER TABLES ARE CITED DESIGN DATA and the owner's to veto row by row.
 * Sources in plan section 3c:
 *
 * - Seattle: dahlia (the city's official flower), rhododendron (the state
 *   flower), rose (Woodland Park Rose Garden), tulip, fuchsia.
 * - Denver: rose, columbine (the state flower), petunia, marigold, tulip
 *   (Denver Parks annual beds and the City Park gardens).
 * - Albuquerque: yucca (the state flower), desert marigold, penstemon,
 *   globemallow, chamisa - the xeric plantings of the ABQ BioPark.
 * - Burnaby: rhododendron, rose (the Burnaby Mountain rose garden), dahlia,
 *   hydrangea, tulip.
 *
 * ★ ALBUQUERQUE'S SET IS THE POINT, again. Three of its five land YELLOW where
 * Seattle's land magenta and red - so the desert city's flowers read as desert
 * flowers rather than as Seattle's in a different place.
 *
 * ★ AND THE ANSI SET HAS NO BLUE. Its six entries are green, cyan, yellow,
 * magenta, red and white. Colorado's columbine is blue-violet and British
 * Columbia's hydrangeas are blue; both land on their nearest available
 * neighbour there, and on the neon set's violet, which is right. The hues below
 * are the FLOWERS' - the landing is the palette's, and it is written down
 * rather than tuned away.
 *
 * At the sizes this game is played a flower is sub-cell, BY DESIGN: the planter
 * box is the readable object and the flowers are colour on top of it. That is
 * the hydrant lesson - shape and position carry identity, colour decorates.
 *
 * @license GPL-3.0-or-later
 */

/** name + hue in degrees. The hue is the flower's; see the header on what
 * each palette does with it. */
export const CITY_FLOWERS = {
  seattle: [
    { name: 'dahlia', hueDeg: 320 },
    { name: 'rhododendron', hueDeg: 300 },
    { name: 'rose', hueDeg: 350 },
    { name: 'tulip', hueDeg: 15 },
    { name: 'fuchsia', hueDeg: 310 },
  ],
  denver: [
    { name: 'rose', hueDeg: 350 },
    { name: 'columbine', hueDeg: 250 },
    { name: 'petunia', hueDeg: 280 },
    { name: 'marigold', hueDeg: 35 },
    { name: 'tulip', hueDeg: 15 },
  ],
  albuquerque: [
    { name: 'yucca', hueDeg: 55 },
    { name: 'desert marigold', hueDeg: 50 },
    { name: 'penstemon', hueDeg: 340 },
    { name: 'globemallow', hueDeg: 25 },
    { name: 'chamisa', hueDeg: 70 },
  ],
  burnaby: [
    { name: 'rhododendron', hueDeg: 300 },
    { name: 'rose', hueDeg: 350 },
    { name: 'dahlia', hueDeg: 320 },
    { name: 'hydrangea', hueDeg: 230 },
    { name: 'tulip', hueDeg: 15 },
  ],
};

/** An unknown city falls back to Seattle's, the same way the tree table does:
 * a city with no flowers should still have flowers. */
export function flowerTableFor(cityName) {
  return CITY_FLOWERS[cityName] ?? CITY_FLOWERS.seattle;
}

/**
 * Which flower this planting wears. The caller supplies bits of an EXISTING
 * seed, never a new random stream, so nothing else reshuffles.
 */
export function pickFlower(table, draw) {
  return table[Math.abs(draw) % table.length];
}

/**
 * A planter: a knee-high box a walker can see and a cane can find.
 *
 * 1.2 x 0.5 x 0.5 m is a municipal street planter, and the height is the
 * point - knee-high is high enough to read as an object against the pavement
 * and low enough that it never blocks a view. Its lid is a separate thin band
 * so the flowers can be a different colour from the box without the box
 * changing brightness: MONO SEES ONE SHAPE either way.
 */
export const PLANTER_L_M = 1.2;
export const PLANTER_W_M = 0.5;
export const PLANTER_H_M = 0.5;
/** The lid the flowers ride on, and how far it is inset from the rim. */
const PLANTER_LID_H_M = 0.09;
const PLANTER_LID_INSET_M = 0.06;

/**
 * A picnic table, as the classic A-frame silhouette: a top, two benches and
 * two leg planes. Built from boxes like every other prop here, because at a
 * few character cells a rounded leg and a square one are the same cell.
 */
export const TABLE_L_M = 1.8;
export const TABLE_W_M = 1.5;
export const TABLE_TOP_H_M = 0.75;
const TABLE_TOP_W_M = 0.75;
const TABLE_SLAB_M = 0.07;
const TABLE_BENCH_W_M = 0.28;
const TABLE_BENCH_H_M = 0.45;
const TABLE_LEG_T_M = 0.09;

/**
 * Rotate a local (along, across) offset into world x/y.
 * `angle` is the prop's facing, measured the way the street furniture
 * machinery measures it.
 */
function place(x, y, angle, along, across) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x + along * c - across * s, y + along * s + across * c];
}

/**
 * The boxes a planter is made of, as {l, w, h, x, y, z, angle, tint} specs -
 * the caller turns them into geometry with its own box builder, and owns the
 * tints.
 */
export function planterBoxes(x, y, angle, bodyTint, flowerTint) {
  const bodyH = PLANTER_H_M - PLANTER_LID_H_M;
  const [lx, ly] = place(x, y, angle, 0, 0);
  return [
    {
      l: PLANTER_L_M,
      w: PLANTER_W_M,
      h: bodyH,
      x: lx,
      y: ly,
      z: bodyH / 2,
      angle,
      tint: bodyTint,
    },
    {
      l: PLANTER_L_M - PLANTER_LID_INSET_M * 2,
      w: PLANTER_W_M - PLANTER_LID_INSET_M * 2,
      h: PLANTER_LID_H_M,
      x: lx,
      y: ly,
      // Overlaps the body a hair rather than sitting exactly on it: two
      // exactly-touching faces are the coplanar fight D-110 is about.
      z: bodyH - 0.01 + PLANTER_LID_H_M / 2,
      angle,
      tint: flowerTint,
    },
  ];
}

/** The boxes a picnic table is made of. */
export function picnicTableBoxes(x, y, angle, tint) {
  const boxes = [];
  const push = (l, w, h, along, across, z) => {
    const [px, py] = place(x, y, angle, along, across);
    boxes.push({ l, w, h, x: px, y: py, z, angle, tint });
  };
  // The top.
  push(
    TABLE_L_M,
    TABLE_TOP_W_M,
    TABLE_SLAB_M,
    0,
    0,
    TABLE_TOP_H_M - TABLE_SLAB_M / 2
  );
  // Two benches, one either side.
  //
  // ★ THE PARENTHESES ARE THE WHOLE POINT, and the unit guard is what found
  // it: written as `side * TABLE_W_M / 2 - TABLE_BENCH_W_M / 2` the offset is
  // 0.61 on one side and 0.89 on the other, and the far bench hangs OUTSIDE
  // the rectangle collision stamps. That is CW-54's wheel again - a prop wider
  // than its own footprint is a prop you can walk through - and a photograph
  // could not have caught it, because a lopsided picnic table still looks like
  // a picnic table.
  for (const side of [1, -1]) {
    push(
      TABLE_L_M,
      TABLE_BENCH_W_M,
      TABLE_SLAB_M,
      0,
      side * (TABLE_W_M / 2 - TABLE_BENCH_W_M / 2),
      TABLE_BENCH_H_M
    );
  }
  // Two leg planes, near each end, spanning the full width so the frame
  // reads as a frame rather than as four posts. Same parentheses, same reason.
  for (const end of [1, -1]) {
    push(
      TABLE_LEG_T_M,
      TABLE_W_M,
      TABLE_TOP_H_M,
      end * (TABLE_L_M / 2 - TABLE_LEG_T_M),
      0,
      TABLE_TOP_H_M / 2
    );
  }
  return boxes;
}

/**
 * A flowerbed, as flat patches on the ground at the way's centroid, sized from
 * the way's OWN area.
 *
 * ★ THIS IS THE ONE FLAT THING IN CW-57, AND CW-56 IS THE REASON TO BE WARY OF
 * IT. Fallen leaves were dropped there because a flat patch on this game's
 * ground could not read: the ground is already near-black, so anything quiet
 * enough for the carpet law was invisible and anything visible broke it.
 *
 * What is different here is NUMBER. The carpet law is about a SURFACE - "any
 * visible surface tone carpets the lower half of the street view, because
 * perspective stacks every metre of road between here and the horizon into a
 * few cell rows". Leaves sat under every deciduous tree, 4,593 of them in
 * Seattle, which is near-continuous along every street. A flowerbed sits at 56
 * mapped places in Seattle and 17 in Burnaby. That is not a surface.
 *
 * So a flowerbed is allowed to be brighter than a leaf could be - and that
 * claim is MEASURED in the release record rather than assumed.
 *
 * A bed's own area decides how many patches it gets, so a 4 m2 bed and a 60 m2
 * bed are different objects rather than the same stamp twice.
 */
const BED_PATCH_M = 0.9;
const BED_M2_PER_PATCH = 4;
const BED_MAX_PATCHES = 14;
/** Off the ground, with the material's own polygonOffset behind it (D-110). */
const BED_LIFT_M = 0.03;

export function flowerbedPositions(x, y, areaM2, seed) {
  const out = [];
  const patches = Math.max(
    2,
    Math.min(BED_MAX_PATCHES, Math.round((areaM2 || 4) / BED_M2_PER_PATCH))
  );
  // The bed's own footprint radius, from its area: a bed is roughly round at
  // this scale and its area is the only thing the parse kept.
  const radius = Math.max(0.8, Math.sqrt(Math.max(areaM2 || 4, 1) / Math.PI));
  let s = (seed ^ 0x85ebca6b) >>> 0;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < patches; i++) {
    const ang = next() * Math.PI * 2;
    const rad = Math.sqrt(next()) * radius;
    const px = x + Math.cos(ang) * rad;
    const py = y + Math.sin(ang) * rad;
    const hw = (BED_PATCH_M * (0.7 + next() * 0.6)) / 2;
    const hh = (BED_PATCH_M * (0.7 + next() * 0.6)) / 2;
    out.push(
      px - hw,
      py - hh,
      BED_LIFT_M,
      px + hw,
      py - hh,
      BED_LIFT_M,
      px + hw,
      py + hh,
      BED_LIFT_M,
      px - hw,
      py - hh,
      BED_LIFT_M,
      px + hw,
      py + hh,
      BED_LIFT_M,
      px - hw,
      py + hh,
      BED_LIFT_M
    );
  }
  return out;
}
