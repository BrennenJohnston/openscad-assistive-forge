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
 * CW-40 (CW-Q40) replaced its two-step pick-then-J gesture with a pin flow
 * where the Teleport button ARMED and a click travelled in one step; CW-61
 * (CW-Q58) retires the arming. Every sub-threshold map click now ASKS, in a
 * dialog that names the corner you would land on, and nothing moves until
 * Travel is pressed. J asks the same question about the middle of the map.
 *
 * ★ THE REVERSAL IS DELIBERATE AND IT IS RECORDED. CW-40's unarmed click did
 * nothing at all and its armed click was irreversible. Both are gone: the
 * cost is one extra press, and what it buys is a preview - which for a
 * screen-reader user is the only description of the destination there is.
 *
 * Its own file rather than an addition to ascii-city-walk.spec.js: that file
 * was already a quarter of the browser lane before D-72 split it, and the
 * cost packer places a new spec automatically (scripts/e2e-shard.mjs).
 */

test.describe('ASCII City Walk — teleport (CW-36, CW-40)', () => {
  const announcer = (page) => page.locator('#cityWalkAnnouncer')
  const hud = (page) => page.locator('#cityWalkHudStatus')
  const teleportBtn = (page) => page.locator('#cityWalkTeleportBtn')
  const dialog = (page) => page.locator('#cityWalkTravelDialog')
  const dialogWhere = (page) => page.locator('#cityWalkTravelWhere')
  const goBtn = (page) => page.locator('#cityWalkTravelGoBtn')
  const cancelBtn = (page) => page.locator('#cityWalkTravelCancelBtn')

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

  /** Click a fraction across the map viewport. This ASKS; it does not go. */
  async function clickMap(page, fx, fy) {
    const box = await page.locator('#cityWalkViewport').boundingBox()
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy)
  }

  /**
   * Ask about a spot and answer yes. The two halves are separate on purpose:
   * a test that only ever used this pair could not tell a dialog that opens
   * from one that never does.
   */
  async function clickAndTravel(page, fx, fy) {
    await clickMap(page, fx, fy)
    if (!(await dialog(page).isVisible())) return false
    await goBtn(page).click()
    await expect(dialog(page)).toBeHidden()
    return true
  }

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

  test('★★ a click ASKS, and Travel goes; the map stays (CW-61)', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    const start = await walk(page)

    await openMap(page)

    // The click opens the question and moves NOTHING. That second half is
    // the reversal this release makes, so it is asserted rather than
    // implied by the confirm succeeding afterwards.
    await clickMap(page, 0.42, 0.34)
    await expect(dialog(page)).toBeVisible()
    expect(dist(await walk(page), start)).toBeLessThan(0.01)

    // It names where you would land, and the naming is never empty.
    await expect(dialogWhere(page)).not.toHaveText('')
    await expect(dialogWhere(page)).toHaveText(/^(On|Near|Open ground)/)

    // Focus is IN the dialog when it opens, or a keyboard user has to hunt
    // for a control that appeared without warning.
    await expect(goBtn(page)).toBeFocused()

    await goBtn(page).click()
    await expect(dialog(page)).toBeHidden()
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

    // The street view, chosen separately, opens on the landing street.
    await page.keyboard.press('KeyM')
    await expect(hud(page)).toContainText('street view')
    expect((await walk(page)).street).toBeTruthy()
  })

  test('the landing is never inside a building', async ({ page }) => {
    await launchGame(page)
    await enterCity(page)

    // Five confirmed journeys spread across the map, including corners that
    // are mostly rooftop. Every one has to leave the player somewhere they
    // could have walked to. The map never closes.
    await openMap(page)
    const picks = [
      [0.3, 0.3],
      [0.5, 0.45],
      [0.65, 0.6],
      [0.38, 0.62],
      [0.6, 0.32],
    ]
    for (const [fx, fy] of picks) {
      // A refusal never opens the dialog at all - findLandingNear runs
      // BEFORE the question, so the game never offers a journey it would
      // then have to take back.
      await clickAndTravel(page, fx, fy)
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

    // ★ J ASKS NOW, and that is a deliberate reversal of CW-Q40's one-step
    // J. The keyboard could always reach any spot; what it could not do was
    // hear where it was going first.
    await page.keyboard.press('KeyJ')
    await expect(dialog(page)).toBeVisible()
    await expect(goBtn(page)).toBeFocused()
    // Enter on the focused Travel button, so this is the keyboard the whole
    // way and not a click wearing a key's name.
    await page.keyboard.press('Enter')
    await expect(dialog(page)).toBeHidden()
    await expect(announcer(page)).toContainText(/Teleported /)

    const landed = await walk(page)
    // J stays on the map too (CW-Q40): both routes end the same way.
    expect(landed.mapView).toBe(true)
    expect(dist(landed, center)).toBeLessThan(30)
    expect(dist(landed, start)).toBeGreaterThan(50)
  })

  test('★★ Cancel and Escape move nothing, and the question dies with the map (CW-61)', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    const start = await walk(page)

    await openMap(page)
    await expect(teleportBtn(page)).toBeVisible()
    // ★ NOT A TOGGLE ANY MORE. The arming it announced has retired, so a
    // pressed state would be describing a mode that no longer exists.
    await expect(teleportBtn(page)).not.toHaveAttribute('aria-pressed', 'true')
    await expect(teleportBtn(page)).not.toHaveAttribute('aria-pressed', 'false')

    // A touch target, not just a button (02-accessibility rule 4).
    const box = await teleportBtn(page).boundingBox()
    expect(box.height).toBeGreaterThanOrEqual(43.5)
    expect(box.width).toBeGreaterThanOrEqual(43.5)
    for (const b of [goBtn(page), cancelBtn(page)]) {
      await clickMap(page, 0.42, 0.34)
      await expect(dialog(page)).toBeVisible()
      const bb = await b.boundingBox()
      expect(bb.height).toBeGreaterThanOrEqual(43.5)
      expect(bb.width).toBeGreaterThanOrEqual(43.5)
      await page.keyboard.press('Escape')
      await expect(dialog(page)).toBeHidden()
    }

    // Cancel closes it and moves nothing, and says so - silence would leave
    // a screen-reader user unsure whether they had just travelled.
    await clickMap(page, 0.42, 0.34)
    await expect(dialog(page)).toBeVisible()
    await cancelBtn(page).click()
    await expect(dialog(page)).toBeHidden()
    await expect(announcer(page)).toContainText(/Travel cancelled/)
    expect(dist(await walk(page), start)).toBeLessThan(0.01)

    // Escape closes it and moves nothing either, and it closes ONLY the
    // dialog: the game is still running and still on the map.
    await clickMap(page, 0.45, 0.4)
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
    expect(dist(await walk(page), start)).toBeLessThan(0.01)
    await expect(hud(page)).toContainText('map view')

    // And a question about a spot on the map cannot outlive the map.
    await clickMap(page, 0.42, 0.34)
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press('KeyM')
    await expect(hud(page)).toContainText('street view')
    await expect(dialog(page)).toBeHidden()
    await expect(teleportBtn(page)).toBeHidden()
    expect(dist(await walk(page), start)).toBeLessThan(0.01)
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
    expect(await clickAndTravel(page, 0.42, 0.34)).toBe(true)
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

    expect(await clickAndTravel(page, 0.45, 0.4)).toBe(true)
    await expect(announcer(page)).toContainText(/Teleported /)
    await page.waitForTimeout(600)

    const spoken = await page.evaluate(() => window.__cwSpoken)
    // Exactly one sentence about the journey, and it is the one the live
    // region is left holding.
    const teleportLines = spoken.filter((s) => s.startsWith('Teleported '))
    expect(teleportLines).toHaveLength(1)
    expect(spoken.at(-1)).toBe(teleportLines[0])
  })

  test('★★ the circle marks the asked spot, and retires either way (CW-61)', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    const circle = () =>
      page.evaluate(() => {
        const p = window.__cityWalkGame.pickMark
        const core = p.children[0]
        return {
          visible: p.visible,
          x: p.position.x,
          y: p.position.y,
          scale: p.scale.x,
          markerScale: window.__cityWalkGame.marker.scale.x,
          coreHex: core ? core.material.color.getHexString() : null,
          coreDepthTest: core ? core.material.depthTest : null,
        }
      })

    await openMap(page)
    expect((await circle()).visible, 'the circle showed with nothing asked').toBe(
      false
    )

    await clickMap(page, 0.42, 0.34)
    await expect(dialog(page)).toBeVisible()
    const open = await circle()
    expect(open.visible).toBe(true)

    // ★ IT STANDS ON THE LANDING, NOT ON THE CLICK. The sentence beside it
    // describes where you would arrive - findLandingNear snaps to a street -
    // so a mark at the raw pointer position would contradict the words.
    const landing = await page.evaluate(() => {
      const t = window.__cityWalkGame
      return { x: t.pickMark.position.x, y: t.pickMark.position.y }
    })
    await goBtn(page).click()
    await expect(dialog(page)).toBeHidden()
    const arrived = await walk(page)
    expect(Math.hypot(arrived.x - landing.x, arrived.y - landing.y)).toBeLessThan(
      0.01
    )

    // ★★ THE HOLE IS THE MARK, and this pins it. The circle shipped first as
    // a bare bright outline and was INVISIBLE in colour, HC-dark and
    // HC-light - those palettes fill the map with white and grey glyphs, so
    // a white ring is a white thing among white things. Exact black is the
    // one value the converter renders as an empty cell (CW-5), and an empty
    // patch inside a mark is a footprint no building in any palette has.
    expect(open.coreHex, 'the circle lost its exact-black core').toBe('000000')
    expect(open.coreDepthTest, 'the core can be occluded by a building').toBe(
      false
    )

    // One shared scale with the player's mark: two marks that mean one thing
    // between them cannot drift apart in size.
    expect(open.scale).toBeCloseTo(open.markerScale, 6)

    // Travel retired it, because the walker is standing there now.
    expect((await circle()).visible).toBe(false)

    // Cancel retires it too, and so does leaving the map.
    await clickMap(page, 0.5, 0.5)
    await expect(dialog(page)).toBeVisible()
    expect((await circle()).visible).toBe(true)
    await cancelBtn(page).click()
    expect((await circle()).visible).toBe(false)

    await clickMap(page, 0.45, 0.45)
    await expect(dialog(page)).toBeVisible()
    expect((await circle()).visible).toBe(true)
    await page.keyboard.press('KeyM')
    await expect(hud(page)).toContainText('street view')
    expect(
      (await circle()).visible,
      'a map mark followed the player into the street'
    ).toBe(false)
  })

  test('★★ the dialog names a REAL corner, at real corners (CW-61)', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await launchGame(page)
    await enterCity(page)
    await openMap(page)

    // ★ THE CORNERS ARE FOUND BY CROSSING THE ROAD GRAPH WITH ITSELF, not
    // chosen by hand. A hand-picked corner proves that one corner works; the
    // claim this sentence makes is about the city. Seattle's extract has
    // 1,661 crossings of two differently-named vehicle streets.
    const junctions = await page.evaluate(() => {
      const g = window.__cityWalkGame
      const roads = (g.model.roads ?? []).filter(
        (r) => typeof r?.name === 'string' && r.name !== ''
      )
      const STREETY = new Set([
        'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
        'tertiary_link', 'residential', 'unclassified', 'living_street',
        'service',
      ])
      const cross = (a, b, c, d, e, f, gg, h) => {
        const r1x = c - a, r1y = d - b, r2x = gg - e, r2y = h - f
        const den = r1x * r2y - r1y * r2x
        if (den === 0) return null
        const t = ((e - a) * r2y - (f - b) * r2x) / den
        const u = ((e - a) * r1y - (f - b) * r1x) / den
        if (t < 0 || t > 1 || u < 0 || u > 1) return null
        return { x: a + t * r1x, y: b + t * r1y }
      }
      const out = []
      for (let i = 0; i < roads.length && out.length < 300; i++) {
        if (!STREETY.has(roads[i].kind)) continue
        for (let j = i + 1; j < roads.length && out.length < 300; j++) {
          if (!STREETY.has(roads[j].kind)) continue
          if (roads[j].name === roads[i].name) continue
          const A = roads[i].points ?? []
          const B = roads[j].points ?? []
          for (let m = 1; m < A.length; m++) {
            for (let n = 1; n < B.length; n++) {
              const p = cross(
                A[m - 1][0], A[m - 1][1], A[m][0], A[m][1],
                B[n - 1][0], B[n - 1][1], B[n][0], B[n][1]
              )
              if (p) out.push({ ...p, a: roads[i].name, b: roads[j].name })
              if (out.length >= 300) break
            }
          }
        }
      }
      const step = Math.max(1, Math.floor(out.length / 6))
      const picked = out.filter((_, k) => k % step === 0).slice(0, 6)
      // ★ THE ARMS OF THE JUNCTION, not the pair that happened to be
      // enumerated. 8th Avenue, Olive Way and Howell Street all meet at one
      // point, and which TWO the dialog names there is a ranking detail; that
      // both are streets which genuinely meet there is the claim.
      for (const j of picked) {
        const arms = new Set()
        for (const road of roads) {
          if (!STREETY.has(road.kind)) continue
          const pts = road.points ?? []
          for (let m = 1; m < pts.length; m++) {
            const [ax, ay] = pts[m - 1]
            const [bx, by] = pts[m]
            const vx = bx - ax
            const vy = by - ay
            const L = vx * vx + vy * vy
            let t = L > 0 ? ((j.x - ax) * vx + (j.y - ay) * vy) / L : 0
            t = Math.max(0, Math.min(1, t))
            const dx = j.x - (ax + t * vx)
            const dy = j.y - (ay + t * vy)
            if (dx * dx + dy * dy <= 4) arms.add(road.name)
          }
        }
        j.arms = [...arms]
      }
      return picked
    })

    expect(
      junctions.length,
      'no street crossings found - the probe, not the feature, is broken'
    ).toBeGreaterThanOrEqual(4)

    for (const j of junctions) {
      await page.evaluate(
        ({ x, y }) => {
          const c = window.__cityWalkGame.mapCam
          c.centerX = x
          c.centerY = y
          c.follow = false
        },
        { x: j.x, y: j.y }
      )
      await page.keyboard.press('KeyJ')
      await expect(page.locator('#cityWalkTravelDialog')).toBeVisible()
      const said = await page.locator('#cityWalkTravelWhere').innerText()

      // It names TWO streets, in the on/near vocabulary the rest of the
      // game uses...
      const pair = said.match(/^(On|Near) (.+) and (.+)\.$/)
      expect(pair, `at ${j.a} x ${j.b} it said: ${said}`).not.toBeNull()
      // ...and both of them genuinely meet at this point. A cycletrack
      // running beside its own avenue, a plaza, or a street half a block
      // away would all fail here, and each of the three is something the
      // index really does offer.
      expect(j.arms, `at ${j.a} x ${j.b}`).toContain(pair[2])
      expect(j.arms, `at ${j.a} x ${j.b}`).toContain(pair[3])
      expect(pair[2]).not.toBe(pair[3])

      await page.keyboard.press('Escape')
      await expect(page.locator('#cityWalkTravelDialog')).toBeHidden()
    }
  })

  test('★★ mid-block it names ONE street rather than inventing a corner (CW-61)', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await launchGame(page)
    await enterCity(page)
    await openMap(page)

    // The half of the claim that is easy to get wrong. Half a block along a
    // street there IS a second name in the index - it is just half a block
    // away, and calling it a corner would be a lie a blind traveler has no
    // way to catch.
    const spots = await page.evaluate(() => {
      const g = window.__cityWalkGame
      const out = []
      // ★ THE FIRST VERSION OF THIS ASKED FOR 140 m SEGMENTS AND FOUND
      // NONE. OSM splits a way at every junction and a downtown Seattle
      // block is about eighty metres, so nothing is that long. Sixty is
      // enough: the midpoint of a 60 m segment is 30 m from either end,
      // which is well outside the twelve-metre junction radius.
      for (const road of g.model.roads ?? []) {
        if (out.length >= 6) break
        if (typeof road?.name !== 'string' || road.name === '') continue
        const pts = road.points ?? []
        for (let i = 1; i < pts.length && out.length < 6; i++) {
          const [ax, ay] = pts[i - 1]
          const [bx, by] = pts[i]
          if (Math.hypot(bx - ax, by - ay) < 60) continue
          out.push({
            x: (ax + bx) / 2,
            y: (ay + by) / 2,
            name: road.name,
          })
        }
      }
      return out
    })

    expect(spots.length, 'no long street segments found').toBeGreaterThanOrEqual(3)

    let single = 0
    for (const s of spots) {
      await page.evaluate(
        ({ x, y }) => {
          const c = window.__cityWalkGame.mapCam
          c.centerX = x
          c.centerY = y
          c.follow = false
        },
        { x: s.x, y: s.y }
      )
      await page.keyboard.press('KeyJ')
      if (!(await page.locator('#cityWalkTravelDialog').isVisible())) continue
      const said = await page.locator('#cityWalkTravelWhere').innerText()
      if (/^(On|Near) [^.]+\.$/.test(said)) single++
      // Whatever it says, it may never name a street twice over: "4th Avenue
      // and 4th Avenue Cycletrack" is a street beside itself, not a corner.
      const pair = said.match(/^(?:On|Near) (.+) and (.+)\.$/)
      if (pair) {
        const [, a, b] = pair
        expect(
          b.startsWith(a) || a.startsWith(b),
          `named a street beside itself: ${said}`
        ).toBe(false)
      }
      await page.keyboard.press('Escape')
      await expect(page.locator('#cityWalkTravelDialog')).toBeHidden()
    }

    // ★ NON-VACUITY. If every mid-block probe happened to land on a corner
    // this case would prove nothing at all, so it insists that most of them
    // did not.
    expect(
      single,
      'no mid-block spot named a single street - this case measured nothing'
    ).toBeGreaterThanOrEqual(Math.ceil(spots.length / 2))
  })

  test('axe: the map view, and the travel dialog open over it (CW-61)', async ({
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

    // The dialog is a surface that floats over the map with its own heading,
    // its own description and two buttons. axe is blind to occlusion, which
    // is why the photographs exist - but it is not blind to a panel whose
    // name never reaches it, and that is what this asks about.
    await clickMap(page, 0.42, 0.34)
    await expect(dialog(page)).toBeVisible()
    await cancelBtn(page).hover()
    const openResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .include('#cityWalkLayer')
      .analyze()
    expectOnlyAllowedViolations(openResults)

    // And the surface really is labelled by its own heading and described by
    // its own sentence, which is what a screen reader reads on arrival.
    await expect(dialog(page)).toHaveAttribute(
      'aria-labelledby',
      'cityWalkTravelTitle'
    )
    await expect(dialog(page)).toHaveAttribute(
      'aria-describedby',
      'cityWalkTravelWhere'
    )
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
