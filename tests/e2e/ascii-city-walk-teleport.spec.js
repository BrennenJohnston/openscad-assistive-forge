import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
  expectOnlyAllowedViolations,
  useCityWalkFixtures,
  launchGame,
  enterCity,
} from './helpers/city-walk.js'

useCityWalkFixtures()

/**
 * ASCII City Walk - dropping yourself onto a street from the map (CW-36).
 *
 * Its own file rather than an addition to ascii-city-walk.spec.js: that file
 * was already a quarter of the browser lane before D-72 split it, and the
 * cost packer places a new spec automatically (scripts/e2e-shard.mjs).
 */

test.describe('ASCII City Walk — teleport (CW-36)', () => {
  const announcer = (page) => page.locator('#cityWalkAnnouncer')
  const hud = (page) => page.locator('#cityWalkHudStatus')

  const walk = (page) =>
    page.evaluate(() => {
      const g = window.__cityWalkGame
      return {
        x: g.walkState.x,
        y: g.walkState.y,
        headingRad: g.walkState.headingRad,
        mapView: g.mapView,
        street: g.streetName,
        target: g.teleportTarget,
      }
    })

  /** Where the first-person camera actually is — the trap's own measure. */
  const camera = (page) =>
    page.evaluate(() => {
      const c = window.__cityWalkGame.fpCamera
      return { x: c.position.x, y: c.position.y }
    })

  /**
   * Is the player standing in something? Asked of the game's own collision
   * grid at the player's own radius, so this is the same question stepWalk
   * asks before it lets anyone move — not a re-implementation of it.
   */
  const blocked = (page) =>
    page.evaluate(() => {
      const g = window.__cityWalkGame
      const r = 0.3
      const { x, y } = g.walkState
      return (
        g.collision.isBlocked(x, y) ||
        g.collision.isBlocked(x + r, y) ||
        g.collision.isBlocked(x - r, y) ||
        g.collision.isBlocked(x, y + r) ||
        g.collision.isBlocked(x, y - r)
      )
    })

  const openMap = async (page) => {
    await page.keyboard.press('KeyM')
    await expect(hud(page)).toContainText('map view')
    // The map needs a frame on screen before a click means anything: the
    // pick is read out of the camera frustum, which applyMapCamera writes.
    await page.waitForTimeout(400)
  }

  /** Click a fraction across the map viewport; returns the world point. */
  async function clickMap(page, fx, fy) {
    const box = await page.locator('#cityWalkViewport').boundingBox()
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy)
    await expect(announcer(page)).toContainText(/Teleport target set/)
    return (await walk(page)).target
  }

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

  test('a click picks a spot, and J drops you on it', async ({ page }) => {
    await launchGame(page)
    await enterCity(page)
    const start = await walk(page)

    await openMap(page)
    const picked = await clickMap(page, 0.42, 0.34)
    expect(picked).not.toBeNull()

    await page.keyboard.press('KeyJ')
    await expect(hud(page)).toContainText('street view')

    const landed = await walk(page)
    // Landed near the pick — the snap radius plus the spiral's own reach is
    // the honest tolerance, and a landing further than that means the pick
    // was not what moved the player.
    expect(dist(landed, picked)).toBeLessThan(30)
    // …and somewhere else entirely from where the session started.
    expect(dist(landed, start)).toBeGreaterThan(50)

    // The HUD names where you are, and the pick is spent.
    expect(landed.street).toBeTruthy()
    await expect(hud(page)).toContainText(`on ${landed.street}`)
    expect(landed.target).toBeNull()
    await expect(announcer(page)).toContainText(
      new RegExp(`Teleported to ${landed.street.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, facing \\w+\\.`)
    )
  })

  test('the landing is never inside a building', async ({ page }) => {
    await launchGame(page)
    await enterCity(page)

    // Five picks spread across the map, including corners that are mostly
    // rooftop. Every one of them has to leave the player somewhere they
    // could have walked to.
    const picks = [
      [0.3, 0.3],
      [0.5, 0.45],
      [0.65, 0.6],
      [0.38, 0.62],
      [0.6, 0.32],
    ]
    for (const [fx, fy] of picks) {
      await openMap(page)
      await clickMap(page, fx, fy)
      await page.keyboard.press('KeyJ')
      await expect(hud(page)).toContainText('street view')
      expect(await blocked(page), `pick ${fx},${fy} landed inside something`).toBe(
        false
      )
    }
  })

  test('a keyboard alone can pan the map and land', async ({ page }) => {
    await launchGame(page)
    await enterCity(page)
    const start = await walk(page)

    await openMap(page)
    // No click anywhere: pan with the arrows the map already had, then J,
    // which lands on the middle of the screen. That is the whole keyboard
    // route, and it needs no key this release did not add.
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(900)
    await page.keyboard.up('ArrowRight')
    await page.waitForTimeout(300)

    const center = await page.evaluate(() => {
      const c = window.__cityWalkGame.mapCam
      return { x: c.centerX, y: c.centerY }
    })

    await page.keyboard.press('KeyJ')
    await expect(hud(page)).toContainText('street view')

    const landed = await walk(page)
    expect(landed.target).toBeNull()
    expect(dist(landed, center)).toBeLessThan(30)
    expect(dist(landed, start)).toBeGreaterThan(50)
    await expect(announcer(page)).toContainText(/Teleported to /)
  })

  test('the toolbar button does what the key does', async ({ page }) => {
    await launchGame(page)
    await enterCity(page)
    const start = await walk(page)

    await openMap(page)
    await expect(page.locator('#cityWalkTeleportBtn')).toBeVisible()
    await clickMap(page, 0.45, 0.55)
    await page.locator('#cityWalkTeleportBtn').click()

    await expect(hud(page)).toContainText('street view')
    expect(dist(await walk(page), start)).toBeGreaterThan(50)

    // It belongs to the map, and leaves with it.
    await expect(page.locator('#cityWalkTeleportBtn')).toBeHidden()
  })

  test('THE TRAP: the street view shows the landing, not the spawn', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // Round 4 (CW-20) recorded this one: the first-person camera is only
    // re-posed inside a movement step, so a teleport that moves walkState
    // alone leaves the camera standing where the player used to be and the
    // street view photographs the spawn. Both halves are checked - where the
    // camera IS, and that the picture actually changed.
    const before = await camera(page)

    // The control, measured in this run rather than assumed: two captures of
    // the SAME place, a second apart, with nothing moved. It is never zero -
    // the phosphor trail carries the previous frame and the traffic lights
    // tick - and CW-30 nearly filed a false parity alarm for want of exactly
    // this comparison. Measured here at ~0.024 against a teleport's ~0.10 to
    // ~0.14, so the picture has to change by several times the noise floor.
    const control = signatureDistance(
      await inkSignature(page),
      await settledSignature(page)
    )
    const beforeInk = await inkSignature(page)

    await openMap(page)
    await clickMap(page, 0.42, 0.34)
    await page.keyboard.press('KeyJ')
    await expect(hud(page)).toContainText('street view')

    const landed = await walk(page)
    const after = await camera(page)

    // The camera is AT the walker, not trailing it.
    expect(Math.abs(after.x - landed.x)).toBeLessThan(0.01)
    expect(Math.abs(after.y - landed.y)).toBeLessThan(0.01)
    expect(dist(after, before)).toBeGreaterThan(50)

    // And the picture is a different picture, by several times the noise
    // this machine just showed us it makes standing still.
    const afterInk = await inkSignature(page)
    const signal = signatureDistance(beforeInk, afterInk)
    expect(
      signal,
      `teleport moved the picture by ${signal.toFixed(4)}; standing still moved it by ${control.toFixed(4)}`
    ).toBeGreaterThan(Math.max(0.05, control * 3))
  })

  test('one teleport says one thing', async ({ page }) => {
    await launchGame(page)
    await enterCity(page)
    await openMap(page)
    await clickMap(page, 0.45, 0.4)

    // Count what is WRITTEN into the live region, not how many times the
    // node is touched: an announcer that clears itself and rewrites the same
    // sentence mutates twice and speaks once (CW-27).
    await page.evaluate(() => {
      window.__cwSpoken = []
      const node = document.getElementById('cityWalkAnnouncer')
      new MutationObserver(() => {
        const text = node.textContent.trim()
        if (text && window.__cwSpoken.at(-1) !== text) {
          window.__cwSpoken.push(text)
        }
      }).observe(node, { childList: true, characterData: true, subtree: true })
    })

    await page.keyboard.press('KeyJ')
    await expect(hud(page)).toContainText('street view')
    await page.waitForTimeout(600)

    const spoken = await page.evaluate(() => window.__cwSpoken)
    // Exactly one sentence about the teleport. The view-change sentence
    // toggleMapView would otherwise leave behind is the thing this catches.
    const teleportLines = spoken.filter((s) => s.startsWith('Teleported to'))
    expect(teleportLines).toHaveLength(1)
    expect(spoken.at(-1)).toBe(teleportLines[0])
  })

  test('a pick does not outlive the map it was made on', async ({ page }) => {
    await launchGame(page)
    await enterCity(page)

    await openMap(page)
    await clickMap(page, 0.45, 0.45)
    expect((await walk(page)).target).not.toBeNull()

    // Leave the map without going anywhere.
    await page.keyboard.press('KeyM')
    await expect(hud(page)).toContainText('street view')
    expect((await walk(page)).target).toBeNull()

    // Re-opening offers no stale target: J now uses the map centre, which
    // follow mode has put back on the player, so nothing moves far.
    const before = await walk(page)
    await openMap(page)
    expect((await walk(page)).target).toBeNull()
    await page.keyboard.press('KeyJ')
    await expect(hud(page)).toContainText('street view')
    expect(dist(await walk(page), before)).toBeLessThan(30)
  })

  test('axe: the map view with the teleport button has no violations', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    await openMap(page)
    await clickMap(page, 0.45, 0.45)
    await page.locator('#cityWalkTeleportBtn').hover()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .include('#cityWalkLayer')
      .analyze()
    expectOnlyAllowedViolations(results)
  })
})

