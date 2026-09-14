import { describe, it, expect } from 'vitest'

/**
 * DP-36: finding the attribution a stock icon carries, and taking it off.
 *
 * The drawings here are synthesized - a ring, a face, a row of letter-sized
 * marks - because no stock icon belongs in this repository. They are built to
 * the shapes MEASURED on the real ones: a caption of forty-odd letters, each
 * about 3% of the picture wide, sitting in a strip about 7% of the height tall
 * along the bottom edge.
 *
 * The cases that matter most are the ones where the rule must NOT fire. A
 * drawing that loses part of itself to an over-eager caption filter is a worse
 * failure than one that keeps its caption, because the person can see a caption
 * and cannot see what is missing.
 */

import {
  findCreditLine,
  removeCreditLine,
  CREDIT_LINE_RULE,
} from '../../src/js/credit-line.js'
import { creditLineSentence } from '../../src/js/ink-controls.js'

const SIZE = 700

/** A rectangle as path data, which is all a bounding box needs. */
const box = (x, y, w, h) =>
  `M${x} ${y}H${x + w}V${y + h}H${x}Z`

/** A row of letter-sized marks, the shape a traced caption actually has. */
function caption(count, { y = 620, size = 18, gap = 6 } = {}) {
  const marks = []
  for (let i = 0; i < count; i++) {
    marks.push(box(40 + i * (size + gap), y, size, size))
  }
  return marks
}

/** A drawing in the shape imagetracerjs returns: one element per shape. */
const asElements = (pieces, size = SIZE) =>
  `<svg width="${size}" height="${size}" version="1.1" xmlns="http://www.w3.org/2000/svg">` +
  pieces.map((d) => `<path fill="rgb(0,0,0)" d="${d}"/>`).join('') +
  `</svg>`

/** A drawing in the shape Potrace returns: everything in one compound path. */
const asCompound = (pieces, size = SIZE) =>
  `<svg width="${size}" height="${size}" version="1.1" xmlns="http://www.w3.org/2000/svg">` +
  `<path fill="rgb(0,0,0)" fill-rule="evenodd" d="${pieces.join('')}"/>` +
  `</svg>`

/** The icon itself: a ring, which is an outline and its counter. */
const RING = [box(200, 120, 300, 300), box(250, 170, 200, 200)]

