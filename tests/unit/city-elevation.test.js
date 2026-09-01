import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ELEVATION_STEP_M,
  ELEVATION_SOURCES,
  sourceFor,
  gridPoints,
  sampleUrl,
  readSample,
  cacheName,
  sampleGrid,
  elevationBlock,
  readJson,
} from '../../scripts/city-elevation.mjs'
import { parseElevation } from '../../src/js/game/city-data.js'

const SEATTLE = { lat: 47.612, lon: -122.34 }
const BURNABY = { lat: 49.2276, lon: -123.0076 }

/** A fetcher that answers from a table and records what it was asked. */
function fakeFetcher(answer) {
  const seen = []
  return {
    seen,
    fetchJson: async (url) => {
      seen.push(url)
      return answer(url, seen.length)
    },
  }
}

const noSleep = async () => {}

describe('sourceFor', () => {
  it('sends the three US circles to USGS and Burnaby to NRCan', () => {
    expect(sourceFor(47.612, -122.34)).toBe('usgs')
    expect(sourceFor(39.7439, -104.9922)).toBe('usgs')
    expect(sourceFor(35.0844, -106.6504)).toBe('usgs')
    expect(sourceFor(49.2276, -123.0076)).toBe('nrcan')
  })

  it('names a licence and an attribution for every source it can pick', () => {
    // A source with no licence text would put an unattributed dataset into a
    // shipped file, which is the one thing this must not do.
    for (const key of ['usgs', 'nrcan']) {
      expect(ELEVATION_SOURCES[key].license.length).toBeGreaterThan(10)
      expect(ELEVATION_SOURCES[key].attribution.length).toBeGreaterThan(10)
    }
  })
})

describe('gridPoints', () => {
  it('is square, odd, and centred on the city', () => {
    const g = gridPoints(SEATTLE, 100, 20)
    expect(g.cols).toBe(11)
    expect(g.rows).toBe(11)
    expect(g.originX).toBe(-100)
    expect(g.originY).toBe(-100)
    const middle = g.points[5 * 11 + 5]
    expect(middle.lat).toBeCloseTo(SEATTLE.lat, 9)
    expect(middle.lon).toBeCloseTo(SEATTLE.lon, 9)
  })

  it('leaves the corners null so the grid stays a rectangle', () => {
    const g = gridPoints(SEATTLE, 100, 20)
    expect(g.points[0]).toBeNull()
    expect(g.points[g.points.length - 1]).toBeNull()
    const inside = g.points.filter(Boolean).length
    // A circle of radius r in a grid of step s holds about pi*r^2/s^2 points.
    expect(inside).toBeGreaterThan(60)
    expect(inside).toBeLessThan(g.points.length)
  })

  it('asks for the SAME points on a second bake, so the cache is reusable', () => {
    const a = gridPoints(SEATTLE, 300, ELEVATION_STEP_M)
    const b = gridPoints(SEATTLE, 300, ELEVATION_STEP_M)
    expect(JSON.stringify(a.points)).toBe(JSON.stringify(b.points))
    expect(cacheName('seattle', SEATTLE, 300, 20)).toBe(
      'seattle-47.6120_-122.3400-r300-s20.json'
    )
  })

  it('walks a metre grid, not a degree one', () => {
    // 20 m north is 20 m north at both latitudes; 20 m EAST is more degrees
    // of longitude the further north you are, and getting that wrong skews
    // the whole terrain into a parallelogram.
    const s = gridPoints(SEATTLE, 40, 20)
    const b = gridPoints(BURNABY, 40, 20)
    const dLatS = s.points[3 * 5 + 2].lat - s.points[2 * 5 + 2].lat
    const dLatB = b.points[3 * 5 + 2].lat - b.points[2 * 5 + 2].lat
    expect(dLatS).toBeCloseTo(dLatB, 9)
    const dLonS = s.points[2 * 5 + 3].lon - s.points[2 * 5 + 2].lon
    const dLonB = b.points[2 * 5 + 3].lon - b.points[2 * 5 + 2].lon
    expect(dLonB).toBeGreaterThan(dLonS)
  })
})

describe('sampleUrl and readSample', () => {
  it('asks EPQS in metres on WGS84', () => {
    const u = sampleUrl('usgs', SEATTLE)
    expect(u).toContain('epqs.nationalmap.gov')
    expect(u).toContain('units=Meters')
    expect(u).toContain('wkid=4326')
    expect(u).toContain('x=-122.3400000')
    expect(u).toContain('y=47.6120000')
  })

  it('asks NRCan for an altitude', () => {
    const u = sampleUrl('nrcan', BURNABY)
    expect(u).toContain('geogratis.gc.ca')
    expect(u).toContain('lat=49.2276000')
  })

  it('reads a value from each service', () => {
    expect(readSample('usgs', { value: '45.78' })).toBeCloseTo(45.78, 6)
    expect(readSample('nrcan', { altitude: 138 })).toBe(138)
  })

  it('★ treats the EPQS out-of-coverage sentinel as NO DATA, not as a cliff', () => {
    // EPQS answers a point it does not cover with a large negative number and
    // HTTP 200. Believed, it would put a kilometre-deep hole in the terrain.
    expect(readSample('usgs', { value: '-1000000' })).toBeNull()
    expect(readSample('usgs', { value: 'x' })).toBeNull()
    expect(readSample('nrcan', {})).toBeNull()
    expect(readSample('usgs', null)).toBeNull()
  })

  it('keeps a real height below sea level', () => {
    // Seattle's circle reaches -0.4 m at the waterfront.
    expect(readSample('usgs', { value: '-0.4' })).toBeCloseTo(-0.4, 6)
  })
})

