/**
 * The map plan: a tactile map as data, in millimeters.
 *
 * A plan is what the drawing editor edits, what a generator writes and what
 * the levels builder turns into the file the Tactile Map tile imports. It
 * knows nothing about heights: a feature carries a CLASS (wall, route,
 * stairs ...) and the class table decides the level, the width and the
 * symbol, so a person picks a class and never a height.
 *
 * Coordinates are millimeters from the map's top left corner, x to the
 * right and y DOWN, as on paper and in an SVG. The model flips y when it
 * imports the levels file, so the printed map reads the way the plan was
 * drawn: y = 0 is the north edge.
 *
 * A feature:
 *   { id, class, kind, on, name? }
 *   kind 'line':    points [[x, y], ...] (two or more); width? (mm, instead
 *                   of the class's); style? ('solid', 'dotted', 'dashed',
 *                   'double', 'ticks')
 *   kind 'area':    ring [[x, y], ...] (three or more); holes? (rings of
 *                   three or more points inside the ring, left open: a
 *                   courtyard, a slot, a letter's counter); texture? (a
 *                   name; none by default)
 *   kind 'point':   at [x, y] (the symbol's center); symbol? (a symbol key
 *                   instead of the class's); size? (mm)
 *   kind 'text':    at [x, y] (the top left of the letters); text; size?
 *                   (the capital height in mm, 16 by default)
 *   kind 'channel': at [x, y] (the center of the tape strip); length (mm);
 *                   vertical? (true for a strip that runs down the map)
 * Any feature may be switched off (on: false) and stays in the plan.
 *
 * No DOM here: a worker may import this file.
 *
 * @license GPL-3.0-or-later
 */

export const FEATURE_KINDS = ['line', 'area', 'point', 'text', 'channel'];

export const NORTH_CUES = ['arrow', 'line', 'none'];

/**
 * A plan with nothing on it yet.
 *
 * @param {number} w - Map width in mm
 * @param {number} h - Map height in mm
 * @returns {object}
 */
export function emptyPlan(w, h) {
  return {
    size: { w, h },
    origin: [0, 0],
    features: [],
    meta: { title: '', north: 'arrow', scale: { unit: 'mm' } },
  };
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isPair = (p) =>
  Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]);

/**
 * Say, in sentences, what is wrong with a plan. An empty list means the plan
 * can be built.
 *
 * @param {object} plan
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validatePlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== 'object') {
    return { ok: false, errors: ['There is no plan to read.'] };
  }
  const size = plan.size;
  if (!size || typeof size !== 'object') {
    errors.push(
      'The plan has no size; it needs a width and a height in millimeters.'
    );
  } else {
    if (!isNum(size.w) || size.w <= 0)
      errors.push(
        `The plan's width is ${size.w}; it must be a number above 0.`
      );
    if (!isNum(size.h) || size.h <= 0)
      errors.push(
        `The plan's height is ${size.h}; it must be a number above 0.`
      );
  }
  if (!Array.isArray(plan.features)) {
    errors.push('The plan has no list of features.');
  } else {
    const seen = new Set();
    plan.features.forEach((f, i) => {
      const n = i + 1;
      if (!f || typeof f !== 'object') {
        errors.push(`Feature ${n} is not a feature.`);
        return;
      }
      if (typeof f.id !== 'string' || f.id === '') {
        errors.push(`Feature ${n} has no id.`);
        return;
      }
      if (seen.has(f.id)) errors.push(`Two features share the id ${f.id}.`);
      seen.add(f.id);
      if (typeof f.class !== 'string' || f.class === '')
        errors.push(`${f.id} has no class.`);
      if (!FEATURE_KINDS.includes(f.kind)) {
        errors.push(
          `${f.id} has the kind ${f.kind}; a feature is a line, an area, a point, a text or a channel.`
        );
        return;
      }
      if (f.kind === 'line') {
        if (!Array.isArray(f.points) || f.points.length < 2)
          errors.push(`${f.id} is a line with fewer than two points.`);
        else if (!f.points.every(isPair))
          errors.push(`${f.id} has a point that is not two numbers.`);
      } else if (f.kind === 'area') {
        if (!Array.isArray(f.ring) || f.ring.length < 3)
          errors.push(
            `${f.id} is an area with fewer than three points in its ring.`
          );
        else if (!f.ring.every(isPair))
          errors.push(`${f.id} has a point that is not two numbers.`);
        if (
          f.holes !== undefined &&
          (!Array.isArray(f.holes) ||
            f.holes.some(
              (h) => !Array.isArray(h) || h.length < 3 || !h.every(isPair)
            ))
        ) {
          errors.push(
            `${f.id} has a hole that is not a ring of three or more points.`
          );
        }
      } else {
        if (!isPair(f.at))
          errors.push(`${f.id} has no place (at) made of two numbers.`);
        if (f.kind === 'text' && (typeof f.text !== 'string' || f.text === ''))
          errors.push(`${f.id} is a text without words.`);
        if (f.kind === 'channel' && !(isNum(f.length) && f.length > 0))
          errors.push(`${f.id} is a channel without a length.`);
      }
    });
  }
  const north = plan.meta?.north ?? 'arrow';
  if (!NORTH_CUES.includes(north))
    errors.push(`The north cue ${north} is not one of arrow, line or none.`);
  return { ok: errors.length === 0, errors };
}

/**
 * The stand-in station the tile ships as its sample, as a plan: the same
 * layout as public/examples/tactile-map/sample_station.svg (a border wall
 * and a room, a platform outline with an area, six symbols, a dotted route
 * and two label channels), so the builder's output and the hand-made file
 * can be laid side by side.
 *
 * @returns {object}
 */
