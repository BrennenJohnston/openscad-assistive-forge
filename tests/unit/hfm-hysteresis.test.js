import { describe, it, expect } from 'vitest'
import {
  DEFAULT_HYSTERESIS,
  MAX_HOLD_FRAMES,
  normalizeHysteresis,
  glyphWithMemory,
  reverseWithMemory,
  driveWithMemory,
  shapeDistance2,
  createHistory,
  ensureHistory,
} from '../../src/js/_hfm-hysteresis.js'
import { pickIntensityIndex } from '../../src/js/_hfm-paint.js'
import { CITY_TEMPORAL_HYSTERESIS } from '../../src/js/game/hc-palettes.js'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * CW-68. The whole release is one claim - "a cell that barely changed keeps
 * what it had, and a cell whose surface changed does not" - so every test
 * below states the OLD stateless answer beside the new one. A test that only
 * checks the new behaviour cannot tell a working dead band from a band of
 * zero, which is the shape of the bug this would ship.
 */

const BAND = 0.02

describe('_hfm-hysteresis: the glyph memory', () => {
  it('holds the previous glyph when the new candidate is barely better', () => {
    // Stateless: candidate 7 wins, because 0.100 < 0.110. It always wins.
    const stateless = 7
    const held = glyphWithMemory({
      candidate: stateless,
      candidateDist2: 0.1,
      prevGlyph: 3,
      prevDist2: 0.11,
      band: BAND,
      hold: 0,
      holdFrames: 30,
      reset: false,
    })
    expect(held.glyph).toBe(3)
    expect(held.glyph).not.toBe(stateless)
    expect(held.hold).toBe(1)
  })

  it('takes the new glyph when it wins by more than the band', () => {
    const res = glyphWithMemory({
      candidate: 7,
      candidateDist2: 0.1,
      prevGlyph: 3,
      prevDist2: 0.15,
      band: BAND,
      hold: 4,
      holdFrames: 30,
      reset: false,
    })
    expect(res.glyph).toBe(7)
    expect(res.hold).toBe(0)
  })

  it('takes the new glyph the instant the surface under the cell changes', () => {
    // The CW-52 objection, answered: a cell that swept across a geometry edge
    // must not keep the glyph of the surface it left, however close the
    // distances are.
    const res = glyphWithMemory({
      candidate: 7,
      candidateDist2: 0.1,
      prevGlyph: 3,
      prevDist2: 0.1000001,
      band: BAND,
      hold: 0,
      holdFrames: 30,
      reset: true,
    })
    expect(res.glyph).toBe(7)
    expect(res.hold).toBe(0)
  })

  it('expires: no cell overrides the pick for more than holdFrames in a row', () => {
    const args = {
      candidate: 7,
      candidateDist2: 0.1,
      prevGlyph: 3,
      prevDist2: 0.11,
      band: BAND,
      holdFrames: 3,
      reset: false,
    }
    let hold = 0
    const glyphs = []
    for (let frame = 0; frame < 5; frame++) {
      const res = glyphWithMemory({ ...args, hold })
      glyphs.push(res.glyph)
      hold = res.hold
    }
    // Held for three frames, then the expiry forces the candidate through.
    expect(glyphs).toEqual([3, 3, 3, 7, 3])
  })

  it('does not count agreement as holding, so a stable cell never expires', () => {
    // If `hold` counted frames on screen rather than frames of override, a
    // cell that had shown one glyph for holdFrames would be forced to change
    // the moment anything drifted - the opposite of the point.
    let hold = 0
    for (let frame = 0; frame < 50; frame++) {
      const res = glyphWithMemory({
        candidate: 3,
        candidateDist2: 0.1,
        prevGlyph: 3,
        prevDist2: 0.1,
        band: BAND,
        hold,
        holdFrames: 3,
        reset: false,
      })
      hold = res.hold
      expect(res.glyph).toBe(3)
    }
    expect(hold).toBe(0)
    // ... and it can still hold on the very next frame.
    expect(
      glyphWithMemory({
        candidate: 7,
        candidateDist2: 0.1,
        prevGlyph: 3,
        prevDist2: 0.11,
        band: BAND,
        hold,
        holdFrames: 3,
        reset: false,
      }).glyph
    ).toBe(3)
  })

  it('is exactly the stateless pick when the band is zero', () => {
    const res = glyphWithMemory({
      candidate: 7,
      candidateDist2: 0.1,
      prevGlyph: 3,
      prevDist2: 0.1,
      band: 0,
      hold: 0,
      holdFrames: 30,
      reset: false,
    })
    expect(res.glyph).toBe(7)
  })

  it('takes the candidate on the first frame, when there is no memory', () => {
    expect(
      glyphWithMemory({
        candidate: 7,
        candidateDist2: 0.1,
        prevGlyph: -1,
        prevDist2: 0,
        band: BAND,
        hold: 0,
        holdFrames: 30,
        reset: false,
      }).glyph
    ).toBe(7)
  })
})

