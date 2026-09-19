/**
 * Bridge-less multi-layer stencil plates (DP-12).
 *
 * The property that makes this method worth having is that NO CUT IS EVER A
 * RING, so nothing is ever left connected to nothing and no bridge has to
 * cross the artwork. Most of these cases are about that, and about the plates
 * agreeing with each other well enough that the second colour lands on the
 * first.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import {
  MARK_ARM_MM,
  registrationMarks,
  plateFit,
  buildStencilPlate,
  plateLabel,
  paintSequence,
  stencilLayers,
  scaleTranslatePath,
  CUT_COLOR,
  ENGRAVE_COLOR,
  buildLaserSheet,
} from '../../src/js/stencil-plates.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseSvgElements,
  classifyElements,
  flattenLayers,
} from '../../src/js/svg-preparer.js';
import {
  buildNestingTree,
  suggestLayers,
  layerLimit,
  polygonFromPathData,
  signedArea,
} from '../../src/js/svg-nesting.js';

/** A letter A with its counter: one island inside another. */
const LETTER_A =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
  '<path d="M10 90 L50 10 L90 90 Z" fill="#000"/>' +
  '<path d="M40 70 L50 45 L60 70 Z" fill="#fff"/></svg>';

function cutsFor(svgText, options = { solid: true }) {
  const els = classifyElements(parseSvgElements(svgText));
  const tree = buildNestingTree(els);
  return flattenLayers(
    els,
    suggestLayers(tree),
    layerLimit(tree),
    { viewBox: '0 0 100 100' },
    null,
    options
  );
}

const dOf = (svg) => / d="([^"]*)"/.exec(svg)[1];

describe('★★ the bridge-less property', () => {
  it('every plate cuts ONE solid region, never a ring', () => {
    // This is the whole method. Plate 1 cuts the A INCLUDING where its
    // counter will be, because the counter belongs to a deeper layer and is
    // cut at layer 1 too. So the counter is not an island on plate 1, and
    // nothing needs a tie holding it.
    const cuts = cutsFor(LETTER_A);
    expect(cuts.filter(Boolean)).toHaveLength(2);
    for (const cut of cuts.filter(Boolean)) {
      expect((dOf(cut).match(/M/gi) || []).length).toBe(1);
    }
  });

  it('without solid mode the counter becomes a hole, and an island', () => {
    // MEASURED, and the reason the option exists: honouring the hole role
    // gives the A two subpaths - a ring - and its counter would drop out.
    // Layer 2 comes back NULL as well, because a compound path whose only
    // element is a hole is nothing at all.
    const cuts = cutsFor(LETTER_A, {});
    expect((dOf(cuts[0]).match(/M/gi) || []).length).toBe(2);
    expect(cuts[1]).toBeNull();
  });

  it('a deeper plate cuts strictly less than the one before it', () => {
    // Plate 2 protects layer 1 by NOT cutting it. If a later plate cut more
    // than an earlier one, the coat would spill onto paint it should protect.
    const cuts = cutsFor(LETTER_A).filter(Boolean);
    // Real area, not a count of path commands: two triangles have the same
    // number of commands and the first version of this case compared 4 with
    // 4 and told me nothing.
    const area = (d) => Math.abs(signedArea(polygonFromPathData(d).points));
    const outer = area(dOf(cuts[0]));
    const inner = area(dOf(cuts[1]));
    expect(inner).toBeGreaterThan(0);
    expect(inner).toBeLessThan(outer);
  });
});

describe('registrationMarks', () => {
  it('puts four crosses on the plate, each drawn as two bars', () => {
    const d = registrationMarks(200, 200);
    // Four crosses, two subpaths each.
    expect((d.match(/M/g) || []).length).toBe(8);
  });

  it('draws each cross as two bars, not one outline', () => {
    // Under even-odd, one cross-shaped outline would cancel where the arms
    // overlap and leave a square hole in the middle of every mark.
    const d = registrationMarks(100, 100);
    const first = d.split('M').filter(Boolean)[0];
    expect(first).toMatch(/H .* V .* H .* Z/);
  });

  it('the marks are the same on every plate, because that is their job', () => {
    expect(registrationMarks(200, 150)).toBe(registrationMarks(200, 150));
    expect(MARK_ARM_MM).toBeGreaterThan(0);
  });
});

