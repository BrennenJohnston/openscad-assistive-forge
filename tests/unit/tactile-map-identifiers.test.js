/**
 * Numbers on the map: each named thing's number as a braille wedge, a raised
 * numeral or both, on the thing when it fits there and covers at most half
 * of it, else in the margin band at the end of a lead line, else in the key
 * only. The wedge's figures are the model's.
 *
 * The Ferry Place fixture is the real tiles over 3600 Ferry Pl NE.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  anchorToward,
  BAND_EDGE_MM,
  bandPlan,
  identifierBox,
  KEY_ONLY_SENTENCE,
  LABEL_STYLES,
  DEFAULT_LABEL_STYLE,
  numeralRows,
  packAlong,
  wedgeCells,
  wedgeDots,
  wedgeRows,
  wedgeSize,
} from '../../src/js/tactile-map/identifiers.js';
import {
  labelPlan,
  segmentsCross,
} from '../../src/js/tactile-map/map-labels.js';
import { sheetOf, SHEET_CLEARANCE_MM } from '../../src/js/tactile-map/sheet.js';
import { emptyPlan } from '../../src/js/tactile-map/plan.js';
import {
  applyDetail,
  switchesFor,
} from '../../src/js/tactile-map/detail-levels.js';
import { draftPlan } from '../../src/js/tactile-map/plan-from-osm.js';
import { pullTiles, TILE_URL } from '../../src/js/tactile-map/osm-tiles.js';
import { scaleChoice, groundBox } from '../../src/js/tactile-map/scales.js';

const pt = (id, at, name) => ({
  id,
  class: 'landmark',
  kind: 'point',
  at,
  on: true,
  name,
  what: 'Cafe',
});
const area = (id, x0, y0, x1, y1, name) => ({
  id,
  class: 'building',
  kind: 'area',
  ring: [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ],
  on: true,
  name,
});

/** A name too long for tape in any of these areas: the number stands alone. */
const LONG = 'Hall of a name far too long to go on any tape in this test';

/**
 * Nine named points along the top come first in reading order, so the two
 * buildings below take 10 and 11: two digits, a 22 mm wedge.
 */
function twoBuildings() {
  const plan = emptyPlan(200, 150);
  for (let i = 1; i <= 9; i += 1) {
    plan.features.push(pt(`p${i}`, [i * 20, 4], `P${i}`));
  }
  plan.features.push(
    area('wide', 20, 60, 80, 100, LONG),
    area('small', 90, 120, 110, 140, LONG)
  );
  return plan;
}

describe('the wedge and the numeral, measured as the model builds them', () => {
  it("gives the model's figures at every foot and angle on the owner's sheet", () => {
    // From the sheet's echo (wedge-figures): width, depth, height.
    expect(wedgeSize(1, { footMm: 2, angleDeg: 75 })).toEqual({
      w: 15.5,
      depth: 10.073,
      h: 10.142,
    });
    expect(wedgeSize(12, { footMm: 6, angleDeg: 60 })).toEqual({
      w: 22,
      depth: 16,
      h: 12.557,
    });
    expect(wedgeSize(99, { footMm: 4, angleDeg: 90 })).toEqual({
      w: 22,
      depth: 8.717,
      h: 12.5,
    });
  });

  it('writes the number sign, then a cell a digit', () => {
    expect(wedgeCells(1)).toEqual([[3, 4, 5, 6], [1]]);
    // 4 is d, 0 is j and 9 is i, as in the model's table.
    expect(wedgeCells(40)).toEqual([
      [3, 4, 5, 6],
      [1, 4, 5],
      [2, 4, 5],
    ]);
    expect(wedgeCells(9)).toEqual([
      [3, 4, 5, 6],
      [2, 4],
    ]);
    expect(wedgeDots({ x: 0, y: 10, depth: 10 }, 1)).toHaveLength(5);
  });

  it('lays out Both as the numeral, 3 mm, then the wedge, and Braille past 99 as nothing', () => {
    const both = identifierBox(12, 'both', { footMm: 2, angleDeg: 75 });
    expect(both.parts.map((p) => p.kind)).toEqual(['numeral', 'wedge']);
    expect(both.parts[1].x0).toBeCloseTo(both.parts[0].w + 3, 6);
    expect(both.w).toBeCloseTo(both.parts[0].w + 3 + 22, 6);
    expect(identifierBox(120, 'braille')).toBeNull();
    expect(identifierBox(120, 'both').parts.map((p) => p.kind)).toEqual([
      'numeral',
    ]);
  });

  it('offers the three choices with Both as the start', () => {
    expect(LABEL_STYLES.map((s) => s.name)).toEqual([
      'Braille (wedges and tape)',
      'Raised letters',
      'Both',
    ]);
    expect(DEFAULT_LABEL_STYLE).toBe('both');
  });
});

