import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  LANDMARK_REGISTRY,
  WAYPOINT_MARK,
  WAYPOINT_TOUCH_M,
  WAYPOINT_LEAVE_M,
  cityLandmarks,
  findWaypointSpot,
  registryFor,
  resolveRegistryRows,
} from '../../../src/js/game/landmark-registry.js'
import {
  extractLandmarks,
  parseCityExtract,
} from '../../../src/js/game/city-data.js'
import {
  buildCollisionGrid,
  buildSurfaceGrid,
  findSpawn,
  stampObstacles,
  PLAYER_RADIUS_M,
} from '../../../src/js/game/walk-controls.js'

const CITY_SLUGS = ['seattle', 'denver', 'albuquerque', 'burnaby']

const models = new Map()
function cityModel(slug) {
  if (!models.has(slug)) {
    models.set(
      slug,
      parseCityExtract(
        JSON.parse(
          readFileSync(
            join(process.cwd(), 'public', 'examples', 'ascii-city', `${slug}.json`),
            'utf8'
          )
        )
      )
    )
  }
  return models.get(slug)
}

describe('the four curated tables, pinned against the shipped extracts', () => {
  // ★ THE PIN CW-63 WROTE FOR TWO DRESSINGS, EXTENDED TO EVERY ROW: a rebake
  // that retires any keyed id fails here, loudly, instead of quietly
  // shrinking a legend.
  for (const slug of CITY_SLUGS) {
    it(`resolves all seven ${slug} rows, in table order`, () => {
      const entry = registryFor(slug)
      expect(entry.rows).toHaveLength(7)
      const resolved = resolveRegistryRows(cityModel(slug), entry.rows)
      expect(resolved.map((r) => r.name)).toEqual(entry.rows.map((r) => r.name))
      for (const r of resolved) {
        expect(Number.isFinite(r.x)).toBe(true)
        expect(Number.isFinite(r.y)).toBe(true)
      }
      // Every row carries its register citation and its one-line case - the
      // auditability the CW-Q70 signing is about.
      for (const row of entry.rows) {
        expect(row.cite?.length).toBeGreaterThan(10)
        expect(row.reason?.length).toBeGreaterThan(10)
      }
      // The progress store keys on the display name, so a duplicate would
      // merge two landmarks' visits.
      expect(new Set(resolved.map((r) => r.name)).size).toBe(7)
    })
  }

  it('fails LOUDLY on a row that matches nothing - a way id', () => {
    const rows = [{ name: 'Nowhere Hall', wayId: 1, cite: 'x', reason: 'x' }]
    expect(() => resolveRegistryRows(cityModel('seattle'), rows)).toThrow(
      /Nowhere Hall.*matches nothing/
    )
  })

  it('fails LOUDLY on a row that matches nothing - a node id', () => {
    const rows = [{ name: 'Ghost Wheel', nodeId: 1, cite: 'x', reason: 'x' }]
    expect(() => resolveRegistryRows(cityModel('seattle'), rows)).toThrow(
      /Ghost Wheel.*matches nothing/
    )
  })

  it('keys the Great Wheel by its NODE and Central Park by its GREEN way', () => {
    // The two kinds of element the CW-63 way-keyed world could not reach.
    const seattle = resolveRegistryRows(
      cityModel('seattle'),
      registryFor('seattle').rows
    )
    const wheel = seattle.find((r) => r.name === 'Seattle Great Wheel')
    expect(wheel.heightM).toBe(53)
    expect(wheel.outer).toBeNull()
    const burnaby = resolveRegistryRows(
      cityModel('burnaby'),
      registryFor('burnaby').rows
    )
    const park = burnaby.find((r) => r.name === 'Central Park')
    expect(park.outer?.length).toBeGreaterThan(3)
    expect(park.heightM).toBe(0)
  })

  it('puts the table order on the legend, not the scorer order', () => {
    // The scorer ranks the Library first and the Needle eleventh; the table
    // leads with the Wheel and the Needle second. If this ever reads scorer
    // order again, the whole point of the registry is gone.
    const model = cityModel('seattle')
    const table = cityLandmarks(model, 'seattle')
    expect(table[0].name).toBe('Seattle Great Wheel')
    expect(table[1].name).toBe('Space Needle')
    const scored = extractLandmarks(model)
    expect(scored[0].name).not.toBe('Seattle Great Wheel')
  })
})

describe('the no-table fallback (CW-Q70: wikidata is the tiebreaker)', () => {
  const CENTER = { lat: 40, lon: -100 }
  const COS = Math.cos((CENTER.lat * Math.PI) / 180)
  const pt = (xM, yM) => ({
    lat: CENTER.lat + yM / 110540,
    lon: CENTER.lon + xM / (111320 * COS),
  })
  const ring = (cx, cy, h) => [
    pt(cx - h, cy - h),
    pt(cx + h, cy - h),
    pt(cx + h, cy + h),
    pt(cx - h, cy + h),
    pt(cx - h, cy - h),
  ]
  const tower = (id, cx, name, height, extra = {}) => ({
    type: 'way',
    id,
    tags: { building: 'yes', height: String(height), name, ...extra },
    geometry: ring(cx, 0, 20),
  })

  function syntheticCity({ withWikidata }) {
    return parseCityExtract(
      {
        elements: [
          // Both reach score 2 through height alone (>= 60). The taller one
          // would win on the old arithmetic; wikidata on the shorter flips it.
          tower(1, -100, 'Tall Silent Tower', 90),
          tower(
            2,
            100,
            'Documented Tower',
            70,
            withWikidata ? { wikidata: 'Q1' } : {}
          ),
        ],
      },
      { center: CENTER }
    )
  }

  it('ranks a documented landmark over a taller silent one', () => {
    const names = cityLandmarks(
      syntheticCity({ withWikidata: true }),
      'nowhere'
    ).map((l) => l.name)
    expect(names[0]).toBe('Documented Tower')
  })

  it('falls back to the height arithmetic when both are silent', () => {
    // The red proof for the tiebreak above: same city, wikidata removed,
    // and the old order comes back.
    const names = cityLandmarks(
      syntheticCity({ withWikidata: false }),
      'nowhere'
    ).map((l) => l.name)
    expect(names[0]).toBe('Tall Silent Tower')
  })
})

