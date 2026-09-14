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
// DP-3 tiers. 210 shapes sits in the manual-render band (B=200 < 210 <= C=1000);
// 1200 is over the cap. Both are built from plain rects so the fixtures say
// what they test without a drawing program in the loop.
const MANY_210 = path.join(FIXTURES, 'many-shapes-210.svg')
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
      /Shape 1, role: foreground/
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
    expect(firstLabel).toMatch(/role: (foreground|hole|ignore)/)

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
  test('a drawing over the old cap opens, with its table, and does not render itself', async ({
    page,
  }) => {
    test.setTimeout(180000)
    await openApp(page)
    await openEditorByKeyboard(page, MANY_210)

    // The whole table is there. It used to be nothing.
    await expect(page.locator('.svg-prep-object')).toHaveCount(210)

    // And the boolean has NOT run.
    //
    // RE-PINNED at DP-37: this used to assert the pane was EMPTY, which pinned
    // the defect as if it were the behaviour. An empty pane was never the
    // point - it was the symptom. What matters is that no combined result
    // exists, and that is now evidenced by what the pane holds: the drawing
    // itself, marked as not yet combined, with the Render row still offered
    // and Save still refused.
    const standIn = page.locator('.svg-prep-result-pane svg.svg-prep-standin')
    await expect(standIn).toHaveCount(1)
    await expect(page.locator('button[data-action="save"]')).toBeDisabled()
    const row = page.locator('.svg-prep-render-row')
    await expect(row).toBeVisible()
    await expect(page.locator('.svg-prep-render-note')).toContainText('210 shapes')

    // Applying a result nobody has seen is refused, and the reason says so
    // rather than claiming there is nothing to apply.
    const apply = page.locator('.svg-prep-footer button[data-action="apply"]')
    if (await apply.isVisible()) await expect(apply).toBeDisabled()
    await expect(page.locator('.svg-prep-apply-hint')).toContainText('Render the preview')
  })

  test('Render preview is keyboard-operable, meets the target floor, and announces both ends', async ({
    page,
  }) => {
    test.setTimeout(300000)
    await openApp(page)
    await openEditorByKeyboard(page, MANY_210)

    const btn = page.locator('.svg-prep-render-btn')
    const box = await btn.boundingBox()
    expect(box.height, '44px target floor').toBeGreaterThanOrEqual(44)
    expect(box.width, '44px target floor').toBeGreaterThanOrEqual(44)

    // Record everything the live region says across the whole render, so a
    // start message that is swallowed by the finish message cannot pass.
    // The busy window is recorded the same way: the ring flatten made a
    // 210-rect render near-instant, so POLLING for disabled raced a window
    // narrower than one expect poll (CI Firefox caught it already enabled).
    await page.evaluate(() => {
      window.__live = []
      const el = document.querySelector('.svg-prep-workspace > .sr-only[aria-live]')
      new MutationObserver(() => {
        const t = (el.textContent || '').trim()
        if (t) window.__live.push(t)
      }).observe(el, { childList: true, characterData: true, subtree: true })
      window.__busy = []
      const renderBtn = document.querySelector('.svg-prep-render-btn')
      new MutationObserver(() => {
        window.__busy.push(renderBtn.disabled)
      }).observe(renderBtn, { attributes: true, attributeFilter: ['disabled'] })
    })

    // The editor opens fullscreen and its focus trap takes focus as it
    // activates, so a single focus() can be undone a frame later. Retrying
    // until it sticks still proves the button can hold focus - which is what
    // this is about - without racing the trap.
    await expect
      .poll(
        async () => {
          await btn.focus()
          return btn.evaluate((el) => el === document.activeElement)
        },
        { timeout: 15000 }
      )
      .toBe(true)
    await page.keyboard.press('Enter')

    // Busy first, then done - asserted from the RECORD, because the live
    // state can close the window faster than one poll.
    await expect(btn).toBeEnabled({ timeout: 300000 })

    await expect(page.locator('.svg-prep-result-pane svg')).toHaveCount(1)
    const busy = await page.evaluate(() => window.__busy)
    expect(
      busy[0] === true && busy[busy.length - 1] === false,
      `disabled transitions recorded: ${busy.join(' -> ')}`
    ).toBe(true)
    const said = await page.evaluate(() => window.__live)
    expect(said.some((t) => /Combining 210 shapes/.test(t)), said.join(' | ')).toBe(true)
    expect(said.some((t) => /Preview ready/.test(t)), said.join(' | ')).toBe(true)
  })

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
    await openEditorByKeyboard(page, MANY_210)
    await expect(page.locator('.svg-prep-object')).toHaveCount(210)
    await expect(page.locator('.svg-prep-bulk-count')).toHaveText('210 shapes')

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

    // Under tier A now, so the preview comes back on its own - the drawing
    // has been made simple enough to behave like a simple one.
    await expect(page.locator('.svg-prep-result-pane svg')).toHaveCount(1, {
      timeout: 120000,
    })

    // And it is undoable, one level, from the keyboard too.
    const undo = page.locator('[data-action="undo-delete"]')
    await undo.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.svg-prep-object')).toHaveCount(210)
    await expect(undo).toBeDisabled()
  })

  test('a single row delete is reachable and reversible by keyboard', async ({
    page,
  }) => {
    test.setTimeout(180000)
    await openApp(page)
    await openEditorByKeyboard(page, CLASS_STYLED)
    await expect(page.locator('.svg-prep-object')).toHaveCount(3)

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
    await openEditorByKeyboard(page, MANY_210)
    await expect(page.locator('.svg-prep-object').first()).toBeVisible()

    // MEASURED before this release: the pane was 1268 x 160 with no svg in it
    // at all. "Will print as", an empty rectangle, two zoom buttons floating
    // in it, and a sentence telling you to press a button.
    const pane = page.locator('.svg-prep-result-pane')
    const picture = pane.locator('svg').first()
    await expect(picture).toBeVisible()
    await expect(picture).toHaveClass(/svg-prep-standin/)
    await expect(picture).toHaveAttribute(
      'aria-label',
      'The drawing as it is now, not yet combined'
    )

    // It is a picture of what you HAVE, not of what you will get, and nothing
    // about the pane holding something says otherwise: the Render row is still
    // offered and Save is still refused, because there is no result yet.
    await expect(page.locator('.svg-prep-render-row')).toBeVisible()
    await expect(page.locator('button[data-action="save"]')).toBeDisabled()

    // And it is the drawing, not an empty frame: the tints are on it.
    const tinted = await picture.locator('.svg-prep-role-path').count()
    expect(tinted).toBe(210)
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
    const regions = page.locator('button:has-text("Regions")').first()
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
    const regions = page.locator('button:has-text("Regions")').first()
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
