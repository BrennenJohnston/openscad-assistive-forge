/**
 * E2E tests for ink extraction (IR-11).
 *
 * Professional communication symbols are black line work over a saturated
 * fill, and the fill colour carries meaning. Forge's tracer quantized to two
 * colours by luminance, which puts a blue field and the black glyph drawn on it
 * in the SAME bucket: MEASURED on `tests/fixtures/aac/blue-field-glyph.png`,
 * the shipped pipeline returns ONE path - the blue square - and the person is
 * gone. Nothing said so.
 *
 * These tests pin the fix by counting shapes, not pixels.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import path from 'node:path'

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures')
const BLUE_FIELD = path.join(FIXTURES, 'aac', 'blue-field-glyph.png')
const FITZGERALD = path.join(FIXTURES, 'aac', 'fitzgerald-card.png')
const BIRD = path.join(FIXTURES, 'svg-edit', 'bird-drawing.png')

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

/** Open the standalone drawing editor on a picture. */
async function openPicture(page, fixture) {
  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', { timeout: 90000 })
  await page.locator('#accessibilitySpotlights > summary').click()
  await page.locator('#svgEditFileInput').setInputFiles(fixture)
  await page
    .locator('.svg-prep-object')
    .first()
    .waitFor({ state: 'visible', timeout: 60000 })
  await expect(page.locator('.ink-controls')).toBeVisible()
  // The editor's focus trap takes focus on a short delay. Driving the keyboard
  // before it lands means the trap steals the first keypress back.
  // RE-PINNED at DP-19: the surface that hosts the editor puts focus on its
  // own name (the "Drawing editor" heading), not on a close button.
  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          (document.activeElement?.className || '').includes(
            'drawing-editor-title'
          )
        ),
      { timeout: 15000 }
    )
    .toBe(true)
}

const shapeCount = (page) => page.locator('.svg-prep-object').count()
const summaryText = (page) =>
  page.locator('.ink-controls-summary').textContent()

/** Switch mode and wait for the re-trace to report. */
async function chooseMode(page, value) {
  const before = await summaryText(page)
  await page.locator(`#svg-edit-ink-mode-${value}`).check()
  await expect
    .poll(async () => summaryText(page), { timeout: 20000 })
    .not.toBe(before)
}

