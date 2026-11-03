/**
 * The Tactile Map tile in the app: its panel above the controls, a preview
 * that renders, every plate rendered into one zip, and an axe scan of the
 * page.
 *
 * @license GPL-3.0-or-later
 */
import { previewSettled } from './helpers/preview-settled.js';
import { goToStep } from './helpers/map-steps.js';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import JSZip from 'jszip';
import { PNG } from 'pngjs';
import { parseSTL } from '../../scripts/parity/stl-stats.mjs';
import { skipWithoutWebGL } from './helpers/webgl.js';

const ALLOWED_AXE_VIOLATIONS = [];
const WASM_READY_TIMEOUT = 180_000;
const PREVIEW_TIMEOUT = 120_000;

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

async function openTactileMap(page, type = 'drawing') {
  await page.goto(`/?example=tactile-map&type=${type}`);
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#tactileMapPanel')).toBeVisible({
    timeout: 15000,
  });
  await dismissSavePrompt(page);
}

test.describe('Tactile Map tile', () => {
  test('the panel sits above the controls and names its map type', async ({
    page,
  }) => {
    await openTactileMap(page);
    await expect(page.locator('#tactileMapPanel h2')).toHaveText(
      'A map from your drawing'
    );
    await expect(page.locator('#tactileMapSummary')).toHaveText(
      /^4 plates of 240 x 180 mm, A1 to B2\. The key takes (one plate|\d+ plates)\.$/,
      { timeout: 10000 }
    );
    // The whole map, its four plates, then the key's plates.
    const radios = page.locator(
      '#tactileMapPlates input[type="radio"]:not([value^="key"])'
    );
    await expect(radios).toHaveCount(5);
    await expect(
      page.locator('#tactileMapPlates input[type="radio"][value^="key"]')
    ).not.toHaveCount(0);
  });

  test('lays no picture of its own map file over the preview: the map file is the model, not a reference', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openTactileMap(page);
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });
    await expect(page.locator('.preview-state-indicator')).toHaveClass(
      /state-current/,
      { timeout: PREVIEW_TIMEOUT }
    );
    // The reference picture was switched on a moment after the files list
    // drew, once its image had loaded.
    await page.waitForTimeout(2000);
    await expect(page.locator('#overlayToggle')).not.toBeChecked();
    expect(
      await page.evaluate(() =>
        Boolean(window.previewManager?.referenceOverlay?.visible)
      )
    ).toBe(false);
  });

  test('the preview renders the whole map, then plate A1 at 240 x 180', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openTactileMap(page);
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });
    await expect(page.locator('.preview-state-indicator')).toHaveClass(
      /state-current/,
      {
        timeout: PREVIEW_TIMEOUT,
      }
    );
    await goToStep(page, 5);
    await page.locator('#tactileMapPlates input[value="A1"]').check();
    await expect(page.locator('#param-map_width_mm-spinbox')).toHaveValue(
      '240',
      {
        timeout: 10000,
      }
    );
    await expect(page.locator('.preview-state-indicator')).toHaveClass(
      /state-current/,
      {
        timeout: PREVIEW_TIMEOUT,
      }
    );
    await expect(page.locator('#previewStatusStats')).toContainText(
      'triangles'
    );
  });

  test('the button renders the four plates and the key and downloads them as one zip', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openTactileMap(page);
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });
    await expect(page.locator('.preview-state-indicator')).toHaveClass(
      /state-current/,
      {
        timeout: PREVIEW_TIMEOUT,
      }
    );
    const downloadPromise = page.waitForEvent('download', { timeout: 240_000 });
    await goToStep(page, 5);
    await page.locator('#tactileMapRenderAll').click();
    await expect(page.locator('#tactileMapRenderCancel')).toBeVisible();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('tactile_map_plates.zip');
    const zip = await JSZip.loadAsync(readFileSync(await download.path()));
    const names = Object.keys(zip.files).sort();
    const keyIds = await page.evaluate(() =>
      document
        .getElementById('tactileMapPanel')
        .__forgeMapPanel.keyPages.map((p) => p.id)
    );
    expect(keyIds.length).toBeGreaterThan(0);
    expect(names.filter((name) => name.endsWith('.stl'))).toEqual(
      [
        'tactile_map_A1.stl',
        'tactile_map_A2.stl',
        'tactile_map_B1.stl',
        'tactile_map_B2.stl',
        ...keyIds.map((id) => `tactile_map_${id}.stl`),
      ].sort()
    );
    for (const id of keyIds) expect(names).toContain(`levels_${id}.svg`);
    const readme = await zip.file('README.txt').async('string');
    expect(readme).toMatch(/\nKey\n\nSymbols, You are here first:\n/);
    expect(names).toContain('map_plan.json');
    expect(names).toContain('README.txt');
    expect(names).toContain('levels_A1.svg');
    expect(names).toContain('plate_grid.svg');
    const a1 = await zip.file('tactile_map_A1.stl').async('uint8array');
    expect(a1.length).toBeGreaterThan(84);
    const { triangles } = parseSTL(a1);
    const size = [0, 1, 2].map((axis) => {
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
    expect(size[2]).toBeCloseTo(2.4, 1);
    await expect(page.locator('#tactileMapRenderStatus')).toHaveText(
      `All ${4 + keyIds.length} plates are in tactile_map_plates.zip.`
    );
    await expect(page.locator('#tactileMapRenderAll')).toBeVisible();
    await expect(page.locator('#tactileMapRenderCancel')).toBeHidden();
  });

  test('the door opens the drawing in the file control as a map, and Apply classes makes the plan', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openTactileMap(page);
    await expect(page.locator('#tactileMapSummary')).toHaveText(
      /^4 plates of 240 x 180 mm, A1 to B2\. The key takes (one plate|\d+ plates)\.$/,
      { timeout: 10000 }
    );
    // A drawing at 340 x 240 mm whose shapes, a 300 x 2 mm bar and a
    // 20 x 20 mm square at the far corner, span 300 x 200 mm; the map hugs
    // them, 1 mm (half a wall) around.
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
      .poll(
        () =>
          page.evaluate(
            () => window.stateManager?.getState()?.parameters?.map_file?.name
          ),
        { timeout: 30000 }
      )
      .toBe('station.svg');
    await expect(page.locator('#tactileMapDrawingWidth')).toHaveValue('340');

    await goToStep(page, 3);
    const door = page.locator('#tactileMapEditDrawing');
    await expect(door).toHaveText('Edit drawing as a map');
    await door.click();
    await expect(
      page.locator('#drawingEditorSurface .drawing-editor').first()
    ).toHaveAttribute('data-purpose', 'map', { timeout: 60000 });
    // The drawing is on the editor's own canvas, one region per shape; the
    // relief purpose's preview panes stay away.
    const canvas = page.locator('#drawingEditorSurface .drawing-editor-canvas');
    await expect(canvas).toBeVisible();
    expect((await canvas.boundingBox()).width).toBeGreaterThanOrEqual(200);
    await expect(
      page.locator(
        '#drawingEditorSurface .drawing-editor-canvas-svg [data-layer="regions"] path'
      )
    ).toHaveCount(2);
    await expect(
      page.locator('#drawingEditorSurface .svg-prep-previews')
    ).toBeHidden();
    const selects = page.locator(
      '#drawingEditorSurface .drawing-editor-class-select'
    );
    await expect(selects).toHaveCount(2);
    await selects.nth(0).selectOption('wall');
    await selects.nth(1).selectOption('area');
    await page.locator('#drawingEditorSurface .drawing-editor-apply').click();
    await expect(page.locator('#drawingEditorSurface')).toBeHidden();
    await expect(page.locator('#tactileMapSummary')).toHaveText(
      /^2 plates of 151 x 202 mm, A1 to A2\. The key takes (one plate|\d+ plates)\.$/,
      { timeout: 10000 }
    );
    await expect(page.locator('#param-map_width_mm-spinbox')).toHaveValue(
      '302',
      { timeout: 10000 }
    );
    await expect
      .poll(
        () =>
          page.evaluate(
            () => window.stateManager?.getState()?.parameters?.map_file?.name
          ),
        { timeout: 30000 }
      )
      .toBe('levels_whole.svg');
    await expect(page.locator('#tactileMapWarnings li')).toHaveCount(0);
    const radios = page.locator(
      '#tactileMapPlates input[type="radio"]:not([value^="key"])'
    );
    await expect(radios).toHaveCount(3);
    await expect(
      page.locator('#tactileMapPlates input[type="radio"][value^="key"]')
    ).not.toHaveCount(0);
  });

  test('the page with the panel passes an axe scan', async ({ page }) => {
    await openTactileMap(page);
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

test.describe('the map data row', () => {
  const OVERPASS = readFileSync(
    'tests/fixtures/tactile-map/overpass-20.json',
    'utf8'
  );
  const OSM = readFileSync('tests/fixtures/tactile-map/export.osm');
  const PLACE = {
    place_id: 1,
    lat: '47.6067142',
    lon: '-122.3326983',
    type: 'library',
    importance: 0.5,
    display_name:
      'The Seattle Public Library - Central Library, 1000, 4th Avenue, Seattle, King County, Washington, 98104, United States',
  };

  test('shows the scales and the landmarks at the floor in their steps, makes the map through a routed Overpass answer, and the file door takes an export', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    let pulled = null;
    await page.route('https://nominatim.openstreetmap.org/search*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify([PLACE]),
      })
    );
    // The map tiles refuse, so the pull reaches the routed Overpass answer.
    await page.route('https://tiles.openstreetmap.us/**', (route) =>
      route.fulfill({
        status: 503,
        headers: { 'access-control-allow-origin': '*' },
        body: '',
      })
    );
    await page.route('https://overpass-api.de/api/interpreter', (route) => {
      pulled = route.request().postData();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: OVERPASS,
      });
    });
    await openTactileMap(page, 'place');
    // The floor for this pointer: 44 px on touch, the desktop density on a mouse.
    const floor = await page.evaluate(() =>
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--size-touch-target'
        )
      )
    );

    // Step 1: where.
    await page.locator('#tactileMapAddress').fill('1000 4th Ave, Seattle');
    await page.locator('#tactileMapSearch').click();
    await page.locator('#tactileMapPlace1').check();

    // Step 2: how much ground: the scales by the ground they fit, A block
    // first, each row at the floor, the arrow keys moving the choice.
    await goToStep(page, 2);
    await expect(
      page.locator('#tactileMapScale input[type="radio"]')
    ).toHaveCount(5);
    await expect(page.locator('#tactileMapScale-block')).toBeChecked();
    for (const row of await page
      .locator('#tactileMapScale .tactile-map-scale-row')
      .all()) {
      expect((await row.boundingBox()).height).toBeGreaterThanOrEqual(floor);
    }
    await page.locator('#tactileMapScale-block').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#tactileMapScale-blocks')).toBeChecked();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#tactileMapScale-block')).toBeChecked();

    // Step 3: what to show.
    await goToStep(page, 3);
    const boxes = page.locator('#tactileMapLandmarks input[type="checkbox"]');
    await expect(boxes).toHaveCount(6);
    await expect(page.locator('#tactileMapLandmark-entrances')).toBeChecked();
    await expect(page.locator('#tactileMapLandmark-transit')).toBeChecked();
    await expect(page.locator('#tactileMapLandmark-shops')).not.toBeChecked();
    for (const row of await page
      .locator('#tactileMapLandmarks .braille-panel-toggle-row')
      .all()) {
      expect((await row.boundingBox()).height).toBeGreaterThanOrEqual(floor);
    }

    // Step 4: make the map.
    await goToStep(page, 4);
    const make = page.locator('#tactileMapMake');
    await expect(make).toHaveText('Make the map');
    expect((await make.boundingBox()).height).toBeGreaterThanOrEqual(floor);
    expect(
      (await page.locator('#tactileMapLoadFile').boundingBox()).height
    ).toBeGreaterThanOrEqual(floor);
    await expect(page.locator('#tactileMapLoadFile')).toHaveText(
      'Use a file instead'
    );
    const link = page.locator('#tactileMapAttribution a').first();
    await expect(link).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/copyright'
    );
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(page.locator('#tactileMapAttribution')).toContainText(
      'Map data from OpenStreetMap contributors'
    );

    await make.click();
    const status = page.locator('#tactileMapAddressStatus');
    await expect(status).toContainText('Draft map ready: ', { timeout: 15000 });
    // The ground of 1:1000 on the 480 x 360 mm plate: 180 m south of the
    // library is its south edge.
    expect(pulled).not.toContain('around');
    expect(decodeURIComponent(pulled)).toContain('way(47.60508');
    await page.locator('#drawingEditorSurface .drawing-editor-close').click();
    await expect(page.locator('#drawingEditorSurface')).toBeHidden();

    await page.setInputFiles('#tactileMapOsmFile', {
      name: 'export.osm',
      mimeType: 'text/xml',
      buffer: OSM,
    });
    await expect(status).toHaveText('export.osm: 5 map features loaded.', {
      timeout: 15000,
    });

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

