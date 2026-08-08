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

// ── Multi-folder welcome screen (sub-plan H / R3c) ───────────────────────
//
// Real FileSystemDirectoryHandles come from OPFS (navigator.storage
// .getDirectory()): they structured-clone into IndexedDB, report
// queryPermission 'granted', and isSameEntry() works — so the list, the
// state badge and Remove all run against genuine handles rather than
// stand-ins.
//
// Deliberately NOT covered here: the native directory picker, which
// Playwright cannot open, and the permission-DENIED path, which OPFS
// cannot produce. Both stay manual. The model's handling of a revoked
// handle is covered in tests/unit/linked-folders-ui.test.js.

/**
 * @param {object} opts
 * @param {string[]} opts.folders folder names to create on "disk"
 * @param {string|null} opts.root which folder the root slot points at
 * @param {string[]} opts.linked which folders get a folder-link record
 */
async function seedLinkedFolders(page, opts) {
  await page.evaluate(
    async ({ folders, root, linked }) => {
      const opfs = await navigator.storage.getDirectory()
      const made = {}
      for (const name of folders) {
        made[name] = await opfs.getDirectoryHandle(name, { create: true })
      }

      const syncDb = await new Promise((res, rej) => {
        const r = indexedDB.open('openscad-forge-folder-sync', 1)
        r.onupgradeneeded = () => {
          if (!r.result.objectStoreNames.contains('handles')) {
            r.result.createObjectStore('handles')
          }
        }
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const stx = syncDb.transaction('handles', 'readwrite')
      const store = stx.objectStore('handles')
      store.clear()
      folders.forEach((name, i) => {
        if (linked.includes(name)) store.put(made[name], `fh-${i}`)
      })
      if (root) store.put(made[root], 'root')
      await new Promise((res, rej) => {
        stx.oncomplete = res
        stx.onerror = () => rej(stx.error)
      })
      syncDb.close()

      const projDb = await new Promise((res, rej) => {
        const r = indexedDB.open('openscad-forge-saved-projects', 2)
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const ptx = projDb.transaction('projects', 'readwrite')
      const projects = ptx.objectStore('projects')
      projects.clear()
      const now = Date.now()
      folders.forEach((name, i) => {
        if (!linked.includes(name)) return
        projects.put({
          id: `proj-${i}`,
          name,
          originalName: 'main.scad',
          kind: 'folder-link',
          folderRef: `fh-${i}`,
          mainFilePath: 'main.scad',
          content: '',
          projectFiles: null,
          notes: '',
          folderId: null,
          createdAt: now,
          updatedAt: now,
          lastModified: now,
          savedAt: now,
          lastLoadedAt: now,
          fileSummary: { fileCount: 1, totalBytes: 20 },
        })
      })
      await new Promise((res, rej) => {
        ptx.oncomplete = res
        ptx.onerror = () => rej(ptx.error)
      })
      projDb.close()
    },
    opts
  )
}

async function storedHandleKeys(page) {
  return page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('openscad-forge-folder-sync', 1)
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const keys = await new Promise((res, rej) => {
      const req = db
        .transaction('handles', 'readonly')
        .objectStore('handles')
        .getAllKeys()
      req.onsuccess = () => res(req.result)
      req.onerror = () => rej(req.error)
    })
    db.close()
    return keys
  })
}

test.describe('linked folders on the welcome screen', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'File System Access API + OPFS handles are Chromium-only'
  )

  const rows = (page) => page.locator('#linkedFoldersList li.linked-folder')

  async function setUp(page, opts) {
    await gotoReady(page)
    await seedLinkedFolders(page, opts)
    await page.reload()
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    })
    await expect(page.locator('#linkedFolders')).toBeVisible()
  }

  test('lists every linked folder, named after the folder on disk', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    await setUp(page, {
      folders: ['switch-mount', 'braille-tags'],
      root: 'switch-mount',
      linked: ['switch-mount', 'braille-tags'],
    })

    await expect(rows(page)).toHaveCount(2)
    await expect(rows(page).locator('.linked-folder-name')).toHaveText([
      'switch-mount',
      'braille-tags',
    ])
    // The root slot mirrors an already-listed folder: not a third row.
    await expect(
      page.locator('#linkedFoldersList li[data-folder-key="root"]')
    ).toHaveCount(0)
  })

  test('marks one folder active and never claims a connection it does not have', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    await setUp(page, {
      folders: ['switch-mount', 'braille-tags'],
      root: 'switch-mount',
      linked: ['switch-mount', 'braille-tags'],
    })

    const badges = page.locator('#linkedFoldersList .linked-folder-badge')
    await expect(badges).toHaveCount(1)
    // Permission has lapsed across the reload, and the pill says so — the
    // row must not disagree with it.
    await expect(badges).toHaveText('Needs permission')
    await expect(page.locator('#folderSyncStatusText')).toContainText(
      'switch-mount'
    )
    await expect(
      rows(page).filter({ hasText: 'switch-mount' })
    ).toHaveAttribute('data-active-state', 'pending-restore')
  })

  test('lists a pre-multi-folder root folder without asking the user to pick it again', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    await setUp(page, {
      folders: ['old-project'],
      root: 'old-project',
      linked: [], // no folder-link record exists: the legacy shape
    })

    await expect(rows(page)).toHaveCount(1)
    await expect(rows(page).locator('.linked-folder-name')).toHaveText(
      'old-project'
    )
    await expect(rows(page).locator('.linked-folder-hint')).toHaveText(
      'No project card yet'
    )
    await expect(page.locator('.saved-project-card')).toHaveCount(0)
  })

  test('keeps Connect Folder reachable while a folder is connected', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    await setUp(page, {
      folders: ['switch-mount'],
      root: 'switch-mount',
      linked: ['switch-mount'],
    })

    // Linking a SECOND folder has to stay possible.
    await expect(page.locator('#connectFolderBtn')).toBeVisible()
  })

  test('names each row button after its own folder', async ({ page }) => {
    test.setTimeout(240_000)
    await setUp(page, {
      folders: ['switch-mount', 'braille-tags'],
      root: 'switch-mount',
      linked: ['switch-mount', 'braille-tags'],
    })

    // Four buttons reading "Open"/"Remove" would be useless to a screen
    // reader sweeping the list.
    await expect(
      page.locator('#linkedFoldersList .linked-folder-open')
    ).toHaveText(['Open switch-mount', 'Open braille-tags'])
    await expect(
      page.locator('#linkedFoldersList .linked-folder-remove')
    ).toHaveText(['Remove switch-mount', 'Remove braille-tags'])
  })

  test('Remove asks first, and Cancel changes nothing', async ({ page }) => {
    test.setTimeout(240_000)
    await setUp(page, {
      folders: ['switch-mount', 'braille-tags'],
      root: 'switch-mount',
      linked: ['switch-mount', 'braille-tags'],
    })

    await page
      .locator('#linkedFoldersList li:has-text("braille-tags")')
      .locator('.linked-folder-remove')
      .click()

    const confirmModal = page.locator('.confirm-modal')
    await expect(confirmModal).toBeVisible()
    await expect(confirmModal.locator('#confirmDialogTitle')).toHaveText(
      'Remove folder link'
    )
    // The reassurance is the point: nothing on disk is touched.
    await expect(confirmModal.locator('#confirmDialogMessage')).toContainText(
      'Your files on disk are not touched'
    )
    await confirmModal.locator('[data-action="cancel"]').click()

    await expect(rows(page)).toHaveCount(2)
    expect(await storedHandleKeys(page)).toHaveLength(3)
  })

  test('removing a folder that is not active leaves the connection alone', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    await setUp(page, {
      folders: ['switch-mount', 'braille-tags'],
      root: 'switch-mount',
      linked: ['switch-mount', 'braille-tags'],
    })

    await page
      .locator('#linkedFoldersList li:has-text("braille-tags")')
      .locator('.linked-folder-remove')
      .click()
    await page.locator('.confirm-modal [data-action="confirm"]').click()

    await expect(rows(page)).toHaveCount(1)
    await expect(page.locator('#folderSyncStatus')).toBeVisible()
    await expect(page.locator('#folderSyncStatusText')).toContainText(
      'switch-mount'
    )
    // Its handle is gone; the active folder's and the root slot remain.
    expect((await storedHandleKeys(page)).sort()).toEqual(['fh-0', 'root'])
    // Focus must not fall back to <body> when the button disappears.
    await expect(
      page.locator('#linkedFoldersList .linked-folder-remove')
    ).toBeFocused()
  })

  test('removing the active folder disconnects as well', async ({ page }) => {
    test.setTimeout(240_000)
    await setUp(page, {
      folders: ['switch-mount', 'braille-tags'],
      root: 'switch-mount',
      linked: ['switch-mount', 'braille-tags'],
    })

    await page
      .locator('#linkedFoldersList li:has-text("switch-mount")')
      .locator('.linked-folder-remove')
      .click()
    await page.locator('.confirm-modal [data-action="confirm"]').click()

    await expect(rows(page)).toHaveCount(1)
    // Leaving the root slot behind would hydrate a folder that is no
    // longer listed on the next reload.
    await expect(page.locator('#folderSyncStatus')).toBeHidden()
    expect(await storedHandleKeys(page)).toEqual(['fh-1'])
  })

  test('opening a linked folder makes it the active one', async ({ page }) => {
    test.setTimeout(300_000)
    await gotoReady(page)
    await seedLinkedFolders(page, {
      folders: ['switch-mount', 'braille-tags'],
      root: 'switch-mount',
      linked: ['switch-mount', 'braille-tags'],
    })
    // Give the folder something to load.
    await page.evaluate(async () => {
      const opfs = await navigator.storage.getDirectory()
      const dir = await opfs.getDirectoryHandle('braille-tags')
      const file = await dir.getFileHandle('main.scad', { create: true })
      const w = await file.createWritable()
      await w.write('sphere(7);')
      await w.close()
    })
    await page.reload()
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    })

    await page
      .locator('#linkedFoldersList li:has-text("braille-tags")')
      .locator('.linked-folder-open')
      .click()

    await expect(page.locator('#mainInterface')).toBeVisible({
      timeout: 90_000,
    })
    // The watcher and write-back both resolve through getHandle(), so this
    // is what re-points them at the folder just opened.
    const active = await page.evaluate(async () => {
      const url = performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .find((n) => n.includes('/src/js/folder-sync-controller.js'))
      const mod = await import(url)
      const ctrl = mod.getFolderSyncController()
      return { name: ctrl.getHandle()?.name, state: ctrl.getState() }
    })
    expect(active).toEqual({ name: 'braille-tags', state: 'connected' })
  })
})

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