/**
 * A coarse brightness fingerprint of the ASCII picture: mean luminance over
 * an 8x8 grid of the rendered canvas.
 *
 * Deliberately not a pixel diff. The ASCII surface is a phosphor buffer that
 * carries the previous frame, so exact comparison is noisy by construction;
 * an 8x8 average of a whole cityscape is not, and "is this a different place"
 * is all this needs to answer.
 */
async function inkSignature(page) {
  return page.evaluate(() => {
    // The ASCII overlay, NOT the WebGL canvas beside it. three.js runs
    // without preserveDrawingBuffer, so drawImage of the GL canvas returns
    // a blank frame - measured, and it made this guard compare nothing to
    // nothing and pass a distance of exactly zero.
    const canvas = document.querySelector(
      '#cityWalkViewport canvas.hfm-overlay-canvas'
    )
    if (!canvas) return null
    const w = 64
    const h = 64
    const scratch = document.createElement('canvas')
    scratch.width = w
    scratch.height = h
    const ctx = scratch.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(canvas, 0, 0, w, h)
    const { data } = ctx.getImageData(0, 0, w, h)
    const cells = []
    for (let by = 0; by < 8; by++) {
      for (let bx = 0; bx < 8; bx++) {
        let sum = 0
        for (let y = by * 8; y < by * 8 + 8; y++) {
          for (let x = bx * 8; x < bx * 8 + 8; x++) {
            const i = (y * w + x) * 4
            sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
          }
        }
        cells.push(sum / 64 / 255)
      }
    }
    return cells
  })
}

/** The same fingerprint, a second later, for the standing-still control. */
async function settledSignature(page) {
  await page.waitForTimeout(1000)
  return inkSignature(page)
}

/** Mean absolute difference between two signatures, 0 = identical. */
function signatureDistance(a, b) {
  expect(a, 'no ASCII canvas to fingerprint').not.toBeNull()
  expect(b, 'no ASCII canvas to fingerprint').not.toBeNull()
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
  return sum / a.length
}