test.describe('the draft map', () => {
  const OVERPASS = readFileSync(
    'tests/fixtures/tactile-map/overpass-20.json',
    'utf8'
  );
  const PLACE = {
    place_id: 1,
    lat: '47.6067',
    lon: '-122.3327',
    type: 'library',
    importance: 0.5,
    display_name:
      'The Seattle Public Library - Central Library, 1000, 4th Avenue, Seattle, King County, Washington, 98104, United States',
  };

  test('opens in the editor as a draft, one row switched Off, Apply updates the plan', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.route('https://nominatim.openstreetmap.org/search*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify([PLACE]),
      })
    );
    // The map tiles refuse, so the pull reaches the routed Overpass answer.
    await page.route('https://tiles.openstreetmap.us/**', (route) =>
      route.fulfill({
        status: 503,
        headers: { 'access-control-allow-origin': '*' },
        body: '',
      })
    );
    await page.route('https://overpass-api.de/api/interpreter', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: OVERPASS,
      })
    );
    await openTactileMap(page, 'place');
    await page.locator('#tactileMapAddress').fill('1000 4th Ave, Seattle');
    await page.locator('#tactileMapSearch').click();
    await page.locator('#tactileMapPlace1').check();
    await goToStep(page, 4);
    await page.locator('#tactileMapMake').click();
    const status = page.locator('#tactileMapAddressStatus');
    await expect(status).toContainText('Draft map ready: ', { timeout: 15000 });
    await expect(
      page.locator('#drawingEditorSurface .drawing-editor').first()
    ).toHaveAttribute('data-purpose', 'map', { timeout: 60000 });
    const selects = page.locator(
      '#drawingEditorSurface .drawing-editor-class-select'
    );
    await expect(selects).toHaveCount(20);
    // The last entry of a draft's Class menu reads Off, not Ignore.
    await expect(selects.first().locator('option').last()).toHaveText('Off');
    await expect(
      page.locator('#drawingEditorSurface .drawing-editor-canvas')
    ).toBeVisible();
    await expect(page.locator('#tactileMapSummary')).toContainText('plates', {
      timeout: 10000,
    });
    // The levels file the draft wrote; Apply must write another.
    const levelsBefore = await page.evaluate(
      () => window.stateManager?.getState()?.parameters?.map_file?.data
    );
    expect(levelsBefore).toContain('data:');

    // The first on walkway goes Off; the first building comes on as an area.
    const onIndex = await selects.evaluateAll((list) =>
      list.findIndex((s) => s.value === 'walkway')
    );
    const offIndex = await selects.evaluateAll((list) =>
      list.findIndex((s) => s.value === 'ignore')
    );
    expect(onIndex).toBeGreaterThanOrEqual(0);
    expect(offIndex).toBeGreaterThanOrEqual(0);
    await selects.nth(onIndex).selectOption('ignore');
    await selects.nth(offIndex).selectOption('area');
    // What the polite announcer says from here on (the editor spec's listener).
    await page.evaluate(() => {
      window.__heard = [];
      const node = document.getElementById('srAnnouncer');
      if (!node) return;
      new MutationObserver(() => {
        const t = node.textContent.trim();
        if (t) window.__heard.push(t);
      }).observe(node, { childList: true, characterData: true, subtree: true });
    });
    await page.locator('#drawingEditorSurface .drawing-editor-apply').click();
    await expect(page.locator('#drawingEditorSurface')).toBeHidden();
    await expect
      .poll(
        () =>
          page.evaluate(
            () => window.stateManager?.getState()?.parameters?.map_file?.data
          ),
        { timeout: 30000 }
      )
      .not.toBe(levelsBefore);
    expect(
      await page.evaluate(
        () => window.stateManager?.getState()?.parameters?.map_file?.name
      )
    ).toBe('levels_whole.svg');
    await expect
      .poll(() => page.evaluate(() => (window.__heard || []).join(' | ')), {
        timeout: 15000,
      })
      .toMatch(/Draft map updated: \d+ features on, \d+ off\./);

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

  test('names each point by what it is at 3600 Ferry Pl NE: a restaurant by its name, a bus stop by its number, benches as benches', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    // Real tiles over the address (fetched 2026-11-02; map data from
    // OpenStreetMap contributors, ODbL).
    const TILES = {
      5250: readFileSync(
        'tests/fixtures/tactile-map/sourdough-15-5250-11438.mvt'
      ),
      5251: readFileSync(
        'tests/fixtures/tactile-map/sourdough-15-5251-11438.mvt'
      ),
    };
    await page.route('https://nominatim.openstreetmap.org/search*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify([
          {
            place_id: 1,
            lat: '47.6481285',
            lon: '-122.3086726',
            type: 'building',
            importance: 0.5,
            display_name:
              'Center on Human Development and Disability South, 3600, Ferry Place Northeast, Seattle, Washington, 98195, United States',
          },
        ]),
      })
    );
    await page.route('https://tiles.openstreetmap.us/**', (route) => {
      const x = route.request().url().match(/\/15\/(\d+)\/11438\.mvt$/)?.[1];
      const body = TILES[x];
      return route.fulfill({
        status: body ? 200 : 204,
        contentType: 'application/vnd.mapbox-vector-tile',
        headers: { 'access-control-allow-origin': '*' },
        body: body || '',
      });
    });
    await openTactileMap(page, 'place');
    await page.locator('#tactileMapAddress').fill('3600 Ferry Pl NE, Seattle');
    await page.locator('#tactileMapSearch').click();
    await page.locator('#tactileMapPlace1').check();
    await goToStep(page, 3);
    await page.locator('#tactileMapLandmark-benches').check();
    await goToStep(page, 4);
    await page.locator('#tactileMapMake').click();
    await expect(page.locator('#tactileMapAddressStatus')).toContainText(
      'Draft map ready: ',
      { timeout: 15000 }
    );
    const editor = page.locator('#drawingEditorSurface .drawing-editor');
    await expect(editor.first()).toHaveAttribute('data-purpose', 'map', {
      timeout: 60000,
    });
    const rowOf = (name) =>
      page
        .locator('#drawingEditorSurface .svg-prep-object')
        .filter({
          has: page.locator('.svg-prep-object-name', { hasText: name }),
        })
        .first();
    const cafe = rowOf('Restaurant: Plaza Cafe');
    await expect(cafe.locator('.svg-prep-object-name')).toHaveText(
      'Restaurant: Plaza Cafe'
    );
    await expect(cafe.locator('.drawing-editor-class-select')).toHaveValue(
      'landmark'
    );
    await expect(
      rowOf('Bus stop 29405: NE Pacific St & Montlake Blvd NE').locator(
        '.drawing-editor-class-select'
      )
    ).toHaveValue('transit-stop');
    await expect(
      rowOf('Bench near Northeast San Juan Road').locator(
        '.drawing-editor-class-select'
      )
    ).toHaveValue('furniture');
    const names = await page
      .locator('#drawingEditorSurface .svg-prep-object-name')
      .allTextContents();
    expect(names.filter((n) => /^Landmark\b/.test(n))).toEqual([]);

    // The editor measures the draft at the map's own width, and lists what is
    // on before what is off, curbs last.
    // At 14 mm, the editor's own default, it called 284 shapes too thin; at
    // the map's 480 mm none is (MEASURED 2026-11-02), so no notice shows.
    await expect(
      page.locator('#drawingEditorSurface .svg-prep-design-width-input')
    ).toHaveValue('480');
    const notice = page.locator('#drawingEditorSurface .svg-prep-thin-notice');
    await expect(notice).toBeHidden();
    await expect(notice).not.toContainText('14 mm');
    await expect(
      page.locator('#drawingEditorSurface .svg-prep-design-width-help')
    ).toHaveText(
      'The map sets this from its size. Type a width only to see what would change.'
    );
    // A draft is never traced: no row is marked too small to trace.
    await expect(
      page.locator('#drawingEditorSurface .svg-prep-thin-mark')
    ).toHaveCount(0);
    await expect(
      page.locator('#drawingEditorSurface .drawing-editor-class-select').first()
    ).not.toHaveValue('curb');
    await expect(
      page.locator('#drawingEditorSurface .drawing-editor-class-select').first()
    ).not.toHaveValue('ignore');

    const results = await new AxeBuilder({ page })
      .include('#drawingEditorSurface')
      .analyze();
    const violations = results.violations.filter(
      (v) => !ALLOWED_AXE_VIOLATIONS.includes(v.id)
    );
    expect(
      violations,
      violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`).join('\n')
    ).toEqual([]);
  });

  test('the key at 3600 Ferry Pl NE: listed after the plates, its braille from the page, previewed in the tile Key mode', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const TILES = {
      5250: readFileSync(
        'tests/fixtures/tactile-map/sourdough-15-5250-11438.mvt'
      ),
      5251: readFileSync(
        'tests/fixtures/tactile-map/sourdough-15-5251-11438.mvt'
      ),
    };
    await page.route('https://nominatim.openstreetmap.org/search*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify([
          {
            place_id: 1,
            lat: '47.6481285',
            lon: '-122.3086726',
            type: 'building',
            importance: 0.5,
            display_name:
              'Center on Human Development and Disability South, 3600, Ferry Place Northeast, Seattle, Washington, 98195, United States',
          },
        ]),
      })
    );
    await page.route('https://tiles.openstreetmap.us/**', (route) => {
      const x = route.request().url().match(/\/15\/(\d+)\/11438\.mvt$/)?.[1];
      const body = TILES[x];
      return route.fulfill({
        status: body ? 200 : 204,
        contentType: 'application/vnd.mapbox-vector-tile',
        headers: { 'access-control-allow-origin': '*' },
        body: body || '',
      });
    });
    await openTactileMap(page, 'place');
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });
    await page.locator('#tactileMapAddress').fill('3600 Ferry Pl NE, Seattle');
    await page.locator('#tactileMapSearch').click();
    await page.locator('#tactileMapPlace1').check();
    await goToStep(page, 4);
    await page.locator('#tactileMapMake').click();
    const status = page.locator('#tactileMapAddressStatus');
    await expect(status).toContainText('Draft map ready: ', { timeout: 15000 });
    await expect(status).toHaveText(
      / The key has \d+ symbols and \d+ abbreviations\.$/
    );
    await expect(
      page.locator('#drawingEditorSurface .drawing-editor').first()
    ).toHaveAttribute('data-purpose', 'map', { timeout: 60000 });
    await page.keyboard.press('Escape');
    await goToStep(page, 5);
    await expect(page.locator('#tactileMapSummary')).toContainText(
      'The key takes'
    );
    // The braille comes from the page's own translator, UEB uncontracted:
    // read cell by cell for the cafe's row.
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            document
              .getElementById('tactileMapPanel')
              .__forgeMapPanel.keyBraille.get('pc restaurant: plaza cafe')
          ),
        { timeout: 30000 }
      )
      .toBeTruthy();
    const cafe = await page.evaluate(() =>
      document
        .getElementById('tactileMapPanel')
        .__forgeMapPanel.keyBraille.get('pc restaurant: plaza cafe')
    );
    expect(cafe.replace(/[\u2800 ]/g, ' ')).toBe(
      '\u280f\u2809 \u2817\u2811\u280e\u281e\u2801\u2825\u2817\u2801\u281d\u281e\u2812 \u280f\u2807\u2801\u2835\u2801 \u2809\u2801\u280b\u2811'
    );
    const keyRadio = page.locator('input[name="tactileMapPlate"][value^="key"]');
    expect(await keyRadio.count()).toBeGreaterThan(0);
    await keyRadio.first().check();
    await expect
      .poll(
        () =>
          page.evaluate(
            () => window.stateManager?.getState()?.parameters?.plate_kind
          ),
        { timeout: 15000 }
      )
      .toBe('Key');
    const params = await page.evaluate(() => {
      const p = window.stateManager.getState().parameters;
      return { file: p.map_file?.name, print: p.key_print, braille: p.key_braille };
    });
    expect(params.file).toMatch(/^levels_key(-1)?\.svg$/);
    expect(params.print).toMatch(/:KEY: /);
    expect(params.braille.length).toBeGreaterThan(10);
    await expect(page.locator('.preview-state-indicator')).toHaveClass(
      /state-current/,
      { timeout: PREVIEW_TIMEOUT }
    );
    const results = await new AxeBuilder({ page })
      .include('#tactileMapPanel')
      .analyze();
    const violations = results.violations.filter(
      (v) => !ALLOWED_AXE_VIOLATIONS.includes(v.id)
    );
    expect(
      violations,
      violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`).join('\n')
    ).toEqual([]);
  });
});

