/**
 * E2E tests for the Actions drawer: what it offers in each view, and that
 * every button it shows can be pressed, even with the preview's settings
 * panel open in a short window.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

async function openBox(page) {
  await page.goto('/?example=simple-box')
  await page
    .locator('.param-control')
    .first()
    .waitFor({ state: 'attached', timeout: 60000 })
  const notNow = page.locator('#saveProjectNotNow')
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3000 })
    await notNow.click()
    await notNow.waitFor({ state: 'hidden', timeout: 3000 })
  } catch {
    // Not every load raises the save prompt
  }
}

async function setView(page, view) {
  const toggle = page.locator('#uiModeToggle')
  const standard = (await toggle.getAttribute('aria-checked')) === 'true'
  if ((view === 'standard') !== standard) await toggle.click()
  await expect(toggle).toHaveAttribute(
    'aria-checked',
    view === 'standard' ? 'true' : 'false'
  )
}

async function openDrawer(page) {
  const copyLink = page.locator('#copySettingsLinkBtn')
  if (!(await copyLink.isVisible())) {
    await page.locator('#actionsDrawerToggle').click()
  }
  await expect(copyLink).toBeVisible({ timeout: 10000 })
}

test.describe('The Actions drawer', () => {
  test('Publish is offered in Standard view and not in Simplified view', async ({
    page,
  }) => {
    await openBox(page)
    await setView(page, 'simplified')
    await openDrawer(page)
    await expect(page.locator('#publishProjectBtn')).toBeHidden()

    await setView(page, 'standard')
    await openDrawer(page)
    await expect(page.locator('#publishProjectBtn')).toBeVisible()
  })

  test('the drawer has no Console button of its own', async ({ page }) => {
    await openBox(page)
    await openDrawer(page)
    await expect(page.locator('#viewConsoleBtn')).toHaveCount(0)
    // The console stays one press away under the preview.
    await expect(page.locator('#echoViewConsoleBtn')).toBeAttached()
  })

  for (const [width, height] of [
    [1703, 790],
    [1280, 560],
  ]) {
    test.describe(`at ${width} x ${height} with Preview Settings & Info open`, () => {
      test.use({ viewport: { width, height } })

      test('every button the drawer shows is the one a press reaches', async ({
        page,
      }) => {
        await openBox(page)
        await setView(page, 'standard')
        const settings = page.locator('#previewDrawerToggle')
        if ((await settings.getAttribute('aria-expanded')) !== 'true') {
          await settings.click()
        }
        await expect(settings).toHaveAttribute('aria-expanded', 'true')
        await openDrawer(page)

        const covered = await page.evaluate(() =>
          [...document.querySelectorAll('#actionsDrawerBody button')]
            .filter((b) => b.offsetParent)
            .map((b) => {
              const r = b.getBoundingClientRect()
              const top = document.elementFromPoint(
                r.x + r.width / 2,
                r.y + r.height / 2
              )
              return top && b.contains(top)
                ? null
                : `${b.id} is under ${top?.id || top?.className || top?.tagName}`
            })
            .filter(Boolean)
        )
        expect(covered).toEqual([])
      })
    })
  }
})
