/**
 * Birds where birds rest.
 *
 * Pure tables and geometry - no placement, no palette CHOICE, no DOM - so
 * every size is unit-testable against the citation it claims.
 *
 * The sizes are cited and true to scale. Field-guide body lengths
 * (Audubon / AllAboutBirds), meters:
 *
 *   house sparrow          0.13-0.17
 *   black-capped chickadee 0.12-0.15
 *   rock pigeon            0.29-0.36
 *   American crow          0.43-0.53
 *   gull                   0.43-0.68
 *   greater roadrunner     0.52-0.62
 *   Canada goose           0.75-1.10
 *
 * Nothing here is allowed to grow to be seen. The trees compress their
 * heights, and can, because a street tree's height is a range a designer
 * picks from. A bird's body length is not that kind of number: a sparrow you
 * can see at thirty meters is not a sparrow. So a species that cannot read
 * at a given size stays unreadable there. The one thing forbidden is
 * inflating a bird to rescue its picture.
 *
 * A bird is 2-5 boxes because at a few character cells a rounded bird and a
 * square one are the same cell.
 *
 * @license GPL-3.0-or-later
 */

/**
 * Body length range in meters, plus the build that carries the silhouette.
 *
 * There is no per-species brightness here, because it changes nothing in
 * either mode.
 *
 * In mono, swinging one bird across the whole range such a field could
 * reach, crow (-0.16) to gull (+0.14), moves the frame by nothing: 0.02%
 * either way on a lamp head, 0.03 against 0.04 on the ground. Nothing in
 * this game is actually dark - a "dark" bird still sits far above ground at
 * under 0.1 - so the real-world contrast such a field would imitate does not
 * exist here.
 *
 * In color, checked encoded because that is where the converter reads, the
 * palette match at this hue is a cliff: #ffffff everywhere above tier 0.50
 * and #ffff00 below it. All seven species sit between 0.52 and 0.82, so all
 * seven land white in both palettes.
 *
 * And white is the right answer, not a failure. These palettes have no dark
 * neutral, so a gray or black bird cannot be rendered dark here. The
 * alternatives are yellow and red, and a yellow crow would be a lie where a
 * white one is merely a monochrome. Identity is shape.
 *
 * `form` picks which boxes get made. Nothing else varies per species but its
 * cited size.
 */
export const BIRD_SPECIES = {
  'house sparrow': { m: [0.13, 0.17], form: 'perching' },
  'black-capped chickadee': {
    m: [0.12, 0.15],
    form: 'perching',
  },
  'rock pigeon': { m: [0.29, 0.36], form: 'standing' },
  'american crow': { m: [0.43, 0.53], form: 'standing' },
  gull: { m: [0.43, 0.68], form: 'standing' },
  'greater roadrunner': { m: [0.52, 0.62], form: 'roadrunner' },
  'canada goose': { m: [0.75, 1.1], form: 'goose' },
};

/**
 * Per-city rosters. Commonness from regional lists.
 *
 * Albuquerque's roster is the one that argues for per-city tables, the same
 * way its flowers do: the greater roadrunner is the city's own bird and
 * rests on the ground, and no other city has anything like it.
 */
export const CITY_BIRDS = {
  seattle: ['gull', 'american crow', 'rock pigeon', 'house sparrow'],
  denver: ['rock pigeon', 'house sparrow', 'canada goose', 'american crow'],
  albuquerque: ['rock pigeon', 'house sparrow', 'greater roadrunner'],
  burnaby: ['american crow', 'gull', 'black-capped chickadee', 'canada goose'],
};

/** An unknown city falls back to Seattle's, like the tree and flower tables. */
export function birdTableFor(cityName) {
  return CITY_BIRDS[cityName] ?? CITY_BIRDS.seattle;
}

/**
 * Where a species will actually rest.
 *
 * A goose does not perch on a bench back and a chickadee does not stand on a
 * lawn, so a roster alone is not enough - the perch has to be one the bird
 * uses. Small birds take small high things, big birds take the ground or a
 * broad edge.
 *
 * The crow is not kept high. Darkness does not hide a bird here: a crow on a
 * lamp head and a crow on the ground each cover 0.02% to 0.04% of the frame
 * whatever its brightness, and the ground is the better perch, because a
 * crow there reads as a distinct shape where the same bird on a lamp head
 * merges into the lamp.
 *
 * The reason is that in this game nothing is actually dark. A crow at tier
 * 0.52 is still far brighter than ground at under 0.1, so real-world color
 * intuition - black bird, dark lawn - describes two things that are not close
 * together here at all. What decides legibility is having an uncluttered
 * backdrop and a silhouette, and near-black ground is the best backdrop in
 * the city.
 */
export const PERCH_KINDS = [
  'bench-back',
  'picnic-top',
  'planter-rim',
  'lamp-head',
  'parapet',
  'ground',
  'open-ground',
];

/**
 * 'ground' is parkland and 'open-ground' is pavement. With one ground kind,
 * Albuquerque gets a single roadrunner in the whole city, because the desert
 * city has 24 mapped greens, only five of them over 400 m², so parkland is
 * structurally scarce there.
 *
 * The split is also what the bird actually does. A greater roadrunner is a
 * bird of open desert scrub and roadsides - it is famous for running along
 * roads, which is where its name comes from. A Canada goose stays lawn-only,
 * because a goose on a pavement is not a thing anybody has seen, and a gull
 * takes parkland but not pavement for the same reason at one remove: a gull
 * on a playing field is ordinary, a gull picking along a footway less so.
 */
