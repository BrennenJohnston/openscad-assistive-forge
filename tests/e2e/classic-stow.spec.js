import { test, expect } from '@playwright/test';
import path from 'path';
import AxeBuilder from '@axe-core/playwright';

// Field stow (release UF-2, U-6/Q-20): each side dock field stows toward its
// own edge, growing the 3D view, leaving a labelled un-stow tab on the edge
// rail. UF-2a machinery — the drawer chrome and the bottom strip's conversion
// are UF-2b.
//
// Its own file for the same reason classic-panels.spec.js is: classic-mode is
// 2500 lines and the Chromium CI clock is the release's scarcest resource.

const SAMPLE = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');

const WASM_READY_TIMEOUT = 180_000;

const PANES_KEY = 'openscad-forge-classic-panes';

/** Seed pane visibility so every stowable field is occupied at entry. */
function seedPanes(page, panes = {}) {
  return page.addInitScript(
    ([key, value]) => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem(key, JSON.stringify(value));
    },
    [
      PANES_KEY,
      {
        editorVisible: true,
        customizerVisible: true,
        consoleCollapsed: false,
        animateVisible: false,
        fontListVisible: false,
        viewportControlVisible: true,
        ...panes,
      },
    ]
  );
}

async function loadProject(page, fixture = SAMPLE) {
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  await page.locator('#fileInput').setInputFiles(fixture);
  await expect(page.locator('#welcomeScreen')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 10_000 });

  const notNowBtn = page.locator('#saveProjectNotNow');
  try {
    await notNowBtn.waitFor({ state: 'visible', timeout: 3_000 });
    await notNowBtn.click();
  } catch {
    // Save-project modal did not appear; nothing to dismiss.
  }
}

async function enterClassicStandard(page) {
  await page.locator('#classicModeToggle').click();
  await expect(page.locator('body')).toHaveAttribute('data-ui-mode', 'classic');
  const densityToggle = page.locator('#classicDensityToggle');
  await expect(densityToggle).toBeVisible({ timeout: 10_000 });
  if ((await densityToggle.getAttribute('aria-checked')) !== 'true') {
    await densityToggle.click();
  }
  await expect(page.locator('body')).toHaveAttribute(
    'data-classic-density',
    'standard'
  );
}

/** Record everything the polite live region says, in arrival order. */
async function watchAnnouncements(page, name = '__recordStowAnnouncement') {
  const seen = [];
  await page.exposeFunction(name, (text) => {
    if (text) seen.push(text);
  });
  await page.evaluate((fn) => {
    const region = document.getElementById('srAnnouncer');
    region.textContent = '';
    new MutationObserver(() => window[fn](region.textContent.trim())).observe(
      region,
      { childList: true, characterData: true, subtree: true }
    );
  }, name);
  return seen;
}

