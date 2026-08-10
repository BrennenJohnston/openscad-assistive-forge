import { test, expect } from '@playwright/test'
import path from 'path'

// U-8a: every Classic "Render" surface used to click the hidden
// Generate↔Download transformer button. Once a full render was cached the
// transformer's action is 'download', so pressing Render triggered an STL
// save prompt instead of a render. Render must ALWAYS mean render.
//
// sample.scad keeps the renders cheap: the defect is button logic, not
// render observability, and a download event is a crisp signal either way.

const FIXTURE = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
const WASM_READY_TIMEOUT = 180_000

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
  })
})

test('Render never downloads: all three Classic Render surfaces (U-8a)', async ({
  page,
}) => {
  test.setTimeout(300_000)

  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  })
  await page.setInputFiles('#fileInput', FIXTURE)
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 30_000 })
  const notNow = page.locator('#saveProjectNotNow')
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3_000 })
    await notNow.click()
  } catch {
    // No save-project modal to dismiss.
  }

  await page.locator('#classicModeToggle').click()
  await expect(page.locator('body')).toHaveAttribute('data-ui-mode', 'classic')

  let downloads = 0
  page.on('download', async (d) => {
    downloads++
    await d.cancel().catch(() => {})
  })

  // First Render press: a real full render runs and ARMS the transformer
  // (its hidden action becomes 'download') — the exact precondition under
  // which the old proxy turned the next Render press into a save prompt.
  await page.locator('#classicRenderBtn').click()
  await expect(page.locator('#primaryActionBtn')).toHaveAttribute(
    'data-action',
    'download',
    { timeout: 120_000 }
  )

  // Second press on the armed transformer state — the owner's report.
  await page.locator('#classicRenderBtn').click()
  await page.waitForTimeout(3_000)
  expect(downloads, 'toolbar Render must not download').toBe(0)

  // Design ▸ Render, same armed state. Exact-label filter: hasText is a
  // substring match and would also hit "Cancel Render".
  await page.locator('#designMenuBtn').click()
  const renderItem = page
    .locator('#designMenuItems button')
    .filter({ has: page.getByText('Render', { exact: true }) })
    .first()
  await expect(renderItem).toBeVisible()
  await renderItem.click()
  await page.waitForTimeout(2_000)
  expect(downloads, 'Design ▸ Render must not download').toBe(0)

  // The editor toolbar's Render button lives in the Standard density.
  await page.locator('#classicDensityToggle').click()
  const edRender = page.locator('#classicEdRenderBtn')
  await expect(edRender).toBeVisible({ timeout: 10_000 })
  await edRender.click()
  await page.waitForTimeout(2_000)
  expect(downloads, 'editor-toolbar Render must not download').toBe(0)

  // The render pipeline stayed healthy through all three presses: the
  // transformer still reports an up-to-date full render.
  await expect(page.locator('#primaryActionBtn')).toHaveAttribute(
    'data-action',
    'download'
  )
})
