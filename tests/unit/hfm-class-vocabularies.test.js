import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  installCanvasMock,
  removeCanvasMock,
  createMockPreviewManager,
} from './hfm-convert-fixture.js'
import { buildVocabSpans, MAX_CLASS_SPANS } from '../../src/js/_hfm-gpu.js'
import { SPACE_INDEX, FIRST_CHAR_CODE } from '../../src/js/_hfm-paint.js'

/**
 * CW-93 (D-128): a cell draws from ITS OWN SURFACE'S vocabulary, in every
 * mode and on both converter paths.
 *
 * The owner photographed a building's window pattern drawn onto the underside
 * of a street tree. The cause was one line: the GPU path was handed
 * `useClassVocabularies: !usePalette`, so in COLOUR mode every classified cell
 * searched the full 95-glyph atlas and a canopy and a facade were drawn with
 * the same alphabet. Measured at 69 % of the grid, Day and Night alike, with
 * the memory on and off - it was never a trail. The CPU path had always
 * applied the vocabularies in both modes, so the two implementations of the
 * same converter disagreed about what they drew, which is the one thing this
 * file exists to stop.
 *
 * The shader cannot run here, so the guards are split the way `hfm-gpu.test.js`
 * splits them: the CPU path is exercised for real, the span arithmetic the
 * shader reads is exercised for real through `buildVocabSpans`, and the one
 * line that cannot be reached from either is pinned by reading the source.
 * The e2e board runs the real shader (ascii-city-walk-street.spec.js, CW-93).
 */

const cpuSource = readFileSync(
  join(process.cwd(), 'src', 'js', '_hfm.js'),
  'utf8'
)

/**
 * The file with its line comments taken out.
 *
 * A source-text guard has to read the CODE. The comment above the fixed line
 * quotes the broken one word for word - that is what makes it worth reading -
 * and a plain search would find the quotation and fail on a healthy file.
 */
const cpuCode = cpuSource.replace(/^\s*\/\/.*$/gm, '')

/** Two surfaces with nothing in common but the space every row carries. */
const CLASS_A = 1
const CLASS_B = 4
const VOCABULARIES = {
  [CLASS_A]: ' .,^*oO&%@8wvV',
  [CLASS_B]: " .:'!|ilI[]{}()JLbdhnuPRBM#%8&$@",
}

/** The atlas indices a row allows, plus the space the builder always adds. */
function allowedIndices(chars) {
  const out = new Set([SPACE_INDEX])
  for (const ch of chars) out.add(ch.charCodeAt(0) - FIRST_CHAR_CODE)
  return out
}

/**
 * One conversion with a class map that splits the grid in half, so every cell
 * belongs to one of the two rows above and the answer is checkable.
 */
async function convertWithClasses({ palette }) {
  vi.resetModules()
  const { initAltView } = await import('../../src/js/_hfm.js')
  const pm = createMockPreviewManager()
  const api = await initAltView(pm, {
    allowTinyCells: true,
    glyphVocabularies: VOCABULARIES,
    classMapProvider: (cols, rows) => {
      const map = new Uint8Array(cols * rows)
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          map[r * cols + c] = c < cols / 2 ? CLASS_A : CLASS_B
        }
      }
      return map
    },
  })
  if (palette) {
    api.setPalette(['#000000', '#ff0000', '#00ff00', '#0000ff', '#ffffff'])
  } else {
    api.setIntensityLevels([0.65, 1])
  }
  api.setCellProbe(true)
  const nowSpy = vi.spyOn(performance, 'now')
  api.enable()
  api.invalidate()
  nowSpy.mockReturnValue(10000)
  api.render()
  const probe = api.readCellProbe()
  const stats = api.getConvertStats()
  nowSpy.mockRestore()
  api.dispose()
  return { probe, stats, usedGpu: stats.usedGpu }
}

/** Split the probe's glyphs by which half of the grid they sit in. */
function tally(probe) {
  const a = new Map()
  const b = new Map()
  for (let r = 0; r < probe.rows; r++) {
    for (let c = 0; c < probe.cols; c++) {
      const glyph = probe.glyphs[r * probe.cols + c]
      const into = c < probe.cols / 2 ? a : b
      into.set(glyph, (into.get(glyph) ?? 0) + 1)
    }
  }
  return { a, b }
}

