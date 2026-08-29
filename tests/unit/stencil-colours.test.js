/**
 * The Harley law, pinned against the drawing that taught it.
 *
 * The counts here were measured by extracting the faces, rendering them as a
 * numbered map and LOOKING at it beside the owner's six plates, not guessed
 * from the file. Every reference region the owner painted is one of the faces
 * this module finds, and the numbers below say which.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import {
  detectLineArt,
  buildRegions,
  regionAt,
  regionKey,
  positionWord,
  paletteFromFills,
  colourLabel,
  autoAssign,
  defaultOrder,
  platesFor,
  islandsOf,
  validatePlan,
  serialisePlan,
  parsePlan,
  REMEDY_SENTENCES,
  LINE_ART_HOLE_RATIO,
  BASE_COLOUR_ID,
  UNPAINTED,
} from '../../src/js/stencil-colours.js'
import { regionArea, areaOf } from '../../src/js/ring-geometry.js'
import { STENCIL_PLATE_CAP } from '../../src/js/stencil-plates.js'

// parseSvgElements needs a DOM; the app has one and vitest's node lane does not.
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
globalThis.DOMParser = dom.window.DOMParser
globalThis.XMLSerializer = dom.window.XMLSerializer
globalThis.Node = dom.window.Node
const { parseSvgElements, classifyElements } = await import(
  '../../src/js/svg-preparer.js'
)

const HARLEY = join('tests', 'fixtures', 'harley')
const read = (p) => readFileSync(p, 'utf8')
const elementsOf = (file) => classifyElements(parseSvgElements(read(file)))

const CAT = elementsOf(join(HARLEY, 'sketch4.svg'))
const TRACE = elementsOf(join(HARLEY, 'trace-503px.svg'))
const BIRD = elementsOf(join('tests', 'fixtures', 'svg-edit', 'bird-drawing.svg'))
const REF_PLAN = JSON.parse(read(join(HARLEY, 'harley-plan.json')))

const area = (rings) => Math.abs(regionArea(rings))

/** Two filled shapes side by side, so the palette has something to read. */
const TWO_COLOURS = buildRegions(
  classifyElements(
    parseSvgElements(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
        '<path fill="#997048" d="M 5 5 H 55 V 55 H 5 Z"/>' +
        '<path fill="#fafbf8" d="M 60 60 H 90 V 90 H 60 Z"/>' +
        '</svg>'
    )
  ),
  { lineMode: 'shapes' }
)

/** The reference plan, applied to whatever faces this module found. */
function referencePlanOn(regions) {
  const assignment = {}
  for (const r of regions) assignment[r.key] = REF_PLAN.order[0]
  const missed = []
  for (const row of REF_PLAN.regions) {
    const hit = regionAt(regions, { x: row.at[0], y: row.at[1] })
    if (hit) assignment[hit.key] = row.colour
    else missed.push(row.name)
  }
  return {
    plan: {
      palette: REF_PLAN.palette,
      order: REF_PLAN.order,
      assignment,
      rule: 'own',
      lineMode: 'edges',
    },
    missed,
  }
}

describe('detectLineArt', () => {
  it("reads the owner's cat as lines between regions", () => {
    const d = detectLineArt(CAT)
    expect(d.isLineArt).toBe(true)
    expect(d.allInk).toBe(true)
    // The ink covers 5.7% of its own outer contour.
    expect(d.holeRatio).toBeCloseTo(0.943, 2)
  })

  it('refuses filled art that names its own colours', () => {
    const d = detectLineArt(BIRD)
    expect(d.isLineArt).toBe(false)
    expect(d.allInk).toBe(false)
    expect(d.reason).toMatch(/colours of its own/)
  })

  it('refuses black shapes whose marks are too thick to be lines', () => {
    // Every element is #000000, so the fill test alone would say yes. The
    // holes cover a third of the outer contour, which is what says these are
    // solids with holes rather than lines with faces.
    const d = detectLineArt(TRACE)
    expect(d.allInk).toBe(true)
    expect(d.holeRatio).toBeLessThan(LINE_ART_HOLE_RATIO)
    expect(d.isLineArt).toBe(false)
    expect(d.reason).toMatch(/too thick/)
  })

  it('leaves room between the two on the three drawings measured', () => {
    // 0.355 and 0.287 on one side, 0.943 on the other, with the threshold in
    // the middle of the gap.
    expect(detectLineArt(TRACE).holeRatio).toBeLessThan(0.4)
    expect(detectLineArt(BIRD).holeRatio).toBeLessThan(0.4)
    expect(detectLineArt(CAT).holeRatio).toBeGreaterThan(0.9)
  })

  it('says so plainly when there is nothing to read', () => {
    expect(detectLineArt([]).reason).toBe('nothing to read')
    expect(detectLineArt(null).isLineArt).toBe(false)
  })
})

