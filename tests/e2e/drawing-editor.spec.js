/**
 * The drawing editor, where the preview lives (DP-19), walked on the charm
 * host: the Drawing / Charm switch, the toolbar, the keyboard walk, the two
 * previews, the too-thin check, crop, the shapes left out, the dot inside the
 * figure. The stencil tile's own walk left with the tile (DP-63).
 *
 * Loading a tile is the whole cost of a case on CI, and the two-shard lanes
 * were a third of a minute from their ceiling before this file existed
 * (tests/unit/e2e-shard.test.js says the number), so walks share a page where
 * they can: sharing changes nothing about what each step proves.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import path from 'node:path'

const surface = (page) => page.locator('#drawingEditorSurface')
const canvas = (page) => page.locator('#previewContainer canvas').first()

/**
 * DP-38: the Drawing / Charm switch, and draft quality while editing.
 *
 * The switch belongs to the CHARM, so it is walked on the charm host.
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

    const readBoxes = () =>
      page.evaluate(() => {
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
    // D-170: the canvas is re-framed to the stage a beat after it becomes
    // visible, and one sample taken in that beat read the previous layout's
    // box (CI, twice: canvas [531,334,692,330] against stage
    // [529,311,692,351]). So this waits for the two boxes to agree instead
    // of reading them once.
    await expect
      .poll(
        async () => {
          const b = await readBoxes()
          return Math.max(...[0, 1, 2, 3].map((i) => Math.abs(b.canvas[i] - b.stage[i])))
        },
        { timeout: 15000, message: 'the canvas never settled on the stage' }
      )
      .toBeLessThanOrEqual(2)
    const boxes = await readBoxes()
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

  test('★ the keyboard walk on the charm host: choose, Delete, Ctrl+A (DP-47, D-141)', async ({
    page,
  }) => {
    test.setTimeout(300000)
    await openCharmEditor(page)

    const rows = page.locator('.svg-prep-object')
    await expect.poll(() => rows.count(), { timeout: 60000 }).toBeGreaterThan(2)
    const chosen = page.locator('.svg-prep-object--selected')
    const roleOf = (i) =>
      page.evaluate(
        (n) =>
          document
            .querySelectorAll('.svg-prep-object')
            [n].querySelector('input[type="radio"]:checked')?.value,
        i
      )

    // Two rows, the way the owner tried to: click, then Ctrl-click.
    await rows.nth(0).locator('.svg-prep-object-name').click()
    await rows
      .nth(1)
      .locator('.svg-prep-object-name')
      .click({ modifiers: ['Control'] })
    await expect(chosen).toHaveCount(2)

    // ★ The picture marks BOTH of them. Before DP-47 the only thing it ever
    // drew was the hover mark of one shape.
    await expect
      .poll(() =>
        page.evaluate(
          () => document.querySelectorAll('.svg-prep-selected-path').length
        )
      )
      .toBeGreaterThanOrEqual(2)

    // ★ Delete sets the selection to Ignore. Before DP-47 it did nothing at
    // all: the surface returned before any key in the relief purpose.
    await rows.nth(1).focus()
    await page.keyboard.press('Delete')
    await expect.poll(() => roleOf(0)).toBe('ignore')
    await expect.poll(() => roleOf(1)).toBe('ignore')

    // ★ Ctrl+A selects every row, and NOT the page. Before DP-47 it selected
    // 35,759 characters of page text and the whole app turned blue.
    await page.keyboard.press('Control+a')
    await expect.poll(() => rows.count()).toBeGreaterThan(2)
    await expect(chosen).toHaveCount(await rows.count())
    const pageTextSelected = await page.evaluate(
      () => String(getSelection() || '').length
    )
    expect(
      pageTextSelected,
      `Ctrl+A selected ${pageTextSelected} characters of page text`
    ).toBeLessThan(50)
  })

  test('★ Ignore takes a shape out of the picture without a render (DP-47 P4)', async ({
    page,
  }) => {
    test.setTimeout(300000)
    await openCharmEditor(page)

    const painted = () =>
      page.evaluate(
        () =>
          document.querySelectorAll(
            '.svg-prep-result-pane .svg-prep-standin-path--raised, .svg-prep-result-pane .svg-prep-standin-path--hole'
          ).length
      )
    // Three nested squares combine well under the budget, so the pane holds a
    // real result rather than the stand-in - which is the honest case to say
    // so about: this walk checks the picture ANSWERS, whichever it is showing.
    const before = await page.evaluate(
      () =>
        document.querySelectorAll('.svg-prep-result-pane svg path').length
    )
    expect(before).toBeGreaterThan(0)

    const rows = page.locator('.svg-prep-object')
    await rows.nth(0).locator('.svg-prep-object-name').click()
    await rows.nth(0).focus()
    await page.keyboard.press('Delete')

    await expect
      .poll(async () => {
        const stand = await painted()
        if (stand > 0) return stand
        return page.evaluate(
          () =>
            document.querySelectorAll('.svg-prep-result-pane svg path').length
        )
      })
      .toBeLessThan(before + 1)
    // The row and its hit target stay: an ignored shape must be findable
    // again, both in the list and on the picture.
    await expect(rows).toHaveCount(3)
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.querySelectorAll(
              '.svg-prep-result-pane .svg-prep-hit-path'
            ).length
        )
      )
      .toBe(3)
  })

  // ── Session 4 of DP-R5: the way back into the editor ──────────────────────
  //
  // MEASURED on the built app with the owner's logo in Colors: after Apply
  // (and after Close) the file control's status card was EMPTY - no badge and
  // no "Open the drawing editor" - so once a person had applied they could
  // never get back in to change one more shape, and Convert again did not
  // reopen it either. The drawing analyzes as `ready` with `open_editor` (a
  // sound drawing sent to the editor only because its combine outruns the
  // budget), and the card had a branch for every status but that one. The
  // fixture is the app's own Colors output from that logo.
  test('★ after the editor closes, the file control still offers a way back in (a ready drawing sent to the editor for its size)', async ({
    page,
  }) => {
    test.setTimeout(300000)
    const LOGO_TRACE = path.join(
      process.cwd(),
      'tests',
      'fixtures',
      'svg-edit',
      'create-logo-colors-trace.svg'
    )
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
    await page.setInputFiles('#param-design_file', LOGO_TRACE)
    await page.evaluate(() => {
      let d = document.querySelector('#param-design_file')?.closest('details')
      while (d) {
        d.open = true
        d = d.parentElement?.closest('details')
      }
    })
    // The editor opens by itself on this drawing.
    await expect(surface(page)).toBeVisible({ timeout: 60000 })
    await expect
      .poll(() => page.locator('.svg-prep-object').count(), { timeout: 60000 })
      .toBeGreaterThan(10)

    // Leave without applying, the way the owner did on their first look.
    await surface(page).locator('.drawing-editor-close').click()
    await expect(surface(page)).toBeHidden({ timeout: 30000 })

    // ★ The card must still say what the drawing is and offer the editor.
    const control = page.locator('.param-control--file', {
      has: page.locator('#param-design_file'),
    })
    const badge = control.locator('.svg-prep-status-badge')
    await expect(badge).toBeVisible({ timeout: 30000 })
    await expect(badge).toHaveText(/shapes/)
    const door = control.getByRole('button', { name: 'Open the drawing editor' })
    await expect(door).toBeVisible({ timeout: 30000 })

    // And it goes back in.
    await door.scrollIntoViewIfNeeded()
    await door.click()
    await expect(surface(page)).toBeVisible({ timeout: 60000 })
    await expect
      .poll(() => page.locator('.svg-prep-object').count(), { timeout: 60000 })
      .toBeGreaterThan(10)

    // Apply, and the card says the drawing was prepared, with the door still there.
    const render = surface(page).locator('.svg-prep-render-btn')
    if (await render.isVisible().catch(() => false)) {
      await render.click()
    }
    const apply = surface(page).locator('.svg-prep-footer [data-action="apply"]')
    await expect(apply).toBeEnabled({ timeout: 120000 })
    await apply.click()
    await expect(surface(page)).toBeHidden({ timeout: 30000 })
    await expect(badge).toHaveText('Prepared in the drawing editor.', {
      timeout: 30000,
    })
    await expect(door).toBeVisible()

    // ★ Reopen to look, and leave with Close: the applied design STAYS. Close
    // used to be wired as Keep original, so a look at an applied drawing
    // ended with the charm reverting to the raw drawing - on the logo, a
    // raised slab in place of the lettering (D-149).
    const designSize = () =>
      page.evaluate(() => {
        const v = window.stateManager?.getState()?.parameters?.design_file
        return v && typeof v === 'object' ? v.size : null
      })
    const applied = await designSize()
    expect(applied).toBeGreaterThan(0)
    await door.scrollIntoViewIfNeeded()
    await door.click()
    await expect(surface(page)).toBeVisible({ timeout: 60000 })
    await expect
      .poll(() => page.locator('.svg-prep-object').count(), { timeout: 60000 })
      .toBeGreaterThan(10)
    await surface(page).locator('.drawing-editor-close').click()
    await expect(surface(page)).toBeHidden({ timeout: 30000 })
    await expect.poll(designSize).toBe(applied)
    await expect(badge).toHaveText('Prepared in the drawing editor.')
    await expect(door).toBeVisible()
  })
})

// ── DP-53: two previews - the drawing by itself, the charm on request ────────
//
// The drawing view combines by itself after every change (no Render button;
// a sentence says the combine is coming and how long; Apply waits for the
// result). The charm view has Render preview: a DRAFT of the charm with the
// drawing as it is now, drawn through the preview alone, so nothing is
// written until Apply - no undo entry, no project change - and Close leaves
// the committed design standing. The fixture is the app's own Colors output
// from the owner's logo, which analyzes as `ready` with `open_editor`.
test.describe('two previews: the drawing by itself, the charm on request (DP-53)', () => {
  const LOGO_TRACE = path.join(
    process.cwd(),
    'tests',
    'fixtures',
    'svg-edit',
    'create-logo-colors-trace.svg'
  )

  async function openLogoInTheEditor(page) {
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
    await page.setInputFiles('#param-design_file', LOGO_TRACE)
    await page.evaluate(() => {
      let d = document.querySelector('#param-design_file')?.closest('details')
      while (d) {
        d.open = true
        d = d.parentElement?.closest('details')
      }
    })
    await expect(surface(page)).toBeVisible({ timeout: 60000 })
    await expect
      .poll(() => page.locator('.svg-prep-object').count(), { timeout: 60000 })
      .toBeGreaterThan(10)
  }

  const committed = (page) =>
    page.evaluate(() => {
      const sm = window.stateManager
      const design = sm?.getState()?.parameters?.design_file
      return {
        size: design && typeof design === 'object' ? design.size : null,
        undo: sm?.history?.undoStack?.length ?? null,
        canUndo: sm?.canUndo?.() ?? null,
      }
    })

  test('★ the drawing combines by itself, the charm renders a draft on request, and Close leaves the design and its history alone', async ({
    page,
  }) => {
    test.setTimeout(480000)
    await openLogoInTheEditor(page)
    const editor = surface(page)
    const apply = editor.locator('.svg-prep-footer [data-action="apply"]')

    // 1. No button in the drawing view; the first combine lands by itself.
    await expect(editor.locator('.svg-prep-render-btn')).toBeHidden()
    await expect(apply).toBeEnabled({ timeout: 180000 })

    // 2. A change goes stale, says the combine is coming and how long, and
    //    combines again by itself.
    const hint = editor.locator('.svg-prep-apply-hint')
    // A row that is raised now, so the change is a change.
    const raised = page
      .locator('.svg-prep-object', {
        has: page.locator('.svg-prep-role-group input[value="foreground"]:checked'),
      })
      .first()
    await raised.locator('.svg-prep-role-group input[value="ignore"]').check()
    await expect(hint).toBeVisible()
    await expect(hint).toHaveText(
      /^Combining \d+ shapes, about (a second|\d+ seconds)\. Apply is ready when they are combined\.$/,
      { timeout: 10000 }
    )
    await expect(apply).toBeDisabled()
    await expect(apply).toBeEnabled({ timeout: 180000 })

    // 3. What is committed, before any draft.
    const before = await committed(page)
    expect(before.size).toBeGreaterThan(0)

    // 4. The charm view: Render preview is there, at the target floor, and
    //    works from the keyboard.
    await editor.locator('.drawing-editor-view-switch input[value="charm"]').check({ force: true })
    const render = editor.locator('.drawing-editor-render-charm')
    await expect(render).toBeVisible()
    await expect(render).toHaveAttribute(
      'aria-label',
      'Render the charm with the drawing as it is now'
    )
    const box = await render.boundingBox()
    expect(box.height, '44px target floor').toBeGreaterThanOrEqual(44)
    expect(box.width, '44px target floor').toBeGreaterThanOrEqual(44)
    await render.focus()
    await page.keyboard.press('Enter')

    // 5. The badge says what is on screen is a draft, the note says which
    //    drawing it shows, and nothing was written.
    const badge = page.locator('.preview-state-indicator')
    await expect(badge).toHaveText('Draft of the drawing, not yet applied', {
      timeout: 240000,
    })
    await expect(editor.locator('.drawing-editor-draft-note')).toHaveText(
      'The charm shows your drawing as of the last Render preview, at draft quality while you edit.'
    )
    expect(await committed(page)).toEqual(before)

    // 6. Close without applying: the committed charm comes back, and still
    //    nothing was written.
    await editor.locator('.drawing-editor-close').click()
    await expect(editor).toBeHidden({ timeout: 30000 })
    await expect(badge).toHaveText(/Preview ready|Preview \(cached\)/, {
      timeout: 240000,
    })
    expect(await committed(page)).toEqual(before)
  })
})

// ── DP-54: the too-thin check, on the charm host ─────────────────────────────
//
// Two things a person meets. The notice above the list counts the shapes
// thinner than 0.5 mm at the width the charm really prints the design (the
// model echoes its fit box, the host applies the design's aspect: D-144 was
// that no host ever passed a width, so every sentence used the editor's 14
// mm default), and "Ignore those" leaves them out in one press, each row
// reversible. And the whole-drawing advisory, which the charm host never
// showed (D-144), now speaks with the real width.
const LOGO_TRACE = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'svg-edit',
  'create-logo-colors-trace.svg'
)
const TWO_PAPERS = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'svg-edit',
  'two-papers.svg'
)

async function openCharmHost(page) {
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
  // The charm's first render carries the fit box; the host must have it.
  await expect(page.locator('.preview-state-indicator')).toHaveText(
    /Preview ready|Preview \(cached\)/,
    { timeout: 240000 }
  )
  await page.evaluate(() => {
    let d = document.querySelector('#param-design_file')?.closest('details')
    while (d) {
      d.open = true
      d = d.parentElement?.closest('details')
    }
  })
}


test.describe('the too-thin check on the charm host (DP-54, D-144)', () => {
  test('★ the notice names the too-thin shapes at the width the charm prints, Ignore those leaves them out, and one comes back', async ({
    page,
  }) => {
    test.setTimeout(480000)
    await openCharmHost(page)
    await page.setInputFiles('#param-design_file', LOGO_TRACE)
    const editor = surface(page)
    await expect(editor).toBeVisible({ timeout: 60000 })
    await expect
      .poll(() => page.locator('.svg-prep-object').count(), { timeout: 60000 })
      .toBeGreaterThan(10)

    // The width is the charm's, not the editor's default: 11.97 mm for this
    // logo on the default charm (P0), said as 12.
    const notice = editor.locator('.svg-prep-thin-notice')
    await expect(notice).toBeVisible({ timeout: 30000 })
    await expect(notice).toHaveText(
      /^\d+ shapes are thinner than 0\.5 mm at 12 mm wide and may not print\.$/
    )
    const count = Number((await notice.textContent()).match(/^(\d+)/)[1])
    // D-159 made a traced region one row (111 for this logo, 206 before), and
    // 109 of the 111 are under half a millimeter at 12 mm wide.
    expect(count).toBeGreaterThan(100)
    await expect(editor.locator('.svg-prep-design-width-input')).toHaveValue(
      /^11\.9/
    )

    // A too-thin row says so, read with its name.
    const marked = editor.locator('.svg-prep-object[aria-describedby]').first()
    await expect(marked).toBeVisible()
    const markId = await marked.getAttribute('aria-describedby')
    await expect(page.locator(`#${markId}`)).toContainText('too thin to print')

    // Ignore those: one press, N rows to Ignore, the stand-in loses them.
    const raisedBefore = await editor
      .locator('.svg-prep-result-pane .svg-prep-standin-path--raised')
      .count()
    await editor.locator('[data-action="ignore-thin"]').click()
    await expect
      .poll(
        () =>
          editor
            .locator('.svg-prep-object input[type=radio][value="ignore"]:checked')
            .count(),
        { timeout: 30000 }
      )
      .toBeGreaterThanOrEqual(count)
    await expect
      .poll(
        () =>
          editor
            .locator('.svg-prep-result-pane .svg-prep-standin-path--raised')
            .count(),
        { timeout: 30000 }
      )
      .toBeLessThan(raisedBefore)

    // One row turned back to Raised comes back.
    const first = editor.locator('.svg-prep-object[aria-describedby]').first()
    await first.locator('input[type=radio][value="foreground"]').check({ force: true })
    await expect(first.locator('input[type=radio][value="foreground"]')).toBeChecked()
    await expect(editor.locator('[data-action="undo-ignore"]')).toBeEnabled()
  })

  test('★ D-144: the whole-drawing advisory appears on the charm host, at the width the charm prints', async ({
    page,
  }) => {
    test.setTimeout(480000)
    await openCharmHost(page)
    // A traced picture, since the advisory reads the trace's line widths: a
    // 400 px square on white, which the quick look calls quick.
    await page.evaluate(async () => {
      const n = 400
      const canvas = document.createElement('canvas')
      canvas.width = n
      canvas.height = n
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, n, n)
      ctx.fillStyle = '#000000'
      ctx.fillRect(n * 0.25, n * 0.25, n * 0.5, n * 0.5)
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'))
      const input = document.querySelector('#param-design_file')
      const dt = new DataTransfer()
      dt.items.add(new File([blob], 'square.png', { type: 'image/png' }))
      input.files = dt.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const control = page.locator('.param-control--file', {
      has: page.locator('#param-design_file'),
    })
    // Converts by itself, or waits for Start on a slow machine (DP-Q32).
    const start = control.locator('.trace-progress-start')
    for (let i = 0; i < 60; i++) {
      const info = (await control.locator('.file-info').textContent()) || ''
      if (/converted from/.test(info)) break
      if (/Ready to convert\./.test(info) && (await start.isVisible().catch(() => false))) {
        await start.click()
      }
      await page.waitForTimeout(1000)
    }
    await expect(control.locator('.file-info')).toContainText('converted from', {
      timeout: 120000,
    })
    // A traced picture never opens the editor by itself; the card's door does.
    const door = control.getByRole('button', { name: 'Open the drawing editor' })
    await expect(door).toBeVisible({ timeout: 30000 })
    await door.scrollIntoViewIfNeeded()
    await door.click()
    const editor = surface(page)
    await expect(editor).toBeVisible({ timeout: 60000 })

    // RED before this: the charm host passed no line widths and no width, so
    // this sentence never existed here, and the width was the editor's own.
    // A square is height-limited in the charm's 11.97 by 9.3 mm box, so it
    // prints 9.3 mm wide, and the sentence says so.
    const advisory = editor.locator('.svg-prep-thin-lines')
    await expect(advisory).toBeVisible({ timeout: 30000 })
    await expect(advisory).toHaveText(/at 9\.3 mm wide|thick enough to print/)
    await expect(advisory).not.toContainText("the editor's default width")
    await expect(editor.locator('.svg-prep-design-width-input')).toHaveValue(
      /^9\.3/
    )
  })
})

// ── DP-49: crop, on the charm host ──────────────────────────────────────────
//
// The same crop view on the host the charm lives on. A vector drawing is
// clipped rather than traced again: every shape's rings against the kept
// rectangle, the shapes the clip empties gone, the box rewritten. The logo's
// wall carries its flag through the clip, so the wall rule still applies
// and the raised shapes are the lettering. RED on the build before this
// release: no Crop button in the toolbar.
test.describe('crop on the charm host (DP-49)', () => {
  test('★ the logo trace loses its lower half: fewer shapes, raised ones left, and Undo crop brings them back', async ({
    page,
  }) => {
    test.setTimeout(480000)
    await openCharmHost(page)
    await page.setInputFiles('#param-design_file', LOGO_TRACE)
    const editor = surface(page)
    await expect(editor).toBeVisible({ timeout: 60000 })
    const rows = page.locator('.svg-prep-object')
    await expect.poll(() => rows.count(), { timeout: 60000 }).toBeGreaterThan(10)
    const before = await rows.count()

    const cropBtn = editor.locator('.drawing-editor-crop-btn')
    await expect(cropBtn).toBeVisible()
    await cropBtn.click()
    const view = editor.locator('.drawing-editor-crop')
    await expect(view).toBeVisible()
    await expect(
      view.locator('input[type="range"][data-inset="top"]')
    ).toBeFocused()
    await view.locator('.slider-spinbox[data-inset="bottom"]').fill('50')
    await expect(view.locator('.drawing-editor-crop-keeping')).toHaveText(
      'Keeping 100 % of the width and 50 % of the height.'
    )
    await view.locator('[data-action="save-crop"]').click()

    await expect(editor.locator('.drawing-editor-status')).toHaveText(
      /^Cropped\. \d+ shapes?\.$/,
      { timeout: 120000 }
    )
    await expect.poll(() => rows.count(), { timeout: 60000 }).toBeLessThan(before)
    const raised = await page
      .locator('.svg-prep-object input[type=radio][value="foreground"]:checked')
      .count()
    expect(raised).toBeGreaterThan(0)
    // The charm's own width still rules the sentences: half the height makes
    // the drawing wider than the box, so it is still width-limited.
    await expect(editor.locator('.svg-prep-design-width-input')).toHaveValue(
      /^11\.9/
    )

    const undo = editor.locator('.drawing-editor-undo-crop')
    await expect(undo).toBeVisible()
    await undo.click()
    await expect(editor.locator('.drawing-editor-status')).toHaveText(
      /^Crop undone\. \d+ shapes?\.$/,
      { timeout: 60000 }
    )
    await expect.poll(() => rows.count(), { timeout: 60000 }).toBe(before)
    await expect(undo).toBeHidden()
  })
})

// ── DP-Q55: every slider row meets the 44 px floor ──────────────────────────
//
// The customizer's slider row was reported under the touch floor at the
// round 4 closeout (a 42 px box, a 6 px track), and the crop view reuses that
// row. The owner answered DP-Q55 app-wide: the number box and the range's hit
// box are 44 px tall everywhere, the 6 px track painted inside the box so the
// look stays. RED before: 42 and 6.
test.describe('every slider row meets the 44 px floor (DP-Q55)', () => {
  // The row's own range, and the box beside it: the page carries hidden
  // panel sliders first in document order, so the range is named, not found.
  const heights = (page, rangeSelector) =>
    page.evaluate((sel) => {
      const range = document.querySelector(sel)
      const spin = range?.closest('.slider-container')?.querySelector('.slider-spinbox')
      const h = (el) => (el ? Math.round(el.getBoundingClientRect().height) : null)
      return { range: h(range), spin: h(spin) }
    }, rangeSelector)

  test('★ in the customizer and in the crop view, the range and the box are 44 px tall', async ({
    page,
  }) => {
    test.setTimeout(480000)
    await openCharmHost(page)
    await page.locator('#param-design_scale').scrollIntoViewIfNeeded()
    const customizer = await heights(page, '#param-design_scale')
    expect(customizer.range, 'the customizer range').toBeGreaterThanOrEqual(44)
    expect(customizer.spin, 'the customizer box').toBeGreaterThanOrEqual(44)

    await page.setInputFiles('#param-design_file', LOGO_TRACE)
    const editor = surface(page)
    await expect(editor).toBeVisible({ timeout: 60000 })
    await expect
      .poll(() => page.locator('.svg-prep-object').count(), { timeout: 60000 })
      .toBeGreaterThan(10)
    await editor.locator('.drawing-editor-crop-btn').click()
    await expect(editor.locator('.drawing-editor-crop')).toBeVisible()
    const crop = await heights(
      page,
      '#drawingEditorSurface .drawing-editor-crop input[type="range"]'
    )
    expect(crop.range, 'the crop view range').toBeGreaterThanOrEqual(44)
    expect(crop.spin, 'the crop view box').toBeGreaterThanOrEqual(44)
  })
})

// ── DP-56: the shapes you left out, and a view you can steer ────────────────
//
// Two things the owner's walk found after #245 (2026-09-17). A shape set to
// Ignore left the picture entirely, so there was nothing to point at to bring
// it back (D-154): it stays now, painted in the left-out style, still under
// the pointer. And once the picture was zoomed there was no way to move the
// view on a desktop, and only two fingers on a phone (D-153): four buttons
// beside Fit, and the arrow keys with the picture focused, move it a quarter
// of a view at a time. RED on the build before this release.
test.describe('the shapes you left out, and a view you can steer (DP-56)', () => {
  test('★ D-154: a shape set to Ignore stays in the picture, can be chosen there, and comes back', async ({
    page,
  }) => {
    test.setTimeout(480000)
    await openCharmHost(page)
    await page.setInputFiles('#param-design_file', LOGO_TRACE)
    const editor = surface(page)
    await expect(editor).toBeVisible({ timeout: 60000 })
    const rows = page.locator('.svg-prep-object')
    await expect.poll(() => rows.count(), { timeout: 60000 }).toBeGreaterThan(10)

    // A raised shape, chosen by its row: the first row set to Raised.
    const raisedRow = page
      .locator('.svg-prep-object', {
        has: page.locator('input[type=radio][value="foreground"]:checked'),
      })
      .first()
    const index = await raisedRow.getAttribute('data-index')
    // Held by its index from here: the locator above would resolve to the
    // next raised row once this one is set to Ignore.
    const row = page.locator(`.svg-prep-object[data-index="${index}"]`)
    await row.locator('input[type=radio][value="ignore"]').check({ force: true })

    const pane = editor.locator('.svg-prep-result-pane')
    const leftOut = pane.locator(`.svg-prep-standin-path--ignore`)
    await expect(leftOut.first()).toBeAttached({ timeout: 30000 })
    // Its hit path is still there, and choosing it through the picture says so.
    const hit = pane.locator(`.svg-prep-hit-path[data-index="${index}"]`)
    await expect(hit).toBeAttached()
    await hit.dispatchEvent('click')
    await expect(
      editor.locator('.svg-prep-live, [aria-live="polite"].sr-only').first()
    ).toContainText(/1 of \d+ shapes selected\./, { timeout: 10000 })
    // Back to Raised from its row: it is ink again.
    await row.locator('input[type=radio][value="foreground"]').check({ force: true })
    await expect
      .poll(() => pane.locator(`.svg-prep-standin-path--ignore[data-index="${index}"]`).count(), {
        timeout: 30000,
      })
      .toBe(0)
  })

  test('★ D-153: once zoomed, the buttons move the view', async ({ page }) => {
    test.setTimeout(480000)
    await openCharmHost(page)
    await page.setInputFiles('#param-design_file', LOGO_TRACE)
    const editor = surface(page)
    await expect(editor).toBeVisible({ timeout: 60000 })
    await expect
      .poll(() => page.locator('.svg-prep-object').count(), { timeout: 60000 })
      .toBeGreaterThan(10)
    const pane = editor.locator('.svg-prep-result-pane')
    const zoom = pane.locator('.svg-prep-zoom-controls')
    const vb = () =>
      pane.locator('svg').first().evaluate((el) =>
        el.getAttribute('viewBox').split(/[\s,]+/).map(Number)
      )
    await zoom.locator('.svg-prep-zoom-in').click()
    await zoom.locator('.svg-prep-zoom-in').click()
    const [x0, y0, w] = await vb()
    const right = zoom.getByRole('button', { name: 'Move the result view right' })
    await expect(right).toBeVisible()
    await right.click()
    const [x1] = await vb()
    expect(x1 - x0).toBeCloseTo(w / 4, 3)
    await zoom.getByRole('button', { name: 'Move the result view up' }).click()
    const [, y2] = await vb()
    expect(y2).toBeLessThan(y0)
    // Every one of the seven is a 44 px target.
    const sizes = await zoom.locator('button').evaluateAll((els) =>
      els.map((b) => Math.round(b.getBoundingClientRect().height))
    )
    expect(sizes.length).toBe(7)
    for (const h of sizes) expect(h).toBeGreaterThanOrEqual(44)
  })
})

// ── DP-57: the dot inside the figure's arm (D-159) ──────────────────────────
//
// The owner's fourth walk (2026-09-17): "a small black circle path on the
// CREATE logo that is nested within the arm of the logo character that when
// turned to ignore, achieved no difference in 2d representation or in 3d
// rendering". MEASURED: the figure's own inner ring was split into a row of
// its own, a solid Raised disc painted over the navy dot's Hole, so the
// click on the dot found the disc and no role on it could change anything.
// A traced region is one row now, its outer ring; the dot is the wall's
// island, one Hole row; islands are painted last, so the click finds it; and
// Ignore on it fills the figure. RED on the build before this release.
test.describe('the dot inside the figure (DP-57, D-159)', () => {
  test('★ D-159: the click on the dot finds one Hole row, and Ignore on it fills the figure', async ({
    page,
  }) => {
    test.setTimeout(480000)
    await openCharmHost(page)
    await page.setInputFiles('#param-design_file', LOGO_TRACE)
    const editor = surface(page)
    await expect(editor).toBeVisible({ timeout: 60000 })
    const rows = page.locator('.svg-prep-object')
    await expect.poll(() => rows.count(), { timeout: 60000 }).toBe(111)

    const pane = editor.locator('.svg-prep-result-pane')
    await expect(pane.locator('.svg-prep-hit-path').first()).toBeAttached({
      timeout: 30000,
    })
    // The hit path under the dot, in the drawing's own units.
    const dot = await pane.locator('svg').first().evaluate((svg) => {
      const pt = svg.createSVGPoint()
      pt.x = 145
      pt.y = 135
      const hits = [...svg.querySelectorAll('.svg-prep-hit-path')].filter((p) =>
        p.isPointInFill(pt)
      )
      // The last one painted is the one a click finds.
      const top = hits[hits.length - 1]
      return top ? { index: top.dataset.index, count: hits.length } : null
    })
    expect(dot).not.toBeNull()
    const row = page.locator(`.svg-prep-object[data-index="${dot.index}"]`)
    await expect(
      row.locator('input[type=radio][value="hole"]')
    ).toBeChecked()

    const filledAtDot = () =>
      pane.locator('svg').first().evaluate((svg) => {
        const pt = svg.createSVGPoint()
        pt.x = 145
        pt.y = 135
        return [...svg.querySelectorAll('path')]
          .filter((p) => !p.closest('.svg-prep-hit-layer, .svg-prep-role-layer'))
          .filter((p) => !p.classList.contains('svg-prep-standin-path--ignore'))
          .filter((p) => p.isPointInFill(pt))
          .map((p) => p.getAttribute('class') || 'result')
      })
    // Before: the hole is painted as paper over the ink, or the result has
    // the hole; either way the dot is not solid ink.
    const before = await filledAtDot()
    expect(before.some((c) => /hole/.test(c)) || before.length === 0).toBe(true)

    await pane.locator(`.svg-prep-hit-path[data-index="${dot.index}"]`).dispatchEvent('click')
    await expect(
      editor.locator('.svg-prep-live, [aria-live="polite"].sr-only').first()
    ).toContainText(/1 of 111 shapes selected\./, { timeout: 10000 })

    await row.locator('input[type=radio][value="ignore"]').check({ force: true })
    // The combined result arrives after the settle: the dot is solid ink.
    await expect
      .poll(
        async () => {
          const classes = await filledAtDot()
          return classes.some((c) => /raised|result/.test(c)) && !classes.some((c) => /hole/.test(c))
        },
        { timeout: 60000 }
      )
      .toBe(true)
  })
})

test.describe('the automatic preparation that keeps nothing (D-167)', () => {
  test('★ D-167: when the automatic pass subtracts everything, the editor opens and says so', async ({
    page,
  }) => {
    test.setTimeout(300000)
    await openCharmHost(page)
    // Two light squares side by side with a dark bar on each: no frame, so
    // both squares are cut-outs, and subtracting them leaves nothing. The
    // old code applied that nothing under "Simplified 4 shapes for 3D
    // printing" and never opened the editor.
    await page.setInputFiles('#param-design_file', TWO_PAPERS)
    const editor = surface(page)
    await expect(editor).toBeVisible({ timeout: 60000 })
    await expect(page.locator('.svg-prep-object')).toHaveCount(4, {
      timeout: 60000,
    })

    // The card says what happened.
    const card = page.locator('.svg-prep-status').first()
    await expect(card).toContainText('Nothing was kept', { timeout: 10000 })

    // And the design the charm holds is the drawing itself, not the empty
    // result.
    const design = await page.evaluate(() => {
      const v = window.stateManager?.getState()?.parameters?.design_file
      const data = v && typeof v === 'object' ? String(v.data || '') : ''
      const comma = data.indexOf(',')
      if (comma < 0) return data
      const body = data.slice(comma + 1)
      return /base64/.test(data.slice(0, comma))
        ? atob(body)
        : decodeURIComponent(body)
    })
    expect(design).not.toMatch(/<path d=""/)
    expect(design).toContain('M4 8')
  })
})

// ── DP-80: Crop first ────────────────────────────────────────────────────────
//
// The owner's report: "I wanted to crop the picture before it was processed
// by the drawing editor, but it wouldn't let me." A photograph of a whole
// page is mostly the page. Crop first sits beside Start from the moment the
// pixels are read and opens the editor straight into the crop view on the
// picture itself; Save crop converts the part that is kept, as the person's
// press; Cancel or Escape closes the editor with nothing converted. RED on
// the build before this release: no such button on the control.
test.describe('Crop first (DP-80)', () => {
  /**
   * A sheet like the owner's: four panels of outlined shapes on a lit,
   * grainy paper, 1400 px (over the self-start line, so it waits for a
   * press), a camera picture by the quick look's verdict (DP-79).
   */
  async function chooseSheet(page) {
    await page.evaluate(async () => {
      const w = 1400
      const h = 1400
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      const img = ctx.createImageData(w, h)
      let seed = 777
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff
          const noise = ((seed >> 16) & 31) - 15
          const base = 236 - Math.round((30 * x) / w)
          const i = (y * w + x) * 4
          img.data[i] = base + noise
          img.data[i + 1] = base + noise - 3
          img.data[i + 2] = base + noise - 8
          img.data[i + 3] = 255
        }
      }
      ctx.putImageData(img, 0, 0)
      const shape = (draw, fill) => {
        ctx.lineWidth = 12
        ctx.strokeStyle = '#141414'
        ctx.fillStyle = fill
        ctx.beginPath()
        draw()
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
      const panels = [
        [0, 0],
        [700, 0],
        [0, 700],
        [700, 700],
      ]
      const fills = ['#c9a06a', '#6f8f5e', '#b04a3c', '#5b6b8a']
      panels.forEach(([px, py], k) => {
        shape(() => ctx.rect(px + 80, py + 90, 220, 260), fills[k])
        shape(
          () => ctx.arc(px + 500, py + 380, 130, 0, Math.PI * 2),
          fills[(k + 1) % 4]
        )
      })
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'))
      window.__testPicture = new File([blob], 'sheet.png', {
        type: 'image/png',
      })
    })
    await page.evaluate(() => {
      const input = document.querySelector('#param-design_file')
      const dt = new DataTransfer()
      dt.items.add(window.__testPicture)
      input.files = dt.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }

  const designName = (page) =>
    page.evaluate(() => {
      const v = window.stateManager?.getState()?.parameters?.design_file
      return v && typeof v === 'object' ? v.name : v || null
    })

  /** What the polite announcer said, from now on. */
  const listen = (page) =>
    page.evaluate(() => {
      window.__heard = []
      const node = document.getElementById('srAnnouncer')
      if (!node) return
      new MutationObserver(() => {
        const t = node.textContent.trim()
        if (t) window.__heard.push(t)
      }).observe(node, { childList: true, characterData: true, subtree: true })
    })

  test('★ the sheet: Crop first opens the crop view on the photograph before anything is converted, and Save crop converts the one panel', async ({
    page,
  }) => {
    test.setTimeout(480000)
    await openCharmHost(page)
    await chooseSheet(page)
    const start = page.locator('.trace-progress-start').first()
    const cropFirst = page.locator('.trace-progress-crop').first()
    await expect(start).toBeVisible({ timeout: 120000 })
    await expect(start).toHaveText('Start conversion')
    // Beside Start, with the visible words in its name; nothing converted.
    await expect(cropFirst).toBeVisible()
    await expect(cropFirst).toHaveText('Crop first')
    await expect(cropFirst).toHaveAttribute(
      'aria-label',
      'Crop first, before converting the picture'
    )
    expect(await designName(page)).toBeFalsy()

    await cropFirst.click()
    const editor = surface(page)
    await expect(editor).toBeVisible({ timeout: 60000 })
    const view = editor.locator('.drawing-editor-crop')
    await expect(view).toBeVisible()
    // The photograph itself is on the crop view, and its first row has focus.
    await expect(view.locator('image')).toHaveAttribute(
      'href',
      /^data:image\/png/
    )
    await expect(
      view.locator('input[type="range"][data-inset="top"]')
    ).toBeFocused()
    // No drawing behind it: no rows, no drawing tools, and the sentence for a
    // picture on the status line.
    await expect(page.locator('.svg-prep-object')).toHaveCount(0)
    await expect(editor.locator('.drawing-editor-toolbar-row--view')).toBeHidden()
    await expect(editor.locator('.drawing-editor-status')).toHaveText(
      /^Crop view open on your picture\./
    )
    expect(await designName(page)).toBeFalsy()

    // The top-left panel: half the width, half the height.
    await view.locator('.slider-spinbox[data-inset="right"]').fill('50')
    await view.locator('.slider-spinbox[data-inset="bottom"]').fill('50')
    await expect(view.locator('.drawing-editor-crop-keeping')).toHaveText(
      'Keeping 50 % of the width and 50 % of the height.'
    )
    await view.locator('[data-action="save-crop"]').click()

    // The conversion is the person's press: the dialog, then the editor on
    // the result, which says it was cropped.
    await expect(editor.locator('.drawing-editor-status')).toHaveText(
      /^Cropped\. \d+ shapes?\.$/,
      { timeout: 240000 }
    )
    const rows = await page.locator('.svg-prep-object').count()
    expect(rows).toBeGreaterThanOrEqual(2)
    expect(rows).toBeLessThan(60)
    // The charm holds the crop's drawing, and the control says where it
    // came from.
    await expect.poll(() => designName(page), { timeout: 60000 }).toBe(
      'sheet.svg'
    )
    await expect(page.locator('.file-info').first()).toContainText(
      'converted from sheet.png'
    )
    // The button reads Crop now: the same crop, on a converted picture.
    await editor.locator('.drawing-editor-close').click()
    await expect(editor).toBeHidden()
    await expect(cropFirst).toHaveText('Crop')
    await expect(cropFirst).toHaveAttribute('aria-label', 'Crop the picture')
  })

  test('★ Escape in the crop view closes the editor, converts nothing, says so once, and puts focus back on Crop first', async ({
    page,
  }) => {
    test.setTimeout(300000)
    await openCharmHost(page)
    await chooseSheet(page)
    const cropFirst = page.locator('.trace-progress-crop').first()
    await expect(cropFirst).toBeVisible({ timeout: 120000 })
    // The page's own start-up announcements are over (the first preview is
    // ready); from here the listener counts.
    await page.waitForTimeout(2000)
    await listen(page)

    await cropFirst.click()
    const editor = surface(page)
    await expect(editor.locator('.drawing-editor-crop')).toBeVisible({
      timeout: 60000,
    })
    await page.keyboard.press('Escape')
    await expect(editor).toBeHidden()
    await expect(cropFirst).toBeFocused()
    await expect(cropFirst).toHaveText('Crop first')
    expect(await designName(page)).toBeFalsy()
    await expect(page.locator('.file-info').first()).toContainText(
      'Ready to convert'
    )
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.__heard ?? [])).filter((t) =>
            t.startsWith('Crop canceled. Nothing was converted.')
          ).length,
        { timeout: 15000 }
      )
      .toBe(1)
    const heard = await page.evaluate(() => window.__heard ?? [])
    expect(
      heard.filter((t) => t.startsWith('Converted:')),
      `heard: ${heard.join(' | ')}`
    ).toEqual([])
  })

  test('★ a small quick picture that started converting by itself is stopped by Crop first, and the one conversion that lands is the crop', async ({
    page,
  }) => {
    test.setTimeout(300000)
    await openCharmHost(page)
    await page.waitForTimeout(2000)
    await listen(page)
    // The press has to land WHILE the self-started run is under way, and
    // that window is the run itself. A CPU throttle cannot widen it: the
    // quick look measures the device, and under a throttle it calls the
    // picture slow, so DP-Q32's rule waits for a press and nothing starts
    // by itself (MEASURED at 6x: Start stayed on screen for 30 s). So the
    // press comes from inside the page, the moment Start goes away with
    // Crop first still on offer, which is the moment the run began.
    await page.evaluate(() => {
      window.__cropPressed = false
      const obs = new MutationObserver(() => {
        const crop = document.querySelector('.trace-progress-crop')
        const start = document.querySelector('.trace-progress-start')
        if (window.__cropPressed || !crop || crop.hidden || !start || !start.hidden)
          return
        window.__cropPressed = true
        obs.disconnect()
        crop.click()
      })
      obs.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['hidden'],
      })
    })
    // 450 px, a grid of 400 dots on white: under the self-start line and
    // quick, so it starts converting the moment it is chosen (DP-Q32).
    await page.evaluate(async () => {
      const n = 450
      const perSide = 20
      const canvas = document.createElement('canvas')
      canvas.width = n
      canvas.height = n
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, n, n)
      ctx.fillStyle = '#000000'
      const cell = n / perSide
      for (let row = 0; row < perSide; row++) {
        for (let col = 0; col < perSide; col++) {
          ctx.beginPath()
          ctx.arc((col + 0.5) * cell, (row + 0.5) * cell, 6, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'))
      window.__testPicture = new File([blob], 'dots-quick.png', {
        type: 'image/png',
      })
    })
    await page.evaluate(() => {
      const input = document.querySelector('#param-design_file')
      const dt = new DataTransfer()
      dt.items.add(window.__testPicture)
      input.files = dt.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    // The run began by itself and the press landed inside it.
    await expect
      .poll(() => page.evaluate(() => window.__cropPressed), { timeout: 120000 })
      .toBe(true)
    const editor = surface(page)
    const view = editor.locator('.drawing-editor-crop')
    await expect(view).toBeVisible({ timeout: 60000 })
    await expect(page.locator('.conversion-dialog:not(.hidden)')).toHaveCount(0)
    // Keep the lower-right quarter: ten dots by ten.
    await view.locator('.slider-spinbox[data-inset="top"]').fill('50')
    await view.locator('.slider-spinbox[data-inset="left"]').fill('50')
    await view.locator('[data-action="save-crop"]').click()
    await expect(editor.locator('.drawing-editor-status')).toHaveText(
      /^Cropped\. \d+ shapes\.$/,
      { timeout: 240000 }
    )
    const rows = await page.locator('.svg-prep-object').count()
    expect(rows).toBeGreaterThanOrEqual(90)
    expect(rows).toBeLessThanOrEqual(110)
    // One conversion landed, the crop's: the self-started one never got to
    // say "Converted".
    const heard = await page.evaluate(() => window.__heard ?? [])
    expect(
      heard.filter((t) => t.startsWith('Converted:')),
      `heard: ${heard.join(' | ')}`
    ).toEqual([])
    await expect.poll(() => designName(page), { timeout: 60000 }).toBe(
      'dots-quick.svg'
    )
  })
})

