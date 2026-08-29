/**
 * @license GPL-3.0-or-later
 */
// The ASCII City Walk PLACEMENT CENSUS (CW-75).
//
// Round 8's directive says props stand in the road and cars clip through each
// other. Both are counting questions, and until this script existed they were
// answered from a scratch file that lived in a session scratchpad and pointed
// at somebody else's checkout. This one ships, runs the SHIPPED extracts
// through the SHIPPED parser and builders, and prints the numbers a release
// record has to quote.
//
//   node scripts/census-city-walk.mjs
//   node scripts/census-city-walk.mjs --cities=seattle --samples=6
//   node scripts/census-city-walk.mjs --json=build/census.json
//
// WHAT IT COUNTS, and why each row is here:
//
//   * Props per stream, so a placement change can be shown to have moved only
//     what it claimed to move (the CW-45/46 seed law: a stream that reshuffles
//     another stream's draw order is a bug, and the census is how you see it).
//   * Trunks and lamp poles standing INSIDE a drawn roadway ribbon. The two
//     are told apart by their obstacle side length, never lumped: a "trees in
//     roads" count that quietly includes 0.15 m lamp poles is a wrong number
//     with a right shape (T51). Hydrants (0.30 m) and waste baskets (0.45 m)
//     are square too and are excluded by exact side.
//   * Car-on-car overlaps as TRUE rectangle overlaps, split parked-vs-parked
//     and traffic-vs-parked. The second pair had never been counted, because
//     the frozen traffic left no record of where it went; `buildStreetProps`
//     now writes one. The overlap test is `rectsOverlap` from the game itself,
//     the same one the placement streams refuse a spot with: two copies of a
//     geometry test is how a census comes to disagree with the build for a
//     reason that is not a bug.
//   * People standing in a roadway with no mapped crossing near them.
//   * Buildings whose lowest drawn volume floats, and `building=roof` ways
//     extruded as a solid from the ground - CW-76's subject, measured here so
//     that release inherits a before number it did not take itself.
//
// WHAT IT REFUSES TO DO. It never re-implements a placement. Every position it
// judges comes out of the builders themselves, so the census cannot be wrong
// in the same direction as the code it audits.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

const { parseCityExtract } = await import(
  pathToFileURL(join(ROOT, 'src/js/game/city-data.js')).href
)
const { buildCollisionGrid, buildRoadwayIndex, rectsOverlap } = await import(
  pathToFileURL(join(ROOT, 'src/js/game/walk-controls.js')).href
)
const { buildStreetProps, buildCityGroup } = await import(
  pathToFileURL(join(ROOT, 'src/js/game/city-scene.js')).href
)

const ALL_CITIES = ['seattle', 'denver', 'albuquerque', 'burnaby']

// A prop is judged to stand in the road when more than this much of the
// ribbon lies between it and the kerb. Below it the answer is "on the line",
// which a 1 m surface grid and a rounded extract cannot settle either way.
const IN_ROAD_MARGIN_M = 0.15
// How far a person may stand inside a roadway and still be crossing it.
// Mapped crossing nodes sit on the way they cross.
const CROSSING_REACH_M = 12

// T51: what an obstacle's square side says it is.
const LAMP_SIDE_M = 0.15
const HYDRANT_SIDE_M = 0.3
const BASKET_SIDE_M = 0.45
const TRUNK_MIN_SIDE_M = 0.28
const TRUNK_MAX_SIDE_M = 0.7

function parseArgs(argv) {
  const opts = { cities: ALL_CITIES, samples: 4, json: null }
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=')
    if (key === 'cities') opts.cities = value.split(',').map((c) => c.trim())
    else if (key === 'samples') opts.samples = Number(value)
    else if (key === 'json') opts.json = value
    else throw new Error(`unknown argument: ${arg}`)
  }
  for (const city of opts.cities) {
    if (!ALL_CITIES.includes(city)) throw new Error(`unknown city: ${city}`)
  }
  return opts
}

/**
 * Count overlapping pairs among rectangles, bucketed so a city of thousands
 * of cars is not an O(n^2) wait.
 */