describe('on the thing', () => {
  it("stands a 22 x 10 wedge at a 60 x 40 building's centroid, 9 percent of it", () => {
    const { marks, pending } = labelPlan(twoBuildings(), {
      labels: 'braille',
    });
    const wide = marks.find((m) => m.featureId === 'wide');
    expect(wide.number).toBe(10);
    expect(wide.where).toBe('thing');
    expect(wide.wedge.w).toBe(22);
    expect(wide.wedge.depth).toBeCloseTo(10.073, 3);
    const box = wide.box;
    expect((box.x0 + box.x1) / 2).toBeCloseTo(50, 6);
    expect((box.y0 + box.y1) / 2).toBeCloseTo(80, 6);
    expect((22 * wide.wedge.depth) / (60 * 40)).toBeLessThan(0.1);
    expect(pending.map((p) => p.f.id)).toContain('small');
  });

  it('keeps a name that fits on tape under its number, 3 mm below, as one piece', () => {
    const plan = emptyPlan(200, 150);
    plan.features.push(area('hall', 40, 30, 160, 120, 'Hall'));
    const { marks, plan: out } = labelPlan(plan, { labels: 'both' });
    const mark = marks.find((m) => m.featureId === 'hall');
    const channel = out.features.find((f) => f.id === 'label-hall');
    expect(mark.numeral.capMm).toBe(10);
    expect(mark.wedge).not.toBeNull();
    const channelTop = channel.at[1] - 13.1 / 2;
    expect(channelTop - mark.box.y1).toBeCloseTo(3, 6);
    expect(channel.at[0]).toBeCloseTo((mark.box.x0 + mark.box.x1) / 2, 6);
    // A numeral inside a building stands on the building's level.
    expect(mark.numeral.standsOn).toBeGreaterThan(0);
  });

  it('puts no tape on the map with Raised letters, and numbers nothing without the switch', () => {
    const plan = emptyPlan(200, 150);
    plan.features.push(area('hall', 40, 30, 160, 120, 'Hall'));
    const print = labelPlan(plan, { labels: 'print' });
    expect(print.labels).toEqual([]);
    expect(print.marks[0].wedge).toBeNull();
    expect(print.marks[0].numeral).not.toBeNull();
    const none = labelPlan(plan);
    expect(none.marks).toEqual([]);
    expect(none.pending).toEqual([]);
    expect(none.labels).toHaveLength(1);
  });
});

