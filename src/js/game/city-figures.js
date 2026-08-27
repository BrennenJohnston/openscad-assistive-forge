/**
 * Parameterized static figures for the ASCII City Walk (CW-45, CW-Q45).
 *
 * The Round-4 figure was one fixed 1.72 m person; CW-Q45 signs the variety:
 * per-figure height and build from documented human ranges, jointed static
 * poses, palette-seeded clothing tones. Everything here is pure geometry and
 * pose arithmetic - no placement, no palette CHOICE (city-scene owns both),
 * no DOM - so every range and joint is unit-testable.
 *
 * THE RANGES (owner-signed, CW-Q45): height 1.50-1.95 m per figure -
 * approximately the adult 1st-99th percentile stature span across sexes in
 * the CDC/NHANES anthropometric reference (Anthropometric Reference Data
 * for Children and Adults: United States, Vital and Health Statistics
 * Series 3, No. 46, NHANES 2015-2018 stature tables); build 0.85-1.15x on
 * shoulder/torso widths. Accessibility rule: dimensions describing PEOPLE
 * are parameters with documented ranges, never one hardcoded body.
 *
 * THE FROZEN WORLD stands (the owner's directive: "all fixed position and
 * not moving at this time") - every pose is a static table of bend angles.
 *
 * @license GPL-3.0-or-later
 */

import { BoxGeometry } from 'three';

export const FIGURE_HEIGHT_MIN_M = 1.5;
export const FIGURE_HEIGHT_MAX_M = 1.95;
export const FIGURE_BUILD_MIN = 0.85;
export const FIGURE_BUILD_MAX = 1.15;

/** The four static poses CW-Q45 signs. Sitting only ever goes on a real
 * bench - the placement code enforces that; this module just bends knees. */
export const FIGURE_POSES = ['standing', 'walking', 'jogging', 'sitting'];

// Proportions as fractions of stature, from the same anthropometric
// tradition (leg ~47%, head ~11.6% - the Round-4 figure's own ratios, now
// scaled instead of fixed).
const THIGH_FRACTION = 0.26;
const SHIN_FRACTION = 0.21;
const TORSO_FRACTION = 0.3;
const HEAD_FRACTION = 0.116;
const UPPER_ARM_FRACTION = 0.155;
const FOREARM_FRACTION = 0.13;
const SHOULDER_W_FRACTION = 0.267; // 0.46 m at 1.72 m
const TORSO_W_FRACTION = 0.198; // 0.34 m
const DEPTH_FRACTION = 0.14; // 0.24 m
const LEG_W_FRACTION = 0.0756; // 0.13 m
const ARM_W_FRACTION = 0.0581; // 0.10 m

const DEG = Math.PI / 180;

/**
 * Per-pose joint tables, in degrees. Positive swing = forward (sagittal).
 * `stride` scales the swings so two walkers frozen at different phases
 * differ; knees flex the shin BACKWARD from the thigh line.
 */
const POSE_TABLES = {
  standing: {
    hipSwingDeg: 3,
    kneeFrontDeg: 4,
    kneeBackDeg: 6,
    shoulderSwingDeg: 4,
    elbowDeg: 12,
    leanDeg: 0,
  },
  walking: {
    hipSwingDeg: 24,
    kneeFrontDeg: 10,
    kneeBackDeg: 32,
    shoulderSwingDeg: 20,
    elbowDeg: 22,
    leanDeg: 2,
  },
  jogging: {
    hipSwingDeg: 40,
    kneeFrontDeg: 38,
    kneeBackDeg: 78,
    shoulderSwingDeg: 32,
    elbowDeg: 85,
    leanDeg: 8,
  },
  sitting: {
    hipSwingDeg: 90,
    kneeFrontDeg: 90,
    kneeBackDeg: 90,
    shoulderSwingDeg: 6,
    elbowDeg: 25,
    leanDeg: 0,
  },
};

/**
 * Draw one deterministic figure from an rng stream. The caller owns the
 * seeding (hashBuilding/makeLcg precedent) - the same stream always yields
 * the same person, which is what keeps a spot's resident stable across
 * visits.
 *
 * @param {() => number} rng - uniform [0,1) stream
 * @param {'standing'|'walking'|'jogging'|'sitting'} pose
 * @param {{seatZ?: number}} [options] - sitting needs the bench's seat top
 * @returns {object} figure spec for makeFigureGeoms
 */