test.describe('steep sidewalks', () => {
  const OVERPASS = readFileSync(
    'tests/fixtures/tactile-map/overpass-20.json',
    'utf8'
  );
  const PLACE = {
    place_id: 1,
    lat: '47.6067',
    lon: '-122.3327',
    type: 'library',
    importance: 0.5,
    display_name:
      'The Seattle Public Library - Central Library, 1000, 4th Avenue, Seattle, King County, Washington, 98104, United States',
  };

  /** A Terrarium tile of a plane rising 1 m per pixel to the east (about 30 %). */
  function planeTile() {
    const png = new PNG({ width: 256, height: 256 });
    for (let y = 0; y < 256; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        const v = 100 + x + 32768;
        const whole = Math.floor(v);
        const i = (y * 256 + x) * 4;
        png.data[i] = Math.floor(whole / 256);
        png.data[i + 1] = whole % 256;
        png.data[i + 2] = Math.round((v - whole) * 256);
        png.data[i + 3] = 255;
      }
    }
    return PNG.sync.write(png);
  }

  test('the switch and the grade at the floor; on, a routed tile marks steep runs into the levels file', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const tile = planeTile();
    let tilesAsked = 0;
    await page.route('https://nominatim.openstreetmap.org/search*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify([PLACE]),
      })
    );
    // The map tiles refuse, so the pull reaches the routed Overpass answer.
    await page.route('https://tiles.openstreetmap.us/**', (route) =>
      route.fulfill({
        status: 503,
        headers: { 'access-control-allow-origin': '*' },
        body: '',
      })
    );
    await page.route('https://overpass-api.de/api/interpreter', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: OVERPASS,
      })
    );
    await page.route(
      'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/**',
      (route) => {
        tilesAsked += 1;
        return route.fulfill({
          status: 200,
          contentType: 'image/png',
          headers: { 'access-control-allow-origin': '*' },
          body: tile,
        });
      }
    );
    await openTactileMap(page, 'place');
    await page.locator('#tactileMapAddress').fill('1000 4th Ave, Seattle');
    await page.locator('#tactileMapSearch').click();
    await page.locator('#tactileMapPlace1').check();
    await goToStep(page, 3);
    const steep = page.locator('#tactileMapSteep');
    const grade = page.locator('#tactileMapGrade');
    await expect(steep).toBeEnabled();
    await expect(steep).not.toBeChecked();
    await expect(grade).toHaveValue('5');
    await expect(grade).toHaveAttribute('min', '3');
    await expect(grade).toHaveAttribute('max', '12');
    const floor = await page.evaluate(() =>
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--size-touch-target'
        )
      )
    );
    expect(
      (await page.locator('.tactile-map-steep-row').boundingBox()).height
    ).toBeGreaterThanOrEqual(floor);
    expect((await grade.boundingBox()).height).toBeGreaterThanOrEqual(floor);
    await goToStep(page, 4);
    await page.locator('#tactileMapMake').click();
    const status = page.locator('#tactileMapAddressStatus');
    await expect(status).toContainText('Draft map ready', { timeout: 15000 });
    await page.locator('#drawingEditorSurface .drawing-editor-close').click();
    await expect(page.locator('#drawingEditorSurface')).toBeHidden();
    const levelsBefore = await page.evaluate(
      () => window.stateManager?.getState()?.parameters?.map_file?.data
    );
    await goToStep(page, 3);
    await steep.check();
    await expect(status).toHaveText(
      /^\d+ steep segments marked, steeper than 5 %\.$/,
      {
        timeout: 30000,
      }
    );
    expect(tilesAsked).toBeGreaterThan(0);
    await expect
      .poll(
        () =>
          page.evaluate(
            () => window.stateManager?.getState()?.parameters?.map_file?.data
          ),
        { timeout: 30000 }
      )
      .not.toBe(levelsBefore);
    const steepCount = await page.evaluate(
      () =>
        document
          .getElementById('tactileMapPanel')
          .__forgeMapPanel.plan.features.filter((f) => f.class === 'steep')
          .length
    );
    expect(steepCount).toBeGreaterThan(0);

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

