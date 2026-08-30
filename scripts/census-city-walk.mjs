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
//   * Mass standing over an empty column, canopies and their legs (CW-76).
//     The old "floating buildings" row counted a tower with no podium, one
//     slice of a stack of orphan parts, and a canopy - which hangs on purpose
//     - as the same thing; see the block that computes them for what replaced
//     it and why.
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

/**
 * Median and quartile nearest-neighbour distance over a point set.
 *
 * CW-77: a lamp COUNT cannot say whether a street is lit - two cities with
 * the same count light very different amounts of street. The spacing can, and
 * it is the number the lighting standard is written in.
 */
function nearestSpacing(points) {
  if (points.length < 2) return 'n/a'
  const cell = 80
  const grid = new Map()
  points.forEach(([x, y], i) => {
    const k = `${Math.floor(x / cell)},${Math.floor(y / cell)}`
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k).push(i)
  })
  const near = []
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i]
    let best = Infinity
    const cx = Math.floor(x / cell)
    const cy = Math.floor(y / cell)
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        for (const j of grid.get(`${cx + a},${cy + b}`) ?? []) {
          if (j === i) continue
          const d = Math.hypot(points[j][0] - x, points[j][1] - y)
          if (d < best) best = d
        }
      }
    }
    if (Number.isFinite(best)) near.push(best)
  }
  if (near.length === 0) return 'n/a'
  near.sort((a, b) => a - b)
  const q = (f) => near[Math.min(near.length - 1, Math.floor(near.length * f))]
  return `p25 ${q(0.25).toFixed(1)} med ${q(0.5).toFixed(1)} p75 ${q(0.75).toFixed(1)} m`
}

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
  const opts = {
    cities: ALL_CITIES,
    samples: 4,
    json: null,
    // CW-77: which copy of the extracts to read. A rebake moves counts for
    // TWO reasons at once - the live map has changed, and the code has - and
    // the only way to tell them apart is to run one against the other's data.
    extracts: join(ROOT, 'public/examples/ascii-city'),
  }
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=')
    if (key === 'cities') opts.cities = value.split(',').map((c) => c.trim())
    else if (key === 'samples') opts.samples = Number(value)
    else if (key === 'json') opts.json = value
    else if (key === 'extracts') opts.extracts = value
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

