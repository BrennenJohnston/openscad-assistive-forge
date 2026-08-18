import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  createWalkState,
  stepWalk,
  firstPersonPose,
  headingLabel,
  buildCollisionGrid,
  findSpawn,
  fitOrthoToBounds,
  WALK_SPEED_MPS,
  FAST_SPEED_MPS,
  TURN_SPEED_RADPS,
  EYE_HEIGHT_M,
} from '../../../src/js/game/walk-controls.js'
import { parseCityExtract } from '../../../src/js/game/city-data.js'

const CENTER = { lat: 40, lon: -100 }
const COS_LAT = Math.cos((CENTER.lat * Math.PI) / 180)

function pt(xM, yM) {
  return {
    lat: CENTER.lat + yM / 110540,
    lon: CENTER.lon + xM / (111320 * COS_LAT),
  }
}

function squareRing(cx, cy, half) {
  return [
    pt(cx - half, cy - half),
    pt(cx + half, cy - half),
    pt(cx + half, cy + half),
    pt(cx - half, cy + half),
    pt(cx - half, cy - half),
  ]
}

/** Model with one 10x10 m building centered at (20, 0) and one N-S road at x=0. */
function testModel(extraElements = []) {
  return parseCityExtract(
    {
      elements: [
        {
          type: 'way',
          id: 1,
          tags: { building: 'yes', height: '12' },
          geometry: squareRing(20, 0, 5),
        },
        {
          type: 'way',
          id: 2,
          tags: { highway: 'residential' },
          geometry: [pt(0, -50), pt(0, 0), pt(0, 50)],
        },
        ...extraElements,
      ],
    },
    { center: CENTER }
  )
}

describe('stepWalk — movement math', () => {
  it('moves north at walk speed when facing north', () => {
    const state = createWalkState({ x: 0, y: 0, headingRad: 0 })
    stepWalk(state, { forward: 1 }, 0.1)
    expect(state.x).toBeCloseTo(0, 5)
    expect(state.y).toBeCloseTo(WALK_SPEED_MPS * 0.1, 5)
  })

  it('moves east after a 90-degree clockwise turn', () => {
    const state = createWalkState({ x: 0, y: 0, headingRad: 0 })
    // 90°/s: a full second of right turn
    for (let i = 0; i < 10; i++) stepWalk(state, { turn: 1 }, 0.1)
    expect(state.headingRad).toBeCloseTo(Math.PI / 2, 5)
    stepWalk(state, { forward: 1 }, 0.1)
    expect(state.x).toBeCloseTo(WALK_SPEED_MPS * 0.1, 5)
    expect(state.y).toBeCloseTo(0, 5)
  })

  it('strafes right perpendicular to the bearing', () => {
    const state = createWalkState({ x: 0, y: 0, headingRad: 0 })
    stepWalk(state, { strafe: 1 }, 0.1)
    expect(state.x).toBeCloseTo(WALK_SPEED_MPS * 0.1, 5)
    expect(state.y).toBeCloseTo(0, 5)
  })

  it('normalizes diagonal movement and honors the fast modifier', () => {
    const state = createWalkState({ x: 0, y: 0, headingRad: 0 })
    stepWalk(state, { forward: 1, strafe: 1, fast: true }, 0.1)
    const dist = Math.hypot(state.x, state.y)
    expect(dist).toBeCloseTo(FAST_SPEED_MPS * 0.1, 5)
  })

  it('clamps runaway dt (background tab protection)', () => {
    const state = createWalkState({ x: 0, y: 0, headingRad: 0 })
    stepWalk(state, { forward: 1 }, 5)
    expect(state.y).toBeCloseTo(WALK_SPEED_MPS * 0.1, 5)
  })

  it('turn rate matches TURN_SPEED_RADPS exactly', () => {
    const state = createWalkState({ x: 0, y: 0, headingRad: 0 })
    stepWalk(state, { turn: -1 }, 0.1)
    const tau = Math.PI * 2
    expect(state.headingRad).toBeCloseTo(tau - TURN_SPEED_RADPS * 0.1, 6)
  })
})

describe('firstPersonPose and headingLabel', () => {
  it('places the eye at eye height looking level along the bearing', () => {
    const pose = firstPersonPose({ x: 3, y: 4, headingRad: Math.PI / 2 })
    expect(pose.eye).toEqual([3, 4, EYE_HEIGHT_M])
    expect(pose.target[0]).toBeCloseTo(4, 5)
    expect(pose.target[1]).toBeCloseTo(4, 5)
    expect(pose.target[2]).toBe(EYE_HEIGHT_M)
  })

  it('labels the eight compass sectors', () => {
    expect(headingLabel(0)).toBe('north')
    expect(headingLabel(Math.PI / 2)).toBe('east')
    expect(headingLabel(Math.PI)).toBe('south')
    expect(headingLabel((3 * Math.PI) / 2)).toBe('west')
    expect(headingLabel(Math.PI / 4)).toBe('northeast')
    expect(headingLabel(-Math.PI / 4)).toBe('northwest')
  })
})

