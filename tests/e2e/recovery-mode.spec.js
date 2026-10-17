/**
 * Recovery Mode, after a start that was interrupted: the notice stays on
 * screen until a person dismisses it, and offers the way back to automatic
 * preview.
 *
 * The interruption is seeded (the start flag without its completion, as a
 * crash leaves them), not raced: a real one depends on when a second load
 * lands during the engine's first start.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import path from 'node:path'
import {
  recordAnnouncements,
  announcementMark,
  announcementsSince,
} from './helpers/invariants.js'

const FIXTURE = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
const NOTICE =
  'Recovery Mode: the last start was interrupted, so this page opened with reduced settings. Automatic preview is off and the quality is set to fast.'

async function startInterrupted(page) {
  await recordAnnouncements(page)
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
    // Once per test, not on the recovery load the first load redirects to.
    if (!sessionStorage.getItem('interrupted-start-seeded')) {
      sessionStorage.setItem('interrupted-start-seeded', 'true')
      localStorage.setItem('openscad-forge-wasm-init-started', 'true')
      localStorage.removeItem('openscad-forge-wasm-init-completed')
    }
  })
  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 240000,
  })
}

async function openAFile(page) {
  await page.locator('#fileInput').setInputFiles(FIXTURE)
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 30000 })
  const notNow = page.locator('#saveProjectNotNow')
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3000 })
    await notNow.click()
  } catch {
    // No save-project question this time.
  }
  // The status line has had its say about the file by now.
  await page.waitForTimeout(2000)
}

/**
 * Whether the Recovery Mode notice is where a person can see it: its words
 * on the page, and the page painting them where they sit (a notice in a
 * one-pixel status box is in the page but not on screen).
 */
function noticeOnScreen(page) {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll('body *')].find(
      (e) =>
        e.children.length === 0 && /^Recovery Mode:/.test(e.textContent.trim())
    )
    if (!el || !el.checkVisibility()) return false
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(
      r.x + Math.min(r.width, 40) / 2,
      r.y + r.height / 2
    )
    return Boolean(hit && (hit === el || el.contains(hit)))
  })
}

/** Nudge the first numeric parameter, its group opened first. */
async function changeAParameter(page) {
  const changed = await page.evaluate(() => {
    for (const group of document.querySelectorAll('details.param-group')) {
      group.open = true
    }
    const input = document.querySelector(
      '.param-control input[type="number"], .param-control input[type="range"]'
    )
    if (!input) return null
    const next = Number(input.value) + (Number(input.step) || 1)
    if (input.max !== '' && next > Number(input.max)) return null
    input.value = String(next)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return input.id
  })
  expect(changed, 'a numeric parameter must be drivable').not.toBeNull()
}

/** Every write of one sentence to a region that speaks, since a mark. */
async function writesOf(page, mark, sentence) {
  await page.waitForTimeout(1500)
  const writes = await announcementsSince(page, mark)
  return writes.filter((w) => w.text === sentence)
}

test.describe('Recovery Mode after an interrupted start', () => {
  test('the notice stays after a file is opened, and its button turns automatic preview back on', async ({
    page,
  }) => {
    test.setTimeout(300000)
    await startInterrupted(page)
    expect(
      await page.evaluate(() =>
        localStorage.getItem('openscad-forge-auto-preview-enabled')
      )
    ).toBe('false')

    // Past the moment the notice first appears, then a file opened.
    await page.waitForTimeout(1500)
    await openAFile(page)
    // The notice is still on screen once the page has moved on.
    expect(
      await noticeOnScreen(page),
      'the Recovery Mode notice, after a file is opened'
    ).toBe(true)
    const banner = page.getByRole('region', { name: 'Recovery Mode' })
    await expect(banner).toBeVisible()
    await expect(banner).toContainText(NOTICE)
    // Said once, when it appeared, and left long enough to be heard: the
    // start-up's own status written over it at once drops it unheard.
    let said = await writesOf(page, 0, NOTICE)
    expect(said, JSON.stringify(said)).toHaveLength(1)
    const writes = await announcementsSince(page, 0)
    const at = writes.findIndex((w) => w.text === NOTICE)
    const over = writes
      .slice(at + 1)
      .find((w) => w.region === writes[at].region)
    if (over) {
      expect(
        over.t - writes[at].t,
        JSON.stringify([writes[at], over])
      ).toBeGreaterThanOrEqual(300)
    }

    const mark = await announcementMark(page)
    await banner
      .getByRole('button', { name: 'Turn automatic preview back on' })
      .click()
    await expect(page.locator('#autoPreviewToggle')).toBeChecked()
    expect(
      await page.evaluate(() =>
        localStorage.getItem('openscad-forge-auto-preview-enabled')
      )
    ).toBe('true')
    // On, live: the next change draws the preview by itself.
    await changeAParameter(page)
    await expect(page.locator('.preview-state-indicator')).toHaveClass(
      /state-current/,
      { timeout: 180000 }
    )
    said = await writesOf(page, mark, 'Automatic preview is on.')
    expect(said, JSON.stringify(said)).toHaveLength(1)
    // Its offer taken, the notice goes, and focus is not dropped.
    await expect(banner).toBeHidden()
    expect(
      await page.evaluate(() => document.activeElement === document.body)
    ).toBe(false)
  })

  test('its button draws a file that was opened and never drawn', async ({
    page,
  }) => {
    test.setTimeout(300000)
    await startInterrupted(page)
    await page.waitForTimeout(1500)
    await openAFile(page)
    const indicator = page.locator('.preview-state-indicator')
    await expect(indicator).not.toHaveClass(/state-current/)
    expect(
      await page.evaluate(() => Boolean(window.previewManager?.mesh)),
      'nothing drawn while automatic preview is off'
    ).toBe(false)

    const banner = page.getByRole('region', { name: 'Recovery Mode' })
    await banner
      .getByRole('button', { name: 'Turn automatic preview back on' })
      .click()
    // No value changed: the file waiting since it was opened is drawn now.
    await expect(indicator).toHaveClass(/state-current/, { timeout: 60000 })
  })

  test('Dismiss puts the notice away, keeps focus on the page, and leaves automatic preview off', async ({
    page,
  }) => {
    test.setTimeout(300000)
    await startInterrupted(page)
    await page.waitForTimeout(1500)
    await openAFile(page)
    const banner = page.getByRole('region', { name: 'Recovery Mode' })
    await expect(banner).toBeVisible()

    await banner.getByRole('button', { name: 'Dismiss' }).click()
    await expect(banner).toBeHidden()
    expect(
      await page.evaluate(() => document.activeElement === document.body)
    ).toBe(false)
    await expect(page.locator('#autoPreviewToggle')).not.toBeChecked()
  })
})
