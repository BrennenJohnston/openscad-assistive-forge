/**
 * Nesting analysis (DP-7 P1).
 *
 * Depth is the number the containment law is written in, so these cases are
 * mostly about depth being RIGHT rather than merely present: right when the
 * shapes arrive in a different order, right for a letter whose counter
 * touches its stem, and honest when the artwork is degenerate.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  LAYER_CAP,
  polygonFromPathData,
  signedArea,
  boundsOf,
  pointInPolygon,
  interiorPoint,
  selfIntersects,
  buildNestingTree,
  suggestLayers,
  layerLimit,
  validateLayers,
} from '../../src/js/svg-nesting.js';

/** A square as a path `d` string. */
const square = (x, y, size) =>
  `M ${x} ${y} L ${x + size} ${y} L ${x + size} ${y + size} L ${x} ${y + size} Z`;

/** N squares nested about a common centre, outermost first. */
function nestedSquares(count, outer = 100) {
  const els = [];
  for (let i = 0; i < count; i++) {
    const size = outer - i * (outer / (count + 1));
    const at = (outer - size) / 2;
    els.push({ pathData: square(at, at, size) });
  }
  return els;
}

describe('polygonFromPathData', () => {
  it('turns a square into its four corners', () => {
    const { points, closed } = polygonFromPathData(square(0, 0, 10));
    expect(points).toHaveLength(4);
    expect(closed).toBe(true);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[2]).toEqual({ x: 10, y: 10 });
  });

  it('flattens curves into a polygon that keeps the shape', () => {
    // A circle of radius 10 drawn as four arcs.
    const circle =
      'M 10 0 A 10 10 0 0 1 0 10 A 10 10 0 0 1 -10 0 ' +
      'A 10 10 0 0 1 0 -10 A 10 10 0 0 1 10 0 Z';
    const { points } = polygonFromPathData(circle);
    expect(points.length).toBeGreaterThan(20);
    // Area of the flattened polygon lands near pi r^2 = 314.16.
    expect(Math.abs(signedArea(points))).toBeGreaterThan(310);
    expect(Math.abs(signedArea(points))).toBeLessThan(315);
  });

  it('reports an unclosed subpath as open rather than silently closing it', () => {
    const { points, closed } = polygonFromPathData('M 0 0 L 10 0 L 10 10');
    expect(points).toHaveLength(3);
    expect(closed).toBe(false);
  });

  it('survives nonsense without throwing', () => {
    for (const bad of ['', null, undefined, 'not a path', 'M', 42]) {
      expect(() => polygonFromPathData(bad)).not.toThrow();
      expect(polygonFromPathData(bad).points).toEqual([]);
    }
  });

  it('does not repeat the closing point as a vertex', () => {
    const { points } = polygonFromPathData('M 0 0 L 10 0 L 10 10 L 0 0 Z');
    expect(points).toHaveLength(3);
  });
});

describe('signedArea and boundsOf', () => {
  it('measures a square, sign following winding', () => {
    const cw = polygonFromPathData(square(0, 0, 10)).points;
    expect(Math.abs(signedArea(cw))).toBe(100);
    expect(Math.abs(signedArea([...cw].reverse()))).toBe(100);
    expect(signedArea(cw)).toBe(-signedArea([...cw].reverse()));
  });

  it('bounds an empty polygon as nothing, not as a point at infinity', () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf(null)).toBeNull();
  });
});

describe('pointInPolygon', () => {
  const sq = polygonFromPathData(square(0, 0, 10)).points;

  it('answers inside and outside', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, sq)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, sq)).toBe(false);
    expect(pointInPolygon({ x: -1, y: -1 }, sq)).toBe(false);
  });
});

describe('interiorPoint', () => {
  it('finds a point inside a plain square', () => {
    const sq = polygonFromPathData(square(0, 0, 10)).points;
    const p = interiorPoint(sq);
    expect(pointInPolygon(p, sq)).toBe(true);
  });

  it('finds one inside a C shape, where the centroid is OUTSIDE', () => {
    // This is why a vertex or a centroid will not do: a letter C, and the
    // area-weighted centre of it sits in the gap.
    const c = 'M 0 0 L 30 0 L 30 10 L 10 10 L 10 30 L 30 30 L 30 40 L 0 40 Z';
    const poly = polygonFromPathData(c).points;
    let ax = 0;
    let ay = 0;
    for (const p of poly) {
      ax += p.x;
      ay += p.y;
    }
    const naiveCentre = { x: ax / poly.length, y: ay / poly.length };
    expect(pointInPolygon(naiveCentre, poly)).toBe(false);

    const p = interiorPoint(poly);
    expect(p).not.toBeNull();
    expect(pointInPolygon(p, poly)).toBe(true);
  });

  it('returns nothing for a shape with no interior', () => {
    expect(interiorPoint([])).toBeNull();
    expect(
      interiorPoint([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ])
    ).toBeNull();
    // A degenerate line drawn as a closed path has zero height.
    expect(
      interiorPoint(polygonFromPathData('M 0 0 L 10 0 Z').points)
    ).toBeNull();
  });
});

