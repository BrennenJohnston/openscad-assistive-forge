/**
 * E2E tests for the shared parameter link (IR-1).
 *
 * The app writes the user's non-default parameter values into the URL fragment
 * as `#v=1&params=<json>`. These tests pin the whole round trip: a link's values
 * reach the controls, out-of-range and unknown values are refused loudly, and a
 * fragment the app did not write survives everything the app does to the URL.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'

const payload = (params) =>
  `#v=1&params=${encodeURIComponent(JSON.stringify(params))}`

// Records every announcement so an assertion never has to win a race against
// the next status line. The status area is overwritten within a second by the
// render pipeline; the history is what proves the message was delivered.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
    window.__announcements = []
    document.addEventListener('DOMContentLoaded', () => {
      const announcer = document.getElementById('srAnnouncer')
      if (!announcer) return
      new MutationObserver(() => {
        const text = announcer.textContent.trim()
        if (text) window.__announcements.push(text)
      }).observe(announcer, {
        childList: true,
        characterData: true,
        subtree: true,
      })
    })
  })
})

async function openSimpleBox(page, fragment = '') {
  await page.goto(`/?example=simple-box${fragment}`)
  await page
    .locator('.param-control')
    .first()
    .waitFor({ state: 'attached', timeout: 40000 })
  const notNow = page.locator('#saveProjectNotNow')
  try {
    await notNow.waitFor({ state: 'visible', timeout: 2000 })
    await notNow.click()
    await notNow.waitFor({ state: 'hidden', timeout: 3000 })
  } catch {
    // This example does not raise the save prompt on every run
  }
  const expandAll = page.locator('#expandAllGroupsBtn')
  if (await expandAll.isVisible().catch(() => false)) {
    await expandAll.click()
  }
}

const ADJUSTED = 'Some URL parameters were adjusted to fit allowed ranges.'

async function announcements(page) {
  return page.evaluate(() => window.__announcements || [])
}

test.describe('Shared parameter links', () => {
  test('restores a shared value into the control', async ({ page }) => {
    await openSimpleBox(page, payload({ width: 77 }))

    await expect(page.locator('#param-width')).toHaveValue('77')
    await expect(page.locator('#param-width-spinbox')).toHaveValue('77')
  })

  test('leaves parameters the link does not mention at their defaults', async ({
    page,
  }) => {
    await openSimpleBox(page, payload({ width: 77 }))

    await expect(page.locator('#param-width')).toHaveValue('77')
    await expect(page.locator('#param-depth')).toHaveValue('40')
    await expect(page.locator('#param-height')).toHaveValue('30')
  })

  test('clamps an out-of-range value and says that it did', async ({ page }) => {
    // simple_box.scad declares width = 50; // [10:100]
    await openSimpleBox(page, payload({ width: 999 }))

    await expect(page.locator('#param-width')).toHaveValue('100')
    await expect
      .poll(async () => (await announcements(page)).includes(ADJUSTED), {
        timeout: 15000,
      })
      .toBe(true)
  })

  test('drops a parameter the model does not have, and says that it did', async ({
    page,
  }) => {
    await openSimpleBox(page, payload({ not_a_real_parameter: 5 }))

    await expect
      .poll(async () => (await announcements(page)).includes(ADJUSTED), {
        timeout: 15000,
      })
      .toBe(true)
    await expect
      .poll(async () => page.evaluate(() => window.location.hash), {
        timeout: 15000,
      })
      .not.toContain('not_a_real_parameter')
  })

  test('keeps a fragment key it did not write', async ({ page }) => {
    // The deep-link cleanup used to compose the post-load URL from the path and
    // query alone, and the writer used to replace the whole fragment.
    await openSimpleBox(page, '#big=keep-me-please')

    await expect
      .poll(async () => page.evaluate(() => window.location.hash), {
        timeout: 15000,
      })
      .toContain('big=keep-me-please')

    await page.waitForTimeout(2000)
    expect(await page.evaluate(() => window.location.hash)).toContain(
      'big=keep-me-please'
    )
  })

  test('writes a changed value into the fragment without evicting a foreign key', async ({
    page,
  }) => {
    await openSimpleBox(page, '#big=keep-me-please')

    const spinbox = page.locator('#param-width-spinbox')
    await expect(spinbox).toBeVisible({ timeout: 15000 })
    await spinbox.fill('66')
    await spinbox.dispatchEvent('change')

    await expect
      .poll(async () => page.evaluate(() => window.location.hash), {
        timeout: 15000,
      })
      .toContain(encodeURIComponent('"width":66'))
    expect(await page.evaluate(() => window.location.hash)).toContain(
      'big=keep-me-please'
    )
  })

  test('a link written by the app reloads into the same values', async ({
    page,
  }) => {
    await openSimpleBox(page)

    const spinbox = page.locator('#param-width-spinbox')
    await expect(spinbox).toBeVisible({ timeout: 15000 })
    await spinbox.fill('88')
    await spinbox.dispatchEvent('change')

    await expect
      .poll(async () => page.evaluate(() => window.location.hash), {
        timeout: 15000,
      })
      .toContain('params=')
    const shared = await page.evaluate(() => window.location.hash)

    await openSimpleBox(page, shared)
    await expect(page.locator('#param-width')).toHaveValue('88')
  })
})