function countOverlaps(rects, pairAccepted) {
  const cellM = 12
  const buckets = new Map()
  rects.forEach((r, i) => {
    const k = Math.floor(r.x / cellM) + ',' + Math.floor(r.y / cellM)
    const list = buckets.get(k)
    if (list) list.push(i)
    else buckets.set(k, [i])
  })
  let pairs = 0
  const seen = new Set()
  rects.forEach((r, i) => {
    const cx = Math.floor(r.x / cellM)
    const cy = Math.floor(r.y / cellM)
    for (let gy = cy - 1; gy <= cy + 1; gy++) {
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        const list = buckets.get(gx + ',' + gy)
        if (!list) continue
        for (const j of list) {
          if (j <= i) continue
          if (!pairAccepted(rects[i], rects[j])) continue
          const key = i + ':' + j
          if (seen.has(key)) continue
          seen.add(key)
          if (rectsOverlap(rects[i], rects[j])) pairs++
        }
      }
    }
  })
  return pairs
}

function centroid(ring) {
  let x = 0
  let y = 0
  for (const p of ring) {
    x += p[0]
    y += p[1]
  }
  return [x / ring.length, y / ring.length]
}

function censusOf(city, samples) {
  const raw = JSON.parse(
    readFileSync(join(ROOT, `public/examples/ascii-city/${city}.json`), 'utf8')
  )
  const model = parseCityExtract(raw)
  const collision = buildCollisionGrid(model)
  const props = buildStreetProps(model, collision)
  const cityGroup = buildCityGroup(model)
  const roadways = buildRoadwayIndex(model.roads)

  const row = { city, samples: {} }

  // --- the streams, as the builders counted them themselves ----------------
  row.trees = props.stats.treeCount
  row.mappedTrees = props.stats.mappedTreeCount
  row.cars = props.stats.carCount
  row.traffic = props.frozenTrafficCount
  row.lamps = props.stats.lampCount
  row.people = props.peopleCount
  row.furniture = props.stats.furnitureCount
  row.treesDemoted = props.stats.treesDemoted ?? 0
  row.treesDropped = props.stats.treesDropped ?? 0
  row.treesSkippedInRoad = props.stats.treesSkippedInRoad ?? 0
  row.lampsSkippedInRoad = props.stats.lampsSkippedInRoad ?? 0
  row.peopleSkippedInRoad = props.stats.peopleSkippedInRoad ?? 0
  row.carsRefusedOverlap = props.stats.carsRefusedOverlap ?? 0
  row.roadsWithoutParking = props.stats.roadsWithoutParking ?? 0

  // --- trunks and poles standing in a roadway (T51) ------------------------
  const near = (a, b) => Math.abs(a - b) < 0.005
  let trunks = 0
  let trunksInRoad = 0
  let lampPoles = 0
  let lampsInRoad = 0
  const trunkSamples = []
  const lampSamples = []
  for (const o of props.obstacles) {
    if (Math.abs(o.halfLengthM - o.halfWidthM) > 1e-6) continue
    const side = o.halfLengthM * 2
    const isLamp = near(side, LAMP_SIDE_M)
    const isTrunk =
      side >= TRUNK_MIN_SIDE_M &&
      side <= TRUNK_MAX_SIDE_M &&
      !near(side, HYDRANT_SIDE_M) &&
      !near(side, BASKET_SIDE_M)
    if (!isLamp && !isTrunk) continue
    const hit = roadways.insideRoadway(o.x, o.y, IN_ROAD_MARGIN_M)
    if (isLamp) {
      lampPoles++
      if (hit) {
        lampsInRoad++
        if (lampSamples.length < samples) {
          lampSamples.push(
            `(${o.x.toFixed(1)}, ${o.y.toFixed(1)}) ${hit.kind} ` +
              `${hit.inside.toFixed(2)} m in`
          )
        }
      }
    } else {
      trunks++
      if (hit) {
        trunksInRoad++
        if (trunkSamples.length < samples) {
          trunkSamples.push(
            `(${o.x.toFixed(1)}, ${o.y.toFixed(1)}) ${hit.kind} ` +
              `${hit.name ?? ''} ${hit.inside.toFixed(2)} m in`
          )
        }
      }
    }
  }
  row.trunks = trunks
  row.trunksInRoad = trunksInRoad
  row.lampPoles = lampPoles
  row.lampsInRoad = lampsInRoad
  row.samples.trunksInRoad = trunkSamples
  row.samples.lampsInRoad = lampSamples

  // --- cars on cars --------------------------------------------------------
  const carRects = props.carFootprints
  row.parkedVsParked = countOverlaps(
    carRects,
    (a, b) => a.stream === 'parked' && b.stream === 'parked'
  )
  row.trafficVsParked = countOverlaps(carRects, (a, b) => a.stream !== b.stream)
  row.trafficVsTraffic = countOverlaps(
    carRects,
    (a, b) => a.stream === 'traffic' && b.stream === 'traffic'
  )

  // --- people in the road --------------------------------------------------
  const crossings = (model.wayfinding ?? []).filter(
    (w) => w.kind === 'crossing'
  )
  const crossCell = 16
  const crossingCells = new Map()
  for (const c of crossings) {
    const k = Math.floor(c.x / crossCell) + ',' + Math.floor(c.y / crossCell)
    const list = crossingCells.get(k)
    if (list) list.push(c)
    else crossingCells.set(k, [c])
  }
  const nearCrossing = (x, y) => {
    const cx = Math.floor(x / crossCell)
    const cy = Math.floor(y / crossCell)
    for (let gy = cy - 1; gy <= cy + 1; gy++) {
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (const c of crossingCells.get(gx + ',' + gy) ?? []) {
          if (Math.hypot(c.x - x, c.y - y) <= CROSSING_REACH_M) return true
        }
      }
    }
    return false
  }
  let peopleInRoad = 0
  let peopleInRoadAtCrossing = 0
  const peopleSamples = []
  for (const f of props.figureSpots) {
    const hit = roadways.insideRoadway(f.x, f.y, IN_ROAD_MARGIN_M)
    if (!hit) continue
    if (nearCrossing(f.x, f.y)) {
      peopleInRoadAtCrossing++
      continue
    }
    peopleInRoad++
    if (peopleSamples.length < samples) {
      peopleSamples.push(
        `(${f.x.toFixed(1)}, ${f.y.toFixed(1)}) ${f.pose} in ` +
          `${hit.kind} ${hit.inside.toFixed(2)} m`
      )
    }
  }
  row.crossings = crossings.length
  row.peopleInRoad = peopleInRoad
  row.peopleInRoadAtCrossing = peopleInRoadAtCrossing
  row.samples.peopleInRoad = peopleSamples

  // --- buildings: what floats and what is a roof (CW-76's before numbers) --
  let floating = 0
  let roofWays = 0
  let roofSolidFromGround = 0
  let roofOverRoadway = 0
  const floatingSamples = []
  const roofSamples = []
  for (const b of model.buildings) {
    const kind = b.tags?.building
    const lowest = Number.isFinite(b.minHeightM) ? b.minHeightM : 0
    // Which volumes the SCENE actually extrudes. Where the parts cover the
    // outline they REPLACE it (city-scene.js), so a tower whose parts all
    // start at 45 m has nothing on the ground even though its outline says
    // zero - and a census that averages the outline in cannot see it float.
    const volumes = b.partsAreMass ? (b.parts ?? []) : [b, ...(b.parts ?? [])]
    const bases = volumes.map((v) =>
      Number.isFinite(v.minHeightM) ? v.minHeightM : 0
    )
    const base = bases.length ? Math.min(...bases) : lowest
    if (base > 0.5) {
      floating++
      if (floatingSamples.length < samples) {
        const [cx, cy] = centroid(b.outer)
        floatingSamples.push(
          `${b.id} ${b.name ?? ''} (${cx.toFixed(1)}, ${cy.toFixed(1)}) ` +
            `base ${base.toFixed(1)} m`
        )
      }
    }
    if (kind === 'roof' || kind === 'bridge') {
      roofWays++
      if (!(lowest > 0.5)) roofSolidFromGround++
      const [cx, cy] = centroid(b.outer)
      const hit = roadways.insideRoadway(cx, cy, -1)
      if (hit) {
        roofOverRoadway++
        if (roofSamples.length < samples) {
          roofSamples.push(
            `${b.id} ${b.name ?? ''} (${cx.toFixed(1)}, ${cy.toFixed(1)}) ` +
              `over ${hit.kind} ${hit.name ?? ''}`
          )
        }
      }
    }
  }
  row.floating = floating
  row.roofWays = roofWays
  row.roofSolidFromGround = roofSolidFromGround
  row.roofOverRoadway = roofOverRoadway
  row.samples.floating = floatingSamples
  row.samples.roofOverRoadway = roofSamples

  // --- CW-73/CW-74: read the builders' own counters, never recount the tags
  const s = cityGroup.stats
  row.storefrontSource = s.storefrontSource
  row.storefrontOwnTagged = s.storefrontOwnTagged
  row.storefrontOwnTagHotel = s.storefrontOwnTagHotel
  row.fittedWalls = s.fittedWalls
  row.blankWalls = s.blankWalls
  row.shortWalls = s.shortWalls
  row.wallMetres = Math.round(s.wallMetres)
  row.blankMetres = Math.round(s.blankMetres)

  // --- what the roadway index itself saw -----------------------------------
  row.roadways = roadways.count
  row.roadwaysSkipped = (model.roads ?? []).length - roadways.count

  cityGroup.dispose?.()
  props.dispose?.()
  return row
}

