/**
 * The rings of one path, as rows (DP-57, D-159).
 *
 * `parseSvgElements` splits every compound path into its rings, one row each,
 * and the classifier judged each ring by its fill's luminance alone. So a
 * drawn letter O (one even-odd path, two rings) became two Raised rows and
 * the combined result FILLED its counter; and a traced region's inner ring,
 * where an island of another color sits, became a Raised disc on top of the
 * island's Hole, so the owner's click on the dot selected a disc no role
 * could change. MEASURED in session 4 on the CREATE logo's Colors trace:
 * "Path 75, Raised" over "Path 61, Hole" at the dot inside the figure's arm.
 *
 * Two rules: a traced region (a path carrying data-colour) is ONE element,
 * its outer ring, because whatever sits inside it is its own element already;
 * and a drawn compound path's rings keep the drawing's meaning, a ring that
 * is a hole under the path's fill rule defaulting to Hole.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  analyzeSvg,
  parseSvgElements,
  classifyElements,
  flattenToCompoundPath,
  wallRoleOverrides,
  countTracedShapes,
} from '../../src/js/svg-preparer.js';
import {
  polygonFromPathData,
  pointInPolygon,
} from '../../src/js/svg-nesting.js';

const LOGO = readFileSync(
  path.resolve(process.cwd(), 'tests/fixtures/svg-edit/create-logo-colors-trace.svg'),
  'utf8'
);

const wrap = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;

/** Is the point inside the compound path, under even-odd? */
function filledAt(svg, x, y) {
  const d = /\sd="([^"]*)"/.exec(svg)[1];
  const rings = d.split(/(?=M)/).filter((s) => s.trim());
  let inside = 0;
  for (const ring of rings) {
    const { points } = polygonFromPathData(ring);
    if (points.length >= 3 && pointInPolygon({ x, y }, points)) inside += 1;
  }
  return inside % 2 === 1;
}

describe('a drawn compound path keeps the meaning of its rings (D-159)', () => {
  it('an even-odd O keeps its counter: the inner ring is a Hole and the result has two rings', () => {
    const svg = wrap(
      '<path d="M0,0 H100 V100 H0 Z M25,25 V75 H75 V25 Z" fill="black" fill-rule="evenodd"/>'
    );
    const classified = classifyElements(parseSvgElements(svg));
    expect(classified.map((e) => e.role)).toEqual(['foreground', 'hole']);
    const flat = flattenToCompoundPath(classified, { viewBox: '0 0 100 100' });
    expect(filledAt(flat, 10, 10)).toBe(true);
    expect(filledAt(flat, 50, 50)).toBe(false);
  });

  it('under nonzero, a ring wound against its container is a hole and one wound with it is filled', () => {
    const against = wrap(
      '<path d="M0,0 H100 V100 H0 Z M25,25 V75 H75 V25 Z" fill="black"/>'
    );
    expect(
      classifyElements(parseSvgElements(against)).map((e) => e.role)
    ).toEqual(['foreground', 'hole']);
    const withIt = wrap(
      '<path d="M0,0 H100 V100 H0 Z M25,25 H75 V75 H25 Z" fill="black"/>'
    );
    expect(
      classifyElements(parseSvgElements(withIt)).map((e) => e.role)
    ).toEqual(['foreground', 'foreground']);
  });

  it('an island inside a counter is filled again: three rings, even-odd', () => {
    const svg = wrap(
      '<path d="M0,0 H100 V100 H0 Z M20,20 V80 H80 V20 Z M40,40 H60 V60 H40 Z" fill="black" fill-rule="evenodd"/>'
    );
    expect(
      classifyElements(parseSvgElements(svg)).map((e) => e.role)
    ).toEqual(['foreground', 'hole', 'foreground']);
  });

  it('a drawing whose only holes are its own rings still passes through: nothing to flatten', () => {
    const svg = wrap(
      '<path d="M0,0 H100 V100 H0 Z M25,25 V75 H75 V25 Z" fill="black" fill-rule="evenodd"/>' +
        '<rect x="10" y="90" width="5" height="5" fill="black"/>'
    );
    const analysis = analyzeSvg(svg);
    expect(analysis.recommendation).toBe('pass_through');
    expect(analysis.status).toBe('ready');
    // A hole drawn as its own shape over another still needs the cut.
    const drawn = wrap(
      '<rect width="100" height="100" fill="black"/>' +
        '<rect x="25" y="25" width="50" height="50" fill="white"/>'
    );
    expect(analyzeSvg(drawn).recommendation).not.toBe('pass_through');
  });

  it('a person can still turn a hole ring on, and analyzeSvg reports the default', () => {
    const svg = wrap(
      '<path d="M0,0 H100 V100 H0 Z M25,25 V75 H75 V25 Z" fill="black" fill-rule="evenodd"/>'
    );
    const analysis = analyzeSvg(svg);
    expect(analysis.elements.map((e) => e.autoRole)).toEqual([
      'foreground',
      'hole',
    ]);
    const on = classifyElements(parseSvgElements(svg), {
      roleOverrides: { 1: 'foreground' },
    });
    expect(on[1].role).toBe('foreground');
  });
});

