/**
 * E2E tests for the keyboard around saved projects: a card's buttons answer
 * Enter, every dialog here closes on Escape, and focus lands where a person
 * expects after each one, never on the page body: the first parameter after
 * the quick-access prompt, the same card after Edit, the card that takes a
 * deleted one's place, and Preview or Files after the file manager's dialogs.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import path from 'node:path'
import process from 'node:process'

const SAMPLE = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')

test.describe.configure({ timeout: 150_000 })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
  await page.goto('/')
  await page.waitForSelector('#welcomeScreen', { state: 'visible' })
})

/** Saves projects through the app's own module, then draws the list again. */
async function seedProjects(page) {
  await page.evaluate(async () => {
    const mod = await import('/src/js/saved-projects-manager.js')
    for (const name of ['Alpha', 'Beta', 'Gamma']) {
      const result = await mod.saveProject({
        name,
        originalName: `${name}.scad`,
        kind: 'scad',
        mainFilePath: `${name}.scad`,
        content: 'cube(10);',
      })
      if (!result.success) throw new Error(result.error)
    }
    const files = {
      'main.scad': 'include <parts.scad>\npart();',
      'parts.scad': 'module part() cube(5);',
    }
    const result = await mod.saveProject({
      name: 'Zipped',
      originalName: 'box.zip',
      kind: 'zip',
      mainFilePath: 'main.scad',
      content: files['main.scad'],
      projectFiles: files,
    })
    if (!result.success) throw new Error(result.error)
  })
  await page.reload()
  await page.waitForSelector('.saved-project-card', { state: 'visible' })
}

const cards = (page) => page.locator('#savedProjectsList .saved-project-card')

const cardNames = (page) =>
  page.locator('#savedProjectsList .saved-project-name').allTextContents()

/** What has focus: a project's control by class and project, else its tag. */
const focused = (page) =>
  page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return 'BODY'
    const card = el.closest('.saved-project-card')
    const name = card?.querySelector('.saved-project-name')?.textContent
    if (el.classList.contains('saved-project-card')) return `card ${name}`
    const kind =
      [
        'btn-load-project',
        'btn-manage-files',
        'btn-edit-project',
        'btn-download-project',
        'btn-delete-project',
      ].find((c) => el.classList.contains(c)) || ''
    return name ? `${kind} ${name}` : `${el.tagName}#${el.id}`
  })

async function uploadToPrompt(page) {
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 120_000,
  })
  await page.locator('#fileInput').setInputFiles(SAMPLE)
  await expect(page.locator('.save-project-modal')).toBeVisible({
    timeout: 60_000,
  })
}

/**
 * Whether focus is on the first parameter control a person can reach: the
 * first input on show, else the first group's heading when every group is
 * folded. Returns what has focus otherwise, to read in a failure.
 */
const onFirstParameter = (page) =>
  page.evaluate(() => {
    const container = document.getElementById('parametersContainer')
    const drawn = (el) => el.checkVisibility()
    const first =
      [
        ...container.querySelectorAll(
          'input:not([type="hidden"]), select, textarea'
        ),
      ].find(drawn) || [...container.querySelectorAll('summary')].find(drawn)
    const active = document.activeElement
    return first && active === first
      ? true
      : `${active.tagName}#${active.id} "${(active.textContent || '').trim().slice(0, 30)}"`
  })

test.describe('The quick-access prompt after a load', () => {
  test('Save leaves focus on the first parameter', async ({ page }) => {
    await uploadToPrompt(page)
    await page.locator('#saveProjectCheckbox').focus()
    await page.keyboard.press('Space')
    await page.locator('#saveProjectSave').focus()
    await page.keyboard.press('Enter')

    await expect(page.locator('.save-project-modal')).toHaveCount(0)
    await expect.poll(() => onFirstParameter(page)).toBe(true)
  })

  test('Escape is Not now, and leaves focus on the first parameter', async ({
    page,
  }) => {
    await uploadToPrompt(page)
    await page.keyboard.press('Escape')

    await expect(page.locator('.save-project-modal')).toHaveCount(0)
    await expect.poll(() => onFirstParameter(page)).toBe(true)
  })
})

test.describe('A saved project card', () => {
  test.beforeEach(async ({ page }) => {
    await seedProjects(page)
  })

  test('Edit answers Enter; Escape cancels; Save Changes comes back to the card', async ({
    page,
  }) => {
    const beta = cards(page).filter({ hasText: 'Beta' })
    await beta.locator('.btn-edit-project').focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.edit-project-modal')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator('.edit-project-modal')).toHaveCount(0)
    expect(await focused(page)).toBe('btn-edit-project Beta')

    await page.keyboard.press('Enter')
    await expect(page.locator('#editProjectName')).toBeFocused()
    await page.keyboard.type('Beta renamed')
    await page.locator('#editProjectSave').focus()
    await page.keyboard.press('Enter')

    await expect(page.locator('.edit-project-modal')).toHaveCount(0)
    await expect.poll(() => focused(page)).toBe('btn-edit-project Beta renamed')
  })

  test('Delete leaves focus on the card in its place, then the one before, then the note', async ({
    page,
  }) => {
    const names = await cardNames(page)
    expect(names).toHaveLength(4)

    // The second card: the third takes its place.
    await cards(page).nth(1).locator('.btn-delete-project').focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.confirm-modal')).toBeVisible()
    await page.locator('.confirm-modal button:has-text("Delete")').focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => cardNames(page)).toHaveLength(3)
    await expect.poll(() => focused(page)).toBe(`card ${names[2]}`)

    // The last card: the one before it.
    await cards(page).nth(2).locator('.btn-delete-project').focus()
    await page.keyboard.press('Enter')
    await page.locator('.confirm-modal button:has-text("Delete")').focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => cardNames(page)).toHaveLength(2)
    await expect.poll(() => focused(page)).toBe(`card ${names[2]}`)

    // Every card: the note that nothing is saved.
    for (let left = 2; left > 0; left -= 1) {
      await cards(page).first().locator('.btn-delete-project').focus()
      await page.keyboard.press('Enter')
      await page.locator('.confirm-modal button:has-text("Delete")').focus()
      await page.keyboard.press('Enter')
      await expect.poll(() => cardNames(page)).toHaveLength(left - 1)
    }
    await expect(page.locator('#savedProjectsEmpty')).toBeFocused()
  })

  test('the file preview and the file manager close on Escape, each back to its opener', async ({
    page,
  }) => {
    const files = cards(page).filter({ hasText: 'Zipped' }).locator('.btn-manage-files')
    await files.focus()
    await page.keyboard.press('Enter')
    const manager = page.locator('.file-manager-modal')
    await expect(manager).toBeVisible()

    const preview = manager.locator('.btn-preview-file').first()
    await preview.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#filePreviewTitle')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('#filePreviewTitle')).toHaveCount(0)
    await expect(preview).toBeFocused()
    await expect(manager).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(manager).toHaveCount(0)
    await expect(files).toBeFocused()
  })
})
