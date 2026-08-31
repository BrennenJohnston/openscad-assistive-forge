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
    //
    // CW-77 rebaked all four cities and two of these five moved: a waste
    // basket and two bicycle stands, which is what a fortnight of OSM edits
    // looks like. THE CAUSE IS THE MAP AND NOT THE CODE, and that is proved
    // rather than assumed: CW-77's builders run against the PREVIOUS
    // extracts reproduce 156 / 280 / 306 / 853 / 112 exactly, and the
    // wayfinding count below with them.
    const model = await modelStats(page)
    expect(model.furnitureByKind).toEqual({
      bus_stop: 156,
      bench: 280,
      waste_basket: 304,
      bicycle_parking: 855,
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
    //
    // CW-77's rebake moved it back: 5355 -> 5354, one node gone again.
    expect(model.wayfindingCount).toBe(5354)

    // What actually stands in the city: the same numbers minus nodes that
    // fall inside a building footprint or duplicate one another - measured
    // once, deterministic forever (hash-seeded placement, versioned data).
    //
    // CW-76 moved three of the five, and the cause is the collision grid
    // rather than the placement: 42 canopies stopped blocking their
    // footprints and one grounded volume started, so a bus stop, three
    // benches and a waste basket that used to stand against a `building=roof`
    // now have room. Re-derived from an independent Node run of the same
    // builders - the new model against the OLD collision bases reproduces
    // 154 / 268 / 285 exactly, which is what pins the cause.
    //
    // CW-77 moved three of them again, by the same two nodes the map lost
    // and gained plus their neighbours: bench 271 -> 269, waste basket
    // 286 -> 284, bicycle parking 811 -> 813. Same proof as above - CW-77's
    // builders on the PREVIOUS extracts reproduce 155 / 271 / 286 / 811 /
    // 109 to the item, so no placement rule changed here.
    const props = await propStats(page)
    expect(props.furnitureByKind).toEqual({
      bus_stop: 155,
      bench: 269,
      waste_basket: 284,
      bicycle_parking: 813,
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
    // CW-75 re-pinned these. An "open ground" perch is a spot a couple of
    // metres off a LAMP POST, which is how the bird code finds pavement
    // without a pavement polygon - so the roster follows the lamp count.
    // Seattle's lamps went 2,560 -> 2,173 when every pole standing in a
    // roadway was refused, and the birds went with the poles they were
    // perched beside. What left the city is a bird standing on tarmac.
    //
    // ★ AND CW-77 RAN THE SAME ARITHMETIC THE OTHER WAY. Seattle stopped
    // inventing every one of its lamps and took Seattle City Light's
    // surveyed register instead: 2,174 poles became 4,221. The perch count
    // followed the pole count, near enough proportionally (2,174 -> 4,221
    // is x1.94; 309 birds -> 526 is x1.70, the shortfall being perches that
    // now fall too close to a neighbour). This is the pin working as
    // designed: it does not care which way the roster moves, only that it
    // moves WITH the poles and never collapses.
    expect(props.birdsPlaced).toEqual({
      'house sparrow': 89,
      gull: 103,
      'rock pigeon': 154,
      'american crow': 180,
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
    //
    // ★ IT FIRED, AND IT WAS CHECKED RATHER THAN RE-PINNED. CW-75 took it to
    // 13. An open-ground perch is a spot beside a LAMP POST, and Albuquerque's
    // lamps fell 1,068 -> 915 (14 %) when every pole standing in a roadway was
    // refused; the roadrunner fell 13 %, which is the same cut and no more.
    // The perches that went were the ones hanging off poles that stood in the
    // carriageway, so the bird did not lose habitat - it stopped standing in
    // traffic. Thirteen is not one, and the pin below still guards the number
    // that mattered.
    //
    // ★★ AND IT FIRED AGAIN, AND THAT TIME IT CHANGED THE RELEASE. CW-77's
    // first spacing put an ordinary street's lamps 55 m apart, which is what
    // the release plan quoted from Seattle Streets Illustrated. Albuquerque's
    // lamps fell 915 -> 545 (40 %) and the roadrunner fell 13 -> 5 (62 %) - a
    // DISPROPORTIONATE cut, and five is close to the one this pin exists to
    // prevent. Reading the standard's whole sentence rather than half of it
    // ("street lights alternating every 180 ft, PEDESTRIAN LIGHTS BETWEEN
    // THEM AT 60 FT") gives an 18 m interval, which is also what Seattle City
    // Light's surveyed register measures (16.7 m median over 3,679 poles).
    // At 18 m Albuquerque has 1,507 lamps and the roadrunner has 23. The bird
    // pin is the thing that caught a misread standard.
    expect(props.birdsPlaced['greater roadrunner']).toBe(23)
    expect(props.birdsPlaced['rock pigeon']).toBe(105)
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
    //
    // ★★ AND THE COMPARISON BELOW USED TO BE ON THE TOTALS, WHICH IS NOT
    // WHERE THE COMPETITION HAPPENS. A goose stands on ONE perch kind -
    // `ground`, a mapped lawn (city-birds.js SPECIES_PERCHES) - while the
    // crow also works parapets, lamp heads and the open ground beside a
    // pole. So the crow's TOTAL moves with the city's lamp count and says
    // nothing about lawns. CW-77 took Denver from 711 lamps to 1,336, the
    // crow went 28 -> 54 on perches a goose can never use, and the goose
    // stayed at exactly 51 - not one bird lost. The old line failed on a
    // city where nothing it cared about had changed.
    //
    // Measured on the perch that matters (props.stats.birdsByPerch.ground):
    // goose 51, crow 8, pigeon 7. The goose holds 77 % of Denver's lawn
    // birds. Burnaby, the city that fell to one goose and prompted the
    // flock fix, reads goose 8, gull 5, crow 3 - and went 3 -> 8 under
    // CW-77 rather than down. This is the same worry, asked where it can
    // be answered, and it is STRICTER: the failure it was written for
    // (crow and gull taking two thirds of the ground sites) shows up here
    // directly instead of through a total that four other perches move.
    const ground = props.birdsByPerch.ground
    expect(ground['canada goose']).toBe(51)
    expect(ground['canada goose']).toBeGreaterThan(ground['american crow'])
  })

  /**
   * CW-63 (CW-Q56): the landmark dressings, in a browser.
   *
   * The unit guards can count triangles but they run in jsdom, where
   * `getContext('2d')` is not implemented and every facade texture comes back
   * null. Whether the diagrid CANVAS is actually painted - and painted at the
   * size its metre repeat assumes - is a fact only a real browser holds.
   */
  const facadeMeshes = (page) =>
    page.evaluate(() => {
      const found = []
      window.__cityWalkGame.scene.traverse((o) => {
        if (!o.isMesh || o.name !== 'buildings') return
        const image = o.material.map?.image ?? null
        found.push({
          triangles: o.geometry.getAttribute('position').count / 3,
          texture: image ? [image.width, image.height] : null,
        })
      })
      return found
    })

  test('★ Seattle wears exactly one diagrid, and it is a real canvas', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    const meshes = await facadeMeshes(page)
    // Nine generic facade families plus the one reserved for dressings.
    expect(meshes).toHaveLength(10)
    const diagrid = meshes.at(-1)
    // Five platforms and four flowing planes off a 12-point outline: five
    // extrusions of 44 triangles, four lofts of one quad per edge.
    expect(diagrid.triangles).toBe(316)
    // ★ THE SIZE IS NOT DECORATION. The repeat is set as one over the tile's
    // METRE span, so a canvas of a different size would run the lattice at a
    // different scale than the member width was photographed at.
    expect(diagrid.texture).toEqual([256, 512])
    // Every generic family is a real share of the city and wears the 8x12
    // bay window tile, so a landmark cannot have leaked into one.
    for (const m of meshes.slice(0, -1)) {
      expect(m.triangles).toBeGreaterThan(1000)
      expect(m.texture).toEqual([512, 576])
    }
  })

  test('★ Denver has no dressed landmark, so it has no diagrid at all', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page, 'Denver, Colorado')

    const meshes = await facadeMeshes(page)
    // The bucket exists in every city and stays EMPTY here, so no tenth mesh
    // is ever made. This is the control photograph as an assertion.
    expect(meshes).toHaveLength(9)
    for (const m of meshes) expect(m.texture).toEqual([512, 576])
  })
})
