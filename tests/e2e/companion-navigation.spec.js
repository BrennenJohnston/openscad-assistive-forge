/**
 * E2E tests for companion-file navigation (UF-23, U-32).
 *
 * The reported dead-end: once a companion file is open there is no way back.
 * Measured at develop@008dd6c, in both interfaces:
 *   - Apply and Ctrl+S drop focus on <body>, because the file list is rebuilt
 *     with innerHTML before closeModal fires, so the button it captured as the
 *     trigger is detached and .focus() on it does nothing.
 *   - Escape is bound to the textarea, not the dialog, so it does nothing once
 *     the user has tabbed to Cancel or the X.
 *
 * These cases carry the same isCI skip as project-files.spec.js next door:
 * they need a real multi-file project, which needs the file handler, which is
 * not registered until WASM is ready. Local win32 is where they execute.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';

const isCI = !!process.env.CI;

const CLASSIC_STAMP = JSON.stringify({
  mode: 'classic',
  lastCustomMode: 'standard',
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
});

/**
 * Load the nested multi-file example and open the companion tree inside
 * utils/, so an editable companion (helpers.scad) is on screen.
 * Companion Files is defaultHiddenInBasic, so Standard density is required.
 */
const openCompanionTree = async (
  page,
  { classic = false, enterFolder = 'utils', mobileDrawer = false } = {}
) => {
  if (classic) {
    await page.addInitScript((stamp) => {
      localStorage.setItem('openscad-forge-ui-mode', stamp);
    }, CLASSIC_STAMP);
  } else {
    await page.addInitScript(() => {
      localStorage.setItem(
        'openscad-forge-ui-mode',
        JSON.stringify({ mode: 'standard', lastCustomMode: 'standard' })
      );
    });
  }

  await page.goto('/?example=multi-file-box');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 120_000,
  });
  await page.waitForFunction(
    () => document.querySelectorAll('#projectFilesList *').length > 0,
    { timeout: 30_000 }
  );

  // A narrow viewport parks the whole parameter column in the mobile drawer,
  // so the panel is off screen until the drawer is opened.
  if (mobileDrawer) {
    await page.locator('#mobileDrawerToggle').click();
    await expect(page.locator('#projectFilesControls')).toBeVisible();
  }

  // The panel ships with its disclosure closed. In Classic a closed disclosure
  // is display:none entirely (classic.css) and Window > Companion Files is the
  // real way in, so open it directly rather than clicking a hidden summary.
  // This is setup, not the behaviour under test.
  await page.evaluate(() => {
    const d = document.querySelector('#projectFilesControls details');
    if (d && !d.open) d.open = true;
  });

  if (!enterFolder) return;

  await page
    .locator(`#projectFilesList [data-folder-enter="${enterFolder}"]`)
    .click();
  await expect(
    page.locator('#projectFilesList [data-action="edit"]').first()
  ).toBeVisible();
};

/**
 * Open the editor for the first companion and wait for the focus trap's
 * deferred initial focus to actually land (focus-trap.js defers it by rAF,
 * so acting sooner races it).
 */
const openEditor = async (page) => {
  await page.locator('#projectFilesList [data-action="edit"]').first().click();
  await expect(page.locator('#textFileEditorModal')).not.toHaveClass(/hidden/);
  await page.waitForFunction(
    () => document.activeElement?.id === 'textFileEditorContent',
    { timeout: 5000 }
  );
};

/** Describe the focused element well enough to assert on it. */
const focusedDescriptor = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return 'BODY';
    return [
      el.tagName,
      el.dataset?.action ? `action=${el.dataset.action}` : '',
      el.dataset?.path ? `path=${el.dataset.path}` : '',
    ]
      .filter(Boolean)
      .join(' ');
  });

/**
 * Every control the companion tree offers, with the selector scoped to the
 * whole panel rather than to #projectFilesList: UF-31 moves the breadcrumb bar
 * out of the list (D-38), and this measurement must hold either side of that.
 */
