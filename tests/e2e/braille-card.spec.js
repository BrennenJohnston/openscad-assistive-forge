/**
 * E2E tests for the Braille Card Customizer toolset (card, charm, sign)
 *
 * Covers: welcome-screen card + variant dropdown, deep-link loading,
 * client-side liblouis translation (type text -> braille preview ->
 * Line_N params), card size presets, severity-tiered errors/warnings,
 * multi-card notice + pager + render-all mode, per-character multi-charm
 * mode (generate-all toggle + charm pager), sign raised-text +
 * independently wrapped braille params, and axe accessibility scans of
 * the panel in all three modes.
 *
 * @license GPL-3.0-or-later
 */

import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { parseSTL } from '../../scripts/parity/stl-stats.mjs'

// Skip WASM-dependent tests in CI - WASM initialization is slow/unreliable
const isCI = !!process.env.CI

// Dismiss first-visit modal so it doesn't block UI interactions
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

/**
 * Dismiss the opt-in save-project prompt that follows program-example
 * loads. It opens shortly after parameter extraction and intercepts
 * pointer events until closed.
 */
async function dismissSavePrompt(page) {
  const notNow = page.locator('#saveProjectNotNow')
  try {
    await notNow.waitFor({ state: 'visible', timeout: 5000 })
    await notNow.click()
    await notNow.waitFor({ state: 'hidden', timeout: 5000 })
  } catch {
    // Prompt didn't appear
  }
}

/** Load a braille example via deep-link and wait for the braille panel. */
async function openBrailleExample(page, exampleKey) {
  await page.goto(`/?example=${exampleKey}`)
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('#braillePanel')).toBeVisible({ timeout: 15000 })
  await dismissSavePrompt(page)
}

const openBrailleCard = (page) => openBrailleExample(page, 'braille-wedge-card')

/** Set a parameter control by name: a list takes a value, a switch a boolean. */
async function setParam(page, name, value) {
  const control = page.locator(`.param-control[data-param-name="${name}"]`)
  await control.waitFor({ state: 'attached', timeout: 15000 })
  // The control may sit in a collapsed parameter group
  await page.evaluate((n) => {
    let group = document
      .querySelector(`.param-control[data-param-name="${n}"]`)
      ?.closest('details')
    while (group) {
      group.open = true
      group = group.parentElement?.closest('details')
    }
  }, name)
  if (typeof value === 'boolean') {
    await control.locator('input[type="checkbox"]').setChecked(value)
  } else {
    await control.locator('select').selectOption(value)
  }
}

/**
 * Render the model at full quality and return the downloaded STL. Generate
 * renders; the same button then reads "Download", and a second press saves.
 */
async function downloadStl(page) {
  await page.locator('#outputFormat').selectOption('stl')
  await page.locator('#primaryActionBtn').click()
  await expect(page.locator('#primaryActionBtn')).toContainText('Download', {
    timeout: 180_000,
  })
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 })
  await page.locator('#primaryActionBtn').click()
  const download = await downloadPromise
  return parseSTL(readFileSync(await download.path()))
}

/**
 * The raised letters' outlines from an exported mesh, row by row from the
 * top, each row left to right: the faces at the highest level, grouped into
 * letters by shared corners; a letter's outline is the edges only one of
 * its faces uses.
 */
