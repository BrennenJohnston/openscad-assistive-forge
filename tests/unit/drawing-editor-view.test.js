/**
 * The drawing editor's view (DP-21): the plan drawn over the art, "Show
 * original", the two-stroke highlight that pulses and settles (and never
 * pulses under reduced motion), the plate stepper, and the contrast the
 * highlight's two strokes have against any region colour, measured with the
 * app's own helper on the tokens' own values.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('../../src/js/focus-trap.js', () => ({
  createDocumentFocusTrap: vi.fn(() => ({
    activate: vi.fn(),
    deactivate: vi.fn(),
    isActive: vi.fn(() => false),
  })),
}))
vi.mock('../../src/js/announcer.js', () => ({
  announce: vi.fn(),
  POLITENESS: { POLITE: 'polite', ASSERTIVE: 'assertive' },
}))
vi.mock('../../src/js/feature-flags.js', () => ({
  isEnabled: vi.fn(() => false),
}))

import { createRegionCanvas } from '../../src/js/drawing-editor/canvas.js'
import { createDrawingEditor } from '../../src/js/drawing-editor/surface.js'
import { EDITOR_STRINGS as S } from '../../src/js/drawing-editor/strings.js'
import { analyzeSvg } from '../../src/js/svg-preparer.js'
import { contrastRatio, relativeLuminance } from '../../src/js/color-utils.js'
import { paintSequence } from '../../src/js/stencil-plates.js'

const CAT_SVG = readFileSync(join('tests', 'fixtures', 'harley', 'sketch4.svg'), 'utf8')
const VARIABLES_CSS = readFileSync(join('src', 'styles', 'variables.css'), 'utf8')

const REGIONS = [
  { key: 'a', d: 'M 0 0 H 10 V 10 H 0 Z', bbox: { minX: 0, minY: 0, maxX: 10, maxY: 10 }, interior: { x: 5, y: 5 } },
  { key: 'b', d: 'M 20 0 H 30 V 10 H 20 Z', bbox: { minX: 20, minY: 0, maxX: 30, maxY: 10 }, interior: { x: 25, y: 5 } },
]

/** Pretend the person asked for less motion, or did not. */
function setReducedMotion(reduce) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query) => ({
      matches: reduce && /prefers-reduced-motion: reduce/.test(query),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })),
  })
}

