/**
 * A draft map plan from OpenStreetMap elements (an Overpass pull or a
 * dropped export, trimmed by osm-geometry.js): the mapping the class table
 * carries in its `osm` lists, projected about the address with north up,
 * clipped to the map, simplified, and switched off except for the
 * sidewalks near the address, the crossings they end on, the landmarks
 * ticked and the You are here point. The person turns the rest on in the
 * drawing editor's map purpose.
 *
 * Rules the table cannot say as data live here and say so: a steps way is
 * a stairs point at its middle AND a walkway line, so the path continues;
 * a road is two curb lines offset half its width each side; a path needs
 * foot=yes or designated; shops and benches enter the plan only when their
 * box is ticked; a named amenity is an off landmark.
 *
 * No DOM here: a worker may import this file.
 *
 * @license GPL-3.0-or-later
 */

import { emptyPlan } from './plan.js';
import { MAP_CLASSES, ROAD_WIDTHS_M } from './map-classes.js';
import { mmPerMeter, projectLatLon, toMm } from './osm-geometry.js';
import { intersect, simplify } from '../ring-geometry.js';
import { mmPerMeterAt, sidewalksAsOneLine } from './scales.js';

/** A walkway with a point this close to the address starts on. */
export const NEAR_M = 30;
/** A crossing whose end lies this close to an on walkway's end starts on. */
export const TOUCH_MM = 2;
/** Simplification: the largest deviation allowed. */
export const SIMPLIFY_MM = 0.5;
/** Lines shorter than this and areas smaller than this are left out. */
export const MIN_LINE_MM = 3;
export const MIN_AREA_MM2 = 10;
/**
 * The most features a draft holds: the drawing editor lists at most 1,000
 * shapes (`SHAPE_LIST_CAP` in svg-preparer.js), one per feature.
 */
export const DRAFT_LIMIT = 1000;

const ROAD_VALUES = Object.keys(ROAD_WIDTHS_M);
const FOOT_PATH = ['yes', 'designated'];
/** A crossing tagged with no marking on the road. */
const UNMARKED = ['unmarked', 'no'];

const round3 = (v) => Math.round(v * 1000) / 1000;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Does the element's tag set match one rule of a class's osm list? */
function matches(rule, tags, elementKind) {
  if (rule.kind !== elementKind) return false;
  const v = tags[rule.tag];
  if (v === undefined) return false;
  return !rule.values || rule.values.includes(v);
}

/**
 * The table's class whose osm list the element matches, or null. A rule on
 * a sub-tag (footway=crossing, footway=sidewalk) says more than one on
 * `highway` alone, so those are read first whatever the table's order.
 */
function classFromTable(tags, elementKind) {
  for (const pass of [(rule) => rule.tag !== 'highway', () => true]) {
    for (const c of MAP_CLASSES) {
      for (const rule of c.osm || []) {
        if (pass(rule) && matches(rule, tags, elementKind)) return c.key;
      }
    }
  }
  return null;
}

/** The distance from a point to the segment a-b. */
function segmentDistance(p, a, b) {
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
  return dist(p, [a[0] + t * dx, a[1] + t * dy]);
}

function isClosed(points) {
  if (points.length < 4) return false;
  const a = points[0];
  const b = points[points.length - 1];
  return a.lat === b.lat && a.lon === b.lon;
}

