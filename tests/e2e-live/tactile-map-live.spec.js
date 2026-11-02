/**
 * The Tactile Map Designer on a deployed site, with the real services: a
 * person's place map and route map, from the address search to a draft in
 * the drawing editor. Nothing is routed. A map server that refuses the site
 * and leaves the app with no data is a red: that is the point of this lane.
 *
 * Run by hand against a deployed preview (see playwright.live.config.js);
 * the services are shared, so this lane never runs on every push.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';
import { goToStep } from '../e2e/helpers/map-steps.js';

/** A draft, or a sentence that ends the press without one. */
const READY = /^(Draft|Route) map ready: /;
const ENDED =
  /No map server answered\. Try again|did not arrive|No sidewalks within|No walking route/;
/** Nominatim's policy: one search a second. */
const SEARCH_GAP_MS = 1100;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    localStorage.setItem('openscad-forge-theme', 'dark');
  });
});

async function openTile(page, type) {
  await page.goto(`/?example=tactile-map&type=${type}`);
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 60000 });
  const notNow = page.locator('#saveProjectNotNow');
  try {
    await notNow.waitFor({ state: 'visible', timeout: 8000 });
    await notNow.click();
  } catch {
    // The prompt did not appear.
  }
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 180000,
  });
}

/** Search, then pick the first place whose name matches. */
async function pick(page, { field, press, list }, query, wanted) {
  await page.locator(field).fill(query);
  await page.locator(press).click();
  const radios = page.locator(`${list} input[type="radio"]`);
  await expect(radios.first()).toBeVisible({ timeout: 30000 });
  const names = await page.locator(`${list} label`).allTextContents();
  const at = names.findIndex((n) => wanted.test(n));
  expect(at, `"${query}" found ${JSON.stringify(names)}`).toBeGreaterThanOrEqual(0);
  await radios.nth(at).check();
  return names[at];
}

const FROM = {
  field: '#tactileMapAddress',
  press: '#tactileMapSearch',
  list: '#tactileMapResults',
};
const TO = {
  field: '#tactileMapTo',
  press: '#tactileMapToSearch',
  list: '#tactileMapToResults',
};

/** Make the map and wait for the draft, or fail on the sentence that ends it. */
async function makeTheMap(page) {
  await goToStep(page, 4);
  const box = page.locator('#tactileMapAddressStatus');
  const started = Date.now();
  await page.locator('#tactileMapMake').click();
  await expect
    .poll(async () => (await box.textContent()) || '', {
      timeout: 240000,
      intervals: [1000],
    })
    .toMatch(new RegExp(`${READY.source}|${ENDED.source}`));
  const said = (await box.textContent()) || '';
  test.info().annotations.push({
    type: 'pull',
    description: `${Math.round((Date.now() - started) / 1000)} s: ${said}`,
  });
  expect(said, 'the press ended without a map').toMatch(READY);
}

async function editorOpens(page) {
  await page.waitForFunction(
    () =>
      document.querySelector('#drawingEditorSurface .drawing-editor')?.dataset
        .purpose === 'map',
    null,
    { timeout: 120000 }
  );
}

test.describe('the Tactile Map Designer with the live services', () => {
  test('a place map: the Gates Center, data from a live server, a draft in the editor', async ({
    page,
  }) => {
    await openTile(page, 'place');
    await pick(page, FROM, '3800 E Stevens Way NE', /Gates Center/);
    await makeTheMap(page);
    await editorOpens(page);
    await expect(page.locator('#tactileMapAddressStatus')).toHaveText(
      /^Draft map ready: \d+ of \d+ features on/
    );
    const plan = await page.evaluate(() => {
      const p = document.getElementById('tactileMapPanel').__forgeMapPanel.plan;
      return { features: p.features.length, waiting: Boolean(p.meta?.waiting) };
    });
    expect(plan.waiting).toBe(false);
    expect(plan.features).toBeGreaterThan(0);
    // The empty plate's title left with the draft.
    const title = page.locator('#param-title_text');
    if (await title.count()) await expect(title).not.toHaveValue('NO MAP YET');
  });

  test('a route map on foot: the Husky Union Building to the Gates Center, data from a live server, a route in the editor', async ({
    page,
  }) => {
    await openTile(page, 'route');
    await pick(page, FROM, 'Husky Union Building', /Husky Union/);
    await page.waitForTimeout(SEARCH_GAP_MS);
    await pick(page, TO, '3800 E Stevens Way NE', /Gates Center/);
    await makeTheMap(page);
    await editorOpens(page);
    await expect(page.locator('#tactileMapAddressStatus')).toHaveText(
      /^Route map ready: a \d+ m walk from Husky Union Building to Bill & Melinda Gates Center/
    );
  });
});
