/**
 * Landmark dressings (CW-63, CW-Q56).
 *
 * ★★ THIS SUSPENDS ROUND 6'S NO-SPECIAL-CASING LAW, AND ONLY THE OWNER COULD
 * DO THAT. Every building in this city is drawn by one generic pipeline from
 * its own OSM data, deliberately, because a city where the code knows about
 * particular buildings is a city that stops working when the data moves. The
 * owner signed CW-Q56 to make a NAMED exception: a handful of landmarks a
 * player is meant to recognise get authored geometry, keyed by OSM id, beside
 * the generic path rather than instead of it.
 *
 * Every entry here is therefore ONE LINE REVERSIBLE - delete the row and that
 * landmark goes back to being an ordinary extruded outline, with nothing else
 * in the renderer to unpick.
 *
 * ★ LAWFUL SOURCES ONLY. Everything below is authored from PUBLISHED
 * DIMENSIONS - heights, widths, storey counts, published section drawings -
 * cited per entry. No photogrammetry, no imagery, and nothing Google-derived,
 * ever. What is drawn is a design work made from public numbers, in the same
 * sense that a diagram is.
 *
 * @license GPL-3.0-or-later
 */

/**
 * ★ THE SPACE NEEDLE'S LEGS ARE AUTHORED BECAUSE THE DATA HAS NO CURVE.
 *
 * MEASURED in the shipped Seattle extract: the Needle is way 12903132
 * (building=tower, height=184) with thirteen `building:part` volumes around
 * it, ids 394254329 through 394254488 and 394955877. Read out, they are the
 * pavilion at 6.1 m, quads at 30.5-36.6 m and 61.0-64.0 m, the shaft topping
 * at 152.4 m, and the saucer stack from 149.96 m to the spire at 170.3 m.
 *
 * What is NOT in there is the tripod. The parts are straight prisms, so the
 * hourglass - the single thing that makes the silhouette the Space Needle
 * rather than a mast - has to be authored.
 *
 * Published dimensions used (plan section 3g): total height 605 ft / 184.4 m;
 * observation level 520 ft / 158 m; the top house about 138 ft / 42 m across;
 * three splayed legs rising from a footing to a waist of about 30 ft / 9 m.
 * Sources cited there: the Space Needle's own published press facts, the
 * Skyscraper Center entry, and Wikipedia's summary of Victor Steinbrueck's
 * form. The CURVE between footing and waist is a design choice made from
 * those numbers, not a measurement of the real structure.
 */
export const NEEDLE_WAY_ID = 12903132;

/** Where the tripod starts and ends, in metres, from the published record. */
export const NEEDLE_LEG = {
  /** Half-spread of a footing from the axis - the splay at the ground. */
  footRadiusM: 21,
  /** The waist the legs draw into, about 30 ft across, so ~4.5 m of radius. */
  waistRadiusM: 4.6,
  /** The waist sits about a third of the way up, under the shaft proper. */
  waistHeightM: 60.9,
  /** How thick a leg is. Thin enough to read as structure, not as a wall. */
  thicknessM: 3.4,
  /**
   * ★ HOW MANY SEGMENTS AN ARC GETS, and why it is not more.
   *
   * The city is read through a character grid whose cell is 4 px wide and
   * 9 px tall, so a smooth curve and a nine-segment one are the same picture
   * from any distance a player stands at - and the segments merge into the
   * building buffer like everything else. Nine is where the silhouette stops
   * changing; the number is a photograph's answer, not a taste.
   */
  segments: 9,
  /**
   * The exponent of the taper. 1 is a straight cone; above 1 the legs hug the
   * axis and flare late, which is the hourglass the published elevation
   * shows.
   */
  curve: 2.1,
};

/**
 * The three legs' bearings. Three splayed legs at 120 degrees, with the first
 * pointing north so the tripod reads the same from the map's fixed north-up
 * view every time.
 */
export const NEEDLE_LEG_BEARINGS_RAD = [
  0,
  (2 * Math.PI) / 3,
  (4 * Math.PI) / 3,
];

/**
 * The centreline of one leg, from footing to waist, as [x, y, z] in metres
 * relative to the tower's own centre.
 *
 * @param {number} bearingRad which leg
 * @param {number} t 0 at the ground, 1 at the waist
 */
export function needleLegPoint(bearingRad, t) {
  const { footRadiusM, waistRadiusM, waistHeightM, curve } = NEEDLE_LEG;
  // The radius falls from the footing to the waist along a curve, so the leg
  // leaves the ground steeply and draws in as it rises - the hourglass.
  const radius =
    waistRadiusM + (footRadiusM - waistRadiusM) * Math.pow(1 - t, curve);
  return [
    Math.sin(bearingRad) * radius,
    Math.cos(bearingRad) * radius,
    t * waistHeightM,
  ];
}

/**
 * The dressing table itself, keyed by OSM way id.
 *
 * `legs` asks the scene for authored tripod arcs around the building's own
 * centre. Nothing here replaces the building's parts: the Needle's thirteen
 * volumes are correct and stay exactly as the data has them, and the arcs are
 * added beside them. That is what makes the row reversible.
 */
export const LANDMARK_DRESSINGS = new Map([
  [
    NEEDLE_WAY_ID,
    {
      name: 'Space Needle',
      legs: 'needle-tripod',
      /** For the record and for anyone reading the row cold. */
      source:
        'published dimensions only (height 184.4 m, observation 158 m, top house ~42 m, waist ~9 m)',
    },
  ],
]);

/** @param {number|undefined} id an OSM way id */
export function dressingFor(id) {
  return LANDMARK_DRESSINGS.get(id) ?? null;
}
