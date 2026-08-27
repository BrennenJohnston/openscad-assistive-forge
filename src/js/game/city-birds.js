/**
 * Birds where birds rest (CW-58, CW-Q54).
 *
 * Pure tables and geometry - no placement, no palette CHOICE, no DOM - so
 * every size is unit-testable against the citation it claims.
 *
 * THE SIZES ARE CITED AND TRUE TO SCALE. Field-guide body lengths
 * (Audubon / AllAboutBirds), metres:
 *
 *   house sparrow          0.13-0.17
 *   black-capped chickadee 0.12-0.15
 *   rock pigeon            0.29-0.36
 *   American crow          0.43-0.53
 *   gull                   0.43-0.68
 *   greater roadrunner     0.52-0.62
 *   Canada goose           0.75-1.10
 *
 * ★ NOTHING HERE IS ALLOWED TO GROW TO BE SEEN. CW-56 compressed its tree
 * heights, and could, because a street tree's height is a range a designer
 * picks from and the compression is stated in the record. A bird's body
 * length is not that kind of number: a sparrow you can see at thirty metres
 * is not a sparrow. So a species that cannot read at a given size is
 * RECORDED as unreadable there, and the record carries the honesty table.
 * The one thing forbidden is inflating a bird to rescue its picture.
 *
 * A bird is 2-5 boxes because at a few character cells a rounded bird and a
 * square one are the same cell - the hydrant lesson.
 *
 * @license GPL-3.0-or-later
 */

/**
 * Body length range in metres, plus the build that carries the silhouette.
 *
 * `form` picks which boxes get made; `tierBias` nudges the body's brightness
 * within the scheme band, because a crow is dark BY NATURE and a gull is
 * pale, and pretending otherwise would make every bird the same bird.
 */
export const BIRD_SPECIES = {
  'house sparrow': { m: [0.13, 0.17], form: 'perching', tierBias: 0.0 },
  'black-capped chickadee': {
    m: [0.12, 0.15],
    form: 'perching',
    tierBias: 0.08,
  },
  'rock pigeon': { m: [0.29, 0.36], form: 'standing', tierBias: 0.0 },
  'american crow': { m: [0.43, 0.53], form: 'standing', tierBias: -0.16 },
  gull: { m: [0.43, 0.68], form: 'standing', tierBias: 0.14 },
  'greater roadrunner': { m: [0.52, 0.62], form: 'roadrunner', tierBias: 0.0 },
  'canada goose': { m: [0.75, 1.1], form: 'goose', tierBias: -0.04 },
};

/**
 * Per-city rosters (plan §3d, SIGNED). Commonness from regional lists; the
 * owner may veto row by row.
 *
 * ★ ALBUQUERQUE'S ROSTER IS THE ONE THAT ARGUES FOR PER-CITY TABLES, the same
 * way its flowers did in CW-57: the greater roadrunner is the city's own bird
 * and rests on the ground, and no other city has anything like it.
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
 * WHERE A SPECIES WILL ACTUALLY REST.
 *
 * This is the honest half of the design. A goose does not perch on a bench
 * back and a chickadee does not stand on a lawn, so a roster alone is not
 * enough - the perch has to be one the bird uses. Small birds take small high
 * things, big birds take the ground or a broad edge.
 *
 * ★★ AND THE CROW IS PLACED HIGH FOR A MEASURED REASON, not an aesthetic one.
 * CW-57 measured this game's greenspace at luminance under a tenth and proved
 * a texture cannot lift it. A crow is the darkest bird on the roster, so a
 * crow on green ground is a dark shape on a near-black field: invisible. High
 * perches put it against sky or a lit parapet, where it reads.
 */
export const PERCH_KINDS = [
  'bench-back',
  'picnic-top',
  'planter-rim',
  'lamp-head',
  'parapet',
  'ground',
];

export const SPECIES_PERCHES = {
  'house sparrow': ['bench-back', 'planter-rim', 'picnic-top', 'lamp-head'],
  'black-capped chickadee': ['bench-back', 'planter-rim'],
  'rock pigeon': ['picnic-top', 'lamp-head', 'parapet', 'ground'],
  'american crow': ['parapet', 'lamp-head'],
  gull: ['parapet', 'lamp-head'],
  'greater roadrunner': ['ground'],
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
    tierBias: species.tierBias,
  };
}

/**
 * The boxes a bird is made of, as {l, w, h, x, y, z, angle} specs in the
 * bird's own frame, with z measured UP FROM THE PERCH SURFACE.
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
/** Sunk into the perch so no face is exactly coplanar with it (D-110). */
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
    // is recognisable at all - it is a big bird that reads as a shape rather
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
    // ★ THE TAIL IS THE LONGEST ON THE ROSTER AND STILL FITS THE CITATION.
    // Written first as 0.5 long at -0.72 body lengths back, it put the
    // roadrunner at 1.126x its own cited size - the exact thing the header
    // forbids, broken by the species most tempted to break it. A field guide's
    // 52-62 cm is BILL TIP TO TAIL TIP, so the tail lives inside that number,
    // not beyond it. The unit guard caught this; nothing visible would have.
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
