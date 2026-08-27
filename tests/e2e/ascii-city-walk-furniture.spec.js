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

    // The extract's own counts. CW-44's fallback bake (shifted center
    // 47.612,-122.340, r=1300 - the signed rule) re-measured these from
    // the shipped blob; the CW-43-era 707 m numbers were 71/31/155/309/43.
    const model = await modelStats(page)
    expect(model.furnitureByKind).toEqual({
      bus_stop: 156,
      bench: 280,
      waste_basket: 306,
      bicycle_parking: 853,
      fire_hydrant: 112,
    })
    // The data-only wayfinding layer rides the model untouched.
    //
    // CW-55 rebaked all four cities and this is the ONLY count that moved:
    // 5354 -> 5355, one crossing or kerb node added to Seattle's OSM between
    // 2026-08-24 and 2026-08-26. Every furniture count above, and every placed
    // count below, came back identical - which is the reassuring half of a
    // rebake and worth writing down, because a rebake that moved everything
    // would mean the bake had changed rather than the map.
    expect(model.wayfindingCount).toBe(5355)

    // What actually stands in the city: the same numbers minus nodes that
    // fall inside a building footprint or duplicate one another - measured
    // once, deterministic forever (hash-seeded placement, versioned data).
    const props = await propStats(page)
    expect(props.furnitureByKind).toEqual({
      bus_stop: 154,
      bench: 268,
      waste_basket: 285,
      bicycle_parking: 811,
      fire_hydrant: 109,
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

/**
 * CW-57 (CW-Q55): plantings and picnic tables, from the same real data.
 *
 * Exact counts for the same reason the furniture's are exact: versioned
 * extracts and hash-seeded deterministic placement, so any drift here is a
 * change someone must own. And the split between data and fallback is pinned
 * separately, because the whole law is that REAL DATA WINS - a city with
 * mapped planters must never grow invented ones beside them.
 */
test.describe('ASCII City Walk — plantings (CW-57)', () => {
  test('Seattle plants only what its map records', async ({ page }) => {
    await launchGame(page)
    await enterCity(page)

    const model = await modelStats(page)
    // What CW-55's rebake actually holds. The plan's section 1f said 20
    // planters and 69 flowerbeds; the extract says otherwise, and this is
    // the extract.
    expect(model.plantingByKind).toEqual({ planter: 11, flowerbed: 56 })
    expect(model.picnicTableCount).toBe(26)

    const props = await propStats(page)
    // What survives a building footprint, a neighbour's spacing, or a tree
    // too close - measured once, deterministic forever.
    expect(props.plantingPlaced).toEqual({
      planter: 8,
      flowerbed: 36,
      picnic_table: 22,
    })
    // ★ REAL DATA WINS: a city with mapped planters invents none.
    expect(props.fallbackPlanters).toBe(0)
  })

  test('Denver has no plantings at all, and says so rather than pretending', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page, 'Denver, Colorado')

    const model = await modelStats(page)
    // Zero planters, zero flowerbeds, zero picnic tables in the data. The
    // empty rows are a result, not a gap: Denver simply is not mapped for
    // these, and inventing tables would be decorative scatter.
    expect(model.plantingCount).toBe(0)
    expect(model.picnicTableCount).toBe(0)

    const props = await propStats(page)
    expect(props.plantingPlaced.picnic_table).toBe(0)
    expect(props.plantingPlaced.flowerbed).toBe(0)
    // The directive's fallback fires HERE, and only here, and is counted
    // apart from the data so a reader can always tell design from map.
    expect(props.fallbackPlanters).toBe(40)
    expect(props.plantingPlaced.planter).toBe(props.fallbackPlanters)
  })

  test('★ every city gets its own birds, on perches it actually has', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    const props = await propStats(page)
    expect(props.birdsPlaced).toEqual({
      'house sparrow': 47,
      gull: 76,
      'rock pigeon': 104,
      'american crow': 122,
    })
    // Seattle's roster has no goose and no roadrunner, so it has none placed.
    // A roster is a claim about a city and this is where it is checked.
    expect(props.birdsPlaced['canada goose']).toBeUndefined()
    expect(props.birdsPlaced['greater roadrunner']).toBeUndefined()
  })

  test('★★ Albuquerque keeps its roadrunner, which needed the ROADSIDE', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page, 'Albuquerque, New Mexico')

    const props = await propStats(page)
    // ★ THIS PIN EXISTS BECAUSE THE NUMBER WAS ONCE 1. The roadrunner is
    // Albuquerque's own bird and the whole argument for per-city rosters, and
    // one of it in a city is the same as none. The cause was not the rate:
    // the desert city has 24 mapped greens and only five over 400 m2, so
    // parkland is structurally scarce. Separating pavement from parkland -
    // which is where a roadrunner actually runs - took it to 15. If a later
    // change quietly starves it again, this fails.
    expect(props.birdsPlaced['greater roadrunner']).toBe(15)
    expect(props.birdsPlaced['rock pigeon']).toBe(81)
    // No crow and no gull on this roster, so none anywhere in the city.
    expect(props.birdsPlaced['american crow']).toBeUndefined()
    expect(props.birdsPlaced.gull).toBeUndefined()
  })

  test('★ geese come in flocks, so a city with few lawns still has a gathering', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page, 'Denver, Colorado')

    const props = await propStats(page)
    // ★ AND THIS PIN EXISTS BECAUSE A FIX BROKE SOMETHING ELSE. Letting the
    // crow onto lawns - which the proof gate said was right - handed it and
    // the gull two thirds of every ground site and dropped Burnaby from nine
    // geese to one. Geese gather on open grass, so they are placed as small
    // flocks, which is both the fix and the fact.
    expect(props.birdsPlaced['canada goose']).toBe(51)
    expect(props.birdsPlaced['canada goose']).toBeGreaterThan(
      props.birdsPlaced['american crow']
    )
  })
})
