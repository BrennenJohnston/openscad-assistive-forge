/**
 * E2E tests for an engine that fails partway through a model: the next
 * preview must still run.
 *
 * The fixture recurses deeper than a browser engine's stack allows, so its
 * first preview fails in every browser. The engine then has to be started
 * again; when it was not, the next render was refused and the preview never
 * came back.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import path from 'node:path'
import process from 'node:process'

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures')
const DEEP = path.join(FIXTURES, 'deep-recursion.scad')
const SLOW = path.join(FIXTURES, 'slow-render.scad')

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

async function openFixture(page, fixture) {
  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 120_000,
  })
  await page.locator('#fileInput').setInputFiles(fixture)
  await page
    .locator('.param-control')
    .first()
    .waitFor({ state: 'attached', timeout: 30_000 })
  const notNow = page.locator('#saveProjectNotNow')
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3_000 })
    await notNow.click()
  } catch {
    // Not every load raises the save prompt
  }
}

async function setSteps(page, value) {
  const expandAll = page.locator('#expandAllGroupsBtn')
  if (await expandAll.isVisible()) await expandAll.click()
  const spinbox = page.locator('#param-steps-spinbox')
  await expect(spinbox).toBeVisible({ timeout: 15_000 })
  await spinbox.fill(String(value))
  await spinbox.dispatchEvent('change')
}

test.describe('After the engine runs out of stack', () => {
  test('the next change still gets its preview', async ({ page }) => {
    test.setTimeout(240_000)
    await openFixture(page, DEEP)

    const indicator = page.locator('.preview-state-indicator')
    await expect(indicator).toHaveClass(/state-error/, { timeout: 120_000 })

    await setSteps(page, 5)
    await expect(indicator).toHaveClass(/state-current/, { timeout: 90_000 })
  })
})

test.describe('A preview stopped at the time limit', () => {
  test('ends in an error the person can see, not an endless render', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    // Time still flows; the clock only lets the test jump ahead.
    await page.clock.install()
    // The limit starts when the render reaches the engine, which can be well
    // after the indicator says "rendering": the engine may restart first.
    await page.addInitScript(() => {
      const post = Worker.prototype.postMessage
      Worker.prototype.postMessage = function (message, ...rest) {
        if (message?.type === 'RENDER') {
          window.__rendersPosted = (window.__rendersPosted || 0) + 1
        }
        return post.call(this, message, ...rest)
      }
    })
    await openFixture(page, SLOW)

    const indicator = page.locator('.preview-state-indicator')
    await page.waitForFunction(() => window.__rendersPosted >= 1, null, {
      timeout: 60_000,
      polling: 100,
    })
    await expect(indicator).toHaveClass(/state-rendering/)
    // A model with minkowski() gets at least 60 s, then 30 s of grace before
    // the stop. Jump past both while the engine is still busy.
    await page.clock.fastForward(120_000)
    await expect(indicator).toHaveClass(/state-error/, { timeout: 30_000 })
  })
})