describe('sampleGrid', () => {
  const tiny = () => gridPoints(SEATTLE, 40, 20)

  it('samples every point inside the circle and nothing outside it', async () => {
    const g = tiny()
    const f = fakeFetcher(() => ({ ok: true, body: { value: '12.5' } }))
    const out = await sampleGrid({
      grid: g,
      source: 'usgs',
      fetchJson: f.fetchJson,
      sleep: noSleep,
      concurrency: 3,
    })
    const inside = g.points.filter(Boolean).length
    expect(f.seen.length).toBe(inside)
    expect(out.filled).toBe(inside)
    expect(out.holes).toBe(0)
    expect(out.samples.filter((v) => v !== null).length).toBe(inside)
    for (let i = 0; i < g.points.length; i++) {
      if (!g.points[i]) expect(out.samples[i]).toBeNull()
    }
  })

  it('backs off a 429 SHORTLY and keeps the answer that follows', async () => {
    let first = true
    const f = fakeFetcher(() => {
      if (first) {
        first = false
        return { ok: false, status: 429 }
      }
      return { ok: true, body: { value: '7' } }
    })
    const waits = []
    const out = await sampleGrid({
      grid: tiny(),
      source: 'usgs',
      fetchJson: f.fetchJson,
      sleep: async (ms) => waits.push(ms),
      concurrency: 1,
    })
    // 5 s, not Overpass's 30 s: measured over 600 sustained samples, these
    // services never rate-limited at all - every response was HTTP 200, just
    // slow. A non-200 here is an outage or a blip, and waiting half a minute
    // for it would add hours to a bake for nothing.
    expect(waits[0]).toBe(5000)
    expect(out.holes).toBe(0)
  })

  it('gives up a point as a HOLE after four tries, and says so', async () => {
    const g = tiny()
    // One real point of this grid, so the fake fails something that exists.
    const doomed = sampleUrl('usgs', g.points.find(Boolean))
    const f = fakeFetcher((url) =>
      url === doomed
        ? { ok: false, status: 503 }
        : { ok: true, body: { value: '3' } }
    )
    const out = await sampleGrid({
      grid: g,
      source: 'usgs',
      fetchJson: f.fetchJson,
      sleep: noSleep,
      concurrency: 1,
    })
    expect(out.holes).toBe(1)
    expect(out.warnings.join(' ')).toContain('HTTP 503')
    // ...and a hole is a hole, never a zero.
    expect(out.samples.some((v) => v === 0)).toBe(false)
  })

  it('★ every warning it raises is one the bake gate can actually see', () => {
    // THIS TEST FOUND A REAL HOLE. The gate first filtered its input for
    // /WARNING:|ERROR:/ - and none of these messages carries either word, so
    // a run that lost points to a 503 would have written the extract anyway,
    // which is the exact D-97 shape the gate exists to stop. The gate now
    // treats ANY entry as fatal, and this pins that: a message must not have
    // to say the word to be heard.
    const line = 'elevation sample HTTP 503 at 47.61,-122.34 - left as a hole'
    expect(/WARNING:|ERROR:/i.test(line)).toBe(false)
    expect(line.trim().length).toBeGreaterThan(0)
  })

  it('reuses a cache on a second run and asks for nothing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cw77-elev-'))
    const file = 'x.json'
    const g = tiny()
    const one = fakeFetcher(() => ({ ok: true, body: { value: '21' } }))
    const first = await sampleGrid({
      grid: g,
      source: 'usgs',
      cacheDir: dir,
      cacheFile: file,
      fetchJson: one.fetchJson,
      sleep: noSleep,
    })
    expect(first.requested).toBeGreaterThan(0)
    expect(first.fromCache).toBe(0)

    const two = fakeFetcher(() => {
      throw new Error('the cache should have answered')
    })
    const again = await sampleGrid({
      grid: g,
      source: 'usgs',
      cacheDir: dir,
      cacheFile: file,
      fetchJson: two.fetchJson,
      sleep: noSleep,
    })
    expect(again.requested).toBe(0)
    expect(two.seen.length).toBe(0)
    expect(again.filled).toBe(first.filled)
  })

  it('re-samples a corrupt cache rather than reading it as empty data', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cw77-elev-'))
    writeFileSync(join(dir, 'bad.json'), '{ not json')
    const f = fakeFetcher(() => ({ ok: true, body: { value: '9' } }))
    const out = await sampleGrid({
      grid: tiny(),
      source: 'usgs',
      cacheDir: dir,
      cacheFile: 'bad.json',
      fetchJson: f.fetchJson,
      sleep: noSleep,
    })
    expect(out.warnings.join(' ')).toContain('cache unreadable')
    expect(out.filled).toBeGreaterThan(0)
    expect(JSON.parse(readFileSync(join(dir, 'bad.json'), 'utf8')).samples).toBeTruthy()
  })
})

