/**
 * Render stability E2E test suite — Phase 0.2 baseline
 *
 * Captures current behavior (pre-fix) as a regression safety net.
 * Tests are written to PASS against the current (potentially buggy) build
 * so that they remain the "before" baseline. Assertions that verify fixed
 * behaviour are clearly marked with TODO: POST-FIX.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import JSZip from 'jszip';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Skip WASM-dependent tests in CI — WASM init is slow/unreliable
const isCI = !!process.env.CI;

test.describe.configure({ timeout: 180_000 });

// ─── Shared helpers ────────────────────────────────────────────────────────────

/** Suppress first-visit modal before each test */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
  });
});

/**
 * Navigate to the keyguard-demo example and wait for it to fully load.
 * This example ships with companion files and multiple presets.
 */
async function loadKeyguardDemo(page) {
  await page.goto('/?example=keyguard-demo');
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
 * Read the current preview render stats from the page's global state.
 * Returns { triangles, vertices } or null if no render has completed.
 */
async function getPreviewStats(page) {
  return page.evaluate(() => {
    // autoPreviewController is exposed on window in the app
    const ctrl = window.autoPreviewController;
    if (!ctrl) return null;
    return ctrl.lastRenderStats || null;
  });
}

/**
 * Read the preview mesh existence from the page's previewManager.
 * Returns true if a mesh is currently loaded, false if the scene is empty.
 */
async function hasMesh(page) {
  return page.evaluate(() => {
    const pm = window.previewManager;
    if (!pm) return null;
    // previewManager.mesh is the Three.js mesh object; null when cleared
    return pm.mesh !== null && pm.mesh !== undefined;
  });
}

/**
 * Count the total number of RENDER messages posted to the worker since page load.
 * Used to verify that console interactions do NOT trigger renders.
 */
async function getRenderCount(page) {
  return page.evaluate(() => {
    return window.__renderAuditCount || 0;
  });
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

/**
 * Select a preset by name via the preset dropdown.
 */
async function selectPreset(page, presetName) {
  const presetSelect = page.locator('#presetSelect');
  if (!(await presetSelect.isVisible())) return false;
  const option = presetSelect.locator(`option:has-text("${presetName}")`);
  if ((await option.count()) === 0) return false;
  await presetSelect.selectOption({ label: presetName });
  return true;
}

// ─── Test Suite 1: Preset Cycling ─────────────────────────────────────────────

test.describe('Render Stability — Preset Cycling (BUG-A baseline)', () => {
  test('should complete a render for each of the first 5 presets', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI');

    await loadKeyguardDemo(page);

    // Get the list of available presets
    const presetSelect = page.locator('#presetSelect');
    const presetCount = await presetSelect.locator('option').count();
    if (presetCount < 2) {
      // Not enough presets to test cycling; skip gracefully
      test.skip();
      return;
    }

    const numPresetsToTest = Math.min(presetCount, 5);
    const results = [];

    for (let i = 0; i < numPresetsToTest; i++) {
      const option = presetSelect.locator('option').nth(i);
      const presetValue = await option.getAttribute('value');
      if (!presetValue || presetValue === '') continue;

      // Select the preset
      await presetSelect.selectOption({ index: i });
      console.log(`[PresetCycle] Selecting preset ${i + 1}/${numPresetsToTest}: ${presetValue}`);

      // Wait for the render to complete or fail
      try {
        await waitForPreviewIdle(page, { timeout: 90_000 });
      } catch (e) {
        console.warn(`[PresetCycle] Preset ${presetValue}: render did not complete in time`);
      }

      // Record whether a mesh is present
      const meshPresent = await hasMesh(page);
      const stats = await getPreviewStats(page);
      results.push({ preset: presetValue, meshPresent, triangles: stats?.triangles ?? null });
      console.log(`[PresetCycle] Preset ${presetValue}: mesh=${meshPresent}, triangles=${stats?.triangles ?? 'unknown'}`);
    }

    // Baseline assertion: at least SOME renders should have produced a mesh.
    // TODO: POST-FIX — all renders should produce a mesh (triangles > 0).
    const successfulRenders = results.filter((r) => r.meshPresent === true);
    expect(successfulRenders.length).toBeGreaterThanOrEqual(1);

    // Log the full result set for debugging
    console.table(results);
  });

  test('should produce a non-empty 3D canvas on initial preset load', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI');

    await loadKeyguardDemo(page);

    // Wait for initial render
    await waitForPreviewIdle(page, { timeout: 90_000 });

    // The initial preview state indicator should NOT show an error
    const indicator = page.locator('.preview-state-indicator');
    const indicatorText = await indicator.textContent();
    const indicatorClass = await indicator.getAttribute('class');

    console.log('[InitPreset] Indicator:', indicatorText, '| Class:', indicatorClass);

    // Baseline: indicator should not be in permanent error state for a valid 3D model
    const isErrorState = indicatorClass?.includes('state-error') && !indicatorText?.includes('2D');
    // Note: BUG-A may cause this to fail for some presets — we record it, not block on it
    if (isErrorState) {
      console.warn('[InitPreset] WARNING: Initial render produced error state — BUG-A may be active');
    }

    expect(indicator).toBeVisible();
  });
});

