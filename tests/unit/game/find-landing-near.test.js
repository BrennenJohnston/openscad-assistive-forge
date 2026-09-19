import { describe, it, expect } from 'vitest'
import {
  findLandingNear,
  LANDING_SNAP_M,
  LANDING_SEARCH_M,
  PLAYER_RADIUS_M,
} from '../../../src/js/game/walk-controls.js'

/**
 * findLandingNear — where a player dropped on the map actually lands (CW-36).
 *
 * The oracle these cases hold it to is the same one the walker itself uses:
 * a landing must never be a place the player could not have walked to.
 */

/** A collision oracle that blocks an axis-aligned rectangle. */
const blockRect = (minX, minY, maxX, maxY) => ({
  isBlocked: (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY,
})

const NOTHING_BLOCKED = { isBlocked: () => false }
const EVERYTHING_BLOCKED = { isBlocked: () => true }

const bounds = { minX: -500, minY: -500, maxX: 500, maxY: 500 }

/** One straight street running east-west along y = 0. */
const eastWestCity = {
  boundsM: bounds,
  roads: [{ name: 'Pine Street', points: [[-200, 0], [200, 0]] }],
}

describe('findLandingNear', () => {
  it('snaps to the middle of a long block, not to its endpoints', () => {
    // The whole point of projecting onto the segment. OSM digitizes this
    // street as two points 400 m apart; a vertex-only snap would land the
    // player 100 m away at the end of the road instead of where they picked.
    const landing = findLandingNear(eastWestCity, NOTHING_BLOCKED, 100, 8)
    expect(landing).not.toBeNull()
    expect(landing.onRoad).toBe(true)
    expect(landing.x).toBeCloseTo(100, 6)
    expect(landing.y).toBeCloseTo(0, 6)
  })

  it('faces along the street, toward the longer half', () => {
    // Landing at x = -150 leaves 350 m of street to the east and 50 m to the
    // west, so the player should be looking east: heading = +90 degrees.
    const east = findLandingNear(eastWestCity, NOTHING_BLOCKED, -150, 0)
    expect(east.headingRad).toBeCloseTo(Math.PI / 2, 6)

    // normalizeHeading returns [0, 2pi), so west is 3pi/2 rather than -pi/2.
    const west = findLandingNear(eastWestCity, NOTHING_BLOCKED, 150, 0)
    expect(west.headingRad).toBeCloseTo((3 * Math.PI) / 2, 6)
  })

  it('refuses the road and finds open ground when the road is blocked', () => {
    // A building laid over the street itself: the projection is blocked, so
    // no road candidate survives and the spiral takes over.
    const landing = findLandingNear(
      eastWestCity,
      blockRect(80, -10, 120, 10),
      100,
      0
    )
    expect(landing).not.toBeNull()
    expect(landing.onRoad).toBe(false)
    expect(landing.headingRad).toBeNull()
    // Whatever it found, it is somewhere the player could stand.
    expect(landing.y > 10 || landing.y < -10 || landing.x > 120 || landing.x < 80).toBe(true)
  })

  it('never lands inside a building — the whole player circle is clear', () => {
    const collision = blockRect(-40, -40, 40, 40)
    const city = { boundsM: bounds, roads: [] }
    const landing = findLandingNear(city, collision, 0, 0)
    expect(landing).not.toBeNull()
    for (const [dx, dy] of [
      [0, 0],
      [PLAYER_RADIUS_M, 0],
      [-PLAYER_RADIUS_M, 0],
      [0, PLAYER_RADIUS_M],
      [0, -PLAYER_RADIUS_M],
    ]) {
      expect(collision.isBlocked(landing.x + dx, landing.y + dy)).toBe(false)
    }
  })

  it('refuses when there is nowhere at all to stand', () => {
    const city = { boundsM: bounds, roads: [] }
    expect(findLandingNear(city, EVERYTHING_BLOCKED, 0, 0)).toBeNull()
  })

  it('clamps a pick outside the city instead of refusing it', () => {
    // Out-of-bounds cells count as blocked by construction, so without the
    // clamp a click on the black beyond the extract would spiral through
    // nothing but blocked cells and refuse.
    const landing = findLandingNear(eastWestCity, NOTHING_BLOCKED, 9000, 9000)
    expect(landing).not.toBeNull()
    expect(landing.x).toBeLessThanOrEqual(bounds.maxX)
    expect(landing.y).toBeLessThanOrEqual(bounds.maxY)
  })

  it('does not snap to a street further away than the snap radius', () => {
    const justOutside = findLandingNear(
      eastWestCity,
      NOTHING_BLOCKED,
      0,
      LANDING_SNAP_M + 1
    )
    expect(justOutside.onRoad).toBe(false)

    const justInside = findLandingNear(
      eastWestCity,
      NOTHING_BLOCKED,
      0,
      LANDING_SNAP_M - 1
    )
    expect(justInside.onRoad).toBe(true)
  })

  it('picks the nearer of two streets', () => {
    const city = {
      boundsM: bounds,
      roads: [
        { name: 'Pine Street', points: [[-200, 0], [200, 0]] },
        { name: 'Pike Street', points: [[-200, 20], [200, 20]] },
      ],
    }
    expect(findLandingNear(city, NOTHING_BLOCKED, 0, 3).y).toBeCloseTo(0, 6)
    expect(findLandingNear(city, NOTHING_BLOCKED, 0, 17).y).toBeCloseTo(20, 6)
  })

  it('is deterministic', () => {
    const collision = blockRect(-40, -40, 40, 40)
    const city = { boundsM: bounds, roads: [] }
    const a = findLandingNear(city, collision, 10, 10)
    const b = findLandingNear(city, collision, 10, 10)
    expect(a).toEqual(b)
  })

  it('rejects a target that is not a number', () => {
    expect(findLandingNear(eastWestCity, NOTHING_BLOCKED, NaN, 0)).toBeNull()
    expect(
      findLandingNear(eastWestCity, NOTHING_BLOCKED, 0, undefined)
    ).toBeNull()
  })

  it('honours an overridden search radius', () => {
    // Blocked everywhere within 50 m of the pick, nothing beyond it.
    const collision = blockRect(-50, -50, 50, 50)
    const city = { boundsM: bounds, roads: [] }
    expect(
      findLandingNear(city, collision, 0, 0, { searchM: 10 })
    ).toBeNull()
    expect(
      findLandingNear(city, collision, 0, 0, { searchM: LANDING_SEARCH_M })
    ).not.toBeNull()
  })
})