describe('plateFit', () => {
  const base = {
    canvasSpan: 100,
    canvasHeight: 50,
    plateW: 200,
    plateH: 200,
    marginMm: 15,
  };

  it('contains the design inside the margin on both axes', () => {
    const f = plateFit(base);
    expect(f.scale * base.canvasSpan).toBeLessThanOrEqual(200 - 30 + 1e-9);
    expect(f.scale * base.canvasHeight).toBeLessThanOrEqual(200 - 30 + 1e-9);
  });

  it('centres the design on the plate', () => {
    const f = plateFit(base);
    expect(f.dx + (f.scale * base.canvasSpan) / 2).toBeCloseTo(100, 6);
    expect(f.dy + (f.scale * base.canvasHeight) / 2).toBeCloseTo(100, 6);
  });

  it('★ gives EVERY plate the same fit, or the colours miss each other', () => {
    // Two plates of the same design differ only in what they cut. If the fit
    // were computed from each cut's own extent, plate 2 would be scaled up to
    // the margin box and the second colour would land nowhere near the first.
    const a = plateFit(base);
    const b = plateFit({ ...base });
    expect(a).toEqual(b);
  });

  it('scales down by percent without moving the centre', () => {
    const half = plateFit({ ...base, scalePercent: 50 });
    const full = plateFit(base);
    expect(half.scale).toBeCloseTo(full.scale / 2, 6);
    expect(half.dx + (half.scale * base.canvasSpan) / 2).toBeCloseTo(100, 6);
  });
});

describe('buildStencilPlate', () => {
  const args = {
    cutPathData: 'M 10 10 H 90 V 40 H 10 Z',
    canvasSpan: 100,
    canvasHeight: 50,
    plateW: 200,
    plateH: 150,
    marginMm: 15,
    layer: 1,
    layerCount: 3,
  };

  it('writes the plate, the cuts and the marks into one file', () => {
    const { svg } = buildStencilPlate(args);
    expect(svg).toContain('width="200mm"');
    expect(svg).toContain('viewBox="0 0 200 150"');
    expect(svg).toContain('fill-rule="evenodd"');
    // ONE path: outline, then marks, then the cut with its fit BAKED IN.
    // Measured: two separate <path> elements are unioned on import, so a cut
    // in its own path cuts nothing.
    expect(svg).toContain('M 0 0 H 200 V 150 H 0 Z');
    expect(svg).not.toContain('<g transform=');
    expect((svg.match(/<path/g) || []).length).toBe(1);
    // The cut is present, moved and scaled onto the plate rather than verbatim.
    expect(svg).not.toContain(args.cutPathData);
    expect((svg.match(/M /g) || []).length).toBeGreaterThan(9);
  });

  it('is in millimetres, so the .scad can stay a dumb extruder', () => {
    // A width with no unit is pixels at 72 dpi, and the plate would come out
    // a third of its size.
    const { svg } = buildStencilPlate(args);
    expect(svg).toMatch(/width="[\d.]+mm"/);
    expect(svg).toMatch(/height="[\d.]+mm"/);
  });

  it('can leave the marks off when asked', () => {
    const withMarks = buildStencilPlate(args).svg;
    const without = buildStencilPlate({ ...args, marks: false }).svg;
    expect((without.match(/M /g) || []).length).toBeLessThan(
      (withMarks.match(/M /g) || []).length
    );
  });

  it('names the plate so a stack of them is not a puzzle', () => {
    expect(buildStencilPlate(args).label).toBe('Plate 1 of 3');
    expect(plateLabel(3, 3)).toBe('Plate 3 of 3');
  });

  it('a layer with nothing to cut still makes a plate', () => {
    // A blank plate is a truthful answer: that layer paints nothing.
    const { svg } = buildStencilPlate({ ...args, cutPathData: null });
    expect(svg).toContain('M 0 0 H 200 V 150 H 0 Z');
    // Plate and marks only: nine subpaths, no cut.
    expect((svg.match(/M /g) || []).length).toBe(9);
  });
});

describe('paintSequence', () => {
  it('says what to do with each plate, in order', () => {
    const steps = paintSequence(3);
    expect(steps).toHaveLength(3);
    expect(steps[0]).toMatch(/bare surface/);
    expect(steps[1]).toMatch(/line it up on the marks/);
    expect(steps[2]).toMatch(/3 deep or deeper/);
  });

  it('never uses an em dash', () => {
    for (const s of paintSequence(3)) expect(s).not.toContain('—');
  });

  it('a single-plate design gets a single instruction', () => {
    expect(paintSequence(1)).toHaveLength(1);
  });
});

