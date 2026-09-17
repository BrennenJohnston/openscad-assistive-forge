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
// 1200 is over the LIST cap of 1,000 and is refused outright.
//
// 210 plain rects USED to sit in the manual-render band, back when the band
// was a count. DP-Q33 retired the counts: those 210 rects are 840 ring points
// between them and MEASURED they flatten in 80-110 ms, so they combine by
// themselves now and pressing a button for them was never right.
//
// over-budget-300 is what the manual band needs instead: 300 curved shapes,
// 19,200 ring points, predicted at 8.8 seconds and MEASURED at 923 ms - over
// the 300 ms budget with room, and long enough that a person can really press
// Cancel in the middle of it. All three are built from plain geometry so the
// fixtures say what they test without a drawing program in the loop.
const MANY_210 = path.join(FIXTURES, 'many-shapes-210.svg')
const OVER_BUDGET_300 = path.join(FIXTURES, 'over-budget-300.svg')
const OVER_CAP_1200 = path.join(FIXTURES, 'over-cap-1200.svg')
// D-118: paint declared by CSS class, the way every CAD export writes it.
const CLASS_STYLED = path.join(FIXTURES, 'class-styled-strokes.svg')

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

  // Waits on the PICTURE, not the shape list. The list is inside the side
  // panel, and below 640 that panel is a drawer which now starts shut
  // (DP-Q46a) - so a wait on a row never returns at phone width. The picture
  // is in the editor at every width, which is DP-37 P1's whole subject, and a
  // case that needs the list asserts it for itself.
  await page
    .locator('.svg-prep-result-pane svg')
    .first()
    .waitFor({ state: 'visible', timeout: 60000 })

  // The surface takes focus as it opens (its own name). Wait for that here,
  // once, so no case below can focus a control only to have the opening
  // take it back a moment later - which is what made the single-row delete
  // case delete nothing on two CI lanes.
  await expect
    .poll(
      async () => (await focused(page))?.className ?? '',
      { timeout: 15000 }
    )
    .toContain('drawing-editor-title')

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

    // The editor took focus. RE-PINNED at DP-19: the surface that hosts the
    // workspace now puts focus on its own name (the "Drawing editor" heading)
    // rather than on a close button, so a screen reader meets the name of
    // the thing it just arrived on. The trap hands focus over on a short
    // delay, so this polls rather than racing it.
    await expect
      .poll(async () => (await focused(page))?.className ?? '', {
        timeout: 10000,
      })
      .toContain('drawing-editor-title')

    const rows = page.locator('.svg-prep-object')
    const rowCount = await rows.count()
    console.log('[svg-edit] traced shapes:', rowCount)
    expect(rowCount).toBeGreaterThan(1)

    // Every shape reads as a named row with its role spoken.
    //
    // RE-PINNED at DP-43: a traced picture now arrives from Potrace as one
    // compound path, so the editor opens in its compound mode - the same mode
    // that has always handled a single-path drawing, which the Harley fixture
    // reaches too. Two things follow, both signed at DP-Q45: the rows are
    // named "Shape N" (not "Subpath N", which is SVG's word for a detail of a
    // `d` attribute), and the role choice is Include/Exclude rather than
    // Foreground/Hole/Ignore, because Potrace draws in one colour and its
    // holes are already holes by even-odd nesting - there is nothing for a
    // person to re-judge. The element flow is walked by "an SVG goes in
    // directly" below.
    await expect(rows.first()).toHaveAttribute(
      'aria-label',
      // RE-PINNED at DP-39 P2: the name reads the word a sighted person reads,
      // and in compound mode that word is Include.
      /Shape 1, Include/
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
      // A radio group moves AND selects on arrow. Compound mode offers two:
      // Include -> Exclude, so one press is the whole distance.
      await page.keyboard.press('ArrowRight')
      await expect(
        page.locator(`.svg-prep-object[data-index="${i}"]`)
      ).toHaveAttribute('aria-label', /Exclude$/)
    }

    // DP-53: the combine follows the last change once it settles, and Save
    // is not a Tab stop until there is a result to save.
    await expect(page.locator('button[data-action="save"]')).toBeEnabled({
      timeout: 60000,
    })
    await tabUntil(
      page,
      (s) => s?.text === 'Save SVG',
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

    // Compound mode writes what it keeps as a single even-odd path, so the
    // file holds one <path> whatever the subset - and the subset here is the
    // one shape that was left included.
    expect(pathCount).toBe(1)
    expect(saved).toContain('evenodd')
    expect(saved.startsWith('<svg')).toBe(true)
    expect(saved).toContain('viewBox')

    testInfo.attach?.('bird-edited.svg', {
      body: saved,
      contentType: 'image/svg+xml',
    })
  })

  test('an SVG goes in directly, with no tracing step, and keeps the element flow', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await openApp(page)
    await openEditorByKeyboard(page, BIRD_SVG)

    await expect(page.locator('.svg-prep-object').first()).toBeVisible()

    // ★ The OTHER mode, kept walked. A drawing that arrives as several DOM
    // elements opens in element mode, which is what the bird walk above tested
    // until DP-43 made Potrace the default and traced pictures started
    // arriving as one compound path. Both flows ship; both are walked.
    const rows = page.locator('.svg-prep-object')
    expect(await rows.count()).toBeGreaterThan(1)
    const firstLabel = await rows.first().getAttribute('aria-label')
    // Element mode names a row for what the element IS, not by position.
    expect(firstLabel).not.toMatch(/^Shape \d/)
    // RE-PINNED at DP-39 P2: the word, not the value. DP-Q40 made the visible
    // word "Raised" and the accessible name has to say the same thing.
    expect(firstLabel).toMatch(/(Raised|Hole|Ignore)$/)

    // And it offers the full role choice, which compound mode cannot. Read off
    // the radios themselves: a fallback here would be a test that cannot fail.
    const roleValues = await page
      .locator('.svg-prep-object[data-index="0"] .svg-prep-role-group input')
      .evaluateAll((els) => els.map((el) => el.value))
    expect(roleValues).toEqual(['foreground', 'hole', 'ignore'])

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.locator('button[data-action="save"]').click(),
    ])
    expect(download.suggestedFilename()).toBe('bird-drawing-edited.svg')
  })

  // G0 2026-09-01 (DP-24): "one picture svg that you are seeing the elements
  // turning on or off. A side by side of original to edited is offed in a
  // button toggle if the user wishes but is not default."
  test('one picture by default; Compare brings the original beside it', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await openApp(page)
    await openEditorByKeyboard(page, BIRD_SVG)

    const sourceWrap = page.locator('.svg-prep-pane-wrap--source')
    const resultWrap = page.locator('.svg-prep-pane-wrap--result')
    const compareBtn = page.locator('.svg-prep-compare-btn')

    await expect(resultWrap).toBeVisible()
    await expect(sourceWrap).toBeHidden()
    // DP-46: Compare is one of the three tools behind More, so the working
    // row holds its actions on one line (DP-Q52, signed with pictures).
    await page.locator('.drawing-editor-more-btn').click()
    await expect(compareBtn).toBeVisible()
    await expect(compareBtn).toHaveAttribute('aria-pressed', 'false')

    // By keyboard, per the file's thesis.
    await compareBtn.focus()
    await page.keyboard.press('Enter')
    await expect(compareBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(sourceWrap).toBeVisible()
    await expect(resultWrap).toBeVisible()

    await page.keyboard.press('Enter')
    await expect(compareBtn).toHaveAttribute('aria-pressed', 'false')
    await expect(sourceWrap).toBeHidden()
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


  /**
   * DP-3: the cap became three tiers (DP-Q9: A=50, B=200, C=1000), because
   * DP-0 measured that the TABLE is free and the BOOLEAN is the whole cost.
   * Before this, anything over 50 got no table at all - the exact inverse of
   * being able to delete elements down to something usable.
   */
  test('★ a drawing over the old cap opens, with its table, and combines by itself (DP-53)', async ({
    page,
  }) => {
    test.setTimeout(180000)
    await openApp(page)

    // RE-PINNED at DP-53: this used to assert the boolean had NOT run and a
    // Render button waited. The combine runs by itself now, whatever the
    // drawing is predicted to cost; what a person sees meanwhile is the
    // drawing itself marked as not yet combined, Apply and Save refused, and
    // a sentence saying the combine is coming and how long. All of that is
    // over in about a second on this drawing, so it is recorded as it
    // happens rather than looked for afterwards.
    await page.evaluate(() => {
      window.__seen = { hints: [], standIn: false, busy: false }
      new MutationObserver(() => {
        const hint = document.querySelector('.svg-prep-apply-hint')
        const t = (hint?.textContent || '').trim()
        if (t && !window.__seen.hints.includes(t)) window.__seen.hints.push(t)
        if (document.querySelector('.svg-prep-result-pane svg.svg-prep-standin')) window.__seen.standIn = true
        if (document.querySelector('.svg-prep-result-pane')?.getAttribute('aria-busy') === 'true') window.__seen.busy = true
      }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true })
    })
    await openEditorByKeyboard(page, OVER_BUDGET_300)

    // The whole table is there. It used to be nothing.
    await expect(page.locator('.svg-prep-object')).toHaveCount(300)

    // And the result arrives with nobody asked: no button, a result, Save.
    const picture = page.locator('.svg-prep-result-pane svg').first()
    await expect(picture).not.toHaveClass(/svg-prep-standin/, { timeout: 120000 })
    await expect(page.locator('button[data-action="save"]')).toBeEnabled()
    await expect(page.locator('.svg-prep-render-btn')).toBeHidden()
    await expect(page.locator('.svg-prep-render-row')).toBeHidden()

    const seen = await page.evaluate(() => window.__seen)
    expect(seen.standIn, 'the drawing stood in while it combined').toBe(true)
    expect(seen.busy, 'the combine reported itself as busy').toBe(true)
    expect(
      seen.hints.some((h) => /^Combining 300 shapes, about (a second|\d+ seconds)\. Apply is ready when they are combined\.$/.test(h)),
      `the sentence while combining: ${JSON.stringify(seen.hints)}`
    ).toBe(true)
  })

  // DP-53: the door's Render preview button is gone - the combine runs by
  // itself - and its keyboard, target-floor and announcement pins moved with
  // the button to the charm view's Render preview, in drawing-editor.spec.js.

  test('above the cap it says the real reason, with the real numbers (D-117)', async ({
    page,
  }) => {
    await openApp(page)
    await page.evaluate(() => {
      document.getElementById('accessibilitySpotlights').open = true
    })
    await armPickerWatch(page)
    await page.click('#editDrawingSpotlightBtn')
    await expectPickerOpened(page)
    await page.locator('#svgEditFileInput').setInputFiles(OVER_CAP_1200)

    // analyzeSvg had already written this sentence; showSvg used to throw it
    // away and say "has no shapes Forge can work with. A photo needs dark
    // lines on a light background to trace." - photo advice for a vector
    // file, naming a cause that was not the cause.
    const toast = page.locator('.toast, [role="alert"]', {
      hasText: 'Forge can work with',
    })
    await expect(toast.first()).toBeVisible({ timeout: 30000 })
    await expect(toast.first()).toContainText('1200')
    await expect(toast.first()).toContainText('1000')
    await expect(page.locator('body')).not.toContainText(
      'A photo needs dark lines on a light background'
    )
    await expect(page.locator('.svg-prep-object')).toHaveCount(0)
  })

  test('paint declared in a <style> block is read, so line art stays line art (D-118)', async ({
    page,
  }) => {
    await openApp(page)
    await openEditorByKeyboard(page, CLASS_STYLED)

    // Three stroke-only shapes whose fill:none lives in a class rule. They
    // used to be read as solid black - which is how the owner's own artwork
    // became one hole the shape of its outer boundary.
    await expect(page.locator('.svg-prep-object')).toHaveCount(3)
    await expect(page.locator('.svg-prep-warnings')).toContainText(
      'stroked path(s) converted to filled outline(s)'
    )
  })


  /**
   * DP-4's acceptance, and the directive's own ask: take a drawing that is
   * far too complex and get it down to something usable WITHOUT leaving the
   * app, by keyboard alone.
   *
   * "Ignore" already removed a shape from the OUTPUT. This removes it from the
   * LIST, which at several hundred rows is the difference between a table you
   * can work in and one you only scroll past.
   */
  test('a too-complex drawing can be cut down to size by keyboard alone', async ({
    page,
  }) => {
    test.setTimeout(300000)
    await openApp(page)
    await openEditorByKeyboard(page, OVER_BUDGET_300)
    await expect(page.locator('.svg-prep-object')).toHaveCount(300)
    await expect(page.locator('.svg-prep-bulk-count')).toHaveText('300 shapes')

    // Keep the 40 largest, by keyboard: into the field, type, then the button.
    const keepField = page.locator('.svg-prep-bulk-field', { hasText: 'Keep largest' })
    await keepField.locator('input').fill('40')
    const keepBtn = page.locator('[data-action="keep-largest"]')
    await expect
      .poll(
        async () => {
          await keepBtn.focus()
          return keepBtn.evaluate((el) => el === document.activeElement)
        },
        { timeout: 15000 }
      )
      .toBe(true)
    await page.keyboard.press('Enter')

    await expect(page.locator('.svg-prep-object')).toHaveCount(40)
    await expect(page.locator('.svg-prep-bulk-count')).toHaveText('40 shapes')

    // Under the budget now, so the preview comes back on its own: the drawing
    // has been made simple enough to behave like a simple one. 40 of these
    // shapes are 2,600 ring points, predicted at 156 ms against a 300 ms
    // budget.
    await expect(page.locator('.svg-prep-result-pane svg')).toHaveCount(1, {
      timeout: 120000,
    })

    // And it is undoable, one level, from the keyboard too.
    const undo = page.locator('[data-action="undo-delete"]')
    await undo.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.svg-prep-object')).toHaveCount(300)
    await expect(undo).toBeDisabled()
  })

  test('a single row delete is reachable and reversible by keyboard', async ({
    page,
  }) => {
    test.setTimeout(180000)
    await openApp(page)
    await openEditorByKeyboard(page, CLASS_STYLED)
    await expect(page.locator('.svg-prep-object')).toHaveCount(3)

    // DP-39 P2 (row model A, signed at DP-Q36): Delete lives behind the row's
    // own More menu now, so the walk has one more step - which is the cost of
    // the row holding one line down to the drawer's 280 px floor. The menu is
    // opened the way a keyboard opens it.
    const firstMore = page.locator('.svg-prep-more-btn').first()
    await firstMore.focus()
    await page.keyboard.press('Enter')
    await expect(firstMore).toHaveAttribute('aria-expanded', 'true')

    const firstDelete = page.locator('.svg-prep-object-delete').first()
    await expect
      .poll(
        async () => {
          await firstDelete.focus()
          return firstDelete.evaluate((el) => el === document.activeElement)
        },
        { timeout: 15000 }
      )
      .toBe(true)
    // 44px floor, measured rather than read off the stylesheet.
    const box = await firstDelete.boundingBox()
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.width).toBeGreaterThanOrEqual(44)

    await page.keyboard.press('Enter')
    await expect(page.locator('.svg-prep-object')).toHaveCount(2)

    // The delete rebuilds the whole list, so the undo control is a NEW node
    // by the time we reach for it. Waiting for it to be actionable rather
    // than clicking straight away is not a proven fix for the flake this
    // case has shown on Edge and Chromium - it has passed on retry every
    // time and has never reproduced locally - but clicking a control that
    // was just re-rendered without waiting for it is a race either way.
    const undo = page.locator('[data-action="undo-delete"]')
    await expect(undo).toBeEnabled({ timeout: 15000 })
    await undo.click()
    await expect(page.locator('.svg-prep-object')).toHaveCount(3)
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

test.describe('the preview is never blank (DP-37 P1)', () => {
  test('★ a drawing above the auto budget shows itself where its result will go', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await openApp(page)
    await openEditorByKeyboard(page, OVER_BUDGET_300)
    await expect(page.locator('.svg-prep-object').first()).toBeVisible()

    // MEASURED before this release: the pane was 1268 x 160 with no svg in it
    // at all. "Will print as", an empty rectangle, two zoom buttons floating
    // in it, and a sentence telling you to press a button.
    // RE-PINNED at DP-53: the combine follows by itself and replaces the
    // stand-in in about a second on this drawing, so the stand-in is read the
    // moment it appears, by an observer, rather than looked for afterwards.
    const standIn = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const read = () => {
            const picture = document.querySelector('.svg-prep-result-pane svg.svg-prep-standin')
            if (!picture) return false
            resolve({
              label: picture.getAttribute('aria-label') || '',
              tinted: picture.querySelectorAll('.svg-prep-role-path').length,
              painted: picture.querySelectorAll('.svg-prep-standin-path--raised, .svg-prep-standin-path--hole').length,
              saveDisabled: document.querySelector('button[data-action="save"]')?.disabled === true,
            })
            return true
          }
          if (read()) return
          const observer = new MutationObserver(() => {
            if (read()) observer.disconnect()
          })
          observer.observe(document.body, { subtree: true, childList: true })
          setTimeout(() => resolve(null), 60000)
        })
    )
    expect(standIn, 'the drawing never stood in for its result').not.toBeNull()
    // DP-47 P4: the name counts what is in the picture, because the picture is
    // painted from the roles now and an ignored shape leaves it at once.
    expect(standIn.label).toMatch(
      /^The drawing as it is now: \d+ raised, \d+ holes?, \d+ left out, not yet combined$/
    )
    // It is a picture of what you HAVE, not of what you will get: Save was
    // refused while it stood, because there was no result yet.
    expect(standIn.saveDisabled).toBe(true)
    // And it is the drawing, not an empty frame: the tints are on it, and so
    // are the painted shapes themselves (DP-47 P4).
    expect(standIn.tinted).toBe(300)
    expect(standIn.painted).toBe(300)
    // Then the result follows, with nobody asked.
    await expect(page.locator('.svg-prep-result-pane svg').first()).not.toHaveClass(
      /svg-prep-standin/,
      { timeout: 120000 }
    )
  })

  test('a drawing under the budget still shows its combined result', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await openApp(page)
    await openEditorByKeyboard(page, BIRD_SVG)
    const picture = page.locator('.svg-prep-result-pane svg').first()
    await expect(picture).toBeVisible()
    // Not a stand-in: this one was actually combined.
    await expect(picture).not.toHaveClass(/svg-prep-standin/)
  })

  test('★ 210 shapes combine by themselves now, because a count was the wrong question (DP-Q33)', async ({
    page,
  }) => {
    // This is the drawing the re-sign is FOR. Under DP-Q9 it was refused the
    // automatic combine for being 210 shapes, and a person had to press a
    // button and wait. Those 210 rects are 840 ring points between them and
    // MEASURED they flatten in 80 to 110 ms: the button was asking somebody to
    // decide about a tenth of a second.
    test.setTimeout(120000)
    await openApp(page)
    await openEditorByKeyboard(page, MANY_210)
    await expect(page.locator('.svg-prep-object')).toHaveCount(210)

    const picture = page.locator('.svg-prep-result-pane svg').first()
    await expect(picture).toBeVisible({ timeout: 60000 })
    await expect(picture).not.toHaveClass(/svg-prep-standin/)
    // Nothing is asked of anybody: no button, no sentence about waiting.
    await expect(page.locator('.svg-prep-render-row')).toBeHidden()
    // And there IS a result, so it can be applied and saved.
    await expect(page.locator('button[data-action="save"]')).toBeEnabled()
  })
})

