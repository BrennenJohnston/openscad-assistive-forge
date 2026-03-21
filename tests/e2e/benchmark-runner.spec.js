/**
 * Automated benchmark runner (DEBT-06)
 *
 * Loads each of the 4 benchmark SCAD models through the app's manifest-loading
 * mechanism, records wall-clock render times, writes a JSON results artifact,
 * and fails if any benchmark exceeds its declared threshold.
 *
 * Thresholds are intentionally generous — they are trip-wires for catastrophic
 * regression, not micro-optimisation gates.  The JSON output is the primary
 * artefact for tracking render-time trends across builds.
 *
 * Run: npx playwright test tests/e2e/benchmark-runner.spec.js --project=chromium
 * Output: test-results/benchmark-results.json (written when tests pass locally)
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

// Skip WASM-dependent benchmarks in regular CI — WASM rendering is too slow and
// unreliable for routine CI runs.  Run with BENCHMARK=1 to force execution.
const isCI = !!process.env.CI;
const forceBenchmark = !!process.env.BENCHMARK;
const shouldRun = forceBenchmark || !isCI;

// ---------------------------------------------------------------------------
// Benchmark model definitions
// ---------------------------------------------------------------------------

const BENCHMARKS = [
  {
    id: 'benchmark_simple',
    name: 'Simple Primitives',
    file: 'benchmark_simple.scad',
    thresholdMs: 60_000,
  },
  {
    id: 'benchmark_hull',
    name: 'Hull Operations',
    file: 'benchmark_hull.scad',
    thresholdMs: 120_000,
  },
  {
    id: 'benchmark_booleans',
    name: 'Heavy Booleans',
    file: 'benchmark_booleans.scad',
    thresholdMs: 120_000,
  },
  {
    id: 'benchmark_minkowski',
    name: 'Minkowski Operation',
    file: 'benchmark_minkowski.scad',
    thresholdMs: 300_000,
  },
];

// Collected results — accumulated across individual test runs and written to
// JSON when the final "write results" test runs.
const results = [];

// ---------------------------------------------------------------------------
// Shared helpers (mirrored from render-stability.spec.js)
// ---------------------------------------------------------------------------

/** Dismiss first-visit modal. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
  });
});

/**
 * Wait until the preview state indicator shows a non-rendering state.
 */
async function waitForPreviewIdle(page, { timeout = 240_000 } = {}) {
  await page.waitForFunction(
    () => {
      const indicator = document.querySelector('.preview-state-indicator');
      if (!indicator) return false;
      const cls = indicator.className || '';
      const text = indicator.textContent || '';
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
 * Set up route interception to serve a benchmark SCAD file via the forge-manifest
 * loading mechanism.  The page then navigates to `/?manifest=<url>`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} scadContent  Full contents of the .scad file
 * @param {string} filename     Filename reported to the app
 * @returns {string}  The manifest URL to navigate to
 */
async function setupBenchmarkRoutes(page, scadContent, filename) {
  const BASE = 'https://benchmark.openscad-forge.test';
  const manifestUrl = `${BASE}/forge-manifest.json`;
  const scadUrl = `${BASE}/${filename}`;

  await page.route(manifestUrl, async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        forgeManifest: '1.0',
        name: filename.replace('.scad', ''),
        files: { main: filename },
      }),
    });
  });

  await page.route(scadUrl, async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/plain',
      },
      body: scadContent,
    });
  });

  return manifestUrl;
}

// ---------------------------------------------------------------------------
// Benchmark test suite
// ---------------------------------------------------------------------------

test.describe('Benchmark Runner — render time regression guard', () => {
  test.describe.configure({ timeout: 360_000 });

  for (const bench of BENCHMARKS) {
    test(`${bench.name} (${bench.id}) renders within ${bench.thresholdMs / 1000}s`, async ({
      page,
    }, testInfo) => {
      test.skip(!shouldRun, 'Skipped in CI — set BENCHMARK=1 to run');

      // Read SCAD content from disk (served by local dev server in public/)
      const scadPath = path.join(ROOT, 'public/examples/benchmarks', bench.file);
      const scadContent = fs.readFileSync(scadPath, 'utf-8');

      // Set up route mocking and navigate
      const manifestUrl = await setupBenchmarkRoutes(page, scadContent, bench.file);
      const startMs = Date.now();
      await page.goto(`/?manifest=${encodeURIComponent(manifestUrl)}`);

      // Wait for the app interface to appear
      await page.locator('#mainInterface').waitFor({ state: 'visible', timeout: 40_000 });

      // Wait for render to complete or fail
      let renderError = null;
      try {
        await waitForPreviewIdle(page, { timeout: bench.thresholdMs });
      } catch (err) {
        renderError = err.message;
      }

      const elapsedMs = Date.now() - startMs;

      // Collect the preview state for the result record
      const indicatorText = await page
        .locator('.preview-state-indicator')
        .textContent()
        .catch(() => '(unknown)');

      const result = {
        id: bench.id,
        name: bench.name,
        file: bench.file,
        elapsedMs,
        thresholdMs: bench.thresholdMs,
        passed: renderError === null && elapsedMs <= bench.thresholdMs,
        indicatorText: indicatorText?.trim() ?? '',
        error: renderError ?? null,
        timestamp: new Date().toISOString(),
      };

      results.push(result);

      // Attach individual result to the test report
      await testInfo.attach(`${bench.id}-result`, {
        body: JSON.stringify(result, null, 2),
        contentType: 'application/json',
      });

      console.log(
        `[Benchmark] ${bench.name}: ${elapsedMs}ms / ${bench.thresholdMs}ms — ${result.passed ? 'PASS' : 'FAIL'}`
      );

      expect(
        renderError,
        `${bench.name}: render timed out or errored after ${elapsedMs}ms`
      ).toBeNull();
      expect(
        elapsedMs,
        `${bench.name}: render time ${elapsedMs}ms exceeded threshold ${bench.thresholdMs}ms`
      ).toBeLessThanOrEqual(bench.thresholdMs);
    });
  }

  // Write consolidated JSON artifact after all benchmark tests
  test('write benchmark results JSON artifact', async ({}, testInfo) => {
    test.skip(!shouldRun, 'Skipped in CI — set BENCHMARK=1 to run');

    if (results.length === 0) {
      console.log('[Benchmark] No results collected (all benchmarks may have been skipped).');
      return;
    }

    const report = {
      generatedAt: new Date().toISOString(),
      runId: testInfo.project.name,
      benchmarks: results,
      summary: {
        total: results.length,
        passed: results.filter((r) => r.passed).length,
        failed: results.filter((r) => !r.passed).length,
      },
    };

    const reportJson = JSON.stringify(report, null, 2);

    // Attach to Playwright report for CI artifact upload
    await testInfo.attach('benchmark-results', {
      body: reportJson,
      contentType: 'application/json',
    });

    // Also write to test-results/ for easy local inspection
    const outDir = path.join(ROOT, 'test-results');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const outPath = path.join(outDir, 'benchmark-results.json');
    fs.writeFileSync(outPath, reportJson, 'utf-8');

    console.log(`[Benchmark] Results written to ${outPath}`);
    console.table(
      results.map((r) => ({
        name: r.name,
        'elapsed (ms)': r.elapsedMs,
        'threshold (ms)': r.thresholdMs,
        passed: r.passed,
      }))
    );
  });
});
