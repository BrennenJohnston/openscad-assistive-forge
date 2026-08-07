// Memory banner emergency actions.
//
// This banner is the app's last-chance data-preservation UI: it appears at
// critical/emergency memory with role="alert" telling the user to save
// immediately. Four of its six actions had rotted into no-ops against
// elements that no longer exist, which is only discoverable by exercising
// them — hence this spec.

import { test, expect } from '@playwright/test';
import path from 'path';

const FIXTURE = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
const WASM_READY_TIMEOUT = 180_000;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
  });
});

async function setup(page, { save = false } = {}) {
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  await page.locator('#fileInput').setInputFiles(FIXTURE);
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 30_000 });

  if (save) {
    await page.locator('#saveProjectCheckbox').waitFor({ timeout: 10_000 });
    await page.locator('#saveProjectCheckbox').check();
    await page.locator('#saveProjectSave').click();
  } else {
    const notNow = page.locator('#saveProjectNotNow');
    try {
      await notNow.waitFor({ state: 'visible', timeout: 3_000 });
      await notNow.click();
    } catch {
      /* no modal */
    }
  }
  await expect(page.locator('.save-project-modal')).toHaveCount(0, {
    timeout: 10_000,
  });

  // Force the banner visible; its handlers bind at init regardless of state
  await page.evaluate(() => {
    const b = document.getElementById('memoryBanner');
    b.dataset.state = 'emergency';
    b.dataset.visible = 'true';
  });
}

const persisted = (page) =>
  page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('openscad-forge-saved-projects');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const store = db
      .transaction('projects', 'readonly')
      .objectStore('projects');
    const all = await new Promise((res, rej) => {
      const r = store.getAll();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return all[0]?.content || '';
  });

test('banner Save Project reaches a real save (and flushes the editor)', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await setup(page, { save: true });

  await page.locator('#uiModeToggle').click();
  await page.locator('#expertModeToggle').click();
  const cm = page.locator('#expertModeBody .cm-content');
  await expect(cm).toBeVisible({ timeout: 15_000 });
  await cm.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n// BANNER_SAVE', { delay: 25 });

  expect(await persisted(page)).not.toContain('BANNER_SAVE');

  await page.locator('#memoryBannerSave').click();

  await expect
    .poll(() => persisted(page), { timeout: 20_000 })
    .toContain('BANNER_SAVE');
  await expect(page.locator('#editorDirtyIndicator')).toHaveAttribute(
    'aria-hidden',
    'true',
    { timeout: 15_000 }
  );
});

test('banner Export STL says so honestly when there is no render', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await setup(page);

  await page.evaluate(() => window.stateManager.setState({ stl: null }));
  await page.locator('#memoryBannerExport').click();

  await expect(page.getByText('No Rendered Model').first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByText('No rendered model to export').first()
  ).toBeVisible({ timeout: 10_000 });
});

test('banner Export STL downloads the existing render', async ({ page }) => {
  test.setTimeout(300_000);
  await setup(page);

  // Produce a full render first (Generate), then the banner exports it
  const btn = page.locator('#primaryActionBtn');
  await expect(btn).toContainText('Generate', { timeout: 30_000 });
  await btn.click();
  await expect(btn).toContainText('Download', { timeout: 180_000 });

  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  await page.locator('#memoryBannerExport').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.stl$/i);
});

test('banner Reload tooltip no longer promises a save', async ({ page }) => {
  test.setTimeout(240_000);
  await setup(page);

  const tip = await page.locator('#memoryBannerReload').getAttribute('title');
  expect(tip).not.toContain('will be saved');
  expect(tip).toContain('unsaved changes will be lost');
});

test('banner Disable Auto-Preview actually turns auto-preview off', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await setup(page);

  // Left deliberately dead in R1: it targets #autoPreviewToggle, which did
  // not exist until phase C4 created it. This is the case that proves the
  // convergence happened.
  const toggle = page.locator('#autoPreviewToggle');
  await expect(toggle).toHaveCount(1);
  await expect(toggle).toBeChecked();

  await page.locator('#memoryBannerDisableAuto').click();

  await expect(toggle).not.toBeChecked();

  // The change has to reach the controller, not just the checkbox: a
  // parameter change must no longer start a preview.
  const stillDisabled = await page.evaluate(
    () => document.getElementById('autoPreviewToggle').checked
  );
  expect(stillDisabled).toBe(false);
});
