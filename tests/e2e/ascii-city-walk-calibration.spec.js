import { test, expect } from '@playwright/test'
import {
  useCityWalkFixtures,
  launchGame,
  enterCity,
} from './helpers/city-walk.js'

useCityWalkFixtures()

/**
 * One default character size, with calibration reduced to a floor.
 *
 * Calibration once measured each machine and settled it on its own size, so
 * two players saw two different games. These cases hold the rule that
 * replaced it:
 *
 *   - everybody opens at 30 %;
 *   - a machine that cannot hold 30 % is moved up the ladder, never down;
 *   - a raise needs two consecutive passes to agree, so a busy afternoon
 *     cannot brand a machine with a floor that flaps;
 *   - a stored landing below the default is migrated up to it, or the
 *     machine that wrote it would keep its private game.
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

test.describe('ASCII City Walk — one size, and a floor', () => {
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

  test('a raise needs two passes, and does not flap on a third', async ({
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

  test('the floor never goes down, however fast the machine measures', async ({
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

  test('an old calibration landing below the default is migrated up to it', async ({
    page,
  }) => {
    // 10% was one of the old calibration's two candidates. A machine that
    // stored it would keep its own private game for ever if that value
    // survived as a floor.
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

  test('a saved size below the floor opens at the saved size', async ({
    page,
  }) => {
    // The floor seeds a player who has never chosen a size and does not
    // overrule one who has. Two things hold that: the seed keeps the saved
    // size instead of raising it to the floor, and the calibration pass does
    // not force the size up to the floor it has just measured.
    await seedStorage(page, [
      ['openscad-forge-city-walk-font-scale', '0.3'],
      ['openscad-forge-city-walk-calibrated-floor', '0.5'],
    ])
    await forceCalibration(page, { 0.3: 60, 0.4: 60, 0.5: 20 })
    await enterAndCalibrate(page)

    expect(await scaleOf(page)).toBeCloseTo(0.3, 5)
    // and the choice is still theirs afterwards, not overwritten by the pass
    expect(await storedManual(page)).toBe('0.3')
  })

  test('stepping down from the default reaches 10 percent', async ({
    page,
  }) => {
    // Stepping down from the default reaches 10 %. One step by key and one by
    // button, because a single function serves the keyboard, the toolbar and
    // the camera panel, and a test that tried only one of them would not know
    // about the other two.
    await forceCalibration(page, { 0.3: 20 })
    await enterAndCalibrate(page)
    expect(await scaleOf(page)).toBeCloseTo(DEFAULT_SCALE, 5)

    await page.keyboard.press('Minus')
    expect(await scaleOf(page)).toBeCloseTo(0.2, 5)
    await page.locator('#cityWalkCharDownBtn').click()
    expect(await scaleOf(page)).toBeCloseTo(0.1, 5)
    await expect(announcer(page)).toContainText('Character size 10 percent')
    expect(await storedManual(page)).toBe('0.1')

    // The bottom of the range is the bottom: the control says so there, and
    // only there, not at the calibrated floor.
    await expect(page.locator('#cityWalkCharDownBtn')).toHaveAttribute(
      'aria-disabled',
      'true'
    )
    await page.keyboard.press('Minus')
    expect(await scaleOf(page)).toBeCloseTo(0.1, 5)
  })

  test('a calibration raise leaves a saved size alone, and says so', async ({
    page,
  }) => {
    // A manual entry is measured where it stands and never flipped, so this
    // machine's one reading is the player's own 30 % failing the bar; the
    // floor rises on the second agreeing pass. The floor is information, not
    // an override: the size stays where the player put it, and the
    // announcement offers the larger size instead of taking the choice away.
    await seedStorage(page, [
      ['openscad-forge-city-walk-font-scale', '0.3'],
      ['openscad-forge-city-walk-calibrated-floor', '0.3,1'],
    ])
    await forceCalibration(page, { 0.3: 60 })
    await enterAndCalibrate(page)

    expect(await storedFloor(page)).toBe('0.5')
    expect(await scaleOf(page)).toBeCloseTo(0.3, 5)
    expect(await storedManual(page)).toBe('0.3')
    await expect(announcer(page)).toContainText('your size is unchanged')
  })

  test('a failing reading below the ladder decides nothing', async ({
    page,
  }) => {
    // 10 % is reachable and a manual entry is measured where it stands, and
    // 10 % is the most expensive size there is (a smaller cell means more of
    // them). Reading it as a verdict on 30 % would be backwards, since cost
    // rises as the cells get smaller, and would send the stored floor to the
    // top of the ladder off one reading of a size the ladder does not contain.
    // So the pass is inconclusive: nothing stored, nothing announced, the
    // previous floor left standing.
    await seedStorage(page, [
      ['openscad-forge-city-walk-font-scale', '0.1'],
      ['openscad-forge-city-walk-calibrated-floor', '0.3,1'],
    ])
    await forceCalibration(page, { 0.1: 80 })
    await enterAndCalibrate(page)

    expect(await storedFloor(page)).toBe('0.3,1')
    expect(await scaleOf(page)).toBeCloseTo(0.1, 5)
    await expect(announcer(page)).not.toContainText('30 frames per second')
  })

  test('reduced motion changes nothing about the outcome', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await forceCalibration(page, { 0.3: 20 })
    await enterAndCalibrate(page)

    expect(await scaleOf(page)).toBeCloseTo(DEFAULT_SCALE, 5)
    expect(await storedFloor(page)).toBe('0.3')
  })
})
