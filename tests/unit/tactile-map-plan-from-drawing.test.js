/**
 * A map plan from a classed drawing: the regions the editor's map purpose
 * hands back become features at a real size.
 *
 * What is pinned: a thin shape classed as a line becomes its centerline,
 * the length of the shape; an outline drawn as two rings (the wall's outer
 * and inner edge) becomes ONE closed line between them, whether its inner
 * ring is classed with it or ignored; a fat shape classed as a line stays
 * an area and says so; a shape classed as a point becomes its center; the
 * scale from a width or from two points halves or doubles every coordinate;
 * the map is as big as the shapes kept, plus half the widest line; dots of
 * one line class are joined in order; the bars of one symbol are one point;
 * ignored shapes are dropped; the engine's stroked export reads as filled
 * loops.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { analyzeSvg } from '../../src/js/svg-preparer.js';
import { ringsFromPathData } from '../../src/js/ring-geometry.js';
import {
  CELL_MM,
  MAX_LINE_WIDTH_MM,
  drawingBox,
  filledOutlines,
  planFromRegions,
  scaleFromDistance,
  scaleFromWidth,
  scaleSentence,
} from '../../src/js/tactile-map/plan-from-drawing.js';
import { validatePlan } from '../../src/js/tactile-map/plan.js';

/**
 * A drawing at 480 x 360 units, one unit a millimeter: a 100 x 2 bar, a
 * 20 x 20 square, a 12 mm disc, a 100 x 10 bar, and an outline wall of two
 * rings (100 x 100 outside, 96 x 96 inside), which the analyzer lists as
 * two rows.
 */
const DRAWING =
  '<svg xmlns="http://www.w3.org/2000/svg" width="480mm" height="360mm" viewBox="0 0 480 360">' +
  '<rect x="20" y="20" width="100" height="2"/>' +
  '<rect x="40" y="60" width="20" height="20"/>' +
  '<circle cx="200" cy="100" r="6"/>' +
  '<rect x="20" y="200" width="100" height="10"/>' +
  '<path fill-rule="evenodd" d="M 200 200 L 300 200 L 300 300 L 200 300 Z M 202 202 L 202 298 L 298 298 L 298 202 Z"/>' +
  '</svg>';

/** Ten dots 3 mm apart, and the three bars of a stairs symbol. */
const DOTS_AND_BARS =
  '<svg xmlns="http://www.w3.org/2000/svg" width="480mm" height="360mm" viewBox="0 0 480 360">' +
  Array.from(
    { length: 10 },
    (_, i) => `<circle cx="${40 + 3 * i}" cy="300" r="0.75"/>`
  ).join('') +
  '<rect x="100" y="150" width="10" height="2"/>' +
  '<rect x="100" y="153" width="10" height="2"/>' +
  '<rect x="100" y="156" width="10" height="2"/>' +
  '</svg>';

/** The regions as the editor's map purpose hands them back. */
function regionsOf(svg, classes = {}) {
  const { elements } = analyzeSvg(svg);
  return elements.map((el, i) => ({
    key: `shape-${i}`,
    index: i,
    name: `Shape ${i + 1}`,
    class: classes[i] || 'ignore',
    pathData: el.pathData,
    rings: ringsFromPathData(el.pathData),
  }));
}

const lengthOf = (points) => {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(
      points[i][0] - points[i - 1][0],
      points[i][1] - points[i - 1][1]
    );
  }
  return total;
};

const boundsOf = (pairs) => ({
  minX: Math.min(...pairs.map((p) => p[0])),
  maxX: Math.max(...pairs.map((p) => p[0])),
  minY: Math.min(...pairs.map((p) => p[1])),
  maxY: Math.max(...pairs.map((p) => p[1])),
});

const build = (svg, classes, extra = {}) =>
  planFromRegions({
    regions: regionsOf(svg, classes),
    box: drawingBox(svg),
    mapWidthMm: 480,
    ...extra,
  });