describe('CW-93 — a cell draws from its own surface vocabulary (CPU path)', () => {
  beforeEach(() => installCanvasMock())
  afterEach(() => {
    removeCanvasMock()
    vi.restoreAllMocks()
  })

  for (const palette of [false, true]) {
    const name = palette ? 'palette mode' : 'mono'
    it(`obeys every class row in ${name}`, async () => {
      const { probe, usedGpu } = await convertWithClasses({ palette })
      // jsdom has no WebGL2, so this is the CPU path by construction. Said out
      // loud because a case that quietly measured the other one would be the
      // exact defect this file is about.
      expect(usedGpu).toBe(false)
      const { a, b } = tally(probe)
      const legalA = allowedIndices(VOCABULARIES[CLASS_A])
      const legalB = allowedIndices(VOCABULARIES[CLASS_B])

      // ★ THE FIXTURE MUST CONTAIN THE THING IT GUARDS. A picture that drew
      // one character everywhere would satisfy every subset assertion below
      // and prove nothing - this round has already shipped a guard that passed
      // with its subject deliberately broken because its fixture was empty.
      expect(a.size, 'characters drawn on class A').toBeGreaterThan(2)
      expect(b.size, 'characters drawn on class B').toBeGreaterThan(2)
      const nonSpaceA = [...a.keys()].filter((g) => g !== SPACE_INDEX)
      const nonSpaceB = [...b.keys()].filter((g) => g !== SPACE_INDEX)
      expect(nonSpaceA.length).toBeGreaterThan(1)
      expect(nonSpaceB.length).toBeGreaterThan(1)

      const illegalA = [...a.keys()].filter((g) => !legalA.has(g))
      const illegalB = [...b.keys()].filter((g) => !legalB.has(g))
      const show = (list) =>
        list.map((g) => `"${String.fromCharCode(32 + g)}"`).join(' ')
      expect(illegalA, `class A drew ${show(illegalA)}`).toEqual([])
      expect(illegalB, `class B drew ${show(illegalB)}`).toEqual([])

      // And the two halves did not simply end up drawing the same thing: the
      // rows share only the space, so a picture obeying both must differ.
      const overlap = nonSpaceA.filter((g) => nonSpaceB.includes(g))
      expect(overlap.length).toBeLessThan(nonSpaceA.length)
    })
  }
})

describe('CW-93 — the reverse atlas belongs to the intensity ladder (D-129)', () => {
  beforeEach(() => installCanvasMock())
  afterEach(() => {
    removeCanvasMock()
    vi.restoreAllMocks()
  })

  it('gives the ladder back, with reverse video, after a round trip through a palette', async () => {
    // `reverseAtlasIndex` is an index INTO `intensityAtlases`, and palette mode
    // has none - so CW-93 clears it there, which is what stops the GPU path
    // reversing bright colour cells with a threshold left over from mono. The
    // risk in that change is the way back: a player who turns colour on and
    // off again must get their solid highlights back. The e2e board holds the
    // defect itself (it needs the real shader); this holds the round trip.
    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const pm = createMockPreviewManager()
    const api = await initAltView(pm, { allowTinyCells: true })
    api.setIntensityLevels([0.65, 1])
    // The shipped threshold is 0.80; the synthetic frame this fixture paints
    // has no cell that bright, and a round-trip case with no reverse cells in
    // it would pass while proving nothing. The threshold is a caller's number,
    // so the case picks one its own picture can reach.
    api.setReverseVideo(0.3)
    api.setCellProbe(true)
    const nowSpy = vi.spyOn(performance, 'now')
    api.enable()

    const convert = (t) => {
      api.invalidate()
      nowSpy.mockReturnValue(t)
      api.render()
      return api.readCellProbe()
    }
    // The reverse atlas rides one past the last drive level.
    const reverseIndex = 2
    const reversedCells = (probe) =>
      probe.intensity
        ? [...probe.intensity].filter((v) => v === reverseIndex).length
        : null

    const before = reversedCells(convert(10000))
    // The fixture must contain the thing it guards: a picture with no solid
    // cells in it would pass the round trip while proving nothing.
    expect(before, 'reverse-video cells in the mono picture').toBeGreaterThan(0)

    api.setPalette(['#000000', '#ff0000', '#00ff00', '#0000ff', '#ffffff'])
    expect(convert(20000).intensity, 'palette mode has no drive ladder').toBe(
      null
    )

    api.setPalette(null)
    const after = reversedCells(convert(30000))
    expect(after).toBe(before)

    nowSpy.mockRestore()
    api.dispose()
  })
})

