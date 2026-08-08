/**
 * Menu-bar parity against upstream OpenSCAD (tag openscad-2026.01.01-TEST2).
 *
 * The menu items carry no stable element ids by design, so everything here
 * targets role + visible label. Order is asserted top-to-bottom including
 * separators, because a menu's order is part of what makes it recognisable.
 */
import { test, expect } from '@playwright/test'
import path from 'path'

const RECENT_KEY = 'openscad-forge-recent-files'
const RECENT_UNAVAILABLE_REASON =
  'Not saved in this browser — open the file again to reload it'

// Appendix U2, with the adaptations recorded in main.js's File-menu comment:
// Save All and Python omitted (D-24); Quit's slot dropped and the single Close
// named "Close Project" (D-27); "Open Local Folder…" is a kept Forge extra.
const FILE_MENU_ORDER = [
  'New File',
  'Open File…',
  'Open Local Folder…',
  'Recent Files',
  'Examples',
  'Reload',
  '---',
  'New Window',
  'Open in New Window',
  'Close Project',
  '---',
  'Save',
  'Save As…',
  'Save a Copy',
  '---',
  'Export',
  '---',
  'Show Library Folder…',
]

const EDIT_MENU_ORDER = [
  'Undo',
  'Redo',
  '---',
  'Cut',
  'Copy',
  'Paste',
  '---',
  'Indent',
  'Unindent',
  'Comment',
  'Uncomment',
  'Convert Tabs to Spaces',
  'Toggle Bookmark',
  'Jump to next bookmark',
  'Jump to previous bookmark',
  '---',
  'Copy viewport image',
  'Copy viewport translation',
  'Copy viewport rotation',
  'Copy viewport distance',
  'Copy viewport field of view',
  '---',
  'Find…',
  'Find and Replace…',
  'Find Next',
  'Find Previous',
  'Use Selection for Find',
  '---',
  'Jump to next error',
  'Jump to previous error',
  '---',
  'Increase Font Size',
  'Decrease Font Size',
  'Preferences (Keyboard Shortcuts)…',
]

async function waitForWasmReady(page) {
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 120_000,
  })
}

async function loadFixture(page) {
  await page.goto('/')
  await waitForWasmReady(page)
  await page.setInputFiles(
    '#fileInput',
    path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
  )
  await page.waitForSelector('.param-control', {
    state: 'attached',
    timeout: 30_000,
  })
  const notNow = page.locator('#saveProjectNotNow')
  if (await notNow.isVisible().catch(() => false)) {
    await notNow.click()
    await page.waitForTimeout(200)
  }
  // The menu bar is hidden in the Simplified interface mode.
  await page.locator('#uiModeToggle').click()
  await expect(page.locator('#fileMenuBtn')).toBeVisible()
}

async function openEditor(page) {
  const expertToggle = page.locator('#expertModeToggle')
  if (await expertToggle.isVisible().catch(() => false)) {
    await expertToggle.click()
  } else {
    await page.keyboard.press('Control+e')
  }
  await expect(page.locator('#expertModePanel .cm-content')).toBeVisible({
    timeout: 10_000,
  })
}

/** Top-level items of a menu, in order, separators included as '---'. */
async function readMenu(page, menuId) {
  return page.evaluate((id) => {
    const list = document.getElementById(`${id}MenuItems`)
    if (!list) return []
    return [...list.children].map((li) => {
      if (li.getAttribute('role') === 'separator') return { label: '---' }
      const btn = li.querySelector(':scope > button')
      if (!btn) return { label: '(group)' }
      return {
        label: btn.querySelector('.menu-item-label')?.textContent ?? '',
        disabled: btn.getAttribute('aria-disabled') === 'true',
        title: btn.getAttribute('title'),
      }
    })
  }, menuId)
}

async function readSubmenu(page, menuId, submenuLabel) {
  return page.evaluate(
    ({ id, label }) => {
      const list = document.getElementById(`${id}MenuItems`)
      const li = [...(list?.children ?? [])].find(
        (el) =>
          el.querySelector(':scope > button .menu-item-label')?.textContent ===
          label
      )
      const ul = li?.querySelector(':scope > ul')
      if (!ul) return []
      return [...ul.children].map((child) => {
        if (child.getAttribute('role') === 'separator') return { label: '---' }
        const btn = child.querySelector(':scope > button')
        return {
          label: btn?.querySelector('.menu-item-label')?.textContent ?? '',
          disabled: btn?.getAttribute('aria-disabled') === 'true',
          title: btn?.getAttribute('title') ?? null,
        }
      })
    },
    { id: menuId, label: submenuLabel }
  )
}