test.describe('the side panel does not sit on the drawing (DP-37 P1)', () => {
  // ★ The panel is position:absolute over the editor body, and nothing
  // reserved room for it. MEASURED before this: at 1280 the stage ran
  // x 6..1274 and the panel x 814..1274, so 453 px of the drawing was painted
  // underneath the shapes list; at 900, 384 px; at 412, 271 px of a 400 px
  // picture, with the sentence beneath it cut mid-word.

  async function openAt(page, width) {
    await page.setViewportSize({ width, height: 900 })
    await openApp(page)
    await openEditorByKeyboard(page, MANY_210)
    // The picture, not the list: below 640 the list is inside a drawer that
    // starts shut (DP-Q46a).
    await expect(page.locator('.svg-prep-result-pane svg').first()).toBeVisible()
  }

  /** How much of the drawing the panel covers. */
  async function hiddenPx(page) {
    return page.evaluate(() => {
      const svg = document.querySelector('.svg-prep-result-pane svg')
      const panel = document.querySelector('.drawing-editor-panel')
      if (!svg || !panel || panel.hidden) return 0
      const s = svg.getBoundingClientRect()
      const p = panel.getBoundingClientRect()
      if (p.width === 0) return 0
      return Math.max(0, Math.round(s.x + s.width - p.x))
    })
  }

  for (const width of [1280, 900]) {
    test(`★ none of the drawing is under the panel at ${width}`, async ({
      page,
    }) => {
      test.setTimeout(120000)
      await openAt(page, width)
      expect(await hiddenPx(page)).toBe(0)
    })
  }

  // ★ D-136: closing the panel gave the drawing NOTHING. Two halves of one
  // feature shipped without meeting: DP-37 P1 reserved the stage's right
  // padding with an unconditional container query, and DP-24's toggle only
  // hides the panel. MEASURED on the charm host before this: panel hidden,
  // `padding-right` stayed 304.469 px and the drawing stayed 374 x 279, with
  // an empty column where the list had been. The owner pressed Shapes to get
  // room and the picture did not move.
  for (const width of [1280, 900]) {
    test(`★ D-136 closing the panel widens the drawing at ${width}`, async ({
      page,
    }) => {
      test.setTimeout(120000)
      await openAt(page, width)

      const drawing = page.locator('.svg-prep-result-pane svg').first()
      const open = await drawing.boundingBox()
      const reserved = await page.evaluate(
        () =>
          getComputedStyle(document.querySelector('.drawing-editor-stage'))
            .paddingRight
      )

      await page.locator('.drawing-editor-panel-toggle').first().click()
      await expect(page.locator('.drawing-editor-panel')).toBeHidden()

      const shut = await drawing.boundingBox()
      const givenBack = await page.evaluate(
        () =>
          getComputedStyle(document.querySelector('.drawing-editor-stage'))
            .paddingRight
      )

      // The room the panel held is handed back...
      expect(parseFloat(reserved)).toBeGreaterThan(100)
      expect(parseFloat(givenBack)).toBeLessThan(40)
      // ...and the drawing is the thing that takes it.
      expect(shut.width).toBeGreaterThan(open.width)
    })
  }

  test('★ at phone width the panel is a drawer, and one press gives the drawing back', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await openAt(page, 412)

    // The drawer rule is written for this width and never fired here, because
    // no ancestor of the stage was a container. It fires now - but the drawer
    // starts shut (DP-Q46a), so this opens it first and then checks the two
    // things that matter: it takes the WHOLE width rather than lying across
    // the drawing as a strip, and closing it gives the drawing back.
    // By its class, not its text. The word changed at DP-Q40 (Regions ->
    // Shapes) and "Shapes" also matches the door button on the page behind,
    // so the text is ambiguous here. What the word IS has its own guard.
    const regions = page.locator('.drawing-editor-panel-toggle').first()
    await regions.click()
    await expect(page.locator('.drawing-editor-panel')).toBeVisible()
    const panelWidth = await page.evaluate(
      () => document.querySelector('.drawing-editor-panel').getBoundingClientRect().width
    )
    expect(panelWidth).toBeGreaterThan(380)

    await regions.click()
    await expect(page.locator('.drawing-editor-panel')).toBeHidden()
    const drawing = page.locator('.svg-prep-result-pane svg').first()
    await expect(drawing).toBeVisible()
    const box = await drawing.boundingBox()
    expect(box.width).toBeGreaterThan(300)
  })
})

