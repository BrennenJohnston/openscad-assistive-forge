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

/** What the app's announcer is given to say, from here on. */
async function listenToAnnouncer(page) {
  await page.evaluate(() => {
    window.__said = [];
    const node = document.getElementById('srAnnouncer');
    new MutationObserver(() => {
      const text = node.textContent.trim();
      if (text) window.__said.push(text);
    }).observe(node, { childList: true, characterData: true, subtree: true });
  });
}

/** What it was given since the last read. The announcer holds a sentence first. */
async function saidSince(page, settle = 2500) {
  await page.waitForTimeout(settle);
  return page.evaluate(() => {
    const said = window.__said;
    window.__said = [];
    return said;
  });
}

test.describe('Tactile Map tile', () => {
  test('the panel sits above the controls and names its map type', async ({
    page,
  }) => {
    await openTactileMap(page);
    await expect(page.locator('#tactileMapPanel h2')).toHaveText(
      'A map from your drawing'
    );
    // The sample's 480 x 360 face in its 10 mm band: a 500 x 380 sheet.
    await expect(page.locator('#tactileMapSummary')).toHaveText(
      /^4 plates of 250 x 190 mm, A1 to B2\. The key takes (one plate|\d+ plates)\.$/,
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

  test('says under its heading that the map maker is a prototype, its link to report a mistake a touch target tall, by keyboard, in a new tab', async ({
    page,
  }) => {
    for (const size of [
      { width: 1280, height: 720 },
      { width: 412, height: 915 },
    ]) {
      await page.setViewportSize(size);
      if (size.width < 900) {
        // On a phone the panel is a drawer, here on the type chooser.
        await page.goto('/?example=tactile-map');
        await dismissSavePrompt(page);
        const toggle = page.locator('#mobileDrawerToggle');
        await expect(toggle).toBeVisible({ timeout: 30000 });
        if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
          await toggle.click();
        }
        await expect(page.locator('#tactileMapChooser')).toBeVisible({
          timeout: 30000,
        });
      } else {
        await openTactileMap(page);
      }
      const note = page.locator(
        '#tactileMapPanel > h2 + p#tactileMapPrototype'
      );
      await expect(note).toBeVisible();
      await expect(note).toHaveText(
        'This map maker is a prototype and still a work in progress, so a map may have mistakes. Check each map before a reader relies on it. If you find a mistake, please report it on GitHub Issues (opens in a new tab) so I can fix it.'
      );
      const link = note.getByRole('link', {
        name: 'GitHub Issues (opens in a new tab)',
      });
      await expect(link).toHaveAttribute(
        'href',
        'https://github.com/BrennenJohnston/openscad-assistive-forge/issues'
      );
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      // A press anywhere a touch target's height around the words lands on
      // the link; the line it sits in keeps the note's spacing. Measured
      // once the drawer has stopped moving.
      const measure = () =>
        link.evaluate((a) => {
          a.scrollIntoView({ block: 'center' });
          a.focus();
          const r = a.getBoundingClientRect();
          const target = parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue(
              '--size-touch-target'
            )
          );
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const on = (y) => a.contains(document.elementFromPoint(cx, y));
          const p = a.parentElement;
          return {
            hits: [on(cy - target / 2 + 1), on(cy + target / 2 - 1)],
            width: r.width,
            target,
            lineGap:
              parseFloat(getComputedStyle(p).lineHeight) -
              parseFloat(getComputedStyle(a).lineHeight),
            outline: getComputedStyle(a).outlineStyle,
          };
        });
      await expect
        .poll(async () => (await measure()).hits, { message: `${size.width}` })
        .toEqual([true, true]);
      const { width, target, lineGap, outline } = await measure();
      expect(width, `${size.width}`).toBeGreaterThanOrEqual(target);
      expect(lineGap).toBe(0);
      await expect(link).toBeFocused();
      expect(outline).toBe('solid');
    }
  });

  test('lays the map paper over the plate, never the map file itself, and Show Model hides the plate to read it', async ({
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
    // The paper is the overlay's source; the levels file never is.
    await expect(page.locator('#overlayToggle')).toBeChecked({
      timeout: 10_000,
    });
    const overlay = () =>
      page.evaluate(() => ({
        source: window.previewManager?.getOverlayConfig?.()?.sourceFileName,
        visible: Boolean(window.previewManager?.referenceOverlay?.visible),
        model: window.previewManager?.mesh?.visible ?? null,
      }));
    expect(await overlay()).toMatchObject({
      source: 'paper_whole.svg',
      visible: true,
      model: true,
    });

    await goToStep(page, 5);
    const paperBox = page.locator('#tactileMapPaper');
    await expect(paperBox).toBeChecked();
    await paperBox.uncheck();
    await expect(page.locator('#overlayToggle')).not.toBeChecked();
    expect((await overlay()).visible).toBe(false);
    await paperBox.check();
    await expect(page.locator('#overlayToggle')).toBeChecked({
      timeout: 10_000,
    });
    expect((await overlay()).source).toBe('paper_whole.svg');

    // The View menu's switch hides the mesh and nothing else.
    const showModel = page.getByRole('menuitemcheckbox', {
      name: 'Show Model',
    });
    await page.evaluate(() => document.getElementById('viewMenuBtn')?.click());
    await showModel.click();
    expect(await overlay()).toMatchObject({ visible: true, model: false });
    await page.evaluate(() => document.getElementById('viewMenuBtn')?.click());
    await showModel.click();
    expect((await overlay()).model).toBe(true);
  });

  test('the preview renders the whole map, then plate A1 at 250 x 190', async ({
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
      '250',
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

  test('Once a map is generated, a change in step 5 generates it again with no press', async ({
    page,
  }) => {
    test.setTimeout(420_000);
    await openTactileMap(page);
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });
    await goToStep(page, 5);
    const button = page.locator('#primaryActionBtn');
    await expect(button).toHaveAttribute('data-action', 'generate');
    // Before anything is generated, a change leaves the button as it is.
    await page.locator('#tactileMapMargin').fill('15');
    await page.locator('#tactileMapMargin').press('Tab');
    await expect
      .poll(
        () =>
          page.evaluate(
            () => window.stateManager.getState().parameters.margin_mm
          ),
        { timeout: 60_000 }
      )
      .toBe(15);
    await page.waitForTimeout(4000);
    await expect(button).toHaveAttribute('data-action', 'generate');
    await button.click();
    await expect(button).toHaveAttribute('data-action', 'download', {
      timeout: 240_000,
    });
    // After it, the file catches up by itself, and Download is the new map.
    await page.locator('#tactileMapMargin').fill('20');
    await page.locator('#tactileMapMargin').press('Tab');
    await expect
      .poll(
        () =>
          page.evaluate(
            () => window.stateManager.getState().parameters.margin_mm
          ),
        { timeout: 60_000 }
      )
      .toBe(20);
    await expect(button).toHaveAttribute('data-action', 'download', {
      timeout: 240_000,
    });
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              document.getElementById('primaryActionBtn').dataset.action ===
                'download' &&
              document
                .getElementById('downloadFallbackLink')
                .classList.contains('hidden')
          ),
        { timeout: 240_000 }
      )
      .toBe(true);
  });

  test('Tape channels start as a recess; cut through moves them to the cutouts group, and an All printed plate brings a warning and still renders', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openTactileMap(page);
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });
    await goToStep(page, 5);
    // The tape's choices stand while label tape is chosen.
    const cut = page.locator('#tactileMapChannelCut');
    await expect(cut).toBeHidden();
    await page.locator('#tactileMapLabels').selectOption('tape');
    await expect(cut).toBeVisible();
    await expect(cut).toHaveValue('recess');
    await expect(page.locator('label[for="tactileMapChannelCut"]')).toHaveText(
      'Tape channels'
    );
    // The empty note takes no room.
    expect(
      await page
        .locator('#tactileMapChannelNote')
        .evaluate((n) => n.getBoundingClientRect().height)
    ).toBe(0);
    const levels = () =>
      page.evaluate(() => {
        const d = window.stateManager.getState().parameters.map_file?.data;
        const body = (d || '').split(',')[1] || '';
        return d?.includes(';base64,') ? atob(body) : decodeURIComponent(body);
      });
    await expect
      .poll(levels, { timeout: 15000 })
      .toMatch(/<g id="channels"><path d="[^"]+"\/><\/g>/);
    expect(await levels()).toMatch(/<g id="cutouts"><\/g>/);
    await cut.selectOption('through');
    await expect
      .poll(levels, { timeout: 15000 })
      .toMatch(/<g id="channels"><\/g>/);
    expect(await levels()).toMatch(/<g id="cutouts"><path d="[^"]+"\/><\/g>/);
    // Thin plates have the board under the tape: no warning.
    await expect(page.locator('#tactileMapWarningsBox')).toBeHidden();
    // All printed, chosen in the Customizer's folded Print style group.
    await page
      .getByRole('button', { name: 'Expand all parameter groups' })
      .click();
    await page.locator('#param-print_style').selectOption('All printed');
    const warning =
      'Cut-through channels leave nothing under the tape on an All printed plate; choose Thin plates for a backing board, or a recess.';
    await expect(page.locator('#tactileMapWarnings li')).toHaveText([warning]);
    await expect(page.locator('#tactileMapWarningsBox summary')).toHaveText(
      '1 warning'
    );
    // The list is folded, so the sentence also stands under the select.
    const note = page.locator('#tactileMapChannelNote');
    await expect(note).toHaveText(warning);
    await expect(note).toBeVisible();
    await expect(cut).not.toHaveAttribute('aria-describedby');
    // At the default thin base the model raises All printed to 1.2 mm itself:
    // the preview lands, it does not stop on the base's thickness.
    await previewSettled(page);
    await expect(page.locator('.preview-state-indicator')).not.toHaveClass(
      /state-error/
    );
    await cut.selectOption('recess');
    await expect(page.locator('#tactileMapWarningsBox')).toBeHidden();
    await expect(note).toHaveText('');
    await expect
      .poll(levels, { timeout: 15000 })
      .toMatch(/<g id="channels"><path d="[^"]+"\/><\/g>/);
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
    expect(readme).toMatch(
      /\nKey\nSymbols: Forge basic shapes\.\n\nSymbols, You are here first:\n/
    );
    // Each key plate by its row's words, in the key's order.
    const keyNames = await page.evaluate(() =>
      document
        .getElementById('tactileMapPanel')
        .__forgeMapPanel.keyPages.map((p) => p.name)
    );
    expect(keyNames.every(Boolean)).toBe(true);
    expect(readme).toContain(
      (keyIds.length === 1
        ? 'The key prints on a plate of its own, to read before the map:\n'
        : `The key prints on ${keyIds.length} plates of its own, to read before the map. ` +
          'Lay them in this order, the first farthest from the reader:\n') +
        keyIds.map((id, i) => `- ${id}: ${keyNames[i]}\n`).join('')
    );
    expect(names).toContain('map_plan.json');
    expect(names).toContain('README.txt');
    expect(names).toContain('levels_A1.svg');
    expect(names).toContain('plate_grid.svg');
    expect(names).toContain('map_print.pdf');
    const pdf = await zip.file('map_print.pdf').async('uint8array');
    expect(String.fromCharCode(...pdf.slice(0, 5))).toBe('%PDF-');
    expect(readme).toMatch(
      /^This map maker is a prototype [^\n]*\/issues so I can fix it\.\n\nmap_print\.pdf shows where each label goes/
    );
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
    expect(size[0]).toBeCloseTo(250, 1);
    expect(size[1]).toBeCloseTo(190, 1);
    expect(size[2]).toBeCloseTo(2.4, 1);
    await expect(page.locator('#tactileMapRenderStatus')).toHaveText(
      `All ${4 + keyIds.length} plates are in tactile_map_plates.zip.`
    );
    await expect(page.locator('#tactileMapRenderAll')).toBeVisible();
    await expect(page.locator('#tactileMapRenderCancel')).toBeHidden();
  });

  test('Download the PDF gives the transcriber the PDF alone', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openTactileMap(page);
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });
    await goToStep(page, 5);
    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await page.locator('#tactileMapPdf').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('tactile_map_print.pdf');
    const bytes = readFileSync(await download.path());
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.toString('latin1')).toMatch(/\(\d+ the waiting area\) Tj/);
    await expect(page.locator('#tactileMapRenderStatus')).toHaveText(
      'The PDF is in tactile_map_print.pdf.'
    );
  });

  test('the door opens the drawing in the file control as a map, and Apply classes makes the plan', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openTactileMap(page);
    await expect(page.locator('#tactileMapSummary')).toHaveText(
      /^4 plates of 250 x 190 mm, A1 to B2\. The key takes (one plate|\d+ plates)\.$/,
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
    // The 302 x 202 face in its 10 mm band: a 322 x 222 sheet.
    await expect(page.locator('#tactileMapSummary')).toHaveText(
      /^2 plates of 161 x 222 mm, A1 to A2\. The key takes (one plate|\d+ plates)\.$/,
      { timeout: 10000 }
    );
    await expect(page.locator('#param-map_width_mm-spinbox')).toHaveValue(
      '322',
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

    // Step 3: what to show, a tier at a time and then a group at a time;
    // each row at the floor, the arrow keys moving the tier.
    await goToStep(page, 3);
    await expect(
      page.locator('#tactileMapDetail input[type="radio"]')
    ).toHaveCount(4);
    await expect(page.locator('#tactileMapDetail-named')).toBeChecked();
    for (const row of await page
      .locator('#tactileMapDetail .braille-panel-toggle-row')
      .all()) {
      expect((await row.boundingBox()).height).toBeGreaterThanOrEqual(floor);
    }
    const namedWords = page.locator('label[for="tactileMapDetail-named"]');
    await page.locator('#tactileMapDetail-named').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#tactileMapDetail-buildings')).toBeChecked();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#tactileMapDetail-named')).toBeChecked();
    await page.locator('#tactileMapGroups summary').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#tactileMapGroups')).toHaveAttribute('open', '');
    for (const select of await page.locator('#tactileMapGroups select').all()) {
      expect((await select.boundingBox()).height).toBeGreaterThanOrEqual(floor);
    }
    const furniture = page.locator('#tactileMapGroup-furniture');
    await furniture.selectOption('on');
    await expect(namedWords).toHaveText('Named places (changed)');
    await furniture.selectOption('off');
    await expect(namedWords).toHaveText('Named places');
    const stepThree = await new AxeBuilder({ page })
      .include('#tactileMapSteps-step-3')
      .analyze();
    expect(
      stepThree.violations,
      stepThree.violations
        .map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)
        .join('\n')
    ).toEqual([]);

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

/**
 * The draft at 3600 Ferry Pl NE from the real tiles, the editor closed, at
 * step 5. Hands back the address step's status line.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ detail?: string }} [options] - a step 3 level other than the
 *   first, by its radio's id end (`buildings`, `everything`)
 */
async function makeFerryDraft(page, { detail } = {}) {
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
    const x = route
      .request()
      .url()
      .match(/\/15\/(\d+)\/11438\.mvt$/)?.[1];
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
  if (detail) {
    await goToStep(page, 3);
    await page.locator(`#tactileMapDetail-${detail}`).check();
  }
  await goToStep(page, 4);
  await page.locator('#tactileMapMake').click();
  const status = page.locator('#tactileMapAddressStatus');
  await expect(status).toContainText('Draft map ready: ', { timeout: 15000 });
  await expect(status).toHaveText(
    / The key has \d+ symbols and \d+ numbered places\.$/
  );
  await expect(
    page.locator('#drawingEditorSurface .drawing-editor').first()
  ).toHaveAttribute('data-purpose', 'map', { timeout: 60000 });
  await page.keyboard.press('Escape');
  await goToStep(page, 5);
  return status;
}

/** The plate shown's levels file and rows, as the model is handed them. */
function shownPlate(page) {
  return page.evaluate(() => {
    const p = window.stateManager.getState().parameters;
    const d = p.map_file?.data || '';
    const body = d.split(',')[1] || '';
    return {
      wedges: p.number_wedges,
      words: p.raised_words,
      levels: d.includes(';base64,') ? atob(body) : decodeURIComponent(body),
      paper:
        document.getElementById('tactileMapPanel').__forgeMapPanel.paper?.svg ||
        '',
    };
  });
}

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
    // Every feature in the data has a row, the off ones too (a group switch
    // turns them on): the fixture's 20 drawn features, its bakery, and You
    // are here, off until the person places it.
    await expect(selects).toHaveCount(22);
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
      const x = route
        .request()
        .url()
        .match(/\/15\/(\d+)\/11438\.mvt$/)?.[1];
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
    await page.locator('#tactileMapGroups summary').click();
    await page.locator('#tactileMapGroup-furniture').selectOption('on');
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
      /^\d+ Restaurant: Plaza Cafe$/
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

    // One press turns every building on, and one Undo takes them back off.
    const areaSwitch = page.locator(
      '#drawingEditorSurface .drawing-editor-map-switch[data-map-class="area"]'
    );
    await expect(areaSwitch).toHaveAttribute('aria-pressed', 'false');
    const areas = Number(
      (await areaSwitch.textContent()).match(/\((\d+)\)/)[1]
    );
    const areaRows = page.locator(
      '#drawingEditorSurface .drawing-editor-class-select'
    );
    const onAreas = async () =>
      (await areaRows.evaluateAll((all) => all.map((s) => s.value))).filter(
        (v) => v === 'area'
      ).length;
    const before = await onAreas();
    await areaSwitch.focus();
    await page.keyboard.press('Enter');
    await expect(areaSwitch).toHaveAttribute('aria-pressed', 'true');
    expect(await onAreas()).toBe(areas);
    await expect(
      page.locator('#drawingEditorSurface .drawing-editor-status')
    ).toHaveText(`Area: ${areas - before} shapes on.`);
    await page
      .locator(
        '#drawingEditorSurface .drawing-editor-history [data-action="undo"]'
      )
      .click();
    expect(await onAreas()).toBe(before);
    // Only the rows that are on, then every row again.
    const show = page.locator(
      '#drawingEditorSurface .drawing-editor-map-show select'
    );
    await show.selectOption('on');
    await expect(
      page.locator('#drawingEditorSurface .svg-prep-object:visible')
    ).toHaveCount(
      (await areaRows.evaluateAll((all) => all.map((s) => s.value))).filter(
        (v) => v !== 'ignore'
      ).length
    );
    await show.selectOption('all');

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

  test("the key and the labels at 3600 Ferry Pl NE on label tape: a channel for each place's braille number on the map, the key a row a piece, the number then the name on tape, previewed in the tile Key mode", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const status = await makeFerryDraft(page);
    await expect(page.locator('#tactileMapSummary')).toContainText(
      'The key takes'
    );
    await page.locator('#tactileMapLabels').selectOption('tape');
    // Each numbered place gets a channel for its braille number; the names
    // are in the key.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.getElementById('tactileMapPanel').__forgeMapPanel.labeled()
              .labels.length
        )
      )
      .toBeGreaterThan(0);
    const mapLabels = await page.evaluate(() =>
      document
        .getElementById('tactileMapPanel')
        .__forgeMapPanel.labeled()
        .labels.map((l) => l.text)
    );
    expect(mapLabels.every((t) => /^#\d+$/.test(t))).toBe(true);
    const levels = await page.evaluate(() => {
      const d = window.stateManager.getState().parameters.map_file?.data || '';
      const body = d.split(',')[1] || '';
      return d.includes(';base64,') ? atob(body) : decodeURIComponent(body);
    });
    expect(levels).toMatch(/<g id="channels"><path d="[^"]+"\/><\/g>/);
    await expect(page.locator('#tactileMapWarnings')).not.toContainText(
      'No room for'
    );
    // The ready sentence counts the warnings step 5 lists.
    const said = Number(
      (await status.textContent()).match(/; (\d+) warnings?\./)?.[1] ?? 0
    );
    expect(said).toBe(await page.locator('#tactileMapWarnings li').count());
    // The key, a row a piece: each place's piece holds its number's channel,
    // then its name on tape, the cafe's among them.
    const pieces = await page.evaluate(() =>
      document
        .getElementById('tactileMapPanel')
        .__forgeMapPanel.keyPages.map((p) => p.tape)
    );
    const cafe = pieces.find((t) => t.join(' ').includes('plaza cafe'));
    expect(cafe[0]).toMatch(/^#\d+$/);
    expect(cafe.slice(1).join(' ')).toBe('restaurant: plaza cafe');
    const tape = pieces.flat();
    // The labels' tape, measured by the braille translator in the grade
    // chosen: uncontracted to start, as a hand-press labeler writes,
    // contracted on a switch, the note saying each and what the other would
    // need.
    const grade = page.locator('#tactileMapTapeGrade');
    await expect(grade).toHaveValue('g1');
    const tapeNote = page.locator('#tactileMapTapeNote');
    await expect(tapeNote).toHaveText(
      /^Label tape: uncontracted braille \(Grade 1\)\. \d+ labels?, \d+ cells, about \d+ mm of 12\.7 mm tape; contracted would take \d+ labels?, about \d+ mm\.$/,
      { timeout: 30000 }
    );
    // What the sentence promises for the other grade is what a switch gives.
    const promised = (await tapeNote.textContent()).match(
      /would take (\d+) labels?, about (\d+) mm/
    );
    await grade.selectOption('g2');
    await expect(tapeNote).toHaveText(
      /^Label tape: contracted braille \(UEB Grade 2\)\. \d+ labels?, \d+ cells, about \d+ mm of 12\.7 mm tape; uncontracted would take \d+ labels?, about \d+ mm\.$/,
      { timeout: 30000 }
    );
    const got = (await tapeNote.textContent()).match(
      /(\d+) labels?, \d+ cells, about (\d+) mm of/
    );
    expect([got[1], got[2]]).toEqual([promised[1], promised[2]]);
    await grade.selectOption('g1');
    await expect(tapeNote).toHaveText(/^Label tape: uncontracted braille/, {
      timeout: 30000,
    });
    // The typed address is the destination, the first row after the key's
    // title, named by the words typed up to the first comma.
    // (A row longer than a channel wraps at a space; the first piece holds
    // the start of the name.)
    const destinationRow = tape.findIndex((t) =>
      t.startsWith('destination, 3600')
    );
    expect(destinationRow).toBeGreaterThan(-1);
    expect(destinationRow).toBeLessThan(
      tape.findIndex((t) => /^#\d+$/.test(t))
    );
    const keyRadio = page.locator(
      'input[name="tactileMapPlate"][value^="key"]'
    );
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
    // The file control takes its file a moment after the plate kind changes.
    await expect
      .poll(
        () =>
          page.evaluate(
            () => window.stateManager.getState().parameters.map_file?.name
          ),
        { timeout: 15000 }
      )
      .toMatch(/^levels_key(-1)?\.svg$/);
    const params = await page.evaluate(() => {
      const p = window.stateManager.getState().parameters;
      const d = p.map_file?.data || '';
      const body = d.split(',')[1] || '';
      return {
        file: p.map_file?.name,
        print: p.raised_words,
        levels: d.includes(';base64,') ? atob(body) : decodeURIComponent(body),
      };
    });
    expect(params.file).toMatch(/^levels_key(-1)?\.svg$/);
    expect(params.print).toBe('');
    expect(params.levels).toMatch(/<g id="channels"><path d="[^"]+"\/><\/g>/);
    // One plate is one plate in the model's message, which a screen reader says.
    await expect(page.locator('#echoMessages')).toContainText(
      'fits a 256 x 256 mm bed in 1 plate.',
      { timeout: PREVIEW_TIMEOUT }
    );
    // Raised numbers and letters raise the key's words.
    await page.locator('#tactileMapLabels').selectOption('raised');
    await page
      .locator('input[name="tactileMapPlate"][value^="key"]')
      .first()
      .check();
    await expect
      .poll(
        () =>
          page.evaluate(
            () => window.stateManager.getState().parameters.raised_words
          ),
        { timeout: 15000 }
      )
      .toMatch(/:160:0:KEY:/);
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

test.describe('numbers on the map', () => {
  test('the Labels switch at 3600 Ferry Pl NE: one kind at a time on the map and in the key, braille wedges to start, then label tape, then raised numbers and letters', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await makeFerryDraft(page);
    const labels = page.locator('#tactileMapLabels');
    await expect(labels).toHaveValue('wedge');
    await expect(labels.locator('option')).toHaveText([
      'Braille wedges',
      'Braille label tape',
      'Raised numbers and letters',
    ]);
    const WEDGE_ROW = /^\d+:\d+:\d+(\|\d+:\d+:\d+)*$/;
    const NUMERAL = /:#\d+(\||$)/;
    const CHANNELS = /<g id="channels"><path d="[^"]+"\/><\/g>/;
    const NO_CHANNELS = /<g id="channels"><\/g>/;
    const grade = page.locator('#tactileMapTapeGrade');

    // Every plate the button renders, with what it hands the model.
    const renderAll = async () => {
      await page.evaluate(() => {
        const panel =
          document.getElementById('tactileMapPanel').__forgeMapPanel;
        window.__sets = [];
        window.__realRender = window.__realRender || panel.render;
        panel.render = async (parameters) => {
          window.__sets.push({
            kind: parameters.plate_kind,
            file: parameters.map_file?.name || '',
            wedges: parameters.number_wedges,
            braille: parameters.braille_wedges,
            words: parameters.raised_words,
            w: parameters.map_width_mm,
            h: parameters.map_height_mm,
          });
          return new Uint8Array(84);
        };
        panel.download = () => {};
      });
      await page.locator('#tactileMapRenderAll').click();
      await expect(page.locator('#tactileMapRenderStatus')).toHaveText(
        /are in \S+_plates\.zip\.$/,
        { timeout: 60000 }
      );
      return page.evaluate(() => window.__sets);
    };
    // No wedge stands across a seam: each lies whole on its plate.
    const whole = (x) =>
      (x.wedges || '')
        .split('|')
        .filter(Boolean)
        .every((row) => {
          const [wx, wy, n] = row.split(':').map(Number);
          const half = (n < 10 ? 15.5 : 22) / 2;
          return (
            wx / 10 - half >= 0 &&
            wx / 10 + half <= x.w &&
            wy / 10 >= 0 &&
            wy / 10 + 13.34 <= x.h
          );
        });

    // Braille wedges: wedges on the map, no tape, no numeral; each key row a
    // piece, a place's number on a wedge and its name on wedges.
    await expect
      .poll(async () => (await shownPlate(page)).wedges)
      .toMatch(WEDGE_ROW);
    let shown = await shownPlate(page);
    expect(shown.words).not.toMatch(NUMERAL);
    expect(shown.levels).toMatch(NO_CHANNELS);
    expect(shown.paper).toMatch(/<g id="paper-wedges"[^>]*><rect /);
    await expect(grade).toBeHidden();
    let sets = await renderAll();
    let maps = sets.filter((x) => x.kind === 'Map');
    let keys = sets.filter((x) => x.kind === 'Key');
    expect(maps.some((x) => WEDGE_ROW.test(x.wedges))).toBe(true);
    expect(maps.every(whole)).toBe(true);
    expect(keys.length).toBeGreaterThan(5);
    const places = keys.filter((x) => x.wedges);
    expect(places.length).toBeGreaterThan(0);
    expect(places.every((x) => /^\d+:\d+:[\d.]+/.test(x.braille))).toBe(true);
    expect(keys.every((x) => x.h < 75)).toBe(true);
    // One place's piece through the engine itself: the number's wedge and
    // the name's wedges build, dots and all.
    const real = await page.evaluate(async () => {
      const panel = document.getElementById('tactileMapPanel').__forgeMapPanel;
      const set = panel
        .keyParameterSets(window.stateManager.getState().parameters)
        .find((x) => x.parameters.number_wedges && x.parameters.braille_wedges);
      const bytes = await window.__realRender(set.parameters, {
        format: 'stl',
        timeoutMs: 120000,
      });
      // The engine hands back an ArrayBuffer or a Uint8Array.
      const size = bytes?.byteLength ?? 84;
      return { id: set.id, triangles: (size - 84) / 50 };
    });
    expect(real.triangles, real.id).toBeGreaterThan(5000);

    // Braille label tape: a channel for each number on the map, no wedge.
    await labels.selectOption('tape');
    await expect(grade).toBeVisible();
    await expect(grade).toHaveValue('g1');
    await expect.poll(async () => (await shownPlate(page)).wedges).toBe('');
    await expect
      .poll(async () => (await shownPlate(page)).levels)
      .toMatch(CHANNELS);
    shown = await shownPlate(page);
    expect(shown.words).not.toMatch(NUMERAL);
    // One label and one channel a place, wherever its number stands.
    const tape = await page.evaluate(() => {
      const panel = document.getElementById('tactileMapPanel').__forgeMapPanel;
      const { labeled } = panel.clearedPlan(panel.labeled());
      return {
        numbered: labeled.key.numbers.length,
        keyOnly: labeled.keyOnly.length,
        labels: labeled.labels.map((l) => l.featureId),
        channels: labeled.plan.features
          .filter((f) => f.kind === 'channel')
          .map((f) => f.id),
      };
    });
    expect(tape.labels).toHaveLength(tape.numbered - tape.keyOnly);
    expect(new Set(tape.labels).size).toBe(tape.labels.length);
    expect(new Set(tape.channels).size).toBe(tape.channels.length);
    sets = await renderAll();
    expect(sets.every((x) => !x.wedges && !x.braille)).toBe(true);

    // Raised numbers and letters: numerals on the map; the key's words raised.
    await labels.selectOption('raised');
    await expect(grade).toBeHidden();
    await expect
      .poll(async () => (await shownPlate(page)).levels)
      .toMatch(NO_CHANNELS);
    shown = await shownPlate(page);
    expect(shown.words).toMatch(NUMERAL);
    expect(shown.wedges).toBe('');
    sets = await renderAll();
    maps = sets.filter((x) => x.kind === 'Map');
    keys = sets.filter((x) => x.kind === 'Key');
    expect(maps.some((x) => NUMERAL.test(x.words))).toBe(true);
    expect(keys.filter((x) => NUMERAL.test(x.words)).length).toBeGreaterThan(0);
    expect(sets.every((x) => !x.wedges && !x.braille)).toBe(true);
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

// One action, one announcement. A change in step 5 regenerates a generated map by
// itself, and only the result is worth saying; the map's own echo line is said
// when its words change, not every time the model runs again.
test.describe('Tactile Map, what a change says', () => {
  test('a regenerate says no Generating, and an unchanged Message is not said again', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openTactileMap(page);
    await previewSettled(page);
    await goToStep(page, 5);
    await page.locator('#primaryActionBtn').click();
    await expect(page.locator('#primaryActionBtn')).toHaveAttribute(
      'data-action',
      'download',
      { timeout: 120_000 }
    );
    await page.waitForTimeout(3000);
    await listenToAnnouncer(page);

    // A new margin changes the sheet: the map is generated again by itself.
    await page.locator('#tactileMapMargin').fill('20');
    await page.locator('#tactileMapMargin').press('Tab');
    await expect
      .poll(() => page.evaluate(() => window.__said.join(' | ')), {
        timeout: 120_000,
      })
      .toMatch(/STL ready/);
    const regenerated = await saidSince(page, 1500);
    expect(
      regenerated.filter((s) => /^Generating/.test(s)),
      JSON.stringify(regenerated)
    ).toEqual([]);

    // The plate name style redraws the model and changes no size: the model
    // ran again, and the echo line's words stand.
    await page.locator('#tactileMapIdStyle').selectOption({ index: 1 });
    await expect
      .poll(() => page.evaluate(() => window.__said.join(' | ')), {
        timeout: 120_000,
      })
      .toMatch(/Preview ready/);
    const restyled = await saidSince(page, 2500);
    expect(
      restyled.filter((s) => /^Message: /.test(s)),
      JSON.stringify(restyled)
    ).toEqual([]);
  });
});

test.describe('Generate during the map steps', () => {
  test('is unavailable on steps 1 to 4, still focusable: a press says why above it and generates nothing', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const NOTE =
      "Finish the map's steps first. Generate works at step 5, Check and print.";
    const generate = page.locator('#primaryActionBtn');
    const note = page.locator('#primaryActionHoldNote');

    // Step 1: held, still focusable, a press says why and nothing renders.
    await openTactileMap(page, 'place');
    await expect(generate).toHaveAttribute('aria-disabled', 'true');
    // Unavailable, not disabled: the native flag stays off so it keeps focus.
    expect(await generate.evaluate((b) => b.disabled)).toBe(false);
    await generate.focus();
    await expect(generate).toBeFocused();
    await listenToAnnouncer(page);
    await page.keyboard.press('Enter');
    await expect(note).toBeVisible();
    await expect(note).toHaveText(NOTE);
    await expect(page.locator('#cancelRenderBtn')).toBeHidden();
    expect((await saidSince(page)).filter((s) => s.includes(NOTE))).toHaveLength(
      1
    );
    const n = await note.boundingBox();
    const b = await generate.boundingBox();
    expect(n.y + n.height).toBeLessThanOrEqual(b.y);
    expect(
      await note.evaluate((el) => getComputedStyle(el).pointerEvents)
    ).toBe('none');
  });

  test('is free on step 5 and held again on going back; a change of step takes the note away; on step 5 it generates', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const generate = page.locator('#primaryActionBtn');
    const note = page.locator('#primaryActionHoldNote');

    // Step 5 of a draft: free. Back to step 3: held again; a press, then
    // the next step takes the note away.
    await makeFerryDraft(page);
    await expect(generate).not.toHaveAttribute('aria-disabled', 'true');
    await goToStep(page, 3);
    await expect(generate).toHaveAttribute('aria-disabled', 'true');
    // A mouse press where it stands (a locator's click waits for an
    // aria-disabled button to come free).
    const at = await generate.boundingBox();
    await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
    await expect(note).toBeVisible();
    await goToStep(page, 4);
    await expect(note).toHaveCount(0);

    // Step 5 again: Generate generates.
    await goToStep(page, 5);
    await expect(generate).not.toHaveAttribute('aria-disabled', 'true');
    await generate.click();
    await expect(note).toHaveCount(0);
    await expect(page.locator('#cancelRenderBtn')).toBeVisible({
      timeout: 30000,
    });
  });
});

test.describe('a place map, end to end', () => {
  test('at 3600 Ferry Pl NE with every building: the paper under the plate, Show Model, numbers in the key, the tape grade, and a zip with the PDF, the margin band and no key plate without a row', async ({
    page,
  }) => {
    test.setTimeout(420_000);
    const status = await makeFerryDraft(page, { detail: 'buildings' });
    const places = Number(
      (await status.textContent()).match(/and (\d+) numbered places\.$/)[1]
    );
    // Named places numbers 15 here; every building numbers more.
    expect(places).toBeGreaterThan(15);

    // The paper under the plate, and the View menu's switch hiding the
    // plate to read it.
    await expect(page.locator('#tactileMapPaper')).toBeChecked();
    const overlay = () =>
      page.evaluate(() => ({
        source: window.previewManager?.getOverlayConfig?.()?.sourceFileName,
        visible: Boolean(window.previewManager?.referenceOverlay?.visible),
        model: window.previewManager?.mesh?.visible ?? null,
      }));
    await expect
      .poll(overlay, { timeout: PREVIEW_TIMEOUT })
      .toMatchObject({ source: 'paper_whole.svg', visible: true, model: true });
    const showModel = page.getByRole('menuitemcheckbox', {
      name: 'Show Model',
    });
    await page.evaluate(() => document.getElementById('viewMenuBtn')?.click());
    await showModel.click();
    expect(await overlay()).toMatchObject({ visible: true, model: false });
    await page.evaluate(() => document.getElementById('viewMenuBtn')?.click());
    await showModel.click();
    expect((await overlay()).model).toBe(true);

    // Label tape, its note saying the grade chosen.
    await page.locator('#tactileMapLabels').selectOption('tape');
    await page.locator('#tactileMapTapeGrade').selectOption('g2');
    await expect(page.locator('#tactileMapTapeNote')).toHaveText(
      /^Label tape: contracted braille \(UEB Grade 2\)\. \d+ labels?, /,
      { timeout: 30000 }
    );

    // The zip, each plate's mesh stood in for: what travels with the plates.
    const sets = await page.evaluate(() => {
      const panel = document.getElementById('tactileMapPanel').__forgeMapPanel;
      window.__sets = [];
      panel.render = async (parameters) => {
        window.__sets.push(parameters.plate_kind);
        return new Uint8Array(84);
      };
      return panel.keyPages.length;
    });
    const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
    await page.locator('#tactileMapRenderAll').click();
    const download = await downloadPromise;
    const zip = await JSZip.loadAsync(readFileSync(await download.path()));
    const names = Object.keys(zip.files);
    expect(
      (await page.evaluate(() => window.__sets)).filter((k) => k === 'Key')
    ).toHaveLength(sets);

    const pdf = await zip.file('map_print.pdf').async('uint8array');
    expect(String.fromCharCode(...pdf.slice(0, 5))).toBe('%PDF-');

    const readme = await zip.file('README.txt').async('string');
    const numbered = readme
      .split('\nNumbered places on the map:\n')[1]
      .split('\n\n')[0]
      .split('\n')
      .filter((line) => /^- \d+ /.test(line));
    expect(numbered).toHaveLength(places);
    expect(numbered[0]).toMatch(/^- 1 /);

    // The grid picture draws the whole sheet, its margin band included.
    const sheet = await page.evaluate(
      () => document.getElementById('tactileMapPanel').__forgeMapPanel.sheet
    );
    expect(sheet.marginMm).toBeGreaterThanOrEqual(10);
    const grid = await zip.file('plate_grid.svg').async('string');
    expect(grid).toContain(
      `<rect x="0" y="0" width="${sheet.w}" height="${sheet.h}"`
    );

    // Every key plate carries its row: on label tape, a channel at least.
    const keyLevels = names.filter((n) => /^levels_key(-\d+)?\.svg$/.test(n));
    expect(keyLevels).toHaveLength(sets);
    for (const name of keyLevels) {
      const svg = await zip.file(name).async('string');
      expect(svg, name).toMatch(/<g id="channels"><path d="[^"]+"\/><\/g>/);
    }
  });
});

