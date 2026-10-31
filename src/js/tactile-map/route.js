/**
 * The route of a tactile map: sidewalks picked in the order a person walks
 * them. A pick joins the route when one of its ends lies at the route's
 * end (reversed when its last point is the one that fits); its length is
 * read back in meters through the map's scale; and on Apply the route
 * segments that meet become one Route feature, so the levels builder draws
 * one dotted line and not a chain of pieces.
 *
 * No DOM here: the editor and the panel both import this file lazily.
 *
 * @license GPL-3.0-or-later
 */

/** How close two line ends must lie to count as meeting, in millimeters. */
export const ROUTE_TOLERANCE_MM = 2;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const isPoints = (pts) => Array.isArray(pts) && pts.length >= 2;

/**
 * The candidate's points in walking order if it fits onto the route's end,
 * or null. An empty route takes anything as it is.
 *
 * @param {Array<Array<[number, number]>>} route - the segments on the route so far
 * @param {Array<[number, number]>} candidate - the shape's points
 * @param {number} [toleranceMm]
 * @returns {Array<[number, number]>|null}
 */
export function fitsRoute(route, candidate, toleranceMm = ROUTE_TOLERANCE_MM) {
  if (!isPoints(candidate)) return null;
  if (!route || route.length === 0) return candidate;
  const last = route[route.length - 1];
  const end = last[last.length - 1];
  if (dist(candidate[0], end) <= toleranceMm) return candidate;
  if (dist(candidate[candidate.length - 1], end) <= toleranceMm) {
    return [...candidate].reverse();
  }
  return null;
}

/**
 * Where a candidate joins the route: at its end (as fitsRoute), or at its
 * start, turned so that its last point meets the route's first. An empty
 * route takes anything at its end, as it is.
 *
 * @param {Array<Array<[number, number]>>} route
 * @param {Array<[number, number]>} candidate
 * @param {number} [toleranceMm]
 * @returns {{at: 'end'|'start', points: Array<[number, number]>}|null}
 */
export function fitRoute(route, candidate, toleranceMm = ROUTE_TOLERANCE_MM) {
  const atEnd = fitsRoute(route, candidate, toleranceMm);
  if (atEnd) return { at: 'end', points: atEnd };
  if (!isPoints(candidate) || !route || route.length === 0) return null;
  const start = route[0][0];
  if (dist(candidate[candidate.length - 1], start) <= toleranceMm) {
    return { at: 'start', points: candidate };
  }
  if (dist(candidate[0], start) <= toleranceMm) {
    return { at: 'start', points: [...candidate].reverse() };
  }
  return null;
}

/**
 * The route's length in meters.
 *
 * @param {Array<Array<[number, number]>>} route
 * @param {number} mmPerM - millimeters on the map per meter on the ground
 * @returns {number}
 */
export function routeLengthM(route, mmPerM) {
  if (!(mmPerM > 0)) return 0;
  let mm = 0;
  for (const seg of route || []) {
    for (let i = 1; i < seg.length; i += 1) mm += dist(seg[i - 1], seg[i]);
  }
  return mm / mmPerM;
}

/**
 * The on route lines of a plan merged where their ends meet: each chain
 * becomes one Route feature at the place of its first member, the other
 * features untouched and in order.
 *
 * @param {object[]} features
 * @param {number} [toleranceMm]
 * @returns {object[]}
 */
export function joinRoute(features, toleranceMm = ROUTE_TOLERANCE_MM) {
  const isRoute = (f) =>
    f &&
    f.class === 'route' &&
    f.kind === 'line' &&
    f.on !== false &&
    isPoints(f.points);
  const pool = features
    .map((f, i) => (isRoute(f) ? i : -1))
    .filter((i) => i >= 0);
  if (pool.length === 0) return features;

  const out = [];
  const taken = new Set();
  let n = 0;
  for (let i = 0; i < features.length; i += 1) {
    const f = features[i];
    if (!isRoute(f)) {
      out.push(f);
      continue;
    }
    if (taken.has(i)) continue;
    taken.add(i);
    let points = f.points.map((p) => [p[0], p[1]]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const j of pool) {
        if (taken.has(j)) continue;
        const fitted = fitRoute([points], features[j].points, toleranceMm);
        if (fitted?.at === 'end') {
          points = points.concat(fitted.points.slice(1));
        } else if (fitted?.at === 'start') {
          points = fitted.points.slice(0, -1).concat(points);
        }
        if (fitted) {
          taken.add(j);
          grew = true;
        }
      }
    }
    n += 1;
    out.push({
      id: `route-${n}`,
      class: 'route',
      kind: 'line',
      name: 'Route',
      points,
      on: true,
    });
  }
  return out;
}