describe('stencilLayers - which shape is the paper', () => {
  const treeOf = (svgText) => {
    const els = classifyElements(parseSvgElements(svgText));
    const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svgText);
    return {
      tree: buildNestingTree(els),
      roles: els.map((e) => e.role),
      canvas: { width: parseFloat(vb[1]), height: parseFloat(vb[2]) },
    };
  };

  it('★ steps past a LIGHT full-bleed background', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
      '<rect width="40" height="40" fill="#efe9dc"/>' +
      '<path d="M10 10 H30 V30 H10 Z" fill="#111"/></svg>';
    const { tree, roles, canvas } = treeOf(svg);
    const { layers, plateCount } = stencilLayers(tree, roles, 3, canvas);
    expect(layers[0]).toBe(0);
    expect(layers[1]).toBe(1);
    expect(plateCount).toBe(1);
  });

  it('★ steps past a DARK full-bleed background too', () => {
    // COLOUR CANNOT ANSWER THIS. The owner's own traced mark has a dark
    // rgb(54,59,127) full-bleed rect that reads as foreground. Judged on
    // colour, plate 1 cut a rectangle the size of the whole image - and the
    // union of everything under it took 54.5 SECONDS to flatten against
    // 228 ms once it was excluded.
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
      '<rect width="40" height="40" fill="rgb(54,59,127)"/>' +
      '<path d="M10 10 H30 V30 H10 Z" fill="#eee"/></svg>';
    const { tree, roles, canvas } = treeOf(svg);
    // The inner shape here is LIGHT on a dark ground - content, not paper.
    const { layers } = stencilLayers(tree, roles, 3, canvas);
    expect(layers[0]).toBe(0);
    expect(layers[1]).toBe(1);
  });

  it('does NOT step past a large shape with nothing drawn on it', () => {
    // A full-bleed shape that is the whole design IS the design.
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
      '<rect width="40" height="40" fill="#111"/></svg>';
    const { tree, roles, canvas } = treeOf(svg);
    expect(stencilLayers(tree, roles, 3, canvas).layers[0]).toBe(1);
  });

  it('numbers nested islands 1, 2, 3 from the drawing, not the paper', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<rect width="100" height="100" fill="#efe9dc"/>' +
      '<path d="M5 5 H95 V95 H5 Z" fill="#111"/>' +
      '<path d="M20 20 H80 V80 H20 Z" fill="#eee"/>' +
      '<path d="M40 40 H60 V60 H40 Z" fill="#111"/></svg>';
    const { tree, roles, canvas } = treeOf(svg);
    const { layers, plateCount } = stencilLayers(tree, roles, 3, canvas);
    expect(layers).toEqual([0, 1, 2, 3]);
    expect(plateCount).toBe(3);
  });

  it('never numbers past the cap', () => {
    const parts = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
    ];
    for (let i = 0; i < 6; i++) {
      const at = i * 7;
      parts.push(
        `<path d="M${at} ${at} H${100 - at} V${100 - at} H${at} Z" fill="#111"/>`
      );
    }
    parts.push('</svg>');
    const { tree, roles, canvas } = treeOf(parts.join(''));
    const { layers, plateCount } = stencilLayers(tree, roles, 3, canvas);
    expect(Math.max(...layers)).toBe(3);
    expect(plateCount).toBe(3);
  });

  it('leaves an ignored shape uncut', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
      '<path d="M0 0 H40 V40 H0 Z" fill="#111"/></svg>';
    const { tree, canvas } = treeOf(svg);
    expect(stencilLayers(tree, ['ignore'], 3, canvas).layers[0]).toBe(0);
  });

  it('survives nonsense', () => {
    expect(stencilLayers(null, []).plateCount).toBe(0);
    expect(stencilLayers({ nodes: [], roots: [] }, []).layers).toEqual([]);
  });
});

describe('scaleTranslatePath', () => {
  it('moves and scales every coordinate', () => {
    const out = scaleTranslatePath('M 0 0 H 10 V 10 H 0 Z', 2, 5, 5);
    const nums = out.match(/-?\d+(\.\d+)?/g).map(Number);
    expect(Math.min(...nums)).toBeCloseTo(5, 6);
    expect(Math.max(...nums)).toBeCloseTo(25, 6);
  });

  it('keeps the closing command', () => {
    expect(scaleTranslatePath('M 0 0 H 10 V 10 Z', 1, 0, 0)).toContain('Z');
  });

  it('survives nonsense rather than throwing', () => {
    expect(scaleTranslatePath('', 1, 0, 0)).toBe('');
    expect(scaleTranslatePath(null, 1, 0, 0)).toBe('');
  });
});

