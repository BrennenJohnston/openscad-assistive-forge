/**
 * The app keeps a draft to offer on the next visit only once something was
 * changed. A project only looked at leaves no draft and no question.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test'
import { draftQuestion } from './helpers/draft-question.js'

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
    .waitFor({ state: 'attached', timeout: 60_000 })
  // Past the draft writer's debounce.
  await page.waitForTimeout(3_000)
}

test('a project only looked at leaves no draft', async ({ page }) => {
  test.setTimeout(180_000)
  await openBox(page)
  await page.goto('/')
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(4_000)
  await expect(draftQuestion(page)).toHaveCount(0)
})

test('a changed parameter leaves a draft, asked about on the next visit', async ({ page }) => {
  test.setTimeout(180_000)
  await openBox(page)
  await page.evaluate(() =>
    document
      .querySelectorAll('#parametersContainer details')
      .forEach((d) => (d.open = true))
  )
  const width = page.locator('#param-width')
  await width.fill('60')
  await width.press('Tab')
  await page.waitForTimeout(3_000)
  await page.goto('/')
  await expect(draftQuestion(page)).toBeVisible({ timeout: 60_000 })
  await draftQuestion(page)
    .getByRole('button', { name: 'Discard draft', exact: true })
    .click()
})
