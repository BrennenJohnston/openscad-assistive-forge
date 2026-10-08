/**
 * Every item of File > Export can be clicked with a real pointer.
 *
 * The File menu's body scrolls, and Export opens inline inside it. These
 * cases open both with the mouse at common window sizes and check, at the
 * centre of each Export item, that the item itself is what a click there
 * would hit, not the overlay that closes the menu.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import path from 'path'
import { attachInvariants, expectNoPageErrors } from './helpers/invariants.js'

const SIZES = [
  { width: 1920, height: 889 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

async function loadFixture(page) {
  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 120_000,
  })
  await page.setInputFiles(
    '#fileInput',
    path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
  )
  await page.waitForSelector('.param-control', {
    state: 'attached',
    timeout: 30_000,
  })
  const notNow = page.locator('#saveProjectNotNow')
  if (await notNow.isVisible().catch(() => false)) {
    await notNow.click()
  }
  // The menu bar is hidden in the Simplified interface mode.
  await page.locator('#uiModeToggle').click()
  await expect(page.locator('#fileMenuBtn')).toBeVisible()
}

async function clickCentre(page, locator) {
  const box = await locator.boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

async function openExport(page) {
  await clickCentre(page, page.locator('#fileMenuBtn'))
  await expect(page.locator('#fileMenuModal')).not.toHaveClass(/hidden/)
  const trigger = page
    .locator('#fileMenuItems .menu-submenu-trigger')
    .filter({ has: page.getByText('Export', { exact: true }) })
  await clickCentre(page, trigger)
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  return page.locator(`#${await trigger.getAttribute('aria-controls')}`)
}

/** What a click at the centre of each item would land on. */
function readHits(list) {
  return list.evaluate((ul) =>
    [...ul.querySelectorAll('[role^="menuitem"]')].map((item) => {
      const r = item.getBoundingClientRect()
      const hit = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2
      )
      return {
        label: item.querySelector('.menu-item-label')?.textContent.trim(),
        reachable: !!hit && (hit === item || item.contains(hit)),
      }
    })
  )
}

test.describe('File > Export by pointer', () => {
  for (const size of SIZES) {
    test(`every Export item is under the pointer at ${size.width} x ${size.height}`, async ({
      page,
    }) => {
      attachInvariants(page)
      await page.setViewportSize(size)
      await loadFixture(page)
      const list = await openExport(page)
      const hits = await readHits(list)
      expect(hits.length).toBeGreaterThan(10)
      expect(hits.filter((h) => !h.reachable).map((h) => h.label)).toEqual([])
      expectNoPageErrors(page)
    })
  }

  test('a pointer click on Export as DXF reaches the export', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    attachInvariants(page)
    await page.setViewportSize(SIZES[0])
    await loadFixture(page)
    const list = await openExport(page)
    const dxf = list
      .locator('[role="menuitem"]')
      .filter({ has: page.getByText('Export as DXF…', { exact: true }) })
    await clickCentre(page, dxf)
    // The fixture is a 3D model, so a DXF needs the approximate outline,
    // and the export asks first.
    const ask = page.getByRole('alertdialog', {
      name: 'Generate approximate DXF?',
    })
    await expect(ask).toBeVisible({ timeout: 180_000 })
    await ask.getByRole('button', { name: 'Cancel' }).click()
    await expect(ask).toBeHidden()
    expectNoPageErrors(page)
  })
})
