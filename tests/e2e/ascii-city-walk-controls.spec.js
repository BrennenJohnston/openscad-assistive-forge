import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
  expectOnlyAllowedViolations,
  useCityWalkFixtures,
  launchGame,
  hudHeading,
  enterCity,
} from './helpers/city-walk.js'

useCityWalkFixtures()

/**
 * ASCII City Walk - the control surfaces: the mouse-only toolbar a pointer
 * user drives the whole game from, and the keys that reach the same toggles.
 *
 * Split out of ascii-city-walk.spec.js; see helpers/city-walk.js for why.
 */

test.describe('ASCII City Walk — the mouse-only toolbar (CW-15)', () => {
  const announcer = (page) => page.locator('#cityWalkAnnouncer')
  const btn = (page, id) => page.locator('#' + id)

  const walkPos = (page) =>
    page.evaluate(() => {
      const w = window.__cityWalkGame?.walkState
      return w ? { x: w.x, y: w.y } : null
    })

  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

  /**
   * Watch the walk from INSIDE the page and report METRES PER SECOND over a
   * leg that is gated by the game's own frames.
   *
   * Two things had to be true at once, and getting either alone is what made
   * earlier versions of this lie.
   *
   * IT CANNOT BE A WALL-CLOCK HOLD. The game only moves inside animation
   * frames, and a loaded runner can render NONE inside a 700 ms window - which
   * is exactly how the first version went red on Edge in CI while passing
   * three times over locally. So the leg is gated on frames: it closes itself
   * at `sampleFrames` frames that actually moved the walker, inside the same
   * callback that counts them. Closing it from the test side cannot work,
   * because the decision would arrive through a poll and a poll observes the
   * counter whenever it happens to run - measured at CW-54's frame rate, two
   * legs asked for six frames each came back with 33 and 18.
   *
   * ★ BUT THE QUANTITY CANNOT BE METRES PER FRAME. This watcher is a SEPARATE
   * requestAnimationFrame from the one the game steps the walker in, and two
   * rAF callbacks interleave in an order nobody controls (CW-53 paid for that
   * lesson from the other direction). A frame this watcher misses still has
   * its ground counted, on the next tick, as if it were one frame's worth - so
   * per-frame reads high exactly when the watcher is being starved. MEASURED:
   * with legs matched to the frame, a real 2.2x sprint read 0.068 m/frame
   * against a stroll's 0.091, four runs out of four, the comparison upside
   * down and perfectly stable.
   *
   * Distance and elapsed time are taken from the SAME callback, so a missed
   * tick contributes both its metres and its milliseconds to the next sample
   * and the ratio survives. Metres per second is also the quantity a player
   * experiences, which is the thing the toggle claims to change.
   *
   * The first moving frame is thrown away: its dt spans the mouse-down round
   * trip rather than a frame of play.
   */
  const watchLeg = (page, sampleFrames) =>
    page.evaluate((target) => {
      const w = window.__cityWalkGame.walkState
      const s = {
        frames: 0,
        dist: 0,
        px: w.x,
        py: w.y,
        stop: false,
        target,
        t0: 0,
        t1: 0,
        done: false,
      }
      window.__cwLeg = s
      const tick = (now) => {
        if (s.stop) return
        const d = Math.hypot(w.x - s.px, w.y - s.py)
        // CW-81: count only STEADY frames. The walk ramp means the first
        // quarter second moves at a rising fraction of the claimed speed,
        // and the decel glide after a released hold is still movement - a
        // leg that starts while the previous leg's glide is dying samples
        // decaying scales and read a real 1.6x sprint as 1.01x (2.08 vs
        // 2.10 m/s, one board in two). The toggle's claim is about the
        // steady stride, so the leg waits for the ramp to be full.
        const steady = (window.__cityWalkGame.walkRamp ?? 1) >= 1
        if (d > 0 && steady) {
          if (!s.t0) {
            s.t0 = now
          } else if (s.frames < s.target) {
            s.dist += d
            s.frames++
            s.t1 = now
          }
        }
        if (s.frames >= s.target) s.done = true
        s.px = w.x
        s.py = w.y
        window.__cwLegTick = requestAnimationFrame(tick)
      }
      window.__cwLegTick = requestAnimationFrame(tick)
    }, sampleFrames)

  /** Settle function: hold until the leg has the sample it asked for. */
  const untilLegFull = (page) => async () => {
    await expect
      .poll(() => page.evaluate(() => window.__cwLeg?.done === true), {
        timeout: 20000,
      })
      .toBe(true)
  }

  const readLeg = (page) =>
    page.evaluate(() => {
      window.__cwLeg.stop = true
      cancelAnimationFrame(window.__cwLegTick)
      const { frames, dist, t0, t1 } = window.__cwLeg
      const secs = (t1 - t0) / 1000
      return { frames, secs, perSecond: secs > 0 ? dist / secs : 0 }
    })

  /**
   * Point the walker down a corridor the game's OWN collision grid says is
   * clear, and report how far it runs. Any test that compares how far two
   * holds travelled needs this: a leg that runs into a wall reads as slow, and
   * at the CW-48 speeds a leg covers enough ground to find one. Returns 0 when
   * the spawn has no clear run at all, which is a reason to skip rather than
   * to measure noise.
   */
  const faceClearRun = (page, metres) =>
    page.evaluate((wanted) => {
      const g = window.__cityWalkGame
      if (!g?.collision) return 0
      const w = g.walkState
      const r = 0.3 // PLAYER_RADIUS_M: the body, not just the centre
      const blocked = (x, y) =>
        g.collision.isBlocked(x, y) ||
        g.collision.isBlocked(x + r, y) ||
        g.collision.isBlocked(x - r, y) ||
        g.collision.isBlocked(x, y + r) ||
        g.collision.isBlocked(x, y - r)
      let best = 0
      let bestHeading = w.headingRad
      for (let deg = 0; deg < 360; deg += 5) {
        const h = (deg * Math.PI) / 180
        const s = Math.sin(h)
        const c = Math.cos(h)
        let run = 0
        while (run < wanted && !blocked(w.x + s * (run + 0.25), w.y + c * (run + 0.25)))
          run += 0.25
        if (run > best) {
          best = run
          bestHeading = h
        }
        if (best >= wanted) break
      }
      w.headingRad = bestHeading
      return best
    }, metres)

  /** A counter that ticks with the game's own render loop. */
  const startFrameCounter = (page) =>
    page.evaluate(() => {
      window.__cwFrames = 0
      const tick = () => {
        window.__cwFrames++
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })

  const frameCount = (page) => page.evaluate(() => window.__cwFrames ?? 0)

  /** Wait until the game has rendered n more animation frames. */
  async function waitForFrames(page, n) {
    const from = await frameCount(page)
    await expect
      .poll(() => frameCount(page), { timeout: 20000 })
      .toBeGreaterThanOrEqual(from + n)
  }

  /**
   * Press and hold a toolbar button with the real mouse until `settle`
   * resolves, then release and park the pointer clear of everything.
   *
   * NEVER hold for a wall-clock duration and then assert. The game only
   * moves inside animation frames, and a loaded CI runner can render NONE
   * inside a 700 ms window - which is exactly how the first version of this
   * suite went red on Edge in CI while passing three times over locally, on
   * the same browser, and again under a 25x CPU throttle. Parking the mouse
   * matters too: Playwright leaves it where it last acted, and an overlay
   * flow silently hovers whatever is under it.
   */
  async function holdButton(page, id, settle) {
    await btn(page, id).hover()
    await page.mouse.down()
    try {
      await settle()
    } finally {
      await page.mouse.up()
      await page.mouse.move(2, 2)
    }
  }

  test('a mouse alone walks, turns, and opens the map', async ({ page }) => {
    await launchGame(page)
    await enterCity(page)
    await expect(page.locator('#cityWalkToolbar')).toBeVisible()
    await startFrameCounter(page)
    await waitForFrames(page, 3)

    const start = await walkPos(page)
    await holdButton(page, 'cityWalkCamPanUp', () =>
      expect
        .poll(async () => distance(start, await walkPos(page)), {
          timeout: 15000,
        })
        .toBeGreaterThan(0.5)
    )

    // Holding Turn right moves the compass off the spawn heading - to ANY
    // other sector. Exact label, not substring (see hudHeading). CW-44:
    // the spawn faces the clearest street, so the reference is captured,
    // never assumed to be north.
    const restHeading = await hudHeading(page)
    await holdButton(page, 'cityWalkCamRotateRight', () =>
      expect
        .poll(() => hudHeading(page), { timeout: 15000 })
        .not.toBe(restHeading)
    )

    await btn(page, 'cityWalkMapBtn').click()
    await expect(btn(page, 'cityWalkMapBtn')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')
    await expect(announcer(page)).toHaveText(
      /The toolbar now shows the map buttons/
    )

    await btn(page, 'cityWalkMapBtn').click()
    await expect(btn(page, 'cityWalkMapBtn')).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'street view'
    )
  })

  test('the map buttons arrive with the map, and the street buttons leave', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    await startFrameCounter(page)
    await waitForFrames(page, 3)

    // CW-35 retired the toolbar's Camera and Move groups into the Camera
    // panel, so what swaps here is only what is still ON the toolbar: Fast
    // and Rain mean nothing overhead, and the map's own three arrive.
    const streetOnly = ['cityWalkFastBtn', 'cityWalkRainBtn']
    const mapOnly = [
      'cityWalkCenterBtn',
      'cityWalkZoomOutBtn',
      'cityWalkZoomInBtn',
      // CW-60: the map style button lives in the same zone, last.
      'cityWalkMapStyleBtn',
    ]

    for (const id of streetOnly) await expect(btn(page, id)).toBeVisible()
    for (const id of mapOnly) await expect(btn(page, id)).toBeHidden()

    // The panel does NOT swap. It stays put and re-labels, because the same
    // D-pad drives both views (CW-Q32) - and a control that vanished under
    // the pointer would cost the map the only mouse route it has to pan.
    await expect(btn(page, 'cityWalkCamPanUp')).toHaveAttribute(
      'aria-label',
      'Walk forward'
    )

    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')
    for (const id of streetOnly) await expect(btn(page, id)).toBeHidden()
    for (const id of mapOnly) await expect(btn(page, id)).toBeVisible()

    await expect(btn(page, 'cityWalkCamPanUp')).toBeVisible()
    // CW-60: this pad panned the map exactly as the one above it did, which
    // is four buttons for a job four other buttons were already doing. Over
    // the map it is the style pad now; the Rotate pad above still pans, so
    // the mouse route to panning is untouched.
    await expect(btn(page, 'cityWalkCamPanUp')).toHaveAttribute(
      'aria-label',
      'Previous map style'
    )
    // Face north/east/south/west have no meaning with no walker on screen,
    // so they stand down rather than take a second job (CW-35 P3).
    await expect(btn(page, 'cityWalkCamViewFront')).toBeHidden()

    // The map buttons drive the map: held Zoom in zooms exponentially…
    const zoom = () => page.evaluate(() => window.__cityWalkGame.mapCam.zoom)
    await holdButton(page, 'cityWalkZoomInBtn', () =>
      expect.poll(zoom, { timeout: 15000 }).toBeGreaterThan(1.2)
    )
    await expect(page.locator('#cityWalkHudStatus')).not.toContainText(
      'zoom 1.0x'
    )

    // …a pan breaks follow mode, and Center on you restores it.
    const follow = () =>
      page.evaluate(() => window.__cityWalkGame.mapCam.follow)
    await holdButton(page, 'cityWalkCamRotateRight', () =>
      expect.poll(follow, { timeout: 15000 }).toBe(false)
    )

    // The 250 ms minimum step keeps the pan running for a moment after
    // the release - and a pan is what turns follow OFF - so let it finish
    // before asking Center on you to turn it back on.
    await page.waitForTimeout(400)
    await waitForFrames(page, 2)

    await btn(page, 'cityWalkCenterBtn').click()
    await expect(announcer(page)).toHaveText(/Map centered on you/)
    expect(await follow()).toBe(true)

    // Back on the street the swap reverses, and the toolbar says so.
    await btn(page, 'cityWalkMapBtn').click()
    await expect(announcer(page)).toHaveText(
      /The toolbar now shows the walking buttons/
    )
    for (const id of streetOnly) await expect(btn(page, id)).toBeVisible()
    for (const id of mapOnly) await expect(btn(page, id)).toBeHidden()
    await expect(btn(page, 'cityWalkCamViewFront')).toBeVisible()
  })

  test('★★ switching view moves NO shared toolbar button (CW-59)', async ({
    page,
  }) => {
    // ★★ THE DEFECT THIS REPLACES WAS MEASURED, NOT IMAGINED. On a 1280px
    // window every one of the NINE shared buttons moved when the view
    // switched - up to 186 px - and they moved in BOTH directions: Slower
    // went 138 px left while Previous went 138 px right. A player reaching
    // for Larger in the street found Photo under the cursor on the map.
    //
    // Two things caused it together, and only fixing both works. View-only
    // buttons sat INSIDE the group they belonged to by meaning, so hiding
    // them changed the width of a group in the middle of the strip; and the
    // strip CENTRED itself, which turns any width change anywhere into a
    // position change everywhere. The buttons that moved never changed at all.
    await launchGame(page)
    await enterCity(page)

    const positions = () =>
      page.evaluate(() =>
        Object.fromEntries(
          [...document.querySelectorAll('#cityWalkToolbar button')]
            .filter((b) => !b.hidden)
            .map((b) => {
              const r = b.getBoundingClientRect()
              return [b.id, { x: Math.round(r.left), y: Math.round(r.top) }]
            })
        )
      )

    /**
     * ★ "PAST" CANNOT BE A BARE x ONCE THE STRIP WRAPS (CW-60). The fifth
     * map-only button no longer fits on one row between about 1280px and
     * 1365px, so the view zone takes a line of its own - and the strip is
     * bottom-anchored, so the new line goes ABOVE (flex-wrap: wrap-reverse,
     * which is what keeps the shared row where it was; without it the nine
     * shared buttons measured a 50px move, y=820 to y=770, on a view switch).
     *
     * What the zone claim actually means is that nothing view-only sits in
     * the shared row ahead of a shared button. That is neutral about which
     * way lines stack, and the 1600px pass below - asserted to be ONE row -
     * is what keeps it from going soft.
     */
    const past = (a, b) => a.y !== b.y || a.x > b.x

    for (const width of [1600, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await page.waitForTimeout(200)

      const street = await positions()
      await page.keyboard.press('KeyM')
      await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')
      const map = await positions()

      // Every button visible in BOTH views is a shared button, and every one
      // of them must be where it was. Nine of them, so this is not vacuous -
      // a guard that found no shared buttons would pass proving nothing.
      const shared = Object.keys(street).filter((id) => id in map)
      expect(shared.length, `${width}px`).toBeGreaterThanOrEqual(9)
      for (const id of shared) {
        expect(map[id], `${id} moved at ${width}px`).toEqual(street[id])
      }

      // And the view zone really is the far end: every view-only button
      // comes after every shared one. That is WHY the shared zone cannot
      // move, so it is worth asserting rather than trusting.
      const mapOnly = Object.keys(map).filter((id) => !(id in street))
      expect(mapOnly.length, `${width}px`).toBeGreaterThanOrEqual(5)
      for (const id of mapOnly) {
        for (const s of shared) {
          expect(
            past(map[id], map[s]),
            `${id} is not past ${s} at ${width}px`
          ).toBe(true)
        }
      }

      // ★ AND AT 1600 THE WHOLE STRIP IS ONE ROW, which is what makes the
      // pass above an x comparison rather than a free one. Without this the
      // wrapped case could pass on nothing but "it is on another line".
      const rows = new Set(Object.values(map).map((p) => p.y))
      if (width === 1600) {
        expect(rows.size, 'the 1600px pass wrapped, so it proved less').toBe(1)
      } else {
        // And where it does wrap, the shared row is still ONE row: the zone
        // took the new line by itself and took nothing with it.
        expect(rows.size).toBe(2)
        expect(new Set(shared.map((id) => map[id].y)).size).toBe(1)
      }

      await page.keyboard.press('KeyM')
      await expect(page.locator('#cityWalkHudStatus')).toContainText(
        'street view'
      )
    }
  })

  test('★★ a drag pans the map, and the threshold keeps click and drag apart (CW-59)', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')

    const cam = () =>
      page.evaluate(() => {
        const c = window.__cityWalkGame.mapCam
        return { x: c.centerX, y: c.centerY, follow: c.follow }
      })
    const box = await page.locator('#cityWalkViewport').boundingBox()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    const drag = async (dx, dy, steps) => {
      await page.mouse.move(cx, cy)
      await page.mouse.down()
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(cx + (dx * i) / steps, cy + (dy * i) / steps)
      }
      await page.mouse.up()
    }

    // Grab and drag: the world point under the cursor stays under it, so
    // dragging RIGHT walks the camera centre WEST. The sign is the whole
    // difference between moving a map and nudging a camera, and getting it
    // backwards would still have "panned".
    const before = await cam()
    expect(before.follow).toBe(true)
    await drag(200, 0, 10)
    const afterX = await cam()
    expect(afterX.x).toBeLessThan(before.x - 100)
    // Dragging DOWN pulls northern ground into view: screen y grows down and
    // world y grows north, so this one flips.
    await drag(0, 150, 10)
    const afterY = await cam()
    expect(afterY.y).toBeGreaterThan(afterX.y + 100)
    // Any manual pan breaks player-follow, exactly as the keys and buttons
    // do. Without this the next frame snaps the map back and the drag looks
    // broken rather than ignored.
    expect(afterY.follow).toBe(false)

    // ★★ THE BOUNDARY, AND CW-61'S MODAL NOW HANGS ON IT, exactly as this
    // case predicted it would. Under DRAG_THRESHOLD_PX the press was a click:
    // the map must not move AND the travel dialog must open. Over it the
    // press was a drag: the map must move AND the dialog must stay shut.
    // Both halves on both sides, because a boundary asserted from one side
    // only cannot tell a threshold from a control that never fires.
    const dialog = page.locator('#cityWalkTravelDialog')

    const wobbleFrom = await cam()
    await drag(2, 0, 2)
    const wobbleTo = await cam()
    expect(wobbleTo.x).toBe(wobbleFrom.x)
    expect(wobbleTo.y).toBe(wobbleFrom.y)
    await expect(dialog).toBeVisible()

    // Escape it before dragging again: the dialog sits over the middle of
    // the map, which is where this test grabs from.
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    const dragFrom = await cam()
    await drag(6, 0, 3)
    const dragTo = await cam()
    expect(dragTo.x).not.toBe(dragFrom.x)
    await expect(dialog).toBeHidden()
  })

  test('★ an over-threshold drag pans and never travels (CW-59, CW-61)', async ({
    page,
  }) => {
    // ★★ THIS CASE OUTLIVED THE MODE IT WAS WRITTEN AGAINST, AND THAT IS THE
    // FINDING. It used to ARM pin mode first, because under CW-40 a click
    // only acted on an armed map. CW-61 retired the arming - every click
    // asks now - and the retirement sweep MISSED this case, because it
    // reached for the mode through its OBSERVABLE (`aria-pressed` on the
    // Teleport button) rather than through any of the names the sweep
    // grepped for. It went red on BOTH engines, which is what said it was a
    // real miss and not a runner.
    //
    // Sweep a retired feature by what it LOOKS like, not only by what it is
    // called.
    await launchGame(page)
    await enterCity(page)
    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')

    const walkerAt = () =>
      page.evaluate(() => {
        const w = window.__cityWalkGame.walkState
        return { x: w.x, y: w.y }
      })
    const box = await page.locator('#cityWalkViewport').boundingBox()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    // ★ THIS IS WHY THE TELEPORT MOVED TO THE POINTER-UP. It used to fire on
    // the way DOWN, and the press that begins a pan is the same press - so
    // the map would have jumped away the instant anyone tried to drag it.
    const before = await walkerAt()
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    for (let i = 1; i <= 10; i++) await page.mouse.move(cx + i * 20, cy)
    await page.mouse.up()
    expect(await walkerAt()).toEqual(before)
    // Nor does it even ASK: under CW-61 an over-threshold press is a drag
    // and a drag never clicks, so there is no question to dismiss either.
    await expect(page.locator('#cityWalkTravelDialog')).toBeHidden()

    // And a real click still asks, and answering it still travels, so the
    // drag did not cost the feature.
    await page.mouse.move(cx + 40, cy + 30)
    await page.mouse.down()
    await page.mouse.up()
    await expect(page.locator('#cityWalkTravelDialog')).toBeVisible()
    await page.locator('#cityWalkTravelGoBtn').click()
    await expect(page.locator('#cityWalkTravelDialog')).toBeHidden()
    await expect.poll(async () => {
      const now = await walkerAt()
      return Math.hypot(now.x - before.x, now.y - before.y)
    }).toBeGreaterThan(1)
  })

  test('★★ W A S D pan the map, exactly as the arrows do (CW-59, a PIN)', async ({
    page,
  }) => {
    // ★★ THIS PASSES ON BASE, AND SAYING SO IS THE POINT. The plan for this
    // release assumed W A S D did not pan the map and had to be made to.
    // They always did: KeyW binds the same 'forward' action ArrowUp binds,
    // and the map's panY reads that action, not the key. Measured before any
    // code changed - W moved the camera 302 m where ArrowUp moved it 302 m,
    // and A, S and D matched their arrows too.
    //
    // So this is NOT proof of a fix. It is a pin against a binding that was
    // never written down, and the honest record of an inverted premise: what
    // CW-59 actually changed was the SENTENCE that told players arrows only.
    await launchGame(page)
    await enterCity(page)
    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')

    const centre = () =>
      page.evaluate(() => ({
        x: window.__cityWalkGame.mapCam.centerX,
        y: window.__cityWalkGame.mapCam.centerY,
      }))
    // Park the camera and stop it following, so the walk cannot move it.
    await page.evaluate(() => {
      const c = window.__cityWalkGame.mapCam
      c.centerX = 0
      c.centerY = 0
      c.follow = false
    })

    // Held until the map has MOVED, never for a number of milliseconds: the
    // map only pans inside animation frames, and a loaded runner can render
    // none inside a window (the trap this round has paid for four times).
    const panBy = async (key) => {
      await page.evaluate(() => {
        const c = window.__cityWalkGame.mapCam
        c.centerX = 0
        c.centerY = 0
        c.follow = false
      })
      await page.keyboard.down(key)
      await expect
        .poll(async () => {
          const c = await centre()
          return Math.hypot(c.x, c.y)
        }, { timeout: 15000 })
        .toBeGreaterThan(50)
      await page.keyboard.up(key)
      return centre()
    }

    const w = await panBy('KeyW')
    expect(w.y).toBeGreaterThan(50)
    expect(Math.abs(w.x)).toBeLessThan(1)

    const s = await panBy('KeyS')
    expect(s.y).toBeLessThan(-50)

    const a = await panBy('KeyA')
    expect(a.x).toBeLessThan(-50)

    const d = await panBy('KeyD')
    expect(d.x).toBeGreaterThan(50)
  })

  test('Enter on a hold button takes one step and then stops', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    await startFrameCounter(page)
    await waitForFrames(page, 3)

    const before = await walkPos(page)
    await btn(page, 'cityWalkCamPanUp').focus()
    await expect(btn(page, 'cityWalkCamPanUp')).toBeFocused()

    // ★ THE DISTANCE IS A FRAME-RATE READING, NOT A PROMISE. The app
    // stretches a keyboard activation to a fixed TOOLBAR_STEP_MS window (250
    // ms), so how far the walker gets inside it depends entirely on how many
    // frames render there: about fifteen at 60 fps, but ONE on a loaded
    // machine, and one frame is 4.8 m/s / 60 = 0.08 m. Asserting 0.15 m went
    // red on Firefox at CW-55 and again on Chromium at CW-57 - two engines,
    // so it is the assertion that is wrong and not the browser. What the app
    // actually promises is the two halves in this test's name: it takes a
    // step, and the step ENDS. Both are asserted; the metres are not.
    await page.keyboard.press('Enter')
    await expect
      .poll(async () => distance(before, await walkPos(page)), {
        timeout: 15000,
      })
      .toBeGreaterThan(0.02)

    // A key press has no release, so the step has to end by itself. If it
    // did not, the player would still be walking here. Measured in frames,
    // not milliseconds - a stalled runner would otherwise "prove" it
    // stopped simply by rendering nothing. This is the half that carries the
    // guard, so it is the half that is tight: ten frames of real walking
    // covers about 0.8 m, forty times the tolerance below.
    await page.waitForTimeout(1000)
    await waitForFrames(page, 2)
    const settled = await walkPos(page)
    await waitForFrames(page, 10)
    expect(distance(settled, await walkPos(page))).toBeLessThan(0.02)
  })

  test('the speed, size, level and landmark buttons announce what they did', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    await expect(page.locator('#cityWalkHudStatus')).toContainText('speed 100%')

    await btn(page, 'cityWalkSpeedUpBtn').click()
    await expect(announcer(page)).toHaveText(/Walking speed 125 percent/)
    await expect(page.locator('#cityWalkHudStatus')).toContainText('speed 125%')
    await btn(page, 'cityWalkSpeedDownBtn').click()
    await expect(announcer(page)).toHaveText(/Walking speed 100 percent/)

    // The game opens at the ONE default, 30% (CW-72), in ten-point steps.
    await btn(page, 'cityWalkCharDownBtn').click()
    await expect(announcer(page)).toHaveText(/Character size 20 percent/)
    await btn(page, 'cityWalkCharUpBtn').click()
    await expect(announcer(page)).toHaveText(/Character size 30 percent/)

    await btn(page, 'cityWalkCamReset').click()
    await expect(announcer(page)).toHaveText(/View level/)

    // Landmarks live on the map, so Next opens it exactly as L does.
    await btn(page, 'cityWalkLandmarkNextBtn').click()
    await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')
    await expect(announcer(page)).toHaveText(/Landmark 1 of \d+: /)
    await btn(page, 'cityWalkLandmarkPrevBtn').click()
    await expect(announcer(page)).toHaveText(/Landmark \d+ of \d+: /)
  })

  /**
   * CW-48 rebased the walking-speed scale. The storage key NAME never moved
   * (UF-14); the values under it did, from a 0.5-3.0 multiplier of a 1.6 m/s
   * walk to a 50-300 label. Seeded through addInitScript rather than written
   * by the game and read back: a round trip only ever proves the new format
   * can read its own output, which is not what migration means.
   */
  const withStoredSpeed = async (page, raw) => {
    await page.addInitScript((value) => {
      localStorage.setItem('openscad-forge-city-walk-speed', value)
    }, raw)
    await launchGame(page)
    await enterCity(page)
  }

  test('a speed saved by the old scale comes back rebased', async ({
    page,
  }) => {
    // The old top of the range was 300 percent of 1.6 m/s. That IS the new
    // default: same 4.8 m/s, now announced as 100.
    await withStoredSpeed(page, '3')
    await expect(page.locator('#cityWalkHudStatus')).toContainText('speed 100%')
  })

  test('a speed saved below the rebased range lands on its floor', async ({
    page,
  }) => {
    // An old 100 percent was 1.6 m/s, which is slower than anything this
    // scale offers. It clamps to the floor, and that player comes back
    // walking 2.4 m/s - faster than they left, which is the signed
    // consequence of the rebase rather than a rounding accident.
    await withStoredSpeed(page, '1')
    await expect(page.locator('#cityWalkHudStatus')).toContainText('speed 50%')
  })

  test('Fast is a sticky toggle, because a mouse cannot hold Shift', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    await startFrameCounter(page)
    await waitForFrames(page, 3)

    const fast = btn(page, 'cityWalkFastBtn')
    await expect(fast).toHaveAttribute('aria-pressed', 'false')

    // Both legs are gated on the game's own frames and compared in METRES PER
    // SECOND - see watchLeg for why it has to be both, and why metres per
    // FRAME read a real 2.2x sprint as slower than the stroll.
    //
    // Down a corridor the collision grid says is clear: a leg that runs into a
    // wall reads as slow, and at the CW-48 speeds a leg covers enough ground
    // to find one. That was measured both ways - it made a real sprint look
    // slower than the stroll, and it made a DISABLED sprint pass.
    // Ten sampled frames. Overshoot costs nothing now the leg closes itself,
    // so the sample can be wide enough that no single frame decides the
    // answer, and ten frames of sprint is well under the twelve metres of
    // clear run this skips without.
    const SAMPLE_FRAMES = 10
    const clearRun = await faceClearRun(page, 24)
    test.skip(clearRun < 12, `spawn has only ${clearRun} m of clear run`)

    // CW-81: a leg is longer than its ten sampled frames now - the ramp
    // spends a quarter second below full stride before the steady sample
    // opens, and the released hold glides another quarter second - so two
    // legs walked end to end can outrun the measured corridor, and the
    // second one presses the far wall and dribbles (measured 0.43-0.72 m/s
    // against a 4.80 stroll). Each leg starts from the same corridor mouth.
    const mouth = await page.evaluate(() => {
      const w = window.__cityWalkGame.walkState
      return { x: w.x, y: w.y, headingRad: w.headingRad }
    })
    const backToMouth = async () => {
      await page.evaluate((p) => {
        const g = window.__cityWalkGame
        g.walkState.x = p.x
        g.walkState.y = p.y
        g.walkState.headingRad = p.headingRad
        if (g.surface) g.walkState.groundZ = g.surface.heightAt(p.x, p.y)
      }, mouth)
      await expect
        .poll(() => page.evaluate(() => window.__cityWalkGame.walkRamp))
        .toBe(0)
    }

    const leg = async () => {
      await backToMouth()
      await watchLeg(page, SAMPLE_FRAMES)
      await holdButton(page, 'cityWalkCamPanUp', untilLegFull(page))
      return readLeg(page)
    }

    const strolled = await leg()
    expect(strolled.frames).toBe(SAMPLE_FRAMES)
    expect(strolled.perSecond).toBeGreaterThan(0)

    await fast.click()
    await page.mouse.move(2, 2)
    await expect(fast).toHaveAttribute('aria-pressed', 'true')
    await expect(announcer(page)).toHaveText('Fast walking on.')

    // 1.25x of a real 1.6x still fails loudly at the thing this guards: a
    // toggle that never reaches stepWalk leaves the ratio at exactly 1.0.
    const hurried = await leg()
    expect(hurried.frames).toBe(SAMPLE_FRAMES)
    expect(
      hurried.perSecond,
      `strolled ${strolled.perSecond.toFixed(2)} m/s over ${strolled.secs.toFixed(2)} s, ` +
        `hurried ${hurried.perSecond.toFixed(2)} m/s over ${hurried.secs.toFixed(2)} s`
    ).toBeGreaterThan(strolled.perSecond * 1.25)

    await fast.click()
    await page.mouse.move(2, 2)
    await expect(fast).toHaveAttribute('aria-pressed', 'false')
    await expect(announcer(page)).toHaveText('Fast walking off.')
  })

  test('a click in the toolbar leaves the keyboard working (D-59 pattern)', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    await btn(page, 'cityWalkCamReset').click()
    const focus = await page.evaluate(() => ({
      id: document.activeElement?.id || document.activeElement?.tagName,
      inLayer: Boolean(
        document
          .getElementById('cityWalkLayer')
          ?.contains(document.activeElement)
      ),
    }))
    expect(focus.id).toBe('cityWalkCamReset')
    expect(focus.inLayer).toBe(true)

    const clickHeading = await hudHeading(page)
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(1300)
    await page.keyboard.up('ArrowRight')
    // A ~117 degree turn always leaves a 45 degree compass sector, whatever
    // the CW-44 spawn heading is.
    await expect.poll(() => hudHeading(page)).not.toBe(clickHeading)
  })

  test('a hidden button hands its focus back instead of dropping it', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // Focus a street-only button, then switch views with the key. The
    // button disappears under the focus; if focus fell to <body> every key
    // would die for the rest of the session (D-59).
    //
    // CW-35: Fast, not a camera button. The Camera panel's controls now
    // survive the swap, so the only buttons that can still vanish under a
    // focus ring are the toolbar's own street-only pair.
    await btn(page, 'cityWalkFastBtn').focus()
    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')

    const landed = await page.evaluate(
      () => document.activeElement?.id || document.activeElement?.tagName
    )
    expect(landed).toBe('cityWalkMapBtn')

    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'street view'
    )
  })

  test('the height a session measured does not outlive it', async ({ page }) => {
    await launchGame(page)
    await enterCity(page)

    const measured = () =>
      page.evaluate(() =>
        document
          .getElementById('cityWalkLayer')
          .style.getPropertyValue('--city-walk-toolbar-height')
      )
    expect(parseInt(await measured(), 10)).toBeGreaterThan(40)

    await page.keyboard.press('Escape')
    await expect(page.locator('#cityWalkLayer')).toBeHidden()
    await page.locator('#cityWalkLaunchBtn').click()
    await expect(page.locator('#cityWalkLayer')).toBeVisible()

    // Back on the picker there is no toolbar, and the layer element
    // outlives the session that measured one - so the help panel must not
    // be shortened here by the last strip.
    expect(await measured()).toBe('0px')
  })

  test('the toolbar stays legible at rest and hovered, in every in-game state', async ({
    page,
  }) => {
    // The longest measurement in the lane - four states across three targets,
    // most of them hovered too. Same reason as CW-14's: length, not a step.
    test.setTimeout(180_000)
    // Every interaction below pays a longer action timeout than the 10 s
    // default. That default is a budget for finding and reaching a control,
    // and it is not enough on this page: the city is converted to characters
    // every frame, and on a software-rendering CI runner both a click and a
    // hover have failed at 10 s with Playwright's own log saying the element
    // was already visible and stable - a starved main thread, not a control
    // anyone could not reach (D-79). Nothing being asserted changes.
    const SLOW = { timeout: 45000 }
    await launchGame(page)
    await enterCity(page)

    // Measured against the layer's own background, because the group
    // captions have none of their own - a transparent element reports
    // rgba(0,0,0,0) and would score itself against black by accident.
    // The 30 s timeout is for the RUNNER, not the assertion: this reads
    // static CSS, but CI renders the city through SwiftShader and the
    // converter holds the main thread in long stretches.
    const measure = (locator) =>
      locator.evaluate((el) => {
        const read = (css) =>
          (css.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number)
        const luminance = (rgb) =>
          rgb
            .map((v) => {
              const s = v / 255
              return s <= 0.03928
                ? s / 12.92
                : Math.pow((s + 0.055) / 1.055, 2.4)
            })
            .reduce((sum, c, i) => sum + [0.2126, 0.7152, 0.0722][i] * c, 0)
        const cs = getComputedStyle(el)
        const own = cs.backgroundColor
        const opaque = own && !/rgba\(0, 0, 0, 0\)|transparent/.test(own)
        const background = opaque
          ? own
          : getComputedStyle(document.querySelector('.city-walk-layer'))
              .backgroundColor
        const l1 = luminance(read(cs.color))
        const l2 = luminance(read(background))
        return {
          color: cs.color,
          background,
          ratio:
            Math.round(
              ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100
            ) / 100,
        }
      }, undefined, { timeout: 30000 })

    const check = async (label) => {
      const targets = [
        ['plain button', btn(page, 'cityWalkSpeedDownBtn'), true],
        ['pressed Fast', btn(page, 'cityWalkFastBtn'), true],
        // CW-35: the Camera group retired into the Camera panel, so its
        // caption is gone and Speed's is the one to measure. The panel is a
        // mouse route too now, and its hover pair broke the moment it
        // arrived (black accent-text on the mono hover surface, 1.12:1), so
        // it is measured here rather than trusted.
        ['group caption', page.locator('#cityWalkToolbarSpeedLabel'), false],
        ['camera panel button', btn(page, 'cityWalkCamRotateLeft'), true],
      ]
      for (const [name, locator, hoverable] of targets) {
        for (const state of hoverable ? ['rest', 'hovered'] : ['rest']) {
          if (state === 'hovered') await locator.hover(SLOW)
          else await page.mouse.move(2, 2)
          await page.waitForTimeout(200)
          const m = await measure(locator)
          console.log(
            `[cw15] ${label} / ${name} / ${state}: ${m.color} on ${m.background} = ${m.ratio}:1`
          )
          expect(
            m.ratio,
            `${label} / ${name} / ${state} is ${m.color} on ${m.background} = ${m.ratio}:1`
          ).toBeGreaterThanOrEqual(4.5)
        }
      }
    }

    // Fast is measured in its pressed state, which is the pair CW-14's rule
    // repaints and the one nothing else in the suite covers.
    await btn(page, 'cityWalkFastBtn').click(SLOW)
    await expect(btn(page, 'cityWalkFastBtn')).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    const contrastBtn = page.locator('#cityWalkContrastBtn')
    const themeBtn = page.locator('#cityWalkThemeBtn')

    await themeBtn.click(SLOW) // auto -> light
    await check('mono light, contrast off')
    await contrastBtn.click(SLOW)
    await check('mono light, contrast on')
    await themeBtn.click(SLOW) // light -> dark
    await check('mono dark, contrast on')
    await contrastBtn.click(SLOW)
    await check('mono dark, contrast off')
  })

  test('axe: the in-game layer has no violations with a toolbar button hovered', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    // A hover state is invisible to a scan unless something is hovering
    // (D-55), and the pressed pair is repainted on hover.
    await btn(page, 'cityWalkMapBtn').click()
    await expect(btn(page, 'cityWalkMapBtn')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await btn(page, 'cityWalkMapBtn').hover()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .include('#cityWalkLayer')
      .analyze()
    expectOnlyAllowedViolations(results)
  })
})

