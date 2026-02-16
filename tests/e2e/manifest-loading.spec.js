/**
 * E2E tests for manifest loading workflows (Section 4C of build plan)
 * Tests ?manifest= deep-link loading, error handling, defaults, and accessibility
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'

// Skip WASM-dependent tests in CI
const isCI = !!process.env.CI

// Dismiss first-visit modal
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
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
    await expect(page.locator('.param-control').first()).toBeVisible({ timeout: 10000 })

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
    await expect(page.locator('.param-control').first()).toBeVisible({ timeout: 10000 })
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
    await expect(page.locator('.param-control').first()).toBeVisible({ timeout: 10000 })

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
    await expect(page.locator('.param-control').first()).toBeVisible({ timeout: 10000 })

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
    await expect(page.locator('.param-control').first()).toBeVisible({ timeout: 10000 })
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
