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
 * ★★ THE SEATTLE CENTRAL LIBRARY'S MASSING IS AUTHORED BECAUSE THE DATA IS A
 * BOX - AND THE PROMPT'S PREMISE ABOUT IT WAS WRONG.
 *
 * CW-63's own release prompt, this round's status file and the R6 record all
 * say the Library "carries NO `building:part` volumes at all". MEASURED in the
 * shipped Seattle extract at this head, it carries FOUR: ways 458203290,
 * 458203294, 458203296 and 458203299, every one of them tagged
 * `building:part=roof` with NO height tag, so each takes the parser's
 * DEFAULT_BUILDING_HEIGHT_M. They cover 2,505 m2 of a 5,080 m2 outline - a
 * ratio of 0.493, under PART_COVERAGE_MIN - so `partsAreMass` is false and the
 * generic pipeline draws the 60 m box AND four 8 m slabs standing inside it.
 *
 * They are roof PLANES, not massing: nothing in them says anything about how
 * the building steps. So the dressing REPLACES the data's volumes outright
 * rather than adding to them, which is the one place this table differs from
 * the Needle's row - and it is why the four slabs vanish with the box.
 *
 * Published dimensions used (plan section 3g): 11 storeys, 185 ft / 56.9 m;
 * FIVE offset platforms of fixed programme with four flowing planes between
 * them; a steel-and-glass diamond DIAGRID wrapping the whole envelope. Sources
 * cited there: OMA's own project page, the Seattle Public Library's
 * architecture page, Wikipedia, and the WikiArquitectura / ArchDaily section
 * drawings. The platform FOOTPRINTS AND OFFSETS below are a design work made
 * from those published proportions - a diagram, not a survey.
 */
export const LIBRARY_WAY_ID = 37056442;

/**
 * ★ THE BLOCK'S OWN AXES, MEASURED FROM THE DATA, NOT ASSUMED.
 *
 * World bearings in degrees, north-up, taken from the shipped extract: the
 * outline's longest edge runs 58.4 deg / 238.4 deg, and from the building's
 * centroid the nearest mapped point of each bounding street lies at
 * 4th Avenue 52 m, 5th Avenue 47 m, Spring Street 47 m, Madison Street 48 m -
 * so bearing 238.4 is the face that looks at 4th Avenue, which is the side the
 * published building cantilevers over. `library-block-axes.test.js` pins this
 * against the extract so a rebake that moves the block fails loudly instead of
 * quietly pointing the overhang at the wrong street.
 */
export const LIBRARY_TOWARD_4TH_AVE_DEG = 238.4;

/**
 * The five platforms, bottom to top - and the GAPS BETWEEN THEM ARE THE POINT.
 *
 * The published building is five platforms of fixed programme with FOUR
 * FLOWING PLANES between them, and leaving those planes out is what turns it
 * into a wedding cake: a stack of offset boxes reads as setbacks, where the
 * Library reads as one faceted envelope leaning in and out. So the bands below
 * do not touch, and city-scene.js lofts a sloping skin across each gap. Bottom
 * to top the published sequence is Parking / Kids / Staff / Living Room /
 * Meeting / Mixing Chamber / Books / Reading Room / HQ - five platforms, four
 * planes, exactly the nine bands this table and its lofts produce.
 *
 * `fromH`/`toH` are FRACTIONS OF THE BUILDING'S OWN TAGGED HEIGHT, derived
 * from the published 11 storeys, so the massing follows the data rather than
 * fighting it: OSM says 60 m where the published record says 56.9 m, and a
 * dressing that hardcoded 56.9 would shrink the building every time the tag is
 * right. `scale` shrinks the data's own footprint about its centroid;
 * `toward4thM` and `towardSpringM` then slide it, in metres, along the block
 * axes above. Negative `toward4thM` is a set-back toward 5th Avenue.
 *
 * The lowest row stands for the published PARKING platform as well as the
 * grade-level plinth above it: the real parking is below grade and this city
 * has no below-grade geometry, so the two fold into the one band that meets
 * all four sidewalks.
 *
 * ★ THE OVERHANG IS THE RECOGNISABLE PART. The lower platforms step AWAY from
 * 4th Avenue and the book spiral throws itself back out over them - which is
 * the one thing a walker on 4th Avenue sees, and the reason the block axes
 * above had to be measured rather than guessed.
 *
 * EVERY ROW IS ONE LINE REVERSIBLE, and deleting all five puts the 60 m box
 * and its four roof slabs back.
 */
