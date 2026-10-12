/**
 * Checks every browser test can run after a step: no uncaught page error,
 * no browser confirm, prompt or alert, focus somewhere a person can see, no
 * markup shown as text, a page that fits its window, and a record of
 * everything written to a live region.
 *
 * @license GPL-3.0-or-later
 */

import { expect } from '@playwright/test'

/**
 * Console errors that are always a bug in this app, wherever they appear.
 * Several reach only the console: the app catches them and logs them.
 */
const BROKEN_CODE_TEXT =
  /Cannot read properties|Unexpected token|is not a function|before initialization|is not defined/

const recorded = new WeakMap()
const nativeDialogs = new WeakMap()

/**
 * Start collecting uncaught page errors, console errors that name broken
 * code, and any confirm, prompt or alert the browser itself shows (the app
 * has its own dialogs for all three). Each browser dialog is dismissed, as
 * Playwright does when nothing listens. Call before the first navigation.
 *
 * @param {import('@playwright/test').Page} page
 */
export function attachInvariants(page) {
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && BROKEN_CODE_TEXT.test(message.text())) {
      errors.push(`console: ${message.text()}`)
    }
  })
  recorded.set(page, errors)

  const dialogs = []
  page.on('dialog', async (dialog) => {
    if (dialog.type() !== 'beforeunload') {
      dialogs.push(`${dialog.type()}: ${dialog.message()}`)
    }
    await dialog.dismiss()
  })
  nativeDialogs.set(page, dialogs)
}

/** @param {import('@playwright/test').Page} page */
export function expectNoNativeDialog(page) {
  const dialogs = nativeDialogs.get(page)
  if (!dialogs) throw new Error('attachInvariants(page) was not called')
  expect(dialogs, 'a browser confirm, prompt or alert opened').toEqual([])
}

/** @param {import('@playwright/test').Page} page */
export function expectNoPageErrors(page) {
  const errors = recorded.get(page)
  if (!errors) throw new Error('attachInvariants(page) was not called')
  expect(errors, 'uncaught errors and broken-code console errors').toEqual([])
}

/** @param {import('@playwright/test').Page} page */
export async function expectFocusNotOnBody(page) {
  const focused = await page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body || el === document.documentElement) {
      return 'BODY'
    }
    const name = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 40)
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${name}"`
  })
  expect(focused, 'focus must not fall to the page body').not.toBe('BODY')
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} container
 */
export async function expectFocusInside(page, container) {
  const inside = await container.evaluate((el) => el.contains(document.activeElement))
  const focused = await page.evaluate(() => {
    const el = document.activeElement
    return el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}` : 'none'
  })
  expect(inside, `focus is on ${focused}, outside the expected container`).toBe(true)
}

/** @param {import('@playwright/test').Locator} locator */
export async function expectNoRawTags(locator) {
  const text = await locator.innerText()
  expect(text, 'markup shown to the reader as text').not.toMatch(/<\/?[a-z][a-z0-9]*(\s[^<>]*)?\/?>/i)
}

/** @param {import('@playwright/test').Page} page */
export async function expectPageFitsViewport(page) {
  const size = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    scrollTop: document.scrollingElement?.scrollTop ?? 0,
  }))
  expect(size.scrollTop, 'the page has slid up inside the window').toBe(0)
  expect(size.scrollHeight, 'the page is taller than the window').toBeLessThanOrEqual(size.innerHeight)
}

/**
 * Keep the page's own console lines in `window.__consoleCapture`, from before
 * the app's first script runs, so a page-side wait can watch for one. Call
 * before the first navigation.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function recordConsole(page) {
  await page.addInitScript(() => {
    window.__consoleCapture = []
    for (const level of ['log', 'info', 'warn', 'error']) {
      const original = console[level]
      console[level] = (...args) => {
        window.__consoleCapture.push(args.map(String).join(' '))
        return original.apply(console, args)
      }
    }
  })
}

/**
 * Record every text written to any live region, from before the app's first
 * script runs, including regions added later. Call before the first navigation.
 * A region that cannot speak at the moment of the write is left out: one set
 * to aria-live="off" (its text is still there to be read by navigation), one
 * marked aria-busy (screen readers hold its changes, and the walk's NVDA runs
 * never heard the engine's busy loading overlay) and one not drawn at all.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function recordAnnouncements(page) {
  await page.addInitScript(() => {
    window.__announcements = []
    const selector = '[aria-live], [role="status"], [role="log"], [role="alert"]'
    const watched = new WeakSet()
    const label = (el) => (el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}.${el.classList[0] || ''}`)
    const speaks = (el) =>
      el.getAttribute('aria-live') !== 'off' &&
      !el.closest('[aria-busy="true"]') &&
      (el.checkVisibility?.() ?? true)
    const watch = (el) => {
      if (watched.has(el)) return
      watched.add(el)
      new MutationObserver(() => {
        if (!speaks(el)) return
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
        if (text) window.__announcements.push({ t: Math.round(performance.now()), region: label(el), text })
      }).observe(el, { childList: true, subtree: true, characterData: true })
    }
    const start = () => {
      document.querySelectorAll(selector).forEach(watch)
      new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes' && mutation.target.matches?.(selector)) watch(mutation.target)
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== 1) continue
            if (node.matches(selector)) watch(node)
            node.querySelectorAll(selector).forEach(watch)
          }
        }
      }).observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-live', 'role'],
      })
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start)
    } else {
      start()
    }
  })
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>} A mark to pass to announcementsSince
 */
export function announcementMark(page) {
  return page.evaluate(() => window.__announcements.length)
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {number} mark
 * @returns {Promise<Array<{t: number, region: string, text: string}>>}
 */
export function announcementsSince(page, mark) {
  return page.evaluate((from) => window.__announcements.slice(from), mark)
}