export function sampleStationPlan() {
  const plan = emptyPlan(480, 360);
  plan.features.push(
    {
      id: 'border',
      class: 'wall',
      kind: 'line',
      name: 'the border wall',
      points: [
        [1, 1],
        [479, 1],
        [479, 359],
        [1, 359],
        [1, 1],
      ],
      on: true,
    },
    {
      id: 'room',
      class: 'wall',
      kind: 'line',
      name: 'the room',
      points: [
        [261, 251],
        [459, 251],
        [459, 349],
        [261, 349],
        [261, 251],
      ],
      on: true,
    },
    {
      id: 'platform',
      class: 'walkway',
      kind: 'line',
      name: 'the platform edge',
      points: [
        [20.75, 40.75],
        [319.25, 40.75],
        [319.25, 239.25],
        [20.75, 239.25],
        [20.75, 40.75],
      ],
      on: true,
    },
    {
      id: 'area-1',
      class: 'area',
      kind: 'area',
      name: 'the waiting area',
      ring: [
        [40, 60],
        [160, 60],
        [160, 140],
        [40, 140],
      ],
      on: true,
    },
    { id: 'stairs-1', class: 'stairs', kind: 'point', at: [60, 200], on: true },
    {
      id: 'stairs-2',
      class: 'stairs',
      kind: 'point',
      at: [100, 200],
      on: true,
    },
    {
      id: 'landmark-1',
      class: 'landmark',
      kind: 'point',
      at: [140, 200],
      on: true,
    },
    {
      id: 'landmark-2',
      class: 'landmark',
      kind: 'point',
      at: [180, 200],
      on: true,
    },
    {
      id: 'transit-1',
      class: 'transit-stop',
      kind: 'point',
      at: [220, 200],
      on: true,
    },
    {
      id: 'transit-2',
      class: 'transit-stop',
      kind: 'point',
      at: [260, 200],
      on: true,
    },
    {
      id: 'route-1',
      class: 'route',
      kind: 'line',
      name: 'the route',
      points: [
        [40, 300],
        [127, 300],
      ],
      on: true,
    },
    {
      id: 'label-1',
      class: 'channel',
      kind: 'channel',
      at: [370, 46.55],
      length: 60,
      on: true,
    },
    {
      id: 'label-2',
      class: 'channel',
      kind: 'channel',
      at: [370, 126.55],
      length: 60,
      on: true,
    }
  );
  return plan;
}
