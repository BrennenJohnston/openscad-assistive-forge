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
  // Forge-only (UF-11): the export-quality mode's one home since the drawer
  // select retired; Classic's File menu keeps its audited upstream shape.
  'Export Quality',
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
  // Upstream reaches this by Alt+Ins only, with no menu entry; it ships here
  // disabled-with-reason so it can at least say why it does nothing (D-43).
  'Insert Template',
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
  // Renamed in R-III (29ec7e1) when Edit ▸ Preferences stopped being a
  // synonym for the shortcuts editor and opened the real dialog. This
  // expectation was not updated then, so these cases have been failing on
  // develop ever since. Owner confirmed the label stands, 2026-08-09 (Q-12).
  'Preferences…',
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
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
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
    const insertTemplate = items.find((i) => i.label === 'Insert Template')
    expect(insertTemplate.disabled).toBe(true)
    expect(insertTemplate.title).toContain('not built yet')

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

  test('Use Selection for Find searches for the selection', async ({
    page,
  }) => {
    await loadFixture(page)
    await openEditor(page)

    const editor = page.locator('#expertModePanel .cm-content')
    await editor.click()
    await page.keyboard.press('Control+Home')
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Home')
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight')
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
      'width'
    )

    const selectedLine = () =>
      page.evaluate(() => {
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0) return -1
        let node = sel.anchorNode
        while (
          node &&
          !(node.classList && node.classList.contains('cm-line'))
        ) {
          node = node.parentNode
        }
        const lines = [
          ...document.querySelectorAll('#expertModePanel .cm-line'),
        ]
        return node ? lines.indexOf(node) + 1 : -1
      })
    const before = await selectedLine()

    await page.locator('#editMenuBtn').click()
    const item = menuItem(page, 'edit', 'Use Selection for Find')
    expect(await item.getAttribute('aria-disabled')).toBeNull()
    await item.click()

    // The selection becomes the search term and the view moves to the next
    // occurrence of it. This only works with the search() extension
    // installed: without it CodeMirror creates its search state lazily when
    // the panel first opens, so the query was silently dropped.
    // Strictly LATER in the document, and still inside the editor: the old
    // code opened a search panel and left the selection in its Find field,
    // which is not the same thing as searching.
    await expect.poll(selectedLine).toBeGreaterThan(before)
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
      'width'
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
    // Deliberately without the code editor open: opening it focuses it on a
    // 100ms timer (main.js), and a menu opened inside that window loses
    // focus back to the editor. That quirk predates this work and is
    // reported separately; racing it here would measure it instead of the
    // menu. The item count does not depend on the editor either way.
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

    // Opening a menu moves focus into it (APG).
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
    expect(landed.label).toBe('Preferences…')
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

// Appendix U2's View menu. Preview (F9) and Thrown Together (F12) are omitted
// (D-24 — this renderer has no display-mode concept). The projection radios
// render as one role="group" li, which readMenu reports as '(group)'. The
// per-toolbar Hide items are Classic-only markup and are asserted there.
// Show Grid / Show Measurements / Show Status Bar and the Edge Detail Limit
// submenu are Forge-only (UF-11): they replaced drawer controls Classic
// never showed, and Classic's View menu keeps its audited desktop shape.
const VIEW_MENU_ORDER = [
  'Show Edges',
  'Show Axes',
  'Show Scale Markers',
  'Show Crosshairs',
  'Show Grid',
  'Show Measurements',
  'Show Status Bar',
  '---',
  'Top',
  'Bottom',
  'Left',
  'Right',
  'Front',
  'Back',
  'Diagonal',
  'Center',
  'View All',
  'Reset View',
  '---',
  'Zoom In',
  'Zoom Out',
  '---',
  '(group)',
  '---',
  'Preview Quality',
  'Edge Detail Limit',
  '---',
  '(group)',
]

/** Produce a full render, which is what enables Center and View All. */
async function renderModel(page) {
  const btn = page.locator('#primaryActionBtn')
  await expect(btn).toContainText('Generate', { timeout: 60_000 })
  await btn.click()
  await expect(btn).toContainText('Download', { timeout: 180_000 })
}

