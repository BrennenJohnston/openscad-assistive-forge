/**
 * COFF Color Probe — E2E Runtime Verification
 *
 * Verifies that the WASM binary emits per-face color data in OFF output,
 * that the parser detects it, and that multi-color rendering produces 2+
 * distinct face-color groups. Also tests color override toggle behaviour
 * with multi-color meshes.
 *
 * Fixture: color-debug-test.scad — red cube + green sphere (2 color() calls)
 * Companion to: docs/audit/parity-probe-results.md
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COLOR_FIXTURE = path.resolve(
  __dirname, '..', 'fixtures', 'color-debug-test.scad'
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function uploadColorFixture(page) {
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 90_000,
  });

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

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('COFF Color Probe', () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    });
  });

  test('WASM emits per-face colors with 2+ distinct face-color groups', async ({ page }) => {
    const consoleMessages = [];
    page.on('console', (msg) => consoleMessages.push(msg.text()));

    await uploadColorFixture(page);

    const relevantLogs = consoleMessages.filter(m =>
      m.includes('[Preview]') || m.includes('[Worker]') ||
      m.includes('[Preview Performance]'),
    );
    console.log('=== COFF Probe Console Capture ===');
    for (const log of relevantLogs) console.log(log);
    console.log('=== End Capture ===');

    const previewLoadLog = consoleMessages.find(m =>
      m.includes('[Preview] OFF loaded') || m.includes('[Preview] Loading'),
    );
    const perfLog = consoleMessages.find(m =>
      m.includes('[Preview Performance]'),
    );
    expect(previewLoadLog || perfLog, 'Render output must appear').toBeTruthy();

    // Console-log assertion: hasColors=true OR COFF ✓
    const hasColorsTrue = consoleMessages.some(m => m.includes('hasColors=true'));
    const hasCoffCheck = consoleMessages.some(m => m.includes('COFF ✓'));

    expect(
      hasColorsTrue || hasCoffCheck,
      'WASM must emit per-face RGBA in OFF output (COFF)',
    ).toBeTruthy();

    // Pixel-based multi-color assertion — only meaningful when WebGL is
    // available.  Firefox headless lacks a WebGL context, so the sampler
    // returns meshPixels=0; asserting on that would be a false negative.
    // Console-log assertions above are the authoritative check.
    const colorResult = await sampleCanvasColorGroups(page);
    console.log('Multi-color pixel sample:', JSON.stringify(colorResult));

    if (colorResult.meshPixels > 0) {
      expect.soft(
        colorResult.groups >= 2,
        `Expected 2+ distinct face-color groups, got ${colorResult.groups}: ${JSON.stringify(colorResult)}`,
      ).toBeTruthy();
    } else {
      console.log('WebGL not available or canvas empty — skipping pixel assertion');
    }
  });

  test('color override toggle switches between multi-color and solid', async ({ page }) => {
    const consoleMessages = [];
    page.on('console', (msg) => consoleMessages.push(msg.text()));

    await uploadColorFixture(page);

    // Baseline: multi-color must be active
    const hasColorsTrue = consoleMessages.some(m => m.includes('hasColors=true'));
    expect(hasColorsTrue, 'Baseline: hasColors=true must appear').toBeTruthy();

    const baselineColors = await sampleCanvasColorGroups(page);
    console.log('Before override:', JSON.stringify(baselineColors));

    // Pixel assertions require WebGL — Firefox headless has no context.
    // When meshPixels=0 we still exercise the toggle UI but skip pixel checks.
    const hasWebGL = baselineColors.meshPixels > 0;
    if (!hasWebGL) {
      console.log('WebGL not available — validating toggle UI only');
    }

    // Open preview settings drawer if collapsed
    const drawerToggle = page.locator('#previewDrawerToggle');
    if ((await drawerToggle.count()) > 0) {
      const expanded = await drawerToggle.getAttribute('aria-expanded');
      if (expanded !== 'true') {
        await drawerToggle.click();
        await page.waitForTimeout(500);
      }
    }

    const colorToggle = page.locator('#modelColorEnabled');
    const colorPicker = page.locator('#modelColorPicker');
    await expect(colorToggle).toBeAttached({ timeout: 5_000 });

    // Set override to pure blue so the solid colour is clearly saturated
    await colorPicker.evaluate((el) => {
      el.value = '#0000ff';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Enable override — mesh should switch to solid blue
    await colorToggle.check();
    await colorToggle.dispatchEvent('change');
    await page.waitForTimeout(1_500);

    const overrideColors = await sampleCanvasColorGroups(page);
    console.log('During override:', JSON.stringify(overrideColors));

    if (hasWebGL) {
      expect.soft(
        overrideColors.groups <= 1,
        `Expected ≤1 colour group with override, got ${overrideColors.groups}: ${JSON.stringify(overrideColors)}`,
      ).toBeTruthy();
    }

    // Disable override — multi-color should be restored
    await colorToggle.uncheck();
    await colorToggle.dispatchEvent('change');
    await page.waitForTimeout(1_500);

    const restoredColors = await sampleCanvasColorGroups(page);
    console.log('After restore:', JSON.stringify(restoredColors));

    if (hasWebGL) {
      expect.soft(
        restoredColors.groups >= 2,
        `Expected 2+ colour groups after restore, got ${restoredColors.groups}: ${JSON.stringify(restoredColors)}`,
      ).toBeTruthy();
    }
  });
});