export function makeFigureSpec(rng, pose, options = {}) {
  const heightM =
    FIGURE_HEIGHT_MIN_M + rng() * (FIGURE_HEIGHT_MAX_M - FIGURE_HEIGHT_MIN_M);
  const build =
    FIGURE_BUILD_MIN + rng() * (FIGURE_BUILD_MAX - FIGURE_BUILD_MIN);
  // Frozen phase of the gait, -1..1; standing and sitting hold still-ish
  // and reuse the draw for subtle asymmetry instead.
  const phase = rng() * 2 - 1;
  return {
    pose,
    heightM,
    build,
    phase,
    seatZ: options.seatZ ?? 0.45,
  };
}

/**
 * CW-65 (CW-Q60): the blind traveler's drawn dimensions.
 *
 * ★★ THESE ARE DRAWN SIZES, NOT REAL ONES, AND THE DIFFERENCE IS THE WHOLE
 * POINT. A real long cane is about 25 mm across. The game viewport is 756 px
 * over a 60 degree vertical field, so px/m = 756 / (2 d tan 30):
 *
 *   distance   px/m    a real 0.03 m cane   a whole 1.72 m person (w x h cells)
 *     10 m     65.5        2.0 px                   7.5 x 12.5
 *     15 m     43.6        1.3 px                   5.0 x  8.3
 *     20 m     32.7        1.0 px                   3.8 x  6.2
 *     30 m     21.8        0.7 px                   2.5 x  4.2
 *     50 m     13.1        0.4 px                   1.5 x  2.5
 *
 * The character cell is 4 px wide by 9 px TALL. A real cane cannot change a
 * single cell at any distance a player would search from, so it is drawn - the
 * same decision CW-63 had to make for the Library's published 0.4 m diagrid
 * members, which photographed as nothing and had to be drawn at 1.2 m.
 *
 * ★★ AND THE FIGURE RUNS OUT BEFORE THE CANE DOES. At 30 m a whole person is
 * 2.5 x 4.2 cells, and CW-61 refused a map marker at 3.9 cells tall on exactly
 * this ground ("a standing figure needs five rows"). No cane thickness rescues
 * that. **The traveler cannot be identified past about 15-20 m, so finding
 * them is not a spot-the-silhouette task** - which is why CW-Q60's signed
 * design carries the warmer/colder clause on X, and why that clause is the
 * PRIMARY search instrument for every player rather than only the non-visual
 * path.
 *
 * Every value here is one line reversible and each was settled by photograph.
 */
export const TRAVELER_CANE_THICK_M = 0.12;
/** How far ahead of the wrist the tip lands; the cane's length follows. */
export const TRAVELER_CANE_REACH_M = 1;

/**
 * The traveler is ONE MORE FIGURE SPEC, not an exception to the figure system.
 * Height and build come from the same owner-signed NHANES ranges every other
 * person in the city is drawn from (CW-Q45), from a stream the caller seeds -
 * so the traveler has a body rather than a hardcoded one.
 *
 * ★ The caller passes a stream of its OWN, never a road's. The prop streams
 * run the length of a road and a single extra draw shifts the pose and build
 * of every figure planted after it (the CW-45/46 seed law). The traveler is
 * built standalone for other reasons too, but this one alone would decide it.
 *
 * @param {() => number} rng
 * @param {{caneSide?: -1|1}} [options]
 */
export function makeTravelerSpec(rng, options = {}) {
  const spec = makeFigureSpec(rng, 'standing');
  return {
    ...spec,
    caneSide: options.caneSide ?? 1,
    cane: {
      thickM: TRAVELER_CANE_THICK_M,
      reachM: TRAVELER_CANE_REACH_M,
      tipZ: 0,
    },
    glasses: true,
  };
}

/** One limb segment hanging from its top joint, swung forward by swingRad
 * in the facing plane. Returns the geometry; the caller paints it. */
function limbSegment(
  lengthM,
  thickM,
  swingRad,
  fLocal,
  sLocal,
  topZ,
  facingRad,
  x,
  y
) {
  const geom = new BoxGeometry(thickM, thickM, lengthM);
  geom.translate(0, 0, -lengthM / 2);
  if (swingRad) geom.rotateY(-swingRad);
  geom.translate(fLocal, sLocal, topZ);
  if (facingRad) geom.rotateZ(facingRad);
  geom.translate(x, y, 0);
  return geom;
}

