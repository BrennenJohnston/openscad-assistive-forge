/**
 * E2E: a design built as a STACK of passes (DP-7, DP-8).
 *
 * The acceptance story: three nested squares go in as one drawing, the app
 * works out that they are nested three deep, writes one compound-path SVG per
 * pass, and q-charm builds them as a stepped pyramid on the charm face - each
 * pass standing on the one before it rather than on air.
 *
 * The thing worth guarding is not that files appear. It is that they appear
 * TOGETHER with their aspects, at their true relative sizes, and that the
 * charm actually renders from them.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import path from 'node:path'

const SQUARES = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'svg-edit',
  'nested-squares.svg'
)

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

async function openCharm(page) {
  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', { timeout: 120000 })
  await page.selectOption('#charmVariantSelect', 'q-charm')
  await page.click('#openCharmMakerBtn')
  await page.waitForFunction(
    () =>
      Object.keys(window.stateManager?.getState()?.parameters || {}).length > 0,
    null,
    { timeout: 120000 }
  )
  for (let i = 0; i < 2; i++) {
    const notNow = page.getByRole('button', { name: 'Not now', exact: true })
    if (await notNow.isVisible().catch(() => false)) {
      await notNow.click()
      await page.waitForTimeout(300)
    }
  }
}

const layerState = (page) =>
  page.evaluate(() => {
    const p = window.stateManager?.getState()?.parameters || {}
    const nm = (v) => (v && typeof v === 'object' ? v.name : v)
    return {
      design: nm(p.design_file),
      layers: [1, 2, 3].map((n) => nm(p[`design_layer_${n}`])),
      aspects: [1, 2, 3].map((n) => p[`design_layer_${n}_aspect`]),
    }
  })

test.describe('A design built as a stack of passes (DP-7, DP-8)', () => {
  test('the charm declares three passes, and none is on by default', async ({
    page,
  }) => {
    await openCharm(page)
    const declared = await page.evaluate(() => {
      const p = window.stateManager?.getState()?.parameters || {}
      return Object.keys(p)
        .filter((k) => /^design_layer_\d(_aspect|_depth|_style)?$/.test(k))
        .sort()
    })
    // Three files, three aspects, three depths, three styles.
    expect(declared).toHaveLength(12)

    const before = await layerState(page)
    // Additive: the tiered mode is off until someone fills a pass in, so a
    // charm nobody has touched is the charm that shipped.
    expect(before.layers).toEqual(['', '', ''])
  })

  test('the generated companions are hidden from the Customizer', async ({
    page,
  }) => {
    await openCharm(page)
    // They carry values, never controls: the app writes them from the design,
    // and a person typing into one would be overwritten on the next change.
    for (const n of [1, 2, 3]) {
      await expect(page.locator(`#param-design_layer_${n}`)).toHaveCount(0)
      await expect(
        page.locator(`#param-design_layer_${n}_aspect`)
      ).toHaveCount(0)
    }
    // The pass controls a person DOES set are present.
    await expect(page.locator('#param-design_layer_1_depth')).toHaveCount(1)
    await expect(page.locator('#param-design_layer_1_style')).toHaveCount(1)
  })

  test('★ three nested squares become three passes, and the charm renders', async ({
    page,
  }) => {
    test.slow()
    await openCharm(page)
    await page.setInputFiles('#param-design_file', SQUARES)

    // All three passes arrive; the deepest is the slowest to appear because it
    // is written last.
    await expect
      .poll(async () => (await layerState(page)).layers.filter(Boolean).length, {
        timeout: 90000,
      })
      .toBe(3)

    const after = await layerState(page)
    expect(after.design).toBe('nested-squares.svg')
    expect(after.layers).toEqual([
      'nested-squares_layer_1.svg',
      'nested-squares_layer_2.svg',
      'nested-squares_layer_3.svg',
    ])
    // Every pass carries a measured aspect in the SAME state as its file
    // (D-108's law): a file whose companion has not caught up would be fitted
    // against the wrong ratio.
    for (const a of after.aspects) expect(a).toBeCloseTo(1, 2)

    // And the model builds from them. The engine is the judge here, not a
    // screenshot: a stack that does not close would not render at all.
    await expect(page.locator('text=Preview ready').first()).toBeVisible({
      timeout: 120000,
    })
  })

  test('the passes are written at their TRUE relative sizes', async ({
    page,
  }) => {
    test.slow()
    await openCharm(page)
    await page.setInputFiles('#param-design_file', SQUARES)
    await expect
      .poll(async () => (await layerState(page)).layers.filter(Boolean).length, {
        timeout: 90000,
      })
      .toBe(3)

    const geometry = await page.evaluate(() => {
      const p = window.stateManager?.getState()?.parameters || {}
      const read = (n) => {
        const v = p[`design_layer_${n}`]
        const text = atob(String(v.data).split(',')[1])
        const transform = /<g transform="([^"]*)"/.exec(text)[1]
        const d = / d="([^"]*)"/.exec(text)[1]
        const nums = d.match(/-?\d+(\.\d+)?/g).map(Number)
        const xs = nums.filter((_, i) => i % 2 === 0)
        return {
          transform,
          width: Math.max(...xs) - Math.min(...xs),
          canvas: /viewBox="([^"]*)"/.exec(text)[1],
        }
      }
      return [1, 2, 3].map(read)
    })

    // ONE transform across all three. OpenSCAD's resize() fits the CONTENT
    // box, so a per-pass fit would scale the smallest square up to the size
    // of the largest and the stack would print as three identical slabs.
    expect(new Set(geometry.map((g) => g.transform)).size).toBe(1)
    expect(new Set(geometry.map((g) => g.canvas)).size).toBe(1)

    // 36, 20 and 8 units wide in the drawing, and still in that proportion.
    expect(geometry[0].width).toBeCloseTo(36, 3)
    expect(geometry[1].width).toBeCloseTo(20, 3)
    expect(geometry[2].width).toBeCloseTo(8, 3)
  })

  test('changing a pass depth re-renders without disturbing the others', async ({
    page,
  }) => {
    test.slow()
    await openCharm(page)
    await page.setInputFiles('#param-design_file', SQUARES)
    await expect
      .poll(async () => (await layerState(page)).layers.filter(Boolean).length, {
        timeout: 90000,
      })
      .toBe(3)

    const before = await layerState(page)
    // The group ships collapsed, like every other parameter group.
    await page.evaluate(() => {
      document
        .getElementById('param-design_layer_2_depth')
        ?.closest('details')
        ?.setAttribute('open', '')
    })
    const depth = page.locator('#param-design_layer_2_depth')
    await expect(depth).toBeVisible({ timeout: 10000 })
    await depth.fill('1.5')
    await depth.dispatchEvent('change')
    await page.waitForTimeout(1500)

    const after = await layerState(page)
    // A depth dial moves geometry, never the files.
    expect(after.layers).toEqual(before.layers)
    await expect(page.locator('text=Preview ready').first()).toBeVisible({
      timeout: 120000,
    })
  })

  test('a pass depth below the 0.4 mm floor is not offered', async ({
    page,
  }) => {
    await openCharm(page)
    // The floor is a printability limit, not a preference: below it a pass
    // does not survive a 0.4 mm nozzle. The assert in the .scad is the real
    // guard; this checks the app does not invite the mistake.
    for (const n of [1, 2, 3]) {
      const min = await page
        .locator(`#param-design_layer_${n}_depth`)
        .getAttribute('min')
      expect(Number(min)).toBe(0.4)
    }
  })
})
