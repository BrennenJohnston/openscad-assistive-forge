/**
 * LWFL Parity Reproduction — Phase 2 of LWFL Geometry Follow-up Plan
 *
 * Focused reproduction of Bug A and Bug B on the exact failing LWFL preset.
 * Compares four render modes with aligned backend, output format, and quality
 * to classify the defect as preview-only, export-only, or both.
 *
 * Modes:
 *   1. Current preview      — auto-adaptive quality, OFF output
 *   2. Desktop-quality preview — DESKTOP_DEFAULT quality, STL output
 *   3. Full STL render       — FULL quality, STL output
 *   4. Full STL + diagnostics — FULL quality, STL output, diagnostics enabled
 *
 * Fixture: stakeholder keyguard bundle (.volkswitch/keyguard-test-bundle.zip)
 *
 * Environment variables:
 *   LWFL_PRESET — preset name filter (default: matches "LWFL" case-insensitive)
 *
 * Artifacts written to: docs/audit/lwfl-parity-reproduction/
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'node:fs';
import { fileURLToPath } from 'url';
import {
  selectPreset,
  expandPresetControls,
  getSelectedPresetLabel,
  getPresetOptions,
} from './helpers/preset-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KEYGUARD_ZIP_PATH = path.resolve(
  __dirname, '..', '..', '.volkswitch', 'keyguard-test-bundle.zip',
);
const fixtureAvailable = fs.existsSync(KEYGUARD_ZIP_PATH);

const OUTPUT_DIR = path.resolve(
  __dirname, '..', '..', 'docs', 'audit', 'lwfl-parity-reproduction',
);

// UF-9 P1: the stakeholder bundle names its preset "... LAMP WFL 84"
// (LAMP Words For Life), not "LWFL" — the old default filter matched
// nothing ("Total options: 6, LWFL matches: 0" was this file's whole
// local red). 'WFL' hits the real preset; LWFL_PRESET still overrides.
const LWFL_PRESET_FILTER = process.env.LWFL_PRESET || 'WFL';

// Bug A and Bug B parameter keys from KI-012
const BUG_A_PARAM = 'expose_home_button';
const BUG_B_PARAM = 'expose_upper_message_bar';

// ── Helpers ────────────────────────────────────────────────────────────────────

async function uploadZipAndWait(page) {
  const fileInput = page.locator('#fileInput');
  await fileInput.waitFor({ state: 'attached', timeout: 10_000 });
  await fileInput.setInputFiles(KEYGUARD_ZIP_PATH);

  const mainInterface = page.locator('#mainInterface');
  await mainInterface.waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForSelector('.param-control', { state: 'attached', timeout: 20_000 });

  const notNowBtn = page.locator('#saveProjectNotNow');
  const modalVisible = await notNowBtn.isVisible({ timeout: 3000 }).catch(() => false);
  if (modalVisible) {
    await notNowBtn.click();
    await page.waitForTimeout(300);
  }
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

async function captureEffectiveParameters(page) {
  return page.evaluate(() => {
    const result = {};
    document.querySelectorAll('.param-control').forEach(control => {
      const label = control.querySelector('label');
      const input = control.querySelector(
        'input:not([type="hidden"]):not([type="range"]), select',
      );
      if (label && input) {
        result[label.textContent.trim()] = input.value;
      }
    });
    return result;
  });
}

async function captureGeometryStats(page) {
  return page.evaluate(() => {
    const statsEl = document.querySelector(
      '[data-testid="geometry-stats"], #geometryStats, .geometry-info',
    );
    if (!statsEl) return null;
    const text = statsEl.textContent || '';
    const vMatch = text.match(/(\d+)\s*vert/i);
    const fMatch = text.match(/(\d+)\s*(?:face|tri)/i);
    return {
      vertices: vMatch ? parseInt(vMatch[1], 10) : undefined,
      faces: fMatch ? parseInt(fMatch[1], 10) : undefined,
      raw_text: text.trim(),
    };
  });
}

/**
 * Collect console messages that match the Phase 1 diagnostic patterns.
 * Returns structured data for each logged diagnostic event.
 */
