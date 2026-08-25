import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  createWalkState,
  stepWalk,
  firstPersonPose,
  headingLabel,
  buildCollisionGrid,
  stampObstacles,
  findSpawn,
  findClearHeading,
  fitOrthoToBounds,
  createMapCamera,
  stepMapCamera,
  recenterMapCamera,
  mapCameraFrustum,
  MAP_ZOOM_MIN,
  MAP_ZOOM_MAX,
  WALK_SPEED_MPS,
  SPRINT_MULTIPLIER,
  SPRINT_MAX_MPS,
  SPEED_LABEL_MIN,
  SPEED_LABEL_MAX,
  SPEED_LABEL_STEP,
  SPEED_LABEL_DEFAULT,
  speedForLabel,
  clampSpeedLabel,
  speedLabelFromStored,
  buildSurfaceGrid,
  easeGroundZ,
  CURB_HEIGHT_M,
  CURB_EASE_M,
  PAVEMENT_WIDTH_M,
  PLAYER_RADIUS_M,
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
import {
  parseCityExtract,
  ROAD_WIDTHS_M,
} from '../../../src/js/game/city-data.js'

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
    expect(dist).toBeCloseTo(WALK_SPEED_MPS * SPRINT_MULTIPLIER * 0.1, 5)
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

describe('walking speed labels (CW-48, rebasing CW-Q8)', () => {
  // The whole announced range, written out rather than re-derived: a table
  // that recomputes the curve it is checking would agree with any curve.
  const CURVE = [
    [50, 2.4],
    [75, 3.6],
    [100, 4.8],
    [125, 5.2],
    [150, 5.6],
    [175, 6.0],
    [200, 6.4],
    [225, 6.8],
    [250, 7.2],
    [275, 7.6],
    [300, 8.0],
  ]

  it('turns every announced label into its signed speed', () => {
    for (const [label, mps] of CURVE) {
      expect(speedForLabel(label), `label ${label}`).toBeCloseTo(mps, 10)
    }
  })

  it('anchors the curve where the rebase put it', () => {
    // The old game walked 1.6 m/s at its own 100%, so its 300% was 4.8 and
    // its 500% would have been 8.0. Those two are this scale's 100 and 300.
    expect(speedForLabel(SPEED_LABEL_DEFAULT)).toBeCloseTo(4.8, 10)
    expect(speedForLabel(SPEED_LABEL_MAX)).toBeCloseTo(8.0, 10)
    expect(WALK_SPEED_MPS).toBe(4.8)
  })

  it('snaps to the step grid and holds the range', () => {
    expect(clampSpeedLabel(120)).toBe(100 + SPEED_LABEL_STEP)
    expect(clampSpeedLabel(105)).toBe(100)
    expect(clampSpeedLabel(1000)).toBe(SPEED_LABEL_MAX)
    expect(clampSpeedLabel(-40)).toBe(SPEED_LABEL_MIN)
    expect(clampSpeedLabel(NaN)).toBe(SPEED_LABEL_DEFAULT)
    expect(clampSpeedLabel(undefined)).toBe(SPEED_LABEL_DEFAULT)
    // Out-of-range labels resolve to the speed of the label they clamp to,
    // never to an extrapolation off the end of either slope.
    expect(speedForLabel(9000)).toBeCloseTo(8.0, 10)
    expect(speedForLabel(-9000)).toBeCloseTo(2.4, 10)
  })

  it('walks the labelled speed, and an absent label is the default', () => {
    const at = (input) => {
      const s = createWalkState({ x: 0, y: 0, headingRad: 0 })
      stepWalk(s, { forward: 1, ...input }, 0.1)
      return s.y
    }
    expect(at({ speedLabel: 300 })).toBeCloseTo(0.8, 10)
    expect(at({ speedLabel: 50 })).toBeCloseTo(0.24, 10)
    expect(at({})).toBeCloseTo(at({ speedLabel: SPEED_LABEL_DEFAULT }), 10)
  })

  it('sprints faster than the walk at EVERY label, and caps', () => {
    for (const [label] of CURVE) {
      const walked = createWalkState({ x: 0, y: 0, headingRad: 0 })
      stepWalk(walked, { forward: 1, speedLabel: label }, 0.1)
      const sprinted = createWalkState({ x: 0, y: 0, headingRad: 0 })
      stepWalk(sprinted, { forward: 1, fast: true, speedLabel: label }, 0.1)
      expect(sprinted.y, `label ${label} sprint`).toBeGreaterThan(walked.y)
    }

    // The cap sits above the fastest walk, so it never inverts the rule it
    // is bounding: 8.0 x 1.6 would be 12.8, and the cap holds it to 9.6.
    const top = createWalkState({ x: 0, y: 0, headingRad: 0 })
    stepWalk(top, { forward: 1, fast: true, speedLabel: SPEED_LABEL_MAX }, 0.1)
    expect(top.y).toBeCloseTo(SPRINT_MAX_MPS * 0.1, 10)
    expect(SPRINT_MAX_MPS).toBeGreaterThan(speedForLabel(SPEED_LABEL_MAX))
  })

  it('migrates a preference the pre-CW-48 game stored (UF-14)', () => {
    // Old values were multipliers of a 1.6 m/s walk. old% - 200 is the new
    // label, so the old top of the range lands on the new default and
    // everything at or below the old 250% lands on the new floor.
    expect(speedLabelFromStored('3')).toBe(100)
    expect(speedLabelFromStored('2.75')).toBe(75)
    expect(speedLabelFromStored('2.5')).toBe(50)
    expect(speedLabelFromStored('2')).toBe(SPEED_LABEL_MIN)
    expect(speedLabelFromStored('1')).toBe(SPEED_LABEL_MIN)
    expect(speedLabelFromStored('0.5')).toBe(SPEED_LABEL_MIN)

    // A label this scale wrote reads back unchanged...
    for (const [label] of CURVE) {
      expect(speedLabelFromStored(String(label)), `label ${label}`).toBe(label)
    }
    // ...and nothing at all reads as the default.
    expect(speedLabelFromStored(null)).toBe(SPEED_LABEL_DEFAULT)
    expect(speedLabelFromStored('')).toBe(SPEED_LABEL_DEFAULT)
    expect(speedLabelFromStored('banana')).toBe(SPEED_LABEL_DEFAULT)
  })

  it('leaves nobody stranded slower than they already walked', () => {
    // The floor is the one place the migration cannot be faithful: an old
    // 100% player walked 1.6 m/s and the slowest this scale offers is 2.4.
    // It must round UP to that, never down into a slower walk than before.
    expect(speedForLabel(speedLabelFromStored('1'))).toBeCloseTo(2.4, 10)
    expect(speedForLabel(speedLabelFromStored('1'))).toBeGreaterThan(1.6)
  })
})

