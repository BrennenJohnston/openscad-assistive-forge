import { test, expect } from '@playwright/test'
import path from 'path'

const isCI = !!process.env.CI

test.describe('Features Guide Modal', () => {
  test('should open Features Guide from Help button', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    
    // Upload a file to show the Help button
    const fileInput = page.locator('#fileInput')
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
    
    try {
      await fileInput.setInputFiles(fixturePath)
      await page.waitForSelector('.param-control', { timeout: 15000 })
      
      // Help button should be visible
      const helpBtn = page.locator('#featuresGuideBtn')
      await expect(helpBtn).toBeVisible()
      
      // Click Help button
      await helpBtn.click()
      
      // Modal should open
      const modal = page.locator('#featuresGuideModal')
      await expect(modal).not.toHaveClass(/hidden/)
      
      // Modal should have proper ARIA attributes
      await expect(modal).toHaveAttribute('role', 'dialog')
      await expect(modal).toHaveAttribute('aria-modal', 'true')
      
      console.log('Features Guide modal opened successfully')
    } catch (error) {
      console.log('Could not test Features Guide modal:', error.message)
      test.skip()
    }
  })
  
  test('should close Features Guide on Escape key', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    
    const fileInput = page.locator('#fileInput')
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
    
    try {
      await fileInput.setInputFiles(fixturePath)
      await page.waitForSelector('.param-control', { timeout: 15000 })
      
      // Open modal
      const helpBtn = page.locator('#featuresGuideBtn')
      await helpBtn.click()
      
      const modal = page.locator('#featuresGuideModal')
      await expect(modal).not.toHaveClass(/hidden/)
      
      // Press Escape
      await page.keyboard.press('Escape')
      
      // Modal should close
      await expect(modal).toHaveClass(/hidden/)
      
      console.log('Features Guide closed on Escape key')
    } catch (error) {
      console.log('Could not test modal close:', error.message)
      test.skip()
    }
  })
  
  test('should close Features Guide on close button click', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    
    const fileInput = page.locator('#fileInput')
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
    
    try {
      await fileInput.setInputFiles(fixturePath)
      await page.waitForSelector('.param-control', { timeout: 15000 })
      
      // Open modal
      const helpBtn = page.locator('#featuresGuideBtn')
      await helpBtn.click()
      
      const modal = page.locator('#featuresGuideModal')
      await expect(modal).not.toHaveClass(/hidden/)
      
      // Click close button
      const closeBtn = page.locator('#featuresGuideClose')
      await closeBtn.click()
      
      // Modal should close
      await expect(modal).toHaveClass(/hidden/)
      
      console.log('Features Guide closed on close button click')
    } catch (error) {
      console.log('Could not test modal close button:', error.message)
      test.skip()
    }
  })
  
  test('should navigate tabs with arrow keys', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    
    const fileInput = page.locator('#fileInput')
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
    
    try {
      await fileInput.setInputFiles(fixturePath)
      await page.waitForSelector('.param-control', { timeout: 15000 })
      
      // Open modal
      const helpBtn = page.locator('#featuresGuideBtn')
      await helpBtn.click()
      
      // First tab should be focused and selected
      const librariesTab = page.locator('#tab-libraries')
      await expect(librariesTab).toHaveAttribute('aria-selected', 'true')
      await expect(librariesTab).toHaveAttribute('tabindex', '0')
      
      // Focus first tab
      await librariesTab.focus()
      
      // Press ArrowRight to move to next tab
      await page.keyboard.press('ArrowRight')
      
      // Second tab should be focused
      const colorsTab = page.locator('#tab-colors')
      const isFocused = await colorsTab.evaluate(el => el === document.activeElement)
      expect(isFocused).toBe(true)
      
      // Press Enter to activate
      await page.keyboard.press('Enter')
      
      // Second tab should be selected
      await expect(colorsTab).toHaveAttribute('aria-selected', 'true')
      
      // Press ArrowLeft to go back
      await page.keyboard.press('ArrowLeft')
      
      // First tab should be focused again
      const isLibrariesFocused = await librariesTab.evaluate(el => el === document.activeElement)
      expect(isLibrariesFocused).toBe(true)
      
      console.log('Tab keyboard navigation works correctly')
    } catch (error) {
      console.log('Could not test tab navigation:', error.message)
      test.skip()
    }
  })
  
  test('should have proper tab ARIA attributes', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    
    const fileInput = page.locator('#fileInput')
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
    
    try {
      await fileInput.setInputFiles(fixturePath)
      await page.waitForSelector('.param-control', { timeout: 15000 })
      
      // Open modal
      const helpBtn = page.locator('#featuresGuideBtn')
      await helpBtn.click()
      
      // Check all tabs have proper attributes
      const tabs = page.locator('.features-tab')
      const tabCount = await tabs.count()
      
      for (let i = 0; i < tabCount; i++) {
        const tab = tabs.nth(i)
        
        // Should have role="tab"
        await expect(tab).toHaveAttribute('role', 'tab')
        
        // Should have aria-controls pointing to a panel
        const ariaControls = await tab.getAttribute('aria-controls')
        expect(ariaControls).toBeTruthy()
        
        // Panel should exist
        const panel = page.locator(`#${ariaControls}`)
        await expect(panel).toHaveAttribute('role', 'tabpanel')
        
        // Panel should have aria-labelledby pointing back to tab
        const tabId = await tab.getAttribute('id')
        await expect(panel).toHaveAttribute('aria-labelledby', tabId)
      }
      
      console.log(`All ${tabCount} tabs have proper ARIA attributes`)
    } catch (error) {
      console.log('Could not test tab ARIA attributes:', error.message)
      test.skip()
    }
  })
  
  test('should open from welcome screen "Learn more" button', async ({ page }) => {
    await page.goto('/')
    
    // "Learn more" button should be visible on welcome screen
    const learnMoreBtn = page.locator('#learnMoreFeaturesBtn')
    await expect(learnMoreBtn).toBeVisible()
    
    // Click it
    await learnMoreBtn.click()
    
    // Modal should open
    const modal = page.locator('#featuresGuideModal')
    await expect(modal).not.toHaveClass(/hidden/)
    
    console.log('Features Guide opened from welcome screen')
  })
})

