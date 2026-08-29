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
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Measured Chromium seconds per spec file.
 *
 * RE-MEASURED 2026-08-27 from run 33063099176's GREEN Chromium shards, after
 * CW-59, CW-60 and CW-61 grew the city suites. What the old table got wrong is
 * worth knowing, because it is the shape this drifts in:
 *
 *   files nobody touched      classic-panels 1.0x, classic-mode 1.0x,
 *                             accessibility 1.0x - the table was RIGHT
 *   the city walk files       street 329 -> 902, controls 417 -> 891,
 *                             walk 373 -> 704, teleport 190 -> 274
 *   two city files            calibration and furniture were NOT IN THE TABLE
 *                             and so were booked at 60 against a real 147/131
 *
 * The model was not decaying everywhere. It was wrong exactly where this round
 * added tests, and it was optimistic by about seven minutes a shard - which is
 * how a lane can project 25 minutes and take 32.
 *
 * ★ RE-MEASURE FROM A GREEN RUN, NEVER A RED ONE. The first attempt at this
 * read a shard that had timed out, where every file looked 3-5x its weight
 * INCLUDING files no branch had touched. That uniform inflation is the tell
 * for a starved runner, and re-weighting from it would have baked the
 * starvation into the model permanently.
 */
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
  'ascii-city-walk-controls.spec.js': 891.1,
  // CW-64 added four cases here (the trigger, the re-entry, the reduced-motion
  // picture, and the WCAG 2.3.1 measurement), taking the file from 40 to 44.
  // 775 is 704.3 scaled by test count and LABELLED an estimate, the same way
  // CW-63 did the furniture spec - the next re-measure from a green run
  // replaces it. The 2.3.1 case is the one that could beat this estimate: it
  // watches a whole ~20 s show rather than driving a control, so it is dearer
  // than the file's 17.6 s average. Worth watching on the first green board.
  //
  // CW-65 adds FIVE traveler cases, 44 -> 49, so 775 * 49 / 44 = 863. Still an
  // ESTIMATE and still scaled by count, because the only CI timing available
  // is from a RED run whose Edge shards hit the ceiling - and CW-62 paid for
  // the rule that re-weighting from a starved runner bakes the starvation in.
  // Re-measure from the next green board.
  //
  // ★ Two of the five HOLD A WALK KEY until something happens rather than for
  // a fixed time (the find, and axe over the open bubble), which is correct -
  // a wall-clock hold is a bet on the frame rate - but it does mean their cost
  // scales with how slow the runner is. They are the ones to watch.
  'ascii-city-walk.spec.js': 863,
  // 289.0 measured, plus ~40 for the two weather describes CW-29 added, which
  // no CI run has timed yet. The next board replaces this with a measurement.
  'ascii-city-walk-street.spec.js': 901.7,
  // NOT measured on CI - CW-36 is newer than the last board. Estimated from
  // this machine, where the file runs 37.5 s against the controls file's
  // 84 s, and the controls file is 417.4 here: 37.5 / 84 * 417.4 ~= 186,
  // rounded up because every one of its eight cases builds a city. Left
  // unlisted it would be booked at DEFAULT_WEIGHT_S, 60, and lopside a shard
  // by two minutes. The next board replaces this with a measurement.
  'ascii-city-walk-teleport.spec.js': 274.1,
  // Same estimate, same caveat: 29.4 s here against the controls file's 84 s,
  // so 29.4 / 84 * 417.4 ~= 146. Two cases, both of which load a city.
  'ascii-city-walk-perf-smoke.spec.js': 142.4,
  // CW-62: these two were NEVER IN THE TABLE and were therefore booked at
  // DEFAULT_WEIGHT_S, 60, against a real 147 and 131. An unmeasured city
  // spec is not a cheap newcomer - every one of its cases builds a 3D city.
  'ascii-city-walk-calibration.spec.js': 146.9,
  // CW-63 added two cases to this file (the diagrid present in Seattle, absent
  // in Denver), taking it from 9 to 11. This 160 is the 130.8 measured on run
  // 33063099176's green shards SCALED BY TEST COUNT, not a fresh measurement -
  // both new cases launch the game and enter a city, which is the dominant
  // cost here, so they are typical rather than cheap. Marked so the next
  // re-measure from a green run replaces it rather than inheriting it.
  //
  // ★ The alternative was to leave 130.8, and that is exactly the mistake
  // CW-62 fixed: a weight that is 22% low on the one file a release grew is
  // how a lane projects 25 minutes and takes 32. Edge has about two minutes of
  // margin, and 29 unbooked seconds is a sixth of it.
  'ascii-city-walk-furniture.spec.js': 160,
  'classic-panels.spec.js': 442.5,
  'classic-mode.spec.js': 400.8,
  'menu-parity.spec.js': 224.8,
  'accessibility.spec.js': 195.8,
  'camera-face-view-orbit.spec.js': 165.5,
  'tutorials.spec.js': 122.2,
  'tour-interaction.spec.js': 269.2,
  'preferences-dialog.spec.js': 90.6,
  'responsive-audit.spec.js': 91.9,
  'theme-switching.spec.js': 71.4,
  'editor-content-sync.spec.js': 70.4,
  'saved-projects.spec.js': 68.5,
  'classic-stow.spec.js': 66.8,
  'mobile-viewport.spec.js': 72.0,
  'memory-banner.spec.js': 66.6,
  'editor-truth.spec.js': 60.8,
  'classic-mobile-gate.spec.js': 43.4,
  'tour-nudge.spec.js': 51.7,
  'folder-import.spec.js': 49.9,
  'parity-regression.spec.js': 44.4,
  'first-visit-choice.spec.js': 94.1,
  'coff-color-probe.spec.js': 44.0,
  'classic-render-workflow.spec.js': 44.2,
  'console-fidelity.spec.js': 41.6,
  'uf14-preference-matrix.spec.js': 54.0,
  'csg-color-injection.spec.js': 39.3,
  'editor-wrap-marks.spec.js': 41.2,
  'stakeholder-acceptance.spec.js': 38.4,
  'manifest-loading.spec.js': 71.2,
  'uf11-drawer-reduction.spec.js': 15.8,
  'console-tail.spec.js': 34.2,
  'axis-depth-truth.spec.js': 29.2,
  'welcome-spotlight.spec.js': 30.2,
  'editor-fold-markers.spec.js': 28.0,
  'classic-tutorial.spec.js': 25.9,
  // 25.0 was measured in CI for four cases. IR-8 added a fifth (the tile
  // template's render), measured locally at 4.1 s against a warm dev server,
  // where the other four came to about 24 s - close enough to the CI number
  // to add 5 and be slightly conservative. Re-measure from a CI shard log
  // next time this file is touched.
  'wasm-smoke.spec.js': 33.4,
  'auto-preview.spec.js': 21.1,
  'library-panel.spec.js': 19.6,
  'terminology.spec.js': 28.3,
  'keyguard-compilation-smoke.spec.js': 13.4,
  'welcome-surface.spec.js': 16.3,
  'svg-preparer.spec.js': 11.9,
  'expert-mode.spec.js': 11.3,
  'basic-workflow.spec.js': 11.3,
  'classic-preview-flush.spec.js': 9.8,
  'examples.spec.js': 29.2,
  'axis-mark-colors.spec.js': 9.2,
  'stl-view.spec.js': 8.4,
  'editor-wrap.spec.js': 6.1,
  'braille-card.spec.js': 6.7,
  'features-guide.spec.js': 3.9,
  'dialog-centering.spec.js': 2.6,
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

  // Forge Interop Round 1's own specs, summed from the Chromium shard logs of
  // run 32799325283 (2026-08-25) by the method this file's header describes.
  // Before these numbers went in, all seven were booked at DEFAULT_WEIGHT_S
  // (60s each, 420s of imaginary work) and the planner's own 25-minute guard
  // went red at 25.1 projected minutes - which is exactly what that guard is
  // for. `folder-write-back.spec.js` is deliberately absent: it is newer than
  // this run and has no CI measurement yet, so it keeps the default.
  'param-links.spec.js': 73.1,
  'publish-dialog.spec.js': 23.4,
  'share-settings.spec.js': 53.5,
  'ink-modes.spec.js': 45.5,
  'dxf-roundtrip.spec.js': 19.7,

  // Design Pipeline Round 1, summed from the Chromium shards of run
  // 33186286382 (2026-08-28), the same method. svg-edit-door grew from 6 cases
  // to 12 across DP-3 and DP-4 and was still booked at its Interop-era 34.1,
  // a 3.8x under-count; overlay-placement is new and was riding the 60s
  // default against a real 107.9. Between them that is 143 seconds of work
  // the planner could not see, and the Edge lanes of that very run ended at
  // 35 minutes with "25 did not run".
  'svg-edit-door.spec.js': 129.8,
  'overlay-placement.spec.js': 107.9,

  // Design Pipeline Round 2. Booked from a LOCAL run rather than from CI,
  // which is a weaker measurement and is said so here: four cases in 14.5 s
  // on this machine, against an engine that was already warm. The 60 s
  // default would have been closer to the truth than a local number pretending
  // to be a CI one, so this is booked at three times what was measured and
  // re-weighted from a green CI run at the round's close.
  'stencil-plates.spec.js': 45.0,
};