describe('buildCollisionGrid', () => {
  it('blocks cells inside buildings and keeps streets walkable', () => {
    const grid = buildCollisionGrid(testModel())
    expect(grid.isBlocked(20, 0)).toBe(true) // building center
    expect(grid.isBlocked(0, 0)).toBe(false) // on the road
    expect(grid.isBlocked(20, 8)).toBe(false) // just north of the building
  })

  it('blocks everything outside the extract bounds', () => {
    const grid = buildCollisionGrid(testModel())
    expect(grid.isBlocked(5000, 5000)).toBe(true)
    expect(grid.isBlocked(-5000, 0)).toBe(true)
  })

  it('keeps courtyards (holes) walkable', () => {
    const model = parseCityExtract(
      {
        elements: [
          {
            type: 'relation',
            id: 10,
            tags: { building: 'yes' },
            members: [
              { type: 'way', ref: 11, role: 'outer', geometry: squareRing(0, 0, 20) },
              { type: 'way', ref: 12, role: 'inner', geometry: squareRing(0, 0, 6) },
            ],
          },
        ],
      },
      { center: CENTER }
    )
    const grid = buildCollisionGrid(model)
    expect(grid.isBlocked(10, 10)).toBe(true) // in the ring of the building
    expect(grid.isBlocked(0, 0)).toBe(false) // courtyard center
  })

  it('ignores elevated parts the player can walk under', () => {
    const model = testModel([
      {
        type: 'way',
        id: 3,
        tags: { building: 'yes', height: '20', min_height: '5' },
        geometry: squareRing(-20, 0, 5),
      },
    ])
    const grid = buildCollisionGrid(model)
    expect(grid.isBlocked(-20, 0)).toBe(false) // skybridge overhead
    expect(grid.isBlocked(20, 0)).toBe(true) // grounded building still solid
  })
})

describe('stepWalk — collision', () => {
  it('stops at a wall and slides along it', () => {
    const model = testModel()
    const grid = buildCollisionGrid(model)
    // Start just west of the building (wall at x=15), facing east.
    const state = createWalkState({ x: 13.5, y: 0, headingRad: Math.PI / 2 })

    for (let i = 0; i < 30; i++) stepWalk(state, { forward: 1 }, 0.1)
    expect(state.x).toBeGreaterThan(15) // without collision it passes the wall
    // Re-run WITH collision from the start position
    const blocked = createWalkState({ x: 13.5, y: 0, headingRad: Math.PI / 2 })
    for (let i = 0; i < 30; i++) stepWalk(blocked, { forward: 1 }, 0.1, grid)
    expect(blocked.x).toBeLessThan(14.8)
    expect(blocked.x).toBeGreaterThan(13.4) // it did approach the wall

    // Facing northeast into the wall: the northward component slides through
    const slider = createWalkState({ x: 14.2, y: -2, headingRad: Math.PI / 4 })
    for (let i = 0; i < 40; i++) stepWalk(slider, { forward: 1 }, 0.1, grid)
    expect(slider.y).toBeGreaterThan(2) // slid north past the building corner
  })
})

describe('findSpawn', () => {
  it('spawns on the road vertex nearest the center', () => {
    const model = testModel()
    const grid = buildCollisionGrid(model)
    const spawn = findSpawn(model, grid)
    expect(spawn.x).toBeCloseTo(0, 1)
    expect(spawn.y).toBeCloseTo(0, 1)
    expect(grid.isBlocked(spawn.x, spawn.y)).toBe(false)
  })

  it('falls back to a clear cell when there are no roads', () => {
    const model = parseCityExtract(
      {
        elements: [
          {
            type: 'way',
            id: 1,
            tags: { building: 'yes' },
            geometry: squareRing(0, 0, 5),
          },
        ],
      },
      { center: CENTER }
    )
    const grid = buildCollisionGrid(model)
    const spawn = findSpawn(model, grid)
    expect(grid.isBlocked(spawn.x, spawn.y)).toBe(false)
  })
})

describe('fitOrthoToBounds', () => {
  it('covers the bounds and preserves aspect', () => {
    const bounds = { minX: -100, maxX: 300, minY: -50, maxY: 50 }
    const f = fitOrthoToBounds(bounds, 2)
    expect(f.centerX).toBe(100)
    expect(f.centerY).toBe(0)
    expect((f.right - f.left) / (f.top - f.bottom)).toBeCloseTo(2, 5)
    expect(f.right - f.left).toBeGreaterThanOrEqual(400)
    expect(f.top - f.bottom).toBeGreaterThanOrEqual(100)
  })
})

describe('integration — the bundled Seattle extract', () => {
  it('parses, rasterizes, and spawns on a street', () => {
    const raw = JSON.parse(
      readFileSync(
        join(process.cwd(), 'public', 'examples', 'ascii-city', 'seattle.json'),
        'utf8'
      )
    )
    const model = parseCityExtract(raw)
    expect(model.stats.buildingCount).toBeGreaterThan(100)
    expect(model.stats.roadCount).toBeGreaterThan(100)

    const grid = buildCollisionGrid(model)
    const spawn = findSpawn(model, grid)
    expect(grid.isBlocked(spawn.x, spawn.y)).toBe(false)
    // Spawn is near the center of the extract, not at a far corner.
    expect(Math.hypot(spawn.x, spawn.y)).toBeLessThan(100)

    // A walker starting at spawn can actually move somewhere in 5 simulated
    // seconds — the downtown grid is not a solid block.
    const state = createWalkState({ ...spawn, headingRad: 0 })
    let moved = false
    for (const heading of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      state.x = spawn.x
      state.y = spawn.y
      state.headingRad = heading
      for (let i = 0; i < 50; i++) stepWalk(state, { forward: 1 }, 0.1, grid)
      if (Math.hypot(state.x - spawn.x, state.y - spawn.y) > 3) {
        moved = true
        break
      }
    }
    expect(moved).toBe(true)
  })
})
