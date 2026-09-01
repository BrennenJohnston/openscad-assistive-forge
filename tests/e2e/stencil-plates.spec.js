/**
 * The stencil tile, end to end, on the owner's own drawing (DP-17).
 *
 * Three things this checks that nothing else can: that the app writes plate
 * files the engine can actually extrude, that the numeral cut with `text()`
 * comes out of the WASM build (which has to mount a font, and did not in a
 * fresh worktree), and that the whole set can be exported in one go.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import path from 'node:path'

const CAT = path.join(process.cwd(), 'tests', 'fixtures', 'harley', 'sketch4.svg')
const CAT_PNG = path.join(process.cwd(), 'tests', 'fixtures', 'harley', 'sketch4.png')

const engineErrors = (page) => {
  const seen = []
  page.on('console', (m) => {
    const text = m.text()
    // ★ Both words, and CASE MATTERS. The engine says WARNING: for things it
    // silently drops - an unsupported DXF entity - and a gate that captures
    // only ERROR: is blind to every one of them (D-123). Case-insensitively,
    // though, this also catches "Fontconfig error:", which the WASM build
    // prints on every run and which is not an OpenSCAD diagnostic at all.
    if (/\[OpenSCAD ERR\].*(ERROR|WARNING):/.test(text)) seen.push(text)
  })
  return seen
}

async function openStencil(page) {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
  await page.goto('/?example=stencil-maker')
  await page.waitForSelector('body[data-wasm-ready="true"]', { timeout: 240000 })
  await page
    .locator('.param-control')
    .first()
    .waitFor({ state: 'attached', timeout: 60000 })
}

/** Set a select or number parameter by its .scad name. */
async function setParam(page, name, value) {
  const control = page.locator(`#param-${name}`).first()
  await control.waitFor({ state: 'attached', timeout: 30000 })
  // Set it on the element rather than through the pointer: these controls sit
  // inside collapsible groups, and whether a group happens to be open is not
  // what this test is about.
  await control.evaluate((el, v) => {
    el.value = String(v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}

/** What the app has written into the tile's plate parameters. */
const plateState = (page) =>
  page.evaluate(() => {
    const p = window.stateManager?.getState()?.parameters || {}
    const name = (v) => (v && typeof v === 'object' ? v.name : v || null)
    return {
      design: name(p.design_file),
      plates: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => name(p[`stencil_plate_${n}`])),
      mode: p.stencil_mode,
      registration: p.registration,
    }
  })

test.describe('The Stencil Maker makes plates', () => {
  test('the tile offers eight plates, a jig and a numeral', async ({ page }) => {
    test.setTimeout(240000)
    await openStencil(page)
    // The plate files are companions: they get values, never controls.
    await expect(page.locator('#param-stencil_plate_1')).toHaveCount(0)
    for (const name of [
      'registration',
      'output_part',
      'peg_diameter',
      'hole_clearance',
      'plate_label',
      'plate_number',
    ]) {
      await expect(page.locator(`#param-${name}`), name).toHaveCount(1)
    }
  })

  test('★ the plate number is cut with text(), which means the engine has a font', async ({
    page,
  }) => {
    test.setTimeout(300000)
    const errors = engineErrors(page)
    await openStencil(page)
    // A fresh worktree has an EMPTY public/fonts, because npm ci does not run
    // prebuild. The engine then mounts nothing and text() cuts nothing, which
    // looks exactly like a modelling mistake.
    const fontLine = await page.evaluate(async () => {
      const r = await fetch('/fonts/LiberationSans-Regular.ttf')
      const buf = new Uint8Array(await r.arrayBuffer())
      return [buf[0], buf[1], buf[2], buf[3]].join(',')
    })
    // 0,1,0,0 is a TrueType header. 60,33,100,111 is "<!do", which is what a
    // dev server sends when the font is not there at all.
    expect(fontLine, 'the Liberation fonts are not mounted').toBe('0,1,0,0')
    expect(errors.join(' | ')).not.toMatch(/font/i)
  })

  test('the owner drawing becomes plates, and the set can be exported', async ({
    page,
  }) => {
    test.setTimeout(300000)
    const errors = engineErrors(page)
    await openStencil(page)

    await page.setInputFiles('#param-design_file', CAT)
    // The app parses the drawing, finds its regions and writes the plate files
    // into the SAME state update, so a plate is never one render behind its
    // design.
    await expect
      .poll(async () => (await plateState(page)).plates.filter(Boolean).length, {
        timeout: 180000,
      })
      .toBeGreaterThan(0)

    const state = await plateState(page)
    expect(state.design).toBe('sketch4.svg')
    expect(state.plates[0]).toBe('sketch4_plate_1.svg')

    await setParam(page, 'stencil_mode', 'layered')
    await setParam(page, 'registration', 'pegs')

    const exportRow = page.locator('#stencilSetExport')
    await expect(exportRow).toBeVisible({ timeout: 60000 })
    await expect(page.locator('#stencilSetExportInfo')).toContainText(
      /plate|plates/
    )
    const label = await page
      .locator('#exportStencilSetBtn')
      .getAttribute('aria-label')
    expect(label).toMatch(/Export all plates: \d+ files as a zip/)

    await page.waitForTimeout(3000)
    expect(errors, errors.join(' | ')).toEqual([])
  })

  test('★ the numeral really is cut, not just asked for', async ({ page }) => {
    test.setTimeout(400000)
    await openStencil(page)
    await page.setInputFiles('#param-design_file', CAT)
    await expect
      .poll(async () => (await plateState(page)).plates.filter(Boolean).length, {
        timeout: 180000,
      })
      .toBeGreaterThan(0)
    await setParam(page, 'stencil_mode', 'layered')

    // text() needs a font inside the engine, and the WASM build prints a
    // Fontconfig error on every run whether or not it has one. So the check
    // is not the console: it is whether the model comes out DIFFERENT with
    // the numeral asked for and not asked for. If they match, text() cut
    // nothing and the numeral is a promise the file does not keep.
    const triangles = async () => {
      await page.waitForFunction(
        () => /[\d,]+\s+triangles/.test(document.body.innerText),
        null,
        { timeout: 180000 }
      )
      const text = await page.evaluate(() => document.body.innerText)
      return Number(/([\d,]+)\s+triangles/.exec(text)[1].replace(/,/g, ''))
    }

    await setParam(page, 'plate_label', 'none')
    const without = await triangles()
    await setParam(page, 'plate_label', 'cut')
    await expect.poll(triangles, { timeout: 180000 }).not.toBe(without)
    const withNumeral = await triangles()
    expect(withNumeral, 'text() produced no geometry').toBeGreaterThan(without)
  })

  test('★ the coloured photograph becomes colours, and colours become plates', async ({
    page,
  }) => {
    test.setTimeout(400000)
    const errors = engineErrors(page)
    await openStencil(page)
    await page.setInputFiles('#param-design_file', CAT_PNG)

    // A raster file brings the ink panel with it.
    const colours = page.locator('input[type="radio"][value="colours"]')
    await colours.waitFor({ state: 'attached', timeout: 120000 })
    // Set on the element: the panel lives inside a disclosure, and whether it
    // happens to be open is not what this test is about.
    await colours.evaluate((el) => {
      el.checked = true
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })

    // Seven, because this picture has seven colours a person would name: its
    // outlines are a second, purer black than its fur.
    const count = page.locator('input[type="range"][id$="-colours"]')
    await count.evaluate((el) => {
      el.value = '7'
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })

    // The summary names every colour and its share, so a person can SEE that
    // a colour they wanted is missing and ask for one more.
    const summary = page.locator('.ink-controls-summary')
    await expect(summary).toContainText(/colours to paint, and the wall/, {
      timeout: 180000,
    })
    await expect(summary).toContainText(/%/)

    // The wall choice offers the colours that were actually found.
    const wall = page.locator('select[id$="-wall"]')
    await expect
      .poll(async () => wall.evaluate((el) => el.options.length), {
        timeout: 60000,
      })
      .toBeGreaterThan(1)

    // And the colours become plates, without an editor and without anybody
    // saying which region is which.
    await expect
      .poll(async () => (await plateState(page)).plates.filter(Boolean).length, {
        timeout: 180000,
      })
      .toBeGreaterThan(1)

    await page.waitForTimeout(2000)
    expect(errors, errors.join(' | ')).toEqual([])
  })

  // DP-26 P3, the crop-to-Colours join the owner picked at G0: colour from
  // the photo ITSELF. The crop exists (DP-5), the posterize lane exists
  // (DP-18); this walks the join between them - crop a reference photo,
  // press Use as design, and the cropped COPY (not the original) enters the
  // Colours flow.
  test('★ the crop feeds the Colours lane: a cropped photo becomes the design', async ({
    page,
  }) => {
    test.setTimeout(400000)
    await openStencil(page)
    const notNow = page.locator('#saveProjectNotNow')
    try {
      await notNow.waitFor({ state: 'visible', timeout: 5000 })
      await notNow.click()
    } catch {
      // no save prompt this time
    }

    // The Reference Image controls live inside collapsed disclosures; open
    // the chain rather than testing whether it happens to be open.
    await page.evaluate(() => {
      const input = document.getElementById('overlayFileInput')
      for (
        let d = input?.closest('details');
        d;
        d = d.parentElement?.closest('details')
      ) {
        d.open = true
      }
    })
    await page.setInputFiles('#overlayFileInput', CAT_PNG)

    const cropBtn = page.locator('#overlayCropBtn')
    await expect(cropBtn).toBeEnabled({ timeout: 30000 })
    // On the element, per this file's convention: the panel sits inside the
    // preview-settings drawer, and whether that drawer happens to be open
    // is not what this test is about.
    await cropBtn.evaluate((el) => el.click())

    // Keep the middle: half the width, half the height.
    await expect(page.locator('#cropImageModal')).toBeVisible()
    const half = async (id) => {
      const el = page.locator(`#${id}`)
      const max = Number(await el.getAttribute('max')) || 100
      await el.evaluate((input, v) => {
        input.value = String(v)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }, Math.round(max / 2))
    }
    await half('cropWidth')
    await half('cropHeight')
    await page.locator('#cropApplyBtn').click()

    // The copy became the overlay; the hand-over row follows it.
    await expect
      .poll(
        async () =>
          page.evaluate(
            () => document.getElementById('overlaySourceSelect')?.value || ''
          ),
        { timeout: 30000 }
      )
      .toContain('-crop')
    const useBtn = page.locator('#overlayUseAsDesignBtn')
    await expect
      .poll(
        async () =>
          page.evaluate(
            () => !document.getElementById('overlayUseRow')?.hidden
          ),
        { timeout: 30000 }
      )
      .toBe(true)
    await useBtn.evaluate((el) => el.click())

    // The join lands: the CROPPED copy is the design, and the photo route
    // opens the editor on it.
    await expect
      .poll(async () => (await plateState(page)).design || '', {
        timeout: 180000,
      })
      .toContain('-crop')
    await expect(page.locator('#drawingEditorSurface')).toBeVisible({
      timeout: 180000,
    })
  })
})