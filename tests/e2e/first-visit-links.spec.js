/**
 * A project opened by a link, as the person who receives the link meets it:
 * a first visit, the welcome dialog, then the project (D-181).
 *
 * The engine download waits for the welcome dialog, so a small shared
 * project arrives while the engine is still starting. The first preview used
 * to run against a worker that was not ready: the person was told "Preview
 * failed: Something Went Wrong", out loud by both announcers, about a project
 * that had not had a chance, and on a slower engine the preview never came.
 *
 * A direct link to an archive (`?project=`) opened it while the welcome
 * dialog was still asking: its processing overlay stood over the dialog, and
 * then "Save this file for quick access?" stacked on top of it (D-188).
 *
 * No case here pre-sets the first-visit flag. The manifest suite always
 * does, which is why it never saw this road.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import {
  MANIFEST_URL,
  MINIMAL_SCAD,
  MOCK_BASE,
  liveHistory,
  recordLiveRegions,
  setupMockManifestServer,
} from './helpers/mock-manifest-server.js'

const isCI = !!process.env.CI

test.use({ actionTimeout: 120_000 })
test.describe.configure({ timeout: 120_000 })

// Shaped like the example branch's box: a preset named in defaults, and
// autoPreview on, so both of the manifest handler's own preview calls are on
// the road as well as the file handler's first preview.
const SHARED_PROJECT = {
  forgeManifest: '1.0',
  name: 'First Visit Box',
  files: { main: 'test.scad', presets: 'presets.json' },
  defaults: { preset: 'Wide', autoPreview: true },
}
const PRESETS = JSON.stringify({
  parameterSets: { Wide: { width: '80', height: '30' } },
  fileFormatVersion: '1',
})

/** Open the shared link with no remembered choice, and answer the dialog. */
async function openAsFirstTimeVisitor(page) {
  await recordLiveRegions(page)
  await setupMockManifestServer(page, {
    manifest: SHARED_PROJECT,
    files: { 'test.scad': MINIMAL_SCAD, 'presets.json': PRESETS },
  })
  await page.goto(`/?manifest=${encodeURIComponent(MANIFEST_URL)}`)
  const dialog = page.locator('#first-visit-modal')
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  await page.locator('#firstVisitChoiceForge').check()
  const pressedAt = await page.evaluate(() => performance.now())
  await page.locator('#first-visit-continue').click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })
  return pressedAt
}

const said = (history) => history.map((h) => `${h.src}: ${h.text}`).join('\n')
const failuresIn = (history) => history.filter((h) => h.text.includes('Preview failed'))

/** "Preview ready" arrives, and "Preview failed" was never said or shown. */
async function expectPreviewWithoutAFailure(page) {
  // The first preview outcome, whichever it is, then the verdict on it: on
  // the old code this fails here, on the defect's own words.
  await expect
    .poll(
      async () =>
        (await liveHistory(page)).some((h) => /Preview (ready|failed)/.test(h.text)),
      { timeout: 90_000, message: 'no preview outcome was ever said or shown' }
    )
    .toBe(true)
  let history = await liveHistory(page)
  expect(failuresIn(history), `said or shown on the way:\n${said(history)}`).toEqual([])

  await expect
    .poll(
      async () =>
        (await liveHistory(page)).some((h) => h.text.startsWith('Preview ready')),
      { timeout: 90_000, message: 'the status history never reached "Preview ready"' }
    )
    .toBe(true)
  history = await liveHistory(page)
  expect(failuresIn(history), `said or shown on the way:\n${said(history)}`).toEqual([])
  return history
}

