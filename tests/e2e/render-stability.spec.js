/**
 * Render stability E2E test suite — Phase 0.2 baseline
 *
 * Post-remediation regression safety net.
 * Verifies BUG-A/B/C/D fixes remain effective after parity remediation.
 * Assertions upgraded from baseline (soft) to post-fix (hard) 2026-03-12.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  selectPreset as selectPresetHelper,
  selectPresetByValue,
  getPresetOptions,
} from './helpers/preset-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Skip WASM-dependent tests in CI — WASM init is slow/unreliable
const isCI = !!process.env.CI;

test.describe.configure({ timeout: 180_000 });

/**
 * UF-25, and this is a documented gap rather than a repair.
 *
 * Four tests in this file (BUG-B's two Customizer Settings cases, BUG-C's
 * debounce case and the 2D-to-3D transition) drive a `generate` parameter:
 * they pick "Customizer settings" or "first layer for SVG/DXF file" from a
 * dropdown and check what the preview does. MEASURED: no example this suite
 * loads has such a parameter. `colored-box` has none, and the only fixtures
 * in the repository that do are tests/fixtures/keyguard-minimal and
 * keyguard-v75.
 *
 * So those four skip, and until now they skipped SILENTLY with a bare
 * test.skip() - which reads in a report as a deliberate exclusion rather than
 * as coverage that quietly stopped existing. They now carry this reason.
 *
 * The fix, when someone takes it: load the keyguard-minimal fixture as a ZIP
 * the way keyguard-workflow.spec.js does, and point these four at it. It was
 * not taken here because it puts a heavy keyguard render into a suite that is
 * otherwise about a small box, and that trade deserves its own measurement.
 */
const NO_GENERATE_PARAM =
  'no fixture in this suite has a `generate` parameter (see the note above)';

// ─── Shared helpers ────────────────────────────────────────────────────────────

/** Suppress first-visit modal before each test */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    // UF-25: #consolePanel is defaultHiddenInBasic and Simplified is the
    // default mode, so the console test clicked at a summary the mode
    // controller had hidden and timed out. This suite drives panels, so it
    // asks for Standard.
    localStorage.setItem(
      'openscad-forge-ui-mode',
      JSON.stringify({ mode: 'standard', lastCustomMode: 'standard' })
    );
  });
});

/**
 * Navigate to the colored-box example and wait for it to fully load.
 * Used as a parametric fixture for render stability tests.
 */
async function loadParametricExample(page) {
  await page.goto('/?example=colored-box');
  await page.locator('#mainInterface').waitFor({ state: 'visible', timeout: 40_000 });
  await page.waitForSelector('.param-control', { state: 'attached', timeout: 25_000 });
}

/**
 * Navigate to the simple-box example (no companion files, single preset).
 */
async function loadSimpleBoxExample(page) {
  await page.goto('/?example=simple-box');
  await page.locator('#mainInterface').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForSelector('.param-control', { state: 'attached', timeout: 20_000 });
}

/**
 * Read the current preview render stats from the visible stats text.
 * Returns { triangles, vertices } or null if no render has completed.
 */
async function getPreviewStats(page) {
  return page.evaluate(() => {
    const statsText = document.getElementById('stats')?.textContent || '';
    const trianglesMatch = statsText.match(/Triangles:\s*([\d,]+)/i);
    if (!trianglesMatch) return null;
    return {
      triangles: Number.parseInt(trianglesMatch[1].replace(/,/g, ''), 10),
    };
  });
}

/**
 * Detect whether the preview canvas currently contains rendered geometry.
 */
async function hasMesh(page) {
  // UF-9 established this and UF-25 needed it here: a readPixels taken
  // outside an animation frame reads a CLEARED drawing buffer, so a perfectly
  // rendered model reports no mesh. MEASURED before the fix: the preset-cycle
  // test logged `mesh=false, triangles=116` - the geometry was plainly there.
  // The nested double-rAF puts the read inside the frame that has just been
  // painted.
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const canvas = document.querySelector(
              '#viewer canvas, .preview-container canvas'
            );
            if (!canvas) return resolve(false);
            const ctx =
              canvas.getContext('webgl2') || canvas.getContext('webgl');
            if (!ctx) return resolve(false);
            const pixels = new Uint8Array(4);
            const x = Math.floor(canvas.width / 2);
            const y = Math.floor(canvas.height / 2);
            ctx.readPixels(x, y, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, pixels);
            resolve(pixels[3] > 0 && pixels[0] + pixels[1] + pixels[2] > 0);
          })
        );
      })
  );
}

