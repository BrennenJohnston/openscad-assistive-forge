import { describe, it, expect } from 'vitest'

import {
  ANCHORED_CLASSES,
  anchoredGlyph,
  buildField,
  buildLadder,
  buildLadders,
  FIELD_LEVELS,
  fieldSize,
  glyphCoverage,
  isAnchoredClass,
  luminance,
  quantiseLevel,
} from '../../../src/js/game/city-glyph-field.js'
import { SURFACE_CLASS } from '../../../src/js/game/city-class-pass.js'
import { coherence } from '../../../src/js/game/seq-metrics.js'

/** A flat RGBA image of one grey, for the box-average cases. */
const solid = (w, h, v) => {
  const a = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    a[i * 4] = v
    a[i * 4 + 1] = v
    a[i * 4 + 2] = v
    a[i * 4 + 3] = 255
  }
  return a
}

/** Six-sample shape vectors of a known coverage each. */
const vectors = (coverages) =>
  coverages.map((c) => Float32Array.from([c, c, c, c, c, c]))

describe('CW-86 the anchored class set', () => {
  it('★★ every literal id IS the class it claims to be', () => {
    // city-glyph-field.js writes the ids as numbers to avoid closing an
    // import cycle with city-class-pass.js. This is the guard that makes that
    // safe: the test is outside the cycle, so it may import both.
    expect(ANCHORED_CLASSES).toEqual([
      SURFACE_CLASS.GROUND,
      SURFACE_CLASS.SIDEWALK,
      SURFACE_CLASS.GREEN,
    ])
  })

  it('★★ names only classes the scene can actually serve', () => {
    expect(ANCHORED_CLASSES).not.toContain(SURFACE_CLASS.ROAD)
    expect(ANCHORED_CLASSES).not.toContain(SURFACE_CLASS.CURB)
    expect(ANCHORED_CLASSES).not.toContain(SURFACE_CLASS.SKY)
  })

  it('★★★ leaves the FACADE to the screen pick, which is the release verdict', () => {
    // Measured: the lattice that holds a wall still is the lattice that erases
    // its windows, because a window is about one cell across at 30 %. A later
    // release that re-anchors the facade must move this line AND bring the
    // table that justifies it.
    expect(ANCHORED_CLASSES).not.toContain(SURFACE_CLASS.BUILDING_WALL)
    expect(ANCHORED_CLASSES).not.toContain(SURFACE_CLASS.STOREFRONT)
  })

  it('anchors the dithered surfaces, where there is no structure to lose', () => {
    expect(ANCHORED_CLASSES).toContain(SURFACE_CLASS.GROUND)
    expect(ANCHORED_CLASSES).toContain(SURFACE_CLASS.SIDEWALK)
    expect(ANCHORED_CLASSES).toContain(SURFACE_CLASS.GREEN)
    expect(isAnchoredClass(SURFACE_CLASS.GROUND)).toBe(true)
    expect(isAnchoredClass(SURFACE_CLASS.BUILDING_WALL)).toBe(false)
  })
})

describe('CW-86 the field arithmetic', () => {
  it('quantises a luminance to a ladder step, ends included', () => {
    expect(quantiseLevel(0, 8)).toBe(0)
    expect(quantiseLevel(0.0001, 8)).toBe(0)
    expect(quantiseLevel(0.5, 8)).toBe(4)
    expect(quantiseLevel(1, 8)).toBe(7)
    expect(quantiseLevel(2, 8)).toBe(7)
    expect(quantiseLevel(-1, 8)).toBe(0)
  })

  it('★ divides both axes by the SAME factor, so a bay keeps its shape', () => {
    const s = fieldSize(512, 576, 64)
    expect(s.factor).toBe(9)
    expect(s.w).toBe(56)
    expect(s.h).toBe(64)
    expect(s.w / s.h).toBeCloseTo(512 / 576, 1)
  })

  it('never reduces below one square, however coarse it is asked to be', () => {
    const s = fieldSize(4, 4, 1)
    expect(s.w).toBeGreaterThanOrEqual(1)
    expect(s.h).toBeGreaterThanOrEqual(1)
  })

  it('box-averages rather than point-samples', () => {
    const w = 8
    const h = 8
    const a = new Uint8Array(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = x % 2 === 0 ? 0 : 255
        const i = (y * w + x) * 4
        a[i] = a[i + 1] = a[i + 2] = v
        a[i + 3] = 255
      }
    }
    const f = buildField(a, w, h, 1, 8)
    expect(f.w).toBe(1)
    expect(f.h).toBe(1)
    expect(f.levels[0]).toBe(4)
  })

  it('a flat texture gives one level everywhere', () => {
    const f = buildField(solid(16, 16, 255), 16, 16, 4, 8)
    expect(f.w).toBe(4)
    expect([...new Set(f.levels)]).toEqual([7])
  })

  it('uses Rec. 601 luma, the converter weighting', () => {
    expect(luminance(255, 255, 255)).toBeCloseTo(1, 5)
    expect(luminance(0, 0, 0)).toBe(0)
    expect(luminance(0, 255, 0)).toBeCloseTo(0.587, 3)
  })
})

