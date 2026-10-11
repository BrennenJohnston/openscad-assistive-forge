import { test, expect } from '@playwright/test'

// The two questions the app can ask while it starts: presets left by an
// older version, and the engine download on a slow or metered connection.
// Both are the app's own dialogs; no browser dialog opens.

const LEGACY_PRESETS_KEY = 'openscad-customizer-presets'
const STORAGE_PREFS_KEY = 'openscad-forge-storage-prefs'

/** Every browser dialog that opens, dismissed and kept for the assertion. */
function recordNativeDialogs(page) {
  const opened = []
  page.on('dialog', async (dialog) => {
    opened.push(`${dialog.type()}: ${dialog.message()}`)
    await dialog.dismiss()
  })
  return opened
}

function question(page, title) {
  return page
    .locator('[role="alertdialog"]')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
}

test('presets from an earlier version are offered in the app’s own dialog', async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
    if (!sessionStorage.getItem('legacy-seeded')) {
      localStorage.setItem(
        key,
        JSON.stringify({
          'box.scad': [{ id: 'p1', name: 'Old Preset', parameters: { width: 20 }, created: 1, modified: 1 }],
        })
      )
      sessionStorage.setItem('legacy-seeded', '1')
    }
  }, LEGACY_PRESETS_KEY)
  const natives = recordNativeDialogs(page)
  await page.goto('/')

  const offer = question(page, 'Presets From an Earlier Version')
  await expect(offer).toBeVisible({ timeout: 30_000 })
  await expect(offer).toContainText('Found 1 preset(s) from a previous version.')
  await offer.getByRole('button', { name: 'Migrate', exact: true }).click()
  await expect(offer).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('openscad-forge-presets-v2') || ''))
    .toContain('Old Preset')
  expect(natives).toEqual([])
})

test('a metered connection is asked before the engine downloads, in the app’s own dialog', async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
    localStorage.setItem(key, JSON.stringify({ allowLargeDownloads: false }))
  }, STORAGE_PREFS_KEY)
  const natives = recordNativeDialogs(page)
  const engineRequests = []
  page.on('request', (request) => {
    if (/openscad\.wasm(\?|$)/.test(request.url())) engineRequests.push(request.url())
  })
  await page.goto('/')

  const ask = question(page, 'Download the engine?')
  await expect(ask).toBeVisible({ timeout: 30_000 })
  await expect(ask).toContainText('about 15 MB')
  await ask.getByRole('button', { name: 'Not now', exact: true }).click()
  await expect(ask).toHaveCount(0)
  await expect(page.locator('#welcomeScreen')).toBeVisible()
  await page.waitForTimeout(3_000)
  expect(engineRequests, 'Not now must not start the engine download').toEqual([])
  await expect(page.locator('body')).not.toHaveAttribute('data-wasm-ready', 'true')
  expect(natives).toEqual([])
})
