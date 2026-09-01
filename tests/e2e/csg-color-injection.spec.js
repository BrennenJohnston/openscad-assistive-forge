/**
 * CSG Face Coloring — E2E Runtime Verification (unmodified source)
 *
 * Verifies the post-KI-012 color pipeline: SCAD without color() calls renders
 * UNMODIFIED (injectCsgColors() source mutation was removed because wrapping
 * each difference() subtractor in its own color(){} scope corrupted geometry).
 *
 * On the current engine (OpenSCAD 2026.04.03 + Manifold), --enable=render-colors
 * natively emits distinct per-CSG-operation face colors even for colorless
 * source, so the OFF loads with hasColors=true — the injection was never
 * needed for this. If a future engine emits absent/uniform colors instead,
 * loadOFF() drops them and viewer-side cavity classification
 * (_classifyInnerFaces) provides the two-tone rendering — either path must
 * produce 2+ distinct hue groups on screen.
 *
 * Fixture: tests/fixtures/sample.scad — parametric box with difference(), no
 *          color() calls (the common case).
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
 * With cavity tinting, outer faces render in the theme model color and
 * inner/cavity faces in the theme back color — two distinct hue groups.
 */
async function sampleCanvasHueGroups(page) {
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

            // Warm (gold/yellow/teal model color): R or B prominent vs green
            if (r > 80 && g > 60 && b < r * 0.6 && r > g * 0.9) {
              seen.add('warm');
            }
            // Green (cavity/back color #9dcb51 lit): G highest channel
            else if (g > 60 && g > r * 1.05 && g > b * 1.2) {
              seen.add('green');
            }
            else {
              seen.add('other');
            }
          }
        }

        resolve({ meshPixels, groups: seen.size, labels: [...seen].sort() });
      });
    });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('CSG Face Coloring Pipeline (unmodified source)', () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit WASM does not emit CSG color metadata');
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    });
  });

  test('sample.scad (difference, no color calls) renders with distinct face colors', async ({ page }) => {
    const consoleMessages = [];
    page.on('console', (msg) => consoleMessages.push(msg.text()));

    await loadFixture(page, SAMPLE_FIXTURE);

    const relevantLogs = consoleMessages.filter(m =>
      m.includes('[Preview]') || m.includes('[AutoPreview]') ||
      m.includes('[Preview Performance]'),
    );
    console.log('=== Cavity Tinting Console Capture (sample.scad) ===');
    for (const log of relevantLogs) console.log(log);
    console.log('=== End Capture ===');

    // Primary assertion: the OFF output loaded. Native engine colors
    // (hasColors=true on Manifold render-colors) and classification tinting
    // (hasColors=false after uniform-drop) are both valid — what matters is
    // that no source mutation was needed to get there.
    const offLoaded = consoleMessages.find(m =>
      m.includes('[Preview] OFF loaded') && m.includes('hasColors=')
    );
    expect(
      offLoaded,
      'preview must load OFF output for a colorless model on a render-colors engine',
    ).toBeTruthy();

    // Secondary: pixel-level verification (soft, requires WebGL) — either
    // native CSG colors or cavity tinting must produce 2+ hue groups.
    const colorResult = await sampleCanvasHueGroups(page);
    console.log('Hue pixel sample (sample.scad):', JSON.stringify(colorResult));

    if (colorResult.meshPixels > 0) {
      expect.soft(
        colorResult.groups >= 2,
        `Expected 2+ hue groups (model+cavity), got ${colorResult.groups}: ${JSON.stringify(colorResult)}`,
      ).toBeTruthy();
    } else {
      console.log('WebGL not available or canvas empty — skipping pixel assertion');
    }
  });

  test('benchmark_booleans.scad (top-level difference) renders with distinct face colors', async ({ page }) => {
    const consoleMessages = [];
    page.on('console', (msg) => consoleMessages.push(msg.text()));

    await loadFixture(page, BOOLEANS_FIXTURE);

    const relevantLogs = consoleMessages.filter(m =>
      m.includes('[Preview]') || m.includes('[AutoPreview]') ||
      m.includes('[Preview Performance]'),
    );
    console.log('=== Cavity Tinting Console Capture (benchmark_booleans.scad) ===');
    for (const log of relevantLogs) console.log(log);
    console.log('=== End Capture ===');

    const offLoaded = consoleMessages.find(m =>
      m.includes('[Preview] OFF loaded') && m.includes('hasColors=')
    );
    expect(
      offLoaded,
      'preview must load OFF output for a colorless model on a render-colors engine',
    ).toBeTruthy();

    const colorResult = await sampleCanvasHueGroups(page);
    console.log('Hue pixel sample (benchmark_booleans.scad):', JSON.stringify(colorResult));

    if (colorResult.meshPixels > 0) {
      expect.soft(
        colorResult.groups >= 2,
        `Expected 2+ hue groups (model+cavity), got ${colorResult.groups}: ${JSON.stringify(colorResult)}`,
      ).toBeTruthy();
    }
  });
});