describe('CW-86 the ladder', () => {
  const glyphVectors = vectors([0, 0.1, 0.25, 0.5, 0.75, 1])

  it('★★ matches a step to the glyph whose INK is nearest that tone', () => {
    // A row with no ties in it, so this case is about the MATCHING and not
    // about how ties break. Four steps stand for 0.125, 0.375, 0.625, 0.875.
    const row = vectors([0, 0.1, 0.4, 0.6, 0.9])
    const ladder = buildLadder([0, 1, 2, 3, 4], row, 4)
    expect(glyphCoverage(row[ladder[0]])).toBeCloseTo(0.1, 5)
    expect(glyphCoverage(row[ladder[1]])).toBeCloseTo(0.4, 5)
    expect(glyphCoverage(row[ladder[2]])).toBeCloseTo(0.6, 5)
    expect(glyphCoverage(row[ladder[3]])).toBeCloseTo(0.9, 5)
  })

  it('★ breaks a tie toward the LIGHTER glyph, and says so out loud', () => {
    // 0.25 and 0.5 are equally far from step 1 of 4 (0.375). The search keeps
    // the first it saw and the row is walked light to dense, so the lighter
    // wins. A tie rule nobody states is a tie rule that changes when the loop
    // does, and this row of the picture would change with it.
    const ladder = buildLadder([0, 1, 2, 3, 4, 5], glyphVectors, 4)
    expect(glyphCoverage(glyphVectors[ladder[1]])).toBeCloseTo(0.25, 5)
  })
  it('★ steps UP the tonal range: a darker step is never a heavier glyph', () => {
    const ladder = buildLadder([0, 1, 2, 3, 4, 5], glyphVectors, 8)
    let last = -1
    for (const id of ladder) {
      const c = glyphCoverage(glyphVectors[id])
      expect(c).toBeGreaterThanOrEqual(last)
      last = c
    }
  })

  it('a narrow row reuses its extremes rather than inventing weight', () => {
    const ladder = buildLadder([0, 1], glyphVectors, 8)
    for (const id of ladder) expect([0, 1]).toContain(id)
  })

  it('builds a ladder for the anchored classes and for nobody else', () => {
    const lookups = new Map([
      [SURFACE_CLASS.GROUND, { glyphIds: [0, 3, 5] }],
      [SURFACE_CLASS.BUILDING_WALL, { glyphIds: [0, 3, 5] }],
    ])
    const ladders = buildLadders(lookups, glyphVectors, 4)
    expect(ladders.has(SURFACE_CLASS.GROUND)).toBe(true)
    expect(ladders.has(SURFACE_CLASS.BUILDING_WALL)).toBe(false)
  })

  it('an empty vocabulary yields no ladder rather than a broken one', () => {
    const ladders = buildLadders(
      new Map([[SURFACE_CLASS.GROUND, { glyphIds: [] }]]),
      glyphVectors,
      4
    )
    expect(ladders.size).toBe(0)
  })
})

