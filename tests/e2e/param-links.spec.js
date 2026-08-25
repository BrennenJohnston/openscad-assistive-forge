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
    // IR-13 replaced the one-line status this used to assert with a notice
    // that stays until dismissed (IR-Q16). The old sentence said only that
    // SOMETHING had been adjusted; this names the parameter and the number.
    await expect
      .poll(
        async () =>
          (await announcements(page)).some((line) =>
            line.includes('width was set to 999')
          ),
        { timeout: 15000 }
      )
      .toBe(true)
  })

  test('drops a parameter the model does not have, and says that it did', async ({
    page,
  }) => {
    await openSimpleBox(page, payload({ not_a_real_parameter: 5 }))

    await expect
      .poll(
        async () =>
          (await announcements(page)).some((line) =>
            line.includes('not_a_real_parameter is not a parameter')
          ),
        { timeout: 15000 }
      )
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

  test('the notice about changed values stays until it is dismissed', async ({
    page,
  }) => {
    // IR-Q16. D-98 made this sentence reachable at all; measured, it then
    // stood for about 660 ms before the render replaced it, so someone who
    // looked up late never learned their number had changed.
    await openSimpleBox(
      page,
      payload({ width: 999, hole_count: 0, not_a_real_parameter: 5 })
    )

    const notice = page.locator('.parameter-notice')
    await expect(notice).toBeVisible({ timeout: 20000 })

    // Each line names the parameter, what the link asked for, and what it is
    // now - not a general apology.
    await expect(notice).toContainText(
      'width was set to 999, above the highest allowed value. It is now 100.'
    )
    await expect(notice).toContainText(
      'hole_count was set to 0, below the lowest allowed value. It is now 1.'
    )
    await expect(notice).toContainText(
      'not_a_real_parameter is not a parameter of this design'
    )

    // The controls agree with what the notice says.
    await expect(page.locator('#param-width')).toHaveValue('100')
    await expect(page.locator('#param-hole_count')).toHaveValue('1')

    // Long after the status line has moved on to the render, it is still here.
    await expect
      .poll(async () => page.locator('#statusArea').textContent(), {
        timeout: 30000,
      })
      .not.toContain('adjusted')
    await expect(notice).toBeVisible()

    // And it goes when asked, by keyboard.
    await page.locator('.parameter-notice-dismiss').focus()
    await page.keyboard.press('Enter')
    await expect(notice).toHaveCount(0)
  })

  test('a link that fits raises no notice at all', async ({ page }) => {
    await openSimpleBox(page, payload({ width: 77 }))
    await expect(page.locator('#param-width')).toHaveValue('77')
    // Nothing was changed, so there is nothing to say.
    await expect(page.locator('.parameter-notice')).toHaveCount(0)
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
