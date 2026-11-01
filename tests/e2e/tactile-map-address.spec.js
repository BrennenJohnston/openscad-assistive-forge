/**
 * The Tactile Map Designer's address section in the app: the section above
 * the plates, reachable by keyboard; a search answered by a routed Nominatim
 * reply; the first place focused, a pick said; the page clean under axe.
 *
 * @license GPL-3.0-or-later
 */
import { previewSettled } from './helpers/preview-settled.js';
import { goToStep } from './helpers/map-steps.js';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync, readFileSync } from 'node:fs';

const ALLOWED_AXE_VIOLATIONS = [];

const NOMINATIM = [
  {
    place_id: 1,
    osm_type: 'way',
    osm_id: 37056442,
    lat: '47.6067142',
    lon: '-122.3326983',
    category: 'amenity',
    type: 'library',
    importance: 0.37,
    name: 'The Seattle Public Library - Central Library',
    display_name:
      'The Seattle Public Library - Central Library, 1000, 4th Avenue, Seattle, Washington, 98104, United States',
  },
  {
    place_id: 2,
    osm_type: 'node',
    osm_id: 3435946993,
    lat: '47.6065451',
    lon: '-122.3322194',
    category: 'amenity',
    type: 'cafe',
    importance: 0.0001,
    name: "Howdy Y'all Coffee",
    display_name:
      "Howdy Y'all Coffee, 1000, 4th Avenue, Seattle, Washington, 98164, United States",
  },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
});

async function dismissSavePrompt(page) {
  const notNow = page.locator('#saveProjectNotNow');
  try {
    await notNow.waitFor({ state: 'visible', timeout: 5000 });
    await notNow.click();
    await notNow.waitFor({ state: 'hidden', timeout: 5000 });
  } catch {
    // Prompt didn't appear
  }
}

async function openTactileMap(page) {
  await page.goto('/?example=tactile-map&type=place');
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#tactileMapPanel')).toBeVisible({
    timeout: 15000,
  });
  await dismissSavePrompt(page);
}

