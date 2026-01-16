import { test, expect, devices } from '@playwright/test'

test.use({ ...devices['Pixel 5'] })

test.describe('Mobile Viewport', () => {

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
})