/** Liang-Barsky: the part of segment a-b inside the box, or null. */
function clipSegment(a, b, w, h) {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const checks = [
    [-dx, a[0]],
    [dx, w - a[0]],
    [-dy, a[1]],
    [dy, h - a[1]],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
}

/** A polyline cut to the box: one or more pieces of two or more points. */
function clipLine(points, w, h) {
  const pieces = [];
  let piece = null;
  for (let i = 1; i < points.length; i += 1) {
    const seg = clipSegment(points[i - 1], points[i], w, h);
    if (!seg) {
      piece = null;
      continue;
    }
    if (piece && dist(piece[piece.length - 1], seg[0]) < 1e-6) {
      piece.push(seg[1]);
    } else {
      piece = [seg[0], seg[1]];
      pieces.push(piece);
    }
  }
  return pieces;
}

/** Ramer-Douglas-Peucker on an open polyline. */
function simplifyLine(points, epsilon) {
  if (points.length <= 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  let worst = 0;
  let at = -1;
  const len = dist(first, last);
  for (let i = 1; i < points.length - 1; i += 1) {
    const p = points[i];
    const d =
      len === 0
        ? dist(p, first)
        : Math.abs(
            (last[0] - first[0]) * (first[1] - p[1]) -
              (first[0] - p[0]) * (last[1] - first[1])
          ) / len;
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  if (worst <= epsilon) return [first, last];
  return [
    ...simplifyLine(points.slice(0, at + 1), epsilon).slice(0, -1),
    ...simplifyLine(points.slice(at), epsilon),
  ];
}

function lineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1)
    total += dist(points[i - 1], points[i]);
  return total;
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/**
 * The centerline offset by `d` mm to each side: a perpendicular offset per
 * segment, joined at the vertices by the bisector (the miter capped at
 * three widths, so a hairpin does not spike).
 */
function offsetLine(points, d) {
  const n = points.length;
  const normals = [];
  for (let i = 1; i < n; i += 1) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    const len = Math.hypot(dx, dy) || 1;
    normals.push([-dy / len, dx / len]);
  }
  const side = (sign) =>
    points.map((p, i) => {
      const before = normals[Math.max(0, i - 1)];
      const after = normals[Math.min(normals.length - 1, i)];
      let nx = before[0] + after[0];
      let ny = before[1] + after[1];
      const len = Math.hypot(nx, ny);
      if (len < 1e-9) {
        nx = after[0];
        ny = after[1];
      } else {
        nx /= len;
        ny /= len;
      }
      const cos = nx * after[0] + ny * after[1];
      const scale = Math.min(3, 1 / Math.max(cos, 1e-6));
      return [p[0] + sign * nx * d * scale, p[1] + sign * ny * d * scale];
    });
  return { left: side(-1), right: side(1) };
}

/** The ring clipped to the box through the clipper: zero or more rings. */
function clipRing(ring, w, h) {
  const box = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const subject = ring.map(([x, y]) => ({ x, y }));
  const inside = subject.every(
    (p) => p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h
  );
  const rings = inside ? [subject] : intersect([subject], [box]);
  return simplify(rings, SIMPLIFY_MM).map((r) => r.map((p) => [p.x, p.y]));
}

/**
 * Build the draft.
 *
 * @param {object} args
 * @param {object[]} args.elements - trimmed elements (osm-geometry.js)
 * @param {{lat: number, lon: number}} args.center - the address
 * @param {number} args.radiusM - the map's reach from the address
 * @param {string[]} [args.landmarks] - class keys ticked: entrance,
 *   transit-stop, crossing, stairs, shop, bench
 * @param {{w: number, h: number}} [args.size] - the map in mm
 * @param {{name?: string}|null} [args.place] - the place picked, for the title
 * @returns {{ plan: object, counts: {walkways: number, crossings: number, buildings: number, landmarks: number, total: number, on: number} }}
 */
export function draftPlan({
  elements = [],
  center,
  radiusM,
  scale = null,
  landmarks = [],
  size = { w: 480, h: 360 },
  place = null,
} = {}) {
  const w = size.w;
  const h = size.h;
  const k = scale ? mmPerMeterAt(scale.ratio) : mmPerMeter(w, radiusM);
  // What draws at this scale; without one, everything, as before scales.
  const rules = scale?.rules || {
    streetsAsOneLine: false,
    crossings: true,
    crossingMarkings: false,
    sidePaths: true,
  };
  // A ticked landmark starts on where its symbol fits the scale.
  const fits = (cls) => !rules.landmarks || rules.landmarks.includes(cls);
  const landmarkOn = (cls) => ticked.has(cls) && fits(cls);
  const streetAsOneLine = (widthM) =>
    rules.streetsAsOneLine === true ||
    (rules.streetsAsOneLine === 'whereUnder3mm' &&
      sidewalksAsOneLine(scale.ratio, widthM));
  const ticked = new Set(landmarks);
  const plan = emptyPlan(w, h);
  plan.meta.title = place?.name ? place.name.split(',')[0].trim() : '';
  plan.meta.geo = { center: { lat: center.lat, lon: center.lon }, mmPerM: k };

  const mm = (pt) =>
    toMm(projectLatLon(pt.lat, pt.lon, center), size, k).map(round3);
  const insideBox = ([x, y]) => x >= 0 && x <= w && y >= 0 && y <= h;
  // A walkway passing within NEAR_M of the address starts on: the distance
  // to its segments, since a sidewalk's vertices may be a block apart.
  const middle = [w / 2, h / 2];
  const nearCenter = (points) =>
    points.some(
      (p, i) => i > 0 && segmentDistance(middle, points[i - 1], p) <= NEAR_M * k
    );

  const features = [];
  const counts = {
    walkways: 0,
    crossings: 0,
    buildings: 0,
    landmarks: 0,
    total: 0,
    on: 0,
    leftOut: 0,
  };

  const addLine = (id, cls, points, on, name) => {
    for (const [i, piece] of clipLine(points, w, h).entries()) {
      const pts = simplifyLine(piece, SIMPLIFY_MM).map((p) => p.map(round3));
      if (lineLength(pts) < MIN_LINE_MM) continue;
      const f = {
        id: i ? `${id}-${i + 1}` : id,
        class: cls,
        kind: 'line',
        points: pts,
        on,
      };
      if (name) f.name = name;
      features.push(f);
    }
  };
  const addArea = (id, cls, ring, on, name) => {
    for (const [i, piece] of clipRing(ring, w, h).entries()) {
      if (piece.length < 3 || ringArea(piece) < MIN_AREA_MM2) continue;
      const f = {
        id: i ? `${id}-${i + 1}` : id,
        class: cls,
        kind: 'area',
        ring: piece.map((p) => p.map(round3)),
        on,
      };
      if (name) f.name = name;
      features.push(f);
    }
  };
  const addPoint = (id, cls, at, on, name) => {
    if (!insideBox(at)) return;
    const f = { id, class: cls, kind: 'point', at, on };
    if (name) f.name = name;
    features.push(f);
  };

  for (const el of elements) {
    const t = el.tags || {};
    const name = typeof t.name === 'string' ? t.name : undefined;
    if (el.type === 'way') {
      const geometry = Array.isArray(el.geometry) ? el.geometry : [];
      if (geometry.length < 2) continue;
      const closed = isClosed(geometry);
      const points = geometry.map(mm);
      const id = `osm-way-${el.id}`;
      const highway = t.highway;

      if (highway === 'steps') {
        if (!rules.sidePaths) continue;
        const mid = Math.floor(points.length / 2);
        const at =
          points.length % 2 === 0
            ? [
                round3((points[mid - 1][0] + points[mid][0]) / 2),
                round3((points[mid - 1][1] + points[mid][1]) / 2),
              ]
            : points[mid];
        addPoint(`${id}-stairs`, 'stairs', at, ticked.has('stairs'), name);
        addLine(id, 'walkway', points, nearCenter(points), name);
        continue;
      }
      if (highway === 'path' && !FOOT_PATH.includes(t.foot)) continue;
      if (ROAD_VALUES.includes(highway)) {
        const widthM =
          Number(t.width) > 0 ? Number(t.width) : ROAD_WIDTHS_M[highway];
        // A street whose curbs would fall too close to read as two draws as
        // one line; over a whole neighborhood the streets are the map, on.
        if (streetAsOneLine(widthM)) {
          addLine(id, 'curb', points, rules.streetsAsOneLine === true, name);
          continue;
        }
        const { left, right } = offsetLine(points, (widthM / 2) * k);
        addLine(`${id}-left`, 'curb', left, false, name);
        addLine(`${id}-right`, 'curb', right, false, name);
        continue;
      }
      const cls =
        classFromTable(t, closed ? 'closed' : 'way') ??
        classFromTable(t, 'way');
      if (!cls) continue;
      if (cls === 'area') {
        addArea(id, 'area', closed ? points.slice(0, -1) : points, false, name);
      } else if (cls === 'crossing') {
        if (!rules.crossings) continue;
        addLine(id, 'crossing', points, ticked.has('crossing'), name);
        // Near a building the crossing's marking is kept: one with none is
        // dashed, a marked one keeps the class's ticks.
        if (rules.crossingMarkings && UNMARKED.includes(t.crossing)) {
          for (const f of features) {
            if (f.id === id || f.id.startsWith(`${id}-`)) f.style = 'dashed';
          }
        }
      } else if (cls === 'walkway') {
        if (!rules.sidePaths) continue;
        addLine(id, 'walkway', points, nearCenter(points), name);
      } else {
        addLine(id, cls, points, false, name);
      }
    } else if (el.type === 'node') {
      if (!Number.isFinite(el.lat) || !Number.isFinite(el.lon)) continue;
      const at = mm(el);
      const id = `osm-node-${el.id}`;
      if (t.shop !== undefined) {
        if (ticked.has('shop'))
          addPoint(id, 'landmark', at, fits('landmark'), name);
        continue;
      }
      if (t.amenity === 'bench') {
        if (ticked.has('bench'))
          addPoint(id, 'landmark', at, fits('landmark'), name);
        continue;
      }
      const cls = classFromTable(t, 'node');
      if (!cls) continue;
      if (cls === 'landmark') {
        if (name) addPoint(id, 'landmark', at, false, name);
        continue;
      }
      if (cls === 'crossing') {
        if (rules.crossings)
          addPoint(id, 'crossing', at, ticked.has('crossing'), name);
        continue;
      }
      addPoint(id, cls, at, landmarkOn(cls), name);
    }
  }

  // A crossing whose end lies on an on walkway's end starts on.
  const walkwayEnds = features
    .filter((f) => f.class === 'walkway' && f.on)
    .flatMap((f) => [f.points[0], f.points[f.points.length - 1]]);
  const touches = (p) => walkwayEnds.some((e) => dist(e, p) <= TOUCH_MM);
  for (const f of features) {
    if (f.class !== 'crossing' || f.on) continue;
    const ends =
      f.kind === 'line' ? [f.points[0], f.points[f.points.length - 1]] : [f.at];
    if (ends.some(touches)) f.on = true;
  }

  // Over the editor's limit: every feature on stays, then the off ones
  // nearest the address; the rest are counted, not drawn.
  let leftOut = 0;
  if (features.length + 1 > DRAFT_LIMIT) {
    const reach = (f) => {
      const pts =
        f.kind === 'line' ? f.points : f.kind === 'area' ? f.ring : [f.at];
      return Math.min(...pts.map((pt) => dist(pt, middle)));
    };
    const on = features.filter((f) => f.on);
    const off = features
      .filter((f) => !f.on)
      .map((f) => [reach(f), f])
      .sort((a, b) => a[0] - b[0])
      .map(([, f]) => f);
    const room = Math.max(0, DRAFT_LIMIT - 1 - on.length);
    const keep = new Set([...on, ...off.slice(0, room)]);
    leftOut = features.length - keep.size;
    const kept = features.filter((f) => keep.has(f));
    features.length = 0;
    features.push(...kept);
  }

  features.push({
    id: 'you-are-here',
    class: 'you-are-here',
    kind: 'point',
    name: 'You are here',
    at: [w / 2, h / 2],
    on: true,
  });

  for (const f of features) {
    counts.total += 1;
    if (f.on) counts.on += 1;
    if (f.class === 'walkway') counts.walkways += 1;
    else if (f.class === 'crossing') counts.crossings += 1;
    else if (f.class === 'area' && f.id.startsWith('osm-way-')) {
      if (isBuilding(f, elements)) counts.buildings += 1;
    } else if (
      f.kind === 'point' &&
      f.class !== 'you-are-here' &&
      f.class !== 'crossing'
    ) {
      counts.landmarks += 1;
    }
  }

  counts.leftOut = leftOut;
  plan.features = features;
  return { plan, counts };
}

/** Is this area feature a building (not a park)? Read back from its element. */
function isBuilding(f, elements) {
  const id = Number(f.id.replace(/^osm-way-/, '').split('-')[0]);
  const el = elements.find((e) => e.type === 'way' && e.id === id);
  return Boolean(el?.tags?.building);
}
