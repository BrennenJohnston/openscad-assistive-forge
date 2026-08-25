/**
 * E2E tests for the drawing editor's own door (IR-4).
 *
 * The acceptance story: a photographed tactile drawing of a bird, traced with
 * interior detail no tactile printer can show, cleaned in Forge's SVG
 * Preparation Editor, and returned as a file. The editor already existed; the
 * way IN without an OpenSCAD project and the way OUT as a file did not.
 *
 * The walk below is done with the KEYBOARD ONLY - Tab, Enter, Arrow - because
 * that is the product thesis, not a nice-to-have.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures', 'svg-edit')
const BIRD_PNG = path.join(FIXTURES, 'bird-drawing.png')
const BIRD_SVG = path.join(FIXTURES, 'bird-drawing.svg')

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

async function openApp(page) {
  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', { timeout: 90000 })
}

/** What has focus right now, as something an assertion can read. */
const focused = (page) =>
  page.evaluate(() => {
    const el = document.activeElement
    if (!el) return null
    const row = el.closest?.('.svg-prep-object')
    return {
      id: el.id || null,
      className: typeof el.className === 'string' ? el.className : '',
      tag: el.tagName,
      type: el.type || null,
      value: el.value ?? null,
      row: row ? row.dataset.index : null,
      text: (el.textContent || '').trim().slice(0, 40),
    }
  })

/**
 * Arm a watcher on the hidden picker, so a test can prove that a door really
 * opened it.
 *
 * Playwright's `filechooser` event is an INTERCEPTION, and it races: measured
 * over eight identical runs, the app's click chain reached
 * `#editDrawingSpotlightBtn` and then `#svgEditFileInput` every single time,
 * while `waitForEvent('filechooser')` observed only five of them. So the door
 * is proven by watching the input get clicked - which is what the door
 * actually does - and the file is then handed over with setInputFiles, the way
 * a person hands one over from the dialog.
 */
async function armPickerWatch(page) {
  await page.evaluate(() => {
    window.__pickerOpened = false
    document.getElementById('svgEditFileInput').addEventListener(
      'click',
      () => {
        window.__pickerOpened = true
      },
      { once: true }
    )
  })
}

async function expectPickerOpened(page) {
  await expect
    .poll(async () => page.evaluate(() => window.__pickerOpened === true), {
      timeout: 10000,
    })
    .toBe(true)
}

/**
 * Press Tab until `match` says we have arrived. Bounded, and it FAILS rather
 * than gives up quietly: "could not reach it by keyboard" is the finding.
 */
async function tabUntil(page, match, { max = 80, label = 'target' } = {}) {
  for (let i = 1; i <= max; i++) {
    await page.keyboard.press('Tab')
    const state = await focused(page)
    if (match(state)) return { presses: i, state }
  }
  throw new Error(`${label} was not reachable within ${max} Tab presses`)
}

/** Open the editor on a fixture, through the welcome disclosure, by keyboard. */
async function openEditorByKeyboard(page, fixture) {
  await page.evaluate(() => document.body.focus())

  const summary = await tabUntil(
    page,
    (s) => s?.className?.includes('spotlights-summary'),
    { label: 'the Explore disclosure' }
  )
  await page.keyboard.press('Enter')
  await expect(page.locator('#accessibilitySpotlights')).toHaveJSProperty(
    'open',
    true
  )

  const door = await tabUntil(
    page,
    (s) => s?.id === 'editDrawingSpotlightBtn',
    { max: 5, label: 'the drawing-editor door' }
  )

  await armPickerWatch(page)
  await page.keyboard.press('Enter')
  await expectPickerOpened(page)
  await page.locator('#svgEditFileInput').setInputFiles(fixture)

  await page
    .locator('.svg-prep-object')
    .first()
    .waitFor({ state: 'visible', timeout: 60000 })

  return { summaryPresses: summary.presses, doorPresses: door.presses }
}

