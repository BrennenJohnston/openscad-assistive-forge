/**
 * A place map of 3600 Ferry Pl NE from the chooser to the zip, by keyboard,
 * with an accessibility scan at each step: the places named in the editor,
 * what each detail level turns on, the University of Oregon symbols in the
 * key and the README, and the key's plates with their label tape.
 *
 * The address search is routed and the map tiles come from the fixtures
 * (OpenStreetMap contributors, ODbL), so every count here is exact.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { parseSTL } from '../../scripts/parity/stl-stats.mjs';
import {
  routeMapServices,
  openChooser,
  tabTo,
  axeClean,
  chooseByKeyboard,
  nextStep,
  searchByKeyboard,
} from './helpers/map-keyboard.js';

const FERRY = {
  place_id: 1,
  lat: '47.6481285',
  lon: '-122.3086726',
  type: 'building',
  importance: 0.5,
  display_name:
    'Center on Human Development and Disability South, 3600, Ferry Place Northeast, Seattle, Washington, 98195, United States',
};

/**
 * Press Make the map from where focus is; the editor opens on the draft and
 * takes focus. A closed editor stays in the page, so focus is what says this
 * one is open.
 */
async function makeTheMap(page) {
  await tabTo(page, '#tactileMapMake');
  await page.keyboard.press('Enter');
  await expect(
    page.locator('#drawingEditorSurface .drawing-editor').first()
  ).toHaveAttribute('data-purpose', 'map', { timeout: 60000 });
  await expect(page.locator('#drawingEditorSurface :focus')).toHaveCount(1, {
    timeout: 60000,
  });
}

/** Escape the editor; focus comes back to Make the map. */
async function closeTheEditor(page) {
  await page.keyboard.press('Escape');
  await expect(page.locator('#tactileMapMake')).toBeFocused();
}

/** The Ferry Place draft open in the editor, by keyboard, the services stubbed. */
async function openFerryDraft(page) {
  await routeMapServices(page);
  await page.route('https://nominatim.openstreetmap.org/search*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify([FERRY]),
    })
  );
  await openChooser(page);
  await chooseByKeyboard(page, 'A place map');
  await searchByKeyboard(page, '#tactileMapAddress', '3600 Ferry Pl NE');
  const first = page.locator('#tactileMapResults input[type="radio"]').first();
  await expect(first).toBeFocused({ timeout: 15000 });
  await page.keyboard.press('Space');
  await expect(first).toBeChecked();
  await nextStep(page, 2, 'How much ground');
  await nextStep(page, 3, 'What to show');
  await nextStep(page, 4, 'Make the map');
  await makeTheMap(page);
}

/** A mark's region on the editor's canvas, by its row's name. */
async function markRegion(page, name) {
  const rows = await page
    .locator('#drawingEditorSurface .svg-prep-object-name')
    .allTextContents();
  const index = rows.indexOf(name);
  expect(index, `${name} has a row`).toBeGreaterThanOrEqual(0);
  return page.locator(
    `#drawingEditorSurface [data-layer="regions"] [data-region="${index}"]`
  );
}

const MOVED_TO = /to ([\d.]+), ([\d.]+) mm/;
const placeOf = async (status) =>
  (await status.textContent()).match(MOVED_TO).slice(1, 3).map(Number);

