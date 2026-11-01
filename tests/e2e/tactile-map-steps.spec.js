/**
 * The Tactile Map Designer's workflows by keyboard alone: the chooser asks
 * what map to make; each map type walks its numbered steps with the step's
 * heading taking focus at each change; a place map and a route map reach
 * the editor with Make the map; a map from a drawing reaches it through its
 * door. Every step passes an axe scan. The address search answers from a
 * routed reply and the map data from the real tiles over the University of
 * Washington (fetched 2026-11-01; OpenStreetMap contributors, ODbL).
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync, readFileSync } from 'node:fs';

const ALLOWED_AXE_VIOLATIONS = [];
const GATES = {
  place_id: 3,
  lat: '47.652873',
  lon: '-122.3044814',
  type: 'university',
  importance: 0.5,
  display_name:
    'Bill & Melinda Gates Center, 3800, East Stevens Way Northeast, Seattle, Washington, 98195, United States',
};
const HUB = {
  place_id: 1,
  lat: '47.6553685',
  lon: '-122.3051021',
  type: 'university',
  importance: 0.5,
  display_name:
    'Husky Union Building, 4001, East Stevens Way Northeast, Seattle, Washington, 98195, United States',
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
  await page.route('https://nominatim.openstreetmap.org/search*', (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') || '';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify([/husky|hub/i.test(q) ? HUB : GATES]),
    });
  });
  await page.route('https://tiles.openstreetmap.us/**', (route) => {
    const name = route.request().url().split('/sourdough/')[1];
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
});

async function openChooser(page) {
  await page.goto('/?example=tactile-map');
  await expect(page.locator('#tactileMapChooser')).toBeVisible({
    timeout: 30000,
  });
  const notNow = page.locator('#saveProjectNotNow');
  try {
    await notNow.waitFor({ state: 'visible', timeout: 6000 });
    await notNow.click();
    await notNow.waitFor({ state: 'hidden', timeout: 5000 });
  } catch {
    // The prompt did not appear.
  }
}

/** Press Tab until the element matching `selector` has focus. */
async function tabTo(page, selector, max = 40) {
  for (let i = 0; i < max; i += 1) {
    if (await page.locator(selector).evaluate((n) => n === document.activeElement)) {
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab never reached ${selector}`);
}

async function axeClean(page, where) {
  const results = await new AxeBuilder({ page })
    .include('#tactileMapPanel')
    .analyze();
  const violations = results.violations.filter(
    (v) => !ALLOWED_AXE_VIOLATIONS.includes(v.id)
  );
  expect(
    violations,
    `${where}: ${violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`).join('\n')}`
  ).toEqual([]);
}

/** Choose a map type in the chooser with the keyboard and press Next. */
async function chooseByKeyboard(page, label) {
  const radios = page.locator('#tactileMapChooser input[type="radio"]');
  await radios.first().focus();
  const names = await page
    .locator('#tactileMapChooser .tactile-map-type-name')
    .allTextContents();
  const target = names.indexOf(label);
  await page.keyboard.press('Space');
  for (let i = 0; i < target; i += 1) await page.keyboard.press('ArrowDown');
  await expect(radios.nth(target)).toBeChecked();
  await tabTo(page, '#tactileMapChooserNext');
  await page.keyboard.press('Enter');
}

/** Next by keyboard; the new step's heading has focus and says the step. */
async function nextStep(page, n, name) {
  await tabTo(page, '#tactileMapSteps-next');
  await page.keyboard.press('Enter');
  const heading = page.locator('#tactileMapSteps-heading');
  await expect(heading).toHaveText(`Step ${n} of 5: ${name}`);
  await expect(heading).toBeFocused();
}

async function searchByKeyboard(page, field, text) {
  await page.locator(field).focus();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test.describe('the map workflows by keyboard', () => {
  test('the chooser asks what map to make and passes an axe scan', async ({
    page,
  }) => {
    await openChooser(page);
    await expect(page.locator('#tactileMapPanel h2')).toHaveText(
      'What map do you want to make?'
    );
    await expect(page.locator('#tactileMapChooserNext')).toBeDisabled();
    await axeClean(page, 'the chooser');
  });

  test('a place map from the chooser to the editor, step by step, by keyboard', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openChooser(page);
    await chooseByKeyboard(page, 'A place map');
    const heading = page.locator('#tactileMapSteps-heading');
    await expect(heading).toHaveText('Step 1 of 5: Where');
    await expect(heading).toBeFocused();
    await axeClean(page, 'place step 1');

    await searchByKeyboard(page, '#tactileMapAddress', '3800 E Stevens Way NE');
    const first = page.locator('#tactileMapResults input[type="radio"]').first();
    await expect(first).toBeFocused({ timeout: 15000 });
    await page.keyboard.press('Space');
    await expect(first).toBeChecked();

    await nextStep(page, 2, 'How much ground');
    await axeClean(page, 'place step 2');
    await nextStep(page, 3, 'What to show');
    await axeClean(page, 'place step 3');
    await nextStep(page, 4, 'Make the map');
    await axeClean(page, 'place step 4');

    await tabTo(page, '#tactileMapMake');
    await page.keyboard.press('Enter');
    await expect(
      page.locator('#drawingEditorSurface .drawing-editor').first()
    ).toHaveAttribute('data-purpose', 'map', { timeout: 60000 });
    await expect(page.locator('#tactileMapAddressStatus')).toHaveText(
      /^Draft map ready: /
    );
    // Escape leaves the editor; focus returns to Make the map.
    await page.keyboard.press('Escape');
    await expect(page.locator('#tactileMapMake')).toBeFocused();

    await nextStep(page, 5, 'Check and print');
    await axeClean(page, 'place step 5');
  });

  test('a route map from the chooser to the editor by keyboard, both places picked first', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openChooser(page);
    await chooseByKeyboard(page, 'A route map');
    await expect(page.locator('#tactileMapSteps-heading')).toHaveText(
      'Step 1 of 5: From and To'
    );
    await searchByKeyboard(page, '#tactileMapAddress', 'Husky Union Building');
    const from = page.locator('#tactileMapResults input[type="radio"]').first();
    await expect(from).toBeFocused({ timeout: 15000 });
    await page.keyboard.press('Space');
    // Nominatim's policy: one search a second; the app refuses a faster one.
    await page.waitForTimeout(1100);
    await searchByKeyboard(page, '#tactileMapTo', 'Gates Center');
    const to = page.locator('#tactileMapToResults input[type="radio"]').first();
    await expect(to).toBeFocused({ timeout: 15000 });
    await page.keyboard.press('Space');
    await axeClean(page, 'route step 1');

    await nextStep(page, 2, 'How you walk');
    await axeClean(page, 'route step 2');
    await nextStep(page, 3, 'What to show');
    await nextStep(page, 4, 'Make the map');
    await tabTo(page, '#tactileMapMake');
    await page.keyboard.press('Enter');
    await expect(page.locator('#tactileMapAddressStatus')).toHaveText(
      /^Route map ready: a \d+ m walk from Husky Union Building to Bill & Melinda Gates Center/,
      { timeout: 60000 }
    );
  });

  test('a map from a drawing reaches the editor through its door by keyboard', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openChooser(page);
    await chooseByKeyboard(page, 'A map from your drawing');
    await expect(page.locator('#tactileMapSteps-heading')).toHaveText(
      'Step 1 of 5: Choose the drawing'
    );
    await axeClean(page, 'drawing step 1');
    await nextStep(page, 2, "The drawing's real width");
    await axeClean(page, 'drawing step 2');
    await nextStep(page, 3, 'Class the shapes');
    await axeClean(page, 'drawing step 3');
    await tabTo(page, '#tactileMapEditDrawing');
    await page.keyboard.press('Enter');
    await expect(
      page.locator('#drawingEditorSurface .drawing-editor').first()
    ).toHaveAttribute('data-purpose', 'map', { timeout: 60000 });
  });
});