describe('a plan from a drawing', () => {
  it('lists five rows for the drawing, the outline wall as two', () => {
    expect(regionsOf(DRAWING)).toHaveLength(6);
  });

  it('turns a 100 x 2 mm bar classed wall into one line 100 mm long', () => {
    const { plan, warnings } = build(DRAWING, { 0: 'wall' });
    expect(warnings).toEqual([]);
    expect(plan.features).toHaveLength(1);
    const [line] = plan.features;
    expect(line.kind).toBe('line');
    expect(line.class).toBe('wall');
    expect(line.on).toBe(true);
    expect(line.points.length).toBeGreaterThanOrEqual(2);
    expect(lengthOf(line.points)).toBeGreaterThanOrEqual(99);
    expect(lengthOf(line.points)).toBeLessThanOrEqual(101);
    // The map hugs the bar, 1 mm (half a wall) around it.
    expect(plan.size).toEqual({ w: 102, h: 4 });
    const b = boundsOf(line.points);
    expect(b.minY).toBeGreaterThanOrEqual(1.5);
    expect(b.maxY).toBeLessThanOrEqual(2.5);
    expect(validatePlan(plan).ok).toBe(true);
  });

  it('turns a 20 x 20 square classed area into one area', () => {
    const { plan, warnings } = build(DRAWING, { 1: 'area' });
    expect(warnings).toEqual([]);
    expect(plan.features).toHaveLength(1);
    const [area] = plan.features;
    expect(area.kind).toBe('area');
    expect(area.class).toBe('area');
    expect(area.holes).toBeUndefined();
    expect(area.ring.length).toBeGreaterThanOrEqual(4);
    expect(plan.size).toEqual({ w: 20, h: 20 });
    expect(boundsOf(area.ring)).toEqual({
      minX: 0,
      maxX: 20,
      minY: 0,
      maxY: 20,
    });
  });

  it('turns a 12 mm disc classed landmark into one point at its center', () => {
    const { plan } = build(DRAWING, { 2: 'landmark' });
    expect(plan.features).toHaveLength(1);
    const [point] = plan.features;
    expect(point.kind).toBe('point');
    expect(point.class).toBe('landmark');
    expect(plan.size).toEqual({ w: 12, h: 12 });
    expect(Math.abs(point.at[0] - 6)).toBeLessThan(0.2);
    expect(Math.abs(point.at[1] - 6)).toBeLessThan(0.2);
  });

  it('halves every coordinate at a scale of 240 mm over a 480-unit drawing', () => {
    const box = drawingBox(DRAWING);
    const scale = scaleFromWidth(box, 240);
    expect(scale.unitsPerMm).toBe(2);
    const { plan } = build(DRAWING, { 0: 'wall', 1: 'area' }, { scale });
    // The bar and the square span 100 x 60 units: 50 x 30 mm, 1 mm around.
    expect(plan.size).toEqual({ w: 52, h: 32 });
    const area = plan.features.find((f) => f.kind === 'area');
    expect(boundsOf(area.ring)).toEqual({
      minX: 11,
      maxX: 21,
      minY: 21,
      maxY: 31,
    });
    const line = plan.features.find((f) => f.kind === 'line');
    expect(lengthOf(line.points)).toBeGreaterThanOrEqual(49.5);
    expect(lengthOf(line.points)).toBeLessThanOrEqual(50.5);
  });

  it('keeps a 10 mm wide bar classed wall as an area and says so', () => {
    expect(MAX_LINE_WIDTH_MM).toBe(6);
    const { plan, warnings } = build(DRAWING, { 3: 'wall' });
    expect(plan.features).toHaveLength(1);
    const [kept] = plan.features;
    expect(kept.kind).toBe('area');
    expect(kept.class).toBe('wall');
    expect(boundsOf(kept.ring)).toEqual({
      minX: 1,
      maxX: 101,
      minY: 1,
      maxY: 11,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].featureId).toBe(kept.id);
    expect(warnings[0].text).toBe(
      'Shape 4 was traced as a line but is too wide to find its center; it was kept as an area.'
    );
  });

  it('turns an outline wall of two rings into one closed line between them', () => {
    for (const classes of [{ 4: 'wall', 5: 'wall' }, { 4: 'wall' }]) {
      const { plan, warnings } = build(DRAWING, classes);
      expect(warnings).toEqual([]);
      expect(plan.features).toHaveLength(1);
      const [line] = plan.features;
      expect(line.kind).toBe('line');
      expect(line.points[0]).toEqual(line.points[line.points.length - 1]);
      const length = lengthOf(line.points);
      expect(length).toBeGreaterThanOrEqual(386);
      expect(length).toBeLessThanOrEqual(398);
      expect(plan.size).toEqual({ w: 102, h: 102 });
      const b = boundsOf(line.points);
      expect(b.minX).toBeGreaterThanOrEqual(1.5);
      expect(b.maxX).toBeLessThanOrEqual(100.5);
      expect(b.minX).toBeLessThanOrEqual(2.5);
      expect(b.maxX).toBeGreaterThanOrEqual(99.5);
    }
  });

  it('turns an outline drawn as two rings classed area into one area with one hole', () => {
    for (const classes of [{ 4: 'area', 5: 'area' }, { 4: 'area' }]) {
      const { plan, warnings } = build(DRAWING, classes);
      expect(warnings).toEqual([]);
      expect(plan.features).toHaveLength(1);
      const [area] = plan.features;
      expect(area.kind).toBe('area');
      expect(plan.size).toEqual({ w: 100, h: 100 });
      expect(boundsOf(area.ring)).toEqual({
        minX: 0,
        maxX: 100,
        minY: 0,
        maxY: 100,
      });
      expect(area.holes).toHaveLength(1);
      expect(boundsOf(area.holes[0])).toEqual({
        minX: 2,
        maxX: 98,
        minY: 2,
        maxY: 98,
      });
      expect(validatePlan(plan).ok).toBe(true);
    }
  });

  it('drops ignored shapes and gives every feature its own id', () => {
    expect(build(DRAWING, {}).plan.features).toEqual([]);
    const { plan } = build(DRAWING, {
      0: 'wall',
      1: 'area',
      2: 'landmark',
      3: 'wall',
      4: 'wall',
    });
    const ids = plan.features.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(plan.features.every((f) => f.name)).toBe(true);
    expect(validatePlan(plan).ok).toBe(true);
  });

  it('joins dots of one line class into one line, in order', () => {
    const { plan, warnings } = build(DOTS_AND_BARS, {
      0: 'route',
      1: 'route',
      2: 'route',
      3: 'route',
      4: 'route',
      5: 'route',
      6: 'route',
      7: 'route',
      8: 'route',
      9: 'route',
    });
    expect(warnings).toEqual([]);
    expect(plan.features).toHaveLength(1);
    const [route] = plan.features;
    expect(route.kind).toBe('line');
    expect(route.class).toBe('route');
    expect(route.points).toHaveLength(10);
    expect(lengthOf(route.points)).toBeGreaterThanOrEqual(26.5);
    expect(lengthOf(route.points)).toBeLessThanOrEqual(27.5);
    const xs = route.points.map((p) => p[0]);
    const climbs = xs.every((x, i) => i === 0 || x > xs[i - 1]);
    const falls = xs.every((x, i) => i === 0 || x < xs[i - 1]);
    expect(climbs || falls).toBe(true);
  });

  it('makes one point of the three bars of a stairs symbol', () => {
    const { plan } = build(DOTS_AND_BARS, {
      10: 'stairs',
      11: 'stairs',
      12: 'stairs',
    });
    expect(plan.features).toHaveLength(1);
    const [stairs] = plan.features;
    expect(stairs.kind).toBe('point');
    expect(Math.abs(stairs.at[0] - 5)).toBeLessThan(0.2);
    expect(Math.abs(stairs.at[1] - 4)).toBeLessThan(0.2);
  });

  it('reads the scale from a width, from two points, and says it', () => {
    expect(CELL_MM).toBe(0.25);
    expect(drawingBox(DRAWING)).toEqual({
      x: 0,
      y: 0,
      width: 480,
      height: 360,
      widthMm: 480,
      heightMm: 360,
    });
    expect(
      drawingBox(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 300 200"></svg>'
      )
    ).toEqual({
      x: 10,
      y: 20,
      width: 300,
      height: 200,
      widthMm: null,
      heightMm: null,
    });
    expect(
      drawingBox(
        '<svg xmlns="http://www.w3.org/2000/svg" width="4in" height="2in"></svg>'
      )
    ).toEqual({
      x: 0,
      y: 0,
      width: 4,
      height: 2,
      widthMm: 101.6,
      heightMm: 50.8,
    });
    expect(scaleFromDistance([0, 0], [100, 0], 50)).toEqual({ unitsPerMm: 2 });
    expect(scaleFromWidth({ width: 480 }, 240)).toEqual({ unitsPerMm: 2 });
    expect(scaleSentence({ unitsPerMm: 2 })).toBe(
      'Scale set: one drawing unit is 0.5 mm.'
    );
    expect(scaleSentence({ unitsPerMm: 1 / 25.4 })).toBe(
      'Scale set: one drawing unit is 25.4 mm.'
    );
    expect(scaleSentence({ unitsPerMm: 3 })).toBe(
      'Scale set: one drawing unit is 0.333 mm.'
    );
  });

  it('sizes the map by the shapes kept, with or without a box', () => {
    const regions = regionsOf(DRAWING, { 1: 'area' });
    const { plan } = planFromRegions({
      regions,
      scale: { unitsPerMm: 1 },
    });
    expect(plan.size).toEqual({ w: 20, h: 20 });
    expect(validatePlan(plan).ok).toBe(true);
    const all = build(DRAWING, {
      0: 'wall',
      1: 'area',
      2: 'landmark',
      3: 'wall',
      4: 'wall',
    }).plan;
    // Everything spans 20..300 by 20..300 units: 280 mm, 1 mm around.
    expect(all.size).toEqual({ w: 282, h: 282 });
  });

  it("reads the engine's stroked export as filled loops, and leaves a drawn stroke alone", () => {
    const engine =
      '<?xml version="1.0" standalone="no"?>\n' +
      '<svg width="200mm" height="100mm" viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg" version="1.1">\n' +
      '<title>OpenSCAD Model</title>\n' +
      '<path d="\nM 10,10 L 110,10 L 110,110 L 10,110 z\nM 12,12 L 12,108 L 108,108 L 108,12 z\n" stroke="black" fill="none" stroke-width="0.35"/>\n' +
      '</svg>';
    const filled = filledOutlines(engine);
    expect(filled).toContain('fill="#000" fill-rule="evenodd"');
    expect(filled).not.toMatch(/stroke/);
    expect(regionsOf(filled)).toHaveLength(2);
    const { plan } = planFromRegions({
      regions: regionsOf(filled, { 0: 'wall' }),
      box: drawingBox(filled),
      scale: { unitsPerMm: 1 },
    });
    expect(plan.features).toHaveLength(1);
    expect(plan.features[0].kind).toBe('line');
    expect(plan.features[0].points[0]).toEqual(
      plan.features[0].points[plan.features[0].points.length - 1]
    );
    const drawn =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">' +
      '<path d="M 10 10 L 110 10" stroke="black" fill="none" stroke-width="2"/>' +
      '</svg>';
    expect(filledOutlines(drawn)).toBe(drawn);
  });
});