function censusOf(city, samples, extractsDir) {
  const raw = JSON.parse(
    readFileSync(join(extractsDir, `${city}.json`), 'utf8')
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

  // --- buildings: what floats and what is a canopy (CW-76) -----------------
  //
  // ★ THE ROW THAT USED TO BE HERE COUNTED THREE DIFFERENT THINGS. "Buildings
  // whose lowest drawn volume floats" was 33 / 23 / 0 / 14 before CW-76, and
  // only one of the three was a defect:
  //
  //   * a tower whose parts all start in the air with no podium under them
  //     (Metropolitan Park West Tower at 45 m) - the defect;
  //   * one slice of a STACK of orphaned building:parts whose lower slices
  //     are separate ways standing on the street (Seattle has a stack running
  //     8.2 -> 9.8 -> 15.8 -> 121.9 -> 134.1 m at one footprint, and the old
  //     row called four of its five slices floating);
  //   * a canopy, which hangs BY DEFINITION.
  //
  // So the row is replaced by three that each mean one thing. `floatingMass`
  // is the oracle: a mass whose column really is empty under it, measured by
  // city-data AFTER its own repair pass, so it is a post-condition and not an
  // assumption.
  const st = model.stats
  row.floatingMass = st.floatingMass
  row.canopies = st.canopyCount
  row.canopiesCovered = st.canopyCovered
  row.canopyBySource = Object.entries(st.canopyBySource)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k} ${n}`)
    .join(', ')
  row.podiums = st.podiumCount
  row.groundedVolumes = st.groundedVolumes
  row.canopyColumns = cityGroup.stats.canopyColumns
  row.canopyColumnsRefused = cityGroup.stats.canopyColumnsRefused
  row.canopyUnsupported = cityGroup.stats.canopyUnsupported

  let roofSolidFromGround = 0
  let roofOverRoadway = 0
  let slabSum = 0
  const roofSamples = []
  for (const b of model.buildings) {
    if (!b.canopy) continue
    if (!(b.minHeightM > 0.5)) roofSolidFromGround++
    slabSum += b.minHeightM
    const [cx, cy] = centroid(b.outer)
    const hit = roadways.insideRoadway(cx, cy, -1)
    if (!hit) continue
    roofOverRoadway++
    if (roofSamples.length < samples) {
      roofSamples.push(
        `${b.id ?? 'orphan'} ${b.name ?? ''} (${cx.toFixed(1)}, ${cy.toFixed(1)}) ` +
          `slab ${b.minHeightM.toFixed(1)}-${b.heightM.toFixed(1)} m ` +
          `(${b.canopy.source}) over ${hit.kind} ${hit.name ?? ''}`
      )
    }
  }
  row.roofSolidFromGround = roofSolidFromGround
  row.roofOverRoadway = roofOverRoadway
  row.canopySlabMean = st.canopyCount
    ? (slabSum / st.canopyCount).toFixed(1)
    : '0.0'
  row.samples.roofOverRoadway = roofSamples

  // --- CW-77: where the lamps came from, and the terrain the bake sampled.
  row.lampsMappedConsidered = props.stats.lampsMappedConsidered ?? 0
  row.lampsMapped = props.stats.lampsMapped ?? 0
  row.lampsMappedNudged = props.stats.lampsMappedNudged ?? 0
  row.lampsMappedRefused =
    (props.stats.lampsMappedInRoad ?? 0) +
    (props.stats.lampsMappedBlocked ?? 0) +
    (props.stats.lampsMappedCrowded ?? 0)
  row.lampsProcedural = props.stats.lampsProcedural ?? 0
  row.lampNodes = model.stats.lampNodeCount ?? 0
  row.lampOperators = Object.entries(model.stats.lampNodesByOperator ?? {})
    .map(([k, n]) => `${k} ${n}`)
    .join(', ')
  row.terrain = model.elevation
    ? `${model.elevation.cols}x${model.elevation.rows} @ ${model.elevation.stepM} m, ` +
      `${(model.elevation.coverage * 100).toFixed(1)} % covered, ` +
      `${model.elevation.minM.toFixed(1)}..${model.elevation.maxM.toFixed(1)} m`
    : 'none (v1 extract)'

  // --- the nearest-lamp spacing, which is what a lighting standard is ABOUT.
  // A count says how many; only the spacing says whether the street is lit.
  const lampPts = (props.lampHeads ?? []).map((l) => [l.x, l.y])
  row.lampSpacing = nearestSpacing(lampPts)

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
  ['...mapped lamps the extract carries', 'lampNodes'],
  ['...whose they are', 'lampOperators'],
  ['...mapped lamps offered', 'lampsMappedConsidered'],
  ['...of them stood', 'lampsMapped'],
  ['...of them nudged out of a ribbon', 'lampsMappedNudged'],
  ['...mapped lamps refused', 'lampsMappedRefused'],
  ['...invented to fill the gaps', 'lampsProcedural'],
  ['...nearest-lamp spacing', 'lampSpacing'],
  ['terrain', 'terrain'],
  ['**traffic vs parked overlaps**', 'trafficVsParked'],
  ['parked vs parked overlaps', 'parkedVsParked'],
  ['traffic vs traffic overlaps', 'trafficVsTraffic'],
  ['**people in a roadway, no crossing**', 'peopleInRoad'],
  ['people in a roadway at a crossing', 'peopleInRoadAtCrossing'],
  ['mapped crossings', 'crossings'],
  ['**mass floating over an empty column**', 'floatingMass'],
  ['podiums drawn under floating parts', 'podiums'],
  ['volumes drawn down to what is under them', 'groundedVolumes'],
  ['canopies (roof/bridge)', 'canopies'],
  ['...where the slab height came from', 'canopyBySource'],
  ['...mean slab underside, m', 'canopySlabMean'],
  ['**...still solid from the ground**', 'roofSolidFromGround'],
  ['...centroid over a roadway', 'roofOverRoadway'],
  ['canopy columns placed', 'canopyColumns'],
  ['...refused, the road was under them', 'canopyColumnsRefused'],
  ['...canopies left with no column at all', 'canopyUnsupported'],
  ['storefront source', 'storefrontSource'],
  ['own-tagged storefronts', 'storefrontOwnTagged'],
  ['fitted walls', 'fittedWalls'],
  ['blank walls', 'blankWalls'],
  ['wall metres', 'wallMetres'],
  ['blank metres', 'blankMetres'],
]

const opts = parseArgs(process.argv.slice(2))
const rows = opts.cities.map((city) =>
  censusOf(city, opts.samples, opts.extracts)
)

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
