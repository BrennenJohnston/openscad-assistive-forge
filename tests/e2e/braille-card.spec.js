/**
 * E2E tests for the Braille Card Customizer toolset (card, charm, sign)
 *
 * Covers: welcome-screen card + variant dropdown, deep-link loading,
 * client-side liblouis translation (type text -> braille preview ->
 * Line_N params), card size presets, severity-tiered errors/warnings,
 * multi-card notice + pager + render-all mode, per-character multi-charm
 * mode (generate-all toggle + charm pager), sign raised-text +
 * independently wrapped braille params, and axe accessibility scans of
 * the panel in all three modes.
 *
 * @license GPL-3.0-or-later
 */

import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { parseSTL } from '../../scripts/parity/stl-stats.mjs'

// Skip WASM-dependent tests in CI - WASM initialization is slow/unreliable
const isCI = !!process.env.CI

// Dismiss first-visit modal so it doesn't block UI interactions
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

/**
 * Dismiss the opt-in save-project prompt that follows program-example
 * loads. It opens shortly after parameter extraction and intercepts
 * pointer events until closed.
 */
async function dismissSavePrompt(page) {
  const notNow = page.locator('#saveProjectNotNow')
  try {
    await notNow.waitFor({ state: 'visible', timeout: 5000 })
    await notNow.click()
    await notNow.waitFor({ state: 'hidden', timeout: 5000 })
  } catch {
    // Prompt didn't appear
  }
}

/** Load a braille example via deep-link and wait for the braille panel. */
async function openBrailleExample(page, exampleKey) {
  await page.goto(`/?example=${exampleKey}`)
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('#braillePanel')).toBeVisible({ timeout: 15000 })
  await dismissSavePrompt(page)
}

const openBrailleCard = (page) => openBrailleExample(page, 'braille-wedge-card')

/** Set a parameter control by name: a list takes a value, a switch a boolean. */
async function setParam(page, name, value) {
  const control = page.locator(`.param-control[data-param-name="${name}"]`)
  await control.waitFor({ state: 'attached', timeout: 15000 })
  // The control may sit in a collapsed parameter group
  await page.evaluate((n) => {
    let group = document
      .querySelector(`.param-control[data-param-name="${n}"]`)
      ?.closest('details')
    while (group) {
      group.open = true
      group = group.parentElement?.closest('details')
    }
  }, name)
  if (typeof value === 'boolean') {
    await control.locator('input[type="checkbox"]').setChecked(value)
  } else {
    await control.locator('select').selectOption(value)
  }
}

/**
 * Render the model at full quality and return the downloaded STL. Generate
 * renders; the same button then reads "Download", and a second press saves.
 */
async function downloadStl(page) {
  await page.locator('#outputFormat').selectOption('stl')
  await page.locator('#primaryActionBtn').click()
  await expect(page.locator('#primaryActionBtn')).toContainText('Download', {
    timeout: 180_000,
  })
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 })
  await page.locator('#primaryActionBtn').click()
  const download = await downloadPromise
  return parseSTL(readFileSync(await download.path()))
}

/** Run an axe scan of the braille panel and assert no violations. */
async function expectPanelAxeClean(page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .include('#braillePanel')
    .analyze()

  if (results.violations.length > 0) {
    console.log('Braille panel axe violations:')
    results.violations.forEach((v) => {
      console.log(`- ${v.id}: ${v.description} (impact: ${v.impact})`)
      v.nodes.forEach((node) => {
        console.log(`  Element: ${node.html.substring(0, 120)}`)
      })
    })
  }
  expect(results.violations).toEqual([])
}

test.describe('Braille toolset assets', () => {
  test('example scads and manifests exist for all three variants', async ({ page }) => {
    for (const [dir, scad] of [
      ['braille-wedge-card', 'braille_wedge_card.scad'],
      ['braille-charm', 'braille_charm.scad'],
      ['braille-sign', 'braille_sign.scad'],
    ]) {
      const scadResponse = await page.request.get(`/examples/${dir}/${scad}`)
      expect(scadResponse.ok(), `${dir}/${scad}`).toBe(true)

      const manifestResponse = await page.request.get(
        `/examples/${dir}/manifest.json`
      )
      expect(manifestResponse.ok(), `${dir}/manifest.json`).toBe(true)
      const manifest = await manifestResponse.json()
      expect(manifest.brailleTranslation, dir).toBeDefined()
      expect(manifest.license, dir).toBe('GPL-3.0-or-later')
    }
  })

  test('liblouis engine and tables are served', async ({ page }) => {
    // The dev server answers a file it does not have with the app's own page
    // and a 200, so every check reads what came back, not just the status.
    const wasm = await page.request.get('/wasm/liblouis/liblouis.wasm')
    expect(wasm.ok()).toBe(true)
    expect([...(await wasm.body()).subarray(0, 4)]).toEqual([0, 0x61, 0x73, 0x6d])

    const license = await page.request.get(
      '/wasm/liblouis/COPYING.LESSER.liblouis'
    )
    expect(await license.text()).toContain('GNU LESSER GENERAL PUBLIC LICENSE')

    const catalog = await (
      await page.request.get('/liblouis/tables.json')
    ).json()
    expect(catalog.liblouis).toBe('3.39.0')

    for (const name of ['unicode.dis', 'en-ueb-g1.ctb', 'en-ueb-g2.ctb']) {
      const table = await page.request.get(`/liblouis/tables/${name}`)
      expect(table.ok(), name).toBe(true)
      expect(await table.text(), name).not.toMatch(/^\s*<!doctype/i)
    }
  })
})

