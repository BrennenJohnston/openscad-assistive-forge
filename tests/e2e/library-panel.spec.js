/**
 * E2E tests for File > Show Library Folder… (UF-24, U-33, D-41).
 *
 * A browser has no library folder on disk, so this command's whole job is to
 * reveal the panel listing the bundles this build mounts.
 *
 * Measured at develop@7ae711b, Classic Simplified: the command runs, and
 * nothing happens. Simplified hides #libraryControls with the mode
 * controller's `ui-mode-hidden` class, while _showLibraryBundles removes
 * `hidden` — a different class that is not there. The panel stays
 * display:none, and because a display:none summary cannot take focus, the
 * .focus() call is a silent no-op and focus lands on <body> when the menu
 * closes.
 *
 * Classic Simplified is the only surface where this is reachable: Forge
 * Simplified hides the File menu itself, and Standard density does not hide
 * the panel. These cases need no library bundle on disk — the panel's
 * visibility is independent of whether the bundles were downloaded — so they
 * run on every lane.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';

const stamp = (mode, lastCustomMode) =>
  JSON.stringify({ mode, lastCustomMode });

/** Load a project so the toolbar is on screen, in the given density. */
const openProject = async (page, uiStamp) => {
  await page.addInitScript(
    (s) => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
      localStorage.setItem('openscad-forge-ui-mode', s);
    },
    uiStamp
  );

  await page.goto('/?example=library-test');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 120_000,
  });
  await expect(page.locator('#mainInterface')).toBeVisible({
    timeout: 30_000,
  });
};

const invokeShowLibraryFolder = async (page) => {
  await page.locator('#fileMenuBtn').click();
  const item = page.locator('[role=menuitem]:has-text("Show Library Folder")');
  await expect(item).toHaveCount(1);
  await item.first().click();
};

/** Where focus actually is, in a form a failure message can be read from. */
const focusDescription = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return 'body';
    return el.className
      ? `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`
      : el.tagName.toLowerCase();
  });

test.describe('File > Show Library Folder…', () => {
  test('reveals the Libraries panel in Classic Simplified', async ({
    page,
  }) => {
    await openProject(page, stamp('classic', 'simplified'));

    // The premise: Simplified really does hide it to begin with.
    await expect(page.locator('#libraryControls')).toBeHidden();

    await invokeShowLibraryFolder(page);

    await expect(page.locator('#libraryControls')).toBeVisible();
    await expect(page.locator('#libraryList .library-item')).toHaveCount(4);
  });

  test('leaves focus on the Libraries panel, not on the body', async ({
    page,
  }) => {
    await openProject(page, stamp('classic', 'simplified'));
    await invokeShowLibraryFolder(page);

    await expect
      .poll(() => focusDescription(page), { timeout: 5_000 })
      .toBe('summary.library-summary');
  });

  test('still reveals and focuses the panel in Classic Standard', async ({
    page,
  }) => {
    await openProject(page, stamp('classic', 'standard'));
    await invokeShowLibraryFolder(page);

    await expect(page.locator('#libraryControls')).toBeVisible();
    await expect
      .poll(() => focusDescription(page), { timeout: 5_000 })
      .toBe('summary.library-summary');
  });
});
