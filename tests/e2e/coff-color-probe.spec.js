/**
 * COFF Color Probe — E2E Runtime Verification
 *
 * Verifies that the WASM binary emits per-face color data in OFF output
 * and that the parser detects it. This test uploads the color fixture,
 * captures console output, and asserts hasColors=true.
 *
 * Companion to: docs/audit/parity-probe-results.md
 * Plan: .cursor/plans/coff_upstream_investigation_5f4b8fa9.plan.md (Phase 5)
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

test.describe('COFF Color Probe', () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    });
  });

  test('WASM emits per-face colors in OFF output for color() models', async ({ page }) => {
    const consoleMessages = [];
    page.on('console', (msg) => consoleMessages.push(msg.text()));

    await page.goto('/');

    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: 90_000,
    });

    const fileInput = page.locator('#fileInput');
    await fileInput.waitFor({ state: 'attached', timeout: 10_000 });
    await fileInput.setInputFiles(COLOR_FIXTURE);

    // Dismiss save-project modal if it appears
    try {
      const notNowBtn = page.locator('#saveProjectNotNow');
      await notNowBtn.waitFor({ state: 'visible', timeout: 5_000 });
      await notNowBtn.click();
    } catch {
      // Modal may not appear
    }

    // Wait for render to complete — look for the performance log line
    await page.waitForFunction(
      () => {
        const entries = (window.__consoleCapture || []);
        return entries.some(e => e.includes('[Preview Performance]'));
      },
      { timeout: 60_000 }
    ).catch(() => {
      // Fallback: wait a fixed amount if console capture isn't available
    });

    // Give extra time for console messages to propagate
    await page.waitForTimeout(5_000);

    const previewLoadLog = consoleMessages.find(m =>
      m.includes('[Preview] OFF loaded') || m.includes('[Preview] Loading')
    );
    const perfLog = consoleMessages.find(m =>
      m.includes('[Preview Performance]')
    );

    // Diagnostic: log what we captured
    const relevantLogs = consoleMessages.filter(m =>
      m.includes('[Preview]') || m.includes('[Worker]')
    );

    console.log('=== COFF Probe Console Capture ===');
    for (const log of relevantLogs) {
      console.log(log);
    }
    console.log('=== End Capture ===');

    // Assert that we got some rendering output
    expect(previewLoadLog || perfLog).toBeTruthy();

    // The key assertion: check for color presence
    const hasColorsTrue = consoleMessages.some(m =>
      m.includes('hasColors=true')
    );
    const hasColorsFalse = consoleMessages.some(m =>
      m.includes('hasColors=false')
    );
    const hasCoffCheck = consoleMessages.some(m =>
      m.includes('COFF ✓')
    );

    if (hasColorsTrue || hasCoffCheck) {
      console.log('RESULT: COFF WORKING — per-face colors detected');
    } else if (hasColorsFalse) {
      console.log('RESULT: COFF BLOCKED — no per-face colors in WASM output');
      console.log(
        'The WASM binary may not support render-colors, or the feature flag was not accepted.'
      );
    } else {
      console.log('RESULT: INCONCLUSIVE — no hasColors log found');
    }

    // Soft assertion: we expect colors to be present after the fix.
    // If this fails, the WASM binary does not support render-colors.
    expect.soft(
      hasColorsTrue || hasCoffCheck,
      'Expected WASM to emit per-face colors in OFF output'
    ).toBeTruthy();
  });
});