test.describe('ASCII City Walk — the Camera panel (CW-35)', () => {
  const btn = (page, id) => page.locator('#' + id)
  const announcer = (page) => page.locator('#cityWalkAnnouncer')

  /**
   * Every control the panel offers, in the order a Tab key would reach
   * them. Sorted by document position, not by the order querySelectorAll
   * happens to return - a panel is nested markup and the two are not the
   * same walk (UF-38).
   */
  const panelControls = (page) =>
    page.evaluate(() => {
      const panel = document.getElementById('cityWalkCameraPanel')
      return [...panel.querySelectorAll('button')]
        .filter((b) => !b.disabled && b.offsetParent !== null)
        .sort((a, b) =>
          a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
            ? -1
            : 1
        )
        .map((b) => b.id)
    })

  test('every panel control is reachable by Tab and names itself', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    const expected = await panelControls(page)
    expect(expected.length).toBeGreaterThan(10)

    // Start from the panel's own first control rather than tabbing in from
    // the page: this asks whether the panel's INTERNAL order is walkable,
    // which is what breaks when a d-pad is laid out by grid area.
    //
    // Only the BUTTONS are checked, in order, because a stop between two of
    // them is not necessarily a fault. Firefox puts the scrollable panel
    // body into the tab order on purpose, so that a keyboard user can
    // scroll it with the arrow keys - which matters here, since the body is
    // exactly what scrolls when high contrast makes the panel too tall for
    // the viewport. Chromium does not. Suppressing it to make the two agree
    // would take that scroll route away from the browser that offers it.
    await btn(page, expected[0]).focus()
    const reached = [expected[0]]
    let last = expected[0]
    for (let i = 0; i < expected.length + 6; i++) {
      if (reached.length === expected.length) break
      await page.keyboard.press('Tab')
      const id = await page.evaluate(() => document.activeElement?.id)
      // A Tab that lands nowhere new means the walk stalled; say where,
      // rather than reporting a mismatched array a dozen entries long.
      expect(id, `Tab ${i + 1} from ${last}`).not.toBe(last)
      last = id
      if (expected.includes(id)) reached.push(id)
    }
    expect(reached).toEqual(expected)

    // An icon-only button is nameless without one (02-accessibility rule 3).
    const unnamed = await page.evaluate(() =>
      [
        ...document
          .getElementById('cityWalkCameraPanel')
          .querySelectorAll('button'),
      ]
        .filter((b) => !(b.getAttribute('aria-label') || b.textContent).trim())
        .map((b) => b.id)
    )
    expect(unnamed).toEqual([])
  })

  test('the view buttons carry the pressed state, in both views', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    const pressed = (id) => btn(page, id).getAttribute('aria-pressed')
    expect(await pressed('cityWalkCamViewBottom')).toBe('true')
    expect(await pressed('cityWalkCamViewTop')).toBe('false')

    await btn(page, 'cityWalkCamViewTop').click()
    await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')
    expect(await pressed('cityWalkCamViewTop')).toBe('true')
    expect(await pressed('cityWalkCamViewBottom')).toBe('false')

    // The key route and the buttons are one state, not two copies of it.
    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'street view'
    )
    expect(await pressed('cityWalkCamViewBottom')).toBe('true')
    expect(await pressed('cityWalkCamViewTop')).toBe('false')
  })

  test('Reset and the standard views work from the keyboard alone', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    const pitch = () =>
      page.evaluate(() => window.__cityWalkGame.walkState.pitchRad)
    const heading = () =>
      page.evaluate(() => window.__cityWalkGame.walkState.headingRad)

    await btn(page, 'cityWalkCamViewDiagonal').focus()
    await page.keyboard.press('Enter')
    await expect(announcer(page)).toHaveText(/Looking up at the towers/)
    expect(await pitch()).toBeGreaterThan(0.5)

    await btn(page, 'cityWalkCamReset').focus()
    await page.keyboard.press('Space')
    await expect(announcer(page)).toHaveText(/View level/)
    expect(Math.abs(await pitch())).toBeLessThan(0.001)

    await btn(page, 'cityWalkCamViewRight').focus()
    await page.keyboard.press('Enter')
    await expect(announcer(page)).toHaveText(/Facing east/)
    expect(Math.abs((await heading()) - Math.PI / 2)).toBeLessThan(0.001)
  })

  test('the panel collapses, says so, and remembers', async ({ page }) => {
    await launchGame(page)
    await enterCity(page)

    const toggle = btn(page, 'cityWalkCameraToggle')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(btn(page, 'cityWalkCamReset')).toBeVisible()

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(btn(page, 'cityWalkCamReset')).toBeHidden()

    // Leaving and re-entering the city builds the panel again from scratch.
    await page.keyboard.press('Escape')
    await expect(page.locator('#cityWalkLayer')).toBeHidden()
    await launchGame(page)
    await enterCity(page)
    await expect(btn(page, 'cityWalkCameraToggle')).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })

  test('a collapsed panel keeps its reopen control, and the keyboard (CW-38)', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // The owner collapsed the panel and could not get it back: layout.css's
    // collapsed rule hid every header action except the FORGE panel's toggle,
    // matched by id, so the game's own reopen button vanished - and the
    // focused button going display:none dropped focus to <body>, outside the
    // layer's key listener, which killed every game key with it.
    const toggle = btn(page, 'cityWalkCameraToggle')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    // The reopen control survives its own collapse: visible, still holding
    // focus, and no smaller than the project's touch target.
    await expect(toggle).toBeVisible()
    await expect(toggle).toBeFocused()
    const min = await page.evaluate(() =>
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--size-touch-target'
        )
      )
    )
    const box = await toggle.boundingBox()
    expect(box.width).toBeGreaterThanOrEqual(min - 0.5)
    expect(box.height).toBeGreaterThanOrEqual(min - 0.5)

    // And the keyboard survives with it: M straight after collapsing must
    // still open the map. This is the regression that made the stow a trap.
    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')

    // Expanding brings the sections back.
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(btn(page, 'cityWalkCamReset')).toBeVisible()
  })

  test('high contrast keeps the whole panel on screen at 1600x900 (CW-38, CW-Q47)', async ({
    page,
  }) => {
    // High contrast grows every control - 44px targets, thicker borders,
    // wider gaps - and before CW-38 the panel's content outgrew its box by
    // 178px at the directive's screen size: Reset View sat below the fold
    // behind a scrollbar the owner never found. Smaller windows may still
    // scroll the body (Firefox tab-stops it by design, and that is its
    // scroll route); at 1600x900 the whole panel must be on screen.
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-high-contrast', 'true')
    })
    await launchGame(page)
    await enterCity(page)

    const overflow = await page.evaluate(() => {
      const body = document.getElementById('cityWalkCameraBody')
      return body.scrollHeight - body.clientHeight
    })
    expect(overflow).toBeLessThanOrEqual(1)

    const reset = await btn(page, 'cityWalkCamReset').boundingBox()
    expect(reset.y + reset.height).toBeLessThanOrEqual(900)
  })

  test('no panel control is smaller than the touch target', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // The panel's buttons inherit the Forge preview panel's sizing, which
    // is drawn for a desktop pointer. The game is played on touch too, so
    // the game layer raises them to --size-touch-target - and axe cannot
    // see this, because it scores target size against the 24px WCAG 2.2
    // minimum, not the 44px this project holds itself to.
    const small = await page.evaluate(() => {
      const min = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--size-touch-target'
        )
      )
      return [
        ...document
          .getElementById('cityWalkCameraPanel')
          .querySelectorAll('button'),
      ]
        .filter((b) => b.offsetParent !== null)
        .map((b) => ({ id: b.id, r: b.getBoundingClientRect() }))
        .filter(({ r }) => r.height < min - 0.5 || r.width < min - 0.5)
        .map(
          ({ id, r }) => `${id} ${Math.round(r.width)}x${Math.round(r.height)}`
        )
    })
    expect(small).toEqual([])
  })

  test('axe: no violations with the panel showing, in either view', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    for (const view of ['street', 'map']) {
      if (view === 'map') {
        await page.keyboard.press('KeyM')
        await expect(page.locator('#cityWalkHudStatus')).toContainText(
          'map view'
        )
      }
      // A hover state is invisible to a scan unless something is hovering
      // (D-55), and the panel's buttons repaint their pair on hover.
      await btn(page, 'cityWalkCamPanUp').hover()
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .include('#cityWalkCameraPanel')
        .analyze()
      expectOnlyAllowedViolations(results)
      await page.mouse.move(2, 2)
    }
  })
})

