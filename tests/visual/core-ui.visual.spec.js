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

/**
 * UF-27 / D-51: dismiss the first-visit modal, and wait until it is really
 * gone before anything is photographed.
 *
 * Every describe below used to do this inline as a best-effort click guarded
 * by `if (await modal.isVisible())`, checked the instant the page loaded. The
 * modal opens on a delay, so that check found nothing, the dismissal was
 * skipped in silence, and the shot caught the page through the modal backdrop.
 * MEASURED consequence at HEAD: theme-light.png was BYTE-IDENTICAL to
 * welcome-screen.png (same SHA-256), and theme-dark, high-contrast and both
 * memory-banner baselines were pictures of the welcome modal rather than of
 * the thing each is named for.
 *
 * This is UF-25's proven pattern from the mobile-layout case, lifted out so
 * there is one copy: drive the app's own flow (choose an interface, then
 * Continue) and wait for the blocking state to clear rather than for a fixed
 * number of milliseconds.
 */
async function dismissFirstVisit(page) {
  const modal = page.locator('#first-visit-modal:not(.hidden)');
  await modal.waitFor({ state: 'visible', timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById('firstVisitChoiceForge')?.click();
    document.getElementById('first-visit-continue')?.click();
  });
  await page.waitForFunction(
    () => !document.body.classList.contains('first-visit-blocking'),
    null,
    { timeout: 15000 }
  );
  await expect(modal).toBeHidden();
}

/** UF-22: keep the tour nudge out of shots that are not about the tour. */
async function suppressTourNudge(page) {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
}

/**
 * UF-27 / D-52: four cases in this file were reporting PASS while asserting
 * nothing whatsoever.
 *
 * Each wrapped its `toHaveScreenshot` in `if (await el.isVisible())` against
 * an element that only exists once a project is open. The suite never opens
 * one, so the condition was always false, the assertion never ran, and the
 * case still reported ok. MEASURED: the file has 16 cases naming 16 baselines,
 * and only 12 baseline files exist - the four with no file are exactly these
 * four. A missing baseline is normally how Playwright tells you a case never
 * asserted; here nothing was listening.
 *
 * They now skip, formally and with this reason, so the board says "did not
 * check" instead of "checked and fine".
 *
 * The fix, when someone takes it: open a project first, the way
 * render-stability.spec.js does with `/?example=colored-box`, and wait for
 * `.param-control`. MEASURED on that page: `.panel-header` becomes visible at
 * 499x85 and `.param-panel-body` at 499x654, so three of the four would then
 * capture something real. `.forge-disclosure` stays hidden even with a project
 * open (11 in the DOM, none visible), so the 1440px disclosure case needs its
 * own answer about what it is meant to photograph. It was not taken here
 * because it puts a project load into a lane that is being made able to fail
 * for the first time, and that trade deserves its own measurement.
 */
const NEEDS_A_LOADED_PROJECT =
  'the element only exists with a project open, and this suite opens none (see the note above)';