/** Exact-label menu item. Playwright's hasText is a case-insensitive
 *  substring, which makes "Cut" match "Preferences (Keyboard Shortcuts)". */
function menuItem(page, menuId, label) {
  return page
    .locator(`#${menuId}MenuItems button`)
    .filter({ has: page.getByText(label, { exact: true }) })
    .first()
}

async function clickMenuItem(page, menuId, label) {
  await page.locator(`#${menuId}MenuBtn`).click()
  await menuItem(page, menuId, label).click()
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
  })
})

test.describe('File menu parity (G1)', () => {
  test('order and labels follow upstream U2', async ({ page }) => {
    await loadFixture(page)

    await page.locator('#fileMenuBtn').click()
    const items = await readMenu(page, 'file')

    expect(items.map((i) => i.label)).toEqual(FILE_MENU_ORDER)

    // R11: File > Close appeared twice and Save All duplicated Save.
    expect(items.filter((i) => /close/i.test(i.label))).toHaveLength(1)
    expect(items.some((i) => i.label === 'Save All')).toBe(false)

    // A new tab cannot be handed this tab's file, so the item is honest
    // rather than absent or silently dead.
    const openInNew = items.find((i) => i.label === 'Open in New Window')
    expect(openInNew.disabled).toBe(true)
    expect(openInNew.title).toContain('cannot be handed a file')

    // Close Project and Save a Copy act on the open project.
    expect(items.find((i) => i.label === 'Close Project').disabled).toBe(false)
    expect(items.find((i) => i.label === 'Save a Copy').disabled).toBe(false)
  })

  test('Recent Files disables what it cannot reopen and offers Clear Recent', async ({
    page,
  }) => {
    await page.addInitScript(
      ([key, seeded]) => {
        localStorage.setItem(key, JSON.stringify(seeded))
      },
      [
        RECENT_KEY,
        [
          { name: 'simple_box.scad', timestamp: 2 },
          { name: 'ghost.scad', timestamp: 1 },
        ],
      ]
    )
    await loadFixture(page)

    await page.locator('#fileMenuBtn').click()
    await menuItem(page, 'file', 'Recent Files').click()

    const entries = await readSubmenu(page, 'file', 'Recent Files')
    const labels = entries.map((e) => e.label)

    // A bundled example is reachable by name; a one-off upload is not.
    expect(labels).toContain('simple_box.scad')
    expect(entries.find((e) => e.label === 'simple_box.scad').disabled).toBe(
      false
    )
    const ghost = entries.find((e) => e.label === 'ghost.scad')
    expect(ghost.disabled).toBe(true)
    expect(ghost.title).toBe(RECENT_UNAVAILABLE_REASON)
    const uploaded = entries.find((e) => e.label === 'sample.scad')
    expect(uploaded.disabled).toBe(true)

    // Clear Recent sits last, after a separator, per U2.
    expect(labels[labels.length - 1]).toBe('Clear Recent')
    expect(labels[labels.length - 2]).toBe('---')
    expect(entries[entries.length - 1].disabled).toBe(false)

    await menuItem(page, 'file', 'Clear Recent').click()

    await page.locator('#fileMenuBtn').click()
    await menuItem(page, 'file', 'Recent Files').click()
    const afterClear = await readSubmenu(page, 'file', 'Recent Files')
    expect(afterClear.map((e) => e.label)).toEqual([
      'No recent files',
      '---',
      'Clear Recent',
    ])
    expect(afterClear[0].disabled).toBe(true)
    expect(afterClear[2].disabled).toBe(true)
  })

  test('a reachable recent entry reopens the file and fills the editor', async ({
    page,
  }) => {
    await page.addInitScript(
      ([key, seeded]) => {
        localStorage.setItem(key, JSON.stringify(seeded))
      },
      [RECENT_KEY, [{ name: 'simple_box.scad', timestamp: 2 }]]
    )
    await loadFixture(page)
    await openEditor(page)
    await expect(page.locator('#expertModePanel .cm-content')).toContainText(
      'Simple Box - Test Fixture'
    )

    await page.locator('#fileMenuBtn').click()
    await menuItem(page, 'file', 'Recent Files').click()
    await menuItem(page, 'file', 'simple_box.scad').click()

    // Replacing an open file asks first — that guard is pre-existing.
    const confirm = page.locator('.confirm-modal')
    await expect(confirm).toBeVisible({ timeout: 10_000 })
    await confirm.locator('button[data-action="confirm"]').click()

    await expect(page.locator('#expertModePanel .cm-content')).toContainText(
      'Simple Parametric Box',
      { timeout: 30_000 }
    )
  })

  test('Close Project warns about unsaved editor edits before leaving', async ({
    page,
  }) => {
    await loadFixture(page)
    await openEditor(page)

    const editor = page.locator('#expertModePanel .cm-content')
    await editor.click()
    await page.keyboard.type('// unsaved work\n', { delay: 25 })
    await expect(page.locator('#editorDirtyIndicator')).toBeVisible()

    await clickMenuItem(page, 'file', 'Close Project')

    const confirm = page.locator('.confirm-modal')
    await expect(confirm).toBeVisible()
    await expect(confirm.locator('#confirmDialogTitle')).toHaveText(
      'Unsaved code edits'
    )
    await expect(confirm.locator('#confirmDialogMessage')).toHaveText(
      'You have unsaved edits in the code editor. Closing this project will discard them.'
    )
    await expect(confirm.locator('button[data-action="confirm"]')).toHaveText(
      'Discard edits and close'
    )

    // Keeping the edits leaves the project open — one dialog, not two.
    await confirm.locator('button[data-action="cancel"]').click()
    await expect(page.locator('#mainInterface')).toBeVisible()
    await expect(page.locator('.confirm-modal')).toHaveCount(0)

    await clickMenuItem(page, 'file', 'Close Project')
    await page.locator('.confirm-modal button[data-action="confirm"]').click()
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('Edit menu parity (G2)', () => {
  test('order and labels follow upstream U2', async ({ page }) => {
    await loadFixture(page)
    await openEditor(page)

    await page.locator('#editMenuBtn').click()
    const items = await readMenu(page, 'edit')
    expect(items.map((i) => i.label)).toEqual(EDIT_MENU_ORDER)

    // D-24: no editor tabs in a one-document app.
    expect(items.some((i) => /Show (Next|Previous) Tab/.test(i.label))).toBe(
      false
    )

    // Nothing is selected yet, so Use Selection for Find says why.
    const useSelection = items.find(
      (i) => i.label === 'Use Selection for Find'
    )
    expect(useSelection.disabled).toBe(true)
    expect(useSelection.title).toBe(
      'Select some text in the code editor first'
    )
  })

  test('Undo follows the focus: editor text, not a parameter', async ({
    page,
  }) => {
    await loadFixture(page)
    await openEditor(page)

    const editor = page.locator('#expertModePanel .cm-content')
    await editor.click()
    await page.keyboard.type('// bookmark me\n', { delay: 25 })
    await expect(editor).toContainText('// bookmark me')

    await page.locator('#editMenuBtn').click()
    const items = await readMenu(page, 'edit')
    const undo = items.find((i) => i.label === 'Undo')

    // The parameter history is empty, so an enabled Undo can only be the
    // editor's — and the tooltip has to say which one it is.
    expect(undo.disabled).toBe(false)
    expect(undo.title).toContain('code editor')

    await menuItem(page, 'edit', 'Undo').click()
    await expect(editor).not.toContainText('ZZMARKER')
  })

  test('Cut acts on the selection the menu bar took focus from', async ({
    page,
  }) => {
    await loadFixture(page)
    await openEditor(page)

    const editor = page.locator('#expertModePanel .cm-content')
    await editor.click()
    await page.keyboard.press('Control+Home')
    await page.keyboard.press('Shift+End')
    await expect(editor).toContainText('Simple Box - Test Fixture')

    await clickMenuItem(page, 'edit', 'Cut')

    await expect(editor).not.toContainText('Simple Box - Test Fixture')

    // The point of the focus restore: the user is left in the editor,
    // carrying on, not stranded on a menu button that is no longer shown.
    const focusInEditor = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('#expertModePanel'))
    )
    expect(focusInEditor).toBe(true)
  })

  test('bookmarks toggle, mark the gutter, and navigate with announcements', async ({
    page,
  }) => {
    await loadFixture(page)
    await openEditor(page)

    const editor = page.locator('#expertModePanel .cm-content')
    await editor.click()
    await page.keyboard.press('Control+Home')

    await clickMenuItem(page, 'edit', 'Toggle Bookmark')

    await expect(page.locator('.cm-bookmark-dot:visible')).toHaveCount(1)
    await expect(page.locator('#srAnnouncer')).toHaveText(
      'Bookmark added, line 1'
    )

    await editor.click()
    await page.keyboard.press('Control+End')

    await clickMenuItem(page, 'edit', 'Jump to next bookmark')
    await expect(page.locator('#srAnnouncer')).toHaveText(
      'Line 1, bookmark 1 of 1'
    )

    // Toggling the same line again removes it.
    await clickMenuItem(page, 'edit', 'Toggle Bookmark')
    await expect(page.locator('.cm-bookmark-dot:visible')).toHaveCount(0)
    await expect(page.locator('#srAnnouncer')).toHaveText(
      'Bookmark removed, line 1'
    )
  })

  test('Convert Tabs to Spaces expands tabs to the next tab stop', async ({
    page,
  }) => {
    await loadFixture(page)
    await openEditor(page)

    const editor = page.locator('#expertModePanel .cm-content')
    await editor.click()
    await page.keyboard.press('Control+Home')
    await page.keyboard.insertText('\tx\n')

    const hasTab = () =>
      page.evaluate(
        () =>
          document
            .querySelector('#expertModePanel .cm-content')
            ?.textContent?.includes('\t') ?? false
      )
    expect(await hasTab()).toBe(true)

    await clickMenuItem(page, 'edit', 'Convert Tabs to Spaces')

    await expect.poll(hasTab).toBe(false)
    await expect(editor).toContainText('    x')
  })
})

test.describe('Editor folding (G2, D-40)', () => {
  test('blocks are foldable and Fold All hides them', async ({ page }) => {
    await loadFixture(page)
    await openEditor(page)

    const editor = page.locator('#expertModePanel .cm-content')
    await expect(editor).toContainText('module box()')

    // A StreamLanguage carries no structure, so a fold service has to supply
    // it: without one the gutter draws nothing and Fold All is a no-op.
    await expect(
      page.locator('#expertModePanel .cm-foldGutter [title]')
    ).not.toHaveCount(0)

    await editor.click()
    await page.keyboard.press('Control+Alt+BracketLeft')
    await expect(
      page.locator('#expertModePanel .cm-foldPlaceholder')
    ).not.toHaveCount(0)
    await expect(editor).not.toContainText('difference()')

    await page.keyboard.press('Control+Alt+BracketRight')
    await expect(
      page.locator('#expertModePanel .cm-foldPlaceholder')
    ).toHaveCount(0)
    await expect(editor).toContainText('difference()')
  })
})

test.describe('Grown menus stay reachable (G1/G2)', () => {
  test('the Edit menu scrolls and its last item is reachable by keyboard', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 })
    await loadFixture(page)
    await openEditor(page)
    // Opening the editor focuses it on a 100ms timer (main.js), so a menu
    // opened inside that window loses focus to the editor. Let it land
    // first — otherwise this test races a pre-existing quirk instead of
    // measuring the menu.
    await expect(page.locator('#expertModePanel .cm-content')).toBeFocused()

    await page.locator('#editMenuBtn').click()

    // 33 items no longer fit a 900px window, so the panel has to scroll
    // rather than clip its tail off the bottom of the screen.
    const scrolls = await page.evaluate(() => {
      const body = document
        .getElementById('editMenuItems')
        ?.closest('.toolbar-menu-body')
      return body ? body.scrollHeight > body.clientHeight : null
    })
    expect(scrolls).toBe(true)

    // Opening a menu moves focus into it (APG). The editor can still be
    // settling in when the menu opens, so wait for the contract to hold
    // rather than assuming it already does.
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean(document.activeElement?.closest('#editMenuItems'))
        )
      )
      .toBe(true)

    await page.keyboard.press('End')
    const landed = await page.evaluate(() => {
      const el = document.activeElement
      const rect = el?.getBoundingClientRect()
      return {
        label: el?.querySelector('.menu-item-label')?.textContent ?? null,
        onScreen: Boolean(
          rect && rect.top >= 0 && rect.bottom <= window.innerHeight
        ),
      }
    })
    expect(landed.label).toBe('Preferences (Keyboard Shortcuts)…')
    expect(landed.onScreen).toBe(true)
  })
})

