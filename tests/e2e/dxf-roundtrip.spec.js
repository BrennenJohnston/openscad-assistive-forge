/**
 * E2E tests for the DXF lane (IR-12).
 *
 * The partner pipelines this round exists to meet emit DXF as well as SVG, and
 * DXF is what a laser cutter's software usually wants back. Forge's own engine
 * is the converter: a one-line wrapper imports the drawing and re-emits it, so
 * there is no new parser and no new dependency.
 *
 * MEASURED through the real engine while this was written: DXF to SVG in
 * 273-324 ms, SVG back to DXF in 254-262 ms, extents exact at 40 x 25 mm. The
 * five-minute figure in the ledger (AF-7) is whole-model 3D PROJECTION, which
 * is a different operation; nothing here re-runs one.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures', 'dxf')
const KNOWN = path.join(FIXTURES, 'known-extents.dxf')
const TEXT_ONLY = path.join(FIXTURES, 'text-only.dxf')
// The owner's own Fusion sketch: 31 SPLINE, 2 ELLIPSE, 1 LINE (D-123).
const OWNER_SKETCH = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'harley',
  'sketch4.dxf'
)

/** The fixture's own declared size, read from the file the test ships with. */
function fixtureSize() {
  const lines = fs
    .readFileSync(KNOWN, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
  const corner = (marker) => {
    const at = lines.indexOf(marker)
    return [Number(lines[at + 2]), Number(lines[at + 4])]
  }
  const min = corner('$EXTMIN')
  const max = corner('$EXTMAX')
  return { width: max[0] - min[0], height: max[1] - min[1] }
}

/** The same reading, applied to whatever came out. */
function dxfSizeOf(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim())
  const corner = (marker) => {
    const at = lines.indexOf(marker)
    if (at === -1) return null
    return [Number(lines[at + 2]), Number(lines[at + 4])]
  }
  const min = corner('$EXTMIN')
  const max = corner('$EXTMAX')
  if (!min || !max) return null
  return { width: max[0] - min[0], height: max[1] - min[1] }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
    window.__announcements = []
    document.addEventListener('DOMContentLoaded', () => {
      const announcer = document.getElementById('srAnnouncer')
      if (!announcer) return
      new MutationObserver(() => {
        const text = announcer.textContent.trim()
        if (text) window.__announcements.push(text)
      }).observe(announcer, {
        childList: true,
        characterData: true,
        subtree: true,
      })
    })
  })
})

async function openDrawing(page, fixture) {
  await page.goto('/')
  // The engine has to be up before it can convert anything.
  await page.waitForSelector('body[data-wasm-ready="true"]', { timeout: 180000 })
  await page.locator('#accessibilitySpotlights > summary').click()
  await page.locator('#svgEditFileInput').setInputFiles(fixture)
}

const announcements = (page) =>
  page.evaluate(() => window.__announcements || [])

test.describe('DXF in, DXF out', () => {
  test('a DXF opens in the editor, converted by the engine', async ({
    page,
  }) => {
    test.setTimeout(300000)
    await openDrawing(page, KNOWN)

    await page
      .locator('.svg-prep-object')
      .first()
      .waitFor({ state: 'visible', timeout: 180000 })

    // The 40 x 25 rectangle and its 10 mm hole: two shapes.
    expect(await page.locator('.svg-prep-object').count()).toBeGreaterThan(1)

    // Converting is said out loud, both while it happens and when it lands.
    const said = (await announcements(page)).join(' ')
    expect(said).toMatch(/Converting known-extents\.dxf/)
    expect(said).toMatch(/converted in [\d.]+ seconds/)

    // No ink panel: a DXF is line work already, with nothing to decide.
    await expect(page.locator('.ink-controls')).toHaveCount(0)
    // Both ways out are offered.
    await expect(page.locator('button[data-action="save"]')).toBeVisible()
    await expect(page.locator('button[data-action="save-dxf"]')).toBeVisible()
  })

  // D-123 (DP-26 P2): OpenSCAD's importer reads none of this file's curved
  // entities, and before the fix 31 of its 34 vanished SILENTLY - the
  // editor showed three shapes and said nothing was missing. The curves
  // are evaluated to polylines before the engine sees the file.
  test('★ D-123: the owner sketch arrives whole - its curves, not just its line', async ({
    page,
  }) => {
    test.setTimeout(300000)
    await openDrawing(page, OWNER_SKETCH)
    await page
      .locator('.svg-prep-object')
      .first()
      .waitFor({ state: 'visible', timeout: 180000 })
    const shapes = await page.locator('.svg-prep-object').count()
    console.log('[dxf] owner sketch shapes in the editor:', shapes)
    expect(shapes).toBeGreaterThanOrEqual(30)
  })

  test('the drawing comes back as DXF, at a size the app states out loud', async ({
    page,
  }, testInfo) => {
    test.setTimeout(300000)
    await openDrawing(page, KNOWN)
    await page
      .locator('.svg-prep-object')
      .first()
      .waitFor({ state: 'visible', timeout: 180000 })

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 180000 }),
      page.locator('button[data-action="save-dxf"]').click(),
    ])
    expect(download.suggestedFilename()).toBe('known-extents-edited.dxf')

    const target = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'forge-dxf-')),
      'out.dxf'
    )
    await download.saveAs(target)
    const saved = fs.readFileSync(target, 'utf8')

    expect(saved).toContain('SECTION')
    expect(saved).toContain('AC1009')

    const source = fixtureSize()
    const result = dxfSizeOf(saved)
    console.log(
      '[dxf] source mm:', JSON.stringify(source),
      '| saved mm:', JSON.stringify(result)
    )
    expect(result).not.toBeNull()

    // The conversion itself is exact - measured, twice, at 40 x 25 both ways.
    // A round trip through the EDITOR's flatten is not: it came back 40.3 by
    // 25.35 on this fixture. The tolerance below is that measurement plus
    // room, and the size is announced precisely BECAUSE it is not exact.
    expect(Math.abs(result.width - source.width)).toBeLessThan(1)
    expect(Math.abs(result.height - source.height)).toBeLessThan(1)

    const said = (await announcements(page)).join(' ')
    expect(said).toMatch(/known-extents-edited\.dxf saved/)
    expect(said).toMatch(/It measures [\d.]+ by [\d.]+ millimetres/)

    testInfo.attach?.('saved.dxf', { body: saved, contentType: 'text/plain' })
  })

  test('the same drawing can leave as SVG instead', async ({ page }) => {
    test.setTimeout(300000)
    await openDrawing(page, KNOWN)
    await page
      .locator('.svg-prep-object')
      .first()
      .waitFor({ state: 'visible', timeout: 180000 })

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120000 }),
      page.locator('button[data-action="save"]').click(),
    ])
    expect(download.suggestedFilename()).toBe('known-extents-edited.svg')
  })

  test('a DXF with nothing importable in it is refused in plain words', async ({
    page,
  }) => {
    test.setTimeout(300000)
    await openDrawing(page, TEXT_ONLY)

    // OpenSCAD's DXF import reads drawing entities, not annotation entities,
    // so a file made only of TEXT arrives empty. Saying so is the point.
    const toast = page.locator('.toast, [role="alert"]', {
      hasText: 'could not find any shapes',
    })
    await expect(toast.first()).toBeVisible({ timeout: 180000 })
    await expect(page.locator('.svg-prep-object')).toHaveCount(0)

    const said = (await announcements(page)).join(' ')
    expect(said).toMatch(/text or dimension entities/)
  })
})