describe('collision integrity at the CW-48 top speed', () => {
  // The hunt the speed rebase owes: three times the old speed means three
  // times the ground per frame, and a frame that covers more ground than an
  // obstacle is wide can step straight over it. stepWalk tests the ENDS of a
  // step, so this watches the whole swept segment instead.
  //
  // Worst case on purpose: dt is passed as 5 s so the integration clamp
  // supplies the longest frame the game will ever integrate, and the walker
  // sprints at the top label. A tree trunk is the thinnest thing the city
  // stamps, and it is the one aimed at here.
  const TRUNK = {
    x: 60,
    y: 60,
    halfLengthM: 0.15,
    halfWidthM: 0.15,
    rotationRad: 0,
  }
  const RUNAWAY_DT_S = 5

  // The grid only covers the building core plus a margin, and everything
  // outside it reads as blocked. A trunk dropped past that edge is never
  // stamped and every approach to it starts out of bounds, which is a sweep
  // that runs zero iterations and passes. Hence the second far building: it
  // carries the bounds out past the trunk and its whole approach ring.
  function trunkModel() {
    return parseCityExtract(
      {
        elements: [
          {
            type: 'way',
            id: 1,
            tags: { building: 'yes', height: '12' },
            geometry: squareRing(0, 0, 5),
          },
          {
            type: 'way',
            id: 2,
            tags: { building: 'yes', height: '12' },
            geometry: squareRing(120, 120, 5),
          },
        ],
      },
      { center: CENTER }
    )
  }

  function gridWithTrunk() {
    const collision = buildCollisionGrid(trunkModel())
    expect(stampObstacles(collision, [TRUNK])).toBe(1)
    expect(collision.isBlocked(TRUNK.x, TRUNK.y)).toBe(true)
    expect(collision.isBlocked(TRUNK.x + 3, TRUNK.y)).toBe(false)
    return collision
  }

  /** Mirrors stepWalk's own body probe: the centre and four rim points. */
  const bodyOverlaps = (collision, x, y) =>
    collision.isBlocked(x, y) ||
    collision.isBlocked(x + PLAYER_RADIUS_M, y) ||
    collision.isBlocked(x - PLAYER_RADIUS_M, y) ||
    collision.isBlocked(x, y + PLAYER_RADIUS_M) ||
    collision.isBlocked(x, y - PLAYER_RADIUS_M)

  /**
   * Walk `steps` frames and report every step that carried the walker's
   * CENTRE through solid ground, which is what passing through a wall means:
   * nothing the grid can hold is thinner than its 1 m cells, so a centre that
   * never enters one has never come out the far side. Sampling is 2 cm.
   *
   * The rim is watched separately. A body circle whose edge clips the corner
   * of a blocked cell mid-step has cut a corner, not walked through a wall,
   * and the game has always allowed it — measured at the pre-CW-48 frame
   * length too, so this is not the speed rebase's to fix.
   */
  function sweepViolations(collision, start, input, steps) {
    const state = createWalkState(start)
    const hits = []
    let deepestRim = 0
    for (let i = 0; i < steps; i++) {
      const fromX = state.x
      const fromY = state.y
      stepWalk(state, input, RUNAWAY_DT_S, collision)
      const dx = state.x - fromX
      const dy = state.y - fromY
      const travelled = Math.hypot(dx, dy)
      if (travelled === 0) continue
      if (bodyOverlaps(collision, state.x, state.y)) {
        hits.push(
          `step ${i} ENDED overlapping at (${state.x.toFixed(2)}, ${state.y.toFixed(2)})`
        )
      }
      const samples = Math.ceil(travelled / 0.02)
      for (let s = 1; s < samples; s++) {
        const t = s / samples
        const x = fromX + dx * t
        const y = fromY + dy * t
        if (collision.isBlocked(x, y)) {
          hits.push(
            `step ${i} from (${fromX.toFixed(2)}, ${fromY.toFixed(2)}) ` +
              `to (${state.x.toFixed(2)}, ${state.y.toFixed(2)}) ` +
              `swept its CENTRE through (${x.toFixed(2)}, ${y.toFixed(2)})`
          )
          break
        }
        if (bodyOverlaps(collision, x, y)) deepestRim = Math.max(deepestRim, t)
      }
    }
    return { hits, deepestRim }
  }

  it('never carries the walker through a tree trunk, from any approach', () => {
    const collision = gridWithTrunk()
    const hits = []
    let approaches = 0
    // Every 5 degrees around the trunk, at lateral offsets across the whole
    // blocked cell, AND at a range of starting distances. The distance sweep
    // is the part that matters: a fixed start makes every approach share one
    // along-track phase, and a walker whose stride happens to land inside the
    // cell stops there and proves nothing about the strides that skip it.
    for (let deg = 0; deg < 360; deg += 5) {
      const rad = (deg * Math.PI) / 180
      for (let offset = -0.9; offset <= 0.9001; offset += 0.15) {
        for (let away = 12; away < 13.001; away += 0.08) {
          const startX = TRUNK.x - Math.sin(rad) * away + Math.cos(rad) * offset
          const startY = TRUNK.y - Math.cos(rad) * away - Math.sin(rad) * offset
          if (bodyOverlaps(collision, startX, startY)) continue
          approaches++
          hits.push(
            ...sweepViolations(
              collision,
              { x: startX, y: startY, headingRad: rad },
              { forward: 1, fast: true, speedLabel: SPEED_LABEL_MAX },
              30
            ).hits
          )
        }
      }
    }
    // A sweep that skipped every start would report no violations too.
    expect(approaches).toBeGreaterThan(7000)
    expect(hits.slice(0, 5).join('\n')).toBe('')
  })

  it('never carries the walker through a building wall, diagonals included', () => {
    // The building in testModel is 10 m square at (20, 0). Walk into each of
    // its faces and corners, straight and strafing, at the top sprint.
    const collision = buildCollisionGrid(testModel())
    const hits = []
    let approaches = 0
    for (let deg = 0; deg < 360; deg += 5) {
      const rad = (deg * Math.PI) / 180
      for (let away = 25; away < 26.001; away += 0.08) {
        const startX = 20 - Math.sin(rad) * away
        const startY = 0 - Math.cos(rad) * away
        if (bodyOverlaps(collision, startX, startY)) continue
        for (const strafe of [0, 1, -1]) {
          approaches++
          hits.push(
            ...sweepViolations(
              collision,
              { x: startX, y: startY, headingRad: rad },
              { forward: 1, strafe, fast: true, speedLabel: SPEED_LABEL_MAX },
              40
            ).hits
          )
        }
      }
    }
    expect(approaches).toBeGreaterThan(2000)
    expect(hits.slice(0, 5).join('\n')).toBe('')
  })

  it('splits a long frame without changing how far it travels', () => {
    // Splitting the move is a collision measure only. Over open ground the
    // same frame has to cover exactly the same distance with the grid present
    // as without it, or the rebase would have quietly retuned walking speed.
    const collision = gridWithTrunk()
    for (const input of [
      { forward: 1, speedLabel: SPEED_LABEL_MAX },
      { forward: 1, fast: true, speedLabel: SPEED_LABEL_MAX },
      { forward: 1, strafe: 1, fast: true, speedLabel: SPEED_LABEL_MAX },
    ]) {
      // Far from the trunk, and far from the grid's own edges.
      const free = createWalkState({ x: 20, y: 40, headingRad: 0 })
      const gridded = createWalkState({ x: 20, y: 40, headingRad: 0 })
      stepWalk(free, input, RUNAWAY_DT_S)
      stepWalk(gridded, input, RUNAWAY_DT_S, collision)
      expect(gridded.x, JSON.stringify(input)).toBeCloseTo(free.x, 10)
      expect(gridded.y, JSON.stringify(input)).toBeCloseTo(free.y, 10)
    }
  })

  it('holds the walker no further out than one frame of travel', () => {
    // The rebase's real cost: collision is tested at the ends of a frame, so
    // a longer frame can stop the walker further from what blocked it. That
    // is bounded by one frame of travel and nothing worse, and this pins the
    // bound rather than trusting it. Approaches are swept across the whole
    // cell so the result is not one lucky phase.
    const closestOver = (input) => {
      let worst = 0
      for (let offset = -0.4; offset <= 0.4001; offset += 0.05) {
        const collision = gridWithTrunk()
        const state = createWalkState({
          x: TRUNK.x + offset,
          y: TRUNK.y - 12,
          headingRad: 0,
        })
        let best = Infinity
        for (let i = 0; i < 200; i++) {
          stepWalk(state, input, RUNAWAY_DT_S, collision)
          best = Math.min(best, Math.abs(state.y - TRUNK.y))
        }
        worst = Math.max(worst, best)
      }
      return worst
    }
    const strolled = closestOver({ forward: 1, speedLabel: SPEED_LABEL_MIN })
    const walked = closestOver({ forward: 1, speedLabel: SPEED_LABEL_DEFAULT })
    // One default frame is 0.48 m; the walker may be held that much further
    // back than the slowest stroll is, and no more.
    const oneFrame = speedForLabel(SPEED_LABEL_DEFAULT) * 0.1
    expect(
      walked,
      `stroll held at ${strolled.toFixed(2)} m, default walk at ${walked.toFixed(2)} m`
    ).toBeLessThanOrEqual(strolled + oneFrame)
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

describe('findClearHeading (CW-44)', () => {
  it('faces down the open corridor, not into the near wall', () => {
    // Everything is wall except a strip running east. North is blocked half
    // a metre out - exactly the CW-44 Seattle spawn shape that walked the
    // player into a storefront.
    const corridor = {
      isBlocked: (x, y) => !(Math.abs(y) <= 1 && x >= -1),
    }
    expect(findClearHeading(corridor, 0, 0)).toBeCloseTo(Math.PI / 2, 9)
  })

  it('is deterministic and prefers north on a fully open square', () => {
    const open = { isBlocked: () => false }
    expect(findClearHeading(open, 0, 0)).toBe(0)
    expect(findClearHeading(open, 12.5, -40)).toBe(0)
  })

  it('answers north when every direction is walled in', () => {
    const solid = { isBlocked: () => true }
    expect(findClearHeading(solid, 0, 0)).toBe(0)
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

  it('spawns FACING somewhere worth walking (the CW-44 CI catch, pinned)', () => {
    // The fixed north heading stood the 1,300 m Seattle player 2.5 m from
    // a storefront; CI's software frames (dt-clamped, more ground per
    // frame) hit it and the Fast-toggle spec went red on two browsers.
    // The spawn heading must now buy a real run: five simulated seconds
    // of walking must cover several times that wall distance.
    const raw = JSON.parse(
      readFileSync(
        join(process.cwd(), 'public', 'examples', 'ascii-city', 'seattle.json'),
        'utf8'
      )
    )
    const model = parseCityExtract(raw)
    const grid = buildCollisionGrid(model)
    const spawn = findSpawn(model, grid)
    const heading = findClearHeading(grid, spawn.x, spawn.y)
    const state = createWalkState({ ...spawn, headingRad: heading })
    for (let i = 0; i < 50; i++) stepWalk(state, { forward: 1 }, 0.1, grid)
    expect(
      Math.hypot(state.x - spawn.x, state.y - spawn.y)
    ).toBeGreaterThan(6)
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

  describe('calibrated floor (CW-42, CW-Q39)', () => {
    it('raises the bottom of the range to the calibrated floor', () => {
      expect(clampCharScale(0.1, 0.3)).toBe(0.3)
      expect(clampCharScale(0.2, 0.3)).toBe(0.3)
      expect(clampCharScale(0, 0.3)).toBe(0.3)
    })

    it('stepping down from the calibrated floor stays on it', () => {
      expect(clampCharScale(0.3 - CHAR_SCALE_STEP, 0.3)).toBe(0.3)
      expect(clampCharScale(0.1 - CHAR_SCALE_STEP, 0.1)).toBe(0.1)
    })

    it('leaves everything above the floor alone', () => {
      expect(clampCharScale(0.5, 0.3)).toBe(0.5)
      expect(clampCharScale(2.5, 0.3)).toBe(CHAR_SCALE_MAX)
    })

    it('a floor of 10% is the uncalibrated range', () => {
      expect(clampCharScale(0.1, 0.1)).toBe(0.1)
    })

    it('ignores a junk floor', () => {
      expect(clampCharScale(0.1, NaN)).toBe(0.1)
      expect(clampCharScale(0.1, null)).toBe(0.1)
    })

    it('a floor outside the range is bounded, never widening the range', () => {
      expect(clampCharScale(0.1, 0.05)).toBe(CHAR_SCALE_MIN)
      expect(clampCharScale(0.5, 5)).toBe(CHAR_SCALE_MAX)
    })
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

    describe('with a stored calibration (CW-42, CW-Q39)', () => {
      it('the manual choice still wins, even below the calibrated default', () => {
        expect(seedCharScale('0.1', null, 0.3)).toBe(0.1)
      })

      it('the calibrated default replaces the landing default', () => {
        expect(seedCharScale(null, null, 0.1)).toBe(0.1)
        expect(seedCharScale(null, null, 0.3)).toBe(0.3)
      })

      it('the calibrated default outranks the Alt View courtesy seed', () => {
        // Fresh calibration would re-apply over the seed moments after
        // entry; landing there spares the player the visible jump.
        expect(seedCharScale(null, '0.9', 0.3)).toBe(0.3)
      })

      it('a junk calibration falls through to the old order', () => {
        expect(seedCharScale(null, '0.9', NaN)).toBe(0.9)
        expect(seedCharScale(null, null, null)).toBe(CHAR_SCALE_DEFAULT)
      })
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

describe('stampObstacles (CW-16)', () => {
  function gridWithOneBuilding() {
    const model = parseCityExtract(
      {
        elements: [
          {
            type: 'way',
            id: 1,
            tags: { building: 'yes', height: '20' },
            geometry: [
              pt(-40, -40),
              pt(40, -40),
              pt(40, 40),
              pt(-40, 40),
              pt(-40, -40),
            ],
          },
        ],
      },
      { center: CENTER }
    )
    return buildCollisionGrid(model)
  }

  it('blocks a parked car along its length, not across the street', () => {
    const collision = gridWithOneBuilding()
    // Just outside the building's north wall, a car lying east-west.
    expect(collision.isBlocked(50, 45)).toBe(false)
    expect(collision.isBlocked(48, 45)).toBe(false)

    const stamped = stampObstacles(collision, [
      { x: 50, y: 45, halfLengthM: 2.2, halfWidthM: 0.9, rotationRad: 0 },
    ])

    expect(stamped).toBe(1)
    expect(collision.isBlocked(50, 45)).toBe(true)
    // Along the car (east-west) it blocks...
    expect(collision.isBlocked(48.5, 45)).toBe(true)
    // ...but two meters to the side, the roadway is still open.
    expect(collision.isBlocked(50, 47.5)).toBe(false)
  })

  it('follows the car around when it is parked on a north-south street', () => {
    const collision = gridWithOneBuilding()
    const rotated = {
      x: 50,
      y: 45,
      halfLengthM: 2.2,
      halfWidthM: 0.9,
      rotationRad: Math.PI / 2,
    }

    stampObstacles(collision, [rotated])

    expect(collision.isBlocked(50, 45)).toBe(true)
    // Now the long axis runs north-south.
    expect(collision.isBlocked(50, 46.5)).toBe(true)
    expect(collision.isBlocked(52.5, 45)).toBe(false)
  })

  it('gives a slim tree trunk its own cell', () => {
    const collision = gridWithOneBuilding()
    expect(collision.isBlocked(60, 60)).toBe(false)

    stampObstacles(collision, [
      { x: 60, y: 60, halfLengthM: 0.15, halfWidthM: 0.15, rotationRad: 0 },
    ])

    // A 0.3 m trunk is narrower than a grid cell: it must still stop a walker.
    expect(collision.isBlocked(60, 60)).toBe(true)
    expect(collision.isBlocked(63, 60)).toBe(false)
  })

  it('ignores obstacles beyond the grid instead of throwing', () => {
    const collision = gridWithOneBuilding()
    expect(() =>
      stampObstacles(collision, [
        { x: 9000, y: 9000, halfLengthM: 2.2, halfWidthM: 0.9, rotationRad: 0 },
      ])
    ).not.toThrow()
  })
})

describe('the ground underfoot (CW-50)', () => {
  // A cross: an 8 m residential road along y=0 and another along x=0, in a
  // model whose bounds reach well past both.
  function crossModel() {
    return parseCityExtract(
      {
        elements: [
          // These two only carry the model's bounds out past the test area.
          // A building AT the test area would fill the collision grid, and
          // the walking case below would prove nothing while looking green.
          {
            type: 'way',
            id: 1,
            tags: { building: 'yes', height: '12' },
            geometry: squareRing(-90, -90, 5),
          },
          {
            type: 'way',
            id: 4,
            tags: { building: 'yes', height: '12' },
            geometry: squareRing(90, 90, 5),
          },
          {
            type: 'way',
            id: 2,
            tags: { highway: 'residential' },
            geometry: [pt(-50, 0), pt(50, 0)],
          },
          {
            type: 'way',
            id: 3,
            tags: { highway: 'footway', footway: 'sidewalk' },
            geometry: [pt(-50, 6), pt(50, 6)],
          },
        ],
      },
      { center: CENTER }
    )
  }

  it('cuts the roadway below the pavement, and only the roadway', () => {
    const surface = buildSurfaceGrid(crossModel())
    // Pavement is zero and the roadway is a curb below it, so that every prop
    // in the city keeps standing exactly where it was placed.
    expect(surface.heightAt(0, 0)).toBe(-CURB_HEIGHT_M)
    expect(surface.heightAt(20, 0)).toBe(-CURB_HEIGHT_M)
    // Just beyond its 4 m edge: up on the pavement, both sides.
    expect(surface.heightAt(20, 5)).toBe(0)
    expect(surface.heightAt(20, -5)).toBe(0)
    // Far from any street there is no pavement, which is stated design.
    expect(surface.heightAt(20, 40)).toBe(-CURB_HEIGHT_M)
  })

  it('puts the curb where the road edge is, wherever that has moved to', () => {
    const surface = buildSurfaceGrid(crossModel())
    const half = ROAD_WIDTHS_M.residential / 2
    // Just inside the edge is roadway; just outside is pavement. The metre of
    // slack either way is the grid's own cell, not a claim about the curb.
    expect(surface.heightAt(10, half - 0.6)).toBe(-CURB_HEIGHT_M)
    expect(surface.heightAt(10, half + 1.1)).toBe(0)
    // The apron is a strip, not an unbounded field: past its far edge the
    // pavement ends.
    expect(surface.heightAt(10, half + PAVEMENT_WIDTH_M + 2)).toBe(
      -CURB_HEIGHT_M
    )
  })

  it('climbs the curb over ground covered, not over time', () => {
    const surface = buildSurfaceGrid(crossModel())
    // Start in the roadway, then step up onto the pavement.
    const state = { x: 20, y: 0 }
    expect(easeGroundZ(state, surface, 0)).toBe(-CURB_HEIGHT_M)

    state.y = 6
    // A tenth of the ease distance climbs a tenth of the curb, whatever the
    // frame rate: the rate is per metre travelled.
    const afterOneTenth = easeGroundZ(state, surface, CURB_EASE_M / 10)
    expect(afterOneTenth).toBeCloseTo(-CURB_HEIGHT_M + CURB_HEIGHT_M / 10, 10)

    // The rest of the ease distance finishes it, and it never overshoots.
    let z = afterOneTenth
    for (let i = 0; i < 9; i++)
      z = easeGroundZ(state, surface, CURB_EASE_M / 10)
    expect(z).toBeCloseTo(0, 10)
    expect(easeGroundZ(state, surface, 5)).toBe(0)
  })

  it('snaps when the walker did not walk there (teleport, spawn)', () => {
    const surface = buildSurfaceGrid(crossModel())
    const state = { x: 20, y: 0, groundZ: -CURB_HEIGHT_M }
    // Arriving without travelling has no step to smooth out.
    state.y = 6
    expect(easeGroundZ(state, surface, 0)).toBe(0)
  })

  it('drops the eye into the roadway, and the pavement is unchanged', () => {
    // Standing on a pavement is the ordinary case and it has to be EXACTLY
    // the eye height the game always had; only stepping into the road moves.
    const onKerb = createWalkState({ x: 0, y: 0, headingRad: 0 })
    onKerb.groundZ = 0
    expect(firstPersonPose(onKerb).eye[2]).toBe(EYE_HEIGHT_M)

    const inRoad = createWalkState({ x: 0, y: 0, headingRad: 0 })
    inRoad.groundZ = -CURB_HEIGHT_M
    expect(firstPersonPose(inRoad).eye[2]).toBeCloseTo(
      EYE_HEIGHT_M - CURB_HEIGHT_M,
      10
    )
    // A state built before the curb existed still stands on level ground.
    const legacy = createWalkState({ x: 0, y: 0, headingRad: 0 })
    expect(firstPersonPose(legacy).eye[2]).toBe(EYE_HEIGHT_M)
  })

  it('never walls the curb: crossing it is a walk, not a collision', () => {
    // The directive's non-negotiable half. The curb is drawn and felt, but it
    // is not an obstacle - nothing about it reaches the collision grid.
    const model = crossModel()
    const collision = buildCollisionGrid(model)
    const surface = buildSurfaceGrid(model)
    const state = createWalkState({ x: 20, y: 0, headingRad: 0 })
    state.groundZ = -CURB_HEIGHT_M
    // The starting point really is in the roadway, or crossing out of it
    // proves nothing.
    expect(surface.heightAt(state.x, state.y)).toBe(-CURB_HEIGHT_M)
    expect(collision.isBlocked(state.x, state.y)).toBe(false)
    let highest = -CURB_HEIGHT_M
    let stalled = 0
    for (let i = 0; i < 40; i++) {
      const before = { x: state.x, y: state.y }
      stepWalk(state, { forward: 1, speedLabel: 100 }, 0.1, collision)
      const travelled = Math.hypot(state.x - before.x, state.y - before.y)
      if (travelled < 1e-9) stalled++
      easeGroundZ(state, surface, travelled)
      highest = Math.max(highest, state.groundZ)
    }
    // It climbed onto the pavement...
    expect(highest).toBe(0)
    // ...and never once stopped, which is what a walled curb would look like.
    expect(stalled).toBe(0)
    // The apron is a strip, so walking on past it drops back off the far
    // side. Asserting the trip rather than the endpoint keeps this about the
    // curb rather than about where forty frames happen to end.
    expect(state.y).toBeGreaterThan(
      ROAD_WIDTHS_M.residential / 2 + PAVEMENT_WIDTH_M
    )
    expect(state.groundZ).toBe(-CURB_HEIGHT_M)
  })
})