function createDiagnosticCollector(page) {
  const messages = [];
  const diagnostics = {
    presetDiag: [],
    autoPreviewDiag: [],
    workerDefineArgs: [],
    previewPerformance: [],
    all: messages,
  };

  page.on('console', (msg) => {
    const text = msg.text();
    messages.push(text);

    if (text.includes('[Preset Diag]')) {
      diagnostics.presetDiag.push(text);
    }
    if (text.includes('[AutoPreview Diag]')) {
      diagnostics.autoPreviewDiag.push(text);
    }
    if (text.includes('Worker defineArgs')) {
      diagnostics.workerDefineArgs.push(text);
    }
    if (text.includes('[Preview Performance]')) {
      diagnostics.previewPerformance.push(text);
    }
  });

  return diagnostics;
}

/**
 * Set a specific parameter value in the UI.
 */
async function setParameterValue(page, paramName, value) {
  const control = page.locator('.param-control').filter({ hasText: new RegExp(`^${paramName}`, 'i') });
  if ((await control.count()) === 0) return false;

  const select = control.locator('select').first();
  if ((await select.count()) > 0) {
    await select.selectOption({ label: new RegExp(value, 'i') });
    return true;
  }

  const input = control.locator('input:not([type="hidden"]):not([type="range"])').first();
  if ((await input.count()) > 0) {
    await input.fill(String(value));
    await input.dispatchEvent('change');
    return true;
  }

  return false;
}

/**
 * Trigger a full-quality render and wait for it to complete.
 * Returns geometry stats captured from the UI.
 */
async function triggerFullRender(page) {
  const generateBtn = page.locator('#generateBtn, [data-action="generate"], button:has-text("Generate")');
  if ((await generateBtn.count()) > 0 && await generateBtn.isEnabled()) {
    await generateBtn.click();
  }

  await page.waitForFunction(
    () => {
      const indicator = document.querySelector('.preview-state-indicator');
      if (!indicator) return false;
      const cls = indicator.className;
      return cls.includes('state-current') || cls.includes('state-error');
    },
    { timeout: 180_000 },
  );

  return captureGeometryStats(page);
}

/**
 * Enable desktop-quality debug override in localStorage and reload.
 */
async function enableDesktopQualityOverride(page) {
  await page.evaluate(() => {
    localStorage.setItem('openscad-forge-debug-desktop-quality', '1');
  });
}

async function disableDesktopQualityOverride(page) {
  await page.evaluate(() => {
    localStorage.removeItem('openscad-forge-debug-desktop-quality');
  });
}

/**
 * Find presets matching the LWFL filter.
 */
function filterLwflPresets(options) {
  const re = new RegExp(LWFL_PRESET_FILTER, 'i');
  return options.filter(name => {
    const trimmed = name.trim();
    return trimmed !== '' &&
      !trimmed.toLowerCase().includes('select') &&
      !trimmed.toLowerCase().includes('choose') &&
      re.test(trimmed);
  });
}

// ── Test Suite ─────────────────────────────────────────────────────────────────

