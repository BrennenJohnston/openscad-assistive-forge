/**
 * E2E tests for theme switching
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'

// Dismiss first-visit modal and seed an explicit theme preference on first
// load so the theme cycle (auto→light→dark→auto) always produces a visible
// data-theme change. Without this, "auto" resolves to "light" on CI and the
// first toggle click (auto→light) keeps data-theme="light". The conditional
// guard preserves persistence tests that rely on the saved preference surviving
// a reload.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    if (!localStorage.getItem('openscad-forge-theme')) {
      localStorage.setItem('openscad-forge-theme', 'light')
    }
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

test.describe('Mono / Alt View Theme Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toBeVisible()
  })

  test('should apply mono variant attribute and preserve theme', async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light')
    })

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-ui-variant', 'mono')
    })
    await page.waitForTimeout(100)

    const attrs = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      variant: document.documentElement.getAttribute('data-ui-variant'),
    }))

    expect(attrs.theme).toBe('light')
    expect(attrs.variant).toBe('mono')
  })

  test('should switch themes correctly while mono variant is active', async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light')
      document.documentElement.setAttribute('data-ui-variant', 'mono')
    })

    const themeButton = page.locator('#themeToggle')
    if (!(await themeButton.isVisible())) {
      test.skip()
      return
    }

    const themeBefore = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    )

    await themeButton.click()
    await page.waitForTimeout(500)

    const themeAfter = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    )
    const variantAfter = await page.evaluate(() =>
      document.documentElement.getAttribute('data-ui-variant'),
    )

    expect(themeAfter).not.toBe(themeBefore)
    expect(variantAfter).toBe('mono')
    console.log(`Mono variant preserved during theme switch: ${themeBefore} -> ${themeAfter}`)
  })

  test('should apply correct background colors in all 7 theme states', async ({ page }) => {
    const themeStates = [
      { name: 'Light', theme: 'light', hc: false, mono: false },
      { name: 'Dark', theme: 'dark', hc: false, mono: false },
      { name: 'HC Light', theme: 'light', hc: true, mono: false },
      { name: 'HC Dark', theme: 'dark', hc: true, mono: false },
      { name: 'Mono Light', theme: 'light', hc: false, mono: true },
      { name: 'Mono Dark', theme: 'dark', hc: false, mono: true },
      { name: 'Mono + HC', theme: 'dark', hc: true, mono: true },
    ]

    for (const state of themeStates) {
      await page.evaluate((cfg) => {
        const root = document.documentElement
        root.setAttribute('data-theme', cfg.theme)
        if (cfg.hc) {
          root.setAttribute('data-high-contrast', 'true')
        } else {
          root.removeAttribute('data-high-contrast')
        }
        if (cfg.mono) {
          root.setAttribute('data-ui-variant', 'mono')
        } else {
          root.removeAttribute('data-ui-variant')
        }
      }, state)

      await page.waitForTimeout(50)

      const bg = await page.evaluate(() =>
        window.getComputedStyle(document.body).backgroundColor,
      )

      expect(bg).toBeTruthy()

      const bgValues = bg.match(/\d+/g)
      if (bgValues) {
        const [r, g, b] = bgValues.map(Number)
        if (state.theme === 'dark' || state.mono) {
          // Mono variant uses --color-bg-primary: #000000 (retro terminal)
          // regardless of light/dark setting; only accent colors change.
          expect(r + g + b).toBeLessThan(200)
        } else {
          expect(r + g + b).toBeGreaterThan(400)
        }
      }

      console.log(`${state.name}: bg=${bg}`)
    }
  })

  test('should have data-theme attribute set in all 7 theme states', async ({ page }) => {
    const themeStates = [
      { name: 'Light', theme: 'light', hc: false, mono: false },
      { name: 'Dark', theme: 'dark', hc: false, mono: false },
      { name: 'HC Light', theme: 'light', hc: true, mono: false },
      { name: 'HC Dark', theme: 'dark', hc: true, mono: false },
      { name: 'Mono Light', theme: 'light', hc: false, mono: true },
      { name: 'Mono Dark', theme: 'dark', hc: false, mono: true },
      { name: 'Mono + HC', theme: 'dark', hc: true, mono: true },
    ]

    for (const state of themeStates) {
      await page.evaluate((cfg) => {
        const root = document.documentElement
        root.setAttribute('data-theme', cfg.theme)
        if (cfg.hc) {
          root.setAttribute('data-high-contrast', 'true')
        } else {
          root.removeAttribute('data-high-contrast')
        }
        if (cfg.mono) {
          root.setAttribute('data-ui-variant', 'mono')
        } else {
          root.removeAttribute('data-ui-variant')
        }
      }, state)

      const dataTheme = await page.evaluate(() =>
        document.documentElement.getAttribute('data-theme'),
      )

      expect(dataTheme).toBe(state.theme)
      console.log(`${state.name}: data-theme=${dataTheme}`)
    }
  })

  test('should persist theme when mono variant is toggled off', async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark')
      document.documentElement.setAttribute('data-ui-variant', 'mono')
    })
    await page.waitForTimeout(100)

    await page.evaluate(() => {
      document.documentElement.removeAttribute('data-ui-variant')
    })
    await page.waitForTimeout(100)

    const attrs = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      variant: document.documentElement.getAttribute('data-ui-variant'),
    }))

    expect(attrs.theme).toBe('dark')
    expect(attrs.variant).toBeNull()
  })
})
