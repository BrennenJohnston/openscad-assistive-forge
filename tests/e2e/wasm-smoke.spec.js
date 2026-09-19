import { test, expect } from '@playwright/test'
import path from 'path'

// WASM smoke suite — the always-on CI gate for the core render pipeline.
//
// This file must NEVER contain test.skip(isCI, ...). Nearly every other
// WASM-dependent e2e spec is skipped in CI, which means a green run proves
// nothing about upload → render → export. These five checks are the floor:
// if they fail, the app's reason for existing is broken.
//
// Render-completion is detected via the .preview-state-indicator class
// cycle (state-pending → state-rendering → state-current) and the
// #previewStatusStats triangle readout, not the download event, which is
// unreliable in headless mode and caused the original CI skips.

const FIXTURE = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
// The tile template every new contribution is copied from. It is starter
// material, not a tile anyone is offered, so nothing else in the suite would
// ever render it - and a template that does not render is worse than no
// template at all.
const TEMPLATE = path.join(
  process.cwd(),
  'public',
  'examples',
  '_template',
  'template_tile.scad'
)

const WASM_READY_TIMEOUT = 180_000
const PREVIEW_TIMEOUT = 120_000

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

async function loadSampleProject(page, fixture = FIXTURE) {
  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  })

  await page.locator('#fileInput').setInputFiles(fixture)
  await expect(page.locator('#welcomeScreen')).toBeHidden({ timeout: 30_000 })
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 10_000 })

  const notNowBtn = page.locator('#saveProjectNotNow')
  try {
    await notNowBtn.waitFor({ state: 'visible', timeout: 3_000 })
    await notNowBtn.click()
  } catch {
    // Save-project modal did not appear; nothing to dismiss.
  }
}

// Parameter groups are <details> and may render collapsed; expand the first
// one so its inputs become visible/interactable.
async function openFirstParamGroup(page) {
  const firstGroup = page.locator('details.param-group').first()
  await expect(firstGroup).toBeVisible({ timeout: 15_000 })
  const isOpen = await firstGroup.evaluate((el) => el.open)
  if (!isOpen) {
    await firstGroup.locator('summary').click()
  }
}

async function waitForPreviewReady(page) {
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-current/,
    { timeout: PREVIEW_TIMEOUT }
  )
  // Stats read "12.3 KB | 1,234 triangles". OFF previews (the render-colors
  // default) now report a real triangle count parsed from the header (F-1),
  // so both the size and the count must be non-zero for a 3D fixture.
  const statsText = await page.locator('#previewStatusStats').textContent()
  expect(statsText, 'preview stats should be populated').toMatch(/\d/)
  const size = Number.parseFloat(statsText)
  expect(size, `preview output size should be non-zero, got: "${statsText}"`).toBeGreaterThan(0)
  const triangleMatch = statsText.match(/([\d,]+)\s+triangles/)
  expect(triangleMatch, `stats should include a triangle count, got: "${statsText}"`).not.toBeNull()
  const triangles = Number.parseInt(triangleMatch[1].replace(/,/g, ''), 10)
  expect(triangles, `triangle count should be non-zero, got: "${statsText}"`).toBeGreaterThan(0)
  return statsText
}

test.describe('WASM smoke (never skipped)', () => {
  test('app boots and the WASM engine initializes', async ({ page }) => {
    test.setTimeout(240_000)

    // The --help capability probe used to flood ~200 [OpenSCAD ERR] lines into
    // the console on every cold start; a clean boot console is a hard gate.
    const openscadErrLines = []
    page.on('console', (msg) => {
      if (msg.text().includes('[OpenSCAD ERR]')) {
        openscadErrLines.push(msg.text())
      }
    })

    await page.goto('/')
    await expect(page.locator('h1')).toContainText('OpenSCAD', { timeout: 15_000 })
    await expect(page.locator('#uploadZone, .upload-zone').first()).toBeVisible({
      timeout: 10_000,
    })
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    })

    expect(
      openscadErrLines,
      `boot console must not contain [OpenSCAD ERR] noise; got:\n${openscadErrLines.slice(0, 5).join('\n')}`
    ).toHaveLength(0)
  })

  test('uploading a .scad renders a preview with geometry', async ({ page }) => {
    test.setTimeout(240_000)

    await loadSampleProject(page)

    await openFirstParamGroup(page)
    await expect(
      page
        .locator('.param-group input[type="range"], .param-group input[type="number"]')
        .first()
    ).toBeVisible({ timeout: 15_000 })

    await waitForPreviewReady(page)
  })

  test('full render produces non-empty STL bytes', async ({ page }) => {
    test.setTimeout(240_000)

    await loadSampleProject(page)
    await waitForPreviewReady(page)

    // __forgeDebug.compareGeometry() runs renderController.renderFull() at
    // FULL quality and reports real STL byte/triangle counts — the same
    // pipeline the download button uses, minus the flaky download event.
    const result = await page.evaluate(() => window.__forgeDebug.compareGeometry())

    expect(result, 'compareGeometry should return a result object').toBeTruthy()
    expect(result.error, `full render failed: ${result?.error}`).toBeUndefined()
    expect(result.browser.triangles).toBeGreaterThan(0)
    // Binary STL: 80-byte header + 4-byte count + 50 bytes/triangle.
    expect(result.browser.stlBytes).toBeGreaterThan(84)
  })

  test('changing a parameter triggers a re-render', async ({ page }) => {
    test.setTimeout(240_000)

    await loadSampleProject(page)
    await waitForPreviewReady(page)

    // Record every indicator class transition from this point on, so a fast
    // re-render cannot slip between polling assertions unobserved.
    await page.evaluate(() => {
      const el = document.querySelector('.preview-state-indicator')
      window.__smokeStates = []
      new MutationObserver(() => {
        window.__smokeStates.push(el.className)
      }).observe(el, { attributes: true, attributeFilter: ['class'] })
    })

    await openFirstParamGroup(page)
    const widthInput = page
      .locator('.param-group input[type="number"]')
      .first()
    await expect(widthInput).toBeVisible({ timeout: 15_000 })
    await widthInput.fill('75')
    await widthInput.blur()

    await page.waitForFunction(
      () => {
        const sawRerender = (window.__smokeStates || []).some((cls) =>
          /state-(pending|rendering)/.test(cls)
        )
        const indicator = document.querySelector('.preview-state-indicator')
        return sawRerender && /state-current/.test(indicator?.className || '')
      },
      { timeout: PREVIEW_TIMEOUT }
    )

    await waitForPreviewReady(page)
  })

  test('the tile template renders, and the engine says nothing', async ({
    page,
  }) => {
    test.setTimeout(240_000)

    // A green status over a failed import is worse than a red one: that is
    // exactly how the Logo Plate example shipped broken. So this asserts the
    // console as well as the preview.
    const engineErrors = []
    page.on('console', (msg) => {
      const text = msg.text()
      if (/\[OpenSCAD ERR\].*ERROR:/i.test(text)) engineErrors.push(text)
    })

    await loadSampleProject(page, TEMPLATE)
    const stats = await waitForPreviewReady(page)

    expect(engineErrors, engineErrors.join(' | ')).toEqual([])
    // The template's asserts run at render time. If one of them fires, the
    // preview never reaches state-current, so arriving here with geometry is
    // also proof that its documented ranges hold at the shipped defaults.
    expect(stats).toMatch(/triangles/)
  })
})
