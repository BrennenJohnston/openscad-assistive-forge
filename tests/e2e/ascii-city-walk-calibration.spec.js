import { test, expect } from '@playwright/test'
import {
  useCityWalkFixtures,
  launchGame,
  enterCity,
} from './helpers/city-walk.js'

useCityWalkFixtures()

/**
 * CW-72 (CW-Q75, signed by the owner at G1): ONE default character size, and
 * calibration reduced to a FLOOR.
 *
 * CW-42 measured this machine and LANDED it on its own size, so two players
 * saw two different games. Every case in this file was written for that
 * contract and is rewritten here for the new one:
 *
 *   - everybody opens at 30 %;
 *   - a machine that cannot hold 30 % is moved UP the ladder, never down;
 *   - a raise needs TWO consecutive passes to agree, so a busy afternoon
 *     cannot brand a machine (the R6 ledger's floor-flapping item);
 *   - a stored CW-42 landing BELOW the default is migrated up to it, or the
 *     machine that wrote it would keep its private game after this release.
 *
 * Nothing here times real frames: every case forces its probe readings
 * through the DEV hook the shared fixture leaves inert, because CI renders in
 * software and a wall-clock probe would measure the runner, not the design.
 */

const DEFAULT_SCALE = 0.3

const scaleOf = (page) =>
  page.evaluate(() => window.__cityWalkGame?.altView?.getFontScale() ?? null)

const calibrationOf = (page) =>
  page.evaluate(() => {
    const cal = window.__cityWalkGame?.calibration
    return cal
      ? {
          done: cal.done,
          aborted: cal.aborted,
          readings: cal.readings.length,
          result: cal.result,
        }
      : null
  })

const storedFloor = (page) =>
  page.evaluate(() =>
    localStorage.getItem('openscad-forge-city-walk-calibrated-floor')
  )

const storedManual = (page) =>
  page.evaluate(() =>
    localStorage.getItem('openscad-forge-city-walk-font-scale')
  )

const announcer = (page) => page.locator('#cityWalkAnnouncer')

/** Later init scripts run later, so this assignment beats the fixture's. */
const forceCalibration = (page, forced) =>
  page.addInitScript((f) => {
    window.__cityWalkCalibrationForce = f
  }, forced)

const seedStorage = (page, entries) =>
  page.addInitScript((pairs) => {
    for (const [k, v] of pairs) localStorage.setItem(k, v)
  }, entries)

const calibrationDone = async (page) => {
  await expect
    .poll(async () => (await calibrationOf(page))?.done, { timeout: 15000 })
    .toBe(true)
}

/**
 * One visit: enter the city and let the pass finish.
 *
 * A second visit has to leave the page first. `launchGame` navigates to the
 * same URL, and a same-URL navigation from inside the open city layer leaves
 * the card hidden behind it - the calibration pass then never runs and the
 * failure reads as "the card is not visible", which says nothing about
 * calibration at all.
 */
const enterAndCalibrate = async (page, { fresh = false } = {}) => {
  if (fresh) await page.goto('about:blank')
  await launchGame(page)
  await enterCity(page)
  await calibrationDone(page)
}

test.describe('ASCII City Walk — one size, and a floor (CW-72)', () => {
  test('a machine that holds the default opens at the default, stored as a floor', async ({
    page,
  }) => {
    await forceCalibration(page, { 0.3: 20 })
    await enterAndCalibrate(page)

    expect(await scaleOf(page)).toBeCloseTo(DEFAULT_SCALE, 5)
    expect(await storedFloor(page)).toBe('0.3')
    // The floor is not a manual choice - writing the manual key here would
    // freeze a measurement as if the player had made it.
    expect(await storedManual(page)).toBeNull()
  })

  test('★★ a raise needs TWO passes, and does not flap on a third', async ({
    page,
  }) => {
    // This machine cannot hold 30% and is comfortable at 40%.
    await forceCalibration(page, { 0.3: 60, 0.4: 20, 0.5: 15 })

    // FIRST visit: the floor does NOT move; the pass is recorded as pending.
    // This is the red proof for the whole hysteresis - a floor that raised
    // here would let one busy afternoon brand the machine for ever.
    await enterAndCalibrate(page)
    expect(await storedFloor(page)).toBe('0.3,1')
    expect(await scaleOf(page)).toBeCloseTo(DEFAULT_SCALE, 5)

    // SECOND visit agrees: now it raises, and says so out loud.
    await enterAndCalibrate(page, { fresh: true })
    expect(await storedFloor(page)).toBe('0.4')
    expect(await scaleOf(page)).toBeCloseTo(0.4, 5)
    await expect(announcer(page)).toContainText('raised to 40 percent')

    // THIRD visit: the floor is where it belongs and must sit still.
    await enterAndCalibrate(page, { fresh: true })
    expect(await storedFloor(page)).toBe('0.4')
    expect(await scaleOf(page)).toBeCloseTo(0.4, 5)
  })

  test('the floor NEVER goes down, however fast the machine measures', async ({
    page,
  }) => {
    await seedStorage(page, [
      ['openscad-forge-city-walk-calibrated-floor', '0.5'],
    ])
    // Comfortable at everything - and it still does not get a finer picture
    // than the floor it is standing on.
    await forceCalibration(page, { 0.3: 5, 0.4: 5, 0.5: 5 })
    await enterAndCalibrate(page)

    expect(await scaleOf(page)).toBeCloseTo(0.5, 5)
    expect(await storedFloor(page)).toBe('0.5')
  })

  test('★★ a CW-42 landing below the default is migrated up to it', async ({
    page,
  }) => {
    // 10% was one of CW-42's two candidates. A machine that stored it would
    // keep its own private game for ever if that value survived as a floor.
    await seedStorage(page, [
      ['openscad-forge-city-walk-calibrated-floor', '0.1'],
    ])
    await forceCalibration(page, { 0.3: 20 })
    await enterAndCalibrate(page)

    expect(await scaleOf(page)).toBeCloseTo(DEFAULT_SCALE, 5)
    expect(await storedFloor(page)).toBe('0.3')
  })

  test("a player's own size wins when it is above the floor", async ({
    page,
  }) => {
    await seedStorage(page, [
      ['openscad-forge-city-walk-font-scale', '0.6'],
      ['openscad-forge-city-walk-calibrated-floor', '0.4'],
    ])
    await forceCalibration(page, { 0.6: 20, 0.3: 20, 0.4: 20, 0.5: 20 })
    await enterAndCalibrate(page)

    expect(await scaleOf(page)).toBeCloseTo(0.6, 5)
    expect(await storedManual(page)).toBe('0.6')
  })

  test('a saved size below the floor opens at the floor', async ({ page }) => {
    await seedStorage(page, [
      ['openscad-forge-city-walk-font-scale', '0.3'],
      ['openscad-forge-city-walk-calibrated-floor', '0.5'],
    ])
    await forceCalibration(page, { 0.3: 60, 0.4: 60, 0.5: 20 })
    await enterAndCalibrate(page)

    expect(await scaleOf(page)).toBeCloseTo(0.5, 5)
  })

  test('reduced motion changes nothing about the outcome', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await forceCalibration(page, { 0.3: 20 })
    await enterAndCalibrate(page)

    expect(await scaleOf(page)).toBeCloseTo(DEFAULT_SCALE, 5)
    expect(await storedFloor(page)).toBe('0.3')
  })
})
