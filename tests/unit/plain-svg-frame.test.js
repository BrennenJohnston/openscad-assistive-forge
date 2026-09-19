/**
 * D-167: a plain SVG's own frame is its paper, not a cut-out.
 *
 * Drawing programs put a background rectangle behind the artwork. Classed by
 * its luminance alone it was a Cut out, and the automatic preparation, which
 * subtracts every cut-out from everything, erased the drawing and applied an
 * empty design under "Simplified 7 shapes for 3D printing". MEASURED on the
 * bird fixture: the applied file was 210 bytes, one `<path d="">`. The
 * editor kept the bird, because its paint only cuts a hole inside a shape
 * that encloses it, so the two paths disagreed about the same drawing.
 *
 * The rule the wall already has (DP-Q53): the ground the picture sits on is
 * Off. A single light root shape that encloses every other shape is that
 * ground, whatever program drew it.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseSvgElements,
  classifyElements,
  wallRoleOverrides,
  prepareSvg,
  analyzeSvg,
} from '../../src/js/svg-preparer.js';

const BIRD = readFileSync(
  join('tests', 'fixtures', 'svg-edit', 'bird-drawing.svg'),
  'utf8'
);

const pathData = (svg) =>
  [...svg.matchAll(/\sd="([^"]*)"/g)].map((m) => m[1]).join(' ');

describe('D-167: a plain SVG’s light frame is the wall', () => {
  it('the bird’s background rectangle is Off, not Cut out', () => {
    const elements = parseSvgElements(BIRD);
    const overrides = wallRoleOverrides(elements);
    expect(overrides[0]).toBe('ignore');
    // Only the frame: the strokes and the eye keep their own roles.
    expect(Object.keys(overrides)).toEqual(['0']);
    const roles = analyzeSvg(BIRD).elements.map((el) => el.autoRole);
    expect(roles[0]).toBe('ignore');
    expect(roles.filter((r) => r === 'foreground').length).toBeGreaterThan(3);
  });

  it('the automatic preparation keeps the bird', () => {
    const out = prepareSvg(BIRD);
    // Not the 210-byte shell: real path data survives.
    expect(pathData(out).length).toBeGreaterThan(1000);
    expect(out).not.toMatch(/<path d=""/);
  });

  it('a light shape that does not enclose the artwork is still a cut-out', () => {
    // Two roots: the light square and a dark circle beside it. There is no
    // paper here, only a light shape and a dark one.
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">' +
      '<rect x="0" y="0" width="80" height="80" fill="#ffffff"/>' +
      '<circle cx="150" cy="50" r="20" fill="#000000"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    expect(wallRoleOverrides(elements)).toEqual({});
    const roles = classifyElements(elements).map((el) => el.role);
    expect(roles).toEqual(['hole', 'foreground']);
  });

  it('a dark frame is artwork, and stays', () => {
    // The rule is about the paper. A dark rectangle enclosing a light shape
    // is a plate with a hole in it, which is what was drawn.
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">' +
      '<rect x="0" y="0" width="200" height="100" fill="#000000"/>' +
      '<circle cx="100" cy="50" r="20" fill="#ffffff"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    expect(wallRoleOverrides(elements)).toEqual({});
  });
});