// The Tactile Map Designer is not part of the Alt View: with the Alt View
// on, its panel hides and says so once, and its card leaves the welcome
// screen; off again, the panel returns.
test.describe('the Alt View', () => {
  test('hides the panel with one sentence, hides the welcome card, and brings the panel back', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      localStorage.setItem('openscad-customizer-hfm-unlock', 'true');
      localStorage.setItem(
        'openscad-forge-alt-unlock',
        JSON.stringify({ entries: 3, permanent: true, pendingBreak: false })
      );
      localStorage.setItem('openscad-forge-sounds', 'false');
    });
    await openTactileMap(page);
    await skipWithoutWebGL(
      page,
      'no WebGL: the Alt View draws its characters from the 3D picture'
    );
    const panel = page.locator('#tactileMapPanel');
    await expect(panel).toBeVisible();
    await page.evaluate(() => {
      window.__heard = [];
      const node = document.getElementById('srAnnouncer');
      if (!node) return;
      new MutationObserver(() => {
        const t = node.textContent.trim();
        if (t) window.__heard.push(t);
      }).observe(node, { childList: true, characterData: true, subtree: true });
    });
    const key = page.locator('#_hfmToggle');
    await key.waitFor({ state: 'attached', timeout: 30000 });
    await key.click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-ui-variant',
      'mono',
      {
        timeout: 15000,
      }
    );
    await expect(panel).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => (window.__heard || []).join(' | ')), {
        timeout: 15000,
      })
      .toContain(
        'The Tactile Map Designer is not available in the Alt View. Its controls return when the Alt View is off.'
      );
    // The tile's own controls stay (its groups, closed as they open).
    await expect(page.locator('#parametersContainer')).toBeVisible();
    await expect(panel).toHaveAttribute('hidden', '');

    await key.click();
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-ui-variant',
      'mono',
      {
        timeout: 15000,
      }
    );
    await expect(panel).toBeVisible();
    await expect(panel).not.toHaveAttribute('hidden', '');

    await key.click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-ui-variant',
      'mono',
      {
        timeout: 15000,
      }
    );
    await page.locator('#clearFileBtn').click();
    await page
      .getByRole('alertdialog', { name: 'Go back to the Main Page?' })
      .getByRole('button', { name: 'Confirm' })
      .click();
    await expect(page.locator('#welcomeScreen')).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.locator('.role-path-card[data-tutorial-target="tactile-map"]')
    ).toBeHidden();
    await expect(
      page.locator('.role-path-card[data-tutorial-target="beginners-card"]')
    ).toBeVisible();
  });
});

