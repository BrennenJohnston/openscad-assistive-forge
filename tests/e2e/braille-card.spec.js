/**
 * E2E tests for the Braille Card Customizer toolset (card, charm, sign)
 *
 * Covers: welcome-screen card + variant dropdown, deep-link loading,
 * client-side liblouis translation (type text -> braille preview ->
 * Line_N params), card size presets, severity-tiered errors/warnings,
 * multi-card notice + pager + render-all mode, charm cell-budget warning,
 * sign paired text/braille params, and axe accessibility scans of the
 * panel in all three modes.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Skip WASM-dependent tests in CI - WASM initialization is slow/unreliable
const isCI = !!process.env.CI

// Dismiss first-visit modal so it doesn't block UI interactions
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
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
    for (const url of [
      '/liblouis/build-no-tables-utf16.js',
      '/liblouis/easy-api.js',
      '/liblouis/tables.json',
      '/liblouis/tables/unicode.dis',
      '/liblouis/tables/en-ueb-g1.ctb',
      '/liblouis/tables/en-ueb-g2.ctb',
    ]) {
      const response = await page.request.get(url)
      expect(response.ok(), url).toBe(true)
    }
  })
})

test.describe('Welcome screen', () => {
  test('has Braille Card Customizer card with accessible button', async ({ page }) => {
    await page.goto('/')

    const openBtn = page.locator('#openBrailleCardBtn')
    await expect(openBtn).toBeVisible()
    expect(await openBtn.getAttribute('data-example')).toBe('braille-wedge-card')

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

    // Table catalog populated with the UEB default
    const selectedTable = await page.locator('#brailleTableSelect').inputValue()
    expect(selectedTable).toBe('en-ueb-g1.ctb')
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
    await expect(preview).toContainText('\u283A\u2815\u2817\u2807\u2819') // ⠺⠕⠗⠇⠙

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
      '\u2813\u2811\u2807\u2807\u2815\u2800\u283A\u2815\u2817\u2807\u2819',
      { timeout: 10000 }
    )
  })

  test('card size preset writes dimensions and turns auto-size off', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    await page.locator('#brailleSizePreset').selectOption('business')

    const widthInput = page.locator(
      '.param-control[data-param-name="card_face_width_mm"] input[type="number"]'
    )
    await expect(widthInput.first()).toHaveValue('89', { timeout: 10000 })
    const heightInput = page.locator(
      '.param-control[data-param-name="card_face_height_mm"] input[type="number"]'
    )
    await expect(heightInput.first()).toHaveValue('51', { timeout: 10000 })
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
    await expect(page.locator('#braillePagerHint')).toContainText(
      'braille-card-1-of-2.stl'
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
      'braille-cards-all.stl'
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

  test('braille panel has no axe violations (normal + warning + error states)', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)
    await page.locator('#brailleTextInput').fill('hello world')
    await expect(page.locator('#braillePreview')).toContainText(
      '\u2813\u2811\u2807\u2807\u2815',
      { timeout: 20000 }
    )
    await expectPanelAxeClean(page)

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
  test('charm panel translates a short text into braille_chars', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-charm')

    // Charm mode: single-line input, no wrap/preset/pager controls
    await expect(page.locator('#brailleTextInput')).toBeVisible()
    await expect(page.locator('#brailleSizePreset')).toHaveCount(0)
    await expect(page.locator('#brailleCardPager')).toHaveCount(0)

    await page.locator('#brailleTextInput').fill('hi')

    const preview = page.locator('#braillePreview')
    await expect(preview).toContainText('\u2813\u280A', { timeout: 20000 }) // ⠓⠊
    await expect(preview.locator('.braille-preview-source')).toContainText('hi')

    const charInput = page.locator(
      '.param-control[data-param-name="braille_chars"] input'
    )
    await expect(charInput).toHaveValue('\u2813\u280A', { timeout: 10000 })
  })

  test('charm warns when translation exceeds 2 cells', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-charm')

    await page.locator('#brailleTextInput').fill('abc')

    const errors = page.locator('#brailleErrors')
    await expect(errors).toBeVisible({ timeout: 20000 })
    await expect(errors).toContainText('3 braille cells')
    await expect(errors).toContainText('fits 2')
  })

  test('charm panel has no axe violations', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-charm')
    await page.locator('#brailleTextInput').fill('abc')
    await expect(page.locator('#brailleErrors')).toBeVisible({ timeout: 20000 })
    await expectPanelAxeClean(page)
  })
})

test.describe('Braille Sign workflow', () => {
  test('sign panel writes paired raised-text and braille params', async ({ page }) => {
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

  test('sign warns when more than 3 lines are entered', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')

    await page.locator('#brailleTextInput').fill('one\ntwo\nthree\nfour')

    const errors = page.locator('#brailleErrors')
    await expect(errors).toBeVisible({ timeout: 20000 })
    await expect(errors).toContainText('holds 3 lines')
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
