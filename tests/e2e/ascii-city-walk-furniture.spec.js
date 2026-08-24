import { test, expect } from '@playwright/test'
import {
  useCityWalkFixtures,
  launchGame,
  enterCity,
} from './helpers/city-walk.js'

useCityWalkFixtures()

/**
 * CW-43 (CW-Q43/CW-Q44): street furniture from real data, and attraction
 * nodes in the landmark legend.
 *
 * The owner's mission sentence governs this suite: the furniture is
 * wayfinding information for a blind traveler, so the counts are EXACT -
 * the extracts are versioned fixtures and the placement is hash-seeded
 * deterministic, so any drift here is a real change someone must own,
 * never noise.
 */

const modelStats = (page) =>
  page.evaluate(() => window.__cityWalkGame?.model?.stats ?? null)

const propStats = (page) =>
  page.evaluate(() => window.__cityWalkGame?.props?.stats ?? null)

test.describe('ASCII City Walk — street furniture (CW-43)', () => {
  test('Seattle carries its real furniture, counted class by class', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // The extract's own counts (the plan section 1f coverage table).
    const model = await modelStats(page)
    expect(model.furnitureByKind).toEqual({
      bus_stop: 71,
      bench: 31,
      waste_basket: 155,
      bicycle_parking: 309,
      fire_hydrant: 43,
    })
    // The data-only wayfinding layer rides the model untouched.
    expect(model.wayfindingCount).toBe(1907)

    // What actually stands in the city: the same numbers minus nodes that
    // fall inside a building footprint or duplicate one another - measured
    // once, deterministic forever (hash-seeded placement, versioned data).
    const props = await propStats(page)
    expect(props.furnitureByKind).toEqual({
      bus_stop: 69,
      bench: 31,
      waste_basket: 148,
      bicycle_parking: 297,
      fire_hydrant: 41,
    })
  })

  test('Albuquerque stays the near-zero control', async ({ page }) => {
    await launchGame(page)
    await enterCity(page, 'Albuquerque, New Mexico')

    const model = await modelStats(page)
    expect(model.furnitureByKind.bench).toBe(2)
    expect(model.furnitureByKind.bus_stop).toBe(24)
    const props = await propStats(page)
    // One of the two mapped benches stands inside a building footprint;
    // the survivor is the city's whole bench population.
    expect(props.furnitureByKind.bench).toBe(1)
  })

  test('a bus shelter is solid: you press against it, never through it', async ({
    page,
  }) => {
    // Same patience arithmetic as the parked-car case (D-79): the walk is
    // measured in rendered frames, and the budget covers the poll's 90 s.
    test.setTimeout(150_000)
    await launchGame(page)
    await enterCity(page)

    // Stand three meters off a shelter's flank, facing it, on ground the
    // collision grid says is open.
    const setup = await page.evaluate(() => {
      const game = window.__cityWalkGame
      // A shelter's footprint is the one 2.4 x 1.2 m obstacle class.
      const shelters = game.props.obstacles.filter(
        (o) => Math.abs(o.halfLengthM - 1.2) < 1e-6
      )
      for (const shelter of shelters) {
        for (const side of [1, -1]) {
          const nx = -Math.sin(shelter.rotationRad)
          const ny = Math.cos(shelter.rotationRad)
          const sx = shelter.x + nx * 3 * side
          const sy = shelter.y + ny * 3 * side
          if (game.collision.isBlocked(sx, sy)) continue
          game.walkState.x = sx
          game.walkState.y = sy
          game.walkState.headingRad = Math.atan2(
            shelter.x - sx,
            shelter.y - sy
          )
          return {
            shelterCount: shelters.length,
            shelter: { x: shelter.x, y: shelter.y },
            start: { x: sx, y: sy },
          }
        }
      }
      return { shelterCount: shelters.length, shelter: null }
    })
    expect(setup.shelterCount).toBeGreaterThan(0)
    expect(setup.shelter).not.toBeNull()

    // Walk at it for 150 rendered frames - enough to cover 3 m several
    // times over - then read where the walker actually is.
    await page.evaluate(() => {
      const game = window.__cityWalkGame
      window.__walkFrames = 0
      const count = () => {
        window.__walkFrames++
        if (window.__walkFrames < 150) requestAnimationFrame(count)
      }
      requestAnimationFrame(count)
      game.altView.invalidate()
    })
    await page.keyboard.down('ArrowUp')
    await page.waitForFunction(() => window.__walkFrames >= 150, null, {
      timeout: 90_000,
    })
    await page.keyboard.up('ArrowUp')

    const after = await page.evaluate(() => {
      const game = window.__cityWalkGame
      return { x: game.walkState.x, y: game.walkState.y }
    })
    const distToShelter = Math.hypot(
      after.x - setup.shelter.x,
      after.y - setup.shelter.y
    )
    const walked = Math.hypot(
      after.x - setup.start.x,
      after.y - setup.start.y
    )
    // Pressed up against the box (its half-diagonal is ~1.34 m plus the
    // walker's own radius), never inside it, and the walk genuinely moved.
    expect(walked).toBeGreaterThan(0.5)
    expect(distToShelter).toBeLessThan(3)
    expect(distToShelter).toBeGreaterThan(0.55)
  })
})

test.describe('ASCII City Walk — attractions in the legend (CW-44, CW-Q44)', () => {
  test('the Seattle Great Wheel is findable by name on the map', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // The Wheel is a point in OSM (attraction=big_wheel, height 53 m): it
    // joins the legend as a named landmark, not as 3D geometry - the plan
    // says that plainly, and this is the generic machinery proving it.
    const attractions = await page.evaluate(() =>
      window.__cityWalkGame.model.attractions.map((a) => a.name)
    )
    expect(attractions).toContain('Seattle Great Wheel')

    await page.keyboard.press('KeyM')
    const legend = page.locator('#cityWalkLegend')
    await expect(legend).toBeVisible()
    await expect(legend).toContainText('Seattle Great Wheel')
    // The Wheel outranks every PLAIN hotel (base 6 + height beats their
    // tourism 3 + height 2). It does not have to be first: the Central
    // Library carries tourism=attraction on its own building and scores 8
    // with its height and block-sized footprint - measured here, and the
    // legend is honest about it. What matters is the Wheel sits above the
    // hotel block it used to be invisible under.
    const rows = await page
      .locator('.city-walk-legend-list li')
      .allInnerTexts()
    const wheelAt = rows.findIndex((r) => r.includes('Seattle Great Wheel'))
    const firstHotelAt = rows.findIndex((r) => /hotel|inn\b/i.test(r))
    expect(wheelAt).toBeGreaterThanOrEqual(0)
    if (firstHotelAt >= 0) expect(wheelAt).toBeLessThan(firstHotelAt)
  })
})