test.describe('a place map at 3600 Ferry Pl NE', () => {
  test('from the chooser to the zip by keyboard: the names in the editor, the levels and their counts, the Oregon symbols in the key, the key plates and their tape', async ({
    page,
  }) => {
    test.setTimeout(600_000);
    await routeMapServices(page);
    await page.route('https://nominatim.openstreetmap.org/search*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify([FERRY]),
      })
    );
    const status = page.locator('#tactileMapAddressStatus');

    await openChooser(page);
    await chooseByKeyboard(page, 'A place map');
    await axeClean(page, 'step 1');
    await searchByKeyboard(page, '#tactileMapAddress', '3600 Ferry Pl NE');
    const first = page.locator('#tactileMapResults input[type="radio"]').first();
    await expect(first).toBeFocused({ timeout: 15000 });
    await page.keyboard.press('Space');
    await expect(first).toBeChecked();

    await nextStep(page, 2, 'How much ground');
    await axeClean(page, 'step 2');
    await nextStep(page, 3, 'What to show');
    await axeClean(page, 'step 3');
    await expect(page.locator('#tactileMapDetail-named')).toBeChecked();
    await expect(page.locator('#tactileMapSymbolSet-forge-basic')).toBeChecked();
    await nextStep(page, 4, 'Make the map');
    await axeClean(page, 'step 4');

    // The first draft: the places are named, and most of the data starts off.
    await makeTheMap(page);
    await expect(status).toHaveText(
      'Draft map ready: 19 of 302 features on; 8 warnings. Choose what stays. The key has 5 symbols and 11 abbreviations.'
    );
    const rows = await page
      .locator('#drawingEditorSurface .svg-prep-object-name')
      .allTextContents();
    expect(rows).toHaveLength(302);
    expect(rows).toContain('Restaurant: Plaza Cafe');
    expect(rows).toContain('Cafe: Lobby Espresso');
    expect(rows.some((name) => name.startsWith('Bus stop 29405'))).toBe(true);
    await closeTheEditor(page);

    // Back in step 3 with the data here, the line says what each level turns on.
    await tabTo(page, '#tactileMapSteps-back');
    await page.keyboard.press('Enter');
    await expect(page.locator('#tactileMapSteps-heading')).toHaveText(
      'Step 3 of 5: What to show'
    );
    const line = page.locator('#tactileMapDetailCount');
    await expect(line).toHaveText('19 features on, 5 different symbols.');
    await tabTo(page, '#tactileMapDetail-named');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#tactileMapDetail-buildings')).toBeChecked();
    await expect(line).toHaveText('187 features on, 9 different symbols.', {
      timeout: 15000,
    });
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#tactileMapDetail-everything')).toBeChecked();
    await expect(line).toHaveText(/^301 features on, /, { timeout: 15000 });
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#tactileMapDetail-named')).toBeChecked();
    await expect(line).toHaveText('19 features on, 5 different symbols.', {
      timeout: 15000,
    });

    // The Oregon symbols, chosen by keyboard and said once.
    await tabTo(page, '#tactileMapSymbolSet-forge-basic');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#tactileMapSymbolSet-oregon-2012')).toBeChecked();
    await expect(status).toHaveText('Symbols: University of Oregon symbols.');
    await axeClean(page, 'step 3 with the set chosen');
    await nextStep(page, 4, 'Make the map');

    await makeTheMap(page);
    await expect(status).toHaveText(
      'Draft map ready: 19 of 302 features on; 6 warnings. Choose what stays. The key has 5 symbols and 11 abbreviations.'
    );
    await closeTheEditor(page);

    await nextStep(page, 5, 'Check and print');
    await axeClean(page, 'step 5');
    await expect(page.locator('#tactileMapSummary')).toHaveText(
      '4 plates of 240 x 180 mm, A1 to B2. The key takes 5 plates.'
    );
    await expect(page.locator('#tactileMapKeyWords')).toHaveValue('braille');
    const key = await page.evaluate(() => {
      const p = document.getElementById('tactileMapPanel').__forgeMapPanel;
      const k = p.labeled().key;
      return {
        set: k.set.name,
        entries: k.entries.map((e) => `${e.name}: ${e.shape}`),
        plates: p.keyPages.map((plate) => plate.id),
      };
    });
    expect(key.set).toBe('University of Oregon symbols');
    // The destination first, its cone kept in every set; You are here is off
    // until the person places it, so it has no row yet.
    expect(key.entries).toEqual([
      'Destination, 3600 Ferry Pl NE: a cone 4.9 mm across and 4.9 mm tall, flat at the top',
      'Transit stop: Challenging feature, 13 mm',
      'Landmark: Flexible feature, 13 mm',
      'Walkway: a dashed line 1.2 mm wide, low',
      'Area: a raised area, low',
    ]);
    expect(key.plates).toEqual(['key-1', 'key-2', 'key-3', 'key-4', 'key-5']);

    // The zip: the map's plates, the key's, and the README that goes with them.
    const downloadPromise = page.waitForEvent('download', { timeout: 420_000 });
    await tabTo(page, '#tactileMapRenderAll', 80);
    await page.keyboard.press('Enter');
    const download = await downloadPromise;
    const zip = await JSZip.loadAsync(readFileSync(await download.path()));
    const names = Object.keys(zip.files);
    for (const id of ['A1', 'A2', 'B1', 'B2', ...key.plates]) {
      expect(names).toContain(`tactile_map_${id}.stl`);
      expect(names).toContain(`levels_${id}.svg`);
    }
    const readme = await zip.file('README.txt').async('string');
    expect(readme).toContain('\nKey\nSymbols: University of Oregon symbols.\n');
    expect(readme).toContain(
      'Symbols: Lobben and Lawrence 2012, University of Oregon, GPL-3'
    );
    expect(readme).toContain('Key 1 plate, label tape top to bottom:');
    expect(readme).toContain('- pc restaurant: plaza cafe\n');

    // A key plate is the map's plate size, with channels cut for its tape.
    const levels = await zip.file('levels_key-1.svg').async('string');
    expect(levels).toMatch(/<g id="channels"><path d="[^"]+"\/><\/g>/);
    const { triangles } = parseSTL(
      await zip.file('tactile_map_key-1.stl').async('uint8array')
    );
    const size = [0, 1].map((axis) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = axis; i < triangles.length; i += 3) {
        lo = Math.min(lo, triangles[i]);
        hi = Math.max(hi, triangles[i]);
      }
      return hi - lo;
    });
    expect(size[0]).toBeCloseTo(240, 1);
    expect(size[1]).toBeCloseTo(180, 1);
    await expect(page.locator('#tactileMapRenderStatus')).toHaveText(
      'All 9 plates are in tactile_map_plates.zip.'
    );
  });

  test('the cone is dragged with the mouse, You are here placed and carried by keyboard, and the plan and the model rows follow', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openFerryDraft(page);
    const editor = page.locator('#drawingEditorSurface');
    const status = editor.locator('.drawing-editor-status');

    // The cone, dragged 60 px right and 30 px down.
    const cone = await markRegion(page, '3600 Ferry Pl NE');
    await expect(cone).toHaveAttribute('data-movable', 'true');
    const box = await cone.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 30, cy + 15, { steps: 4 });
    await page.mouse.move(cx + 60, cy + 30, { steps: 4 });
    await page.mouse.up();
    await expect(status).toHaveText(
      /^3600 Ferry Pl NE moved to [\d.]+, [\d.]+ mm\.$/
    );
    const moved = await placeOf(status);
    expect(moved[0]).toBeGreaterThan(240);
    expect(moved[1]).toBeGreaterThan(180);

    // You are here: placed by the button, then carried 2 mm right by keyboard.
    await editor.getByRole('button', { name: 'Place You are here' }).click();
    await expect(status).toHaveText(/^You are here placed at [\d.]+, [\d.]+ mm\./);
    await editor.locator('.drawing-editor-canvas-svg').focus();
    await page.keyboard.press('Space');
    await expect(status).toHaveText(/^You are here picked up\./);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(status).toHaveText(/^You are here at [\d.]+, [\d.]+ mm\.$/);
    await page.keyboard.press('Space');
    await expect(status).toHaveText(/^You are here moved to [\d.]+, [\d.]+ mm\.$/);
    const placed = await placeOf(status);
    await axeClean(page, 'the editor with the marks');

    // Apply: the plan holds both; the model's cone row names the cone's place.
    await editor.getByRole('button', { name: 'Apply classes' }).click();
    await expect(page.locator('#tactileMapMake')).toBeFocused({
      timeout: 30000,
    });
    const plan = await page.evaluate(() => {
      const p = document.getElementById('tactileMapPanel').__forgeMapPanel.plan;
      const f = (id) => p.features.find((x) => x.id === id);
      return {
        cone: f('destination').at,
        here: { on: f('you-are-here').on, at: f('you-are-here').at },
      };
    });
    expect(plan.cone).toEqual(moved);
    expect(plan.here).toEqual({ on: true, at: placed });
    await expect
      .poll(() =>
        page.evaluate(
          () => window.stateManager.getState().parameters.cone_marks
        )
      )
      .toBe(
        `${Math.round(moved[0] * 10)}:${Math.round((360 - moved[1]) * 10)}`
      );
  });
});

