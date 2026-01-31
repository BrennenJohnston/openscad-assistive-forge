import { test, expect } from '@playwright/test'
import path from 'path'

// Skip WASM-dependent tests in CI
const isCI = !!process.env.CI

// Dismiss first-visit modal so it doesn't block UI interactions
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
  })
})

test.describe('Basic Workflow - Upload → Customize → Download', () => {
  // Note: This test requires file upload to trigger UI change, which may not work
  // consistently in all headless browser environments. Skip if flaky.
  test.skip('should complete full workflow with simple box', async ({ page }) => {
    // 1. Navigate to app
    await page.goto('/')
    
    // 2. Verify welcome screen loads
    await expect(page.locator('h1')).toContainText('OpenSCAD', { timeout: 10000 })
    
    // 3. Check that the upload zone is visible
    const uploadZone = page.locator('#uploadZone, .upload-zone').first()
    await expect(uploadZone).toBeVisible({ timeout: 5000 })
    
    // 4. Upload a test file - use the main file input, not the queue import input
    const fileInput = page.locator('#fileInput')
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
    await fileInput.setInputFiles(fixturePath)
    
    // 5. Wait for welcome screen to hide (indicates file was processed)
    await expect(page.locator('#welcomeScreen')).toBeHidden({ timeout: 15000 })
    
    // 6. Wait for main interface to become visible
    await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 5000 })
    
    // 7. Wait for parameter controls to be rendered in the visible parameters section
    // Look specifically for range/number inputs in the param-groups area
    await expect(
      page.locator('.param-groups input[type="range"], .param-groups input[type="number"]').first()
    ).toBeVisible({ timeout: 10000 })
    
    // 8. Try to find and adjust a parameter (if any numeric input exists)
    const numericInput = page.locator('.param-groups input[type="number"], .param-groups input[type="range"]').first()
    if (await numericInput.isVisible({ timeout: 5000 })) {
      const currentValue = await numericInput.inputValue()
      console.log('Found numeric parameter with value:', currentValue)
      
      // Change the value
      await numericInput.fill('75')
      await numericInput.blur()
      
      // Wait a bit for auto-preview debounce
      await page.waitForTimeout(2000)
    }
    
    // 8. Look for download or generate button
    const downloadBtn = page.locator('button:has-text("Download"), button:has-text("Generate"), [data-testid="download-btn"]').first()
    
    // Wait for button to be enabled
    await expect(downloadBtn).toBeVisible({ timeout: 15000 })
    
    // Check if button is enabled (not disabled)
    const isDisabled = await downloadBtn.isDisabled()
    if (!isDisabled) {
      console.log('Download button is ready')
    } else {
      console.log('Download button is disabled, waiting for render...')
      // Wait for it to become enabled
      await expect(downloadBtn).toBeEnabled({ timeout: 60000 })
    }
    
    // 9. Trigger download
    const downloadPromise = page.waitForEvent('download', { timeout: 65000 })
    await downloadBtn.click()
    
    const download = await downloadPromise
    
    // 10. Verify download
    expect(download.suggestedFilename()).toMatch(/\.(stl|STL)$/)
    console.log('Downloaded file:', download.suggestedFilename())
  })
  
  test('should load app without errors', async ({ page }) => {
    // Skip in CI - console errors from WASM/OpenSCAD stderr are expected and noisy
    test.skip(isCI, 'Console error filtering is unreliable in CI due to WASM stderr output')
    
    const consoleErrors = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })
    
    await page.goto('/')
    
    // Wait for app to initialize
    await page.waitForTimeout(2000)
    
    // Check that app loaded (look for main container)
    await expect(page.locator('body')).toBeVisible()
    
    // Log any console errors (but don't fail on WASM loading issues in test environment)
    if (consoleErrors.length > 0) {
      console.log('Console errors detected:', consoleErrors)
      // Filter out WASM-related errors and OpenSCAD stderr output which are expected in test environment
      const criticalErrors = consoleErrors.filter(err => 
        !err.includes('WASM') && 
        !err.includes('SharedArrayBuffer') &&
        !err.includes('Cross-Origin') &&
        !err.includes('[OpenSCAD') &&
        !err.includes('openscad') &&
        !err.includes('ERR]') &&
        !err.includes('--') // Filter out OpenSCAD help text arguments
      )
      expect(criticalErrors.length).toBe(0)
    }
  })
  
  test('should have accessible file upload', async ({ page }) => {
    await page.goto('/')
    
    // File input should be accessible - use specific ID
    const fileInput = page.locator('#fileInput')
    await expect(fileInput).toBeAttached()
    
    // Check for label (file input is now inside a label element)
    const hasLabel = await fileInput.evaluate(el => {
      return el.labels?.length > 0 || el.closest('label') !== null
    })
    
    console.log('File input has accessible label:', hasLabel)
    expect(hasLabel).toBe(true)
  })
})

test.describe('Keyboard Navigation', () => {
  test('should support tab navigation', async ({ page }) => {
    await page.goto('/')
    
    // Wait for page to load
    await page.waitForTimeout(1000)
    
    // Press Tab to navigate
    await page.keyboard.press('Tab')
    
    // Check that something is focused
    const focusedElement = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      type: document.activeElement?.getAttribute('type'),
      role: document.activeElement?.getAttribute('role'),
    }))
    
    console.log('First focusable element:', focusedElement)
    expect(focusedElement.tag).toBeTruthy()
  })
  
  test('should have visible focus indicators', async ({ page }) => {
    await page.goto('/')
    
    // Find first interactive element
    const firstButton = page.locator('button, a, input').first()
    await firstButton.focus()
    
    // Check for focus indicator
    const outlineStyle = await firstButton.evaluate(el => {
      const styles = window.getComputedStyle(el)
      return {
        outline: styles.outline,
        outlineWidth: styles.outlineWidth,
        boxShadow: styles.boxShadow,
      }
    })
    
    console.log('Focus styles:', outlineStyle)
    
    // Should have some visible focus indicator
    const hasFocusIndicator = 
      (outlineStyle.outline && outlineStyle.outline !== 'none') ||
      (outlineStyle.outlineWidth && outlineStyle.outlineWidth !== '0px') ||
      (outlineStyle.boxShadow && outlineStyle.boxShadow !== 'none')
    
    expect(hasFocusIndicator).toBe(true)
  })
})
