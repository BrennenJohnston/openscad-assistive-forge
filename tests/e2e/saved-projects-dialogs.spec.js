import { test, expect } from '@playwright/test'
import { attachInvariants, expectNoNativeDialog } from './helpers/invariants.js'

// The questions the saved projects ask (a folder's new name, a project
// file's new name, a new folder, and each delete) are the app's own dialogs:
// a visible label on the field, Enter and Escape, and afterwards focus on the
// renamed item or the row now in a deleted one's place, never the page body.
// Folders and a multi-file project are written straight into the browser's
// storage through the app's own module, then the page is opened again.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

async function seed(page, { folders = [], project = null } = {}) {
  await page.goto('/')
  await page.waitForSelector('#welcomeScreen', { state: 'visible' })
  await page.evaluate(
    async ({ folders, project }) => {
      const manager = await import('/src/js/saved-projects-manager.js')
      for (const name of folders) {
        const result = await manager.createFolder({ name })
        if (!result.success) throw new Error(result.error)
      }
      if (project) {
        const result = await manager.saveProject(project)
        if (!result.success) throw new Error(result.error)
      }
    },
    { folders, project }
  )
  await page.reload()
  await page.waitForSelector('#welcomeScreen', { state: 'visible' })
}

async function focusedElement(page) {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return 'BODY'
    return {
      tag: el.tagName.toLowerCase(),
      cls: el.className,
      label: el.getAttribute('aria-label'),
      folder: el.dataset.folder ?? el.closest('[data-folder-id]')?.dataset.folderId ?? null,
      path: el.dataset.path ?? null,
      inTree: Boolean(el.closest('#fmTree')),
      inList: Boolean(el.closest('#savedProjectsContainer')),
    }
  })
}

function appDialog(page, title) {
  return page
    .locator('[role="dialog"], [role="alertdialog"]')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
}

function folderRow(page, name) {
  return page.locator('.folder-item').filter({ hasText: name })
}

test('a saved folder is renamed and deleted through the app’s own dialogs', async ({ page }) => {
  attachInvariants(page)
  await seed(page, { folders: ['Gears', 'Hinges'] })
  await expect(folderRow(page, 'Gears')).toBeVisible({ timeout: 30_000 })

  await folderRow(page, 'Gears').locator('.btn-rename-folder').click()
  const rename = appDialog(page, 'Rename Folder')
  await expect(rename).toBeVisible()
  const field = rename.getByLabel('Folder name', { exact: true })
  await expect(field).toBeFocused()
  await expect(field).toHaveValue('Gears')
  await field.fill('Gear trains')
  await field.press('Enter')
  await expect(rename).toHaveCount(0)
  await expect(folderRow(page, 'Gear trains')).toBeVisible()
  await expect
    .poll(() => focusedElement(page))
    .toMatchObject({ cls: expect.stringContaining('btn-rename-folder'), inList: true })

  await folderRow(page, 'Gear trains').locator('.btn-delete-folder').click()
  const remove = appDialog(page, 'Delete Folder')
  await expect(remove).toBeVisible()
  await expect(remove).toContainText('Delete the folder "Gear trains"?')
  await remove.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(remove).toHaveCount(0)
  await expect(folderRow(page, 'Gear trains')).toHaveCount(0)
  await expect.poll(() => focusedElement(page)).toMatchObject({ inList: true })

  expectNoNativeDialog(page)
})