test.describe('LWFL Parity Reproduction — Phase 2', () => {
  test.describe.configure({ timeout: 600_000 });

  test.beforeEach(async ({ page }) => {
    test.skip(!fixtureAvailable, 'Keyguard test bundle not found (.volkswitch/ is .gitignored)');

    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    });

    await page.goto('http://localhost:5173/');
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: 120_000,
    });
  });

  test('LWFL preset: capture baseline diagnostic data across four render modes', async ({ page }) => {
    const diagnostics = createDiagnosticCollector(page);

    await uploadZipAndWait(page);
    await expandPresetControls(page);

    const allOptions = await getPresetOptions(page);
    const lwflPresets = filterLwflPresets(allOptions);

    console.log(`[LWFL Repro] Total options: ${allOptions.length}, LWFL matches: ${lwflPresets.length}`);
    expect(lwflPresets.length, 'At least one LWFL preset must be available').toBeGreaterThan(0);

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const results = [];

    for (const presetName of lwflPresets) {
      console.log(`[LWFL Repro] === Preset: ${presetName} ===`);

      const selected = await selectPreset(page, presetName);
      if (!selected) {
        results.push({ preset_name: presetName, status: 'selection_failed' });
        continue;
      }

      await page.waitForFunction(() => {
        return !document.querySelector('.preset-loading, .param-updating');
      }, { timeout: 5000 }).catch(() => {});

      const applyBtn = page.locator('.preset-modal [data-action="apply"]');
      if (await applyBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await applyBtn.click();
        await page.waitForTimeout(500);
      }

      const selectedLabel = await getSelectedPresetLabel(page);
      const baselineParams = await captureEffectiveParameters(page);

      // Record Bug A and Bug B parameter values
      const bugAValue = baselineParams[BUG_A_PARAM] ?? baselineParams.expose_home_button ?? null;
      const bugBValue = baselineParams[BUG_B_PARAM] ?? baselineParams.expose_upper_message_bar ?? null;

      console.log(`[LWFL Repro] Bug A param (${BUG_A_PARAM}): ${bugAValue}`);
      console.log(`[LWFL Repro] Bug B param (${BUG_B_PARAM}): ${bugBValue}`);

      // ── Mode 1: Current preview (auto-adaptive quality) ──────────────
      console.log('[LWFL Repro] Mode 1: Current preview');
      try {
        await waitForPreviewIdle(page, { timeout: 120_000 });
      } catch {
        console.warn('[LWFL Repro] Mode 1: Timeout waiting for preview idle');
      }
      const mode1Stats = await captureGeometryStats(page);
      const mode1DiagSnapshot = {
        presetDiag: [...diagnostics.presetDiag],
        autoPreviewDiag: [...diagnostics.autoPreviewDiag],
        workerDefineArgs: [...diagnostics.workerDefineArgs],
        previewPerformance: [...diagnostics.previewPerformance],
      };

      // ── Mode 2: Desktop-quality preview ──────────────────────────────
      console.log('[LWFL Repro] Mode 2: Desktop-quality preview');
      await enableDesktopQualityOverride(page);

      // Force a re-render by toggling a param and back, or clearing cache
      await page.evaluate(() => {
        if (window.__autoPreviewController) {
          window.__autoPreviewController.clearPreviewCache();
        }
      });
      // Re-select the same preset to force a fresh render with desktop quality
      await selectPreset(page, presetName);
      await page.waitForFunction(() => {
        return !document.querySelector('.preset-loading, .param-updating');
      }, { timeout: 5000 }).catch(() => {});

      if (await applyBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await applyBtn.click();
        await page.waitForTimeout(500);
      }

      try {
        await waitForPreviewIdle(page, { timeout: 120_000 });
      } catch {
        console.warn('[LWFL Repro] Mode 2: Timeout waiting for desktop-quality preview idle');
      }
      const mode2Stats = await captureGeometryStats(page);
      const mode2DiagSnapshot = {
        autoPreviewDiag: diagnostics.autoPreviewDiag.slice(mode1DiagSnapshot.autoPreviewDiag.length),
        workerDefineArgs: diagnostics.workerDefineArgs.slice(mode1DiagSnapshot.workerDefineArgs.length),
        previewPerformance: diagnostics.previewPerformance.slice(mode1DiagSnapshot.previewPerformance.length),
      };

      await disableDesktopQualityOverride(page);

      // ── Mode 3: Full STL render ──────────────────────────────────────
      console.log('[LWFL Repro] Mode 3: Full STL render');
      const mode3Stats = await triggerFullRender(page);
      const mode3DiagSnapshot = {
        workerDefineArgs: diagnostics.workerDefineArgs.slice(
          mode1DiagSnapshot.workerDefineArgs.length + mode2DiagSnapshot.workerDefineArgs.length,
        ),
      };

      // ── Mode 4: Full STL + diagnostics ───────────────────────────────
      console.log('[LWFL Repro] Mode 4: Full STL render with diagnostics');
      await page.evaluate(() => {
        localStorage.setItem('openscad-forge-debug-no-csg-colors', '1');
      });
      const mode4Stats = await triggerFullRender(page);
      const mode4DiagSnapshot = {
        workerDefineArgs: diagnostics.workerDefineArgs.slice(
          mode1DiagSnapshot.workerDefineArgs.length +
          mode2DiagSnapshot.workerDefineArgs.length +
          mode3DiagSnapshot.workerDefineArgs.length,
        ),
      };
      await page.evaluate(() => {
        localStorage.removeItem('openscad-forge-debug-no-csg-colors');
      });

      // ── Compile result ───────────────────────────────────────────────
      const presetResult = {
        preset_name: presetName,
        selected_label: selectedLabel,
        status: 'captured',
        bug_a: { param: BUG_A_PARAM, value: bugAValue },
        bug_b: { param: BUG_B_PARAM, value: bugBValue },
        effective_parameters: baselineParams,
        modes: {
          current_preview: {
            label: 'Mode 1: Current preview (auto-adaptive)',
            geometry_stats: mode1Stats,
            diagnostics: mode1DiagSnapshot,
          },
          desktop_preview: {
            label: 'Mode 2: Desktop-quality preview',
            geometry_stats: mode2Stats,
            diagnostics: mode2DiagSnapshot,
          },
          full_stl: {
            label: 'Mode 3: Full STL render',
            geometry_stats: mode3Stats,
            diagnostics: mode3DiagSnapshot,
          },
          full_stl_diagnostics: {
            label: 'Mode 4: Full STL + no CSG colors',
            geometry_stats: mode4Stats,
            diagnostics: mode4DiagSnapshot,
          },
        },
        timestamp: new Date().toISOString(),
      };

      // ── Parity analysis ──────────────────────────────────────────────
      const modesWithStats = [mode1Stats, mode2Stats, mode3Stats, mode4Stats].filter(Boolean);
      const faceCounts = modesWithStats
        .map(s => s.faces)
        .filter(f => f !== undefined && f !== null);

      if (faceCounts.length >= 2) {
        const min = Math.min(...faceCounts);
        const max = Math.max(...faceCounts);
        const skew = max > 0 ? ((max - min) / max * 100).toFixed(1) : '0';
        presetResult.parity_analysis = {
          face_counts: faceCounts,
          min_faces: min,
          max_faces: max,
          skew_percent: parseFloat(skew),
          classification: parseFloat(skew) < 5 ? 'aligned' :
            parseFloat(skew) < 15 ? 'minor-skew' : 'significant-skew',
        };
        console.log(`[LWFL Repro] Parity: ${faceCounts.join(' / ')} faces, skew=${skew}%`);
      }

      results.push(presetResult);
    }

    // ── Bug A / Bug B Focused Reproduction ──────────────────────────────────
    // After baseline capture, test with the bug-triggering parameter values
    if (lwflPresets.length > 0) {
      const targetPreset = lwflPresets[0];
      console.log(`[LWFL Repro] === Bug reproduction on: ${targetPreset} ===`);

      await selectPreset(page, targetPreset);
      await page.waitForFunction(() => {
        return !document.querySelector('.preset-loading, .param-updating');
      }, { timeout: 5000 }).catch(() => {});

      const applyBtn = page.locator('.preset-modal [data-action="apply"]');
      if (await applyBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await applyBtn.click();
        await page.waitForTimeout(500);
      }

      // Bug A: expose_home_button = "no"
      const bugASet = await setParameterValue(page, BUG_A_PARAM, 'no');
      if (bugASet) {
        console.log('[LWFL Repro] Bug A: Set expose_home_button = "no"');
        try {
          await waitForPreviewIdle(page, { timeout: 120_000 });
        } catch {
          console.warn('[LWFL Repro] Bug A: Timeout');
        }
        const bugAParams = await captureEffectiveParameters(page);
        const bugAStats = await captureGeometryStats(page);

        results.push({
          preset_name: targetPreset,
          test_case: 'bug_a_reproduction',
          description: 'expose_home_button = "no" — expect straight right edge, Bug A shows tab',
          effective_parameters: bugAParams,
          geometry_stats: bugAStats,
          timestamp: new Date().toISOString(),
        });

        // Full render for Bug A
        const bugAFullStats = await triggerFullRender(page);
        results.push({
          preset_name: targetPreset,
          test_case: 'bug_a_full_render',
          description: 'Bug A full STL render for comparison',
          geometry_stats: bugAFullStats,
          timestamp: new Date().toISOString(),
        });
      }

      // Bug B: expose_upper_message_bar = "no"
      // Re-select preset to reset parameters
      await selectPreset(page, targetPreset);
      await page.waitForFunction(() => {
        return !document.querySelector('.preset-loading, .param-updating');
      }, { timeout: 5000 }).catch(() => {});

      if (await applyBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await applyBtn.click();
        await page.waitForTimeout(500);
      }

      const bugBSet = await setParameterValue(page, BUG_B_PARAM, 'no');
      if (bugBSet) {
        console.log('[LWFL Repro] Bug B: Set expose_upper_message_bar = "no"');
        try {
          await waitForPreviewIdle(page, { timeout: 120_000 });
        } catch {
          console.warn('[LWFL Repro] Bug B: Timeout');
        }
        const bugBParams = await captureEffectiveParameters(page);
        const bugBStats = await captureGeometryStats(page);

        results.push({
          preset_name: targetPreset,
          test_case: 'bug_b_reproduction',
          description: 'expose_upper_message_bar = "no" — expect solid surface, Bug B shows ghost cutouts',
          effective_parameters: bugBParams,
          geometry_stats: bugBStats,
          timestamp: new Date().toISOString(),
        });

        // Full render for Bug B
        const bugBFullStats = await triggerFullRender(page);
        results.push({
          preset_name: targetPreset,
          test_case: 'bug_b_full_render',
          description: 'Bug B full STL render for comparison',
          geometry_stats: bugBFullStats,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // ── Write results ──────────────────────────────────────────────────────
    const captured = results.filter(r => r.status === 'captured' || r.test_case);
    const failed = results.filter(r => r.status === 'selection_failed');

    console.log(`[LWFL Repro] Captured: ${captured.length}, Failed: ${failed.length}`);

    const outputFile = path.join(OUTPUT_DIR, 'lwfl-parity-results.json');
    fs.writeFileSync(outputFile, JSON.stringify({
      metadata: {
        plan_phase: 'reproduce-equalized',
        plan_id: 'lwfl_geometry_follow-up_32f23471',
        lwfl_filter: LWFL_PRESET_FILTER,
        total_presets: allOptions.length,
        lwfl_presets: lwflPresets.length,
        captured: captured.length,
        failed: failed.length,
        modes_compared: ['current_preview', 'desktop_preview', 'full_stl', 'full_stl_diagnostics'],
        bug_a_param: BUG_A_PARAM,
        bug_b_param: BUG_B_PARAM,
        timestamp: new Date().toISOString(),
      },
      results,
    }, null, 2));

    console.log(`[LWFL Repro] Results written to: ${outputFile}`);
    expect(captured.length).toBeGreaterThan(0);
  });
});