export const LIBRARY_PLATFORMS = [
  {
    name: 'parking + plinth',
    fromH: 0,
    toH: 1.4 / 11,
    scale: [1, 1],
    toward4thM: 0,
    towardSpringM: 0,
  },
  {
    name: 'staff',
    fromH: 1.9 / 11,
    toH: 3.4 / 11,
    scale: [0.86, 0.92],
    toward4thM: -5,
    towardSpringM: 0,
  },
  {
    name: 'meeting',
    fromH: 4.1 / 11,
    toH: 5.6 / 11,
    scale: [0.72, 0.82],
    toward4thM: -8,
    towardSpringM: -3,
  },
  {
    name: 'book spiral',
    fromH: 6.4 / 11,
    toH: 9 / 11,
    scale: [0.94, 0.94],
    toward4thM: 4,
    towardSpringM: 2,
  },
  {
    name: 'headquarters',
    fromH: 9.7 / 11,
    toH: 1,
    scale: [0.62, 0.68],
    toward4thM: -7,
    towardSpringM: 4,
  },
];

/**
 * ★ THE DIAGRID IS A TALL DIAMOND, AND THE CHARACTER CELL DECIDED THAT.
 *
 * The converter reads the frame through a cell 4 px wide and 9 px tall, so a
 * diamond as tall as it is wide in metres arrives with 2.25x fewer samples
 * down its vertical axis than across its horizontal one - CW-61's man died of
 * exactly this anisotropy. A diamond 2x taller than it is wide comes back
 * roughly square in CELLS, which is the axis that matters here, and it is also
 * what the published skin looks like: the Library's diamonds are visibly
 * elongated upward, not square.
 *
 * The member width is the CW-52 floor made explicit - a facade pattern finer
 * than the cell grid beats against it and shimmers - and the metres below put
 * every member well over 3 px in texture space at the tile resolution
 * city-scene.js paints it at.
 */
export const LIBRARY_DIAGRID = {
  /** One diamond, corner to corner across. */
  widthM: 4.5,
  /** One diamond, corner to corner up. */
  heightM: 9,
  /**
   * How thick a steel member is - AND IT IS NOT THE REAL ONE.
   *
   * The published members are about 0.3 m of painted steel. Drawn at that
   * width and photographed from 4th Avenue at 90 m, a member is 0.87 of a
   * CHARACTER CELL across, and a line thinner than a cell cannot make a cell
   * dark: it averages with the glass either side and the lattice disappears
   * into a generic wall texture. Photographed, at three widths.
   *
   * So this is a DIAGRAM of the diagrid at the resolution the medium has,
   * which is the same bargain every other facade in this city already makes -
   * a 4 m window bay is not four metres of window either.
   */
  memberM: 1.2,
  /**
   * The glass between the members: the darkest and brightest pane, and BOTH
   * ARE EXACT BLACK.
   *
   * ★★ THE DIAGRID IS BRIGHT STEEL AROUND BLACK GLASS, AND THAT IS CW-40'S
   * LAW PAYING OUT AGAIN. Six variants photographed from 4th Avenue at 90 m,
   * 50% character size, mono green:
   *
   *   member 0.4 m, glass 150-250, steel cut out  - NO lattice at all
   *   member 1.0 m, glass 150-250, steel cut out  - a rhythm, not a lattice
   *   member 1.6 m, glass 150-250, steel cut out  - a lattice, but a WALL
   *   member 1.2-1.6 m, glass 8-26, steel 235     - a lattice
   *   member 1.2 m, glass 0, steel 235            - SHIPPED
   *   member 2.0 m, 6 x 12 m diamond, glass 0     - reads, but coarse
   *
   * Exact black is the one value the converter renders as an EMPTY CELL
   * (CW-5), so black panes make holes and the steel between them is a bright
   * web wrapped around them - which is the shape CW-40 found reads, CW-61
   * restated, and CW-62 paid for again. Dark members on lit glass is the
   * other way round and it photographs as a textured wall.
   *
   * It is also the truer picture: the published building is white-painted
   * steel over dark reflective glass, not a lit curtain wall.
   */
  paneLevel: [0, 0],
  /**
   * The steel. Zero would mean the members are CUT OUT of the glass and land
   * as exact black instead; the table above is what settled which way round.
   */
  memberLevel: 235,
};

/**
 * The Library's row.
 *
 * `massing` REPLACES the data's volumes (see the note above - what it replaces
 * is a plain box and four roof planes). `facade` asks for a dressing-only
 * facade family that the generic hash can never reach, so no other building in
 * any city can wear a diagrid.
 */

/**
 * One platform's ring, in world metres.
 *
 * @param {Array<[number, number]>} outer the building's own outline
 * @param {[number, number]} centre its centroid
 * @param {(typeof LIBRARY_PLATFORMS)[number]} platform
 * @returns {Array<[number, number]>}
 */
