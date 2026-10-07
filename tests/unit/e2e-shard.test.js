import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import {
  MEASURED_SECONDS,
  DEFAULT_WEIGHT_S,
  PROJECT_IGNORES,
  CI_SKIPPED,
  CI_SKIPPED_WEIGHT_S,
  planShards,
  filesForProject,
  listSpecFiles,
  weightsFor,
} from '../../scripts/e2e-shard.mjs'

/**
 * The e2e lanes are sharded by measured cost rather than by test count:
 * count-based sharding would put a quarter of the whole Chromium lane -
 * ascii-city-walk.spec.js, 18 minutes of it - permanently in shard 1 and
 * leave that shard failing on Playwright's 35-minute ceiling.
 *
 * What has to stay true is not the exact division, which will move whenever a
 * weight does. It is that every spec file runs on exactly one shard, and that
 * the halves stay close enough that neither approaches the ceiling.
 */
const SPEC_DIR = path.resolve(__dirname, '../e2e')

const load = (files) =>
  files.reduce((sum, f) => sum + (MEASURED_SECONDS[f] ?? DEFAULT_WEIGHT_S), 0)

describe('e2e shard planner', () => {
  const files = listSpecFiles(SPEC_DIR)

  it('finds the suite', () => {
    expect(files.length).toBeGreaterThan(50)
    expect(files).toContain('ascii-city-walk.spec.js')
    expect(files.every((f) => f.endsWith('.spec.js'))).toBe(true)
  })

  for (const total of [2, 3, 4, 6]) {
    it(`runs every spec file exactly once across ${total} shards`, () => {
      const plan = planShards(files, MEASURED_SECONDS, total)
      const placed = plan.flat()
      expect(placed.length, 'a file was placed twice, or dropped').toBe(
        files.length
      )
      expect([...placed].sort()).toEqual([...files].sort())
    })
  }

  it('splits the measured cost evenly, not the file count', () => {
    const [a, b] = planShards(files, MEASURED_SECONDS, 2)
    const spread = Math.abs(load(a) - load(b))
    // A minute of test time apart is a wall-clock half-minute at two workers.
    expect(
      spread,
      `shards differ by ${(spread / 60).toFixed(1)} test-minutes`
    ).toBeLessThan(60)
    // The point of the exercise: the counts are ALLOWED to be lopsided.
    expect(a.length).not.toBe(b.length)
  })

  // Two CI workers per shard, plus a couple of minutes of checkout, npm ci
  // and browser install before any test runs.
  const SETUP_MIN = 3
  const projectMin = (shard) => load(shard) / 60 / 2 + SETUP_MIN

  it('never lets a Chromium shard approach the 35-minute ceiling', () => {
    // The weights must be re-measured from a green run as suites grow: a guard
    // reading a stale model can pass while the lane is two minutes from the
    // ceiling, because the arithmetic is sound and the weights are low. A
    // model can be right and still lie, if nobody re-measures what it is
    // multiplying.
    //
    // Chromium runs six shards (test.yml): with fewer, the lane's heavy city
    // suites push a shard past the 2100 s clock, and the two-core runner does
    // not parallelize software 3D. Twenty-five minutes leaves ten of margin on
    // a thirty-five minute ceiling, which is what a starved runner eats.
    for (const shard of planShards(files, MEASURED_SECONDS, 6)) {
      const wallMin = projectMin(shard)
      expect(
        wallMin,
        `a Chromium shard projects to ${wallMin.toFixed(1)} minutes`
      ).toBeLessThan(25)
    }
  })

  it('says out loud how little room the ceiling-bound lanes have left', () => {
    // Edge and Firefox run three shards each, behind one required summary
    // check per lane, so a re-split needs no ruleset change. This does not
    // demand the room Chromium has; what it does is refuse to let a lane
    // quietly cross the real ceiling, and name the margin when it is asked.
    // The projection below covers the worst split, so a regression in either
    // lane's shape still trips here.
    const CEILING_MIN = 35
    // Each lane is booked for what it runs at the shard count it actually
    // has: three each (at two, Firefox would project to 49.4 of these 35
    // minutes). Firefox leaves out wasm-smoke, and both leave out the drawing
    // editor's own walk - that ignore is re-visited only from a green CI
    // board, never from a projection.
    for (const [project, laneShards] of [
      ['msedge', 3],
      ['firefox', 3],
    ]) {
      const lane = filesForProject(files, project)
      for (const shard of planShards(lane, MEASURED_SECONDS, laneShards)) {
        const wallMin = projectMin(shard)
        expect(
          wallMin,
          `a ${laneShards}-shard ${project} lane projects to ${wallMin.toFixed(1)} minutes, ` +
            `${(CEILING_MIN - wallMin).toFixed(1)} short of the ceiling`
        ).toBeLessThan(CEILING_MIN)
      }
    }
  })

  it('a file a lane leaves out is left out of its shards, and only its', () => {
    for (const [project, skipped] of Object.entries(PROJECT_IGNORES)) {
      const lane = filesForProject(files, project)
      for (const file of skipped) {
        expect(files, `${file} must exist to be left out`).toContain(file)
        expect(lane).not.toContain(file)
        expect(planShards(lane, MEASURED_SECONDS, 2).flat()).not.toContain(file)
      }
      expect(lane.length).toBe(files.length - skipped.length)
    }
    // Chromium runs everything, on three shards.
    expect(filesForProject(files, 'chromium')).toEqual(files)
    expect(filesForProject(files, 'no-such-project')).toEqual(files)
  })

  it('places a file nobody has measured yet, and charges it for the room', () => {
    const withNewcomer = [...files, 'zzz-brand-new.spec.js']
    const plan = planShards(withNewcomer, MEASURED_SECONDS, 2)
    const home = plan.find((s) => s.includes('zzz-brand-new.spec.js'))
    expect(home, 'an unmeasured spec fell between the shards').toBeTruthy()
    expect(plan.flat()).toHaveLength(withNewcomer.length)
    expect(load(home)).toBeGreaterThanOrEqual(DEFAULT_WEIGHT_S)
  })

  it('is deterministic: the same suite always divides the same way', () => {
    const once = planShards(files, MEASURED_SECONDS, 2)
    const again = planShards([...files].reverse(), MEASURED_SECONDS, 2)
    expect(again).toEqual(once)
  })

  it('refuses a shard count that is not a positive whole number', () => {
    for (const bad of [0, -1, 1.5, 'two', undefined]) {
      expect(() => planShards(files, MEASURED_SECONDS, bad)).toThrow(
        /positive integer/
      )
    }
  })

  it('keeps the weight table honest about which files exist', () => {
    const measuredButGone = Object.keys(MEASURED_SECONDS).filter(
      (f) => !files.includes(f)
    )
    expect(
      measuredButGone,
      'the weight table names spec files that are no longer here'
    ).toEqual([])
  })
})