describe('in the band', () => {
  const FACE = { x0: 0, y0: 0, x1: 200, y1: 150 };

  it('sends a 20 x 20 building (55 percent) to the nearest edge, its lead from the building to the wedge', () => {
    const plan = twoBuildings();
    const { pending } = labelPlan(plan, { labels: 'braille' });
    const small = pending.filter((p) => p.f.id === 'small');
    expect(small[0].number).toBe(11);
    expect((22 * 10.073) / (20 * 20)).toBeGreaterThan(0.5);
    const band = bandPlan({ pending: small, face: FACE, style: 'braille' });
    expect(band.keyOnly).toEqual([]);
    const [mark] = band.marks;
    expect(mark.where).toBe('bottom');
    // From the middle of the building's bottom edge, straight down to the
    // wedge's back, 3 mm below the face, run 0.5 mm into it.
    expect(mark.lead[0]).toEqual([100, 140]);
    expect(mark.lead[1][0]).toBeCloseTo(100, 6);
    expect(mark.box.y0).toBeCloseTo(153, 6);
    expect(mark.lead[1][1]).toBeCloseTo(153.5, 6);
    // 3 mm, the wedge's depth, 9.525 mm to the sheet's edge, in whole mm.
    expect(band.sides.bottom).toBe(23);
    expect(band.rings.length).toBeGreaterThan(0);
  });

  it('gives three things on one edge slots in their order, and no two leads cross', () => {
    const things = [48, 50, 52].map((x, i) => ({
      f: area(`t${i}`, x - 1, 140, x + 1, 142, 'T'),
      number: i + 1,
      name: `T${i}`,
    }));
    const band = bandPlan({ pending: things, face: FACE, style: 'both' });
    expect(band.marks.every((m) => m.where === 'bottom')).toBe(true);
    const xs = band.marks.map((m) => m.box.x0);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    for (let i = 1; i < band.marks.length; i += 1) {
      expect(band.marks[i].box.x0 - band.marks[i - 1].box.x1).toBeGreaterThan(
        2.999
      );
    }
    for (let i = 0; i < band.leads.length; i += 1) {
      for (let j = i + 1; j < band.leads.length; j += 1) {
        const [a, b] = band.leads[i];
        const [c, d] = band.leads[j];
        expect(segmentsCross(a, b, c, d)).toBe(false);
      }
    }
  });

  it('changes the order along an edge until no two leads cross, when packing pushes a far thing past a near one', () => {
    // Three near the left edge and one far from it: in the order of their
    // places the far one's lead would cross the last near one's.
    const near = (id, y, number) => ({
      f: area(id, 9, y - 1, 11, y + 1, 'T'),
      number,
      name: id,
    });
    const band = bandPlan({
      pending: [
        near('s1', 60, 1),
        near('s2', 61, 2),
        { f: area('far', 99, 61, 101, 63, 'T'), number: 3, name: 'far' },
        near('q', 64, 4),
      ],
      face: { x0: 0, y0: 0, x1: 400, y1: 300 },
      style: 'print',
    });
    expect(band.marks.every((m) => m.where === 'left')).toBe(true);
    for (let i = 0; i < band.leads.length; i += 1) {
      for (let j = i + 1; j < band.leads.length; j += 1) {
        const [a, b] = band.leads[i];
        const [c, d] = band.leads[j];
        expect(segmentsCross(a, b, c, d), `leads ${i} and ${j}`).toBe(false);
      }
    }
  });

  it('sends a number to the next edge when its lead would run over a number on a thing', () => {
    const onThing = {
      featureId: 'other',
      number: 1,
      box: { x0: 90, y0: 136, x1: 110, y1: 146 },
    };
    const band = bandPlan({
      pending: [{ f: area('t', 98, 128, 102, 132, 'T'), number: 2, name: 'T' }],
      face: FACE,
      style: 'braille',
      marks: [onThing],
    });
    const [mark] = band.marks;
    expect(mark.where).not.toBe('bottom');
    const [a, b] = mark.lead;
    const box = onThing.box;
    const corners = [
      [box.x0, box.y0],
      [box.x1, box.y0],
      [box.x1, box.y1],
      [box.x0, box.y1],
    ];
    corners.forEach((c, i) => {
      expect(segmentsCross(a, b, c, corners[(i + 1) % 4])).toBe(false);
    });
  });

  it("judges a lead where its number can stand, below the cue's clearance, not at its ideal place", () => {
    const onThing = {
      featureId: 'other',
      number: 1,
      box: { x0: 170, y0: 40, x1: 180, y1: 55 },
    };
    const band = bandPlan({
      pending: [{ f: area('t', 149, 9, 151, 11, 'T'), number: 2, name: 'T' }],
      face: FACE,
      style: 'braille',
      zones: [{ x0: 170, y0: -40, x1: 230, y1: 80 }],
      marks: [onThing],
    });
    const [mark] = band.marks;
    expect(mark.where).not.toBe('right');
    const [a, b] = mark.lead;
    const box = onThing.box;
    const corners = [
      [box.x0, box.y0],
      [box.x1, box.y0],
      [box.x1, box.y1],
      [box.x0, box.y1],
    ];
    corners.forEach((c, i) => {
      expect(segmentsCross(a, b, c, corners[(i + 1) % 4])).toBe(false);
    });
  });

  it('stops a lead 3 mm short of a numeral', () => {
    const band = bandPlan({
      pending: [{ f: area('t', 99, 140, 101, 142, 'T'), number: 7, name: 'T' }],
      face: FACE,
      style: 'print',
    });
    const [mark] = band.marks;
    expect(mark.numeral.capMm).toBe(16);
    expect(mark.box.y0 - mark.lead[1][1]).toBeCloseTo(3, 1);
  });

  it('puts a number with no room on any edge in the key, and says so', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      f: area(`t${i}`, 99, 74, 101, 76, 'T'),
      number: i + 1,
      name: `Thing ${i + 1}`,
    }));
    const band = bandPlan({
      pending: many,
      face: { x0: 0, y0: 0, x1: 100, y1: 75 },
      style: 'both',
    });
    expect(band.keyOnly.length).toBeGreaterThan(0);
    expect(band.marks.length + band.keyOnly.length).toBe(40);
    const first = band.keyOnly[0];
    expect(KEY_ONLY_SENTENCE(first.name, first.number)).toBe(
      `No room on the map or in its margin for ${first.name}'s number ${first.number}; it is in the key.`
    );
  });

  it('starts a side band below what the north cue keeps clear', () => {
    const band = bandPlan({
      pending: [{ f: area('t', 196, 2, 198, 4, 'T'), number: 1, name: 'T' }],
      face: FACE,
      style: 'braille',
      zones: [{ x0: 170, y0: -40, x1: 230, y1: 40 }],
    });
    const [mark] = band.marks;
    expect(mark.where).toBe('right');
    expect(mark.box.y0).toBeGreaterThanOrEqual(40);
  });

  it('packs along an edge and refuses what does not fit', () => {
    expect(
      packAlong(
        [
          { ideal: 10, size: 10 },
          { ideal: 10, size: 10 },
        ],
        0,
        100
      )
    ).toEqual([5, 18]);
    expect(packAlong([{ ideal: 95, size: 10 }], 0, 100)).toEqual([90]);
    expect(
      packAlong(
        [
          { ideal: 5, size: 60 },
          { ideal: 5, size: 60 },
        ],
        0,
        100
      )
    ).toBeNull();
  });

  it("leaves a lead from a side facing the edge at that side's middle", () => {
    const ring = [
      [10, 10],
      [30, 10],
      [30, 20],
      [10, 20],
    ];
    expect(anchorToward(ring, 'bottom')).toEqual([20, 20]);
    expect(anchorToward(ring, 'left')).toEqual([10, 15]);
    expect(anchorToward(ring, 'right')).toEqual([30, 15]);
  });
});

