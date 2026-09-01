/**
 * E2E tests for sharing the values on screen (IR-3).
 *
 * The round trip this pins is the one an organization like Makers Making
 * Change actually needs: send one link, the requester adjusts values, the
 * requester sends a link BACK carrying their exact settings, and the
 * organization opens it and sees those numbers.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// The clipboard is a browser-policy surface: Chromium wants a permission grant
// and Firefox does not accept one through the driver at all. Recording what the
// app asked to copy keeps the assertion about the app's behaviour on both
// engines. The failure path (prompt()) would block a test run, so the stub
// always succeeds - that path is exercised by hand, not here.
async function stubClipboard(page) {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
    window.__copied = []
    const write = async (text) => {
      window.__copied.push(String(text))
    }
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: write, readText: async () => window.__copied.at(-1) ?? '' },
      })
    } catch {
      // Some engines expose clipboard as a non-configurable getter; the copy
      // path then falls through to prompt(), which the tests below detect.
    }
    window.prompt = () => null
  })
}

async function openExample(page, exampleKey, fragment = '') {
  await page.goto(`/?example=${exampleKey}${fragment}`)
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
  const expandAll = page.locator('#expandAllGroupsBtn')
  if (await expandAll.isVisible().catch(() => false)) {
    await expandAll.click()
  }
}

async function setParameter(page, id, value) {
  const spinbox = page.locator(`#${id}-spinbox`)
  await expect(spinbox).toBeVisible({ timeout: 15000 })
  await spinbox.fill(String(value))
  await spinbox.dispatchEvent('change')
}

async function openActionsDrawer(page) {
  await page.locator('#actionsDrawerToggle').click()
}

const lastCopied = (page) => page.evaluate(() => window.__copied.at(-1) ?? null)

test.describe('Sharing the values on screen', () => {
  test.beforeEach(async ({ page }) => {
    await stubClipboard(page)
  })

  test('Copy Link carries the design and the changed values', async ({
    page,
  }) => {
    await openExample(page, 'simple-box')
    await setParameter(page, 'param-width', 72)
    await setParameter(page, 'param-height', 44)

    await openActionsDrawer(page)
    await page.locator('#copySettingsLinkBtn').click()

    const copied = await lastCopied(page)
    expect(copied, 'nothing was handed to the clipboard').not.toBeNull()
    expect(copied).toContain('example=simple-box')

    const fragment = copied.slice(copied.indexOf('#'))
    expect(fragment.startsWith('#v=1&params=')).toBe(true)
    const params = JSON.parse(
      decodeURIComponent(fragment.replace('#v=1&params=', ''))
    )
    // Only what differs from the design's own defaults travels.
    expect(params).toEqual({ width: 72, height: 44 })
  })

  test('the copied link reopens the design at those values', async ({
    page,
  }) => {
    await openExample(page, 'simple-box')
    await setParameter(page, 'param-width', 72)
    await setParameter(page, 'param-height', 44)
    await openActionsDrawer(page)
    await page.locator('#copySettingsLinkBtn').click()
    const copied = await lastCopied(page)

    await page.goto(copied)
    await page
      .locator('.param-control')
      .first()
      .waitFor({ state: 'attached', timeout: 60000 })

    await expect(page.locator('#param-width')).toHaveValue('72')
    await expect(page.locator('#param-height')).toHaveValue('44')
    await expect(page.locator('#param-depth')).toHaveValue('40')
  })

  test('the Publish link carries the settings only when asked', async ({
    page,
  }) => {
    await openExample(page, 'simple-box')
    await setParameter(page, 'param-width', 72)

    await openActionsDrawer(page)
    await page.locator('#publishProjectBtn').click()
    await expect(page.locator('#publishManifestOutput')).toBeVisible({
      timeout: 10000,
    })

    await page
      .locator('#publishRepoUrl')
      .fill('https://raw.githubusercontent.com/u/r/main/')

    const withoutSettings = await page.locator('#publishShareLink').inputValue()
    expect(withoutSettings).toContain('manifest=')
    expect(withoutSettings).not.toContain('params=')

    await page.locator('#publishIncludeSettings').check()
    const withSettings = await page.locator('#publishShareLink').inputValue()
    expect(withSettings).toContain('manifest=')
    expect(withSettings).toContain(encodeURIComponent('"width":72'))

    // Unticking puts it back: nothing sticky, nothing surprising.
    await page.locator('#publishIncludeSettings').uncheck()
    expect(await page.locator('#publishShareLink').inputValue()).toBe(
      withoutSettings
    )
  })

  test('the checkbox starts clear every time the dialog opens', async ({
    page,
  }) => {
    await openExample(page, 'simple-box')
    await openActionsDrawer(page)
    await page.locator('#publishProjectBtn').click()
    await page.locator('#publishIncludeSettings').check()
    await page.locator('#publishModalClose').click()

    await page.locator('#publishProjectBtn').click()
    await expect(page.locator('#publishIncludeSettings')).not.toBeChecked()
  })

  test('Download Project ZIP hands over the project, its manifest and its provenance', async ({
    page,
  }, testInfo) => {
    await openExample(page, 'multi-file-box')
    await setParameter(page, 'param-width', 66)

    await openActionsDrawer(page)
    await page.locator('#publishProjectBtn').click()
    await expect(page.locator('#downloadProjectZipBtn')).toBeVisible({
      timeout: 10000,
    })

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.locator('#downloadProjectZipBtn').click(),
    ])
    expect(download.suggestedFilename()).toBe('multi-file-box.zip')

    const target = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'forge-zip-')),
      'project.zip'
    )
    await download.saveAs(target)

    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(fs.readFileSync(target))
    const names = Object.keys(zip.files).filter((n) => !n.endsWith('/'))

    expect(names).toContain('main.scad')
    expect(names).toContain('utils/helpers.scad')
    expect(names).toContain('modules/lid.scad')
    expect(names).toContain('forge-manifest.json')
    expect(names).toContain('forge-provenance.json')

    const manifest = JSON.parse(
      await zip.file('forge-manifest.json').async('text')
    )
    // The archive ships the project UNPACKED, so its manifest names loose
    // files even though the project itself arrived as a ZIP.
    expect(manifest.files.main).toBe('main.scad')
    expect(manifest.files.bundle).toBeUndefined()
    const verdict = await page.evaluate(async (data) => {
      const mod = await import('/src/js/manifest-loader.js')
      return mod.validateManifest(data)
    }, manifest)
    expect(verdict.errors).toEqual([])

    const provenance = JSON.parse(
      await zip.file('forge-provenance.json').async('text')
    )
    expect(provenance.forgeProvenance).toBe('1.0')
    expect(provenance.parameters).toEqual({ width: 66 })
    expect(typeof provenance.generatedAt).toBe('string')
    expect(provenance.appVersion).toMatch(/\d+\.\d+/)

    testInfo.attach?.('provenance', {
      body: JSON.stringify(provenance, null, 2),
      contentType: 'application/json',
    })
  })

  test('a design opened from a local file says what its link can and cannot do', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      timeout: 90000,
    })

    await page.locator('#fileInput').setInputFiles({
      name: 'hand_made.scad',
      mimeType: 'text/plain',
      buffer: Buffer.from('depth = 12; // [5:40]\ncube([10, depth, 10]);\n'),
    })
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
      // no save prompt for this upload
    }

    await openActionsDrawer(page)
    await page.locator('#copySettingsLinkBtn').click()

    const copied = await lastCopied(page)
    expect(copied).not.toBeNull()
    // Nothing on the web can fetch a file from someone's computer, so the link
    // must not pretend to.
    expect(copied).not.toContain('example=')
    expect(copied).not.toContain('manifest=')

    await expect(page.locator('#statusArea')).toContainText(
      'carries your settings only',
      { timeout: 10000 }
    )
  })
})
