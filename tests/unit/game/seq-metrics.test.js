import { describe, it, expect } from 'vitest'
import {
  createFold,
  foldFrame,
  finishFold,
  classLabel,
  EDGE_CLASS,
} from '../../../src/js/game/seq-metrics.js'
import { SURFACE_CLASS } from '../../../src/js/game/city-class-pass.js'

/**
 * CW-67. Every Round 8 verdict about motion is read off this arithmetic, so
 * it is pinned against sequences whose answers were worked out by hand rather
 * than recorded from a run. A recorded expectation only proves the code did
 * not change; a hand-computed one proves it is right.
 *
 * The synthetic sequence below is four cells over three frames and contains
 * one of everything the instrument claims to see:
 *
 *   cell 0  glyph A-B-A          - a FLIP, the fracture signature
 *   cell 1  one glyph throughout - the control, and the long run
 *   cell 2  class moves at f1    - the EDGE population
 *   cell 3  drive into reverse
 *           video and back       - a reverse toggle and a drive flip
 *
 * Three frames give two frame PAIRS and one frame TRIPLE, which is what the
 * change and flip denominators are, and the reason a flip can only be seen
 * from the third frame onwards.
 */

const WALL = SURFACE_CLASS.BUILDING_WALL
const GROUND = SURFACE_CLASS.GROUND
const ROAD = SURFACE_CLASS.ROAD
const REVERSE_INDEX = 4

/** The mono sequence described above. */
const MONO_FRAMES = [
  {
    glyphs: [5, 3, 1, 9],
    intensity: [1, 1, 1, 2],
    lum: [0.6, 0.4, 0.6, 0.9],
    cls: [WALL, WALL, GROUND, WALL],
  },
  {
    glyphs: [7, 3, 2, 9],
    intensity: [1, 1, 1, REVERSE_INDEX],
    lum: [0.6, 0.4, 0.6, 0.9],
    cls: [WALL, WALL, ROAD, WALL],
  },
  {
    glyphs: [5, 3, 3, 9],
    intensity: [1, 1, 1, 2],
    lum: [0.6, 0.4, 0.6, 0.9],
    cls: [WALL, WALL, ROAD, WALL],
  },
]

function foldMono(frames = MONO_FRAMES) {
  const fold = createFold(4, 1, { mono: true, reverseIndex: REVERSE_INDEX })
  for (const frame of frames) foldFrame(fold, frame)
  return finishFold(fold)
}