export const SPECIES_PERCHES = {
  'house sparrow': ['bench-back', 'planter-rim', 'picnic-top', 'lamp-head'],
  'black-capped chickadee': ['bench-back', 'planter-rim'],
  'rock pigeon': [
    'picnic-top',
    'lamp-head',
    'parapet',
    'ground',
    'open-ground',
  ],
  // The crow forages on lawns constantly, and the ground is where it reads
  // best. Both reasons point the same way.
  'american crow': ['parapet', 'lamp-head', 'ground', 'open-ground'],
  gull: ['parapet', 'lamp-head', 'ground'],
  'greater roadrunner': ['ground', 'open-ground'],
  'canada goose': ['ground'],
};

/** Every perch a city's roster can use, deduped, for the placement loops. */
export function perchesFor(roster) {
  const out = new Set();
  for (const name of roster) {
    for (const p of SPECIES_PERCHES[name] ?? []) out.add(p);
  }
  return out;
}

/** Which of a roster's species will take this perch, in table order. */
export function speciesForPerch(roster, perch) {
  return roster.filter((n) => (SPECIES_PERCHES[n] ?? []).includes(perch));
}

/**
 * Pick a species for a perch from bits of an existing seed. Returns null when
 * the roster has nobody for that perch, which is a real answer rather than a
 * gap to fill: Albuquerque has no bird that uses a bench back, because its
 * roster's only small bird is the sparrow and its other two are ground and
 * high birds.
 */
export function pickBird(roster, perch, draw) {
  const eligible = speciesForPerch(roster, perch);
  if (eligible.length === 0) return null;
  return eligible[Math.abs(draw) % eligible.length];
}

/**
 * Resolve a species to a concrete build at a point in its cited size range.
 * `t` is 0..1 within the range.
 */
export function birdSpec(name, t) {
  const species = BIRD_SPECIES[name];
  if (!species) return null;
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const lengthM = species.m[0] + (species.m[1] - species.m[0]) * clamped;
  return {
    name,
    lengthM,
    form: species.form,
  };
}

/**
 * The boxes a bird is made of, as {l, w, h, x, y, z, angle} specs in the
 * bird's own frame, with z measured up from the perch surface.
 *
 * Proportions are of the body length, so every species scales from its one
 * cited number and nothing carries a second magic size.
 */
const BODY_L = 0.62;
const BODY_W = 0.34;
const BODY_H = 0.4;
const HEAD_F = 0.24;
const TAIL_L = 0.34;
const TAIL_H = 0.12;
/** Sunk into the perch so no face is exactly coplanar with it. */
export const PERCH_SINK_M = 0.01;

export function birdBoxes(spec, angle = 0) {
  const L = spec.lengthM;
  const bodyL = L * BODY_L;
  const bodyW = L * BODY_W;
  const bodyH = L * BODY_H;
  const legH = L * 0.14;
  const boxes = [];
  const push = (l, w, h, along, across, z) =>
    boxes.push({ l, w, h, along, across, z, angle });

  // The body, standing clear of the perch on notional legs - a bird's belly
  // is not on the ground. The sink is what keeps the boxes from sharing an
  // exact face with whatever it rests on.
  const bodyZ = legH + bodyH / 2 - PERCH_SINK_M;
  push(bodyL, bodyW, bodyH, 0, 0, bodyZ);

  if (spec.form === 'goose') {
    // A goose is a body, a long neck and a small head: the neck IS the
    // silhouette, and at true scale it is the only part with a chance of
    // reading against a lawn.
    const neckH = L * 0.34;
    push(
      L * 0.1,
      L * 0.1,
      neckH,
      bodyL * 0.42,
      0,
      bodyZ + bodyH / 2 + neckH / 2
    );
    push(
      L * 0.16,
      L * 0.12,
      L * 0.12,
      bodyL * 0.42 + L * 0.05,
      0,
      bodyZ + bodyH / 2 + neckH
    );
    push(L * TAIL_L, bodyW * 0.5, L * TAIL_H, -bodyL * 0.6, 0, bodyZ);
    return boxes;
  }

  if (spec.form === 'roadrunner') {
    // The roadrunner is a long tail and a crest, and both are the reason it
    // is recognizable at all - it is a big bird that reads as a shape rather
    // than as a blob.
    const headL = L * HEAD_F;
    push(headL, headL * 0.8, headL, bodyL * 0.5, 0, bodyZ + bodyH * 0.45);
    push(
      L * 0.06,
      L * 0.05,
      L * 0.1,
      bodyL * 0.5,
      0,
      bodyZ + bodyH * 0.45 + headL * 0.6
    );
    // The tail is the longest on the roster and still fits the citation. A
    // field guide's 52-62 cm is bill tip to tail tip, so the tail lives inside
    // that number, not beyond it.
    push(
      L * 0.44,
      bodyW * 0.4,
      L * 0.09,
      -bodyL * 0.54,
      0,
      bodyZ - bodyH * 0.1
    );
    return boxes;
  }

  const headL = L * HEAD_F;
  push(
    headL,
    headL * 0.85,
    headL,
    bodyL * 0.45,
    0,
    bodyZ + bodyH * (spec.form === 'perching' ? 0.4 : 0.45)
  );
  push(L * TAIL_L, bodyW * 0.55, L * TAIL_H, -bodyL * 0.6, 0, bodyZ);
  return boxes;
}

/**
 * Total footprint length of a built bird, for the guards: nothing may claim a
 * cited size and then draw something twice as long.
 */
export function birdExtentM(spec) {
  const boxes = birdBoxes(spec);
  let min = Infinity;
  let max = -Infinity;
  for (const b of boxes) {
    min = Math.min(min, b.along - b.l / 2);
    max = Math.max(max, b.along + b.l / 2);
  }
  return max - min;
}
