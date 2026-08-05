import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

// Folder import — copy path (entry B, webkitdirectory input).
//
// Regression for the reported keyguard failure: a >50-file folder is saved
// via batched storage, and loading it (which used to re-inline the whole
// map as one IndexedDB record and blow Chromium's per-value cap) must
// survive reload → Load. Uses #importFolderInput.setInputFiles(directory),
// which bypasses the showDirectoryPicker branch the button prefers.

const isCI = !!process.env.CI

const WASM_READY_TIMEOUT = 180_000

function makeProjectDir(fileCount) {
  const base = mkdtempSync(path.join(tmpdir(), 'forge-folder-'))
  const proj = path.join(base, 'TestKeyguard')
  mkdirSync(proj)
  writeFileSync(
    path.join(proj, 'main.scad'),
    'size = 10; // [5:40]\ncube([size, size, 2]);\n'
  )
  for (let i = 0; i < fileCount - 1; i++) {
    writeFileSync(path.join(proj, `companion-${i}.txt`), `// companion ${i}\n`)
  }
  return { base, proj }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
  })
})

async function gotoReady(page) {
  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  })
}

async function importFolder(page, dirPath) {
  await page.locator('#importFolderInput').setInputFiles(dirPath)
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('#welcomeScreen')).toBeHidden()
  const notNowBtn = page.locator('#saveProjectNotNow')
  try {
    await notNowBtn.waitFor({ state: 'visible', timeout: 3_000 })
    await notNowBtn.click()
  } catch {
    // Save-project modal did not appear; nothing to dismiss.
  }
}

async function backToWelcome(page) {
  await page.locator('#clearFileBtn').click()
  const confirmBtn = page.locator(
    '.confirm-dialog button.btn-primary, [data-action="confirm"]'
  )
  try {
    await confirmBtn.first().waitFor({ state: 'visible', timeout: 2_000 })
    await confirmBtn.first().click()
  } catch {
    // No confirmation dialog; already back.
  }
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 10_000 })
}

test.describe('folder import (copy path)', () => {
  test('60-file folder imports batched, survives reload, and re-loads from its card', async ({
    page,
  }) => {
    test.skip(isCI, 'WASM-heavy; covered locally like sibling suites')
    test.setTimeout(300_000)

    const { base, proj } = makeProjectDir(60)
    try {
      await gotoReady(page)
      await importFolder(page, proj)

      // Back to the welcome screen: exactly one card for the folder project
      await backToWelcome(page)
      const card = page.locator(
        '.saved-project-card:has-text("TestKeyguard")'
      )
      await expect(card).toHaveCount(1)

      // THE regression: reload the page, then Load the card. The old
      // touchProject re-inline path exploded here on large folders.
      await page.reload()
      await page.waitForSelector('body[data-wasm-ready="true"]', {
        state: 'attached',
        timeout: WASM_READY_TIMEOUT,
      })
      await expect(card).toHaveCount(1)
      await card.locator('.btn-load-project').click()
      await expect(page.locator('#mainInterface')).toBeVisible({
        timeout: 60_000,
      })
      await expect(page.locator('#welcomeScreen')).toBeHidden()
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  test('small folder (below the batching threshold) imports inline and re-loads', async ({
    page,
  }) => {
    test.skip(isCI, 'WASM-heavy; covered locally like sibling suites')
    test.setTimeout(300_000)

    const { base, proj } = makeProjectDir(10)
    try {
      await gotoReady(page)
      await importFolder(page, proj)
      await backToWelcome(page)

      const card = page.locator(
        '.saved-project-card:has-text("TestKeyguard")'
      )
      await expect(card).toHaveCount(1)
      await card.locator('.btn-load-project').click()
      await expect(page.locator('#mainInterface')).toBeVisible({
        timeout: 60_000,
      })
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })
})
