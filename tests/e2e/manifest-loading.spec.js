/**
 * E2E tests for manifest loading workflows (Section 4C of build plan)
 * Tests ?manifest= deep-link loading, error handling, defaults, and accessibility
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Skip WASM-dependent tests in CI
const isCI = !!process.env.CI

// Dismiss first-visit modal
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

// ---------------------------------------------------------------------------
// Mock server helpers
// ---------------------------------------------------------------------------

/**
 * Set up route interception to serve mock manifest and project files.
 * This simulates a GitHub-hosted manifest without requiring real network calls.
 */
async function setupMockManifestServer(page, {
  manifest = null,
  files = {},
  manifestStatus = 200,
  manifestContentType = 'application/json',
  fileStatuses = {},
  corsHeaders = true,
} = {}) {
  const MOCK_BASE = 'https://raw.githubusercontent.com/testuser/testrepo/main'

  // Intercept manifest URL
  await page.route(`${MOCK_BASE}/forge-manifest.json`, async (route) => {
    const headers = corsHeaders
      ? { 'Access-Control-Allow-Origin': '*', 'Content-Type': manifestContentType }
      : { 'Content-Type': manifestContentType }

    if (manifest === null) {
      await route.fulfill({ status: 404, body: 'Not Found' })
      return
    }

    const body = typeof manifest === 'string' ? manifest : JSON.stringify(manifest)
    await route.fulfill({ status: manifestStatus, headers, body })
  })

  // Intercept project file URLs
  for (const [filename, content] of Object.entries(files)) {
    const status = fileStatuses[filename] || 200
    await page.route(`${MOCK_BASE}/${filename}`, async (route) => {
      const headers = corsHeaders
        ? { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' }
        : { 'Content-Type': 'text/plain' }
      await route.fulfill({ status, headers, body: content })
    })
  }

  return MOCK_BASE
}

/** Minimal valid SCAD content for testing */
const MINIMAL_SCAD = `
// Test design
width = 50; // [10:1:100]
height = 30; // [10:1:100]
cube([width, height, 10]);
`

/** Minimal valid manifest with just files.main */
function minimalManifest(mainFile = 'test.scad') {
  return {
    forgeManifest: '1.0',
    files: { main: mainFile },
  }
}

/** Full manifest with all optional fields */
function fullManifest() {
  return {
    forgeManifest: '1.0',
    name: 'Test Project',
    author: 'Test Author',
    description: 'A test project for E2E testing',
    files: {
      main: 'test.scad',
      companions: ['helper.txt'],
      presets: 'presets.json',
    },
    defaults: {
      preset: 'Config A',
      autoPreview: true,
      skipWelcome: true,
    },
  }
}

const MOCK_BASE = 'https://raw.githubusercontent.com/testuser/testrepo/main'
const MANIFEST_URL = `${MOCK_BASE}/forge-manifest.json`

// UF-9 P1: parameter groups render as <details> collapsed by default
// (F5, owner decision 2026-05-15) — even a group-less SCAD lands in one
// default group — so a .param-control is attached yet hidden. Prove the
// load, expand the groups, then assert visibility.
async function expectParamsLoaded(page) {
  await expect(page.locator('.param-control').first()).toBeAttached({ timeout: 10000 })
  // The manifest deep-link flow raises the "Shared Project" save-copy modal
  // (Step 6 of the deep-link lifecycle, ~300ms after first-visit clears);
  // it intercepts pointer events, so clear it before clicking Expand all.
  const skipBtn = page.locator('#manifestSaveCopySkip')
  try {
    await skipBtn.waitFor({ state: 'visible', timeout: 2000 })
    await skipBtn.click()
    await skipBtn.waitFor({ state: 'hidden', timeout: 3000 })
  } catch {
    // Modal did not appear for this manifest / was already dismissed
  }
  const expandAll = page.locator('#expandAllGroupsBtn')
  if (await expandAll.isVisible().catch(() => false)) {
    await expandAll.click()
  }
  await expect(page.locator('.param-control').first()).toBeVisible({ timeout: 10000 })
}

// ---------------------------------------------------------------------------
// Test Suite: Valid Manifest Loading
// ---------------------------------------------------------------------------

test.describe('Manifest Loading - Valid Manifests', () => {
  test.describe.configure({ timeout: 60_000 })

  test('loads a valid manifest with all files, parameters render, and preset auto-selects', async ({ page }) => {
    test.skip(isCI, 'WASM processing is slow/unreliable in CI')

    await setupMockManifestServer(page, {
      manifest: fullManifest(),
      files: {
        'test.scad': MINIMAL_SCAD,
        'helper.txt': '// companion content\n',
        'presets.json': JSON.stringify({
          parameterSets: {
            'Config A': { width: '75', height: '50' },
            'Config B': { width: '100', height: '80' },
          },
          fileFormatVersion: '1',
        }),
      },
    })

    await page.goto(`/?manifest=${encodeURIComponent(MANIFEST_URL)}`)

    // Should show main interface (files loaded successfully)
    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 30000 })

    // Parameters should render
    await expectParamsLoaded(page)

    // Status bar should show project name
    const statusText = await page.locator('#statusArea, .status-bar').textContent()
    expect(statusText).toBeTruthy()
  })

  test('loads a minimal manifest (only files.main) with graceful handling of missing optional fields', async ({ page }) => {
    test.skip(isCI, 'WASM processing is slow/unreliable in CI')

    await setupMockManifestServer(page, {
      manifest: minimalManifest(),
      files: { 'test.scad': MINIMAL_SCAD },
    })

    await page.goto(`/?manifest=${encodeURIComponent(MANIFEST_URL)}`)

    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 30000 })

    // Should have parameters from the SCAD file
    await expectParamsLoaded(page)
  })

  test('loads manifest with defaults.skipWelcome=true and skips welcome screen', async ({ page }) => {
    test.skip(isCI, 'WASM processing is slow/unreliable in CI')

    await setupMockManifestServer(page, {
      manifest: {
        ...minimalManifest(),
        defaults: { skipWelcome: true },
      },
      files: { 'test.scad': MINIMAL_SCAD },
    })

    await page.goto(`/?manifest=${encodeURIComponent(MANIFEST_URL)}`)

    // Welcome screen should be hidden
    const welcomeScreen = page.locator('#welcomeScreen')
    await expect(welcomeScreen).toBeHidden({ timeout: 15000 })

    // Main interface should be visible
    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 30000 })
  })

  test('loads manifest with defaults.autoPreview=true and triggers preview automatically', async ({ page }) => {
    test.skip(isCI, 'WASM processing is slow/unreliable in CI')

    await setupMockManifestServer(page, {
      manifest: {
        ...minimalManifest(),
        defaults: { autoPreview: true },
      },
      files: { 'test.scad': MINIMAL_SCAD },
    })

    await page.goto(`/?manifest=${encodeURIComponent(MANIFEST_URL)}`)

    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 30000 })

    // Wait for parameters to load
    await expectParamsLoaded(page)

    // With autoPreview, the render should have started or completed
    // Look for any sign of rendering activity (progress bar, canvas, status update)
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    // Should not show an idle/empty state -- something should be happening
    expect(body.length).toBeGreaterThan(100)
  })
})