test.describe('Visual Regression - Core UI', () => {
  test.beforeEach(async ({ page }) => {
    // UF-22: these captures deliberately keep the first-visit modal, but two
    // of them dismiss it and then shoot the page underneath. Suppress the
    // tour nudge so it is not what they photograph.
    await suppressTourNudge(page);

    // Navigate to the app
    await page.goto('/');

    // Wait for app to fully load
    await page.waitForSelector('#app', { state: 'visible' });

    // Wait for any initial animations to settle
    await page.waitForTimeout(500);
  });

  test('welcome screen layout', async ({ page }) => {
    // UF-27: this is the one capture that WANTS the modal, so wait for it
    // rather than photographing whatever is on screen. It used to branch on
    // an immediate isVisible() and shoot either way under two different
    // tolerances, which meant a run that lost the modal still passed - and
    // recorded the wrong picture under this name.
    const welcomeModal = page.locator('#first-visit-modal:not(.hidden)');
    await welcomeModal.waitFor({ state: 'visible', timeout: 15000 });

    await expect(page).toHaveScreenshot('welcome-screen.png', {
      maxDiffPixels: 100,
      threshold: 0.2,
    });
  });

  // Q-55(ii) (owner, 2026-08-15): renamed. The capture is correct and the
  // baseline file keeps its name, but 'main layout' described the project UI
  // while the image is the welcome page with the first-visit modal dismissed.
  test('welcome page with the first-visit modal dismissed', async ({ page }) => {
    await dismissFirstVisit(page);

    // Wait for main UI to be visible
    await page.waitForSelector('.app-header', { state: 'visible' });

    // Take screenshot of main layout
    await expect(page).toHaveScreenshot('main-layout.png', {
      maxDiffPixels: 200,
      threshold: 0.2,
    });
  });

  test('header controls', async ({ page }) => {
    await dismissFirstVisit(page);

    /*
     * UF-27 / P4: this was the only ELEMENT screenshot in the file, and the
     * only baseline that came back blank when the set was first generated on
     * the Linux CI runner - 1280x74, the right geometry, 528 bytes of plain
     * white, against 12,473 bytes of painted header for the same element on
     * win32. Looked at, not inferred. Seeding that would have sealed a picture
     * of nothing in as the thing every future Linux run is compared against,
     * which is the exact vacuity this job is being fixed to end.
     *
     * MEASURED twice at exactly 528 bytes, so it is systematic rather than a
     * race, and pinning scroll, webfonts and the logo decode did not shift it.
     * What DOES paint on that runner is the page-screenshot path:
     * main-layout.png, shot from the same page moments earlier, has the header
     * in it correctly. So the header is captured as a clipped PAGE screenshot
     * of its own box instead of as an element screenshot - same picture, same
     * baseline name, a capture path that survives the runner's software
     * rendering. The waits below stay: they cost nothing and they remove the
     * timing explanations from the list.
     */
    const header = page.locator('.app-header');
    await expect(header).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    // .then(() => undefined) because document.fonts.ready resolves to a
    // FontFaceSet, which is not serialisable back across the bridge.
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.waitForFunction(() => {
      const logo = document.querySelector('.app-header .header-logo');
      return !logo || (logo.complete && logo.naturalWidth > 0);
    });
    await page.waitForTimeout(300);

    const box = await header.boundingBox();
    expect(box).not.toBeNull();

    await expect(page).toHaveScreenshot('header-controls.png', {
      clip: box,
      maxDiffPixels: 50,
      threshold: 0.2,
    });
  });
});

test.describe('Visual Regression - Theme Switching', () => {
  // UF-27 / D-51: all three baselines under this describe were pictures of
  // the first-visit modal, not of the themed application - theme-light.png
  // was byte-identical to welcome-screen.png. The dismissal ran on an
  // immediate isVisible() check that the delayed modal always lost, and this
  // describe never got UF-22's nudge suppression either.
  test.beforeEach(async ({ page }) => {
    await suppressTourNudge(page);
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible' });
    await dismissFirstVisit(page);
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
          // UF-3: Continue requires an interface choice first
          await page.locator('#firstVisitChoiceForge').check().catch(() => {});
          await closeBtn.first().click();
        }
      }
    }
  });

  test('parameter panel with controls', async ({ page }) => {
    // UF-27 / D-52: the selector this used, `#parameterPanel, .parameter-panel`,
    // matches NOTHING in the app - MEASURED count 0 both with and without a
    // project loaded. It is the `#fileInfo` mistake of UF-25 again: an id that
    // no longer exists, waited for, then hidden behind an `if (visible)` that
    // could never be true. The real element is `#paramPanelBody`.
    const parameterPanel = page.locator('#paramPanelBody');
    await parameterPanel
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {});

    const visible = await parameterPanel.isVisible().catch(() => false);
    test.skip(!visible, NEEDS_A_LOADED_PROJECT);

    await expect(parameterPanel).toHaveScreenshot('parameter-panel.png', {
      maxDiffPixels: 100,
      threshold: 0.2,
    });
  });
});

