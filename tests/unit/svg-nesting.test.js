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
  distanceToEdge,
  holeFits,
} from '../../src/js/svg-nesting.js';
import {
  parseSvgElements,
  classifyElements,
  flattenSilhouette,
  flattenLayers,
} from '../../src/js/svg-preparer.js';

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

// ── DP-11: the outline, and where a hole may go ─────────────────────────────

describe('distanceToEdge', () => {
  const sq = polygonFromPathData('M 0 0 L 20 0 L 20 20 L 0 20 Z').points;

  it('measures to the nearest edge, not the nearest corner', () => {
    expect(distanceToEdge({ x: 10, y: 10 }, sq)).toBeCloseTo(10, 6);
    expect(distanceToEdge({ x: 2, y: 10 }, sq)).toBeCloseTo(2, 6);
    expect(distanceToEdge({ x: 10, y: 19 }, sq)).toBeCloseTo(1, 6);
  });

  it('measures from outside as a positive distance too', () => {
    // The sign is the caller's business: holeFits() asks pointInPolygon
    // separately, so this only ever answers "how far is the edge".
    expect(distanceToEdge({ x: -5, y: 10 }, sq)).toBeCloseTo(5, 6);
  });
});

describe('holeFits - where a keychain hole may go', () => {
  const sq = polygonFromPathData('M 0 0 L 40 0 L 40 40 L 0 40 Z').points;

  it('accepts a hole with room around it', () => {
    const r = holeFits(sq, { x: 20, y: 20 }, 2, 1.2);
    expect(r.fits).toBe(true);
    expect(r.reason).toBeNull();
    expect(r.clearance).toBeCloseTo(20, 6);
    expect(r.required).toBeCloseTo(3.2, 6);
  });

  it('refuses a hole outside the shape, and says so', () => {
    const r = holeFits(sq, { x: 60, y: 20 }, 2, 1.2);
    expect(r.fits).toBe(false);
    expect(r.reason).toBe('outside');
  });

  it('refuses a hole that would leave too thin a wall', () => {
    // Inside, but 2 mm from the edge with a 2 mm radius: the web left is
    // nothing at all. A print like that snaps on the first tug.
    const r = holeFits(sq, { x: 2, y: 20 }, 2, 1.2);
    expect(r.fits).toBe(false);
    expect(r.reason).toBe('too-close');
    expect(r.clearance).toBeCloseTo(2, 6);
    expect(r.required).toBeCloseTo(3.2, 6);
  });

  it('accepts the same hole once the wall is thick enough', () => {
    expect(holeFits(sq, { x: 3.3, y: 20 }, 2, 1.2).fits).toBe(true);
    expect(holeFits(sq, { x: 3.1, y: 20 }, 2, 1.2).fits).toBe(false);
  });

  it('refuses when there is no outline to check against', () => {
    expect(holeFits([], { x: 0, y: 0 }, 2, 1.2).reason).toBe('no-outline');
    expect(holeFits(null, { x: 0, y: 0 }, 2, 1.2).fits).toBe(false);
  });

  it('handles a concave outline, where a bounding box would lie', () => {
    // A C shape: the middle of its bounding box is in the gap, not in the
    // material. Anything checking a rectangle would put the ring in mid-air.
    const c = polygonFromPathData(
      'M 0 0 L 30 0 L 30 10 L 10 10 L 10 30 L 30 30 L 30 40 L 0 40 Z'
    ).points;
    expect(holeFits(c, { x: 20, y: 20 }, 2, 1.2).reason).toBe('outside');
    expect(holeFits(c, { x: 5, y: 20 }, 2, 1.2).fits).toBe(true);
  });
});