test.describe('Field stow (UF-2a)', () => {
  test('classic-stow-left: stowing frees the space, empties the tab order, and the tab restores it', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await seedPanes(page);
    await loadProject(page);
    await enterClassicStandard(page);

    const announcements = await watchAnnouncements(page);
    const before = await page.locator('.preview-panel').boundingBox();

    const stowBtn = page.locator('.classic-stow-btn[data-classic-stow-field="left"]');
    await expect(stowBtn).toHaveAttribute('aria-label', 'Stow the left column');
    await expect(stowBtn).toHaveAttribute('aria-expanded', 'true');
    await stowBtn.click();

    // The field reports empty, its container leaves the layout AND the
    // accessibility tree (the R-III lesson, asserted from day one).
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-stow-left',
      'true'
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-field-left',
      'empty'
    );
    await expect(page.locator('.classic-dock-field--left')).toBeHidden();

    // Tab stops inside a stowed field: exactly zero.
    const reachable = await page.evaluate(() => {
      const field = document.querySelector('.classic-dock-field--left');
      return [
        ...field.querySelectorAll(
          'button, [tabindex], input, select, textarea, a[href]'
        ),
      ].filter((el) => el.offsetParent !== null).length;
    });
    expect(reachable).toBe(0);

    // The 3D view grew by the stowed column's width.
    const after = await page.locator('.preview-panel').boundingBox();
    expect(after.width).toBeGreaterThan(before.width + 100);

    // Focus follows to the control that undoes the action, which names the
    // stowed content first (SC 2.5.3) and what pressing it does.
    const tab = page.locator(
      '.classic-stow-tab[data-classic-stow-field="left"]'
    );
    await expect(tab).toBeFocused();
    await expect(tab).toHaveAttribute(
      'aria-label',
      'Editor. Restore the left column'
    );
    await expect(tab).toHaveAttribute('aria-expanded', 'false');

    // Restore from the tab: field back, focus back on the stow control.
    await tab.click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-field-left',
      'occupied'
    );
    await expect(page.locator('.classic-dock-field--left')).toBeVisible();
    await expect(stowBtn).toBeFocused();
    await expect(tab).toHaveCount(0);

    // One announcement per action, none swallowed.
    await expect
      .poll(() => announcements.filter((a) => a === 'Left column stowed').length)
      .toBe(1);
    await expect
      .poll(
        () => announcements.filter((a) => a === 'Left column restored').length
      )
      .toBe(1);
  });

  test('classic-stow-persistence: a stowed field hydrates stowed, tab and all', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await seedPanes(page, { stowRightTop: true });
    await loadProject(page);
    await enterClassicStandard(page);

    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-stow-right-top',
      'true'
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-field-right-top',
      'empty'
    );
    const tab = page.locator(
      '.classic-stow-tab[data-classic-stow-field="right-top"]'
    );
    await expect(tab).toBeVisible();
    await expect(tab).toHaveAttribute(
      'aria-label',
      'Customizer. Restore the upper right'
    );

    // Restoring writes the preference back.
    await tab.click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-field-right-top',
      'occupied'
    );
    const stored = await page.evaluate((key) => {
      return JSON.parse(localStorage.getItem(key));
    }, PANES_KEY);
    expect(stored.stowRightTop).toBe(false);
  });

  test('classic-stow-relocation: moving a panel into a stowed field restores the field first', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await seedPanes(page);
    await loadProject(page);
    await enterClassicStandard(page);

    await page
      .locator('.classic-stow-btn[data-classic-stow-field="left"]')
      .click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-field-left',
      'empty'
    );

    // Move Console to the left column through its ⋮ menu.
    await page.locator('[aria-label="Move Console"]').click();
    await page
      .locator('[role="menuitem"]')
      .filter({ has: page.getByText('Move to left column', { exact: true }) })
      .click();

    // The stowed target came back rather than swallowing the panel.
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-field-left',
      'occupied'
    );
    await expect(page.locator('.classic-dock-field--left')).toBeVisible();
    await expect(
      page.locator('.classic-dock-field--left .classic-console-slot')
    ).toBeVisible();
    const stored = await page.evaluate((key) => {
      return JSON.parse(localStorage.getItem(key));
    }, PANES_KEY);
    expect(stored.stowLeft).toBe(false);
  });

  test('classic-stow-mobile-guard: below the breakpoint a stowed preference hides nothing', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 900, height: 800 });
    await seedPanes(page, { stowLeft: true });
    await loadProject(page);
    await enterClassicStandard(page);

    // The stacked layout ignores stow until UF-2c: the field stays reachable
    // and no stow chrome dangles without a working mechanism behind it. The
    // count is what makes this case fail on the parent (toBeHidden alone is
    // vacuously true for controls that do not exist).
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-field-left',
      'occupied'
    );
    await expect(page.locator('.classic-dock-field--left')).toBeVisible();
    await expect(page.locator('.classic-stow-btn')).toHaveCount(4);
    await expect(page.locator('.classic-stow-btn').first()).toBeHidden();
    await expect(page.locator('.classic-stow-rail--left')).toBeHidden();
  });

  test('classic-stow-a11y: the tab meets the touch-target token and axe reports nothing new', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await seedPanes(page);
    await loadProject(page);
    await enterClassicStandard(page);

    const baseline = await new AxeBuilder({ page })
      .include('#mainInterface')
      .analyze();
    const baselineIds = new Set(baseline.violations.map((v) => v.id));

    await page
      .locator('.classic-stow-btn[data-classic-stow-field="left"]')
      .click();
    await page
      .locator('.classic-stow-btn[data-classic-stow-field="right-bottom"]')
      .click();

    // The token is pointer-aware (44px touch / 36px fine pointer) — assert
    // against its resolved value, never a literal.
    const tab = page.locator(
      '.classic-stow-tab[data-classic-stow-field="left"]'
    );
    await expect(tab).toBeVisible();
    const minTarget = await page.evaluate(() =>
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--size-touch-target'
        )
      )
    );
    const box = await tab.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(minTarget);
    expect(box.height).toBeGreaterThanOrEqual(minTarget);

    const stowed = await new AxeBuilder({ page })
      .include('#mainInterface')
      .analyze();
    for (const violation of stowed.violations) {
      expect(
        baselineIds.has(violation.id),
        `new axe violation in the stowed arrangement: ${violation.id}`
      ).toBe(true);
    }
  });
});

