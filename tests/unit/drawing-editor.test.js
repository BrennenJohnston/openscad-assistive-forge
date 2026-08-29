/**
 * The drawing editor surface (DP-19).
 *
 * What is pinned here is the SURFACE: where it lives, how it opens and gives
 * the area back, that the workspace mounted inside it still gets every option
 * it used to, that the one gesture takes one path, and that the stencil
 * purpose reads the owner's own drawing into regions a person can colour.
 * What happens inside the mounted workspace is pinned by its own 3,200 lines.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const mockTrapActivate = vi.fn()
const mockTrapDeactivate = vi.fn()

vi.mock('../../src/js/focus-trap.js', () => ({
  createDocumentFocusTrap: vi.fn(() => ({
    activate: mockTrapActivate,
    deactivate: mockTrapDeactivate,
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

import { createDrawingEditor } from '../../src/js/drawing-editor/surface.js'
import { EDITOR_STRINGS as S } from '../../src/js/drawing-editor/strings.js'
import { createDocumentFocusTrap } from '../../src/js/focus-trap.js'
import { announce as workspaceAnnounce } from '../../src/js/announcer.js'
import { analyzeSvg } from '../../src/js/svg-preparer.js'

const CAT_SVG = readFileSync(
  join('tests', 'fixtures', 'harley', 'sketch4.svg'),
  'utf8'
)
const BIRD_SVG = readFileSync(
  join('tests', 'fixtures', 'svg-edit', 'bird-drawing.svg'),
  'utf8'
)

/** Three circles in a row: enough rows to delete one and keep the rest. */
const THREE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">' +
  '<circle cx="50" cy="50" r="10" fill="black"/>' +
  '<circle cx="90" cy="50" r="10" fill="black"/>' +
  '<circle cx="130" cy="50" r="10" fill="black"/>' +
  '</svg>'

let surface
let announce

function make(options = {}) {
  return createDrawingEditor({ surfaceEl: surface, announce, ...options })
}

function openOn(editor, svg, extra = {}) {
  const analysis = analyzeSvg(svg)
  const callbacks = { onApply: vi.fn(), onKeepOriginal: vi.fn() }
  editor.open(svg, analysis, { ...callbacks, ...extra })
  return { analysis, ...callbacks }
}

const table = () => surface.querySelector('.drawing-editor-regions-table')
const waitForTable = () =>
  vi.waitFor(() => expect(table()).not.toBeNull(), { timeout: 15000 })

