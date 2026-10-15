/**
 * Sharing a project and opening a drawing, from their homes: Copy Link with
 * the presets, Publish in the File menu (Standard only), and the drawing
 * editor's picker in the Design menu.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
});

async function openBox(page, uiMode) {
  if (uiMode) {
    await page.addInitScript((m) => {
      localStorage.setItem('openscad-forge-ui-mode', JSON.stringify(m));
    }, uiMode);
  }
  await page.goto('/?example=simple-box');
  await page
    .locator('.param-control')
    .first()
    .waitFor({ state: 'attached', timeout: 60000 });
  const notNow = page.locator('#saveProjectNotNow');
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3000 });
    await notNow.click();
    await notNow.waitFor({ state: 'hidden', timeout: 3000 });
  } catch {
    // Not every load raises the save prompt
  }
}

const STANDARD = { mode: 'standard', lastCustomMode: 'standard' };

/** The labels of a menu-bar menu's items, opened by its button. */
async function menuLabels(page, menuId) {
  await page.locator(`#${menuId}MenuBtn`).click();
  await expect(page.locator(`#${menuId}MenuItems`)).toBeVisible();
  return page
    .locator(`#${menuId}MenuItems > li > button .menu-item-label`)
    .allTextContents();
}

function menuItem(page, menuId, label) {
  return page
    .locator(`#${menuId}MenuItems > li > button`)
    .filter({ has: page.locator('.menu-item-label', { hasText: label }) });
}

test.describe('Sharing and drawings', () => {
  test('Copy Link sits with the presets and copies a link that reopens the design', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openBox(page);
    const presets = page.locator('#presetControls');
    if (!(await presets.evaluate((d) => d.open))) {
      await presets.locator('summary').click();
    }
    const copyLink = page.locator('.preset-actions-row #copySettingsLinkBtn');
    await expect(copyLink).toBeVisible();
    await expect(copyLink).toHaveText(/Copy Link/);

    await copyLink.click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('?example=simple-box');
  });

  test('Publish is in the File menu in Standard and opens its dialog', async ({
    page,
  }) => {
    await openBox(page, STANDARD);
    const labels = await menuLabels(page, 'file');
    expect(labels).toContain('Publish…');

    await menuItem(page, 'file', 'Publish…').click();
    await expect(page.locator('#publishProjectModal')).toBeVisible();
  });

  test('Publish is not offered in Simplified, even with the File menu shown', async ({
    page,
  }) => {
    // Simplified with only Publish left hidden, so the File menu shows.
    await openBox(page, {
      mode: 'simplified',
      lastCustomMode: 'simplified',
      hiddenPanels: ['publish'],
    });
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'simplified'
    );
    const labels = await menuLabels(page, 'file');
    expect(labels).toContain('Save As…');
    expect(labels).not.toContain('Publish…');
  });

  test('the Design menu opens a drawing in the drawing editor', async ({
    page,
  }) => {
    await openBox(page, STANDARD);
    await menuLabels(page, 'design');
    const chooser = page.waitForEvent('filechooser');
    await menuItem(page, 'design', 'Open a drawing in the editor…').click();
    const picked = await chooser;
    expect(
      await picked.element().evaluate((el) => el.id)
    ).toBe('svgEditFileInput');
  });
});