/**
 * A lane should be booked for what it will actually run.
 *
 * The City Walk suites are paused on CI and skip themselves in seconds
 * there. Booked at their full measured minutes, the three heaviest would
 * each get a shard on the Chromium lane, leaving three of six idle on CI
 * and pushing everything else into the remainder - one shard carrying 44
 * files, with tests failing there for crowding rather than for behaviour.
 */
describe('planning for what CI actually runs', () => {
  const files = filesForProject(
    listSpecFiles(path.resolve('tests/e2e')),
    'chromium'
  )

  it('every CI-skipped file is a spec that exists', () => {
    const gone = CI_SKIPPED.filter((f) => !files.includes(f))
    expect(gone, 'CI_SKIPPED names spec files that are no longer here').toEqual(
      []
    )
  })

  it('every CI-skipped file really does skip itself on CI', () => {
    // The skip lives in one helper; a file claiming to be skipped without
    // using it would be booked at nothing and then run for minutes.
    for (const file of CI_SKIPPED) {
      const source = readFileSync(path.resolve('tests/e2e', file), 'utf-8')
      expect(
        source.includes('useCityWalkFixtures'),
        `${file} is listed as skipped on CI but does not use the helper that skips it`
      ).toBe(true)
    }
  })

  it('local planning is untouched: a local board runs these suites in full', () => {
    expect(weightsFor(false)).toBe(MEASURED_SECONDS)
  })

  it('CI planning books a skipped suite at what skipping costs', () => {
    const onCI = weightsFor(true)
    for (const file of CI_SKIPPED) expect(onCI[file]).toBe(CI_SKIPPED_WEIGHT_S)
    // And leaves everything else exactly as measured.
    for (const [file, seconds] of Object.entries(MEASURED_SECONDS)) {
      if (!CI_SKIPPED.includes(file)) expect(onCI[file]).toBe(seconds)
    }
  })

  it('no CI shard is left idle while another carries everything', () => {
    const plan = planShards(files, weightsFor(true), 6)
    const counts = plan.map((shard) => shard.length)
    // Otherwise three shards would hold one file each - a file that skips.
    expect(Math.min(...counts), `files per shard: ${counts}`).toBeGreaterThan(5)

    const loads = plan.map((shard) =>
      shard.reduce(
        (sum, f) => sum + (weightsFor(true)[f] ?? DEFAULT_WEIGHT_S),
        0
      )
    )
    const spread = Math.max(...loads) - Math.min(...loads)
    expect(spread, `booked seconds per shard: ${loads}`).toBeLessThan(60)
  })
})
