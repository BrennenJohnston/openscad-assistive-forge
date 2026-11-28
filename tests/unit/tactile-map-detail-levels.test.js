/**
 * Detail levels: what a map shows, chosen as a whole tier from the
 * research (ISO 19028 4.2.1: only what the purpose needs; Holloway and
 * others 2019's tiers) instead of one feature at a time, with a switch per
 * group of features under each tier, and the count of different symbols
 * kept within what a reader can remember (Wabinski and others 2022: 10 to
 * 15).
 *
 * The Ferry Place fixture is the real tiles over 3600 Ferry Pl NE.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DETAIL_LEVELS,
  applyDetail,
  switchesFor,
  wantsPoint,
  SYMBOLS_WARN,
  SYMBOLS_MAX,
  NEAR_M,
} from '../../src/js/tactile-map/detail-levels.js';
import { draftPlan } from '../../src/js/tactile-map/plan-from-osm.js';
import { numberedThings } from '../../src/js/tactile-map/map-numbers.js';
import { pullTiles, TILE_URL } from '../../src/js/tactile-map/osm-tiles.js';
import { scaleChoice, groundBox } from '../../src/js/tactile-map/scales.js';

const FERRY = { lat: 47.6481285, lon: -122.3086726 };
const tiles = (x) =>
  readFileSync(`tests/fixtures/tactile-map/sourdough-15-${x}-11438.mvt`);
const TILE = { 5250: tiles(5250), 5251: tiles(5251) };
const fetch = async (url) => {
  const x = Object.keys(TILE).find(
    (k) =>
      url === TILE_URL.replace('{z}', 15).replace('{x}', k).replace('{y}', 11438)
  );
  const bytes = x ? TILE[x] : new Uint8Array(0);
  return {
    ok: true,
    status: x ? 200 : 204,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
};
const SIZE = { w: 480, h: 360 };

async function ferry(key = 'block') {
  const choice = scaleChoice(key);
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
    place: { name: 'Ferry Place' },
  });
  return { plan, scale };
}

const on = (features) => features.filter((f) => f.on);
const onOf = (features, cls) => on(features).filter((f) => f.class === cls);

describe('the detail levels', () => {
  it('offers four tiers for a place map and for a route map, and none for a drawing', () => {
    expect(DETAIL_LEVELS.place.map((l) => l.name)).toEqual([
      'The way and its doors',
      'Named places',
      'Every building',
      'Everything in the data',
    ]);
    expect(DETAIL_LEVELS.route.map((l) => l.name)).toEqual([
      'The route and its crossings',
      'Named places along it',
      'Every building along it',
      'Everything',
    ]);
    expect(DETAIL_LEVELS.drawing).toEqual([]);
    for (const level of [...DETAIL_LEVELS.place, ...DETAIL_LEVELS.route]) {
      expect(level.sentence).toMatch(/\.$/);
    }
  });

  it("keeps a route's buildings to its two ends until Every building along it, as each sentence says", () => {
    expect(
      DETAIL_LEVELS.route.map((l) => [
        l.switches.buildings,
        l.switches.landmarks,
        l.switches.transit,
      ])
    ).toEqual([
      ['none', 'none', 'off'],
      ['none', 'named', 'on'],
      ['along', 'named', 'on'],
      ['all', 'all', 'on'],
    ]);
  });

  it('shows more at each tier at 3600 Ferry Pl NE, the first only the way, the address door and You are here', async () => {
    const { plan, scale } = await ferry();
    const counts = DETAIL_LEVELS.place.map(
      (level) =>
        on(
          applyDetail(plan.features, {
            type: 'place',
            switches: switchesFor('place', level.key),
            scale,
            size: plan.size,
            mmPerM: plan.meta.geo.mmPerM,
          }).features
        ).length
    );
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]).toBeGreaterThan(counts[i - 1]);
    }
    expect(counts[0]).toBeLessThan(60);
    // Everything but the off You are here, which only the reader places.
    expect(counts[3]).toBe(plan.features.length - 1);
    const first = applyDetail(plan.features, {
      type: 'place',
      switches: switchesFor('place', 'way'),
      scale,
      size: plan.size,
      mmPerM: plan.meta.geo.mmPerM,
    }).features;
    expect(onOf(first, 'landmark')).toEqual([]);
    expect(onOf(first, 'area')).toEqual([]);
    expect(onOf(first, 'furniture')).toEqual([]);
    expect(onOf(first, 'entrance').length).toBeLessThanOrEqual(1);
    expect(onOf(first, 'destination')).toHaveLength(1);
    expect(onOf(first, 'you-are-here')).toHaveLength(0);
    const named = applyDetail(plan.features, {
      type: 'place',
      switches: switchesFor('place', 'named'),
      scale,
      size: plan.size,
      mmPerM: plan.meta.geo.mmPerM,
    }).features;
    expect(onOf(named, 'landmark').every((f) => f.name && f.public)).toBe(
      true
    );
    // A cafe is for Everything in the data, not for the named places.
    const cafe = (features) =>
      onOf(features, 'landmark').some((f) => f.name === 'Plaza Cafe');
    expect(cafe(named)).toBe(false);
    const everything = applyDetail(plan.features, {
      type: 'place',
      switches: switchesFor('place', 'everything'),
      scale,
      size: plan.size,
      mmPerM: plan.meta.geo.mmPerM,
    }).features;
    expect(cafe(everything)).toBe(true);
  });

  it('leaves You are here as the reader set it at every tier, Everything included: off until placed, on once placed', async () => {
    const { plan, scale } = await ferry();
    const here = plan.features.find((f) => f.class === 'you-are-here');
    expect(here.on).toBe(false);
    const at = (features, key) =>
      applyDetail(features, {
        type: 'place',
        switches: switchesFor('place', key),
        scale,
        size: plan.size,
        mmPerM: plan.meta.geo.mmPerM,
      }).features;
    for (const level of DETAIL_LEVELS.place) {
      expect(onOf(at(plan.features, level.key), 'you-are-here')).toHaveLength(
        0
      );
    }
    const placed = plan.features.map((f) =>
      f.class === 'you-are-here' ? { ...f, on: true } : f
    );
    expect(onOf(at(placed, 'way'), 'you-are-here')).toHaveLength(1);
  });

  it('leaves the destination as the draft set it at every tier, Everything included: on at the address, off where the map data lacked the number typed', async () => {
    const { plan, scale } = await ferry();
    const at = (features, key) =>
      applyDetail(features, {
        type: 'place',
        switches: switchesFor('place', key),
        scale,
        size: plan.size,
        mmPerM: plan.meta.geo.mmPerM,
      }).features;
    const waiting = plan.features.map((f) =>
      f.class === 'destination' ? { ...f, on: false } : f
    );
    for (const level of DETAIL_LEVELS.place) {
      expect(onOf(at(plan.features, level.key), 'destination')).toHaveLength(1);
      expect(onOf(at(waiting, level.key), 'destination')).toHaveLength(0);
    }
  });

  it('turns a whole group on or off with one switch: every building, every bench', async () => {
    const { plan, scale } = await ferry();
    const base = switchesFor('place', 'named');
    const run = (switches) =>
      applyDetail(plan.features, {
        type: 'place',
        switches,
        scale,
        size: plan.size,
        mmPerM: plan.meta.geo.mmPerM,
      }).features;
    const buildings = plan.features.filter((f) => f.what === 'Building');
    expect(buildings.length).toBeGreaterThan(30);
    expect(
      onOf(run({ ...base, buildings: 'all' }), 'area').filter(
        (f) => f.what === 'Building'
      ).length
    ).toBe(buildings.length);
    expect(onOf(run({ ...base, buildings: 'none' }), 'area')).toEqual([]);
    const furniture = plan.features.filter((f) => f.class === 'furniture');
    expect(furniture.length).toBeGreaterThan(5);
    expect(onOf(run({ ...base, furniture: 'on' }), 'furniture').length).toBe(
      furniture.length
    );
    // All points brings in the unnamed places too (toilets, drinking water).
    const all = onOf(run({ ...base, landmarks: 'all' }), 'landmark');
    expect(all.some((f) => !f.name)).toBe(true);
  });

  it('keeps to the scale: over a few blocks no building and only transit stops among the points', async () => {
    const { plan, scale } = await ferry('blocks');
    const features = applyDetail(plan.features, {
      type: 'place',
      switches: switchesFor('place', 'buildings'),
      scale,
      size: plan.size,
      mmPerM: plan.meta.geo.mmPerM,
    }).features;
    expect(onOf(features, 'area')).toEqual([]);
    const points = on(features).filter(
      (f) =>
        f.kind === 'point' &&
        f.class !== 'you-are-here' &&
        f.class !== 'destination' &&
        !(f.class === 'entrance' && f.address)
    );
    expect(points.every((f) => f.class === 'transit-stop')).toBe(true);
  });

  it('warns past 10 different symbols and refuses past 15, naming the switch to lower', () => {
    expect([SYMBOLS_WARN, SYMBOLS_MAX]).toEqual([10, 15]);
    const classes = [
      'stairs',
      'elevator-up',
      'elevator-down',
      'entrance',
      'landmark',
      'transit-stop',
      'furniture',
      'curb-ramp',
      'raised-curb',
      'you-are-here',
      'walkway',
      'crossing',
      'track',
      'wall',
      'route',
      'traffic-island',
    ];
    const features = classes.map((cls, i) => ({
      id: `f${i}`,
      class: cls,
      kind: ['walkway', 'crossing', 'track', 'wall', 'route', 'traffic-island'].includes(cls)
        ? 'line'
        : 'point',
      at: [10 + i * 20, 10],
      points: [
        [10 + i * 20, 10],
        [20 + i * 20, 10],
      ],
      on: true,
    }));
    const everything = applyDetail(features, {
      type: 'place',
      switches: switchesFor('place', 'everything'),
      scale: null,
      size: { w: 400, h: 100 },
      mmPerM: 1,
    });
    expect(everything.symbols).toBe(16);
    expect(everything.refusal).toBe(
      '16 different symbols: more than 15 cannot be told apart. Turn Street furniture off or choose fewer landmarks.'
    );
    const twelve = applyDetail(features.slice(0, 12), {
      type: 'place',
      switches: switchesFor('place', 'everything'),
      scale: null,
      size: { w: 400, h: 100 },
      mmPerM: 1,
    });
    expect(twelve.refusal).toBeNull();
    expect(twelve.warning).toBe(
      '12 different symbols: more than 10 is hard to remember.'
    );
  });

  it('numbers the named public places at Named places, and shops, food and offices only at All points or Everything', () => {
    const library = { class: 'landmark', name: 'Library', public: true };
    const cafe = { class: 'landmark', name: 'Cafe' };
    const unnamed = { class: 'landmark', public: true };
    const at = (key) => switchesFor('place', key);
    expect(
      [library, cafe, unnamed].map((f) => wantsPoint(f, at('named')))
    ).toEqual([true, false, false]);
    expect(
      [library, cafe, unnamed].map((f) => wantsPoint(f, at('buildings')))
    ).toEqual([true, false, false]);
    expect(
      [library, cafe, unnamed].map((f) => wantsPoint(f, at('everything')))
    ).toEqual([true, true, true]);
    const allPoints = { ...at('named'), landmarks: 'all' };
    expect(
      [library, cafe, unnamed].map((f) => wantsPoint(f, allPoints))
    ).toEqual([true, true, true]);
    const route = switchesFor('route', 'named');
    expect([library, cafe].map((f) => wantsPoint(f, route))).toEqual([
      true,
      false,
    ]);
  });

  it("keeps a stop's duplicate off under every tier, Everything in the data too", () => {
    const features = [
      { id: 's', class: 'transit-stop', kind: 'point', at: [10, 10], on: true },
      {
        id: 'd',
        class: 'transit-stop',
        kind: 'point',
        at: [10, 10],
        on: false,
        duplicate: true,
      },
    ];
    for (const level of DETAIL_LEVELS.place) {
      const { features: out } = applyDetail(features, {
        type: 'place',
        switches: switchesFor('place', level.key),
        scale: null,
        size: { w: 100, h: 100 },
        mmPerM: 1,
      });
      expect(out.find((f) => f.id === 'd').on).toBe(false);
      expect(wantsPoint(features[1], switchesFor('place', level.key))).toBe(
        false
      );
    }
  });

  // The way's sidewalk along y 50 and another along y 150, in mm.
  const onAt = (features, key, mmPerM = 1) =>
    applyDetail(features, {
      type: 'place',
      switches: switchesFor('place', key),
      scale: null,
      size: { w: 200, h: 200 },
      mmPerM,
    })
      .features.filter((f) => f.on)
      .map((f) => f.id);

  it('numbers a named place or a stop at Named places only within 30 m of the way it draws; Every building and Everything keep them all', () => {
    const line = (y) => [
      [0, y],
      [200, y],
    ];
    const features = [
      {
        id: 'way',
        class: 'walkway',
        kind: 'line',
        points: line(50),
        way: true,
      },
      { id: 'side', class: 'walkway', kind: 'line', points: line(150) },
      {
        id: 'library',
        class: 'landmark',
        kind: 'point',
        at: [100, 50 + NEAR_M],
        name: 'Library',
        public: true,
      },
      {
        id: 'clinic',
        class: 'landmark',
        kind: 'point',
        at: [100, 140],
        name: 'Clinic',
        public: true,
      },
      { id: 'stop', class: 'transit-stop', kind: 'point', at: [20, 40] },
      { id: 'far-stop', class: 'transit-stop', kind: 'point', at: [20, 110] },
    ];
    expect(onAt(features, 'named')).toEqual(['way', 'library', 'stop']);
    // A level drawing every sidewalk keeps every place, as it always did.
    expect(onAt(features, 'buildings')).toEqual(features.map((f) => f.id));
    expect(onAt(features, 'everything')).toEqual(features.map((f) => f.id));
    // The reach is in meters: at half a millimeter a meter the library's
    // 30 mm are 60 m, the stop's 10 mm are 20 m.
    expect(onAt(features, 'named', 0.5)).toEqual(['way', 'stop']);
  });

  it("numbers, at Named places, only the buildings along the way that hold a public place, tagged as one or with a public place inside, on or off, and the address's own building; Every building numbers every named one", () => {
    const square = (x0, y0, x1, y1) => [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ];
    const building = (id, ring, extra = {}) => ({
      id,
      class: 'area',
      kind: 'area',
      what: 'Building',
      ring,
      ...extra,
    });
    const features = [
      {
        id: 'way',
        class: 'walkway',
        kind: 'line',
        points: [
          [0, 50],
          [200, 50],
        ],
        way: true,
      },
      building('hotel', square(10, 52, 40, 80), { name: 'Hotel' }),
      building('library', square(60, 52, 90, 80), {
        name: 'Library',
        public: true,
      }),
      // A long hall: its clinic stands beyond the way's 30 m, so the level
      // leaves the clinic off, and the hall still holds it.
      building('hall', square(110, 52, 140, 150), { name: 'Hall' }),
      {
        id: 'clinic',
        class: 'landmark',
        kind: 'point',
        at: [125, 140],
        name: 'Clinic',
        public: true,
      },
      building('shed', square(160, 52, 190, 80)),
      // The address's own building, numbered 1, is the map's subject.
      building('home', square(10, 20, 40, 48), { name: 'Home' }),
      {
        id: 'destination',
        class: 'destination',
        kind: 'point',
        at: [25, 30],
        name: '1 Home Way',
        on: true,
      },
    ];
    const at = (key) =>
      applyDetail(features, {
        switches: switchesFor('place', key),
        scale: null,
        mmPerM: 1,
      }).features;
    const named = at('named');
    const byId = (list, id) => list.find((f) => f.id === id);
    expect(byId(named, 'clinic').on).toBe(false);
    for (const id of ['hotel', 'library', 'hall']) {
      expect(byId(named, id).on, id).toBe(true);
    }
    expect(byId(named, 'hotel').unnumbered).toBe(true);
    expect(byId(named, 'home').unnumbered).toBeUndefined();
    expect(byId(named, 'library').unnumbered).toBeUndefined();
    expect(byId(named, 'hall').unnumbered).toBeUndefined();
    // An unnamed building has no number to lose.
    expect(byId(named, 'shed').unnumbered).toBeUndefined();
    expect(numberedThings({ features: named }).map((f) => f.id)).toEqual([
      'home',
      'library',
      'hall',
    ]);
    // Buildings set to Named ones under Change a group numbers them too.
    const changed = applyDetail(features, {
      switches: { ...switchesFor('place', 'named'), buildings: 'named' },
      scale: null,
      mmPerM: 1,
    }).features;
    expect(byId(changed, 'hotel').unnumbered).toBeUndefined();
    // Every building numbers every named one, the mark gone.
    const every = at('buildings');
    expect(byId(every, 'hotel').unnumbered).toBeUndefined();
    expect(
      numberedThings({ features: every })
        .map((f) => f.id)
        .sort()
    ).toEqual(['clinic', 'hall', 'home', 'hotel', 'library']);
  });

  it('draws a street as one line at the first two levels only where it is part of the way, and every street from Every building up', () => {
    const features = [
      {
        id: 'beside',
        class: 'curb',
        kind: 'line',
        points: [
          [0, 50],
          [200, 50],
        ],
        street: true,
        way: true,
      },
      {
        id: 'across-town',
        class: 'curb',
        kind: 'line',
        points: [
          [0, 150],
          [200, 150],
        ],
        street: true,
      },
    ];
    expect(onAt(features, 'way')).toEqual(['beside']);
    expect(onAt(features, 'named')).toEqual(['beside']);
    expect(onAt(features, 'buildings')).toEqual(['beside', 'across-town']);
    expect(onAt(features, 'everything')).toEqual(['beside', 'across-town']);
  });
});