test.describe('Welcome screen', () => {
  test('has Braille Card Customizer card with accessible button', async ({ page }) => {
    await page.goto('/')

    const openBtn = page.locator('#openBrailleCardBtn')
    await expect(openBtn).toBeVisible()
    // Braille Sign is the default tool for the Braille Card Customizer card
    expect(await openBtn.getAttribute('data-example')).toBe('braille-sign')

    const ariaLabel = await openBtn.getAttribute('aria-label')
    const textContent = await openBtn.textContent()
    const hasName =
      (ariaLabel && ariaLabel.length > 0) ||
      (textContent && textContent.trim().length > 0)
    expect(hasName).toBe(true)
  })

  test('braille variant dropdown switches the open button target', async ({ page }) => {
    await page.goto('/')

    const select = page.locator('#brailleVariantSelect')
    await expect(select).toBeVisible()

    // Labeled control
    const label = page.locator('label[for="brailleVariantSelect"]')
    await expect(label).toBeVisible()

    const openBtn = page.locator('#openBrailleCardBtn')

    // The change listener is wired during app init, which may still be in
    // flight when the select first renders — retry until it takes effect.
    await expect(async () => {
      await select.selectOption('braille-charm')
      expect(await openBtn.getAttribute('data-example')).toBe('braille-charm')
    }).toPass({ timeout: 15000 })
    await select.selectOption('braille-sign')
    expect(await openBtn.getAttribute('data-example')).toBe('braille-sign')
    await select.selectOption('braille-wedge-card')
    expect(await openBtn.getAttribute('data-example')).toBe('braille-wedge-card')
  })
})