// ── DP-81: the editor reopens where it was left (D-175) ─────────────────────
//
// The owner's report: after a long conversion and a simplification, testing
// the position on the charm and reopening the editor "did not save the
// previous process of simplifying and had to run through the simplification
// process all over again", on every visit. Two halves, both MEASURED at
// DP-77 P0c. (a) On the ring road every reopen combined everything again
// and Apply waited for all of it: now a reopen whose stored result was made
// from the choices it restores, at the width it measures, paints that result
// and arms Apply at once. (b) A customizer re-render (a preset, an undo, a
// reset) built a new file control that knew only its file's name, so the
// door into the editor, Start and the ink panel were gone: now the control
// restores its drawing, its picture and its settings from the stores. Both
// RED on the build before this release.
test.describe('the editor reopens where it was left (DP-81, D-175)', () => {
  const designName = (page) =>
    page.evaluate(() => {
      const v = window.stateManager?.getState()?.parameters?.design_file
      return v && typeof v === 'object' ? v.name : v || null
    })

  test('★ Off, Apply, move the design, reopen: the editor opens as it was left with Apply ready at once, and no combine runs', async ({
    page,
  }) => {
    test.setTimeout(480000)
    await openCharmHost(page)
    await page.setInputFiles('#param-design_file', LOGO_TRACE)
    const editor = surface(page)
    await expect(editor).toBeVisible({ timeout: 60000 })
    const rows = page.locator('.svg-prep-object')
    await expect.poll(() => rows.count(), { timeout: 60000 }).toBeGreaterThan(10)
    const total = await rows.count()

    // One shape Off, then Apply once the combine has landed. The counts the
    // reopen will say are read from the rows now: the logo's wall is already
    // Off by the wall rule, so "one off" is not the whole story.
    const off = rows.nth(1).locator('input[type="radio"][value="ignore"]')
    await off.check()
    const offCount = await page
      .locator('.svg-prep-object input[type="radio"][value="ignore"]:checked')
      .count()
    expect(offCount).toBeGreaterThanOrEqual(1)
    const apply = editor.locator('.svg-prep-footer [data-action="apply"]')
    await expect(apply).toBeEnabled({ timeout: 240000 })
    // The press lands at once, but what follows it (the emit: the data URL,
    // the companions, the state, the URL hash, the storage save; D-150's
    // family) holds the page, and on the CI runner that was 23 s on this
    // drawing (MEASURED in PR #274's shard-6 trace: "pending" to
    // "rendering" 23 s after the press, the card already reading
    // "Prepared"). A press waits for its acknowledgment, so it gets the
    // runner's time here rather than Playwright's ten seconds.
    await apply.click({ timeout: 90000 })
    await expect(editor).toBeHidden({ timeout: 30000 })
    const control = page.locator('.param-control--file', {
      has: page.locator('#param-design_file'),
    })
    await expect(control.locator('.svg-prep-status-badge')).toHaveText(
      'Prepared in the drawing editor.',
      { timeout: 30000 }
    )

    // Reposition on the charm: Left / right moves the design, not its size.
    const leftRight = page.locator('#param-design_left_right')
    await leftRight.fill('2')
    await leftRight.dispatchEvent('change')
    await expect(page.locator('.preview-state-indicator')).toHaveText(
      /Preview ready|Preview \(cached\)/,
      { timeout: 240000 }
    )

    // Reopen. RED before this: "Drawing editor open. The model preview is
    // behind it." and Apply disabled under "Combining N shapes, about N
    // seconds" for the whole combine (14.7 s at 200 shapes, MEASURED).
    const door = control.getByRole('button', { name: 'Open the drawing editor' })
    await door.scrollIntoViewIfNeeded()
    await door.click()
    await expect(editor).toBeVisible({ timeout: 60000 })
    await expect(editor.locator('.drawing-editor-status')).toHaveText(
      /^Drawing editor open, as you left it\. \d+ shapes? on, \d+ off\.$/,
      { timeout: 10000 }
    )
    await expect(apply).toBeEnabled({ timeout: 3000 })
    await expect(editor.locator('.drawing-editor-status')).toHaveText(
      new RegExp(`${total - offCount} shapes on, ${offCount} off\\.$`)
    )
    // The choice came back with the result.
    await expect(
      rows.nth(1).locator('input[type="radio"][value="ignore"]')
    ).toBeChecked()
    // No combine is under way: the render row stays quiet.
    await expect(editor.locator('.svg-prep-render-progress')).toBeHidden()

    // The first change combines as ever: Apply waits again.
    await rows.nth(2).locator('input[type="radio"][value="ignore"]').check()
    await expect(apply).toBeDisabled()
    await expect(apply).toBeEnabled({ timeout: 240000 })
    await editor.locator('.drawing-editor-close').click()
    await expect(editor).toBeHidden({ timeout: 30000 })
  })

  test('★ a preset, an undo and a slider undo leave the door in place, and Convert again still works after the rebuild', async ({
    page,
  }) => {
    test.setTimeout(480000)
    await openCharmHost(page)
    // A picture, so the control has pixels and settings to lose: 800 px is
    // above the self-start line, so Start is pressed.
    await page.evaluate(async () => {
      const n = 800
      const canvas = document.createElement('canvas')
      canvas.width = n
      canvas.height = n
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, n, n)
      ctx.fillStyle = '#000000'
      ctx.fillRect(n * 0.2, n * 0.2, n * 0.6, n * 0.6)
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'))
      const input = document.querySelector('#param-design_file')
      const dt = new DataTransfer()
      dt.items.add(new File([blob], 'square.png', { type: 'image/png' }))
      input.files = dt.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const control = () =>
      page.locator('.param-control--file', {
        has: page.locator('#param-design_file'),
      })
    const start = () => control().locator('.trace-progress-start')
    await expect(start()).toBeVisible({ timeout: 120000 })
    await expect(start()).toHaveText('Start conversion')
    await start().click()
    await expect(control().locator('.file-info')).toContainText(
      'converted from square.png',
      { timeout: 240000 }
    )
    const door = () =>
      control().getByRole('button', { name: 'Open the drawing editor' })
    await expect(door()).toBeVisible({ timeout: 30000 })
    await expect(page.locator('.preview-state-indicator')).toHaveText(
      /Preview ready|Preview \(cached\)/,
      { timeout: 240000 }
    )

    // The owner's order (DP-77 P0c): a change on the charm first, then a
    // preset that clears the design, then Undo. Applying a preset records no
    // undo step of its own (REPORTED at DP-81), so Undo restores the state
    // from before the change that preceded it, which here holds the design;
    // RED before this the control then showed its name with no card, no
    // door, no Start and no ink panel (MEASURED twice at DP-77).
    const scale = page.locator('#param-design_scale')
    await scale.fill('80')
    await scale.dispatchEvent('change')
    await page.waitForTimeout(500)
    const presetValue = await page.evaluate(() => {
      const sel = document.querySelector('#presetSelect')
      const opt = [...(sel?.options || [])].find(
        (o) => o.value && !/custom|choose|select/i.test(o.value)
      )
      return opt ? opt.value : null
    })
    expect(presetValue, 'a preset to apply').toBeTruthy()
    await page.evaluate((v) => {
      const sel = document.querySelector('#presetSelect')
      sel.value = v
      sel.dispatchEvent(new Event('change', { bubbles: true }))
    }, presetValue)
    await expect.poll(() => designName(page), { timeout: 30000 }).toBeFalsy()
    await page.locator('#undoBtn').click()
    await expect.poll(() => designName(page), { timeout: 30000 }).toBe(
      'square.svg'
    )
    await expect(door()).toBeVisible({ timeout: 30000 })
    // One square is one shape, and the card calls that "SVG Ready".
    await expect(control().locator('.svg-prep-status-badge')).toHaveText(
      /shapes?|SVG Ready/
    )
    await expect(start()).toBeVisible()
    await expect(start()).toHaveText('Convert again')
    await expect(control().locator('.trace-progress-crop')).toHaveText('Crop')
    await expect(control().locator('.ink-controls')).toBeVisible()

    // A slider change and its undo: another re-render, the door stays.
    await scale.fill('80')
    await scale.dispatchEvent('change')
    await page.waitForTimeout(500)
    await page.locator('#undoBtn').click()
    await expect.poll(() => designName(page), { timeout: 30000 }).toBe(
      'square.svg'
    )
    await expect(door()).toBeVisible({ timeout: 30000 })

    // And the pixels are still there: Convert again converts again.
    await start().click()
    await expect(control().locator('.file-info')).toContainText(
      'converted from square.png',
      { timeout: 240000 }
    )
    await expect(door()).toBeVisible({ timeout: 30000 })

    // The door goes in.
    await door().scrollIntoViewIfNeeded()
    await door().click()
    await expect(surface(page)).toBeVisible({ timeout: 60000 })
    await expect
      .poll(() => page.locator('.svg-prep-object').count(), { timeout: 60000 })
      .toBeGreaterThan(0)
  })
})