beforeEach(() => {
  surface = document.createElement('div')
  surface.id = 'drawingEditorSurface'
  surface.hidden = true
  surface.classList.add('hidden')
  document.body.appendChild(surface)
  announce = vi.fn()
  vi.clearAllMocks()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('the surface', () => {
  it('is built inside the given element and starts hidden', () => {
    const editor = make()
    expect(surface.querySelector('.drawing-editor')).not.toBeNull()
    expect(surface.hidden).toBe(true)
    expect(editor.isOpen()).toBe(false)
  })

  it('has a title focus can land on, and it is not a Tab stop', () => {
    make()
    const title = surface.querySelector('h2.drawing-editor-title')
    expect(title.textContent).toBe(S.title)
    expect(title.getAttribute('tabindex')).toBe('-1')
  })

  it('has four native sections in order, and only Regions is open', () => {
    make()
    const sections = [...surface.querySelectorAll('details.drawing-editor-section')]
    expect(sections.map((d) => d.dataset.section)).toEqual([
      'colours',
      'regions',
      'plates',
      'warnings',
    ])
    expect(sections.map((d) => d.open)).toEqual([false, true, false, false])
    for (const d of sections) {
      expect(d.querySelector('summary .drawing-editor-section-name')).not.toBeNull()
    }
  })

  it('has a way in and a way out for a keyboard: two skip links that resolve', () => {
    make()
    const links = [...surface.querySelectorAll('a.drawing-editor-skip')]
    expect(links).toHaveLength(2)
    for (const link of links) {
      const id = link.getAttribute('href').slice(1)
      expect(document.getElementById(id), id).not.toBeNull()
    }
    expect(links[0].textContent).toBe(S.skipToRegions)
    expect(links[1].textContent).toBe(S.backToToolbar)
  })

  it('owns one polite status line', () => {
    make()
    const status = surface.querySelector('.drawing-editor-status')
    expect(status.getAttribute('role')).toBe('status')
    expect(status.getAttribute('aria-live')).toBe('polite')
  })

  it('does not call itself a toolbar until it moves like one', () => {
    make()
    expect(surface.querySelector('[role="toolbar"]')).toBeNull()
  })

  it('two editors on one page do not share the ids the surface mints', () => {
    // The mounted workspace carries three fixed ids of its own (its title,
    // its bulk-bar help and its render note), and two workspaces on one page
    // would already have shared those before this surface existed. What is
    // pinned here is that the SURFACE adds no fourth.
    const other = document.createElement('div')
    document.body.appendChild(other)
    make()
    createDrawingEditor({ surfaceEl: other })
    const mine = [...document.querySelectorAll('[id^="drawingEditor"]')].map(
      (el) => el.id
    )
    expect(mine.length).toBeGreaterThanOrEqual(8)
    expect(new Set(mine).size).toBe(mine.length)
  })
})

describe('the mounted workspace', () => {
  it('lives in the stage with its own title, expand and close hidden', () => {
    const editor = make()
    const ws = editor._workspace
    expect(surface.querySelector('.drawing-editor-stage .svg-prep-workspace')).toBe(
      ws._root
    )
    expect(ws._refs.title.hidden).toBe(true)
    expect(ws._refs.fullscreenBtn.hidden).toBe(true)
    expect(ws._refs.closeBtn.hidden).toBe(true)
  })

  it('keeps its action row, moved whole into the toolbar', () => {
    const editor = make()
    const footer = surface.querySelector('.drawing-editor-toolbar .svg-prep-footer')
    expect(footer).toBe(editor._workspace._refs.footer)
    expect(footer.querySelector('button[data-action="apply"]')).not.toBeNull()
    expect(footer.querySelector('button[data-action="keep"]')).not.toBeNull()
    expect(footer.querySelector('button[data-action="save"]')).not.toBeNull()
  })

  it('has its shape list and its warnings in the panel sections', () => {
    const editor = make()
    const refs = editor._workspace._refs
    const regions = surface.querySelector('details[data-section="regions"]')
    const warnings = surface.querySelector('details[data-section="warnings"]')
    expect(regions.contains(refs.objects)).toBe(true)
    expect(regions.contains(refs.bulkBar)).toBe(true)
    expect(warnings.contains(refs.warnings)).toBe(true)
  })

  it('keeps its live region on its own root, where the old spec looks for it', () => {
    make()
    expect(surface.querySelector('.svg-prep-workspace > .sr-only[aria-live]')).not.toBeNull()
  })
})

describe('opening and giving the area back', () => {
  it('shows the surface, tells the host, focuses the title and says so once', () => {
    const onOpen = vi.fn()
    const editor = make({ onOpen })
    openOn(editor, THREE)
    expect(surface.hidden).toBe(false)
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(surface.querySelector('.drawing-editor-title'))
    expect(announce).toHaveBeenCalledWith(S.opened)
    expect(surface.querySelector('.drawing-editor-status').textContent).toBe(S.opened)
    // The workspace's own "opened" is not said on top of it.
    expect(workspaceAnnounce).not.toHaveBeenCalledWith('SVG Preparation Editor opened')
  })

  it('says the host sentence when one is given', () => {
    const editor = make()
    openOn(editor, THREE, { openedSentence: 'Custom opening.' })
    expect(announce).toHaveBeenCalledWith('Custom opening.')
  })

  it('passes every reopen option through to the workspace', () => {
    const editor = make()
    openOn(editor, THREE, {
      initialDeleted: [1],
      initialOverrides: ['hole', undefined, 'ignore'],
      layersEnabled: true,
    })
    expect(editor.getDeletedIndices()).toEqual([1])
    const roles = editor.getRoleOverrides()
    expect(roles[0]).toBe('hole')
    expect(roles[2]).toBe('ignore')
    expect(editor.getLayerAssignments().limit).toBeGreaterThan(0)
  })

  it('Apply hands the host the result while the workspace still knows its state', () => {
    const onClose = vi.fn()
    const editor = make({ onClose })
    let deletedSeenInside = null
    const onApply = vi.fn(() => {
      deletedSeenInside = editor.getDeletedIndices()
    })
    openOn(editor, THREE, { initialDeleted: [2], onApply })
    editor._workspace._refs.applyBtn.click()
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(typeof onApply.mock.calls[0][0]).toBe('string')
    expect(deletedSeenInside).toEqual([2])
    expect(surface.hidden).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(editor.isOpen()).toBe(false)
  })

  it('Keep original keeps it, once', () => {
    const editor = make()
    const { onKeepOriginal, onApply } = openOn(editor, THREE)
    editor._workspace._refs.keepBtn.click()
    expect(onKeepOriginal).toHaveBeenCalledTimes(1)
    expect(onApply).not.toHaveBeenCalled()
    expect(surface.hidden).toBe(true)
  })

  it('the Close button means keep the original, once', () => {
    const editor = make()
    const { onKeepOriginal } = openOn(editor, THREE)
    surface.querySelector('.drawing-editor-close').click()
    expect(onKeepOriginal).toHaveBeenCalledTimes(1)
    expect(surface.hidden).toBe(true)
  })

  it('Escape from anywhere inside, including a re-homed piece, takes one path', () => {
    const onClose = vi.fn()
    const editor = make({ onClose })
    const { onKeepOriginal } = openOn(editor, THREE)
    // The shape list now lives in the panel, outside the workspace root.
    const row = surface.querySelector('.svg-prep-object')
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onKeepOriginal).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(surface.hidden).toBe(true)
  })

  it('Escape inside the workspace root itself also takes one path', () => {
    const editor = make()
    const { onKeepOriginal } = openOn(editor, THREE)
    editor._workspace._refs.sourcePane.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )
    expect(onKeepOriginal).toHaveBeenCalledTimes(1)
  })

  it('dismiss gives the area back without a verdict', () => {
    const onClose = vi.fn()
    const editor = make({ onClose })
    const { onKeepOriginal, onApply } = openOn(editor, THREE)
    editor.dismiss()
    expect(onKeepOriginal).not.toHaveBeenCalled()
    expect(onApply).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(surface.hidden).toBe(true)
  })

  it('reopening while open (a re-trace) neither re-announces the host nor resolves', () => {
    const onOpen = vi.fn()
    const editor = make({ onOpen })
    const first = openOn(editor, THREE)
    const second = openOn(editor, THREE)
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(first.onKeepOriginal).not.toHaveBeenCalled()
    expect(second.onKeepOriginal).not.toHaveBeenCalled()
    expect(editor.isOpen()).toBe(true)
  })

  it('destroy takes the surface out of the document', () => {
    const editor = make()
    openOn(editor, THREE)
    editor.destroy()
    expect(surface.querySelector('.drawing-editor')).toBeNull()
  })
})