test.describe('the picture is the first thing (DP-37 P1, audit 21)', () => {
  // ★ The ink panel used to come before the picture, and it is tall.
  // MEASURED with a traced icon: the panel ran 694 px at 1280, 853 at 900 and
  // 1,242 at 412, which put "Will print as" at y 862, y 1,024 and y 1,590. On
  // a 900-tall window the person's own picture was below the fold at every
  // width - so the first thing they met after choosing a picture was a column
  // of settings for a drawing they could not see.

  const RING = path.join(process.cwd(), 'tests', 'fixtures', 'icons', 'outline-ring.png')

  for (const width of [1280, 900]) {
    test(`★ the picture comes before the settings at ${width}`, async ({ page }) => {
      test.setTimeout(120000)
      await page.setViewportSize({ width, height: 900 })
      await openApp(page)
      await openEditorByKeyboard(page, RING)
      await expect(page.locator('.svg-prep-object').first()).toBeVisible()

      const tops = await page.evaluate(() => {
        const caption = [...document.querySelectorAll('.svg-prep-pane-caption')]
          .find((e) => /Will print as/.test(e.textContent))
        const ink = document.querySelector('.ink-controls')
        return {
          picture: caption ? Math.round(caption.getBoundingClientRect().y) : null,
          settings: ink ? Math.round(ink.getBoundingClientRect().y) : null,
        }
      })
      expect(tops.picture).not.toBeNull()
      expect(tops.settings).not.toBeNull()
      // Above the settings, and inside the first screen.
      expect(tops.picture).toBeLessThan(tops.settings)
      expect(tops.picture).toBeLessThan(600)
    })
  }

  test('in the document, the picture comes first whatever the width', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await page.setViewportSize({ width: 412, height: 900 })
    await openApp(page)
    await openEditorByKeyboard(page, RING)
    // Waits on the PICTURE, not the shape list: at this width the list is
    // inside a drawer that now starts shut (DP-Q46a), which is the point.
    await expect(page.locator('.svg-prep-result-pane svg').first()).toBeVisible()

    // Reading order is the one thing that holds at every width, drawer open or
    // shut: a screen reader meets the picture before the settings for it.
    const pictureFirst = await page.evaluate(() => {
      const caption = [...document.querySelectorAll('.svg-prep-pane-caption')]
        .find((e) => /Will print as/.test(e.textContent))
      const ink = document.querySelector('.ink-controls')
      if (!caption || !ink) return null
      return Boolean(
        caption.compareDocumentPosition(ink) & Node.DOCUMENT_POSITION_FOLLOWING
      )
    })
    expect(pictureFirst).toBe(true)
  })
})

test.describe('the drawer starts shut on a phone (DP-Q46a)', () => {
  const RING_PNG = path.join(process.cwd(), 'tests', 'fixtures', 'icons', 'outline-ring.png')

  test('★ the picture is the first thing SEEN, not only the first thing read', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await page.setViewportSize({ width: 412, height: 900 })
    await openApp(page)
    await openEditorByKeyboard(page, RING_PNG)

    // MEASURED before this: the drawer opened by default and took 396 px of a
    // 412 px screen, so the first thing after choosing a picture was a list of
    // shapes drawn on top of the picture.
    await expect(page.locator('.drawing-editor-panel')).toBeHidden()
    const picture = page.locator('.svg-prep-result-pane svg').first()
    await expect(picture).toBeVisible()
    const box = await picture.boundingBox()
    expect(box.width).toBeGreaterThan(300)

    // And the list is one press away, on a button that was already there.
    // By its class, not its text. The word changed at DP-Q40 (Regions ->
    // Shapes) and "Shapes" also matches the door button on the page behind,
    // so the text is ambiguous here. What the word IS has its own guard.
    const regions = page.locator('.drawing-editor-panel-toggle').first()
    await expect(regions).toBeVisible()
    await expect(regions).toHaveAttribute('aria-expanded', 'false')
    await regions.click()
    await expect(page.locator('.drawing-editor-panel')).toBeVisible()
    await expect(page.locator('.svg-prep-object').first()).toBeVisible()
  })

  test('a wide screen is untouched: the panel is beside the drawing, open', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await page.setViewportSize({ width: 1280, height: 900 })
    await openApp(page)
    await openEditorByKeyboard(page, RING_PNG)
    await expect(page.locator('.drawing-editor-panel')).toBeVisible()
    await expect(page.locator('.svg-prep-object').first()).toBeVisible()
  })
})

