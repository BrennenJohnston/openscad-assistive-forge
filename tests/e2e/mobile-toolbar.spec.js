import { test, expect } from '@playwright/test';
import path from 'path';

// UF-42 (U-46): "A header that earns its rows".
//
// At 412px with a project open the app spent four stacked rows before any
// content — 147px in Simplified, 187px in Standard — and one of them was a
// 54px band holding four 44px icons in a 396px width. Q-73a chose option C:
// those four controls join the Customizer row, which had the space once its
// visible heading stood down, and the row they leave collapses.
//
// Q-73b moved the preview status line to the top of the preview on mobile,
// where it is readable in both camera-pad states.
//
// Everything asserted here was measured before it was written. The px budget
// cases are deliberately exact rather than "less than before": a re-layout
// that silently drifts back up a row is the thing this release exists to stop.

const FIXTURE = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
const WASM_READY_TIMEOUT = 180_000;

// The owner's 1080x2520 phone at DPR ~2.62 leaves about 810 CSS px once the
// address bar, status bar and gesture nav are counted (the UF-38 finding), so
// both heights are exercised: 915 is what emulation defaults to, 810 is what a
// phone actually has.
const HEIGHTS = [915, 810];

const TOP_CHROME = { simplified: 93, standard: 135 };
const QUARTET = [
  '#contrastToggle',
  '#themeToggle',
  '#focusModeBtn',
  '#featuresGuideBtn',
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
});

async function loadSampleProject(page) {
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  await page.locator('#fileInput').setInputFiles(FIXTURE);
  await expect(page.locator('#welcomeScreen')).toBeHidden({ timeout: 60_000 });
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 20_000 });
  const notNow = page.locator('#saveProjectNotNow');
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3_000 });
    await notNow.click();
  } catch {
    // Save-project modal did not appear; nothing to dismiss.
  }
}

async function switchToStandard(page) {
  const toggle = page.locator('#uiModeToggle');
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  }
}

/** Bottom of the deepest visible bar above the content. */
const topChrome = (page) =>
  page.evaluate(() =>
    ['.app-header', '#workflowProgress', '.preview-drawer-header']
      .map((s) => document.querySelector(s))
      .filter((el) => el && getComputedStyle(el).display !== 'none')
      .reduce(
        (lowest, el) => Math.max(lowest, el.getBoundingClientRect().bottom),
        0
      )
  );

