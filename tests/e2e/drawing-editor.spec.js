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
import path from 'node:path'

const CAT = path.join(process.cwd(), 'tests', 'fixtures', 'harley', 'sketch4.svg')

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
  test('★ D-124 opens it in the preview area; Tab leaves; arrows leave the camera; Escape gives the area back; axe; a colour becomes a plate', async ({
    page,
  }) => {
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

    // ── The customizer stays one Tab away: no trap over the preview ──────
    // From the editor's first Tab stop, one step backwards is the page around
    // it; from its last, one step forwards is too. Nothing holds focus in.
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
    await page.locator('details[data-section="colours"] summary').click()
    await page.locator('details[data-section="plates"] summary').click()
    await page.locator('details[data-section="warnings"] summary').click()
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

    // ── Add a colour, give it to a region, Apply ─────────────────────────
    await page.locator('.drawing-editor-add-colour input[type="text"]').fill('Brown')
    await page.locator('.drawing-editor-add-colour input[type="color"]').fill('#997048')
    await page.locator('.drawing-editor-add-colour button[type="submit"]').click()
    await expect(page.locator('[data-count="plates"]')).toHaveText('2')
    await expect(page.locator('.drawing-editor-status')).toHaveText(
      'Brown added. Choose it for a region.'
    )

    const row = page.locator('.drawing-editor-regions-table tbody tr').last()
    await row.locator('select').selectOption({ label: 'Brown' })
    await expect(row.locator('[data-plate]')).toHaveText('2')
    await expect(page.locator('.drawing-editor-status')).toContainText(
      'set to Brown. Plate 2.'
    )

    const apply = page.locator('.svg-prep-footer button[data-action="apply"]')
    await expect(apply).toBeEnabled({ timeout: 60000 })
    await apply.click()
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
    await expect(page.locator('.svg-prep-status-plan')).toHaveText(
      '2 colours, 2 plates.'
    )
  })
})
