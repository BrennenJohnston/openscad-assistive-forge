/**
 * What a map's features are called where a person reads them: the editor's
 * rows and the warnings. A feature's own name (a street, a building); else
 * its class near the nearest named feature ("Stairs near Husky Union
 * Building"); else its class alone. A name used twice is numbered from its
 * second use, so every row reads apart.
 *
 * No DOM here: a worker may import this file.
 *
 * @license GPL-3.0-or-later
 */
import { MAP_CLASSES } from './map-classes.js';

const classWord = (key) =>
  MAP_CLASSES.find((c) => c.key === key)?.name || 'Shape';

/** A point that stands for the feature: its place, its middle, or its box's centre. */
function anchorOf(f) {
  if (Array.isArray(f.at)) return f.at;
  const pts = f.points || f.ring;
  if (!Array.isArray(pts) || pts.length === 0) return null;
  if (f.points) return pts[Math.floor(pts.length / 2)];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ];
}

/** Classes that are not places to name another feature by. */
const NOT_A_PLACE = new Set(['you-are-here', 'route']);

function toSegment(p, a, b) {
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
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function insideRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** How far a point is from a feature: its place, its line, or its outline (0 inside). */
function distanceTo(f, p) {
  if (Array.isArray(f.at)) return Math.hypot(f.at[0] - p[0], f.at[1] - p[1]);
  const pts = f.points || f.ring;
  if (!Array.isArray(pts) || pts.length === 0) return Infinity;
  if (f.ring && pts.length > 2 && insideRing(p, pts)) return 0;
  const line = f.ring ? [...pts, pts[0]] : pts;
  if (line.length === 1)
    return Math.hypot(line[0][0] - p[0], line[0][1] - p[1]);
  let best = Infinity;
  for (let i = 1; i < line.length; i += 1) {
    best = Math.min(best, toSegment(p, line[i - 1], line[i]));
  }
  return best;
}

/**
 * The names of the features, in their order.
 *
 * @param {object[]} features - a plan's features
 * @returns {string[]}
 */
export function featureNames(features = []) {
  const places = features.filter((f) => f.name && !NOT_A_PLACE.has(f.class));
  const nearestName = (at) => {
    let best = null;
    let bestD = Infinity;
    for (const f of places) {
      const d = distanceTo(f, at);
      if (d < bestD) {
        bestD = d;
        best = f.name;
      }
    }
    return best;
  };
  const seen = new Map();
  return features.map((f) => {
    let base = f.name;
    if (!base) {
      const at = anchorOf(f);
      const near = at ? nearestName(at) : null;
      base = near ? `${classWord(f.class)} near ${near}` : classWord(f.class);
    }
    const times = (seen.get(base) || 0) + 1;
    seen.set(base, times);
    return times === 1 ? base : `${base} (${times})`;
  });
}