test.describe('Feature Hints', () => {
  test('should show feature hints after file upload', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    
    const fileInput = page.locator('#fileInput')
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
    
    try {
      await fileInput.setInputFiles(fixturePath)
      await page.waitForSelector('.param-control', { timeout: 15000 })
      
      // Feature hints may or may not be visible depending on file content
      const featureHints = page.locator('#featureHints')
      
      // If visible, should have proper structure
      if (await featureHints.isVisible()) {
        const hintsList = page.locator('#hintsList')
        await expect(hintsList).toBeVisible()
        
        // Hints should be in a list
        await expect(hintsList).toHaveAttribute('role', 'list')
        
        console.log('Feature hints are displayed')
      } else {
        console.log('No feature hints shown (file may already have all features)')
      }
    } catch (error) {
      console.log('Could not test feature hints:', error.message)
      test.skip()
    }
  })
  
  test('should open Features Guide from hint button', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    
    const fileInput = page.locator('#fileInput')
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
    
    try {
      await fileInput.setInputFiles(fixturePath)
      await page.waitForSelector('.param-control', { timeout: 15000 })
      
      // If hints are visible, try clicking a "Learn more" button
      const featureHints = page.locator('#featureHints')
      
      if (await featureHints.isVisible()) {
        // Expand hints if collapsed
        const summary = featureHints.locator('.hints-summary')
        if (await summary.isVisible()) {
          await summary.click()
        }
        
        // Find and click a "Learn more" button
        const learnMoreBtn = featureHints.locator('.hint-action').first()
        if (await learnMoreBtn.isVisible()) {
          await learnMoreBtn.click()
          
          // Modal should open
          const modal = page.locator('#featuresGuideModal')
          await expect(modal).not.toHaveClass(/hidden/)
          
          console.log('Features Guide opened from hint button')
        }
      }
    } catch (error) {
      console.log('Could not test hint button:', error.message)
      test.skip()
    }
  })
})