describe('CW-86 reading a glyph out of the field', () => {
  const glyphVectors = vectors([0, 0.25, 0.5, 0.75, 1])
  const ladders = buildLadders(
    new Map([[SURFACE_CLASS.GROUND, { glyphIds: [0, 1, 2, 3, 4] }]]),
    glyphVectors,
    FIELD_LEVELS
  )

  it('★★ byte 0 means NO FIELD, and the caller keeps its screen pick', () => {
    expect(anchoredGlyph(ladders, SURFACE_CLASS.GROUND, 0)).toBe(-1)
  })

  it('a class with no ladder falls back, it does not throw', () => {
    expect(anchoredGlyph(ladders, SURFACE_CLASS.BUILDING_WALL, 3)).toBe(-1)
    expect(anchoredGlyph(null, SURFACE_CLASS.GROUND, 3)).toBe(-1)
  })

  it('★ the same byte always gives the same glyph - that is the whole point', () => {
    const a = anchoredGlyph(ladders, SURFACE_CLASS.GROUND, 5)
    const b = anchoredGlyph(ladders, SURFACE_CLASS.GROUND, 5)
    expect(a).toBe(b)
    expect(a).toBeGreaterThanOrEqual(0)
  })

  it('a byte past the ladder is clamped rather than reading off the end', () => {
    const g = anchoredGlyph(ladders, SURFACE_CLASS.GROUND, 250)
    expect(g).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(g)).toBe(true)
  })

  it('★★★ NO HOLD: when the field slides one cell, the glyph slides with it', () => {
    // The oracle's own case. A lattice of field bytes moved by exactly one
    // cell between two frames must move the glyph lattice by exactly one cell.
    // A cell that kept its old glyph would be a hold, and a hold is the trail
    // this release exists to avoid.
    //
    // RED PROOF (run by hand, CW-86): make anchoredGlyph ignore its byte and
    // return a constant - this case then names the first cell that failed to
    // move, and the non-empty assertion below is what makes that possible.
    const cols = 6
    const rows = 1
    const before = [1, 2, 3, 4, 5, 6]
    const after = [6, 1, 2, 3, 4, 5]
    const glyphsOf = (bytes) =>
      bytes.map((b) => anchoredGlyph(ladders, SURFACE_CLASS.GROUND, b))
    const g0 = glyphsOf(before)
    const g1 = glyphsOf(after)
    for (let i = 1; i < cols; i++) {
      expect(g1[i], `cell ${i} did not take its neighbour's glyph`).toBe(
        g0[i - 1]
      )
    }
    // And it is a REAL slide: a fixture whose glyphs were all the same would
    // pass the loop above while proving nothing at all.
    expect(new Set(g0).size).toBeGreaterThan(1)
    expect(coherence(g0, g1, cols, rows, 1, 0).pct).toBe(100)
  })
})

describe('CW-86 coherence tells a slide from a re-roll', () => {
  it('★★ a pure slide scores 100 %', () => {
    const prev = [1, 2, 3, 4, 5, 6, 7, 8]
    const next = [9, 1, 2, 3, 4, 5, 6, 7]
    expect(coherence(prev, next, 8, 1, 1, 0)).toMatchObject({ pct: 100 })
  })

  it('★★ a re-roll of the same cells scores nothing', () => {
    const prev = [1, 2, 3, 4, 5, 6, 7, 8]
    const next = [20, 21, 22, 23, 24, 25, 26, 27]
    expect(coherence(prev, next, 8, 1, 1, 0).pct).toBe(0)
  })

  it('a still picture has nothing to be coherent about, and says 0', () => {
    const same = [1, 2, 3, 4]
    const c = coherence(same, same, 4, 1, 1, 0)
    expect(c.changed).toBe(0)
    expect(c.pct).toBe(0)
  })

  it('counts only the cells that CHANGED, and only where it can judge', () => {
    // Four cells, sliding right by one:
    //   0: unchanged, and its source is off-grid anyway - not counted
    //   1: took cell 0's old glyph - changed AND coherent
    //   2: took something cell 1 never held - changed and incoherent
    //   3: unchanged - not counted
    const prev = [1, 2, 3, 9]
    const next = [1, 1, 7, 9]
    const c = coherence(prev, next, 4, 1, 1, 0)
    expect(c.changed).toBe(2)
    expect(c.coherent).toBe(1)
    expect(c.pct).toBe(50)
  })

  it('works down a column as well as along a row', () => {
    const prev = [1, 2, 3, 4]
    const next = [9, 1, 2, 3]
    expect(coherence(prev, next, 1, 4, 0, 1).pct).toBe(100)
  })

  it('refuses frames that are not the same grid', () => {
    expect(() => coherence([1, 2], [1, 2, 3], 2, 1, 1, 0)).toThrow(/entries/)
  })
})
