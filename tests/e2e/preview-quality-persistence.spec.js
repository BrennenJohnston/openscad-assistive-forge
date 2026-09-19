import { test, expect } from '@playwright/test'

// Preview quality default + persistence (Q1/Q2).
//
// The default must be the desktop-fidelity tier ('fidelity' — honors the
// model's own $fn/$fa/$fs like desktop OpenSCAD F5); the user's selection
// must survive a reload via STORAGE_KEY_PREVIEW_QUALITY; and clearing the
// key must return to the default. Runs locally; CI-skipped like the other
// WASM-adjacent specs (the select exists pre-WASM, but keep parity with
// sibling suites).

const isCI = !!process.env.CI

const QUALITY_KEY = 'openscad-forge-preview-quality-mode'
const WASM_READY_TIMEOUT = 180_000

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

// The quality wiring (restore + change listener) lives in initApp after the
// WASM await, so interactions must wait for the ready flag.
async function gotoReady(page) {
  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  })
}

test.describe('preview quality persistence', () => {
  test('defaults to Desktop quality (fidelity)', async ({ page }) => {
    test.skip(isCI, 'covered locally; CI runs the wasm-smoke floor')
    await gotoReady(page)
    await expect(page.locator('#previewQualitySelect')).toHaveValue('fidelity')
  })

  test('selection persists across reload and clearing the key restores the default', async ({
    page,
  }) => {
    test.skip(isCI, 'covered locally; CI runs the wasm-smoke floor')
    await gotoReady(page)

    const select = page.locator('#previewQualitySelect')
    await expect(select).toHaveValue('fidelity')

    // The select lives inside the collapsed preview-settings drawer, so drive
    // the change programmatically — same change-listener path as a user pick.
    await select.evaluate((el) => {
      el.value = 'fast'
      el.dispatchEvent(new Event('change'))
    })
    await expect
      .poll(async () => page.evaluate((k) => localStorage.getItem(k), QUALITY_KEY))
      .toBe('fast')

    await page.reload()
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    })
    await expect(select).toHaveValue('fast')

    await page.evaluate((k) => localStorage.removeItem(k), QUALITY_KEY)
    await page.reload()
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    })
    await expect(select).toHaveValue('fidelity')
  })

  test('an invalid stored value falls back to the default', async ({ page }) => {
    test.skip(isCI, 'covered locally; CI runs the wasm-smoke floor')
    await page.addInitScript((k) => {
      localStorage.setItem(k, 'not-a-real-mode')
    }, QUALITY_KEY)
    await gotoReady(page)
    await expect(page.locator('#previewQualitySelect')).toHaveValue('fidelity')
  })
})