/**
 * Wait until the preview state indicator shows a non-rendering, non-pending state.
 * Returns when the render completes or fails.
 */
async function waitForPreviewIdle(page, { timeout = 120_000 } = {}) {
  await page.waitForFunction(
    () => {
      const indicator = document.querySelector('.preview-state-indicator');
      if (!indicator) return false;
      const text = indicator.textContent || '';
      const cls = indicator.className || '';
      // Consider idle when NOT in rendering/pending state
      return (
        cls.includes('state-current') ||
        cls.includes('state-error') ||
        cls.includes('state-stale') ||
        cls.includes('state-idle') ||
        text.includes('Preview ready') ||
        text.includes('Preview failed') ||
        text.includes('2D Model') ||
        text.includes('No geometry') ||
        text.includes('Customizer')
      );
    },
    { timeout }
  );
}

// selectPreset imported from ./helpers/preset-helpers.js as selectPresetHelper

// ─── Test Suite 1: Preset Cycling ─────────────────────────────────────────────

test.describe('Render Stability — Preset Cycling (BUG-A post-fix)', () => {
  test('should complete a render for each of the first 5 presets', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI');

    await loadParametricExample(page);

    // Get the list of available presets
    const allPresets = await getPresetOptions(page);
    const nonEmpty = allPresets.filter(o => o.trim() !== '');
    test.skip(
      nonEmpty.length < 2,
      'this fixture offers fewer than two presets, so there is no cycle to test'
    );

    const numPresetsToTest = Math.min(nonEmpty.length, 5);
    const results = [];

    for (let i = 0; i < numPresetsToTest; i++) {
      const presetName = nonEmpty[i];

      // Select the preset
      await selectPresetHelper(page, presetName);
      console.log(`[PresetCycle] Selecting preset ${i + 1}/${numPresetsToTest}: ${presetName}`);

      // Wait for the render to complete or fail
      try {
        await waitForPreviewIdle(page, { timeout: 90_000 });
      } catch (e) {
        // presetValue was never defined here, so this handler threw a
        // ReferenceError of its own whenever a render timed out (UF-25).
        console.warn(`[PresetCycle] Preset ${presetName}: render did not complete in time`);
      }

      // Record whether a mesh is present
      const meshPresent = await hasMesh(page);
      const stats = await getPreviewStats(page);
      results.push({ preset: presetName, meshPresent, triangles: stats?.triangles ?? null });
      console.log(`[PresetCycle] Preset ${presetName}: mesh=${meshPresent}, triangles=${stats?.triangles ?? 'unknown'}`);
    }

    const successfulRenders = results.filter((r) => r.meshPresent === true);
    expect(successfulRenders.length).toBe(numPresetsToTest);

    // Log the full result set for debugging
    console.table(results);
  });

  test('should produce a non-empty 3D canvas on initial preset load', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI');

    await loadParametricExample(page);

    // Wait for initial render
    await waitForPreviewIdle(page, { timeout: 90_000 });

    // The initial preview state indicator should NOT show an error
    const indicator = page.locator('.preview-state-indicator');
    const indicatorText = await indicator.textContent();
    const indicatorClass = await indicator.getAttribute('class');

    console.log('[InitPreset] Indicator:', indicatorText, '| Class:', indicatorClass);

    const isErrorState = indicatorClass?.includes('state-error') && !indicatorText?.includes('2D');
    expect(isErrorState).toBe(false);
    expect(indicator).toBeVisible();
  });
});

// ─── Test Suite 2: Blank Display for Customizer Settings (BUG-B post-fix) ─────