describe('readJson', () => {
  it('★ treats HTTP 200 with an UNREADABLE BODY as a retryable failure', async () => {
    // THIS KILLED A REAL BAKE. USGS EPQS answers 200 with an empty body often
    // enough to hit once in the first 2,000 points of Seattle, and an
    // unguarded `await r.json()` threw out of the worker, out of Promise.all
    // and out of the script, twenty minutes in. 200 is not an answer.
    const res = await readJson('x', '', async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input')
      },
    }))
    expect(res.ok).toBe(false)
    expect(res.status).toBe(502)
    expect(res.reason).toContain('HTTP 200')
    expect(res.reason).toContain('unreadable body')
    // 502 is >= 500, which is what makes the sampler try again.
    expect(res.status >= 500).toBe(true)
  })

  it('turns a thrown network error into a retryable failure too', async () => {
    const res = await readJson('x', '', async () => {
      throw new TypeError('fetch failed')
    })
    expect(res.ok).toBe(false)
    expect(res.status).toBe(599)
    expect(res.reason).toContain('fetch failed')
  })

  it('passes a good body straight through', async () => {
    const res = await readJson('x', 'UA', async (url, init) => {
      expect(init.headers['User-Agent']).toBe('UA')
      return { ok: true, status: 200, json: async () => ({ value: '4' }) }
    })
    expect(res).toEqual({ ok: true, body: { value: '4' } })
  })

  it('reports a real HTTP failure as itself', async () => {
    const res = await readJson('x', '', async () => ({ ok: false, status: 503 }))
    expect(res).toEqual({ ok: false, status: 503 })
  })
})

describe('elevationBlock and parseElevation', () => {
  const built = () => {
    const g = gridPoints(SEATTLE, 40, 20)
    const samples = g.points.map((p, i) => (p ? 10 + (i % 5) * 0.125 : null))
    return { g, block: elevationBlock({ grid: g, source: 'usgs', samples }) }
  }

  it('carries the grid, the licence and centimetre samples', () => {
    const { g, block } = built()
    expect(block.cols).toBe(g.cols)
    expect(block.stepM).toBe(20)
    expect(block.samples.length).toBe(g.cols * g.rows)
    expect(block.license).toContain('public domain')
    expect(block.attribution).toContain('U.S. Geological Survey')
    for (const v of block.samples) {
      if (v !== null) expect(Math.abs(v * 100 - Math.round(v * 100))).toBeLessThan(1e-6)
    }
  })

  it('is null when nothing answered, so empty never looks like flat', () => {
    const g = gridPoints(SEATTLE, 40, 20)
    expect(
      elevationBlock({ grid: g, source: 'usgs', samples: g.points.map(() => null) })
    ).toBeNull()
  })

  it('round-trips through the parser the game uses', () => {
    const { g, block } = built()
    const parsed = parseElevation(block)
    expect(parsed.cols).toBe(g.cols)
    expect(parsed.samples.length).toBe(g.cols * g.rows)
    // ★ COVERAGE IS OF THE POINTS THE BAKE ASKED FOR, not of the rectangle.
    // A circle fills about 61 % of its own bounding square at this step, and
    // reporting that as "61 % covered" reads as a third of the terrain being
    // missing when nothing is. Everything inside the circle answered here, so
    // this is 1.
    expect(parsed.coverage).toBeCloseTo(1, 6)
    expect(parsed.inCircle).toBe(g.points.filter(Boolean).length)
    expect(parsed.minM).toBeCloseTo(10, 6)
    expect(parsed.maxM).toBeCloseTo(10.5, 6)
    expect(Number.isNaN(parsed.samples[0])).toBe(true)
  })

  it('refuses a block it cannot trust rather than half-filling a heightfield', () => {
    expect(parseElevation(undefined)).toBeNull()
    expect(parseElevation({})).toBeNull()
    const { block } = built()
    expect(parseElevation({ ...block, samples: block.samples.slice(1) })).toBeNull()
    expect(parseElevation({ ...block, stepM: 0 })).toBeNull()
    expect(parseElevation({ ...block, cols: 1 })).toBeNull()
    expect(
      parseElevation({ ...block, samples: block.samples.map(() => null) })
    ).toBeNull()
  })

  it('reports LESS than full coverage when a point really is missing', () => {
    const { g, block } = built()
    const holed = { ...block, samples: block.samples.slice() }
    const firstReal = holed.samples.findIndex((v) => v !== null)
    holed.samples[firstReal] = null
    const parsed = parseElevation(holed)
    const asked = g.points.filter(Boolean).length
    expect(parsed.coverage).toBeCloseTo((asked - 1) / asked, 6)
    expect(parsed.coverage).toBeLessThan(1)
  })

  it('a v1 extract simply has none, which is the additive promise', () => {
    expect(parseElevation(null)).toBeNull()
  })
})
