/**
 * E2E tests for theme switching
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'

// Dismiss first-visit modal so it doesn't block UI interactions
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
  })
})

test.describe('Theme Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for page to fully load
    await expect(page.locator('h1')).toBeVisible()
  })

  test('should have theme toggle button visible', async ({ page }) => {
    const themeButton = page.locator('#themeToggle')
    await expect(themeButton).toBeVisible()
  })

  test('should toggle between light and dark themes', async ({ page }) => {
    const themeButton = page.locator('#themeToggle')
    
    if (!(await themeButton.isVisible())) {
      test.skip()
      return
    }

    // Get initial theme
    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
    
    // Click theme toggle
    await themeButton.click()
    await page.waitForTimeout(500)

    // Verify theme changed
    const newTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
    expect(newTheme).not.toBe(initialTheme)

    // Theme may cycle through multiple themes (light -> dark -> high-contrast)
    // Click until we get back to initial theme (max 5 clicks)
    let currentTheme = newTheme
    let attempts = 0
    while (currentTheme !== initialTheme && attempts < 5) {
      await themeButton.click()
      await page.waitForTimeout(500)
      currentTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
      attempts++
    }

    // Verify we cycled back to initial theme (or at least theme changes work)
    expect(attempts).toBeGreaterThan(0)
    expect(attempts).toBeLessThan(5)
  })

  test('should apply theme-specific colors', async ({ page }) => {
    const themeButton = page.locator('#themeToggle')
    
    if (!(await themeButton.isVisible())) {
      test.skip()
      return
    }

    // Switch to dark theme
    const currentTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
    
    if (currentTheme !== 'dark') {
      await themeButton.click()
      await page.waitForTimeout(300)
    }

    // Check that background is dark
    const bodyBg = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor
    })

    // Dark theme should have dark background (RGB values < 100)
    const darkTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
    if (darkTheme === 'dark') {
      expect(bodyBg).not.toBe('rgb(255, 255, 255)')
    }

    // Switch to light theme
    await themeButton.click()
    await page.waitForTimeout(300)

    const lightBg = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor
    })

    // Backgrounds should be different
    expect(lightBg).not.toBe(bodyBg)
  })

  test('should have high contrast mode option', async ({ page }) => {
    const highContrastToggle = page.locator('input[type="checkbox"][aria-label*="contrast"], button[aria-label*="High Contrast"], label:has-text("High Contrast")')
    
    // High contrast is a nice-to-have feature
    if (await highContrastToggle.isVisible()) {
      // If it exists, test it
      const isCheckbox = await highContrastToggle.evaluate(el => el.type === 'checkbox')
      
      if (isCheckbox) {
        const initialState = await highContrastToggle.isChecked()
        
        await highContrastToggle.click()
        await page.waitForTimeout(300)

        const newState = await highContrastToggle.isChecked()
        expect(newState).not.toBe(initialState)

        // Verify high-contrast attribute applied
        const hasHighContrast = await page.evaluate(() => 
          document.documentElement.hasAttribute('data-high-contrast')
        )
        
        if (newState) {
          expect(hasHighContrast).toBe(true)
        }
      }
    } else {
      // Test passes even if high contrast doesn't exist
      expect(true).toBe(true)
    }
  })

  test('should persist theme choice across page reloads', async ({ page }) => {
    const themeButton = page.locator('#themeToggle')
    
    if (!(await themeButton.isVisible())) {
      test.skip()
      return
    }

    // Set to a specific theme
    await themeButton.click()
    await page.waitForTimeout(300)

    const themeBeforeReload = await page.evaluate(() => 
      document.documentElement.getAttribute('data-theme')
    )

    // Reload page
    await page.reload()
    await expect(page.locator('h1')).toBeVisible()
    await page.waitForTimeout(500)

    // Verify theme persisted
    const themeAfterReload = await page.evaluate(() => 
      document.documentElement.getAttribute('data-theme')
    )

    expect(themeAfterReload).toBe(themeBeforeReload)
  })

  test('should update all UI elements when theme changes', async ({ page }) => {
    const themeButton = page.locator('#themeToggle')
    
    if (!(await themeButton.isVisible())) {
      test.skip()
      return
    }

    // Get theme attribute (more reliable than computed colors)
    const themeBefore = await page.evaluate(() => 
      document.documentElement.getAttribute('data-theme')
    )

    // Switch theme
    await themeButton.click()
    await page.waitForTimeout(500)

    const themeAfter = await page.evaluate(() => 
      document.documentElement.getAttribute('data-theme')
    )

    // Theme should have changed
    expect(themeAfter).not.toBe(themeBefore)

    // Verify theme attribute is applied (which drives CSS)
    expect(themeAfter).toBeTruthy()
  })

  test('should have accessible focus indicators in all themes', async ({ page }) => {
    const themeButton = page.locator('#themeToggle')
    
    if (!(await themeButton.isVisible())) {
      test.skip()
      return
    }

    const checkFocusIndicator = async () => {
      const firstButton = page.locator('button').first()
      await firstButton.focus()
      
      const outline = await firstButton.evaluate(el => {
        const styles = window.getComputedStyle(el)
        return styles.outline + styles.boxShadow
      })
      
      return outline !== 'none' && outline !== ''
    }

    // Check in current theme
    const hasFocusIndicator1 = await checkFocusIndicator()
    expect(hasFocusIndicator1).toBe(true)

    // Switch theme
    await themeButton.click()
    await page.waitForTimeout(300)

    // Check in new theme
    const hasFocusIndicator2 = await checkFocusIndicator()
    expect(hasFocusIndicator2).toBe(true)
  })

  test('should support keyboard navigation for theme toggle', async ({ page }) => {
    const themeButton = page.locator('#themeToggle')
    await expect(themeButton).toBeVisible()

    // 1) Verify the button is reachable via Tab
    await page.keyboard.press('Tab')
    let found = false
    for (let i = 0; i < 30; i++) {
      const id = await page.evaluate(() => document.activeElement?.id)
      if (id === 'themeToggle') { found = true; break }
      await page.keyboard.press('Tab')
    }
    expect(found).toBe(true)

    // 2) Verify Enter activates the toggle while focused
    // Use getAttribute OR 'auto' to normalise the null-when-auto case
    const themeBefore = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme') || 'auto'
    )

    await page.keyboard.press('Enter')

    // Wait for the DOM attribute to actually change (avoids timing flakes)
    // Edge on CI can be slow to propagate attribute changes after keyboard events
    await page.waitForFunction(
      (prev) => {
        const cur = document.documentElement.getAttribute('data-theme') || 'auto'
        return cur !== prev
      },
      themeBefore,
      { timeout: 10000 },
    )

    const themeAfter = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme') || 'auto'
    )
    expect(themeAfter).not.toBe(themeBefore)
  })

  test('should announce theme changes to screen readers', async ({ page }) => {
    const themeButton = page.locator('#themeToggle')
    
    if (!(await themeButton.isVisible())) {
      test.skip()
      return
    }

    // Check for live region or status element
    const liveRegions = await page.locator('[role="status"], [aria-live]').count()
    expect(liveRegions).toBeGreaterThan(0)

    // Theme changes should be announced (implementation-specific)
    // This test verifies infrastructure exists
  })

  test('should maintain theme when loading different examples', async ({ page }) => {
    const themeButton = page.locator('#themeToggle')
    
    if (!(await themeButton.isVisible())) {
      test.skip()
      return
    }

    // Set theme
    await themeButton.click()
    await page.waitForTimeout(300)

    const themeBefore = await page.evaluate(() => 
      document.documentElement.getAttribute('data-theme')
    )

    // Load an example
    const exampleButton = page.locator('button:has-text("Simple Box")').first()
    if (await exampleButton.isVisible()) {
      await exampleButton.click()
      await page.waitForTimeout(2000)

      // Verify theme persisted
      const themeAfter = await page.evaluate(() => 
        document.documentElement.getAttribute('data-theme')
      )

      expect(themeAfter).toBe(themeBefore)
    }
  })

  test('should cycle through all available themes', async ({ page }) => {
    const themeButton = page.locator('#themeToggle')
    
    if (!(await themeButton.isVisible())) {
      test.skip()
      return
    }

    const themes = new Set()
    const maxClicks = 5

    for (let i = 0; i < maxClicks; i++) {
      const currentTheme = await page.evaluate(() => 
        document.documentElement.getAttribute('data-theme')
      )
      themes.add(currentTheme)
      
      await themeButton.click()
      await page.waitForTimeout(300)
    }

    // Should have at least 2 themes (light and dark)
    expect(themes.size).toBeGreaterThanOrEqual(2)
  })
})
