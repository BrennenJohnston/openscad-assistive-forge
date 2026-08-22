// Mobile drawer end-to-end tests
import { test, expect } from '@playwright/test';
import path from 'path';

const isCI = !!process.env.CI;

// Dismiss first-visit modal so it doesn't block UI interactions
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
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
  // F5 (owner decision 2026-05-15): parameter groups render collapsed by
  // default, and at the mobile viewport the params also sit inside the
  // closed drawer — .param-control is attached but never "visible" here.
  // Attached is the load-complete signal; each test opens the drawer
  // itself (UF-9 P1: this wait was the whole file's 13/13 local red).
  await page.waitForSelector('.param-control', { state: 'attached', timeout: 30_000 });

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
    
    // Close with backdrop click.
    //
    // Q-78 (UF-38): a bare `backdrop.click()` aims at the element's centre,
    // and the backdrop is the whole 375x667 viewport while the drawer covers
    // 337.5 of those 375px - so the centre IS the drawer, the actionability
    // check never passes, and this timed out on local Firefox. MEASURED: at
    // the backdrop's centre `elementFromPoint` returns the drawer's summary;
    // at x=369 it returns `#drawerBackdrop`, and tapping there closes the
    // drawer on every repeat. The app was never at fault, the aim was.
    await backdrop.click({ position: { x: 369, y: 333 } });
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

    // The drawer focuses its first FOCUSABLE element; the first matching
    // button in DOM order is the disabled Undo toolbar button, so assert
    // the a11y contract directly — focus landed inside the drawer
    // (UF-9 P1: the literal-first assertion went stale when the
    // Undo/Redo toolbar row was added).
    const focusInsideDrawer = await page.evaluate(
      () => document.activeElement.closest('#paramPanel') !== null
    );
    expect(focusInsideDrawer).toBe(true);
    
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

  test('all drawer toggles meet 44px minimum touch target', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await loadSampleFile(page);

    // Check drawer toggle buttons meet minimum touch target
    const toggleSelectors = [
      '#mobileDrawerToggle',
      '.drawer-close-btn',
    ];

    for (const sel of toggleSelectors) {
      const el = page.locator(sel).first();
      const isVisible = await el.isVisible().catch(() => false);
      if (!isVisible) continue;

      const size = await el.evaluate(node => {
        const styles = getComputedStyle(node);
        return {
          minHeight: parseFloat(styles.minHeight),
          minWidth: parseFloat(styles.minWidth),
        };
      });

      expect(size.minHeight).toBeGreaterThanOrEqual(44);
      expect(size.minWidth).toBeGreaterThanOrEqual(44);
    }
  });

  test('drawer open/close toggles aria-expanded correctly', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await loadSampleFile(page);

    // Open drawer
    const mobileToggle = page.locator('#mobileDrawerToggle');
    if (await mobileToggle.isVisible()) {
      await mobileToggle.click();
      await page.waitForTimeout(300);
      await expect(mobileToggle).toHaveAttribute('aria-expanded', 'true');

      // Close via close button
      const closeBtn = page.locator('.drawer-close-btn').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(300);
        await expect(mobileToggle).toHaveAttribute('aria-expanded', 'false');
      }
    }
  });

  test('parameters drawer backdrop appears and is dismissible', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await loadSampleFile(page);

    const mobileToggle = page.locator('#mobileDrawerToggle');
    if (await mobileToggle.isVisible()) {
      await mobileToggle.click();
      await page.waitForTimeout(400);

      // Backdrop should be visible
      const backdrop = page.locator('.drawer-backdrop');
      await expect(backdrop).toHaveClass(/visible/);

      // Click backdrop to dismiss
      await backdrop.click({ position: { x: 10, y: 10 } });
      await page.waitForTimeout(400);

      // Drawer should be closed
      await expect(mobileToggle).toHaveAttribute('aria-expanded', 'false');
    }
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