test.describe('ASCII City Walk — C and T reach the toggles (CW-Q15)', () => {
  const announcer = (page) => page.locator('#cityWalkAnnouncer')

  const paletteSize = (page) =>
    page.evaluate(
      () => window.__cityWalkGame?.altView?.getPalette()?.length ?? null
    )

  test('C flips high contrast, and the button follows', async ({ page }) => {
    await launchGame(page)
    await enterCity(page)

    const contrastBtn = page.locator('#cityWalkContrastBtn')
    await expect(contrastBtn).toHaveAttribute('aria-pressed', 'false')
    expect(await paletteSize(page)).toBeNull()

    await page.keyboard.press('KeyC')
    await expect(page.locator('html')).toHaveAttribute(
      'data-high-contrast',
      'true'
    )
    await expect(contrastBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(contrastBtn).toHaveAttribute(
      'aria-label',
      'Turn high contrast off'
    )
    await expect(announcer(page)).toHaveText('High contrast on.')
    await expect.poll(() => paletteSize(page)).toBeGreaterThanOrEqual(4)

    await page.keyboard.press('KeyC')
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-high-contrast',
      'true'
    )
    await expect(contrastBtn).toHaveAttribute('aria-pressed', 'false')
    await expect(announcer(page)).toHaveText('High contrast off.')
    await expect.poll(() => paletteSize(page)).toBeNull()
  })

  test('T cycles the theme, and the visible label follows', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    const themeBtn = page.locator('#cityWalkThemeBtn')
    await expect(themeBtn).toHaveText('Theme: Auto')

    await page.keyboard.press('KeyT')
    await expect(themeBtn).toHaveText('Theme: Light')
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme-setting',
      'light'
    )
    await expect(announcer(page)).toHaveText('Theme: Light')

    await page.keyboard.press('KeyT')
    await expect(themeBtn).toHaveText('Theme: Dark')
    await expect(announcer(page)).toHaveText('Theme: Dark')

    await page.keyboard.press('KeyT')
    await expect(themeBtn).toHaveText('Theme: Auto')
    await expect(announcer(page)).toHaveText('Theme: Auto (follows system)')

    // The game keeps playing through every flip.
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'street view'
    )
  })

  test('both keys work on the city picker, before any city is loaded', async ({
    page,
  }) => {
    await launchGame(page)

    await page.keyboard.press('KeyC')
    await expect(page.locator('html')).toHaveAttribute(
      'data-high-contrast',
      'true'
    )
    await expect(announcer(page)).toHaveText('High contrast on.')

    await page.keyboard.press('KeyT')
    await expect(page.locator('#cityWalkThemeBtn')).toHaveText('Theme: Light')
    await expect(announcer(page)).toHaveText('Theme: Light')
  })

  test('Ctrl+T still belongs to the browser and the app, not the game', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    await page.keyboard.press('KeyT')
    await expect(announcer(page)).toHaveText('Theme: Light')

    // The game's guard drops every ctrl/meta/alt combo before reaching its
    // own keys. The app's own chords are Ctrl+Shift+T and Ctrl+Shift+H — the
    // unshifted pair below was never bound to anything — so nothing at all
    // moves, and above all the GAME never answers a modified combo.
    await page.keyboard.press('Control+KeyT')
    await page.waitForTimeout(400)
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme-setting',
      'light'
    )
    await expect(announcer(page)).toHaveText('Theme: Light')

    await page.keyboard.press('Control+KeyH')
    await page.waitForTimeout(400)
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-high-contrast',
      'true'
    )
    await expect(announcer(page)).toHaveText('Theme: Light')
  })
})

