/**
 * A direct link to a project archive (`?project=<zip url>`), D-186.
 *
 * GitHub keeps a file tracked by Git LFS as a pointer of about 130 bytes:
 * raw.githubusercontent.com serves the pointer, media.githubusercontent.com
 * the file. The manifest lane always followed the pointer; this lane handed
 * it to the unzipper, which failed and blamed a corrupted archive, and then
 * the lane said "Loaded" over its own failure.
 *
 * The first-visit flag is pre-set here: the welcome dialog on the link road
 * is first-visit-links' subject.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import { MOCK_BASE, liveHistory, recordLiveRegions } from './helpers/mock-manifest-server.js'

const isCI = !!process.env.CI

test.use({ actionTimeout: 120_000 })
test.describe.configure({ timeout: 120_000 })

const PROJECT_URL = `${MOCK_BASE}/project.zip`
const MEDIA_URL = 'https://media.githubusercontent.com/media/testuser/testrepo/main/project.zip'
const LFS_POINTER =
  'version https://git-lfs.github.com/spec/v1\n' +
  `oid sha256:${'a'.repeat(64)}\n` +
  'size 1234\n'
const CORS = { 'Access-Control-Allow-Origin': '*' }

const said = (history) => history.map((h) => `${h.src}: ${h.text}`).join('\n')

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
  await recordLiveRegions(page)
})

/** Resolves when the link handler has decided whether the project loaded. */
function linkVerdict(page) {
  return page.waitForEvent('console', {
    predicate: (message) =>
      /\[DeepLink\] (Successfully loaded project|Project not loaded)/.test(message.text()),
    timeout: 60_000,
  })
}

test.describe('A direct link to a project archive (D-186)', () => {
  test('an LFS-tracked ZIP opens', async ({ page }) => {
    test.skip(isCI, 'WASM processing is slow/unreliable in CI')

    let mediaRequests = 0
    await page.route(PROJECT_URL, (route) =>
      route.fulfill({
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/zip' },
        body: LFS_POINTER,
      })
    )
    await page.route(MEDIA_URL, (route) => {
      mediaRequests += 1
      return route.fulfill({
        status: 200,
        headers: CORS,
        path: 'public/examples/multi-file-box.zip',
      })
    })

    const verdict = linkVerdict(page)
    await page.goto(`/?project=${encodeURIComponent(PROJECT_URL)}`)
    await verdict

    // The archive opened: no extraction dialog, the project on screen.
    await expect(page.locator('[data-testid="friendly-error-modal"]')).toHaveCount(0)
    await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('.param-control').first()).toBeAttached({ timeout: 60_000 })
    expect(mediaRequests, 'the pointer was not followed to the file').toBe(1)

    // And the lane still says so (a check that misread success as failure
    // would have dropped this sentence).
    const history = await liveHistory(page)
    expect(
      history.some((h) => h.text === 'Loaded project.zip from URL'),
      `said or shown:\n${said(history)}`
    ).toBe(true)
  })

  test('a body that is not a ZIP is reported, not celebrated', async ({ page }) => {
    await page.route(PROJECT_URL, (route) =>
      route.fulfill({
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/zip' },
        body: 'not a zip',
      })
    )

    const verdict = linkVerdict(page)
    await page.goto(`/?project=${encodeURIComponent(PROJECT_URL)}`)
    await verdict

    const dialog = page.locator('[data-testid="friendly-error-modal"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: /ZIP Extraction Failed/ })).toBeVisible()

    const history = await liveHistory(page)
    expect(
      history.some((h) => h.text === 'Failed to extract ZIP file'),
      `said or shown:\n${said(history)}`
    ).toBe(true)
    expect(
      history.filter((h) => /Loaded project\.zip from URL|project\.zip loaded from URL/.test(h.text)),
      `said or shown:\n${said(history)}`
    ).toEqual([])

    await dialog.getByRole('button', { name: 'OK' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.locator('#welcomeScreen')).toBeVisible()
  })
})