describe('buildRegions on the cat', () => {
  const built = buildRegions(CAT)

  it('finds the faces of the line network, not the lines', () => {
    expect(built.lineMode).toBe('edges')
    // 23 holes, of which two are 0.0001-unit boolean litter.
    expect(built.regions).toHaveLength(21)
    expect(built.droppedFaces).toBe(2)
  })

  it('keeps the whole head as the silhouette', () => {
    expect(built.silhouette).toHaveLength(1)
    expect(area(built.silhouette)).toBeCloseTo(12603.19, 0)
  })

  it('winds every face the right way up', () => {
    for (const r of built.regions) {
      expect(areaOf(r.rings[0]), r.name).toBeGreaterThan(0)
      for (const hole of r.rings.slice(1)) expect(areaOf(hole)).toBeLessThan(0)
    }
  })

  it('names a region by where it is, never by an index in a file', () => {
    for (const r of built.regions) {
      expect(r.name).toMatch(
        /^Region \d+, (top left|top|top right|left|middle|right|bottom left|bottom|bottom right)/
      )
    }
  })

  it('gives every face a key that survives being found again', () => {
    const again = buildRegions(CAT)
    expect(again.regions.map((r) => r.key)).toEqual(
      built.regions.map((r) => r.key)
    )
    expect(new Set(built.regions.map((r) => r.key)).size).toBe(21)
  })

  it('holds every one of the sixteen regions the owner painted', () => {
    const { missed } = referencePlanOn(built.regions)
    expect(missed).toEqual([])
  })
})

describe('regionAt', () => {
  const { regions } = buildRegions(CAT)

  it('★ answers the pupil, not the eye that contains it', () => {
    // The right pupil's own point. Its face is nested three deep inside the
    // eye, and the eye's ring contains it too.
    const pupil = regionAt(regions, { x: 97.702, y: 91.985 })
    const eye = regionAt(regions, { x: 98.107, y: 99.748 })
    expect(pupil).not.toBeNull()
    expect(eye).not.toBeNull()
    expect(pupil.key).not.toBe(eye.key)
    // And the eye is the bigger of the two by its outer ring, which is what
    // the search compares. By NET area the pupil is the bigger one - 82.0
    // against 59.4 - which is the trap.
    expect(eye.outerArea).toBeGreaterThan(pupil.outerArea)
    expect(pupil.area).toBeGreaterThan(eye.area)
  })

  it('answers nothing for a point off the drawing', () => {
    expect(regionAt(regions, { x: -50, y: -50 })).toBeNull()
  })
})

describe('positionWord and regionKey', () => {
  const box = { minX: 0, minY: 0, maxX: 90, maxY: 90 }
  it('splits a box into nine', () => {
    expect(positionWord({ x: 5, y: 5 }, box)).toBe('top left')
    expect(positionWord({ x: 45, y: 45 }, box)).toBe('middle')
    expect(positionWord({ x: 85, y: 85 }, box)).toBe('bottom right')
    expect(positionWord({ x: 45, y: 5 }, box)).toBe('top')
  })
  it('keeps a point on the far edge inside the grid', () => {
    expect(positionWord({ x: 90, y: 90 }, box)).toBe('bottom right')
  })
  it('rounds a key to four places so it is stable', () => {
    expect(regionKey({ x: 1.234567, y: 2 })).toBe('1.2346:2')
  })
})