/**
 * ASCII City Walk - the map styles and the pad that cycles them (CW-60,
 * CW-Q57).
 *
 * P1 built the four styles and the first ever rendering of CW-43's
 * wayfinding data. These are the CONTROLS: the pad that had nothing of its
 * own to do over the map, the key, the toolbar button, and the choice
 * outliving the session.
 */
test.describe('ASCII City Walk — four map styles (CW-60)', () => {
  const btn = (page, id) => page.locator('#' + id)
  const announcer = (page) => page.locator('#cityWalkAnnouncer')

  /**
   * The style the game says it is showing, read the way a player reads it.
   * There is no test-only hook for this on purpose: the HUD line is the
   * feature's own answer to "which map am I looking at", so a guard that
   * read anything else would pass with the HUD broken.
   */
  const styleName = (page) =>
    page
      .locator('#cityWalkHudStatus')
      .innerText()
      .then((t) => t.match(/map view · ([^·]+) ·/)?.[1]?.trim() ?? null)

  /** What the wayfinding layer is actually drawing, asked of the scene. */
  const wayfindDrawn = (page) =>
    page.evaluate(() => {
      let meshes = 0
      let visible = 0
      let quads = 0
      window.__cityWalkGame.city3d.group.traverse((o) => {
        if (o.name !== 'wayfinding-marks') return
        meshes++
        if (!o.visible) return
        visible++
        quads += o.geometry.getAttribute('position').count / 6
      })
      return {
        meshes,
        visible,
        quads,
        points: window.__cityWalkGame.model.wayfinding.length,
      }
    })

  const openMap = async (page) => {
    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')
  }

  /**
   * Wait for the CONVERTER, not the clock. The picture a pixel test reads is
   * whatever the converter last produced, and on a loaded runner that can be
   * several frames behind the state change that prompted it.
   */
  const convertSamples = (page) =>
    page.evaluate(
      () => window.__cityWalkGame?.altView?.getConvertStats?.()?.samples ?? 0
    )
  async function waitForConversions(page, n) {
    const from = await convertSamples(page)
    await expect
      .poll(() => convertSamples(page), { timeout: 60000 })
      .toBeGreaterThanOrEqual(from + n)
  }

  test('★★ the Walk pad cycles the styles over the map (CW-60)', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    await openMap(page)

    // Standard is the map as it has always been drawn, so a player who never
    // touches this sees no change at all.
    expect(await styleName(page)).toBe('Standard')

    // ★★ ONE CLICK IS ONE STEP, and this is the assertion that says so. With
    // four styles, "click four times and land back on Standard" would pass
    // just as happily if every click moved two - eight steps is also a whole
    // lap. A single click from Standard has to be Roads only and nothing
    // else. D-113 is the defect that made that worth writing down.
    await btn(page, 'cityWalkCamPanRight').click()
    await expect(announcer(page)).toHaveText(/^Map style: Roads only\./)
    expect(await styleName(page)).toBe('Roads only')

    await btn(page, 'cityWalkCamPanDown').click()
    expect(await styleName(page)).toBe('Buildings only')

    await btn(page, 'cityWalkCamPanDown').click()
    expect(await styleName(page)).toBe('Wayfinding')
    await expect(announcer(page)).toHaveText(/tactile paving/)

    // Up and left run the other way, which is the list convention on both
    // axes rather than a second forward.
    await btn(page, 'cityWalkCamPanUp').click()
    expect(await styleName(page)).toBe('Buildings only')
    await btn(page, 'cityWalkCamPanLeft').click()
    expect(await styleName(page)).toBe('Roads only')
    await btn(page, 'cityWalkCamPanLeft').click()
    expect(await styleName(page)).toBe('Standard')
    // And backwards from the first wraps to the last.
    await btn(page, 'cityWalkCamPanLeft').click()
    expect(await styleName(page)).toBe('Wayfinding')
  })

  test('★★ one mouse click on a Camera panel button is ONE step (D-113)', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // A mouse press fires pointerdown, pointerup AND click, and the panel's
    // hold buttons served the press action from pointerdown and again from
    // the click. On the hold path it only stretched the step; on the PRESS
    // path it did the job twice. MEASURED on the base of this release: one
    // click moved the character size 0.5 -> 0.7 where Enter on the same
    // button moved it 0.5 -> 0.6.
    const size = () =>
      page.evaluate(() => window.__cityWalkGame.altView.getFontScale())

    const beforeClick = await size()
    await btn(page, 'cityWalkCamZoomIn').click()
    await expect.poll(size, { timeout: 10000 }).toBeGreaterThan(beforeClick)
    expect(
      (await size()) - beforeClick,
      'a pointer click took more than one step'
    ).toBeCloseTo(0.1, 5)

    // The keyboard route was always one step, and still is. Both are asserted
    // because the fix is a guard on the click path and a guard can be written
    // so tightly it takes the keyboard route out with it.
    await btn(page, 'cityWalkCamZoomIn').focus()
    const beforeKey = await size()
    await page.keyboard.press('Enter')
    await expect.poll(size, { timeout: 10000 }).toBeGreaterThan(beforeKey)
    expect((await size()) - beforeKey).toBeCloseTo(0.1, 5)
  })

  test('K, Shift+K and the toolbar button reach the same styles (CW-60)', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // ★ A STYLE IS A MAP STATE. K in the street says nothing and changes
    // nothing, the same shape Home and the zoom keys already have.
    await page.keyboard.press('KeyK')
    await page.waitForTimeout(300)
    await openMap(page)
    expect(await styleName(page)).toBe('Standard')

    await page.keyboard.press('KeyK')
    await expect(announcer(page)).toHaveText(/^Map style: Roads only\./)
    expect(await styleName(page)).toBe('Roads only')

    await page.keyboard.press('Shift+KeyK')
    expect(await styleName(page)).toBe('Standard')

    await page.keyboard.press('Shift+KeyK')
    expect(await styleName(page)).toBe('Wayfinding')

    // The toolbar promise: every key has a button, and it steps forward.
    await expect(btn(page, 'cityWalkMapStyleBtn')).toBeVisible()
    await expect(btn(page, 'cityWalkMapStyleBtn')).toHaveAttribute(
      'title',
      'Keyboard: K'
    )
    await btn(page, 'cityWalkMapStyleBtn').click()
    expect(await styleName(page)).toBe('Standard')

    // Back in the street the key is inert again - and this is not a vacuous
    // claim, because the style it must NOT move is no longer the default.
    await btn(page, 'cityWalkMapStyleBtn').click()
    expect(await styleName(page)).toBe('Roads only')
    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'street view'
    )
    await page.keyboard.press('KeyK')
    await page.waitForTimeout(300)
    await openMap(page)
    expect(await styleName(page)).toBe('Roads only')
  })

  test('★ only the Wayfinding style draws the wayfinding layer, and it draws every point (CW-60)', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    await openMap(page)

    // CW-43 parsed crossings, kerbs and tactile paving and drew none of it.
    // The layer exists in every style and shows in exactly one.
    const standard = await wayfindDrawn(page)
    expect(
      standard.points,
      'this city has no wayfinding data to draw'
    ).toBeGreaterThan(100)
    expect(
      standard.meshes,
      'no wayfinding meshes were built at all'
    ).toBeGreaterThan(0)
    expect(standard.visible).toBe(0)

    for (const expected of ['Roads only', 'Buildings only']) {
      await page.keyboard.press('KeyK')
      expect(await styleName(page)).toBe(expected)
      expect((await wayfindDrawn(page)).visible).toBe(0)
    }

    await page.keyboard.press('KeyK')
    expect(await styleName(page)).toBe('Wayfinding')
    const way = await wayfindDrawn(page)
    expect(way.visible).toBe(way.meshes)
    // Every parsed point gets a quad. A layer that drew a tenth of them
    // would still photograph as "marks on the map".
    expect(way.quads).toBe(way.points)
  })

  test('axe: no violations with the styles reachable, wrapped strip and not (CW-60)', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // Both widths, because CW-60 made them structurally different layouts:
    // at 1280 the view zone takes a line of its own above the shared row and
    // at 1600 the whole strip is one line. A scan of one says nothing about
    // the other.
    for (const width of [1600, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await openMap(page)
      // Wayfinding is the busiest style and the one with a layer nothing
      // else draws, so it is the state worth scanning.
      for (let i = 0; i < 5; i++) {
        if ((await styleName(page)) === 'Wayfinding') break
        await page.keyboard.press('KeyK')
      }
      expect(await styleName(page), `${width}px`).toBe('Wayfinding')

      // A hover state is invisible to a scan unless something is hovering
      // (D-55), and both new controls repaint on hover.
      await btn(page, 'cityWalkMapStyleBtn').hover()
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .include('#cityWalkLayer')
        .analyze()
      expectOnlyAllowedViolations(results)

      await btn(page, 'cityWalkCamPanRight').hover()
      const padResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .include('#cityWalkCameraPanel')
        .analyze()
      expectOnlyAllowedViolations(padResults)
      await page.mouse.move(2, 2)

      // 44px, the same floor every other control in this strip holds.
      const box = await btn(page, 'cityWalkMapStyleBtn').boundingBox()
      expect(box.height, `${width}px`).toBeGreaterThanOrEqual(43.5)
      expect(box.width, `${width}px`).toBeGreaterThanOrEqual(43.5)

      // ★ AND THE STRIP STAYS INSIDE THE WINDOW. Wrapping is the answer to a
      // strip too wide for its window; a button hanging off the end is not.
      const right = await page.evaluate(() =>
        Math.max(
          ...[...document.querySelectorAll('#cityWalkToolbar button')]
            .filter((b) => !b.hidden)
            .map((b) => b.getBoundingClientRect().right)
        )
      )
      expect(right, `${width}px overflowed`).toBeLessThanOrEqual(width)

      await page.keyboard.press('KeyM')
      await expect(page.locator('#cityWalkHudStatus')).toContainText(
        'street view'
      )
    }
  })

  test('★★ a map style does not follow you back into the street (D-114)', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await launchGame(page)
    await enterCity(page)

    // The whole converted frame's mean luminance. The street has people and
    // cars in it, so this is banded rather than compared exactly - but the
    // band is narrow enough that the defect it guards (a THIRTY-NINE PER
    // CENT drop) sails through it by a factor of eight.
    const ink = () =>
      page.evaluate(() => {
        const c = document.querySelector(
          '#cityWalkViewport canvas.hfm-overlay-canvas'
        )
        const d = c
          .getContext('2d', { willReadFrequently: true })
          .getImageData(0, 0, c.width, c.height).data
        let sum = 0
        for (let i = 0; i < d.length; i += 4) {
          sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
        }
        return sum / (d.length / 4)
      })

    /** Every building material's tint, which is the mechanism underneath. */
    const tints = () =>
      page.evaluate(() => {
        const seen = new Set()
        window.__cityWalkGame.city3d.group.traverse((o) => {
          if (o.name === 'buildings' && o.material)
            seen.add(o.material.color.getHexString())
        })
        return [...seen]
      })

    await waitForConversions(page, 4)
    const before = await ink()
    expect(before, 'the street is not drawing anything').toBeGreaterThan(2)
    expect(await tints()).toEqual(['ffffff'])

    // Wayfinding is the darkest style and therefore the worst leak: it tints
    // the buildings to 0x181818, and before the fix the street stayed that
    // way for the rest of the session.
    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')
    for (let i = 0; i < 5; i++) {
      if ((await styleName(page)) === 'Wayfinding') break
      await page.keyboard.press('KeyK')
    }
    expect(await styleName(page)).toBe('Wayfinding')
    // Non-vacuity: the style really did tint them, so the check below is
    // asking a question that had a wrong answer available.
    expect(await tints(), 'the style never tinted the buildings').not.toEqual([
      'ffffff',
    ])

    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'street view'
    )
    await waitForConversions(page, 4)

    // ★ THE EFFECT FIRST, THE MECHANISM SECOND, and the order is deliberate:
    // whichever assertion fires first is the one the red proof exercises, so
    // the one that must fire is the one a player would notice. Measured with
    // the fix reverted, this comes back 39.2% against a 5% band.
    const after = await ink()
    const drift = Math.abs(after - before) / before
    expect(
      drift,
      `street ink moved ${(drift * 100).toFixed(1)}% across a map visit ` +
        `(${before.toFixed(2)} -> ${after.toFixed(2)})`
    ).toBeLessThan(0.05)
    expect(await tints(), 'a map tint stayed on the buildings').toEqual([
      'ffffff',
    ])
  })

  test('the chosen map style outlives the session (CW-60)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-city-walk-map-style', 'wayfinding')
    })
    await launchGame(page)
    await enterCity(page)
    await openMap(page)

    expect(await styleName(page)).toBe('Wayfinding')
    const way = await wayfindDrawn(page)
    expect(way.visible).toBe(way.meshes)
    expect(way.visible).toBeGreaterThan(0)
  })
})

