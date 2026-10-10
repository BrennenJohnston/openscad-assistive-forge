/**
 * E2E tests for a model's `%` shapes, which no render includes: the preview
 * draws them see-through, where they sit in the model, as desktop
 * OpenSCAD's preview does.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import path from 'node:path'
import process from 'node:process'

const MODEL = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'background',
  'background.scad'
)

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 120_000,
  })
})

test('the % shapes are drawn see-through, where they sit', async ({ page }) => {
  await page.locator('#fileInput').setInputFiles(MODEL)
  const notNow = page.locator('#saveProjectNotNow')
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3_000 })
    await notNow.click()
  } catch {
    // Not every load raises the save prompt
  }
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-current/,
    { timeout: 90_000 }
  )
  // The body alone is a 20 mm cube: the render leaves the % shapes out.
  await expect(page.locator('#previewStatusStats')).toContainText(
    '12 triangles'
  )

  await expect
    .poll(
      () => page.evaluate(() => Boolean(window.previewManager.backgroundShapes)),
      { timeout: 60_000 }
    )
    .toBe(true)

  const drawn = await page.evaluate(() => {
    const pm = window.previewManager
    const box = (mesh) => {
      mesh.geometry.computeBoundingBox()
      const { min, max } = mesh.geometry.boundingBox
      return { min: [min.x, min.y, min.z], max: [max.x, max.y, max.z] }
    }
    const shapes = pm.backgroundShapes
    const colors = shapes.geometry.getAttribute('color')
    const alphas = new Set()
    for (let i = 3; i < colors.array.length; i += 4) {
      alphas.add(Math.round(colors.array[i] * 100) / 100)
    }
    return {
      body: box(pm.mesh.isMesh ? pm.mesh : pm.mesh.children[0]),
      shapes: box(shapes),
      colorSize: colors.itemSize,
      alphas: [...alphas].sort(),
      transparent: shapes.material.transparent,
    }
  })

  // Placed with the body: the same offsets as in the source. The 16-sided
  // sphere of radius 4 reaches 4 cos(pi/16) from its centre, not 4.
  const sphereReach = 4 * Math.cos(Math.PI / 16)
  const near = (a, b) => Math.abs(a - b) < 0.01
  expect(near(drawn.shapes.min[0] - drawn.body.min[0], 10 - sphereReach)).toBe(
    true
  )
  expect(near(drawn.shapes.max[0] - drawn.body.max[0], 34)).toBe(true)
  expect(near(drawn.shapes.min[2] - drawn.body.min[2], 0)).toBe(true)
  expect(near(drawn.shapes.max[2] - drawn.body.max[2], sphereReach - 2)).toBe(
    true
  )

  // See-through: the plug's own alpha, and desktop's gray for the rest.
  expect(drawn.colorSize).toBe(4)
  expect(drawn.transparent).toBe(true)
  expect(drawn.alphas).toEqual([0.35, 0.5])

  // The second render does not put "Rendering preview..." back.
  await expect(page.locator('#previewStatusText')).toHaveText('Preview ready')
})
