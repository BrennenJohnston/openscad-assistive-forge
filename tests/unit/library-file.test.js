/**
 * A file that only defines modules and functions draws nothing on its own,
 * and says so plainly instead of sending a person to look for an option.
 * The detector reads the source's top level, comments and strings aside.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { isLibraryOnlySource } from '../../src/worker/library-file.js';

describe('a file that only defines modules and functions', () => {
  it('a library of functions, like a turtle-graphics helper', () => {
    const turtleLike = `
// Turtle graphics, as functions.
use <MCAD/math.scad>
include <helpers.scad>

step = 10; // the default step

function turtle(x, y, angle) = [[x, y], angle];

/* forward moves the turtle;
   cube(1); in a comment draws nothing */
function forward(t, length) =
  [[t[0][0] + length * cos(t[1]), t[0][1] + length * sin(t[1])], t[1]];

function turn(t, angle) = [t[0], t[1] + angle];
`;
    expect(isLibraryOnlySource(turtleLike)).toBe(true);
  });

  it('modules count too, with braces in their strings', () => {
    expect(
      isLibraryOnlySource(`
module label(t) { echo("a } in a string"); text(t); }
module plate(w = 10) {
  difference() { cube(w); translate([1, 1, 1]) cube(w - 2); }
}
`)
    ).toBe(true);
  });
});

describe('a model that draws, or only assigns', () => {
  it('a model whose shapes cancel out is not a library', () => {
    expect(
      isLibraryOnlySource('difference() { cube(10); cube(20, center = true); }')
    ).toBe(false);
  });

  it('a module that is called is not a library', () => {
    expect(isLibraryOnlySource('module m() { cube(1); }\nm();')).toBe(false);
    expect(isLibraryOnlySource('module m() { cube(1); }\n!m();')).toBe(false);
    expect(
      isLibraryOnlySource('function f(x) = x;\nfor (i = [0:2]) cube(i);')
    ).toBe(false);
  });

  it('assignments alone, or nothing at all, are not a library', () => {
    expect(isLibraryOnlySource('width = 10;\n$fn = 64;')).toBe(false);
    expect(isLibraryOnlySource('// nothing here')).toBe(false);
    expect(isLibraryOnlySource('')).toBe(false);
    expect(isLibraryOnlySource(null)).toBe(false);
  });
});
