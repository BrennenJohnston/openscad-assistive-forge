/**
 * Every named thing on a map carries a number, and the same number stands
 * beside its name in the key. A map with an address counts outward from it,
 * the address's own building 1; with no address, outward from You are here;
 * with neither, in reading order. A route map counts in walking order. Ties
 * go left to right, then top to bottom.
 *
 * The Ferry Place fixture is the real tiles over 3600 Ferry Pl NE.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  isNamedThing,
  numberedName,
  numberedThings,
  numberNamed,
} from '../../src/js/tactile-map/map-numbers.js';
import { keyFor, keyText } from '../../src/js/tactile-map/map-key.js';
import { labelPlan } from '../../src/js/tactile-map/map-labels.js';
import { applyDetail, switchesFor } from '../../src/js/tactile-map/detail-levels.js';
import { distanceTo } from '../../src/js/tactile-map/feature-names.js';
import { draftPlan } from '../../src/js/tactile-map/plan-from-osm.js';
import { pullTiles, TILE_URL } from '../../src/js/tactile-map/osm-tiles.js';
import { scaleChoice, groundBox } from '../../src/js/tactile-map/scales.js';
import { emptyPlan } from '../../src/js/tactile-map/plan.js';

const point = (id, at, extra = {}) => ({
  id,
  class: 'landmark',
  kind: 'point',
  at,
  on: true,
  ...extra,
});
const box = (id, x0, y0, x1, y1, extra = {}) => ({
  id,
  class: 'area',
  kind: 'area',
  ring: [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ],
  on: true,
  ...extra,
});
const ids = (plan) => numberedThings(plan).map((f) => f.id);

describe('what gets a number', () => {
  it('is an area or a point that is on and carries a name of its own', () => {
    const named = (f) => isNamedThing(f);
    expect(named(box('b', 0, 0, 9, 9, { name: 'Hall' }))).toBe(true);
    expect(named(point('p', [1, 1], { name: 'Pine' }))).toBe(true);
    // Unnamed kinds keep their symbol, unnumbered.
    expect(named(box('b', 0, 0, 9, 9))).toBe(false);
    expect(named(point('p', [1, 1], { what: 'Bench' }))).toBe(false);
    // Off, a street, the two marks that have a key row of their own.
    expect(named(point('p', [1, 1], { name: 'Pine', on: false }))).toBe(false);
    expect(
      named({
        id: 's',
        class: 'walkway',
        kind: 'line',
        points: [
          [0, 0],
          [9, 9],
        ],
        name: 'Pine Street',
        on: true,
      })
    ).toBe(false);
    expect(
      named(point('h', [1, 1], { class: 'you-are-here', name: 'You are here' }))
    ).toBe(false);
    expect(
      named(point('d', [1, 1], { class: 'destination', name: '3600 Ferry Pl' }))
    ).toBe(false);
    // A drawn shape named only by its key has no name of its own.
    expect(
      named(box('b', 0, 0, 9, 9, { name: 'path17', madeName: true }))
    ).toBe(false);
  });
});

describe('the order of the numbers', () => {
  const address = (at) =>
    point('destination', at, { class: 'destination', name: '3600 Ferry Pl' });
  const here = (at, on = true) =>
    point('you-are-here', at, {
      class: 'you-are-here',
      name: 'You are here',
      on,
    });

  it("counts out from the address, the address's own building 1 even inside a larger named area", () => {
    const plan = emptyPlan(400, 300);
    plan.features.push(
      point('far', [380, 280], { name: 'Far Cafe' }),
      box('campus', 10, 10, 390, 290, { name: 'Campus' }),
      box('own', 190, 140, 210, 160, { name: 'Own Hall' }),
      box('next', 230, 140, 260, 160, { name: 'Next Hall' }),
      point('near', [200, 180], { name: 'Near Cafe' }),
      address([200, 150])
    );
    expect(ids(plan)).toEqual(['own', 'campus', 'near', 'next', 'far']);
  });

  it('never moves a number when You are here is placed or dragged on a map with an address', () => {
    const plan = emptyPlan(400, 300);
    plan.features.push(
      point('a', [100, 150], { name: 'Alder' }),
      point('b', [300, 150], { name: 'Birch' }),
      address([150, 150]),
      here([150, 150], false)
    );
    const before = ids(plan);
    expect(before).toEqual(['a', 'b']);
    plan.features.find((f) => f.id === 'you-are-here').on = true;
    plan.features.find((f) => f.id === 'you-are-here').at = [299, 150];
    expect(ids(plan)).toEqual(before);
  });

  it('counts out from You are here on a map with no address', () => {
    const plan = emptyPlan(400, 300);
    plan.features.push(
      point('a', [100, 150], { name: 'Alder' }),
      point('b', [300, 150], { name: 'Birch' }),
      here([290, 150])
    );
    expect(ids(plan)).toEqual(['b', 'a']);
    plan.features.find((f) => f.id === 'you-are-here').on = false;
    expect(ids(plan)).toEqual(['a', 'b']);
  });

  it('reads a map with neither row by row, left to right', () => {
    const plan = emptyPlan(400, 300);
    plan.features.push(
      point('low', [10, 200], { name: 'Low' }),
      point('right', [300, 53], { name: 'Right' }),
      point('left', [20, 50], { name: 'Left' }),
      point('lowRight', [200, 205], { name: 'Low Right' })
    );
    expect(ids(plan)).toEqual(['left', 'right', 'low', 'lowRight']);
  });

  it('breaks a tie left to right, then top to bottom', () => {
    const plan = emptyPlan(400, 300);
    plan.features.push(
      point('east', [230, 150], { name: 'East' }),
      point('west', [170, 150], { name: 'West' }),
      point('south', [200, 180], { name: 'South' }),
      point('north', [200, 120], { name: 'North' }),
      address([200, 150])
    );
    expect(ids(plan)).toEqual(['west', 'north', 'south', 'east']);
  });

  it("counts a route map in walking order, by the route's length to each thing's nearest point on it", () => {
    const plan = emptyPlan(400, 300);
    plan.features.push(
      {
        id: 'route',
        class: 'route',
        kind: 'line',
        name: 'Route',
        points: [
          [20, 150],
          [200, 150],
          [200, 40],
        ],
        on: true,
      },
      point('late', [210, 50], { name: 'Late' }),
      box('middle', 120, 160, 160, 190, { name: 'Middle' }),
      point('early', [50, 140], { name: 'Early' }),
      // The address and You are here do not change a walk's order.
      address([200, 40]),
      here([20, 150])
    );
    expect(ids(plan)).toEqual(['early', 'middle', 'late']);
  });
});

describe('numberNamed', () => {
  const plan = () => {
    const p = emptyPlan(400, 300);
    p.features.push(
      point('a', [100, 150], { name: 'Alder' }),
      point('bench', [120, 150], { what: 'Bench' }),
      point('b', [300, 150], { name: 'Birch' }),
      point('c', [350, 150], { name: 'Cedar' })
    );
    return p;
  };
  const numbers = (p) =>
    Object.fromEntries(
      numberNamed(p).features.map((f) => [f.id, f.number ?? null])
    );

  it('writes the number on each named thing and on nothing else, and leaves the plan handed in alone', () => {
    const p = plan();
    expect(numbers(p)).toEqual({ a: 1, bench: null, b: 2, c: 3 });
    expect(p.features.some((f) => 'number' in f)).toBe(false);
  });

  it('renumbers what follows a thing turned off, and is the same run twice', () => {
    const p = plan();
    p.features.find((f) => f.id === 'b').on = false;
    expect(numbers(p)).toEqual({ a: 1, bench: null, b: null, c: 2 });
    const once = numberNamed(p);
    expect(numberNamed(once)).toEqual(once);
  });

  it('says a numbered name with its number first, and any other name as it is', () => {
    expect(numberedName({ number: 3 }, 'Oceanography Building')).toBe(
      '3 Oceanography Building'
    );
    expect(numberedName({}, 'Stairs near Hall')).toBe('Stairs near Hall');
  });
});

describe('at 3600 Ferry Pl NE, Every building', () => {
  const FERRY = { lat: 47.6481285, lon: -122.3086726 };
  const tiles = (x) =>
    readFileSync(`tests/fixtures/tactile-map/sourdough-15-${x}-11438.mvt`);
  const TILE = { 5250: tiles(5250), 5251: tiles(5251) };
  const fetch = async (url) => {
    const x = Object.keys(TILE).find(
      (k) =>
        url ===
        TILE_URL.replace('{z}', 15).replace('{x}', k).replace('{y}', 11438)
    );
    const bytes = x ? TILE[x] : new Uint8Array(0);
    return {
      ok: true,
      status: x ? 200 : 204,
      arrayBuffer: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        ),
    };
  };
  const SIZE = { w: 480, h: 360 };

  async function ferry() {
    const choice = scaleChoice('block');
    const scale = { ratio: choice.ratio, rules: choice.rules };
    const { elements } = await pullTiles({
      box: groundBox(FERRY, choice.ratio, SIZE),
      fetch,
    });
    const { plan } = draftPlan({
      elements,
      center: FERRY,
      scale,
      landmarks: ['entrance', 'transit-stop'],
      size: SIZE,
      place: {
        name: 'Center on Human Development and Disability South, 3600, Ferry Place Northeast, Seattle',
        query: '3600 Ferry Pl NE',
      },
    });
    const applied = applyDetail(plan.features, {
      switches: switchesFor('place', 'buildings'),
      scale,
      mmPerM: plan.meta.geo.mmPerM,
    });
    return { ...plan, features: applied.features };
  }

  it('numbers every named area and point outward from the address, with no code anywhere and the key in number order', async () => {
    const plan = await ferry();
    const onNamed = plan.features.filter(
      (f) =>
        f.on !== false &&
        f.name &&
        (f.kind === 'area' || f.kind === 'point') &&
        f.class !== 'destination' &&
        f.class !== 'you-are-here'
    );
    const numbered = numberNamed(plan).features.filter((f) => f.number);
    expect(numbered.length).toBe(onNamed.length);
    expect(numbered.some((f) => f.kind === 'area')).toBe(true);
    expect(numbered.some((f) => f.kind === 'point')).toBe(true);
    expect(numbered.map((f) => f.number).sort((a, b) => a - b)).toEqual(
      numbered.map((_, i) => i + 1)
    );
    // Outward from the cone, the address's building first.
    const cone = plan.features.find((f) => f.class === 'destination').at;
    const order = numberedThings(plan);
    const distances = order.map((f) => distanceTo(f, cone));
    for (let i = 1; i < distances.length; i += 1) {
      expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1] - 1e-9);
    }
    expect(order[0].name).toBe(
      'Center on Human Development and Disability South'
    );
    expect(distances[0]).toBe(0);
    const { key, labels, warnings } = labelPlan(plan);
    expect(key.numbers.map((n) => n.number)).toEqual(
      order.map((_, i) => i + 1)
    );
    expect(key.numbers.map((n) => n.featureId)).toEqual(order.map((f) => f.id));
    expect(key.abbreviations).toBeUndefined();
    expect(keyText(key)).not.toMatch(/Abbreviations/);
    // No label text is a code: each is the thing's own name.
    const byId = new Map(order.map((f) => [f.id, f]));
    for (const l of labels) {
      expect(l.text).toBe(byId.get(l.featureId).name);
      expect(l.number).toBe(order.indexOf(byId.get(l.featureId)) + 1);
    }
    // A thing with no room for its name is no fault: its number carries it.
    expect(warnings).toEqual([]);
    expect(keyFor(plan).numbers).toEqual(key.numbers);
  });
});
