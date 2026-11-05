/**
 * Numbers for the named things on a map: every area and point that is on and
 * carries a name of its own has one, and the same number stands beside its
 * name in the key, so a reader finds a place by its number when no name fits
 * on the map.
 *
 * The order: a route map in walking order, by the route's length to each
 * thing's nearest point on it. Any other map outward from the address, so the
 * address's own building is 1 and placing You are here moves no number; with
 * no address, outward from You are here; with neither, in reading order. Ties
 * go left to right, then top to bottom. Turning a thing off renumbers what
 * follows it.
 *
 * No DOM here: a worker may import this file.
 *
 * @license GPL-3.0-or-later
 */
import { anchorOf, distanceTo } from './feature-names.js';

/** The two marks with a key row of their own carry no number. */
const OWN_ROW = new Set(['you-are-here', 'destination']);

/** Things this close in height read as one row of a drawing (mm). */
const READING_ROW_MM = 20;

/** A distance's ties are ties to this many millimeters. */
const TIE_MM = 1000;

/**
 * Whether a feature gets a number. A drawn shape named only by what it is
 * ("Rectangle 3") has no name of its own: `madeName`, from the plan builder.
 *
 * @param {object} f - a plan feature
 * @returns {boolean}
 */
export function isNamedThing(f) {
  return (
    f.on !== false &&
    (f.kind === 'area' || f.kind === 'point') &&
    Boolean(f.name) &&
    !f.madeName &&
    !OWN_ROW.has(f.class)
  );
}

const onMark = (features, cls) =>
  features.find(
    (f) => f.class === cls && f.on !== false && Array.isArray(f.at)
  );

function ringArea(ring) {
  let twice = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    twice += x0 * y1 - x1 * y0;
  }
  return Math.abs(twice) / 2;
}

/** Left to right, then top to bottom, by each feature's anchor. */
function byPlace(a, b) {
  const pa = anchorOf(a) || [0, 0];
  const pb = anchorOf(b) || [0, 0];
  return pa[0] - pb[0] || pa[1] - pb[1];
}

/** Outward from a point, the smallest area around the point first. */
function outward(things, at) {
  const ties = (f) => Math.round(distanceTo(f, at) * TIE_MM);
  const around = things.filter((f) => f.kind === 'area' && ties(f) === 0);
  const own = around.reduce(
    (best, f) => (!best || ringArea(f.ring) < ringArea(best.ring) ? f : best),
    null
  );
  return [...things].sort(
    (a, b) =>
      ties(a) - ties(b) ||
      Number(b === own) - Number(a === own) ||
      byPlace(a, b)
  );
}

function readingOrder(things) {
  const row = (f) => Math.floor((anchorOf(f)?.[1] ?? 0) / READING_ROW_MM);
  return [...things].sort((a, b) => row(a) - row(b) || byPlace(a, b));
}

/** The arc length along a segment of the point on it nearest `p`. */
function nearestOnSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)
        );
  return {
    along: t * Math.sqrt(len2),
    off: Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy),
  };
}

/** How far along the routes a thing's nearest point on them lies. */
function walkedTo(f, routes) {
  let best = { off: Infinity, along: 0 };
  const take = (off, along) => {
    if (off < best.off - 1e-9) best = { off, along };
  };
  let walked = 0;
  const spots = Array.isArray(f.at) ? [f.at] : f.ring || [];
  for (const route of routes) {
    for (let i = 1; i < route.length; i += 1) {
      const a = route[i - 1];
      const b = route[i];
      for (const spot of spots) {
        const near = nearestOnSegment(spot, a, b);
        take(near.off, walked + near.along);
      }
      // A route may pass nearer an edge of the area than any of its corners.
      take(distanceTo(f, a), walked);
      walked += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    if (route.length) take(distanceTo(f, route[route.length - 1]), walked);
  }
  return best.along;
}

function walkingOrder(things, routes) {
  const walked = new Map(things.map((f) => [f, walkedTo(f, routes)]));
  const ties = (f) => Math.round(walked.get(f) * TIE_MM);
  return [...things].sort((a, b) => ties(a) - ties(b) || byPlace(a, b));
}

/**
 * The named things of a plan, in number order: the first is number 1.
 *
 * @param {object} plan
 * @returns {object[]} the plan's own features
 */
export function numberedThings(plan) {
  const features = plan?.features || [];
  const things = features.filter(isNamedThing);
  const routes = features
    .filter(
      (f) =>
        f.class === 'route' &&
        f.kind === 'line' &&
        f.on !== false &&
        f.points?.length > 1
    )
    .map((f) => f.points);
  if (routes.length) return walkingOrder(things, routes);
  const from =
    onMark(features, 'destination') || onMark(features, 'you-are-here');
  return from ? outward(things, from.at) : readingOrder(things);
}

/**
 * The plan with each named thing's number on it and no number on anything
 * else. The plan handed in is not changed.
 *
 * @param {object} plan
 * @returns {object}
 */
export function numberNamed(plan) {
  const numbers = new Map(numberedThings(plan).map((f, i) => [f, i + 1]));
  return {
    ...plan,
    features: (plan?.features || []).map((f) => {
      const out = { ...f };
      delete out.number;
      if (numbers.has(f)) out.number = numbers.get(f);
      return out;
    }),
  };
}

/**
 * A name as a person reads it, with its number first when it has one.
 *
 * @param {{number?: number}} f
 * @param {string} name
 * @returns {string}
 */
export function numberedName(f, name) {
  return f.number ? `${f.number} ${name}` : name;
}