describe('_hfm-hysteresis: reverse video', () => {
  const AT = 0.8

  it('needs 0.82 to enter and stays until 0.78, where the cliff flipped at 0.80', () => {
    // The stateless cliff: 0.799 and 0.801 are different cells.
    expect(0.799 >= AT).toBe(false)
    expect(0.801 >= AT).toBe(true)
    // With the band, neither of those changes anything either way.
    expect(reverseWithMemory(0.801, false, AT, 0.02)).toBe(false)
    expect(reverseWithMemory(0.799, true, AT, 0.02)).toBe(true)
    expect(reverseWithMemory(0.821, false, AT, 0.02)).toBe(true)
    expect(reverseWithMemory(0.779, true, AT, 0.02)).toBe(false)
  })

  it('is comparing against a float sum, exactly on the boundary', () => {
    // 0.8 + 0.02 is 0.8200000000000001 in binary floating point, so a cell
    // at exactly 0.82 does NOT enter. Pinned rather than papered over: the
    // band is a decision about a hair's breadth either way, and somebody
    // reading "enter at 0.82" should be able to find out what that means.
    expect(0.8 + 0.02).not.toBe(0.82)
    expect(reverseWithMemory(0.82, false, AT, 0.02)).toBe(false)
    expect(reverseWithMemory(0.78, true, AT, 0.02)).toBe(true)
  })

  it('is the bare cliff when the band is zero', () => {
    for (const lum of [0.5, 0.79, 0.799, 0.8, 0.81, 1]) {
      expect(reverseWithMemory(lum, false, AT, 0)).toBe(lum >= AT)
      expect(reverseWithMemory(lum, true, AT, 0)).toBe(lum >= AT)
    }
  })

  it('does not flicker over a drift that straddles the cliff', () => {
    // A cell breathing between 0.79 and 0.81 - the measured shape of the
    // lamp-cone edge - flips every frame without the band and never with it.
    const drift = [0.79, 0.81, 0.79, 0.81, 0.79, 0.81]
    const bare = drift.map((lum) => lum >= AT)
    expect(bare).toEqual([false, true, false, true, false, true])
    let was = false
    const held = drift.map((lum) => {
      was = reverseWithMemory(lum, was, AT, 0.02)
      return was
    })
    expect(held).toEqual([false, false, false, false, false, false])
  })
})

describe('_hfm-hysteresis: the drive level', () => {
  it('agrees with the shipped pick everywhere except near a boundary', () => {
    for (const lum of [0, 0.1, 0.25, 0.4, 0.6, 0.75, 0.9, 1]) {
      expect(driveWithMemory(lum, -1, 2, 0.02)).toBe(pickIntensityIndex(lum, 2))
    }
  })

  it('holds the previous level within the band of the boundary it crossed', () => {
    // Two levels: the boundary is 0.5.
    expect(pickIntensityIndex(0.51, 2)).toBe(1)
    expect(driveWithMemory(0.51, 0, 2, 0.02)).toBe(0)
    expect(driveWithMemory(0.49, 1, 2, 0.02)).toBe(1)
    // Outside the band the change is taken.
    expect(driveWithMemory(0.53, 0, 2, 0.02)).toBe(1)
    expect(driveWithMemory(0.47, 1, 2, 0.02)).toBe(0)
  })

  it('always takes a jump of more than one level', () => {
    expect(driveWithMemory(0.99, 0, 4, 0.5)).toBe(3)
  })

  it('is the shipped pick when the band is zero', () => {
    for (const lum of [0.49, 0.5, 0.51, 0.999]) {
      expect(driveWithMemory(lum, 0, 2, 0)).toBe(pickIntensityIndex(lum, 2))
      expect(driveWithMemory(lum, 1, 2, 0)).toBe(pickIntensityIndex(lum, 2))
    }
  })

  it('does not flicker over a drift that straddles the boundary', () => {
    const drift = [0.49, 0.505, 0.49, 0.505]
    expect(drift.map((l) => pickIntensityIndex(l, 2))).toEqual([0, 1, 0, 1])
    let prev = 0
    expect(
      drift.map((l) => {
        prev = driveWithMemory(l, prev, 2, 0.02)
        return prev
      })
    ).toEqual([0, 0, 0, 0])
  })
})

