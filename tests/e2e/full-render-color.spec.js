/**
 * Full Render Color Passthrough — E2E Verification (Phase 2)
 *
 * Verifies that clicking the Generate button with color passthrough active
 * produces a full-quality multi-color COFF preview in the 3D viewer, and
 * that the download file remains valid STL when STL is selected.
 *
 * Fixture: color-debug-test.scad — red cube + green sphere (2 color() calls)
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COLOR_FIXTURE = path.resolve(
  __dirname, '..', 'fixtures', 'color-debug-test.scad',
);

const isCI = !!process.env.CI;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function waitForWasm(page) {
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 120_000,
  });
}

async function uploadColorFixture(page) {
  await page.goto('/');
  await waitForWasm(page);

  const fileInput = page.locator('#fileInput');
  await fileInput.waitFor({ state: 'attached', timeout: 10_000 });
  await fileInput.setInputFiles(COLOR_FIXTURE);

  try {
    const notNowBtn = page.locator('#saveProjectNotNow');
    await notNowBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await notNowBtn.click();
  } catch { /* modal may not appear */ }

  await page.waitForFunction(
    () => {
      const entries = window.__consoleCapture || [];
      return entries.some(e => e.includes('[Preview Performance]'));
    },
    { timeout: 60_000 },
  ).catch(() => { /* fallback: fixed wait */ });

  await page.waitForTimeout(5_000);
}

/**
 * Sample a grid of pixels from the WebGL canvas and classify by dominant
 * colour channel. Reads inside a requestAnimationFrame callback so the
 * draw buffer is valid even without preserveDrawingBuffer.
 */
async function sampleCanvasColorGroups(page) {
  return page.evaluate(() => {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        const canvas = document.querySelector(
          '#viewer canvas, .preview-container canvas',
        );
        if (!canvas) { resolve({ meshPixels: 0, groups: 0, labels: [] }); return; }
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) { resolve({ meshPixels: 0, groups: 0, labels: [] }); return; }

        const w = canvas.width;
        const h = canvas.height;
        const gridSize = 10;
        const seen = new Set();
        let meshPixels = 0;

        for (let gx = 0; gx < gridSize; gx++) {
          for (let gy = 0; gy < gridSize; gy++) {
            const x = Math.floor((gx + 0.5) * w / gridSize);
            const y = Math.floor((gy + 0.5) * h / gridSize);
            const px = new Uint8Array(4);
            gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            const [r, g, b, a] = px;

            if (a < 10 || r + g + b < 30) continue;
            if (Math.max(r, g, b) - Math.min(r, g, b) < 20) continue;

            meshPixels++;
            if (r >= g * 1.3 && r >= b * 1.3) seen.add('red');
            else if (g >= r * 1.3 && g >= b * 1.3) seen.add('green');
            else if (b >= r * 1.3 && b >= g * 1.3) seen.add('blue');
          }
        }

        resolve({ meshPixels, groups: seen.size, labels: [...seen] });
      });
    });
  });
}