describe('selfIntersects', () => {
  it('catches a figure of eight', () => {
    const bowtie = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    expect(selfIntersects(bowtie)).toEqual({ checked: true, intersects: true });
  });

  it('passes a plain square', () => {
    const sq = polygonFromPathData(square(0, 0, 10)).points;
    expect(selfIntersects(sq)).toEqual({ checked: true, intersects: false });
  });

  it('says it did NOT look rather than reporting clean, past its budget', () => {
    // An unchecked shape reported as fine is the shape that reaches the
    // printer. The budget is honest about itself instead.
    const many = [];
    for (let i = 0; i < 500; i++) {
      many.push({ x: Math.cos(i) * 10, y: Math.sin(i) * 10 });
    }
    expect(selfIntersects(many).checked).toBe(false);
  });
});

describe('buildNestingTree', () => {
  it('gives three nested squares depths 0, 1, 2', () => {
    const tree = buildNestingTree(nestedSquares(3));
    expect(tree.nodes.map((n) => n.depth)).toEqual([0, 1, 2]);
    expect(tree.roots).toEqual([0]);
    expect(tree.maxDepth).toBe(2);
    expect(tree.depthLimit).toBe(3);
  });

  it('records the parent and the children by index', () => {
    const tree = buildNestingTree(nestedSquares(3));
    expect(tree.nodes[0].parent).toBeNull();
    expect(tree.nodes[1].parent).toBe(0);
    expect(tree.nodes[2].parent).toBe(1);
    expect(tree.nodes[0].children).toEqual([1]);
    expect(tree.nodes[2].children).toEqual([]);
  });

  it('does not depend on the order the shapes arrive in', () => {
    // Document order is whatever the drawing program wrote. Depth is not.
    const els = nestedSquares(3);
    const shuffled = [els[2], els[0], els[1]];
    const tree = buildNestingTree(shuffled);
    expect(tree.nodes[0].depth).toBe(2);
    expect(tree.nodes[1].depth).toBe(0);
    expect(tree.nodes[2].depth).toBe(1);
    expect(tree.depthLimit).toBe(3);
  });

  it('separates siblings instead of nesting them', () => {
    const tree = buildNestingTree([
      { pathData: square(0, 0, 10) },
      { pathData: square(50, 0, 10) },
    ]);
    expect(tree.nodes.map((n) => n.depth)).toEqual([0, 0]);
    expect(tree.roots).toEqual([0, 1]);
    expect(tree.depthLimit).toBe(1);
  });

  it('does NOT nest a shape whose bounds overlap but whose area does not', () => {
    // Two interlocking L shapes share a bounding box and contain nothing.
    const tree = buildNestingTree([
      { pathData: 'M 0 0 L 30 0 L 30 10 L 10 10 L 10 30 L 0 30 Z' },
      { pathData: 'M 20 20 L 30 20 L 30 30 L 20 30 Z' },
    ]);
    expect(tree.nodes.map((n) => n.depth)).toEqual([0, 0]);
  });

  it('handles the letters case: counters inside letters inside a field', () => {
    // A lens field, two letters on it, and the counter inside each letter -
    // the shape of the owner's own artwork.
    const field = square(0, 0, 200);
    const letterO = 'M 20 20 L 80 20 L 80 120 L 20 120 Z';
    const counterO = 'M 35 35 L 65 35 L 65 105 L 35 105 Z';
    const letterA = 'M 110 20 L 170 20 L 170 120 L 110 120 Z';
    const counterA = 'M 125 35 L 155 35 L 155 70 L 125 70 Z';
    const tree = buildNestingTree([
      { pathData: field },
      { pathData: letterO },
      { pathData: counterO },
      { pathData: letterA },
      { pathData: counterA },
    ]);
    expect(tree.nodes.map((n) => n.depth)).toEqual([0, 1, 2, 1, 2]);
    expect(tree.nodes[2].parent).toBe(1);
    expect(tree.nodes[4].parent).toBe(3);
    expect(tree.depthLimit).toBe(3);
  });

  it('marks degenerate shapes and keeps them out of the tree', () => {
    const tree = buildNestingTree([
      { pathData: square(0, 0, 100) },
      { pathData: 'M 10 10 L 90 10' },
      { pathData: '' },
      { pathData: square(20, 20, 20) },
    ]);
    expect(tree.nodes[1].degenerate).toBe(true);
    expect(tree.nodes[2].degenerate).toBe(true);
    expect(tree.nodes[2].notes).toContain('empty');
    expect(tree.nodes[1].notes).toContain('open');
    expect(tree.degenerateCount).toBe(2);
    // The real shapes are unaffected by the broken ones beside them.
    expect(tree.nodes[0].depth).toBe(0);
    expect(tree.nodes[3].depth).toBe(1);
    expect(tree.depthLimit).toBe(2);
  });

  it('an empty design has no layers rather than one', () => {
    expect(buildNestingTree([]).depthLimit).toBe(0);
    expect(buildNestingTree(null).depthLimit).toBe(0);
    expect(buildNestingTree([{ pathData: '' }]).depthLimit).toBe(0);
  });

  it.each([1, 2, 3, 4])('depth %i artwork reports limit %i', (depth) => {
    // The LIMIT is the artwork's nesting depth. Pinned across the range so
    // a change to the tree cannot quietly change what the editor offers.
    expect(buildNestingTree(nestedSquares(depth)).depthLimit).toBe(depth);
  });
});

