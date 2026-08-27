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
 * ★★ THERE WAS A `tierBias` HERE - a per-species brightness nudge, dark for
 * the crow and pale for the gull - AND IT WAS MEASURABLY INERT IN BOTH MODES.
 * It is gone; the two measurements that removed it are worth keeping.
 *
 * In MONO, swinging one bird across the whole range that field could reach,
 * crow (-0.16) to gull (+0.14), moved the frame by nothing: 0.02% either way
 * on a lamp head, 0.03 against 0.04 on the ground. Nothing in this game is
 * actually dark - a "dark" bird still sits far above ground at under 0.1 - so
 * the real-world contrast the field was imitating does not exist here.
 *
 * In COLOUR, checked ENCODED because that is where the converter reads
 * (D-112), the palette match at this hue is a CLIFF: #ffffff everywhere above
 * tier 0.50 and #ffff00 below it. All seven species sat between 0.52 and
 * 0.82, so ALL SEVEN LANDED WHITE in both palettes, and the crow sat 0.02
 * from an edge whose far side is yellow.
 *
 * ★ AND WHITE IS THE RIGHT ANSWER, not a failure. These palettes have no dark
 * neutral - the same shape of gap CW-57 found when the ANSI set turned out to
 * have no blue - so a grey or black bird cannot be rendered dark here. The
 * alternatives are yellow and red, and a yellow crow would be a lie where a
 * white one is merely a monochrome. Identity is SHAPE: the hydrant lesson.
 *
 * `form` picks which boxes get made. Nothing else varies per species but its
 * cited size, and that is the honest position.
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
 * ★★ THIS FILE ONCE CLAIMED THE CROW WAS KEPT HIGH FOR A MEASURED REASON, AND
 * THE MEASUREMENT REFUTED IT. The claim was that a crow, being the darkest
 * bird here, would vanish on greenspace that CW-57 had measured at luminance
 * under a tenth. CW-57's measurement was real; the inference from it was not,
 * and it was never tested until the proof gate tested it:
 *
 *   crow on a lamp head, tierBias -0.16   0.02% of frame
 *   crow on a lamp head, tierBias +0.14   0.02%   <- the WHOLE tier range
 *   crow on the ground,  tierBias -0.16   0.03%
 *   crow on the ground,  tierBias +0.14   0.04%
 *
 * Swinging a bird across the entire tier band, from crow to gull, moves the
 * frame by nothing. And the GROUND IS THE BETTER PERCH, not the worse one: a
 * crow there reads as a distinct shape where the same bird on a lamp head
 * merges into the lamp.
 *
 * The reason is that in this game NOTHING IS ACTUALLY DARK. A crow at tier
 * 0.52 is still far brighter than ground at under 0.1, so real-world colour
 * intuition - black bird, dark lawn - describes two things that are not close
 * together here at all. What decides legibility is having an uncluttered
 * backdrop and a silhouette, and near-black ground is the best backdrop in
 * the city.
 *
 * The numbers that retired `tierBias` are in the header above; the
 * placement rules below rest on shape and backdrop, which is all that
 * measurably works.
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
 * ★★ 'ground' IS PARKLAND AND 'open-ground' IS PAVEMENT, and separating them
 * is the fix for a real defect rather than a refinement. Written with one
 * ground kind, ALBUQUERQUE GOT A SINGLE ROADRUNNER IN THE WHOLE CITY - the
 * bird that is its own, and the entire argument for per-city rosters. The
 * cause was not the rate: the desert city has 24 mapped greens, only five of
 * them over 400 m², so parkland is structurally scarce there.
 *
 * And the fix is what the bird actually does. A greater roadrunner is a bird
 * of open desert scrub and ROADSIDES - it is famous for running along roads,
 * which is where its name comes from. Restricting it to lawns was the design
 * error; the count was only the symptom. A Canada goose stays lawn-only,
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
  // The crow forages on lawns constantly, and the proof gate says the ground
  // is where it reads best. Both reasons point the same way.
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