describe('the backdrop rule measures against the CANVAS', () => {
  it('★ does NOT eat a design whose outer shape merely is the largest', () => {
    // The first version compared a root's area with the LARGEST area in the
    // drawing. The outermost shape is always the largest, so every root with
    // children was called paper: three nested squares lost their outer square
    // and the stencil came out a plate short. Measured against the canvas
    // instead, they cover 81 per cent and are all design.
    const els = classifyElements(
      parseSvgElements(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
          '<path d="M2 2 H38 V38 H2 Z" fill="#000"/>' +
          '<path d="M10 10 H30 V30 H10 Z" fill="#000"/>' +
          '<path d="M16 16 H24 V24 H16 Z" fill="#000"/></svg>'
      )
    );
    const tree = buildNestingTree(els);
    const roles = els.map((e) => e.role);
    const { layers, plateCount } = stencilLayers(tree, roles, 3, {
      width: 40,
      height: 40,
    });
    expect(layers).toEqual([1, 2, 3]);
    expect(plateCount).toBe(3);
  });

  it('with no canvas given, nothing is treated as paper', () => {
    // The safe way to be wrong: a stencil with an extra plate beats one with
    // its middle missing.
    const els = classifyElements(
      parseSvgElements(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
          '<rect width="40" height="40" fill="#efe9dc"/>' +
          '<path d="M10 10 H30 V30 H10 Z" fill="#111"/></svg>'
      )
    );
    const tree = buildNestingTree(els);
    const roles = els.map((e) => e.role);
    expect(stencilLayers(tree, roles, 3, null).layers[0]).toBe(1);
  });
});

describe('cut and engrave arrive as separate colours (DP-13)', () => {
  const args = {
    cutPathData: 'M 10 10 H 90 V 40 H 10 Z',
    canvasSpan: 100,
    canvasHeight: 50,
    plateW: 200,
    plateH: 150,
    marginMm: 15,
    layer: 2,
    layerCount: 3,
  };

  it('cuts in one colour so a laser can map it to an operation', () => {
    const { svg } = buildStencilPlate(args);
    expect(svg).toContain(`fill="${CUT_COLOR}"`);
    expect(CUT_COLOR).toBe('#000000');
  });

  it('★ an engraved label is a DIFFERENT colour, or it gets cut out', () => {
    // Laser software decides what to do with a line by its colour. A label in
    // the cut colour is not a label: it is a hole in the shape of some words.
    const { svg } = buildStencilPlate({ ...args, engraveLabel: true });
    expect(svg).toContain(ENGRAVE_COLOR);
    expect(ENGRAVE_COLOR).not.toBe(CUT_COLOR);
    expect(svg).toContain('Plate 2 of 3');
  });

  it('leaves the label out entirely when it is not wanted', () => {
    // An empty layer is a thing to explain rather than a thing to use.
    const { svg } = buildStencilPlate(args);
    expect(svg).not.toContain('<text');
    expect(svg).not.toContain(ENGRAVE_COLOR);
  });

  it('the label is stroked, not filled, so it scores rather than floods', () => {
    const { svg } = buildStencilPlate({ ...args, engraveLabel: true });
    expect(svg).toMatch(/<text[^>]*fill="none"/);
    expect(svg).toMatch(/<text[^>]*stroke="#FF0000"/);
  });
});

describe('buildLaserSheet - one sheet, cut once (DP-13)', () => {
  const base = {
    cutPathData: 'M 20 20 H 80 V 80 H 20 Z M 40 40 H 60 V 60 H 40 Z',
    canvasSpan: 100,
    canvasHeight: 100,
    plateW: 200,
    plateH: 200,
    marginMm: 15,
  };

  it('writes plate, marks and cuts as one even-odd path in mm', () => {
    const { svg } = buildLaserSheet(base);
    expect(svg).toContain('width="200mm"');
    expect(svg).toContain('fill-rule="evenodd"');
    expect((svg.match(/<path/g) || []).length).toBe(1);
  });

  it('★ a bridge puts material BACK into the cut', () => {
    // MEASURED through the engine: 300 facets without ribs, 388 with two.
    // Under even-odd a rib inside a cut cancels back to material, which is
    // exactly what a bridge is - the cut with a piece put back.
    const without = buildLaserSheet(base).svg;
    const withRibs = buildLaserSheet({
      ...base,
      bridgePathData: 'M 45 48 H 55 V 52 H 45 Z',
    }).svg;
    const count = (s) => (s.match(/M /g) || []).length;
    expect(count(withRibs)).toBe(count(without) + 1);
  });

  it('is TRUE SIZE: no kerf is taken out here', () => {
    // LightBurn, LaserGRBL, xTool and Glowforge all offset for kerf
    // themselves. Two corrections make the part undersized by a full kerf
    // with nothing on screen to show it.
    const src = readFileSync(
      resolve(process.cwd(), 'src/js/stencil-plates.js'),
      'utf8'
    );
    const body = src.slice(
      src.indexOf('export function buildLaserSheet('),
      src.indexOf('export function stencilLayers(')
    );
    expect(body).not.toMatch(/kerf/i);
    expect(body).not.toMatch(/offset\(/);
  });

  it('cuts in the cut colour', () => {
    expect(buildLaserSheet(base).svg).toContain(`fill="${CUT_COLOR}"`);
  });

  it('still makes a sheet when there is nothing to cut', () => {
    const { svg } = buildLaserSheet({ ...base, cutPathData: null });
    expect(svg).toContain('M 0 0 H 200 V 200 H 0 Z');
  });
});
