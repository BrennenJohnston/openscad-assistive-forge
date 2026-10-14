/**
 * The characters the braille sign's raised letters can draw: the module's
 * ranges against the font's own character map, and the warning's list.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  SIGN_FONT_RANGES,
  charactersTheSignCannotDraw,
} from '../../src/js/braille-sign-glyphs.js'

/**
 * The code points a TrueType font maps to a glyph other than 0 (.notdef,
 * the hollow square), read from its Windows Unicode cmap subtable, merged
 * into [first, last] ranges.
 */
function fontRanges(file) {
  const buf = readFileSync(file)
  const u16 = (o) => buf.readUInt16BE(o)
  const u32 = (o) => buf.readUInt32BE(o)
  let cmap = -1
  for (let i = 0; i < u16(4); i++) {
    const rec = 12 + i * 16
    if (buf.toString('latin1', rec, rec + 4) === 'cmap') cmap = u32(rec + 8)
  }
  const subtables = []
  for (let i = 0; i < u16(cmap + 2); i++) {
    const rec = cmap + 4 + i * 8
    subtables.push({ platform: u16(rec), encoding: u16(rec + 2), at: cmap + u32(rec + 4) })
  }
  const pick = subtables.find(
    (s) => s.platform === 3 && s.encoding === 1 && u16(s.at) === 4
  )
  const o = pick.at
  const segCount = u16(o + 6) / 2
  const ends = o + 14
  const starts = ends + segCount * 2 + 2
  const deltas = starts + segCount * 2
  const offsets = deltas + segCount * 2
  const points = []
  for (let s = 0; s < segCount; s++) {
    const start = u16(starts + s * 2)
    const end = u16(ends + s * 2)
    const delta = u16(deltas + s * 2)
    const offset = u16(offsets + s * 2)
    for (let c = start; c <= end && c !== 0xffff; c++) {
      const raw = offset === 0 ? c : u16(offsets + s * 2 + offset + (c - start) * 2)
      const glyph = offset !== 0 && raw === 0 ? 0 : (raw + delta) & 0xffff
      if (glyph !== 0) points.push(c)
    }
  }
  const ranges = []
  for (const c of points.sort((a, b) => a - b)) {
    const last = ranges[ranges.length - 1]
    if (last && c === last[1] + 1) last[1] = c
    else ranges.push([c, c])
  }
  return ranges
}

describe('the sign font\'s character map', () => {
  it('is the map of the font the sign draws its letters with', () => {
    const font = join(process.cwd(), 'public', 'fonts', 'LiberationSans-Regular.ttf')
    expect(SIGN_FONT_RANGES).toEqual(fontRanges(font))
  })
})

describe('charactersTheSignCannotDraw', () => {
  it('finds nothing in a sign the font draws whole', () => {
    expect(charactersTheSignCannotDraw('ROOM 101')).toEqual([])
    expect(charactersTheSignCannotDraw('Café Ωμέγα Жилой €5 “Exit” – 1…2')).toEqual([])
  })

  it('names each character the font has no shape for, once, in the order typed', () => {
    expect(charactersTheSignCannotDraw('ROOM 字 😀')).toEqual(['字', '😀'])
    expect(charactersTheSignCannotDraw('★字★ 字')).toEqual(['★', '字'])
    expect(charactersTheSignCannotDraw('⠗⠕⠕⠍')).toEqual(['⠗', '⠕', '⠍'])
  })

  it('leaves out white space, which draws nothing either way', () => {
    expect(charactersTheSignCannotDraw('ROOM\t101\nEXIT A　B')).toEqual([])
  })

  it('leaves out a joiner or variation selector, which never prints as a square', () => {
    expect(charactersTheSignCannotDraw('☺️')).toEqual([])
    expect(charactersTheSignCannotDraw('\u{1f468}‍\u{1f469}')).toEqual([
      '\u{1f468}',
      '\u{1f469}',
    ])
  })
})