test.describe('Braille translation workflow (card)', () => {
  test('deep-link loads example with translation panel above parameters', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    // Panel controls all present
    await expect(page.locator('#brailleTextInput')).toBeVisible()
    await expect(page.locator('#brailleTableSelect')).toBeVisible()
    await expect(page.locator('#brailleCapsToggle')).toBeAttached()
    await expect(page.locator('#brailleSizePreset')).toBeVisible()

    // Capitals are preserved by default
    await expect(page.locator('#brailleCapsToggle')).toBeChecked()

    // Generated parameter controls still render below (raw Line_N inputs
    // stay available for advanced users, inside collapsed groups)
    await expect(
      page.locator('.param-control[data-param-name="Line_1"]')
    ).toBeAttached({ timeout: 10000 })

    // Table catalog populated; the card starts on contracted (Grade 2) UEB
    const selectedTable = await page.locator('#brailleTableSelect').inputValue()
    expect(selectedTable).toBe('en-ueb-g2.ctb')
  })

  test('typing text translates to braille and updates Line_N params', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    const textarea = page.locator('#brailleTextInput')
    await textarea.fill('hello world')

    // Preview shows the translated braille; on the default 200 mm card
    // (26 cells/line) "hello world" fits on a single line
    const preview = page.locator('#braillePreview')
    await expect(preview).toContainText('\u2813\u2811\u2807\u2807\u2815', {
      timeout: 20000,
    }) // ⠓⠑⠇⠇⠕
    await expect(preview).toContainText('\u2838\u283A') // ⠸⠺, "world" in Grade 2

    // Source text is shown under the braille line. The panel's initial
    // layout of its default text ('hello\nworld', two lines) may render
    // just after the fill, so wait for the single-line state to settle
    // (scoped to .first() — the transient state has two source spans).
    await expect(
      preview.locator('.braille-preview-source').first()
    ).toContainText('hello world', { timeout: 20000 })

    // The braille flows into the SCAD Line_1 parameter input (words joined
    // by the braille blank cell U+2800)
    const line1Input = page.locator(
      '.param-control[data-param-name="Line_1"] input'
    )
    await expect(line1Input).toHaveValue(
      '\u2813\u2811\u2807\u2807\u2815\u2800\u2838\u283A',
      { timeout: 10000 }
    )
  })

  test('card size preset writes dimensions and turns auto-size off', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    // Auto-size is the SCAD default, so the select starts on the auto option
    await expect(page.locator('#brailleSizePreset')).toHaveValue('auto')

    await page.locator('#brailleSizePreset').selectOption('business')

    const widthInput = page.locator(
      '.param-control[data-param-name="card_face_width_mm"] input[type="number"]'
    )
    await expect(widthInput.first()).toHaveValue('89', { timeout: 10000 })
    const heightInput = page.locator(
      '.param-control[data-param-name="card_face_height_mm"] input[type="number"]'
    )
    await expect(heightInput.first()).toHaveValue('51', { timeout: 10000 })

    // Choosing a size preset forces auto-size off
    const autoSelect = page.locator(
      '.param-control[data-param-name="auto_size_card"] select'
    )
    await expect(autoSelect).toHaveValue('Off', { timeout: 10000 })

    // Picking the auto option turns it back on
    await page.locator('#brailleSizePreset').selectOption('auto')
    await expect(autoSelect).toHaveValue('On', { timeout: 10000 })
  })

  test('overflow produces the error alert when splitting is off', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    // Business card (10 cells x 3 rows capacity) + splitting off + many lines
    await page.locator('#brailleSizePreset').selectOption('business')
    await page.locator('.braille-panel-layout summary').click()
    await page.locator('#brailleSplitCards').uncheck()

    const lines = Array.from({ length: 6 }, (_, i) => `line ${i + 1}`)
    await page.locator('#brailleTextInput').fill(lines.join('\n'))

    const errors = page.locator('#brailleErrors')
    await expect(errors).toBeVisible({ timeout: 20000 })
    await expect(errors).toContainText('Error:')
    await expect(errors).toContainText(/fit on\s+this card/)

    // Error box is an alert region
    expect(await errors.getAttribute('role')).toBe('alert')
  })

  test('long text shows multi-card notice and pager', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    // 10 hard lines with default max 8 rows/card -> 2 cards
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`)
    await page.locator('#brailleTextInput').fill(lines.join('\n'))

    // Prominent notice
    const notice = page.locator('#brailleMultiCardNotice')
    await expect(notice).toBeVisible({ timeout: 20000 })
    await expect(notice).toContainText('spans 2 cards')
    expect(await notice.getAttribute('role')).toBe('status')

    const pager = page.locator('#brailleCardPager')
    await expect(pager).toBeVisible()
    await expect(page.locator('#braillePagerStatus')).toHaveText('Card 1 of 2')
    // The hint shows the real friendly export name (first word of the text)
    await expect(page.locator('#braillePagerHint')).toContainText(
      'Braille Card 1 of 2 line.stl'
    )

    // Pager is keyboard-operable: prev disabled on first card, next works
    await expect(page.locator('#braillePrevCard')).toBeDisabled()
    const nextBtn = page.locator('#brailleNextCard')
    await nextBtn.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#braillePagerStatus')).toHaveText('Card 2 of 2')
    await expect(page.locator('#brailleNextCard')).toBeDisabled()
  })

  test('render-all toggle writes every line and the All cards layout', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`)
    await page.locator('#brailleTextInput').fill(lines.join('\n'))

    const renderAll = page.locator('#brailleRenderAll')
    await expect(renderAll).toBeVisible({ timeout: 20000 })
    await renderAll.check()

    // Pager hides; the whole set is one model now
    await expect(page.locator('#brailleCardPager')).toBeHidden()
    await expect(page.locator('#brailleMultiCardNotice')).toContainText(
      'Braille Cards line.stl'
    )

    // card_layout switches to All cards
    const layoutSelect = page.locator(
      '.param-control[data-param-name="card_layout"] select'
    )
    await expect(layoutSelect).toHaveValue('All cards', { timeout: 10000 })

    // Lines beyond one card are written too (line 9 lands in Line_9)
    const line9Input = page.locator(
      '.param-control[data-param-name="Line_9"] input'
    )
    await expect(line9Input).not.toHaveValue('', { timeout: 10000 })

    // Turning it off restores Single layout
    await renderAll.uncheck()
    await expect(layoutSelect).toHaveValue('Single', { timeout: 10000 })
    await expect(page.locator('#brailleCardPager')).toBeVisible()
  })

  test('capital letters warning appears when preserve-caps is turned off', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    await page.locator('#brailleCapsToggle').uncheck()
    await page.locator('#brailleTextInput').fill('Hello')

    const warnings = page.locator('#brailleWarnings')
    await expect(warnings).toBeVisible({ timeout: 20000 })
    await expect(warnings).toContainText('Warning:')
    await expect(warnings).toContainText('lowercase')

    // Informational tier is a status region, not an interrupting alert
    expect(await warnings.getAttribute('role')).toBe('status')
  })

  test('no caps warning while preserve-caps stays on (default)', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    await page.locator('#brailleTextInput').fill('Hello')

    // Preview updates (capital indicator ⠠ then h-e-l-l-o)
    await expect(page.locator('#braillePreview')).toContainText(
      '\u2820\u2813\u2811\u2807\u2807\u2815',
      { timeout: 20000 }
    )
    await expect(page.locator('#brailleWarnings')).toBeHidden()
  })

  test('with auto-wrap off, a no-break space is a word space', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)
    await page.locator('.braille-panel-layout summary').click()
    await page.locator('#brailleAutoWrap').uncheck()
    await page.locator('#brailleTextInput').fill('Room\u00A0101')
    // The cells of "Room 101": a blank cell, not the raw character, and
    // nothing reported as untranslatable
    await expect(
      page.locator('#braillePreview .braille-preview-braille').first()
    ).toHaveText(
      '\u2820\u2817\u2815\u2815\u280D\u2800\u283C\u2801\u281A\u2801',
      { timeout: 20000 }
    )
    await expect(page.locator('#brailleWarnings')).toBeHidden()
  })

  test('translated braille renders through the WASM pipeline', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI')
    test.setTimeout(180_000)

    await openBrailleCard(page)

    // Wait for the WASM engine before touching parameters
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: 120_000,
    })

    // Type text and wait for the translation to land in the preview
    await page.locator('#brailleTextInput').fill('hi')
    await expect(page.locator('#braillePreview')).toContainText(
      '\u2813\u280A', // ⠓⠊
      { timeout: 20000 }
    )

    // The panel's parameter write triggers auto-preview; wait for the
    // preview state indicator to settle on current (not error)
    await page.waitForFunction(
      () => {
        const indicator = document.querySelector('.preview-state-indicator')
        if (!indicator) return false
        return (
          indicator.className.includes('state-current') ||
          indicator.className.includes('state-error')
        )
      },
      { timeout: 150_000 }
    )
    const indicatorClass = await page
      .locator('.preview-state-indicator')
      .getAttribute('class')
    expect(indicatorClass).not.toContain('state-error')
  })

  test('rows clamp is surfaced as a warning instead of a silent grid_rows reset', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    // Business card height (51 mm) fits 3 rows at the default 10 mm line
    // spacing and 6 mm margin; the default Max rows per card is 8.
    await page.locator('#brailleSizePreset').selectOption('business')
    await page.locator('#brailleTextInput').fill('hello')

    const warnings = page.locator('#brailleWarnings')
    await expect(warnings).toBeVisible({ timeout: 20000 })
    await expect(warnings).toContainText('fits 3 rows')

    // grid_rows carries the clamped value...
    const gridRowsInput = page.locator(
      '.param-control[data-param-name="grid_rows"] input[type="number"]'
    )
    await expect(gridRowsInput.first()).toHaveValue('3', { timeout: 10000 })
    // ...while Max rows per card keeps the user's requested value (sticky)
    await expect(page.locator('#brailleMaxRows')).toHaveValue('8')
  })

  test('editing grid_rows directly syncs Max rows per card (two-way)', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)
    await page.locator('#brailleTextInput').fill('hello')
    await expect(page.locator('#braillePreview')).toContainText(
      '\u2813\u2811\u2807\u2807\u2815',
      { timeout: 20000 }
    )

    // The raw grid_rows control lives inside a collapsed parameter
    // group; expand it so the input is interactable.
    await page
      .locator('.param-control[data-param-name="grid_rows"]')
      .waitFor({ state: 'attached', timeout: 10000 })
    await page.evaluate(() => {
      const control = document.querySelector(
        '.param-control[data-param-name="grid_rows"]'
      )
      const group = control?.closest('details.param-group')
      if (group) group.open = true
    })

    const gridRowsInput = page
      .locator('.param-control[data-param-name="grid_rows"] input[type="number"]')
      .first()
    await gridRowsInput.fill('4')
    await gridRowsInput.blur()

    await expect(page.locator('#brailleMaxRows')).toHaveValue('4', {
      timeout: 10000,
    })
    // The next layout keeps the user's value instead of resetting it
    await expect(gridRowsInput).toHaveValue('4', { timeout: 10000 })
  })

  test('braille editor: translate to braille, verbatim use, and back-translation', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    await page.locator('#brailleTextInput').fill('hello')
    await expect(page.locator('#braillePreview')).toContainText(
      '\u2813\u2811\u2807\u2807\u2815',
      { timeout: 20000 }
    )

    // Open the editor and fill it from the text
    await page.locator('#brailleFieldEditor summary').click()
    await page.locator('#brailleFieldFromText').click()
    const field = page.locator('#brailleFieldInput')
    await expect(field).toHaveValue('\u2813\u2811\u2807\u2807\u2815', {
      timeout: 20000,
    })
    await expect(page.locator('#brailleFieldStatus')).toContainText(
      'Filled from your text'
    )

    // Hand-edit the braille: the card now uses it exactly as written
    await field.fill('\u2813\u2811\u2807\u2807\u2815\u2815')
    const line1Input = page.locator(
      '.param-control[data-param-name="Line_1"] input'
    )
    await expect(line1Input).toHaveValue(
      '\u2813\u2811\u2807\u2807\u2815\u2815',
      { timeout: 10000 }
    )
    const warnings = page.locator('#brailleWarnings')
    await expect(warnings).toContainText('exactly as written')

    // Back-translate the edited braille into the text box
    await page.locator('#brailleFieldToText').click()
    await expect(page.locator('#brailleTextInput')).toHaveValue('helloo', {
      timeout: 20000,
    })
  })

  test('braille editor rejects non-braille characters with an error', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    await page.locator('#brailleFieldEditor summary').click()
    await page.locator('#brailleFieldInput').fill('\u2813hello')

    const errors = page.locator('#brailleErrors')
    await expect(errors).toBeVisible({ timeout: 20000 })
    await expect(errors).toContainText('not a braille character')
  })

  test('braille panel has no axe violations (normal + warning + error states)', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)
    await page.locator('#brailleTextInput').fill('hello world')
    await expect(page.locator('#braillePreview')).toContainText(
      '\u2813\u2811\u2807\u2807\u2815',
      { timeout: 20000 }
    )
    await expectPanelAxeClean(page)

    // Braille editor open with content (verbatim mode + status live region)
    await page.locator('#brailleFieldEditor summary').click()
    await page.locator('#brailleFieldInput').fill('\u2813\u2811')
    await expect(page.locator('#brailleWarnings')).toBeVisible({
      timeout: 20000,
    })
    await expectPanelAxeClean(page)
    await page.locator('#brailleFieldInput').fill('')

    // Warning tier visible (caps dropped)
    await page.locator('#brailleCapsToggle').uncheck()
    await page.locator('#brailleTextInput').fill('Hello there')
    await expect(page.locator('#brailleWarnings')).toBeVisible({
      timeout: 20000,
    })
    await expectPanelAxeClean(page)

    // Error tier + multi-card notice visible
    await page.locator('#brailleSizePreset').selectOption('business')
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`)
    await page.locator('#brailleTextInput').fill(lines.join('\n'))
    await expect(page.locator('#brailleMultiCardNotice')).toBeVisible({
      timeout: 20000,
    })
    await expectPanelAxeClean(page)
  })
})

test.describe('Braille Charm workflow', () => {
  test('charm panel translates a single character into braille_chars', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-charm')

    // Charm mode: single-line input, no size presets; the pager exists
    // but stays hidden while there is only one charm
    await expect(page.locator('#brailleTextInput')).toBeVisible()
    await expect(page.locator('#brailleSizePreset')).toHaveCount(0)
    await expect(page.locator('#brailleCardPager')).toBeHidden()

    await page.locator('#brailleTextInput').fill('h')

    const preview = page.locator('#braillePreview')
    await expect(preview).toContainText('\u2813', { timeout: 20000 }) // ⠓
    await expect(preview.locator('.braille-preview-source')).toContainText('h')

    const charInput = page.locator(
      '.param-control[data-param-name="braille_chars"] input'
    )
    await expect(charInput).toHaveValue('\u2813', { timeout: 10000 })

    // Single charm stays in Single layout with no notice
    await expect(page.locator('#brailleMultiCardNotice')).toBeHidden()
  })

  test('multi-character input makes one charm per character (generate all on by default)', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-charm')

    await page.locator('#brailleTextInput').fill('hi')

    // Notice reports one charm per character; the generate-all toggle is
    // checked by default so the pager stays hidden
    const notice = page.locator('#brailleMultiCardNotice')
    await expect(notice).toBeVisible({ timeout: 20000 })
    await expect(notice).toContainText('2 charms')
    await expect(page.locator('#brailleRenderAll')).toBeChecked()
    await expect(page.locator('#brailleCardPager')).toBeHidden()

    // Each character's braille lands in its own Charm_N slot, the layout
    // switches to All charms, and braille_chars mirrors the first charm
    const layoutSelect = page.locator(
      '.param-control[data-param-name="charm_layout"] select'
    )
    await expect(layoutSelect).toHaveValue('All charms', { timeout: 10000 })
    await expect(
      page.locator('.param-control[data-param-name="Charm_1"] input')
    ).toHaveValue('\u2813', { timeout: 10000 }) // ⠓
    await expect(
      page.locator('.param-control[data-param-name="Charm_2"] input')
    ).toHaveValue('\u280A', { timeout: 10000 }) // ⠊
    await expect(
      page.locator('.param-control[data-param-name="braille_chars"] input')
    ).toHaveValue('\u2813')
  })

  test('turning generate-all off pages through charms one at a time', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-charm')

    await page.locator('#brailleTextInput').fill('hi')

    const renderAll = page.locator('#brailleRenderAll')
    await expect(renderAll).toBeVisible({ timeout: 20000 })
    await renderAll.uncheck()

    // Pager appears, layout drops back to Single, braille_chars carries
    // the charm being shown
    const pager = page.locator('#brailleCardPager')
    await expect(pager).toBeVisible()
    await expect(page.locator('#braillePagerStatus')).toHaveText(
      'Charm 1 of 2 — h'
    )
    const layoutSelect = page.locator(
      '.param-control[data-param-name="charm_layout"] select'
    )
    await expect(layoutSelect).toHaveValue('Single', { timeout: 10000 })
    const charInput = page.locator(
      '.param-control[data-param-name="braille_chars"] input'
    )
    await expect(charInput).toHaveValue('\u2813', { timeout: 10000 }) // ⠓

    // Pager is keyboard-operable: prev disabled on the first charm
    await expect(page.locator('#braillePrevCard')).toBeDisabled()
    await page.locator('#brailleNextCard').click()
    await expect(page.locator('#braillePagerStatus')).toHaveText(
      'Charm 2 of 2 — i'
    )
    await expect(charInput).toHaveValue('\u280A', { timeout: 10000 }) // ⠊
    await expect(page.locator('#brailleNextCard')).toBeDisabled()
  })

  test('charm panel has no axe violations', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-charm')
    await page.locator('#brailleTextInput').fill('abc')
    await expect(page.locator('#brailleMultiCardNotice')).toBeVisible({
      timeout: 20000,
    })
    await expectPanelAxeClean(page)
  })
})

test.describe('Braille Sign workflow', () => {
  test('the letter height setting is the height of the capital I (ADA 703.2.5)', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI')
    test.setTimeout(300_000)

    await openBrailleExample(page, 'braille-sign')
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: 120_000,
    })
    await page.locator('#brailleTextInput').fill('I')
    await expect(
      page.locator('.param-control[data-param-name="sign_text_1"] input')
    ).toHaveValue('I', { timeout: 20000 })
    await setParam(page, 'sign_part', 'Letter plate')
    await setParam(page, 'add_border', false)
    const charHeight = Number(
      await page
        .locator('.param-control[data-param-name="char_height_mm"] input[type="number"]')
        .first()
        .inputValue()
    )

    // The letter's top face is the highest level of the plate; its extent
    // across the plate is the capital I's height
    const { triangles, count } = await downloadStl(page)
    let top = -Infinity
    for (let i = 2; i < count * 9; i += 3) top = Math.max(top, triangles[i])
    let minY = Infinity
    let maxY = -Infinity
    for (let i = 0; i < count * 9; i += 3) {
      if (Math.abs(triangles[i + 2] - top) < 1e-4) {
        minY = Math.min(minY, triangles[i + 1])
        maxY = Math.max(maxY, triangles[i + 1])
      }
    }
    const height = maxY - minY
    expect(
      Math.abs(height - charHeight),
      `capital I ${height.toFixed(4)} mm at the setting ${charHeight}`
    ).toBeLessThanOrEqual(0.05)
  })

  test('sign panel writes raised-text and braille params', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')

    // Grade 2 is the sign default (ADA recommendation)
    const selectedTable = await page.locator('#brailleTableSelect').inputValue()
    expect(selectedTable).toBe('en-ueb-g2.ctb')

    await page.locator('#brailleTextInput').fill('Exit\nLevel 2')

    const preview = page.locator('#braillePreview')
    await expect(preview.locator('.braille-preview-source').first()).toContainText(
      'Exit',
      { timeout: 20000 }
    )

    // Latin text lands in sign_text_N, braille in Line_N
    const text1 = page.locator(
      '.param-control[data-param-name="sign_text_1"] input'
    )
    await expect(text1).toHaveValue('Exit', { timeout: 10000 })
    const text2 = page.locator(
      '.param-control[data-param-name="sign_text_2"] input'
    )
    await expect(text2).toHaveValue('Level 2', { timeout: 10000 })

    const line1 = page.locator('.param-control[data-param-name="Line_1"] input')
    await expect(line1).not.toHaveValue('', { timeout: 10000 })
    const line2 = page.locator('.param-control[data-param-name="Line_2"] input')
    await expect(line2).not.toHaveValue('', { timeout: 10000 })
  })

  test('sign warns when more lines are entered than the sign holds', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')

    await page
      .locator('#brailleTextInput')
      .fill('one\ntwo\nthree\nfour\nfive\nsix\nseven')

    const errors = page.locator('#brailleErrors')
    await expect(errors).toBeVisible({ timeout: 20000 })
    await expect(errors).toContainText('holds 6 lines')
  })

  test('sign wraps a long line onto additional rows', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')

    await page
      .locator('#brailleTextInput')
      .fill('WATAP Washington Assistive Technology Act Program')

    // The single input line wraps onto multiple rows instead of
    // overflowing the sign width.
    const previewLines = page.locator('#braillePreview .braille-preview-line')
    await expect
      .poll(async () => previewLines.count(), { timeout: 20000 })
      .toBeGreaterThan(1)

    // Wrapped rows land in the raised-text params.
    const text2 = page.locator(
      '.param-control[data-param-name="sign_text_2"] input'
    )
    await expect(text2).not.toHaveValue('', { timeout: 10000 })

    // Braille rows pack independently of the letter rows (ADA 703.3.2):
    // braille cells are far narrower than 16 mm raised letters, so the
    // braille reflows into fewer, fuller rows.
    let textRowCount = 0
    for (let i = 1; i <= 6; i++) {
      const value = await page
        .locator(`.param-control[data-param-name="sign_text_${i}"] input`)
        .inputValue()
      if (value !== '') textRowCount++
    }
    expect(await previewLines.count()).toBeLessThan(textRowCount)

    // The row summary reports both counts.
    await expect(page.locator('#brailleSignRowSummary')).toContainText(
      'Raised letters'
    )
  })

  test('sign braille carries no capital signs until the switch is turned on', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')
    const caps = page.locator('#brailleCapsToggle')
    await expect(caps).not.toBeChecked()
    const first = page.locator('#braillePreview .braille-preview-braille').first()
    // The first layout of the default "Room 101": no capital sign
    await expect(first).toHaveText(
      '\u2817\u2815\u2815\u280D\u2800\u283C\u2801\u281A\u2801',
      { timeout: 20000 }
    )
    await page.locator('#brailleTextInput').fill('ROOM 101')
    await expect(first).toHaveText(
      '\u2817\u2815\u2815\u280D\u2800\u283C\u2801\u281A\u2801',
      { timeout: 20000 }
    )
    await expect(page.locator('#brailleWarnings')).toBeHidden()
    await caps.check()
    await expect(first).toHaveText(
      '\u2820\u2820\u2817\u2815\u2815\u280D\u2800\u283C\u2801\u281A\u2801',
      { timeout: 20000 }
    )
  })

  test('sign translates a word that mixes letters and a number, with no engine error', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')
    const caps = page.locator('#brailleCapsToggle')
    if (!(await caps.isChecked())) await caps.check()

    await page.locator('#brailleTextInput').fill('Tee3D')
    // Capital T, e, e, number sign, 3, capital D
    await expect(
      page.locator('#braillePreview .braille-preview-braille').first()
    ).toHaveText('\u2820\u281E\u2811\u2811\u283C\u2809\u2820\u2819', {
      timeout: 20000,
    })
    await expect(page.locator('#brailleErrors')).toBeHidden()
  })

  test('sign leaves out a character its table does not define, and says so', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')
    const caps = page.locator('#brailleCapsToggle')
    if (!(await caps.isChecked())) await caps.check()

    await page.locator('#brailleTextInput').fill('ROOM \u2603 101')
    // Capital word ROOM, one blank cell, number 101: the snowman is left
    // out, with no escape cells and none with dot 7
    await expect(
      page.locator('#braillePreview .braille-preview-braille').first()
    ).toHaveText(
      '\u2820\u2820\u2817\u2815\u2815\u280D\u2800\u283C\u2801\u281A\u2801',
      { timeout: 20000 }
    )
    await expect(page.locator('#brailleWarnings')).toContainText(
      'Some characters could not be translated to braille (in: "\u2603"). They are left out of the braille.'
    )
  })

  test('sign translates a run of capital words as one passage', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')
    const caps = page.locator('#brailleCapsToggle')
    if (!(await caps.isChecked())) await caps.check()

    await page.locator('#brailleTextInput').fill('ROOM ROOM ROOM ROOM')
    // One capital passage indicator, the four words, one terminator
    const passage =
      '\u2820\u2820\u2820\u2817\u2815\u2815\u280D\u2800\u2817\u2815\u2815\u280D\u2800' +
      '\u2817\u2815\u2815\u280D\u2800\u2817\u2815\u2815\u280D\u2820\u2804'
    const rows = page.locator('#braillePreview .braille-preview-braille')
    await expect
      .poll(async () => (await rows.allTextContents()).join('\u2800'), {
        timeout: 20000,
      })
      .toBe(passage)
    const lineParams = page.locator(
      '.param-control[data-param-name^="Line_"] input'
    )
    await expect
      .poll(
        async () =>
          (await lineParams.evaluateAll((inputs) => inputs.map((i) => i.value)))
            .filter((value) => value !== '')
            .join('\u2800'),
        { timeout: 10000 }
      )
      .toBe(passage)
  })

  test('sign warns about an emoji typed on its own', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')
    await page.locator('#brailleTextInput').fill('\u{1F600}')
    await expect(page.locator('#brailleWarnings')).toContainText(
      'They are left out of the braille.',
      { timeout: 20000 }
    )
  })

  test('braille editor reads one contracted cell back as its whole word', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')
    await page.locator('#brailleFieldEditor summary').click()
    await page.locator('#brailleFieldInput').fill('\u2805')
    await page.locator('#brailleFieldToText').click()
    await expect(page.locator('#brailleTextInput')).toHaveValue('knowledge', {
      timeout: 20000,
    })
  })

  test('"Translate to text" moves the raised letters to the new text', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')
    await page.locator('#brailleTextInput').fill('See3D')
    const text1 = page.locator(
      '.param-control[data-param-name="sign_text_1"] input'
    )
    await expect(text1).toHaveValue('See3D', { timeout: 20000 })

    await page.locator('#brailleFieldEditor summary').click()
    // One cell, read back in Grade 2 as the word "go"
    await page.locator('#brailleFieldInput').fill('\u281B')
    const line1 = page.locator('.param-control[data-param-name="Line_1"] input')
    // Let the editor's own layout finish first, so nothing pending can
    // carry the new text to the raised letters
    await expect(line1).toHaveValue('\u281B', { timeout: 10000 })
    await page.locator('#brailleFieldToText').click()
    await expect(page.locator('#brailleTextInput')).toHaveValue('go', {
      timeout: 20000,
    })
    await expect(text1).toHaveValue('go', { timeout: 10000 })
    await expect(line1).toHaveValue('\u281B')
  })

  test('sign gives a phone number three number signs with hyphens and one with periods', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')
    const first = page.locator('#braillePreview .braille-preview-braille').first()
    // A hyphen ends a number, so each group needs its own number sign
    await page.locator('#brailleTextInput').fill('206-555-0147')
    await expect(first).toHaveText(
      '\u283C\u2803\u281A\u280B\u2824\u283C\u2811\u2811\u2811\u2824\u283C\u281A\u2801\u2819\u281B',
      { timeout: 20000 }
    )
    // A period inside a number keeps it going: one number sign
    await page.locator('#brailleTextInput').fill('206.555.0147')
    await expect(first).toHaveText(
      '\u283C\u2803\u281A\u280B\u2832\u2811\u2811\u2811\u2832\u281A\u2801\u2819\u281B',
      { timeout: 20000 }
    )
    await expect(page.locator('#brailleErrors')).toBeHidden()
  })

  test('the table list offers Unified English Braille only', async ({ page }) => {
    await openBrailleExample(page, 'braille-sign')
    const options = page.locator('#brailleTableSelect option')
    await expect(options).toHaveCount(2, { timeout: 20000 })
    expect(await options.evaluateAll((os) => os.map((o) => o.value))).toEqual([
      'en-ueb-g1.ctb',
      'en-ueb-g2.ctb',
    ])
    expect(
      await options.evaluateAll((os) => os.map((o) => o.textContent))
    ).toEqual([
      'English (UEB) Grade 1, uncontracted',
      'English (UEB) Grade 2, contracted',
    ])
  })

  test('sign panel has no axe violations', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')
    await page.locator('#brailleTextInput').fill('Room 101')
    await expect(
      page.locator('#braillePreview .braille-preview-source').first()
    ).toContainText('Room 101', { timeout: 20000 })
    await expectPanelAxeClean(page)
  })
})