function format(v) {
  if (v === undefined || v === null) return '-'
  if (typeof v === 'object') {
    return Object.entries(v)
      .map(([k, n]) => `${k} ${n}`)
      .join(', ')
  }
  return String(v)
}

function table(rows, title, keys) {
  const out = [`| ${title} | ${rows.map((r) => r.city).join(' | ')} |`]
  out.push(`|---|${rows.map(() => '---').join('|')}|`)
  for (const [label, key] of keys) {
    out.push(`| ${label} | ${rows.map((r) => format(r[key])).join(' | ')} |`)
  }
  return out.join('\n')
}

const ROWS = [
  ['roadway ribbons indexed', 'roadways'],
  ['ways skipped (pavement / undrawn)', 'roadwaysSkipped'],
  ['trees', 'trees'],
  ['...of them mapped', 'mappedTrees'],
  ['...demoted to a pavement', 'treesDemoted'],
  ['...dropped, no pavement to take', 'treesDropped'],
  ['...refused, the road was under them', 'treesSkippedInRoad'],
  ['parked cars', 'cars'],
  ['roads too narrow to park on', 'roadsWithoutParking'],
  ['cars refused, a car was already there', 'carsRefusedOverlap'],
  ['frozen traffic', 'traffic'],
  ['lamps', 'lamps'],
  ['...refused, the road was under them', 'lampsSkippedInRoad'],
  ['people', 'people'],
  ['...refused, the road was under them', 'peopleSkippedInRoad'],
  ['furniture', 'furniture'],
  ['**trunks inside a roadway**', 'trunksInRoad'],
  ['...of how many trunks', 'trunks'],
  ['**lamp poles inside a roadway**', 'lampsInRoad'],
  ['...of how many poles', 'lampPoles'],
  ['**traffic vs parked overlaps**', 'trafficVsParked'],
  ['parked vs parked overlaps', 'parkedVsParked'],
  ['traffic vs traffic overlaps', 'trafficVsTraffic'],
  ['**people in a roadway, no crossing**', 'peopleInRoad'],
  ['people in a roadway at a crossing', 'peopleInRoadAtCrossing'],
  ['mapped crossings', 'crossings'],
  ['floating buildings', 'floating'],
  ['roof/bridge ways', 'roofWays'],
  ['...solid from the ground', 'roofSolidFromGround'],
  ['...centroid over a roadway', 'roofOverRoadway'],
  ['storefront source', 'storefrontSource'],
  ['own-tagged storefronts', 'storefrontOwnTagged'],
  ['fitted walls', 'fittedWalls'],
  ['blank walls', 'blankWalls'],
  ['wall metres', 'wallMetres'],
  ['blank metres', 'blankMetres'],
]

const opts = parseArgs(process.argv.slice(2))
const rows = opts.cities.map((city) => censusOf(city, opts.samples))

console.log(table(rows, 'placement', ROWS))

for (const row of rows) {
  for (const [what, list] of Object.entries(row.samples)) {
    if (!list.length) continue
    console.log(`\n${row.city} ${what}:`)
    for (const line of list) console.log(`  ${line}`)
  }
}

if (opts.json) {
  mkdirSync(dirname(opts.json), { recursive: true })
  writeFileSync(opts.json, JSON.stringify(rows, null, 2))
  console.log(`\nwrote ${opts.json}`)
}