function letterRows({ triangles, count }) {
  let top = -Infinity
  for (let i = 2; i < count * 9; i += 3) top = Math.max(top, triangles[i])
  const faces = []
  for (let b = 0; b < count * 9; b += 9) {
    if ([2, 5, 8].every((k) => Math.abs(triangles[b + k] - top) < 1e-4)) {
      faces.push([0, 3, 6].map((k) => [triangles[b + k], triangles[b + k + 1]]))
    }
  }
  const key = (p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`
  const parent = faces.map((_, i) => i)
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const owner = new Map()
  faces.forEach((face, i) => {
    for (const p of face) {
      const k = key(p)
      if (owner.has(k)) parent[find(i)] = find(owner.get(k))
      else owner.set(k, i)
    }
  })
  const groups = new Map()
  faces.forEach((face, i) => {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(face)
  })
  const letters = [...groups.values()].map((group) => {
    const uses = new Map()
    for (const face of group) {
      for (let i = 0; i < 3; i++) {
        const a = face[i]
        const b = face[(i + 1) % 3]
        const k = [key(a), key(b)].sort().join('|')
        uses.set(k, uses.has(k) ? null : [a, b])
      }
    }
    const xs = group.flat().map((p) => p[0])
    const ys = group.flat().map((p) => p[1])
    return {
      minX: Math.min(...xs),
      midY: (Math.min(...ys) + Math.max(...ys)) / 2,
      edges: [...uses.values()].filter(Boolean),
    }
  })
  // Rows are a line pitch (over 20 mm) apart; a letter more than 5 mm
  // below the previous one starts a new row
  letters.sort((a, b) => b.midY - a.midY)
  const rows = []
  for (const letter of letters) {
    const row = rows.at(-1)
    if (row && row.at(-1).midY - letter.midY < 5) row.push(letter)
    else rows.push([letter])
  }
  return rows.map((row) => row.sort((a, b) => a.minX - b.minX))
}

/** The smallest distance between two letters' outlines (mm). */
function outlineGap(a, b) {
  const toSegment = (p, [s, e]) => {
    const dx = e[0] - s[0]
    const dy = e[1] - s[1]
    const len2 = dx * dx + dy * dy
    const t = len2
      ? Math.max(0, Math.min(1, ((p[0] - s[0]) * dx + (p[1] - s[1]) * dy) / len2))
      : 0
    return Math.hypot(s[0] + t * dx - p[0], s[1] + t * dy - p[1])
  }
  let best = Infinity
  for (const u of a.edges) {
    for (const v of b.edges) {
      best = Math.min(
        best,
        toSegment(u[0], v),
        toSegment(u[1], v),
        toSegment(v[0], u),
        toSegment(v[1], u)
      )
    }
  }
  return best
}

/** Groups of triangles joined at their corners: the connected shapes. */
function connectedShapes(tris) {
  const key = (p) => p.map((v) => v.toFixed(4)).join(',')
  const parent = tris.map((_, i) => i)
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  const owner = new Map()
  tris.forEach((tri, i) => {
    for (const p of tri) {
      const k = key(p)
      if (owner.has(k)) parent[find(i)] = find(owner.get(k))
      else owner.set(k, i)
    }
  })
  const groups = new Map()
  tris.forEach((tri, i) => {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(tri)
  })
  return [...groups.values()]
}

const extent = (points, axis) =>
  points.reduce(
    ([lo, hi], p) => [Math.min(lo, p[axis]), Math.max(hi, p[axis])],
    [Infinity, -Infinity]
  )

/**
 * How near its raised border each plate's letters or dots come (mm), from
 * an exported mesh of both plates laid flat. The border is the widest shape
 * at a plate's highest level; the letter plate keeps its top and side
 * rails, the braille plate its bottom and side rails.
 */
function borderClearances({ triangles, count }) {
  const tris = []
  for (let b = 0; b < count * 9; b += 9) {
    tris.push(
      [0, 3, 6].map((k) => [
        triangles[b + k],
        triangles[b + k + 1],
        triangles[b + k + 2],
      ])
    )
  }
  const plates = connectedShapes(tris)
  expect(plates, 'two plates').toHaveLength(2)
  plates.sort((a, b) => extent(b.flat(), 1)[1] - extent(a.flat(), 1)[1])
  const measure = (plate, rail) => {
    const points = plate.flat()
    const [, top] = extent(points, 2)
    // The plate's face is the higher of its two largest flat levels
    const area = new Map()
    for (const [a, b, c] of plate) {
      if (Math.abs(a[2] - b[2]) > 1e-4 || Math.abs(a[2] - c[2]) > 1e-4) continue
      const z = a[2].toFixed(3)
      const cross =
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
      area.set(z, (area.get(z) ?? 0) + Math.abs(cross) / 2)
    }
    const [first, second] = [...area].sort((p, q) => q[1] - p[1])
    const face = Math.max(Number(first[0]), Number(second[0]))
    const highest = plate.filter((tri) =>
      tri.every((p) => Math.abs(p[2] - top) < 1e-4)
    )
    const border = connectedShapes(highest)
      .map((shape) => shape.flat())
      .sort((p, q) => {
        const [pl, ph] = extent(p, 0)
        const [ql, qh] = extent(q, 0)
        return qh - ql - (ph - pl)
      })[0]
    const [xl, xh] = extent(points, 0)
    const [yl, yh] = extent(points, 1)
    const cx = (xl + xh) / 2
    const cy = (yl + yh) / 2
    const inner = {
      left: extent(border.filter((p) => p[0] < cx), 0)[1],
      right: extent(border.filter((p) => p[0] > cx), 0)[0],
      top: rail === 'top' ? extent(border.filter((p) => p[1] > cy), 1)[0] : yh,
      bottom:
        rail === 'bottom' ? extent(border.filter((p) => p[1] < cy), 1)[1] : yl,
    }
    const raised = points.filter(
      (p) =>
        p[2] > face + 0.01 &&
        p[0] > inner.left + 1e-3 &&
        p[0] < inner.right - 1e-3 &&
        p[1] > inner.bottom + 1e-3 &&
        p[1] < inner.top - 1e-3
    )
    const [rl, rh] = extent(raised, 0)
    const [bl, bh] = extent(raised, 1)
    const clearances = { left: rl - inner.left, right: inner.right - rh }
    if (rail === 'top') clearances.top = inner.top - bh
    else clearances.bottom = bl - inner.bottom
    return clearances
  }
  return { letters: measure(plates[0], 'top'), braille: measure(plates[1], 'bottom') }
}

/** Run an axe scan of the braille panel and assert no violations. */
async function expectPanelAxeClean(page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .include('#braillePanel')
    .analyze()

  if (results.violations.length > 0) {
    console.log('Braille panel axe violations:')
    results.violations.forEach((v) => {
      console.log(`- ${v.id}: ${v.description} (impact: ${v.impact})`)
      v.nodes.forEach((node) => {
        console.log(`  Element: ${node.html.substring(0, 120)}`)
      })
    })
  }
  expect(results.violations).toEqual([])
}

/** Chromium's accessibility node for an element: what a screen reader is given. */
async function axNodeOf(page, id) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('Accessibility.enable')
  const { result } = await cdp.send('Runtime.evaluate', {
    expression: `document.getElementById(${JSON.stringify(id)})`,
  })
  const { node } = await cdp.send('DOM.describeNode', {
    objectId: result.objectId,
  })
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', {
    backendNodeId: node.backendNodeId,
    fetchRelatives: false,
  })
  await cdp.detach()
  return nodes.find((n) => n.backendDOMNodeId === node.backendNodeId)
}

test.describe('Braille toolset assets', () => {
  test('example scads and manifests exist for all three variants', async ({ page }) => {
    for (const [dir, scad] of [
      ['braille-wedge-card', 'braille_wedge_card.scad'],
      ['braille-charm', 'braille_charm.scad'],
      ['braille-sign', 'braille_sign.scad'],
    ]) {
      const scadResponse = await page.request.get(`/examples/${dir}/${scad}`)
      expect(scadResponse.ok(), `${dir}/${scad}`).toBe(true)

      const manifestResponse = await page.request.get(
        `/examples/${dir}/manifest.json`
      )
      expect(manifestResponse.ok(), `${dir}/manifest.json`).toBe(true)
      const manifest = await manifestResponse.json()
      expect(manifest.brailleTranslation, dir).toBeDefined()
      expect(manifest.license, dir).toBe('GPL-3.0-or-later')
    }
  })

  test('liblouis engine and tables are served', async ({ page }) => {
    // The dev server answers a file it does not have with the app's own page
    // and a 200, so every check reads what came back, not just the status.
    const wasm = await page.request.get('/wasm/liblouis/liblouis.wasm')
    expect(wasm.ok()).toBe(true)
    expect([...(await wasm.body()).subarray(0, 4)]).toEqual([0, 0x61, 0x73, 0x6d])

    const license = await page.request.get(
      '/wasm/liblouis/COPYING.LESSER.liblouis'
    )
    expect(await license.text()).toContain('GNU LESSER GENERAL PUBLIC LICENSE')

    const catalog = await (
      await page.request.get('/liblouis/tables.json')
    ).json()
    expect(catalog.liblouis).toBe('3.39.0')

    for (const name of ['unicode.dis', 'en-ueb-g1.ctb', 'en-ueb-g2.ctb']) {
      const table = await page.request.get(`/liblouis/tables/${name}`)
      expect(table.ok(), name).toBe(true)
      expect(await table.text(), name).not.toMatch(/^\s*<!doctype/i)
    }
  })
})

test.describe('Welcome screen', () => {
  test('has Braille Card Customizer card with accessible button', async ({ page }) => {
    await page.goto('/')

    const openBtn = page.locator('#openBrailleCardBtn')
    await expect(openBtn).toBeVisible()
    // Braille Sign is the default tool for the Braille Card Customizer card
    expect(await openBtn.getAttribute('data-example')).toBe('braille-sign')

    const ariaLabel = await openBtn.getAttribute('aria-label')
    const textContent = await openBtn.textContent()
    const hasName =
      (ariaLabel && ariaLabel.length > 0) ||
      (textContent && textContent.trim().length > 0)
    expect(hasName).toBe(true)
  })

  test('braille variant dropdown switches the open button target', async ({ page }) => {
    await page.goto('/')

    const select = page.locator('#brailleVariantSelect')
    await expect(select).toBeVisible()

    // Labeled control
    const label = page.locator('label[for="brailleVariantSelect"]')
    await expect(label).toBeVisible()

    const openBtn = page.locator('#openBrailleCardBtn')

    // The change listener is wired during app init, which may still be in
    // flight when the select first renders — retry until it takes effect.
    await expect(async () => {
      await select.selectOption('braille-charm')
      expect(await openBtn.getAttribute('data-example')).toBe('braille-charm')
    }).toPass({ timeout: 15000 })
    await select.selectOption('braille-sign')
    expect(await openBtn.getAttribute('data-example')).toBe('braille-sign')
    await select.selectOption('braille-wedge-card')
    expect(await openBtn.getAttribute('data-example')).toBe('braille-wedge-card')
  })
})

test.describe('Braille translation workflow (card)', () => {
  test('deep-link loads example with translation panel above parameters', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    // Panel controls all present
    await expect(page.locator('#brailleTextInput')).toBeVisible()
    await expect(page.locator('#brailleTableSelect')).toBeVisible()
    await expect(page.locator('#brailleCapsToggle')).toBeAttached()
    await expect(page.locator('#brailleSizePreset')).toBeVisible()

    // Capitals are preserved by default
    await expect(page.locator('#brailleCapsToggle')).toBeChecked()

    // Generated parameter controls still render below (raw Line_N inputs
    // stay available for advanced users, inside collapsed groups)
    await expect(
      page.locator('.param-control[data-param-name="Line_1"]')
    ).toBeAttached({ timeout: 10000 })

    // Table catalog populated; the card starts on contracted (Grade 2) UEB
    const selectedTable = await page.locator('#brailleTableSelect').inputValue()
    expect(selectedTable).toBe('en-ueb-g2.ctb')
  })

  test('typing text translates to braille and updates Line_N params', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    const textarea = page.locator('#brailleTextInput')
    await textarea.fill('hello world')

    // Preview shows the translated braille; on the default 200 mm card
    // (26 cells/line) "hello world" fits on a single line
    const preview = page.locator('#braillePreview')
    await expect(preview).toContainText('\u2813\u2811\u2807\u2807\u2815', {
      timeout: 20000,
    }) // ⠓⠑⠇⠇⠕
    await expect(preview).toContainText('\u2838\u283A') // ⠸⠺, "world" in Grade 2

    // Source text is shown under the braille line. The panel's initial
    // layout of its default text ('hello\nworld', two lines) may render
    // just after the fill, so wait for the single-line state to settle
    // (scoped to .first() — the transient state has two source spans).
    await expect(
      preview.locator('.braille-preview-source').first()
    ).toContainText('hello world', { timeout: 20000 })

    // The braille flows into the SCAD Line_1 parameter input (words joined
    // by the braille blank cell U+2800)
    const line1Input = page.locator(
      '.param-control[data-param-name="Line_1"] input'
    )
    await expect(line1Input).toHaveValue(
      '\u2813\u2811\u2807\u2807\u2815\u2800\u2838\u283A',
      { timeout: 10000 }
    )
  })

  test('card size preset writes dimensions and turns auto-size off', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    // Auto-size is the SCAD default, so the select starts on the auto option
    await expect(page.locator('#brailleSizePreset')).toHaveValue('auto')

    await page.locator('#brailleSizePreset').selectOption('business')

    const widthInput = page.locator(
      '.param-control[data-param-name="card_face_width_mm"] input[type="number"]'
    )
    await expect(widthInput.first()).toHaveValue('89', { timeout: 10000 })
    const heightInput = page.locator(
      '.param-control[data-param-name="card_face_height_mm"] input[type="number"]'
    )
    await expect(heightInput.first()).toHaveValue('51', { timeout: 10000 })

    // Choosing a size preset forces auto-size off
    const autoSelect = page.locator(
      '.param-control[data-param-name="auto_size_card"] select'
    )
    await expect(autoSelect).toHaveValue('Off', { timeout: 10000 })

    // Picking the auto option turns it back on
    await page.locator('#brailleSizePreset').selectOption('auto')
    await expect(autoSelect).toHaveValue('On', { timeout: 10000 })
  })

  test('overflow produces the error alert when splitting is off', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    // Business card (10 cells x 3 rows capacity) + splitting off + many lines
    await page.locator('#brailleSizePreset').selectOption('business')
    await page.locator('.braille-panel-layout summary').click()
    await page.locator('#brailleSplitCards').uncheck()

    const lines = Array.from({ length: 6 }, (_, i) => `line ${i + 1}`)
    await page.locator('#brailleTextInput').fill(lines.join('\n'))

    const errors = page.locator('#brailleErrors')
    await expect(errors).not.toBeEmpty({ timeout: 20000 })
    await expect(errors).toContainText('Error:')
    await expect(errors).toContainText(/fit on\s+this card/)

    // Error box is an alert region
    expect(await errors.getAttribute('role')).toBe('alert')
  })

  test('long text shows multi-card notice and pager', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    // 10 hard lines with default max 8 rows/card -> 2 cards
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`)
    await page.locator('#brailleTextInput').fill(lines.join('\n'))

    // Prominent notice
    const notice = page.locator('#brailleMultiCardNotice')
    await expect(notice).toBeVisible({ timeout: 20000 })
    await expect(notice).toContainText('spans 2 cards')
    expect(await notice.getAttribute('role')).toBe('status')

    const pager = page.locator('#brailleCardPager')
    await expect(pager).toBeVisible()
    await expect(page.locator('#braillePagerStatus')).toHaveText('Card 1 of 2')
    // The hint shows the real friendly export name (first word of the text)
    await expect(page.locator('#braillePagerHint')).toContainText(
      'Braille Card 1 of 2 line.stl'
    )

    // Pager is keyboard-operable: prev unavailable on the first card, next
    // works and keeps focus on the last (D-228)
    await expect(page.locator('#braillePrevCard')).toHaveAttribute(
      'aria-disabled',
      'true'
    )
    const nextBtn = page.locator('#brailleNextCard')
    await nextBtn.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#braillePagerStatus')).toHaveText('Card 2 of 2')
    await expect(nextBtn).toHaveAttribute('aria-disabled', 'true')
    await expect(nextBtn).toBeFocused()
  })

  test('render-all toggle writes every line and the All cards layout', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`)
    await page.locator('#brailleTextInput').fill(lines.join('\n'))

    const renderAll = page.locator('#brailleRenderAll')
    await expect(renderAll).toBeVisible({ timeout: 20000 })
    await renderAll.check()

    // Pager hides; the whole set is one model now
    await expect(page.locator('#brailleCardPager')).toBeHidden()
    await expect(page.locator('#brailleMultiCardNotice')).toContainText(
      'Braille Cards line.stl'
    )

    // card_layout switches to All cards
    const layoutSelect = page.locator(
      '.param-control[data-param-name="card_layout"] select'
    )
    await expect(layoutSelect).toHaveValue('All cards', { timeout: 10000 })

    // Lines beyond one card are written too (line 9 lands in Line_9)
    const line9Input = page.locator(
      '.param-control[data-param-name="Line_9"] input'
    )
    await expect(line9Input).not.toHaveValue('', { timeout: 10000 })

    // Turning it off restores Single layout
    await renderAll.uncheck()
    await expect(layoutSelect).toHaveValue('Single', { timeout: 10000 })
    await expect(page.locator('#brailleCardPager')).toBeVisible()
  })

  test('capital letters warning appears when preserve-caps is turned off', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    await page.locator('#brailleCapsToggle').uncheck()
    await page.locator('#brailleTextInput').fill('Hello')

    const warnings = page.locator('#brailleWarnings')
    await expect(warnings).not.toBeEmpty({ timeout: 20000 })
    await expect(warnings).toContainText('Warning:')
    await expect(warnings).toContainText('lowercase')

    // Informational tier is a status region, not an interrupting alert
    expect(await warnings.getAttribute('role')).toBe('status')
  })

  test('no caps warning while preserve-caps stays on (default)', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    await page.locator('#brailleTextInput').fill('Hello')

    // Preview updates (capital indicator ⠠ then h-e-l-l-o)
    await expect(page.locator('#braillePreview')).toContainText(
      '\u2820\u2813\u2811\u2807\u2807\u2815',
      { timeout: 20000 }
    )
    await expect(page.locator('#brailleWarnings')).toBeEmpty()
  })

  test('with auto-wrap off, a no-break space is a word space', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)
    await page.locator('.braille-panel-layout summary').click()
    await page.locator('#brailleAutoWrap').uncheck()
    await page.locator('#brailleTextInput').fill('Room\u00A0101')
    // The cells of "Room 101": a blank cell, not the raw character, and
    // nothing reported as untranslatable
    await expect(
      page.locator('#braillePreview .braille-preview-braille').first()
    ).toHaveText(
      '\u2820\u2817\u2815\u2815\u280D\u2800\u283C\u2801\u281A\u2801',
      { timeout: 20000 }
    )
    await expect(page.locator('#brailleWarnings')).toBeEmpty()
  })

  test('translated braille renders through the WASM pipeline', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI')
    test.setTimeout(180_000)

    await openBrailleCard(page)

    // Wait for the WASM engine before touching parameters
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: 120_000,
    })

    // Type text and wait for the translation to land in the preview
    await page.locator('#brailleTextInput').fill('hi')
    await expect(page.locator('#braillePreview')).toContainText(
      '\u2813\u280A', // ⠓⠊
      { timeout: 20000 }
    )

    // The panel's parameter write triggers auto-preview; wait for the
    // preview state indicator to settle on current (not error)
    await page.waitForFunction(
      () => {
        const indicator = document.querySelector('.preview-state-indicator')
        if (!indicator) return false
        return (
          indicator.className.includes('state-current') ||
          indicator.className.includes('state-error')
        )
      },
      { timeout: 150_000 }
    )
    const indicatorClass = await page
      .locator('.preview-state-indicator')
      .getAttribute('class')
    expect(indicatorClass).not.toContain('state-error')
  })

  test('rows clamp is surfaced as a warning instead of a silent grid_rows reset', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    // Business card height (51 mm) fits 3 rows at the default 10.1 mm line
    // spacing and 6 mm margin; the default Max rows per card is 8.
    await page.locator('#brailleSizePreset').selectOption('business')
    await page.locator('#brailleTextInput').fill('hello')

    const warnings = page.locator('#brailleWarnings')
    await expect(warnings).not.toBeEmpty({ timeout: 20000 })
    await expect(warnings).toContainText('fits 3 rows')

    // grid_rows carries the clamped value...
    const gridRowsInput = page.locator(
      '.param-control[data-param-name="grid_rows"] input[type="number"]'
    )
    await expect(gridRowsInput.first()).toHaveValue('3', { timeout: 10000 })
    // ...while Max rows per card keeps the user's requested value (sticky)
    await expect(page.locator('#brailleMaxRows')).toHaveValue('8')
  })

  test('editing grid_rows directly syncs Max rows per card (two-way)', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)
    await page.locator('#brailleTextInput').fill('hello')
    await expect(page.locator('#braillePreview')).toContainText(
      '\u2813\u2811\u2807\u2807\u2815',
      { timeout: 20000 }
    )

    // The raw grid_rows control lives inside a collapsed parameter
    // group; expand it so the input is interactable.
    await page
      .locator('.param-control[data-param-name="grid_rows"]')
      .waitFor({ state: 'attached', timeout: 10000 })
    await page.evaluate(() => {
      const control = document.querySelector(
        '.param-control[data-param-name="grid_rows"]'
      )
      const group = control?.closest('details.param-group')
      if (group) group.open = true
    })

    const gridRowsInput = page
      .locator('.param-control[data-param-name="grid_rows"] input[type="number"]')
      .first()
    await gridRowsInput.fill('4')
    await gridRowsInput.blur()

    await expect(page.locator('#brailleMaxRows')).toHaveValue('4', {
      timeout: 10000,
    })
    // The next layout keeps the user's value instead of resetting it
    await expect(gridRowsInput).toHaveValue('4', { timeout: 10000 })
  })

  test('braille editor: translate to braille, verbatim use, and back-translation', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    await page.locator('#brailleTextInput').fill('hello')
    await expect(page.locator('#braillePreview')).toContainText(
      '\u2813\u2811\u2807\u2807\u2815',
      { timeout: 20000 }
    )

    // Open the editor and fill it from the text
    await page.locator('#brailleFieldEditor summary').click()
    await page.locator('#brailleFieldFromText').click()
    const field = page.locator('#brailleFieldInput')
    await expect(field).toHaveValue('\u2813\u2811\u2807\u2807\u2815', {
      timeout: 20000,
    })
    await expect(page.locator('#brailleFieldStatus')).toContainText(
      'Filled from your text'
    )

    // Hand-edit the braille: the card now uses it exactly as written
    await field.fill('\u2813\u2811\u2807\u2807\u2815\u2815')
    const line1Input = page.locator(
      '.param-control[data-param-name="Line_1"] input'
    )
    await expect(line1Input).toHaveValue(
      '\u2813\u2811\u2807\u2807\u2815\u2815',
      { timeout: 10000 }
    )
    const warnings = page.locator('#brailleWarnings')
    await expect(warnings).toContainText('exactly as written')

    // Back-translate the edited braille into the text box
    await page.locator('#brailleFieldToText').click()
    await expect(page.locator('#brailleTextInput')).toHaveValue('helloo', {
      timeout: 20000,
    })
  })

  test('braille editor rejects non-braille characters with an error', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    await page.locator('#brailleFieldEditor summary').click()
    await page.locator('#brailleFieldInput').fill('\u2813hello')

    const errors = page.locator('#brailleErrors')
    await expect(errors).not.toBeEmpty({ timeout: 20000 })
    await expect(errors).toContainText('not a braille character')
  })

  test('braille editor converts pasted braille ASCII into braille cells', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    await page.locator('#brailleFieldEditor summary').click()
    const field = page.locator('#brailleFieldInput')
    // h>ry@a" is braille ASCII from the Braille Authority's card guidelines
    await field.fill('h>ry@a"')
    await expect(page.locator('#brailleErrors')).toContainText(
      'not a braille character',
      { timeout: 20000 }
    )

    await page.locator('#brailleFieldFromAscii').click()
    const cells = '\u2813\u281C\u2817\u283D\u2808\u2801\u2810'
    await expect(field).toHaveValue(cells)
    await expect(page.locator('#brailleFieldStatus')).toHaveText(
      'Converted 1 line of braille ASCII to braille cells.'
    )
    await expect(page.locator('#braillePreview')).toContainText(cells, {
      timeout: 20000,
    })
    await expect(
      page.locator('.param-control[data-param-name="Line_1"] input')
    ).toHaveValue(cells, { timeout: 10000 })
    await expect(page.locator('#brailleErrors')).toBeEmpty()
    await expectPanelAxeClean(page)
  })

  // D-230: the empty status line was display: none, so its first message
  // arrived together with its reveal and NVDA did not say it ("Six-key entry
  // is on.", "Filled from your text: ..."). Empty, it stays rendered and in
  // the accessibility tree, only visually hidden.
  test('the braille editor status line is in the accessibility tree while empty', async ({ page, browserName }) => {
    await openBrailleCard(page)
    await page.locator('#brailleFieldEditor summary').click()
    const status = page.locator('#brailleFieldStatus')
    await expect(status).toHaveText('')
    expect(await status.evaluate((el) => getComputedStyle(el).display)).not.toBe(
      'none'
    )
    if (browserName === 'chromium') {
      const ax = await axNodeOf(page, 'brailleFieldStatus')
      expect(ax?.ignored).toBe(false)
      expect(ax?.role?.value).toBe('status')
    }
  })

  // D-229: an empty message box was hidden, so the first error arrived with
  // the box itself and NVDA said only "alert". Empty, each box stays rendered
  // and in the accessibility tree, taking no room on the page.
  test('the empty message boxes stay in the accessibility tree and take no room', async ({ page, browserName }) => {
    await openBrailleCard(page)
    for (const [id, role] of [
      ['brailleErrors', 'alert'],
      ['brailleWarnings', 'status'],
    ]) {
      const box = page.locator(`#${id}`)
      await expect(box).toBeEmpty()
      const shape = await box.evaluate((el) => {
        const r = el.getBoundingClientRect()
        return {
          display: getComputedStyle(el).display,
          position: getComputedStyle(el).position,
          area: r.width * r.height,
        }
      })
      expect(shape.display).not.toBe('none')
      expect(shape.position).toBe('absolute')
      expect(shape.area).toBeLessThanOrEqual(1)
      if (browserName === 'chromium') {
        const ax = await axNodeOf(page, id)
        expect(ax?.ignored).toBe(false)
        expect(ax?.role?.value).toBe(role)
      }
    }
  })

  test('six-key entry makes a cell from a chord, and Tab still leaves the editor', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)

    await page.locator('#brailleFieldEditor summary').click()
    await page.locator('#brailleSixKeyToggle').check()
    await expect(page.locator('#brailleFieldStatus')).toHaveText(
      'Six-key entry is on.'
    )
    const field = page.locator('#brailleFieldInput')
    await field.focus()
    // Hold f, d and k together, then let go: dots 1, 2 and 5
    for (const key of ['f', 'd', 'k']) await page.keyboard.down(key)
    for (const key of ['f', 'd', 'k']) await page.keyboard.up(key)
    await expect(field).toHaveValue('\u2813')
    await expect(
      page.locator('.param-control[data-param-name="Line_1"] input')
    ).toHaveValue('\u2813', { timeout: 10000 })
    await expect(page.locator('#brailleErrors')).toBeEmpty()
    await expectPanelAxeClean(page)

    await page.keyboard.press('Tab')
    await expect(page.locator('#brailleFieldToText')).toBeFocused()
  })

  test('six-key entry says every cell, even when chords come quickly', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI')
    test.setTimeout(300_000)

    await openBrailleCard(page)
    // The first render's own messages would otherwise arrive among the cells
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: 120_000,
    })
    await expect(page.locator('#statusArea')).toHaveText(/Preview ready/, {
      timeout: 120_000,
    })

    await page.locator('#brailleFieldEditor summary').click()
    await page.locator('#brailleSixKeyToggle').check()
    // Every text the polite announcer is given, in order
    await page.evaluate(() => {
      window.__said = []
      const region = document.getElementById('srAnnouncer')
      new MutationObserver(() => {
        const text = region.textContent.trim()
        if (text) window.__said.push(text)
      }).observe(region, { childList: true, characterData: true, subtree: true })
    })
    await page.locator('#brailleFieldInput').focus()
    // Three chords 0.15 s apart: dots 1 2 5, dots 1 3, dots 2 5
    for (const keys of [['f', 'd', 'k'], ['f', 's'], ['d', 'k']]) {
      for (const key of keys) await page.keyboard.down(key)
      for (const key of keys) await page.keyboard.up(key)
      await page.waitForTimeout(150)
    }
    await expect(page.locator('#brailleFieldInput')).toHaveValue(
      '\u2813\u2805\u2812'
    )
    await expect
      .poll(() =>
        page.evaluate(() => window.__said.filter((text) => text.startsWith('dots')))
      )
      .toEqual(['dots 1 2 5', 'dots 1 3', 'dots 2 5'])
  })

  test('braille panel has no axe violations (normal + warning + error states)', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleCard(page)
    await page.locator('#brailleTextInput').fill('hello world')
    await expect(page.locator('#braillePreview')).toContainText(
      '\u2813\u2811\u2807\u2807\u2815',
      { timeout: 20000 }
    )
    await expectPanelAxeClean(page)

    // Braille editor open with content (verbatim mode + status live region)
    await page.locator('#brailleFieldEditor summary').click()
    await page.locator('#brailleFieldInput').fill('\u2813\u2811')
    await expect(page.locator('#brailleWarnings')).not.toBeEmpty({
      timeout: 20000,
    })
    await expectPanelAxeClean(page)
    await page.locator('#brailleFieldInput').fill('')

    // Warning tier visible (caps dropped)
    await page.locator('#brailleCapsToggle').uncheck()
    await page.locator('#brailleTextInput').fill('Hello there')
    await expect(page.locator('#brailleWarnings')).not.toBeEmpty({
      timeout: 20000,
    })
    await expectPanelAxeClean(page)

    // Error tier + multi-card notice visible
    await page.locator('#brailleSizePreset').selectOption('business')
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`)
    await page.locator('#brailleTextInput').fill(lines.join('\n'))
    await expect(page.locator('#brailleMultiCardNotice')).toBeVisible({
      timeout: 20000,
    })
    await expectPanelAxeClean(page)
  })
})

test.describe('Braille Charm workflow', () => {
  test('charm panel translates a single character into braille_chars', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-charm')

    // Charm mode: single-line input, no size presets; the pager exists
    // but stays hidden while there is only one charm
    await expect(page.locator('#brailleTextInput')).toBeVisible()
    await expect(page.locator('#brailleSizePreset')).toHaveCount(0)
    await expect(page.locator('#brailleCardPager')).toBeHidden()

    await page.locator('#brailleTextInput').fill('h')

    const preview = page.locator('#braillePreview')
    await expect(preview).toContainText('\u2813', { timeout: 20000 }) // ⠓
    await expect(preview.locator('.braille-preview-source')).toContainText('h')

    const charInput = page.locator(
      '.param-control[data-param-name="braille_chars"] input'
    )
    await expect(charInput).toHaveValue('\u2813', { timeout: 10000 })

    // Single charm stays in Single layout with no notice
    await expect(page.locator('#brailleMultiCardNotice')).toBeHidden()
  })

  test('multi-character input makes one charm per character (generate all on by default)', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-charm')

    await page.locator('#brailleTextInput').fill('hi')

    // Notice reports one charm per character; the generate-all toggle is
    // checked by default so the pager stays hidden
    const notice = page.locator('#brailleMultiCardNotice')
    await expect(notice).toBeVisible({ timeout: 20000 })
    await expect(notice).toContainText('2 charms')
    await expect(page.locator('#brailleRenderAll')).toBeChecked()
    await expect(page.locator('#brailleCardPager')).toBeHidden()

    // Each character's braille lands in its own Charm_N slot, the layout
    // switches to All charms, and braille_chars mirrors the first charm
    const layoutSelect = page.locator(
      '.param-control[data-param-name="charm_layout"] select'
    )
    await expect(layoutSelect).toHaveValue('All charms', { timeout: 10000 })
    await expect(
      page.locator('.param-control[data-param-name="Charm_1"] input')
    ).toHaveValue('\u2813', { timeout: 10000 }) // ⠓
    await expect(
      page.locator('.param-control[data-param-name="Charm_2"] input')
    ).toHaveValue('\u280A', { timeout: 10000 }) // ⠊
    await expect(
      page.locator('.param-control[data-param-name="braille_chars"] input')
    ).toHaveValue('\u2813')
  })

  test('turning generate-all off pages through charms one at a time', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-charm')

    await page.locator('#brailleTextInput').fill('hi')

    const renderAll = page.locator('#brailleRenderAll')
    await expect(renderAll).toBeVisible({ timeout: 20000 })
    await renderAll.uncheck()

    // Pager appears, layout drops back to Single, braille_chars carries
    // the charm being shown
    const pager = page.locator('#brailleCardPager')
    await expect(pager).toBeVisible()
    await expect(page.locator('#braillePagerStatus')).toHaveText(
      'Charm 1 of 2: h'
    )
    const layoutSelect = page.locator(
      '.param-control[data-param-name="charm_layout"] select'
    )
    await expect(layoutSelect).toHaveValue('Single', { timeout: 10000 })
    const charInput = page.locator(
      '.param-control[data-param-name="braille_chars"] input'
    )
    await expect(charInput).toHaveValue('\u2813', { timeout: 10000 }) // ⠓

    // Pager is keyboard-operable. At either end its button stays focusable,
    // marked unavailable rather than disabled, which dropped focus to the
    // page (D-228)
    await expect(page.locator('#braillePrevCard')).toHaveAttribute(
      'aria-disabled',
      'true'
    )
    const nextCharm = page.locator('#brailleNextCard')
    await nextCharm.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#braillePagerStatus')).toHaveText(
      'Charm 2 of 2: i'
    )
    await expect(charInput).toHaveValue('\u280A', { timeout: 10000 }) // ⠊
    await expect(nextCharm).toHaveAttribute('aria-disabled', 'true')
    await expect(nextCharm).toBeFocused()
    // Pressed again, the unavailable button changes nothing
    await page.keyboard.press('Enter')
    await expect(page.locator('#braillePagerStatus')).toHaveText(
      'Charm 2 of 2: i'
    )
    await expect(nextCharm).toBeFocused()
  })

  test('charm braille editor: one line per charm, used exactly as written', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-charm')

    await page.locator('#brailleTextInput').fill('hi')
    await expect(page.locator('#brailleMultiCardNotice')).toBeVisible({
      timeout: 20000,
    })

    // Filled from the characters: one line per charm
    await page.locator('#brailleFieldEditor summary').click()
    await page.locator('#brailleFieldFromText').click()
    const field = page.locator('#brailleFieldInput')
    await expect(field).toHaveValue('\u2813\n\u280A', { timeout: 20000 })

    // A hand-written line is its own charm, its cells exactly as written
    await field.fill('\u2813\n\u2820\u2801')
    await expect(
      page.locator('.param-control[data-param-name="Charm_2"] input')
    ).toHaveValue('\u2820\u2801', { timeout: 10000 })
    await expect(page.locator('#brailleMultiCardNotice')).toContainText(
      'The braille editor makes 2 charms, one per line.'
    )
    await expect(page.locator('#brailleWarnings')).toContainText(
      'the charms use that braille exactly as written'
    )

    // Braille ASCII converts in place: a is dot 1, b dots 1 and 2
    await field.fill('a\nb')
    await page.locator('#brailleFieldFromAscii').click()
    await expect(field).toHaveValue('\u2801\n\u2803')
    await expect(
      page.locator('.param-control[data-param-name="Charm_1"] input')
    ).toHaveValue('\u2801', { timeout: 10000 })

    // A line longer than a charm is named
    await field.fill('\u2801\u2803\u2809')
    await expect(page.locator('#brailleErrors')).toContainText(
      'Line 1 of the braille editor is 3 cells, but a charm fits 2.',
      { timeout: 20000 }
    )

    // The braille reads back into the characters box
    await field.fill('\u2813\u280A')
    await page.locator('#brailleFieldToText').click()
    await expect(page.locator('#brailleTextInput')).toHaveValue('hi', {
      timeout: 20000,
    })

    await expectPanelAxeClean(page)
  })

  test('charm panel has no axe violations', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-charm')
    await page.locator('#brailleTextInput').fill('abc')
    await expect(page.locator('#brailleMultiCardNotice')).toBeVisible({
      timeout: 20000,
    })
    await expectPanelAxeClean(page)
  })
})

test.describe('Braille Sign workflow', () => {
  test('the letter height setting is the height of the capital I (ADA 703.2.5)', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI')
    test.setTimeout(300_000)

    await openBrailleExample(page, 'braille-sign')
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: 120_000,
    })
    await page.locator('#brailleTextInput').fill('I')
    await expect(
      page.locator('.param-control[data-param-name="sign_text_1"] input')
    ).toHaveValue('I', { timeout: 20000 })
    await setParam(page, 'sign_part', 'Letter plate')
    await setParam(page, 'add_border', false)
    const charHeight = Number(
      await page
        .locator('.param-control[data-param-name="char_height_mm"] input[type="number"]')
        .first()
        .inputValue()
    )

    // The letter's top face is the highest level of the plate; its extent
    // across the plate is the capital I's height
    const { triangles, count } = await downloadStl(page)
    let top = -Infinity
    for (let i = 2; i < count * 9; i += 3) top = Math.max(top, triangles[i])
    let minY = Infinity
    let maxY = -Infinity
    for (let i = 0; i < count * 9; i += 3) {
      if (Math.abs(triangles[i + 2] - top) < 1e-4) {
        minY = Math.min(minY, triangles[i + 1])
        maxY = Math.max(maxY, triangles[i + 1])
      }
    }
    const height = maxY - minY
    expect(
      Math.abs(height - charHeight),
      `capital I ${height.toFixed(4)} mm at the setting ${charHeight}`
    ).toBeLessThanOrEqual(0.05)
  })

  test('adjacent raised letters keep ADA 703.2.7 spacing', async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI')
    test.setTimeout(300_000)

    await openBrailleExample(page, 'braille-sign')
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: 120_000,
    })
    // A-A is the closest pair of capitals, then K-A and A-X; each word is its
    // own row
    await page.locator('#brailleTextInput').fill('KAYAK TAXI BAZAAR')
    await expect(
      page.locator('.param-control[data-param-name="sign_text_3"] input')
    ).toHaveValue('BAZAAR', { timeout: 20000 })
    await setParam(page, 'sign_part', 'Letter plate')
    await setParam(page, 'add_border', false)

    const rows = letterRows(await downloadStl(page))
    expect(rows.map((row) => row.length)).toEqual([5, 4, 6])
    // The stroke is the width of the I, the narrowest letter
    const stroke = Math.min(
      ...rows.flat().map((letter) => {
        const xs = letter.edges.flat().map((p) => p[0])
        return Math.max(...xs) - Math.min(...xs)
      })
    )
    const gaps = rows.flatMap((row) =>
      row.slice(1).map((letter, i) => outlineGap(row[i], letter))
    )
    const shown = gaps.map((g) => g.toFixed(2)).join(', ')
    expect(Math.min(...gaps), `gaps ${shown} mm`).toBeGreaterThanOrEqual(3.2)
    expect(Math.max(...gaps), `gaps ${shown} mm`).toBeLessThanOrEqual(4 * stroke)
  })

  for (const [label, text, rows] of [
    ['the default text', null, ['Room 101']],
    ['three rows', 'ROOM 101\nOFFICE\nEXIT', ['ROOM 101', 'OFFICE', 'EXIT']],
    [
      'six rows',
      'ROOM 101\nOFFICE\nEXIT\nSTAIR A\nLOBBY\nWAY OUT',
      ['ROOM 101', 'OFFICE', 'EXIT', 'STAIR A', 'LOBBY', 'WAY OUT'],
    ],
    ['a long word', 'CONFERENCE ROOM', ['CONFERENCE', 'ROOM']],
    ['a full row of braille', 'ROOM 101 AND ROOM 102', ['ROOM 101', 'AND', 'ROOM 102']],
  ]) {
    test(`keeps letters and braille 3/8 in (9.525 mm) inside the border: ${label} (ADA 703.2.7, 703.3.2)`, async ({
      page,
    }) => {
      test.skip(isCI, 'WASM rendering is slow/unreliable in CI')
      test.setTimeout(300_000)

      await openBrailleExample(page, 'braille-sign')
      await page.waitForSelector('body[data-wasm-ready="true"]', {
        state: 'attached',
        timeout: 120_000,
      })
      if (text !== null) await page.locator('#brailleTextInput').fill(text)
      for (const [i, row] of rows.entries()) {
        await expect(
          page.locator(`.param-control[data-param-name="sign_text_${i + 1}"] input`)
        ).toHaveValue(row, { timeout: 20000 })
      }
      await setParam(page, 'print_orientation', 'Flat')

      const { letters, braille } = borderClearances(await downloadStl(page))
      const shown = (c) =>
        Object.entries(c)
          .map(([side, mm]) => `${side} ${mm.toFixed(3)}`)
          .join(', ')
      // The letter table carries six significant digits; a thousandth of a
      // millimeter covers its rounding
      expect(
        Math.min(...Object.values(letters)),
        `letters: ${shown(letters)} mm`
      ).toBeGreaterThanOrEqual(9.525 - 0.001)
      expect(
        Math.min(...Object.values(braille)),
        `braille: ${shown(braille)} mm`
      ).toBeGreaterThanOrEqual(9.525 - 0.001)
    })
  }

  test("a dot size outside ADA's range stops the model and says why (D-224)", async ({ page }) => {
    test.skip(isCI, 'WASM rendering is slow/unreliable in CI')
    test.setTimeout(300_000)

    await openBrailleExample(page, 'braille-sign')
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: 120_000,
    })
    await expect(page.locator('#statusArea')).toHaveText(/Preview ready/, {
      timeout: 120_000,
    })
    // Every announcement from here on, from both live regions
    await page.evaluate(() => {
      window.__announced = []
      for (const id of ['srAnnouncer', 'srAnnouncerAssertive']) {
        const node = document.getElementById(id)
        new MutationObserver(() => {
          const text = node.textContent.trim()
          if (text) window.__announced.push(`${id}: ${text}`)
        }).observe(node, { childList: true, characterData: true, subtree: true })
      }
      let group = document
        .querySelector('.param-control[data-param-name="rounded_dot_base_diameter"]')
        ?.closest('details')
      while (group) {
        group.open = true
        group = group.parentElement?.closest('details')
      }
    })
    const box = page.locator(
      '.param-control[data-param-name="rounded_dot_base_diameter"] input[type="number"]'
    )
    await box.fill('1.4')
    await box.press('Enter')

    const sentence =
      'The model stopped: rounded_dot_base_diameter must be 1.5 to 1.6 mm (ADA 703.3.1).'
    await expect(page.locator('#statusArea')).toHaveText(sentence, {
      timeout: 120_000,
    })
    await expect(page.locator('#dependencyGuidanceModal')).toBeHidden()
    const announced = await page.evaluate(() => window.__announced)
    const shown = announced.join(' | ')
    expect(announced, shown).toContain(`srAnnouncerAssertive: ${sentence}`)
    expect(announced.filter((a) => a.endsWith(sentence)), shown).toHaveLength(1)
    expect(shown).not.toContain('produces no geometry')
  })

  test('sign panel writes raised-text and braille params', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')

    // Grade 2 is the sign default (ADA recommendation)
    const selectedTable = await page.locator('#brailleTableSelect').inputValue()
    expect(selectedTable).toBe('en-ueb-g2.ctb')

    await page.locator('#brailleTextInput').fill('Exit\nLevel 2')

    const preview = page.locator('#braillePreview')
    await expect(preview.locator('.braille-preview-source').first()).toContainText(
      'Exit',
      { timeout: 20000 }
    )

    // Latin text lands in sign_text_N, braille in Line_N
    const text1 = page.locator(
      '.param-control[data-param-name="sign_text_1"] input'
    )
    await expect(text1).toHaveValue('Exit', { timeout: 10000 })
    const text2 = page.locator(
      '.param-control[data-param-name="sign_text_2"] input'
    )
    await expect(text2).toHaveValue('Level 2', { timeout: 10000 })

    const line1 = page.locator('.param-control[data-param-name="Line_1"] input')
    await expect(line1).not.toHaveValue('', { timeout: 10000 })
    const line2 = page.locator('.param-control[data-param-name="Line_2"] input')
    await expect(line2).not.toHaveValue('', { timeout: 10000 })
  })

  test('sign warns when more lines are entered than the sign holds', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')

    await page
      .locator('#brailleTextInput')
      .fill('one\ntwo\nthree\nfour\nfive\nsix\nseven')

    const errors = page.locator('#brailleErrors')
    await expect(errors).not.toBeEmpty({ timeout: 20000 })
    await expect(errors).toContainText('holds 6 lines')
  })

  test('sign wraps a long line onto additional rows', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')

    await page
      .locator('#brailleTextInput')
      .fill('WATAP Washington Assistive Technology Act Program')

    // The single input line wraps onto multiple rows instead of
    // overflowing the sign width.
    const previewLines = page.locator('#braillePreview .braille-preview-line')
    await expect
      .poll(async () => previewLines.count(), { timeout: 20000 })
      .toBeGreaterThan(1)

    // Wrapped rows land in the raised-text params.
    const text2 = page.locator(
      '.param-control[data-param-name="sign_text_2"] input'
    )
    await expect(text2).not.toHaveValue('', { timeout: 10000 })

    // Braille rows pack independently of the letter rows (ADA 703.3.2):
    // braille cells are far narrower than 16 mm raised letters, so the
    // braille reflows into fewer, fuller rows.
    let textRowCount = 0
    for (let i = 1; i <= 6; i++) {
      const value = await page
        .locator(`.param-control[data-param-name="sign_text_${i}"] input`)
        .inputValue()
      if (value !== '') textRowCount++
    }
    expect(await previewLines.count()).toBeLessThan(textRowCount)

    // The row summary reports both counts.
    await expect(page.locator('#brailleSignRowSummary')).toContainText(
      'Raised letters'
    )
  })

  test('sign braille follows the ADA sign rule until Exactly as typed is chosen (D-236)', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')
    const group = page.getByRole('group', { name: 'Braille capitals' })
    const ada = group.getByRole('radio', {
      name: 'ADA sign rule: lowercase, except single letters (the B in 3B)',
    })
    const typed = group.getByRole('radio', {
      name: 'Exactly as typed (UEB capital signs)',
    })
    await expect(ada).toBeChecked()
    await expect(typed).not.toBeChecked()
    await expect(page.locator('#brailleCapsToggle')).toHaveCount(0)
    const first = page.locator('#braillePreview .braille-preview-braille').first()
    // The default "Room 101" and an all-capitals ROOM 101: no capital sign
    await expect(first).toHaveText('\u2817\u2815\u2815\u280D\u2800\u283C\u2801\u281A\u2801', { timeout: 20000 })
    await page.locator('#brailleTextInput').fill('ROOM 101')
    await expect(first).toHaveText('\u2817\u2815\u2815\u280D\u2800\u283C\u2801\u281A\u2801', { timeout: 20000 })
    // A letter standing alone keeps its capital (the Braille Authority's
    // staircase 3B): room, number 3, capital B
    await page.locator('#brailleTextInput').fill('Room 3B')
    await expect(first).toHaveText('\u2817\u2815\u2815\u280D\u2800\u283C\u2809\u2820\u2803', { timeout: 20000 })
    await expect(page.locator('#brailleWarnings')).toBeEmpty()
    // The raised letters keep what was typed; the model raises it in capitals
    await expect(
      page.locator('.param-control[data-param-name="sign_text_1"] input')
    ).toHaveValue('Room 3B')
    await expectPanelAxeClean(page)

    // An arrow key moves the choice, as in any radio group
    await ada.focus()
    await page.keyboard.press('ArrowDown')
    await expect(typed).toBeChecked()
    await expect(typed).toBeFocused()
    await expect(first).toHaveText('\u2820\u2817\u2815\u2815\u280D\u2800\u283C\u2809\u2820\u2803', { timeout: 20000 })
  })

  test('sign translates a word that mixes letters and a number, with no engine error', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')
    await page
      .getByRole('radio', { name: 'Exactly as typed (UEB capital signs)' })
      .check()

    await page.locator('#brailleTextInput').fill('Tee3D')
    // Capital T, e, e, number sign, 3, capital D
    await expect(
      page.locator('#braillePreview .braille-preview-braille').first()
    ).toHaveText('\u2820\u281E\u2811\u2811\u283C\u2809\u2820\u2819', {
      timeout: 20000,
    })
    await expect(page.locator('#brailleErrors')).toBeEmpty()
  })

  test('sign leaves out a character its table does not define, and says so', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')
    await page
      .getByRole('radio', { name: 'Exactly as typed (UEB capital signs)' })
      .check()

    await page.locator('#brailleTextInput').fill('ROOM \u2603 101')
    // Capital word ROOM, one blank cell, number 101: the snowman is left
    // out, with no escape cells and none with dot 7
    await expect(
      page.locator('#braillePreview .braille-preview-braille').first()
    ).toHaveText(
      '\u2820\u2820\u2817\u2815\u2815\u280D\u2800\u283C\u2801\u281A\u2801',
      { timeout: 20000 }
    )
    await expect(page.locator('#brailleWarnings')).toContainText(
      'Some characters could not be translated to braille (in: "\u2603"). They are left out of the braille.'
    )
  })

  test('sign translates a run of capital words as one passage', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')
    await page
      .getByRole('radio', { name: 'Exactly as typed (UEB capital signs)' })
      .check()

    await page.locator('#brailleTextInput').fill('ROOM ROOM ROOM ROOM')
    // One capital passage indicator, the four words, one terminator
    const passage =
      '\u2820\u2820\u2820\u2817\u2815\u2815\u280D\u2800\u2817\u2815\u2815\u280D\u2800' +
      '\u2817\u2815\u2815\u280D\u2800\u2817\u2815\u2815\u280D\u2820\u2804'
    const rows = page.locator('#braillePreview .braille-preview-braille')
    await expect
      .poll(async () => (await rows.allTextContents()).join('\u2800'), {
        timeout: 20000,
      })
      .toBe(passage)
    const lineParams = page.locator(
      '.param-control[data-param-name^="Line_"] input'
    )
    await expect
      .poll(
        async () =>
          (await lineParams.evaluateAll((inputs) => inputs.map((i) => i.value)))
            .filter((value) => value !== '')
            .join('\u2800'),
        { timeout: 10000 }
      )
      .toBe(passage)
  })

  test('sign warns about an emoji typed on its own', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')
    await page.locator('#brailleTextInput').fill('\u{1F600}')
    await expect(page.locator('#brailleWarnings')).toContainText(
      'They are left out of the braille.',
      { timeout: 20000 }
    )
  })

  test('braille editor reads one contracted cell back as its whole word', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')
    await page.locator('#brailleFieldEditor summary').click()
    await page.locator('#brailleFieldInput').fill('\u2805')
    await page.locator('#brailleFieldToText').click()
    await expect(page.locator('#brailleTextInput')).toHaveValue('knowledge', {
      timeout: 20000,
    })
  })

  test('"Translate to text" moves the raised letters to the new text', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')
    await page.locator('#brailleTextInput').fill('See3D')
    const text1 = page.locator(
      '.param-control[data-param-name="sign_text_1"] input'
    )
    await expect(text1).toHaveValue('See3D', { timeout: 20000 })

    await page.locator('#brailleFieldEditor summary').click()
    // One cell, read back in Grade 2 as the word "go"
    await page.locator('#brailleFieldInput').fill('\u281B')
    const line1 = page.locator('.param-control[data-param-name="Line_1"] input')
    // Let the editor's own layout finish first, so nothing pending can
    // carry the new text to the raised letters
    await expect(line1).toHaveValue('\u281B', { timeout: 10000 })
    await page.locator('#brailleFieldToText').click()
    await expect(page.locator('#brailleTextInput')).toHaveValue('go', {
      timeout: 20000,
    })
    await expect(text1).toHaveValue('go', { timeout: 10000 })
    await expect(line1).toHaveValue('\u281B')
  })

  test('sign gives a phone number three number signs with hyphens and one with periods', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')
    const first = page.locator('#braillePreview .braille-preview-braille').first()
    // A hyphen ends a number, so each group needs its own number sign
    await page.locator('#brailleTextInput').fill('206-555-0147')
    await expect(first).toHaveText(
      '\u283C\u2803\u281A\u280B\u2824\u283C\u2811\u2811\u2811\u2824\u283C\u281A\u2801\u2819\u281B',
      { timeout: 20000 }
    )
    // A period inside a number keeps it going: one number sign
    await page.locator('#brailleTextInput').fill('206.555.0147')
    await expect(first).toHaveText(
      '\u283C\u2803\u281A\u280B\u2832\u2811\u2811\u2811\u2832\u281A\u2801\u2819\u281B',
      { timeout: 20000 }
    )
    await expect(page.locator('#brailleErrors')).toBeEmpty()
  })

  test('the table list offers Unified English Braille only', async ({ page }) => {
    await openBrailleExample(page, 'braille-sign')
    const options = page.locator('#brailleTableSelect option')
    await expect(options).toHaveCount(2, { timeout: 20000 })
    expect(await options.evaluateAll((os) => os.map((o) => o.value))).toEqual([
      'en-ueb-g1.ctb',
      'en-ueb-g2.ctb',
    ])
    expect(
      await options.evaluateAll((os) => os.map((o) => o.textContent))
    ).toEqual([
      'English (UEB) Grade 1, uncontracted',
      'English (UEB) Grade 2, contracted',
    ])
  })

  test('sign panel has no axe violations', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await openBrailleExample(page, 'braille-sign')
    await page.locator('#brailleTextInput').fill('Room 101')
    await expect(
      page.locator('#braillePreview .braille-preview-source').first()
    ).toContainText('Room 101', { timeout: 20000 })
    await expectPanelAxeClean(page)
  })
})
