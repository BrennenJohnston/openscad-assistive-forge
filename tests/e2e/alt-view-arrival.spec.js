/**
 * Finding the Alt View: the key drops from the top of the screen into its
 * place beside the theme button, the buttons after it making room, wearing
 * the Alt View's own colors; then it redraws itself into the ordinary key.
 * With reduced motion it simply appears.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';

const SEQUENCE = [
  'cameraRotateUp',
  'cameraRotateUp',
  'cameraRotateDown',
  'cameraRotateDown',
  'cameraRotateLeft',
  'cameraRotateRight',
  'cameraRotateLeft',
  'cameraRotateRight',
  'cameraPanDown',
  'cameraPanRight',
];

async function openBox(page, theme = 'dark') {
  await page.addInitScript((theme) => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    localStorage.setItem('openscad-forge-theme', theme);
  }, theme);
  await page.goto('/?example=simple-box');
  await page.waitForFunction(() => window.previewManager?.mesh, null, {
    timeout: 180_000,
  });
  const notNow = page.locator('#saveProjectNotNow');
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3_000 });
    await notNow.click();
  } catch {
    // No save-project prompt to dismiss.
  }
  const uiToggle = page.locator('#uiModeToggle');
  if ((await uiToggle.getAttribute('aria-checked')) !== 'true') {
    await uiToggle.click();
  }
  await page.locator('#cameraPanelToggle').click();
  await expect(page.locator('#cameraRotateUp')).toBeVisible();
}

// Every state the key passes through, with the room between the theme button
// and the button after the key (the row is right-aligned, so the buttons
// before the key are the ones that slide) and the colors the arriving key
// wore, from now on.
async function watch(page) {
  await page.evaluate(() => {
    const seen = (window.__arrival = { states: [], room: [], colors: [] });
    const theme = document.getElementById('themeToggle');
    const after = theme.nextElementSibling;
    const room = () =>
      after.getBoundingClientRect().left - theme.getBoundingClientRect().right;
    seen.roomBefore = room();
    const note = (key) => {
      const state = key.getAttribute('data-arrival');
      if (state && seen.states.at(-1) !== state) {
        seen.states.push(state);
        seen.room.push(room());
        const shown = key.querySelector('.alt-view-arrival');
        if (shown) {
          const s = getComputedStyle(shown);
          seen.colors.push([s.borderTopColor, s.color]);
        }
      }
    };
    new MutationObserver(() => {
      const key = document.getElementById('_hfmToggle');
      if (key) note(key);
    }).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-arrival'],
    });
  });
}

async function playSequence(page) {
  for (const id of SEQUENCE) {
    const box = await page.locator(`#${id}`).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
}

test.describe('The key arrives', () => {
  test('it drops into its place, the buttons make room, and it becomes the ordinary key', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openBox(page);
    await watch(page);
    await playSequence(page);

    const key = page.locator('#_hfmToggle');
    await expect(key).toBeVisible();
    await expect(key).not.toHaveAttribute('data-arrival', /.+/, { timeout: 12_000 });
    await expect(page.locator('.alt-view-arrival')).toHaveCount(0);
    await expect(key).toHaveAttribute('aria-label', 'Alt View');
    await expect(key).toHaveAttribute('aria-pressed', 'false');

    const seen = await page.evaluate(() => window.__arrival);
    expect(seen.states).toEqual(['dropping', 'landed', 'settled']);
    // No room had opened when it began to fall, and a key's width had once it
    // landed.
    expect(Math.abs(seen.room[0] - seen.roomBefore)).toBeLessThanOrEqual(2);
    const width = await key.evaluate((el) => el.getBoundingClientRect().width);
    expect(seen.room[1] - seen.roomBefore).toBeGreaterThanOrEqual(width);
    // In the dark theme the arriving key wears the Alt View's green.
    expect(seen.colors[0]).toEqual(['rgb(0, 255, 0)', 'rgb(0, 255, 0)']);
  });

  test('in the light theme it wears the amber', async ({ page }) => {
    test.setTimeout(240_000);
    await openBox(page, 'light');
    await watch(page);
    await playSequence(page);
    await expect(page.locator('#_hfmToggle')).not.toHaveAttribute(
      'data-arrival',
      /.+/,
      { timeout: 12_000 }
    );
    const seen = await page.evaluate(() => window.__arrival);
    expect(seen.colors[0]).toEqual(['rgb(255, 176, 0)', 'rgb(255, 176, 0)']);
  });

  test('with reduced motion it simply appears', async ({ page }) => {
    test.setTimeout(240_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openBox(page);
    expect(
      await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      'the setting is on'
    ).toBe(true);
    await watch(page);
    await playSequence(page);
    await expect(page.locator('#_hfmToggle')).toBeVisible();
    await page.waitForTimeout(1_000);
    const seen = await page.evaluate(() => window.__arrival);
    expect(seen.states).toEqual([]);
    await expect(page.locator('.alt-view-arrival')).toHaveCount(0);
  });
});
