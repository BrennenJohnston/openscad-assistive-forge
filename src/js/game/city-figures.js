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
 * @param {number} x
 * @param {number} y
 * @param {number} facingRad - math angle; forward is (cos f, sin f)
 * @param {ReturnType<typeof makeFigureSpec>} spec
 * @returns {{torso: BoxGeometry[], legs: BoxGeometry[], figure: BoxGeometry[]}}
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
  figure.push(
    frameBox(
      headS,
      headS,
      headS,
      leanF,
      0,
      shoulderZ + H * 0.04 + headS / 2,
      0,
      facingRad,
      x,
      y
    )
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

  return { torso, legs, figure };
}
