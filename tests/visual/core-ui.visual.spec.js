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

  // Accepting the gate is what starts the engine loading, and its splash
  // covers the whole page while it does. Everything that dismisses the gate
  // then photographs the app, so the wait belongs here.
  await waitForEngine(page);
}

async function openApp(page) {
  await page.goto('/');
  await page.waitForSelector('#app', { state: 'visible' });
}

/**
 * UF-27 / P4: wait for the OpenSCAD engine to finish loading before anything
 * is photographed.
 *
 * This suite never waited, and on the Linux CI runner it showed. Three
 * successive generations of the baseline set were captured and looked at, and
 * they disagreed with each other: in one, main-layout.png and theme-dark.png
 * were 85KB pictures of the application; in the next they were 25KB pictures
 * of the "Loading OpenSCAD Engine" splash, spinner and progress bar and all.
 * The same splash explains the blank header strip - clipping to the header's
 * box while that near-white overlay covers it captures 528 bytes of nothing.
 * Locally the engine is cached and the race is invisible, which is why the
 * win32 baselines never showed it.
 *
 * WHERE this is called matters, and getting it wrong deadlocks the suite.
 * MEASURED: the engine does not begin loading until the first-visit gate is
 * accepted. Waiting for it before dismissal hangs for the full timeout - a
 * first attempt that waited inside openApp() took the suite from 53s to 10.8
 * minutes, and the only three cases that survived were the three that preset
 * openscad-forge-first-visit-seen and so had no gate in the way. So it is
 * waited for after the gate is gone, never before.
 */
async function waitForEngine(page) {
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 120_000,
  });
}

/** UF-22: keep the tour nudge out of shots that are not about the tour. */
async function suppressTourNudge(page) {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
}

/**
 * UF-32: open the app with a real project on screen, for the four cases whose
 * subject only exists then.
 *
 * The deep link is the same door render-stability.spec.js uses. MEASURED at
 * develop@20d32d1: it raises no save prompt and leaves no modal open, so
 * nothing can paint over a capture the way the first-visit modal did in D-51.
 *
 * The waits, in the order the engine forces: the caller presets
 * first-visit-seen, so there is no gate and the engine starts immediately;
 * then the parameters the app generates from the model prove it is really
 * open; then a completed render, which is what puts the model in the picture
 * and the file size and triangle count in the status bar. Waiting for the
 * render rather than for a fixed delay is what keeps the full-page capture
 * from photographing an empty canvas on a slow runner.
 */
