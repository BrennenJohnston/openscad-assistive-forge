/**
 * The north cue and the two marks a reader steers by stay clear: lines and
 * areas stop short of the cue, a symbol in its way moves out, and no symbol
 * sits on the destination or You are here.
 *
 * @license GPL-3.0-or-later
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  NORTH_ARROW_MM,
  NORTH_CLEARANCE_MM,
  NORTH_LINE_MM,
  cutZones,
  keepClear,
  keptClearNote,
  northZones,
} from '../../src/js/tactile-map/keep-clear.js';
import { regionArea } from '../../src/js/ring-geometry.js';

const rectRing = (x0, y0, x1, y1) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

const point = (id, cls, at, extra = {}) => ({
  id,
  class: cls,
  kind: 'point',
  at,
  on: true,
  ...extra,
});

const OPTIONS = {
  symbolSizeMm: 10,
  gapMm: 3,
  bounds: { x0: 0, y0: 0, x1: 300, y1: 200 },
  channelAcrossMm: 13.1,
};

describe('the zones the north cue keeps', () => {
  it('match the arrow the model draws', () => {
    const scad = readFileSync(
      join('public', 'examples', 'tactile-map', 'tactile_map.scad'),
      'utf8'
    );
    const value = (name) =>
      Number(new RegExp(`^${name} = ([\\d.]+);`, 'm').exec(scad)[1]);
    expect(NORTH_ARROW_MM.edge).toBe(value('EDGE_CLEARANCE_MM'));
    expect(NORTH_ARROW_MM.letter).toBe(value('NORTH_LETTER_MM'));
    expect(NORTH_ARROW_MM.gap).toBe(value('NORTH_GAP_MM'));
    expect(NORTH_ARROW_MM.shaft).toBe(value('NORTH_SHAFT_L'));
    expect(NORTH_ARROW_MM.headWidth).toBe(value('NORTH_HEAD_W'));
    expect(NORTH_LINE_MM).toBe(value('NORTH_LINE_W'));
    // The column: 7 mm either side of its center, 9.525 mm in from the edge.
    expect(scad).toContain('cx = map_width_mm - EDGE_CLEARANCE_MM - 7;');
    expect(NORTH_ARROW_MM.width).toBe(14);
  });

  it('take the arrow with its clearance, out to the corner of the sheet', () => {
    const [zone] = northZones({ sheetW: 300, cue: 'Arrow with N' });
    const height = 16 + 3 + 5 / Math.tan((20 * Math.PI) / 180) + 30;
    expect(zone.x0).toBeCloseTo(300 - 9.525 - 14 - NORTH_CLEARANCE_MM, 6);
    expect(zone.x1).toBe(300);
    expect(zone.y0).toBe(0);
    expect(zone.y1).toBeCloseTo(9.525 + height + NORTH_CLEARANCE_MM, 6);
  });

  it('take the whole top edge for a north line, nothing with no cue, and a second place when the title has plates of its own', () => {
    const [line] = northZones({ sheetW: 300, cue: 'North line' });
    expect([line.x0, line.x1, line.y0]).toEqual([0, 300, 0]);
    expect(line.y1).toBeCloseTo(9.525 + 2 + NORTH_CLEARANCE_MM, 6);
    expect(northZones({ sheetW: 300, cue: 'None' })).toEqual([]);
    const both = northZones({
      sheetW: 300,
      cue: 'Arrow with N',
      plateTops: [0, 40],
    });
    expect(both).toHaveLength(2);
    expect(both[1].y0).toBe(40);
    expect(both[1].y1 - both[1].y0).toBeCloseTo(both[0].y1, 6);
  });
});

describe('keepClear', () => {
  const zone = { x0: 250, y0: 0, x1: 300, y1: 80 };

  it('leaves a map alone when nothing is in the way, and hands back the same features', () => {
    const features = [point('a', 'landmark', [100, 100])];
    const out = keepClear(features, { ...OPTIONS, zones: [zone] });
    expect(out.moved).toEqual([]);
    expect(out.features).toBe(features);
  });

  it('moves a symbol in the zone the shortest way out, all of it clear', () => {
    const out = keepClear([point('a', 'transit-stop', [290, 20])], {
      ...OPTIONS,
      zones: [zone],
    });
    const [moved] = out.features;
    // Left is 45 mm, down 65: left wins, and the symbol's edge clears the zone.
    expect(moved.at[1]).toBe(20);
    expect(moved.at[0] + 5).toBeLessThanOrEqual(250);
    expect(out.moved).toEqual([{ id: 'a', mm: expect.any(Number) }]);
    expect(out.moved[0].mm).toBeCloseTo(45, 6);
  });

  it('never moves a symbol off the sheet', () => {
    const narrow = { x0: 0, y0: 0, x1: 300, y1: 80 };
    const out = keepClear([point('a', 'landmark', [150, 20])], {
      ...OPTIONS,
      zones: [narrow],
    });
    expect(out.features[0].at).toEqual([150, 85]);
  });

  it('moves a symbol off the destination and You are here, with the gap, and leaves those two where they stand', () => {
    const features = [
      point('d', 'destination', [100, 100], { size: 4.9 }),
      point('h', 'you-are-here', [200, 100]),
      point('a', 'landmark', [101, 101]),
      point('b', 'furniture', [199, 102]),
    ];
    const out = keepClear(features, { ...OPTIONS, zones: [] });
    const at = Object.fromEntries(out.features.map((f) => [f.id, f.at]));
    expect(at.d).toEqual([100, 100]);
    expect(at.h).toEqual([200, 100]);
    const gapFrom = (a, b, sizeA, sizeB) =>
      Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) -
      (sizeA + sizeB) / 2;
    expect(gapFrom(at.a, at.d, 10, 4.9)).toBeGreaterThanOrEqual(3 - 1e-6);
    expect(gapFrom(at.b, at.h, 10, 10)).toBeGreaterThanOrEqual(3 - 1e-6);
  });

  it('moves a mark that stands in the north zone, since the arrow has nowhere else to be', () => {
    const out = keepClear([point('h', 'you-are-here', [295, 10])], {
      ...OPTIONS,
      zones: [zone],
    });
    expect(out.features[0].at[0] + 5).toBeLessThanOrEqual(250);
  });

  it('does not land a moved symbol on another symbol when a free way out exists', () => {
    const out = keepClear(
      [
        point('a', 'landmark', [255, 40]),
        // Standing just where the shortest way out would put it.
        point('b', 'landmark', [243, 40]),
      ],
      { ...OPTIONS, zones: [zone] }
    );
    const [a, b] = out.features;
    expect(b.at).toEqual([243, 40]);
    const gap =
      Math.max(Math.abs(a.at[0] - b.at[0]), Math.abs(a.at[1] - b.at[1])) - 10;
    expect(gap).toBeGreaterThanOrEqual(3 - 1e-6);
  });

  it('carries a label channel with the symbol it belongs to, and pushes a channel of its own out', () => {
    const channel = {
      id: 'label-a',
      class: 'channel',
      kind: 'channel',
      at: [270, 40],
      length: 30,
      vertical: false,
      on: true,
    };
    const out = keepClear([point('a', 'landmark', [255, 60]), channel], {
      ...OPTIONS,
      zones: [zone],
    });
    const moved = out.features.find((f) => f.id === 'label-a');
    expect(moved.at[0] + 15).toBeLessThanOrEqual(250);
  });

  it('leaves a shape that is switched off where it is', () => {
    const off = point('a', 'landmark', [290, 20], { on: false });
    const out = keepClear([off], { ...OPTIONS, zones: [zone] });
    expect(out.moved).toEqual([]);
  });
});

describe('keptClearNote', () => {
  it('says how many moved and how far, in one sentence, and nothing when none did', () => {
    expect(keptClearNote([])).toBe(null);
    expect(keptClearNote([{ id: 'a', mm: 6.04 }])).toBe(
      'One symbol moved 6 mm to keep the north arrow and the marks clear.'
    );
    expect(
      keptClearNote([
        { id: 'a', mm: 6 },
        { id: 'b', mm: 12.3 },
      ])
    ).toBe(
      '2 symbols moved up to 12.3 mm to keep the north arrow and the marks clear.'
    );
  });
});

describe('cutZones', () => {
  it('takes the zone out of every group, leaving the rest of the shape', () => {
    const rings = {
      level1: [rectRing(200, 0, 300, 100)],
      level2: [rectRing(0, 0, 10, 10)],
      channels: [rectRing(260, 10, 290, 20)],
    };
    const cut = cutZones(rings, [{ x0: 250, y0: 0, x1: 300, y1: 80 }]);
    // 100 x 100 less the 50 x 80 corner.
    expect(Math.abs(regionArea(cut.level1))).toBeCloseTo(10000 - 4000, 3);
    expect(Math.abs(regionArea(cut.level2))).toBeCloseTo(100, 3);
    expect(cut.channels).toEqual([]);
    expect(cutZones(rings, [])).toBe(rings);
  });
});
