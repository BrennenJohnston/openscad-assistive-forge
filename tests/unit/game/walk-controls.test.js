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
  createMapCamera,
  stepMapCamera,
  recenterMapCamera,
  mapCameraFrustum,
  MAP_ZOOM_MIN,
  MAP_ZOOM_MAX,
  WALK_SPEED_MPS,
  FAST_SPEED_MPS,
  TURN_SPEED_RADPS,
  EYE_HEIGHT_M,
  applyLookDelta,
  levelView,
  pitchLabel,
  PITCH_SPEED_RADPS,
  PITCH_LIMIT_RAD,
  clampCharScale,
  seedCharScale,
  CHAR_SCALE_MIN,
  CHAR_SCALE_MAX,
  CHAR_SCALE_STEP,
  CHAR_SCALE_DEFAULT,
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

describe('stepWalk — speed multiplier (CW-Q8)', () => {
  it('scales the walking speed and clamps to 0.5–3.0', () => {
    const state = createWalkState({ x: 0, y: 0, headingRad: 0 })
    stepWalk(state, { forward: 1, speedScale: 2 }, 0.1)
    expect(state.y).toBeCloseTo(WALK_SPEED_MPS * 2 * 0.1, 5)

    const slow = createWalkState({ x: 0, y: 0, headingRad: 0 })
    stepWalk(slow, { forward: 1, speedScale: 0.1 }, 0.1)
    expect(slow.y).toBeCloseTo(WALK_SPEED_MPS * 0.5 * 0.1, 5)
  })

  it('Shift sprint keeps its floor and scales past it', () => {
    // At 1x, sprint = the 4 m/s floor.
    const a = createWalkState({ x: 0, y: 0, headingRad: 0 })
    stepWalk(a, { forward: 1, fast: true, speedScale: 1 }, 0.1)
    expect(a.y).toBeCloseTo(FAST_SPEED_MPS * 0.1, 5)

    // At 3x, walking (4.8) exceeds the floor — sprint never goes SLOWER
    // than walking.
    const b = createWalkState({ x: 0, y: 0, headingRad: 0 })
    stepWalk(b, { forward: 1, fast: true, speedScale: 3 }, 0.1)
    expect(b.y).toBeCloseTo(WALK_SPEED_MPS * 3 * 0.1, 5)
  })
})

