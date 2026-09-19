import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  installCanvasMock,
  removeCanvasMock,
  createMockPreviewManager,
} from './hfm-convert-fixture.js'

// CW-52: the DEV-only cell probe. It is the instrument the temporal stability
// work is measured on, so what it promises has to hold: off by default, a
// SNAPSHOT rather than a live view of the converter's own arrays, and a grid
// that agrees with the cell count the stats already reported.

async function makeConverted(options = {}) {
  vi.resetModules()
  const { initAltView } = await import('../../src/js/_hfm.js')
  const pm = createMockPreviewManager()
  const api = await initAltView(pm, { allowTinyCells: true, ...options })
  api.setIntensityLevels([0.65, 1])
  api.setReverseVideo(0.8)
  const nowSpy = vi.spyOn(performance, 'now')
  api.enable()
  const convert = (t) => {
    api.invalidate()
    nowSpy.mockReturnValue(t)
    api.render()
  }
  return { api, convert, done: () => (nowSpy.mockRestore(), api.dispose()) }
}

describe('CW-52 cell probe', () => {
  beforeEach(() => installCanvasMock())
  afterEach(() => removeCanvasMock())

  it('is off until asked, and reads nothing while off', async () => {
    const { api, convert, done } = await makeConverted()
    convert(10000)
    expect(api.readCellProbe()).toBeNull()
    done()
  })

  it('reads a grid that agrees with the reported cell count', async () => {
    const { api, convert, done } = await makeConverted()
    expect(api.setCellProbe(true)).toBe(true)
    convert(10000)
    const probe = api.readCellProbe()
    expect(probe).not.toBeNull()
    const stats = api.getConvertStats()
    expect(probe.cols).toBe(stats.cols)
    expect(probe.rows).toBe(stats.rows)
    expect(probe.cols * probe.rows).toBe(stats.cells)
    expect(probe.glyphs.length).toBe(stats.cells)
    expect(probe.intensity.length).toBe(stats.cells)
    expect(probe.lum.length).toBe(stats.cells)
    // A probe of an empty picture would satisfy every length assertion above
    // and mean nothing, which is this project's recorded failure mode.
    expect(stats.cells).toBeGreaterThan(0)
    done()
  })

  it('hands back a snapshot, not a view of the live arrays', async () => {
    const { api, convert, done } = await makeConverted()
    api.setCellProbe(true)
    convert(10000)
    const first = api.readCellProbe()
    const glyphsBefore = Array.from(first.glyphs)
    const intensityBefore = Array.from(first.intensity)
    // Convert again, then scribble on the snapshot. Neither the next frame nor
    // the caller's own edit may reach back into what was already handed out.
    convert(20000)
    first.intensity[0] = 99
    first.glyphs[0] = -7
    expect(Array.from(api.readCellProbe().intensity)).toEqual(intensityBefore)
    expect(Array.from(api.readCellProbe().glyphs)).toEqual(glyphsBefore)
    done()
  })

  it('stops reading and lets go of its arrays when switched off', async () => {
    const { api, convert, done } = await makeConverted()
    api.setCellProbe(true)
    convert(10000)
    expect(api.readCellProbe()).not.toBeNull()
    expect(api.setCellProbe(false)).toBe(false)
    expect(api.readCellProbe()).toBeNull()
    // And it comes back, rather than staying dead after one round trip.
    api.setCellProbe(true)
    convert(20000)
    expect(api.readCellProbe()).not.toBeNull()
    done()
  })

  it('reports no drive decisions when the converter has none', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const pm = createMockPreviewManager()
    const api = await initAltView(pm, { allowTinyCells: true })
    api.setCellProbe(true)
    const nowSpy = vi.spyOn(performance, 'now')
    api.enable()
    api.invalidate()
    nowSpy.mockReturnValue(10000)
    api.render()
    const probe = api.readCellProbe()
    expect(probe).not.toBeNull()
    expect(probe.intensity).toBeNull()
    nowSpy.mockRestore()
    api.dispose()
  })
})
