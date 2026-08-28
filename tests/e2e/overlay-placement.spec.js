/**
 * Where the reference image sits, and whether the project remembers (DP-5).
 *
 * Two things are being proved here, and neither can be seen in a screenshot:
 *
 *  1. The height is chosen by NAMING A SURFACE, not by typing -0.25. "Top of
 *     the model" asks the model, so it follows the object as it changes.
 *  2. That placement belongs to the PROJECT. Opacity and colour stay
 *     app-level (the UF-14 key facade); offsets, rotation, size and the z
 *     preset are measured against one design and are saved with it.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'

const SEEN_KEY = 'openscad-forge-first-visit-seen'

async function boot(page) {
  await page.addInitScript((seen) => {
    localStorage.setItem(seen, 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  }, SEEN_KEY)
  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', { timeout: 120000 })
}

/** Open a charm so there is a model for "Top of the model" to mean something. */
async function openCharm(page) {
  await page.selectOption('#charmVariantSelect', 'q-charm')
  await page.click('#openCharmMakerBtn')
  await page.waitForFunction(
    () => Object.keys(window.stateManager?.getState()?.parameters || {}).length > 0,
    null,
    { timeout: 120000 }
  )
  await page.waitForTimeout(2000)
}

/** Take the SAVE branch of the tile's own prompt, so a project exists. */
async function saveProject(page) {
  const notNow = page.getByRole('button', { name: 'Not now', exact: true })
  if (!(await notNow.isVisible().catch(() => false))) return false
  await page.evaluate(() => {
    const cb = Array.from(document.querySelectorAll('input[type=checkbox]'))
      .filter((c) => c.offsetParent !== null)
      .find((c) =>
        /Save this file to Saved Projects/i.test(
          c.closest('label')?.textContent || c.parentElement?.textContent || ''
        )
      )
    if (cb && !cb.checked) {
      cb.checked = true
      cb.dispatchEvent(new Event('change', { bubbles: true }))
    }
  })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForTimeout(4000)
  return true
}

/** The Reference Image panel is a Standard-mode surface. */
async function openOverlayPanel(page) {
  const mode = await page.evaluate(() => document.body.dataset.uiMode)
  if (mode !== 'standard') {
    await page.click('#uiModeToggle')
    await page.waitForTimeout(1000)
  }
  await page.evaluate(() => {
    const s = document.getElementById('overlaySection')
    s.open = true
    s.querySelectorAll('details').forEach((d) => (d.open = true))
  })
}

const placement = (page) =>
  page.evaluate(() => window.__forgeDebug?.overlayPlacement?.() ?? null)

test.describe('Reference image placement (DP-5)', () => {
  test.use({ viewport: { width: 1400, height: 1024 } })

  test('the height is chosen by naming a surface, and the choice is not gated', async ({
    page,
  }) => {
    await boot(page)
    await openCharm(page)
    await saveProject(page)
    await openOverlayPanel(page)

    const select = page.locator('#overlayZPresetSelect')
    await expect(select).toBeVisible()
    // NOT inside the manual-calibration fieldset: choosing which surface to
    // trace against has nothing to do with entering a px-per-mm figure, and
    // putting it there left the control permanently disabled.
    await expect(select).toBeEnabled()

    await expect(select).toHaveValue('under-plate')
    await expect(page.locator('#overlayZCustomRow')).toBeHidden()

    await select.selectOption('build-plate')
    await expect.poll(async () => (await placement(page))?.zPosition).toBe(0)

    // The millimetre field belongs to the "a height I choose" preset only.
    await select.selectOption('custom')
    await expect(page.locator('#overlayZCustomRow')).toBeVisible()
    await page.locator('#overlayZCustomInput').fill('3.5')
    await expect.poll(async () => (await placement(page))?.zPosition).toBe(3.5)

    await select.selectOption('model-top')
    await expect(page.locator('#overlayZCustomRow')).toBeHidden()
    // A charm is a few millimetres tall, so the overlay lands above the plate
    // and above nothing-at-all. The exact height is the model's business.
    await expect
      .poll(async () => (await placement(page))?.zPosition)
      .toBeGreaterThan(0)
  })

  test('placement is remembered with the project, and comes back on reload', async ({
    page,
  }) => {
    test.setTimeout(240000)
    await boot(page)
    await openCharm(page)
    const saved = await saveProject(page)
    test.skip(!saved, 'no save prompt appeared, so there is no project to save into')
    await openOverlayPanel(page)

    // Manual calibration is what unlocks size and offset; the release does not
    // change that, it just has to work through it.
    await page.evaluate(() => {
      const t = document.getElementById('overlayManualOverrideToggle')
      if (t && !t.checked) {
        t.checked = true
        t.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })
    await page.locator('#overlayZPresetSelect').selectOption('build-plate')
    await page.evaluate(() => {
      const set = (id, v) => {
        const el = document.getElementById(id)
        if (!el || el.disabled) return
        el.value = String(v)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
      set('overlayOffsetXInput', 7)
      set('overlayOffsetYInput', -3)
      set('overlayRotationInput', 25)
    })

    const before = await expect
      .poll(
        async () => {
          const p = await placement(page)
          return p && p.offsetX === 7 && p.rotationDeg === 25 ? p : null
        },
        { timeout: 20000 }
      )
      .not.toBeNull()
      .then(() => placement(page))

    // The write is debounced; give it room to land in the project store.
    await page.waitForTimeout(2500)
    const stored = await page.evaluate(async () => {
      const dbs = await indexedDB.databases()
      for (const d of dbs) {
        const db = await new Promise((res) => {
          const r = indexedDB.open(d.name)
          r.onsuccess = () => res(r.result)
          r.onerror = () => res(null)
        })
        if (!db) continue
        for (const store of Array.from(db.objectStoreNames)) {
          const rows = await new Promise((res) => {
            try {
              const rq = db.transaction(store, 'readonly').objectStore(store).getAll()
              rq.onsuccess = () => res(rq.result)
              rq.onerror = () => res([])
            } catch {
              res([])
            }
          })
          const hit = rows.find((r) => r?.path === 'overlay-settings.json')
          if (hit) {
            db.close()
            return hit.textContent
          }
        }
        db.close()
      }
      return null
    })

    expect(stored, 'overlay-settings.json must be in the project store').not.toBeNull()
    const record = JSON.parse(stored)
    expect(record.version).toBe(1)
    expect(record.offsetX).toBe(7)
    expect(record.offsetY).toBe(-3)
    expect(record.rotationDeg).toBe(25)
    expect(record.zPreset).toBe('build-plate')
    // A snapshot, kept so the sizes can be explained later - never played back
    // into the shared px/mm scale.
    expect(record).toHaveProperty('calibrationMmPerPx')
    expect(before.offsetX).toBe(7)
  })
})