describe('the canvas view (DP-21)', () => {
  let container
  let canvas
  const label = document.createElement('span')

  beforeEach(() => {
    setReducedMotion(false)
    container = document.createElement('div')
    label.id = 'lbl'
    document.body.append(label, container)
    canvas = createRegionCanvas({ container, labelId: 'lbl', on: {} })
    canvas.setDrawing(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 10"><rect width="40" height="10"/></svg>',
      REGIONS,
      { minX: 0, minY: 0, maxX: 40, maxY: 10 }
    )
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('draws the layers in order: art, regions, plate, highlight, marquee', () => {
    const layers = [...canvas.svg.querySelectorAll('[data-layer]')].map((el) => el.dataset.layer)
    expect(layers).toEqual(['art', 'regions', 'plate', 'highlight', 'marquee'])
    expect(canvas.svg.querySelector('defs pattern')).not.toBeNull()
    expect(canvas.getView()).toBe('plan')
  })

  it('Show original is a view the stylesheet reads off the svg', () => {
    canvas.setView('original')
    expect(canvas.svg.dataset.view).toBe('original')
    canvas.setView('plan')
    expect(canvas.svg.dataset.view).toBe('plan')
    canvas.setView('nonsense')
    expect(canvas.svg.dataset.view).toBe('plan')
  })

  it('a removed region is hatched through the pattern in defs', () => {
    canvas.setState({ fills: {}, selected: new Set(), removed: new Set(['a']) })
    const a = canvas.svg.querySelector('[data-region="a"]')
    const pattern = canvas.svg.querySelector('defs pattern')
    expect(a.getAttribute('fill')).toBe(`url(#${pattern.id})`)
    canvas.setState({ fills: {}, selected: new Set(), removed: new Set() })
    expect(a.hasAttribute('fill')).toBe(false)
  })

  it('a keyboard highlight is two strokes over the region that PULSE, then settle on animationend', () => {
    canvas.setHighlight('b', { pulse: true })
    const layer = canvas.highlightLayer
    expect(layer.getAttribute('visibility')).toBe('visible')
    expect(layer.dataset.region).toBe('b')
    expect(layer.classList.contains('is-pulsing')).toBe(true)
    expect(layer.classList.contains('is-steady')).toBe(false)
    const [halo, stroke] = layer.querySelectorAll('path')
    expect(halo.getAttribute('d')).toBe(REGIONS[1].d)
    expect(stroke.getAttribute('d')).toBe(REGIONS[1].d)
    layer.dispatchEvent(new Event('animationend', { bubbles: true }))
    expect(layer.classList.contains('is-pulsing')).toBe(false)
    expect(layer.classList.contains('is-steady')).toBe(true)
  })

  it('a click or hover highlight settles at once; clearing hides the strokes', () => {
    canvas.setHighlight('a')
    expect(canvas.highlightLayer.classList.contains('is-steady')).toBe(true)
    expect(canvas.highlightLayer.classList.contains('is-pulsing')).toBe(false)
    canvas.clearHighlight()
    expect(canvas.highlightLayer.getAttribute('visibility')).toBe('hidden')
    expect(canvas.getHighlight()).toBeNull()
  })

  it('under reduced motion the pulsing class is never applied', () => {
    setReducedMotion(true)
    canvas.setHighlight('b', { pulse: true })
    expect(canvas.highlightLayer.classList.contains('is-pulsing')).toBe(false)
    expect(canvas.highlightLayer.classList.contains('is-steady')).toBe(true)
  })

  it('hover draws the steady look on the region itself', () => {
    const a = canvas.svg.querySelector('[data-region="a"]')
    a.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
    expect(a.classList.contains('is-hover')).toBe(true)
    a.dispatchEvent(new MouseEvent('pointerout', { bubbles: true }))
    expect(a.classList.contains('is-hover')).toBe(false)
  })

  it('a plate is drawn over the dimmed plan, and cleared', () => {
    canvas.showPlate('M 0 0 H 5 V 5 H 0 Z')
    expect(canvas.svg.dataset.plate).toBe('true')
    expect(canvas.svg.querySelector('[data-layer="plate"] path').getAttribute('d')).toBe('M 0 0 H 5 V 5 H 0 Z')
    canvas.showPlate(null)
    expect(canvas.svg.dataset.plate).toBeUndefined()
    expect(canvas.svg.querySelector('[data-layer="plate"] path')).toBeNull()
  })
})

describe('the two strokes read on any region colour', () => {
  /** A token's value in a theme block of variables.css. */
  const token = (name, blockStart) => {
    const from = VARIABLES_CSS.indexOf(blockStart)
    expect(from, blockStart).toBeGreaterThanOrEqual(0)
    const m = VARIABLES_CSS.slice(from).match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,6})`))
    return m ? m[1] : null
  }

  it('★ MEASURED: the plan first asked for the page background under the focus colour, and that pair fails on a white region', () => {
    // #66b3ff is the dark theme's --color-focus and the accent's neighbour
    // in light; either way a light blue on the cat's white fur is under 3:1.
    expect(contrastRatio('#66b3ff', '#fafbf8')).toBeLessThan(3)
  })

  it('the text colour and the background colour together clear 3:1 against the darkest and the lightest swatch, in every theme', () => {
    const swatches = ['#171411', '#fafbf8', '#997048', '#8b9770', '#b0767d', '#978b84']
    const themes = [':root {', "[data-theme='dark']", "[data-high-contrast='true']"]
    for (const theme of themes) {
      const text = token('--color-text-primary', theme)
      const bg = token('--color-bg-primary', theme)
      expect(text, `${theme} text`).not.toBeNull()
      expect(bg, `${theme} bg`).not.toBeNull()
      for (const swatch of swatches) {
        const best = Math.max(contrastRatio(text, swatch), contrastRatio(bg, swatch))
        expect(best, `${theme}: ${text} / ${bg} against ${swatch}`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('the helper is the WCAG arithmetic', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
    expect(relativeLuminance('#000000')).toBe(0)
    expect(contrastRatio('nonsense', '#fff')).toBeNull()
  })
})

describe('the surface: Show original and the plate stepper', () => {
  let surface
  let announce
  let editor

  const table = () => surface.querySelector('.drawing-editor-regions-table')
  const addColour = (name, hex) => {
    const form = surface.querySelector('.drawing-editor-add-colour')
    form.querySelector('input[type="text"]').value = name
    form.querySelector('input[type="color"]').value = hex
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  }
  async function openCat() {
    editor.open(CAT_SVG, analyzeSvg(CAT_SVG), {
      purpose: 'stencil',
      onApply: vi.fn(),
      onKeepOriginal: vi.fn(),
    })
    await vi.waitFor(() => expect(table()).not.toBeNull(), { timeout: 15000 })
  }

  beforeEach(() => {
    setReducedMotion(false)
    surface = document.createElement('div')
    surface.id = 'drawingEditorSurface'
    document.body.appendChild(surface)
    announce = vi.fn()
    editor = createDrawingEditor({ surfaceEl: surface, announce })
    vi.clearAllMocks()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('Show original is a pressed toggle that flips the view and says so both ways', async () => {
    await openCat()
    const btn = surface.querySelector('.drawing-editor-show-original')
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    btn.click()
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    expect(editor.getView()).toBe('original')
    expect(announce).toHaveBeenLastCalledWith(S.showingOriginal)
    btn.click()
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    expect(editor.getView()).toBe('plan')
    expect(announce).toHaveBeenLastCalledWith(S.showingPlan)
  })

  it('focusing a row pulses the highlight on that region; the legend names the looks', async () => {
    await openCat()
    const row = surface.querySelectorAll('.drawing-editor-regions-table tbody tr')[3]
    row.querySelector('input[type="checkbox"]').focus()
    const layer = editor._canvas.highlightLayer
    expect(layer.dataset.region).toBe(row.dataset.region)
    expect(layer.classList.contains('is-pulsing')).toBe(true)
    layer.dispatchEvent(new Event('animationend', { bubbles: true }))
    expect(layer.classList.contains('is-steady')).toBe(true)
    const legend = surface.querySelector('.drawing-editor-legend')
    expect(legend.hidden).toBe(false)
    expect([...legend.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      S.legendPainted,
      S.legendBase,
      S.legendRemoved,
      S.legendUnpainted,
      S.legendPlate,
    ])
  })

  it('the stepper walks the plates with its buttons and Left/Right, says the paint sentence, and draws that plate', async () => {
    await openCat()
    addColour('Brown', '#997048')
    addColour('White', '#fafbf8')
    const text = surface.querySelector('.drawing-editor-stepper-text')
    const prev = surface.querySelector('[data-action="prev-plate"]')
    const next = surface.querySelector('[data-action="next-plate"]')
    expect(text.textContent).toBe(S.allPlates)
    expect(prev.disabled).toBe(true)
    expect(next.disabled).toBe(false)
    expect(editor._canvas.svg.querySelector('[data-layer="plate"] path')).toBeNull()

    next.click()
    expect(text.textContent).toBe(S.plateOfN(1, 3, 'Base coat'))
    expect(editor.getPlateIndex()).toBe(0)
    expect(editor._canvas.svg.dataset.plate).toBe('true')
    expect(announce).toHaveBeenLastCalledWith(
      `${S.plateOfN(1, 3, 'Base coat')}. ${paintSequence(['Base coat', 'Brown', 'White'])[0]}`
    )
    next.click()
    expect(text.textContent).toBe(S.plateOfN(2, 3, 'Brown'))
    // Plate 2 under the stacked rule cuts Brown and White together: no
    // region has either yet, so the cut is empty and the path says so.
    expect(editor._canvas.svg.querySelector('[data-layer="plate"] path')).toBeNull()

    text.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(text.textContent).toBe(S.plateOfN(3, 3, 'White'))
    expect(next.disabled).toBe(true)
    text.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(text.textContent).toBe(S.allPlates)
    expect(announce).toHaveBeenLastCalledWith(S.showingAllPlates)
    expect(editor._canvas.svg.dataset.plate).toBeUndefined()

    // A colour given to a region shows up on its plate.
    const rows = surface.querySelectorAll('.drawing-editor-regions-table tbody tr')
    const select = rows[rows.length - 1].querySelector('select')
    select.value = editor.getPlan().palette[1].id
    select.dispatchEvent(new Event('change', { bubbles: true }))
    editor.stepPlate(1)
    const cut = editor._canvas.svg.querySelector('[data-layer="plate"] path')
    expect(cut).not.toBeNull()
    expect(cut.getAttribute('d')).toMatch(/^M /)
  })

  it('a reopen resets the view: plan shown, all plates', async () => {
    await openCat()
    surface.querySelector('.drawing-editor-show-original').click()
    surface.querySelector('[data-action="next-plate"]').click()
    editor.dismiss()
    await openCat()
    expect(editor.getView()).toBe('plan')
    expect(editor.getPlateIndex()).toBe(-1)
    expect(surface.querySelector('.drawing-editor-show-original').getAttribute('aria-pressed')).toBe('false')
  })
})