describe('_hfm-hysteresis: configuration and history', () => {
  it('treats null, false and all-zero bands as OFF', () => {
    expect(normalizeHysteresis(null)).toBeNull()
    expect(normalizeHysteresis(false)).toBeNull()
    expect(normalizeHysteresis({ glyph: 0, drive: 0, reverse: 0 })).toBeNull()
    // One band left standing is still ON: a caller may want the reverse
    // cliff calmed and nothing else.
    expect(normalizeHysteresis({ glyph: 0, drive: 0 })).not.toBeNull()
  })

  it('gives the reverse cliff a band of its own', () => {
    // The two cliffs are not the same mistake: a drive step changes a cell's
    // brightness, the reverse cliff turns it into a solid block. A release
    // that widens one must be able to leave the other alone.
    const bands = normalizeHysteresis({ drive: 0.1, reverse: 0.02 })
    expect(bands.drive).toBe(0.1)
    expect(bands.reverse).toBe(0.02)
    // The wide drive band holds a level across the 0.5 boundary...
    expect(driveWithMemory(0.55, 0, 2, bands.drive)).toBe(0)
    // ...while the narrow reverse band still lets 0.83 through.
    expect(reverseWithMemory(0.83, false, 0.8, bands.reverse)).toBe(true)
    expect(reverseWithMemory(0.85, false, 0.8, 0.1)).toBe(false)
  })

  it('fills the defaults and clamps the hold to what one byte can carry', () => {
    expect(normalizeHysteresis({})).toEqual(DEFAULT_HYSTERESIS)
    expect(normalizeHysteresis({ holdFrames: 9999 }).holdFrames).toBe(
      MAX_HOLD_FRAMES
    )
    expect(normalizeHysteresis({ holdFrames: 0 }).holdFrames).toBe(1)
    expect(normalizeHysteresis({ glyph: -1 }).glyph).toBe(
      DEFAULT_HYSTERESIS.glyph
    )
    // The alpha packing this clamp exists for: hold * 2 + reversed must fit.
    expect(MAX_HOLD_FRAMES * 2 + 1).toBeLessThanOrEqual(255)
  })

  it('starts every cell with no memory at all', () => {
    const h = createHistory(4)
    expect([...h.glyph]).toEqual([-1, -1, -1, -1])
    expect([...h.drive]).toEqual([-1, -1, -1, -1])
    expect([...h.hold]).toEqual([0, 0, 0, 0])
    expect([...h.reversed]).toEqual([0, 0, 0, 0])
    expect([...h.cls]).toEqual([-1, -1, -1, -1])
  })

  it('throws the history away when the grid changes size', () => {
    const first = createHistory(4)
    first.glyph[0] = 9
    expect(ensureHistory(first, 4)).toBe(first)
    const grown = ensureHistory(first, 6)
    expect(grown).not.toBe(first)
    expect(grown.cells).toBe(6)
    expect(grown.glyph[0]).toBe(-1)
  })

  it('measures shape distance the way the pick does', () => {
    const cell = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]
    expect(shapeDistance2(cell, cell)).toBe(0)
    expect(shapeDistance2(cell, [0.2, 0.2, 0.3, 0.4, 0.5, 0.6])).toBeCloseTo(
      0.01,
      12
    )
  })
})

describe('_hfm-hysteresis: whose converter gets a memory', () => {
  /**
   * The converter is SHARED. `_hfm.js` draws the main app's Alt View as well
   * as the game, and the Alt View converts ONE STILL FRAME: a memory of a
   * previous frame can only cost it, and the round's hard rule is that the
   * main app's defaults do not move. The guarantee is structural, so the
   * guard is too - a future release that reaches for setTemporalHysteresis
   * from anywhere else has to come here and say why.
   */
  /** Every converter switch that must stay the game's alone, and its caller. */
  const GAME_ONLY_SWITCHES = [
    ['.setTemporalHysteresis', 'js/game/city-walk-controller.js'],
    // CW-70: the share cap bounds the solid bright layer. The main app's Alt
    // View draws a still and has no layer to bound.
    ['.setReverseShareCap', 'js/game/city-walk-controller.js'],
  ]

  it('is turned on by the city walk, and by nothing else in src/', () => {
    // vitest runs from the repository root, and its import.meta.url is a
    // served URL rather than a file one - so the path comes from the cwd.
    const root = join(process.cwd(), 'src')
    const callers = []
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.name.endsWith('.js')) {
          const text = readFileSync(full, 'utf8')
          if (text.includes('.setTemporalHysteresis')) {
            callers.push(relative(root, full).split(sep).join('/'))
          }
        }
      }
    }
    walk(root)
    expect(callers).toEqual(['js/game/city-walk-controller.js'])
  })

  it('keeps every other game-only converter switch out of the main app too', () => {
    const root = join(process.cwd(), 'src')
    const files = []
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.name.endsWith('.js')) files.push(full)
      }
    }
    walk(root)
    for (const [call, expected] of GAME_ONLY_SWITCHES) {
      const callers = files
        .filter((f) => readFileSync(f, 'utf8').includes(call))
        .map((f) => relative(root, f).split(sep).join('/'))
      expect(callers, `${call} is called from more than the game`).toEqual([
        expected,
      ])
    }
  })

  it('the game asks for bands that are actually on', () => {
    expect(normalizeHysteresis(CITY_TEMPORAL_HYSTERESIS)).toEqual(
      CITY_TEMPORAL_HYSTERESIS
    )
  })
})