/** A plain box in the figure's local frame (forward = +X before facing). */
function frameBox(sx, sy, sz, fLocal, sLocal, z, leanRad, facingRad, x, y) {
  const geom = new BoxGeometry(sx, sy, sz);
  if (leanRad) geom.rotateY(-leanRad);
  geom.translate(fLocal, sLocal, z);
  if (facingRad) geom.rotateZ(facingRad);
  geom.translate(x, y, 0);
  return geom;
}

/**
 * Where a limb's lower joint lands, in the local (forward, up) plane, for a
 * segment of `len` hanging from (f0, z0) swung forward by `swing`.
 */
function jointEnd(f0, z0, len, swingRad) {
  return [f0 + len * Math.sin(swingRad), z0 - len * Math.cos(swingRad)];
}

/**
 * Build one figure as unpainted geometries grouped by the tint zone the
 * palette applies to. city-scene paints and merges them: `torso`, `legs` and
 * `figure` (head + shoulders) each take their own tone from the city's
 * colour scheme, so a street of people carries the scheme's whole range.
 *
 * CW-65 adds two MORE zones, `cane` and `glasses`, and they are EMPTY unless
 * the spec asks for them. Every ordinary figure in every city must come back
 * byte-identical in the original three - that is the property the unit test
 * pins, because a change here would move 3,029 figures in Seattle alone.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} facingRad - math angle; forward is (cos f, sin f)
 * @param {ReturnType<typeof makeFigureSpec>} spec
 * @returns {{torso: BoxGeometry[], legs: BoxGeometry[], figure: BoxGeometry[],
 *            cane: BoxGeometry[], glasses: BoxGeometry[]}}
 */
