/**
 * D-123 (DP-26 P2): the curve entities OpenSCAD's importer does not read
 * are evaluated to line chains before the engine sees the file.
 *
 * The fixture is the owner's own Fusion sketch: 31 SPLINE, 2 ELLIPSE,
 * 1 LINE. MEASURED before the fix, through the whole door: the editor
 * showed TWO shapes of the 34 and said nothing was missing.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { evaluateDxfCurves } from '../../src/js/dxf-convert.js'

const SKETCH = readFileSync(
  join('tests', 'fixtures', 'harley', 'sketch4.dxf'),
  'utf8'
)

const count = (text, entity) =>
  (text.match(new RegExp(`^${entity}\\r?$`, 'gm')) || []).length

describe('evaluateDxfCurves (D-123)', () => {
  const result = evaluateDxfCurves(SKETCH)

  it('★ evaluates all 31 splines and both ellipses of the owner sketch', () => {
    expect(result.splines).toBe(31)
    expect(result.ellipses).toBe(2)
  })

  it('leaves no SPLINE or ELLIPSE behind for the importer to drop', () => {
    expect(count(result.text, 'SPLINE')).toBe(0)
    expect(count(result.text, 'ELLIPSE')).toBe(0)
  })

  it('emits line chains dense enough to be the curves', () => {
    // 33 curves at a handful of segments each; the fixture's one original
    // LINE stays. The exact figure is the evaluator's business - the pin
    // is that the drawing is now MADE of lines.
    expect(count(result.text, 'LINE')).toBeGreaterThan(500)
  })

  it('keeps every evaluated point inside the drawing extents', () => {
    const lines = result.text.split(/\r?\n/).map((l) => l.trim())
    const nums = { x: [], y: [] }
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i] === '10' || lines[i] === '11') {
        nums.x.push(Number(lines[i + 1]))
      }
      if (lines[i] === '20' || lines[i] === '21') {
        nums.y.push(Number(lines[i + 1]))
      }
    }
    const finite = (arr) => arr.filter((n) => Number.isFinite(n))
    const xs = finite(nums.x)
    const ys = finite(nums.y)
    expect(xs.length).toBeGreaterThan(1000)
    // The sketch is a cat at roughly 200 by 200 mm around the origin; an
    // evaluator gone wrong throws points to the moon.
    const span = (arr) => Math.max(...arr) - Math.min(...arr)
    expect(span(xs)).toBeGreaterThan(10)
    expect(span(xs)).toBeLessThan(2000)
    expect(span(ys)).toBeGreaterThan(10)
    expect(span(ys)).toBeLessThan(2000)
  })

  it('a file with no curves passes through untouched', () => {
    const plain = ['0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '10', '0', '20', '0', '11', '1', '21', '1', '0', 'ENDSEC'].join('\n')
    const out = evaluateDxfCurves(plain)
    expect(out.text).toBe(plain)
    expect(out.splines).toBe(0)
    expect(out.ellipses).toBe(0)
  })
})
