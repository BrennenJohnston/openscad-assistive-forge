/**
 * One status, one voice. A preview's news was written to the status area,
 * the preview's status bar, the preview badge and the announcer, all live,
 * so a screen reader said "Preview ready" four times per change and a
 * Generate's result as often. The announcer is the one voice for status;
 * the other surfaces keep their text for the eye and for navigation.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';
import {
  announcementMark,
  announcementsSince,
  recordAnnouncements,
} from './helpers/invariants.js';

async function openBox(page) {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
  await recordAnnouncements(page);
  await page.goto('/?example=simple-box');
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-current/,
    { timeout: 180_000 }
  );
}

async function setWidth(page, value) {
  await page.evaluate(() => {
    const group = document.querySelector(
      '.param-group[data-group-id="Dimensions"]'
    );
    if (group && !group.open) group.open = true;
  });
  const field = page.locator('#param-width-spinbox');
  await field.fill(String(value));
  await field.press('Enter');
}

// Lets the last writes of an event land before they are counted.
const SETTLE_MS = 1_500;

test('a preview says "Preview ready" once', async ({ page }) => {
  test.setTimeout(240_000);
  await openBox(page);

  const mark = await announcementMark(page);
  await setWidth(page, 60);
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-current/,
    { timeout: 120_000 }
  );
  await page.waitForTimeout(SETTLE_MS);

  const said = await announcementsSince(page, mark);
  const ready = said.filter((a) => /Preview ready/.test(a.text));
  expect(ready, JSON.stringify(said)).toHaveLength(1);
});

test('a preview left outdated says so in the status bars, and only then', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openBox(page);
  await page.evaluate(() => {
    window.__outdatedWrites = 0;
    const text = document.getElementById('previewStatusText');
    new MutationObserver(() => {
      if (text.textContent === 'Preview outdated') window.__outdatedWrites++;
    }).observe(text, { childList: true, characterData: true, subtree: true });
  });

  // Automatic preview on: the change passes through "outdated" unsaid.
  await setWidth(page, 60);
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-current/,
    { timeout: 120_000 }
  );
  expect(await page.evaluate(() => window.__outdatedWrites)).toBe(0);

  // Off: the preview stays outdated, and the bars agree with the badge.
  await page.locator('#autoPreviewToggle').evaluate((box) => box.click());
  await expect(page.locator('#autoPreviewToggle')).not.toBeChecked();
  await setWidth(page, 70);
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-stale/
  );
  await expect(page.locator('#previewStatusText')).toHaveText(
    'Preview outdated'
  );
  await expect(page.locator('#statusArea')).toHaveText('Preview outdated');
});

test('a Generate says its result once', async ({ page }) => {
  test.setTimeout(240_000);
  await openBox(page);
  // An OBJ is always generated anew; the preview's STL may already be the
  // file to download.
  await page.locator('#outputFormat').selectOption('obj');
  await expect(page.locator('#primaryActionBtn')).toHaveAttribute(
    'data-action',
    'generate'
  );
  // Open, as it is in a tall window, so its size line could speak.
  const drawer = page.locator('#previewDrawerToggle');
  if ((await drawer.getAttribute('aria-expanded')) !== 'true') await drawer.click();
  await expect(page.locator('#stats')).toBeVisible();

  const mark = await announcementMark(page);
  await page.locator('#primaryActionBtn').click();
  await expect(page.locator('#primaryActionBtn')).toHaveAttribute(
    'data-action',
    'download',
    { timeout: 120_000 }
  );
  await page.waitForTimeout(SETTLE_MS);

  const said = await announcementsSince(page, mark);
  expect(
    said.filter((a) => /Generating OBJ/.test(a.text)),
    JSON.stringify(said)
  ).toHaveLength(1);
  const result = said.filter((a) => /OBJ ready/.test(a.text));
  expect(result, JSON.stringify(said)).toHaveLength(1);
  expect(
    said.filter((a) => /Preview ready/.test(a.text)),
    JSON.stringify(said)
  ).toHaveLength(0);
  // The size and triangle line is there to be read, not said.
  expect(
    said.filter((a) => /Size:/.test(a.text)),
    JSON.stringify(said)
  ).toHaveLength(0);
});

test('nothing reads "Generating" while nothing is generating', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openBox(page);
  await expect(page.locator('.preview-rendering-overlay')).toBeHidden();
  // The code editor is a region to work in, not a voice.
  await expect(page.locator('#expertModePanel')).not.toHaveAttribute(
    'aria-live',
    /.*/
  );
});

test('a failed preview says its error once, naming the file as it was opened', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
  await recordAnnouncements(page);
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 180_000,
  });
  const mark = await announcementMark(page);
  await page.locator('#fileInput').setInputFiles({
    name: 'broken.scad',
    mimeType: 'text/plain',
    buffer: Buffer.from(['size = 10;', 'cube(size', ''].join('\n')),
  });
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-error/,
    { timeout: 120_000 }
  );
  await page.waitForTimeout(SETTLE_MS);

  const said = await announcementsSince(page, mark);
  const failed = said.filter((a) => /Preview failed/.test(a.text));
  expect(failed, JSON.stringify(said)).toHaveLength(1);
  expect(failed[0].text).toContain('broken.scad');
  expect(failed[0].text).not.toContain('/tmp/');
});

test('Unlock Parameter Limits says its new state once, each way', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openBox(page);
  // Advanced settings are in Standard.
  const mode = page.locator('#uiModeToggle');
  if ((await mode.getAttribute('aria-checked')) !== 'true') await mode.click();
  await expect(mode).toHaveAttribute('aria-checked', 'true');
  const box = page.locator('#unlockLimitsToggle');
  await page.evaluate(() => {
    const el = document.getElementById('unlockLimitsToggle');
    for (let p = el; p; p = p.parentElement) {
      if (p.tagName === 'DETAILS') p.open = true;
    }
  });

  let mark = await announcementMark(page);
  await box.check();
  await page.waitForTimeout(500);
  let said = await announcementsSince(page, mark);
  expect(
    said.filter((a) => /limits unlocked/.test(a.text)),
    JSON.stringify(said)
  ).toHaveLength(1);
  expect(said.filter((a) => /restored/.test(a.text))).toHaveLength(0);

  mark = await announcementMark(page);
  await box.uncheck();
  await page.waitForTimeout(500);
  said = await announcementsSince(page, mark);
  expect(
    said.filter((a) => /limits restored/.test(a.text)),
    JSON.stringify(said)
  ).toHaveLength(1);
});

test('one warning is said by its line; several also by their count, once', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
  await recordAnnouncements(page);
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 180_000,
  });

  async function open(name, lines) {
    const mark = await announcementMark(page);
    await page.locator('#fileInput').setInputFiles({
      name,
      mimeType: 'text/plain',
      buffer: Buffer.from([...lines, ''].join('\n')),
    });
    const notNow = page.locator('#saveProjectNotNow');
    await notNow.click({ timeout: 30_000 });
    await expect(page.locator('.preview-state-indicator')).toHaveClass(
      /state-current/,
      { timeout: 120_000 }
    );
    await page.waitForTimeout(SETTLE_MS);
    return announcementsSince(page, mark);
  }

  let said = await open('one_warning.scad', ['cube(size_a);']);
  expect(
    said.filter((a) => /Model has/.test(a.text)),
    JSON.stringify(said)
  ).toHaveLength(0);

  said = await open('two_warnings.scad', ['cube(size_a);', 'sphere(size_b);']);
  expect(
    said.filter((a) => /Model has 2 warnings/.test(a.text)),
    JSON.stringify(said)
  ).toHaveLength(1);
});