describe('the palette', () => {
  it('names colours in plain language', () => {
    expect(colourLabel('#997048')).toBe('Brown')
    expect(colourLabel('#171411')).toBe('Black')
    expect(colourLabel('#fafbf8')).toBe('White')
    expect(colourLabel('nonsense')).toBe('Colour')
  })

  it('★ calls both of the muted cat colours Gray, which is what the ported table does', () => {
    // MEASURED, and left alone on purpose. The eighteen anchors this table
    // carries are all saturated, so the nearest thing to a muted colour is
    // gray: the cat's sage-green eyes (#8b9770) and its dusty-pink nose
    // (#b0767d) both come out "Gray", and a person would be told their plate
    // is the gray one. The table is the owner's own, ported unchanged from
    // stencil-forge, and a person can rename any swatch; whether to add
    // anchors is the owner's call, and it is on the ledger. This test pins
    // the behaviour so the day it changes is a decision and not a surprise.
    expect(colourLabel('#8b9770')).toBe('Gray')
    expect(colourLabel('#b0767d')).toBe('Gray')
  })

  it('gives a drawing with no colours of its own one base coat', () => {
    const { regions } = buildRegions(CAT)
    const palette = paletteFromFills(regions)
    expect(palette).toHaveLength(1)
    expect(palette[0].id).toBe(BASE_COLOUR_ID)
  })

  it('takes its swatches from the fills when a drawing has them', () => {
    const palette = paletteFromFills(TWO_COLOURS.regions)
    expect(palette).toHaveLength(2)
    for (const c of palette) expect(c.hex).toMatch(/^#[0-9a-f]{3,8}$/)
    // Largest area first, so the swatch list reads in the order it will paint.
    expect(palette[0].hex).toBe('#997048')
    expect(palette[0].name).toBe('Brown')
  })

  it('gives a drawing whose only fill is its paper one base coat', () => {
    // The bird's backdrop is a full-bleed rect and is stepped over as paper,
    // which leaves one colour, which is not a palette.
    const { regions } = buildRegions(BIRD, { lineMode: 'shapes' })
    expect(paletteFromFills(regions)).toHaveLength(1)
  })

  it('starts every face at the base when there is nothing to go on', () => {
    const { regions } = buildRegions(CAT)
    const assignment = autoAssign(regions, [
      { id: BASE_COLOUR_ID, name: 'Base coat', hex: '#171411' },
    ])
    expect(new Set(Object.values(assignment))).toEqual(new Set([BASE_COLOUR_ID]))
  })

  it('falls back to the palette first colour rather than an id nobody has', () => {
    const { regions } = buildRegions(CAT)
    const assignment = autoAssign(regions, [{ id: 'only', name: 'Only', hex: '#123456' }])
    expect(new Set(Object.values(assignment))).toEqual(new Set(['only']))
  })
})

describe('defaultOrder', () => {
  it('puts the base first and then the largest area', () => {
    const regions = [
      { key: 'a', area: 10 },
      { key: 'b', area: 100 },
      { key: 'c', area: 50 },
    ]
    const palette = [
      { id: BASE_COLOUR_ID },
      { id: 'small' },
      { id: 'big' },
      { id: 'mid' },
    ]
    const assignment = { a: 'small', b: 'big', c: 'mid' }
    expect(defaultOrder(regions, assignment, palette)).toEqual([
      BASE_COLOUR_ID,
      'big',
      'mid',
      'small',
    ])
  })

  it('does not count a region nobody is painting', () => {
    const regions = [{ key: 'a', area: 1000 }, { key: 'b', area: 5 }]
    const palette = [{ id: BASE_COLOUR_ID }, { id: 'x' }, { id: 'y' }]
    const order = defaultOrder(regions, { a: UNPAINTED, b: 'y' }, palette)
    expect(order).toEqual([BASE_COLOUR_ID, 'y', 'x'])
  })
})

describe("the reference plan, on the owner's own drawing", () => {
  const { regions, silhouette } = buildRegions(CAT)
  const { plan } = referencePlanOn(regions)

  it('cuts the silhouette on plate 1 under both rules', () => {
    for (const rule of ['own', 'stacked']) {
      const plates = platesFor({ ...plan, rule }, regions, silhouette)
      expect(area(plates[0].rings), rule).toBeCloseTo(12603.19, 0)
      expect(islandsOf(plates[0].rings, regions), rule).toEqual([])
    }
  })

  it('★ cuts exactly the four brown patches on plate 2 under the own rule', () => {
    const plates = platesFor({ ...plan, rule: 'own' }, regions, silhouette)
    expect(plates[1].colourId).toBe('brown')
    expect(plates[1].regionKeys).toHaveLength(4)
    expect(plates[1].rings).toHaveLength(4)
  })

  it('matches the reference plate for plate 3, 4, 5 and 6 by count', () => {
    const plates = platesFor({ ...plan, rule: 'own' }, regions, silhouette)
    const counts = plates.map((p) => p.regionKeys.length)
    // white 4, green 2, black again 4, pink 2. The reference's own plate 6
    // also repeats plate 5's two pupil cuts, which is a property of the
    // owner's plate and not of the plan it encodes.
    expect(counts.slice(1)).toEqual([4, 4, 2, 4, 2])
  })

  it('makes each stacked plate a subset of the one before it', () => {
    const plates = platesFor({ ...plan, rule: 'stacked' }, regions, silhouette)
    const areas = plates.map((p) => area(p.rings))
    for (let i = 1; i < areas.length; i++) {
      expect(areas[i], `plate ${i + 1} against plate ${i}`).toBeLessThan(areas[i - 1])
    }
  })

  it('★ leaves islands the stacked rule was supposed to make impossible', () => {
    // The plan said the stacked mask is "always solid, never a ring". It
    // removes every island caused by a nested REGION and cannot remove one
    // caused by a LINE between two regions that are both cut: the band
    // between an eye and its pupil, 109.4 and 94.3 units, on three plates.
    const plates = platesFor({ ...plan, rule: 'stacked' }, regions, silhouette)
    const counts = plates.map((p) => islandsOf(p.rings, regions).length)
    expect(counts).toEqual([0, 2, 2, 2, 0, 0])
  })

  it('closes those lines when asked, and only then', () => {
    const plates = platesFor({ ...plan, rule: 'stacked' }, regions, silhouette, {
      absorbEnclosedLines: true,
    })
    expect(plates.map((p) => islandsOf(p.rings, regions).length)).toEqual([
      0, 0, 0, 0, 0, 0,
    ])
  })

  it('★ reproduces the area of the reference eye plate when lines are closed', () => {
    // The owner cut the eyes SOLID, band and all. With the lines closed,
    // plate 4 is 437.4 units, and 0.264525 mm per unit squared makes that
    // 30.60 mm against the reference plate's 30.64.
    const plates = platesFor({ ...plan, rule: 'own' }, regions, silhouette, {
      absorbEnclosedLines: true,
    })
    const mm2 = area(plates[3].rings) * 0.264525 ** 2
    expect(mm2).toBeCloseTo(30.64, 0)
    expect(islandsOf(plates[3].rings, regions)).toEqual([])
  })

  it('finds nothing wrong with the plan', () => {
    expect(validatePlan(plan, regions)).toEqual([])
  })
})

describe('islandsOf', () => {
  it('reports a hole in a cut, with the three ways out', () => {
    const { regions, silhouette } = buildRegions(CAT)
    const { plan } = referencePlanOn(regions)
    const plates = platesFor({ ...plan, rule: 'stacked' }, regions, silhouette)
    const islands = islandsOf(plates[1].rings, regions)
    expect(islands).toHaveLength(2)
    expect(islands[0].area).toBeGreaterThan(islands[1].area)
    expect(islands[0].remedies).toEqual([
      'paint-later',
      'paint-again',
      'support-bar',
    ])
    for (const code of islands[0].remedies) {
      expect(REMEDY_SENTENCES[code]).toBeTruthy()
      expect(REMEDY_SENTENCES[code]).not.toMatch(/—/)
    }
  })

  it('says nothing about a plate that cuts nothing', () => {
    expect(islandsOf([])).toEqual([])
    expect(islandsOf(null)).toEqual([])
  })
})

describe('validatePlan', () => {
  const regions = [{ key: 'a', area: 1 }]
  it('names a colour the palette does not have', () => {
    const problems = validatePlan(
      { palette: [{ id: 'x', hex: '#000' }], order: ['x', 'ghost'], assignment: { a: 'x' } },
      regions
    )
    expect(problems.map((p) => p.code)).toContain('unknown-colour')
  })

  it('names a plate with nothing on it', () => {
    const problems = validatePlan(
      {
        palette: [{ id: 'x', hex: '#000' }, { id: 'y', hex: '#fff' }],
        order: ['x', 'y'],
        assignment: { a: 'x' },
      },
      regions
    )
    expect(problems.map((p) => p.code)).toContain('empty-plate')
  })

  it('refuses more passes than a stencil can be made of', () => {
    const palette = []
    const order = []
    for (let i = 0; i < STENCIL_PLATE_CAP + 1; i++) {
      palette.push({ id: `c${i}`, hex: '#000000' })
      order.push(`c${i}`)
    }
    const assignment = {}
    order.forEach((id, i) => {
      assignment[`k${i}`] = id
    })
    const problems = validatePlan(
      { palette, order, assignment },
      order.map((id, i) => ({ key: `k${i}`, area: 1 }))
    )
    expect(problems.map((p) => p.code)).toContain('too-many-plates')
    expect(problems.find((p) => p.code === 'too-many-plates').message).toContain(
      String(STENCIL_PLATE_CAP)
    )
  })
})

describe('a saved plan', () => {
  it('goes out and comes back the same', () => {
    const { regions } = buildRegions(CAT)
    const { plan } = referencePlanOn(regions)
    const saved = serialisePlan(plan, regions)
    const back = parsePlan(JSON.stringify(saved))
    expect(back.order).toEqual(plan.order)
    expect(back.rule).toBe('own')
    expect(back.lineMode).toBe('edges')
    expect(Object.keys(back.assignment)).toHaveLength(21)
  })

  it('carries the element index too, where a region has one', () => {
    const { regions } = buildRegions(BIRD, { lineMode: 'shapes' })
    const palette = paletteFromFills(regions)
    const assignment = autoAssign(regions, palette)
    const saved = serialisePlan({ palette, order: palette.map((c) => c.id), assignment }, regions)
    expect(Object.keys(saved.byElement).length).toBeGreaterThan(0)
  })

  it('comes back null rather than half read', () => {
    expect(parsePlan(null)).toBeNull()
    expect(parsePlan('not json')).toBeNull()
    expect(parsePlan({ palette: 'no' })).toBeNull()
    expect(parsePlan({})).toBeNull()
  })
})
