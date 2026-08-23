/**
 * Which spec files a browser lane's shard should run (D-72).
 *
 * WHY THIS EXISTS. Playwright's own `--shard=n/2` divides the suite by TEST
 * COUNT, walking the files in path order. That gives two halves with almost
 * exactly the same number of tests - 476 and 475 - and wildly different
 * amounts of work, because the expensive files all sort early. Measured on the
 * green Chromium board of 2026-08-22 (run 32589505121, per-test durations read
 * out of the two shard logs and summed per file):
 *
 *   shard 1/2 : 50.3 test-minutes, 476 tests   -> 26m48s wall
 *   shard 2/2 : 20.9 test-minutes, 475 tests   -> 12m28s wall
 *
 * One file is a quarter of the whole lane: ascii-city-walk.spec.js runs 68
 * tests in 18.0 minutes, each one loading a city and building a 3D scene. It
 * sorts under "a", so no count-based division can put it anywhere but the
 * first shard, and splitting it into siblings would not move it either - the
 * pieces sort next to their parent. Shard 1/2 has failed three times on
 * Playwright's 35-minute globalTimeout, at 32.5, 32.5 and 34.7 minutes.
 *
 * So the division is made here, from measured cost, instead of being inherited
 * from the alphabet. Every spec file in tests/e2e is placed in exactly one
 * shard - the list is read from disk, never hand-maintained - so a spec added
 * tomorrow cannot fall between the shards and quietly stop being run.
 *
 * KEEPING THE TABLE HONEST. The weights below are Chromium seconds. Edge runs
 * the same specs and is slower across the board, but the RATIOS between files
 * are what the packing uses, and those hold: Edge's shards are lopsided in the
 * same shape and by the same files. A file whose cost changes materially, or a
 * new file that turns out to be expensive, shows up as one shard drifting
 * away from the other on the board. Re-measure then, like this:
 *
 *   gh run view --job <job-id> --log > shard.log
 *   # sum the "(1.2s)" durations the list reporter prints, per spec file
 *
 * A file with no entry is assumed to cost DEFAULT_WEIGHT_S, which is set well
 * above the median so an unmeasured newcomer is spread rather than dumped.
 */
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Measured Chromium seconds per spec file (run 32589505121, 2026-08-22). */
export const MEASURED_SECONDS = {
  // The City Walk suite was one 1,079-second file until D-78. Packing by cost
  // put all of it on one shard, where two workers then spent most of the run
  // driving 3D city sessions at the same time on a two-core runner with
  // software rendering. That shard's overhead - wall time beyond the work
  // divided by its workers - went from 1.6 to 5.6 minutes, its flaky count
  // from 6 to 11, and two cases tipped over into failing. Splitting the file
  // does nothing for Playwright's own --shard, since the pieces sort next to
  // their parent, but it is exactly what a cost packer needs: it can put the
  // pieces on DIFFERENT shards. These three weights are the old file's own
  // describe blocks, re-summed from the same run.
  'ascii-city-walk-controls.spec.js': 417.4,
  'ascii-city-walk.spec.js': 372.6,
  // 289.0 measured, plus ~40 for the two weather describes CW-29 added, which
  // no CI run has timed yet. The next board replaces this with a measurement.
  'ascii-city-walk-street.spec.js': 329.0,
  // NOT measured on CI - CW-36 is newer than the last board. Estimated from
  // this machine, where the file runs 37.5 s against the controls file's
  // 84 s, and the controls file is 417.4 here: 37.5 / 84 * 417.4 ~= 186,
  // rounded up because every one of its eight cases builds a city. Left
  // unlisted it would be booked at DEFAULT_WEIGHT_S, 60, and lopside a shard
  // by two minutes. The next board replaces this with a measurement.
  'ascii-city-walk-teleport.spec.js': 190.0,
  'classic-panels.spec.js': 432.7,
  'classic-mode.spec.js': 395.1,
  'menu-parity.spec.js': 210.5,
  'accessibility.spec.js': 187.8,
  'camera-face-view-orbit.spec.js': 134.7,
  'tutorials.spec.js': 105.5,
  'tour-interaction.spec.js': 101.2,
  'preferences-dialog.spec.js': 92.7,
  'responsive-audit.spec.js': 88.4,
  'theme-switching.spec.js': 77.0,
  'editor-content-sync.spec.js': 70.1,
  'saved-projects.spec.js': 67.6,
  'classic-stow.spec.js': 67.2,
  'mobile-viewport.spec.js': 67.0,
  'memory-banner.spec.js': 65.6,
  'editor-truth.spec.js': 62.9,
  'classic-mobile-gate.spec.js': 54.6,
  'tour-nudge.spec.js': 51.4,
  'folder-import.spec.js': 47.9,
  'parity-regression.spec.js': 45.6,
  'first-visit-choice.spec.js': 45.3,
  'coff-color-probe.spec.js': 44.0,
  'classic-render-workflow.spec.js': 43.3,
  'console-fidelity.spec.js': 42.3,
  'uf14-preference-matrix.spec.js': 41.5,
  'csg-color-injection.spec.js': 38.8,
  'editor-wrap-marks.spec.js': 38.8,
  'stakeholder-acceptance.spec.js': 37.8,
  'manifest-loading.spec.js': 36.5,
  'uf11-drawer-reduction.spec.js': 33.7,
  'console-tail.spec.js': 33.6,
  'axis-depth-truth.spec.js': 32.2,
  'welcome-spotlight.spec.js': 31.5,
  'editor-fold-markers.spec.js': 28.5,
  'classic-tutorial.spec.js': 26.8,
  'wasm-smoke.spec.js': 25.0,
  'auto-preview.spec.js': 22.3,
  'library-panel.spec.js': 22.1,
  'terminology.spec.js': 20.3,
  'keyguard-compilation-smoke.spec.js': 14.3,
  'welcome-surface.spec.js': 14.0,
  'svg-preparer.spec.js': 13.1,
  'expert-mode.spec.js': 11.9,
  'basic-workflow.spec.js': 11.6,
  'classic-preview-flush.spec.js': 10.7,
  'examples.spec.js': 9.9,
  'axis-mark-colors.spec.js': 9.5,
  'stl-view.spec.js': 8.6,
  'editor-wrap.spec.js': 6.8,
  'braille-card.spec.js': 6.3,
  'features-guide.spec.js': 3.4,
  'dialog-centering.spec.js': 2.7,
  // Everything below is skipped in CI for want of a fixture, so it costs the
  // lane nothing today. Kept in the table, at the measured zero, so that a
  // file which starts running again is visible as a change rather than as a
  // silent newcomer.
  'benchmark-runner.spec.js': 0,
  'companion-navigation.spec.js': 0,
  'echo-drawer.spec.js': 0,
  'full-render-color.spec.js': 0,
  'generic-project-baseline.spec.js': 0,
  'keyguard-parser-smoke.spec.js': 0,
  'keyguard-workflow.spec.js': 0,
  'library-archive.spec.js': 0,
  'lwfl-parity-reproduction.spec.js': 0,
  'mobile-drawer.spec.js': 0,
  'mobile-number-input.spec.js': 0,
  'param-groups.spec.js': 0,
  'preset-audit-sweep.spec.js': 0,
  'preset-workflow.spec.js': 0,
  'preview-quality-persistence.spec.js': 0,
  'project-files.spec.js': 0,
  'render-stability.spec.js': 0,
  'stakeholder-bugfix-verification.spec.js': 0,
  'stakeholder-zip-acceptance.spec.js': 0,
  'zip-workflow.spec.js': 0,
}