const TREE_CONTROLS = [
  { name: 'breadcrumb', selector: '#projectFilesControls .file-nav-breadcrumb-btn' },
  { name: 'edit button', selector: '#projectFilesControls [data-action="edit"]' },
  { name: 'remove button', selector: '#projectFilesControls [data-action="remove"]' },
  { name: 'folder row', selector: '#projectFilesControls [data-folder-enter]' },
];

/**
 * Measure every tree control against the RESOLVED touch-target token, never a
 * literal 44: --size-touch-target is 44px by default and 36px under
 * (pointer: fine) and (min-width: 768px), so a desktop Chromium run is
 * measured against 36 and a phone against 44. Reading the token at runtime is
 * the standing rule for this project's target assertions.
 */
const measureTreeControls = (page) =>
  page.evaluate((controls) => {
    const token = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        '--size-touch-target'
      )
    );
    const measured = [];
    for (const { name, selector } of controls) {
      for (const el of document.querySelectorAll(selector)) {
        const r = el.getBoundingClientRect();
        measured.push({
          name,
          label: el.getAttribute('aria-label') || el.textContent.trim(),
          w: Math.round(r.width * 10) / 10,
          h: Math.round(r.height * 10) / 10,
        });
      }
    }
    return { token, measured };
  }, TREE_CONTROLS);

/** Controls smaller than the token in either dimension, described for a report. */
const underToken = ({ token, measured }) =>
  measured
    .filter((m) => m.w + 0.5 < token || m.h + 0.5 < token)
    .map((m) => `${m.name} "${m.label}" ${m.w}x${m.h} < ${token}`);

test.describe('Companion files: controls you can hit (D-37)', () => {
  test.describe.configure({ timeout: 180_000 });

  /**
   * D-37, MEASURED on this release's base (develop@2f89c48) at 1400x900,
   * identical in both interfaces, against a resolved token of 36px:
   *   home breadcrumb 24.5x22, folder crumb 30.8x22,
   *   edit button 26.5x24, remove button 19.8x24, folder rows 523x33.1.
   * These are the controls that ARE the way back through the tree.
   */
  for (const ui of [{ classic: false, name: 'Forge' }, { classic: true, name: 'Classic' }]) {
    test(`every tree control meets the touch-target token (${ui.name})`, async ({
      page,
    }) => {
      test.skip(isCI, 'Needs a real multi-file project, so needs WASM');

      // At the root: the two folder rows and the main file's row.
      await openCompanionTree(page, {
        classic: ui.classic,
        enterFolder: null,
      });
      const atRoot = await measureTreeControls(page);
      expect(
        atRoot.measured.filter((m) => m.name === 'folder row').length
      ).toBe(2);
      expect(underToken(atRoot).join('\n')).toBe('');

      // Inside utils/: the breadcrumb bar and an editable companion's buttons.
      await page.locator('#projectFilesList [data-folder-enter="utils"]').click();
      await expect(
        page.locator('#projectFilesList [data-action="edit"]').first()
      ).toBeVisible();
      const inFolder = await measureTreeControls(page);
      expect(
        inFolder.measured.filter((m) => m.name === 'breadcrumb').length
      ).toBeGreaterThanOrEqual(2);
      expect(
        inFolder.measured.some((m) => m.name === 'edit button')
      ).toBe(true);
      expect(underToken(inFolder).join('\n')).toBe('');
    });
  }

  /**
   * The token flips at the media query boundary — 36px only under
   * (pointer: fine) and (min-width: 768px) — so a desktop run never exercises
   * the 44px value a phone gets. This case does, and it is also the width
   * where two 44px buttons and a file name have to share one row.
   */
  test.describe('on a phone', () => {
    test.use({ viewport: { width: 375, height: 800 } });

    test('every tree control meets the touch-target token (Forge, 375px)', async ({
      page,
    }) => {
      test.skip(isCI, 'Needs a real multi-file project, so needs WASM');

      await openCompanionTree(page, { enterFolder: null, mobileDrawer: true });

      const measured = await measureTreeControls(page);
      expect(measured.token).toBe(44);
      expect(underToken(measured).join('\n')).toBe('');

      await page.locator('#projectFilesList [data-folder-enter="utils"]').click();
      await expect(
        page.locator('#projectFilesList [data-action="edit"]').first()
      ).toBeVisible();
      expect(underToken(await measureTreeControls(page)).join('\n')).toBe('');
    });
  });
});