test.describe('What to keep from a picture', () => {
  test('Line art keeps the glyph the coloured field used to swallow', async ({
    page,
  }) => {
    test.setTimeout(150000)
    await openPicture(page, BLUE_FIELD)

    // Line art is the default for a picture that had to be traced.
    await expect(page.locator('#svg-edit-ink-mode-lineart')).toBeChecked()

    const lineArtShapes = await shapeCount(page)
    console.log('[ink] line art shapes:', lineArtShapes)
    expect(lineArtShapes).toBeGreaterThan(1)
    expect(await summaryText(page)).toMatch(/shapes traced/)

    // The same picture through the old path: one shape, the field, glyph gone.
    await chooseMode(page, 'standard')
    const standardShapes = await shapeCount(page)
    console.log('[ink] standard shapes:', standardShapes)
    expect(standardShapes).toBe(1)
    expect(standardShapes).toBeLessThan(lineArtShapes)

    // And back, because a mode is a choice rather than a one-way door.
    await chooseMode(page, 'lineart')
    expect(await shapeCount(page)).toBe(lineArtShapes)
  })

  test('Solid shape returns one filled outline, and says it nearly filled the picture', async ({
    page,
  }) => {
    test.setTimeout(150000)
    await openPicture(page, BLUE_FIELD)
    await chooseMode(page, 'silhouette')

    expect(await shapeCount(page)).toBe(1)
    expect(await summaryText(page)).toMatch(/1 shape traced/)

    // A silhouette of a full-bleed symbol is nearly the whole rectangle, and
    // the panel says so rather than leaving someone to find out at the printer.
    const warnings = await page.locator('.ink-controls-warnings li').allTextContents()
    console.log('[ink] silhouette warnings:', JSON.stringify(warnings))
    expect(warnings.join(' ')).toMatch(/solid block/)
  })

  test('a dark drawing on light paper survives both modes', async ({
    page,
  }) => {
    test.setTimeout(150000)
    await openPicture(page, BIRD)

    const lineArt = await shapeCount(page)
    await chooseMode(page, 'standard')
    const standard = await shapeCount(page)

    console.log('[ink] bird line art:', lineArt, 'standard:', standard)
    // The signed default changes behaviour for photographs, so the case that
    // already worked has to keep working. Both find the same drawing.
    expect(lineArt).toBeGreaterThan(1)
    expect(standard).toBeGreaterThan(1)
    expect(Math.abs(lineArt - standard)).toBeLessThanOrEqual(2)
  })

  test('the filament suggestion only appears when the picture has one fill colour', async ({
    page,
  }) => {
    test.setTimeout(150000)
    await openPicture(page, BLUE_FIELD)
    // One blue field: the suggestion is honest, and names a colour that is
    // actually in the picture.
    expect(await summaryText(page)).toMatch(/#1f5fbf/i)

    // openPicture navigates to '/' itself; an about:blank hop in between races
    // Firefox's own navigation and buys nothing.
    await openPicture(page, FITZGERALD)
    // Four different fills average to a colour that is in none of them, so
    // nothing is suggested.
    expect(await summaryText(page)).not.toMatch(/filament/i)
  })

  test('the thresholds are labelled, paired with a number, and change the result', async ({
    page,
  }) => {
    test.setTimeout(150000)
    await openPicture(page, BLUE_FIELD)

    const lightness = page.locator('#svg-edit-ink-lightness')
    await expect(lightness).toHaveAttribute('type', 'range')
    const labelText = await page
      .locator('label[for="svg-edit-ink-lightness"]')
      .textContent()
    expect(labelText).toBe('How dark counts as a line')

    const number = page.locator(
      'input[aria-label="How dark counts as a line, as a number"]'
    )
    await expect(number).toBeVisible()
    await expect(number).toHaveValue(await lightness.inputValue())

    // Typing into the number moves the slider: the two are one control.
    await number.fill('12')
    await number.dispatchEvent('change')
    await expect(lightness).toHaveValue('12')
    // And back, because the next step needs the lightness gate open. This
    // ordering is the point: a pixel has to pass BOTH gates to be ink, so
    // leaving lightness at 12 would keep the blue field out (L* about 42) no
    // matter what the colourfulness gate said.
    await number.fill(String(90))
    await number.dispatchEvent('change')
    await expect(lightness).toHaveValue('90')

    const before = await summaryText(page)
    const shapesBefore = await shapeCount(page)
    const chromaNumber = page.locator(
      'input[aria-label="How colourful is still a line, as a number"]'
    )
    await chromaNumber.fill('80')
    await chromaNumber.dispatchEvent('change')
    await expect(page.locator('#svg-edit-ink-chroma')).toHaveValue('80')
    await expect
      .poll(async () => summaryText(page), { timeout: 20000 })
      .not.toBe(before)
    // With both gates wide open the field is ink again, and the picture
    // collapses. The editor lists SUBPATHS, which is not the same number as
    // the tracer's paths, so this asserts the collapse rather than a count.
    expect(await shapeCount(page)).toBeLessThan(shapesBefore)

    // The colourfulness gate belongs to Line art alone; offering it elsewhere
    // would be offering a control that changes nothing.
    await chooseMode(page, 'silhouette')
    await expect(page.locator('#svg-edit-ink-chroma')).toBeDisabled()
    await chooseMode(page, 'lineart')
    await expect(page.locator('#svg-edit-ink-chroma')).toBeEnabled()
  })

  test('the panel is reachable and operable by keyboard alone', async ({
    page,
  }) => {
    test.setTimeout(150000)
    await openPicture(page, BLUE_FIELD)

    await page.locator('#svg-edit-ink-mode-lineart').focus()
    const before = await summaryText(page)
    // A radio group moves AND selects on arrow.
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('#svg-edit-ink-mode-silhouette')).toBeChecked()
    await expect
      .poll(async () => summaryText(page), { timeout: 20000 })
      .not.toBe(before)

    // And the re-trace did not throw the keyboard out of the panel. Changing
    // the picture re-opens the editor underneath, which used to move the panel
    // in the DOM and blur whatever was focused - on every slider step.
    await expect(page.locator('#svg-edit-ink-mode-silhouette')).toBeFocused()
    // It also stayed expanded rather than dropping back behind the page.
    // RE-PINNED at DP-19: the door hosts the editor surface over the whole
    // page (#svgEditStandaloneHost); the workspace's own fullscreen class is
    // no longer how that happens, so the host staying visible is the pin.
    await expect(page.locator('#svgEditStandaloneHost')).toBeVisible()
    await expect(page.locator('.svg-prep-fullscreen')).toHaveCount(0)

    // Every control in the panel is a tab stop inside the editor's trap.
    const reachable = await page.evaluate(() => {
      const panel = document.querySelector('.ink-controls')
      return [...panel.querySelectorAll('input, a')].every(
        (el) => el.tabIndex >= 0
      )
    })
    expect(reachable).toBe(true)
  })

  test('the panel says the picture never leaves the browser, and where to find symbols', async ({
    page,
  }) => {
    test.setTimeout(150000)
    await openPicture(page, BLUE_FIELD)

    await expect(page.locator('.ink-controls-notice')).toContainText(
      'never uploaded'
    )
    await expect(page.locator('.ink-controls-notice')).toContainText(
      'responsible for having the right'
    )
    const links = page.locator('.ink-controls-signpost a')
    await expect(links).toHaveCount(3)
    // Signposts, not bundled assets: nothing from these sets is in the repo.
    for (const href of await links.evaluateAll((els) =>
      els.map((e) => e.getAttribute('href'))
    )) {
      expect(href).toMatch(/^https:\/\//)
    }
  })

  test('the panel passes an accessibility scan', async ({ page }) => {
    test.setTimeout(180000)
    await openPicture(page, BLUE_FIELD)

    const results = await new AxeBuilder({ page })
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
      `unexpected axe violations with the ink panel open:\n${detail}`
    ).toEqual([])
  })
})

