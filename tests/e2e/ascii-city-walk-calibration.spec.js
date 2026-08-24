import { test, expect } from '@playwright/test'
import {
  useCityWalkFixtures,
  launchGame,
  enterCity,
} from './helpers/city-walk.js'

useCityWalkFixtures()

/**
 * CW-42 (CW-Q39): the character-size floor knows this machine.
 *
 * At city entry a short pass measures convert cost and picks the smallest
 * size in [10%, 30%] that holds 30 fps; that size becomes the range's floor
 * AND the landing default. A manual choice sticks. Nothing here times real
 * frames: every case forces its probe readings through the DEV hook the
 * shared fixture leaves inert (CI renders in software - a wall-clock probe
 * would measure the runner, not the design).
 */

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

const calibrationDone = async (page) => {
  await expect
    .poll(async () => (await calibrationOf(page))?.done, {
      timeout: 15000,
    })
    .toBe(true)
}

test.describe('ASCII City Walk — entry calibration (CW-42)', () => {
  test('with nothing saved, entry lands at the calibrated size, stored as floor, not as a choice', async ({
    page,
  }) => {
    // This machine: 50% comfortable, 10% holds too - the finest size wins.
    await forceCalibration(page, { 0.5: 20, 0.1: 10 })
    await launchGame(page)
    await enterCity(page)
    await calibrationDone(page)

    expect(await scaleOf(page)).toBeCloseTo(0.1, 5)
    expect(await storedFloor(page)).toBe('0.1')
    // The applied default is not a manual choice - writing the manual key
    // here would freeze calibration forever.
    expect(await storedManual(page)).toBeNull()
    // A floor at the range's own 10% minimum raises nothing: Smaller is the
    // plain range end, not a machine-imposed stop.
    await expect(page.locator('#cityWalkCharDownBtn')).not.toHaveAttribute(
      'aria-disabled',
      'true'
    )

    // A later entry lands there directly - the stored calibration seeds it.
    await page.keyboard.press('Escape')
    await expect(page.locator('#cityWalkLayer')).toBeHidden()
    await page.locator('#cityWalkLaunchBtn').click()
    await expect(page.locator('#cityWalkLayer')).toBeVisible()
    await enterCity(page, 'Denver, Colorado')
    expect(await scaleOf(page)).toBeCloseTo(0.1, 5)
  })

  test('the calibrated floor stops Smaller with a spoken reason, and the buttons say so', async ({
    page,
  }) => {
    // This machine: 10% cannot hold 30 fps, 30% can.
    await forceCalibration(page, { 0.5: 20, 0.1: 60, 0.3: 20 })
    await launchGame(page)
    await enterCity(page)
    await calibrationDone(page)

    expect(await scaleOf(page)).toBeCloseTo(0.3, 5)
    expect(await storedFloor(page)).toBe('0.3')

    // The stop says why, and nothing moves.
    await page.keyboard.press('Minus')
    await expect(announcer(page)).toHaveText(
      /Character size 30 percent\. Smaller sizes cannot hold 30 frames per second on this machine\./
    )
    expect(await scaleOf(page)).toBeCloseTo(0.3, 5)

    // Disabled-with-reason, never hidden: both Smaller surfaces carry
    // aria-disabled and stay in the page.
    await expect(page.locator('#cityWalkCharDownBtn')).toHaveAttribute(
      'aria-disabled',
      'true'
    )
    await expect(page.locator('#cityWalkCamZoomOut')).toHaveAttribute(
      'aria-disabled',
      'true'
    )

    // Over the map the panel button is the map's own zoom - never
    // floor-bound.
    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkCamZoomOut')).not.toHaveAttribute(
      'aria-disabled',
      'true'
    )
    await page.keyboard.press('KeyM')

    // Above the floor the stop clears; stepping back down restores it.
    await page.keyboard.press('Equal')
    await expect(announcer(page)).toHaveText(/Character size 40 percent/)
    await expect(page.locator('#cityWalkCharDownBtn')).not.toHaveAttribute(
      'aria-disabled',
      'true'
    )
    await page.keyboard.press('Minus')
    await expect(announcer(page)).toHaveText(/Character size 30 percent\./)
    await expect(page.locator('#cityWalkCharDownBtn')).toHaveAttribute(
      'aria-disabled',
      'true'
    )
  })

  test('a machine that holds nothing in range falls back honestly, once', async ({
    page,
  }) => {
    // Even the entry size fails the bar: the whole range below is condemned
    // without a single probe flip.
    await forceCalibration(page, { 0.5: 100 })
    await launchGame(page)
    await enterCity(page)
    await calibrationDone(page)

    // The default is not lowered, the floor parks at 30%, and the message
    // says so plainly instead of pretending.
    expect(await scaleOf(page)).toBeCloseTo(0.5, 5)
    expect(await storedFloor(page)).toBe('fallback')
    await expect(announcer(page)).toHaveText(
      /Small character sizes cannot hold 30 frames per second on this machine\. Character size stays at 50 percent\./
    )

    // Manual steps still reach the parked floor, and stop there with the
    // reason.
    await page.keyboard.press('Minus')
    await expect(announcer(page)).toHaveText(/Character size 40 percent/)
    await page.keyboard.press('Minus')
    await expect(announcer(page)).toHaveText(/Character size 30 percent\./)
    await page.keyboard.press('Minus')
    await expect(announcer(page)).toHaveText(
      /Character size 30 percent\. Smaller sizes cannot hold 30 frames per second on this machine\./
    )
  })

  test('a manual choice is measured where it stands and never moved', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-city-walk-font-scale', '0.4')
    })
    await forceCalibration(page, { 0.4: 10 })
    await launchGame(page)
    await enterCity(page)
    await calibrationDone(page)

    // The pass ran (one reading, at the manual size) but 40% holding
    // comfortably decides nothing about the range: no stored floor, no
    // announcement, and the choice untouched.
    const cal = await calibrationOf(page)
    expect(cal.readings).toBe(1)
    expect(cal.aborted).toBe(false)
    expect(await scaleOf(page)).toBeCloseTo(0.4, 5)
    expect(await storedManual(page)).toBe('0.4')
    expect(await storedFloor(page)).toBeNull()
  })

  test('a manual choice below a new floor is grandfathered, not clamped up', async ({
    page,
  }) => {
    // Yesterday this machine calibrated to 10% and the player chose it; the
    // manual key holds 0.1. Today even 10% cannot hold the bar.
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-city-walk-font-scale', '0.1')
    })
    await forceCalibration(page, { 0.1: 60 })
    await launchGame(page)
    await enterCity(page)
    await calibrationDone(page)

    // The choice sticks - auto never fights it - but the honest message
    // fires and the floor moves for gestures.
    expect(await scaleOf(page)).toBeCloseTo(0.1, 5)
    expect(await storedManual(page)).toBe('0.1')
    expect(await storedFloor(page)).toBe('fallback')
    await expect(announcer(page)).toHaveText(
      /Small character sizes cannot hold 30 frames per second on this machine\. Character size stays at 10 percent\./
    )

    // Below the floor, Smaller is a spoken stop and the button says so.
    await expect(page.locator('#cityWalkCharDownBtn')).toHaveAttribute(
      'aria-disabled',
      'true'
    )
    await page.keyboard.press('Minus')
    await expect(announcer(page)).toHaveText(
      /Character size 10 percent\. Smaller sizes cannot hold 30 frames per second on this machine\./
    )
    expect(await scaleOf(page)).toBeCloseTo(0.1, 5)

    // Growing rejoins the legal range: the first step up lands on the
    // floor, not on a size the machine cannot hold.
    await page.keyboard.press('Equal')
    await expect(announcer(page)).toHaveText(/Character size 30 percent\./)
    expect(await scaleOf(page)).toBeCloseTo(0.3, 5)
  })

  test('reduced motion changes nothing about the calibration outcome', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await forceCalibration(page, { 0.5: 20, 0.1: 60, 0.3: 20 })
    await launchGame(page)
    await enterCity(page)
    await calibrationDone(page)

    expect(await scaleOf(page)).toBeCloseTo(0.3, 5)
    expect(await storedFloor(page)).toBe('0.3')
  })
})
