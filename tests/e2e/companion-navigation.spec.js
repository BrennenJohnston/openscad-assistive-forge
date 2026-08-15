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
const openCompanionTree = async (page, { classic = false } = {}) => {
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

  // The panel ships with its disclosure closed. In Classic a closed disclosure
  // is display:none entirely (classic.css) and Window > Companion Files is the
  // real way in, so open it directly rather than clicking a hidden summary.
  // This is setup, not the behaviour under test.
  await page.evaluate(() => {
    const d = document.querySelector('#projectFilesControls details');
    if (d && !d.open) d.open = true;
  });

  await page.locator('#projectFilesList [data-folder-enter="utils"]').click();
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
