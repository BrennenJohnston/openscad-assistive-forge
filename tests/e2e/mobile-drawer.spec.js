// Mobile drawer end-to-end tests
import { test, expect } from '@playwright/test';
import path from 'path';

const isCI = !!process.env.CI;

test.describe('Mobile Drawer', () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE size
  
  test('drawer toggle is visible on mobile', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await page.goto('/');
    // Load a file to get to main interface
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
    await page.setInputFiles('#fileInput', fixturePath);
    await page.waitForSelector('.param-control', { timeout: 15000 });
    
    const toggle = page.locator('#mobileDrawerToggle');
    await expect(toggle).toBeVisible();
  });
  
  test('drawer opens and closes', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await page.goto('/');
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
    await page.setInputFiles('#fileInput', fixturePath);
    await page.waitForSelector('.param-control', { timeout: 15000 });
    
    const toggle = page.locator('#mobileDrawerToggle');
    const drawer = page.locator('#paramPanel');
    const backdrop = page.locator('#drawerBackdrop');
    
    // Open drawer
    await toggle.click();
    await expect(drawer).toHaveClass(/drawer-open/);
    await expect(backdrop).toHaveClass(/visible/);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    
    // Close with backdrop click
    await backdrop.click();
    await expect(drawer).not.toHaveClass(/drawer-open/);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
  
  test('ESC closes drawer', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await page.goto('/');
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
    await page.setInputFiles('#fileInput', fixturePath);
    await page.waitForSelector('.param-control', { timeout: 15000 });
    
    await page.locator('#mobileDrawerToggle').click();
    await expect(page.locator('#paramPanel')).toHaveClass(/drawer-open/);
    
    await page.keyboard.press('Escape');
    await expect(page.locator('#paramPanel')).not.toHaveClass(/drawer-open/);
  });
  
  test('focus is trapped in drawer', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await page.goto('/');
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
    await page.setInputFiles('#fileInput', fixturePath);
    await page.waitForSelector('.param-control', { timeout: 15000 });
    
    await page.locator('#mobileDrawerToggle').click();
    
    // Tab through all elements, should cycle within drawer
    const firstFocusable = page.locator('#paramPanel button, #paramPanel input').first();
    await expect(firstFocusable).toBeFocused();
    
    // Many tabs should keep focus in drawer
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
    }
    
    const activeElement = await page.evaluate(() => document.activeElement.closest('#paramPanel'));
    expect(activeElement).not.toBeNull();
  });
});

test.describe('Desktop Layout', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  
  test('drawer toggle is hidden on desktop', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await page.goto('/');
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
    await page.setInputFiles('#fileInput', fixturePath);
    await page.waitForSelector('.param-control', { timeout: 15000 });
    
    const toggle = page.locator('#mobileDrawerToggle');
    await expect(toggle).not.toBeVisible();
  });
  
  test('Split.js layout is active on desktop', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await page.goto('/');
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
    await page.setInputFiles('#fileInput', fixturePath);
    await page.waitForSelector('.param-control', { timeout: 15000 });
    
    // Gutter should be visible
    const gutter = page.locator('.gutter-horizontal');
    await expect(gutter).toBeVisible();
  });
});