for (const height of HEIGHTS) {
  test.describe(`UF-42: the top chrome's px budget (412x${height})`, () => {
    test.use({ viewport: { width: 412, height } });

    test(`toolbar-budget: Simplified spends ${TOP_CHROME.simplified}px and Standard ${TOP_CHROME.standard}px before any content`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await loadSampleProject(page);

      expect(
        await topChrome(page),
        'Simplified: header + Customizer row, and nothing between them'
      ).toBe(TOP_CHROME.simplified);

      await switchToStandard(page);
      expect(
        await topChrome(page),
        'Standard: the menu bar keeps its own row, the action icons do not'
      ).toBe(TOP_CHROME.standard);
    });

    test('toolbar-fits: nothing in the top chrome runs off the screen or sits on a neighbour', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await loadSampleProject(page);
      await switchToStandard(page);

      const geometry = await page.evaluate(() => {
        const controls = [];
        const selector =
          '.app-header button, .app-header a, #workflowProgress button, ' +
          '.preview-drawer-header button, .preview-drawer-header a';
        for (const el of document.querySelectorAll(selector)) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect();
          if (!r.width && !r.height) continue;
          controls.push({
            id: el.id || String(el.className).split(' ')[0],
            x: r.x,
            y: r.y,
            right: r.right,
            bottom: r.bottom,
            w: Math.round(r.width * 10) / 10,
            h: Math.round(r.height * 10) / 10,
          });
        }
        const offscreen = controls
          .filter((c) => c.right > window.innerWidth + 0.5 || c.x < -0.5)
          .map((c) => `${c.id} [${Math.round(c.x)}..${Math.round(c.right)}]`);
        const overlaps = [];
        for (let i = 0; i < controls.length; i++) {
          for (let j = i + 1; j < controls.length; j++) {
            const a = controls[i];
            const b = controls[j];
            const ox = Math.min(a.right, b.right) - Math.max(a.x, b.x);
            const oy = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
            if (ox > 0.5 && oy > 0.5)
              overlaps.push(
                `${a.id} x ${b.id} = ${Math.round(ox * 10) / 10}px`
              );
          }
        }
        return { offscreen, overlaps };
      });

      // The Classic button used to end 60.4px past the right edge here.
      expect(geometry.offscreen, 'no control runs off the screen').toEqual([]);
      // D-82: #clearFileBtn and the GitHub link overlapped by 18.8px, and a
      // hit test across "Main Page" returned the GitHub link from x=90 on.
      expect(geometry.overlaps, 'no control sits on a neighbour').toEqual([]);
    });

    test('toolbar-back-button: every point across the Main Page button belongs to the Main Page button', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await loadSampleProject(page);

      const hits = await page.evaluate(() => {
        const back = document.getElementById('clearFileBtn');
        const r = back.getBoundingClientRect();
        const seen = new Set();
        for (let x = Math.round(r.x) + 2; x < r.right; x += 4) {
          const el = document.elementFromPoint(x, r.y + r.height / 2);
          seen.add(el ? el.id || el.tagName.toLowerCase() : 'null');
        }
        return [...seen];
      });
      expect(hits, 'D-82: the tail of the label was the GitHub link').toEqual([
        'clearFileBtn',
      ]);
    });
  });

  test.describe(`UF-42: the four controls in their new row (412x${height})`, () => {
    test.use({ viewport: { width: 412, height } });

    test('toolbar-quartet: all four keep 44px, a name, and keyboard reach in the Customizer row', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await loadSampleProject(page);

      for (const selector of QUARTET) {
        const control = page.locator(selector);
        await expect(control, `${selector} is on screen`).toBeVisible();

        const box = await control.boundingBox();
        expect(box.width, `${selector} width`).toBeGreaterThanOrEqual(44);
        expect(box.height, `${selector} height`).toBeGreaterThanOrEqual(44);

        const placement = await control.evaluate((el) => ({
          inCustomizerRow: !!el.closest('.preview-drawer-header'),
          name: (
            el.getAttribute('aria-label') ||
            el.textContent ||
            ''
          ).trim(),
        }));
        expect(
          placement.inCustomizerRow,
          `${selector} joined the Customizer row`
        ).toBe(true);
        expect(placement.name, `${selector} keeps an accessible name`).not.toBe(
          ''
        );

        // Reachable and operable from the keyboard, with a visible ring.
        const reachable = await control.evaluate((el) => {
          el.focus();
          return document.activeElement === el;
        });
        expect(reachable, `${selector} takes focus`).toBe(true);
        const ring = await control.evaluate((el) => {
          const cs = getComputedStyle(el);
          return cs.outlineStyle !== 'none' || cs.boxShadow !== 'none';
        });
        expect(ring, `${selector} paints a focus indicator`).toBe(true);
      }

      // The heading that stood down is still the region's accessible name.
      const heading = page.locator('.preview-drawer-title');
      await expect(heading).toHaveClass(/sr-only/);
      const regionName = await page.evaluate(() => {
        const region = document.getElementById('previewInfoContent');
        const id = region?.getAttribute('aria-labelledby');
        return id ? document.getElementById(id)?.textContent.trim() : null;
      });
      expect(regionName).toBe('Preview Settings & Info');
    });

    test('toolbar-hc-keyshortcut: high contrast advertises its chord like its twin', async ({
      page,
    }) => {
      await page.goto('/');
      await page.waitForSelector('body[data-wasm-ready="true"]', {
        state: 'attached',
        timeout: WASM_READY_TIMEOUT,
      });
      // Generated from the live shortcut config, so it follows a re-mapped
      // chord rather than going stale — which is why it is not an attribute
      // in index.html.
      await expect(page.locator('#contrastToggle')).toHaveAttribute(
        'aria-keyshortcuts',
        'Control+Shift+H'
      );
      await expect(page.locator('#themeToggle')).toHaveAttribute(
        'aria-keyshortcuts',
        'Control+Shift+T'
      );
    });
  });

  test.describe(`UF-42: the status line can be read (412x${height})`, () => {
    test.use({ viewport: { width: 412, height } });

    test('status-line-clear: legible with the camera pad shut AND open', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await loadSampleProject(page);

      const measure = () =>
        page.evaluate(() => {
          const bar = document.querySelector('.preview-status-bar');
          const pad = document.getElementById('cameraDrawerBody');
          const actions = document.getElementById('actionsBar');
          const b = bar.getBoundingClientRect();
          const p = pad.getBoundingClientRect();
          const a = actions.getBoundingClientRect();
          const padOpen = getComputedStyle(pad).display !== 'none';
          return {
            padOpen,
            height: Math.round(b.height),
            behindActionsBar: b.bottom > a.top && b.top < a.bottom,
            behindPad: padOpen && b.top < p.bottom && b.bottom > p.top,
          };
        });

      const shut = await measure();
      expect(shut.padOpen).toBe(false);
      // Measured on the release base: y 829..854 against an actions bar
      // starting at y 816 — the line was not visible at all.
      expect(shut.behindActionsBar, 'clear of the actions bar').toBe(false);
      // Both edges must be written or the box stretches the whole preview.
      expect(shut.height, 'one line tall, not stretched').toBeLessThan(60);

      await page.locator('#cameraDrawerToggle').click();
      await expect(page.locator('#cameraDrawerBody')).toBeVisible();
      const open = await measure();
      expect(open.padOpen).toBe(true);
      // Measured on the release base: y 665..690 inside the pad's 498..811
      // band, washed out with the pad's own heading printed through it.
      expect(open.behindPad, 'clear of the camera pad').toBe(false);
      expect(open.behindActionsBar, 'still clear of the actions bar').toBe(
        false
      );
    });
  });
}

