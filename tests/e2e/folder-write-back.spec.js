/**
 * E2E tests for saving into the connected folder (IR-5).
 *
 * WHAT THIS CAN AND CANNOT PROVE, stated up front.
 *
 * The File System Access API's directory picker cannot be opened by a test,
 * and a handle seeded into IndexedDB comes back from a reload as "Needs
 * permission" - the app correctly refuses to claim a connection it does not
 * have. So no automated test can reach the state where a real folder is live
 * AND the watcher is running. That is why IR-Q11 makes the flag's activation
 * an OWNER-WITNESSED test, and why this file covers the two halves a machine
 * genuinely can:
 *
 *   1. With the flag dark - which is the shipped default - none of the saving
 *      affordances exist. Proven in the real app.
 *   2. The write paths themselves, driven against REAL OPFS directory handles:
 *      the bytes land at the right path, the main design is left alone, and
 *      the watcher is told before and after every write so the loop cannot
 *      feed itself.
 *
 * The owner's walk covers what is left: a real folder, a real grant, a real
 * editor watching. It is written into the round's return package.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'

const WASM_READY_TIMEOUT = 180_000

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

async function openApp(page, query = '') {
  await page.goto(`/${query}`)
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  })
}

/** Open the app with a project loaded, so the actions area is on screen. */
async function openProject(page) {
  await page.goto('/?example=simple-box')
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
    // This example does not always raise the save prompt
  }
}