/** What an unmeasured file is assumed to cost: above the median, on purpose. */
export const DEFAULT_WEIGHT_S = 60;

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
    throw new Error(`shard count must be a positive integer, got ${total}`);
  }
  const bins = Array.from({ length: total }, () => ({ load: 0, files: [] }));
  const ordered = [...files].sort((a, b) => {
    const wa = weights[a] ?? DEFAULT_WEIGHT_S;
    const wb = weights[b] ?? DEFAULT_WEIGHT_S;
    return wb - wa || a.localeCompare(b);
  });
  for (const file of ordered) {
    let lightest = bins[0];
    for (const bin of bins) if (bin.load < lightest.load) lightest = bin;
    lightest.load += weights[file] ?? DEFAULT_WEIGHT_S;
    lightest.files.push(file);
  }
  return bins.map((b) => b.files.sort());
}

/** Every spec file under a directory, as paths relative to the repo root. */
export function listSpecFiles(dir) {
  const out = [];
  const walk = (here) => {
    for (const entry of readdirSync(here, { withFileTypes: true })) {
      const full = path.join(here, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.spec.js')) out.push(entry.name);
    }
  };
  walk(dir);
  return out.sort();
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const index = Number(process.argv[2]);
  const total = Number(process.argv[3]);
  if (!Number.isInteger(index) || index < 1 || index > total) {
    console.error('usage: node scripts/e2e-shard.mjs <shard> <total>');
    process.exit(2);
  }
  const dir = path.resolve('tests/e2e');
  const files = listSpecFiles(dir);
  if (files.length === 0) {
    console.error(
      `no spec files under ${dir} - refusing to run an empty shard`
    );
    process.exit(1);
  }
  const shard = planShards(files, MEASURED_SECONDS, total)[index - 1];
  process.stdout.write(shard.map((f) => `tests/e2e/${f}`).join(' '));
}