/** Camera position + orbit target; null target means this browser has no WebGL. */
async function cameraPose(page) {
  return page.evaluate(() => window.__forgeDebug?.cameraPose() ?? null)
}

test.describe('View menu parity (G4)', () => {
  test('order follows U2 and every registered shortcut is displayed', async ({
    page,
  }) => {
    await loadFixture(page)

    await page.locator('#viewMenuBtn').click()
    const items = await readMenu(page, 'view')
    expect(items.map((i) => i.label)).toEqual(VIEW_MENU_ORDER)

    // The renderer has no Preview/Thrown Together display modes (D-24), and
    // the old Forge-only label for the mm ticks is gone.
    expect(items.some((i) => /Thrown Together/i.test(i.label))).toBe(false)
    expect(items.some((i) => /Axis Markings/i.test(i.label))).toBe(false)

    // Zoom and Crosshairs had registered actions that no menu ever showed.
    const shown = await page.evaluate(() => {
      const out = {}
      for (const li of document.getElementById('viewMenuItems').children) {
        const label = li.querySelector(':scope > button .menu-item-label')
        if (!label) continue
        out[label.textContent] =
          li.querySelector(':scope > button .menu-item-shortcut')
            ?.textContent ?? null
      }
      return out
    })
    expect(shown['Zoom In']).toBe('Ctrl+]')
    expect(shown['Zoom Out']).toBe('Ctrl+[')
    expect(shown['Show Crosshairs']).toBe('Ctrl+3')
    expect(shown['Center']).toBe('Ctrl+Shift+0')

    // Reset View restores the default pose, so it never needs a render.
    expect(items.find((i) => i.label === 'Reset View').disabled).toBe(false)
  })

  test('a preview is enough for the commands that act on the viewport (P10)', async ({
    page,
  }) => {
    test.setTimeout(300_000)
    await loadFixture(page)

    // Wait for the auto-preview to put a mesh on screen. No Generate: that is
    // the whole point — state.stl stays null here. Match "Preview ready"
    // exactly: a looser /ready/ also matches the idle "Ready - Upload a file
    // to begin" and the case then runs before any preview exists.
    await expect(page.locator('#previewStatusText')).toContainText(
      /Preview ready/i,
      { timeout: 180_000 }
    )
    test.skip(
      (await page.locator('.preview-panel canvas').count()) === 0,
      'this browser built no 3D canvas'
    )
    expect(
      await page.evaluate(() => !!window.stateManager.getState().stl),
      'this case is about the preview-only state'
    ).toBe(false)

    // MEASURED before the fix: all three were disabled off Boolean(state.stl),
    // which only a full Generate sets. Center and View All fit the camera to
    // previewManager.mesh, and Export as Image photographs the canvas -- none
    // of them needs an STL. Export as Image compounded it by saying "Load and
    // preview a file first" to a user who had done exactly that.
    await page.locator('#viewMenuBtn').click()
    const viewItems = await readMenu(page, 'view')
    for (const label of ['Center', 'View All']) {
      const item = viewItems.find((i) => i.label === label)
      expect(item, `${label} must be in the View menu`).toBeTruthy()
      expect(item.disabled, `${label} is dead after a preview`).toBe(false)
    }
    await page.keyboard.press('Escape')

    await page.locator('#fileMenuBtn').click()
    await menuItem(page, 'file', 'Export').click()
    const exportItems = await readSubmenu(page, 'file', 'Export')
    const image = exportItems.find((i) => i.label === 'Export as Image…')
    expect(image, 'Export as Image must be in the Export submenu').toBeTruthy()
    expect(image.disabled, 'Export as Image is dead after a preview').toBe(false)

    // Not merely enabled: it has to produce the file it promises.
    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 })
    await menuItem(page, 'file', 'Export as Image…').click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.png$/i)
  })

  test('Center, View All and Reset View each move the camera differently', async ({
    page,
  }) => {
    test.setTimeout(300_000)
    await loadFixture(page)
    await renderModel(page)

    // Skip on the missing capability, never on the browser name: CI Firefox
    // has no WebGL and builds no canvas at all, so there is no camera to move.
    // Anything else missing is a failure, not a reason to pass quietly.
    test.skip(
      (await page.locator('.preview-panel canvas').count()) === 0,
      'this browser built no 3D canvas'
    )

    const start = await cameraPose(page)
    expect(start, 'the cameraPose debug reader must exist').not.toBeNull()
    expect(start.target, 'a canvas exists, so controls must too').not.toBeNull()

    const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
    const radius = (pose) => distance(pose.position, pose.target)

    // The render leaves the camera fitted and looking at the model's centre.
    const modelCentre = start.target
    const fittedRadiusAtStart = radius(start)

    // Push the view off the model and closer in, so each command below has
    // something of its own to undo.
    await page.locator('.preview-panel canvas').first().focus()
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowLeft')
    const panned = await cameraPose(page)
    expect(distance(panned.target, modelCentre)).toBeGreaterThan(1)

    // Ctrl+] is new in G4. Three presses must move the camera three steps
    // closer — not six, which is what a second live path would produce.
    const ZOOM_STEP = 15
    for (let i = 0; i < 3; i++) await page.keyboard.press('Control+]')
    const zoomed = await cameraPose(page)
    expect(radius(panned) - radius(zoomed)).toBeGreaterThan(3 * ZOOM_STEP - 5)
    expect(radius(panned) - radius(zoomed)).toBeLessThan(3 * ZOOM_STEP + 5)

    async function runViewItem(label) {
      await page.locator('#viewMenuBtn').click()
      await menuItem(page, 'view', label).click()
      await page.waitForTimeout(150)
      return cameraPose(page)
    }

    // Center used to throw: resetCamera() was called at three sites and never
    // existed. It brings the view back onto the model and changes nothing else.
    const centered = await runViewItem('Center')
    expect(distance(centered.target, modelCentre)).toBeLessThan(0.5)
    expect(radius(centered)).toBeCloseTo(radius(zoomed), 3)

    // View All undoes the zoom by refitting; Reset View ignores the model and
    // returns to the startup pose. These were the same command before G4.
    const fitted = await runViewItem('View All')
    expect(radius(fitted)).toBeCloseTo(fittedRadiusAtStart, 3)
    expect(radius(fitted) - radius(centered)).toBeGreaterThan(3 * ZOOM_STEP - 5)

    const reset = await runViewItem('Reset View')
    expect(reset.target).toEqual([0, 0, 0])
    expect(reset.position.map(Math.round)).toEqual([150, -150, 100])
    expect(distance(reset.position, fitted.position)).toBeGreaterThan(1)
  })
})