test.describe('UF-42: the row goes home when the window grows', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('toolbar-restore: a desktop-shaped resize puts the four controls back, live', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await loadSampleProject(page);

    await expect(page.locator('body')).toHaveAttribute(
      'data-mobile-toolbar',
      'relocated'
    );
    await expect(page.locator('.preview-drawer-title')).toHaveClass(/sr-only/);

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('body')).toHaveAttribute(
      'data-mobile-toolbar',
      'home'
    );
    await expect(page.locator('.preview-drawer-title')).not.toHaveClass(
      /sr-only/
    );
    const home = await page
      .locator('.workflow-actions')
      .evaluate((el) => el.parentElement.id);
    expect(home).toBe('workflowProgress');

    // And back again, without a reload.
    await page.setViewportSize({ width: 412, height: 915 });
    await expect(page.locator('body')).toHaveAttribute(
      'data-mobile-toolbar',
      'relocated'
    );
    const away = await page
      .locator('.workflow-actions')
      .evaluate((el) => el.parentElement.className);
    expect(away).toContain('preview-drawer-header-right');
  });
});

test.describe('UF-42: the welcome surface is left alone', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('toolbar-welcome-untouched: high contrast and theme stay in the workflow row before a file is open', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });

    // The Customizer row does not exist here, and components.css force-shows
    // the workflow row on this surface precisely so these two stay reachable
    // on the first screen a low-vision user meets.
    await expect(page.locator('body')).toHaveAttribute(
      'data-mobile-toolbar',
      'home'
    );
    for (const selector of ['#contrastToggle', '#themeToggle']) {
      const control = page.locator(selector);
      await expect(control).toBeVisible();
      expect(
        await control.evaluate((el) => el.closest('#workflowProgress') !== null)
      ).toBe(true);
    }
    await expect(page.locator('.preview-drawer-title')).not.toHaveClass(
      /sr-only/
    );
  });
});
