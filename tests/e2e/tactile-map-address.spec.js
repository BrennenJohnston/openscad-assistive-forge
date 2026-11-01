/**
 * The Tactile Map Designer's address section in the app: the section above
 * the plates, reachable by keyboard; a search answered by a routed Nominatim
 * reply; the first place focused, a pick said; the page clean under axe.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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
  await page.goto('/?example=tactile-map');
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

    const section = page.locator('#tactileMapAddressSection');
    await expect(section).toBeVisible();
    await expect(section.getByRole('heading', { name: 'Map from an address' })).toBeVisible();
    // Above the plates section in the document.
    expect(
      await page.evaluate(() => {
        const a = document.getElementById('tactileMapAddressSection');
        const b = document.getElementById('tactileMapPanel');
        return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      })
    ).toBe(true);

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
    await expect(
      page.locator('#tactileMapResults legend')
    ).toHaveText('Places found');

    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#tactileMapAddressStatus')).toHaveText(
      `${NOMINATIM[1].display_name} picked. Choose a radius and the landmarks, then get the map data. The preview shows an empty plate until you make a draft map.`
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
    // Both servers refuse, as the main one refuses the published site. The
    // pull's real 30 s and 60 s waits run: the app's render limits use the
    // same values, so the page's timers are left alone.
    const asked = [];
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
    await expect(page.locator('#echoMessages')).toContainText(
      'Finished map',
      { timeout: 120000 }
    );

    await page.locator('#tactileMapAddress').fill('1000 4th Ave, Seattle, WA');
    await page.locator('#tactileMapSearch').click();
    await page
      .locator('#tactileMapResults input[type="radio"]')
      .first()
      .check();
    await expect(page.locator('#param-title_text')).toHaveValue('NO MAP YET');

    const draft = page.locator('#tactileMapDraft');
    const reason = page.locator('#tactileMapDraftReason');
    await expect(draft).toBeDisabled();
    await expect(draft).toHaveAttribute(
      'aria-describedby',
      'tactileMapDraftReason'
    );
    await expect(reason).toBeVisible();
    await expect(reason).toHaveText('Get the map data first.');

    await page.locator('#tactileMapGetData').click();
    const box = page.locator('#tactileMapAddressStatus');
    await expect(box).toHaveText(
      'No map server answered. Try again in a few minutes, or export the area from openstreetmap.org and use the file instead.',
      { timeout: 150000 }
    );
    await expect(box).toBeVisible();
    await expect(box).toHaveClass(/is-failed/);
    expect(asked.filter((u) => u.includes('maps.mail.ru')).length).toBe(3);
    expect(asked.filter((u) => u.includes('overpass-api.de')).length).toBe(3);
    await expect(draft).toBeDisabled();
    await expect(reason).toBeVisible();

    // The preview renders the empty plate: the map file has no features and
    // the model's echo says it finished.
    const levels = await page.evaluate(
      () =>
        document.getElementById('tactileMapPanel').__forgeMapPanel.plan
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
