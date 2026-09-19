/**
 * Cropping a vector drawing (DP-49).
 *
 * A crop of a drawing is a clip: every shape's rings intersected with the
 * kept rectangle, shapes the clip empties dropped, the picture's box rewritten
 * to the rectangle. Tested apart from the crop view because a wrong clip is
 * quiet: the drawing still opens, the shapes are just not the ones a person
 * kept.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { cropSvgDrawing } from '../../src/js/svg-crop.js';
import { parseSvgElements } from '../../src/js/svg-preparer.js';
import { ringsFromPathData, regionArea } from '../../src/js/ring-geometry.js';

const NS = 'http://www.w3.org/2000/svg';

function drawing(inner, box = '0 0 200 100') {
  return `<svg xmlns="${NS}" viewBox="${box}" width="200" height="100">${inner}</svg>`;
}

function areaOfKept(svg) {
  return parseSvgElements(svg).map((el) =>
    Math.abs(regionArea(ringsFromPathData(el.pathData)))
  );
}

function root(svg) {
  return new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
}

describe('cropSvgDrawing', () => {
  it('★ keeps a shape inside the rectangle whole, clips one on the edge, drops one outside', () => {
    const svg = drawing(
      '<rect x="10" y="10" width="20" height="20" fill="#111"/>' +
        '<rect x="90" y="10" width="40" height="20" fill="#222"/>' +
        '<rect x="150" y="10" width="20" height="20" fill="#333"/>'
    );
    const out = cropSvgDrawing(svg, { x: 0, y: 0, width: 100, height: 100 });
    expect(out.kept).toBe(2);
    expect(out.dropped).toBe(1);
    const areas = areaOfKept(out.svg);
    expect(areas).toHaveLength(2);
    expect(areas[0]).toBeCloseTo(400, 3);
    // 90..130 clipped at 100: 10 by 20.
    expect(areas[1]).toBeCloseTo(200, 3);
  });

  it('★ the box becomes the rectangle, in the same units', () => {
    const svg = drawing('<rect x="10" y="10" width="20" height="20"/>');
    const out = cropSvgDrawing(svg, { x: 5, y: 8, width: 60, height: 40 });
    const el = root(out.svg);
    expect(el.getAttribute('viewBox')).toBe('5 8 60 40');
    expect(el.getAttribute('width')).toBe('60');
    expect(el.getAttribute('height')).toBe('40');
  });

  it('★ a hole survives the clip as a hole', () => {
    // A 40 by 40 square with a 20 by 20 hole, drawn as one path.
    const svg = drawing(
      '<path d="M10,10h40v40h-40z M20,20v20h20v-20z" fill="#000"/>'
    );
    const out = cropSvgDrawing(svg, { x: 0, y: 0, width: 200, height: 100 });
    expect(out.kept).toBe(1);
    const shapes = parseSvgElements(out.svg);
    const total = shapes.reduce(
      (sum, el) => sum + regionArea(ringsFromPathData(el.pathData)),
      0
    );
    // 1600 minus 400, whichever way the parser hands the rings back.
    expect(Math.abs(total)).toBeCloseTo(1200, 3);
  });

  it('bakes a transform before clipping', () => {
    const svg = drawing(
      '<rect x="0" y="0" width="20" height="20" transform="translate(150 10)"/>'
    );
    // The rectangle sits at 150..170 once translated; a crop of the left
    // half drops it, a crop of the right half keeps it whole.
    expect(
      cropSvgDrawing(svg, { x: 0, y: 0, width: 100, height: 100 }).kept
    ).toBe(0);
    const out = cropSvgDrawing(svg, { x: 100, y: 0, width: 100, height: 100 });
    expect(out.kept).toBe(1);
    expect(areaOfKept(out.svg)[0]).toBeCloseTo(400, 3);
  });

  it('keeps the paint and the flags a shape carried', () => {
    const svg = drawing(
      '<g fill="#abcdef"><rect x="10" y="10" width="20" height="20" data-background="true" class="wall"/></g>'
    );
    const out = cropSvgDrawing(svg, { x: 0, y: 0, width: 100, height: 100 });
    const path = root(out.svg).querySelector('path');
    expect(path).not.toBeNull();
    expect(path.getAttribute('fill')).toBe('#abcdef');
    expect(path.getAttribute('data-background')).toBe('true');
    expect(path.getAttribute('class')).toBe('wall');
    expect(path.hasAttribute('transform')).toBe(false);
    expect(path.hasAttribute('x')).toBe(false);
  });

  it('ignores what does not render', () => {
    const svg = drawing(
      '<defs><rect id="tpl" x="10" y="10" width="20" height="20"/></defs>' +
        '<rect x="40" y="10" width="20" height="20"/>'
    );
    const out = cropSvgDrawing(svg, { x: 0, y: 0, width: 200, height: 100 });
    expect(out.kept).toBe(1);
    expect(out.dropped).toBe(0);
  });

  it('pulls a rectangle back inside the box, and refuses an empty one', () => {
    const svg = drawing('<rect x="10" y="10" width="20" height="20"/>');
    const out = cropSvgDrawing(svg, { x: -50, y: -50, width: 500, height: 500 });
    expect(root(out.svg).getAttribute('viewBox')).toBe('0 0 200 100');
    expect(out.kept).toBe(1);
    expect(() =>
      cropSvgDrawing(svg, { x: 10, y: 10, width: 0, height: 20 })
    ).toThrow();
  });

  it('a crop that keeps nothing still returns a drawing, with nothing in it', () => {
    const svg = drawing('<rect x="10" y="10" width="20" height="20"/>');
    const out = cropSvgDrawing(svg, { x: 100, y: 0, width: 100, height: 100 });
    expect(out.kept).toBe(0);
    expect(out.dropped).toBe(1);
    expect(parseSvgElements(out.svg)).toHaveLength(0);
    expect(root(out.svg).getAttribute('viewBox')).toBe('100 0 100 100');
  });

  it('reads the box from width and height when there is no viewBox', () => {
    const svg = `<svg xmlns="${NS}" width="200" height="100"><rect x="10" y="10" width="20" height="20"/></svg>`;
    const out = cropSvgDrawing(svg, { x: 0, y: 0, width: 50, height: 50 });
    expect(out.kept).toBe(1);
    expect(root(out.svg).getAttribute('viewBox')).toBe('0 0 50 50');
  });
});
