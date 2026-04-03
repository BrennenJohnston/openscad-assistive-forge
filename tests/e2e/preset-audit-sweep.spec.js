/**
 * Browser-Side Preset Audit Sweep
 *
 * Loads the stakeholder project bundle, iterates through each preset in the
 * dropdown, and records structured audit data: active preset name, effective
 * parameter set, resolved companion alias targets, and geometry stats.
 *
 * Artifacts are written to docs/audit/testing-round-8/reference-data/browser-audit/.
 *
 * Environment variables for filtering:
 *   PRESET_FILTER  — regex pattern to filter preset names (default: all)
 *   BATCH_SIZE     — process presets in batches of this size (default: 0 = all)
 *   BATCH_INDEX    — which batch to process, 0-based (default: 0)
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'node:fs'
import { fileURLToPath } from 'url'
import {
  selectPreset,
  expandPresetControls,
  getSelectedPresetLabel,
  getPresetOptions,
} from './helpers/preset-helpers.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const KEYGUARD_ZIP_PATH = path.resolve(
  __dirname, '..', '..', '.volkswitch', 'keyguard-test-bundle.zip'
)
const fixtureAvailable = fs.existsSync(KEYGUARD_ZIP_PATH)

const AUDIT_OUTPUT_DIR = path.resolve(
  __dirname, '..', '..', 'docs', 'audit', 'testing-round-8',
  'reference-data', 'browser-audit'
)

const PRESET_FILTER = process.env.PRESET_FILTER || ''
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '0', 10)
const BATCH_INDEX = parseInt(process.env.BATCH_INDEX || '0', 10)

/**
 * Upload the keyguard ZIP and wait for parameters to appear.
 * @param {import('@playwright/test').Page} page
 */
async function uploadZipAndWait(page) {
  const fileInput = page.locator('#fileInput')
  await fileInput.waitFor({ state: 'attached', timeout: 10_000 })
  await fileInput.setInputFiles(KEYGUARD_ZIP_PATH)

  const mainInterface = page.locator('#mainInterface')
  await mainInterface.waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForSelector('.param-control', { state: 'attached', timeout: 20_000 })

  // Dismiss save-project modal if it appears
  const notNowBtn = page.locator('#saveProjectNotNow')
  const modalVisible = await notNowBtn.isVisible({ timeout: 3000 }).catch(() => false)
  if (modalVisible) {
    await notNowBtn.click()
    await page.waitForTimeout(300)
  }
}

/**
 * Filter and batch a list of preset names using the environment config.
 * @param {string[]} names
 * @returns {string[]}
 */
function applyFilterAndBatch(names) {
  let filtered = names.filter(n =>
    n.trim() !== '' &&
    !n.toLowerCase().includes('select') &&
    !n.toLowerCase().includes('choose')
  )

  if (PRESET_FILTER) {
    const re = new RegExp(PRESET_FILTER, 'i')
    filtered = filtered.filter(n => re.test(n))
  }

  if (BATCH_SIZE > 0) {
    const start = BATCH_INDEX * BATCH_SIZE
    const end = Math.min(start + BATCH_SIZE, filtered.length)
    filtered = filtered.slice(start, end)
  }

  return filtered
}

/**
 * Capture the effective parameter values from all visible controls.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Record<string, string>>}
 */
async function captureEffectiveParameters(page) {
  return page.evaluate(() => {
    const result = {}
    document.querySelectorAll('.param-control').forEach(control => {
      const label = control.querySelector('label')
      const input = control.querySelector(
        'input:not([type="hidden"]):not([type="range"]), select'
      )
      if (label && input) {
        result[label.textContent.trim()] = input.value
      }
    })
    return result
  })
}

/**
 * Capture companion file context from the project files section.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{available: boolean, files?: string[]}>}
 */
async function captureCompanionContext(page) {
  return page.evaluate(() => {
    const section = document.getElementById('projectFilesList')
    if (!section) return { available: false }
    const items = [...section.querySelectorAll('.project-file-item, li')]
    return {
      available: true,
      files: items.map(item => ({
        name: item.textContent.trim(),
        active: item.classList.contains('active') || item.hasAttribute('data-active'),
      })),
    }
  })
}

