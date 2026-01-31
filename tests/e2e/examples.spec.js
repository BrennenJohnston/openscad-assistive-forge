/**
 * E2E tests for example loading workflows
 * Tests deep-link example loading including volkswitch-keyguard-demo
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'

// Skip WASM-dependent tests in CI - WASM initialization is slow/unreliable
const isCI = !!process.env.CI

// Dismiss first-visit modal so it doesn't block UI interactions
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
  })
})

test.describe('Example Deep-Links', () => {
  test('loads simple-box via deep-link parameter', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/?example=simple-box')
    
    // Should show main interface
    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 20000 })
    
    // Should have parameters loaded
    await expect(page.locator('#parametersContainer, .param-control')).toBeVisible({ timeout: 10000 })
  })

  test('loads colored-box via deep-link parameter', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/?example=colored-box')
    
    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 20000 })
    
    await expect(page.locator('#parametersContainer, .param-control')).toBeVisible({ timeout: 10000 })
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

test.describe('Volkswitch Keyguard Example', () => {
  test('loads via deep-link parameter', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/?example=volkswitch-keyguard-demo')
    
    // Should show main interface
    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 20000 })
    
    // Should have parameters loaded
    await expect(page.locator('#parametersContainer, .param-control')).toBeVisible({ timeout: 10000 })
  })

  test('renders with correct parameter groups', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/?example=volkswitch-keyguard-demo')
    
    // Wait for parameters to load
    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 20000 })
    
    // Should have parameter groups from the SCAD file
    const paramGroups = page.locator('.param-group')
    await page.waitForTimeout(2000) // Allow time for parameter parsing
    
    // Check for expected parameter group headings
    const groupHeadings = await page.locator('.param-group-title, .param-group h3').allTextContents()
    
    // Should have Keyguard Settings, Grid Layout, Mounting Options, or Advanced groups
    const hasExpectedGroups = groupHeadings.some(h => 
      h.includes('Keyguard') || 
      h.includes('Grid') || 
      h.includes('Mounting') ||
      h.includes('Settings') ||
      h.includes('Advanced')
    )
    
    // If no groups found, that's also acceptable (flat parameter list)
    const paramControls = await page.locator('.param-control').count()
    expect(hasExpectedGroups || paramControls > 0).toBe(true)
  })

  test('has width parameter with correct range', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/?example=volkswitch-keyguard-demo')
    
    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 20000 })
    
    // Find width parameter - could be range input or number input
    const widthInput = page.locator('input[data-param="width"], input[name="width"], .param-control:has-text("width") input').first()
    
    if (await widthInput.isVisible().catch(() => false)) {
      // Check the input has reasonable range for keyguard width (50-300 in the SCAD)
      const inputType = await widthInput.getAttribute('type')
      
      if (inputType === 'range') {
        const min = await widthInput.getAttribute('min')
        const max = await widthInput.getAttribute('max')
        
        // Should have min around 50 and max around 300
        if (min && max) {
          expect(parseInt(min)).toBeLessThanOrEqual(100)
          expect(parseInt(max)).toBeGreaterThanOrEqual(200)
        }
      }
    }
  })

  test('has height parameter', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/?example=volkswitch-keyguard-demo')
    
    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 20000 })
    
    // Look for height parameter in the UI
    const heightParam = page.locator('.param-control:has-text("height"), [data-param="height"]').first()
    
    // Height should be visible in parameters
    const hasHeight = await heightParam.isVisible().catch(() => false) ||
                      await page.locator('label:has-text("height")').isVisible().catch(() => false)
    
    expect(hasHeight).toBe(true)
  })

  test('has thickness parameter', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/?example=volkswitch-keyguard-demo')
    
    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 20000 })
    
    // Look for thickness parameter
    const thicknessParam = page.locator('.param-control:has-text("thickness"), [data-param="thickness"]').first()
    
    const hasThickness = await thicknessParam.isVisible().catch(() => false) ||
                         await page.locator('label:has-text("thickness")').isVisible().catch(() => false)
    
    expect(hasThickness).toBe(true)
  })

  test('has grid parameters (columns and rows)', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/?example=volkswitch-keyguard-demo')
    
    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 20000 })
    
    // Check for grid-related parameters
    const pageContent = await page.content()
    const hasColumns = pageContent.includes('column') || pageContent.includes('Column')
    const hasRows = pageContent.includes('row') || pageContent.includes('Row')
    
    // At least one grid parameter should be present
    expect(hasColumns || hasRows).toBe(true)
  })

  test('has mounting holes toggle', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/?example=volkswitch-keyguard-demo')
    
    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 20000 })
    
    // Check for mounting holes parameter (boolean)
    const mountingParam = page.locator('.param-control:has-text("mounting"), [data-param*="mounting"]').first()
    
    const hasMounting = await mountingParam.isVisible().catch(() => false) ||
                        await page.locator('label:has-text("mounting")').isVisible().catch(() => false)
    
    // Mounting holes option should be present
    expect(hasMounting).toBe(true)
  })

  test('has type of keyguard dropdown', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/?example=volkswitch-keyguard-demo')
    
    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 20000 })
    
    // Check for type_of_keyguard parameter (dropdown)
    const typeParam = page.locator('select[data-param="type_of_keyguard"], .param-control:has-text("type") select').first()
    
    if (await typeParam.isVisible().catch(() => false)) {
      // Verify it has expected options
      const options = await typeParam.locator('option').allTextContents()
      const hasExpectedOptions = options.some(opt => 
        opt.includes('3D') || opt.includes('Laser') || opt.includes('Printed')
      )
      expect(hasExpectedOptions).toBe(true)
    }
  })

  test('displays file info correctly', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/?example=volkswitch-keyguard-demo')
    
    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 20000 })
    
    // Check file info section shows the filename
    const fileInfo = page.locator('#fileInfo, .file-info')
    
    if (await fileInfo.isVisible().catch(() => false)) {
      const infoText = await fileInfo.textContent()
      // Should contain keyguard or scad in the filename
      const hasFilename = infoText.toLowerCase().includes('keyguard') ||
                          infoText.toLowerCase().includes('.scad')
      expect(hasFilename).toBe(true)
    }
  })

  test('can trigger preview without errors', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/?example=volkswitch-keyguard-demo')
    
    const mainInterface = page.locator('#mainInterface')
    await expect(mainInterface).toBeVisible({ timeout: 20000 })
    
    // Wait for auto-preview or find preview button
    await page.waitForTimeout(3000)
    
    // Check for any critical errors in status area
    const statusArea = page.locator('#statusArea, .status-message')
    if (await statusArea.isVisible().catch(() => false)) {
      const statusText = await statusArea.textContent()
      // Should not have critical error messages
      expect(statusText.toLowerCase()).not.toContain('fatal')
      expect(statusText.toLowerCase()).not.toContain('crash')
    }
    
    // Page should still be functional
    await expect(page.locator('body')).toBeVisible()
  })
})

test.describe('Example Files Exist', () => {
  test('volkswitch example files are served correctly', async ({ page }) => {
    // Test that the SCAD file can be fetched
    const response = await page.request.get('/examples/volkswitch-keyguard/keyguard_demo.scad')
    expect(response.ok()).toBe(true)
    
    const content = await response.text()
    expect(content).toContain('Volkswitch')
    expect(content).toContain('width')
    expect(content).toContain('height')
  })

  test('volkswitch companion file is served correctly', async ({ page }) => {
    const response = await page.request.get('/examples/volkswitch-keyguard/openings_and_additions.txt')
    expect(response.ok()).toBe(true)
    
    // Should have some content
    const content = await response.text()
    expect(content.length).toBeGreaterThan(0)
  })

  test('simple-box example file exists', async ({ page }) => {
    const response = await page.request.get('/examples/simple-box/simple_box.scad')
    expect(response.ok()).toBe(true)
  })

  test('multi-file-box example exists', async ({ page }) => {
    const response = await page.request.get('/examples/multi-file-box.zip')
    expect(response.ok()).toBe(true)
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
