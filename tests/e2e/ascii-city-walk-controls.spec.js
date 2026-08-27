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
        if (d > 0) {
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
    await expect(btn(page, 'cityWalkCamPanUp')).toHaveAttribute(
      'aria-label',
      'Pan map up'
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
    await holdButton(page, 'cityWalkCamPanRight', () =>
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

    // The game opens at its own 50% default (CW-12), in ten-point steps.
    await btn(page, 'cityWalkCharDownBtn').click()
    await expect(announcer(page)).toHaveText(/Character size 40 percent/)
    await btn(page, 'cityWalkCharUpBtn').click()
    await expect(announcer(page)).toHaveText(/Character size 50 percent/)

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

    const leg = async () => {
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
