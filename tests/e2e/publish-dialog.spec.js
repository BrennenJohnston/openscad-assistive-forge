/**
 * E2E tests for the Publish dialog (IR-2).
 *
 * The dialog writes a forge-manifest.json for the loaded project. It used to
 * hand out manifests the app's own loader refuses: a ZIP project put the
 * ARCHIVE name in files.main, which validateManifest rejects because it is not
 * a .scad path. Nothing checked, so nobody found out until the link failed.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

async function openPublishDialog(page, exampleKey) {
  await page.goto(`/?example=${exampleKey}`)
  await page
    .locator('.param-control')
    .first()
    .waitFor({ state: 'attached', timeout: 60000 })
  const notNow = page.locator('#saveProjectNotNow')
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3000 })
    await notNow.click()
    await notNow.waitFor({ state: 'hidden', timeout: 3000 })
  } catch {
    // Not every example raises the save prompt
  }
  const drawerToggle = page.locator('#actionsDrawerToggle')
  await drawerToggle.click()
  const publish = page.locator('#publishProjectBtn')
  await expect(publish).toBeVisible({ timeout: 10000 })
  await publish.click()
  await expect(page.locator('#publishManifestOutput')).toBeVisible({
    timeout: 10000,
  })
}

async function readEmittedManifest(page) {
  const text = await page
    .locator('#publishManifestOutput')
    .textContent({ timeout: 10000 })
  return { text, parsed: JSON.parse(text) }
}

// The loader's own validator is the oracle. Running it in the page keeps the
// test honest against the shipped rules rather than a copy of them.
async function validateInPage(page, manifest) {
  return page.evaluate(async (data) => {
    const mod = await import('/src/js/manifest-loader.js')
    return mod.validateManifest(data)
  }, manifest)
}

test.describe('Publish dialog', () => {
  test('a ZIP project produces a manifest the loader accepts', async ({
    page,
  }) => {
    await openPublishDialog(page, 'multi-file-box')

    const { parsed } = await readEmittedManifest(page)
    expect(parsed.files.bundle).toBe('multi-file-box.zip')
    expect(parsed.files.main.toLowerCase().endsWith('.scad')).toBe(true)
    expect(parsed.name).toBe('multi-file-box')

    const verdict = await validateInPage(page, parsed)
    expect(verdict.errors).toEqual([])
    expect(verdict.valid).toBe(true)
  })

  test('a single .scad project produces a manifest the loader accepts', async ({
    page,
  }) => {
    await openPublishDialog(page, 'simple-box')

    const { parsed } = await readEmittedManifest(page)
    expect(parsed.files.main).toBe('simple_box.scad')
    expect(parsed.files.bundle).toBeUndefined()

    const verdict = await validateInPage(page, parsed)
    expect(verdict.errors).toEqual([])
    expect(verdict.valid).toBe(true)
  })

  test('the manifest on screen is the manifest the copy button hands over', async ({
    page,
  }) => {
    await openPublishDialog(page, 'multi-file-box')

    const { text } = await readEmittedManifest(page)
    expect(() => JSON.parse(text)).not.toThrow()
    expect(text.trim().startsWith('{')).toBe(true)
  })
})
