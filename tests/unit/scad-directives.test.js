/**
 * include and use read as statements, everywhere the app looks for them: a
 * color named "Chartreuse" is not `use "..."`, which once raised "Missing
 * Files Detected" for a file named with a run of code.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest'
import { includeStatements } from '../../src/js/scad-directives.js'
import { extractDependencies } from '../../src/js/dependency-checker.js'
import { scanIncludes } from '../../src/js/zip-handler.js'
import { detectLibraries } from '../../src/js/library-manager.js'

// MarioWorld's shape: a color whose name ends in "use", quoted, and code up to
// the next quote.
const MARIO = [
  'include <tiles.scad>',
  'use<blocks.scad>;',
  'module brick() { color("Chartreuse") cube([1, 6, 1]); }',
  'if (x == 2) { translate([x, -9, 0]) color("Chartreuse") cube(1); }',
  'translate([0, 0, 1]) { use <parts/inner.scad> }',
].join('\n')

describe('includeStatements', () => {
  it('finds each include and use statement, and nothing inside a color name', () => {
    expect(includeStatements(MARIO)).toEqual([
      { kind: 'include', path: 'tiles.scad' },
      { kind: 'use', path: 'blocks.scad' },
      { kind: 'use', path: 'parts/inner.scad' },
    ])
  })

  it('takes a statement after a semicolon on the same line, quoted or angled', () => {
    expect(includeStatements('a = 1; include "x.scad"; use <y.scad>')).toEqual([
      { kind: 'include', path: 'x.scad' },
      { kind: 'use', path: 'y.scad' },
    ])
  })

  it('reads the angled form wherever the word stands whole, as OpenSCAD does', () => {
    expect(
      includeStatements('include <a.scad> include <b.scad>\nreuse <c.scad>')
    ).toEqual([
      { kind: 'include', path: 'a.scad' },
      { kind: 'include', path: 'b.scad' },
    ])
  })

  it('reads nothing inside a string', () => {
    expect(
      includeStatements('echo("include <a.txt>", "say \\"use <b>\\"");\nuse <c.scad>')
    ).toEqual([{ kind: 'use', path: 'c.scad' }])
  })
})

describe('everything that reads include and use', () => {
  it('the dependency check finds no file named by a color', () => {
    const deps = extractDependencies(MARIO)
    expect(deps.includes).toEqual(['tiles.scad'])
    expect(deps.uses).toEqual(['blocks.scad', 'parts/inner.scad'])
  })

  it('the ZIP scan returns the statements alone', () => {
    expect(scanIncludes(MARIO)).toEqual([
      'include <tiles.scad>',
      'use <blocks.scad>',
      'use <parts/inner.scad>',
    ])
  })

  it('the library detector reads the same statements', () => {
    expect(
      detectLibraries('use <BOSL2/std.scad>\ncolor("Chartreuse") cube(1);')
    ).toEqual(['BOSL2'])
  })
})

describe('a computed import name', () => {
  it('becomes a pattern from its literal pieces', () => {
    const deps = extractDependencies(
      'for (n = [1:8]) translate([n * 10, 0]) import(str("frog_", n, ".stl"));'
    )
    expect(deps.imports).toEqual([])
    expect(deps.importPatterns).toHaveLength(1)
    const pattern = new RegExp(deps.importPatterns[0], 'i')
    expect(pattern.test('frog_3.stl')).toBe(true)
    expect(pattern.test('src/frog_12.stl')).toBe(true)
    expect(pattern.test('toad_3.stl')).toBe(false)
    expect(pattern.test('frog_3.stl.bak')).toBe(false)
  })
})