test.describe('A model that takes an image', () => {
  test('a picture dropped on a file parameter gets the same choice, defaulting to Line art', async ({
    page,
  }) => {
    test.setTimeout(180000)
    await page.goto('/?example=logo-plate')
    await page
      .locator('.param-control')
      .first()
      .waitFor({ state: 'attached', timeout: 60000 })
    const notNow = page.locator('#saveProjectNotNow')
    try {
      await notNow.waitFor({ state: 'visible', timeout: 3000 })
      await notNow.click()
    } catch {
      // no save prompt for this example
    }
    const expandAll = page.locator('#expandAllGroupsBtn')
    if (await expandAll.isVisible().catch(() => false)) {
      await expandAll.click()
    }

    // Nothing to decide until there is a picture to decide about.
    await expect(page.locator('.ink-controls')).toBeHidden()

    await page
      .locator('.param-control input[type="file"]')
      .first()
      .setInputFiles(BLUE_FIELD)

    await expect(page.locator('.ink-controls')).toBeVisible({ timeout: 60000 })
    await expect(
      page.locator('.ink-controls input[type="radio"][value="lineart"]')
    ).toBeChecked()
    await expect
      .poll(async () => page.locator('.ink-controls-summary').textContent(), {
        timeout: 30000,
      })
      .toMatch(/shapes traced/)

    // The model took the traced SVG as its parameter value.
    await expect(page.locator('.file-info')).toContainText(
      'blue-field-glyph.svg'
    )
  })
})
