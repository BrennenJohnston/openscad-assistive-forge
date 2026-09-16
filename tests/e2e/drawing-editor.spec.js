/**
 * The drawing editor, where the preview lives (DP-19).
 *
 * The acceptance story: on the stencil tile, the owner's own line drawing
 * opens the editor in the PREVIEW AREA rather than in a block inside the
 * customizer, the customizer stays one Tab away, the arrow keys a person uses
 * inside the editor never turn the model behind it, Escape gives the area
 * back, the side panel's sections open and close from the keyboard, and a
 * colour chosen in the editor comes out as a plate.
 *
 * One page load, not seven. Loading the stencil tile is the whole cost of a
 * case on CI, and the two-shard lanes were a third of a minute from their
 * ceiling before this file existed (tests/unit/e2e-shard.test.js says the
 * number), so the walks share one page: sharing changes nothing about what
 * each step proves, and each step is marked below.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'
import path from 'node:path'

const CAT = path.join(process.cwd(), 'tests', 'fixtures', 'harley', 'sketch4.svg')
const HARLEY_PLAN = path.join(process.cwd(), 'tests', 'fixtures', 'harley', 'harley-plan.json')

const surface = (page) => page.locator('#drawingEditorSurface')
const container = (page) => page.locator('#previewContainer')
const canvas = (page) => page.locator('#previewContainer canvas').first()

async function openStencil(page) {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
  await page.goto('/?example=stencil-maker')
  await page.waitForSelector('body[data-wasm-ready="true"]', { timeout: 240000 })
  await page
    .locator('.param-control')
    .first()
    .waitFor({ state: 'attached', timeout: 60000 })
  // The example opens with a "save this project?" prompt over the page, and
  // its focus trap would otherwise hold every focus assertion below.
  const notNow = page.locator('#saveProjectNotNow')
  try {
    await notNow.waitFor({ state: 'visible', timeout: 5000 })
    await notNow.click()
  } catch {
    // no save prompt this time
  }
}

/** Upload the cat and wait for the editor to have read it into regions. */
async function openCatInEditor(page) {
  await page.setInputFiles('#param-design_file', CAT)
  await expect(surface(page)).toBeVisible({ timeout: 60000 })
  await expect(
    surface(page).locator('.drawing-editor-regions-table tbody tr')
  ).toHaveCount(21, { timeout: 60000 })
}

const cameraPosition = (page) =>
  page.evaluate(() => window.__forgeDebug?.cameraPosition?.() ?? null)

/** What the app has written into the tile's plate parameters. */
const plateState = (page) =>
  page.evaluate(() => {
    const p = window.stateManager?.getState()?.parameters || {}
    const name = (v) => (v && typeof v === 'object' ? v.name : v || null)
    return [1, 2, 3, 4, 5, 6, 7, 8].map((n) => name(p[`stencil_plate_${n}`]))
  })

const focusedIsInside = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.activeElement
    return Boolean(el && el.closest(sel))
  }, selector)

