import { describe, it, expect } from 'vitest'
import {
  stencilSetJobs,
  paintOrderText,
  exportStencilSet,
  EXPORT_STRINGS,
} from '../../src/js/stencil-export.js'

const COLOURS = ['Black', 'Brown', 'White', 'Green', 'Black', 'Pink']
const PARAMS = { plate_width: 60, margin: 10, stencil_mode: 'layered' }

/** A JSZip stand-in, so the test measures this module and not that one. */
class FakeZip {
  constructor() {
    this.entries = new Map()
  }
  file(name, data) {
    this.entries.set(name, data)
  }
  async generateAsync() {
    return { fake: true, size: this.entries.size }
  }
}

describe('stencilSetJobs', () => {
  it('names every file after the colour it paints', () => {
    const jobs = stencilSetJobs({
      parameters: PARAMS,
      plateCount: 6,
      colourNames: COLOURS,
    })
    expect(jobs.map((j) => j.filename)).toEqual([
      'plate-1-black.stl',
      'plate-2-brown.stl',
      'plate-3-white.stl',
      'plate-4-green.stl',
      'plate-5-black.stl',
      'plate-6-pink.stl',
    ])
  })

  it('sets the plate number and leaves everything else alone', () => {
    const jobs = stencilSetJobs({ parameters: PARAMS, plateCount: 3 })
    expect(jobs[2].parameters.plate_number).toBe(3)
    expect(jobs[2].parameters.plate_width).toBe(60)
    expect(jobs[2].parameters.output_part).toBe('plate')
    expect(PARAMS.plate_number).toBeUndefined()
  })

  it('adds the jig base last, and only when it is asked for', () => {
    const withJig = stencilSetJobs({
      parameters: PARAMS,
      plateCount: 2,
      includeJig: true,
    })
    expect(withJig).toHaveLength(3)
    expect(withJig[2].filename).toBe('jig-base.stl')
    expect(withJig[2].parameters.output_part).toBe('jig_base')
    expect(stencilSetJobs({ parameters: PARAMS, plateCount: 2 })).toHaveLength(2)
  })

  it('carries the chosen format into every name', () => {
    const jobs = stencilSetJobs({
      parameters: PARAMS,
      plateCount: 2,
      includeJig: true,
      format: 'svg',
    })
    expect(jobs.every((j) => j.filename.endsWith('.svg'))).toBe(true)
  })

  it('falls back to a plain name when the colours are unknown', () => {
    const jobs = stencilSetJobs({ parameters: PARAMS, plateCount: 2 })
    expect(jobs[0].filename).toBe('plate-1.stl')
    expect(jobs[0].label).toBe('Plate 1')
  })
})

describe('paintOrderText', () => {
  const text = paintOrderText(COLOURS, 'harley')

  it('names the design and every plate in order', () => {
    expect(text).toContain('Paint order for harley')
    expect(text).toContain('Plate 1, Black')
    expect(text).toContain('Plate 6, Pink')
    expect(text.indexOf('Plate 1')).toBeLessThan(text.indexOf('Plate 6'))
  })

  it('says the first coat is the ground and the rest go on over it', () => {
    expect(text).toMatch(/Plate 1, Black: .*bare surface/)
    expect(text).toMatch(/Plate 2, Brown: .*line it up/)
  })

  it('keeps to US English with no em dashes', () => {
    expect(text).not.toContain('—')
  })
})

describe('exportStencilSet', () => {
  const render = async () => ({ data: new Uint8Array([1, 2, 3]) })

  it('renders every job in order and puts the paint order in with them', async () => {
    const seen = []
    const { files, filename } = await exportStencilSet({
      jobs: stencilSetJobs({
        parameters: PARAMS,
        plateCount: 6,
        colourNames: COLOURS,
        includeJig: true,
      }),
      render: async (p) => {
        seen.push(p.output_part === 'jig_base' ? 'jig' : p.plate_number)
        return { data: new Uint8Array([1]) }
      },
      designName: 'harley',
      colourNames: COLOURS,
      JSZipClass: FakeZip,
    })
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 'jig'])
    expect(files).toHaveLength(8)
    expect(files).toContain('paint-order.txt')
    expect(filename).toBe('harley-plates.zip')
  })

  it('says which part it got to before it stopped', async () => {
    await expect(
      exportStencilSet({
        jobs: stencilSetJobs({
          parameters: PARAMS,
          plateCount: 3,
          colourNames: COLOURS,
        }),
        render: async (p) => (p.plate_number === 2 ? null : { data: new Uint8Array([1]) }),
        designName: 'harley',
        JSZipClass: FakeZip,
      })
    ).rejects.toThrow(/Plate 2, Brown did not render/)
  })

  it('counts every part out loud, including the last', async () => {
    const said = []
    await exportStencilSet({
      jobs: stencilSetJobs({ parameters: PARAMS, plateCount: 2 }),
      render,
      designName: 'x',
      onProgress: (done, total, label) => said.push([done, total, label]),
      JSZipClass: FakeZip,
    })
    expect(said).toEqual([
      [0, 2, 'Plate 1'],
      [1, 2, 'Plate 2'],
      [2, 2, null],
    ])
  })

  it('refuses an empty set rather than handing back an empty zip', async () => {
    await expect(
      exportStencilSet({ jobs: [], render, designName: 'x', JSZipClass: FakeZip })
    ).rejects.toThrow(/no plates/)
  })
})

describe('the strings it says', () => {
  it('counts, so a person who cannot see the button still knows', () => {
    expect(EXPORT_STRINGS.step(0, 7, 'Plate 1, Black')).toBe(
      'Plate 1, Black. Part 1 of 7.'
    )
    expect(EXPORT_STRINGS.done(8, 'harley-plates.zip')).toContain('8 files')
  })

  it('uses no em dashes', () => {
    for (const v of Object.values(EXPORT_STRINGS)) {
      const s = typeof v === 'function' ? v(1, 2, 'x') : v
      expect(String(s)).not.toContain('—')
    }
  })
})
