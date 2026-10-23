import { test, expect } from '@playwright/test'
import { attachInvariants, expectNoNativeDialog } from './helpers/invariants.js'

// The two questions the app can ask while it starts: presets left by an
// older version, and the engine download on a slow or metered connection.
// Both are the app's own dialogs; no browser dialog opens. The presets
// question opens on Migrate, because Skip ends the offer for good; the
// download question opens on Not now, because it asks again later.

const LEGACY_PRESETS_KEY = 'openscad-customizer-presets'
const STORAGE_PREFS_KEY = 'openscad-forge-storage-prefs'

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
  attachInvariants(page)
  await page.goto('/')

  const offer = question(page, 'Presets From an Earlier Version')
  await expect(offer).toBeVisible({ timeout: 30_000 })
  await expect(offer).toContainText('Found 1 preset(s) from a previous version.')
  await expect(offer.getByRole('button', { name: 'Migrate', exact: true })).toBeFocused()
  await offer.getByRole('button', { name: 'Migrate', exact: true }).click()
  await expect(offer).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('openscad-forge-presets-v2') || ''))
    .toContain('Old Preset')
  expectNoNativeDialog(page)
})

test('a metered connection is asked before the engine downloads, in the app’s own dialog', async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
    localStorage.setItem(key, JSON.stringify({ allowLargeDownloads: false }))
  }, STORAGE_PREFS_KEY)
  attachInvariants(page)
  const engineRequests = []
  page.on('request', (request) => {
    if (/openscad\.wasm(\?|$)/.test(request.url())) engineRequests.push(request.url())
  })
  await page.goto('/')

  const ask = question(page, 'Download the engine?')
  await expect(ask).toBeVisible({ timeout: 30_000 })
  await expect(ask).toContainText('about 15 MB')
  await expect(ask.getByRole('button', { name: 'Not now', exact: true })).toBeFocused()
  await ask.getByRole('button', { name: 'Not now', exact: true }).click()
  await expect(ask).toHaveCount(0)
  await expect(page.locator('#welcomeScreen')).toBeVisible()
  await page.waitForTimeout(3_000)
  expect(engineRequests, 'Not now must not start the engine download').toEqual([])
  await expect(page.locator('body')).not.toHaveAttribute('data-wasm-ready', 'true')
  expectNoNativeDialog(page)
})

// Android Chrome reports a phone's data connection as cellular, so the
// question above would be asked on every visit and by every need of the
// engine while it starts. The seed below is that connection.
const cellular = (page) =>
  page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
    const connection = {
      type: 'cellular',
      effectiveType: '4g',
      saveData: false,
      addEventListener() {},
      removeEventListener() {},
    }
    Object.defineProperty(navigator, 'connection', {
      get: () => connection,
      configurable: true,
    })
    window.__engineQuestions = 0
    document.addEventListener('DOMContentLoaded', () => {
      new MutationObserver(() => {
        for (const h of document.querySelectorAll('[role="alertdialog"] h2, [role="alertdialog"] h3')) {
          if (h.textContent.trim() === 'Download the engine?' && !h.__counted) {
            h.__counted = true
            window.__engineQuestions += 1
          }
        }
      }).observe(document.body, { childList: true, subtree: true })
    })
  })

test('a Download given on a cellular connection is remembered: the next visit asks nothing', async ({
  page,
}) => {
  test.setTimeout(240_000)
  await cellular(page)
  attachInvariants(page)
  await page.goto('/')

  const ask = question(page, 'Download the engine?')
  await expect(ask).toBeVisible({ timeout: 30_000 })
  await ask.getByRole('button', { name: 'Download', exact: true }).click()
  await expect(page.locator('body')).toHaveAttribute('data-wasm-ready', 'true', {
    timeout: 180_000,
  })
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('openscad-forge-storage-prefs') || '{}'))
  ).toMatchObject({ engineDownloadAccepted: true })

  await page.reload()
  await expect(page.locator('body')).toHaveAttribute('data-wasm-ready', 'true', {
    timeout: 180_000,
  })
  await expect(ask).toHaveCount(0)
  expect(await page.evaluate(() => window.__engineQuestions)).toBe(0)
  expectNoNativeDialog(page)
})