test.describe('Visual Regression - Memory Warning UI', () => {
  /*
   * Q-55(ii) (owner, 2026-08-15): the 'memory badge states' case was REMOVED
   * here, with its baseline. The image it compared against was a blank grey
   * rectangle with no badge, no text and no colour in it - UF-9 recorded why:
   * the app's live memory monitor overwrites the forced data-state inside the
   * 300ms settle, so the shot never caught the warning state it is named for.
   * A baseline that depicts nothing cannot catch a regression in anything.
   * The two memory BANNER cases below do capture real state and stay.
   *
   * UF-27 / D-51 correction: they did not. Both baselines were a 1280x46
   * strip of the dimmed page behind the first-visit modal - no banner, no
   * text, no colour - because this describe dismissed nothing before forcing
   * the banner state, and the modal backdrop paints over a position:fixed
   * banner. MEASURED side by side: with the modal dismissed the same capture
   * shows the real amber banner, its warning icon, the sentence, and all four
   * buttons. The state also survives the settle (data-visible/data-state read
   * back true/critical after 600ms), so the live-monitor race that killed the
   * badge case does not apply here.
   */
  test('memory banner critical state', async ({ page }) => {
    await suppressTourNudge(page);
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible' });
    await dismissFirstVisit(page);

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
    await suppressTourNudge(page);
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible' });
    await dismissFirstVisit(page);

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

  // UF-25: this describe never got UF-22's nudge suppression. It did not
  // matter while the capture happened through an undismissed first-visit
  // modal, because the nudge only appears after the gate is accepted. Now
  // that the gate is properly dismissed, the nudge is the first thing on
  // screen, so this photographs a dialog instead of a layout without it.
  test.beforeEach(async ({ page }) => {
    await suppressTourNudge(page);
  });

  test('mobile layout', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible' });

    // Q-55(ii) (owner, 2026-08-15): the old baseline was BLURRED - every word
    // on the page out of focus - because the dismissal was a best-effort click
    // followed by a flat 300ms wait, so the shot caught the page under the
    // modal backdrop. A blurred baseline hides exactly the layout changes it
    // exists to catch, and how blurred it is depends on timing, so it was a
    // flake waiting to happen. Dismiss the way the app's own flow works
    // (choose an interface, then Continue) and wait for the blocking state to
    // actually clear.
    // The modal opens on a delay, so the old code's immediate isVisible()
    // check found nothing, skipped the dismissal entirely, and shot the page
    // through the backdrop. Wait for it to arrive before dismissing it.
    // UF-27: this is where dismissFirstVisit() came from - four other places
    // in this file were still doing it the broken way.
    await dismissFirstVisit(page);
    await page.waitForTimeout(500);

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
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    });
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible' });
    await page.waitForTimeout(500);
  });

  test('disclosure sections closed state at 1440px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);

    // UF-27 / D-52: see the note on NEEDS_A_LOADED_PROJECT.
    const disclosures = page.locator('.forge-disclosure').first();
    const visible = await disclosures.isVisible().catch(() => false);
    test.skip(!visible, NEEDS_A_LOADED_PROJECT);

    await expect(page).toHaveScreenshot('disclosures-closed-1440.png', {
      maxDiffPixels: 200,
      threshold: 0.2,
    });
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
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    });
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible' });
    await page.waitForTimeout(500);
  });

  test('parameters header layout at 1280px desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(300);

    // UF-27 / D-52: see the note on NEEDS_A_LOADED_PROJECT.
    const header = page.locator('.panel-header').first();
    const visible = await header.isVisible().catch(() => false);
    test.skip(!visible, NEEDS_A_LOADED_PROJECT);

    await expect(header).toHaveScreenshot('param-header-desktop-1280.png', {
      maxDiffPixels: 150,
      threshold: 0.2,
    });
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

    // UF-27 / D-52: see the note on NEEDS_A_LOADED_PROJECT.
    const paramBody = page.locator('.param-panel-body').first();
    const visible = await paramBody.isVisible().catch(() => false);
    test.skip(!visible, NEEDS_A_LOADED_PROJECT);

    await expect(paramBody).toHaveScreenshot('disclosure-stack-1024.png', {
      maxDiffPixels: 200,
      threshold: 0.2,
    });
  });
});