const DESIGN_MENU_ORDER = [
  'Automatic Reload and Preview',
  'Reload and Preview',
  'Preview',
  'Render',
  'Cancel Render',
  '3D Print',
  'Measure Distance',
  'Measure Angle',
  '---',
  'Check Validity',
  'Display AST…',
  'Display CSG Tree…',
  'Display CSG Products…',
  'Display Parameters…',
  '---',
  'Flush Caches',
]

const EXPORT_SUBMENU_ORDER = [
  'Export as STL (ascii)…',
  'Export as STL (binary)…',
  'Export as OBJ…',
  'Export as OFF…',
  'Export as WRL…',
  'Export as AMF…',
  'Export as 3MF…',
  'Export as DXF…',
  'Export as SVG…',
  'Export as CSG…',
  'Export as PDF…',
  '---',
  'Export as Image…',
]

test.describe('Design menu and Export submenu parity (G3)', () => {
  test('Design order follows U2 and unavailable items say why', async ({
    page,
  }) => {
    await loadFixture(page)

    await page.locator('#designMenuBtn').click()
    const items = await readMenu(page, 'design')
    expect(items.map((i) => i.label)).toEqual(DESIGN_MENU_ORDER)

    for (const label of [
      '3D Print',
      'Measure Distance',
      'Measure Angle',
      'Display AST…',
      'Display CSG Tree…',
      'Display CSG Products…',
    ]) {
      const item = items.find((i) => i.label === label)
      expect(item.disabled, `${label} should be disabled`).toBe(true)
      // A disabled item with no reason is just a dead control.
      expect(item.title, `${label} should carry a reason`).toBeTruthy()
      expect(item.title.length).toBeGreaterThan(20)
    }

    // The parameter dump keeps its honest name and stays usable.
    expect(items.find((i) => i.label === 'Display Parameters…').disabled).toBe(
      false
    )
  })

  test('Export submenu follows U2 and never gates on a prior render', async ({
    page,
  }) => {
    await loadFixture(page)

    await page.locator('#fileMenuBtn').click()
    await menuItem(page, 'file', 'Export').click()
    const items = await readSubmenu(page, 'file', 'Export')
    expect(items.map((i) => i.label)).toEqual(EXPORT_SUBMENU_ORDER)

    // Nothing has been rendered in this session, yet every format this build
    // can produce is offered: the old build disabled them all behind a
    // "Press Generate" notice.
    for (const item of items) {
      if (item.label === '---' || item.label === 'Export as Image…') continue
      if (item.label === 'Export as 3MF…') continue
      expect(item.disabled, `${item.label} should be offered`).toBe(false)
    }

    // Measured: this WASM build traps on 3MF, so the item says so rather
    // than failing every time it is pressed.
    const threeMf = items.find((i) => i.label === 'Export as 3MF…')
    expect(threeMf.disabled).toBe(true)
    expect(threeMf.title).toContain('not available in this browser build')
    expect(
      items.some((i) => /Press Generate/.test(i.label))
    ).toBe(false)
    // POV is omitted and documented (D-24).
    expect(items.some((i) => /POV/i.test(i.label))).toBe(false)
  })

  test('exporting with only a preview done renders first, then downloads', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await loadFixture(page)

    // Only the auto-preview has run — no full render, and certainly not OBJ.
    // The old build answered this with a "Format Mismatch" toast and a dead
    // end; it now renders what was asked for.
    await page.locator('#fileMenuBtn').click()
    await menuItem(page, 'file', 'Export').click()
    const downloadPromise = page.waitForEvent('download', { timeout: 150_000 })
    await menuItem(page, 'file', 'Export as OBJ…').click()

    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.obj$/)
  })

  test('STL ascii and binary produce different files', async ({ page }) => {
    test.setTimeout(240_000)
    await loadFixture(page)

    async function exportStl(label) {
      await page.locator('#fileMenuBtn').click()
      await menuItem(page, 'file', 'Export').click()
      const downloadPromise = page.waitForEvent('download', {
        timeout: 150_000,
      })
      await menuItem(page, 'file', label).click()
      const download = await downloadPromise
      const stream = await download.createReadStream()
      const chunks = []
      for await (const chunk of stream) chunks.push(chunk)
      return Buffer.concat(chunks)
    }

    const ascii = await exportStl('Export as STL (ascii)…')
    expect(ascii.subarray(0, 6).toString('utf8')).toBe('solid ')

    const binary = await exportStl('Export as STL (binary)…')
    expect(binary.subarray(0, 6).toString('utf8')).not.toBe('solid ')
    // 80-byte header + 4-byte triangle count + 50 bytes per triangle.
    expect(binary.length).toBe(84 + binary.readUInt32LE(80) * 50)
  })
})