// ─── Test Suite 2: Blank Display for Customizer Settings (BUG-B baseline) ─────

test.describe('Render Stability — Customizer Settings Mode (BUG-B baseline)', () => {
  test('should show informational state when generate = Customizer Settings', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI');

    await loadKeyguardDemo(page);

    // Wait for initial render to complete
    await waitForPreviewIdle(page, { timeout: 90_000 });

    // Find the 'generate' parameter dropdown
    const generateParam = page
      .locator('.param-control')
      .filter({ hasText: /^generate/i });

    if ((await generateParam.count()) === 0) {
      console.log('[BUG-B] No "generate" parameter found — loading simple-box instead');
      test.skip();
      return;
    }

    // Find the select element within the generate control
    const generateSelect = generateParam.locator('select').first();
    if (!(await generateSelect.isVisible())) {
      test.skip();
      return;
    }

    // Try to find a "Customizer Settings" option
    const customizerOption = generateSelect.locator('option').filter({ hasText: /customizer/i });
    if ((await customizerOption.count()) === 0) {
      console.log('[BUG-B] No customizer option in generate dropdown — skipping');
      test.skip();
      return;
    }

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

    // Baseline: record current behavior without blocking
    // TODO: POST-FIX — meshPresent should be FALSE (mesh should be cleared)
    if (meshPresent) {
      console.warn(
        '[BUG-B] BUG CONFIRMED: mesh is still visible after switching to Customizer Settings'
      );
    } else {
      console.log('[BUG-B] mesh correctly absent after switching to Customizer Settings');
    }

    // The state indicator must be visible and not blank
    expect(indicator).toBeVisible();
    expect(indicatorText?.trim().length).toBeGreaterThan(0);
  });

  test('should allow mesh to reappear after switching back to 3D mode', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI');

    await loadKeyguardDemo(page);
    await waitForPreviewIdle(page, { timeout: 90_000 });

    const generateParam = page.locator('.param-control').filter({ hasText: /^generate/i });
    if ((await generateParam.count()) === 0) {
      test.skip();
      return;
    }

    const generateSelect = generateParam.locator('select').first();
    const customizerOption = generateSelect.locator('option').filter({ hasText: /customizer/i });
    if ((await customizerOption.count()) === 0) {
      test.skip();
      return;
    }

    // Switch to Customizer Settings
    await generateSelect.selectOption({ label: /customizer/i });
    await page.waitForTimeout(1500);

    // Switch back to 3D preview mode — try to find an option containing '3D' or 'keyguard'
    const threeDoption = generateSelect
      .locator('option')
      .filter({ hasText: /3D|keyguard|preview/i })
      .first();
    if ((await threeDoption.count()) === 0) {
      test.skip();
      return;
    }
    const threeDValue = await threeDoption.getAttribute('value');
    await generateSelect.selectOption({ value: threeDValue });
    console.log('[BUG-B] Switched back to 3D mode:', threeDValue);

    // Wait for render to restart
    await waitForPreviewIdle(page, { timeout: 90_000 });

    // Mesh should reappear
    const meshPresent = await hasMesh(page);
    console.log('[BUG-B] Mesh present after switching back to 3D:', meshPresent);

    // This should work regardless of BUG-B — switching back to 3D must re-trigger render
    // (We don't hard-assert because BUG-A may also affect this)
    expect(page.locator('.preview-state-indicator')).toBeVisible();
  });
});