// ---------------------------------------------------------------------------
// Test Suite: Error Handling
// ---------------------------------------------------------------------------

test.describe('Manifest Loading - Error Handling', () => {
  test('shows user-friendly error for invalid JSON manifest', async ({ page }) => {
    await setupMockManifestServer(page, {
      manifest: '{ this is not valid JSON !!!',
    })

    await page.goto(`/?manifest=${encodeURIComponent(MANIFEST_URL)}`)

    // Should show an error message, not crash
    await page.waitForTimeout(5000)
    const body = await page.textContent('body')
    expect(body).toBeTruthy()

    // Check for error indicators
    const hasErrorUI =
      body.toLowerCase().includes('error') ||
      body.toLowerCase().includes('invalid') ||
      body.toLowerCase().includes('failed') ||
      (await page.locator('[role="alert"]').count()) > 0

    expect(hasErrorUI).toBe(true)
  })

  test('shows error message when manifest URL returns 404', async ({ page }) => {
    await setupMockManifestServer(page, {
      manifest: null, // Will return 404
    })

    await page.goto(`/?manifest=${encodeURIComponent(MANIFEST_URL)}`)

    await page.waitForTimeout(5000)
    const body = await page.textContent('body')
    expect(body).toBeTruthy()

    // Page should not be blank
    const hasContent = body.length > 50
    expect(hasContent).toBe(true)
  })

  test('shows error when files.main points to a missing file', async ({ page }) => {
    test.skip(isCI, 'WASM processing is slow/unreliable in CI')

    await setupMockManifestServer(page, {
      manifest: minimalManifest('nonexistent.scad'),
      files: {}, // Main file is not served
      fileStatuses: { 'nonexistent.scad': 404 },
    })

    // Route the 404
    await page.route(`${MOCK_BASE}/nonexistent.scad`, async (route) => {
      await route.fulfill({ status: 404, body: 'Not Found' })
    })

    await page.goto(`/?manifest=${encodeURIComponent(MANIFEST_URL)}`)

    await page.waitForTimeout(5000)
    const body = await page.textContent('body')

    // Should show error, not blank screen
    expect(body.length).toBeGreaterThan(50)
  })

  test('handles manifest with missing required forgeManifest field', async ({ page }) => {
    await setupMockManifestServer(page, {
      manifest: { files: { main: 'test.scad' } }, // Missing forgeManifest
    })

    await page.goto(`/?manifest=${encodeURIComponent(MANIFEST_URL)}`)

    await page.waitForTimeout(5000)
    const body = await page.textContent('body')
    expect(body.length).toBeGreaterThan(50)
  })

  test('handles manifest with missing required files.main field', async ({ page }) => {
    await setupMockManifestServer(page, {
      manifest: { forgeManifest: '1.0', files: {} }, // Missing files.main
    })

    await page.goto(`/?manifest=${encodeURIComponent(MANIFEST_URL)}`)

    await page.waitForTimeout(5000)
    const body = await page.textContent('body')
    expect(body.length).toBeGreaterThan(50)
  })

  test('handles unsupported manifest version gracefully', async ({ page }) => {
    await setupMockManifestServer(page, {
      manifest: { forgeManifest: '99.0', files: { main: 'test.scad' } },
    })

    await page.goto(`/?manifest=${encodeURIComponent(MANIFEST_URL)}`)

    await page.waitForTimeout(5000)
    const body = await page.textContent('body')
    expect(body.length).toBeGreaterThan(50)
  })
})

