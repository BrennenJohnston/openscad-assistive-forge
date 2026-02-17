/**
 * Visual Regression Tests (Milestone 3: Performance & Stability)
 *
 * These tests capture screenshots of key UI states and compare them
 * against baseline snapshots to detect unintended visual changes.
 *
 * Run: npm run test:visual
 * Update baselines: npm run test:visual:update
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';

// Increase timeout for visual tests (loading takes time)
test.setTimeout(60000);

test.describe('Visual Regression - Core UI', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Wait for app to fully load
    await page.waitForSelector('#app', { state: 'visible' });

    // Wait for any initial animations to settle
    await page.waitForTimeout(500);
  });

  test('welcome screen layout', async ({ page }) => {
    // Ensure first-visit modal is visible (shown on first visit)
    const welcomeModal = page.locator('#first-visit-modal');
    
    // Modal may not appear if user has visited before (localStorage flag)
    // Try to show it or skip gracefully
    const isVisible = await welcomeModal.isVisible().catch(() => false);
    
    if (isVisible) {
      // Take screenshot of welcome modal
      await expect(page).toHaveScreenshot('welcome-screen.png', {
        maxDiffPixels: 100,
        threshold: 0.2,
      });
    } else {
      // Take screenshot of current state (modal may have been dismissed)
      await expect(page).toHaveScreenshot('welcome-screen.png', {
        maxDiffPixels: 200,
        threshold: 0.2,
      });
    }
  });

  test('main layout after dismissing welcome', async ({ page }) => {
    // Close first-visit modal if visible
    const welcomeModal = page.locator('#first-visit-modal');
    if (await welcomeModal.isVisible().catch(() => false)) {
      const closeBtn = page.locator('#first-visit-modal .modal-close, #first-visit-modal [aria-label*="close"], #first-visit-modal button.btn-primary');
      if (await closeBtn.first().isVisible().catch(() => false)) {
        await closeBtn.first().click();
        await page.waitForTimeout(300);
      }
    }

    // Wait for main UI to be visible
    await page.waitForSelector('.app-header', { state: 'visible' });

    // Take screenshot of main layout
    await expect(page).toHaveScreenshot('main-layout.png', {
      maxDiffPixels: 200,
      threshold: 0.2,
    });
  });

  test('header controls', async ({ page }) => {
    // Close first-visit modal if visible
    const welcomeModal = page.locator('#first-visit-modal');
    if (await welcomeModal.isVisible().catch(() => false)) {
      const closeBtn = page.locator('#first-visit-modal .modal-close, #first-visit-modal button.btn-primary');
      if (await closeBtn.first().isVisible().catch(() => false)) {
        await closeBtn.first().click();
        await page.waitForTimeout(300);
      }
    }

    // Screenshot just the header
    const header = page.locator('.app-header');
    await expect(header).toHaveScreenshot('header-controls.png', {
      maxDiffPixels: 50,
      threshold: 0.2,
    });
  });
});

test.describe('Visual Regression - Theme Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible' });

    // Close first-visit modal
    const welcomeModal = page.locator('#first-visit-modal');
    if (await welcomeModal.isVisible().catch(() => false)) {
      const closeBtn = page.locator('#first-visit-modal .modal-close, #first-visit-modal button.btn-primary');
      if (await closeBtn.first().isVisible().catch(() => false)) {
        await closeBtn.first().click();
        await page.waitForTimeout(300);
      }
    }
  });

  test('light theme', async ({ page }) => {
    // Ensure light theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await page.waitForTimeout(300);

    await expect(page).toHaveScreenshot('theme-light.png', {
      maxDiffPixels: 200,
      threshold: 0.2,
    });
  });

  test('dark theme', async ({ page }) => {
    // Switch to dark theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await page.waitForTimeout(300);

    await expect(page).toHaveScreenshot('theme-dark.png', {
      maxDiffPixels: 200,
      threshold: 0.2,
    });
  });

  test('high contrast mode', async ({ page }) => {
    // Enable high contrast
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-high-contrast', 'true');
    });
    await page.waitForTimeout(300);

    await expect(page).toHaveScreenshot('high-contrast.png', {
      maxDiffPixels: 200,
      threshold: 0.2,
    });
  });
});

test.describe('Visual Regression - Parameter Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible' });

    // Close first-visit modal and load example
    const welcomeModal = page.locator('#first-visit-modal');
    if (await welcomeModal.isVisible().catch(() => false)) {
      // Click simple box example if available
      const simpleBoxLink = page.locator('a[href*="simple-box"], button:has-text("Simple Box")');
      if (await simpleBoxLink.first().isVisible().catch(() => false)) {
        await simpleBoxLink.first().click();
        await page.waitForTimeout(1000);
      } else {
        const closeBtn = page.locator('#first-visit-modal .modal-close, #first-visit-modal button.btn-primary');
        if (await closeBtn.first().isVisible().catch(() => false)) {
          await closeBtn.first().click();
        }
      }
    }
  });

  test('parameter panel with controls', async ({ page }) => {
    // Wait for parameters to load
    const parameterPanel = page.locator('#parameterPanel, .parameter-panel');
    await parameterPanel.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {
      // Panel might not be visible if no file loaded
    });

    if (await parameterPanel.isVisible()) {
      await expect(parameterPanel).toHaveScreenshot('parameter-panel.png', {
        maxDiffPixels: 100,
        threshold: 0.2,
      });
    }
  });
});

test.describe('Visual Regression - Memory Warning UI', () => {
  test('memory badge states', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible' });

    // Close first-visit modal
    const welcomeModal = page.locator('#first-visit-modal');
    if (await welcomeModal.isVisible().catch(() => false)) {
      const closeBtn = page.locator('#first-visit-modal .modal-close, #first-visit-modal button.btn-primary');
      if (await closeBtn.first().isVisible().catch(() => false)) {
        await closeBtn.first().click();
        await page.waitForTimeout(300);
      }
    }

    // Show memory badge in warning state
    await page.evaluate(() => {
      const badge = document.getElementById('memoryStatusBadge');
      const badgeText = document.getElementById('memoryStatusText');
      if (badge) {
        badge.classList.remove('hidden');
        badge.dataset.state = 'warning';
        if (badgeText) badgeText.textContent = '450 MB';
      }
    });
    await page.waitForTimeout(300);

    const badge = page.locator('#memoryStatusBadge');
    await expect(badge).toHaveScreenshot('memory-badge-warning.png', {
      maxDiffPixels: 20,
      threshold: 0.1,
    });
  });

  test('memory banner critical state', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible' });

    // Show memory banner in critical state
    await page.evaluate(() => {
      const banner = document.getElementById('memoryBanner');
      if (banner) {
        banner.dataset.visible = 'true';
        banner.dataset.state = 'critical';
      }
    });
    await page.waitForTimeout(500);

    const banner = page.locator('#memoryBanner');
    await expect(banner).toHaveScreenshot('memory-banner-critical.png', {
      maxDiffPixels: 50,
      threshold: 0.2,
    });
  });

  test('memory banner emergency state', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible' });

    // Show memory banner in emergency state
    await page.evaluate(() => {
      const banner = document.getElementById('memoryBanner');
      const bannerText = document.getElementById('memoryBannerText');
      if (banner) {
        banner.dataset.visible = 'true';
        banner.dataset.state = 'emergency';
        if (bannerText) {
          bannerText.textContent = 'Critical memory usage! Auto-preview disabled. Please save your work immediately.';
        }
      }
    });
    await page.waitForTimeout(500);

    const banner = page.locator('#memoryBanner');
    await expect(banner).toHaveScreenshot('memory-banner-emergency.png', {
      maxDiffPixels: 50,
      threshold: 0.2,
    });
  });
});

test.describe('Visual Regression - Mobile Viewport', () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

  test('mobile layout', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible' });

    // Close first-visit modal
    const welcomeModal = page.locator('#first-visit-modal');
    if (await welcomeModal.isVisible().catch(() => false)) {
      const closeBtn = page.locator('#first-visit-modal .modal-close, #first-visit-modal button.btn-primary');
      if (await closeBtn.first().isVisible().catch(() => false)) {
        await closeBtn.first().click();
        await page.waitForTimeout(300);
      }
    }

    await expect(page).toHaveScreenshot('mobile-layout.png', {
      maxDiffPixels: 200,
      threshold: 0.2,
    });
  });
});

test.describe('Visual Regression - Disclosure Sections', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    });
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible' });
    await page.waitForTimeout(500);
  });

  test('disclosure sections closed state at 1440px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);

    // Capture disclosures area if visible
    const disclosures = page.locator('.forge-disclosure').first();
    if (await disclosures.isVisible().catch(() => false)) {
      await expect(page).toHaveScreenshot('disclosures-closed-1440.png', {
        maxDiffPixels: 200,
        threshold: 0.2,
      });
    }
  });

  test('disclosure sections at 768px tablet width', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(300);

    await expect(page).toHaveScreenshot('disclosures-tablet-768.png', {
      maxDiffPixels: 200,
      threshold: 0.2,
    });
  });

  test('disclosure sections at 320px mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.waitForTimeout(300);

    await expect(page).toHaveScreenshot('disclosures-mobile-320.png', {
      maxDiffPixels: 200,
      threshold: 0.2,
    });
  });
});

test.describe('Visual Regression - UI Uniformity', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    });
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible' });
    await page.waitForTimeout(500);
  });

  test('parameters header layout at 1280px desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(300);

    const header = page.locator('.panel-header');
    if (await header.isVisible().catch(() => false)) {
      await expect(header).toHaveScreenshot('param-header-desktop-1280.png', {
        maxDiffPixels: 150,
        threshold: 0.2,
      });
    }
  });

  test('drawer headers at 480px mobile portrait', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 854 });
    await page.waitForTimeout(300);

    await expect(page).toHaveScreenshot('drawer-headers-mobile-480.png', {
      maxDiffPixels: 200,
      threshold: 0.2,
    });
  });

  test('disclosure sections stack uniformity at 1024px', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(300);

    const paramBody = page.locator('.param-panel-body');
    if (await paramBody.isVisible().catch(() => false)) {
      await expect(paramBody).toHaveScreenshot('disclosure-stack-1024.png', {
        maxDiffPixels: 200,
        threshold: 0.2,
      });
    }
  });
});