describe('the fullscreen host (the no-model door)', () => {
  it('traps focus on open, with Escape as the way out, and lets go on close', () => {
    const editor = make({ fullscreen: true })
    const { onKeepOriginal } = openOn(editor, THREE)
    expect(createDocumentFocusTrap).toHaveBeenCalledWith(
      editor._root,
      expect.objectContaining({ onEscape: expect.any(Function) })
    )
    expect(mockTrapActivate).toHaveBeenCalledWith(
      expect.objectContaining({ initialFocus: expect.any(HTMLElement) })
    )
    const { onEscape } = createDocumentFocusTrap.mock.calls[0][1]
    onEscape()
    expect(onKeepOriginal).toHaveBeenCalledTimes(1)
    expect(mockTrapDeactivate).toHaveBeenCalledTimes(1)
    expect(surface.hidden).toBe(true)
  })

  it('does not trap over the preview, where the customizer must stay one Tab away', () => {
    const editor = make()
    openOn(editor, THREE)
    expect(createDocumentFocusTrap).not.toHaveBeenCalled()
  })
})

describe('the relief purpose', () => {
  it('shows the shape list and hides what only a stencil has', () => {
    const editor = make()
    openOn(editor, THREE, { purpose: 'relief' })
    expect(surface.querySelector('.drawing-editor').dataset.purpose).toBe('relief')
    expect(surface.querySelector('details[data-section="colours"]').hidden).toBe(true)
    expect(surface.querySelector('details[data-section="plates"]').hidden).toBe(true)
    expect(surface.querySelector('.drawing-editor-shapes').hidden).toBe(false)
    expect(surface.querySelector('.drawing-editor-regions').hidden).toBe(true)
    expect(surface.querySelectorAll('.svg-prep-object')).toHaveLength(3)
    expect(surface.querySelector('[data-count="regions"]').textContent).toBe('3')
    expect(editor.getPlan()).toBeNull()
  })
})