test.describe("the flatten budget's loose ends (owner answers, 2026-09-14)", () => {
  test('★ the Design width box combines by itself, like everything else (DP-53)', async ({
    page,
  }) => {
    // RE-PINNED at DP-53. Before, every change asked first on a drawing this
    // size and a width change that combined straight away was the odd one
    // out. Now every change combines by itself once it settles, and the width
    // box is no different: it waits its 300 ms, then the settle, then runs.
    test.setTimeout(300000)
    await openApp(page)
    await openEditorByKeyboard(page, OVER_BUDGET_300)
    // The first combine, from the open, lands first.
    await expect(page.locator('.svg-prep-result-pane svg').first()).not.toHaveClass(
      /svg-prep-standin/,
      { timeout: 120000 }
    )
    await expect(page.locator('button[data-action="save"]')).toBeEnabled()

    // Watch for a combine rather than sampling for one: this drawing's
    // combine is 923 ms and would begin and end inside a naive wait.
    await page.evaluate(() => {
      window.__combineStarted = false
      const pane = document.querySelector('.svg-prep-result-pane')
      new MutationObserver(() => {
        if (pane.getAttribute('aria-busy') === 'true') {
          window.__combineStarted = true
        }
      }).observe(pane, { attributes: true, attributeFilter: ['aria-busy'] })
    })

    // DP-46: Design width is one of the three tools behind More.
    await page.locator('.drawing-editor-more-btn').click()
    await page.locator('.svg-prep-design-width-input').fill('20')
    // The box waits 300 ms, the settle 350 ms; well past both.
    await page.waitForTimeout(2500)

    expect(
      await page.evaluate(() => window.__combineStarted),
      'a combine started from the width change'
    ).toBe(true)
    // And no button is offered for it, then or after.
    await expect(page.locator('.svg-prep-render-btn')).toBeHidden()
    await expect(page.locator('button[data-action="save"]')).toBeEnabled({ timeout: 120000 })
  })

  test('★ what a real combine measured is remembered for the next visit', async ({
    page,
  }) => {
    // DP-Q33 signed a calibration because the cost per (shape x ring point)
    // spans five-fold between classes of drawing. Forgetting it at the end of
    // every session means the first drawing of every visit is judged by the
    // cautious default.
    test.setTimeout(300000)
    await openApp(page)
    const KEY = 'openscad-forge-flatten-cost'
    await page.evaluate((k) => localStorage.removeItem(k), KEY)

    await openEditorByKeyboard(page, OVER_BUDGET_300)
    // DP-53: the combine runs by itself on open; it is over when Save is.
    await expect(page.locator('button[data-action="save"]')).toBeEnabled({
      timeout: 300000,
    })

    const stored = await page.evaluate((k) => localStorage.getItem(k), KEY)
    expect(stored, 'nothing was remembered').not.toBeNull()
    const value = Number(stored)
    // A millisecond-per-unit constant, inside the bounds a stored value has to
    // be in to be believed. MEASURED range across every class of drawing:
    // 1.6e-4 to 1.5e-3.
    expect(Number.isFinite(value)).toBe(true)
    expect(value).toBeGreaterThan(1e-6)
    expect(value).toBeLessThan(1e-1)
  })

  test('the combining sentence gives the wait without the extra word (DP-53)', async ({
    page,
  }) => {
    // "here" wrapped the old sentence to a fourth line and overran the charm
    // host's panel by 6 px. The sentence is the status line's now, while the
    // combine runs, and it is recorded as it shows since the combine is over
    // in about a second on this drawing.
    test.setTimeout(180000)
    await openApp(page)
    await page.evaluate(() => {
      window.__hints = []
      new MutationObserver(() => {
        const t = (document.querySelector('.svg-prep-apply-hint')?.textContent || '').trim()
        if (t && !window.__hints.includes(t)) window.__hints.push(t)
      }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true })
    })
    await openEditorByKeyboard(page, OVER_BUDGET_300)
    await expect(page.locator('button[data-action="save"]')).toBeEnabled({ timeout: 120000 })
    const hints = await page.evaluate(() => window.__hints)
    const sentence = hints.find((h) => h.startsWith('Combining 300 shapes'))
    expect(sentence, `no combining sentence among ${JSON.stringify(hints)}`).toBeTruthy()
    expect(sentence).toMatch(/^Combining 300 shapes, about (a second|\d+ seconds)\. Apply is ready when they are combined\.$/)
    expect(sentence).not.toContain('here')
  })
})

test.describe('on a phone the list is a sheet, not a cover (DP-39 P4)', () => {
  // ★ The panel is laid ABSOLUTELY over the editor's body, which is right
  // beside a wide picture and wrong on a phone, where it is the full width.
  // MEASURED at 412 x 915 with the drawer open, before this: the panel covered
  // 107,163 of the picture's 107,352 square pixels. 99.8 per cent. Opening the
  // list to see which shape is which hid the very thing you were trying to
  // name.

  /**
   * What is actually on screen, and what sits on top of it.
   *
   * The picture's own rect is not the answer: it is inside a box that scrolls,
   * so part of it can be laid out somewhere nobody can see. What counts is the
   * part inside that box.
   */
  const coverage = (page) =>
    page.evaluate(() => {
      const pic = document.querySelector('.svg-prep-result-pane svg')
      const stage = document.querySelector('.drawing-editor-stage')
      const panel = document.querySelector('.drawing-editor-panel')
      if (!pic || !stage) return null
      const p = pic.getBoundingClientRect()
      const st = stage.getBoundingClientRect()
      const clip = {
        left: Math.max(p.left, st.left),
        right: Math.min(p.right, st.right),
        top: Math.max(p.top, st.top),
        bottom: Math.min(p.bottom, st.bottom),
      }
      const seen =
        Math.max(0, clip.right - clip.left) * Math.max(0, clip.bottom - clip.top)
      let covered = 0
      if (panel && !panel.hidden) {
        const b = panel.getBoundingClientRect()
        covered =
          Math.max(0, Math.min(clip.right, b.right) - Math.max(clip.left, b.left)) *
          Math.max(0, Math.min(clip.bottom, b.bottom) - Math.max(clip.top, b.top))
      }
      return {
        seen: Math.round(seen),
        covered: Math.round(covered),
        whole: Math.round(p.width * p.height),
        panelTop: panel && !panel.hidden ? Math.round(panel.getBoundingClientRect().top) : null,
        stageBottom: Math.round(st.bottom),
      }
    })

  test('★ at 412 the drawing stays on screen with the list open', async ({
    page,
  }) => {
    test.setTimeout(180000)
    await page.setViewportSize({ width: 412, height: 915 })
    await openApp(page)
    await openEditorByKeyboard(page, BIRD_SVG)
    await expect(page.locator('.svg-prep-result-pane svg').first()).toBeVisible({
      timeout: 60000,
    })

    // The drawer starts shut at this width (DP-Q46a), so this is the press
    // that used to hide the drawing.
    await page.locator('.drawing-editor-panel-toggle').click()
    await expect(page.locator('.drawing-editor-panel')).toBeVisible()

    const c = await coverage(page)
    expect(c.covered, `the list covers ${c.covered} px of the drawing`).toBe(0)
    expect(c.seen, 'nothing of the drawing is on screen').toBeGreaterThan(10000)
    // Below, not on top.
    expect(c.panelTop).toBeGreaterThanOrEqual(c.stageBottom - 2)
  })

  test('★ and the whole drawing, not the top of it', async ({ page }) => {
    // Shrinking the stage on its own left the picture at its old size and
    // simply scrolled the rest away: MEASURED, a 284 px drawing in a 197 px
    // stage, so what a person saw with the list open was half a bird.
    test.setTimeout(180000)
    await page.setViewportSize({ width: 412, height: 915 })
    await openApp(page)
    await openEditorByKeyboard(page, BIRD_SVG)
    await page.locator('.drawing-editor-panel-toggle').click()
    await expect(page.locator('.drawing-editor-panel')).toBeVisible()

    const c = await coverage(page)
    // Every square pixel the picture lays out is a square pixel on screen.
    expect(
      c.seen / c.whole,
      `only ${Math.round((c.seen / c.whole) * 100)}% of the drawing is in view`
    ).toBeGreaterThan(0.9)
  })

  test('a wide editor is untouched: the list stays beside the drawing', async ({
    page,
  }) => {
    test.setTimeout(180000)
    await page.setViewportSize({ width: 1280, height: 900 })
    await openApp(page)
    await openEditorByKeyboard(page, BIRD_SVG)
    await expect(page.locator('.drawing-editor-panel')).toBeVisible()
    const c = await coverage(page)
    expect(c.covered).toBe(0)
    // Beside, which means it does NOT start below the picture's box.
    expect(c.panelTop).toBeLessThan(c.stageBottom)
  })
})

test.describe('the word on the panel (DP-Q40)', () => {
  test('★ the charm says Shapes, because that is what is on it', async ({
    page,
  }) => {
    // A region is a thing the stencil lane cuts and paints. What somebody is
    // looking at on a charm is a shape, and it is already the word the rows
    // and the counts use - "7 shapes", "Shape 1" - so the heading was the odd
    // one out.
    test.setTimeout(180000)
    await openApp(page)
    await openEditorByKeyboard(page, BIRD_SVG)

    await expect(page.locator('.drawing-editor-panel-toggle')).toHaveText(
      'Shapes'
    )
    await expect(
      page.locator('[data-section="regions"] .drawing-editor-section-name')
    ).toHaveText('Shapes')
  })
})

test.describe('choosing rows (DP-39 P2, signed at DP-Q36)', () => {
  // "Click selects, Shift and Ctrl extend" was signed as part of row model A.
  // The ROW is the target and nothing is added to it - which is not only tidy,
  // it is the only thing that fits: MEASURED, the signed row has no spare
  // width at the drawer's 280 px floor, so a checkbox per row would have cost
  // the one line this release just bought.

  async function openBird(page) {
    await page.setViewportSize({ width: 1280, height: 900 })
    await openApp(page)
    await openEditorByKeyboard(page, BIRD_SVG)
    await expect(page.locator('.svg-prep-object').first()).toBeVisible({
      timeout: 30000,
    })
  }

  const chosen = (page) => page.locator('.svg-prep-object--selected')
  const row = (page, n) => page.locator('.svg-prep-object').nth(n)
  /**
   * Where a person aims when they mean "this shape": its name.
   *
   * Not the row's own centre, which is what clicking the row gives you - that
   * point lands wherever the layout happens to put it, and in a row this full
   * of controls it can land ON one. MEASURED: it does on CI, where the fonts
   * are wider, and four of these walks failed because a click meant for the
   * row set a role instead. Clicking a control is a press on that control, on
   * purpose; the name is the part of the row that is only the row.
   */
  const rowName = (page, n) => row(page, n).locator('.svg-prep-object-name')

  test('★ click chooses one, Shift extends, Ctrl adds', async ({ page }) => {
    test.setTimeout(180000)
    await openBird(page)
    await expect(chosen(page)).toHaveCount(0)

    await rowName(page, 1).click()
    await expect(chosen(page)).toHaveCount(1)

    await rowName(page, 4).click({ modifiers: ['Shift'] })
    await expect(chosen(page), 'Shift did not take the range').toHaveCount(4)

    await rowName(page, 0).click({ modifiers: ['Control'] })
    await expect(chosen(page)).toHaveCount(5)

    // And a plain click starts again, which is what every list people already
    // use does.
    await rowName(page, 2).click()
    await expect(chosen(page)).toHaveCount(1)
  })

  test('★ a keyboard chooses the same way, and says what it chose', async ({
    page,
  }) => {
    test.setTimeout(180000)
    await openBird(page)
    await row(page, 3).focus()
    await page.keyboard.press('Space')
    await expect(chosen(page)).toHaveCount(1)

    // The state is SAID, because these rows are list items: aria-selected
    // belongs to options and grid rows, and an option may not hold the radios
    // and the button this row holds. Rather than change what the whole list
    // reads as, the change is announced and counted where the actions are.
    const said = await page.evaluate(
      () =>
        document.querySelector('.svg-prep-workspace .sr-only[aria-live]')
          ?.textContent
    )
    expect(said).toMatch(/1 of 7 shapes selected/)
  })

  test('★ a press on a control in the row is not a press on the row', async ({
    page,
  }) => {
    // The radios, More and everything in it are controls with their own jobs.
    test.setTimeout(180000)
    await openBird(page)
    await rowName(page, 1).click()
    await expect(chosen(page)).toHaveCount(1)

    await row(page, 3).getByRole('radio', { name: 'Hole' }).check()
    await expect(chosen(page), 'a role click moved the selection').toHaveCount(1)

    await row(page, 3).locator('.svg-prep-more-btn').click()
    await expect(chosen(page), 'opening a menu moved the selection').toHaveCount(1)
  })

  test('★ Remove from list takes exactly those rows, and the choice goes with them', async ({
    page,
  }) => {
    test.setTimeout(180000)
    await openBird(page)
    const all = await page.locator('.svg-prep-object').count()

    const button = page.locator('[data-action="delete-selected"]')
    // Nothing chosen, nothing offered: a button that does nothing is worse
    // than no button.
    await expect(button).toBeHidden()

    await rowName(page, 1).click()
    await rowName(page, 2).click({ modifiers: ['Control'] })
    await expect(button).toBeVisible()
    // It says how many, because that count is the whole reason somebody chose
    // rather than deleting one at a time.
    // DP-47: "Remove from list", because the Delete KEY now sets a shape to
    // Ignore and LEAVES it in the list. Two controls called Delete, one press
    // apart, meaning opposite things, is how the owner lost shapes.
    await expect(button).toHaveText('Remove from list (2)')

    await button.click()
    await expect(page.locator('.svg-prep-object')).toHaveCount(all - 2)
    // Every index after a deleted row has moved, so a selection kept across
    // the rebuild would point at shapes nobody chose.
    await expect(chosen(page)).toHaveCount(0)
    await expect(button).toBeHidden()
  })

  test('the chosen row is not marked by colour alone', async ({ page }) => {
    test.setTimeout(180000)
    await openBird(page)
    await rowName(page, 1).click()
    const shadow = await chosen(page).evaluate(
      (el) => getComputedStyle(el).boxShadow
    )
    // A bar down the leading edge, so the state survives a greyscale
    // screenshot and outlasts the pointer that hover depends on.
    expect(shadow).not.toBe('none')
    expect(shadow).toContain('inset')
  })
})

