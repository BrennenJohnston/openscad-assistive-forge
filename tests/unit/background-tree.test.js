/**
 * Unit tests for cutting a model's CSG tree down to its `%` shapes.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import {
  backgroundTreeFromCsg,
  mayUseBackgroundModifier,
} from '../../src/js/background-tree.js'

const TREE = readFileSync(
  resolve(process.cwd(), 'tests/fixtures/background/tree.csg'),
  'utf8'
)

describe('the % shapes of a model', () => {
  const background = backgroundTreeFromCsg(TREE)

  it('keeps every % shape, unmarked so it renders', () => {
    expect(background).toContain('cylinder($fn = 24')
    expect(background).toContain('sphere($fn = 16')
    expect(background.match(/cube\(size = \[4, 4, 4\]/g)).toHaveLength(2)
    expect(background).not.toContain('%')
  })

  it('keeps the placing and the color above each one', () => {
    expect(background).toContain(
      'multmatrix([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, -10], [0, 0, 0, 1]])'
    )
    expect(background).toContain('color([0.529412, 0.807843, 0.921569, 0.35])')
    expect(background).toContain(
      'multmatrix([[1, 0, 0, 40], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]])'
    )
  })

  // An outer color wins in the engine's colored render, so the colored
  // plug must not be wrapped; the three uncolored shapes are.
  it('grays each uncolored % shape and leaves a colored one its color', () => {
    const grays = background.match(
      /color\(\[0\.705882, 0\.705882, 0\.705882, 0\.5\]\)/g
    )
    expect(grays).toHaveLength(3)
    const plug = background.indexOf('color([0.529412')
    expect(background.lastIndexOf('color([0.705882', plug)).toBe(-1)
  })

  it('leaves out the body and turns the boolean above them into a group', () => {
    expect(background).not.toContain('cube(size = [20, 20, 20]')
    expect(background).not.toContain('difference')
    expect(background.startsWith('group() {')).toBe(true)
  })

  it('is null for a model with no % shapes', () => {
    expect(
      backgroundTreeFromCsg('difference() {\n\tcube(size = [1, 1, 1]);\n}\n')
    ).toBeNull()
    expect(backgroundTreeFromCsg('')).toBeNull()
  })

  it('drops a disabled (*) branch even inside a kept parent', () => {
    const csg = [
      'group() {',
      '%\tcube(size = [1, 1, 1], center = false);',
      '*\tsphere(r = 2);',
      '}',
    ].join('\n')
    const out = backgroundTreeFromCsg(csg)
    expect(out).toContain('cube(size = [1, 1, 1]')
    expect(out).not.toContain('sphere')
  })
})

describe('whether source may use the % modifier', () => {
  it.each([
    '%cube(1);',
    'translate([1, 0, 0]) %sphere(2);',
    'difference() { cube(5); %cylinder(r = 1, h = 9); }',
    '%color("SkyBlue", 0.35) plug();',
  ])('%s: yes', (source) => {
    expect(mayUseBackgroundModifier(source)).toBe(true)
  })

  it.each([
    'cube(5); // fill 50% of the box',
    'echo("100% done"); cube(1);',
    'x = 7 % 3; cube(x);',
    'cube(1);',
  ])('%s: no', (source) => {
    expect(mayUseBackgroundModifier(source)).toBe(false)
  })
})