// Upstream builds this menu from the docks, so its order is the dock order
// (U2). Next/Previous Window are omitted — one window (D-24). Outside Classic
// there are no Animate/Font List docks, so Standard shows the Forge set.
const WINDOW_MENU_ORDER_STANDARD = [
  'Editor',
  'Console',
  'Customizer',
  'Error-Log',
  'Viewport-Control',
  '---',
  'Jump To…',
  '---',
  'Libraries',
  'Companion Files',
  'Image Measurement',
  'Reference Image',
  // Classic's Q-4 tail slot, mirrored in Forge since UF-10.
  'Advanced',
]

test.describe('Window menu parity (G5)', () => {
  test('order follows U2 and Jump To moves focus into the panel it names', async ({
    page,
  }) => {
    await loadFixture(page)

    await page.locator('#windowMenuBtn').click()
    const items = await readMenu(page, 'window')
    expect(items.map((i) => i.label)).toEqual(WINDOW_MENU_ORDER_STANDARD)

    // One window, so these stay omitted rather than shipping dead.
    expect(items.some((i) => /Next Window|Previous Window/.test(i.label))).toBe(
      false
    )

    // Jump To lists the panels that are open right now, and choosing one puts
    // focus INSIDE that panel — not merely somewhere in the page.
    await menuItem(page, 'window', 'Jump To…').click()
    const targets = await readSubmenu(page, 'window', 'Jump To…')
    expect(targets.length).toBeGreaterThan(0)
    expect(targets.map((t) => t.label)).toContain('Console')

    // What matters is whether the live region EVER carried the message, not
    // what it happens to hold a moment later: a render reporting in overwrites
    // it. Reading the current text was the racy half of this assertion.
    await page.evaluate(() => {
      window.__spoken = []
      const a = document.getElementById('srAnnouncer')
      new MutationObserver(() => {
        const t = (a.textContent || '').trim()
        if (t) window.__spoken.push(t)
      }).observe(a, { childList: true, subtree: true, characterData: true })
    })

    // Scope to the submenu: the Window menu also has a top-level "Console"
    // toggle, and clicking that would hide the panel instead of visiting it.
    await page
      .locator('#windowMenuItems > li.menu-item--submenu ul button')
      .filter({ has: page.getByText('Console', { exact: true }) })
      .first()
      .click()

    // MEASURED: with the debounced announce(), a competing announcement inside
    // 350ms cancelled this outright and the user heard nothing at all.
    await page.evaluate(() =>
      window.stateManager.announceChange('Preview ready')
    )
    await expect
      .poll(() => page.evaluate(() => window.__spoken), { timeout: 5_000 })
      .toContain('Jumped to Console')
    const landedInside = await page.evaluate(
      () =>
        document
          .getElementById('consolePanel')
          ?.contains(document.activeElement) ?? false
    )
    expect(landedInside).toBe(true)
  })

  test('Ctrl+Alt+4 toggles the Customizer instead of a selector that matches nothing', async ({
    page,
  }) => {
    await loadFixture(page)

    const paramPanel = page.locator('#paramPanel')
    const collapsedBefore = await paramPanel.evaluate((el) =>
      el.classList.contains('collapsed')
    )

    const isCollapsed = () =>
      paramPanel.evaluate((el) => el.classList.contains('collapsed'))

    // Collect what the live region says rather than sampling its current text:
    // the announcer clears itself on a timer, so asserting the text directly
    // races that clear and the case failed on its first attempt in CI.
    await page.evaluate(() => {
      window.__said = []
      const region = document.getElementById('srAnnouncer')
      new MutationObserver(() => {
        const text = region.textContent.trim()
        if (text && window.__said.at(-1) !== text) window.__said.push(text)
      }).observe(region, {
        childList: true,
        subtree: true,
        characterData: true,
      })
    })

    await page.keyboard.press('Control+Alt+4')
    await expect.poll(isCollapsed).toBe(!collapsedBefore)

    await page.keyboard.press('Control+Alt+4')
    await expect.poll(isCollapsed).toBe(collapsedBefore)

    // One announcement per press, each naming the direction it went.
    await expect
      .poll(async () =>
        (await page.evaluate(() => window.__said)).filter((line) =>
          /customizer/i.test(line)
        )
      )
      .toEqual(
        collapsedBefore
          ? ['Customizer shown', 'Customizer hidden']
          : ['Customizer hidden', 'Customizer shown']
      )
  })
})