describe('CW-93 — the span table the shader reads', () => {
  const FULL = Array.from({ length: 95 }, (_, i) => i)

  it('gives each class its own span, and the full atlas to span 0', () => {
    const { flat, spans } = buildVocabSpans([
      { spanIndex: 0, ids: FULL },
      { spanIndex: 5, ids: [0, 7, 9] },
    ])
    expect(spans[0]).toBe(0)
    expect(spans[1]).toBe(95)
    expect(spans[5 * 2]).toBe(95)
    expect(spans[5 * 2 + 1]).toBe(3)
    expect(flat.slice(95)).toEqual([0, 7, 9])
  })

  it('★ falls back to the FULL atlas for a class with no vocabulary', async () => {
    // The shader searches `count` entries starting at `start`; a count of zero
    // means the loop never runs and the cell keeps glyph 0, the space. Every
    // span index must therefore name a real, non-empty list - SKY has no row
    // in glyph-vocabularies.js and would otherwise be forced blank on the GPU
    // path while the CPU path drew it from the full atlas.
    const { spans } = buildVocabSpans([
      { spanIndex: 0, ids: FULL },
      { spanIndex: 5, ids: [0, 7, 9] },
    ])
    for (let i = 0; i < MAX_CLASS_SPANS; i++) {
      expect(spans[i * 2 + 1], `span ${i} is empty`).toBeGreaterThan(0)
    }
    // SKY is class 0, which the shader reads at span index 1.
    expect(spans[1 * 2]).toBe(spans[0])
    expect(spans[1 * 2 + 1]).toBe(spans[1])

    // The red proof, in the same case: the rule really is what makes the
    // difference. Without the fallback loop, span 1 would be [0, 0].
    const { GLYPH_VOCABULARIES } = await import(
      '../../src/js/game/glyph-vocabularies.js'
    )
    const { SURFACE_CLASS } = await import(
      '../../src/js/game/city-class-pass.js'
    )
    expect(GLYPH_VOCABULARIES[SURFACE_CLASS.SKY]).toBeUndefined()
  })

  it('drops a span index the table cannot carry rather than writing past it', () => {
    const { spans } = buildVocabSpans([
      { spanIndex: 0, ids: FULL },
      { spanIndex: MAX_CLASS_SPANS, ids: [1, 2] },
    ])
    expect(spans.length).toBe(MAX_CLASS_SPANS * 2)
    expect(spans[(MAX_CLASS_SPANS - 1) * 2 + 1]).toBe(95)
  })
})

describe('CW-93 — the GPU path is not excused from the vocabularies', () => {
  it('does not gate useClassVocabularies on the palette', () => {
    // The defect, in one line. `useClassVocabularies: !usePalette` shipped
    // from CW-32 to CW-93 and switched the whole art direction off for every
    // player in colour mode. The shader cannot be run here, so the call site
    // is read instead - the same technique this file's sibling uses for the
    // tap table and the contrast curves.
    expect(cpuCode).toContain('useClassVocabularies: true')
    expect(cpuCode).not.toMatch(/useClassVocabularies:\s*!usePalette/)
  })

  it('binds the class texture in both modes', () => {
    // Without the texture there is no class id in the shader at all, so the
    // vocabulary could not apply even when it is asked for. This is the other
    // half of the same line, and CW-68 already fixed it for the memory.
    expect(cpuCode).not.toMatch(/classTexture:\s*usePalette/)
  })
})
