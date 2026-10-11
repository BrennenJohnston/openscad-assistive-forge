/**
 * What File > Export says and saves: a PDF of a 3D model is refused in words
 * that point at the formats that work, once; downloaded files are named for
 * the project and the day.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';
import {
  announcementMark,
  announcementsSince,
  recordAnnouncements,
} from './helpers/invariants.js';

test.describe.configure({ timeout: 180_000 });

async function openBox(page) {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
  await recordAnnouncements(page);
  await page.goto('/?example=simple-box');
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-current/,
    { timeout: 120_000 }
  );
}

/** File > Export > the item with this label, by the menu, in Standard. */
async function exportAs(page, label) {
  const mode = page.locator('#uiModeToggle');
  if ((await mode.getAttribute('aria-checked')) !== 'true') await mode.click();
  await page.locator('#fileMenuBtn').click();
  await page
    .locator('#fileMenuItems button')
    .filter({ has: page.getByText('Export', { exact: true }) })
    .click();
  await page
    .locator('#fileMenuItems button')
    .filter({ has: page.getByText(label, { exact: true }) })
    .click();
}

test('a PDF of a 3D model points at SVG and DXF, said once', async ({
  page,
}) => {
  await openBox(page);
  const mark = await announcementMark(page);
  await exportAs(page, 'Export as PDF…');
  const toast = page.locator('.error-toast').last();
  await expect(toast).toContainText(
    'PDF export needs a 2D model. For this 3D model, export SVG or DXF, which offer an approximate outline.'
  );
  await page.waitForTimeout(1_000);
  const said = await announcementsSince(page, mark);
  expect(
    said.filter((a) => /PDF export/i.test(a.text)),
    JSON.stringify(said)
  ).toHaveLength(1);
});

test('downloads are named for the project and the day; the STL kinds apart', async ({
  page,
}) => {
  await openBox(page);
  const day = new Date().toISOString().slice(0, 10);
  const names = [];
  for (const label of [
    'Export as STL (ascii)…',
    'Export as STL (binary)…',
    'Export as Image…',
  ]) {
    const download = page.waitForEvent('download', { timeout: 60_000 });
    await exportAs(page, label);
    names.push((await download).suggestedFilename());
  }
  expect(names).toEqual([
    `simple_box-${day}-ascii.stl`,
    `simple_box-${day}-binary.stl`,
    'simple_box-preview.png',
  ]);
});

test('Export Changed Settings names the project in its file', async ({
  page,
}) => {
  await openBox(page);
  await page.evaluate(() => {
    const g = document.querySelector('.param-group[data-group-id="Dimensions"]');
    if (g) g.open = true;
  });
  const field = page.locator('#param-width-spinbox');
  await field.fill('55');
  await field.press('Enter');
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-current/,
    { timeout: 120_000 }
  );
  const mode = page.locator('#uiModeToggle');
  if ((await mode.getAttribute('aria-checked')) !== 'true') await mode.click();
  // The button is in the Customizer's Advanced section, folded by default.
  await page.evaluate(() => {
    for (
      let p = document.getElementById('exportChangedBtn');
      p;
      p = p.parentElement
    ) {
      if (p.tagName === 'DETAILS') p.open = true;
    }
  });
  const download = page.waitForEvent('download', { timeout: 30_000 });
  await page.locator('#exportChangedBtn').click();
  const file = await download;
  const day = new Date().toISOString().slice(0, 10);
  expect(file.suggestedFilename()).toBe(`simple_box-${day}-changed-settings.json`);
  const text = await new Promise((resolve, reject) => {
    file.createReadStream().then((s) => {
      let out = '';
      s.on('data', (c) => (out += c));
      s.on('end', () => resolve(out));
      s.on('error', reject);
    });
  });
  expect(JSON.parse(text).modelName).toBe('simple_box.scad');
});
