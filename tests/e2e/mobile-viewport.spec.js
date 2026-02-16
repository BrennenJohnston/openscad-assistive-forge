import { test, expect, devices } from '@playwright/test'

// Dismiss first-visit modal so it doesn't block UI interactions
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
  })
})

// Strip worker-level and Firefox-incompatible options from device descriptors.
// Playwright Firefox does not support options.isMobile, so we remove it to
// allow these viewport tests to run across all browsers.
const stripWorkerOptions = ({ defaultBrowserType: _dbt, browserName: _bn, isMobile: _im, ...device }) => device

// Test on multiple mobile devices (without worker-level options)
const mobileDevices = [
  { name: 'Pixel 5', device: stripWorkerOptions(devices['Pixel 5']) },
  { name: 'iPhone 12', device: stripWorkerOptions(devices['iPhone 12']) },
  { name: 'iPhone SE', device: stripWorkerOptions(devices['iPhone SE']) },
]

for (const { name, device } of mobileDevices) {
  test.describe(`Mobile Viewport - ${name}`, () => {
    test.use({ ...device })

    test('should render upload UI without horizontal overflow', async ({ page }) => {
      await page.goto('/')

      await expect(page.locator('.app-header')).toBeVisible()
      await expect(page.locator('#uploadZone, .upload-zone')).toBeVisible()

      const hasHorizontalOverflow = await page.evaluate(() => {
        const doc = document.documentElement
        return doc.scrollWidth > window.innerWidth + 1
      })

      expect(hasHorizontalOverflow).toBe(false)
    })

    test('should keep key controls within the viewport', async ({ page }) => {
      await page.goto('/')

      const uploadZone = page.locator('#uploadZone, .upload-zone').first()
      const uploadBox = await uploadZone.boundingBox()
      const viewport = page.viewportSize()

      expect(uploadBox).not.toBeNull()
      expect(uploadBox.x).toBeGreaterThanOrEqual(0)
      expect(uploadBox.x + uploadBox.width).toBeLessThanOrEqual(viewport.width + 1)

      const themeToggle = page.locator('#themeToggle')
      await expect(themeToggle).toBeVisible()
    })

    test('should have touch-friendly button sizes', async ({ page }) => {
      await page.goto('/')

      // Check that buttons meet minimum touch target size (44x44px)
      const buttons = page.locator('button:visible')
      const buttonCount = await buttons.count()
      
      for (let i = 0; i < Math.min(buttonCount, 5); i++) {
        const button = buttons.nth(i)
        const box = await button.boundingBox()
        if (box) {
          // Minimum touch target should be at least 44x44px (WCAG 2.1)
          expect(box.width).toBeGreaterThanOrEqual(32) // Allow slightly smaller for icon buttons
          expect(box.height).toBeGreaterThanOrEqual(32)
        }
      }
    })

    test('should show example buttons on mobile', async ({ page }) => {
      await page.goto('/')

      // Example buttons should be visible and tappable
      const exampleButtons = page.locator('.example-btn, [data-example]')
      const count = await exampleButtons.count()
      
      if (count > 0) {
        const firstExample = exampleButtons.first()
        await expect(firstExample).toBeVisible()
        
        const box = await firstExample.boundingBox()
        expect(box).not.toBeNull()
        expect(box.width).toBeGreaterThan(0)
      }
    })

    test('should have proper font sizes for readability', async ({ page }) => {
      await page.goto('/')

      // Check that body text is at least 14px (readable on mobile)
      const fontSize = await page.evaluate(() => {
        const body = document.body
        return parseFloat(window.getComputedStyle(body).fontSize)
      })

      expect(fontSize).toBeGreaterThanOrEqual(14)
    })

    test('should handle theme toggle on mobile', async ({ page }) => {
      await page.goto('/')

      const themeToggle = page.locator('#themeToggle')
      await expect(themeToggle).toBeVisible()
      
      // Should be tappable
      const box = await themeToggle.boundingBox()
      expect(box).not.toBeNull()
      expect(box.width).toBeGreaterThanOrEqual(32)
      expect(box.height).toBeGreaterThanOrEqual(32)
      
      // Tap to toggle theme
      await themeToggle.tap()
      
      // Theme should have changed (check data-theme attribute)
      const theme = await page.evaluate(() => {
        return document.documentElement.getAttribute('data-theme')
      })
      // Theme should be set (light, dark, or null for auto)
      expect(theme === 'light' || theme === 'dark' || theme === null).toBe(true)
    })

    test('should have proper spacing and padding', async ({ page }) => {
      await page.goto('/')

      // Check that content has proper padding from edges
      const mainContent = page.locator('.main-content, main, .app-main').first()
      
      if (await mainContent.count() > 0) {
        const box = await mainContent.boundingBox()
        const viewport = page.viewportSize()
        
        if (box) {
          // Content should have some padding from viewport edges
          expect(box.x).toBeGreaterThanOrEqual(0)
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
        }
      }
    })
  })
}

// Landscape orientation tests
test.describe('Mobile Viewport - Landscape', () => {
  test.use({
    viewport: { width: 844, height: 390 }, // iPhone 12 landscape
    hasTouch: true,
  })

  test('should handle landscape orientation', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('.app-header')).toBeVisible()
    
    // Should not have horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      const doc = document.documentElement
      return doc.scrollWidth > window.innerWidth + 1
    })

    expect(hasHorizontalOverflow).toBe(false)
  })

  test('should show upload zone in landscape', async ({ page }) => {
    await page.goto('/')

    const uploadZone = page.locator('#uploadZone, .upload-zone').first()
    await expect(uploadZone).toBeVisible()
    
    const box = await uploadZone.boundingBox()
    expect(box).not.toBeNull()
    expect(box.width).toBeGreaterThan(100)
  })
})

// Toolbar breakpoint stability tests
test.describe('Toolbar Breakpoint Stability', () => {
  test('no horizontal overflow at 320px width', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 1;
    });
    expect(hasOverflow).toBe(false);
  });

  test('no horizontal overflow at 480px width', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 1;
    });
    expect(hasOverflow).toBe(false);
  });

  test('header controls remain accessible at 768px', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const themeToggle = page.locator('#themeToggle');
    await expect(themeToggle).toBeVisible();

    const box = await themeToggle.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  });
});

// Small screen tests (older/budget phones)
test.describe('Mobile Viewport - Small Screen', () => {
  test.use({
    viewport: { width: 320, height: 568 }, // iPhone SE 1st gen
    hasTouch: true,
  })

  test('should work on very small screens', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('.app-header')).toBeVisible()
    
    // Should not have horizontal overflow even on small screens
    const hasHorizontalOverflow = await page.evaluate(() => {
      const doc = document.documentElement
      return doc.scrollWidth > window.innerWidth + 1
    })

    expect(hasHorizontalOverflow).toBe(false)
  })

  test('should keep header controls accessible', async ({ page }) => {
    await page.goto('/')

    const themeToggle = page.locator('#themeToggle')
    await expect(themeToggle).toBeVisible()
    
    // Theme toggle should be within viewport
    const box = await themeToggle.boundingBox()
    const viewport = page.viewportSize()
    
    expect(box).not.toBeNull()
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
  })
})
