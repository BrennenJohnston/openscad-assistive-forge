/**
 * E2E tests for the Braille Card Customizer
 *
 * Covers: welcome-screen card, deep-link loading, client-side liblouis
 * translation (type text -> braille preview -> Line_N params), overflow
 * card pager, and an axe accessibility scan of the panel.
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

/** Load the example via deep-link and wait for the braille panel. */
async function openBrailleCard(page) {
  await page.goto('/?example=braille-wedge-card')
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('#braillePanel')).toBeVisible({ timeout: 15000 })
}

test.describe('Braille Card assets', () => {
  test('example scad and manifest exist', async ({ page }) => {
    const scadResponse = await page.request.get(
      '/examples/braille-wedge-card/braille_wedge_card.scad'
    )
    expect(scadResponse.ok()).toBe(true)

    const manifestResponse = await page.request.get(
      '/examples/braille-wedge-card/manifest.json'
    )
    expect(manifestResponse.ok()).toBe(true)
    const manifest = await manifestResponse.json()
    expect(manifest.brailleTranslation).toBeDefined()
  })

  test('liblouis engine and tables are served', async ({ page }) => {
    for (const url of [
      '/liblouis/build-no-tables-utf16.js',
      '/liblouis/easy-api.js',
      '/liblouis/tables.json',
      '/liblouis/tables/unicode.dis',
      '/liblouis/tables/en-ueb-g1.ctb',
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
})

test.describe('Braille translation workflow', () => {
  test('deep-link loads example with translation panel above parameters', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    // Panel controls all present
    await expect(page.locator('#brailleTextInput')).toBeVisible()
    await expect(page.locator('#brailleTableSelect')).toBeVisible()
    await expect(page.locator('#brailleCapsToggle')).toBeAttached()

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

    // Preview shows the translated braille (single line: 5+1+5 = 11 cells
    // exceeds the default 10-cell capacity, so it wraps to two lines)
    const preview = page.locator('#braillePreview')
    await expect(preview).toContainText('\u2813\u2811\u2807\u2807\u2815', {
      timeout: 20000,
    }) // ⠓⠑⠇⠇⠕
    await expect(preview).toContainText('\u283A\u2815\u2817\u2807\u2819') // ⠺⠕⠗⠇⠙

    // The braille flows into the SCAD Line_1 parameter input
    const line1Input = page.locator(
      '.param-control[data-param-name="Line_1"] input'
    )
    await expect(line1Input).toHaveValue('\u2813\u2811\u2807\u2807\u2815', {
      timeout: 10000,
    })
  })

  test('long text splits into multiple cards with a pager', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    // 8 hard lines with default max 5 rows/card -> 2 cards
    const lines = Array.from({ length: 8 }, (_, i) => `line ${i + 1}`)
    await page.locator('#brailleTextInput').fill(lines.join('\n'))

    const pager = page.locator('#brailleCardPager')
    await expect(pager).toBeVisible({ timeout: 20000 })
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

  test('capital letters warning appears when preserve-caps is off', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    await page.locator('#brailleTextInput').fill('Hello')

    const warnings = page.locator('#brailleWarnings')
    await expect(warnings).toBeVisible({ timeout: 20000 })
    await expect(warnings).toContainText('lowercase')
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

  test('braille panel screen has no axe violations', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)
    await page.locator('#brailleTextInput').fill('hello world')
    await expect(page.locator('#braillePreview')).toContainText(
      '\u2813\u2811\u2807\u2807\u2815',
      { timeout: 20000 }
    )

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
  })
})