describe('suggestLayers and layerLimit', () => {
  it('suggests one layer per level of nesting', () => {
    expect(suggestLayers(buildNestingTree(nestedSquares(3)))).toEqual([
      1, 2, 3,
    ]);
  });

  it('caps at three even when the artwork nests deeper', () => {
    const tree = buildNestingTree(nestedSquares(5));
    expect(tree.depthLimit).toBe(5);
    expect(suggestLayers(tree)).toEqual([1, 2, 3, 3, 3]);
    expect(layerLimit(tree)).toBe(LAYER_CAP);
    expect(LAYER_CAP).toBe(3);
  });

  it('suggests nothing for a shape it could not read', () => {
    const tree = buildNestingTree([{ pathData: 'M 0 0 L 5 0' }]);
    expect(suggestLayers(tree)).toEqual([null]);
  });

  it('an empty design offers no layers', () => {
    expect(layerLimit(buildNestingTree([]))).toBe(0);
    expect(layerLimit(null)).toBe(0);
  });
});

describe('validateLayers - the containment law', () => {
  const tree = () => buildNestingTree(nestedSquares(3));

  it('accepts the suggestion it made itself', () => {
    expect(validateLayers(tree(), [1, 2, 3])).toEqual([]);
  });

  it('accepts everything on layer 1', () => {
    expect(validateLayers(tree(), [1, 1, 1])).toEqual([]);
  });

  it('rejects layer 3 sitting on layer 1, with the reason named', () => {
    // The middle square is gone by layer 3, so the inner one stands on air.
    const problems = validateLayers(tree(), [1, 1, 3]);
    expect(problems).toHaveLength(1);
    expect(problems[0].index).toBe(2);
    expect(problems[0].reason).toBe('enclosing-shape-on-wrong-layer');
  });

  it('rejects a layer 2 element that nothing encloses', () => {
    const t = buildNestingTree([
      { pathData: square(0, 0, 10) },
      { pathData: square(50, 0, 10) },
    ]);
    const problems = validateLayers(t, [1, 2]);
    expect(problems).toHaveLength(1);
    expect(problems[0].reason).toBe('not-enclosed');
  });

  it('accepts support from a grandparent on the layer below', () => {
    // Layer 2 may be carried by any enclosing shape on layer 1, not only the
    // immediate one - the law is about surviving material, not adjacency.
    const t = buildNestingTree(nestedSquares(3));
    expect(validateLayers(t, [1, 1, 2])).toEqual([]);
  });

  it('never reassigns anything', () => {
    const layers = [1, 1, 3];
    validateLayers(tree(), layers);
    expect(layers).toEqual([1, 1, 3]);
  });

  it('says nothing about a design with no layers set', () => {
    expect(validateLayers(tree(), [])).toEqual([]);
    expect(validateLayers(null, [1, 2, 3])).toEqual([]);
  });
});

describe('the clipper2-js trap', () => {
  it('the analysis never imports clipper2-js', () => {
    // clipper2-js IS a dependency of this app, so this is not a hypothetical.
    // At 1.2.4 its pointInPolygon returns IsOn for every input and
    // executePolyTree throws internally and returns an empty tree; a nesting
    // tree built on either would be confidently wrong. Measured in the
    // owner's stencil-forge repo, 2026-08-25.
    const source = readFileSync(
      resolve(process.cwd(), 'src/js/svg-nesting.js'),
      'utf8'
    );
    // Comments NAME the trap on purpose, so the guard reads code only -
    // otherwise documenting the danger is what trips it.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    const imports = code.match(/^import[\s\S]*?from\s+'[^']+';/gm) || [];
    expect(imports.length).toBeGreaterThan(0);
    for (const line of imports) {
      expect(line).not.toMatch(/clipper/i);
    }
    expect(code).not.toMatch(/clipper/i);
    expect(code).not.toMatch(/executePolyTree/);
    // And the ported implementation is genuinely present, so the guard is
    // not passing merely because the module forgot to do the work.
    expect(code).toMatch(/export function pointInPolygon/);
  });
});
