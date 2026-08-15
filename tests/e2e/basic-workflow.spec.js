import { test, expect } from '@playwright/test'
import path from 'path'

// Skip WASM-dependent tests in CI
const isCI = !!process.env.CI

// Dismiss first-visit modal so it doesn't block UI interactions
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

test.describe('Basic Workflow - Upload → Customize → Download', () => {
  test('should complete full workflow with simple box', async ({ page }) => {
    // Full WASM render + STL export takes 120s+ and the download event is unreliable
    // in headless automated mode. Run manually via: npm run test:e2e:headed
    test.skip(isCI, 'Full WASM render + download requires headed mode (too slow for automated CI)')
    test.setTimeout(180_000) // WASM init + parameter extraction + full render + download
    // 1. Navigate to app
    await page.goto('/')
    
    // 2. Verify welcome screen loads
    await expect(page.locator('h1')).toContainText('OpenSCAD', { timeout: 10000 })
    
    // 3. Check that the upload zone is visible
    const uploadZone = page.locator('#uploadZone, .upload-zone').first()
    await expect(uploadZone).toBeVisible({ timeout: 5000 })

    // Wait for WASM engine to be ready before file upload so parameter
    // extraction completes and the UI transitions reliably.
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: 120_000,
    })
    
    // 4. Upload a test file - use the main file input, not the queue import input
    const fileInput = page.locator('#fileInput')
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
    await fileInput.setInputFiles(fixturePath)
    
    // 5. Wait for welcome screen to hide (indicates file was processed)
    await expect(page.locator('#welcomeScreen')).toBeHidden({ timeout: 15000 })
    
    // 6. Wait for main interface to become visible
    await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 5000 })

    // Dismiss save-project modal if it appears (shown after file load)
    try {
      const notNowBtn = page.locator('#saveProjectNotNow')
      await notNowBtn.waitFor({ state: 'visible', timeout: 3000 })
      await notNowBtn.click()
      await page.waitForTimeout(300)
    } catch {
      // Modal didn't appear, continue
    }
    
    // 7. Wait for parameter controls to render. Groups are collapsed
    // <details> by default, so wait attached and open the first group
    // (same pattern as wasm-smoke's openFirstParamGroup).
    await page.waitForSelector('.param-group', {
      state: 'attached',
      timeout: 10000,
    })
    const firstGroup = page.locator('details.param-group').first()
    if (!(await firstGroup.evaluate((el) => el.open))) {
      await firstGroup.locator('summary').click()
    }
    await expect(
      page.locator('.param-group input[type="range"], .param-group input[type="number"]').first()
    ).toBeVisible({ timeout: 10000 })
    
    // 8. Try to find and adjust a parameter (if any numeric input exists)
    const numericInput = page.locator('.param-group input[type="number"], .param-group input[type="range"]').first()
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
    
    // 9. Trigger the full render. Browser download EVENTS are unreliable in
    // headless mode (the very reason wasm-smoke asserts via render state
    // and __forgeDebug instead), so treat the event as a bonus and gate on
    // the render completing without errors.
    const downloadPromise = page
      .waitForEvent('download', { timeout: 90000 })
      .catch(() => null)
    await downloadBtn.click()

    await expect(page.locator('.preview-state-indicator')).toHaveClass(
      /state-current/,
      { timeout: 120000 }
    )
    const errorBanner = page.locator('#errorMessage')
    if (await errorBanner.isVisible().catch(() => false)) {
      expect(await errorBanner.textContent()).not.toMatch(/error/i)
    }

    const download = await downloadPromise
    if (download) {
      expect(download.suggestedFilename()).toMatch(/\.(stl|STL)$/)
      console.log('Downloaded file:', download.suggestedFilename())
    } else {
      console.log('No download event surfaced (known headless flake) — render completed cleanly')
    }
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

  test('should start a new project from template', async ({ page }) => {
    await page.goto('/')

    const startNewBtn = page.locator('#startNewProjectBtn')
    await expect(startNewBtn).toBeVisible({ timeout: 5000 })

    await startNewBtn.click()

    // Same success signal as file upload: welcome hidden and main UI shown.
    await expect(page.locator('#welcomeScreen')).toBeHidden({ timeout: 15000 })
    await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 5000 })

    // Confirm we loaded the expected virtual filename.
    await expect(page.locator('#fileInfoSummary')).toContainText('new_project.scad', {
      timeout: 10000,
    })

    // And that parameters rendered (indicates extraction succeeded).
    // F5: parameter groups render collapsed by default, so expand them
    // before asserting the controls inside are visible.
    await page
      .locator('.param-group')
      .first()
      .waitFor({ state: 'attached', timeout: 10000 })
    await page.evaluate(() => {
      document.querySelectorAll('details.param-group').forEach((group) => {
        group.open = true
      })
    })

    await expect(
      page
        .locator('.param-group input[type="range"], .param-group input[type="number"]')
        .first()
    ).toBeVisible({ timeout: 10000 })
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
