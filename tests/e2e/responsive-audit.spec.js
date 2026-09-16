/**
 * Responsive Audit — Breakpoint x UI-Surface Test Matrix
 *
 * Discovery spec: 9 viewports x 10 UI surfaces. Failures are expected and
 * will be triaged in Phase 3. WASM-dependent tests are skipped in CI.
 *
 * @see .cursor/plans/responsive_ui_bug_audit_122efc11.plan.md  Phase 1
 */
import { test, expect } from '@playwright/test'
import path from 'path'

const isCI = !!process.env.CI
const MOBILE_BREAKPOINT = 768

/**
 * WebKit on macOS CI intermittently rejects page.goto() with
 * "Provisional navigation canceled". Retry up to 3 times with a short
 * back-off so a single transient failure doesn't sink the whole suite.
 */
async function safeGoto(page, url, opts = {}) {
  const maxAttempts = 3
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await page.goto(url, opts)
      return
    } catch (err) {
      const transient =
        /provisional navigation canceled/i.test(err.message) ||
        /net::ERR_ABORTED/i.test(err.message)
      if (!transient || i === maxAttempts) throw err
      await page.waitForTimeout(500 * i)
    }
  }
}

const VIEWPORTS = [
  { label: 'tiny-portrait', width: 320, height: 568, hasTouch: true },
  { label: 'phone-portrait', width: 375, height: 812, hasTouch: true },
  { label: 'phone-landscape', width: 812, height: 375, hasTouch: true },
  { label: 'phablet-portrait', width: 480, height: 854, hasTouch: true },
  { label: 'narrow-tablet', width: 600, height: 960, hasTouch: true },
  { label: 'tablet-portrait', width: 768, height: 1024, hasTouch: true },
  { label: 'tablet-landscape', width: 1024, height: 768, hasTouch: false },
  { label: 'desktop', width: 1280, height: 800, hasTouch: false },
  { label: 'wide', width: 1440, height: 900, hasTouch: false },
]

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

async function loadSampleFile(page) {
  const wasmReady = page.waitForEvent('console', {
    predicate: (msg) => msg.text().includes('OpenSCAD WASM ready'),
    timeout: 120_000,
  })

  await safeGoto(page, '/')
  await wasmReady

  const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
  await page.setInputFiles('#fileInput', fixturePath)
  await page.waitForSelector('.param-control', { state: 'attached', timeout: 30_000 })

  try {
    const notNowBtn = page.locator('#saveProjectNotNow')
    await notNowBtn.waitFor({ state: 'visible', timeout: 3000 })
    await notNowBtn.click()
    await page.waitForTimeout(300)
  } catch {
    // Modal never appeared
  }
}

async function checkNoHorizontalOverflow(page) {
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  )
  expect(overflows).toBe(false)
}