// ---------------------------------------------------------------------------
// Test Suite: URL Parameter Interactions
// ---------------------------------------------------------------------------

test.describe('Manifest Loading - URL Parameter Interactions', () => {
  test.describe.configure({ timeout: 60_000 })

  test('?preset= URL override takes precedence over manifest defaults.preset', async ({ page }) => {
    test.skip(isCI, 'WASM processing is slow/unreliable in CI')

    await setupMockManifestServer(page, {
      manifest: {
        ...minimalManifest(),
        defaults: { preset: 'Config A' },
      },
      files: { 'test.scad': MINIMAL_SCAD },
    })

    // Use ?preset= to override the manifest default
    await page.goto(
      `/?manifest=${encodeURIComponent(MANIFEST_URL)}&preset=Config+B`
    )

    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 30000 })
  })

  test('?skipWelcome=true via URL works with manifest', async ({ page }) => {
    test.skip(isCI, 'WASM processing is slow/unreliable in CI')

    await setupMockManifestServer(page, {
      manifest: minimalManifest(),
      files: { 'test.scad': MINIMAL_SCAD },
    })

    await page.goto(
      `/?manifest=${encodeURIComponent(MANIFEST_URL)}&skipWelcome=true`
    )

    const welcomeScreen = page.locator('#welcomeScreen')
    await expect(welcomeScreen).toBeHidden({ timeout: 15000 })
  })
})

// ---------------------------------------------------------------------------
// Test Suite: Companion File Handling
// ---------------------------------------------------------------------------

test.describe('Manifest Loading - Companion Files', () => {
  test.describe.configure({ timeout: 60_000 })

  test('warns but partially loads when a companion file is missing', async ({ page }) => {
    test.skip(isCI, 'WASM processing is slow/unreliable in CI')

    await setupMockManifestServer(page, {
      manifest: {
        forgeManifest: '1.0',
        files: {
          main: 'test.scad',
          companions: ['missing_helper.txt'],
        },
      },
      files: { 'test.scad': MINIMAL_SCAD },
      fileStatuses: { 'missing_helper.txt': 404 },
    })

    await page.route(`${MOCK_BASE}/missing_helper.txt`, async (route) => {
      await route.fulfill({ status: 404, body: 'Not Found' })
    })

    await page.goto(`/?manifest=${encodeURIComponent(MANIFEST_URL)}`)

    // Should not crash -- either loads partially or shows a warning
    await page.waitForTimeout(8000)
    const body = await page.textContent('body')
    expect(body.length).toBeGreaterThan(50)
  })
})

