/**
 * The Tactile Map tile in the app: its panel above the controls, a preview
 * that renders, every plate rendered into one zip, and an axe scan of the
 * page.
 *
 * @license GPL-3.0-or-later
 */
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import JSZip from 'jszip';
import { parseSTL } from '../../scripts/parity/stl-stats.mjs';

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

async function openTactileMap(page) {
  await page.goto('/?example=tactile-map');
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#tactileMapPanel')).toBeVisible({
    timeout: 15000,
  });
  await dismissSavePrompt(page);
}

test.describe('Tactile Map tile', () => {
  test('the panel sits above the controls and names the plates', async ({
    page,
  }) => {
    await openTactileMap(page);
    await expect(page.locator('#tactileMapPanel h2')).toHaveText(
      'Tactile map plates'
    );
    await expect(page.locator('#tactileMapSummary')).toHaveText(
      '4 plates of 240 x 180 mm, A1 to B2.',
      { timeout: 10000 }
    );
    const radios = page.locator('#tactileMapPlates input[type="radio"]');
    await expect(radios).toHaveCount(5);
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

  test('the button renders the four plates and downloads them as one zip', async ({
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
    await page.locator('#tactileMapRenderAll').click();
    await expect(page.locator('#tactileMapRenderCancel')).toBeVisible();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('tactile_map_plates.zip');
    const zip = await JSZip.loadAsync(readFileSync(await download.path()));
    const names = Object.keys(zip.files).sort();
    expect(names.filter((name) => name.endsWith('.stl'))).toEqual([
      'tactile_map_A1.stl',
      'tactile_map_A2.stl',
      'tactile_map_B1.stl',
      'tactile_map_B2.stl',
    ]);
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
      'All 4 plates are in tactile_map_plates.zip.'
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
      '4 plates of 240 x 180 mm, A1 to B2.',
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
      '2 plates of 151 x 202 mm, A1 to A2.',
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
    const radios = page.locator('#tactileMapPlates input[type="radio"]');
    await expect(radios).toHaveCount(3);
  });

  test('the page with the panel passes an axe scan', async ({ page }) => {
    await openTactileMap(page);
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
      page.locator('.role-path-card[data-tutorial-target="braille-card"]')
    ).toBeVisible();
  });
});
