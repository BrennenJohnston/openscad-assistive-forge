/**
 * D-152: the edges overlay sits on the model (2026-09-17).
 *
 * The owner's walk found the "Edges" overlay drawn in a different place from
 * the charm. Every mesh over 10,000 triangles takes the geometry worker's
 * path (D-143): its edge segments are made on the centered soup, and the
 * auto-bed then moved the geometry up onto the build plate without them, so
 * the overlay hung below the model by the bed offset. The default charm is
 * 29,372 triangles, so it always showed it; the small example models never
 * did. RED on the build before the fix: the overlay's lowest point half a
 * charm below the model's.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'

async function openCharm(page) {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', { timeout: 240000 })
  await page.selectOption('#charmVariantSelect', 'q-charm')
  await page.click('#openCharmMakerBtn')
  await page.waitForFunction(
    () => Object.keys(window.stateManager?.getState()?.parameters || {}).length > 0,
    null,
    { timeout: 120000 }
  )
  for (let i = 0; i < 2; i++) {
    const notNow = page.getByRole('button', { name: 'Not now', exact: true })
    if (await notNow.isVisible().catch(() => false)) {
      await notNow.click()
      await page.waitForTimeout(300)
    }
  }
  await expect(page.locator('.preview-state-indicator')).toHaveText(
    /Preview ready|Preview \(cached\)/,
    { timeout: 240000 }
  )
}

/** The mesh's box and the overlay's, in the mesh's own frame. */
const boxes = (page) =>
  page.evaluate(() => {
    const pm = window.previewManager
    const mesh = pm?.mesh?.isGroup ? pm.mesh.children[0] : pm?.mesh
    if (!mesh?.geometry) return { error: 'no mesh' }
    const edges = pm.mesh.getObjectByName('__displayEdges')
    if (!edges?.geometry) return { error: 'no overlay' }
    mesh.geometry.computeBoundingBox()
    edges.geometry.computeBoundingBox()
    const b = (g) => ({
      min: [g.boundingBox.min.x, g.boundingBox.min.y, g.boundingBox.min.z],
      max: [g.boundingBox.max.x, g.boundingBox.max.y, g.boundingBox.max.z],
    })
    const pos = mesh.geometry.getAttribute('position')
    return {
      triangles: Math.floor(pos.count / 3),
      segments: Math.floor(edges.geometry.getAttribute('position').count / 2),
      mesh: b(mesh.geometry),
      edges: b(edges.geometry),
      overlayLocal: [edges.position.x, edges.position.y, edges.position.z],
    }
  })

test.describe('the edges overlay sits on the model (D-152)', () => {
  test('★ on the default charm, the overlay and the mesh share a box', async ({
    page,
  }) => {
    test.setTimeout(480000)
    await openCharm(page)
    await expect
      .poll(async () => (await boxes(page)).segments || 0, { timeout: 60000 })
      .toBeGreaterThan(100)
    const r = await boxes(page)
    expect(r.error).toBeUndefined()
    // Over the worker's threshold: the path the walk saw.
    expect(r.triangles).toBeGreaterThan(10000)
    // The overlay is the mesh's child with no offset of its own.
    expect(r.overlayLocal).toEqual([0, 0, 0])
    // Its box is the model's box: an edge set of a closed mesh reaches every
    // extreme the faces do.
    for (const axis of [0, 1, 2]) {
      expect(
        Math.abs(r.edges.min[axis] - r.mesh.min[axis]),
        `min on axis ${axis}: overlay ${r.edges.min[axis]} vs mesh ${r.mesh.min[axis]}`
      ).toBeLessThan(0.05)
      expect(
        Math.abs(r.edges.max[axis] - r.mesh.max[axis]),
        `max on axis ${axis}: overlay ${r.edges.max[axis]} vs mesh ${r.mesh.max[axis]}`
      ).toBeLessThan(0.05)
    }
    // And the model is on the build plate, which is where the bed put it.
    expect(Math.abs(r.mesh.min[2])).toBeLessThan(0.01)
  })
})