describe('the credit line (DP-36)', () => {
  describe('what it finds', () => {
    it('★ finds a two-line caption under an icon, and says how many', () => {
      const svg = asCompound([
        ...RING,
        ...caption(22, { y: 600 }),
        ...caption(18, { y: 630 }),
      ])
      const look = findCreditLine(svg)
      expect(look.found).toBe(true)
      expect(look.count).toBe(40)
      expect(look.reason).toBe('40 shapes in a line')
    })

    it('finds it whichever way the tracer grouped its output', () => {
      const pieces = [...RING, ...caption(20)]
      const compound = findCreditLine(asCompound(pieces))
      const elements = findCreditLine(asElements(pieces))
      expect(compound.count).toBe(20)
      expect(elements.count).toBe(20)
    })

    it('reports where it is, so a person could be shown', () => {
      const look = findCreditLine(asCompound([...RING, ...caption(12)]))
      expect(look.box.minY).toBeGreaterThan(SIZE * 0.8)
      expect(look.box.maxY).toBeLessThanOrEqual(SIZE)
    })
  })

  describe('what it leaves alone', () => {
    it('★ four honest dots along the bottom survive', () => {
      // The counter-case the rule exists to protect. A drawing may end in a
      // few marks; a sentence does not have four letters.
      const dots = [
        box(200, 620, 16, 16),
        box(300, 620, 16, 16),
        box(400, 620, 16, 16),
        box(500, 620, 16, 16),
      ]
      const svg = asCompound([...RING, ...dots])
      const look = findCreditLine(svg)
      expect(look.found).toBe(false)
      expect(look.reason).toMatch(/only 4 small shapes/)
      expect(removeCreditLine(svg).svg).toBe(svg)
    })

    it('★ detail scattered down the drawing is drawing, not a caption', () => {
      // Twenty small marks, but spread over the whole lower third rather than
      // lying in a strip. A line of text is one or two lines tall.
      const scattered = []
      for (let i = 0; i < 20; i++) {
        scattered.push(box(100 + (i % 5) * 90, 570 + Math.floor(i / 5) * 35, 16, 16))
      }
      const look = findCreditLine(asCompound([...RING, ...scattered]))
      expect(look.found).toBe(false)
      expect(look.reason).toMatch(/scattered, not in a line/)
    })

    it('a rule along the bottom edge is not a letter', () => {
      // A wide, short bar - a baseline or an underline. Wide in one direction
      // disqualifies it, so it cannot pad the count towards eight.
      const bars = []
      for (let i = 0; i < 10; i++) bars.push(box(40, 600 + i * 4, 600, 2))
      const look = findCreditLine(asCompound([...RING, ...bars]))
      expect(look.found).toBe(false)
    })

    it('the icon itself is never in the band, however small it is', () => {
      const tiny = asCompound([box(340, 300, 20, 20)])
      expect(findCreditLine(tiny).found).toBe(false)
    })

    it('a drawing with no caption comes back untouched, byte for byte', () => {
      const svg = asCompound(RING)
      const out = removeCreditLine(svg)
      expect(out.svg).toBe(svg)
      expect(out.removed).toBe(0)
      expect(out.box).toBeNull()
    })
  })

  describe('taking it off', () => {
    it('★ leaves the icon and removes every letter, from a compound path', () => {
      const svg = asCompound([...RING, ...caption(30)])
      const out = removeCreditLine(svg)
      expect(out.removed).toBe(30)
      // What is left is the ring: two closed shapes, still in one element.
      expect((out.svg.match(/<path/g) || []).length).toBe(1)
      expect((out.svg.match(/M/g) || []).length).toBe(2)
      // ★ And nothing of the caption survived, which is the measurement that
      // matters: a stray letter is worse than a whole caption, because the
      // person can see a caption and cannot explain a speck.
      expect(findCreditLine(out.svg).found).toBe(false)
      expect(findCreditLine(out.svg).count).toBe(0)
    })

    it('★ leaves the icon and removes every letter, from separate elements', () => {
      const svg = asElements([...RING, ...caption(30)])
      const out = removeCreditLine(svg)
      expect(out.removed).toBe(30)
      expect((out.svg.match(/<path/g) || []).length).toBe(2)
      expect(findCreditLine(out.svg).count).toBe(0)
    })

    it('drops an element that was nothing but caption', () => {
      // One element holding the whole sentence, beside one holding the icon.
      const svg =
        `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">` +
        `<path fill="#000" d="${RING.join('')}"/>` +
        `<path fill="#000" d="${caption(20).join('')}"/>` +
        `</svg>`
      const out = removeCreditLine(svg)
      expect(out.removed).toBe(20)
      expect((out.svg.match(/<path/g) || []).length).toBe(1)
    })

    it('removes a letter and its counter together', () => {
      // An "a" is two closed shapes, both letter-sized, both in the band.
      const a = [box(100, 615, 18, 18), box(105, 620, 8, 8)]
      const svg = asCompound([...RING, ...caption(10), ...a])
      const out = removeCreditLine(svg)
      expect(out.removed).toBe(12)
      expect(findCreditLine(out.svg).count).toBe(0)
    })

    it('★ hands back the original, so Undo is exact', () => {
      // Undo puts this string back rather than reassembling the pieces.
      // Reassembly is a second chance to be wrong for no gain.
      const svg = asCompound([...RING, ...caption(20)])
      const out = removeCreditLine(svg)
      expect(out.original).toBe(svg)
      expect(out.svg).not.toBe(svg)
    })
  })

  describe('drawings that do not behave', () => {
    it('reads the size from a viewBox when there is no width', () => {
      const svg =
        `<svg viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">` +
        `<path d="${[...RING, ...caption(20)].join('')}"/></svg>`
      expect(findCreditLine(svg).count).toBe(20)
    })

    it('says so when the drawing does not carry its own size', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${box(1, 1, 2, 2)}"/></svg>`
      const look = findCreditLine(svg)
      expect(look.found).toBe(false)
      expect(look.reason).toMatch(/does not say how big/)
    })

    it('nothing at all is nothing, not a crash', () => {
      for (const input of ['', null, undefined, '<p>not a drawing</p>']) {
        expect(findCreditLine(input).found).toBe(false)
        expect(removeCreditLine(input).removed).toBe(0)
      }
    })

    it('path data it cannot read is kept, never dropped on a guess', () => {
      const svg = asCompound([...RING, ...caption(20), 'M not real data'])
      const out = removeCreditLine(svg)
      expect(out.svg).toContain('not real data')
    })
  })

  describe('the rule itself', () => {
    it('is one table, not four conditions', () => {
      expect(CREDIT_LINE_RULE).toEqual({
        minShapes: 8,
        maxShapeWidthShare: 0.06,
        maxShapeHeightShare: 0.06,
        bandFromBottom: 0.2,
        maxClusterHeightShare: 0.12,
      })
    })

    it('can be tightened or loosened by a caller', () => {
      const svg = asCompound([...RING, ...caption(6)])
      expect(findCreditLine(svg).found).toBe(false)
      expect(findCreditLine(svg, { minShapes: 5 }).found).toBe(true)
    })

    it('eight is the line: seven marks stay, eight go', () => {
      expect(findCreditLine(asCompound([...RING, ...caption(7)])).found).toBe(
        false
      )
      expect(findCreditLine(asCompound([...RING, ...caption(8)])).found).toBe(
        true
      )
    })
  })
})

describe('what the person is told (DP-36)', () => {
  it('names the count and what it thinks it was', () => {
    expect(creditLineSentence({ removed: 46 })).toBe(
      'Removed 46 small shapes from the bottom edge, most likely a credit line.'
    )
  })

  it('★ says "most likely", because it is a guess', () => {
    // The rule is a heuristic on shapes and positions. It cannot read, so it
    // cannot know. Undo exists for the same reason, and the sentence should
    // not claim more certainty than the button implies.
    expect(creditLineSentence({ removed: 12 })).toContain('most likely')
  })

  it('says nothing when nothing was removed', () => {
    expect(creditLineSentence({ removed: 0 })).toBe('')
    expect(creditLineSentence(null)).toBe('')
    expect(creditLineSentence(undefined)).toBe('')
  })
})
