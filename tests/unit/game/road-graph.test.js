import { describe, it, expect } from 'vitest'
import {
  buildRoadGraph,
  trafficDensityFor,
  DRIVABLE_ROAD_KINDS,
} from '../../../src/js/game/city-data.js'

const road = (points, kind = 'residential', widthM = 6) => ({
  points,
  kind,
  widthM,
})

describe('buildRoadGraph (CW-19)', () => {
  it('joins chains that share an end into one node', () => {
    // Two ways meeting at (10, 0), the way OSM splits a street at a junction.
    const g = buildRoadGraph([
      road([
        [0, 0],
        [10, 0],
      ]),
      road([
        [10, 0],
        [20, 0],
      ]),
    ])
    expect(g.chains).toHaveLength(2)
    expect(g.nodes).toHaveLength(3)
    expect(g.chains[0].endNode).toBe(g.chains[1].startNode)
    expect(g.nodes[g.chains[0].endNode].degree).toBe(2)
  })

  it('treats ends a few centimetres apart as the same junction', () => {
    // Projection and rounding move a shared corner slightly; two ways that
    // meet in the data must not come out as two dead ends.
    const g = buildRoadGraph([
      road([
        [0, 0],
        [10, 0],
      ]),
      road([
        [10.2, 0.3],
        [20, 0],
      ]),
    ])
    expect(g.nodes).toHaveLength(3)
    expect(g.chains[0].endNode).toBe(g.chains[1].startNode)
  })

  it('keeps genuinely separate junctions apart', () => {
    const g = buildRoadGraph([
      road([
        [0, 0],
        [10, 0],
      ]),
      road([
        [40, 0],
        [50, 0],
      ]),
    ])
    expect(g.nodes).toHaveLength(4)
    expect(g.intersections).toEqual([])
  })

  it('calls a node an intersection only where three or more roads meet', () => {
    // A crossroads: four arms out of the middle.
    const g = buildRoadGraph([
      road([
        [0, 0],
        [0, 10],
      ]),
      road([
        [0, 0],
        [0, -10],
      ]),
      road([
        [0, 0],
        [10, 0],
      ]),
      road([
        [0, 0],
        [-10, 0],
      ]),
    ])
    expect(g.intersections).toHaveLength(1)
    const hub = g.nodes[g.intersections[0]]
    expect(hub.degree).toBe(4)
    expect(hub.chains).toHaveLength(4)
    expect(hub.x).toBe(0)
    expect(hub.y).toBe(0)

    // A road merely continuing under a new name is NOT an intersection, or
    // every street would sprout traffic lights along its length.
    const straight = buildRoadGraph([
      road([
        [0, 0],
        [10, 0],
      ]),
      road([
        [10, 0],
        [20, 0],
      ]),
    ])
    expect(straight.intersections).toEqual([])
  })

  it('leaves out the roads nobody drives a car down', () => {
    const g = buildRoadGraph([
      road(
        [
          [0, 0],
          [10, 0],
        ],
        'footway'
      ),
      road(
        [
          [0, 0],
          [0, 10],
        ],
        'service'
      ),
      road(
        [
          [0, 0],
          [-10, 0],
        ],
        'pedestrian'
      ),
      road(
        [
          [0, 0],
          [0, -10],
        ],
        'primary'
      ),
    ])
    expect(g.chains).toHaveLength(1)
    expect(g.chains[0].kind).toBe('primary')
    for (const kind of ['footway', 'service', 'pedestrian', 'steps', 'path']) {
      expect(DRIVABLE_ROAD_KINDS.has(kind)).toBe(false)
    }
  })

  it('survives empty, malformed and single-point input', () => {
    expect(buildRoadGraph([]).chains).toEqual([])
    expect(buildRoadGraph(undefined).nodes).toEqual([])
    expect(buildRoadGraph([road([[0, 0]])]).chains).toEqual([])
    expect(buildRoadGraph([{ kind: 'primary' }]).chains).toEqual([])
  })

  it('is deterministic for the same input', () => {
    const input = [
      road([
        [0, 0],
        [10, 0],
      ]),
      road([
        [10, 0],
        [10, 10],
      ]),
      road([
        [10, 0],
        [20, 0],
      ]),
    ]
    const a = buildRoadGraph(input)
    const b = buildRoadGraph(input)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('trafficDensityFor (CW-19)', () => {
  it('gives busier classes more cars per kilometre', () => {
    const motorway = trafficDensityFor({ kind: 'motorway' })
    const primary = trafficDensityFor({ kind: 'primary' })
    const residential = trafficDensityFor({ kind: 'residential' })
    expect(motorway).toBeGreaterThan(primary)
    expect(primary).toBeGreaterThan(residential)
    expect(residential).toBeGreaterThan(0)
  })

  it('returns nothing for a road no car belongs on', () => {
    expect(trafficDensityFor({ kind: 'footway' })).toBe(0)
    expect(trafficDensityFor({ kind: 'service' })).toBe(0)
    expect(trafficDensityFor({})).toBe(0)
    expect(trafficDensityFor(null)).toBe(0)
  })

  it('scales with lane count when a road ever carries one', () => {
    // The seam a re-bake or a live source plugs into. Two lanes is what a
    // class figure already assumes, so it must not change anything.
    const base = trafficDensityFor({ kind: 'primary' })
    expect(trafficDensityFor({ kind: 'primary', lanes: 2 })).toBe(base)
    expect(trafficDensityFor({ kind: 'primary', lanes: 4 })).toBe(base * 2)
    expect(trafficDensityFor({ kind: 'primary', lanes: 1 })).toBe(base / 2)
    // Nonsense lane values fall back rather than zeroing a whole street.
    expect(trafficDensityFor({ kind: 'primary', lanes: 0 })).toBe(base)
    expect(trafficDensityFor({ kind: 'primary', lanes: 'two' })).toBe(base)
  })
})