describe('seq-metrics: the mono fold', () => {
  it('splits the cells whose class moved out of every class row', () => {
    const res = foldMono()
    expect(res.frames).toBe(3)
    expect(res.cells).toBe(4)
    expect(res.classChangedCells).toBe(1)
    expect(res.perClass).toHaveLength(1)
    expect(res.perClass[0].name).toBe('wall')
    expect(res.perClass[0].cells).toBe(3)
    expect(res.edge.name).toBe('EDGE(class moved)')
    expect(res.edge.cells).toBe(1)
    expect(res.classPairs).toEqual([['ground/road', 1]])
  })

  it('counts change, flip, churn and persistence exactly', () => {
    const res = foldMono()
    // wall: cell 0 changed on both pairs, cells 1 and 3 never - 2 of 3x2.
    expect(res.perClass[0].glyphChangePct).toBe(33.33)
    // one A-B-A return, out of 3 cells x 1 triple.
    expect(res.perClass[0].glyphFlipPct).toBe(33.33)
    // cell 0 boiled (2 changes > half of 2 pairs); cells 1 and 3 held.
    expect(res.perClass[0].churnCellsPct).toBe(33.33)
    // runs: cell 0 = 1,1,1; cell 1 = 3; cell 3 = 3 -> 9 frames over 5 runs.
    expect(res.perClass[0].meanGlyphPersistenceFrames).toBe(1.8)
    // the edge cell changed on every pair.
    expect(res.edge.glyphChangePct).toBe(100)
    expect(res.edge.glyphFlipPct).toBe(0)
    expect(res.edge.meanGlyphPersistenceFrames).toBe(1)
    expect(res.total.glyphChangePct).toBe(50)
    expect(res.total.glyphFlipPct).toBe(25)
    expect(res.total.churnCellsPct).toBe(50)
    expect(res.total.meanGlyphPersistenceFrames).toBe(1.5)
  })

  it('tells a reverse-video crossing from a drive change', () => {
    const res = foldMono()
    // cell 3's drive moved twice and both moves crossed the reverse index.
    expect(res.perClass[0].driveOrColourChangePct).toBe(33.33)
    expect(res.perClass[0].driveOrColourFlipPct).toBe(33.33)
    expect(res.perClass[0].reverseOrWhiteToggles).toBe(2)
    expect(res.total.reverseOrWhiteToggles).toBe(2)
    // one cell of four sat in reverse video, in the middle frame only.
    expect(res.reverseShare).toEqual([0, 0.25, 0])
  })

  it('counts a cell as lit if it carried ink in any frame', () => {
    const res = foldMono()
    expect(res.litShareMean).toBe(0.75)
    expect(res.perClass[0].lit).toBe(2)
    expect(res.edge.lit).toBe(1)
  })

  it('counts the SOLID layer separately from the ink', () => {
    // Cell 3 spends one frame in reverse video; nothing else ever does. The
    // size of the bright layer is a different question from how much of the
    // picture carries ink, and a class row has to answer both.
    const res = foldMono()
    expect(res.perClass[0].solid).toBe(1)
    expect(res.edge.solid).toBe(0)
    expect(res.total.solid).toBe(1)
    const still = [MONO_FRAMES[0], MONO_FRAMES[0], MONO_FRAMES[0]]
    expect(foldMono(still).total.solid).toBe(0)
  })

  it('reports a ghost when a class moved and the glyph did not follow', () => {
    const clean = foldMono()
    expect(clean.classMoveEvents).toBe(1)
    expect(clean.classMoveLitEvents).toBe(1)
    expect(clean.ghostPct).toBe(0)

    // The same sequence with the edge cell's glyph held across the class
    // change - which is exactly what a hysteresis that forgets to reset on a
    // class change would produce, and what CW-68 must not do.
    const ghosted = MONO_FRAMES.map((frame) => ({
      ...frame,
      glyphs: [...frame.glyphs],
    }))
    ghosted[1].glyphs[2] = ghosted[0].glyphs[2]
    const res = foldMono(ghosted)
    expect(res.classMoveEvents).toBe(1)
    expect(res.ghostPct).toBe(100)
  })

  it('does not count a class move in a blank cell as a glyph decision', () => {
    // Two blank cells of different classes draw the same nothing. Counting
    // those would put a large, immovable baseline under CW-68's ghost guard.
    const dark = MONO_FRAMES.map((frame) => ({
      ...frame,
      lum: [...frame.lum],
      glyphs: [...frame.glyphs],
    }))
    for (const frame of dark) frame.lum[2] = 0.1
    dark[1].glyphs[2] = dark[0].glyphs[2]
    const res = foldMono(dark)
    expect(res.classMoveEvents).toBe(1)
    expect(res.classMoveLitEvents).toBe(0)
    expect(res.ghostPct).toBe(0)
  })

  it('reads zero for a sequence where nothing moved', () => {
    const still = [MONO_FRAMES[0], MONO_FRAMES[0], MONO_FRAMES[0]]
    const res = foldMono(still)
    expect(res.total.glyphChangePct).toBe(0)
    expect(res.total.glyphFlipPct).toBe(0)
    expect(res.total.churnCellsPct).toBe(0)
    expect(res.total.meanGlyphPersistenceFrames).toBe(3)
    expect(res.classChangedCells).toBe(0)
    expect(res.edge.cells).toBe(0)
    // An empty row reports 0, never NaN: a JSON summary with nulls in it
    // reads as "measured zero" to the next session.
    expect(res.edge.glyphChangePct).toBe(0)
    expect(res.edge.churnCellsPct).toBe(0)
  })
})

describe('seq-metrics: the colour fold', () => {
  const WHITE_INDEX = 5
  const COLOUR_FRAMES = [
    { glyphs: [1, 1], colour: [WHITE_INDEX, -1], cls: [WALL, WALL] },
    { glyphs: [1, 1], colour: [2, -1], cls: [WALL, WALL] },
    { glyphs: [1, 1], colour: [WHITE_INDEX, 0], cls: [WALL, WALL] },
  ]

  it('scores the palette index where mono scores the intensity ladder', () => {
    const fold = createFold(2, 1, { mono: false, whiteIndex: WHITE_INDEX })
    for (const frame of COLOUR_FRAMES) foldFrame(fold, frame)
    const res = finishFold(fold)
    expect(res.mono).toBe(false)
    // no glyph moved at all; only the colour did.
    expect(res.total.glyphChangePct).toBe(0)
    // cell 0 changed twice, cell 1 once, over 2 cells x 2 pairs.
    expect(res.total.driveOrColourChangePct).toBe(75)
    // cell 0 came back to white; cell 1's -1 -> 0 was not a return.
    expect(res.total.driveOrColourFlipPct).toBe(50)
    expect(res.total.reverseOrWhiteToggles).toBe(2)
    expect(res.whiteShare).toEqual([0.5, 0, 0.5])
    // Only cell 0 is ever white; cell 1 never is.
    expect(res.total.solid).toBe(1)
    // a blank cell (-1) is not lit; the lit share climbs when cell 1 lights.
    expect(res.litShareMean).toBe(0.6667)
  })
})