/**
 * Capture geometry stats from the status bar or render output.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{vertices?: number, faces?: number, render_time_ms?: number} | null>}
 */
async function captureGeometryStats(page) {
  return page.evaluate(() => {
    const statsEl = document.querySelector(
      '[data-testid="geometry-stats"], #geometryStats, .geometry-info'
    )
    if (!statsEl) return null
    const text = statsEl.textContent || ''
    const vMatch = text.match(/(\d+)\s*vert/i)
    const fMatch = text.match(/(\d+)\s*(?:face|tri)/i)
    return {
      vertices: vMatch ? parseInt(vMatch[1], 10) : undefined,
      faces: fMatch ? parseInt(fMatch[1], 10) : undefined,
      raw_text: text.trim(),
    }
  })
}

test.describe('Preset Audit Sweep — Browser Side', () => {
  test.describe.configure({ timeout: 600_000 })

  test.beforeEach(async ({ page }) => {
    test.skip(!fixtureAvailable, 'Keyguard test bundle not found (.volkswitch/ is .gitignored)')

    await page.addInitScript(() => {
      localStorage.clear()
      localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    })

    await page.goto('http://localhost:5173/')
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: 120_000,
    })
  })

  test('given the stakeholder project, when each preset is selected, then audit data is captured', async ({ page }) => {
    await uploadZipAndWait(page)
    await expandPresetControls(page)

    const allOptions = await getPresetOptions(page)
    const presetNames = applyFilterAndBatch(allOptions)

    console.log(`[Audit] Total options: ${allOptions.length}, after filter/batch: ${presetNames.length}`)

    expect(presetNames.length).toBeGreaterThan(0)

    fs.mkdirSync(AUDIT_OUTPUT_DIR, { recursive: true })

    const results = []

    for (const presetName of presetNames) {
      console.log(`[Audit] Selecting preset: ${presetName}`)

      const selected = await selectPreset(page, presetName)
      if (!selected) {
        results.push({
          preset_name: presetName,
          status: 'selection_failed',
          timestamp: new Date().toISOString(),
        })
        continue
      }

      // Wait for parameters to update after selection
      await page.waitForFunction(() => {
        return !document.querySelector('.preset-loading, .param-updating')
      }, { timeout: 5000 }).catch(() => {})

      // Accept any preset-compatibility warning
      const applyBtn = page.locator('.preset-modal [data-action="apply"]')
      const warningVisible = await applyBtn.isVisible({ timeout: 1000 }).catch(() => false)
      if (warningVisible) {
        await applyBtn.click()
        await page.waitForTimeout(500)
      }

      const selectedLabel = await getSelectedPresetLabel(page)
      const effectiveParams = await captureEffectiveParameters(page)
      const companionContext = await captureCompanionContext(page)
      const geometryStats = await captureGeometryStats(page)

      results.push({
        preset_name: presetName,
        selected_label: selectedLabel,
        status: 'captured',
        effective_parameters: effectiveParams,
        companion_context: companionContext,
        geometry_stats: geometryStats,
        timestamp: new Date().toISOString(),
      })
    }

    const captured = results.filter(r => r.status === 'captured')
    const failed = results.filter(r => r.status === 'selection_failed')

    console.log(`[Audit] Captured: ${captured.length}, Failed: ${failed.length}`)

    const outputFile = path.join(AUDIT_OUTPUT_DIR, 'preset-sweep-results.json')
    fs.writeFileSync(outputFile, JSON.stringify({
      metadata: {
        total_presets_in_file: allOptions.length,
        filter: PRESET_FILTER || null,
        batch_size: BATCH_SIZE || null,
        batch_index: BATCH_INDEX,
        presets_processed: presetNames.length,
        captured: captured.length,
        failed: failed.length,
        timestamp: new Date().toISOString(),
      },
      results,
    }, null, 2))

    console.log(`[Audit] Results written to: ${outputFile}`)

    expect(captured.length).toBeGreaterThan(0)
  })
})