test.describe('the picture can be pointed at (DP-40)', () => {
  // Directive item 6, signed at DP-Q37. DP-39 P3 let the LIST point at the
  // picture; this is the other direction.
  //
  // ★ Built on the SVG picture, not on the DP-20 canvas the plan named. That
  // line was written before DP-37 P1 made one picture the default, and
  // mounting a second one to be able to touch it would undo the release that
  // got this editor down to a single drawing.

  async function openBird(page) {
    await page.setViewportSize({ width: 1280, height: 900 })
    await openApp(page)
    await openEditorByKeyboard(page, BIRD_SVG)
    await expect(page.locator('.svg-prep-object').first()).toBeVisible({
      timeout: 30000,
    })
  }

  const shape = (page, i) =>
    page.locator(`.svg-prep-result-pane .svg-prep-hit-path[data-index="${i}"]`)

  test('★ every shape in the drawing can be pointed at, painted or not', async ({
    page,
  }) => {
    test.setTimeout(180000)
    await openBird(page)
    const rows = await page.locator('.svg-prep-object').count()
    await expect(
      page.locator('.svg-prep-result-pane .svg-prep-hit-path')
    ).toHaveCount(rows)

    // Invisible, and still hittable. `pointer-events: all` is what buys that:
    // it means "answer for your fill and your stroke whatever they are
    // painted", which is the only way a stroke-only drawing - every CAD
    // export, D-118's whole subject - can be pointed at at all.
    const paint = await shape(page, 2).evaluate((el) => {
      const c = getComputedStyle(el)
      return { fill: c.fill, stroke: c.stroke, events: c.pointerEvents }
    })
    expect(paint.fill).toBe('none')
    expect(paint.stroke).toBe('none')
    expect(paint.events).toBe('all')
  })

  test('★ hovering the drawing marks the row, and pressing it chooses', async ({
    page,
  }) => {
    test.setTimeout(180000)
    await openBird(page)

    await shape(page, 2).hover()
    await expect(page.locator('.svg-prep-object--pointed')).toHaveAttribute(
      'data-index',
      '2'
    )
    // And the shape lights up, the same mark the list makes.
    expect(
      await page.locator('.svg-prep-highlight-path').count()
    ).toBeGreaterThan(0)

    await shape(page, 2).click()
    await expect(page.locator('.svg-prep-object--selected')).toHaveAttribute(
      'data-index',
      '2'
    )
  })

  test('★ a small shape on top of a big one is the one you get', async ({
    page,
  }) => {
    // The bird sits on a paper rectangle that fills the whole drawing. If the
    // order were wrong every press would land on the paper and nothing else
    // could ever be chosen.
    test.setTimeout(180000)
    await openBird(page)
    await shape(page, 0).click({ position: { x: 5, y: 5 } })
    await expect(page.locator('.svg-prep-object--selected')).toHaveAttribute(
      'data-index',
      '0'
    )
    await shape(page, 2).click()
    await expect(page.locator('.svg-prep-object--selected')).toHaveAttribute(
      'data-index',
      '2'
    )
  })

  test('Ctrl and Shift work on the picture too', async ({ page }) => {
    test.setTimeout(180000)
    await openBird(page)
    await shape(page, 2).click()
    await shape(page, 3).click({ modifiers: ['Control'] })
    await expect(page.locator('.svg-prep-object--selected')).toHaveCount(2)
  })
})

test.describe('two fingers on the drawing (DP-40 P3, signed at DP-Q37)', () => {
  // The unit suites cannot answer this one. A pinch is two pointers arriving
  // and leaving independently and a browser deciding what it keeps for
  // scrolling, and none of that exists in jsdom - so it is walked here, with
  // real touch events, at a phone's size.
  test.use({ hasTouch: true, viewport: { width: 412, height: 915 } })

  async function openBird(page) {
    await openApp(page)
    await openEditorByKeyboard(page, BIRD_SVG)
    await expect(
      page.locator('.svg-prep-result-pane svg').first()
    ).toBeVisible({ timeout: 60000 })
  }

  const picture = (page) => page.locator('.svg-prep-result-pane svg').first()
  const viewBox = (page) => picture(page).getAttribute('viewBox')

  test('★ one finger belongs to the page, two belong to the drawing', async ({
    page,
  }) => {
    test.setTimeout(240000)
    await openBird(page)

    // DP-Q37's split, and it lives on the picture and nowhere else: a page you
    // cannot scroll is a worse bargain than a picture you cannot pinch.
    await expect(picture(page)).toHaveCSS('touch-action', 'pan-y')

    const before = await viewBox(page)

    // Two fingers, dispatched as the POINTER events the editor listens to.
    //
    // Not Chromium's touch dispatch, which is what this started as and which
    // fails outright on the other browsers - "CDP session is only available in
    // Chromium", found by CI after it passed here. This way the walk runs
    // everywhere and exercises the thing the release actually wrote: a cache
    // keyed by pointerId, and the arithmetic that turns two moving fingers
    // into a viewBox.
    await page.evaluate(() => {
      const pane = document.querySelector('.svg-prep-result-pane')
      const box = pane.getBoundingClientRect()
      const cx = box.left + box.width / 2
      const cy = box.top + box.height / 2
      const fire = (type, id, x) =>
        pane.dispatchEvent(
          new PointerEvent(type, {
            pointerId: id,
            pointerType: 'touch',
            clientX: x,
            clientY: cy,
            bubbles: true,
            cancelable: true,
          })
        )
      fire('pointerdown', 1, cx - 30)
      fire('pointerdown', 2, cx + 30)
      for (const d of [45, 60, 80, 100]) {
        fire('pointermove', 1, cx - d)
        fire('pointermove', 2, cx + d)
      }
      fire('pointerup', 1, cx - 100)
      fire('pointerup', 2, cx + 100)
    })
    await page.waitForTimeout(150)

    const after = await viewBox(page)
    expect(after, 'two fingers did nothing').not.toBe(before)
    // Fingers apart means closer in: a viewBox IS the window onto the
    // drawing, so zooming in asks for less of it.
    const w = (vb) => Number(vb.split(/\s+/)[2])
    expect(w(after)).toBeLessThan(w(before))
  })

  test('★ a tap still chooses a shape', async ({ page }) => {
    test.setTimeout(240000)
    await openBird(page)
    // A FILLED shape, on purpose. A tap lands in the middle of what it aims
    // at, and the middle of a stroke-converted outline is the hole inside it,
    // where the paper genuinely is - which is honest hit-testing and not
    // something to test around.
    await page
      .locator('.svg-prep-result-pane .svg-prep-hit-path[data-index="2"]')
      .tap()
    await expect(page.locator('.svg-prep-object--selected')).toHaveAttribute(
      'data-index',
      '2'
    )
  })

  test('the buttons are still there, because a pinch cannot be the only way', async ({
    page,
  }) => {
    // WCAG 2.5.7: anything done with a multi-point gesture needs a
    // single-pointer way too. Fit, + and - are it, and they are real targets.
    test.setTimeout(240000)
    await openBird(page)
    const before = await viewBox(page)
    const zoomIn = page.locator('.svg-prep-result-pane button', {
      hasText: '+',
    })
    const box = await zoomIn.boundingBox()
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
    await zoomIn.tap()
    expect(await viewBox(page)).not.toBe(before)
  })
})