test.describe('Render Stability — Customizer Settings Mode (BUG-B post-fix)', () => {
  test('should show informational state when generate = Customizer Settings', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI');

    await loadParametricExample(page);

    // Wait for initial render to complete
    await waitForPreviewIdle(page, { timeout: 90_000 });

    // Find the 'generate' parameter dropdown
    const generateParam = page
      .locator('.param-control')
      .filter({ hasText: /^generate/i });

    test.skip((await generateParam.count()) === 0, NO_GENERATE_PARAM);

    // Find the select element within the generate control
    const generateSelect = generateParam.locator('select').first();
    test.skip(!(await generateSelect.isVisible()), NO_GENERATE_PARAM);

    // Try to find a "Customizer Settings" option
    const customizerOption = generateSelect.locator('option').filter({ hasText: /customizer/i });
    test.skip((await customizerOption.count()) === 0, NO_GENERATE_PARAM);

    // Select the customizer option
    await generateSelect.selectOption({ label: /customizer/i });
    console.log('[BUG-B] Selected Customizer Settings in generate dropdown');

    // Wait for the controller to process the change
    await page.waitForTimeout(2000);

    // Check the preview state indicator
    const indicator = page.locator('.preview-state-indicator');
    const indicatorText = await indicator.textContent();
    const indicatorClass = await indicator.getAttribute('class');
    console.log('[BUG-B] Indicator after customizer select:', indicatorText, '|', indicatorClass);

    // Check if mesh is present
    const meshPresent = await hasMesh(page);
    console.log('[BUG-B] Mesh present after customizer select:', meshPresent);

    expect(meshPresent).toBe(false);

    expect(indicator).toBeVisible();
    expect(indicatorText?.toLowerCase()).toContain('no geometry');
  });

  test('should allow mesh to reappear after switching back to 3D mode', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI');

    await loadParametricExample(page);
    await waitForPreviewIdle(page, { timeout: 90_000 });

    const generateParam = page.locator('.param-control').filter({ hasText: /^generate/i });
    test.skip((await generateParam.count()) === 0, NO_GENERATE_PARAM);

    const generateSelect = generateParam.locator('select').first();
    const customizerOption = generateSelect.locator('option').filter({ hasText: /customizer/i });
    test.skip((await customizerOption.count()) === 0, NO_GENERATE_PARAM);

    // Switch to Customizer Settings
    await generateSelect.selectOption({ label: /customizer/i });
    await page.waitForTimeout(1500);

    // Switch back to 3D preview mode
    const threeDoption = generateSelect
      .locator('option')
      .filter({ hasText: /3D|preview/i })
      .first();
    test.skip((await threeDoption.count()) === 0, NO_GENERATE_PARAM);
    const threeDValue = await threeDoption.getAttribute('value');
    await generateSelect.selectOption({ value: threeDValue });
    console.log('[BUG-B] Switched back to 3D mode:', threeDValue);

    // Wait for render to restart
    await waitForPreviewIdle(page, { timeout: 90_000 });

    // Mesh should reappear
    const meshPresent = await hasMesh(page);
    console.log('[BUG-B] Mesh present after switching back to 3D:', meshPresent);

    expect(meshPresent).toBe(true);
    expect(page.locator('.preview-state-indicator')).toBeVisible();
  });
});

// ─── Test Suite 3: Console Panel — No Render Side Effects (BUG-C post-fix) ────

