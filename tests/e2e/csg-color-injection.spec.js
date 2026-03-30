/**
 * CSG Color Injection — E2E Runtime Verification (Phase 6)
 *
 * Verifies the full pipeline: SCAD without color() calls → injectCsgColors()
 * preprocessing → WASM OFF render with --enable=render-colors → loadOFF()
 * with per-face gold/green COFF colors → 3D preview with distinct hue groups.
 *
 * Fixture: tests/fixtures/sample.scad — parametric box with difference(), no
 *          color() calls (the common case that triggers CSG color injection).
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAMPLE_FIXTURE = path.resolve(
  __dirname, '..', 'fixtures', 'sample.scad'
);

const BOOLEANS_FIXTURE = path.resolve(
  __dirname, '..', '..', 'public', 'examples', 'benchmarks', 'benchmark_booleans.scad'
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadFixture(page, fixturePath) {
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 90_000,
  });

  const fileInput = page.locator('#fileInput');
  await fileInput.waitFor({ state: 'attached', timeout: 10_000 });
  await fileInput.setInputFiles(fixturePath);

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
 * Sample a grid of pixels from the WebGL canvas and classify by hue.
 * Gold (#f9d72c after lighting) reads as warm yellow; green (#9dcb51)
 * reads as green. We detect both to confirm CSG color injection worked.
 */
async function sampleCanvasCSGColors(page) {
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
        const gridSize = 12;
        const seen = new Set();
        let meshPixels = 0;

        for (let gx = 0; gx < gridSize; gx++) {
          for (let gy = 0; gy < gridSize; gy++) {
            const x = Math.floor((gx + 0.5) * w / gridSize);
            const y = Math.floor((gy + 0.5) * h / gridSize);
            const px = new Uint8Array(4);
            gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            const [r, g, b, a] = px;

            if (a < 10 || r + g + b < 40) continue;
            if (Math.max(r, g, b) - Math.min(r, g, b) < 15) continue;

            meshPixels++;

            // Gold (#f9d72c lit): R highest, G medium-high, B low
            if (r > 80 && g > 60 && b < r * 0.6 && r > g * 0.9) {
              seen.add('gold');
            }
            // Green (#9dcb51 lit): G highest channel
            else if (g > 60 && g > r * 1.05 && g > b * 1.2) {
              seen.add('green');
            }
          }
        }

        resolve({ meshPixels, groups: seen.size, labels: [...seen].sort() });
      });
    });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('CSG Color Injection Pipeline', () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    });
  });

  test('sample.scad (difference, no color calls) renders with hasColors=true', async ({ page }) => {
    const consoleMessages = [];
    page.on('console', (msg) => consoleMessages.push(msg.text()));

    await loadFixture(page, SAMPLE_FIXTURE);

    const relevantLogs = consoleMessages.filter(m =>
      m.includes('[Preview]') || m.includes('[AutoPreview]') ||
      m.includes('[Preview Performance]'),
    );
    console.log('=== CSG Injection Console Capture (sample.scad) ===');
    for (const log of relevantLogs) console.log(log);
    console.log('=== End Capture ===');

    // Primary assertion: OFF was loaded with per-face colors
    const hasColorsTrue = consoleMessages.some(m => m.includes('hasColors=true'));
    expect(
      hasColorsTrue,
      'loadOFF must report hasColors=true when CSG colors are injected',
    ).toBeTruthy();

    // Secondary: pixel-level verification (soft, requires WebGL)
    const colorResult = await sampleCanvasCSGColors(page);
    console.log('CSG color pixel sample (sample.scad):', JSON.stringify(colorResult));

    if (colorResult.meshPixels > 0) {
      expect.soft(
        colorResult.groups >= 2,
        `Expected 2+ hue groups (gold+green), got ${colorResult.groups}: ${JSON.stringify(colorResult)}`,
      ).toBeTruthy();
    } else {
      console.log('WebGL not available or canvas empty — skipping pixel assertion');
    }
  });

  test('benchmark_booleans.scad (top-level difference) renders with CSG colors', async ({ page }) => {
    const consoleMessages = [];
    page.on('console', (msg) => consoleMessages.push(msg.text()));

    await loadFixture(page, BOOLEANS_FIXTURE);

    const relevantLogs = consoleMessages.filter(m =>
      m.includes('[Preview]') || m.includes('[AutoPreview]') ||
      m.includes('[Preview Performance]'),
    );
    console.log('=== CSG Injection Console Capture (benchmark_booleans.scad) ===');
    for (const log of relevantLogs) console.log(log);
    console.log('=== End Capture ===');

    const hasColorsTrue = consoleMessages.some(m => m.includes('hasColors=true'));
    expect(
      hasColorsTrue,
      'loadOFF must report hasColors=true for benchmark_booleans.scad',
    ).toBeTruthy();

    const colorResult = await sampleCanvasCSGColors(page);
    console.log('CSG color pixel sample (benchmark_booleans.scad):', JSON.stringify(colorResult));

    if (colorResult.meshPixels > 0) {
      expect.soft(
        colorResult.groups >= 2,
        `Expected 2+ hue groups (gold+green), got ${colorResult.groups}: ${JSON.stringify(colorResult)}`,
      ).toBeTruthy();
    }
  });
});
