/**
 * The Tactile Map Designer by keyboard in a browser test: the routed
 * services a map's steps call (the address search and the map tiles over the
 * University of Washington, fetched 2026-11-01; OpenStreetMap contributors,
 * ODbL), the chooser, the steps' Next with its heading taking focus, a
 * search typed and sent with Enter, and an axe scan of the panel.
 *
 * @license GPL-3.0-or-later
 */
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync, readFileSync } from 'node:fs';

export const GATES = {
  place_id: 3,
  lat: '47.652873',
  lon: '-122.3044814',
  type: 'university',
  importance: 0.5,
  display_name:
    'Bill & Melinda Gates Center, 3800, East Stevens Way Northeast, Seattle, Washington, 98195, United States',
};
export const HUB = {
  place_id: 1,
  lat: '47.6553685',
  lon: '-122.3051021',
  type: 'university',
  importance: 0.5,
  display_name:
    'Husky Union Building, 4001, East Stevens Way Northeast, Seattle, Washington, 98195, United States',
};

/** The address search answers the HUB or the Gates Center; the tiles come from the fixtures. */
export async function routeMapServices(page) {
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
}

/** Open the Tactile Map Designer with no map type, so the chooser asks. */
export async function openChooser(page) {
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
export async function tabTo(page, selector, max = 40) {
  for (let i = 0; i < max; i += 1) {
    if (
      await page
        .locator(selector)
        .evaluate((n) => n === document.activeElement)
    ) {
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab never reached ${selector}`);
}

/** An axe scan of the panel alone; no rule is allowed to fail. */
export async function axeClean(page, where) {
  const results = await new AxeBuilder({ page })
    .include('#tactileMapPanel')
    .analyze();
  expect(
    results.violations,
    `${where}: ${results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`).join('\n')}`
  ).toEqual([]);
}

/** Choose a map type in the chooser with the keyboard and press Next. */
export async function chooseByKeyboard(page, label) {
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
export async function nextStep(page, n, name) {
  await tabTo(page, '#tactileMapSteps-next');
  await page.keyboard.press('Enter');
  const heading = page.locator('#tactileMapSteps-heading');
  await expect(heading).toHaveText(`Step ${n} of 5: ${name}`);
  await expect(heading).toBeFocused();
}

/** Type into a search field and send it with Enter. */
export async function searchByKeyboard(page, field, text) {
  await page.locator(field).focus();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}