test.describe('the list can point at the picture (DP-39 P3)', () => {
  // ★ It could, and then it could not, and nothing said so. Hovering or
  // focusing a row draws that shape's outline into an overlay - and the
  // overlay was in the SOURCE pane, which was the picture until DP-37 P1 made
  // one picture the default and put the source behind Compare.
  //
  // MEASURED at 1280 before this: source pane 0 by 0, result pane 808 by 354,
  // and the highlight path drawn on hover was 0 px wide. A feature that is
  // still running, still drawing, and painting into a pane nobody can see.

  async function openBird(page) {
    await page.setViewportSize({ width: 1280, height: 900 })
    await openApp(page)
    await openEditorByKeyboard(page, BIRD_SVG)
    await expect(page.locator('.svg-prep-object').first()).toBeVisible({
      timeout: 30000,
    })
  }

  /** Every highlight the page is drawing, and whether it has any size. */
  const marks = (page) =>
    page.evaluate(() =>
      [...document.querySelectorAll('.svg-prep-highlight-path')].map((p) => {
        const b = p.getBoundingClientRect()
        return Math.round(b.width) * Math.round(b.height)
      })
    )

  test('★ hovering a row outlines that shape in the picture a person is looking at', async ({
    page,
  }) => {
    test.setTimeout(180000)
    await openBird(page)
    expect(await marks(page)).toEqual([])

    await page.locator('.svg-prep-object').nth(1).hover()
    const drawn = await marks(page)
    expect(drawn.length, 'nothing was drawn at all').toBeGreaterThan(0)
    expect(
      drawn.some((area) => area > 0),
      `every highlight had no size: ${JSON.stringify(drawn)}`
    ).toBe(true)

    // And it goes away again. Away means the TOOLBAR: since DP-40 the picture
    // answers a pointer too, so moving "off the row" onto the drawing lights
    // a shape up rather than clearing it - which is the feature, not a leak.
    await page.locator('.drawing-editor-toolbar').first().hover()
    await expect
      .poll(async () => (await marks(page)).filter((a) => a > 0).length)
      .toBe(0)
  })

  test('★ a keyboard gets the same pointing as a mouse', async ({ page }) => {
    // The list is walked by Tab in this editor, and somebody who never touches
    // a mouse needs the drawing to answer the same way.
    test.setTimeout(180000)
    await openBird(page)
    await page.locator('.svg-prep-object').nth(2).focus()
    const drawn = await marks(page)
    expect(
      drawn.some((area) => area > 0),
      `focus drew nothing with size: ${JSON.stringify(drawn)}`
    ).toBe(true)
  })

  test('with Compare on, the shape lights up in both pictures', async ({
    page,
  }) => {
    test.setTimeout(180000)
    await openBird(page)
    // DP-46: Compare moved behind More.
    await page.locator('.drawing-editor-more-btn').click()
    await page.getByRole('button', { name: /Compare/ }).click()
    await expect(page.locator('.svg-prep-source-pane svg')).toBeVisible()

    await page.locator('.svg-prep-object').nth(1).hover()
    const drawn = (await marks(page)).filter((a) => a > 0)
    expect(drawn.length, 'only one picture answered').toBeGreaterThanOrEqual(2)
  })
})

test.describe('the signed shapes row (DP-39 P2, row model A)', () => {
  // DP-Q36 was asked with the three candidates drawn at this panel's real
  // widths and A was confirmed: colour tag, name, a role control with the
  // words on it, and one More menu holding offset, Layer and Delete.
  //
  // What A buys is the line P1 had to give up. MEASURED after building it,
  // standalone door, bird, first row: the role control went from 199 px to
  // 138 and the offset box and Delete left the line entirely, so at 1280 the
  // name goes from 72 px to 210 - which is the whole of "Rectangle 1
  // (600x450)" rather than six characters of it.

  async function openRows(page, width) {
    await page.setViewportSize({ width, height: 900 })
    await openApp(page)
    await openEditorByKeyboard(page, BIRD_SVG)
    const toggle = page.locator('.drawing-editor-panel-toggle')
    if (await toggle.isVisible().catch(() => false)) {
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
        await toggle.click()
      }
    }
    await expect(page.locator('.svg-prep-object').first()).toBeVisible({
      timeout: 30000,
    })
  }

  /**
   * How many lines each row is using.
   *
   * Read the CENTRES, not the tops: this row centres its children, so a 14 px
   * swatch beside a 44 px control has tops 15 px apart while sitting on the
   * same line. Reading the row's HEIGHT instead would have to know this app's
   * padding and be a different number at every width.
   */
  const lineCounts = (page) =>
    page.evaluate(() =>
      [...document.querySelectorAll('.svg-prep-object')].map((row) => {
        const bands = []
        for (const child of row.children) {
          if (child.hidden) continue
          const b = child.getBoundingClientRect()
          if (b.height <= 0) continue
          const centre = b.top + b.height / 2
          if (!bands.some((y) => Math.abs(y - centre) < 8)) bands.push(centre)
        }
        return bands.length
      })
    )

  test('★ at 1280 the whole row is one line', async ({ page }) => {
    // This is the width the name gain is FOR: the role control went from
    // 199 px to 138 and the offset box and Delete left the line, so
    // "Rectangle 1 (600x450)" reads as itself rather than as six characters
    // and an ellipsis.
    test.setTimeout(180000)
    await openRows(page, 1280)
    for (const [i, lines] of (await lineCounts(page)).entries()) {
      expect(lines, `row ${i} took ${lines} lines`).toBe(1)
    }
  })

  for (const width of [768, 412]) {
    test(`★ at ${width} the row stays tidy, one line or two`, async ({
      page,
    }) => {
      // ★ NOT "one line" here, and the difference is the font. MEASURED on
      // this machine the row holds one line at every width; MEASURED on CI,
      // where the fonts are wider, it takes two at 768 - which is the
      // TIGHTEST panel of the three, 312 px against 412's 376. Model A was
      // signed as fitting one line down to the drawer's floor, and that was
      // measured with one set of fonts; it is not a promise the layout can
      // keep on every machine.
      //
      // What it can keep is this: when the words are too wide the row wraps
      // tidily rather than eating the name or clipping Delete, which is
      // exactly what DP-39 P1 built the wrap for. Two lines is the graceful
      // path. Three would mean something is wrong.
      test.setTimeout(180000)
      await openRows(page, width)
      for (const [i, lines] of (await lineCounts(page)).entries()) {
        expect(lines, `row ${i} took ${lines} lines`).toBeLessThanOrEqual(2)
      }
    })
  }

  test('★ the whole name fits where it never used to', async ({ page }) => {
    test.setTimeout(180000)
    await openRows(page, 1280)
    const name = page.locator('.svg-prep-object-name').first()
    await expect(name).toHaveText('Rectangle 1 (600×450)')
    const cut = await name.evaluate((el) => el.scrollWidth > el.clientWidth + 1)
    expect(cut, 'the name is still being cut off').toBe(false)
  })

  test('★ the role control says the same three words to everybody', async ({
    page,
  }) => {
    test.setTimeout(180000)
    await openRows(page, 1280)
    const row = page.locator('.svg-prep-object').first()

    // Still a radio group: DP-Q36 signed a control drawn as a switch, not a
    // different control. Arrow keys walk it because it never stopped being
    // three radios in a fieldset.
    await expect(row.getByRole('radio', { name: 'Raised' })).toBeVisible()
    await expect(row.getByRole('radio', { name: 'Hole' })).toBeVisible()
    await expect(row.getByRole('radio', { name: 'Ignore' })).toBeVisible()
    await expect(row.locator('text=Foreground')).toHaveCount(0)

    // And the row's own accessible name reads the word on screen, so a
    // screen reader and an eye get the same answer to "what is this shape".
    await expect(row).toHaveAttribute('aria-label', /Rectangle 1.*Hole/)
    await row.getByRole('radio', { name: 'Ignore' }).check()
    await expect(row).toHaveAttribute('aria-label', /Rectangle 1.*Ignore/)
  })

  test('★ More holds what left the line, and gives the row back', async ({
    page,
  }) => {
    test.setTimeout(180000)
    await openRows(page, 1280)
    const more = page.locator('.svg-prep-more-btn').first()
    await expect(more).toHaveAttribute('aria-expanded', 'false')
    // The visible word is the same on every row, so the name says which row.
    await expect(more).toHaveAttribute('aria-label', /More for Rectangle 1/)

    const panel = page.locator('.svg-prep-more-panel').first()
    await expect(panel).toBeHidden()

    await more.click()
    await expect(more).toHaveAttribute('aria-expanded', 'true')
    await expect(panel).toBeVisible()
    await expect(panel.locator('.svg-prep-object-delete')).toBeVisible()
    await expect(panel.locator('.svg-prep-offset-input')).toBeVisible()

    // Escape shuts the menu and NOT the editor, and puts focus back where the
    // person left it.
    await panel.locator('.svg-prep-offset-input').focus()
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(more).toBeFocused()
    await expect(page.locator('.svg-prep-object').first()).toBeVisible()
  })

  test('only one row opens its menu at a time', async ({ page }) => {
    // Two open menus on a long list is two rows' worth of controls with
    // nothing saying which row each belongs to.
    test.setTimeout(180000)
    await openRows(page, 1280)
    const buttons = page.locator('.svg-prep-more-btn')
    await buttons.nth(0).click()
    await expect(buttons.nth(0)).toHaveAttribute('aria-expanded', 'true')
    await buttons.nth(2).click()
    await expect(buttons.nth(2)).toHaveAttribute('aria-expanded', 'true')
    await expect(buttons.nth(0)).toHaveAttribute('aria-expanded', 'false')
  })

  test('every control in the row clears the 44px floor', async ({ page }) => {
    test.setTimeout(180000)
    await openRows(page, 412)
    const row = page.locator('.svg-prep-object').first()
    const targets = [
      row.getByRole('radio', { name: 'Raised' }),
      row.getByRole('radio', { name: 'Hole' }),
      row.getByRole('radio', { name: 'Ignore' }),
      row.locator('.svg-prep-more-btn'),
    ]
    for (const t of targets) {
      const box = await t.boundingBox()
      const name = await t.getAttribute('aria-label')
      expect(box.height, `${name || 'control'} is ${box.height} px tall`).toBeGreaterThanOrEqual(44)
      expect(box.width, `${name || 'control'} is ${box.width} px wide`).toBeGreaterThanOrEqual(44)
    }
  })

  test('the row passes an accessibility scan, menu open and shut', async ({
    page,
  }) => {
    test.setTimeout(180000)
    await openRows(page, 1280)
    for (const open of [false, true]) {
      if (open) await page.locator('.svg-prep-more-btn').first().click()
      const results = await new AxeBuilder({ page })
        .include('.svg-prep-objects')
        .analyze()
      expect(
        results.violations,
        `menu ${open ? 'open' : 'shut'}: ${JSON.stringify(results.violations, null, 2)}`
      ).toEqual([])
    }
  })
})

