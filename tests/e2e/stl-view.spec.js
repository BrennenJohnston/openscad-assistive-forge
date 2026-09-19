import { test, expect } from '@playwright/test'
import path from 'path'
import { skipWithoutWebGL } from './helpers/webgl.js'

// STL view-only mode: an .stl loads straight into the three.js preview —
// no WASM render, no parameters, Generate/Export stay unavailable.
// Fixture: the desktop-CLI-generated parity cube (12 triangles).

const STL_FIXTURE = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'parity',
  'cube10.stl'
)

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

// STL viewing itself needs no WASM, but the upload listeners attach during
// app init — data-wasm-ready is the reliable "app is interactive" signal.
async function openApp(page) {
  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 180_000,
  })
}

test.describe('STL view-only mode', () => {
  test('loads an STL into the viewer with a no-parameters notice', async ({
    page,
  }) => {
    test.setTimeout(240_000)

    await openApp(page)
    // This case is about an STL arriving in the three.js viewer. Where the
    // browser cannot make a WebGL context there is no viewer and no canvas,
    // so the precondition is absent rather than the behaviour being wrong.
    await skipWithoutWebGL(
      page,
      'no WebGL context: the STL viewer never creates a canvas here'
    )
    await page.locator('#fileInput').setInputFiles(STL_FIXTURE)

    await expect(page.locator('#welcomeScreen')).toBeHidden({
      timeout: 30_000,
    })
    await expect(page.locator('#mainInterface')).toBeVisible({
      timeout: 10_000,
    })

    // Viewer canvas is up
    await expect(
      page.locator('#previewPanel canvas, .preview-container canvas').first()
    ).toBeVisible({ timeout: 30_000 })

    // Customizer shows the view-only notice instead of parameter controls
    const notice = page.locator('.stl-view-notice')
    await expect(notice).toBeVisible({ timeout: 10_000 })
    await expect(notice).toContainText('no editable parameters')
    await expect(page.locator('.param-control')).toHaveCount(0)

    // Nothing renderable is loaded, so the primary action must not offer
    // a misleading Generate.
    const primaryBtn = page.locator('#primaryActionBtn')
    if (await primaryBtn.isVisible().catch(() => false)) {
      await expect(primaryBtn).toBeDisabled()
    }
  })

  test('Back returns to the welcome screen and leaves view mode', async ({
    page,
  }) => {
    test.setTimeout(240_000)

    await openApp(page)
    await page.locator('#fileInput').setInputFiles(STL_FIXTURE)
    await expect(page.locator('#mainInterface')).toBeVisible({
      timeout: 30_000,
    })

    await page.locator('#clearFileBtn').click()
    // Confirm dialog
    await page
      .locator('.confirm-modal button:has-text("Confirm")')
      .click({ timeout: 5_000 })

    await expect(page.locator('#welcomeScreen')).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.locator('.stl-view-notice')).toHaveCount(0)
  })
})