test.describe('The drawing editor door', () => {
  test('the four-card welcome screen gains nothing: the door lives inside the collapsed disclosure', async ({
    page,
  }) => {
    await openApp(page)

    // Collapsed by default is the whole reason this placement is allowed.
    await expect(page.locator('#accessibilitySpotlights')).toHaveJSProperty(
      'open',
      false
    )
    await expect(page.locator('#editDrawingSpotlightBtn')).not.toBeVisible()

    // The four documentation links keep their own contract: an href each. The
    // action is a real button and deliberately not one of them.
    await page.locator('#accessibilitySpotlights > summary').click()
    await expect(page.locator('.spotlight-link')).toHaveCount(4)
    const door = page.locator('#editDrawingSpotlightBtn')
    await expect(door).toBeVisible()
    const box = await door.boundingBox()
    expect(box.height).toBeGreaterThanOrEqual(44)
    await expect(page.locator('#accessibilitySpotlights')).toHaveJSProperty(
      'open',
      true
    )

    // And it never opens itself over a first-run surface (D-92's lesson):
    // reload, wait, and it is still shut.
    await page.reload()
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      timeout: 90000,
    })
    await page.waitForTimeout(2000)
    await expect(page.locator('#accessibilitySpotlights')).toHaveJSProperty(
      'open',
      false
    )
  })

  test('the bird walk: photo in, interiors excluded, file out, by keyboard alone', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180000)
    await openApp(page)

    const reach = await openEditorByKeyboard(page, BIRD_PNG)
    console.log('[svg-edit] Tab presses to the disclosure:', reach.summaryPresses)
    console.log('[svg-edit] Tab presses from there to the door:', reach.doorPresses)
    // The door is the first stop inside the disclosure, not buried in it.
    expect(reach.doorPresses).toBeLessThanOrEqual(2)

    // The editor took focus: its own trap put it on the close button. The trap
    // hands focus over on a short delay, so this polls rather than racing it.
    await expect
      .poll(async () => (await focused(page))?.className ?? '', {
        timeout: 10000,
      })
      .toContain('svg-prep-close-btn')

    const rows = page.locator('.svg-prep-object')
    const rowCount = await rows.count()
    console.log('[svg-edit] traced shapes:', rowCount)
    expect(rowCount).toBeGreaterThan(1)

    // Every shape reads as a named row with its role spoken.
    await expect(rows.first()).toHaveAttribute(
      'aria-label',
      /Path 1, role: foreground/
    )

    // With no model behind the editor, Apply and Keep original would have
    // nothing to act on, so saving is the whole task.
    await expect(page.locator('button[data-action="apply"]')).toBeHidden()
    await expect(page.locator('button[data-action="keep"]')).toBeHidden()
    await expect(page.locator('button[data-action="save"]')).toBeVisible()

    // Walk to the first shape's radio group, then Ignore every shape after it.
    await tabUntil(page, (s) => s?.type === 'radio' && s?.row === '0', {
      label: 'the first shape',
    })
    for (let i = 1; i < rowCount; i++) {
      await tabUntil(
        page,
        (s) => s?.type === 'radio' && s?.row === String(i),
        { max: 6, label: `shape ${i + 1}` }
      )
      // A radio group moves AND selects on arrow: foreground -> hole -> ignore.
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowRight')
      await expect(
        page.locator(`.svg-prep-object[data-index="${i}"]`)
      ).toHaveAttribute('aria-label', /role: ignore/)
    }

    await tabUntil(
      page,
      (s) => s?.text === 'Save edited SVG',
      { max: 12, label: 'the Save button' }
    )

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.keyboard.press('Enter'),
    ])
    expect(download.suggestedFilename()).toBe('bird-drawing-edited.svg')

    const target = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'forge-svg-')),
      'edited.svg'
    )
    await download.saveAs(target)
    const saved = fs.readFileSync(target, 'utf8')
    const pathCount = (saved.match(/<path/g) || []).length
    console.log('[svg-edit] saved', saved.length, 'bytes,', pathCount, 'paths')

    // The kept subset is one shape, so the file holds one shape.
    expect(pathCount).toBe(1)
    expect(saved.startsWith('<svg')).toBe(true)
    expect(saved).toContain('viewBox')

    testInfo.attach?.('bird-edited.svg', {
      body: saved,
      contentType: 'image/svg+xml',
    })
  })

  test('an SVG goes in directly, with no tracing step', async ({ page }) => {
    test.setTimeout(120000)
    await openApp(page)
    await openEditorByKeyboard(page, BIRD_SVG)

    await expect(page.locator('.svg-prep-object').first()).toBeVisible()
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.locator('button[data-action="save"]').click(),
    ])
    expect(download.suggestedFilename()).toBe('bird-drawing-edited.svg')
  })

  test('the Actions drawer opens the same door', async ({ page }) => {
    test.setTimeout(120000)
    await page.goto('/?example=simple-box')
    await page
      .locator('.param-control')
      .first()
      .waitFor({ state: 'attached', timeout: 60000 })
    const notNow = page.locator('#saveProjectNotNow')
    try {
      await notNow.waitFor({ state: 'visible', timeout: 3000 })
      await notNow.click()
    } catch {
      // no save prompt for this example
    }

    await page.locator('#actionsDrawerToggle').click()
    const action = page.locator('#editDrawingActionBtn')
    await expect(action).toBeVisible()

    await armPickerWatch(page)
    await action.click()
    await expectPickerOpened(page)
    await page.locator('#svgEditFileInput').setInputFiles(BIRD_SVG)

    await expect(page.locator('.svg-prep-object').first()).toBeVisible({
      timeout: 60000,
    })
  })

  test('a file the door cannot read is refused in plain words', async ({
    page,
  }) => {
    await openApp(page)
    await page.locator('#accessibilitySpotlights > summary').click()

    await armPickerWatch(page)
    await page.locator('#editDrawingSpotlightBtn').click()
    await expectPickerOpened(page)
    await page.locator('#svgEditFileInput').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('this is not a drawing'),
    })

    // Refused with a sentence naming the file and what to do instead, not a
    // silent no-op and not a stack trace.
    const toast = page.locator('.toast, [role="alert"]', {
      hasText: 'not a drawing Forge can edit',
    })
    await expect(toast.first()).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.svg-prep-object')).toHaveCount(0)
  })

  test('the open editor passes an accessibility scan', async ({ page }) => {
    test.setTimeout(180000)
    await openApp(page)
    await openEditorByKeyboard(page, BIRD_SVG)

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()

    const detail = results.violations
      .flatMap((v) =>
        v.nodes.map(
          (n) =>
            `${v.id} @ ${n.target.join(' ')} :: ${n.failureSummary.replace(/\s+/g, ' ')}`
        )
      )
      .join('\n')
    expect(
      results.violations.map((v) => v.id),
      `unexpected axe violations in the drawing editor:\n${detail}`
    ).toEqual([])
  })
})
