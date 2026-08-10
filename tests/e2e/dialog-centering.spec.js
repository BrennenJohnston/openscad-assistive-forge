import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

// U-1: native <dialog> elements opened with showModal() rendered in the top-left
// corner because reset.css's `* { margin: 0 }` destroyed the UA's
// `dialog { margin: auto }` centering. Three raw-dialog users share the fate:
// the folder main-.scad picker (.folder-scad-select-dialog), the preset import
// dialog (.import-mode-dialog) and the unsaved-preset prompt
// (.preset-import-mode-dialog).

const isCI = !!process.env.CI
const WASM_READY_TIMEOUT = 180_000

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
  })
})

async function expectCentered(page, locator) {
  const viewport = page.viewportSize()
  const box = await locator.boundingBox()
  expect(box, 'dialog must have a bounding box').not.toBeNull()
  const dialogCenterX = box.x + box.width / 2
  const dialogCenterY = box.y + box.height / 2
  expect(Math.abs(dialogCenterX - viewport.width / 2)).toBeLessThan(30)
  expect(Math.abs(dialogCenterY - viewport.height / 2)).toBeLessThan(30)
}

test('a raw showModal() dialog opens centered in the viewport', async ({
  page,
}) => {
  await page.goto('/')
  // Pure CSS check: the app stylesheet is enough; no WASM needed.
  await page.evaluate(() => {
    const dialog = document.createElement('dialog')
    dialog.className = 'folder-scad-select-dialog'
    dialog.id = 'centeringProbe'
    dialog.innerHTML = `
      <form method="dialog" class="import-mode-form">
        <h3 class="import-mode-title">Select main .scad file</h3>
        <fieldset class="import-mode-fieldset">
          <legend class="import-mode-legend">Select main .scad file</legend>
          <label class="import-mode-option">
            <input type="radio" name="scadFile" value="a" checked />
            <span>a.scad</span>
          </label>
        </fieldset>
        <div class="import-mode-actions">
          <button type="submit" value="ok" class="btn btn-primary">Import</button>
        </div>
      </form>`
    document.body.appendChild(dialog)
    dialog.showModal()
  })

  await expectCentered(page, page.locator('#centeringProbe'))

  // Native modal behavior the fix must not disturb: focus lands inside.
  const focusInside = await page.evaluate(() =>
    document.getElementById('centeringProbe').contains(document.activeElement)
  )
  expect(focusInside).toBe(true)
})

test('the folder-link main-.scad picker appears centered (real flow)', async ({
  page,
}) => {
  test.skip(isCI, 'WASM-heavy; covered locally like sibling folder suites')
  test.setTimeout(300_000)

  const base = mkdtempSync(path.join(tmpdir(), 'forge-dialog-'))
  const proj = path.join(base, 'TwoMains')
  mkdirSync(proj)
  writeFileSync(path.join(proj, 'holder.scad'), 'cube([10, 10, 2]);\n')
  writeFileSync(path.join(proj, 'lid.scad'), 'cylinder(h = 2, r = 6);\n')

  try {
    await page.goto('/')
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    })
    await page.locator('#importFolderInput').setInputFiles(proj)

    const dialog = page.locator('dialog.folder-scad-select-dialog')
    await expect(dialog).toBeVisible({ timeout: 30_000 })
    await expect(
      dialog.locator('.import-mode-option input[name="scadFile"]')
    ).toHaveCount(2)
    await expectCentered(page, dialog)

    await dialog.locator('button[value="ok"]').click()
    await expect(page.locator('#mainInterface')).toBeVisible({
      timeout: 60_000,
    })
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})
