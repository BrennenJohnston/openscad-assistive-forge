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
} from '../../src/js/tactile-map/sheet.js';

const FACE = { w: 480, h: 360 };

describe('the sheet', () => {
  it('puts a 10 mm band around a 480 x 360 face and a one-line 16 mm title on its own band above: 500 x 420.65, the face at 10, 50.65', () => {
    const s = sheetOf({ face: FACE, marginMm: 10, title: 'Ferry Place' });
    expect(s.w).toBe(500);
    expect(s.h).toBeCloseTo(420.65, 5);
    expect(s.band).toEqual({ left: 10, right: 10, top: 10, bottom: 10 });
    // 16 x 1.35 for the line, 9.525 clear above and below.
    expect(s.titleBand.h).toBeCloseTo(40.65, 5);
    expect(s.titleBand.y).toBe(10);
    expect(s.titleBand.lines).toEqual(['FERRY PLACE']);
    expect(s.faceAt[0]).toBe(10);
    expect(s.faceAt[1]).toBeCloseTo(50.65, 5);
    expect(s.face).toEqual(FACE);
    expect(s.placement).toBe('band');
  });

  it('wraps a long title to the face width in lines at the sign pitch, and each line adds 21.6 mm to the band', () => {
    const one = titleBandOf('Ferry Place', 480, 16);
    expect(one.lines).toEqual(['FERRY PLACE']);
    const long = titleBandOf(
      'University of Washington Center on Human Development and Disability',
      480,
      16
    );
    expect(long.lines.length).toBeGreaterThan(1);
    expect(long.lines.join(' ')).toBe(
      'UNIVERSITY OF WASHINGTON CENTER ON HUMAN DEVELOPMENT AND DISABILITY'
    );
    expect(long.h).toBeCloseTo(one.h + (long.lines.length - 1) * 21.6, 5);
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
    expect(rings.level1[0][0].y).toBeCloseTo(50.65, 5);
    expect(rings.channels).toEqual([]);
    const rows = titleRows(s, 16);
    expect(rows).toHaveLength(1);
    // The capital's top 9.525 mm into the band, the baseline 16 below it:
    // 35.525 mm from the sheet's top, so 385.125 mm up from its bottom.
    expect(rows[0]).toEqual({
      x: 10,
      y: 385.125,
      h: 16,
      z: 0,
      text: 'FERRY PLACE',
    });
    expect(rowsText(rows)).toBe('100:3851:160:0:FERRY PLACE');
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
    // The band rides in row A of two 250 x 210.325 plates: the row's
    // baseline is 35.525 mm from the top, so 174.8 mm up from A1's bottom.
    const a1 = { x: 0, y: 0, w: 250, h: 210.325 };
    const a2 = { x: 250, y: 0, w: 250, h: 210.325 };
    const b1 = { x: 0, y: 210.325, w: 250, h: 210.325 };
    expect(plateRows(rows, a1, s.h)).toEqual([
      { x: 10, y: 174.8, h: 16, z: 0, text: 'FERRY PLACE' },
    ]);
    expect(rowsText(plateRows(rows, a2, s.h))).toBe(
      '-2400:1748:160:0:FERRY PLACE'
    );
    expect(plateRows(rows, b1, s.h)).toEqual([]);
    // A title plate of its own above row A, 75 mm tall on a 540.65 sheet.
    const tall = sheetOf({ face: { w: 480, h: 480 }, title: 'Ferry Place' });
    const title1 = { x: 0, y: 0, w: 250, h: 75 };
    expect(rowsText(plateRows(titleRows(tall, 16), title1, tall.h))).toBe(
      '100:395:160:0:FERRY PLACE'
    );
  });
});