test.describe('the marks on a phone', () => {
  test.use({
    viewport: { width: 412, height: 915 },
    hasTouch: true,
    isMobile: true,
  });

  test('the cone is dragged by touch', async ({ page }) => {
    test.setTimeout(240_000);
    await routeMapServices(page);
    await page.route('https://nominatim.openstreetmap.org/search*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify([FERRY]),
      })
    );
    // On a phone the panel is a drawer: open it to reach the chooser.
    await page.goto('/?example=tactile-map');
    const notNow = page.locator('#saveProjectNotNow');
    try {
      await notNow.waitFor({ state: 'visible', timeout: 6000 });
      await notNow.click();
      await notNow.waitFor({ state: 'hidden', timeout: 5000 });
    } catch {
      // The prompt did not appear.
    }
    const toggle = page.locator('#mobileDrawerToggle');
    await expect(toggle).toBeVisible({ timeout: 30000 });
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.click();
    }
    await expect(page.locator('#tactileMapChooser')).toBeVisible({
      timeout: 30000,
    });
    await chooseByKeyboard(page, 'A place map');
    await page.locator('#tactileMapAddress').fill('3600 Ferry Pl NE');
    await page.locator('#tactileMapSearch').click();
    const first = page.locator('#tactileMapResults input[type="radio"]').first();
    await first.check({ timeout: 15000 });
    for (const n of [2, 3, 4]) {
      await page.locator('#tactileMapSteps-next').click();
      await expect(page.locator('#tactileMapSteps-heading')).toHaveText(
        new RegExp(`^Step ${n} of 5`)
      );
    }
    await page.locator('#tactileMapMake').click();
    await expect(
      page.locator('#drawingEditorSurface .drawing-editor').first()
    ).toHaveAttribute('data-purpose', 'map', { timeout: 60000 });
    const editor = page.locator('#drawingEditorSurface');
    const status = editor.locator('.drawing-editor-status');
    const cone = await markRegion(page, '3600 Ferry Pl NE');
    await cone.scrollIntoViewIfNeeded();
    const box = await cone.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x, y) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
      });
    await touch('touchStart', cx, cy);
    await touch('touchMove', cx + 20, cy + 10);
    await touch('touchMove', cx + 40, cy + 20);
    await touch('touchEnd', 0, 0);
    await expect(status).toHaveText(
      /^3600 Ferry Pl NE moved to [\d.]+, [\d.]+ mm\.$/
    );
    const moved = await placeOf(status);
    expect(moved[0]).toBeGreaterThan(240);
    expect(moved[1]).toBeGreaterThan(180);
  });
});