test.describe('Render Stability — Console Panel Interactions (BUG-C post-fix)', () => {
  test('expanding and collapsing console panel must not trigger a render', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI');

    const consoleMessages = [];
    page.on('console', (msg) => consoleMessages.push(msg.text()));

    await loadSimpleBoxExample(page);

    // Wait for initial render to stabilize
    await waitForPreviewIdle(page, { timeout: 60_000 });
    await page.waitForTimeout(1000);

    const renderCountBefore = consoleMessages.filter((message) =>
      message.includes('[Preview Performance]')
    ).length;
    console.log('[BUG-C] Render count before console interaction:', renderCountBefore);

    // Find and interact with the console panel
    const consolePanel = page.locator('#consolePanel');
    if (!(await consolePanel.isVisible())) {
      console.log('[BUG-C] Console panel not found by #consolePanel, trying summary');
    }

    // Try to expand console panel via its summary element
    const consoleSummary = page.locator('#consolePanel > summary, details#consolePanel > summary');
    if ((await consoleSummary.count()) > 0) {
      await consoleSummary.click();
      await page.waitForTimeout(500);
      await consoleSummary.click(); // collapse
      await page.waitForTimeout(500);
    }

    // Try console badge / expand button
    const consoleBadge = page.locator('#console-badge, button[aria-controls="consolePanel"]');
    if ((await consoleBadge.count()) > 0 && (await consoleBadge.first().isVisible())) {
      await consoleBadge.first().click();
      await page.waitForTimeout(500);
    }

    // Verify no new renders were triggered
    const renderCountAfter = consoleMessages.filter((message) =>
      message.includes('[Preview Performance]')
    ).length;
    console.log('[BUG-C] Render count after console interaction:', renderCountAfter);

    expect(renderCountAfter).toEqual(renderCountBefore);
  });

  test('switching to Customizer Settings cancels pending preview debounce', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI');

    const consoleMessages = [];
    page.on('console', (msg) => consoleMessages.push(msg.text()));

    await loadParametricExample(page);
    await waitForPreviewIdle(page, { timeout: 90_000 });

    const generateParam = page.locator('.param-control').filter({ hasText: /^generate/i });
    test.skip((await generateParam.count()) === 0, NO_GENERATE_PARAM);

    const generateSelect = generateParam.locator('select').first();
    const customizerOption = generateSelect.locator('option').filter({ hasText: /customizer/i });
    test.skip((await customizerOption.count()) === 0, NO_GENERATE_PARAM);

    const renderCountBefore = consoleMessages.filter((message) =>
      message.includes('[Preview Performance]')
    ).length;

    // Rapidly switch to customizer mode
    await generateSelect.selectOption({ label: /customizer/i });

    // Wait slightly past the default debounce window (typically 300–800 ms)
    await page.waitForTimeout(2000);

    // No new WASM render should have been dispatched (the debounce guard should cancel)
    const renderCountAfter = consoleMessages.filter((message) =>
      message.includes('[Preview Performance]')
    ).length;
    console.log('[BUG-C] Preview performance log count before/after customizer switch:', renderCountBefore, renderCountAfter);

    // Preview state should be informational, not rendering
    const indicator = page.locator('.preview-state-indicator');
    const indicatorClass = await indicator.getAttribute('class');
    const isRendering = indicatorClass?.includes('state-rendering');
    expect(renderCountAfter).toEqual(renderCountBefore);
    expect(isRendering).toBe(false);
    expect(indicator).toBeVisible();
  });
});

// ─── Test Suite 4: DXF Export (BUG-D baseline) ────────────────────────────────

test.describe('Render Stability — DXF Export (BUG-D post-fix)', () => {
  test('should export a non-empty, parseable DXF file from parametric example', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI');

    await loadParametricExample(page);
    await waitForPreviewIdle(page, { timeout: 90_000 });

    // A DXF is a 2D drawing, so this needs a model that can be asked for one.
    // UF-25: without that, the export produced nothing, the test waited out a
    // 120s download timeout and then RETURNED EARLY AND PASSED - two minutes
    // of wall clock to assert nothing at all.
    const generateParam = page.locator('.param-control').filter({ hasText: /^generate/i });
    test.skip((await generateParam.count()) === 0, NO_GENERATE_PARAM);

    const generateSelect = generateParam.locator('select').first();
    const firstLayerOption = generateSelect
      .locator('option')
      .filter({ hasText: /first layer|laser|2D/i })
      .first();
    test.skip((await firstLayerOption.count()) === 0, NO_GENERATE_PARAM);
    await generateSelect.selectOption({
      value: await firstLayerOption.getAttribute('value'),
    });
    await page.waitForTimeout(500);

    // Select DXF output format
    const outputFormatSelect = page.locator('#outputFormat');
    await expect(outputFormatSelect).toBeVisible();
    await outputFormatSelect.selectOption('dxf');
    await page.waitForTimeout(500);

    // Click the Generate button
    // UF-25: this union used to resolve first() to #classicTbRenderBtn, the
    // Classic toolbar's Render button, which is not rendered in Forge.
    const generateBtn = page.locator('#primaryActionBtn');
    await expect(generateBtn).toBeEnabled();

    // Listen for download. If it never arrives, that IS the failure: the
    // guard this test exists for is the CONTENT of the file.
    const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
    await generateBtn.click();

    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath, 'DXF export produced no file').toBeTruthy();
    const dxfContent = fs.readFileSync(downloadPath, 'utf-8');

    console.log('[BUG-D] DXF file size:', dxfContent.length, 'bytes');

    // Baseline DXF structure checks
    expect(dxfContent.length).toBeGreaterThan(0);

    // Must contain DXF section markers
    expect(dxfContent).toContain('SECTION');
    expect(dxfContent).toContain('ENDSEC');

    // Must contain ENTITIES section
    expect(dxfContent).toContain('ENTITIES');

    // Count LINE entities (LWPOLYLINE should have been converted by postProcessDXF)
    const lineCount = (dxfContent.match(/^LINE$/gm) || []).length;
    const lwpolylineCount = (dxfContent.match(/^LWPOLYLINE$/gm) || []).length;
    console.log(`[BUG-D] LINE entities: ${lineCount}, LWPOLYLINE entities: ${lwpolylineCount}`);

    expect(lwpolylineCount).toBe(0);

    // Must not be a binary blob
    const nonPrintable = dxfContent.split('').filter(
      (c) => c.charCodeAt(0) < 9 || (c.charCodeAt(0) > 13 && c.charCodeAt(0) < 32)
    ).length;
    expect(nonPrintable).toBe(0);
  });

  /*
   * Q-55(ii) (owner, 2026-08-15): the 'DXF postProcessDXF converts LWPOLYLINE
   * entities to LINE' case was REMOVED here. It built a 40-line DXF fixture,
   * called window.__postProcessDXF, found it undefined - its own comment said
   * "this is expected; the function lives in the worker" - and then returned
   * and passed. It could never assert anything.
   *
   * The behaviour it named is genuinely covered: tests/unit/dxf-postprocess.test.js
   * imports postProcessDXF from src/worker/dxf-postprocess.js and tests the
   * LWPOLYLINE-to-LINE conversion for real, in the unit suite, on every run.
   */
});