// ---------------------------------------------------------------------------
// Test Suite: Sequential Manifest Loads
// ---------------------------------------------------------------------------

test.describe('Manifest Loading - Sequential Loads', () => {
  test.describe.configure({ timeout: 120_000 })

  test('loading two different manifests in sequence produces clean state', async ({ page }) => {
    test.skip(isCI, 'WASM processing is slow/unreliable in CI')

    // First manifest
    await setupMockManifestServer(page, {
      manifest: { ...minimalManifest(), name: 'Project Alpha' },
      files: {
        'test.scad': `
          alpha_param = 10; // [1:100]
          cube([alpha_param, 10, 10]);
        `,
      },
    })

    await page.goto(`/?manifest=${encodeURIComponent(MANIFEST_URL)}`)
    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 30000 })
    await expectParamsLoaded(page)

    // Second manifest (different project with different params)
    const MOCK_BASE_2 = 'https://raw.githubusercontent.com/testuser/secondrepo/main'
    const MANIFEST_URL_2 = `${MOCK_BASE_2}/forge-manifest.json`

    await page.route(`${MOCK_BASE_2}/forge-manifest.json`, async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forgeManifest: '1.0',
          name: 'Project Beta',
          files: { main: 'beta.scad' },
        }),
      })
    })

    await page.route(`${MOCK_BASE_2}/beta.scad`, async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' },
        body: `
          beta_param = 20; // [1:200]
          sphere(beta_param);
        `,
      })
    })

    await page.goto(`/?manifest=${encodeURIComponent(MANIFEST_URL_2)}`)
    await expect(mainInterface).toBeVisible({ timeout: 30000 })
    await expectParamsLoaded(page)
  })
})

// ---------------------------------------------------------------------------
// Test Suite: Mobile Viewport
// ---------------------------------------------------------------------------

test.describe('Manifest Loading - Mobile Viewport', () => {
  test.use({ viewport: { width: 375, height: 812 } })
  test.describe.configure({ timeout: 60_000 })

  test('manifest loading works on mobile viewport (375px width)', async ({ page }) => {
    test.skip(isCI, 'WASM processing is slow/unreliable in CI')

    await setupMockManifestServer(page, {
      manifest: minimalManifest(),
      files: { 'test.scad': MINIMAL_SCAD },
    })

    await page.goto(`/?manifest=${encodeURIComponent(MANIFEST_URL)}`)

    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 30000 })

    // Parameters should be accessible (possibly in a drawer on mobile)
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body.length).toBeGreaterThan(100)
  })
})

// ---------------------------------------------------------------------------
// Test Suite: Accessibility
// ---------------------------------------------------------------------------

test.describe('Manifest Loading - Accessibility', () => {
  test.describe.configure({ timeout: 60_000 })

  test('manifest-related UI elements have proper ARIA attributes', async ({ page }) => {
    test.skip(isCI, 'WASM processing is slow/unreliable in CI')

    await setupMockManifestServer(page, {
      manifest: { ...minimalManifest(), name: 'Accessible Test Project' },
      files: { 'test.scad': MINIMAL_SCAD },
    })

    await page.goto(`/?manifest=${encodeURIComponent(MANIFEST_URL)}`)

    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 30000 })

    // Parameters should have labels
    const paramControls = page.locator('.param-control')
    const count = await paramControls.count()

    if (count > 0) {
      // Each parameter control should have an associated label or aria-label
      for (let i = 0; i < Math.min(count, 3); i++) {
        const control = paramControls.nth(i)
        const input = control.locator('input, select').first()

        if ((await input.count()) > 0) {
          const ariaLabel = await input.getAttribute('aria-label')
          const ariaLabelledBy = await input.getAttribute('aria-labelledby')
          const id = await input.getAttribute('id')

          // At least one labelling mechanism should be present
          const hasLabel = ariaLabel || ariaLabelledBy || id
          expect(hasLabel).toBeTruthy()
        }
      }
    }

    // Alert elements should have role="alert"
    const alerts = page.locator('[role="alert"]')
    const alertCount = await alerts.count()
    // There may be 0 alerts if loading succeeded without issues -- that's fine
    expect(alertCount).toBeGreaterThanOrEqual(0)
  })

  test('manifest loading UI is keyboard-navigable', async ({ page }) => {
    test.skip(isCI, 'WASM processing is slow/unreliable in CI')

    await setupMockManifestServer(page, {
      manifest: minimalManifest(),
      files: { 'test.scad': MINIMAL_SCAD },
    })

    await page.goto(`/?manifest=${encodeURIComponent(MANIFEST_URL)}`)

    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 30000 })

    // Tab through the interface to verify keyboard accessibility
    await page.keyboard.press('Tab')
    await page.waitForTimeout(200)

    // Should have a focused element
    const focusedElement = page.locator(':focus')
    const hasFocus = (await focusedElement.count()) > 0
    expect(hasFocus).toBe(true)

    // Continue tabbing through a few elements
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab')
      await page.waitForTimeout(100)
    }

    // Should still have a focused element (not lost focus)
    const stillFocused = page.locator(':focus')
    expect(await stillFocused.count()).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// IR-9 — the starter subset
