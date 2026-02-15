// Mobile drawer end-to-end tests
import { test, expect } from '@playwright/test';
import path from 'path';

const isCI = !!process.env.CI;

// Dismiss first-visit modal so it doesn't block UI interactions
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
  })
})

async function loadSampleFile(page) {
  // Register the WASM-ready listener BEFORE navigation so we never
  // miss the console signal due to a race condition.
  const wasmReady = page.waitForEvent('console', {
    predicate: (msg) => msg.text().includes('OpenSCAD WASM ready'),
    timeout: 120_000,
  });

  await page.goto('/');

  // Block until WASM is confirmed initialised (guards against the
  // flaky overlay.count() === 0 early-return that plagued the old
  // waitForWasmReady helper).
  await wasmReady;

  const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
  await page.setInputFiles('#fileInput', fixturePath);
  await page.waitForSelector('.param-control', { timeout: 30_000 });

  // Dismiss the "Save this file for quick access?" modal if it appears.
  // The modal may render slightly after .param-control, so we must
  // actively wait for the dismiss button rather than polling isVisible().
  try {
    const notNowBtn = page.locator('#saveProjectNotNow');
    await notNowBtn.waitFor({ state: 'visible', timeout: 3000 });
    await notNowBtn.click();
    await page.waitForTimeout(300);
  } catch {
    // Modal never appeared – carry on
  }
}

test.describe('Mobile Drawer', () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE size
  test.describe.configure({ timeout: 150_000 }); // WASM init may need ~120s

  test('drawer toggle is visible on mobile', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await loadSampleFile(page);
    
    const toggle = page.locator('#mobileDrawerToggle');
    await expect(toggle).toBeVisible();
  });
  
  test('drawer opens and closes', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await loadSampleFile(page);
    
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
    await loadSampleFile(page);
    
    await page.locator('#mobileDrawerToggle').click();
    await expect(page.locator('#paramPanel')).toHaveClass(/drawer-open/);
    
    await page.keyboard.press('Escape');
    await expect(page.locator('#paramPanel')).not.toHaveClass(/drawer-open/, { timeout: 10000 });
  });
  
  test('focus is trapped in drawer', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await loadSampleFile(page);
    
    await page.locator('#mobileDrawerToggle').click();
    // Focus is moved into the drawer after the open transition
    await page.waitForTimeout(400);
    
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

  test('drawer stays open when dragging from inside to backdrop', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await loadSampleFile(page);
    
    const toggle = page.locator('#mobileDrawerToggle');
    const drawer = page.locator('#paramPanel');
    const backdrop = page.locator('#drawerBackdrop');
    
    // Open drawer
    await toggle.click();
    await expect(drawer).toHaveClass(/drawer-open/);
    
    // Get bounding boxes
    const drawerBox = await drawer.boundingBox();
    const backdropBox = await backdrop.boundingBox();
    
    // Simulate dragging from inside drawer to backdrop (common accidental gesture)
    await page.mouse.move(drawerBox.x + drawerBox.width / 2, drawerBox.y + drawerBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(backdropBox.x + backdropBox.width - 50, backdropBox.y + backdropBox.height / 2);
    await page.mouse.up();
    
    // Drawer should still be open (gesture was protected)
    await expect(drawer).toHaveClass(/drawer-open/);
  });

  // Keyboard shortcuts popover is part of the desktop Camera panel (not the mobile camera drawer).

  test('actions drawer does not block primary action (mobile)', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await loadSampleFile(page);

    // Expand Actions drawer
    await page.locator('#actionsDrawerToggle').click();
    await expect(page.locator('#actionsDrawer')).not.toHaveClass(/collapsed/);

    // The primary action should remain clickable (not covered by the expanded drawer)
    const primaryIsOnTop = await page.evaluate(() => {
      const btn = document.getElementById('primaryActionBtn');
      if (!btn) return false;
      const r = btn.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const topEl = document.elementFromPoint(x, y);
      return !!topEl && (btn === topEl || btn.contains(topEl));
    });
    expect(primaryIsOnTop).toBe(true);
  });
});

test.describe('Desktop Layout', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test.describe.configure({ timeout: 150_000 }); // WASM init may need ~120s

  test('drawer toggle is hidden on desktop', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await loadSampleFile(page);
    
    const toggle = page.locator('#mobileDrawerToggle');
    await expect(toggle).not.toBeVisible();
  });
  
  test('Split.js layout is active on desktop', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await loadSampleFile(page);
    
    // Gutter should be visible
    const gutter = page.locator('.gutter-horizontal');
    await expect(gutter).toBeVisible();
  });

  test('keyboard shortcuts help shows as icon-only popover on short height', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    // Short height triggers compact icon-only mode via CSS (max-height: 500px).
    await page.setViewportSize({ width: 1280, height: 450 });
    await loadSampleFile(page);

    // Camera panel starts collapsed on desktop; expand it to access shortcuts.
    await page.locator('#cameraPanelToggle').click();
    await expect(page.locator('#cameraPanel')).not.toHaveClass(/collapsed/);

    const shortcutsHelp = page.locator('.camera-shortcuts-help');
    const shortcutsLabel = page.locator('.camera-shortcuts-label');
    const shortcutsList = page.locator('.camera-shortcuts-list');

    await expect(shortcutsHelp).toBeVisible();
    await expect(shortcutsLabel).toHaveCSS('position', 'absolute');
    await expect(shortcutsList).not.toBeVisible();

    await shortcutsHelp.locator('summary').scrollIntoViewIfNeeded();
    await shortcutsHelp.locator('summary').click();
    await expect(shortcutsList).toBeVisible();
  });

  test('actions drawer does not block primary action (desktop)', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await loadSampleFile(page);

    // Expand Actions drawer
    await page.locator('#actionsDrawerToggle').click();
    await expect(page.locator('#actionsDrawer')).not.toHaveClass(/collapsed/);

    // The primary action should remain clickable (not covered by the expanded drawer)
    const primaryIsOnTop = await page.evaluate(() => {
      const btn = document.getElementById('primaryActionBtn');
      if (!btn) return false;
      const r = btn.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const topEl = document.elementFromPoint(x, y);
      return !!topEl && (btn === topEl || btn.contains(topEl));
    });
    expect(primaryIsOnTop).toBe(true);
  });
});