// ─── Test Suite: 2D/3D Preview Transitions ──────────────────────────────────

test.describe('Render Stability — 2D/3D Preview Transitions', () => {
  test('SVG panel is hidden and 3D canvas visible after switching from 2D to 3D mode', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI');

    await loadParametricExample(page);
    await waitForPreviewIdle(page, { timeout: 90_000 });

    // Find the generate parameter dropdown. UF-25: a bare `select` resolved
    // first() to #charmVariantSelect on the welcome screen, which is not
    // visible once a project is open. Use the same idiom as the tests above.
    const generateParam = page
      .locator('.param-control')
      .filter({ hasText: /^generate/i });
    const generateSelect = generateParam.locator('select').first();
    const options = await generateSelect.locator('option').allTextContents();

    // Look for a 2D option (SVG/DXF/first layer)
    const svgOption = options.find(
      (o) => /svg|dxf|first layer/i.test(o)
    );
    test.skip(!svgOption, NO_GENERATE_PARAM);

    // Switch to 2D mode
    await generateSelect.selectOption({ label: svgOption });
    await waitForPreviewIdle(page, { timeout: 90_000 });

    // Now switch back to a 3D option
    const threeDOption = options.find(
      (o) => /3d|stl|printed/i.test(o)
    );
    test.skip(!threeDOption, NO_GENERATE_PARAM);

    await generateSelect.selectOption({ label: threeDOption });
    await waitForPreviewIdle(page, { timeout: 90_000 });

    // Assert: #rendered2dPreview should be hidden
    const svgPanel = page.locator('#rendered2dPreview');
    if (await svgPanel.count() > 0) {
      await expect(svgPanel).toHaveClass(/hidden/);
    }

    // Assert: 3D canvas should be visible
    const canvas = page.locator('#viewer canvas, .preview-container canvas');
    if (await canvas.count() > 0) {
      const display = await canvas.evaluate((el) => el.style.display);
      expect(display).not.toBe('none');
    }
  });

  test('SVG panel is hidden after loading a new file', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI');

    await loadSimpleBoxExample(page);
    await waitForPreviewIdle(page, { timeout: 90_000 });

    // If a 2D preview was active (unlikely for simple-box, but tests the flow),
    // loading a new file should clear it via clear() -> hide2DPreview()
    const svgPanel = page.locator('#rendered2dPreview');
    if (await svgPanel.count() > 0) {
      await expect(svgPanel).toHaveClass(/hidden/);
    }

    // 3D canvas should be visible
    const canvas = page.locator('#viewer canvas, .preview-container canvas');
    if (await canvas.count() > 0) {
      const display = await canvas.evaluate((el) => el.style.display);
      expect(display).not.toBe('none');
    }
  });
});