describe('the sheet and the model rows', () => {
  it("keeps the band's edge clearance the sheet's", () => {
    expect(BAND_EDGE_MM).toBe(SHEET_CLEARANCE_MM);
  });

  it('widens a side for the numbers in its band, never under the margin', () => {
    const sheet = sheetOf({
      face: { w: 200, h: 150 },
      marginMm: 10,
      placement: 'none',
      bandsMm: { bottom: 23, left: 4 },
    });
    expect(sheet.band).toEqual({ left: 10, right: 10, top: 10, bottom: 23 });
    expect(sheet.w).toBe(220);
    expect(sheet.h).toBe(183);
    expect(sheet.faceAt).toEqual([10, 10]);
  });

  it("writes a wedge row on every plate it reaches, the front foot's middle y up in tenths", () => {
    const marks = [
      { number: 4, wedge: { x: 100, y: 50, w: 15.5, depth: 10 }, box: {} },
    ];
    expect(wedgeRows(marks, { x: 0, y: 0, w: 200, h: 100 })).toBe('1000:500:4');
    // Across a seam at x = 95: both plates carry it, each in its own frame.
    expect(wedgeRows(marks, { x: 0, y: 0, w: 95, h: 100 })).toBe('1000:500:4');
    expect(wedgeRows(marks, { x: 95, y: 0, w: 95, h: 100 })).toBe('50:500:4');
    expect(wedgeRows(marks, { x: 0, y: 60, w: 200, h: 100 })).toBe('');
  });

  it('writes a numeral as a centered row on the level under it', () => {
    const rows = numeralRows(
      [{ number: 12, numeral: { x: 40, y: 90, capMm: 10, standsOn: 3 } }],
      100,
      (level) => level * 0.6
    );
    expect(rows).toEqual([{ x: 40, y: 10, h: 10, z: 1.8, text: '#12' }]);
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

  it('gives every numbered thing one place: on it, in the band, or in the key', async () => {
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
    const p = { ...plan, features: applied.features };
    for (const style of ['braille', 'print', 'both']) {
      const labeled = labelPlan(p, { labels: style });
      const band = bandPlan({
        pending: labeled.pending,
        face: { x0: 0, y0: 0, x1: SIZE.w, y1: SIZE.h },
        style,
      });
      const numbered = labeled.key.numbers.length;
      expect(numbered).toBeGreaterThan(20);
      expect(
        labeled.marks.length + band.marks.length + band.keyOnly.length
      ).toBe(numbered);
      const ids = new Set([
        ...labeled.marks.map((m) => m.featureId),
        ...band.marks.map((m) => m.featureId),
        ...band.keyOnly.map((k) => k.featureId),
      ]);
      expect(ids.size).toBe(numbered);
      expect(labeled.marks.length).toBeGreaterThan(0);
    }
  });
});
