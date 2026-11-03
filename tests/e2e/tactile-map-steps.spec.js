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
import {
  routeMapServices,
  openChooser,
  tabTo,
  axeClean,
  chooseByKeyboard,
  nextStep,
  searchByKeyboard,
} from './helpers/map-keyboard.js';

test.beforeEach(async ({ page }) => {
  await routeMapServices(page);
});

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
    const first = page
      .locator('#tactileMapResults input[type="radio"]')
      .first();
    await expect(first).toBeFocused({ timeout: 15000 });
    await page.keyboard.press('Space');
    await expect(first).toBeChecked();

    await nextStep(page, 2, 'How much ground');
    await axeClean(page, 'place step 2');
    await nextStep(page, 3, 'What to show');
    await axeClean(page, 'place step 3');
    // The symbol set, by keyboard: the next set, said once.
    await tabTo(page, '#tactileMapSymbolSet-forge-basic');
    await page.keyboard.press('ArrowDown');
    await expect(
      page.locator('#tactileMapSymbolSet-oregon-2012')
    ).toBeChecked();
    await expect(page.locator('#tactileMapAddressStatus')).toHaveText(
      'Symbols: University of Oregon symbols.'
    );
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
    // The key follows the set.
    expect(
      await page.evaluate(
        () =>
          document.getElementById('tactileMapPanel').__forgeMapPanel.labeled()
            .key.set.name
      )
    ).toBe('University of Oregon symbols');
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

    await nextStep(page, 2, 'How you travel');
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