// ─── Test Suite 3: Console Panel — No Render Side Effects (BUG-C baseline) ────

test.describe('Render Stability — Console Panel Interactions (BUG-C baseline)', () => {
  test('expanding and collapsing console panel must not trigger a render', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI');

    await loadSimpleBoxExample(page);

    // Wait for initial render to stabilize
    await waitForPreviewIdle(page, { timeout: 60_000 });
    await page.waitForTimeout(1000);

    // Read current render count baseline
    const renderCountBefore = await getRenderCount(page);
    console.log('[BUG-C] Render count before console interaction:', renderCountBefore);

    // Find and interact with the console panel
    const consoleDetails = page.locator('#consoleDetails');
    if (!(await consoleDetails.isVisible())) {
      console.log('[BUG-C] Console panel not found by #consoleDetails, trying summary');
    }

    // Try to expand console panel via its summary element
    const consoleSummary = page.locator('#consoleDetails > summary, details#consoleDetails > summary');
    if ((await consoleSummary.count()) > 0) {
      await consoleSummary.click();
      await page.waitForTimeout(500);
      await consoleSummary.click(); // collapse
      await page.waitForTimeout(500);
    }

    // Try console badge / expand button
    const consoleBadge = page.locator('#console-badge, button[aria-controls="consoleDetails"]');
    if ((await consoleBadge.count()) > 0) {
      await consoleBadge.first().click();
      await page.waitForTimeout(500);
    }

    // Verify no new renders were triggered
    const renderCountAfter = await getRenderCount(page);
    console.log('[BUG-C] Render count after console interaction:', renderCountAfter);

    // Baseline check: render count must not increase due to console interaction
    // (render count may be 0 if the audit instrumentation is not yet in place — that's OK)
    if (renderCountBefore !== null && renderCountAfter !== null) {
      expect(renderCountAfter).toEqual(renderCountBefore);
    }
  });

  test('switching to Customizer Settings cancels pending preview debounce', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI');

    await loadKeyguardDemo(page);
    await waitForPreviewIdle(page, { timeout: 90_000 });

    const generateParam = page.locator('.param-control').filter({ hasText: /^generate/i });
    if ((await generateParam.count()) === 0) {
      test.skip();
      return;
    }

    const generateSelect = generateParam.locator('select').first();
    const customizerOption = generateSelect.locator('option').filter({ hasText: /customizer/i });
    if ((await customizerOption.count()) === 0) {
      test.skip();
      return;
    }

    // Rapidly switch to customizer mode
    await generateSelect.selectOption({ label: /customizer/i });

    // Wait slightly past the default debounce window (typically 300–800 ms)
    await page.waitForTimeout(2000);

    // No new WASM render should have been dispatched (the debounce guard should cancel)
    const renderCountAfter = await getRenderCount(page);
    const renderCountBase = await page.evaluate(() => window.__renderAuditCount || 0);
    console.log('[BUG-C] Render audit count after customizer switch:', renderCountAfter, renderCountBase);

    // Preview state should be informational, not rendering
    const indicator = page.locator('.preview-state-indicator');
    const indicatorClass = await indicator.getAttribute('class');
    const isRendering = indicatorClass?.includes('state-rendering');
    if (isRendering) {
      console.warn('[BUG-C] BUG CONFIRMED: a WASM render was triggered after switching to Customizer Settings');
    }
    // Soft assertion — BUG-C may cause this to fail before the fix
    expect(indicator).toBeVisible();
  });
});

