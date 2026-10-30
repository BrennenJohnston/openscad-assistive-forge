/**
 * Steep sidewalks: along every on walkway (and crossing) of a draft, the
 * height is read every 10 m through the map's scale, smoothed over 30 m
 * (the terrain tiles are about 3 m per pixel and noisy), and each run
 * steeper than the grade becomes a Steep sidewalk feature of its own: a
 * line of the run's samples drawn with chevrons pointing uphill. Nothing
 * else in the plan changes.
 *
 * The grade's range is a public default the owner signs (3 to 12 %, the 5 %
 * default the ADA ramp figure); the assert below is that range.
 *
 * No DOM here: the panel imports this file lazily.
 *
 * @license GPL-3.0-or-later
 */

export const GRADE_MIN_PCT = 3;
export const GRADE_MAX_PCT = 12;
const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LON = 111320;
const CLASSES_READ = new Set(['walkway', 'crossing']);

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The point at arc length s along a polyline of [x, y] pairs. */
function along(points, s) {
  let walked = 0;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const len = dist(points[i], points[i + 1]);
    if (len < 1e-9) continue;
    if (s <= walked + len || i + 2 === points.length) {
      const t = Math.max(0, Math.min(1, (s - walked) / len));
      return [
        points[i][0] + (points[i + 1][0] - points[i][0]) * t,
        points[i][1] + (points[i + 1][1] - points[i][1]) * t,
      ];
    }
    walked += len;
  }
  return points[points.length - 1];
}

function lengthOf(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1)
    total += dist(points[i - 1], points[i]);
  return total;
}

/** A moving average over a window of `radius` samples each side. */
function smooth(values, radius) {
  return values.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (
      let j = Math.max(0, i - radius);
      j <= Math.min(values.length - 1, i + radius);
      j += 1
    ) {
      sum += values[j];
      n += 1;
    }
    return sum / n;
  });
}

/**
 * Mark the steep runs.
 *
 * @param {object} plan - with `meta.geo = { center, mmPerM }` (a draft from OpenStreetMap)
 * @param {object} options
 * @param {(lat: number, lon: number) => number|null} options.elevationAt
 * @param {number} options.gradePct - 3 to 12
 * @param {number} [options.sampleM] - the step between height readings, meters
 * @param {number} [options.smoothM] - the moving-average window, meters
 * @returns {{ plan: object, steepCount: number }}
 */
export function markSteep(
  plan,
  { elevationAt, gradePct, sampleM = 10, smoothM = 30 } = {}
) {
  const g = Number(gradePct);
  if (!(g >= GRADE_MIN_PCT && g <= GRADE_MAX_PCT)) {
    throw new Error(
      `The steep grade is ${gradePct} %; it must be between ${GRADE_MIN_PCT} and ${GRADE_MAX_PCT} %.`
    );
  }
  const geo = plan?.meta?.geo;
  const k = geo?.mmPerM;
  if (!(k > 0) || !geo.center) return { plan, steepCount: 0 };
  const { w, h } = plan.size;
  const center = geo.center;
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const toLatLon = ([x, y]) => {
    const east = (x - w / 2) / k;
    const north = (h / 2 - y) / k;
    return [
      center.lat + north / M_PER_DEG_LAT,
      center.lon + east / (M_PER_DEG_LON * cosLat),
    ];
  };
  // A 30 m window at 10 m steps: one sample each side.
  const radius = Math.max(1, Math.floor(smoothM / sampleM / 2));

  const added = [];
  for (const f of plan.features || []) {
    if (f.kind !== 'line' || f.on === false || !CLASSES_READ.has(f.class))
      continue;
    if (!Array.isArray(f.points) || f.points.length < 2) continue;
    const total = lengthOf(f.points);
    const stepMm = sampleM * k;
    if (total < stepMm) continue;
    const samples = [];
    for (let s = 0; s < total - 1e-9; s += stepMm)
      samples.push(along(f.points, s));
    samples.push(f.points[f.points.length - 1]);
    const heights = samples.map((p) => elevationAt(...toLatLon(p)));
    if (heights.some((v) => typeof v !== 'number' || !Number.isFinite(v)))
      continue;
    const hs = smooth(heights, radius);
    // The grade across the smoothing window, read between the samples
    // that have a full window each side; the two ends take their
    // neighbor's grade, since a smoothed end sample is an average over
    // fewer readings and would halve the grade there.
    const count = hs.length;
    const grades = new Array(count).fill(0);
    if (count === 2) {
      const runM = dist(samples[0], samples[1]) / k;
      grades[0] = grades[1] = runM > 0 ? ((hs[1] - hs[0]) / runM) * 100 : 0;
    } else {
      for (let i = 1; i < count - 1; i += 1) {
        const runM = dist(samples[i - 1], samples[i + 1]) / k;
        grades[i] = runM > 0 ? ((hs[i + 1] - hs[i - 1]) / runM) * 100 : 0;
      }
      grades[0] = grades[1];
      grades[count - 1] = grades[count - 2];
    }
    let i = 0;
    let n = 0;
    while (i < grades.length) {
      if (Math.abs(grades[i]) <= g) {
        i += 1;
        continue;
      }
      const sign = Math.sign(grades[i]);
      let j = i;
      while (
        j + 1 < grades.length &&
        Math.abs(grades[j + 1]) > g &&
        Math.sign(grades[j + 1]) === sign
      )
        j += 1;
      const last = Math.min(samples.length - 1, j + 1);
      if (last > i) {
        n += 1;
        const feature = {
          id: `${f.id}-steep-${n}`,
          class: 'steep',
          kind: 'line',
          points: samples.slice(i, last + 1).map((p) => [p[0], p[1]]),
          on: true,
          style: 'chevrons',
          uphill: sign > 0 ? 'end' : 'start',
        };
        if (f.name) feature.name = `${f.name}, steep`;
        added.push(feature);
      }
      i = j + 1;
    }
  }
  if (added.length === 0) return { plan, steepCount: 0 };
  return {
    plan: { ...plan, features: [...plan.features, ...added] },
    steepCount: added.length,
  };
}
