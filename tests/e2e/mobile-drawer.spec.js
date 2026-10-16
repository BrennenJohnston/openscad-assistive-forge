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
  // Parameter groups render collapsed by default, and at the mobile viewport
  // the params also sit inside the closed drawer: .param-control is attached
  // but never "visible" here. Attached is the load-complete signal; each
  // test opens the drawer itself.
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
  
  // The sheet sits above the bottom bar with the preview live above it:
  // nothing dims or blocks the preview while it is open.
  test('drawer opens and closes', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await loadSampleFile(page);

    const toggle = page.locator('#mobileDrawerToggle');
    const drawer = page.locator('#paramPanel');

    await toggle.click();
    await expect(drawer).toHaveClass(/drawer-open/);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#drawerBackdrop')).toBeHidden();
    const previewReachable = await page.evaluate(() => {
      const r = document.getElementById('previewContainer').getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!hit?.closest('#previewContainer');
    });
    expect(previewReachable).toBe(true);

    await toggle.click();
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
  
  // The sheet is not a dialog: focus starts in it and Tab carries on past
  // it to the rest of the page.
  test('focus moves freely between the sheet and the page', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await loadSampleFile(page);

    await page.locator('#mobileDrawerToggle').click();
    await expect(page.locator('#paramPanel')).toHaveClass(/drawer-open/);

    const focusInsideDrawer = await page.evaluate(
      () => document.activeElement.closest('#paramPanel') !== null
    );
    expect(focusInsideDrawer).toBe(true);

    let leftTheSheet = false;
    for (let i = 0; i < 120 && !leftTheSheet; i++) {
      await page.keyboard.press('Tab');
      leftTheSheet = await page.evaluate(
        () =>
          !document.activeElement.closest('#paramPanel') &&
          document.activeElement !== document.body
      );
    }
    expect(leftTheSheet).toBe(true);
    await expect(page.locator('#paramPanel')).toHaveClass(/drawer-open/);
  });

  // A drag that starts in the sheet (a slider, a scroll) and ends over the
  // preview leaves the sheet open.
  test('drawer stays open when a drag from inside ends on the preview', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await loadSampleFile(page);

    const toggle = page.locator('#mobileDrawerToggle');
    const drawer = page.locator('#paramPanel');

    await toggle.click();
    await expect(drawer).toHaveClass(/drawer-open/);

    const drawerBox = await drawer.boundingBox();
    const previewBox = await page.locator('#previewContainer').boundingBox();

    await page.mouse.move(drawerBox.x + drawerBox.width / 2, drawerBox.y + drawerBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(previewBox.x + previewBox.width / 2, previewBox.y + previewBox.height / 2);
    await page.mouse.up();

    await expect(drawer).toHaveClass(/drawer-open/);
  });

  // Keyboard shortcuts popover is part of the desktop Camera panel (not the mobile camera drawer).
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

  // The Customizer's width animates; read it once the transition has ended.
  async function settledWidth(panel) {
    await panel.evaluate((el) =>
      Promise.all(el.getAnimations().map((a) => a.finished))
    );
    return (await panel.boundingBox()).width;
  }

  // A width chosen with the divider survives closing and opening the
  // Customizer: it reopens at that width and stays there.
  test('the Customizer reopens at the width it was dragged to', async ({ page }) => {
    await loadSampleFile(page);
    const panel = page.locator('#paramPanel');
    const gutter = page.locator('.gutter-horizontal');
    await expect(gutter).toHaveAttribute('role', 'separator');

    const before = await settledWidth(panel);
    const box = await gutter.boundingBox();
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, y, { steps: 8 });
    await page.mouse.up();
    const resized = await settledWidth(panel);
    expect(resized - before).toBeGreaterThan(100);

    const toggle = page.locator('#collapseParamPanelBtn');
    await toggle.click();
    await expect(panel).toHaveClass(/collapsed/);
    await toggle.click();
    await expect(panel).not.toHaveClass(/collapsed/);
    await expect(gutter).toBeVisible();
    // Past the opening transition and anything scheduled after it.
    await page.waitForTimeout(1000);
    const reopened = await settledWidth(panel);
    expect(Math.abs(reopened - resized)).toBeLessThanOrEqual(2);
  });

  // Each press of an arrow key moves the divider a full step, even when the
  // presses come faster than the width animates, and the divider says the
  // new value at once.
  test('each arrow key press on the divider is a full step, said at once', async ({ page }) => {
    await loadSampleFile(page);
    const panel = page.locator('#paramPanel');
    const gutter = page.locator('.gutter-horizontal');
    await expect(gutter).toHaveAttribute('role', 'separator');

    const before = await settledWidth(panel);
    const startValue = Number(await gutter.getAttribute('aria-valuenow'));
    await gutter.focus();
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await expect(gutter).toHaveAttribute('aria-valuenow', String(startValue + 10));

    const parentWidth = await panel.evaluate((el) => el.parentElement.clientWidth);
    const moved = (await settledWidth(panel)) - before;
    expect(Math.abs(moved - parentWidth * 0.1)).toBeLessThanOrEqual(3);
  });

  test('keyboard shortcuts pop-out opens above its button on short height', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await page.setViewportSize({ width: 1280, height: 450 });
    await loadSampleFile(page);

    // Camera panel starts collapsed on desktop; expand it to access shortcuts.
    await page.locator('#cameraPanelToggle').click();
    await expect(page.locator('#cameraPanel')).not.toHaveClass(/collapsed/);

    const button = page.locator('#cameraShortcutsBtn');
    const popout = page.locator('#cameraShortcutsPanel');
    await button.scrollIntoViewIfNeeded();
    await expect(popout).toBeHidden();

    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(popout).toBeVisible();
    // Measured, not trusted to toBeVisible(): the whole pop-out sits above
    // its button and inside the window.
    const b = await button.boundingBox();
    const p = await popout.boundingBox();
    expect(b.y + b.height).toBeLessThanOrEqual(450);
    expect(p.y + p.height).toBeLessThanOrEqual(b.y + 1);
    expect(p.y).toBeGreaterThanOrEqual(0);
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
});