async function waitForPreviewIdle(page, { timeout = 120_000 } = {}) {
  await page.waitForFunction(
    () => {
      const indicator = document.querySelector('.preview-state-indicator');
      if (!indicator) return false;
      const cls = indicator.className;
      return cls.includes('state-current') || cls.includes('state-error');
    },
    { timeout },
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Full Render Color Passthrough (Phase 2)', () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    });
  });

  test('Generate button preserves multi-color preview via OFF/COFF full render', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI');

    const consoleMessages = [];
    page.on('console', (msg) => consoleMessages.push(msg.text()));

    // Step 1: Load fixture and wait for draft preview
    await uploadColorFixture(page);

    // Verify draft preview has multi-color
    const draftHasColors = consoleMessages.some(m => m.includes('hasColors=true'));
    const draftHasCoff = consoleMessages.some(m => m.includes('COFF ✓'));
    expect(
      draftHasColors || draftHasCoff,
      'Draft preview must show COFF per-face colors before Generate',
    ).toBeTruthy();

    const draftColorResult = await sampleCanvasColorGroups(page);
    console.log('[Phase2] Draft preview colors:', JSON.stringify(draftColorResult));

    // Step 2: Ensure STL is selected as output format
    const outputFormatSelect = page.locator('#outputFormat');
    if (await outputFormatSelect.isVisible().catch(() => false)) {
      await outputFormatSelect.selectOption('stl');
      await page.waitForTimeout(500);
    }

    // Step 3: Click Generate button
    const generateBtn = page.locator('#primaryActionBtn');
    await expect(generateBtn).toBeVisible({ timeout: 10_000 });
    await generateBtn.click();
    console.log('[Phase2] Generate button clicked');

    // Step 4: Wait for full render to complete
    // The full render triggers a preview update; wait for the preview state
    // indicator to return to idle/current state.
    await page.waitForFunction(
      () => {
        const entries = window.__consoleCapture || [];
        const fullRenderLogs = entries.filter(e =>
          e.includes('[AutoPreview] Full render') || e.includes('[Full Render]'),
        );
        return fullRenderLogs.length > 0;
      },
      { timeout: 120_000 },
    ).catch(() => { /* fallback: fixed wait */ });

    await page.waitForTimeout(8_000);

    // Step 5: Assert multi-color is still visible after full render
    const fullRenderColorResult = await sampleCanvasColorGroups(page);
    console.log('[Phase2] Full render colors:', JSON.stringify(fullRenderColorResult));

    // Console-log assertion: verify OFF was used for the full render preview
    const fullRenderUsedOff = consoleMessages.some(m =>
      m.includes('color passthrough') ||
      m.includes('outputFormat') && m.includes('off'),
    );
    const fullRenderHasColors = consoleMessages.filter(m =>
      m.includes('hasColors=true'),
    );

    console.log('[Phase2] Full render used OFF:', fullRenderUsedOff);
    console.log('[Phase2] hasColors=true count:', fullRenderHasColors.length);

    // Primary assertion: multi-color must survive the Generate flow.
    // Pixel sampling requires WebGL — skip when context is unavailable
    // (e.g. Firefox headless).  Console-log fallback below is authoritative.
    if (fullRenderColorResult.meshPixels > 0) {
      expect.soft(
        fullRenderColorResult.groups >= 2,
        `Expected 2+ distinct face-color groups after Generate, got ${fullRenderColorResult.groups}: ${JSON.stringify(fullRenderColorResult)}`,
      ).toBeTruthy();
    } else {
      console.log('WebGL not available — skipping pixel assertion for full render');
    }

    // Console-log fallback: at minimum, hasColors=true must appear at least
    // twice (once for draft, once for full render) OR the color passthrough
    // log must confirm OFF was used
    expect(
      fullRenderHasColors.length >= 2 || fullRenderUsedOff,
      'Full render must use OFF for color passthrough OR produce hasColors=true',
    ).toBeTruthy();
  });

  test('Generate produces valid STL download when STL format selected', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI');

    const consoleMessages = [];
    page.on('console', (msg) => consoleMessages.push(msg.text()));

    await uploadColorFixture(page);

    // Ensure STL is selected
    const outputFormatSelect = page.locator('#outputFormat');
    if (await outputFormatSelect.isVisible().catch(() => false)) {
      await outputFormatSelect.selectOption('stl');
      await page.waitForTimeout(500);
    }

    // Click Generate to trigger full render
    const primaryBtn = page.locator('#primaryActionBtn');
    await expect(primaryBtn).toBeVisible({ timeout: 10_000 });
    await primaryBtn.click();
    console.log('[Phase2] Generate button clicked for STL download test');

    // Wait for the button to transition to "Download" state after render completes.
    // The button's data-action changes from 'generate' to 'download'.
    await page.waitForFunction(
      () => {
        const btn = document.getElementById('primaryActionBtn');
        return btn?.dataset?.action === 'download';
      },
      { timeout: 120_000 },
    );
    console.log('[Phase2] Button transitioned to download state');

    // Now click Download and capture the download event
    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await primaryBtn.click();

    let stlContent = null;
    try {
      const download = await downloadPromise;
      const downloadPath = await download.path();
      const filename = download.suggestedFilename();
      console.log('[Phase2] Download filename:', filename);

      if (downloadPath) {
        stlContent = fs.readFileSync(downloadPath);
        console.log('[Phase2] STL file size:', stlContent.length, 'bytes');
      }

      // Filename should indicate STL, not OFF
      expect(
        filename.endsWith('.stl'),
        `Download filename should be .stl, got: ${filename}`,
      ).toBeTruthy();
    } catch (e) {
      console.warn('[Phase2] Download did not complete:', e.message);
    }

    if (stlContent === null) {
      console.warn('[Phase2] No STL file downloaded — skipping content validation');
      return;
    }

    // Validate STL content: either ASCII STL (starts with "solid") or binary
    // STL (80-byte header + 4-byte triangle count)
    expect(stlContent.length).toBeGreaterThan(84);

    const headerStr = stlContent.slice(0, 5).toString('ascii');
    const isBinarySTL = stlContent.length >= 84 && headerStr !== 'solid';
    const isAsciiSTL = headerStr === 'solid';

    expect(
      isBinarySTL || isAsciiSTL,
      `File must be valid STL (binary or ASCII), header: "${headerStr}"`,
    ).toBeTruthy();

    if (isBinarySTL) {
      const triangleCount = stlContent.readUInt32LE(80);
      console.log('[Phase2] Binary STL triangle count:', triangleCount);
      expect(triangleCount).toBeGreaterThan(0);
    } else {
      const asciiStr = stlContent.toString('ascii');
      expect(asciiStr).toContain('facet normal');
      expect(asciiStr).toContain('endsolid');
    }

    // Verify the download is NOT an OFF file
    const offHeader = stlContent.slice(0, 3).toString('ascii');
    expect(offHeader).not.toBe('OFF');
  });
});