// Appendix U2's Help menu, then the Forge extras this app keeps.
const HELP_MENU_ORDER = [
  'About',
  'OpenSCAD Homepage',
  'Documentation',
  'Offline Documentation',
  'Cheat Sheet',
  'Offline Cheat Sheet',
  'Library info',
  '---',
  'Features Guide',
  'Keyboard Shortcuts…',
  'Report Issue',
]

test.describe('Help menu parity (G6)', () => {
  test('order follows U2, no two items share a target, and About is honest', async ({
    page,
  }) => {
    await loadFixture(page)

    await page.locator('#helpMenuBtn').click()
    const items = await readMenu(page, 'help')
    expect(items.map((i) => i.label)).toEqual(HELP_MENU_ORDER)

    // Nothing offline is bundled this round (D-39), so both say why and
    // point at the online item beside them.
    for (const label of ['Offline Documentation', 'Offline Cheat Sheet']) {
      const item = items.find((i) => i.label === label)
      expect(item.disabled, `${label} should be disabled`).toBe(true)
      expect(item.title, `${label} should carry a reason`).toBeTruthy()
      expect(item.title).toContain('not bundled yet')
    }

    // About opened the Features Guide's ACCESSIBILITY tab — a claim about
    // itself that was not true. It is now a real About dialog.
    await menuItem(page, 'help', 'About').click()
    const about = page.locator('#aboutModal')
    await expect(about).toBeVisible()
    await expect(page.locator('#featuresGuideModal')).toBeHidden()
    await expect(page.locator('#aboutVersion')).toHaveText(
      /OpenSCAD Assistive Forge, version \d+\.\d+\.\d+/
    )
    await expect(about).toContainText('General Public License')
    await expect(
      about.getByRole('link', { name: /Third-party notices/ })
    ).toHaveAttribute('href', /THIRD_PARTY_NOTICES\.md$/)
    await page.locator('#aboutModalDone').click()
    await expect(about).toBeHidden()

    // Library info and Features Guide both opened the same tab of the same
    // modal — the duplicate this plan exists to remove.
    await page.locator('#helpMenuBtn').click()
    await menuItem(page, 'help', 'Library info').click()
    await expect(page.locator('#tab-libraries')).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await page.locator('#featuresGuideClose').click()

    await page.locator('#helpMenuBtn').click()
    await menuItem(page, 'help', 'Features Guide').click()
    await expect(page.locator('#tab-workflow')).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await expect(page.locator('#tab-libraries')).toHaveAttribute(
      'aria-selected',
      'false'
    )
  })
})