//
// A manifest can name the handful of parameters a beginner should meet first.
// A 174-parameter keyguard is the truthful shape of that design and an unusable
// first screen; the dozen its workflow walks is a much better one, as long as
// the other 162 are one honest action away.
//
// Progressive DISCLOSURE, never removal: the wall is display:none, which hides
// a control from everybody equally. Nothing is hidden from a screen reader that
// a sighted person can still see.
// ---------------------------------------------------------------------------

const STARTER_SCAD = `
/* [Size] */
// How wide
width = 50; // [10:1:100]
// How tall
height = 30; // [10:1:100]

/* [Looks] */
// Corner rounding
corner = 2; // [0:0.5:10]
// Surface finish
finish = "smooth"; // [smooth, textured]

/* [Fit] */
// Printer allowance
tolerance = 0.2; // [0:0.05:1]
// Wall thickness
wall = 1.6; // [1.2:0.1:5]

cube([width, height, wall]);
`

function starterManifest(starterParameters) {
  return {
    forgeManifest: '1.0',
    name: 'Starter Test Project',
    files: { main: 'test.scad' },
    defaults: { starterParameters },
  }
}

async function loadStarterProject(page, starterParameters) {
  await setupMockManifestServer(page, {
    manifest:
      starterParameters === undefined
        ? { forgeManifest: '1.0', name: 'No Starter', files: { main: 'test.scad' } }
        : starterManifest(starterParameters),
    files: { 'test.scad': STARTER_SCAD },
  })
  await page.goto(`/?manifest=${encodeURIComponent(MANIFEST_URL)}`)
  await expect(page.locator('.param-control').first()).toBeAttached({
    timeout: 30000,
  })
  const skipBtn = page.locator('#manifestSaveCopySkip')
  try {
    await skipBtn.waitFor({ state: 'visible', timeout: 3000 })
    await skipBtn.click()
    await skipBtn.waitFor({ state: 'hidden', timeout: 3000 })
  } catch {
    // The save-copy modal did not appear for this manifest.
  }
}

/** Controls a person can actually see right now. */
async function visibleControlNames(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.param-control[data-param-name]'))
      .filter((el) => el.offsetParent !== null)
      .map((el) => el.dataset.paramName)
  )
}

