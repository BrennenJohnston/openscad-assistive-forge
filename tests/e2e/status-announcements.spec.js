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
});