test.describe('A shared link on a first visit (D-181)', () => {
  test("a first-time visitor's manifest link previews after Download & Continue", async ({
    page,
  }) => {
    test.skip(isCI, 'WASM processing is slow/unreliable in CI')

    await openAsFirstTimeVisitor(page)
    await expectPreviewWithoutAFailure(page)
  })

  test('a first-time visitor on a slow connection gets the preview once the engine arrives', async ({
    page,
    browserName,
  }) => {
    test.skip(isCI, 'WASM processing is slow/unreliable in CI')
    test.skip(
      browserName !== 'chromium',
      "Routing cannot hold the render worker's engine request on Firefox (measured in IR-R2 A0)"
    )

    // The render worker fetches the engine; only a context route holds it.
    await page.context().route('**/openscad.wasm', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 6000))
      await route.continue()
    })

    const pressedAt = await openAsFirstTimeVisitor(page)
    const history = await expectPreviewWithoutAFailure(page)

    // The hold took effect (otherwise this case proves nothing), and the
    // preview came after the engine, not instead of it.
    const readyAt = await page.evaluate(() => window.__wasmReadyAt)
    expect(readyAt, 'the engine never reported itself ready').not.toBeNull()
    expect(readyAt - pressedAt, 'the engine was not slowed').toBeGreaterThan(5000)
    const firstReady = history.find((h) => h.text.startsWith('Preview ready'))
    expect(firstReady.t).toBeGreaterThan(readyAt)
  })
})

// ── D-188: a direct project link waits for the welcome dialog ─────────────

const PROJECT_URL = `${MOCK_BASE}/project.zip`
const CORS = { 'Access-Control-Allow-Origin': '*' }

/**
 * Serve a real archive at the link, count the requests, and watch, every
 * 50 ms from the first line of the page, for anything the link opened
 * standing over the welcome dialog.
 */
async function prepareProjectLink(page) {
  const archive = { requests: 0 }
  await page.route(PROJECT_URL, (route) => {
    archive.requests += 1
    return route.fulfill({
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/zip' },
      path: 'public/examples/multi-file-box.zip',
    })
  })
  await page.addInitScript(() => {
    window.__overTheDialog = []
    const shown = (el) => !!el && el.getClientRects().length > 0
    setInterval(() => {
      if (!shown(document.getElementById('first-visit-modal'))) return
      for (const el of document.querySelectorAll('#processingOverlay, .save-project-modal')) {
        if (shown(el) && !window.__overTheDialog.includes(el.id || el.className)) {
          window.__overTheDialog.push(el.id || el.className)
        }
      }
    }, 50)
  })
  return archive
}

test.describe('A direct project link on a first visit (D-188)', () => {
  test('nothing the link opens stands over the welcome dialog, and the archive waits for it', async ({
    page,
  }) => {
    const archive = await prepareProjectLink(page)
    await page.goto(`/?project=${encodeURIComponent(PROJECT_URL)}`)
    const dialog = page.locator('#first-visit-modal')
    await expect(dialog).toBeVisible({ timeout: 30_000 })

    // The handler starts half a second after the page and a routed archive
    // answers at once, so three seconds is the old road several times over.
    await page.waitForTimeout(3000)
    expect(
      await page.evaluate(() => window.__overTheDialog),
      'stood over the welcome dialog'
    ).toEqual([])
    expect(archive.requests, 'the archive was fetched before the dialog was answered').toBe(0)
    await expect(dialog).toBeVisible()
  })

  test('after Download & Continue the project opens, the save question comes after the dialog, and it previews', async ({
    page,
  }) => {
    test.skip(isCI, 'WASM processing is slow/unreliable in CI')

    await recordLiveRegions(page)
    const archive = await prepareProjectLink(page)
    await page.goto(`/?project=${encodeURIComponent(PROJECT_URL)}`)
    const dialog = page.locator('#first-visit-modal')
    await expect(dialog).toBeVisible({ timeout: 30_000 })

    const verdict = page.waitForEvent('console', {
      predicate: (message) =>
        /\[DeepLink\] (Successfully loaded project|Project not loaded)/.test(message.text()),
      timeout: 60_000,
    })
    await page.locator('#firstVisitChoiceForge').check()
    await page.locator('#first-visit-continue').click()
    await expect(dialog).toBeHidden({ timeout: 10_000 })

    await expect.poll(() => archive.requests, { timeout: 30_000 }).toBe(1)
    const notNow = page.locator('#saveProjectNotNow')
    await expect(notNow).toBeVisible({ timeout: 30_000 })
    await notNow.click()
    expect((await verdict).text()).toContain('Successfully loaded project')

    await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('.param-control').first()).toBeAttached({ timeout: 60_000 })
    await expectPreviewWithoutAFailure(page)
    expect(
      await page.evaluate(() => window.__overTheDialog),
      'stood over the welcome dialog'
    ).toEqual([])
  })
})
