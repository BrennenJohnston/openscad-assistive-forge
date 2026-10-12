/**
 * The Main Page button asks before leaving only when there is something to
 * lose: a parameter changed, or an edit in the code editor. A project only
 * looked at closes at once.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
  await page.goto('/?example=simple-box')
  await page
    .locator('.param-control')
    .first()
    .waitFor({ state: 'attached', timeout: 60_000 })
})

const question = (page) =>
  page.getByRole('alertdialog', { name: 'Go back to the Main Page?' })

test('a project only looked at goes back without a question', async ({ page }) => {
  await page.locator('#clearFileBtn').click()
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 })
  await expect(question(page)).toHaveCount(0)
})

test('a changed parameter is asked about first', async ({ page }) => {
  await page.evaluate(() =>
    document
      .querySelectorAll('#parametersContainer details')
      .forEach((d) => (d.open = true))
  )
  const width = page.locator('#param-width')
  await width.fill('60')
  await width.press('Tab')
  await page.locator('#clearFileBtn').click()
  await expect(question(page)).toBeVisible()
  await question(page).getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('#welcomeScreen')).toBeHidden()
})