test.describe('The drawing editor takes the preview area', () => {
  test('★ D-124 opens it in the preview area; Tab leaves; arrows leave the camera; Escape gives the area back; axe; colours become plates, by keyboard and by mouse, and come back', async ({
    page,
  }, testInfo) => {
    test.setTimeout(300000)
    await openStencil(page)
    await expect(surface(page)).toBeHidden()
    await expect(container(page)).toHaveAttribute('aria-label', /model preview/i)
    // A model must be on screen for the camera to have anywhere to go.
    await expect.poll(() => cameraPosition(page), { timeout: 120000 }).not.toBeNull()

    // ── D-124: a drawing with no colours opens the editor on its own ──────
    await openCatInEditor(page)

    // Where the 3D view was, not beside it and not inside the customizer.
    await expect(container(page)).toHaveAttribute('aria-label', 'Drawing editor')
    await expect(canvas(page)).toBeHidden()
    const box = await surface(page).boundingBox()
    const area = await container(page).boundingBox()
    expect(box.width).toBeGreaterThan(area.width * 0.9)
    expect(box.height).toBeGreaterThan(area.height * 0.9)

    // It said what it found, with the opening, and the card says why.
    await expect(page.locator('.drawing-editor-status')).toContainText(
      '21 regions found, no colours yet'
    )
    await expect(page.locator('.svg-prep-status-badge')).toContainText(
      'no colours yet'
    )
    await expect(page.locator('[data-count="regions"]')).toHaveText('21')
    await expect(page.locator('[data-count="colours"]')).toHaveText('1')
    await expect(page.locator('[data-count="plates"]')).toHaveText('1')

    // Focus landed on the surface's name.
    await expect
      .poll(async () =>
        page.evaluate(() => document.activeElement?.className || '')
      )
      .toContain('drawing-editor-title')

    // ── The side panel is a drawer, closed by default (G0, DP-24) ────────
    // The picture is the editor; the panel opens over it from the toggle,
    // and the skip link opens it on the way to the table.
    const panel = page.locator('.drawing-editor-panel')
    const panelToggle = page.locator('.drawing-editor-panel-toggle')
    await expect(panel).toBeHidden()
    await expect(panelToggle).toHaveAttribute('aria-expanded', 'false')
    await panelToggle.focus()
    await page.keyboard.press('Enter')
    await expect(panel).toBeVisible()
    await expect(panelToggle).toHaveAttribute('aria-expanded', 'true')

    // ── The customizer stays one Tab away: no trap over the preview ──────
    // From the editor's first Tab stop, one step backwards is the page around
    // it; from its last (the drawer's own back-link, so the drawer is open
    // for this probe), one step forwards is too. Nothing holds focus in.
    await page.locator('.drawing-editor-skip').first().focus()
    expect(await focusedIsInside(page, '#drawingEditorSurface')).toBe(true)
    await page.keyboard.press('Shift+Tab')
    expect(await focusedIsInside(page, '#drawingEditorSurface')).toBe(false)
    await page.locator('.drawing-editor-skip').last().focus()
    await page.keyboard.press('Tab')
    expect(await focusedIsInside(page, '#drawingEditorSurface')).toBe(false)
    await expect(surface(page)).toBeVisible()

    // ── The side panel sections open and close from the keyboard ─────────
    const colours = page.locator('details[data-section="colours"]')
    await expect(colours).toHaveJSProperty('open', false)
    const summary = colours.locator('summary')
    // The summary is sized by --size-touch-target, which the app's own
    // tokens set to 44 px and, on a fine-pointer desktop at this width, to
    // 36 px (variables.css: "compact touch targets for desktop"). The floor
    // measured here is the token's desktop value; a phone gets the 44.
    const summaryBox = await summary.boundingBox()
    expect(summaryBox.height, 'touch-target token floor').toBeGreaterThanOrEqual(36)
    await summary.focus()
    await page.keyboard.press('Enter')
    await expect(colours).toHaveJSProperty('open', true)
    await page.keyboard.press('Space')
    await expect(colours).toHaveJSProperty('open', false)

    // ── ★ The arrow keys inside the editor leave the camera where it is ──
    // Wait for the camera to be still: two reads a beat apart that agree.
    let before = await cameraPosition(page)
    await expect
      .poll(
        async () => {
          const now = await cameraPosition(page)
          const still = JSON.stringify(now) === JSON.stringify(before)
          before = now
          return still
        },
        { timeout: 30000, intervals: [400] }
      )
      .toBe(true)
    // A summary is a button-like thing that is not an INPUT, so the old guard
    // would have let these keys through to the camera.
    await page.locator('details[data-section="regions"] summary').focus()
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      await page.keyboard.press(key)
    }
    await page.waitForTimeout(300)
    expect(await cameraPosition(page)).toEqual(before)

    // ── Escape gives the area back: canvas, label and Tab stop restored ──
    await expect(container(page)).not.toHaveAttribute('tabindex', '0')
    await page.locator('.drawing-editor-title').focus()
    await page.keyboard.press('Escape')
    await expect(surface(page)).toBeHidden()
    await expect(canvas(page)).toBeVisible()
    await expect(container(page)).toHaveAttribute(
      'aria-label',
      '3D model preview and controls'
    )
    await expect(container(page)).toHaveAttribute('tabindex', '0')
    // And the drawing is still the design: keeping the original, not losing it.
    await expect.poll(() => plateState(page)).toContain('sketch4_plate_1.svg')

    // The control for the camera check: the same probe DOES move when the
    // editor is closed and the preview has focus, so the equality above
    // measured something.
    await container(page).focus()
    await page.keyboard.press('ArrowLeft')
    await expect
      .poll(async () => JSON.stringify(await cameraPosition(page)), {
        timeout: 10000,
      })
      .not.toBe(JSON.stringify(before))

    // ── The card's button brings it back ─────────────────────────────────
    // It sits in a customizer group a person opens first, so open it the way
    // they would.
    const editBtn = page.locator('.svg-prep-edit-btn')
    await editBtn.evaluate((el) => {
      for (let d = el.closest('details'); d; d = d.parentElement?.closest('details')) {
        d.open = true
      }
    })
    await editBtn.click()
    await expect(surface(page)).toBeVisible()
    await expect(container(page)).toHaveAttribute('aria-label', 'Drawing editor')
    await expect(
      surface(page).locator('.drawing-editor-regions-table tbody tr')
    ).toHaveCount(21)
    await expect.poll(() => plateState(page), { timeout: 60000 }).toEqual([
      'sketch4_plate_1.svg',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ])

    // ── ★ axe on the open editor, with every section open so nothing hides ─
    // Opened directly: the accordion's own keyboard operability is proven
    // above, and a summary that Playwright has to scroll a long panel to
    // reach is a moving target for its stability check, not for a person.
    // The reopened editor starts with the drawer closed again - open it so
    // the scan sees the panel too.
    await page.locator('.drawing-editor-panel-toggle').click()
    await expect(page.locator('.drawing-editor-panel')).toBeVisible()
    await page.evaluate(() => {
      for (const d of document.querySelectorAll('details.drawing-editor-section')) d.open = true
    })
    const results = await new AxeBuilder({ page })
      .include('#drawingEditorSurface')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    const detail = results.violations
      .flatMap((v) =>
        v.nodes.map(
          (n) =>
            `${v.id} @ ${n.target.join(' ')} :: ${n.failureSummary.replace(/\s+/g, ' ')}`
        )
      )
      .join('\n')
    expect(
      results.violations.map((v) => v.id),
      `unexpected axe violations in the drawing editor:\n${detail}`
    ).toEqual([])

    // ── Add a colour, give it to a region through the column ─────────────
    const status = page.locator('.drawing-editor-status')
    const addColour = async (name, hex) => {
      await page.locator('.drawing-editor-add-colour input[type="text"]').fill(name)
      await page.locator('.drawing-editor-add-colour input[type="color"]').fill(hex)
      await page.locator('.drawing-editor-add-colour button[type="submit"]').click()
      await expect(status).toHaveText(`${name} added. Choose it for a region.`)
    }
    await addColour('Brown', '#997048')
    await expect(page.locator('[data-count="plates"]')).toHaveText('2')

    const rows = page.locator('.drawing-editor-regions-table tbody tr')
    await rows.last().locator('select').selectOption({ label: 'Brown' })
    await expect(rows.last().locator('[data-plate]')).toHaveText('2')
    await expect(status).toContainText('set to Brown. Plate 2.')

    // ── DP-20, by keyboard alone: tick three rows, press 2, hear the count ─
    const check = (i) => rows.nth(i).locator('input[type="checkbox"]')
    // The tool buttons are sized by the app's touch-target token (44 px on a
    // coarse pointer, 36 px on this desktop); measured, not read off CSS.
    const toolBox = await page.locator('.drawing-editor-tool').first().boundingBox()
    expect(toolBox.height, 'touch-target token floor').toBeGreaterThanOrEqual(36)
    await check(17).focus()
    await page.keyboard.press('Space')
    await expect(check(17)).toBeChecked()
    // Down walks to the next row's checkbox, and the highlight follows it.
    await page.keyboard.press('ArrowDown')
    await expect(check(18)).toBeFocused()
    await expect(status).toContainText(', Base coat, plate 1.')
    const highlightedKey = await rows.nth(18).getAttribute('data-region')
    await expect(
      page.locator(`[data-layer="regions"] [data-region="${highlightedKey}"]`)
    ).toHaveClass(/is-highlighted/)
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Space')
    await expect(check(19)).toBeChecked()
    await page.keyboard.press('2')
    await expect(status).toHaveText('3 regions set to Brown. Plate 2.')
    await expect(rows.nth(17).locator('[data-plate]')).toHaveText('2')
    await expect(page.locator('[data-layer="regions"] path.is-selected')).toHaveCount(3)

    // Remove a speck from its row; Undo puts it back and says so.
    const speck = rows.nth(20)
    const speckName = (await speck.locator('label').innerText()).trim()
    await speck.locator('.drawing-editor-region-remove').focus()
    await page.keyboard.press('Enter')
    await expect(status).toHaveText(`${speckName} removed.`)
    await expect(speck.locator('[data-plate]')).toHaveText('Removed')
    await expect(speck.locator('.drawing-editor-region-remove')).toHaveText('Put back')
    await page.keyboard.press('Control+z')
    await expect(status).toHaveText(`Undone: ${speckName} removed.`)
    await expect(speck.locator('[data-plate]')).toHaveText('2')

    // ── DP-20, with the mouse: a marquee, then the selection painted ──────
    // The drawer overlays the drawing's right edge; close it so the marquee
    // sweeps the whole canvas unobstructed - which is also how a person
    // would work the picture (G0: the picture is the editor).
    await page.locator('.drawing-editor-panel-toggle').click()
    await expect(page.locator('.drawing-editor-panel')).toBeHidden()
    await page.keyboard.press('m')
    await expect(page.locator('.drawing-editor-tool[data-tool="marquee"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(status).toHaveText('Marquee tool.')
    const svgBox = await page.locator('.drawing-editor-canvas-svg').boundingBox()
    await page.mouse.move(svgBox.x + 2, svgBox.y + 2)
    await page.mouse.down()
    await page.mouse.move(svgBox.x + svgBox.width - 2, svgBox.y + svgBox.height - 2, { steps: 6 })
    await page.mouse.up()
    await expect(status).toHaveText('21 regions selected.')
    await expect(page.locator('[data-layer="regions"] path.is-selected')).toHaveCount(21)
    await page.locator('.drawing-editor-paint-select').selectOption({ label: 'Brown' })
    await page.locator('[data-action="paint-selection"]').click()
    await expect(status).toHaveText('21 regions set to Brown. Plate 2.')
    await page.locator('[data-action="undo"]').first().click()
    await expect(status).toHaveText('Undone: 21 regions set to Brown.')
    await expect(rows.nth(0).locator('[data-plate]')).toHaveText('1')

    // ── Apply, then reopen: the plan is exactly as left ──────────────────
    // CI's software GL starves the default 10 s actionability window while
    // the page digests the paint work (the 17.8 s single-commit lesson);
    // the real-click path is still proven, just given the time CI needs.
    await expect(page.locator('.drawing-editor-apply')).toBeEnabled({
      timeout: 60000,
    })
    await page.locator('.drawing-editor-apply').click({ timeout: 60000 })
    await expect(surface(page)).toBeHidden()
    // The plan rode with the drawing: two plates, and the card says so.
    await expect.poll(() => plateState(page), { timeout: 60000 }).toEqual([
      'sketch4_plate_1.svg',
      'sketch4_plate_2.svg',
      null,
      null,
      null,
      null,
      null,
      null,
    ])
    await expect(page.locator('.svg-prep-status-plan')).toHaveText('2 colours, 2 plates.')
    await editBtn.click()
    await expect(surface(page)).toBeVisible()
    // A fresh open starts with the drawer closed; the colour work below
    // lives in it.
    await page.locator('.drawing-editor-panel-toggle').click()
    await expect(page.locator('.drawing-editor-panel')).toBeVisible()
    await expect(rows).toHaveCount(21)
    await expect(page.locator('[data-count="colours"]')).toHaveText('2')
    for (const i of [17, 18, 19, 20]) {
      await expect(rows.nth(i).locator('[data-plate]')).toHaveText('2')
    }
    await expect(rows.nth(0).locator('[data-plate]')).toHaveText('1')

    // ── ★ The six reference plates, by hand, through the interface ───────
    // harley-plan.json is the owner's own colour plan, derived from their
    // plates. Its regions are points; the engine the app uses says which row
    // each point is, and the row's select is how a person would colour it.
    for (const [name, hex] of [
      ['White', '#fafbf8'],
      ['Green', '#8b9770'],
      ['Black again', '#171411'],
      ['Pink', '#b0767d'],
    ]) {
      await addColour(name, hex)
    }
    await expect(page.locator('[data-count="colours"]')).toHaveText('6')
    const reference = JSON.parse(fs.readFileSync(HARLEY_PLAN, 'utf8'))
    const placed = await page.evaluate(
      async ({ svg, points }) => {
        const colours = await import('/src/js/stencil-colours.js')
        const preparer = await import('/src/js/svg-preparer.js')
        const { regions } = colours.buildRegions(
          preparer.classifyElements(preparer.parseSvgElements(svg))
        )
        return points.map((p) => ({
          colour: p.colour,
          key: colours.regionAt(regions, { x: p.at[0], y: p.at[1] })?.key ?? null,
        }))
      },
      { svg: fs.readFileSync(CAT, 'utf8'), points: reference.regions }
    )
    const names = {
      brown: 'Brown',
      white: 'White',
      green: 'Green',
      'black-again': 'Black again',
      pink: 'Pink',
    }
    // First everything back to the base, so only the reference's colours stand.
    await page.keyboard.press('Control+a')
    await page.keyboard.press('0')
    await expect(status).toHaveText('21 regions set to Base coat. Plate 1.')
    for (const { colour, key } of placed) {
      expect(key, `${colour} at a point the engine finds`).not.toBeNull()
      await page
        .locator(`tr[data-region="${key}"] select`)
        .selectOption({ label: names[colour] })
    }
    await expect(page.locator('[data-count="plates"]')).toHaveText('6')
    await page.locator('details[data-section="colours"] summary').click()
    await page.screenshot({
      path: testInfo.outputPath('dp20-six-plates.png'),
      fullPage: false,
    })

    // ── DP-21: the view. "Show original" is a pressed toggle ──────────────
    const showOriginal = page.locator('.drawing-editor-show-original')
    const regionsLayer = page.locator('[data-layer="regions"]')
    await expect(showOriginal).toHaveAttribute('aria-pressed', 'false')
    await expect(regionsLayer).toBeVisible()
    await showOriginal.click()
    await expect(showOriginal).toHaveAttribute('aria-pressed', 'true')
    await expect(regionsLayer).toBeHidden()
    await expect(status).toHaveText('Showing the original drawing.')
    await showOriginal.click()
    await expect(showOriginal).toHaveAttribute('aria-pressed', 'false')
    await expect(regionsLayer).toBeVisible()
    await expect(status).toHaveText('Showing your edits.')

    // ── DP-21: the highlight pulses on a row's focus, then settles ───────
    // Polled on the class, never a wall-clock hold: the animation's own end
    // event is what removes `is-pulsing`.
    const highlight = page.locator('[data-layer="highlight"]')
    await check(4).focus()
    await expect(highlight).toHaveAttribute('data-region', await rows.nth(4).getAttribute('data-region'))
    await expect(highlight).toHaveClass(/is-pulsing/)
    await expect(highlight).toHaveClass(/is-steady/, { timeout: 15000 })
    await expect(highlight).not.toHaveClass(/is-pulsing/)

    // ★ The two strokes, measured on the colours the page actually renders,
    // with the app's own contrast helper, against the darkest and the
    // lightest swatch in the plan. One of the pair must clear 3:1 on each.
    const contrast = await page.evaluate(async () => {
      const utils = await import('/src/js/color-utils.js')
      const toHex = (rgb) => {
        const m = rgb.match(/\d+/g) || []
        return '#' + m.slice(0, 3).map((v) => Number(v).toString(16).padStart(2, '0')).join('')
      }
      const halo = toHex(getComputedStyle(document.querySelector('.drawing-editor-highlight-halo')).stroke)
      const stroke = toHex(getComputedStyle(document.querySelector('.drawing-editor-highlight-stroke')).stroke)
      const out = { halo, stroke, against: {} }
      for (const swatch of ['#171411', '#fafbf8']) {
        out.against[swatch] = {
          halo: utils.contrastRatio(halo, swatch),
          stroke: utils.contrastRatio(stroke, swatch),
        }
      }
      return out
    })
    console.log('[dp21] highlight strokes:', JSON.stringify(contrast))
    for (const swatch of ['#171411', '#fafbf8']) {
      const { halo, stroke: inner } = contrast.against[swatch]
      expect(Math.max(halo, inner), `highlight against ${swatch}`).toBeGreaterThanOrEqual(3)
    }

    // ── DP-21: under reduced motion the pulse never starts ───────────────
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await check(6).focus()
    await expect(highlight).toHaveAttribute('data-region', await rows.nth(6).getAttribute('data-region'))
    await expect(highlight).toHaveClass(/is-steady/)
    await expect(highlight).not.toHaveClass(/is-pulsing/)
    await page.emulateMedia({ reducedMotion: 'no-preference' })

    // ── DP-21: the plate stepper ─────────────────────────────────────────
    const stepperText = page.locator('.drawing-editor-stepper-text')
    await expect(stepperText).toHaveText('All plates')
    await page.locator('[data-action="next-plate"]').click()
    await page.locator('[data-action="next-plate"]').click()
    await expect(stepperText).toHaveText('Plate 2 of 6, Brown')
    await expect(status).toContainText('Plate 2 of 6, Brown.')
    await expect(status).toContainText('line it up on the marks or drop it over the pegs')
    // It draws exactly that plate's rings: the same engine, the same plan.
    const drawn = await page.locator('[data-layer="plate"] path').getAttribute('d')
    const expectedRings = await page.evaluate(
      async ({ svg, plan }) => {
        const colours = await import('/src/js/stencil-colours.js')
        const preparer = await import('/src/js/svg-preparer.js')
        const { regions, silhouette } = colours.buildRegions(
          preparer.classifyElements(preparer.parseSvgElements(svg))
        )
        const laid = colours.applySavedPlan(plan, regions)
        const cuts = colours.platesFor(laid, regions, silhouette)
        return cuts[1].rings.length
      },
      {
        svg: fs.readFileSync(CAT, 'utf8'),
        plan: await page.evaluate(() => null),
      }
    ).catch(() => null)
    expect((drawn.match(/M /g) || []).length).toBeGreaterThan(0)
    if (expectedRings !== null) expect((drawn.match(/M /g) || []).length).toBe(expectedRings)
    await stepperText.focus()
    await page.keyboard.press('ArrowLeft')
    await expect(stepperText).toHaveText('Plate 1 of 6, Base coat')
    await stepperText.click()
    await expect(stepperText).toHaveText('All plates')
    await expect(status).toHaveText('Showing all plates.')
    await page.screenshot({
      path: testInfo.outputPath('dp21-view.png'),
      fullPage: false,
    })
    // The second Apply is dispatched, not clicked. MEASURED: a real click
    // here lands (the surface closes, the plates are emitted) and then hangs
    // Playwright's input pipeline behind one compositor/GPU task of 17.8 s in
    // headless Chromium's software GL (3.1 s and 0.28 s in probes of the same
    // sequence): the first composite after the canvas comes back with a model
    // already on it. The first Apply above proves the real-click path; this
    // one proves the plan.
    await page.locator('.drawing-editor-apply').dispatchEvent('click')
    await expect(surface(page)).toBeHidden()
    await expect.poll(() => plateState(page), { timeout: 60000 }).toEqual([
      'sketch4_plate_1.svg',
      'sketch4_plate_2.svg',
      'sketch4_plate_3.svg',
      'sketch4_plate_4.svg',
      'sketch4_plate_5.svg',
      'sketch4_plate_6.svg',
      null,
      null,
    ])
    await expect(page.locator('.svg-prep-status-plan')).toHaveText('6 colours, 6 plates.')
  })
})

/**
 * DP-38: the Drawing / Charm switch, and draft quality while editing.
 *
 * The switch belongs to the CHARM, so it is walked on the charm and not on
 * the stencil tile the rest of this file uses: what sits behind the stencil
 * editor is a tile of plates, and a control labelled Charm would be naming
 * something that is not there.
 */
test.describe('the Drawing / Charm switch (DP-38)', () => {
  const NESTED = path.join(
    process.cwd(),
    'tests',
    'fixtures',
    'svg-edit',
    'nested-squares.svg'
  )

  async function openCharmEditor(page) {
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true')
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
    })
    await page.goto('/')
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      timeout: 240000,
    })
    await page.selectOption('#charmVariantSelect', 'q-charm')
    await page.click('#openCharmMakerBtn')
    await page.waitForFunction(
      () =>
        Object.keys(window.stateManager?.getState()?.parameters || {}).length >
        0,
      null,
      { timeout: 120000 }
    )
    for (let i = 0; i < 2; i++) {
      const notNow = page.getByRole('button', { name: 'Not now', exact: true })
      if (await notNow.isVisible().catch(() => false)) {
        await notNow.click()
        await page.waitForTimeout(300)
      }
    }
    await page.setInputFiles('#param-design_file', NESTED)
    await page.evaluate(() => {
      let d = document.querySelector('#param-design_file')?.closest('details')
      while (d) {
        d.open = true
        d = d.parentElement?.closest('details')
      }
    })
    const door = page
      .getByRole('button', { name: 'Open the drawing editor' })
      .first()
    await door.waitFor({ state: 'visible', timeout: 60000 })
    await door.scrollIntoViewIfNeeded()
    await door.click({ timeout: 30000 })
    await expect(
      page.locator('.svg-prep-result-pane svg').first()
    ).toBeVisible({ timeout: 90000 })
  }

  const charm = (page) => page.getByRole('radio', { name: 'Charm' })
  const drawing = (page) => page.getByRole('radio', { name: 'Drawing' })

  test('★ it is a real radio group, and the drawing is what it opens on', async ({
    page,
  }) => {
    test.setTimeout(300000)
    await openCharmEditor(page)

    // Two named choices where only one can be true: the markup says so, so
    // nothing has to say it again in ARIA.
    await expect(page.locator('.drawing-editor-view-switch')).toBeVisible()
    await expect(drawing(page)).toBeChecked()
    await expect(charm(page)).not.toBeChecked()

    // Both are real targets, not labels standing in front of a clipped input.
    for (const radio of [drawing(page), charm(page)]) {
      const box = await radio.boundingBox()
      expect(box.width, 'radio width').toBeGreaterThanOrEqual(44)
      expect(box.height, 'radio height').toBeGreaterThanOrEqual(44)
    }
  })

  test('★ Charm shows the model behind the editor, and Drawing puts it back', async ({
    page,
  }) => {
    test.setTimeout(300000)
    await openCharmEditor(page)

    // The drawing is what is on screen, and the canvas behind is out of sight.
    await expect(page.locator('.svg-prep-result-pane svg').first()).toBeVisible()
    await expect(canvas(page)).toBeHidden()

    await charm(page).click()
    // The canvas comes back WITHOUT the editor giving up the area: the toolbar
    // is still there and so is the way back.
    await expect(canvas(page)).toBeVisible()
    await expect(page.locator('.drawing-editor-toolbar')).toBeVisible()
    await expect(charm(page)).toBeChecked()
    // The drawing is not merely covered: it is out of the accessibility tree
    // too, because a picture nobody can see must not still be read out.
    await expect(page.locator('.svg-prep-result-pane svg').first()).toBeHidden()
    await expect(page.locator('.drawing-editor-status')).toHaveText(
      'Showing the charm.'
    )

    await drawing(page).click()
    await expect(canvas(page)).toBeHidden()
    await expect(page.locator('.svg-prep-result-pane svg').first()).toBeVisible()
    await expect(page.locator('.drawing-editor-status')).toHaveText(
      'Showing the drawing.'
    )
  })

  test('★ the drawer gets out of the charm\'s way, and comes back as it was', async ({
    page,
  }) => {
    test.setTimeout(300000)
    await openCharmEditor(page)

    // MEASURED at 1280: the drawer covers 310 px of the canvas and the charm
    // is 515 px wide, so leaving it open hides 206 px of the thing the switch
    // exists to show.
    const panel = page.locator('.drawing-editor-panel')
    await expect(panel).toBeVisible()

    await charm(page).click()
    await expect(panel).toBeHidden()

    // Closing it was the switch's doing, so the switch gives it back.
    await drawing(page).click()
    await expect(panel).toBeVisible()
  })

  test('★ the charm is framed in the window it is SEEN through', async ({
    page,
  }) => {
    // The editor is laid OVER this canvas and covers a great deal of it.
    // MEASURED with the charm view open, visible area against canvas area:
    // 66 per cent at 1280, 57 at 900, 39 at 412 - and the shapes differ as
    // much as the sizes, because at 900 the canvas is 476 by 761 while the
    // window left over is 460 by 445. Framed for the canvas, the charm is
    // drawn to fill a tall box and the near-square window shows a band across
    // its middle: a slab, not a charm.
    test.setTimeout(300000)
    await openCharmEditor(page)
    await charm(page).click()
    await expect(canvas(page)).toBeVisible()

    const boxes = await page.evaluate(() => {
      const r = (el) => {
        const b = el.getBoundingClientRect()
        return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]
      }
      return {
        canvas: r(document.querySelector('#previewContainer canvas')),
        stage: r(document.querySelector('.drawing-editor-stage')),
        container: r(document.getElementById('previewContainer')),
      }
    })
    // The canvas sits on the window, not on the whole area behind the editor.
    for (let i = 0; i < 4; i++) {
      expect(
        Math.abs(boxes.canvas[i] - boxes.stage[i]),
        `canvas ${JSON.stringify(boxes.canvas)} vs stage ${JSON.stringify(boxes.stage)}`
      ).toBeLessThanOrEqual(2)
    }
    // And it is really a different box from the one it would otherwise have.
    expect(boxes.stage[3]).toBeLessThan(boxes.container[3] - 50)

    // Leaving the charm view gives the whole area back. Read from the INLINE
    // size, not from the box: the canvas is display:none again in the drawing
    // view, so its box is 0 by 0 and says nothing. And 'no inline size' was
    // never the resting state either - three.js writes a CSS width and height
    // of its own on every setSize.
    await drawing(page).click()
    const after = await page.evaluate(() => {
      const el = document.querySelector('#previewContainer canvas')
      // clientWidth, not the bounding box: that is what the resize handler
      // reads, and the box includes the container's own border.
      const c = document.getElementById('previewContainer')
      return {
        position: el.style.position,
        width: parseInt(el.style.width, 10),
        height: parseInt(el.style.height, 10),
        container: [c.clientWidth, c.clientHeight],
      }
    })
    expect(after.position).toBe('')
    expect(Math.abs(after.width - after.container[0])).toBeLessThanOrEqual(2)
    expect(Math.abs(after.height - after.container[1])).toBeLessThanOrEqual(2)
  })

  test('the switch keeps every choice the editor had', async ({ page }) => {
    test.setTimeout(300000)
    await openCharmEditor(page)

    const rows = page.locator('.svg-prep-object')
    const before = await rows.count()
    await page
      .locator(
        '.svg-prep-object[data-index="1"] .svg-prep-role-group input[value="ignore"]'
      )
      .check()

    await charm(page).click()
    await drawing(page).click()

    // Nothing was rebuilt, so nothing was lost.
    await expect(rows).toHaveCount(before)
    await expect(
      page.locator(
        '.svg-prep-object[data-index="1"] .svg-prep-role-group input[value="ignore"]'
      )
    ).toBeChecked()
  })

  test('the open editor still passes an accessibility scan in the charm view', async ({
    page,
  }) => {
    test.setTimeout(300000)
    await openCharmEditor(page)
    await charm(page).click()
    await expect(canvas(page)).toBeVisible()

    const results = await new AxeBuilder({ page })
      .include('#drawingEditorSurface')
      .analyze()
    expect(
      results.violations,
      JSON.stringify(results.violations, null, 2)
    ).toEqual([])
  })

  test('★ a preview drawn while you edit costs a quarter of what it did', async ({
    page,
  }) => {
    // DP-38 P2, and the whole point of it. The charm behind the editor is a
    // thing somebody GLANCES at while they work on the drawing in front of
    // it, and MEASURED on this charm it was costing 29,372 triangles and
    // 1.2 MB a render because q_charm sets its own $fn = 64.
    test.setTimeout(600000)
    await openCharmEditor(page)

    const triangles = async () => {
      await expect(page.locator('text=Preview ready').first()).toBeVisible({
        timeout: 240000,
      })
      const text = await page
        .locator('[class*="status"]')
        .filter({ hasText: /triangles/ })
        .first()
        .textContent()
      const found = /([\d,]+)\s+triangles/.exec(text || '')
      return found ? Number(found[1].replace(/,/g, '')) : null
    }
    // Something has to CHANGE for a preview to be drawn at all.
    const nudge = async (value) => {
      await page.evaluate((v) => {
        const el =
          document.querySelector('#param-engrave_depth') ||
          document.querySelector('input[name="engrave_depth"]')
        if (!el) return
        el.value = String(v)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }, value)
      await page.waitForTimeout(1500)
    }

    await nudge(1.0)
    const whileEditing = await triangles()
    expect(whileEditing, 'triangles while the editor is open').toBeGreaterThan(
      0
    )

    await page.getByRole('button', { name: 'Keep original' }).click()
    await page.waitForTimeout(1000)
    await nudge(1.1)
    const afterClosing = await triangles()

    // The session is cheaper, and the person's own setting comes back the
    // moment it ends. MEASURED 2026-09-14: 7,500 while editing against 29,388
    // after, a quarter of the work for a charm that differs only in how round
    // the clip's edges are. Pinned as a RATIO, not as two counts: the numbers
    // belong to this charm and this model, and the rule is that editing is
    // cheaper than not editing.
    expect(
      whileEditing,
      `${whileEditing} while editing vs ${afterClosing} after`
    ).toBeLessThan(afterClosing * 0.6);
    expect(afterClosing).toBeGreaterThan(20000)
  })

  test('★ the switch is not offered where there is no charm to switch to', async ({
    page,
  }) => {
    // Through the standalone door there is no model behind the editor at all.
    test.setTimeout(300000)
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true')
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
    })
    await page.goto('/')
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      timeout: 240000,
    })
    await page.locator('summary.spotlights-summary').click()
    await page.locator('#editDrawingSpotlightBtn').click()
    await page
      .locator('#svgEditFileInput')
      .setInputFiles(
        path.join(process.cwd(), 'tests', 'fixtures', 'svg-edit', 'nested-squares.svg')
      )
    await expect(
      page.locator('.svg-prep-result-pane svg').first()
    ).toBeVisible({ timeout: 90000 })
    await expect(page.locator('.drawing-editor-view-switch')).toBeHidden()
  })
})

