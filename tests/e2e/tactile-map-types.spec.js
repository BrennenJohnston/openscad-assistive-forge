/**
 * The three map types end to end, by keyboard, from the chooser to Check
 * and print: a place map at "A building and its doors" with its curb ramps
 * and folded warnings; a route by bus and train with a journey picked and
 * the walk to its stop made; a map from a drawing, raised whole until its
 * shapes are classed, rendered into a zip whose README says what it is.
 * The panel passes an axe scan at every step, and the whole page at the
 * end. The address search, the map tiles (the University of Washington,
 * fetched 2026-11-01; OpenStreetMap contributors, ODbL) and the journey
 * planner (Transitous's answer for the HUB to downtown, measured
 * 2026-11-01) answer from fixtures.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import {
  routeMapServices,
  openChooser,
  tabTo,
  axeClean,
  chooseByKeyboard,
  nextStep,
  searchByKeyboard,
} from './helpers/map-keyboard.js';
import { previewSettled } from './helpers/preview-settled.js';

const parameter = (page, key) =>
  page.evaluate((k) => {
    const v = window.stateManager?.getState()?.parameters?.[k];
    return typeof v === 'object' && v !== null ? v.name : v;
  }, key);

async function wholePageClean(page, where) {
  await previewSettled(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations,
    `${where}: ${results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`).join('\n')}`
  ).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await routeMapServices(page);
});

test.describe('the three map types end to end', () => {
  test('a place map near a building: the scale by arrow keys, curb ramps in the draft, the warnings folded in Check and print', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openChooser(page);
    await chooseByKeyboard(page, 'A place map');
    await expect(page.locator('#tactileMapSteps-heading')).toBeFocused();
    await searchByKeyboard(page, '#tactileMapAddress', '3800 E Stevens Way NE');
    const place = page
      .locator('#tactileMapResults input[type="radio"]')
      .first();
    await expect(place).toBeFocused({ timeout: 15000 });
    await page.keyboard.press('Space');
    await axeClean(page, 'place step 1');

    await nextStep(page, 2, 'How much ground');
    // A block is where the scale starts; one arrow up is the building.
    await page.locator('#tactileMapScale-block').focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#tactileMapScale-building')).toBeChecked();
    await expect(page.locator('#tactileMapScale-building-sentence')).toHaveText(
      '240 m across on this plate. A 10 mm symbol stands for 5 m. Every sidewalk, curb ramp and raised curb draws, and a crossing without markings is dashed.'
    );
    await axeClean(page, 'place step 2');
    await nextStep(page, 3, 'What to show');
    await axeClean(page, 'place step 3');
    // Everything in the data, by arrow keys: a map that full has warnings.
    await page.locator('#tactileMapDetail-named').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#tactileMapDetail-everything')).toBeChecked();
    await nextStep(page, 4, 'Make the map');
    await tabTo(page, '#tactileMapMake');
    await page.keyboard.press('Enter');
    await expect(
      page.locator('#drawingEditorSurface .drawing-editor').first()
    ).toHaveAttribute('data-purpose', 'map', { timeout: 60000 });
    await expect(page.locator('#tactileMapAddressStatus')).toHaveText(
      /^Draft map ready: \d+ of \d+ features on/
    );
    const plan = await page.evaluate(() => {
      const p = document.getElementById('tactileMapPanel').__forgeMapPanel.plan;
      return {
        mmPerM: p.meta.geo.mmPerM,
        ramps: p.features.filter((f) => f.class === 'curb-ramp').length,
        rampsOn: p.features.filter((f) => f.class === 'curb-ramp' && f.on)
          .length,
      };
    });
    expect(plan.mmPerM).toBe(2);
    expect(plan.ramps).toBeGreaterThan(0);
    expect(plan.rampsOn).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#tactileMapMake')).toBeFocused();

    await nextStep(page, 5, 'Check and print');
    await expect(page.locator('#tactileMapSummary')).toHaveText(
      /^\d+ plates? of [\d.]+ x [\d.]+ mm/
    );
    const box = page.locator('#tactileMapWarningsBox');
    const summary = box.locator('summary');
    const count = Number(
      ((await summary.textContent()) || '').match(/^(\d+) warnings?$/)?.[1]
    );
    expect(count).toBeGreaterThan(0);
    await expect(box).not.toHaveAttribute('open', '');
    await tabTo(page, '#tactileMapWarningsBox summary');
    await page.keyboard.press('Enter');
    await expect(box).toHaveAttribute('open', '');
    await expect(page.locator('#tactileMapWarnings li')).toHaveCount(count);
    await axeClean(page, 'place step 5');
    await wholePageClean(page, 'place map, the whole page');
  });

  test('a route by bus and train: a journey picked by keyboard, the walk to its stop made, the journey said after the map', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const journeys = readFileSync(
      'tests/fixtures/tactile-map/transitous-hub-downtown.json',
      'utf8'
    );
    await page.route('https://api.transitous.org/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: journeys,
      })
    );
    await openChooser(page);
    await chooseByKeyboard(page, 'A route map');
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

    await nextStep(page, 2, 'How you travel');
    await page.locator('#tactileMapTravel-walk').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#tactileMapTravel-transit')).toBeChecked();
    await tabTo(page, '#tactileMapFindJourneys');
    await page.keyboard.press('Enter');
    await expect(page.locator('#tactileMapJourneys label')).toHaveCount(3, {
      timeout: 30000,
    });
    await tabTo(page, '#tactileMapJourney-1');
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#tactileMapJourney-3')).toBeChecked();
    await expect(page.locator('#tactileMapWhichWalk-to')).toBeChecked();
    await axeClean(page, 'route step 2, a journey picked');

    await nextStep(page, 3, 'What to show');
    await nextStep(page, 4, 'Make the map');
    await tabTo(page, '#tactileMapMake');
    await page.keyboard.press('Enter');
    // The sentence comes before the editor opens: Escape waits for it.
    await expect(
      page.locator('#drawingEditorSurface .drawing-editor').first()
    ).toHaveAttribute('data-purpose', 'map', { timeout: 60000 });
    await expect(page.locator('#tactileMapAddressStatus')).toHaveText(
      /^Route map ready: a \d+ m walk from Husky Union Building to East Stevens Way NE & Benton Ln, .* The journey: 22 min, 1 change: the 72 to Stevens Way & Rainier Vista NE, then the 2 Line to Symphony\. The key has \d+ symbols? and \d+ numbered places?\.$/,
      { timeout: 60000 }
    );
    const stop = await page.evaluate(
      () =>
        document
          .getElementById('tactileMapPanel')
          .__forgeMapPanel.plan.features.find(
            (f) => f.id === 'destination-stop'
          )?.name
    );
    expect(stop).toBe('East Stevens Way NE & Benton Ln, 72');
    await page.keyboard.press('Escape');
    await expect(page.locator('#tactileMapMake')).toBeFocused();
    await nextStep(page, 5, 'Check and print');
    await axeClean(page, 'route step 5');
  });

  test('a map from a drawing: raised whole until classed, then classed, rendered, and its README says what it is', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openChooser(page);
    await chooseByKeyboard(page, 'A map from your drawing');
    await expect(page.locator('#tactileMapSteps-heading')).toHaveText(
      'Step 1 of 5: Choose the drawing'
    );
    // A drawing at 340 x 240 mm: a 300 x 2 mm bar and a 20 x 20 mm square.
    const drawing =
      '<svg xmlns="http://www.w3.org/2000/svg" width="340mm" height="240mm" viewBox="0 0 340 240">' +
      '<rect x="20" y="20" width="300" height="2"/>' +
      '<rect x="300" y="200" width="20" height="20"/>' +
      '</svg>';
    await page.setInputFiles('#param-map_file', {
      name: 'station.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(drawing),
    });
    await expect
      .poll(() => parameter(page, 'map_file'), { timeout: 30000 })
      .toBe('station.svg');
    // Not classed yet: the model raises the drawing whole.
    await expect
      .poll(() => parameter(page, 'map_file_kind'), { timeout: 10000 })
      .toBe('drawing');
    await axeClean(page, 'drawing step 1');

    await nextStep(page, 2, "The drawing's real width");
    await expect(page.locator('#tactileMapDrawingWidth')).toHaveValue('340');
    await axeClean(page, 'drawing step 2');
    await nextStep(page, 3, 'Class the shapes');
    await tabTo(page, '#tactileMapEditDrawing');
    await page.keyboard.press('Enter');
    await expect(
      page.locator('#drawingEditorSurface .drawing-editor').first()
    ).toHaveAttribute('data-purpose', 'map', { timeout: 60000 });
    const selects = page.locator(
      '#drawingEditorSurface .drawing-editor-class-select'
    );
    await expect(selects).toHaveCount(2);
    await selects.nth(0).selectOption('wall');
    await selects.nth(1).selectOption('area');
    await tabTo(page, '#drawingEditorSurface .drawing-editor-apply');
    await page.keyboard.press('Enter');
    await expect(page.locator('#drawingEditorSurface')).toBeHidden();
    await expect
      .poll(() => parameter(page, 'map_file'), { timeout: 30000 })
      .toBe('levels_whole.svg');
    await expect
      .poll(() => parameter(page, 'map_file_kind'), { timeout: 10000 })
      .toBe('levels');

    await nextStep(page, 4, 'Apply classes');
    await nextStep(page, 5, 'Check and print');
    await expect(page.locator('#tactileMapSummary')).toHaveText(
      /^2 plates of 161 x 222 mm, A1 to A2\. The key takes (one plate|\d+ plates)\.$/,
      { timeout: 10000 }
    );
    await axeClean(page, 'drawing step 5');
    await tabTo(page, '#tactileMapRenderAll');
    const download = page.waitForEvent('download', { timeout: 240_000 });
    await page.keyboard.press('Enter');
    const zip = await JSZip.loadAsync(
      readFileSync(await (await download).path())
    );
    const readme = await zip.file('README.txt').async('string');
    const lines = readme.split('\n');
    // The prototype note first, then a blank line.
    expect(lines[0]).toMatch(
      /^This map maker is a prototype .* report it on https:\/\/github\.com\/BrennenJohnston\/openscad-assistive-forge\/issues so I can fix it\.$/
    );
    expect(lines[1]).toBe('');
    expect(lines[2]).toMatch(/^map_print\.pdf shows where each label goes/);
    expect(lines[3]).toBe('A map from a drawing.');
    expect(readme).not.toMatch(/OpenStreetMap/);
  });
});