test.describe('Bottom stow — the converted strip fold (UF-2b, Q-20c)', () => {
  test('classic-stow-bottom: the strip stows to a bottom bar tab, sparing the camera bar', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    // Viewport-Control OFF: with the lower-right field occupied, row 3 is
    // deliberately kept for it and the 3D view would not grow — that
    // arrangement has its own case below.
    await seedPanes(page, { viewportControlVisible: false });
    await loadProject(page);
    await enterClassicStandard(page);

    const cameraBarBefore = await page
      .locator('.classic-camera-bar')
      .boundingBox();
    const previewBefore = await page.locator('.preview-panel').boundingBox();

    const stowBtn = page.locator(
      '.classic-stow-btn[data-classic-stow-field="bottom"]'
    );
    await expect(stowBtn).toHaveAttribute(
      'aria-label',
      'Stow the bottom panels'
    );
    await stowBtn.click();

    // The whole strip leaves layout and tab order; the way back is a
    // horizontal tab in the strip's own grid row, NOT an overlay — the camera
    // bar owns the bottom edge and must not be covered.
    await expect(page.locator('.classic-bottom-strip')).toBeHidden();
    const tab = page.locator(
      '.classic-stow-tab[data-classic-stow-field="bottom"]'
    );
    await expect(tab).toBeVisible();
    await expect(tab).toHaveAttribute(
      'aria-label',
      'Console, Error-Log. Restore the bottom panels'
    );
    const tabBox = await tab.boundingBox();
    const cameraBarAfter = await page
      .locator('.classic-camera-bar')
      .boundingBox();
    expect(
      tabBox.y,
      'the bottom tab must sit below the camera bar, not on it'
    ).toBeGreaterThanOrEqual(cameraBarAfter.y + cameraBarAfter.height - 1);
    expect(cameraBarAfter.width).toBeGreaterThan(cameraBarBefore.width * 0.9);

    // The 3D view grew into the freed height.
    const previewAfter = await page.locator('.preview-panel').boundingBox();
    expect(previewAfter.height).toBeGreaterThan(previewBefore.height + 50);

    // Restore from the tab: strip back, focus on the stow control.
    await tab.click();
    await expect(page.locator('.classic-bottom-strip')).toBeVisible();
    await expect(stowBtn).toBeFocused();
  });

  test('classic-stow-bottom-vpc: stowing the strip does not crush Viewport-Control', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await seedPanes(page);
    await loadProject(page);
    await enterClassicStandard(page);

    const vpcBefore = await page
      .locator('.classic-dock-field--right-bottom')
      .boundingBox();

    await page
      .locator('.classic-stow-btn[data-classic-stow-field="bottom"]')
      .click();
    await expect(page.locator('.classic-bottom-strip')).toBeHidden();

    // Before UF-2b, folding the strip flattened the lower-right field to a
    // bare title bar because both share grid row 3 (measured in the Q-20
    // probe). The row now keeps its size while the field is occupied.
    const vpcAfter = await page
      .locator('.classic-dock-field--right-bottom')
      .boundingBox();
    expect(
      vpcAfter.height,
      'Viewport-Control lost its height to the bottom stow'
    ).toBeGreaterThan(vpcBefore.height * 0.8);
  });

  test('classic-stow-bottom-legacy: a pre-UF-2 folded profile hydrates as stowed', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    // consoleCollapsed is the fold's historical key (D-8); Q-20c upgraded its
    // presentation, so a folded preference must come back as the stow.
    await seedPanes(page, { consoleCollapsed: true });
    await loadProject(page);
    await enterClassicStandard(page);

    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-stow-bottom',
      'true'
    );
    await expect(page.locator('.classic-bottom-strip')).toBeHidden();
    await expect(
      page.locator('.classic-stow-tab[data-classic-stow-field="bottom"]')
    ).toBeVisible();
  });

  test('classic-strip-default-height: Q-20e raised the default (0.65fr)', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await seedPanes(page);
    await loadProject(page);
    await enterClassicStandard(page);

    // The owner chose a taller default strip over compressing the Console
    // chrome (Q-20e). Pin the token, not pixels — fr resolution depends on
    // the window, and a user drag rightly overrides the default.
    const token = await page.evaluate(() =>
      getComputedStyle(document.body)
        .getPropertyValue('--classic-row-bottom-default')
        .trim()
    );
    expect(token).toContain('0.65fr');
  });
});