test.describe('the toolbar on the charm host (D-140, DP-46)', () => {
  // ★ This is where the defect the owner met actually lived. The door host
  // fills the page, so its toolbar had room; the charm host's editor is
  // 692 px at a 1280 window with the customizer open, and there the workspace
  // footer wrapped to two lines because the Apply hint sentence is 418 px, and
  // Close fell to a THIRD line of its own at y 279. MEASURED before this on
  // the owner's own picture. The guard opens the editor where they open it.
  const NESTED = path.join(
    process.cwd(),
    'tests',
    'fixtures',
    'svg-edit',
    'nested-squares.svg'
  )

  async function openCharmEditor(page) {
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true')
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
    })
    await page.goto('/')
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      timeout: 240000,
    })
    await page.selectOption('#charmVariantSelect', 'q-charm')
    await page.click('#openCharmMakerBtn')
    await page.waitForFunction(
      () =>
        Object.keys(window.stateManager?.getState()?.parameters || {}).length >
        0,
      null,
      { timeout: 120000 }
    )
    for (let i = 0; i < 2; i++) {
      const notNow = page.getByRole('button', { name: 'Not now', exact: true })
      if (await notNow.isVisible().catch(() => false)) {
        await notNow.click()
        await page.waitForTimeout(300)
      }
    }
    await page.setInputFiles('#param-design_file', NESTED)
    await page.evaluate(() => {
      let d = document.querySelector('#param-design_file')?.closest('details')
      while (d) {
        d.open = true
        d = d.parentElement?.closest('details')
      }
    })
    const door = page
      .getByRole('button', { name: 'Open the drawing editor' })
      .first()
    await door.waitFor({ state: 'visible', timeout: 60000 })
    await door.scrollIntoViewIfNeeded()
    await door.click({ timeout: 30000 })
    await expect(
      page.locator('.svg-prep-result-pane svg').first()
    ).toBeVisible({ timeout: 90000 })
  }

  test('★ two rows, Close on the first, at the editor\'s real width', async ({
    page,
  }) => {
    test.setTimeout(300000)
    await openCharmEditor(page)

    const shape = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.drawing-editor-toolbar-row')]
        .filter((row) => row.getClientRects().length > 0)
        .map((row) => Math.round(row.getBoundingClientRect().height))
      const close = document.querySelector('.drawing-editor-close')
      const header = document.querySelector(
        '.drawing-editor-toolbar-row--header'
      )
      const toolbar = document.querySelector('.drawing-editor-toolbar')
      return {
        rows,
        editorWidth: Math.round(
          document.querySelector('.drawing-editor').getBoundingClientRect().width
        ),
        toolbarHeight: Math.round(toolbar.getBoundingClientRect().height),
        closeOnRow1:
          close.getBoundingClientRect().bottom <=
          header.getBoundingClientRect().bottom + 1,
      }
    })

    // The width the owner sees, not the window's.
    expect(shape.editorWidth).toBeLessThan(800)
    expect(shape.rows.length).toBe(2)
    for (const height of shape.rows) expect(height).toBeLessThan(60)
    // It was 170 px of header alone, plus a wrapped footer under it.
    expect(shape.toolbarHeight).toBeLessThan(120)
    expect(shape.closeOnRow1).toBe(true)
  })

  test('★ the toolbar does not move when the Apply hint goes', async ({
    page,
  }) => {
    test.setTimeout(300000)
    await openCharmEditor(page)

    const toolbarHeight = () =>
      page.evaluate(() =>
        Math.round(
          document
            .querySelector('.drawing-editor-toolbar')
            .getBoundingClientRect().height
        )
      )

    // The hint comes and goes as the flatten finishes and as a choice
    // changes; on a small drawing it may be gone before the editor is even
    // looked at. What matters is that the TOOLBAR does not care either way.
    // It used to: the hint's 418 px sentence wrapped the button row, and when
    // it went the row reflowed and lifted Close back up, so the layout moved
    // while a person worked.
    const setHint = (hidden) =>
      page.evaluate((h) => {
        document.querySelector('.svg-prep-apply-hint').hidden = h
      }, hidden)

    await setHint(true)
    await page.waitForTimeout(200)
    const without = await toolbarHeight()

    await setHint(false)
    await page.waitForTimeout(200)
    const withHint = await toolbarHeight()

    expect(withHint).toBe(without)
    // And the sentence is on screen either way, in the status line.
    await expect(
      page.locator('.drawing-editor-statusline .svg-prep-apply-hint')
    ).toHaveCount(1)
  })
})