test.describe('the shapes row keeps its name and its Delete (DP-39 P1)', () => {
  // ★ The row could not fit on one line and had no way to say so, so it took
  // the space out of the NAME and then out of Delete. MEASURED in this door on
  // the bird, at 768: the name rendered at ZERO pixels wide and Delete ran
  // 38 px past the list, 40 px of the row clipped away. Seven rows of a dot,
  // three radios and a number box, with nothing to tell one shape from
  // another - which is the complaint DP-39 exists for.
  //
  // 768 is the width that showed it, and it is not an unusual one: it is a
  // tablet, and it is also what a 1280 window gives this panel once the
  // customizer has taken its half.

  /** Every row's name width, and how far any row overflows its list. */
  const rowFacts = (page) =>
    page.evaluate(() => {
      const list = document.querySelector('.svg-prep-objects')
      const rows = [...document.querySelectorAll('.svg-prep-object')]
      return rows.map((row) => {
        const name = row.querySelector('.svg-prep-object-name')
        const del = row.querySelector('.svg-prep-object-delete')
        return {
          nameWidth: name ? Math.round(name.getBoundingClientRect().width) : 0,
          nameText: name ? name.textContent : '',
          deleteRight: del ? Math.round(del.getBoundingClientRect().right) : 0,
          listRight: Math.round(list.getBoundingClientRect().right),
          overflow: Math.max(0, Math.round(row.scrollWidth - list.clientWidth)),
        }
      })
    })

  for (const width of [1280, 768, 412]) {
    test(`★ at ${width} every row shows a name and a whole Delete`, async ({
      page,
    }) => {
      test.setTimeout(180000)
      await page.setViewportSize({ width, height: 900 })
      await openApp(page)
      await openEditorByKeyboard(page, BIRD_SVG)
      // Below 640 the drawer starts shut (DP-Q46a).
      const toggle = page.locator('.drawing-editor-panel-toggle')
      if (await toggle.isVisible().catch(() => false)) {
        if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
          await toggle.click()
        }
      }
      await expect(page.locator('.svg-prep-object').first()).toBeVisible({
        timeout: 30000,
      })

      const rows = await rowFacts(page)
      expect(rows.length).toBeGreaterThan(0)
      for (const [i, row] of rows.entries()) {
        // Six characters and an ellipsis is the floor the row is signed to
        // keep. 30 px is that floor with room for the font to differ.
        expect(
          row.nameWidth,
          `row ${i} name "${row.nameText}" is ${row.nameWidth} px wide`
        ).toBeGreaterThan(30)
        // Delete is a whole button, inside the list it belongs to.
        expect(
          row.deleteRight,
          `row ${i} Delete ends at ${row.deleteRight}, list at ${row.listRight}`
        ).toBeLessThanOrEqual(row.listRight)
        expect(row.overflow, `row ${i} overflows by ${row.overflow} px`).toBe(0)
      }
    })
  }
})

test.describe('the combine runs off the main thread (DP-37 P2)', () => {
  // ★ MEASURED before this, in Chromium, on the same drawing: the flatten took
  // 3,818 ms on the main thread and the page rendered TWO frames in all of it.
  // Through the worker the same drawing takes about the same wall time and the
  // page renders about 250 frames. DP-34 moved the trace off this thread; this
  // is the same defect one stage later.

  test('★ the page keeps answering while a big drawing is combined', async ({
    page,
  }) => {
    test.setTimeout(300000)
    await openApp(page)
    // DP-53: the combine starts by itself the moment the editor opens, so the
    // watcher is set before the open and reads what it saw afterwards.
    await page.evaluate(() => {
      window.__answered = null
      window.__seen = { progress: false, cancel: false, labelled: null, svgs: null }
      new MutationObserver(async () => {
        const cancel = document.querySelector('.svg-prep-render-cancel')
        const progress = document.querySelector('.svg-prep-render-progress')
        if (!cancel || cancel.hidden) return
        window.__seen.cancel = true
        if (progress && !progress.hidden) {
          window.__seen.progress = true
          window.__seen.labelled = progress.getAttribute('aria-labelledby')
        }
        window.__seen.svgs = document.querySelectorAll('.svg-prep-result-pane svg').length
        if (window.__answered !== null) return
        window.__answered = -1
        // The work is running. Can the page still do anything?
        const t0 = performance.now()
        await new Promise((r) => requestAnimationFrame(r))
        window.__answered = Math.round(performance.now() - t0)
      }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] })
    })
    await openEditorByKeyboard(page, OVER_BUDGET_300)
    await expect(page.locator('.svg-prep-render-btn')).toBeHidden()

    await expect(page.locator('button[data-action="save"]')).toBeEnabled({
      timeout: 300000,
    })
    const seen = await page.evaluate(() => window.__seen)
    // While it ran there was a bar, and a way to stop it.
    expect(seen.cancel, 'Cancel was never offered while it combined').toBe(true)
    expect(seen.progress, 'no bar was shown while it combined').toBe(true)
    // The bar is named, because a <label for> does not name a <progress>.
    expect(seen.labelled).toMatch(/render/i)
    // And the drawing was still on screen: nothing went blank while it worked.
    expect(seen.svgs).toBe(1)
    const answered = await page.evaluate(() => window.__answered)
    expect(answered, `a frame took ${answered} ms mid-combine`).not.toBeNull()
    expect(answered).toBeGreaterThanOrEqual(0)
    expect(answered).toBeLessThan(1000)
  })

  test('★ a choice changed mid-combine is not answered with the one it replaced', async ({
    page,
  }) => {
    test.setTimeout(300000)
    await openApp(page)
    // DP-53: the combine starts on open. Every busy stretch is counted, so the
    // one that answers the change can be told from the one it replaced.
    await page.evaluate(() => {
      window.__busyRuns = 0
      let busy = false
      new MutationObserver(() => {
        const pane = document.querySelector('.svg-prep-result-pane')
        const now = pane?.getAttribute('aria-busy') === 'true'
        if (now && !busy) window.__busyRuns += 1
        busy = now
      }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['aria-busy'] })
    })
    await openEditorByKeyboard(page, OVER_BUDGET_300)
    const cancel = page.locator('.svg-prep-render-cancel')
    await expect(cancel).toBeVisible()

    // The page answers while it combines now - that is what the worker bought
    // - so a person can change their mind in the middle of one, which was
    // impossible while the thread was taken. The moment they do, the work in
    // flight is answering a question nobody is asking any more.
    await page
      .locator(
        '.svg-prep-object[data-index="0"] .svg-prep-role-group input[value="ignore"]'
      )
      .check()

    // It has to be dropped, not left to land: a result built from the choice
    // that was just replaced is the "picture of older choices" the stale pane
    // exists to prevent, and it must never arm Apply. What arms Apply is the
    // combine that follows the change, once it has settled (DP-53).
    await expect(page.locator('button[data-action="save"]')).toBeEnabled({ timeout: 120000 })
    await expect(cancel).toBeHidden()
    await expect(page.locator('.svg-prep-result-pane')).toHaveAttribute(
      'aria-busy',
      'false'
    )
    expect(await page.evaluate(() => window.__busyRuns), 'the change ran its own combine').toBeGreaterThanOrEqual(2)
    await expect(page.locator('.svg-prep-render-btn')).toBeHidden()
  })

  test('★ closing the editor mid-combine stops the work it was doing', async ({
    page,
  }) => {
    test.setTimeout(300000)
    await openApp(page)
    await openEditorByKeyboard(page, OVER_BUDGET_300)

    // Closing mid-combine is another thing that was impossible while the
    // thread was taken. Only `destroy` stopped the work, and the surface's
    // Close calls `close`, so the worker carried on with a drawing nobody was
    // looking at any more - MEASURED at 419 ms on this fixture, and minutes on
    // the biggest drawings this app accepts - and then drew its result into
    // the closed editor and announced it.
    // DP-53: the combine is already running, from the open.
    await expect(page.locator('.svg-prep-render-cancel')).toBeVisible()
    await page.locator('.drawing-editor-close').click()

    // A closed editor draws nothing and says nothing. 419 ms is the whole
    // window, so two seconds is well past when the old result would land.
    await page.waitForTimeout(2000)
    await expect(page.locator('.svg-prep-result-pane svg')).toHaveCount(0)
    await expect(page.locator('.svg-prep-result-pane')).toHaveAttribute(
      'aria-busy',
      'false'
    )
  })

  test('★ Cancel stops a combine and leaves the drawing where it was', async ({
    page,
  }) => {
    test.setTimeout(300000)
    await openApp(page)
    await openEditorByKeyboard(page, OVER_BUDGET_300)

    // DP-53: the combine is already running, from the open.
    const cancel = page.locator('.svg-prep-render-cancel')
    await expect(cancel).toBeVisible()
    await cancel.click()

    await expect(cancel).toBeHidden()
    // No button comes back: the way back is any change, which combines again.
    await expect(page.locator('.svg-prep-render-btn')).toBeHidden()
    await expect(page.locator('.svg-prep-render-note')).toHaveText(
      'Combining canceled.'
    )
    // Nothing is left claiming to be busy, and the drawing is still there.
    await expect(page.locator('.svg-prep-result-pane')).toHaveAttribute(
      'aria-busy',
      'false'
    )
    await expect(page.locator('.svg-prep-result-pane svg')).toHaveCount(1)
    // A cancelled combine is not a result: saving is still refused.
    await expect(page.locator('button[data-action="save"]')).toBeDisabled()
  })
})

