/**
 * D-120 (DP-26 P1): the relief flatten goes through the ring engine.
 *
 * The fixture is the app's own logo: 139 stroke elements, all converted to
 * bands. MEASURED on the old pairwise path-bool flatten: it does not merely
 * corrupt this drawing - it exhausts an 8 GB node heap and dies, so there
 * is no before-number to print. The read-only reference (each element
 * interpreted even-odd on its own, all regions combined NonZero) reads
 * 1,280 rings covering 1,265 svg units squared, in seconds.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
globalThis.DOMParser = dom.window.DOMParser
globalThis.XMLSerializer = dom.window.XMLSerializer
globalThis.Node = dom.window.Node
globalThis.document = dom.window.document

const { analyzeSvg, classifyElements } = await import(
  '../../src/js/svg-preparer.js'
)
const { flattenWithRings } = await import(
  '../../src/js/svg-preparer-workspace.js'
)
const engine = await import('../../src/js/ring-geometry.js')

const LOGO = readFileSync(join('public', 'icons', 'logo.svg'), 'utf8')

const areaOfOutput = (svgString) => {
  const m = /d="([^"]*)"/.exec(svgString)
  if (!m) return 0
  return engine.regionArea(engine.evenOddUnion(engine.ringsFromPathData(m[1])))
}

describe('the ring flatten (D-120)', () => {
  const els = classifyElements(analyzeSvg(LOGO).elements)

  it(
    '★ the logo survives whole: 139 converted strokes, one bounded pass',
    () => {
      expect(els).toHaveLength(139)
      expect(els.every((el) => el.strokeConverted)).toBe(true)

      const out = flattenWithRings(engine, els, {})
      expect(out).toBeTruthy()
      const area = areaOfOutput(out)
      // MEASURED at the fix: the true union of the logo's 139 band regions
      // covers 1,118.6 svg units squared. (A one-shot NonZero union of all
      // rings in a single list read 1,265 - winding sums across regions
      // OVERCOUNT; the fold is the union of sets.) The band pins survival:
      // neither gutted nor doubled.
      expect(area).toBeGreaterThan(1000)
      expect(area).toBeLessThan(1400)
    },
    45000
  )

  it(
    '★ order cannot change the picture: reversed input, equal area',
    () => {
      const a = areaOfOutput(flattenWithRings(engine, els, {}))
      const b = areaOfOutput(flattenWithRings(engine, [...els].reverse(), {}))
      // The union of sets does not care about order; the integer scaling
      // inside clipper leaves a rounding whisper between fold orders -
      // MEASURED at 0.04 units squared in 1,118 (four parts in a hundred
      // thousand). The pin holds the SEMANTIC equality with that whisper.
      expect(Math.abs(a - b)).toBeLessThan(a * 0.001)
    },
    // Two full logo folds; MEASURED at 16 s under the full board's worker
    // contention, well inside the default alone.
    45000
  )

  it('★ the bird does not cancel itself: regions fold one at a time', () => {
    // Six healthy foreground regions - and a one-shot NonZero union of all
    // their rings in a single subject returned EMPTY, because windings sum
    // across regions: a solid ring inside another region's counter counts
    // +1 - 1 = 0. The fold of true unions keeps every region.
    const bird = readFileSync(
      join('tests', 'fixtures', 'svg-edit', 'bird-drawing.svg'),
      'utf8'
    )
    const birdEls = classifyElements(analyzeSvg(bird).elements)
    expect(
      birdEls.filter((el) => el.role === 'foreground').length
    ).toBeGreaterThan(3)
    const out = flattenWithRings(engine, birdEls, {})
    expect(out).toBeTruthy()
    const area = areaOfOutput(out)
    expect(area).toBeGreaterThan(1000)
  })

  it('holes subtract, and a counter stays a counter', () => {
    const square = {
      role: 'foreground',
      pathData: 'M 0 0 H 100 V 100 H 0 Z',
    }
    const hole = {
      role: 'hole',
      pathData: 'M 25 25 H 75 V 75 H 25 Z',
    }
    const out = flattenWithRings(engine, [square, hole], {})
    const area = areaOfOutput(out)
    expect(area).toBeGreaterThan(10000 - 2500 - 50)
    expect(area).toBeLessThan(10000 - 2500 + 50)
  })

  it('an unreadable element is appended verbatim and counted, never dropped', () => {
    const square = {
      role: 'foreground',
      pathData: 'M 0 0 H 100 V 100 H 0 Z',
    }
    const broken = { role: 'foreground', pathData: 'M 1 1 L' }
    const warnings = []
    const out = flattenWithRings(engine, [square, broken], {}, warnings)
    expect(out).toContain('M 1 1 L')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('1 shape(s)')
  })

  it('no foreground means no result, exactly as the old contract said', () => {
    expect(
      flattenWithRings(engine, [{ role: 'hole', pathData: 'M 0 0 H 1 V 1 Z' }], {})
    ).toBeNull()
  })
})