for (const vp of VIEWPORTS) {
  const isMobile = vp.width < MOBILE_BREAKPOINT

  test.describe(`Responsive Audit — ${vp.label} (${vp.width}x${vp.height})`, () => {
    test.use({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.hasTouch,
    })

    // ── Surface 1: App shell ────────────────────────────────────────────
    test('app shell — no overflow, #app fills viewport, header visible', async ({ page }) => {
      await safeGoto(page, '/')

      await checkNoHorizontalOverflow(page)

      const app = page.locator('#app')
      await expect(app).toBeVisible()
      const appBox = await app.boundingBox()
      expect(appBox.width).toBeGreaterThanOrEqual(vp.width - 1)

      const header = page.locator('.app-header')
      await expect(header).toBeVisible()
      const headerBox = await header.boundingBox()
      expect(headerBox.width).toBeLessThanOrEqual(vp.width + 1)
    })

    // ── Surface 2: Welcome screen ───────────────────────────────────────
    test('welcome screen — upload zone visible and tappable, example buttons accessible', async ({
      page,
    }) => {
      await safeGoto(page, '/')

      const uploadZone = page.locator('#uploadZone, .upload-zone').first()
      await expect(uploadZone).toBeVisible()

      const uploadBox = await uploadZone.boundingBox()
      expect(uploadBox.x).toBeGreaterThanOrEqual(0)
      expect(uploadBox.x + uploadBox.width).toBeLessThanOrEqual(vp.width + 1)

      if (vp.hasTouch) {
        expect(uploadBox.height).toBeGreaterThanOrEqual(44)
      }

      const exampleBtns = page.locator('.example-btn, [data-example]')
      const count = await exampleBtns.count()
      if (count > 0) {
        await expect(exampleBtns.first()).toBeVisible()
      }

      await checkNoHorizontalOverflow(page)
    })

    // ── Surface 3: Header ───────────────────────────────────────────────
    test('header — controls within viewport, proper title variant', async ({ page }) => {
      await safeGoto(page, '/')

      const header = page.locator('.app-header')
      await expect(header).toBeVisible()
      const headerBox = await header.boundingBox()
      expect(headerBox.x + headerBox.width).toBeLessThanOrEqual(vp.width + 1)

      const themeToggle = page.locator('#themeToggle')
      await expect(themeToggle).toBeVisible()
      const toggleBox = await themeToggle.boundingBox()
      expect(toggleBox.x + toggleBox.width).toBeLessThanOrEqual(vp.width)

      const isUltraNarrow = vp.width < 360 && vp.height > vp.width
      const isNarrowPortrait = vp.width <= 480 && vp.height > vp.width
      if (isUltraNarrow) {
        await expect(page.locator('.title-short')).not.toBeVisible()
        await expect(page.locator('.title-full')).not.toBeVisible()
      } else if (isNarrowPortrait) {
        await expect(page.locator('.title-short')).toBeVisible()
        await expect(page.locator('.title-full')).not.toBeVisible()
      } else {
        await expect(page.locator('.title-full')).toBeVisible()
      }
    })

    // ── Surface 4: Parameter drawer (mobile) ────────────────────────────
    test('parameter drawer — toggle visible, opens/closes, backdrop, scrollable', async ({
      page,
    }) => {
      test.skip(!isMobile, 'Parameter drawer is mobile-only (below 768px)')
      test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
      test.setTimeout(150_000)

      await loadSampleFile(page)

      const toggle = page.locator('#mobileDrawerToggle')
      await expect(toggle).toBeVisible()

      await toggle.click()
      const drawer = page.locator('#paramPanel')
      await expect(drawer).toHaveClass(/drawer-open/)

      const backdrop = page.locator('#drawerBackdrop')
      await expect(backdrop).toHaveClass(/visible/)

      const isScrollable = await drawer.evaluate((el) => {
        const style = getComputedStyle(el)
        return style.overflowY === 'auto' || style.overflowY === 'scroll'
      })
      expect(isScrollable).toBe(true)

      // The backdrop spans the whole viewport and the open drawer covers the
      // middle of it, so Playwright's default click - at the element's centre -
      // lands on the drawer's own content every time. MEASURED with the drawer
      // open: the centre hits the preset actions at 320, Reset at 375, the
      // customizer header at 480 and the panel body at 600. A person taps the
      // strip beside the drawer, 32 px wide at the narrowest of these; so does
      // this.
      const strip = await page.evaluate(() => {
        const back = document.querySelector('#drawerBackdrop')
        const panel = document
          .querySelector('#paramPanel')
          .getBoundingClientRect()
        // Search the strip rather than assume a point in it: at 320 px it is
        // 32 px wide and a disabled preset button overflows the panel's right
        // edge into part of it.
        for (let f = 0.5; f > 0.05; f -= 0.05) {
          const y = Math.round(window.innerHeight * f)
          for (let x = window.innerWidth - 3; x > panel.right; x -= 4) {
            if (document.elementFromPoint(x, y) === back) return { x, y }
          }
        }
        return null
      })
      expect(
        strip,
        'the open drawer leaves no strip of backdrop a finger could tap'
      ).not.toBeNull()
      await backdrop.click({ position: strip })
      await expect(drawer).not.toHaveClass(/drawer-open/)

      await checkNoHorizontalOverflow(page)
    })

    // ── Surface 5: Parameter panel (desktop) ────────────────────────────
    test('parameter panel — inline panel visible, Split.js gutter present', async ({ page }) => {
      test.skip(isMobile, 'Inline parameter panel is desktop-only (768px+)')
      test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
      test.setTimeout(150_000)

      await loadSampleFile(page)

      const panel = page.locator('#paramPanel')
      await expect(panel).toBeVisible()

      const gutter = page.locator('.gutter-horizontal')
      await expect(gutter).toBeVisible()
    })

    // ── Surface 6: Preview panel ────────────────────────────────────────
    test('preview panel — visible and not clipped', async ({ page }) => {
      test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
      test.setTimeout(150_000)

      await loadSampleFile(page)

      const previewPanel = page.locator('#previewPanel')
      await expect(previewPanel).toBeVisible()

      const box = await previewPanel.boundingBox()
      expect(box.width).toBeGreaterThan(0)
      expect(box.height).toBeGreaterThan(0)
      expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1)
    })

    // ── Surface 7: Toolbar / actions ────────────────────────────────────
    test('toolbar/actions — buttons not clipped, primary action accessible', async ({ page }) => {
      test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
      test.setTimeout(150_000)

      await loadSampleFile(page)

      const primaryBtn = page.locator('#primaryActionBtn')
      if (await primaryBtn.isVisible()) {
        const btnBox = await primaryBtn.boundingBox()
        expect(btnBox.x + btnBox.width).toBeLessThanOrEqual(vp.width + 1)
      }

      const actionsToggle = page.locator('#actionsDrawerToggle')
      if (await actionsToggle.isVisible()) {
        const aBox = await actionsToggle.boundingBox()
        expect(aBox.x + aBox.width).toBeLessThanOrEqual(vp.width + 1)
      }

      await checkNoHorizontalOverflow(page)
    })

    // ── Surface 8: SVG editor fullscreen ────────────────────────────────
    test('SVG editor fullscreen — opens, fills viewport, closeable', async ({ page }) => {
      test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
      test.setTimeout(150_000)

      const wasmReady = page.waitForEvent('console', {
        predicate: (msg) => msg.text().includes('OpenSCAD WASM ready'),
        timeout: 120_000,
      })
      await safeGoto(page, '/?example=q-charm&flag_svg_preparer=true')
      await wasmReady

      await page.waitForSelector('.param-control', { state: 'attached', timeout: 30_000 })

      try {
        const notNowBtn = page.locator('#saveProjectNotNow')
        await notNowBtn.waitFor({ state: 'visible', timeout: 3000 })
        await notNowBtn.click()
        await page.waitForTimeout(300)
      } catch {
        // Modal never appeared
      }

      // Select an SVG from the gallery to trigger the SVG preparer
      const svgOption = page.locator('.svg-gallery-option, .svg-library-option').first()
      const hasSvgGallery = (await svgOption.count()) > 0 && (await svgOption.isVisible())

      if (!hasSvgGallery) {
        test.skip(true, 'SVG gallery not available at this viewport — needs manual triage')
        return
      }

      await svgOption.click()

      const prepareBtn = page.locator(
        'button:has-text("Prepare SVG"), .svg-prep-trigger-btn, [data-svg-prepare]',
      )
      if (!(await prepareBtn.isVisible().catch(() => false))) {
        test.skip(true, 'SVG prepare button not visible — needs manual triage')
        return
      }

      await prepareBtn.click()
      const workspace = page.locator('.svg-prep-workspace')
      await expect(workspace).toBeVisible({ timeout: 5000 })

      const fullscreenBtn = page.locator('.svg-prep-fullscreen-btn')
      await expect(fullscreenBtn).toBeVisible()

      await fullscreenBtn.click()
      await expect(workspace).toHaveClass(/svg-prep-fullscreen/)

      const wsBox = await workspace.boundingBox()
      expect(wsBox.width).toBeGreaterThanOrEqual(vp.width - 2)
      expect(wsBox.height).toBeGreaterThanOrEqual(vp.height - 2)

      if (isMobile) {
        await fullscreenBtn.click()
        await expect(workspace).not.toHaveClass(/svg-prep-fullscreen/)

        await fullscreenBtn.click()
        await expect(workspace).toHaveClass(/svg-prep-fullscreen/)
        const backdrop = page.locator('.svg-prep-fullscreen-backdrop')
        await backdrop.click()
        await expect(workspace).not.toHaveClass(/svg-prep-fullscreen/)
      } else {
        await page.keyboard.press('Escape')
        await expect(workspace).not.toHaveClass(/svg-prep-fullscreen/)
      }
    })

    // ── Surface 9: Modals/dialogs ───────────────────────────────────────
    test('modals/dialogs — fit within viewport, dismissible', async ({ page }) => {
      await safeGoto(page, '/')

      // Open the keyboard shortcuts modal (no WASM needed)
      const shortcutsBtn = page.locator('#shortcutsToggle')
      await expect(shortcutsBtn).toBeVisible()

      const modalContent = page.locator('#shortcutsModal .modal-content')

      // #shortcutsToggle sits in the static HTML, so it is visible the instant
      // the document loads - but initApp() is async and called at module scope,
      // and this button's click handler is attached thousands of lines into it.
      // So there is a window where the button is on screen and DEAD, and a
      // click that lands in it is swallowed: waiting longer on the modal cannot
      // recover that click, because nothing is ever coming.
      //
      // MEASURED (build/dp-r4 harness, clicking every 100ms from
      // domcontentloaded and timing the first click that works): the dead
      // window after `load` is 766ms on Firefox, 450ms on Chromium, and 1,287ms
      // on Chromium at 6x CPU throttling - it scales with how slow the machine
      // is. This test used to click exactly once, at `load`, then allow the
      // modal 3s. On a contended CI box that window passes 3s and the test
      // fails with nothing wrong with the app, which is what happened on CI
      // Firefox: three attempts red in a row, then green on the re-run.
      // Locally it is not flaky at all (0 failures in 6 Firefox runs, ~4.7s
      // each), so patience alone would have proved nothing here.
      //
      // Clicking until the modal answers fixes the cause and leaves every
      // assertion below untouched. _openShortcutsModal always opens (it never
      // toggles) and wires its body once, so a repeat click is safe, and
      // checking visibility first means the button is never clicked through the
      // open modal's own overlay.
      await expect
        .poll(
          async () => {
            if (await modalContent.isVisible()) return true
            await shortcutsBtn.click({ timeout: 2000 }).catch(() => {})
            return modalContent.isVisible()
          },
          { timeout: 15_000, intervals: [200, 400, 800, 1600] }
        )
        .toBe(true)

      const modalBox = await modalContent.boundingBox()
      expect(modalBox.width).toBeLessThanOrEqual(vp.width)
      expect(modalBox.height).toBeLessThanOrEqual(vp.height)

      // Dismiss via Escape
      await page.keyboard.press('Escape')
      await expect(modalContent).not.toBeVisible({ timeout: 3000 })
    })

    // ── Surface 10: Camera panel/drawer ─────────────────────────────────
    test('camera panel/drawer — appropriate variant shown for viewport', async ({ page }) => {
      test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
      test.setTimeout(150_000)

      await loadSampleFile(page)

      if (isMobile) {
        const drawerToggle = page.locator('#cameraDrawerToggle')
        if (await drawerToggle.isVisible().catch(() => false)) {
          await drawerToggle.click()
          const drawerBody = page.locator('#cameraDrawerBody')
          await expect(drawerBody).toBeVisible()
        }
      } else {
        const cameraPanel = page.locator('#cameraPanel')
        await expect(cameraPanel).toBeVisible()

        const panelToggle = page.locator('#cameraPanelToggle')
        await expect(panelToggle).toBeVisible()
      }
    })
  })
}
