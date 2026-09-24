/**
 * A shared link that fails says so, where the person is (D-187).
 *
 * When a link's download failed, the app returned to the Main Page and put
 * its explanation only into the visually hidden status region and the polite
 * announcer, and removed the link from the address bar. A sighted person saw
 * the Main Page and nothing else, which is exactly what was reported:
 * "It only opened the main page of the Assistive Forge UI and then nothing
 * else opened."
 *
 * These cases assert what is VISIBLE and what is SAID, never that the page
 * "has text": a hidden sentence passed the older error cases for months.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { MANIFEST_URL, liveHistory, recordLiveRegions } from './helpers/mock-manifest-server.js'

test.use({ actionTimeout: 120_000 })
test.describe.configure({ timeout: 120_000 })

const HEADING = 'The shared project could not be opened.'
const LINK = `/?manifest=${encodeURIComponent(MANIFEST_URL)}`
const NOTICE_MESSAGE_ID = 'linkFailureNoticeMessage'

const said = (history) => history.map((h) => `${h.src}: ${h.text}`).join('\n')

/** GitHub's per-address limit, as raw.githubusercontent.com answers it. */
async function rateLimitTheManifest(page) {
  const hits = { count: 0 }
  await page.route(MANIFEST_URL, (route) => {
    hits.count += 1
    return route.fulfill({
      status: 429,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' },
      body: 'Too Many Requests',
    })
  })
  return hits
}

async function asReturningVisitor(page) {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
}

/** Wait until the link has failed (the status says so), then return the notice. */
async function noticeAfterTheFailure(page) {
  await expect
    .poll(
      async () =>
        (await liveHistory(page)).some((h) =>
          h.text.startsWith("Couldn't load the project from manifest.")
        ),
      { timeout: 60_000, message: 'the link never failed' }
    )
    .toBe(true)
  return page.locator('[role="alert"]', { hasText: HEADING })
}

test.describe('A shared link that fails says so on the Main Page (D-187)', () => {
  test.beforeEach(async ({ page }) => {
    await asReturningVisitor(page)
    await recordLiveRegions(page, { extraIds: [NOTICE_MESSAGE_ID] })
  })

  test('a rate-limited manifest shows the notice', async ({ page }) => {
    await rateLimitTheManifest(page)
    await page.goto(LINK)

    const alert = await noticeAfterTheFailure(page)
    await expect(alert, 'no visible alert says the link failed').toBeVisible({ timeout: 5_000 })
    await expect(alert).toContainText('server returned 429')
    await expect(page.locator('#linkFailureRetry')).toBeVisible()
    await expect(page.locator('#linkFailureDismiss')).toBeVisible()
    await expect(page.locator('#welcomeScreen')).toBeVisible()
    expect(await page.evaluate(() => location.search)).toBe('')
  })

  test('Try again re-issues the request', async ({ page }) => {
    const hits = await rateLimitTheManifest(page)
    await page.goto(LINK)
    await expect(await noticeAfterTheFailure(page)).toBeVisible({ timeout: 5_000 })
    expect(hits.count).toBe(1)

    await page.locator('#linkFailureRetry').click()
    await expect.poll(() => hits.count, { timeout: 30_000 }).toBe(2)

    // It failed again, and says so again: one notice, not two.
    await expect(await noticeAfterTheFailure(page)).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#linkFailureNotice')).toHaveCount(1)
  })

  test('the notice is announced once and dismissible from the keyboard', async ({ page }) => {
    await rateLimitTheManifest(page)
    await page.goto(LINK)
    await expect(await noticeAfterTheFailure(page)).toBeVisible({ timeout: 5_000 })
    // Let every announcer have its say before counting.
    await page.waitForTimeout(1500)

    const history = await liveHistory(page)
    const told = history.filter((h) => h.text.includes(HEADING))
    expect(told.map((h) => h.src), `said or shown:\n${said(history)}`).toEqual([
      NOTICE_MESSAGE_ID,
    ])

    let presses = 0
    const focusedId = () => page.evaluate(() => document.activeElement?.id || '')
    while (presses < 40 && (await focusedId()) !== 'linkFailureDismiss') {
      await page.keyboard.press('Tab')
      presses += 1
    }
    expect(await focusedId(), `Dismiss not reached in ${presses} presses of Tab`).toBe(
      'linkFailureDismiss'
    )
    await page.keyboard.press('Enter')
    await expect(page.locator('#linkFailureNotice')).toBeHidden()
    expect(await focusedId()).toBe('uploadZone')
  })

  test('axe finds nothing on the Main Page with the notice up', async ({ page }) => {
    await rateLimitTheManifest(page)
    await page.goto(LINK)
    await expect(await noticeAfterTheFailure(page)).toBeVisible({ timeout: 5_000 })

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })
})

test.describe('The failed-link notice at phone width (D-187)', () => {
  test.use({ viewport: { width: 412, height: 915 } })

  test('the notice fits a phone screen and its buttons are full-size targets', async ({ page }) => {
    await asReturningVisitor(page)
    await recordLiveRegions(page, { extraIds: [NOTICE_MESSAGE_ID] })
    await rateLimitTheManifest(page)
    await page.goto(LINK)
    await expect(await noticeAfterTheFailure(page)).toBeVisible({ timeout: 5_000 })

    const notice = await page.locator('#linkFailureNotice').boundingBox()
    expect(notice.x).toBeGreaterThanOrEqual(0)
    expect(notice.x + notice.width).toBeLessThanOrEqual(412)
    for (const id of ['linkFailureRetry', 'linkFailureDismiss']) {
      const button = await page.locator(`#${id}`).boundingBox()
      expect(button.width, `${id} is narrower than 44 px`).toBeGreaterThanOrEqual(44)
      expect(button.height, `${id} is shorter than 44 px`).toBeGreaterThanOrEqual(44)
    }
  })
})

test.describe('The failed-link notice on a first visit (D-187)', () => {
  test('a first-time visitor whose link fails meets the notice after Download & Continue', async ({
    page,
  }) => {
    // No remembered choice: the recipient's own road, welcome dialog first.
    await recordLiveRegions(page, { extraIds: [NOTICE_MESSAGE_ID] })
    await rateLimitTheManifest(page)
    await page.goto(LINK)
    const dialog = page.locator('#first-visit-modal')
    await expect(dialog).toBeVisible({ timeout: 30_000 })
    await page.locator('#firstVisitChoiceForge').check()
    await page.locator('#first-visit-continue').click()
    await expect(dialog).toBeHidden({ timeout: 10_000 })

    await expect(await noticeAfterTheFailure(page)).toBeVisible({ timeout: 5_000 })
    await page.waitForTimeout(1500)
    const history = await liveHistory(page)
    expect(
      history.filter((h) => h.text.includes(HEADING)).map((h) => h.src),
      `said or shown:\n${said(history)}`
    ).toEqual([NOTICE_MESSAGE_ID])
  })
})
