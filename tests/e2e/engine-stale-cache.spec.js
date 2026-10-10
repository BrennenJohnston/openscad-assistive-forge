import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

// A browser that opened the app before an engine change can still hold the
// old `openscad.wasm`: the server lets it keep that file for a year, and the
// name never changes. The engine the app was built with must start anyway.

const INTEGRITY = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), 'public', 'wasm', 'openscad-official', 'INTEGRITY.json'),
    'utf8'
  )
)
const ENGINE_VERSION = INTEGRITY.files['openscad.wasm'].sha256.slice(0, 16)

// The service worker would answer from its own cache before a route saw the
// request.
test.use({ serviceWorkers: 'block' })

test('an old engine kept under the old address does not stop the engine starting', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
  const asked = []
  await context.route(
    (url) => url.pathname.endsWith('/wasm/openscad-official/openscad.wasm'),
    async (route) => {
      const { search } = new URL(route.request().url())
      asked.push(search)
      if (!search) {
        return route.fulfill({
          status: 200,
          contentType: 'application/wasm',
          body: Buffer.from('an engine from an earlier release'),
        })
      }
      return route.continue()
    }
  )

  await page.goto('/')
  const started = page
    .waitForSelector('body[data-wasm-ready="true"]', { state: 'attached', timeout: 180_000 })
    .then(() => 'started')
  const failed = page
    .locator('[data-testid="friendly-error-modal"]')
    .first()
    .waitFor({ timeout: 180_000 })
    .then(() => 'failed')
  expect(await Promise.race([started, failed])).toBe('started')
  expect(asked).toContain(`?v=${ENGINE_VERSION}`)
})