test.describe('the drawing editor on a phone held sideways', () => {
  // A mouse context: a touch one at this size never shows the map panel.
  test.use({ viewport: { width: 844, height: 390 } });

  test('scrolls to its picture instead of cutting it to a strip', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openTactileMap(page);
    await goToStep(page, 3);
    await page.locator('#tactileMapEditDrawing').click();
    await expect(
      page.locator('#drawingEditorSurface .drawing-editor')
    ).toHaveAttribute('data-purpose', 'map', { timeout: 60000 });
    const canvas = page.locator(
      '#drawingEditorSurface .drawing-editor-canvas-svg'
    );
    await canvas.evaluate((n) => n.scrollIntoView({ block: 'nearest' }));
    // How much of the picture shows: inside the editor, above the messages
    // bar laid along the preview's foot, inside the window.
    const seen = await page.evaluate(() => {
      const e = document
        .querySelector('#drawingEditorSurface .drawing-editor')
        .getBoundingClientRect();
      const c = document
        .querySelector('#drawingEditorSurface .drawing-editor-canvas-svg')
        .getBoundingClientRect();
      const bar = document.getElementById('echoDrawer');
      const floor = bar?.offsetParent
        ? bar.getBoundingClientRect().top
        : innerHeight;
      return (
        Math.min(e.bottom, c.bottom, floor, innerHeight) -
        Math.max(e.top, c.top)
      );
    });
    expect(seen).toBeGreaterThanOrEqual(150);
  });
});