describe('the waypoint spots (CW-Q71)', () => {
  // These two walk the real 9,148-way Seattle model seven times over; under
  // a loaded board they cross vitest's 10 s default without being stuck.
  it('stands every Seattle landmark on clear public pavement', { timeout: 40000 }, () => {
    const model = cityModel('seattle')
    const collision = buildCollisionGrid(model)
    const surface = buildSurfaceGrid(model)
    const landmarks = cityLandmarks(model, 'seattle')
    for (const lm of landmarks) {
      const spot = findWaypointSpot(model, collision, surface, lm)
      expect(spot, lm.name).toBeTruthy()
      expect(spot.placement, lm.name).toBe('pavement')
      // The surface grid's own definition of pavement, and a clear cell -
      // the same two tests the placement makes, re-asked from outside.
      expect(surface.heightAt(spot.x, spot.y), lm.name).toBe(0)
      expect(collision.isBlocked(spot.x, spot.y), lm.name).toBe(false)
      expect(Math.hypot(spot.x - lm.x, spot.y - lm.y), lm.name).toBeLessThan(120)
    }
  })

  it('blocks the plinth cell once stamped, so a walk can touch it', { timeout: 40000 }, async () => {
    const { buildWaypointMarks } = await import(
      '../../../src/js/game/city-scene.js'
    )
    const model = cityModel('seattle')
    const collision = buildCollisionGrid(model)
    const surface = buildSurfaceGrid(model)
    const lm = cityLandmarks(model, 'seattle')[0]
    const spot = findWaypointSpot(model, collision, surface, lm)
    expect(collision.isBlocked(spot.x, spot.y)).toBe(false)
    const marks = buildWaypointMarks([spot])
    expect(marks.obstacles).toHaveLength(1)
    stampObstacles(collision, marks.obstacles)
    expect(collision.isBlocked(spot.x, spot.y)).toBe(true)
    marks.dispose()
  })

  it('sizes the mark for the character grid, not for taste', () => {
    // CW-Q71's floor: at least five character rows at 40 m at the default
    // size. Game viewport 756 px over a 60 degree field; the 30% cell is
    // 3 x 6 px (T41: the ladder is 10/30/40/50 and 30% is the default).
    const GAME_VIEWPORT_H = 756
    const pxPerM = GAME_VIEWPORT_H / (2 * 40 * Math.tan(Math.PI / 6))
    const CELL_H_PX = 6
    expect((WAYPOINT_MARK.manHeightM * pxPerM) / CELL_H_PX).toBeGreaterThan(5)
    // The core must be able to CONTAIN the figure - a man poking out of the
    // hole would bridge the ring and the CW-40 footprint would be gone.
    expect(WAYPOINT_MARK.manHeightM / 2).toBeLessThan(WAYPOINT_MARK.ringInnerM)
    expect(WAYPOINT_MARK.ringInnerM).toBeLessThan(WAYPOINT_MARK.ringOuterM)
    // Touch must be reachable: a walker stops about plinth-half + body
    // radius from the centre, and the touch ring must reach past that.
    expect(WAYPOINT_TOUCH_M).toBeGreaterThan(
      WAYPOINT_MARK.plinthHalfM + PLAYER_RADIUS_M
    )
    expect(WAYPOINT_LEAVE_M).toBeGreaterThan(WAYPOINT_TOUCH_M)
  })
})

describe("CW-78's spawn rule", () => {
  it('spawns Seattle within 200 m of the Great Wheel, outside 60 m', () => {
    const model = cityModel('seattle')
    const collision = buildCollisionGrid(model)
    const wheel = cityLandmarks(model, 'seattle')[0]
    const spawn = findSpawn(model, collision, {
      nearX: wheel.x,
      nearY: wheel.y,
      withinM: 200,
      minM: 60,
    })
    const d = Math.hypot(spawn.x - wheel.x, spawn.y - wheel.y)
    expect(d).toBeLessThan(200)
    expect(d).toBeGreaterThanOrEqual(60)
  })

  it('keeps the centre rule when no anchor is given', () => {
    // The pre-CW-78 behaviour, unchanged for a synthetic city or a caller
    // with no registry: nearest clear road vertex to the extract centre.
    const model = cityModel('seattle')
    const collision = buildCollisionGrid(model)
    const spawn = findSpawn(model, collision)
    expect(Math.hypot(spawn.x, spawn.y)).toBeLessThan(60)
  })
})

describe('the registry names its own gaps', () => {
  it('records the register rows the extracts cannot key', () => {
    // Union Station is outside Denver's circle; Burnaby's stadium, gate,
    // mall and tallest tower are unmapped as named elements. The module's
    // own comment is the record - this pins that no row quietly PRETENDS to
    // be one of them under another id.
    for (const slug of CITY_SLUGS) {
      for (const row of LANDMARK_REGISTRY[slug].rows) {
        expect(row.name).not.toMatch(/union station|swangard|sovereign/i)
      }
    }
  })
})
