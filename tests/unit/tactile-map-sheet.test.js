/**
 * The sheet: the map face inside a blank margin band, with the title on
 * its own band above the face, wrapped to the face's width at the title's
 * capital height, or inside the face as before, or left out.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import {
  MARGIN_MM,
  ORIENTATIONS,
  TITLE_PLACEMENTS,
  plateRows,
  rowsText,
  sheetOf,
  shiftRings,
  titleBandOf,
  titleRows,
  trimFace,
} from '../../src/js/tactile-map/sheet.js';

const FACE = { w: 480, h: 360 };

describe('the sheet', () => {
  it('puts a 10 mm band around a 480 x 360 face and a one-line 16 mm title on its own band above: 500 x 421, the face at 10, 51', () => {
    const s = sheetOf({ face: FACE, marginMm: 10, title: 'Ferry Place' });
    expect(s.w).toBe(500);
    expect(s.h).toBe(421);
    expect(s.band).toEqual({ left: 10, right: 10, top: 10, bottom: 10 });
    // 16 x 1.35 for the line, 9.525 clear above and below: 40.65, rounded
    // up to the millimeter, as the model's sizes are whole.
    expect(s.titleBand.h).toBe(41);
    expect(s.titleBand.y).toBe(10);
    expect(s.titleBand.lines).toEqual(['FERRY PLACE']);
    expect(s.faceAt[0]).toBe(10);
    expect(s.faceAt[1]).toBe(51);
    expect(s.face).toEqual(FACE);
    expect(s.placement).toBe('band');
  });

  it('wraps a long title to the face width in lines at the sign pitch, each line 21.6 mm before the band rounds up', () => {
    const one = titleBandOf('Ferry Place', 480, 16);
    expect(one.lines).toEqual(['FERRY PLACE']);
    expect(one.h).toBe(41);
    const long = titleBandOf(
      'University of Washington Center on Human Development and Disability',
      480,
      16
    );
    expect(long.lines.length).toBeGreaterThan(1);
    expect(long.lines.join(' ')).toBe(
      'UNIVERSITY OF WASHINGTON CENTER ON HUMAN DEVELOPMENT AND DISABILITY'
    );
    expect(long.h).toBe(Math.ceil(long.lines.length * 21.6 + 19.05));
    // A narrower face wraps sooner: 21 capitals of 16 mm run past 200 mm.
    expect(titleBandOf('Ferry Place Northeast', 200, 16).lines).toEqual([
      'FERRY PLACE',
      'NORTHEAST',
    ]);
    expect(titleBandOf('', 480, 16)).toBeNull();
  });

  it('has no title band inside the map or without a raised title, and the face then sits at the margin', () => {
    for (const placement of ['inside', 'none']) {
      const s = sheetOf({ face: FACE, title: 'Ferry Place', placement });
      expect(s.titleBand).toBeNull();
      expect([s.w, s.h]).toEqual([500, 380]);
      expect(s.faceAt).toEqual([10, 10]);
    }
    const untitled = sheetOf({ face: FACE, title: '' });
    expect(untitled.titleBand).toBeNull();
    expect(untitled.h).toBe(380);
    const wide = sheetOf({ face: FACE, marginMm: 40, title: '' });
    expect([wide.w, wide.h, wide.faceAt]).toEqual([560, 440, [40, 40]]);
  });

  it('offers the margin 10 to 40 mm from 10, three placements with the band first, and two orientations with landscape first', () => {
    expect(MARGIN_MM).toEqual({ start: 10, min: 10, max: 40 });
    expect(TITLE_PLACEMENTS.map((p) => [p.key, p.name])).toEqual([
      ['band', 'Above the map, on its own band'],
      ['inside', "Inside the map's top edge"],
      ['none', 'No raised title'],
    ]);
    expect(ORIENTATIONS.map((o) => [o.key, o.name])).toEqual([
      ['landscape', 'Landscape'],
      ['portrait', 'Portrait'],
    ]);
    // A margin outside the range is held to it.
    expect(sheetOf({ face: FACE, marginMm: 3, title: '' }).band.left).toBe(10);
    expect(sheetOf({ face: FACE, marginMm: 99, title: '' }).band.left).toBe(
      40
    );
  });

  it('shifts rings by the face offset, and writes the title rows in the model frame: x:y:h:z:TEXT in tenths, y up from the sheet bottom', () => {
    const s = sheetOf({ face: FACE, marginMm: 10, title: 'Ferry Place' });
    const rings = shiftRings(
      {
        level1: [
          [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
          ],
        ],
        channels: [],
      },
      s.faceAt
    );
    expect(rings.level1[0][0].x).toBe(10);
    expect(rings.level1[0][0].y).toBe(51);
    expect(rings.channels).toEqual([]);
    const rows = titleRows(s, 16);
    expect(rows).toHaveLength(1);
    // The capital's top 9.525 mm into the band, the baseline 16 below it:
    // 35.525 mm from the 421 mm sheet's top, so 385.475 mm up from its
    // bottom.
    expect(rows[0]).toEqual({
      x: 10,
      y: 385.475,
      h: 16,
      z: 0,
      text: 'FERRY PLACE',
    });
    expect(rowsText(rows)).toBe('100:3855:160:0:FERRY PLACE');
    // Two lines a pitch apart, the second lower on the sheet.
    const two = sheetOf({
      face: { w: 200, h: 150 },
      marginMm: 10,
      title: 'Ferry Place Northeast',
    });
    const twoRows = titleRows(two, 16);
    expect(twoRows.map((r) => r.text)).toEqual(['FERRY PLACE', 'NORTHEAST']);
    expect(twoRows[0].y - twoRows[1].y).toBeCloseTo(21.6, 5);
    expect(titleRows(sheetOf({ face: FACE, title: '' }), 16)).toEqual([]);
    expect(rowsText([])).toBe('');
  });

  it('gives each plate the rows that touch it, in its own frame, a row across a seam starting left of the next plate', () => {
    const s = sheetOf({ face: FACE, marginMm: 10, title: 'Ferry Place' });
    const rows = titleRows(s, 16);
    // The band rides in row A of two 250 x 210.5 plates: the row's baseline
    // is 35.525 mm from the top, so 174.975 mm up from A1's bottom.
    const a1 = { x: 0, y: 0, w: 250, h: 210.5 };
    const a2 = { x: 250, y: 0, w: 250, h: 210.5 };
    const b1 = { x: 0, y: 210.5, w: 250, h: 210.5 };
    expect(plateRows(rows, a1, s.h)).toEqual([
      { x: 10, y: 174.975, h: 16, z: 0, text: 'FERRY PLACE' },
    ]);
    expect(rowsText(plateRows(rows, a2, s.h))).toBe(
      '-2400:1750:160:0:FERRY PLACE'
    );
    expect(plateRows(rows, b1, s.h)).toEqual([]);
    // A title plate of its own above row A, 75 mm tall on a 541 sheet.
    const tall = sheetOf({ face: { w: 480, h: 480 }, title: 'Ferry Place' });
    const title1 = { x: 0, y: 0, w: 250, h: 75 };
    expect(rowsText(plateRows(titleRows(tall, 16), title1, tall.h))).toBe(
      '100:395:160:0:FERRY PLACE'
    );
  });
});

describe('the trim', () => {
  const box = (x0, y0, x1, y1) => [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];

  it('cuts a 480 x 360 face to the box around what prints, rounded out to whole millimeters: rings over 40 to 300 by 60 to 200 give 260 x 140 at 40, 60', () => {
    const out = trimFace({
      face: FACE,
      printed: {
        rings: { level1: [box(40.2, 60, 299.6, 200)], level2: [], channels: [] },
      },
    });
    expect(out).toEqual({
      face: { w: 260, h: 140 },
      offset: [40, 60],
      trimmed: true,
    });
  });

  it('counts the cones by their footprint and the letters by their boxes', () => {
    const out = trimFace({
      face: FACE,
      printed: {
        rings: { level1: [box(100, 100, 200, 150)] },
        cones: [[100, 50]],
        coneRadiusMm: 2.45,
        boxes: [{ x: 300, y: 200, width: 40, height: 16 }],
      },
    });
    // The cone reaches 97.55; the box 340 x 216.
    expect(out.offset).toEqual([97, 47]);
    expect(out.face).toEqual({ w: 243, h: 169 });
  });

  it('never cuts under the smallest plate: rings 30 x 20 mm give 100 x 75, grown to the right and down, or back when the face ends', () => {
    const small = trimFace({
      face: FACE,
      printed: { rings: { level1: [box(200, 100, 230, 120)] } },
    });
    expect(small).toEqual({
      face: { w: 100, h: 75 },
      offset: [200, 100],
      trimmed: true,
    });
    const corner = trimFace({
      face: FACE,
      printed: { rings: { level1: [box(460, 340, 480, 360)] } },
    });
    expect(corner).toEqual({
      face: { w: 100, h: 75 },
      offset: [380, 285],
      trimmed: true,
    });
  });

  it('leaves the face as it is with nothing printed, or when the box is the face, and never grows past it', () => {
    expect(trimFace({ face: FACE, printed: { rings: {} } })).toEqual({
      face: FACE,
      offset: [0, 0],
      trimmed: false,
    });
    expect(
      trimFace({
        face: FACE,
        printed: { rings: { level1: [box(0, 0, 480, 360)] } },
      })
    ).toEqual({ face: FACE, offset: [0, 0], trimmed: false });
    // A ring past the edge is held to the face.
    expect(
      trimFace({
        face: FACE,
        printed: { rings: { level1: [box(-5, 300, 100, 370)] } },
      })
    ).toEqual({ face: { w: 100, h: 75 }, offset: [0, 285], trimmed: true });
  });
});