describe('the stencil purpose, on the owner drawing', () => {
  it('finds the faces, one row each, and says what it found with the opening', async () => {
    const editor = make()
    openOn(editor, CAT_SVG, { purpose: 'stencil' })
    expect(surface.querySelector('.drawing-editor-status').textContent).toBe(
      S.findingRegions
    )
    await waitForTable()
    expect(table().querySelectorAll('tbody tr')).toHaveLength(21)
    expect(table().querySelector('caption').textContent).toBe(S.regionsCaption)
    expect(surface.querySelector('[data-count="regions"]').textContent).toBe('21')
    expect(surface.querySelector('[data-count="colours"]').textContent).toBe('1')
    expect(surface.querySelector('[data-count="plates"]').textContent).toBe('1')
    expect(surface.querySelector('.drawing-editor-shapes').hidden).toBe(true)
    expect(announce).toHaveBeenCalledWith(`${S.opened} ${S.regionsFound(21, 1)}`)
    expect(editor.getPlan().palette).toHaveLength(1)
  })

  it('a line drawing is not offered "unpainted": the base coat covers it anyway', async () => {
    const editor = make()
    openOn(editor, CAT_SVG, { purpose: 'stencil' })
    await waitForTable()
    const options = [...table().querySelector('select').options].map((o) => o.value)
    expect(options).toEqual(['base'])
    expect(editor.getPlan().lineMode).toBe('edges')
  })

  it('adding a colour puts it on every select, in the palette and in the order', async () => {
    const editor = make()
    openOn(editor, CAT_SVG, { purpose: 'stencil' })
    await waitForTable()
    const form = surface.querySelector('.drawing-editor-add-colour')
    form.querySelector('input[type="text"]').value = 'Brown'
    form.querySelector('input[type="color"]').value = '#997048'
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    expect(surface.querySelectorAll('.drawing-editor-swatch-row')).toHaveLength(2)
    expect(surface.querySelector('[data-count="plates"]').textContent).toBe('2')
    const options = [...table().querySelector('select').options].map((o) => o.textContent)
    expect(options).toEqual(['Base coat', 'Brown'])
    expect(announce).toHaveBeenLastCalledWith(S.colourAdded('Brown'))
    const plan = editor.getPlan()
    expect(plan.palette.map((c) => c.hex)).toEqual(['#171411', '#997048'])
    expect(plan.order).toHaveLength(2)
  })

  it('a colour with no name gets the plain-language one', async () => {
    const editor = make()
    openOn(editor, CAT_SVG, { purpose: 'stencil' })
    await waitForTable()
    const form = surface.querySelector('.drawing-editor-add-colour')
    form.querySelector('input[type="color"]').value = '#997048'
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    expect(editor.getPlan().palette[1].name).toBe('Brown')
  })

  it('choosing a colour for a region moves it to that plate and says so', async () => {
    const editor = make()
    openOn(editor, CAT_SVG, { purpose: 'stencil' })
    await waitForTable()
    const form = surface.querySelector('.drawing-editor-add-colour')
    form.querySelector('input[type="text"]').value = 'Brown'
    form.querySelector('input[type="color"]').value = '#997048'
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    // The LAST row: the smallest face, which has nothing nested in it. The
    // largest face has, and cutting it alone leaves that as a loose piece -
    // which the engine reports, honestly, and which is not what this case is
    // about.
    const rows = table().querySelectorAll('tbody tr')
    const row = rows[rows.length - 1]
    const select = row.querySelector('select')
    const brownId = editor.getPlan().palette[1].id
    select.value = brownId
    select.dispatchEvent(new Event('change', { bubbles: true }))

    expect(row.querySelector('[data-plate]').textContent).toBe('2')
    const name = row.querySelector('th').textContent
    expect(announce).toHaveBeenLastCalledWith(S.regionSet(name, 'Brown', 2))
    const swatches = [...surface.querySelectorAll('.drawing-editor-swatch-row')]
    expect(swatches[1].textContent).toContain(S.usedBy(1))
    const plates = [...surface.querySelectorAll('.drawing-editor-plates li')]
    expect(plates[1].textContent).toBe(S.plateLine(2, 'Brown', 1, 0))
    expect(plates[0].textContent).toBe(S.plateGround(1, 'Base coat'))
    expect(editor.getPlan().assignment[row.dataset.region]).toBe(brownId)
  })

  it('filled art brings its own colours and can leave a region unpainted', async () => {
    const editor = make()
    openOn(editor, BIRD_SVG, { purpose: 'stencil' })
    await waitForTable()
    const plan = editor.getPlan()
    expect(plan.lineMode).toBe('shapes')
    const row = table().querySelector('tbody tr')
    const select = row.querySelector('select')
    const values = [...select.options].map((o) => o.value)
    expect(values).toContain('unpainted')
    select.value = 'unpainted'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    expect(row.querySelector('[data-plate]').textContent).toBe(S.notCut)
    expect(announce).toHaveBeenLastCalledWith(
      S.regionSetUnpainted(row.querySelector('th').textContent)
    )
  })

  it('a relief reopen after a stencil one leaves no stencil content behind', async () => {
    const editor = make()
    openOn(editor, CAT_SVG, { purpose: 'stencil' })
    await waitForTable()
    editor.dismiss()
    openOn(editor, THREE, { purpose: 'relief' })
    expect(table()).toBeNull()
    expect(editor.getPlan()).toBeNull()
  })
})
