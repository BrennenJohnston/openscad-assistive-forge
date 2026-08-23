import { describe, it, expect } from 'vitest'
import path from 'node:path'
import {
  MEASURED_SECONDS,
  DEFAULT_WEIGHT_S,
  planShards,
  listSpecFiles,
} from '../../scripts/e2e-shard.mjs'

/**
 * D-72. The e2e lanes are sharded by measured cost rather than by test count,
 * because count-based sharding put a quarter of the whole Chromium lane -
 * ascii-city-walk.spec.js, 18 minutes of it - permanently in shard 1 and left
 * that shard failing on Playwright's 35-minute ceiling.
 *
 * What has to stay true is not the exact division, which will move whenever a
 * weight does. It is that every spec file runs on exactly one shard, and that
 * the halves stay close enough that neither approaches the ceiling.
 */
const SPEC_DIR = path.resolve(__dirname, '../e2e')

const load = (files) =>
  files.reduce((sum, f) => sum + (MEASURED_SECONDS[f] ?? DEFAULT_WEIGHT_S), 0)

describe('e2e shard planner (D-72)', () => {
  const files = listSpecFiles(SPEC_DIR)

  it('finds the suite', () => {
    expect(files.length).toBeGreaterThan(50)
    expect(files).toContain('ascii-city-walk.spec.js')
    expect(files.every((f) => f.endsWith('.spec.js'))).toBe(true)
  })

  for (const total of [2, 3]) {
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

  it('never lets one shard approach the 35-minute ceiling', () => {
    // Two CI workers per shard, plus a couple of minutes of checkout, npm ci
    // and browser install before any test runs.
    const SETUP_MIN = 3
    for (const shard of planShards(files, MEASURED_SECONDS, 2)) {
      const wallMin = load(shard) / 60 / 2 + SETUP_MIN
      expect(wallMin, `a shard projects to ${wallMin.toFixed(1)} minutes`).toBeLessThan(25)
    }
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