test.describe('Companion files: a way back', () => {
  test.describe.configure({ timeout: 180_000 });

  test('Apply returns focus to the row of the file just saved (Forge)', async ({
    page,
  }) => {
    test.skip(isCI, 'Needs a real multi-file project, so needs WASM');

    await openCompanionTree(page);
    await openEditor(page);
    await page.locator('#textFileEditorApply').click();

    await expect(page.locator('#textFileEditorModal')).toHaveClass(/hidden/);
    await expect
      .poll(() => focusedDescriptor(page), { timeout: 5000 })
      .toBe('BUTTON action=edit path=utils/helpers.scad');
  });

  test('Ctrl+S returns focus to the row of the file just saved (Forge)', async ({
    page,
  }) => {
    test.skip(isCI, 'Needs a real multi-file project, so needs WASM');

    await openCompanionTree(page);
    await openEditor(page);
    await page.keyboard.press('Control+s');

    await expect(page.locator('#textFileEditorModal')).toHaveClass(/hidden/);
    await expect
      .poll(() => focusedDescriptor(page), { timeout: 5000 })
      .toBe('BUTTON action=edit path=utils/helpers.scad');
  });

  test('Escape closes the editor from the Cancel button, not just the textarea', async ({
    page,
  }) => {
    test.skip(isCI, 'Needs a real multi-file project, so needs WASM');

    await openCompanionTree(page);
    await openEditor(page);

    // The keyboard user's real path: tab off the textarea, then ask to leave.
    await page.locator('#textFileEditorCancel').focus();
    await page.keyboard.press('Escape');

    await expect(page.locator('#textFileEditorModal')).toHaveClass(/hidden/);
    await expect
      .poll(() => focusedDescriptor(page), { timeout: 5000 })
      .toBe('BUTTON action=edit path=utils/helpers.scad');
  });

  test('Apply returns focus to the row of the file just saved (Classic)', async ({
    page,
  }) => {
    test.skip(isCI, 'Needs a real multi-file project, so needs WASM');

    await openCompanionTree(page, { classic: true });
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    await openEditor(page);
    await page.locator('#textFileEditorApply').click();

    await expect(page.locator('#textFileEditorModal')).toHaveClass(/hidden/);
    await expect
      .poll(() => focusedDescriptor(page), { timeout: 5000 })
      .toBe('BUTTON action=edit path=utils/helpers.scad');
  });

  test('an edited companion reaches the render (the U-30 interlock)', async ({
    page,
  }) => {
    test.skip(isCI, 'Needs a real render, so needs WASM');

    await openCompanionTree(page);

    // helpers.scad defines rounded_cube(), which main.scad's geometry calls.
    // Coarsening its cylinders must change the mesh the renderer produces.
    const trianglesBefore = await page.evaluate(() =>
      document.body.innerText.match(/([\d,]+)\s+triangles/)?.[1]
    );
    expect(trianglesBefore).toBeTruthy();

    await openEditor(page);
    await page.evaluate(() => {
      const ta = document.getElementById('textFileEditorContent');
      ta.value = ta.value.replace(
        'cylinder(r=radius, h=h);',
        'cylinder(r=radius, h=h, $fn=6);'
      );
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.locator('#textFileEditorApply').click();

    await expect
      .poll(
        () => page.evaluate(() =>
          document.body.innerText.match(/([\d,]+)\s+triangles/)?.[1]
        ),
        { timeout: 60_000 }
      )
      .not.toBe(trianglesBefore);
  });
});
