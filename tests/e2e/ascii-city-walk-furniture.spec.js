import { test, expect } from '@playwright/test'
import {
  useCityWalkFixtures,
  launchGame,
  enterCity,
} from './helpers/city-walk.js'

useCityWalkFixtures()

/**
 * Street furniture from real data, and attraction nodes in the landmark
 * legend.
 *
 * The furniture is wayfinding information for a blind traveler, so the
 * counts are exact: the extracts are versioned fixtures and the placement is
 * hash-seeded deterministic, so any drift here is a real change someone must
 * own, never noise.
 */

const modelStats = (page) =>
  page.evaluate(() => window.__cityWalkGame?.model?.stats ?? null)

const propStats = (page) =>
  page.evaluate(() => window.__cityWalkGame?.props?.stats ?? null)

test.describe('ASCII City Walk — street furniture', () => {
  test('Seattle carries its real furniture, counted class by class', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // The extract's own counts. When a rebake moves them, check the cause
    // before re-pinning: the current builders run against the previous
    // extracts reproduce the previous numbers exactly when the change is the
    // map's (OpenStreetMap edits) and not the code's.
    const model = await modelStats(page)
    expect(model.furnitureByKind).toEqual({
      bus_stop: 156,
      bench: 280,
      waste_basket: 304,
      bicycle_parking: 855,
      fire_hydrant: 112,
    })
    // The data-only wayfinding layer rides the model untouched. A rebake that
    // moves only this count by a node or two is the map changing; one that
    // moved everything would mean the bake had changed.
    expect(model.wayfindingCount).toBe(5354)

    // What actually stands in the city: the same numbers minus nodes that
    // fall inside a building footprint or duplicate one another, deterministic
    // (hash-seeded placement, versioned data). These follow the collision grid
    // as well as the map: a canopy that stops blocking its footprint gives a
    // bench beside it room. Before re-pinning, run the builders against the old
    // collision bases and the old extracts to find which one moved them.
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
    // Same patience arithmetic as the parked-car case: the walk is
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

test.describe('ASCII City Walk — attractions in the legend', () => {
  test('the Seattle Great Wheel is findable by name on the map', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // The Wheel is a point in OSM (attraction=big_wheel, height 53 m): it
    // joins the legend as a named landmark, not as 3D geometry, through the
    // generic attraction machinery.
    const attractions = await page.evaluate(() =>
      window.__cityWalkGame.model.attractions.map((a) => a.name)
    )
    expect(attractions).toContain('Seattle Great Wheel')

    await page.keyboard.press('KeyM')
    const legend = page.locator('#cityWalkLegend')
    await expect(legend).toBeVisible()
    await expect(legend).toContainText('Seattle Great Wheel')
    // The Wheel outranks every plain hotel (base 6 + height beats their
    // tourism 3 + height 2). It does not have to be first: the Central
    // Library carries tourism=attraction on its own building and scores 8
    // with its height and block-sized footprint. What matters is that the
    // Wheel sits above the hotel block.
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
 * Plantings and picnic tables, from the same real data.
 *
 * Exact counts for the same reason the furniture's are exact: versioned
 * extracts and hash-seeded deterministic placement, so any drift here is a
 * change someone must own. The split between data and fallback is pinned
 * separately, because real data wins: a city with mapped planters must
 * never grow invented ones beside them.
 */
test.describe('ASCII City Walk — plantings', () => {
  test('Seattle plants only what its map records', async ({ page }) => {
    await launchGame(page)
    await enterCity(page)

    const model = await modelStats(page)
    // The extract's own planting counts.
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
    // Real data wins: a city with mapped planters invents none.
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
    // The fallback fires here, and only here, and is counted
    // apart from the data so a reader can always tell design from map.
    expect(props.fallbackPlanters).toBe(40)
    expect(props.plantingPlaced.planter).toBe(props.fallbackPlanters)
  })

  test('every city gets its own birds, on perches it actually has', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    const props = await propStats(page)
    // An "open ground" perch is a spot a couple of meters off a lamp post,
    // which is how the bird code finds pavement without a pavement polygon, so
    // the roster follows the lamp count: a city whose lamp count changes moves
    // its open-ground birds with it, near enough proportionally (a little less,
    // as more perches fall too close to a neighbour). The pin does not care
    // which way the roster moves, only that it moves with the poles and never
    // collapses.
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

  test('Albuquerque keeps its roadrunner, which needed the roadside', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page, 'Albuquerque, New Mexico')

    const props = await propStats(page)
    // The roadrunner is Albuquerque's own bird and the whole argument for
    // per-city rosters, and one of it in a city is the same as none. Parkland
    // is structurally scarce in the desert city (24 mapped greens, only five
    // over 400 m2), so the bird runs on pavement as well as parkland, and its
    // count depends on the lamp spacing. An ordinary street's lamps are 18 m
    // apart: Seattle Streets Illustrated has street lights alternating every
    // 180 ft with pedestrian lights between them at 60 ft, which is also what
    // Seattle City Light's surveyed register measures (a 16.7 m median over
    // 3,679 poles). Read as 55 m, the spacing cut the roadrunner to five; if a
    // change quietly starves it again, this fails.
    expect(props.birdsPlaced['greater roadrunner']).toBe(23)
    // Albuquerque's corridor ways are not roadways, so an open-ground perch
    // beside a lamp on one does not count as standing in traffic.
    expect(props.birdsPlaced['rock pigeon']).toBe(106)
    // No crow and no gull on this roster, so none anywhere in the city.
    expect(props.birdsPlaced['american crow']).toBeUndefined()
    expect(props.birdsPlaced.gull).toBeUndefined()
  })

  test('geese come in flocks, so a city with few lawns still has a gathering', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page, 'Denver, Colorado')

    const props = await propStats(page)
    // The crow and the gull may use lawns too, and without a counterweight
    // they took two thirds of every ground site and left Burnaby one goose.
    // Geese gather on open grass, so they are placed as small flocks.
    expect(props.birdsPlaced['canada goose']).toBe(51)
    // The comparison is made on the perch where the competition happens. A
    // goose stands on one perch kind, `ground`, a mapped lawn (city-birds.js
    // SPECIES_PERCHES), while the crow also works parapets, lamp heads and the
    // open ground beside a pole, so the crow's total moves with the city's
    // lamp count and says nothing about lawns. On the ground perch Denver reads
    // goose 51, crow 8, pigeon 7 (the goose holds 77 % of its lawn birds), and
    // Burnaby goose 8, gull 5, crow 3. A crow and gull taking two thirds of the
    // ground sites shows up here directly.
    const ground = props.birdsByPerch.ground
    expect(ground['canada goose']).toBe(51)
    expect(ground['canada goose']).toBeGreaterThan(ground['american crow'])
  })

  /**
   * The landmark dressings, in a browser.
   *
   * The unit guards can count triangles but they run in jsdom, where
   * `getContext('2d')` is not implemented and every facade texture comes back
   * null. Whether the diagrid canvas is actually painted - and painted at the
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

  test('Seattle wears exactly one diagrid, and it is a real canvas', async ({
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
    expect(diagrid.triangles).toBe(360) // 44 of them are the Library's own skirt, its footprint and nobody else's
    // The size is not decoration. The repeat is set as one over the tile's
    // meter span, so a canvas of a different size would run the lattice at a
    // different scale than the member width was photographed at.
    expect(diagrid.texture).toEqual([256, 512])
    // Every generic family is a real share of the city and wears the 8x12
    // bay window tile, so a landmark cannot have leaked into one.
    for (const m of meshes.slice(0, -1)) {
      expect(m.triangles).toBeGreaterThan(1000)
      expect(m.texture).toEqual([512, 576])
    }
  })

  test('Denver has no dressed landmark, so it has no diagrid at all', async ({
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
