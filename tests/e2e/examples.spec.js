/**
 * E2E tests for example loading workflows
 * Tests deep-link example loading and welcome screen examples
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'

// Skip WASM-dependent tests in CI - WASM initialization is slow/unreliable
const isCI = !!process.env.CI

// Dismiss first-visit modal so it doesn't block UI interactions
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

// F5 (owner decision 2026-05-15): parameter groups render as <details>
// collapsed by default, so a .param-control can be attached yet hidden
// inside its group. Prove the parameters loaded first, then expand the
// groups so the visibility assertion still means what it meant when these
// deep-link tests were written (UF-9 P1; this was D-11's real mechanism —
// not a dev-vs-deployed lane difference).
async function expectParamsLoaded(page) {
  await expect(page.locator('.param-control').first()).toBeAttached({ timeout: 10000 })
  // Some example sources raise the save-project prompt (q-charm loads as
  // 'program-example'); its dialog intercepts pointer events, so clear it
  // before clicking anything.
  const notNow = page.locator('#saveProjectNotNow')
  try {
    await notNow.waitFor({ state: 'visible', timeout: 2000 })
    await notNow.click()
    await notNow.waitFor({ state: 'hidden', timeout: 3000 })
  } catch {
    // Save prompt did not appear for this example source
  }
  const expandAll = page.locator('#expandAllGroupsBtn')
  if (await expandAll.isVisible().catch(() => false)) {
    await expandAll.click()
  }
  await expect(page.locator('.param-control').first()).toBeVisible({ timeout: 10000 })
}

test.describe('Example Deep-Links', () => {
  test('loads simple-box via deep-link parameter', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/?example=simple-box')
    
    // Should show main interface
    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 20000 })
    
    // Should have parameters loaded (use .first() to avoid strict mode on multi-match)
    await expectParamsLoaded(page)
  })

  test('loads colored-box via deep-link parameter', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/?example=colored-box')
    
    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 20000 })
    
    await expectParamsLoaded(page)
  })

  test('handles invalid example name gracefully', async ({ page }) => {
    await page.goto('/?example=nonexistent-example')
    
    // Should not crash - either shows welcome screen or error message
    await expect(page.locator('body')).toBeVisible()
    
    // Check we didn't get a blank page - at least one of these elements should exist
    const h1Count = await page.locator('h1').count()
    const welcomeCount = await page.locator('#welcomeScreen').count()
    const statusCount = await page.locator('#statusArea').count()
    
    const hasContent = h1Count > 0 || welcomeCount > 0 || statusCount > 0
    expect(hasContent).toBe(true)
  })
})

test.describe('Example Files Exist', () => {
  test('simple-box example file exists', async ({ page }) => {
    const response = await page.request.get('/examples/simple-box/simple_box.scad')
    expect(response.ok()).toBe(true)
  })

  test('multi-file-box example exists', async ({ page }) => {
    const response = await page.request.get('/examples/multi-file-box.zip')
    expect(response.ok()).toBe(true)
  })

  test('q-charm scad and manifest exist', async ({ page }) => {
    const scadResponse = await page.request.get('/examples/q-charm/q_charm.scad')
    expect(scadResponse.ok()).toBe(true)

    const manifestResponse = await page.request.get('/examples/q-charm/manifest.json')
    expect(manifestResponse.ok()).toBe(true)
  })
})

test.describe('Welcome Screen Examples', () => {
  test('shows example buttons on welcome screen', async ({ page }) => {
    await page.goto('/')
    
    // Should have example buttons
    const exampleButtons = page.locator('[data-example], button:has-text("Simple Box"), button:has-text("Cylinder")')
    const count = await exampleButtons.count()
    
    expect(count).toBeGreaterThan(0)
  })

  test('example buttons are accessible', async ({ page }) => {
    await page.goto('/')
    
    const exampleButton = page.locator('[data-example]').first()
    
    if (await exampleButton.isVisible().catch(() => false)) {
      // Check button is focusable
      await exampleButton.focus()
      
      // Should have some accessible name
      const ariaLabel = await exampleButton.getAttribute('aria-label')
      const title = await exampleButton.getAttribute('title')
      const textContent = await exampleButton.textContent()
      
      const hasAccessibleName = (ariaLabel && ariaLabel.length > 0) ||
                                (title && title.length > 0) ||
                                (textContent && textContent.trim().length > 0)
      
      expect(hasAccessibleName).toBe(true)
    }
  })
})

test.describe('Bracelet Clip Charm Smoke Tests', () => {
  test('loads q-charm via deep-link and shows parameter groups', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await page.goto('/?example=q-charm')

    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 20000 })

    await expectParamsLoaded(page)
  })

  test('welcome screen has Charm Customizer card with variant selector including Bracelet Clip Charm', async ({ page }) => {
    await page.goto('/')

    const variantSelect = page.locator('#charmVariantSelect')
    await expect(variantSelect).toBeVisible()

    const qCharmOption = variantSelect.locator('option[value="q-charm"]')
    await expect(qCharmOption).toHaveCount(1)

    const openBtn = page.locator('#openCharmMakerBtn')
    await expect(openBtn).toBeVisible()

    const ariaLabel = await openBtn.getAttribute('aria-label')
    const textContent = await openBtn.textContent()
    const hasName = (ariaLabel && ariaLabel.length > 0) ||
                    (textContent && textContent.trim().length > 0)
    expect(hasName).toBe(true)
  })
})

test.describe('Deep-Link Aliases', () => {
  test('?load=colored-box loads via load alias', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await page.goto('/?load=colored-box')

    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 20000 })

    await expectParamsLoaded(page)
  })

  test('?example=cable-organizer loads via example param', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await page.goto('/?example=cable-organizer')

    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 20000 })

    await expectParamsLoaded(page)
  })
})
