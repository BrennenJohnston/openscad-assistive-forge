/**
 * The scale choices of a place map: each named for the ground it fits, with
 * its ratio, what one millimeter of plate stands for, and what draws at it.
 * The tactile limits decide the drawing rules: two lines closer than 3 mm
 * read as one, so a street whose sidewalks fall that close draws as one line.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import {
  SCALES,
  scaleChoice,
  groundAcrossM,
  symbolMeters,
  mmPerMeterAt,
  nearestRule,
  sidewalksAsOneLine,
  sentenceFor,
  CUSTOM_RANGE,
  groundBox,
} from '../../src/js/tactile-map/scales.js';
import { projectLatLon } from '../../src/js/tactile-map/osm-geometry.js';

describe('the scale choices', () => {
  it('names five choices for the ground they fit, with their ratios, and a custom ratio', () => {
    expect(SCALES.map((s) => [s.key, s.name, s.ratio ?? null])).toEqual([
      ['building', 'A building and its doors', 500],
      ['block', 'A block', 1000],
      ['blocks', 'A few blocks', 2000],
      ['neighborhood', 'A neighborhood', 4000],
      ['route', 'Fit to the route', null],
      ['custom', 'Custom', null],
    ]);
    expect(CUSTOM_RANGE).toEqual({ min: 200, max: 10000 });
    expect(Object.isFrozen(SCALES)).toBe(true);
    expect(scaleChoice('block').ratio).toBe(1000);
    expect(scaleChoice('nothing')).toBeNull();
  });

  it('does the arithmetic: 1:1000 on a 480 mm plate is 480 m across, a 10 mm symbol 10 m, one meter 1 mm', () => {
    expect(groundAcrossM(1000, 480)).toBe(480);
    expect(groundAcrossM(500, 480)).toBe(240);
    expect(groundAcrossM(4000, 480)).toBe(1920);
    expect(symbolMeters(1000)).toBe(10);
    expect(symbolMeters(4000)).toBe(40);
    expect(symbolMeters(2000, 8)).toBe(16);
    expect(mmPerMeterAt(1000)).toBe(1);
    expect(mmPerMeterAt(500)).toBe(2);
    expect(mmPerMeterAt(4000)).toBe(0.25);
  });

  it('draws less as the ground grows: every sidewalk and marking near a building, streets as one line over a neighborhood', () => {
    const rules = (key) => scaleChoice(key).rules;
    expect(rules('building')).toMatchObject({
      streetsAsOneLine: false,
      crossingMarkings: true,
    });
    expect(rules('block')).toMatchObject({
      streetsAsOneLine: false,
      crossingMarkings: false,
    });
    expect(rules('blocks')).toMatchObject({
      streetsAsOneLine: 'whereUnder3mm',
    });
    expect(rules('neighborhood')).toMatchObject({
      streetsAsOneLine: true,
      crossings: false,
      sidePaths: false,
    });
  });

  it('gives the ground a plate covers as a box centered on the place: 480 by 360 m at 1:1000', () => {
    const center = { lat: 47.652873, lon: -122.3044814 };
    const box = groundBox(center, 1000, { w: 480, h: 360 });
    const [west, south] = projectLatLon(box.south, box.west, center);
    const [east, north] = projectLatLon(box.north, box.east, center);
    expect(east - west).toBeCloseTo(480, 6);
    expect(north - south).toBeCloseTo(360, 6);
    expect(east + west).toBeCloseTo(0, 6);
    expect(north + south).toBeCloseTo(0, 6);
  });

  it('takes a custom ratio to the nearest named choice for its rules, the more detailed one on a tie', () => {
    expect(nearestRule(1500)).toBe(scaleChoice('block').rules);
    expect(nearestRule(1600)).toBe(scaleChoice('blocks').rules);
    expect(nearestRule(200)).toBe(scaleChoice('building').rules);
    expect(nearestRule(10000)).toBe(scaleChoice('neighborhood').rules);
  });

  it('draws a street as one line where its sidewalks fall 3 mm apart or closer on the plate', () => {
    // A 12 m street: 12 mm apart at 1:1000, 6 mm at 1:2000, 3 mm at 1:4000.
    expect(sidewalksAsOneLine(1000, 12)).toBe(false);
    expect(sidewalksAsOneLine(2000, 12)).toBe(false);
    expect(sidewalksAsOneLine(4000, 12)).toBe(true);
    // A 5 m lane at 1:2000 is 2.5 mm: one line.
    expect(sidewalksAsOneLine(2000, 5)).toBe(true);
  });

  it('says in one sentence what a choice fits on the plate, what a symbol stands for, and what draws', () => {
    const plate = { w: 480, h: 360 };
    expect(sentenceFor(scaleChoice('block'), plate)).toBe(
      '480 m across on this plate. A 10 mm symbol stands for 10 m. Sidewalks and crossings draw.'
    );
    expect(sentenceFor(scaleChoice('building'), plate)).toBe(
      '240 m across on this plate. A 10 mm symbol stands for 5 m. Every sidewalk draws, and a crossing without markings is dashed.'
    );
    expect(sentenceFor(scaleChoice('blocks'), plate)).toBe(
      '960 m across on this plate. A 10 mm symbol stands for 20 m. Narrow streets draw as one line; entrances leave.'
    );
    expect(sentenceFor(scaleChoice('neighborhood'), plate)).toBe(
      '1920 m across on this plate. A 10 mm symbol stands for 40 m. Streets draw as one line; crossings, side paths and landmarks leave.'
    );
    // Custom takes its typed ratio and the rules of the nearest choice.
    expect(sentenceFor(scaleChoice('custom'), plate, 1500)).toBe(
      '720 m across on this plate. A 10 mm symbol stands for 15 m. Sidewalks and crossings draw.'
    );
    // Fit to the route has no ratio until the route is drafted.
    expect(sentenceFor(scaleChoice('route'), plate)).toBe(
      'The plate is fitted to the walk and its two buildings.'
    );
  });
});
