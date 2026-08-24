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
 * ASCII City Walk - dropping yourself onto a street from the map. CW-36
 * built the mechanics (the segment snap, the trap guard, the naming);
 * CW-40 (CW-Q40) replaced its two-step pick-then-J gesture with the
 * owner's pin flow: the Teleport button ARMS, a click on the map travels
 * there in one step, and the game stays on the map.
 *
 * Its own file rather than an addition to ascii-city-walk.spec.js: that file
 * was already a quarter of the browser lane before D-72 split it, and the
 * cost packer places a new spec automatically (scripts/e2e-shard.mjs).
 */

test.describe('ASCII City Walk — teleport (CW-36, CW-40)', () => {
  const announcer = (page) => page.locator('#cityWalkAnnouncer')
  const hud = (page) => page.locator('#cityWalkHudStatus')
  const teleportBtn = (page) => page.locator('#cityWalkTeleportBtn')

  const walk = (page) =>
    page.evaluate(() => {
      const g = window.__cityWalkGame
      return {
        x: g.walkState.x,
        y: g.walkState.y,
        headingRad: g.walkState.headingRad,
        mapView: g.mapView,
        street: g.streetName,
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
    // landing is read out of the camera frustum, which applyMapCamera writes.
    await page.waitForTimeout(400)
  }

  /** Arm pin mode from the toolbar and wait for the state to say so. */
  const arm = async (page) => {
    await teleportBtn(page).click()
    await expect(teleportBtn(page)).toHaveAttribute('aria-pressed', 'true')
  }

  /** Click a fraction across the map viewport (armed: this commits). */
  async function clickMap(page, fx, fy) {
    const box = await page.locator('#cityWalkViewport').boundingBox()
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy)
  }

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

  test('armed, a click travels there in one step, and the map stays (CW-40)', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    const start = await walk(page)

    await openMap(page)
    await arm(page)
    await expect(announcer(page)).toHaveText(/Teleport mode on/)

    await clickMap(page, 0.42, 0.34)
    await expect(announcer(page)).toContainText(/Teleported /)

    const landed = await walk(page)
    // One click, one journey — and the game is still the map, because
    // entering the street is the player's separate choice (CW-Q40).
    expect(landed.mapView).toBe(true)
    expect(dist(landed, start)).toBeGreaterThan(50)

    // The aerial marker stands on the walker.
    const marker = await page.evaluate(() => {
      const m = window.__cityWalkGame.marker
      return { x: m.position.x, y: m.position.y }
    })
    expect(dist(marker, landed)).toBeLessThan(0.01)

    // Arming survives the hop: several journeys need no re-press.
    await expect(teleportBtn(page)).toHaveAttribute('aria-pressed', 'true')

    // The street view, chosen separately, opens on the landing street.
    await page.keyboard.press('KeyM')
    await expect(hud(page)).toContainText('street view')
    expect((await walk(page)).street).toBeTruthy()
  })

  test('the landing is never inside a building', async ({ page }) => {
    await launchGame(page)
    await enterCity(page)

    // Five committed clicks spread across the map, including corners that
    // are mostly rooftop. Every one has to leave the player somewhere they
    // could have walked to. The map never closes: pin mode stays armed.
    await openMap(page)
    await arm(page)
    const picks = [
      [0.3, 0.3],
      [0.5, 0.45],
      [0.65, 0.6],
      [0.38, 0.62],
      [0.6, 0.32],
    ]
    for (const [fx, fy] of picks) {
      await clickMap(page, fx, fy)
      await expect(announcer(page)).toContainText(/Teleported |Nowhere to land/)
      expect(
        await blocked(page),
        `pick ${fx},${fy} landed inside something`
      ).toBe(false)
    }
  })

  test('a keyboard alone can pan the map and land', async ({ page }) => {
    await launchGame(page)
    await enterCity(page)
    const start = await walk(page)

    await openMap(page)
    // No click and no arming: pan with the arrows the map already had, then
    // J, which lands on the middle of the screen. That is the whole keyboard
    // route, and it needs no key and no mode.
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(900)
    await page.keyboard.up('ArrowRight')
    await page.waitForTimeout(300)

    const center = await page.evaluate(() => {
      const c = window.__cityWalkGame.mapCam
      return { x: c.centerX, y: c.centerY }
    })

    await page.keyboard.press('KeyJ')
    await expect(announcer(page)).toContainText(/Teleported /)

    const landed = await walk(page)
    // J stays on the map too (CW-Q40): both routes end the same way.
    expect(landed.mapView).toBe(true)
    expect(dist(landed, center)).toBeLessThan(30)
    expect(dist(landed, start)).toBeGreaterThan(50)
  })

  test('the button arms, disarms, and neither mode outlives the map (CW-40)', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    const start = await walk(page)

    await openMap(page)
    await expect(teleportBtn(page)).toBeVisible()
    await expect(teleportBtn(page)).toHaveAttribute('aria-pressed', 'false')

    // A touch target, not just a button (02-accessibility rule 4).
    const box = await teleportBtn(page).boundingBox()
    expect(box.height).toBeGreaterThanOrEqual(43.5)
    expect(box.width).toBeGreaterThanOrEqual(43.5)

    // Second press disarms, and says so.
    await arm(page)
    await teleportBtn(page).click()
    await expect(teleportBtn(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(announcer(page)).toHaveText(/Teleport mode off/)

    // Unarmed, a click on the map commits nothing and picks nothing — the
    // two-step flow is retired, so the click simply is not a teleport.
    await clickMap(page, 0.42, 0.34)
    await page.waitForTimeout(400)
    expect(dist(await walk(page), start)).toBeLessThan(0.01)

    // Arm, then leave the map: the mode dies with the view it belongs to,
    // silently — the view change's sentence is the announcement.
    await arm(page)
    await page.keyboard.press('KeyM')
    await expect(hud(page)).toContainText('street view')
    // It belongs to the map, and leaves with it.
    await expect(teleportBtn(page)).toBeHidden()
    await openMap(page)
    await expect(teleportBtn(page)).toHaveAttribute('aria-pressed', 'false')
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
    // the SAME place, a second apart, with nothing moved. In the trail era it
    // measured ~0.024 (the composite fed each frame a fading copy of the
    // last, so same-code frames never quite settled) and CW-30 nearly filed
    // a false parity alarm for want of exactly this comparison. Since CW-39
    // retired the trail, standing-still frames are deterministic - re-derived
    // 2026-08-24: 0.0000 across five 1s samples, trail off AND on (standing
    // still there is no motion to smear) - so the 0.05 epsilon below carries
    // the whole threshold against a teleport's ~0.10 to ~0.14. The control
    // stays measured anyway: if the picture ever starts moving on its own
    // again, the 3x multiplier re-engages without anyone editing this test.
    const control = signatureDistance(
      await inkSignature(page),
      await settledSignature(page)
    )
    const beforeInk = await inkSignature(page)

    await openMap(page)
    await arm(page)
    await clickMap(page, 0.42, 0.34)
    await expect(announcer(page)).toContainText(/Teleported /)
    // CW-40: the commit itself stays on the map; the street view is the
    // player's next, separate press - which is exactly when a camera that
    // was never re-posed would photograph the spawn.
    await page.keyboard.press('KeyM')
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
    await arm(page)

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

    await clickMap(page, 0.45, 0.4)
    await expect(announcer(page)).toContainText(/Teleported /)
    await page.waitForTimeout(600)

    const spoken = await page.evaluate(() => window.__cwSpoken)
    // Exactly one sentence about the journey, and it is the one the live
    // region is left holding.
    const teleportLines = spoken.filter((s) => s.startsWith('Teleported '))
    expect(teleportLines).toHaveLength(1)
    expect(spoken.at(-1)).toBe(teleportLines[0])
  })

  test('axe: the map view with the teleport button has no violations, armed or not', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    await openMap(page)
    await teleportBtn(page).hover()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .include('#cityWalkLayer')
      .analyze()
    expectOnlyAllowedViolations(results)

    // Armed changes the cursor and the pressed state; neither may cost a
    // violation.
    await arm(page)
    const armedResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .include('#cityWalkLayer')
      .analyze()
    expectOnlyAllowedViolations(armedResults)
  })
})

/**
 * A coarse brightness fingerprint of the ASCII picture: mean luminance over
 * an 8x8 grid of the rendered canvas.
 *
 * Deliberately not a pixel diff. When this guard was written the ASCII
 * surface was a phosphor buffer that carried the previous frame, so exact
 * comparison was noisy by construction. CW-39 retired the trail and the
 * surface is deterministic now, but the coarse signature stays: "is this a
 * different place" is all this needs to answer, and an 8x8 average keeps
 * answering it whether or not some future effect makes pixels restless.
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
