/**
 * E2E tests for a project whose model reads a mesh from its own folder with
 * import(): the mesh has to reach the engine, from a folder and from a ZIP.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import JSZip from 'jszip'

const PROJECT = path.join(process.cwd(), 'tests', 'fixtures', 'mesh-companion')

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

async function dismissSavePrompt(page) {
  const notNow = page.locator('#saveProjectNotNow')
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3_000 })
    await notNow.click()
  } catch {
    // Not every load raises the save prompt
  }
}

// The fixture's cube is 12 triangles; a mesh that never arrived leaves none.
async function expectTheWholeCube(page) {
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-current/,
    { timeout: 90_000 }
  )
  await expect(page.locator('#previewStatusStats')).toContainText(
    '12 triangles'
  )
}

test.describe('A mesh the model imports', () => {
  test('reaches the engine from a folder', async ({ page }) => {
    await page.locator('#importFolderInput').setInputFiles(PROJECT)
    await dismissSavePrompt(page)
    await expectTheWholeCube(page)
  })

  test('reaches the engine from a ZIP', async ({ page }) => {
    const zip = new JSZip()
    zip.file('main.scad', fs.readFileSync(path.join(PROJECT, 'main.scad')))
    zip.file(
      'parts/cube.stl',
      fs.readFileSync(path.join(PROJECT, 'parts', 'cube.stl'))
    )
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })
    await page.locator('#fileInput').setInputFiles({
      name: 'mesh-companion.zip',
      mimeType: 'application/zip',
      buffer,
    })
    await dismissSavePrompt(page)
    await expectTheWholeCube(page)
  })
})