test.describe('ASCII City Walk — look without dragging, walk without holding (CW-81)', () => {
  const DEG = Math.PI / 180
  const gaze = (page) =>
    page.evaluate(() => ({
      heading: window.__cityWalkGame.walkState.headingRad,
      pitch: window.__cityWalkGame.walkState.pitchRad ?? 0,
      x: window.__cityWalkGame.walkState.x,
      y: window.__cityWalkGame.walkState.y,
      mode: window.__cityWalkGame.lookMode,
      autoWalk: window.__cityWalkGame.autoWalk,
    }))
  const announcer = (page) => page.locator('#cityWalkAnnouncer')

  test('★★ WCAG 2.5.7: a single pointer with NO drag looks in every direction', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await launchGame(page)
    await enterCity(page)
    expect((await gaze(page)).mode).toBe('follow')

    const box = await page.locator('#cityWalkViewport').boundingBox()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    // Right edge: the heading grows, no button held anywhere.
    const h0 = (await gaze(page)).heading
    await page.mouse.move(box.x + box.width * 0.96, cy)
    await expect
      .poll(async () => {
        let d = (await gaze(page)).heading - h0
        while (d > Math.PI) d -= 2 * Math.PI
        while (d < -Math.PI) d += 2 * Math.PI
        return d
      }, { timeout: 20000 })
      .toBeGreaterThan(10 * DEG)

    // Top edge: the pitch rises.
    const p0 = (await gaze(page)).pitch
    await page.mouse.move(cx, box.y + box.height * 0.04)
    await expect
      .poll(async () => (await gaze(page)).pitch - p0, { timeout: 20000 })
      .toBeGreaterThan(5 * DEG)

    // Dead centre: the view settles and stays put.
    await page.mouse.move(cx, cy)
    await page.waitForTimeout(600)
    const settled = await gaze(page)
    await page.waitForTimeout(500)
    const later = await gaze(page)
    expect(Math.abs(later.heading - settled.heading)).toBeLessThan(0.2 * DEG)
    expect(Math.abs(later.pitch - settled.pitch)).toBeLessThan(0.2 * DEG)

    // Outside the viewport (the header): frozen, however long we wait.
    await page.mouse.move(box.x + box.width * 0.96, cy)
    await page.waitForTimeout(200)
    await page.mouse.move(box.x + 10, box.y - 30)
    await page.waitForTimeout(400)
    const out0 = await gaze(page)
    await page.waitForTimeout(600)
    const out1 = await gaze(page)
    expect(Math.abs(out1.heading - out0.heading)).toBeLessThan(0.2 * DEG)
  })

  test('★★ auto-walk moves without a held key, and every stop rule stops it', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await launchGame(page)
    await enterCity(page)

    // On, and moving, hands off.
    await page.keyboard.press('KeyN')
    await expect(announcer(page)).toContainText('Auto-walk on')
    const start = await gaze(page)
    await expect
      .poll(async () => {
        const g = await gaze(page)
        return Math.hypot(g.x - start.x, g.y - start.y)
      }, { timeout: 20000 })
      .toBeGreaterThan(1)

    // The toggle stops it.
    await page.keyboard.press('KeyN')
    await expect(announcer(page)).toContainText('Auto-walk off')
    expect((await gaze(page)).autoWalk).toBe(false)

    // Escape stops it - and stays IN the game.
    await page.keyboard.press('KeyN')
    await expect(announcer(page)).toContainText('Auto-walk on')
    await page.keyboard.press('Escape')
    await expect(announcer(page)).toContainText('Auto-walk off')
    expect((await gaze(page)).autoWalk).toBe(false)
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'street view'
    )

    // A tapped walk key takes the wheel back, even one the frame never
    // sees held (the down and the up can land between two frames).
    await page.keyboard.press('KeyN')
    await expect(announcer(page)).toContainText('Auto-walk on')
    await page.keyboard.press('KeyS')
    await expect(announcer(page)).toContainText('Auto-walk off')
    expect((await gaze(page)).autoWalk).toBe(false)
  })

  test('★★ auto-walk follows the street: an obstacle steers it, never stops it (CW-87)', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await launchGame(page)
    await enterCity(page)

    // Face the nearest obstacle along a CARDINAL bearing, using the game's
    // own collision grid - the pose that USED to trigger the blocked stop
    // before street-following (CW-81's original wall case). Now the fan
    // must steer along the clearest pavement and keep walking.
    const posed = await page.evaluate(() => {
      const g = window.__cityWalkGame
      const st = g.walkState
      for (let d = 2; d < 120; d += 1) {
        for (const rad of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
          const x = st.x + Math.sin(rad) * d
          const y = st.y + Math.cos(rad) * d
          if (g.collision.isBlocked(x, y)) {
            st.headingRad = rad
            g.lookTarget.headingRad = rad
            return { rad, d }
          }
        }
      }
      return null
    })
    expect(posed).not.toBeNull()

    const start = await gaze(page)
    await page.keyboard.press('KeyN')
    await expect(announcer(page)).toContainText('Auto-walk on')
    // The walker must travel measurably FARTHER than the obstacle it was
    // aimed at - proof it went around, not into.
    await expect
      .poll(
        async () => {
          const g = await gaze(page)
          return Math.hypot(g.x - start.x, g.y - start.y)
        },
        { timeout: 90000 }
      )
      .toBeGreaterThan(posed.d + 2)
    const g = await gaze(page)
    expect(g.autoWalk).toBe(true)
    await expect(announcer(page)).not.toContainText(
      'Auto-walk stopped. Something is in the way.'
    )
    await page.keyboard.press('KeyN')
  })

  test('★★ a true dead end still stops auto-walk, and says so (CW-87)', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await launchGame(page)
    await enterCity(page)

    // Build the dead end with the game's own obstacle stamp: a U of walls
    // 1.1 m out on three sides, the opening behind, where the forward fan
    // never looks. This is the one case the blocked sentence is for now.
    await page.evaluate(() => {
      const g = window.__cityWalkGame
      const st = g.walkState
      st.headingRad = 0
      g.lookTarget.headingRad = 0
      g.collision.blockRect({
        x: st.x,
        y: st.y + 1.6,
        halfLengthM: 6,
        halfWidthM: 0.5,
        rotationRad: Math.PI / 2,
      })
      g.collision.blockRect({
        x: st.x + 1.6,
        y: st.y,
        halfLengthM: 6,
        halfWidthM: 0.5,
        rotationRad: 0,
      })
      g.collision.blockRect({
        x: st.x - 1.6,
        y: st.y,
        halfLengthM: 6,
        halfWidthM: 0.5,
        rotationRad: 0,
      })
    })

    await page.keyboard.press('KeyN')
    await expect(announcer(page)).toContainText('Auto-walk on')
    await expect(announcer(page)).toContainText(
      'Auto-walk stopped. Something is in the way.',
      { timeout: 60000 }
    )
    expect((await gaze(page)).autoWalk).toBe(false)
  })

  test('arrow-look: while auto-walk carries the walking, Arrow Up looks', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await launchGame(page)
    await enterCity(page)

    await page.keyboard.press('KeyN')
    await expect(announcer(page)).toContainText('Auto-walk on')
    const p0 = (await gaze(page)).pitch
    await page.keyboard.down('ArrowUp')
    await page.waitForTimeout(700)
    await page.keyboard.up('ArrowUp')
    await expect
      .poll(async () => (await gaze(page)).pitch - p0, { timeout: 10000 })
      .toBeGreaterThan(5 * (Math.PI / 180))
    // And the walking never stopped: an arrow is a look, not a walk, here.
    expect((await gaze(page)).autoWalk).toBe(true)
    await page.keyboard.press('KeyN')
    await expect(announcer(page)).toContainText('Auto-walk off')
  })

  test('the preference persists across a reload, and off means neither', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await launchGame(page)
    await enterCity(page)

    // follow -> drag -> off, through the real toolbar button.
    await page.locator('#cityWalkLookModeBtn').click()
    await expect(announcer(page)).toContainText('drag')
    await page.locator('#cityWalkLookModeBtn').click()
    await expect(announcer(page)).toContainText('Mouse look off')

    // A plain reload will not do: the unlock door consumes ?hfm=unlock and
    // rewrites the URL, so reloading lands on the main page with no card.
    // launchGame navigates with the query again; localStorage survives the
    // navigation, which is exactly what this case is here to prove.
    await launchGame(page)
    await enterCity(page)
    expect((await gaze(page)).mode).toBe('off')

    // Off is off: the hover does not look, and neither does a drag.
    const box = await page.locator('#cityWalkViewport').boundingBox()
    const before = await gaze(page)
    await page.mouse.move(box.x + box.width * 0.96, box.y + box.height / 2)
    await page.waitForTimeout(600)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2)
    await page.mouse.up()
    const after = await gaze(page)
    expect(after.heading).toBeCloseTo(before.heading, 5)
    expect(after.pitch).toBeCloseTo(before.pitch, 5)
  })

  test('reduced motion keeps hover-look off by default, and the choice stays yours', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await launchGame(page)
    await enterCity(page)
    expect((await gaze(page)).mode).toBe('off')
    // The preference is still the player's to change.
    await page.locator('#cityWalkLookModeBtn').click()
    expect((await gaze(page)).mode).toBe('follow')
  })

  test('a dialog freezes hover-look until it closes', async ({ page }) => {
    test.setTimeout(120000)
    await launchGame(page)
    await enterCity(page)

    const box = await page.locator('#cityWalkViewport').boundingBox()
    await page.mouse.move(box.x + box.width * 0.96, box.y + box.height / 2)
    const h0 = (await gaze(page)).heading
    await page.waitForTimeout(300)
    const h1 = (await gaze(page)).heading
    expect(h1).not.toBe(h0)

    // Opening help freezes the TARGET; the camera still finishes easing the
    // hover lag out (rate x tau = 9 degrees, tau 0.1 s), so give it 900 ms
    // to converge and snap before asserting stillness. The tolerance is the
    // settle check's 0.2 degrees - far under the 45 degrees an unfrozen
    // hover would cover in the same half second.
    await page.keyboard.press('KeyH')
    await expect(page.locator('#cityWalkHelpPanel')).toBeVisible()
    await page.waitForTimeout(900)
    const frozen0 = await gaze(page)
    await page.waitForTimeout(500)
    const frozen1 = await gaze(page)
    expect(Math.abs(frozen1.heading - frozen0.heading)).toBeLessThan(0.2 * DEG)
    await page.keyboard.press('KeyH')
  })

  test('axe: the toolbar with the CW-81 controls, and their hit targets', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    for (const id of ['#cityWalkAutoWalkBtn', '#cityWalkLookModeBtn']) {
      const b = await page.locator(id).boundingBox()
      expect(b.height, id).toBeGreaterThanOrEqual(44)
      expect(b.width, id).toBeGreaterThanOrEqual(44)
    }

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .include('#cityWalkToolbar')
      .analyze()
    expectOnlyAllowedViolations(results)
  })
})