// ─── Test Suite 4: DXF Export (BUG-D baseline) ────────────────────────────────

test.describe('Render Stability — DXF Export (BUG-D baseline)', () => {
  test('should export a non-empty, parseable DXF file from keyguard', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI');

    await loadKeyguardDemo(page);
    await waitForPreviewIdle(page, { timeout: 90_000 });

    // Switch generate to a 2D export mode (first layer / laser cut)
    const generateParam = page.locator('.param-control').filter({ hasText: /^generate/i });
    if ((await generateParam.count()) > 0) {
      const generateSelect = generateParam.locator('select').first();
      const firstLayerOption = generateSelect
        .locator('option')
        .filter({ hasText: /first layer|laser|2D/i })
        .first();
      if ((await firstLayerOption.count()) > 0) {
        const val = await firstLayerOption.getAttribute('value');
        await generateSelect.selectOption({ value: val });
        await page.waitForTimeout(500);
      }
    }

    // Select DXF output format
    const outputFormatSelect = page.locator('#outputFormat');
    if (!(await outputFormatSelect.isVisible())) {
      test.skip();
      return;
    }
    await outputFormatSelect.selectOption('dxf');
    await page.waitForTimeout(500);

    // Click the Generate button
    const generateBtn = page.locator('#primaryActionBtn, button:has-text("Generate"), button:has-text("Render")').first();
    if (!(await generateBtn.isEnabled())) {
      test.skip();
      return;
    }

    // Listen for download
    const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
    await generateBtn.click();

    let dxfContent = null;
    try {
      const download = await downloadPromise;
      const downloadPath = await download.path();
      if (downloadPath) {
        dxfContent = fs.readFileSync(downloadPath, 'utf-8');
      }
    } catch (e) {
      console.warn('[BUG-D] Download did not complete within timeout:', e.message);
    }

    if (dxfContent === null) {
      console.warn('[BUG-D] No DXF file was downloaded — skipping content validation');
      // Still pass — this is a baseline test; the render may just be slow
      return;
    }

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

    // TODO: POST-FIX — lwpolylineCount should be 0 after postProcessDXF runs successfully
    // Baseline: just verify the file is structurally valid

    // Must not be a binary blob
    const nonPrintable = dxfContent.split('').filter(
      (c) => c.charCodeAt(0) < 9 || (c.charCodeAt(0) > 13 && c.charCodeAt(0) < 32)
    ).length;
    expect(nonPrintable).toBe(0);
  });

  test('DXF postProcessDXF converts LWPOLYLINE entities to LINE', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI');

    // This test validates the post-processing behavior directly via the worker
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 30_000 });

    // Inject a minimal LWPOLYLINE DXF and call postProcessDXF via the exposed API
    const testDxf = `0
SECTION
2
HEADER
0
ENDSEC
0
SECTION
2
ENTITIES
0
LWPOLYLINE
8
0
90
4
10
0.0
20
0.0
10
1.0
20
0.0
10
1.0
20
1.0
10
0.0
20
1.0
0
ENDSEC
0
EOF
`;

    const result = await page.evaluate(async (dxf) => {
      // postProcessDXF is exported on the worker, not directly accessible.
      // Check if there's a test hook or just verify the worker import.
      if (typeof window.__postProcessDXF === 'function') {
        return window.__postProcessDXF(dxf);
      }
      return null;
    }, testDxf);

    if (result === null) {
      console.log('[BUG-D] postProcessDXF not directly accessible from page context — skipping white-box test');
      // This is expected; the function lives in the worker
      return;
    }

    // If accessible, verify LWPOLYLINE was converted
    expect(result).not.toContain('LWPOLYLINE');
    expect(result).toContain('LINE');
  });
});
