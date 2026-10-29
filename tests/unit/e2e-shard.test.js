import { describe, it, expect } from 'vitest'
import path from 'node:path'
import {
  MEASURED_SECONDS,
  DEFAULT_WEIGHT_S,
  PROJECT_IGNORES,
  planShards,
  filesForProject,
  listSpecFiles,
} from '../../scripts/e2e-shard.mjs'

/**
 * The e2e lanes are sharded by measured cost rather than by test count:
 * count-based sharding once put a quarter of the whole Chromium lane - one
 * 18-minute file - permanently in shard 1 and left that shard failing on
 * Playwright's 35-minute ceiling.
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
    expect(files).toContain('accessibility.spec.js')
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
  // The lanes are projected with the measured weights, the way CI plans them.
  const ciLoad = (shard) =>
    shard.reduce(
      (sum, f) => sum + (MEASURED_SECONDS[f] ?? DEFAULT_WEIGHT_S),
      0
    )
  const projectMin = (shard) => ciLoad(shard) / 60 / 2 + SETUP_MIN

  it('never lets a Chromium shard approach the 35-minute ceiling', () => {
    // The weights must be re-measured from a green run as suites grow: a guard
    // reading a stale model can pass while the lane is two minutes from the
    // ceiling, because the arithmetic is sound and the weights are low. A
    // model can be right and still lie, if nobody re-measures what it is
    // multiplying.
    //
    // Chromium runs seven shards (test.yml): with fewer, the lane's heaviest
    // files pushed a shard past the 2100 s clock, and the two-core runner does
    // not parallelize software 3D. Twenty-five minutes leaves ten of margin on
    // a thirty-five minute ceiling, which is what a starved runner eats.
    for (const shard of planShards(files, MEASURED_SECONDS, 7)) {
      const wallMin = projectMin(shard)
      expect(
        wallMin,
        `a Chromium shard projects to ${wallMin.toFixed(1)} minutes`
      ).toBeLessThan(25)
    }
  })

  it('says out loud how little room the ceiling-bound lanes have left', () => {
    // Edge and Firefox run four shards each, behind one required summary
    // check per lane, so a re-split needs no ruleset change. This does not
    // demand the room Chromium has; what it does is refuse to let a lane
    // quietly cross the real ceiling, and name the margin when it is asked.
    // The projection below covers the worst split, so a regression in either
    // lane's shape still trips here.
    const CEILING_MIN = 35
    // Each lane is booked for what it runs at the shard count it actually
    // has: four each (at two, Firefox would project to 49.4 of these 35
    // minutes; at three both lanes reached 34.9 and the next new spec file
    // crossed the ceiling). Firefox leaves out wasm-smoke; the drawing
    // editor's walk and the potrace engine's spec came back to both lanes
    // from a green CI board (the lanes at 11 to 24 minutes with four shards),
    // never from a projection.
    for (const [project, laneShards] of [
      ['msedge', 4],
      ['firefox', 4],
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