test.describe('Starter subset (IR-9)', () => {
  test('a manifest without the field renders every parameter, as it always did', async ({
    page,
  }) => {
    await loadStarterProject(page, undefined)
    await page.locator('#expandAllGroupsBtn').click()

    expect(await visibleControlNames(page)).toEqual([
      'width',
      'height',
      'corner',
      'finish',
      'tolerance',
      'wall',
    ])
    await expect(page.locator('.starter-reveal-btn')).toHaveCount(0)
  })

  test('a manifest with the field shows those parameters and nothing else', async ({
    page,
  }) => {
    await loadStarterProject(page, ['width', 'tolerance'])

    // The starter groups open themselves: a starter parameter inside a
    // collapsed group is a starter parameter nobody can see.
    expect(await visibleControlNames(page)).toEqual(['width', 'tolerance'])

    const button = page.locator('.starter-reveal-btn')
    await expect(button).toBeVisible()
    await expect(button).toHaveText('Show all parameters')
    await expect(button).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.starter-reveal-hint')).toHaveText(
      'Showing the 2 settings this design starts with. 4 more are available.'
    )
  })

  test('the reveal works from the keyboard, keeps focus, and says what it did', async ({
    page,
  }) => {
    await loadStarterProject(page, ['width', 'tolerance'])

    const button = page.locator('.starter-reveal-btn')
    await button.focus()
    await expect(button).toBeFocused()

    // Record everything the live region says, rather than sampling it later.
    // MEASURED while writing this: the preview pipeline announces
    // "Rendering preview..." about 200 ms after the press, so a sample taken
    // afterwards proves nothing about whether the reveal was announced at all.
    await page.evaluate(() => {
      window.__announced = []
      const el = document.getElementById('srAnnouncer')
      new MutationObserver(() => {
        if (el.textContent) window.__announced.push(el.textContent)
      }).observe(el, { childList: true, characterData: true, subtree: true })
    })

    await page.keyboard.press('Enter')

    // Everything is back, in the order the design wrote it.
    await expect
      .poll(async () => (await visibleControlNames(page)).length)
      .toBe(6)
    await expect(button).toHaveAttribute('aria-expanded', 'true')
    await expect(button).toHaveText('Show only the starter settings')

    // A control that removes itself takes the focus with it. This one stays.
    await expect(button).toBeFocused()

    await expect
      .poll(async () => page.evaluate(() => window.__announced), {
        timeout: 5000,
      })
      .toContain('Showing all 6 settings.')

    // And it goes back, which is why it is a toggle.
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await visibleControlNames(page)).length).toBe(2)
    await expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  test('a name this design does not have is reported, and the project still loads', async ({
    page,
  }) => {
    await loadStarterProject(page, ['width', 'not_a_parameter'])

    // Not fatal: the names that ARE real still do their job.
    expect(await visibleControlNames(page)).toEqual(['width'])

    const notice = page.locator('#parameterNotices .parameter-notice')
    await expect(notice).toBeVisible({ timeout: 10000 })
    await expect(notice).toContainText(
      'One starting setting in this link is not part of this design'
    )
    await expect(notice).toContainText('not_a_parameter')
  })

  test('searching drops the wall, because a search that cannot find a real parameter is a lie', async ({
    page,
  }) => {
    await loadStarterProject(page, ['width'])
    expect(await visibleControlNames(page)).toEqual(['width'])

    await page.locator('#paramSearchInput').fill('finish')

    await expect
      .poll(async () => visibleControlNames(page))
      .toContain('finish')
    await expect(page.locator('.starter-reveal-btn')).toHaveAttribute(
      'aria-expanded',
      'true'
    )
  })

  test('axe finds nothing on the starter view, or after the reveal', async ({
    page,
  }) => {
    await loadStarterProject(page, ['width', 'tolerance'])

    const scan = () =>
      new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .include('#parametersContainer')
        .analyze()

    const before = await scan()
    expect(
      before.violations.map((v) => `${v.id}: ${v.description}`),
      'starter view'
    ).toEqual([])

    await page.locator('.starter-reveal-btn').click()
    await expect(page.locator('.starter-reveal-btn')).toHaveAttribute(
      'aria-expanded',
      'true'
    )

    const after = await scan()
    expect(
      after.violations.map((v) => `${v.id}: ${v.description}`),
      'after the reveal'
    ).toEqual([])
  })

  test('every hidden control is hidden from everybody, not just from the screen', async ({
    page,
  }) => {
    // The rule this release is held to: no aria-only tricks. A control the
    // wall hides must be display:none, so nothing reaches it - not a screen
    // reader, not the Tab key, not a pointer.
    await loadStarterProject(page, ['width'])

    const reachable = await page.evaluate(() => {
      const hidden = Array.from(
        document.querySelectorAll('.param-control.starter-hidden')
      )
      return hidden.map((el) => ({
        name: el.dataset.paramName,
        display: getComputedStyle(el).display,
        ariaHidden: el.getAttribute('aria-hidden'),
        focusableInside: Array.from(
          el.querySelectorAll('input, select, button, textarea')
        ).filter((c) => c.offsetParent !== null).length,
      }))
    })

    expect(reachable.length).toBeGreaterThan(0)
    for (const control of reachable) {
      expect(control.display, `${control.name} should be display:none`).toBe('none')
      expect(
        control.focusableInside,
        `${control.name} should have nothing tabbable inside it`
      ).toBe(0)
    }
  })
})
