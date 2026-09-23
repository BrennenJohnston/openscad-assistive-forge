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
 * No case here pre-sets the first-visit flag. The manifest suite always
 * does, which is why it never saw this road.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import {
  MANIFEST_URL,
  MINIMAL_SCAD,
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
