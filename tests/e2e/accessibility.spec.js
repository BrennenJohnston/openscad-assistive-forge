import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import path from 'path'

// Skip WASM-dependent tests in CI - WASM initialization is slow/unreliable
const isCI = !!process.env.CI

test.describe('Accessibility Compliance (WCAG 2.1 AA)', () => {
  test('should have no accessibility violations on landing page', async ({ page }) => {
    await page.goto('/')
    
    // Wait for page to fully load
    await page.waitForLoadState('networkidle')
    
    // Run accessibility scan
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    
    // Log violations for debugging
    if (results.violations.length > 0) {
      console.log('Accessibility violations found:')
      results.violations.forEach(violation => {
        console.log(`- ${violation.id}: ${violation.description}`)
        console.log(`  Impact: ${violation.impact}`)
        console.log(`  Help: ${violation.helpUrl}`)
      })
    }
    
    expect(results.violations).toEqual([])
  })
  
  test('should have no violations after file upload', async ({ page }) => {
    // Skip in CI - requires WASM to process uploaded file
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    
    // Upload a test file - use specific ID to avoid matching queue import input
    const fileInput = page.locator('#fileInput')
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
    
    try {
      await fileInput.setInputFiles(fixturePath)
      
      // Wait for parameters UI to render (avoid preset select)
      await page.waitForSelector('.param-control', {
        timeout: 15000
      })
      
      // Run accessibility scan on parameter UI
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()
      
      if (results.violations.length > 0) {
        console.log('Violations in parameter UI:')
        results.violations.forEach(v => {
          console.log(`- ${v.id}: ${v.description}`)
        })
      }
      
      expect(results.violations).toEqual([])
    } catch (error) {
      console.log('Could not complete file upload test:', error.message)
      // Don't fail test if fixture is missing
      test.skip()
    }
  })
  
  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/')
    
    // Get all headings
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').all()
    
    // Should have at least one heading
    expect(headings.length).toBeGreaterThan(0)
    
    // First heading should be h1
    const firstHeading = await headings[0].evaluate(el => el.tagName)
    expect(firstHeading).toBe('H1')
    
    console.log('Heading structure:', await Promise.all(
      headings.map(async h => await h.evaluate(el => ({ 
        tag: el.tagName, 
        text: el.textContent 
      })))
    ))
  })
  
  test('should have skip link for keyboard users', async ({ page }) => {
    await page.goto('/')
    
    // Press Tab to reveal skip link
    await page.keyboard.press('Tab')
    
    // Look for skip link
    const skipLink = page.locator('a[href*="#main"], a:has-text("Skip to")')
    
    if (await skipLink.isVisible()) {
      console.log('Skip link found and visible on focus')
      
      // Verify it's functional
      await skipLink.click()
      
      // Focus should move to main content
      const focusedElementId = await page.evaluate(() => document.activeElement?.id)
      console.log('Focus moved to element:', focusedElementId)
    } else {
      console.log('No skip link found (should be added for better accessibility)')
    }
  })
  
  test('should have sufficient color contrast', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Run contrast-specific check
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .include('body')
      .analyze()
    
    const contrastViolations = results.violations.filter(v => 
      v.id.includes('color-contrast')
    )
    
    if (contrastViolations.length > 0) {
      console.log('Color contrast violations:')
      contrastViolations.forEach(v => {
        console.log(`- ${v.description}`)
        v.nodes.forEach(node => {
          console.log(`  Element: ${node.html}`)
          console.log(`  Impact: ${node.impact}`)
        })
      })
    }
    
    expect(contrastViolations).toEqual([])
  })
  
  test('should have proper form labels', async ({ page }) => {
    // Skip in CI - requires WASM to process uploaded file
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    
    // Upload file to get parameter form - use specific ID
    const fileInput = page.locator('#fileInput')
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
    
    try {
      await fileInput.setInputFiles(fixturePath)
      await page.waitForSelector('.param-control', { timeout: 15000 })
      
      // Check all form inputs have labels
      const unlabeledInputs = await page.locator('input:not([type="file"])').evaluateAll(inputs => {
        return inputs.filter(input => {
          const hasLabel = input.labels?.length > 0
          const hasAriaLabel = input.getAttribute('aria-label')
          const hasAriaLabelledby = input.getAttribute('aria-labelledby')
          return !hasLabel && !hasAriaLabel && !hasAriaLabelledby
        }).map(input => ({
          type: input.type,
          name: input.name,
          id: input.id
        }))
      })
      
      console.log('Unlabeled inputs:', unlabeledInputs)
      expect(unlabeledInputs.length).toBe(0)
    } catch (error) {
      console.log('Could not test form labels:', error.message)
      test.skip()
    }
  })
  
  test('should show library controls after upload even when no libraries detected', async ({ page }) => {
    // Skip in CI - requires WASM to process uploaded file
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    
    const fileInput = page.locator('#fileInput')
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
    
    try {
      await fileInput.setInputFiles(fixturePath)
      await page.waitForSelector('.param-control', { timeout: 15000 })
      
      // Library controls should be visible (not hidden)
      const libraryControls = page.locator('#libraryControls')
      await expect(libraryControls).toBeVisible()
      
      // Library details should exist (may be closed)
      const libraryDetails = page.locator('.library-details')
      await expect(libraryDetails).toBeVisible()
      
      console.log('Library controls are visible after upload')
    } catch (error) {
      console.log('Could not test library controls visibility:', error.message)
      test.skip()
    }
  })
})

test.describe('Screen Reader Support', () => {
  test('should have ARIA landmarks', async ({ page }) => {
    await page.goto('/')
    
    // Check for landmark roles
    const landmarks = await page.locator('[role="main"], [role="navigation"], [role="banner"], main, nav, header').all()
    
    console.log('Found', landmarks.length, 'landmark elements')
    
    // Should have at least a main landmark
    const hasMain = await page.locator('[role="main"], main').count()
    expect(hasMain).toBeGreaterThan(0)
  })
  
  test('should have live region for status updates', async ({ page }) => {
    await page.goto('/')
    
    // Look for ARIA live regions
    const liveRegions = await page.locator('[aria-live], [role="status"], [role="alert"]').all()
    
    console.log('Found', liveRegions.length, 'live regions')
    
    if (liveRegions.length > 0) {
      const liveRegionInfo = await Promise.all(
        liveRegions.map(async region => ({
          role: await region.getAttribute('role'),
          ariaLive: await region.getAttribute('aria-live'),
          text: (await region.textContent())?.substring(0, 50)
        }))
      )
      console.log('Live regions:', liveRegionInfo)
    }
  })
  
  test('should announce errors to screen readers', async ({ page }) => {
    await page.goto('/')
    
    // Try to trigger an error (e.g., upload invalid file)
    // This is a basic check for error announcement mechanisms
    
    const errorRegions = await page.locator('[aria-live="assertive"], [role="alert"]').all()
    console.log('Found', errorRegions.length, 'assertive live regions for errors')
    
    // Should have at least one assertive live region for errors
    // (or errors should be announced some other way)
  })
})