export function makeFigureGeoms(x, y, facingRad, spec) {
  const t = POSE_TABLES[spec.pose] ?? POSE_TABLES.standing;
  const H = spec.heightM;
  const scale = H / 1.72;
  const sitting = spec.pose === 'sitting';
  const phase = sitting ? 1 : spec.phase;

  const thighL = H * THIGH_FRACTION;
  const shinL = H * SHIN_FRACTION;
  const torsoH = H * TORSO_FRACTION;
  const headS = H * HEAD_FRACTION;
  const upperArmL = H * UPPER_ARM_FRACTION;
  const forearmL = H * FOREARM_FRACTION;
  const shoulderW = H * SHOULDER_W_FRACTION * spec.build;
  const torsoW = H * TORSO_W_FRACTION * spec.build;
  const depth = H * DEPTH_FRACTION;
  const legW = H * LEG_W_FRACTION;
  const armW = H * ARM_W_FRACTION;
  const lean = t.leanDeg * DEG;

  const legs = [];
  const torso = [];
  const figure = [];
  // CW-65: empty for every figure that does not ask.
  const cane = [];
  const glasses = [];

  // --- Legs: pelvis height comes from the straighter leg so the low foot
  // touches the ground; sitting pelves sit on the bench instead.
  const legOf = (side) => {
    const hipSwing = t.hipSwingDeg * DEG * (sitting ? 1 : phase * side);
    const kneeBend = (hipSwing >= 0 ? t.kneeFrontDeg : t.kneeBackDeg) * DEG;
    const shinSwing = hipSwing - kneeBend;
    return { hipSwing, shinSwing };
  };
  const dropOf = ({ hipSwing, shinSwing }) =>
    thighL * Math.cos(hipSwing) + shinL * Math.cos(shinSwing);
  const left = legOf(-1);
  const right = legOf(1);
  const pelvisZ = sitting
    ? spec.seatZ + 0.02
    : Math.max(dropOf(left), dropOf(right));

  for (const [side, leg] of [
    [-1, left],
    [1, right],
  ]) {
    const s = legW * 0.85 * side * scale;
    legs.push(
      limbSegment(thighL, legW, leg.hipSwing, 0, s, pelvisZ, facingRad, x, y)
    );
    const [kneeF, kneeZ] = jointEnd(0, pelvisZ, thighL, leg.hipSwing);
    legs.push(
      limbSegment(
        shinL,
        legW * 0.9,
        leg.shinSwing,
        kneeF,
        s,
        kneeZ,
        facingRad,
        x,
        y
      )
    );
  }

  // --- Torso, shoulders, head ride the pelvis. The lean tips the torso
  // forward; the head follows the lean's offset so a jogger's head leads.
  const torsoZ = pelvisZ + torsoH / 2;
  const leanF = Math.sin(lean) * torsoH * 0.5;
  torso.push(
    frameBox(depth, torsoW, torsoH, leanF / 2, 0, torsoZ, lean, facingRad, x, y)
  );
  const shoulderZ = pelvisZ + torsoH - H * 0.02;
  figure.push(
    frameBox(
      depth * 0.9,
      shoulderW,
      H * 0.08,
      leanF,
      0,
      shoulderZ,
      0,
      facingRad,
      x,
      y
    )
  );
  const headZ = shoulderZ + H * 0.04 + headS / 2;
  figure.push(
    frameBox(headS, headS, headS, leanF, 0, headZ, 0, facingRad, x, y)
  );

  // --- Arms swing opposite the legs, elbows bent per pose. Sitting rests
  // both arms forward a little instead of opposing a stride.
  for (const side of [-1, 1]) {
    const swing = t.shoulderSwingDeg * DEG * (sitting ? 0.3 : -phase * side);
    const s = (shoulderW / 2 + armW * 0.1) * side;
    torso.push(
      limbSegment(upperArmL, armW, swing, leanF, s, shoulderZ, facingRad, x, y)
    );
    const [elbowF, elbowZ] = jointEnd(leanF, shoulderZ, upperArmL, swing);
    torso.push(
      limbSegment(
        forearmL,
        armW * 0.9,
        swing + t.elbowDeg * DEG,
        elbowF,
        s,
        elbowZ,
        facingRad,
        x,
        y
      )
    );
  }

  // --- CW-65: the traveler's two features. Both hang off joints the loop
  // above already computed, so nothing about an ordinary figure moves.
  if (spec.cane || spec.glasses) {
    const side = spec.caneSide ?? 1;
    const swing = t.shoulderSwingDeg * DEG * (sitting ? 0.3 : -phase * side);
    const sOff = (shoulderW / 2 + armW * 0.1) * side;
    const [elbowF, elbowZ] = jointEnd(leanF, shoulderZ, upperArmL, swing);
    const [wristF, wristZ] = jointEnd(
      elbowF,
      elbowZ,
      forearmL,
      swing + t.elbowDeg * DEG
    );

    if (spec.cane) {
      /**
       * ★★ THE CANE IS A DIAGRAM, AND THE ARITHMETIC SAYS SO BEFORE THE
       * PHOTOGRAPH DOES. The game viewport is 756 px over a 60 degree vertical
       * field, so px/m = 756 / (2 d tan 30) - about 22 px/m at 30 m. A real
       * 25-30 mm cane is 0.65 of a PIXEL there, and the character cell is
       * 4 px wide by 9 px tall. It could not change a single cell.
       *
       * So the thickness is a drawn width chosen by photograph, exactly as
       * CW-63 had to draw the Library's real 0.4 m diagrid members at 1.2 m.
       * The record says so plainly rather than implying a cane is a cane.
       *
       * ★ The angle is the cheap direction on purpose: the cell is 2.25x
       * coarser vertically than horizontally, so a diagonal running mostly
       * FORWARD is sampled by the generous axis.
       */
      const thick = spec.cane.thickM;
      const reach = spec.cane.reachM;
      const tipZ = spec.cane.tipZ ?? 0;
      const runF = reach;
      const dropZ = wristZ - tipZ;
      const lengthM = Math.hypot(runF, dropZ);
      // Angle from straight down, tipping forward.
      const tilt = Math.atan2(runF, dropZ);
      cane.push(
        limbSegment(lengthM, thick, tilt, wristF, sOff, wristZ, facingRad, x, y)
      );
    }

    if (spec.glasses) {
      /**
       * ★★ EXACT BLACK, WRAPPED IN A BRIGHT HEAD - CW-40's law used
       * deliberately rather than worked around. These palettes carry NO dark
       * neutral (CW-58 measured every bird landing white), so a "dark band"
       * drawn dark would land on a colour that is not dark. Exact black is the
       * one value the converter renders as an EMPTY CELL (CW-5), and the head
       * is already the brightest zone a figure has at tier 0.82.
       *
       * ★ IT IS ALSO SUB-CELL AT ANY SEARCHING DISTANCE, AND THAT IS STATED
       * RATHER THAN HOPED: a 0.055 m band is 1.2 px at 15 m, about an eighth
       * of a cell. It reads when you are beside them, not when you are looking
       * for them. The jacket and the cane are what carry distance.
       */
      const bandH = headS * 0.28;
      const bandZ = headZ + headS * 0.12;
      glasses.push(
        frameBox(
          headS * 1.04,
          headS * 1.04,
          bandH,
          leanF,
          0,
          bandZ,
          0,
          facingRad,
          x,
          y
        )
      );
    }
  }

  return { torso, legs, figure, cane, glasses };
}
