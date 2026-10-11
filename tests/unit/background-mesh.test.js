/**
 * Unit tests for reading the `%` shapes' OFF, whose colors and alphas the
 * preview draws, and for the offset a centered main mesh was moved by.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest'
import {
  parseOFFWithAlpha,
  parseOFF,
  prepareOFF,
} from '../../src/js/mesh-extras.js'

// Two triangles: one with the plug's color and alpha as the engine writes
// them (0-255, alpha last), one with no color.
const OFF = [
  'OFF',
  '4 2 0',
  '0 0 0',
  '10 0 0',
  '0 10 0',
  '0 0 10',
  '3 0 1 2 135 205 235 89',
  '3 0 1 3',
  '',
].join('\n')

describe('the OFF of the % shapes', () => {
  it('keeps each face color with its alpha', () => {
    const { positions, colors } = parseOFFWithAlpha(OFF)
    expect(positions).toHaveLength(18)
    expect(colors).toHaveLength(24)
    expect(Array.from(colors.slice(0, 4)).map((c) => +c.toFixed(3))).toEqual([
      +(135 / 255).toFixed(3),
      +(205 / 255).toFixed(3),
      +(235 / 255).toFixed(3),
      +(89 / 255).toFixed(3),
    ])
  })

  it('gives a face with no color the half see-through gray', () => {
    const { colors } = parseOFFWithAlpha(OFF)
    expect(+colors[15].toFixed(3)).toBe(0.5)
    expect(+colors[12].toFixed(3)).toBe(+(180 / 255).toFixed(3))
  })

  it('gives a color with no alpha full opacity', () => {
    const { colors } = parseOFFWithAlpha(
      ['OFF', '3 1 0', '0 0 0', '1 0 0', '0 1 0', '3 0 1 2 255 0 0', ''].join(
        '\n'
      )
    )
    expect(Array.from(colors.slice(0, 4))).toEqual([1, 0, 0, 1])
  })

  it('keeps a single color, which the main mesh reader drops', () => {
    const single = [
      'OFF',
      '3 1 0',
      '0 0 0',
      '1 0 0',
      '0 1 0',
      '3 0 1 2 135 205 235 89',
      '',
    ].join('\n')
    expect(parseOFF(single).colors).toBeNull()
    expect(parseOFFWithAlpha(single).colors).toHaveLength(12)
  })
})

describe('the centred main mesh', () => {
  it('says how far it was moved, so another mesh can follow it', () => {
    const { offset } = prepareOFF(OFF)
    expect(offset).toEqual([-5, -5, -5])
  })
})
