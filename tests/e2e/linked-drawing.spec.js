/**
 * E2E: a drawing sent by a link (DP-62).
 *
 * `?example=logo-plate&drawing=<url>` fetches a drawing from an allowed host,
 * hands it to the plate's logo parameter, converts it when it is a picture
 * or a DXF, and opens the drawing editor on it. With nothing else in the
 * link, the standalone editor opens on the drawing instead. A host the site
 * may not fetch from is refused with a sentence.
 *
 * The host is played by route interception, the way the manifest tests do
 * it: nothing here reaches the network.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures');
const HOST = 'https://raw.githubusercontent.com/testuser/testrepo/main';

const TYPES = {
  svg: 'image/svg+xml',
  png: 'image/png',
  dxf: 'application/dxf',
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    window.__announcements = [];
    document.addEventListener('DOMContentLoaded', () => {
      // Every live region, not one: the file control's own announcements go
      // through the polite region and are replaced within its debounce.
      for (const region of document.querySelectorAll('[aria-live]')) {
        new MutationObserver(() => {
          const text = region.textContent.trim();
          if (text) window.__announcements.push(text);
        }).observe(region, {
          childList: true,
          characterData: true,
          subtree: true,
        });
      }
    });
  });
});

/** Serve one fixture as if it lived on GitHub. */
async function serve(page, name, fixtureRel) {
  const body = readFileSync(path.join(FIXTURES, fixtureRel));
  const ext = name.split('.').pop();
  await page.route(`${HOST}/${name}`, (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': TYPES[ext] || 'application/octet-stream',
      },
      body,
    })
  );
  return `${HOST}/${name}`;
}

const logoName = (page) =>
  page.evaluate(() => {
    const v = window.stateManager?.getState()?.parameters?.logo_file;
    return v && typeof v === 'object' ? v.name : v;
  });

/**
 * An example opened from a link raises "Save this file for quick access?".
 * The lane holds the drawing back until it is answered, so the test answers
 * it the way a person does.
 */
async function dismissSavePrompt(page) {
  const notNow = page.getByRole('button', { name: 'Not now', exact: true });
  await notNow.waitFor({ state: 'visible', timeout: 60000 });
  await notNow.click();
}

async function openPlateWith(page, url) {
  await page.goto(`/?example=logo-plate&drawing=${encodeURIComponent(url)}`);
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    timeout: 120000,
  });
  await dismissSavePrompt(page);
}

test.describe('A drawing sent by a link (DP-62)', () => {
  test('an SVG lands in the Logo Plate and the editor opens on it', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Chromium only');
    test.slow();
    const url = await serve(page, 'nested-squares.svg', 'svg-edit/nested-squares.svg');
    await openPlateWith(page, url);

    // The editor opens by itself, whatever the analysis would have decided.
    const editor = page.getByRole('region', { name: 'Drawing editor' });
    await expect(editor.first()).toBeVisible({ timeout: 120000 });
    await expect(page.locator('.svg-prep-object').first()).toBeVisible({
      timeout: 60000,
    });
    // The link's drawing is the plate's design.
    await expect.poll(() => logoName(page), { timeout: 60000 }).toBe(
      'nested-squares.svg'
    );
    // And the link was cleaned off the address, so a refresh does not fetch
    // it again.
    expect(page.url()).not.toContain('drawing=');

    // Apply, and the plate renders from it.
    await expect(page.getByRole('button', { name: /^Apply/ }).first())
      .toBeEnabled({ timeout: 90000 });
    await page
      .getByRole('button', { name: /^Apply/ })
      .first()
      .click();
    await expect(page.locator('text=Preview ready').first()).toBeVisible({
      timeout: 120000,
    });
  });

  test('a picture is converted without a press, and the editor opens on the result', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Chromium only');
    test.slow();
    const url = await serve(page, 'bird-drawing.png', 'svg-edit/bird-drawing.png');
    await openPlateWith(page, url);

    // The conversion ran (the design is the converted SVG) and the editor is
    // open on it, with no Start pressed by anyone.
    await expect.poll(() => logoName(page), { timeout: 120000 }).toBe(
      'bird-drawing.svg'
    );
    const editor = page.getByRole('region', { name: 'Drawing editor' });
    await expect(editor.first()).toBeVisible({ timeout: 120000 });
    await expect(page.locator('.svg-prep-object').first()).toBeVisible({
      timeout: 60000,
    });
  });

  test('a DXF is converted through the engine and the editor opens on it', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Chromium only');
    test.slow();
    const url = await serve(page, 'known-extents.dxf', 'dxf/known-extents.dxf');
    await openPlateWith(page, url);

    await expect.poll(() => logoName(page), { timeout: 120000 }).toBe(
      'known-extents.svg'
    );
    const editor = page.getByRole('region', { name: 'Drawing editor' });
    await expect(editor.first()).toBeVisible({ timeout: 120000 });
    // The control names the converted file, under the DXF's own name.
    await expect(page.locator('#param-logo_file').locator('..').locator('.file-info').first())
      .toContainText('known-extents.svg', { timeout: 60000 });
  });

  test('a host the site may not fetch from is refused with a sentence', async ({
    page,
  }) => {
    await page.goto(
      `/?example=logo-plate&drawing=${encodeURIComponent('https://example.com/cat.svg')}`
    );
    await expect
      .poll(
        () => page.evaluate(() => window.__announcements.join(' | ')),
        { timeout: 60000 }
      )
      .toMatch(/example\.com is not a host Forge may fetch from/);
    // Nothing was loaded into the design.
    expect(await logoName(page)).not.toBe('cat.svg');
  });

  test('with nothing else in the link, the standalone editor opens on the drawing', async ({
    page,
  }) => {
    test.slow();
    const url = await serve(page, 'nested-squares.svg', 'svg-edit/nested-squares.svg');
    await page.goto(`/?drawing=${encodeURIComponent(url)}`);
    // The door is its own surface over the whole page, not the charm host's
    // region, so the editor's element is the thing to wait for.
    await expect(page.locator('.drawing-editor').first()).toBeVisible({
      timeout: 120000,
    });
    await expect(page.locator('.svg-prep-object').first()).toBeVisible({
      timeout: 60000,
    });
    await expect(page.getByText('opened for editing').first()).toBeVisible({
      timeout: 60000,
    });
  });
});
