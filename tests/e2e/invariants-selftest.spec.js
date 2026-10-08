/**
 * Each invariant must be able to fail. These cases build small pages that
 * break one rule each and expect the matching check to reject them, plus one
 * page that keeps every rule and passes them all.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import {
  announcementMark,
  announcementsSince,
  attachInvariants,
  expectFocusInside,
  expectFocusNotOnBody,
  expectNoPageErrors,
  expectNoRawTags,
  expectPageFitsViewport,
  recordAnnouncements,
} from './helpers/invariants.js'

const ORIGIN = 'http://invariants.test'

/** Serve one synthetic page; nothing here reaches the app or the network. */
async function openPage(page, body) {
  await page.route(`${ORIGIN}/**`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>check</title>
<style>html,body{margin:0}</style></head><body>${body}</body></html>`,
    })
  )
  await page.goto(`${ORIGIN}/`)
}

test.describe('Invariants can fail', () => {
  test('an uncaught error fails the no-page-errors check', async ({ page }) => {
    attachInvariants(page)
    await openPage(page, '<button id="b">Go</button>')
    await page.evaluate(() => setTimeout(() => { throw new Error('thrown on purpose') }, 0))
    await page.waitForTimeout(100)
    expect(() => expectNoPageErrors(page)).toThrow(/thrown on purpose/)
  })

  test('a console error naming broken code fails the no-page-errors check', async ({ page }) => {
    attachInvariants(page)
    await openPage(page, '')
    await page.evaluate(() => console.error("TypeError: Cannot read properties of null (reading 'render')"))
    await page.waitForTimeout(100)
    expect(() => expectNoPageErrors(page)).toThrow(/Cannot read properties/)
  })

  test('focus on the body fails the focus check', async ({ page }) => {
    await openPage(page, '<button id="b">Go</button>')
    await page.evaluate(() => {
      document.getElementById('b').focus()
      document.activeElement.blur()
    })
    await expect(expectFocusNotOnBody(page)).rejects.toThrow(/page body/)
  })

  test('focus outside a dialog fails the focus-inside check', async ({ page }) => {
    await openPage(page, '<div role="dialog" id="d"><button>In</button></div><button id="out">Out</button>')
    await page.locator('#out').focus()
    await expect(expectFocusInside(page, page.locator('#d'))).rejects.toThrow(/button#out/)
  })

  test('escaped markup shown as text fails the raw-tags check', async ({ page }) => {
    await openPage(page, '<p id="m">Delete "&lt;strong&gt;x&lt;/strong&gt;"?&lt;br&gt;</p>')
    await expect(expectNoRawTags(page.locator('#m'))).rejects.toThrow(/markup shown/)
  })

  test('a page taller than its window fails the fits check', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 })
    await openPage(page, '<div style="height:2000px"></div>')
    await expect(expectPageFitsViewport(page)).rejects.toThrow(/taller than the window/)
  })

  test('a page slid up inside its window fails the fits check', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 })
    await openPage(page, '<div style="height:2000px"></div>')
    await page.evaluate(() => window.scrollTo(0, 300))
    await expect(expectPageFitsViewport(page)).rejects.toThrow(/slid up/)
  })

  test('the recorder keeps both of two identical writes, and regions added later', async ({ page }) => {
    await recordAnnouncements(page)
    await openPage(page, '<div role="status" id="s"></div>')
    const mark = await announcementMark(page)
    await page.evaluate(async () => {
      const s = document.getElementById('s')
      s.textContent = 'Preview ready'
      await new Promise((r) => setTimeout(r, 20))
      s.textContent = ''
      await new Promise((r) => setTimeout(r, 20))
      s.textContent = 'Preview ready'
      const late = document.createElement('div')
      late.setAttribute('aria-live', 'polite')
      late.id = 'late'
      document.body.append(late)
      await new Promise((r) => setTimeout(r, 20))
      late.textContent = 'STL ready'
    })
    await page.waitForTimeout(100)
    const rows = await announcementsSince(page, mark)
    expect(rows.filter((r) => r.region === '#s' && r.text === 'Preview ready')).toHaveLength(2)
    expect(rows.filter((r) => r.region === '#late' && r.text === 'STL ready')).toHaveLength(1)
  })
})

test.describe('Invariants pass a page that keeps them', () => {
  test('every check passes on a clean page', async ({ page }) => {
    attachInvariants(page)
    await page.setViewportSize({ width: 800, height: 600 })
    await openPage(page, '<div role="dialog" id="d"><p id="m">Delete "Walk test"? This cannot be undone.</p><button id="ok">OK</button></div>')
    await page.locator('#ok').focus()
    expectNoPageErrors(page)
    await expectFocusNotOnBody(page)
    await expectFocusInside(page, page.locator('#d'))
    await expectNoRawTags(page.locator('#m'))
    await expectPageFitsViewport(page)
  })
})