test.describe('Mnemonics and one path per shortcut (G7)', () => {
  test('menus underline the access keys U2 marks, and only those', async ({
    page,
  }) => {
    await loadFixture(page)

    /** label -> the underlined character, for one menu. */
    async function underlined(menuId) {
      await page.locator(`#${menuId}MenuBtn`).click()
      const out = await page.evaluate((id) => {
        const result = {}
        for (const btn of document.querySelectorAll(
          `#${id}MenuItems .menu-item-label`
        )) {
          result[btn.textContent] =
            btn.querySelector('.menu-mnemonic')?.textContent ?? null
        }
        return result
      }, menuId)
      await page.keyboard.press('Escape')
      return out
    }

    const file = await underlined('file')
    expect(file['New File']).toBe('N')
    expect(file['Recent Files']).toBe('t') // Recen&t Files
    expect(file['Export']).toBe('x') // E&xport
    expect(file['Save As…']).toBe('A')
    // Forge extras upstream does not have get no invented access key.
    expect(file['Open Local Folder…']).toBeNull()
    expect(file['Save a Copy']).toBeNull()

    const edit = await underlined('edit')
    expect(edit['Cut']).toBe('t') // Cu&t
    expect(edit['Uncomment']).toBe('m') // Unco&mment
    expect(edit['Copy viewport translation']).toBe('a') // transl&ation
    expect(edit['Find Next']).toBe('x') // Find Ne&xt

    const view = await underlined('view')
    expect(view['Back']).toBe('k') // Bac&k
    expect(view['Center']).toBe('n') // Ce&nter
    // U2 marks no access key on the display toggles.
    expect(view['Show Edges']).toBeNull()
    expect(view['View All']).toBeNull()

    // Underlining must not change what the item is called.
    const labels = (await readMenu(page, 'view')).map((i) => i.label)
    expect(labels).toEqual(VIEW_MENU_ORDER)
  })

  test('a disabled item states its reason once, not twice', async ({
    page,
  }) => {
    await loadFixture(page)

    await page.locator('#helpMenuBtn').click()
    const item = menuItem(page, 'help', 'Offline Cheat Sheet')

    // The reason used to live INSIDE the button, so it was part of the
    // accessible NAME and the description both (D-14).
    const name = await item.evaluate((el) => el.textContent)
    expect(name).toBe('Offline Cheat Sheet')

    const describedBy = await item.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    const description = await page.evaluate(
      (id) => document.getElementById(id)?.textContent ?? '',
      describedBy.split(' ')[0]
    )
    expect(description).toContain('not bundled yet')
  })

  test('Ctrl+Z has exactly one path and stays out of the code editor', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    await loadFixture(page)

    // It is now a registry action, so it appears in the shortcuts modal and
    // can be rebound. It used to be invisible there.
    await page.keyboard.press('Control+Shift+K')
    await expect(page.locator('#shortcutsModal')).toBeVisible()
    await expect(page.locator('#shortcutsModalBody')).toContainText(
      'Undo the last parameter change'
    )
    await page.locator('#shortcutsModalDone').click()

    // One press, one undo. A second live path would take the parameter back
    // two steps at once.
    // The parameter groups are closed disclosures, so open the one this
    // parameter lives in before touching it.
    const slider = page.locator('#param-width')
    const group = page.locator('details.param-group', { has: slider })
    if (!(await group.evaluate((el) => el.open))) {
      await group.locator('summary').first().click()
    }

    const original = Number(await slider.inputValue())
    await slider.fill(String(original + 1))
    await page.waitForTimeout(700) // two separate history entries, not one
    await slider.fill(String(original + 2))
    await expect(slider).toHaveValue(String(original + 2))

    // A focused INPUT is where the registry deliberately stands aside, so
    // step out of it before pressing the shortcut.
    await slider.evaluate((el) => el.blur())
    await page.keyboard.press('Control+z')
    await expect(slider).toHaveValue(String(original + 1))

    // In the editor, Ctrl+Z is the EDITOR's undo and must not also rewind a
    // parameter. The legacy listener had no text-entry guard, so it did both.
    await openEditor(page)
    const editor = page.locator('#expertModePanel .cm-content')
    await editor.click()
    await page.keyboard.type('// marker', { delay: 25 })
    await expect(editor).toContainText('// marker')

    await page.keyboard.press('Control+z')
    await expect(editor).not.toContainText('// marker')
    // The parameter must not have moved a second time.
    await expect(slider).toHaveValue(String(original + 1))
  })
})

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

  test('the output-format select tells the same 3MF story as the menu (T2-B2)', async ({
    page,
  }) => {
    // No fixture: the select is static markup, and the point is that the two
    // places 3MF is offered cannot disagree about whether it works.
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    const option = page.locator('#outputFormat option[value="3mf"]')
    await expect(option).toBeAttached()
    await expect(option).toBeDisabled()
    // An <option> cannot carry aria-describedby, so the reason lives in the
    // label itself — that is what a screen reader reads out.
    await expect(option).toHaveText(/not available in this browser build/i)
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

test.describe('Forge direction (UF-10)', () => {
  test('Window ▸ Editor opens and closes the Code Editor in Forge', async ({
    page,
  }) => {
    await loadFixture(page)

    // The old route toggled the hidden-panels class on the editor's TOGGLE
    // BUTTON: the entry point vanished while the editor stayed shut. Assert
    // all three: the editor appears, the button never vanishes, and the
    // tick answers "is the editor open".
    await clickMenuItem(page, 'window', 'Editor')
    await expect(page.locator('#expertModePanel .cm-content')).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.locator('#expertModeToggle')).toBeVisible()
    await expect(page.locator('#expertModeToggle')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await page.locator('#windowMenuBtn').click()
    await expect(menuItem(page, 'window', 'Editor')).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await page.keyboard.press('Escape')

    await clickMenuItem(page, 'window', 'Editor')
    await expect(
      page.locator('#expertModePanel .cm-content')
    ).not.toBeVisible()
    await expect(page.locator('#expertModeToggle')).toBeVisible()
    await expect(page.locator('#expertModeToggle')).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    await page.locator('#windowMenuBtn').click()
    await expect(menuItem(page, 'window', 'Editor')).toHaveAttribute(
      'aria-checked',
      'false'
    )
  })

  test('Window ▸ Advanced toggles the Advanced section in Forge', async ({
    page,
  }) => {
    await loadFixture(page)

    const adv = page.locator('#advancedMenu')
    await expect(adv).toHaveJSProperty('open', false)

    await clickMenuItem(page, 'window', 'Advanced')
    await expect(adv).toHaveJSProperty('open', true)

    await page.locator('#windowMenuBtn').click()
    await expect(menuItem(page, 'window', 'Advanced')).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await page.keyboard.press('Escape')

    await clickMenuItem(page, 'window', 'Advanced')
    await expect(adv).toHaveJSProperty('open', false)
  })

  test('Increase Font Size grows the editor text live in Classic', async ({
    page,
  }) => {
    await loadFixture(page)
    // Classic entry needs a desktop-shaped viewport; the default qualifies.
    await page.locator('#classicModeToggle').click()
    await page.waitForSelector('#expertModePanel .cm-content', {
      state: 'attached',
      timeout: 20_000,
    })

    const size = () =>
      page.evaluate(() =>
        parseFloat(
          getComputedStyle(
            document.querySelector('#expertModePanel .cm-content')
          ).fontSize
        )
      )
    const before = await size()

    // The announced-but-invisible shape this guards against: the size saved
    // and spoke while the text never changed (the expert flag stays false in
    // Classic, so the live apply needs the editor-on-screen gate).
    await clickMenuItem(page, 'edit', 'Increase Font Size')
    await expect.poll(size).toBeGreaterThan(before)

    await clickMenuItem(page, 'edit', 'Decrease Font Size')
    await expect.poll(size).toBe(before)
  })
})

test.describe('Forge direction (UF-11)', () => {
  test('View ▸ Preview Quality radios drive the select (defect D-24)', async ({
    page,
  }) => {
    await loadFixture(page)

    await page.locator('#viewMenuBtn').click()
    await menuItem(page, 'view', 'Preview Quality').click()
    // Radios in submenus rendered as plain menuitems with no click wiring
    // before UF-11 (defect D-24) — this click silently did nothing.
    await page
      .getByRole('menuitemradio', { name: 'Fast (lower resolution)' })
      .click()

    await expect(page.locator('#previewQualitySelect')).toHaveValue('fast')
    // Activating a radio also closes the menu, like every other item.
    await expect(page.locator('#viewMenuBtn')).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })

  test('View ▸ Edge Detail Limit selects a budget and remembers it', async ({
    page,
  }) => {
    await loadFixture(page)

    await page.locator('#viewMenuBtn').click()
    await menuItem(page, 'view', 'Edge Detail Limit').click()
    await page
      .getByRole('menuitemradio', { name: 'High — 250,000 edges' })
      .click()

    // Since UF-14 the budget persists in the Forge namespace's own copy (U-25).
    await expect
      .poll(() =>
        page.evaluate(() =>
          localStorage.getItem('openscad-forge-display-edgeBudget--forge')
        )
      )
      .toBe('250000')

    // The tick follows the stored budget on reopen.
    await page.locator('#viewMenuBtn').click()
    await menuItem(page, 'view', 'Edge Detail Limit').click()
    await expect(
      page.getByRole('menuitemradio', { name: 'High — 250,000 edges' })
    ).toHaveAttribute('aria-checked', 'true')
  })
})

test.describe('Forge direction (UF-11, File menu)', () => {
  test('File ▸ Export Quality sets the export mode and ticks on reopen', async ({
    page,
  }) => {
    await loadFixture(page)

    expect(
      await page.evaluate(() => window.__forgeDebug.exportQuality())
    ).toBe('model')

    await page.locator('#fileMenuBtn').click()
    await menuItem(page, 'file', 'Export Quality').click()
    await page.getByRole('menuitemradio', { name: 'High (smooth)' }).click()

    expect(
      await page.evaluate(() => window.__forgeDebug.exportQuality())
    ).toBe('high')

    await page.locator('#fileMenuBtn').click()
    await menuItem(page, 'file', 'Export Quality').click()
    await expect(
      page.getByRole('menuitemradio', { name: 'High (smooth)' })
    ).toHaveAttribute('aria-checked', 'true')
  })
})