export function libraryPlatformRing(outer, centre, platform) {
  const bearing = (LIBRARY_TOWARD_4TH_AVE_DEG * Math.PI) / 180;
  // Toward 4th Avenue, and that axis turned a quarter turn, which is the way
  // to Spring Street. Both measured, both named in the constant above.
  const fx = Math.sin(bearing);
  const fy = Math.cos(bearing);
  const sx = Math.sin(bearing + Math.PI / 2);
  const sy = Math.cos(bearing + Math.PI / 2);
  const dx = fx * platform.toward4thM + sx * platform.towardSpringM;
  const dy = fy * platform.toward4thM + sy * platform.towardSpringM;
  const [scaleU, scaleV] = platform.scale;
  return outer.map(([x, y]) => {
    // Shrink along the block's own axes, so a platform keeps the block's
    // proportions instead of being squeezed against the world grid.
    const ru = (x - centre[0]) * fx + (y - centre[1]) * fy;
    const rv = (x - centre[0]) * sx + (y - centre[1]) * sy;
    const u = ru * scaleU;
    const v = rv * scaleV;
    return [centre[0] + u * fx + v * sx + dx, centre[1] + u * fy + v * sy + dy];
  });
}

/**
 * The dressing table itself, keyed by OSM way id.
 *
 * `legs` asks the scene for authored tripod arcs around the building's own
 * centre. Nothing there replaces the building's parts: the Needle's thirteen
 * volumes are correct and stay exactly as the data has them, and the arcs are
 * added beside them. That is what makes the row reversible.
 *
 * `massing` is the other kind, and only the Library has one: it REPLACES the
 * data's volumes, because what the data has for that building is a plain 60 m
 * box and four roof planes with no massing in them at all. `facade` names a
 * facade family reserved for dressed landmarks, which the generic hash cannot
 * reach.
 *
 * Deleting a row is the whole reversal in both cases.
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
  [
    LIBRARY_WAY_ID,
    {
      name: 'Seattle Central Library',
      massing: 'library-platforms',
      facade: 'diagrid',
      source:
        'published dimensions only (11 storeys, 185 ft / 56.9 m, five offset platforms, steel-and-glass diagrid skin)',
    },
  ],
]);

/** @param {number|undefined} id an OSM way id */
export function dressingFor(id) {
  return LANDMARK_DRESSINGS.get(id) ?? null;
}

// ---------------------------------------------------------------------------
// CW-78: node-keyed dressings, and the Needle's missing top
// ---------------------------------------------------------------------------

/**
 * ★★ THE GREAT WHEEL IS A NODE, AND UNTIL NOW A NODE COULD NOT HAVE A BODY.
 * CW-63's table is keyed by way id and reaches only buildings; the legend's
 * number-two Seattle row (`n1809238334`, attraction=big_wheel) was never
 * drawn at all - bushes, pier sheds, water. This second table is keyed by
 * NODE id and gives it one. One row to delete, like every other dressing.
 *
 * Published dimensions used: 175 ft / 53.3 m tall, 42 gondolas, Pier 57
 * (Wikipedia "Seattle Great Wheel"; the OSM node carries height=53 and
 * wikidata Q7442108). ★ THE RIM DIAMETER HAS NO PRIMARY SOURCE - a 158 ft
 * figure circulates unsourced (plan §3g) - so the rim is drawn from the
 * HEIGHT and a stated ratio, and the ratio is a design choice this comment
 * owns rather than a measurement.
 */
export const WHEEL_NODE_ID = 1809238334;

export const GREAT_WHEEL = {
  /** Cited: 175 ft over the pier deck. */
  totalHeightM: 53.3,
  /**
   * DESIGN, not measurement: 0.458 of the height, chosen so the rim's low
   * point clears the deck by about 4.5 m the way a boarding platform needs.
   * (It happens to land within a metre of the unsourced 158 ft figure,
   * which is reassuring and is not the justification.)
   */
  rimRadiusM: 24.4,
  /**
   * Drawn member widths. The real rim truss is thinner; a mark thinner than
   * a character cell photographs as nothing (CW-63's diagrid members, the
   * traveler's cane), so these are diagram widths at the medium's own
   * resolution.
   */
  rimThickM: 1.4,
  rimSegments: 24,
  spokes: 8,
  spokeThickM: 1.0,
  hubRadiusM: 2.4,
  /** The hub drum's length along the axle. */
  hubWidthM: 3.4,
  /** A-frame legs: ground half-spread in the wheel's own plane. */
  legSpreadM: 13,
  legThickM: 1.7,
  /** The two leg pairs stand either side of the wheel plane by this. */
  legOutM: 3.2,
  /** The pier boarding platform under it. */
  platformHalfAlongM: 16,
  platformHalfAcrossM: 6,
  platformThickM: 1.1,
  /**
   * Drawn gondolas: eight at the spoke ends, a diagram of the cited 42
   * (42 boxes at this size would fuse into a second rim on the character
   * grid). The CW-78 blocker rule stands: they ship only if they survive
   * the 40 m photograph, and deleting them is one flag.
   */
  gondolas: 8,
  gondolaM: 2.6,
  /**
   * MEASURED from the extract, not assumed: the wheel plane runs along the
   * pier, and Pier 57's own shed (way 166910699, "Pier 57 - Miner's
   * Landing") has its longest edge at bearing 90.6 degrees - the pier runs
   * east-west, which is why the full circle photographs from the Alaskan
   * Way pavement north or south of it.
   */
  planeBearingDeg: 90.6,
};