/** What an unmeasured file is assumed to cost: above the median, on purpose. */
export const DEFAULT_WEIGHT_S = 60

/**
 * Deal the files into `total` shards, heaviest first, each one going to the
 * lightest shard so far - longest-processing-time first, the standard greedy
 * answer to this. Ties break on the file name, so the same input always
 * produces the same division and a shard's contents only move when a weight
 * or a file does.
 *
 * @param {string[]} files - spec file names, any order
 * @param {Record<string, number>} weights - seconds per file
 * @param {number} total - how many shards
 * @returns {string[][]} one sorted file list per shard
 */
export function planShards(files, weights, total) {
  if (!Number.isInteger(total) || total < 1) {
    throw new Error(`shard count must be a positive integer, got ${total}`)
  }
  const bins = Array.from({ length: total }, () => ({ load: 0, files: [] }))
  const ordered = [...files].sort((a, b) => {
    const wa = weights[a] ?? DEFAULT_WEIGHT_S
    const wb = weights[b] ?? DEFAULT_WEIGHT_S
    return wb - wa || a.localeCompare(b)
  })
  for (const file of ordered) {
    let lightest = bins[0]
    for (const bin of bins) if (bin.load < lightest.load) lightest = bin
    lightest.load += weights[file] ?? DEFAULT_WEIGHT_S
    lightest.files.push(file)
  }
  return bins.map((b) => b.files.sort())
}

/** Every spec file under a directory, as paths relative to the repo root. */
export function listSpecFiles(dir) {
  const out = []
  const walk = (here) => {
    for (const entry of readdirSync(here, { withFileTypes: true })) {
      const full = path.join(here, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.spec.js')) out.push(entry.name)
    }
  }
  walk(dir)
  return out.sort()
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  const index = Number(process.argv[2])
  const total = Number(process.argv[3])
  if (!Number.isInteger(index) || index < 1 || index > total) {
    console.error('usage: node scripts/e2e-shard.mjs <shard> <total>')
    process.exit(2)
  }
  const dir = path.resolve('tests/e2e')
  const files = listSpecFiles(dir)
  if (files.length === 0) {
    console.error(`no spec files under ${dir} - refusing to run an empty shard`)
    process.exit(1)
  }
  const shard = planShards(files, MEASURED_SECONDS, total)[index - 1]
  process.stdout.write(shard.map((f) => `tests/e2e/${f}`).join(' '))
}