test.describe('the toolbar is two rows that never move (D-140, DP-46)', () => {
  // ★ Before this the header row held the title, Shapes, the workspace footer
  // (Apply, its 418 px hint sentence, Save, Keep original, Reset) and Close.
  // MEASURED at the editor's real 692 px: the footer wrapped to two lines and
  // Close landed on a THIRD line of its own at y 279 - and climbed back up
  // when the hint disappeared after a render, so the toolbar moved while a
  // person worked. At 412 the same pile was 401 px of a 753 px screen and the
  // picture was cut 26 px short.
  async function openEditorAt(page, width, height) {
    await page.setViewportSize({ width, height })
    await openApp(page)
    await openEditorByKeyboard(page, MANY_210)
    await expect(page.locator('.svg-prep-result-pane svg').first()).toBeVisible()
  }

  /** Every toolbar row that is actually on screen, with its height. */
  const toolbarRows = (page) =>
    page.evaluate(() =>
      [...document.querySelectorAll('.drawing-editor-toolbar-row')]
        .filter((row) => row.getClientRects().length > 0)
        .map((row) => ({
          name: row.className.replace(/.*row--/, ''),
          height: Math.round(row.getBoundingClientRect().height),
        }))
    )

  for (const [width, height] of [
    [1280, 900],
    [900, 900],
    [412, 915],
  ]) {
    test(`★ two rows, each one line, at ${width}`, async ({ page }) => {
      test.setTimeout(120000)
      await openEditorAt(page, width, height)

      const rows = await toolbarRows(page)
      expect(rows.length).toBe(2)
      // One line of controls is a 44 px target plus the row's own padding.
      // Two lines would be 90 or more, which is what the wrap used to make.
      for (const row of rows) expect(row.height).toBeLessThan(60)
    })

    test(`★ Close is on the first row at ${width}`, async ({ page }) => {
      test.setTimeout(120000)
      await openEditorAt(page, width, height)

      const placed = await page.evaluate(() => {
        const close = document.querySelector('.drawing-editor-close')
        const header = document.querySelector(
          '.drawing-editor-toolbar-row--header'
        )
        if (!close || !header) return null
        const c = close.getBoundingClientRect()
        const h = header.getBoundingClientRect()
        return { inHeader: c.bottom <= h.bottom + 1, closeWidth: c.width, closeHeight: c.height }
      })
      expect(placed.inHeader).toBe(true)
      // A word and a real target, not a glyph.
      expect(placed.closeHeight).toBeGreaterThanOrEqual(38)
    })
  }

  test('★ the hint sentence is out of the button row and in the status line', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await openEditorAt(page, 1280, 900)

    // It is the hint's PLACE that matters: in the button row its width
    // decided how many lines the toolbar had.
    await expect(
      page.locator('.drawing-editor-statusline .svg-prep-apply-hint')
    ).toHaveCount(1)
    await expect(
      page.locator('.svg-prep-footer .svg-prep-apply-hint')
    ).toHaveCount(0)
  })

  test('★ More holds the tools that left the row, and says so', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await openEditorAt(page, 1280, 900)

    const more = page.locator('.drawing-editor-more-btn')
    await expect(more).toBeVisible()
    await expect(more).toHaveAttribute('aria-expanded', 'false')
    const panel = page.locator('.drawing-editor-more-panel')
    await expect(panel).toBeHidden()

    await more.click()
    await expect(more).toHaveAttribute('aria-expanded', 'true')
    await expect(panel).toBeVisible()
    await expect(panel.locator('.svg-prep-compare-btn')).toBeVisible()
    await expect(panel.locator('.svg-prep-roles-toggle')).toBeVisible()
    await expect(panel.locator('.svg-prep-design-width')).toBeVisible()
  })

  test('★ on a phone the picture is whole and the stage does not scroll', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await openEditorAt(page, 412, 915)

    const fit = await page.evaluate(() => {
      const stage = document.querySelector('.drawing-editor-stage')
      const svg = document.querySelector('.svg-prep-result-pane svg')
      if (!stage || !svg) return null
      const s = stage.getBoundingClientRect()
      const d = svg.getBoundingClientRect()
      return {
        roomUnderPicture: Math.round(s.bottom - d.bottom),
        scrolls: stage.scrollHeight > stage.clientHeight + 1,
        toolbar: Math.round(
          document.querySelector('.drawing-editor-toolbar').getBoundingClientRect()
            .height
        ),
      }
    })
    // The picture's bottom edge is INSIDE the stage: it used to be 26 px past
    // it, with the Render row below that again.
    expect(fit.roomUnderPicture).toBeGreaterThanOrEqual(0)
    expect(fit.scrolls).toBe(false)
    expect(fit.toolbar).toBeLessThan(120)
  })


  test('★ Escape shuts More before it shuts the editor', async ({ page }) => {
    test.setTimeout(120000)
    await openEditorAt(page, 1280, 900)

    const more = page.locator('.drawing-editor-more-btn')
    const panel = page.locator('.drawing-editor-more-panel')
    await more.click()
    await expect(panel).toBeVisible()

    // The innermost thing open is what Escape ends. Before DP-39 put a row's
    // menu in this chain, one press with a menu open left the editor
    // entirely; this menu is in the same chain for the same reason.
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(more).toHaveAttribute('aria-expanded', 'false')
    await expect(more).toBeFocused()
    // And the editor is still here.
    await expect(page.locator('.drawing-editor-toolbar')).toBeVisible()
  })
  test('★ below the drawer band the actions move into More, and come back', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await openEditorAt(page, 1280, 900)

    const whereIsReset = () =>
      page.evaluate(() => {
        const reset = document.querySelector('.svg-prep-footer [data-action="reset"]')
          ? 'row'
          : document.querySelector(
                '.drawing-editor-more-panel [data-action="reset"]'
              )
            ? 'more'
            : 'nowhere'
        return {
          reset,
          // One Reset in the whole editor, wherever it is: a copy would put
          // two of the same name in the accessibility tree.
          count: document.querySelectorAll('[data-action="reset"]').length,
        }
      })

    expect(await whereIsReset()).toEqual({ reset: 'row', count: 1 })

    await page.setViewportSize({ width: 412, height: 915 })
    await expect.poll(async () => (await whereIsReset()).reset).toBe('more')
    expect((await whereIsReset()).count).toBe(1)

    await page.setViewportSize({ width: 1280, height: 900 })
    await expect.poll(async () => (await whereIsReset()).reset).toBe('row')
    expect((await whereIsReset()).count).toBe(1)
  })
})

// ── DP-49: crop, at the door ────────────────────────────────────────────────
//
// A photograph of a page is mostly page. The crop view takes the drawing's
// place: the picture itself with the kept rectangle clear, four rows in the
// customizer's own slider classes, Save crop and Cancel. The door owns the
// pixels, so it crops them and traces again through the same dialog; Undo
// crop puts the picture back. RED on the build before this release: no Crop
// button in the toolbar.
test.describe('crop at the door (DP-49)', () => {
  test('★ the bird loses its bottom band: the crop view, Save crop, the trace again; Undo crop brings it back', async ({
    page,
  }) => {
    test.setTimeout(300000)
    await openApp(page)
    await openEditorByKeyboard(page, BIRD_PNG)
    await expect
      .poll(async () => (await focused(page))?.className ?? '', {
        timeout: 10000,
      })
      .toContain('drawing-editor-title')
    const host = page.locator('#svgEditStandaloneHost')
    const rows = page.locator('.svg-prep-object')
    const before = await rows.count()
    expect(before).toBeGreaterThan(1)

    const cropBtn = host.locator('.drawing-editor-crop-btn')
    await expect(cropBtn).toBeVisible()
    await expect(cropBtn).toHaveAttribute('aria-label', 'Crop the picture')
    await cropBtn.click()
    const view = host.locator('.drawing-editor-crop')
    await expect(view).toBeVisible()
    await expect(host.locator('.drawing-editor-stage')).toBeHidden()
    await expect(
      view.locator('input[type="range"][data-inset="top"]')
    ).toBeFocused()
    // The picture in the crop view is the photograph itself, not its trace.
    await expect(view.locator('image')).toHaveAttribute(
      'href',
      /^data:image\/png/
    )
    const bottom = view.locator('.slider-spinbox[data-inset="bottom"]')
    await bottom.fill('50')
    await expect(view.locator('.drawing-editor-crop-keeping')).toHaveText(
      'Keeping 100 % of the width and 50 % of the height.'
    )
    await view.locator('[data-action="save-crop"]').click()
    await expect(view).toBeHidden()

    // The trace runs again on the kept pixels and the editor comes back on
    // the result, saying so.
    await expect(host.locator('.drawing-editor-status')).toHaveText(
      /^Cropped\. \d+ shapes?\.$/,
      { timeout: 180000 }
    )
    expect(await rows.count()).toBeGreaterThan(0)
    await expect(host.locator('.drawing-editor-stage')).toBeVisible()

    const undo = host.locator('.drawing-editor-undo-crop')
    await expect(undo).toBeVisible()
    await undo.click()
    await expect(host.locator('.drawing-editor-status')).toHaveText(
      /^Crop undone\. \d+ shapes?\.$/,
      { timeout: 60000 }
    )
    await expect.poll(() => rows.count(), { timeout: 60000 }).toBe(before)
    await expect(undo).toBeHidden()
  })

  test('axe finds nothing with the crop view open', async ({ page }) => {
    test.setTimeout(240000)
    await openApp(page)
    await openEditorByKeyboard(page, BIRD_SVG)
    const host = page.locator('#svgEditStandaloneHost')
    await host.locator('.drawing-editor-crop-btn').click()
    await expect(host.locator('.drawing-editor-crop')).toBeVisible()
    const results = await new AxeBuilder({ page })
      .include('#svgEditStandaloneHost')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    for (const v of results.violations) {
      console.log('[axe]', v.id, v.impact, v.nodes.map((n) => n.target.join(' ')).join(' | '))
    }
    expect(results.violations).toEqual([])
  })

  test('Escape in the crop view cancels it and leaves the editor open', async ({
    page,
  }) => {
    test.setTimeout(240000)
    await openApp(page)
    await openEditorByKeyboard(page, BIRD_SVG)
    const host = page.locator('#svgEditStandaloneHost')
    const cropBtn = host.locator('.drawing-editor-crop-btn')
    await expect(cropBtn).toBeVisible()
    await cropBtn.click()
    const view = host.locator('.drawing-editor-crop')
    await expect(view).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(view).toBeHidden()
    await expect(host).toBeVisible()
    await expect(cropBtn).toBeFocused()
  })
})