test.describe('Saving into the connected folder', () => {
  test('with the flag dark - the shipped default - nothing offers to write', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    // With a project open, so the actions area itself is on screen: asserting
    // "hidden" on a welcome screen where the whole bar is absent would pass
    // for the wrong reason.
    await openProject(page)

    await expect(page.locator('#saveToFolderBtn')).toBeHidden()
    await expect(page.locator('#companionSaveToFolderBtn')).toBeHidden()
  })

  test('the dark-flag assertion can actually fail', async ({ page }) => {
    test.setTimeout(240_000)
    await openProject(page)

    // Sabotage: reinstate the thing the test above forbids, and watch the
    // same assertion catch it. A guard nobody has seen fail is a guess.
    await page.evaluate(() => {
      document.getElementById('saveToFolderBtn')?.classList.remove('hidden')
    })
    await expect(page.locator('#saveToFolderBtn')).toBeVisible()
  })

  test.describe('the write paths, against real folder handles', () => {
    test.skip(
      ({ browserName }) => browserName !== 'chromium',
      'File System Access API + OPFS handles are Chromium-only'
    )

    test('companions land in the folder, the design does not, and the watcher is told', async ({
      page,
    }) => {
      test.setTimeout(240_000)
      await openApp(page)

      const result = await page.evaluate(async () => {
        const { FolderWriteBack } = await import(
          '/src/js/folder-write-back.js'
        )
        const { createFolderSaveActions } = await import(
          '/src/js/folder-save-actions.js'
        )

        // A real directory handle: OPFS ones behave like picked ones for
        // everything except the grant.
        const opfs = await navigator.storage.getDirectory()
        const root = await opfs.getDirectoryHandle('ir5-writeback', {
          create: true,
        })
        // Start from a known state, so a rerun cannot read a stale file.
        for await (const name of root.keys()) {
          await root.removeEntry(name, { recursive: true }).catch(() => {})
        }
        const design = await root.getFileHandle('main.scad', { create: true })
        const w = await design.createWritable()
        await w.write('// the design as the other tool left it\n')
        await w.close()

        // A watcher stand-in that records the self-write contract calls.
        const watcherCalls = []
        const watcher = {
          beginSelfWrite: (p) => watcherCalls.push(['begin', p]),
          endSelfWrite: (p, stats) =>
            watcherCalls.push(['end', p, stats ? 'stats' : 'null']),
        }

        const writeBack = new FolderWriteBack({
          getHandle: () => root,
          getWatcher: () => watcher,
        })
        const announced = []
        const actions = createFolderSaveActions({
          getWriteBack: () => writeBack,
          isEnabled: () => true,
          announce: (m) => announced.push(m),
          onStatus: () => {},
        })

        const saved = await actions.saveCompanions({
          projectFiles: new Map([
            ['main.scad', '// EDITED BY FORGE - must not be written'],
            ['openings.txt', 'row1\nrow2\n'],
            ['parts/logo.svg', '<svg/>'],
          ]),
          mainFilePath: 'main.scad',
        })

        const exported = await actions.saveExport({
          fileName: 'main-abc123.stl',
          data: 'SOLID',
          mainFilePath: 'main.scad',
        })

        // Read back what is actually on "disk".
        const read = async (path) => {
          const parts = path.split('/')
          let dir = root
          for (let i = 0; i < parts.length - 1; i++) {
            dir = await dir.getDirectoryHandle(parts[i])
          }
          const handle = await dir.getFileHandle(parts[parts.length - 1])
          return (await handle.getFile()).text()
        }

        return {
          saved,
          exported,
          announced,
          watcherCalls,
          onDisk: {
            design: await read('main.scad'),
            openings: await read('openings.txt'),
            logo: await read('parts/logo.svg'),
            stl: await read('main-abc123.stl'),
          },
        }
      })

      console.log('[ir5] announced:', JSON.stringify(result.announced))
      console.log('[ir5] watcher:', JSON.stringify(result.watcherCalls))

      // The companions are on disk, byte for byte.
      expect(result.saved.ok).toBe(true)
      expect(result.saved.written).toEqual(['openings.txt', 'parts/logo.svg'])
      expect(result.onDisk.openings).toBe('row1\nrow2\n')
      expect(result.onDisk.logo).toBe('<svg/>')
      // Nested paths are created rather than flattened or refused.
      expect(result.saved.written).toContain('parts/logo.svg')

      // The design is untouched: what the other tool wrote is still there.
      expect(result.onDisk.design).toBe(
        '// the design as the other tool left it\n'
      )

      // The export landed beside the design, with the bytes it was handed.
      expect(result.exported.ok).toBe(true)
      expect(result.onDisk.stl).toBe('SOLID')

      // THE CONTRACT: the watcher hears about every write BEFORE any bytes
      // land, and gets stats afterwards. Without this the watcher sees Forge's
      // own writes as somebody else's edits and re-renders in a loop.
      const begins = result.watcherCalls.filter(([kind]) => kind === 'begin')
      const ends = result.watcherCalls.filter(([kind]) => kind === 'end')
      expect(begins).toHaveLength(3)
      expect(ends).toHaveLength(3)
      for (let i = 0; i < result.watcherCalls.length; i += 2) {
        expect(result.watcherCalls[i][0]).toBe('begin')
        expect(result.watcherCalls[i + 1][0]).toBe('end')
        // Same path, and the write succeeded, so real stats came back.
        expect(result.watcherCalls[i + 1][1]).toBe(result.watcherCalls[i][1])
        expect(result.watcherCalls[i + 1][2]).toBe('stats')
      }

      // Every write said so, once per action.
      expect(result.announced).toHaveLength(2)
      expect(result.announced[0]).toMatch(/Saved 2 companion files/)
      expect(result.announced[1]).toMatch(/Saved main-abc123\.stl/)
    })

    test('a folder that refuses the write is reported, not swallowed', async ({
      page,
    }) => {
      test.setTimeout(240_000)
      await openApp(page)

      const result = await page.evaluate(async () => {
        const { createFolderSaveActions } = await import(
          '/src/js/folder-save-actions.js'
        )
        const announced = []
        const statuses = []
        const actions = createFolderSaveActions({
          getWriteBack: () => ({
            isAvailable: () => true,
            writeFile: async () => {
              throw new Error('The user denied permission to the folder')
            },
          }),
          isEnabled: () => true,
          announce: (m) => announced.push(m),
          onStatus: (m, level) => statuses.push([m, level]),
        })
        const out = await actions.saveExport({
          fileName: 'a.stl',
          data: 'X',
          mainFilePath: 'main.scad',
        })
        return { out, announced, statuses }
      })

      expect(result.out.ok).toBe(false)
      expect(result.announced[0]).toMatch(/Could not save a\.stl/)
      expect(result.announced[0]).toMatch(/denied permission/)
      expect(result.statuses[0][1]).toBe('warning')
    })
  })
})