describe('a traced region is one row, its outer ring (D-159)', () => {
  it('the logo trace has one row per region: 111, not 206', () => {
    const elements = parseSvgElements(LOGO);
    expect(elements.length).toBe(111);
    expect(countTracedShapes(LOGO)).toBe(111);
    // The figure: one ring, the outer one, 166 x 155 or so.
    const figure = elements.find((el) => {
      const { points } = polygonFromPathData(el.pathData);
      const xs = points.map((p) => p.x);
      const w = Math.max(...xs) - Math.min(...xs);
      return w > 160 && w < 200;
    });
    expect(figure).toBeDefined();
    expect((figure.pathData.match(/M/g) || []).length).toBe(1);
  });

  it('the navy dot inside the arm is one Hole row, and Ignore on it fills the figure', () => {
    const elements = parseSvgElements(LOGO);
    const overrides = wallRoleOverrides(elements);
    // The dot: the wall's island at 140..150 x 130..140.
    const dotIndex = elements.findIndex((el) => {
      const { points } = polygonFromPathData(el.pathData);
      if (points.length < 3) return false;
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      return (
        Math.min(...xs) > 138 &&
        Math.max(...xs) < 152 &&
        Math.min(...ys) > 128 &&
        Math.max(...ys) < 142
      );
    });
    expect(dotIndex).toBeGreaterThan(-1);
    expect(overrides[dotIndex]).toBe('hole');
    // Nothing else at the dot: no disc of the figure's own.
    const atDot = elements.filter((el, i) => {
      if (i === dotIndex) return false;
      const { points } = polygonFromPathData(el.pathData);
      const xs = points.map((p) => p.x);
      return points.length >= 3 && Math.max(...xs) - Math.min(...xs) < 20 &&
        pointInPolygon({ x: 145, y: 135 }, points);
    });
    expect(atDot).toEqual([]);

    // The figure and the dot alone: the whole logo through the pairwise
    // flatten is the retired chain D-132 measured in tens of seconds.
    const figureIndex = elements.findIndex((el) => {
      const { points } = polygonFromPathData(el.pathData);
      const xs = points.map((p) => p.x);
      const w = points.length >= 3 ? Math.max(...xs) - Math.min(...xs) : 0;
      return w > 160 && w < 200;
    });
    const pair = [elements[figureIndex], elements[dotIndex]];
    const asIs = classifyElements(pair, {
      roleOverrides: { 0: overrides[figureIndex], 1: overrides[dotIndex] },
    });
    expect(asIs.map((e) => e.role)).toEqual(['foreground', 'hole']);
    const before = flattenToCompoundPath(asIs, { viewBox: '0 0 600 448' });
    expect(filledAt(before, 145, 135)).toBe(false);
    expect(filledAt(before, 110, 180)).toBe(true);

    const ignored = classifyElements(pair, {
      roleOverrides: { 0: 'foreground', 1: 'ignore' },
    });
    const after = flattenToCompoundPath(ignored, { viewBox: '0 0 600 448' });
    expect(filledAt(after, 145, 135)).toBe(true);
    expect(filledAt(after, 110, 180)).toBe(true);
  });
});