/** Hub (axle) height: the rim hangs from it and tops out at the cited total. */
export function wheelHubHeightM() {
  return GREAT_WHEEL.totalHeightM - GREAT_WHEEL.rimRadiusM;
}

/**
 * One rim point in the wheel's own plane, as [along, z]: `along` runs along
 * the plane bearing, z up from the deck. t=0 is the top of the rim.
 */
export function wheelRimPoint(t) {
  const a = t * 2 * Math.PI;
  return [
    Math.sin(a) * GREAT_WHEEL.rimRadiusM,
    wheelHubHeightM() + Math.cos(a) * GREAT_WHEEL.rimRadiusM,
  ];
}

/**
 * The node-keyed dressing table. Same law as the way-keyed one: authored
 * from published dimensions, cited per entry, one row reversible.
 */
export const NODE_LANDMARK_DRESSINGS = new Map([
  [
    WHEEL_NODE_ID,
    {
      name: 'Seattle Great Wheel',
      body: 'great-wheel',
      source:
        'published dimensions only (height 175 ft / 53.3 m, 42 gondolas, Pier 57; rim ratio a stated design choice - no primary source publishes the diameter)',
    },
  ],
]);

/** @param {number|undefined} id an OSM node id */
export function nodeDressingFor(id) {
  return NODE_LANDMARK_DRESSINGS.get(id) ?? null;
}

/**
 * ★★ THE NEEDLE'S TOP, WHICH IS WHY IT READ AS A RADIO MAST. The thirteen
 * `building:part` prisms carry the saucer stack at the width of the SHAFT -
 * nothing in the data has the 138 ft / 42 m overhang, and the eyes-on session
 * measured two foreground tree crowns each bigger on screen than the top
 * house. CW-63's dressing drew the legs to the waist and stopped; the owner's
 * silhouette sheet (plan §11.7) asks for the whole profile: legs to a narrow
 * waist, a flare back out, then the STACKED saucer - disc, halo ring, top
 * house - with the spire above.
 *
 * Published dimensions used (§3g): observation level 518-520 ft / 158-160 m;
 * top house 138 ft / 42 m across; total 605 ft / 184.4 m to the tip. The halo
 * ring's and top house's radii, and the flare's curve, are design choices
 * from the published elevation, stated here.
 */
export const NEEDLE_TOP = {
  /** The saucer disc: cited 42 m across at the cited observation level. */
  discRadiusM: 21,
  discBottomM: 158,
  discTopM: 160.5,
  /** The halo ring stacked above the disc (the icon's second, smaller disc). */
  haloRadiusM: 12,
  haloBottomM: 161.3,
  haloTopM: 163.2,
  /** The top house drum. */
  houseRadiusM: 5.2,
  houseBottomM: 163.2,
  houseTopM: 166.5,
  /** The spire, to the cited 605 ft total. Drawn width, cell-floor law:
   * 1.3 m photographed as one marginal cell at the sheet's own 160-260 m
   * distances and read as nothing; 2.0 m is the width that survives them. */
  spireTopM: 184.4,
  spireThickM: 2.0,
  /** Where the upper flare meets the saucer's underside structure. */
  supportTopRadiusM: 8.5,
  supportTopM: 156,
  /** The flare hugs the shaft and swings out late, like the published
   * elevation; same box-segment construction as the legs. */
  flareSegments: 6,
  flareCurve: 1.7,
};

/**
 * The centreline of one upper-flare arc from the waist to the saucer
 * support, [x, y, z] relative to the tower centre. t=0 at the waist, 1 at
 * the support.
 */
export function needleFlarePoint(bearingRad, t) {
  const { waistRadiusM, waistHeightM } = NEEDLE_LEG;
  const { supportTopRadiusM, supportTopM, flareCurve } = NEEDLE_TOP;
  const radius =
    waistRadiusM + (supportTopRadiusM - waistRadiusM) * Math.pow(t, flareCurve);
  return [
    Math.sin(bearingRad) * radius,
    Math.cos(bearingRad) * radius,
    waistHeightM + (supportTopM - waistHeightM) * t,
  ];
}