describe('map camera (CW-9)', () => {
  const bounds = { minX: -500, maxX: 500, minY: -400, maxY: 400 }

  it('starts framing the whole city, following the player', () => {
    const cam = createMapCamera(bounds)
    expect(cam.zoom).toBe(1)
    expect(cam.centerX).toBe(0)
    expect(cam.centerY).toBe(0)
    expect(cam.follow).toBe(true)
  })

  it('zoom is exponential, clamped, and does not break follow', () => {
    const cam = createMapCamera(bounds)
    for (let i = 0; i < 30; i++) {
      stepMapCamera(cam, { zoom: 1 }, 0.1, bounds, 1.6)
    }
    expect(cam.zoom).toBeLessThanOrEqual(MAP_ZOOM_MAX)
    expect(cam.zoom).toBeGreaterThan(1)
    expect(cam.follow).toBe(true)

    for (let i = 0; i < 80; i++) {
      stepMapCamera(cam, { zoom: -1 }, 0.1, bounds, 1.6)
    }
    expect(cam.zoom).toBeGreaterThanOrEqual(MAP_ZOOM_MIN)
  })

  it('panning moves at constant screen speed, breaks follow, and clamps to bounds', () => {
    const cam = createMapCamera(bounds)
    stepMapCamera(cam, { panX: 1 }, 0.1, bounds, 1.6)
    const stepAt1x = cam.centerX
    expect(stepAt1x).toBeGreaterThan(0)
    expect(cam.follow).toBe(false)

    // Zoomed in 4x, the same key press moves 1/4 the world distance.
    const zoomed = createMapCamera(bounds)
    zoomed.zoom = 4
    stepMapCamera(zoomed, { panX: 1 }, 0.1, bounds, 1.6)
    expect(zoomed.centerX).toBeCloseTo(stepAt1x / 4, 5)

    // Clamped at the city edge.
    const runaway = createMapCamera(bounds)
    for (let i = 0; i < 500; i++) {
      stepMapCamera(runaway, { panX: 1 }, 0.1, bounds, 1.6)
    }
    expect(runaway.centerX).toBe(bounds.maxX)
  })

  it('recenter snaps to the player and resumes follow', () => {
    const cam = createMapCamera(bounds)
    stepMapCamera(cam, { panX: 1, panY: -1 }, 0.1, bounds, 1.6)
    expect(cam.follow).toBe(false)
    recenterMapCamera(cam, 42, -17)
    expect(cam.centerX).toBe(42)
    expect(cam.centerY).toBe(-17)
    expect(cam.follow).toBe(true)
  })

  it('frustum scales the whole-city fit by 1/zoom around the camera center', () => {
    const cam = createMapCamera(bounds)
    const fit1 = mapCameraFrustum(cam, bounds, 2)
    cam.zoom = 2
    cam.centerX = 100
    const fit2 = mapCameraFrustum(cam, bounds, 2)

    expect(fit2.right - fit2.left).toBeCloseTo((fit1.right - fit1.left) / 2, 5)
    expect((fit2.right - fit2.left) / (fit2.top - fit2.bottom)).toBeCloseTo(2, 5)
    expect(fit2.centerX).toBe(100)
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

describe('character size (CW-12)', () => {
  it('the range is the measured one: 10% to 100% in 10-point steps', () => {
    expect(CHAR_SCALE_MIN).toBe(0.1)
    expect(CHAR_SCALE_MAX).toBe(1)
    expect(CHAR_SCALE_STEP).toBe(0.1)
    expect(CHAR_SCALE_DEFAULT).toBe(0.5)
  })

  it('clamps to the range at both ends', () => {
    expect(clampCharScale(0)).toBe(CHAR_SCALE_MIN)
    expect(clampCharScale(-5)).toBe(CHAR_SCALE_MIN)
    expect(clampCharScale(2.5)).toBe(CHAR_SCALE_MAX)
    expect(clampCharScale(99)).toBe(CHAR_SCALE_MAX)
  })

  it('snaps onto the 10-point grid so every step announces a whole ten', () => {
    // A seed off the shared Alt View slider (0.05 steps) must not start a
    // ladder of 85 / 95 / 100 that the help text never promised.
    expect(clampCharScale(0.85)).toBe(0.9)
    expect(clampCharScale(0.84)).toBe(0.8)
    expect(clampCharScale(0.55)).toBe(0.6)
  })

  it('never announces a binary-float value', () => {
    // 0.1 * 3 is 0.30000000000000004; unrounded that reaches the player as
    // "Character size 30.000000000000004 percent".
    let v = CHAR_SCALE_MIN
    const seen = []
    for (let i = 0; i < 9; i++) {
      v = clampCharScale(v + CHAR_SCALE_STEP)
      seen.push(Math.round(v * 100))
      expect(Number.isInteger(Math.round(v * 100))).toBe(true)
      expect(v * 100).toBeCloseTo(Math.round(v * 100), 9)
    }
    expect(seen).toEqual([20, 30, 40, 50, 60, 70, 80, 90, 100])
  })

  it('stepping down from the floor stays on the floor', () => {
    expect(clampCharScale(CHAR_SCALE_MIN - CHAR_SCALE_STEP)).toBe(
      CHAR_SCALE_MIN
    )
    expect(clampCharScale(CHAR_SCALE_MAX + CHAR_SCALE_STEP)).toBe(
      CHAR_SCALE_MAX
    )
  })

  describe('seed order', () => {
    it("prefers the game's own saved value", () => {
      expect(seedCharScale('0.3', '0.9')).toBe(0.3)
    })

    it('falls back to the shared Alt View preference, clamped in', () => {
      expect(seedCharScale(null, '0.9')).toBe(0.9)
      // 2.5 is legal for the preview slider and far outside the game's range.
      expect(seedCharScale(null, '2.5')).toBe(CHAR_SCALE_MAX)
    })

    it('falls back to the default when neither is usable', () => {
      expect(seedCharScale(null, null)).toBe(CHAR_SCALE_DEFAULT)
      expect(seedCharScale(undefined, undefined)).toBe(CHAR_SCALE_DEFAULT)
      expect(seedCharScale('', '')).toBe(CHAR_SCALE_DEFAULT)
      expect(seedCharScale('banana', 'nonsense')).toBe(CHAR_SCALE_DEFAULT)
    })

    it('survives a junk game value by falling through, not by throwing', () => {
      expect(seedCharScale('NaN', '0.4')).toBe(0.4)
    })
  })
})

describe('looking around (CW-13)', () => {
  const DEG = Math.PI / 180

  describe('pitch on held keys', () => {
    it('starts level and rises at PITCH_SPEED_RADPS', () => {
      const state = createWalkState({ x: 0, y: 0 })
      expect(state.pitchRad).toBe(0)
      stepWalk(state, { pitch: 1 }, 0.1)
      expect(state.pitchRad).toBeCloseTo(PITCH_SPEED_RADPS * 0.1, 6)
    })

    it('looks down on a negative axis', () => {
      const state = createWalkState({ x: 0, y: 0 })
      stepWalk(state, { pitch: -1 }, 0.1)
      expect(state.pitchRad).toBeCloseTo(-PITCH_SPEED_RADPS * 0.1, 6)
    })

    it('clamps at 60 degrees up and down', () => {
      const up = createWalkState({ x: 0, y: 0 })
      // 45 deg/s for three seconds would reach 135 deg unclamped.
      for (let i = 0; i < 30; i++) stepWalk(up, { pitch: 1 }, 0.1)
      expect(up.pitchRad).toBeCloseTo(PITCH_LIMIT_RAD, 10)
      expect(PITCH_LIMIT_RAD / DEG).toBeCloseTo(60, 10)

      const down = createWalkState({ x: 0, y: 0 })
      for (let i = 0; i < 30; i++) stepWalk(down, { pitch: -1 }, 0.1)
      expect(down.pitchRad).toBeCloseTo(-PITCH_LIMIT_RAD, 10)
    })

    it('reports no change once parked against the limit', () => {
      const state = createWalkState({ x: 0, y: 0 })
      for (let i = 0; i < 30; i++) stepWalk(state, { pitch: 1 }, 0.1)
      // A key still held at the limit must not keep marking the frame dirty:
      // every pitched frame re-converts the whole screen (CW-12 bench).
      const held = stepWalk(state, { pitch: 1 }, 0.1)
      expect(held.pitched).toBe(false)
      expect(stepWalk(state, { pitch: -1 }, 0.1).pitched).toBe(true)
    })

    it('clamps runaway dt like every other axis', () => {
      const state = createWalkState({ x: 0, y: 0 })
      stepWalk(state, { pitch: 1 }, 5)
      expect(state.pitchRad).toBeCloseTo(PITCH_SPEED_RADPS * 0.1, 6)
    })

    it('pitches and walks in the same frame without disturbing the bearing', () => {
      const state = createWalkState({ x: 0, y: 0, headingRad: 0 })
      const result = stepWalk(state, { forward: 1, pitch: 1 }, 0.1)
      expect(result).toEqual({ moved: true, turned: false, pitched: true })
      expect(state.headingRad).toBe(0)
      expect(state.y).toBeCloseTo(WALK_SPEED_MPS * 0.1, 5)
      expect(state.pitchRad).toBeCloseTo(PITCH_SPEED_RADPS * 0.1, 6)
    })

    it('seeds and clamps a spawn pitch', () => {
      expect(createWalkState({ x: 0, y: 0, pitchRad: 10 }).pitchRad).toBe(
        PITCH_LIMIT_RAD
      )
      expect(createWalkState({ x: 0, y: 0, pitchRad: NaN }).pitchRad).toBe(0)
    })
  })

  describe('firstPersonPose with pitch', () => {
    it('lifts the target and keeps it one meter from the eye', () => {
      const state = createWalkState({ x: 5, y: -2, headingRad: 0, pitchRad: 30 * DEG })
      const pose = firstPersonPose(state)
      expect(pose.eye).toEqual([5, -2, EYE_HEIGHT_M])
      const dx = pose.target[0] - pose.eye[0]
      const dy = pose.target[1] - pose.eye[1]
      const dz = pose.target[2] - pose.eye[2]
      expect(Math.hypot(dx, dy, dz)).toBeCloseTo(1, 10)
      expect(dz).toBeCloseTo(Math.sin(30 * DEG), 10)
    })

    it('holds the compass bearing at every pitch', () => {
      for (const headingDeg of [0, 37, 90, 180, 275]) {
        for (const pitchDeg of [-60, -30, 0, 30, 60]) {
          const pose = firstPersonPose({
            x: 0,
            y: 0,
            headingRad: headingDeg * DEG,
            pitchRad: pitchDeg * DEG,
          })
          // atan2(east, north) recovers the bearing from the gaze's ground
          // shadow; only pitch beyond the clamp could collapse it to 0/0.
          const bearing = Math.atan2(pose.target[0], pose.target[1]) / DEG
          expect(((bearing % 360) + 360) % 360).toBeCloseTo(headingDeg, 8)
        }
      }
    })

    it('looks up over the eye but never straight up', () => {
      const pose = firstPersonPose({
        x: 0,
        y: 0,
        headingRad: 0,
        pitchRad: PITCH_LIMIT_RAD,
      })
      expect(pose.target[2]).toBeGreaterThan(EYE_HEIGHT_M)
      // Ground reach stays a real half-meter: lookAt() with a fixed world up
      // needs a gaze that is never parallel to it.
      expect(Math.hypot(pose.target[0], pose.target[1])).toBeCloseTo(0.5, 10)
    })

    it('treats a state with no pitchRad as level (pre-CW-13 shape)', () => {
      const pose = firstPersonPose({ x: 1, y: 2, headingRad: 0 })
      expect(pose.target).toEqual([1, 3, EYE_HEIGHT_M])
    })
  })

  describe('levelView', () => {
    it('returns the gaze to the horizon and reports the change', () => {
      const state = createWalkState({ x: 0, y: 0, pitchRad: 45 * DEG })
      expect(levelView(state)).toBe(true)
      expect(state.pitchRad).toBe(0)
      expect(firstPersonPose(state).target[2]).toBe(EYE_HEIGHT_M)
    })

    it('reports no change when the gaze is already level', () => {
      const state = createWalkState({ x: 0, y: 0 })
      expect(levelView(state)).toBe(false)
      expect(state.pitchRad).toBe(0)
    })

    it('leaves the bearing and the position alone', () => {
      const state = createWalkState({ x: 3, y: 4, headingRad: 1.2, pitchRad: 0.5 })
      levelView(state)
      expect(state.headingRad).toBeCloseTo(1.2, 10)
      expect([state.x, state.y]).toEqual([3, 4])
    })
  })

  describe('applyLookDelta (drag-look)', () => {
    it('turns and pitches by absolute angles', () => {
      const state = createWalkState({ x: 0, y: 0 })
      const result = applyLookDelta(state, 10 * DEG, -5 * DEG)
      expect(result).toEqual({ turned: true, pitched: true })
      expect(state.headingRad).toBeCloseTo(10 * DEG, 10)
      expect(state.pitchRad).toBeCloseTo(-5 * DEG, 10)
    })

    it('normalizes the bearing past a full turn', () => {
      const state = createWalkState({ x: 0, y: 0, headingRad: 350 * DEG })
      applyLookDelta(state, 20 * DEG, 0)
      expect(state.headingRad).toBeCloseTo(10 * DEG, 8)
    })

    it('clamps pitch to the same limit the keys obey', () => {
      const state = createWalkState({ x: 0, y: 0 })
      applyLookDelta(state, 0, 400 * DEG)
      expect(state.pitchRad).toBe(PITCH_LIMIT_RAD)
      expect(applyLookDelta(state, 0, 10 * DEG).pitched).toBe(false)
    })

    it('reports nothing for a zero or junk delta', () => {
      const state = createWalkState({ x: 0, y: 0, headingRad: 1 })
      expect(applyLookDelta(state, 0, 0)).toEqual({
        turned: false,
        pitched: false,
      })
      expect(applyLookDelta(state, NaN, undefined)).toEqual({
        turned: false,
        pitched: false,
      })
      expect(state.headingRad).toBe(1)
      expect(state.pitchRad).toBe(0)
    })
  })

  describe('pitchLabel', () => {
    it('words the direction for the HUD', () => {
      expect(pitchLabel(20 * DEG)).toBe('up')
      expect(pitchLabel(-20 * DEG)).toBe('down')
      expect(pitchLabel(0)).toBe(null)
    })

    it('reads level within half a degree, so drag residue never lingers', () => {
      expect(pitchLabel(0.2 * DEG)).toBe(null)
      expect(pitchLabel(-0.2 * DEG)).toBe(null)
      expect(pitchLabel(1 * DEG)).toBe('up')
      expect(pitchLabel(undefined)).toBe(null)
    })
  })
})