describe('flattenSilhouette - the outline a pendant is cut from', () => {
  const dOf = (svg) => svg.match(/ d="([^"]*)"/)[1];

  function silhouetteOf(svgText) {
    // RAW elements, with the classified roles beside them. The outline is the
    // shape the eye sees, and stroke-to-fill would turn it into a thin band.
    const raw = parseSvgElements(svgText);
    const roles = classifyElements(raw).map((e) => e.role);
    return flattenSilhouette(raw, roles, { viewBox: '0 0 40 40' });
  }

  it('★ a stroke-drawn outline becomes a SOLID body, not a ring', () => {
    // The bird fixture's own outline is a stroke. Built from the CONVERTED
    // geometry the pendant came out as a hollow ring with the eye and the
    // feathers floating in the hole. The raw subpath, filled, is the body.
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
      '<path d="M5 5 H35 V35 H5 Z" fill="none" stroke="#000" ' +
      'stroke-width="2"/></svg>';
    const out = silhouetteOf(svg);
    const box = boundsOf(polygonFromPathData(dOf(out)).points);
    // The whole 30-unit square, not a 2-unit-wide band around it.
    expect(box).toEqual({ minX: 5, minY: 5, maxX: 35, maxY: 35 });
    expect((dOf(out).match(/M/gi) || []).length).toBe(1);
  });

  it('★ descends past a full-bleed background to the drawing on it', () => {
    // A traced photograph's outermost shape is the paper it was drawn on.
    // Taking roots naively gave a rectangle, so every traced photograph would
    // have made a rectangular pendant.
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
      '<rect width="40" height="40" fill="#efe9dc"/>' +
      '<path d="M10 10 H30 V30 H10 Z" fill="#111"/></svg>';
    const box = boundsOf(polygonFromPathData(dOf(silhouetteOf(svg))).points);
    expect(box).toEqual({ minX: 10, minY: 10, maxX: 30, maxY: 30 });
  });

  it('keeps the outermost shape and drops what is inside it', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
      '<path d="M2 2 H38 V38 H2 Z" fill="#000"/>' +
      '<path d="M10 10 H30 V30 H10 Z" fill="#000"/>' +
      '<path d="M16 16 H24 V24 H16 Z" fill="#000"/></svg>';
    const out = silhouetteOf(svg);
    const box = boundsOf(polygonFromPathData(dOf(out)).points);
    expect(box).toEqual({ minX: 2, minY: 2, maxX: 38, maxY: 38 });
    // One outline, not three: the inner squares are detail, not body.
    expect((dOf(out).match(/M/gi) || []).length).toBe(1);
  });

  it('a hole in the RELIEF is not a hole in the pendant', () => {
    // Someone marked the middle "cut out" so it would not print as material.
    // Sawing the body in half is not what they asked for.
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
      '<path d="M0 0 H40 V40 H0 Z" fill="#000"/>' +
      '<path d="M10 10 H30 V30 H10 Z" fill="#fff"/></svg>';
    const els = classifyElements(parseSvgElements(svg));
    expect(els.map((e) => e.role)).toEqual(['foreground', 'hole']);
    const box = boundsOf(polygonFromPathData(dOf(silhouetteOf(svg))).points);
    expect(box).toEqual({ minX: 0, minY: 0, maxX: 40, maxY: 40 });
  });

  it('keeps every separate shape when a drawing has several', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20">' +
      '<path d="M0 0 H10 V10 H0 Z" fill="#000"/>' +
      '<path d="M50 0 H60 V10 H50 Z" fill="#000"/></svg>';
    const box = boundsOf(polygonFromPathData(dOf(silhouetteOf(svg))).points);
    expect(box.minX).toBe(0);
    expect(box.maxX).toBe(60);
  });

  it('lands on the SAME canvas as the layer files', () => {
    // The body and the reliefs must share one coordinate system, or the
    // pendant and the detail on it are fitted against different boxes.
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
      '<path d="M2 2 H38 V38 H2 Z" fill="#000"/>' +
      '<path d="M10 10 H30 V30 H10 Z" fill="#000"/>' +
      '<path d="M16 16 H24 V24 H16 Z" fill="#000"/></svg>';
    const raw = parseSvgElements(svg);
    const els = classifyElements(raw);
    const tree = buildNestingTree(els);
    const meta = { viewBox: '0 0 40 40' };
    const roles = els.map((e) => e.role);
    const body = flattenSilhouette(raw, roles, meta);
    const layers = flattenLayers(
      els,
      suggestLayers(tree),
      layerLimit(tree),
      meta
    );
    const tOf = (v) => /<g transform="([^"]*)"/.exec(v)[1];
    expect(tOf(body)).toBe(tOf(layers[0]));
    expect(body).toContain('width="100mm"');
  });

  it('returns nothing when there is no shape to cut', () => {
    const els = classifyElements(parseSvgElements('<svg/>'));
    expect(flattenSilhouette(parseSvgElements('<svg/>'), [], {})).toBeNull();
    expect(flattenSilhouette(null, null, {})).toBeNull();
    expect(flattenSilhouette([], ['foreground'], {})).toBeNull();
  });
});