test.describe('the address section', () => {
  test('stands above the plates, searches by keyboard through a routed answer, focuses the first place and says the pick', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    let searched = null;
    await page.route('https://nominatim.openstreetmap.org/search*', (route) => {
      searched = new URL(route.request().url()).searchParams;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(NOMINATIM),
      });
    });
    await openTactileMap(page);

    // A place map's first step: the panel names the type, the step says
    // which of how many, and the address field stands in it.
    await expect(
      page
        .locator('#tactileMapPanel')
        .getByRole('heading', { name: 'A place map' })
    ).toBeVisible();
    const step = page.locator('#tactileMapSteps-step-1');
    await expect(page.locator('#tactileMapSteps-heading')).toHaveText(
      'Step 1 of 5: Where'
    );
    await expect(step.locator('#tactileMapAddress')).toBeVisible();

    const input = page.locator('#tactileMapAddress');
    const button = page.locator('#tactileMapSearch');
    await expect(input).toHaveAttribute('autocomplete', 'off');
    // The floor for this pointer: 44 px on touch, the desktop density on a mouse.
    const floor = await page.evaluate(() =>
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--size-touch-target'
        )
      )
    );
    expect((await input.boundingBox()).height).toBeGreaterThanOrEqual(floor);
    expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(floor);

    await input.click();
    await page.keyboard.type('1000 4th Ave, Seattle, WA');
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    await page.keyboard.press('Enter');

    const radios = page.locator('#tactileMapResults input[type="radio"]');
    await expect(radios).toHaveCount(2, { timeout: 15000 });
    expect(searched.get('format')).toBe('jsonv2');
    expect(searched.get('limit')).toBe('5');
    expect(searched.get('q')).toBe('1000 4th Ave, Seattle, WA');
    expect(searched.has('email')).toBe(false);
    await expect(radios.first()).toBeFocused();
    await expect(page.locator('#tactileMapResults legend')).toHaveText(
      'Places found'
    );

    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#tactileMapAddressStatus')).toHaveText(
      `${NOMINATIM[1].display_name} picked. The preview shows an empty plate until you make the map.`
    );
  });

  test('a pull every server refuses shows the failure in the box, keeps Make a draft map waiting with its reason, and the preview holds the empty NO MAP YET plate', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.route('https://nominatim.openstreetmap.org/search*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(NOMINATIM),
      })
    );
    // The map tiles and both servers refuse, as the main one refuses the
    // published site. The pull's real 30 s and 60 s waits run: the app's
    // render limits use the same values, so the page's timers are left alone.
    const asked = [];
    await page.route('https://tiles.openstreetmap.us/**', (route) => {
      asked.push('tiles');
      return route.fulfill({
        status: 503,
        headers: { 'access-control-allow-origin': '*' },
        body: '',
      });
    });
    for (const url of [
      'https://overpass-api.de/api/interpreter',
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    ]) {
      await page.route(url, (route) => {
        asked.push(url);
        return route.fulfill({
          status: 406,
          headers: { 'access-control-allow-origin': '*' },
          body: 'Not Acceptable',
        });
      });
    }
    await openTactileMap(page);
    await expect(page.locator('#echoMessages')).toContainText('Finished map', {
      timeout: 120000,
    });

    await page.locator('#tactileMapAddress').fill('1000 4th Ave, Seattle, WA');
    await page.locator('#tactileMapSearch').click();
    await page
      .locator('#tactileMapResults input[type="radio"]')
      .first()
      .check();
    await expect(page.locator('#param-title_text')).toHaveValue('NO MAP YET');

    await goToStep(page, 4);
    const next = page.locator('#tactileMapSteps-next');
    const reason = page.locator('#tactileMapSteps-reason');
    await expect(next).toBeDisabled();
    await expect(next).toHaveAttribute(
      'aria-describedby',
      'tactileMapSteps-reason'
    );
    await expect(reason).toHaveText('Make the map first.');

    await page.locator('#tactileMapMake').click();
    const box = page.locator('#tactileMapAddressStatus');
    await expect(box).toHaveText(
      'No map server answered. Try again in a few minutes, or export the area from openstreetmap.org and use the file instead.',
      { timeout: 150000 }
    );
    await expect(box).toBeVisible();
    await expect(box).toHaveClass(/is-failed/);
    expect(asked.filter((u) => u.includes('maps.mail.ru')).length).toBe(3);
    expect(asked.filter((u) => u.includes('overpass-api.de')).length).toBe(3);
    expect(asked.filter((u) => u === 'tiles').length).toBeGreaterThanOrEqual(1);
    await expect(next).toBeDisabled();
    await expect(reason).toBeVisible();
    await expect(page.locator('#tactileMapMake')).toBeEnabled();

    // The preview renders the empty plate: the map file has no features and
    // the model's echo says it finished.
    const levels = await page.evaluate(
      () => document.getElementById('tactileMapPanel').__forgeMapPanel.plan
    );
    expect(levels.features).toEqual([]);
    expect(levels.meta.title).toBe('NO MAP YET');
    await expect(page.locator('.preview-state-indicator')).toHaveClass(
      /state-current/,
      { timeout: 120000 }
    );
    await expect(page.locator('#echoMessages')).toContainText(
      'Finished map: 480 x 360 mm'
    );
  });

  test('a place map gets its data from the map tiles, never asking an Overpass server, and drafts from them', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const GATES = {
      place_id: 3,
      lat: '47.652873',
      lon: '-122.3044814',
      type: 'university',
      importance: 0.5,
      display_name:
        'Bill & Melinda Gates Center, 3800, East Stevens Way Northeast, Seattle, Washington, 98195, United States',
    };
    await page.route('https://nominatim.openstreetmap.org/search*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify([GATES]),
      })
    );
    // Real tiles over the University of Washington (fetched 2026-11-01;
    // map data from OpenStreetMap contributors, ODbL); any other tile empty.
    const tiles = [];
    await page.route('https://tiles.openstreetmap.us/**', (route) => {
      const name = route.request().url().split('/sourdough/')[1];
      tiles.push(name);
      const file = `tests/fixtures/tactile-map/sourdough-${name.replace('.mvt', '').replaceAll('/', '-')}.mvt`;
      return existsSync(file)
        ? route.fulfill({
            status: 200,
            contentType: 'application/x-protobuf',
            headers: { 'access-control-allow-origin': '*' },
            body: readFileSync(file),
          })
        : route.fulfill({
            status: 204,
            headers: { 'access-control-allow-origin': '*' },
          });
    });
    // The Overpass servers by their hosts (a pattern on the word would
    // catch the app's own overpass.js module too).
    const overpass = [];
    for (const host of [
      'https://overpass-api.de/**',
      'https://maps.mail.ru/**',
    ]) {
      await page.route(host, (route) => {
        overpass.push(route.request().url());
        return route.fulfill({ status: 406, body: 'no' });
      });
    }
    await openTactileMap(page);
    await page.locator('#tactileMapAddress').fill('3800 E Stevens Way NE');
    await page.locator('#tactileMapSearch').click();
    await page
      .locator('#tactileMapResults input[type="radio"]')
      .first()
      .check();
    await goToStep(page, 4);
    await expect(page.locator('#tactileMapAttribution')).toContainText(
      'Tiles by OSM US'
    );
    await page.locator('#tactileMapMake').click();
    const box = page.locator('#tactileMapAddressStatus');
    await page.waitForFunction(
      () =>
        document.querySelector('#drawingEditorSurface .drawing-editor')?.dataset
          .purpose === 'map',
      null,
      { timeout: 60000 }
    );
    await expect(box).toHaveText(/^Draft map ready: \d+ of \d+ features on/);
    await expect(box).not.toHaveClass(/is-failed/);
    expect(tiles).toEqual(['15/5251/11437.mvt']);
    expect(overpass).toEqual([]);
  });

  test('the page with the address section passes an axe scan, with results shown', async ({
    page,
  }) => {
    await page.route('https://nominatim.openstreetmap.org/search*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(NOMINATIM),
      })
    );
    await openTactileMap(page);
    await page.locator('#tactileMapAddress').fill('1000 4th Ave, Seattle, WA');
    await page.locator('#tactileMapSearch').click();
    await expect(
      page.locator('#tactileMapResults input[type="radio"]')
    ).toHaveCount(2, { timeout: 15000 });
    await previewSettled(page);
    const results = await new AxeBuilder({ page }).analyze();
    const violations = results.violations.filter(
      (v) => !ALLOWED_AXE_VIOLATIONS.includes(v.id)
    );
    expect(
      violations,
      violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`).join('\n')
    ).toEqual([]);
  });
});