async function openProject(page) {
  await page.goto('/?example=colored-box');
  await page.waitForSelector('#app', { state: 'visible' });
  await waitForEngine(page);
  await page.waitForSelector('.param-control', {
    state: 'attached',
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => /[\d,]+\s+triangles/.test(document.body.innerText),
    null,
    { timeout: 60_000 }
  );
  await page.waitForTimeout(500);
}

/**
 * D-52, found at UF-27 and CLOSED at UF-32.
 *
 * Four cases in this file reported PASS for their whole lives while asserting
 * nothing. Each wrapped its `toHaveScreenshot` in `if (await el.isVisible())`
 * against an element that only exists once a project is open, and the suite
 * opened none — so the condition was always false, the assertion never ran,
 * and the case still reported ok. The tell was in the file listing: 16 cases
 * named 16 baselines and only 12 baseline files existed. UF-27 turned them
 * into formal skips so the board said "did not check" instead of "checked and
 * fine"; UF-32 opens a project and lets them check.
 *
 * They live together in one describe now because they share that requirement
 * and because their old describes hold cases that must keep photographing the
 * app WITHOUT a project. Moving them renamed no baseline: the snapshot path
 * comes from the name passed to toHaveScreenshot, not from the describe.
 *
 * ONE CORRECTION TO WHAT UF-27 RECORDED, measured at develop@20d32d1: the note
 * here used to say `.forge-disclosure` "stays hidden even with a project open
 * (11 in the DOM, none visible)", and that the 1440px case therefore needed
 * its own answer. With a project open there are 11 in the DOM and FOUR
 * visible — Presets, Dimensions, Appearance, Details — in Simplified, and ten
 * in Standard. Without a project: 8 in the DOM, 0 visible, which is the state
 * that measurement must have caught. None of the four cases was blocked.
 */

test.describe('Visual Regression - Core UI', () => {
  test.beforeEach(async ({ page }) => {
    // UF-22: these captures deliberately keep the first-visit modal, but two
    // of them dismiss it and then shoot the page underneath. Suppress the
    // tour nudge so it is not what they photograph.
    await suppressTourNudge(page);

    // Navigate to the app and wait for it to be fully loaded
    await openApp(page);

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
     * The cause turned out to be the one openApp() now fixes for the whole
     * file: the "Loading OpenSCAD Engine" splash was still up, and 528 bytes
     * of near-white is exactly what you get by clipping to the header's box
     * while a full-screen overlay covers it. The next generation caught the
     * same splash in main-layout.png and theme-dark.png outright, which is how
     * it was identified.
     *
     * The capture stays a clipped PAGE screenshot rather than an element
     * screenshot, and the waits below stay. Neither was the cause, both are
     * cheap, and together they take the remaining timing explanations off the
     * list for the one capture in this file that is not a whole viewport.
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
    await openApp(page);
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

/**
 * The four cases D-52 was about. One beforeEach, one requirement: a project
 * on screen. See the note above the first describe in this file.
 */
test.describe('Visual Regression - With a project open (D-52)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
      // Stamp the mode rather than inheriting whatever the default happens to
      // be. Simplified is what a new user meets and what the other twelve
      // baselines photograph. MEASURED: Standard puts the Companion Files
      // panel inside two of these four captures, which would tie pictures
      // named for the parameter panel to a surface that is not their subject.
      localStorage.setItem(
        'openscad-forge-ui-mode',
        JSON.stringify({ mode: 'simplified', lastCustomMode: 'simplified' })
      );
    });
    await openProject(page);
  });

  /**
   * Each case declares its viewport with test.use, so the page is CREATED at
   * that size and never resized. Two measured reasons, and the second one
   * produced a baseline that had to be thrown away:
   *
   * 1. #paramPanelBody sits at y=184 and is 654px tall at 1280 and 722px at
   *    1024, so at the original 720/768 heights its bottom fell outside the
   *    viewport, Playwright's scrollIntoView shifted its container up by ~70px
   *    to take the shot, and the sticky .panel-header then covered the panel's
   *    first row. The pictures showed a half-clipped Sort row no user sees.
   * 2. Resizing to 1440 AFTER load re-opens the Preview Settings drawer, which
   *    then covers most of the 3D view. The first 1440 baseline captured that
   *    and was discarded. A page created at 1440 keeps the drawer collapsed,
   *    which is what a user opening the app at that size gets.
   *
   * The width is what each case is named for; the height is chosen to let the
   * subject fit.
   */
  test.describe('parameter panel', () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('parameter panel with controls', async ({ page }) => {
      // UF-27: the old selector `#parameterPanel, .parameter-panel` matched
      // NOTHING in the app - the `#fileInfo` mistake of UF-25 again. The real
      // element is #paramPanelBody, and `.param-panel-body` is the same node.
      const parameterPanel = page.locator('#paramPanelBody');
      await expect(parameterPanel).toBeVisible();

      await expect(parameterPanel).toHaveScreenshot('parameter-panel.png', {
        maxDiffPixels: 100,
        threshold: 0.2,
      });
    });
  });

  test.describe('whole page at 1440px', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('disclosure sections closed state at 1440px', async ({ page }) => {
      // MEASURED: the first .forge-disclosure in DOM order is the Console, and
      // six more hidden panels follow it — Simplified hides all seven. The four
      // that ARE visible are Presets and the three parameter groups, which load
      // collapsed (F5, owner 2026-05-15) and are the closed state this case is
      // named for. Asserting on `.first()` is what kept this case skipping even
      // with a project open, and is almost certainly what produced UF-27's
      // "11 in the DOM, none visible" note.
      await expect(page.locator('.forge-disclosure:visible')).toHaveCount(4);

      await expect(page).toHaveScreenshot('disclosures-closed-1440.png', {
        maxDiffPixels: 200,
        threshold: 0.2,
      });
    });
  });

  test.describe('parameters header', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('parameters header layout at 1280px desktop', async ({ page }) => {
      const header = page.locator('.panel-header').first();
      await expect(header).toBeVisible();

      await expect(header).toHaveScreenshot('param-header-desktop-1280.png', {
        maxDiffPixels: 150,
        threshold: 0.2,
      });
    });

    /**
     * The canary (owner's call, 2026-08-17). Every other case in this file
     * allows a per-pixel colour threshold, and that is deliberate: it keeps
     * anti-aliasing from reddening the lane on two platforms with different
     * font rendering. The cost is measured — rounding the disclosure corners
     * to zero moves 660 pixels of the 1440 capture (0.05%) and still passes.
     *
     * So one capture is held to zero. It photographs the smallest, most
     * static region in the set, the same header the case above allows 150
     * pixels of drift in, and it permits none: any pixel that moves reddens
     * it. If this one starts flaking while the tolerant four stay green, the
     * flake is in the rendering, not in the app.
     */
    test('parameters header, pixel-exact canary', async ({ page }) => {
      const header = page.locator('.panel-header').first();
      await expect(header).toBeVisible();

      await expect(header).toHaveScreenshot('param-header-strict-1280.png', {
        maxDiffPixels: 0,
        threshold: 0,
      });
    });
  });

  test.describe('disclosure stack', () => {
    test.use({ viewport: { width: 1024, height: 960 } });

    test('disclosure sections stack uniformity at 1024px', async ({ page }) => {
      const paramBody = page.locator('.param-panel-body').first();
      await expect(paramBody).toBeVisible();

      await expect(paramBody).toHaveScreenshot('disclosure-stack-1024.png', {
        maxDiffPixels: 200,
        threshold: 0.2,
      });
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
    await openApp(page);
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
    await openApp(page);
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
    await openApp(page);

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
    await openApp(page);
    // No first-visit gate here, so the engine starts straight away and its
    // splash is what these would otherwise photograph.
    await waitForEngine(page);
    await page.waitForTimeout(500);
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
    await openApp(page);
    // No first-visit gate here, so the engine starts straight away and its
    // splash is what these would otherwise photograph.
    await waitForEngine(page);
    await page.waitForTimeout(500);
  });

  test('drawer headers at 480px mobile portrait', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 854 });
    await page.waitForTimeout(300);

    await expect(page).toHaveScreenshot('drawer-headers-mobile-480.png', {
      maxDiffPixels: 200,
      threshold: 0.2,
    });
  });

});