test.describe('ASCII City Walk — the tour: take me there (CW-87)', () => {
  const announcer = (page) => page.locator('#cityWalkAnnouncer')
  const tourState = (page) =>
    page.evaluate(() => {
      const g = window.__cityWalkGame
      return {
        tour: g.tour ? { name: g.tour.name, at: g.tour.at } : null,
        x: g.walkState.x,
        y: g.walkState.y,
      }
    })

  test('★★ I walks the player to the Great Wheel, and arrival is the waypoint touch', async ({
    page,
  }) => {
    // T7: the live region is watched over the whole route; the sim-time
    // window is sized for the software renderer (CW-78's lesson - a
    // dt-clamped walker covers sim metres at a fraction of real time).
    test.setTimeout(180000)
    await launchGame(page)
    await enterCity(page)

    await page.keyboard.press('KeyI')
    await expect(announcer(page)).toContainText(
      'Taking you to Seattle Great Wheel'
    )
    await expect(announcer(page)).toContainText(
      'Waypoint reached: Seattle Great Wheel.',
      { timeout: 120000 }
    )
    const s = await tourState(page)
    expect(s.tour).toBeNull()
    // The brief's own acceptance: within 3 m of the waypoint.
    const d = await page.evaluate(() => {
      const g = window.__cityWalkGame
      const spot = g.waypointSpots.find((w) => w.name === 'Seattle Great Wheel')
      return Math.hypot(spot.x - g.walkState.x, spot.y - g.walkState.y)
    })
    expect(d).toBeLessThan(3)
  })

  test('★★ every stop rule stops the tour: I again, Escape, a walk key', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await launchGame(page)
    await enterCity(page)

    await page.keyboard.press('KeyI')
    await expect(announcer(page)).toContainText('Taking you to')
    await page.keyboard.press('KeyI')
    await expect(announcer(page)).toContainText('Tour stopped.')
    expect((await tourState(page)).tour).toBeNull()

    await page.keyboard.press('KeyI')
    await expect(announcer(page)).toContainText('Taking you to')
    await page.keyboard.press('Escape')
    await expect(announcer(page)).toContainText('Tour stopped.')
    expect((await tourState(page)).tour).toBeNull()
    // And Escape stopped the tour, not the game.
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'street view'
    )

    await page.keyboard.press('KeyI')
    await expect(announcer(page)).toContainText('Taking you to')
    await page.keyboard.press('KeyW')
    await expect(announcer(page)).toContainText('Tour stopped.')
    expect((await tourState(page)).tour).toBeNull()
  })

  test('the legend button starts the tour from the map, closing it', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await launchGame(page)
    await enterCity(page)

    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')
    await page.locator('#cityWalkTourBtn').click()
    await expect(announcer(page)).toContainText('Taking you to')
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'street view'
    )
    await page.keyboard.press('Escape')
    await expect(announcer(page)).toContainText('Tour stopped.')
  })

  test('★★ a real bend on the route is spoken as a turn', async ({ page }) => {
    test.setTimeout(120000)
    await launchGame(page)
    await enterCity(page)

    // A hand-laid two-leg route with a 90-degree bend, injected as the
    // running tour so the REAL vertex-advance path speaks: leg one 2.5 m
    // ahead, leg two 6 m to the right of it. Open ground at the spawn.
    await page.evaluate(() => {
      const g = window.__cityWalkGame
      const w = g.walkState
      const h = w.headingRad
      const ax = w.x + Math.sin(h) * 2.5
      const ay = w.y + Math.cos(h) * 2.5
      const bx = ax + Math.sin(h + Math.PI / 2) * 6
      const by = ay + Math.cos(h + Math.PI / 2) * 6
      g.tour = {
        name: 'Test bend',
        route: [
          { x: w.x, y: w.y },
          { x: ax, y: ay },
          { x: bx, y: by },
        ],
        at: 1,
        holding: false,
      }
    })
    await expect(announcer(page)).toContainText(/Turn right/, {
      timeout: 60000,
    })
  })

  test('axe: the legend with the tour button, and its hit target', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkLegend')).toBeVisible()

    const b = await page.locator('#cityWalkTourBtn').boundingBox()
    expect(b.height).toBeGreaterThanOrEqual(44)
    expect(b.width).toBeGreaterThanOrEqual(44)

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .include('#cityWalkLegend')
      .analyze()
    expectOnlyAllowedViolations(results)
  })
})