test('a project’s files are renamed, added and deleted through the app’s own dialogs', async ({ page }) => {
  attachInvariants(page)
  await seed(page, {
    project: {
      name: 'Box kit',
      originalName: 'box-kit.zip',
      kind: 'zip',
      mainFilePath: 'main.scad',
      content: 'cube(10);',
      projectFiles: {
        'main.scad': 'cube(10);',
        'lid.scad': 'cube(5);',
        'notes.txt': 'a note',
        'parts/hinge.scad': 'cube(2);',
      },
    },
  })
  const card = page.locator('.saved-project-card').filter({ hasText: 'Box kit' })
  await expect(card).toBeVisible({ timeout: 30_000 })
  await card.locator('.btn-manage-files').click()
  const manager = page.locator('[role="dialog"]').filter({ has: page.locator('#fmTree') })
  await expect(manager).toBeVisible()
  const tree = manager.locator('#fmTree')

  // New folder: the button lives outside the redrawn tree, so focus comes back to it.
  await manager.locator('#addFolderToProjectBtn').click()
  const create = appDialog(page, 'New Folder')
  await expect(create).toBeVisible()
  await expect(create.getByLabel('Folder name', { exact: true })).toBeFocused()
  await create.getByLabel('Folder name', { exact: true }).fill('docs')
  await create.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(tree.locator('.file-nav-folder-row', { hasText: 'docs' })).toBeVisible()
  await expect(manager.locator('#addFolderToProjectBtn')).toBeFocused()

  // Escape closes the question and leaves the file manager open.
  await tree.locator('.btn-rename-project-file[data-path="notes.txt"]').click()
  const renameFile = appDialog(page, 'Rename File')
  await expect(renameFile.getByLabel('New name', { exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(renameFile).toHaveCount(0)
  await expect(manager).toBeVisible()
  await expect(tree.locator('.btn-rename-project-file[data-path="notes.txt"]')).toBeFocused()

  await tree.locator('.btn-rename-project-file[data-path="notes.txt"]').click()
  await expect(renameFile.getByLabel('New name', { exact: true })).toHaveValue('notes.txt')
  await renameFile.getByLabel('New name', { exact: true }).fill('readme.txt')
  await renameFile.getByLabel('New name', { exact: true }).press('Enter')
  await expect(tree.locator('.file-manager-item[data-path="readme.txt"]')).toBeVisible()
  await expect.poll(() => focusedElement(page)).toMatchObject({ path: 'readme.txt', inTree: true })

  await tree.locator('.btn-rename-project-folder[data-folder="parts"]').click()
  const renameFolder = appDialog(page, 'Rename Folder')
  await expect(renameFolder.getByLabel('Folder name', { exact: true })).toHaveValue('parts')
  await renameFolder.getByLabel('Folder name', { exact: true }).fill('pieces')
  await renameFolder.getByRole('button', { name: 'Rename', exact: true }).click()
  await expect(tree.locator('.btn-rename-project-folder[data-folder="pieces"]')).toBeVisible()
  await expect.poll(() => focusedElement(page)).toMatchObject({ folder: 'pieces', inTree: true })

  await tree.locator('.btn-delete-project-file[data-path="lid.scad"]').click()
  const deleteFile = appDialog(page, 'Delete File')
  await expect(deleteFile).toContainText('Delete "lid.scad"? This cannot be undone.')
  await deleteFile.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(tree.locator('.file-manager-item[data-path="lid.scad"]')).toHaveCount(0)
  await expect.poll(() => focusedElement(page)).toMatchObject({ inTree: true })

  await tree.locator('.btn-delete-project-folder[data-folder="pieces"]').click()
  const deleteFolder = appDialog(page, 'Delete Folder')
  await expect(deleteFolder).toContainText('Delete the folder "pieces" and its 1 file? This cannot be undone.')
  await deleteFolder.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(tree.locator('.btn-delete-project-folder[data-folder="pieces"]')).toHaveCount(0)
  await expect.poll(() => focusedElement(page)).toMatchObject({ inTree: true })

  expectNoNativeDialog(page)
})

const foldersProject = {
  name: 'Parts kit',
  originalName: 'parts-kit.zip',
  kind: 'zip',
  mainFilePath: 'main.scad',
  content: 'cube(10);',
  projectFiles: {
    'main.scad': 'cube(10);',
    'parts/hinge.scad': 'cube(2);',
    'parts/deep/pin.scad': 'cube(1);',
    'docs/.folder': '',
  },
}

async function openFileManager(page) {
  await seed(page, { project: foldersProject })
  const card = page.locator('.saved-project-card').filter({ hasText: 'Parts kit' })
  await expect(card).toBeVisible({ timeout: 30_000 })
  await card.locator('.btn-manage-files').click()
  const manager = page.locator('[role="dialog"]').filter({ has: page.locator('#fmTree') })
  await expect(manager).toBeVisible()
  return manager
}

/** The folder row or crumb that has focus, by what it opens. */
function focusedPlace(page) {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return 'BODY'
    if (el.dataset.folderEnter) return `row ${el.dataset.folderEnter}`
    if (el.classList.contains('file-nav-breadcrumb-btn')) return `crumb ${el.getAttribute('aria-label')}`
    if (el.dataset.path) return `file ${el.dataset.path}`
    return `${el.tagName.toLowerCase()} ${el.className}`
  })
}

test('a folder row’s Rename and Delete answer Enter and Space, not the row', async ({ page }) => {
  attachInvariants(page)
  const manager = await openFileManager(page)
  const tree = manager.locator('#fmTree')

  await tree.locator('.btn-rename-project-folder[data-folder="parts"]').focus()
  await page.keyboard.press('Enter')
  const rename = appDialog(page, 'Rename Folder')
  await expect(rename).toBeVisible()
  await expect(rename.getByLabel('Folder name', { exact: true })).toHaveValue('parts')
  await page.keyboard.press('Escape')
  await expect(rename).toHaveCount(0)
  await expect(tree.locator('.btn-rename-project-folder[data-folder="parts"]')).toBeFocused()

  await tree.locator('.btn-delete-project-folder[data-folder="parts"]').focus()
  await page.keyboard.press(' ')
  const remove = appDialog(page, 'Delete Folder')
  await expect(remove).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(remove).toHaveCount(0)
  await expect(tree.locator('.btn-delete-project-folder[data-folder="parts"]')).toBeFocused()
  await expect(manager.locator('#fmBreadcrumbs')).toHaveText('')

  expectNoNativeDialog(page)
})

test('moving between a project’s folders keeps focus in the file manager', async ({ page }) => {
  attachInvariants(page)
  const manager = await openFileManager(page)
  const tree = manager.locator('#fmTree')
  const crumbs = manager.locator('#fmBreadcrumbs')

  // In: the first row of the folder opened.
  await tree.locator('.file-nav-folder-row[data-folder-enter="parts"]').focus()
  await page.keyboard.press('Enter')
  await expect(crumbs).toContainText('parts')
  await expect.poll(() => focusedPlace(page)).toBe('row deep')

  // Up by Escape on a folder row: the row of the folder just left.
  await page.keyboard.press('Escape')
  await expect(crumbs).toHaveText('')
  await expect(manager).toBeVisible()
  await expect.poll(() => focusedPlace(page)).toBe('row parts')

  // Up by the breadcrumb: the same.
  await page.keyboard.press('Enter')
  await expect.poll(() => focusedPlace(page)).toBe('row deep')
  await crumbs.getByRole('button', { name: 'Navigate to root' }).focus()
  await page.keyboard.press('Enter')
  await expect(crumbs).toHaveText('')
  await expect.poll(() => focusedPlace(page)).toBe('row parts')

  // An empty folder has no row to land on: its own breadcrumb says where focus is.
  await tree.locator('.file-nav-folder-row[data-folder-enter="docs"]').focus()
  await page.keyboard.press('Enter')
  await expect(crumbs).toContainText('docs')
  await expect.poll(() => focusedPlace(page)).toBe('crumb Navigate to docs')

  expectNoNativeDialog(page)
})
