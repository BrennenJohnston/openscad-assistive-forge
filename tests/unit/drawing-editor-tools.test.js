/**
 * The drawing editor's tools (DP-20): the command stack, the region canvas,
 * and the surface's selection, keys, undo, colour actions, paint order, the
 * plate rule and a saved plan coming back.
 *
 * What is pinned: that a click on the canvas and a tick in the table are ONE
 * selection; that every change is a command Undo can take back and name; that
 * the keys do what the help sentence says; and that a plan applied, saved and
 * reopened is the same plan.
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

import { createCommandStack, UNDO_LIMIT } from '../../src/js/drawing-editor/undo.js'
import {
  createRegionCanvas,
  clientToViewBox,
  regionsInside,
  nearestInDirection,
  TOOLS,
} from '../../src/js/drawing-editor/canvas.js'
import { createDrawingEditor } from '../../src/js/drawing-editor/surface.js'
import { EDITOR_STRINGS as S } from '../../src/js/drawing-editor/strings.js'
import { analyzeSvg } from '../../src/js/svg-preparer.js'
import { applySavedPlan, buildRegions } from '../../src/js/stencil-colours.js'

const CAT_SVG = readFileSync(join('tests', 'fixtures', 'harley', 'sketch4.svg'), 'utf8')

// ── The command stack ───────────────────────────────────────────────────────

describe('the command stack', () => {
  it('does, undoes, redoes, and names what it did', () => {
    const stack = createCommandStack()
    let value = 0
    const cmd = { label: 'add one', do: () => value++, undo: () => value-- }
    stack.run(cmd)
    expect(value).toBe(1)
    expect(stack.canUndo()).toBe(true)
    expect(stack.undo()).toBe(cmd)
    expect(value).toBe(0)
    expect(stack.canRedo()).toBe(true)
    expect(stack.redo()).toBe(cmd)
    expect(value).toBe(1)
    expect(stack.undo()).toBe(cmd)
    expect(stack.undo()).toBeNull()
  })

  it('a new command after an undo forgets the redo', () => {
    const stack = createCommandStack()
    const a = { label: 'a', do: vi.fn(), undo: vi.fn() }
    const b = { label: 'b', do: vi.fn(), undo: vi.fn() }
    stack.run(a)
    stack.undo()
    stack.run(b)
    expect(stack.canRedo()).toBe(false)
    expect(stack.redo()).toBeNull()
  })

  it(`is bounded at ${UNDO_LIMIT} steps and tells its listener`, () => {
    const onChange = vi.fn()
    const stack = createCommandStack({ limit: 3, onChange })
    for (let i = 0; i < 5; i++) stack.run({ label: String(i), do() {}, undo() {} })
    expect(stack.size()).toBe(3)
    expect(stack.undo().label).toBe('4')
    expect(stack.undo().label).toBe('3')
    expect(stack.undo().label).toBe('2')
    expect(stack.undo()).toBeNull()
    expect(onChange).toHaveBeenCalled()
    expect(UNDO_LIMIT).toBe(200)
  })
})

// ── The canvas arithmetic ───────────────────────────────────────────────────

describe('canvas arithmetic', () => {
  it('maps a pointer into the viewBox under xMidYMid meet, letterboxed both ways', () => {
    const vb = { x: 0, y: 0, w: 100, h: 50 }
    // A 400 x 400 box holds a 100 x 50 drawing at scale 4, 200 px tall,
    // centred: 100 px of bar above and below.
    const box = { left: 0, top: 0, width: 400, height: 400 }
    expect(clientToViewBox(box, vb, 0, 100)).toEqual({ x: 0, y: 0 })
    expect(clientToViewBox(box, vb, 400, 300)).toEqual({ x: 100, y: 50 })
    expect(clientToViewBox(box, vb, 200, 200)).toEqual({ x: 50, y: 25 })
    // And offset on screen.
    const shifted = { left: 10, top: 20, width: 400, height: 400 }
    expect(clientToViewBox(shifted, vb, 210, 220)).toEqual({ x: 50, y: 25 })
    // A zero box cannot be mapped; the origin is returned, never NaN.
    expect(clientToViewBox({ left: 0, top: 0, width: 0, height: 0 }, vb, 5, 5)).toEqual({ x: 0, y: 0 })
  })

  it('a marquee takes the regions whose boxes lie wholly inside it, any corner first', () => {
    const regions = [
      { key: 'a', bbox: { minX: 0, minY: 0, maxX: 10, maxY: 10 } },
      { key: 'b', bbox: { minX: 20, minY: 20, maxX: 30, maxY: 30 } },
      { key: 'c', bbox: { minX: 5, minY: 5, maxX: 25, maxY: 25 } },
    ]
    expect(regionsInside(regions, { x1: -1, y1: -1, x2: 11, y2: 11 })).toEqual(['a'])
    expect(regionsInside(regions, { x1: 31, y1: 31, x2: -1, y2: -1 })).toEqual(['a', 'b', 'c'])
    expect(regionsInside(regions, { x1: 4, y1: 4, x2: 26, y2: 26 })).toEqual(['c'])
  })

  it('an arrow goes to the nearest region inside a cone, never one beside', () => {
    const regions = [
      { key: 'o', interior: { x: 0, y: 0 } },
      { key: 'right-near', interior: { x: 10, y: 1 } },
      { key: 'right-far', interior: { x: 30, y: 0 } },
      { key: 'up', interior: { x: 0, y: -10 } },
      { key: 'diag', interior: { x: 10, y: 20 } },
    ]
    expect(nearestInDirection(regions, 'o', 'right')).toBe('right-near')
    expect(nearestInDirection(regions, 'o', 'up')).toBe('up')
    expect(nearestInDirection(regions, 'o', 'left')).toBeNull()
    // "diag" is more down than right, so Right does not land on it.
    expect(nearestInDirection(regions, 'o', 'down')).toBe('diag')
    // From nowhere, the first region.
    expect(nearestInDirection(regions, null, 'left')).toBe('o')
  })

  it('names five tools with five letters', () => {
    expect(TOOLS.map((t) => t.id)).toEqual(['select', 'marquee', 'paint', 'remove', 'hand'])
    expect(new Set(TOOLS.map((t) => t.key)).size).toBe(5)
  })
})

// ── The canvas element ──────────────────────────────────────────────────────

function pointer(el, type, clientX, clientY, extra = {}) {
  el.dispatchEvent(
    new MouseEvent(type, { clientX, clientY, bubbles: true, button: 0, ...extra })
  )
}

describe('the region canvas', () => {
  let container
  let on
  let canvas
  const REGIONS = [
    { key: 'a', d: 'M 0 0 H 10 V 10 H 0 Z', bbox: { minX: 0, minY: 0, maxX: 10, maxY: 10 }, interior: { x: 5, y: 5 } },
    { key: 'b', d: 'M 20 0 H 30 V 10 H 20 Z', bbox: { minX: 20, minY: 0, maxX: 30, maxY: 10 }, interior: { x: 25, y: 5 } },
  ]
  const label = document.createElement('span')

  beforeEach(() => {
    container = document.createElement('div')
    label.id = 'lbl'
    document.body.append(label, container)
    on = {
      onClick: vi.fn(),
      onEmptyClick: vi.fn(),
      onMarquee: vi.fn(),
      onPaint: vi.fn(),
      onRemove: vi.fn(),
      onHighlight: vi.fn(),
      onToggle: vi.fn(),
      onOpenColour: vi.fn(),
    }
    canvas = createRegionCanvas({ container, labelId: 'lbl', on })
    // 100 units wide drawing (0..40 with padding -> viewBox), mapped onto a
    // 400 x 100 box: jsdom has no layout, so the box is stated.
    Object.defineProperty(canvas.svg, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 400, height: 100 }),
    })
    canvas.setDrawing(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 10"><rect width="40" height="10"/></svg>',
      REGIONS,
      { minX: 0, minY: 0, maxX: 40, maxY: 10 }
    )
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('draws the art underneath and one path per region with its key', () => {
    expect(canvas.svg.querySelector('[data-layer="art"] rect')).not.toBeNull()
    const paths = canvas.svg.querySelectorAll('[data-layer="regions"] path')
    expect(paths).toHaveLength(2)
    expect(paths[0].dataset.region).toBe('a')
    expect(canvas.svg.getAttribute('tabindex')).toBe('0')
    expect(canvas.svg.getAttribute('aria-describedby')).toBe('lbl-help')
  })

  it('select: a click on a region reports it, a click on nothing clears', () => {
    const a = canvas.svg.querySelector('[data-region="a"]')
    pointer(a, 'pointerdown', 10, 50)
    pointer(a, 'pointerup', 10, 50)
    expect(on.onClick).toHaveBeenCalledWith('a', false)
    pointer(a, 'pointerdown', 10, 50, { shiftKey: true })
    pointer(a, 'pointerup', 10, 50, { shiftKey: true })
    expect(on.onClick).toHaveBeenLastCalledWith('a', true)
    pointer(canvas.svg, 'pointerdown', 150, 50)
    pointer(canvas.svg, 'pointerup', 150, 50)
    expect(on.onEmptyClick).toHaveBeenCalledWith(false)
  })

  it('marquee: a drag reports the regions wholly inside it, and Escape cancels one', () => {
    canvas.setTool('marquee')
    // The viewBox is 0..40 padded by 4% each side, on 400 px: about 9.3 px
    // per unit. A drag from x=-2 to x=12 units takes region a, not b.
    const px = (u) => ((u + 1.6) / 43.2) * 400
    // The box is 100 px tall for 10.8 units, so y runs -0.4 to 10.4 from
    // the top edge to the bottom: region a (0..10) is wholly inside only
    // when the drag spans the whole height.
    pointer(canvas.svg, 'pointerdown', px(-1), 0)
    pointer(canvas.svg, 'pointermove', px(6), 60)
    expect(canvas.isDragging()).toBe(true)
    expect(canvas.svg.querySelector('[data-layer="marquee"]').getAttribute('visibility')).toBe('visible')
    pointer(canvas.svg, 'pointerup', px(12), 100)
    expect(on.onMarquee).toHaveBeenCalledWith(['a'], false)
    expect(canvas.isDragging()).toBe(false)

    pointer(canvas.svg, 'pointerdown', px(-1), 0)
    pointer(canvas.svg, 'pointermove', px(6), 60)
    canvas.svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(canvas.isDragging()).toBe(false)
    expect(on.onMarquee).toHaveBeenCalledTimes(1)
  })

  it('paint and remove report the region under the pointer', () => {
    const b = canvas.svg.querySelector('[data-region="b"]')
    canvas.setTool('paint')
    pointer(b, 'pointerdown', 250, 50)
    pointer(b, 'pointerup', 250, 50)
    expect(on.onPaint).toHaveBeenCalledWith('b')
    canvas.setTool('remove')
    pointer(b, 'pointerdown', 250, 50)
    pointer(b, 'pointerup', 250, 50)
    expect(on.onRemove).toHaveBeenCalledWith('b')
    expect(on.onClick).not.toHaveBeenCalled()
  })

  it('hand: a drag pans the viewBox; Fit puts it back', () => {
    canvas.setTool('hand')
    const before = canvas.getViewBox()
    pointer(canvas.svg, 'pointerdown', 200, 50)
    pointer(canvas.svg, 'pointermove', 100, 50)
    pointer(canvas.svg, 'pointerup', 100, 50)
    const after = canvas.getViewBox()
    expect(after.x).toBeGreaterThan(before.x)
    expect(after.w).toBe(before.w)
    canvas.fit()
    expect(canvas.getViewBox()).toEqual(before)
    canvas.zoomIn()
    expect(canvas.getViewBox().w).toBeLessThan(before.w)
  })

  it('arrow keys move the highlight to the next region and say which', () => {
    canvas.svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(on.onHighlight).toHaveBeenCalledWith('a')
    canvas.svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(on.onHighlight).toHaveBeenLastCalledWith('b')
    expect(canvas.svg.querySelector('[data-region="b"]').classList.contains('is-highlighted')).toBe(true)
    canvas.svg.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    expect(on.onToggle).toHaveBeenCalledWith('b')
    canvas.svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    expect(on.onHighlight).toHaveBeenLastCalledWith('a')
  })

  it('paints the state onto the paths', () => {
    canvas.setState({ fills: { a: '#ff0000' }, selected: new Set(['b']), removed: new Set(['a']) })
    const a = canvas.svg.querySelector('[data-region="a"]')
    const b = canvas.svg.querySelector('[data-region="b"]')
    expect(a.style.getPropertyValue('--region-fill')).toBe('#ff0000')
    expect(a.classList.contains('is-removed')).toBe(true)
    expect(b.classList.contains('is-selected')).toBe(true)
  })
})

// ── The surface, on the owner drawing ───────────────────────────────────────

describe('the stencil purpose with tools (DP-20)', () => {
  let surface
  let announce
  let editor
  let onApply

  const table = () => surface.querySelector('.drawing-editor-regions-table')
  const rowsOf = () => [...surface.querySelectorAll('.drawing-editor-regions-table tbody tr')]
  const checkOf = (i) => rowsOf()[i].querySelector('input[type="checkbox"]')
  const key = (event, target, init = {}) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: event, bubbles: true, ...init }))
  const addColour = (name, hex) => {
    const form = surface.querySelector('.drawing-editor-add-colour')
    form.querySelector('input[type="text"]').value = name
    form.querySelector('input[type="color"]').value = hex
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  }

  async function openCat(extra = {}) {
    onApply = vi.fn()
    editor.open(CAT_SVG, analyzeSvg(CAT_SVG), {
      purpose: 'stencil',
      onApply,
      onKeepOriginal: vi.fn(),
      ...extra,
    })
    await vi.waitFor(() => expect(table()).not.toBeNull(), { timeout: 15000 })
  }

  beforeEach(() => {
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

  it('shows the tools, the canvas and its own Apply, and hides the panes and the flatten Apply', async () => {
    await openCat()
    expect(surface.querySelector('.drawing-editor-stencil-tools').hidden).toBe(false)
    expect(surface.querySelector('.drawing-editor-canvas').hidden).toBe(false)
    expect(surface.querySelectorAll('[data-layer="regions"] path')).toHaveLength(21)
    expect(editor._workspace._refs.previews.hidden).toBe(true)
    expect(editor._workspace._refs.applyBtn.hidden).toBe(true)
    expect(surface.querySelector('.drawing-editor-apply').hidden).toBe(false)
    const tools = [...surface.querySelectorAll('.drawing-editor-tool')]
    expect(tools.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false', 'false'])
    expect(tools[0].getAttribute('aria-keyshortcuts')).toBe('V')
  })

  it('ticking a row and clicking a region are one selection', async () => {
    await openCat()
    checkOf(2).checked = true
    checkOf(2).dispatchEvent(new Event('change', { bubbles: true }))
    const keyOf = (i) => rowsOf()[i].dataset.region
    expect(editor.getSelection()).toEqual([keyOf(2)])
    expect(surface.querySelector(`[data-layer="regions"] [data-region="${keyOf(2)}"]`).classList.contains('is-selected')).toBe(true)

    // A plain click on another region replaces the selection; Shift adds.
    editor._canvas.setTool('select')
    const path = surface.querySelector(`[data-layer="regions"] [data-region="${keyOf(0)}"]`)
    Object.defineProperty(editor._canvas.svg, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 400, height: 400 }),
    })
    pointer(path, 'pointerdown', 10, 10)
    pointer(path, 'pointerup', 10, 10)
    expect(editor.getSelection()).toEqual([keyOf(0)])
    expect(checkOf(0).checked).toBe(true)
    expect(checkOf(2).checked).toBe(false)
    expect(announce).toHaveBeenLastCalledWith(S.selected(1))
    const other = surface.querySelector(`[data-layer="regions"] [data-region="${keyOf(1)}"]`)
    pointer(other, 'pointerdown', 10, 10, { shiftKey: true })
    pointer(other, 'pointerup', 10, 10, { shiftKey: true })
    expect(editor.getSelection().sort()).toEqual([keyOf(0), keyOf(1)].sort())
    expect(announce).toHaveBeenLastCalledWith(S.selected(2))
  })

  it('a number key colours the selection and says how many; Undo says what came back', async () => {
    await openCat()
    addColour('Brown', '#997048')
    checkOf(3).checked = true
    checkOf(3).dispatchEvent(new Event('change', { bubbles: true }))
    checkOf(4).checked = true
    checkOf(4).dispatchEvent(new Event('change', { bubbles: true }))
    key('2', checkOf(4))
    expect(announce).toHaveBeenLastCalledWith(S.regionsSet(2, 'Brown', 2))
    expect(rowsOf()[3].querySelector('[data-plate]').textContent).toBe('2')
    expect(rowsOf()[4].querySelector('select').value).toBe(editor.getPlan().palette[1].id)

    key('z', checkOf(4), { ctrlKey: true })
    expect(announce).toHaveBeenLastCalledWith(S.undone(S.labelSetColours(2, 'Brown')))
    expect(rowsOf()[3].querySelector('[data-plate]').textContent).toBe('1')
    key('y', checkOf(4), { ctrlKey: true })
    expect(announce).toHaveBeenLastCalledWith(S.redone(S.labelSetColours(2, 'Brown')))
    expect(rowsOf()[3].querySelector('[data-plate]').textContent).toBe('2')
    // 0 is the base coat.
    key('0', checkOf(4))
    expect(announce).toHaveBeenLastCalledWith(S.regionsSet(2, 'Base coat', 1))
  })

  it('Delete removes the selection, the row says so, and Put back restores it', async () => {
    await openCat()
    const name = rowsOf()[5].querySelector('label').textContent
    checkOf(5).checked = true
    checkOf(5).dispatchEvent(new Event('change', { bubbles: true }))
    key('Delete', checkOf(5))
    expect(announce).toHaveBeenLastCalledWith(S.regionRemoved(name))
    const row = rowsOf()[5]
    expect(row.querySelector('[data-plate]').textContent).toBe(S.removedCell)
    expect(row.querySelector('select').disabled).toBe(true)
    expect(row.querySelector('.drawing-editor-region-remove').textContent).toBe(S.putBack)
    expect(editor.getPlan().assignment[row.dataset.region]).toBe('removed')
    expect(editor.getSelection()).toEqual([])
    row.querySelector('.drawing-editor-region-remove').click()
    expect(announce).toHaveBeenLastCalledWith(S.regionRestored(name))
    expect(row.querySelector('[data-plate]').textContent).toBe('1')
    // The undo beside the table takes the restore back.
    surface.querySelector('.drawing-editor-table-undo').click()
    expect(announce).toHaveBeenLastCalledWith(S.undone(S.labelRestore(name)))
    expect(row.querySelector('[data-plate]').textContent).toBe(S.removedCell)
  })

  it('the letter keys pick tools and Ctrl+A selects every region that is not removed', async () => {
    await openCat()
    key('m', checkOf(0))
    expect(editor.getTool()).toBe('marquee')
    expect(surface.querySelector('[data-tool="marquee"]').getAttribute('aria-pressed')).toBe('true')
    expect(announce).toHaveBeenLastCalledWith(S.toolChosen('Marquee'))
    key('h', editor._canvas.svg)
    expect(editor.getTool()).toBe('hand')
    key('a', checkOf(0), { ctrlKey: true })
    expect(editor.getSelection()).toHaveLength(21)
    expect(announce).toHaveBeenLastCalledWith(S.selected(21))
    // A letter typed into the name field is a letter, not a tool.
    const nameField = surface.querySelector('.drawing-editor-add-colour input[type="text"]')
    key('p', nameField)
    expect(editor.getTool()).toBe('hand')
  })

  it('Up and Down walk the table in the same column, and the highlight follows', async () => {
    await openCat()
    checkOf(0).focus()
    expect(surface.querySelector(`[data-layer="regions"] [data-region="${rowsOf()[0].dataset.region}"]`).classList.contains('is-highlighted')).toBe(true)
    expect(surface.querySelector('.drawing-editor-status').textContent).toBe(
      S.highlighting(rowsOf()[0].querySelector('label').textContent, 'Base coat', 1)
    )
    key('ArrowDown', checkOf(0))
    expect(document.activeElement).toBe(checkOf(1))
    key('End', checkOf(1))
    expect(document.activeElement).toBe(checkOf(20))
    key('Home', checkOf(20))
    expect(document.activeElement).toBe(checkOf(0))
    key('ArrowUp', checkOf(0))
    expect(document.activeElement).toBe(checkOf(0))
    // From the Remove column, Down lands on the next row's Remove.
    const removeBtn = rowsOf()[0].querySelector('.drawing-editor-region-remove')
    removeBtn.focus()
    key('ArrowDown', removeBtn)
    expect(document.activeElement).toBe(rowsOf()[1].querySelector('.drawing-editor-region-remove'))
  })

  it('adding a colour is undoable, and Rename, Merge and Remove colour each say what they did', async () => {
    await openCat()
    addColour('Brown', '#997048')
    expect(editor.getPlan().palette).toHaveLength(2)
    editor.undo()
    expect(announce).toHaveBeenLastCalledWith(S.undone(S.labelAddColour('Brown')))
    expect(editor.getPlan().palette).toHaveLength(1)
    editor.redo()
    expect(editor.getPlan().palette).toHaveLength(2)

    // Rename, inline.
    const brownRow = surface.querySelectorAll('.drawing-editor-swatch-row')[1]
    brownRow.querySelector('[data-action="rename-colour"]').click()
    const input = surface.querySelector('.drawing-editor-rename-input')
    expect(input).not.toBeNull()
    input.value = 'Rust'
    key('Enter', input)
    expect(announce).toHaveBeenLastCalledWith(S.colourRenamed('Brown', 'Rust'))
    expect(editor.getPlan().palette[1].name).toBe('Rust')

    // Give two regions Rust, add a third colour, merge Rust into it.
    checkOf(1).checked = true
    checkOf(1).dispatchEvent(new Event('change', { bubbles: true }))
    key('2', checkOf(1))
    addColour('Green', '#8b9770')
    const rustRow = surface.querySelectorAll('.drawing-editor-swatch-row')[1]
    const merge = rustRow.querySelector('[data-action="merge-colour"]')
    merge.value = editor.getPlan().palette[2].id
    merge.dispatchEvent(new Event('change', { bubbles: true }))
    expect(announce).toHaveBeenLastCalledWith(S.colourMerged('Rust', 'Green', 1))
    expect(editor.getPlan().palette.map((c) => c.name)).toEqual(['Base coat', 'Green'])
    expect(editor.getPlan().assignment[rowsOf()[1].dataset.region]).toBe(editor.getPlan().palette[1].id)

    // Remove Green: its region goes back to the base.
    const greenRow = surface.querySelectorAll('.drawing-editor-swatch-row')[1]
    greenRow.querySelector('[data-action="remove-colour"]').click()
    expect(announce).toHaveBeenLastCalledWith(S.colourRemoved('Green', 1, 'Base coat'))
    expect(editor.getPlan().palette).toHaveLength(1)
    // The base coat of a line drawing cannot go.
    surface.querySelector('.drawing-editor-swatch-row [data-action="remove-colour"]').click()
    expect(announce).toHaveBeenLastCalledWith(S.baseStays)
  })

  it('the paint order moves with its buttons, the ground plate stays first, and the rule switches', async () => {
    await openCat()
    addColour('Brown', '#997048')
    addColour('White', '#fafbf8')
    expect(editor.getPlan().order).toHaveLength(3)
    const items = () => [...surface.querySelectorAll('.drawing-editor-plates li')]
    // Plate 1 is the outline: nothing can go before it.
    expect(items()[0].querySelector('[data-action="paint-later"]').disabled).toBe(true)
    expect(items()[1].querySelector('[data-action="paint-earlier"]').disabled).toBe(true)
    items()[2].querySelector('[data-action="paint-earlier"]').click()
    expect(announce).toHaveBeenLastCalledWith(S.orderChanged('White', 2))
    expect(editor.getPlan().order[1]).toBe(editor.getPlan().palette[2].id)
    editor.undo()
    expect(editor.getPlan().order[1]).toBe(editor.getPlan().palette[1].id)

    const rule = surface.querySelector('.drawing-editor-rule input')
    expect(rule.checked).toBe(true)
    rule.checked = false
    rule.dispatchEvent(new Event('change', { bubbles: true }))
    expect(announce).toHaveBeenLastCalledWith(S.ruleOwn)
    expect(editor.getPlan().rule).toBe('own')
    editor.undo()
    expect(editor.getPlan().rule).toBe('stacked')
    expect(rule.checked).toBe(true)
  })

  it('Apply hands the host the drawing as it is, with the plan readable inside the callback', async () => {
    let planInside = null
    await openCat({
      onApply: (svg) => {
        planInside = editor.getPlan()
        expect(svg).toBe(CAT_SVG)
      },
    })
    addColour('Brown', '#997048')
    surface.querySelector('.drawing-editor-apply').click()
    expect(planInside.palette).toHaveLength(2)
    expect(surface.hidden).toBe(true)
  })

  it('a saved plan comes back over the regions found again, exactly', async () => {
    await openCat()
    addColour('Brown', '#997048')
    checkOf(2).checked = true
    checkOf(2).dispatchEvent(new Event('change', { bubbles: true }))
    key('2', checkOf(2))
    checkOf(2).checked = false
    checkOf(2).dispatchEvent(new Event('change', { bubbles: true }))
    checkOf(7).checked = true
    checkOf(7).dispatchEvent(new Event('change', { bubbles: true }))
    key('Delete', checkOf(7))
    const rule = surface.querySelector('.drawing-editor-rule input')
    rule.checked = false
    rule.dispatchEvent(new Event('change', { bubbles: true }))
    const saved = JSON.parse(JSON.stringify(editor.getPlan()))
    editor.dismiss()

    await openCat({ initialPlan: saved })
    const back = editor.getPlan()
    expect(back.palette).toEqual(saved.palette)
    expect(back.order).toEqual(saved.order)
    expect(back.assignment).toEqual(saved.assignment)
    expect(back.rule).toBe('own')
    expect(rowsOf()[2].querySelector('[data-plate]').textContent).toBe('2')
    expect(rowsOf()[7].querySelector('[data-plate]').textContent).toBe(S.removedCell)
    expect(surface.querySelector('.drawing-editor-rule input').checked).toBe(false)
    // And it is the same thing the plate builder reads.
    const laid = applySavedPlan(saved, buildRegions(analyzeSvg(CAT_SVG).elements).regions)
    expect(laid.assignment).toEqual(back.assignment)
  })
})