describe('seq-metrics: the labels come from the class pass', () => {
  it('names every surface class the pass can emit', () => {
    for (const [name, id] of Object.entries(SURFACE_CLASS)) {
      const label = classLabel(id)
      expect(label).not.toMatch(/^class/)
      expect(label).toBe(name.toLowerCase().replace(/^building_/, ''))
    }
    expect(classLabel(SURFACE_CLASS.BUILDING_WALL)).toBe('wall')
    expect(classLabel(SURFACE_CLASS.SIDEWALK)).toBe('sidewalk')
    expect(classLabel(EDGE_CLASS)).toBe('EDGE(class moved)')
  })
})

describe('seq-metrics: what it refuses', () => {
  it('refuses a fold that does not say which measurement it is', () => {
    expect(() => createFold(4, 1, {})).toThrow(/options.mono/)
  })

  it('refuses a frame whose grid moved', () => {
    const fold = createFold(4, 1, { mono: true, reverseIndex: REVERSE_INDEX })
    foldFrame(fold, MONO_FRAMES[0])
    expect(() =>
      foldFrame(fold, { ...MONO_FRAMES[1], glyphs: [1, 2, 3] })
    ).toThrow(/grid has 4/)
  })

  it('refuses a mono frame with no intensity and a colour frame with no colour', () => {
    const mono = createFold(4, 1, { mono: true, reverseIndex: REVERSE_INDEX })
    expect(() =>
      foldFrame(mono, { glyphs: [1, 2, 3, 4], cls: [0, 0, 0, 0] })
    ).toThrow(/intensity is missing/)
    const colour = createFold(4, 1, { mono: false, whiteIndex: 5 })
    expect(() =>
      foldFrame(colour, { glyphs: [1, 2, 3, 4], cls: [0, 0, 0, 0] })
    ).toThrow(/colour is missing/)
  })

  it('refuses a sequence that captured nothing, and a second close', () => {
    const empty = createFold(4, 1, { mono: true, reverseIndex: REVERSE_INDEX })
    expect(() => finishFold(empty)).toThrow(/no frames were folded/)
    const fold = createFold(4, 1, { mono: true, reverseIndex: REVERSE_INDEX })
    for (const frame of MONO_FRAMES) foldFrame(fold, frame)
    finishFold(fold)
    expect(() => finishFold(fold)).toThrow(/already closed/)
    expect(() => foldFrame(fold, MONO_FRAMES[0])).toThrow(/is finished/)
  })
})

describe('seq-metrics: the red proof', () => {
  /**
   * A fold that measures persistence the way it is easy to get wrong: it
   * never closes the run that is still open when the sequence ends, so every
   * cell that held its glyph to the last frame contributes nothing. The
   * still-frame control is the case that exposes it - a picture that never
   * moved has no closed runs at all, and this fold divides by zero cleanly
   * and reports a confident 0.
   */
  function brokenPersistence(frames) {
    const n = frames[0].glyphs.length
    const runLength = new Array(n).fill(1)
    let runSum = 0
    let runCount = 0
    let prev = null
    for (const frame of frames) {
      if (prev) {
        for (let i = 0; i < n; i++) {
          if (frame.glyphs[i] !== prev[i]) {
            runSum += runLength[i]
            runCount++
            runLength[i] = 1
          } else runLength[i]++
        }
      }
      prev = [...frame.glyphs]
    }
    return Number((runSum / Math.max(1, runCount)).toFixed(2))
  }

  it('the persistence assertion fails on the arithmetic that forgets the open run', () => {
    const still = [MONO_FRAMES[0], MONO_FRAMES[0], MONO_FRAMES[0]]
    expect(foldMono(still).total.meanGlyphPersistenceFrames).toBe(3)
    expect(brokenPersistence(still)).toBe(0)
    expect(brokenPersistence(still)).not.toBe(3)

    expect(foldMono().total.meanGlyphPersistenceFrames).toBe(1.5)
    expect(brokenPersistence(MONO_FRAMES)).not.toBe(1.5)
  })

  /**
   * A flip counter that asks only "is this glyph what it was two frames ago"
   * without also asking "and did it change since the last frame". Every cell
   * that simply held its glyph then reads as a flip, which would have made
   * the still control - the one sequence whose answer is known - report a
   * fracture rate of 100 %.
   */
  function brokenFlips(frames) {
    const n = frames[0].glyphs.length
    let flips = 0
    for (let f = 2; f < frames.length; f++) {
      for (let i = 0; i < n; i++) {
        if (frames[f].glyphs[i] === frames[f - 2].glyphs[i]) flips++
      }
    }
    return flips
  }

  it('the flip assertion fails on the counter that forgets the change test', () => {
    const still = [MONO_FRAMES[0], MONO_FRAMES[0], MONO_FRAMES[0]]
    expect(foldMono(still).total.glyphFlipPct).toBe(0)
    expect(brokenFlips(still)).toBe(4)
    // on the real sequence the broken counter finds cells 1 and 3, which
    // never moved, on top of cell 0, which actually flipped.
    expect(brokenFlips(MONO_FRAMES)).toBe(3)
    expect(foldMono().total.glyphFlipPct).toBe(25)
  })
})
