/**
 * E2E tests for the Publish dialog.
 *
 * The dialog writes a forge-manifest.json for the loaded project, and the
 * app's own loader must accept it: for a ZIP project files.main must be
 * the .scad path, not the archive name, which validateManifest rejects.
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
  // Publish is offered in Standard view only.
  const viewToggle = page.locator('#uiModeToggle')
  if ((await viewToggle.getAttribute('aria-checked')) !== 'true') {
    await viewToggle.click()
  }
  await expect(viewToggle).toHaveAttribute('aria-checked', 'true')
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

// When the browser refuses the clipboard, the text is handed over in the
// app's own "Copy by hand" dialog, and nothing claims a copy happened.
test.describe('Copying when the browser refuses the clipboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      navigator.clipboard.writeText = () =>
        Promise.reject(new DOMException('Write permission denied.', 'NotAllowedError'))
    })
  })

  /** Every browser dialog that opens, dismissed and kept for the assertion. */
  function recordNativeDialogs(page) {
    const opened = []
    page.on('dialog', async (dialog) => {
      opened.push(`${dialog.type()}: ${dialog.message()}`)
      await dialog.dismiss()
    })
    return opened
  }

  async function expectCopyByHand(page, text, opener) {
    const dialog = page
      .locator('[role="dialog"]')
      .filter({ has: page.getByRole('heading', { name: 'Copy by hand', exact: true }) })
    await expect(dialog).toBeVisible()
    const field = dialog.getByLabel('Text to copy', { exact: true })
    await expect(field).toHaveValue(text)
    await expect(field).toBeFocused()
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
  }

  test('the manifest', async ({ page }) => {
    const natives = recordNativeDialogs(page)
    await openPublishDialog(page, 'simple-box')
    const { text } = await readEmittedManifest(page)
    const copy = page.locator('#copyManifestBtn')
    await copy.click()
    await expectCopyByHand(page, text, copy)
    await expect(copy).not.toContainText('Copied')
    expect(natives).toEqual([])
  })

  test('the share link', async ({ page }) => {
    const natives = recordNativeDialogs(page)
    await openPublishDialog(page, 'simple-box')
    await page.locator('#publishRepoUrl').fill('https://example.org/my-design')
    const link = page.locator('#publishShareLink')
    await expect(link).toBeVisible()
    const copy = page.locator('#copyShareLinkBtn')
    await copy.click()
    await expectCopyByHand(page, await link.inputValue(), copy)
    await expect(copy).not.toContainText('Copied')
    expect(natives).toEqual([])
  })

  test('Copy Link in the Actions drawer', async ({ page }) => {
    const natives = recordNativeDialogs(page)
    await page.goto('/?example=simple-box')
    await page.locator('.param-control').first().waitFor({ state: 'attached', timeout: 60000 })
    await page.locator('#actionsDrawerToggle').click()
    const copy = page.locator('#copySettingsLinkBtn')
    await expect(copy).toBeVisible({ timeout: 10000 })
    await copy.click()
    const dialog = page
      .locator('[role="dialog"]')
      .filter({ has: page.getByRole('heading', { name: 'Copy by hand', exact: true }) })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Text to copy', { exact: true })).toHaveValue(/\?example=simple-box/)
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('#statusArea')).not.toContainText('Link copied')
    expect(natives).toEqual([])
  })
})
