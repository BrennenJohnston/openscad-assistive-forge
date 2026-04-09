/**
 * E2E tests for SVG Preparer tool integration
 *
 * Tests SVG gallery asset availability and feature flag recognition.
 * The auto-preparation logic (prepareSvg, needsPreparation) is
 * covered by 28+ unit tests in tests/unit/svg-preparer.test.js.
 *
 * WASM-dependent dialog interaction tests require the WASM binary to
 * be installed locally. WASM initialization is slow/unreliable in
 * headless mode. Per the Phase 6 fallback gate, interactive dialog
 * validation uses the manual testing checklist below.
 *
 * Client-side page.evaluate() tests are not feasible because path-bool
 * references `process` which Vite's dev server does not polyfill in the
 * browser context. This is a dev-mode limitation; the production build
 * replaces process references correctly.
 *
 * ## Manual Testing Checklist — SVG Preparer Dialog
 *
 * Prerequisites: WASM binary installed (`pixi run setup-wasm`), dev server
 * running (`pixi run dev`).
 *
 * 1. Navigate to `/?example=q-charm&flag_svg_preparer=true`
 * 2. Wait for Bracelet Clip Charm to load and parameters to appear
 * 3. In the SVG gallery, select "Smiley face"
 * 4. Verify the "Prepare SVG..." button appears next to the file parameter
 * 5. Click "Prepare SVG..." — the dialog should open
 * 6. Verify the dialog shows:
 *    - Title "Prepare SVG for OpenSCAD"
 *    - SVG preview pane with the smiley image
 *    - 4 elements listed: Circle 1 (foreground), Circle 2 (hole),
 *      Circle 3 (hole), Path 4 (ignore)
 *    - Each element has radio buttons for foreground/hole/ignore
 * 7. Tab through all controls — focus should cycle within the dialog
 * 8. Hover over a list item — the corresponding SVG shape should highlight
 * 9. Change Circle 2's role to "Ignore" — the aria-live region should
 *    announce the change
 * 10. Press Escape — dialog should close, no SVG change applied
 * 11. Re-open the dialog and click "Apply" — the prepared SVG should
 *     replace the original (single compound path in dev tools)
 * 12. Repeat steps 5-6 with a screen reader (NVDA / VoiceOver) and verify:
 *     - Dialog title is announced on open
 *     - Element names and roles are read in the list
 *     - Role changes are announced via live region
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
  })
})

// ---------------------------------------------------------------------------
// SVG gallery assets exist (no WASM required)
// ---------------------------------------------------------------------------

test.describe('SVG Preparer — Asset Verification', () => {
  test('smiley.svg gallery asset is accessible and multi-element', async ({ page }) => {
    const response = await page.request.get(
      '/examples/nasif-charm-maker/svg-library/smiley.svg'
    )
    expect(response.ok()).toBe(true)
    const body = await response.text()
    expect(body).toContain('<circle')
    expect(body).toContain('fill="black"')
    expect(body).toContain('fill="white"')
  })

  test('heart.svg (single-path) gallery asset is accessible', async ({ page }) => {
    const response = await page.request.get(
      '/examples/nasif-charm-maker/svg-library/heart.svg'
    )
    expect(response.ok()).toBe(true)
    const body = await response.text()
    expect(body).toContain('<path')
  })

  test('all 12 SVG gallery files are accessible', async ({ page }) => {
    const files = [
      'smiley.svg', 'heart.svg', 'star.svg', 'paw.svg',
      'lightning.svg', 'music-note.svg', 'moon.svg', 'flower.svg',
      'diamond.svg', 'crown.svg', 'leaf.svg', 'sun.svg',
    ]
    for (const file of files) {
      const response = await page.request.get(
        `/examples/nasif-charm-maker/svg-library/${file}`
      )
      expect(response.ok(), `${file} should be accessible`).toBe(true)
    }
  })

  test('Bracelet Clip Charm manifest references SVG library with 2 params and 6 options each', async ({ page }) => {
    const response = await page.request.get('/examples/q-charm/manifest.json')
    expect(response.ok()).toBe(true)
    const manifest = await response.json()
    expect(manifest.svgLibrary).toBeDefined()
    expect(manifest.svgLibrary.length).toBe(2)

    const designOptions = manifest.svgLibrary[0].options
    expect(designOptions.length).toBe(6)
    expect(designOptions[0].file).toBe('smiley.svg')

    const designOptions2 = manifest.svgLibrary[1].options
    expect(designOptions2.length).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// Feature flag gating (no WASM needed)
// ---------------------------------------------------------------------------

test.describe('SVG Preparer — Feature Flag', () => {
  test('flag_svg_preparer=true is recognized without unknown-flag warnings', async ({ page }) => {
    const consoleWarnings = []
    page.on('console', (msg) => {
      if (msg.type() === 'warning') consoleWarnings.push(msg.text())
    })

    await page.goto('/?flag_svg_preparer=true')
    await expect(page.locator('body')).toBeVisible()
    await page.waitForTimeout(2000)

    const unknownFlagWarning = consoleWarnings.find(
      (msg) => msg.includes('Unknown flag') && msg.includes('svg_preparer')
    )
    expect(unknownFlagWarning).toBeUndefined()
  })

  test('flag_svg_preparer=false is also recognized without warnings', async ({ page }) => {
    const consoleWarnings = []
    page.on('console', (msg) => {
      if (msg.type() === 'warning') consoleWarnings.push(msg.text())
    })

    await page.goto('/?flag_svg_preparer=false')
    await expect(page.locator('body')).toBeVisible()
    await page.waitForTimeout(2000)

    const unknownFlagWarning = consoleWarnings.find(
      (msg) => msg.includes('Unknown flag') && msg.includes('svg_preparer')
    )
    expect(unknownFlagWarning).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// SVG Path Offset feature flag (no WASM needed)
// ---------------------------------------------------------------------------

test.describe('SVG Path Offset — Feature Flag', () => {
  test('flag_svg_path_offset=true is recognized without unknown-flag warnings', async ({ page }) => {
    const consoleWarnings = []
    page.on('console', (msg) => {
      if (msg.type() === 'warning') consoleWarnings.push(msg.text())
    })

    await page.goto('/?flag_svg_preparer=true&flag_svg_path_offset=true')
    await expect(page.locator('body')).toBeVisible()
    await page.waitForTimeout(2000)

    const unknownFlagWarning = consoleWarnings.find(
      (msg) => msg.includes('Unknown flag') && msg.includes('svg_path_offset')
    )
    expect(unknownFlagWarning).toBeUndefined()
  })
})
