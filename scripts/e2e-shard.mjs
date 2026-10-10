/**
 * Which spec files a browser lane's shard should run.
 *
 * Why this exists: Playwright's own `--shard=n/2` divides the suite by test
 * count, walking the files in path order. That gives two halves with almost
 * exactly the same number of tests - 476 and 475 - and wildly different
 * amounts of work, because the expensive files all sort early. Measured on a
 * green Chromium board (per-test durations read out of the two shard logs
 * and summed per file):
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
 * Keeping the table honest: the weights below are Chromium seconds. Edge runs
 * the same specs and is slower across the board, but the ratios between files
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
 * The table drifts where tests are added. A re-measure that finds the files
 * nobody touched at 1.0x and the files that grew far over their booking
 * means the model was not decaying everywhere: it was wrong exactly where the
 * suite grew, and optimistic by minutes a shard, which is how a lane can
 * project 25 minutes and take 32. A file missing from the table is booked at
 * DEFAULT_WEIGHT_S, far too little for a suite that builds a 3D city in every
 * case.
 *
 * Re-measure from a green run, never a red one. A shard that timed out shows
 * every file at 3-5x its weight, including files no branch touched. That
 * uniform inflation is the tell for a starved runner, and re-weighting from
 * it would bake the starvation into the model permanently.
 */
export const MEASURED_SECONDS = {
  // The City Walk suite was once one file. Packing by cost put all of it on
  // one shard, where two workers then spent most of the run driving 3D city
  // sessions at the same time on a two-core runner with software rendering:
  // that shard's overhead (wall time beyond the work divided by its workers)
  // went from 1.6 to 5.6 minutes, its flaky count from 6 to 11, and two cases
  // tipped over into failing. Splitting the file does nothing for
  // Playwright's own --shard, since the pieces sort next to their parent, but
  // it is exactly what a cost packer needs: it can put the pieces on
  // different shards.
  'ascii-city-walk-controls.spec.js': 2068,
  // The seven City Walk weights are estimates scaled from a green local
  // Chromium board (per-test durations summed per file, times one constant,
  // x1.8, set so the street file lands in its known CI range): the packer
  // uses ratios, and a same-day, same-machine green board is the best ratio
  // data there is. The next green CI board replaces them.
  //
  // Two of this file's cases hold a walk key until something happens rather
  // than for a fixed time (the find, and axe over the open bubble), which is
  // correct, since a wall-clock hold is a bet on the frame rate, but it does
  // mean their cost scales with how slow the runner is. They are the ones to
  // watch.
  'ascii-city-walk.spec.js': 2078,
  // Priced from whole-lane CI evidence: across three diagnostic runs the
  // three heavy Chromium lanes ran nearly equal wall time (34:52, 35:50 and
  // 37:04 on the last), each anchored by one of walk, controls and street, so
  // street's true CI cost stands level with the other two, not at half. A
  // local hardware ratio under-priced it about 2x, and the packer answered by
  // stacking extra co-files onto street's lanes, precisely the lane that kept
  // overflowing its clock on Edge.
  'ascii-city-walk-street.spec.js': 2050,
  // Not measured on CI. Estimated from a local machine, where the file runs
  // 37.5 s against the controls file's 84 s, and the controls file is 417.4
  // there: 37.5 / 84 * 417.4 ~= 186, rounded up because every one of its
  // eight cases builds a city. Left unlisted it would be booked at
  // DEFAULT_WEIGHT_S, 60, and lopside a shard by two minutes.
  'ascii-city-walk-teleport.spec.js': 211,
  // Same estimate, same caveat: 29.4 s here against the controls file's 84 s,
  // so 29.4 / 84 * 417.4 ~= 146. Two cases, both of which load a city.
  'ascii-city-walk-perf-smoke.spec.js': 66,
  // An unmeasured city spec is not a cheap newcomer: every one of its cases
  // builds a 3D city, so this file and the furniture file need entries rather
  // than DEFAULT_WEIGHT_S.
  'ascii-city-walk-calibration.spec.js': 228,
  // Scaled by test count from a green-run measurement when two cases were
  // added (both launch the game and enter a city, the dominant cost here, so
  // they are typical rather than cheap), not freshly measured. Leaving the
  // old number would be 22% low on the one file that grew, which is how a
  // lane projects 25 minutes and takes 32: Edge has about two minutes of
  // margin, and 29 unbooked seconds is a sixth of it.
  'ascii-city-walk-furniture.spec.js': 164,
  'classic-panels.spec.js': 442.5,
  'classic-mode.spec.js': 400.8,
  'menu-parity.spec.js': 253.9,
  'accessibility.spec.js': 195.8,
  // Every pose is now read once the camera holds still: one local pass went
  // from 90 s to 114 s, so 165.5 is scaled by the same ratio.
  'camera-face-view-orbit.spec.js': 210.0,
  'tutorials.spec.js': 142.1,
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
  'preference-matrix.spec.js': 54.0,
  'csg-color-injection.spec.js': 39.3,
  'editor-wrap-marks.spec.js': 41.2,
  'stakeholder-acceptance.spec.js': 38.4,
  'manifest-loading.spec.js': 71.2,
  'drawer-reduction.spec.js': 15.8,
  'console-tail.spec.js': 34.2,
  'axis-depth-truth.spec.js': 29.2,
  'welcome-spotlight.spec.js': 30.2,
  'editor-fold-markers.spec.js': 28.0,
  'classic-tutorial.spec.js': 25.9,
  // 25.0 was measured in CI for four cases. A fifth (the tile template's
  // render) measured 4.1 s locally against a warm dev server, where the other
  // four came to about 24 s: close enough to the CI number to add 5 and be
  // slightly conservative. Re-measure from a CI shard log next time this file
  // is touched.
  'wasm-smoke.spec.js': 33.4,
  'auto-preview.spec.js': 61.8,
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

  // Summed from the Chromium shard logs of one run, by the method this file's
  // header describes. Booked at DEFAULT_WEIGHT_S, seven new files were 420 s
  // of imaginary work, and the planner's own 25-minute guard went red at 25.1
  // projected minutes, which is exactly what that guard is for.
  // `folder-write-back.spec.js` is deliberately absent: it has no CI
  // measurement yet, so it keeps the default.
  'param-links.spec.js': 73.1,
  'publish-dialog.spec.js': 23.4,
  'share-settings.spec.js': 53.5,
  'ink-modes.spec.js': 45.5,
  'dxf-roundtrip.spec.js': 26.9,

  // Summed from the Chromium shards of one run, the same method. svg-edit-door
  // had grown from 6 cases to 12 and was still booked at 34.1, a 3.8x
  // under-count; overlay-placement was new and was riding the 60 s default
  // against a real 107.9. Between them that was 143 seconds of work the
  // planner could not see, and the Edge lanes of that run ended at 35 minutes
  // with "25 did not run".
  'svg-edit-door.spec.js': 129.8,
  'overlay-placement.spec.js': 107.9,

  // One load of the drawing editor's tile with every walk the editor has on
  // it, then the Drawing / Charm switch cases, one of which renders the charm
  // twice to prove the session is cheaper. Measured locally at 37 s for nine
  // cases, it looked well inside its booking; a green CI board measured
  // 190.6 s, over the booking by a fifth. The local number was not wrong, it
  // was the wrong number, and this file is Chromium only, so nothing else was
  // absorbing the difference.
  //
  // Chromium only (PROJECT_IGNORES): the two-shard lanes were a third of a
  // minute from their 35-minute ceiling before this file existed.
  'drawing-editor.spec.js': 220.0,
  // Five cases: the 2000x2000 noise picture is built and traced twice,
  // because the conversion is fast enough that one run cannot carry both
  // mid-conversion checks (13,401 ms with imagetracerjs, 1,872 with Potrace,
  // same picture and throttle). Measured locally at 33.8 s for the file;
  // booked at the same four-times ratio the files above carry. Chromium only
  // (PROJECT_IGNORES): CPU throttling is a CDP feature, and the other lanes
  // have no headroom (see the note below).
  'trace-start-cancel.spec.js': 135.0,
  // Four of these cases open the editor door on a fixture for the credit
  // line. Measured locally: 13 cases in about 42 s. DEFAULT_WEIGHT_S, 60, was
  // already close; 70 keeps the same slack the measurement had.
  'ink-modes.spec.js': 70.0,
  // The editor's door spec: layout, ordering and worker cases, two of which
  // combine a 210-shape drawing for real, then the flatten worker, the
  // budget, the shapes row, choosing rows, the row-to-picture link, the phone
  // sheet and the touch walks. At 62 cases a green CI board measured 242.8 s
  // and it was booked at 280; at 79 cases a pull-request run's Chromium
  // shards (2026-10-09) measured 400.9, booked as measured. Local is not the
  // number to book: the same file runs 205 s on a local machine, and booking
  // that would hide an overrun instead of finding it.
  'svg-edit-door.spec.js': 400.9,
  // From the same green board: layered-design 51.2 s, ink-modes 76.6 s,
  // trace-start-cancel 59.4 s, dxf-roundtrip 22.4 s, potrace-engine 3.3 s.
  // Only ink-modes is over its booking, by 6.6 s against a 70 that was itself
  // rounded up from 42: inside the rounding, so it is left alone and written
  // down rather than nudged. layered-design is not listed and rides
  // DEFAULT_WEIGHT_S at 60, which its 51.2 fits.
  //
  // potrace-engine: one case, a ring traced through the real worker on both
  // engines, which is also the only place the wasm is proved to load under
  // COOP/COEP. Measured locally: 2.9 s on Chromium, 3.6 s on WebKit, 7.8 s on
  // Firefox. Booked at 10 rather than scaled up like the three files above:
  // it is a tenth of their size, and rounding 7.8 to 10 is already the whole
  // margin those ratios exist to buy.
  'potrace-engine.spec.js': 10.0,
  // The shared-link files, measured locally on Chromium. Booked at
  // DEFAULT_WEIGHT_S they added three minutes of test time to every lane and
  // put the three-shard Edge and Firefox lanes at 35.2 and 35.1 of their
  // 35-minute ceiling (34.7 and 34.6 without them); booked at what they cost,
  // the lanes project to 34.9 and 34.8.
  //   first-visit-links   two cases, 3 s and 27 s (the second holds the
  //                       engine 6 s on every worker restart); both skip on
  //                       CI, so this is what a local board pays.
  //   project-link-lane   two cases, 3.9 s (Firefox 8.6 s); one skips on CI.
  //   link-failure-notice six cases, 17.8 to 18.5 s (Firefox 36 s); no
  //                       engine, so all six run on CI.
  'first-visit-links.spec.js': 40.0,
  'project-link-lane.spec.js': 10.0,
  'link-failure-notice.spec.js': 30.0,
  // The shared checks' self-test: small pages served on a routed host, no app
  // and no engine. Nine cases in 3.8 s locally; booked at 10, the rounding
  // potrace-engine carries.
  'invariants-selftest.spec.js': 10.0,
  // Five cases, each a first visit that downloads the engine: 39.1 measured
  // at four, scaled to five.
  'real-start.spec.js': 48.9,
  // Summed from the Chromium shards of one pull-request run (2026-10-09), the
  // method above; real-start.spec.js just before is from the same run. The
  // grown files above it in this table (menu-parity, tutorials, auto-preview,
  // dxf-roundtrip, svg-edit-door) carry numbers from the same run.
  // classic-mode (403.9), classic-panels (392.4) and preferences-dialog
  // (88.9) measured within their bookings and are left alone.
  // Measured at five cases (30.0); a sixth, at 1280 x 600, scales it to 36.
  'menu-reach.spec.js': 36.0,
  'project-switch.spec.js': 52.2,
  // Four cases, 21.1 s locally; booked at 25 until a CI run measures it.
  'actions-drawer.spec.js': 25.0,
};

/** What an unmeasured file is assumed to cost: above the median, on purpose. */
export const DEFAULT_WEIGHT_S = 60;

/**
 * Spec files a browser lane does not run, by Playwright project name.
 *
 * One source of truth: playwright.config.js builds each project's
 * `testIgnore` from this table, and the planner leaves these files out of
 * that project's shards and out of its projection, so a lane is booked for
 * what it will actually run (a file ignored by the config but charged by the
 * planner books time nobody spends).
 *
 * drawing-editor.spec.js runs on Chromium only. Measured before it was
 * written: the two-shard lanes (Edge, Firefox) projected to 34.8 of their 35
 * minutes with nothing added, so no honest weight for a new file fits; 35 s,
 * its measured cost scaled the way the other editor files are, put the lane
 * at 35.1. Edge cannot be re-split without changing the repository ruleset's
 * required checks. The editor's walk is DOM and keyboard behavior the
 * Chromium lane covers on three shards; the door's cases still run
 * everywhere. Reverse: delete the two entries once the lanes are re-split.
 *
 * potrace-engine.spec.js is out of Edge and Firefox for the same arithmetic
 * and runs on Chromium and WebKit instead. WebKit is the lane that matters
 * for it: a module worker importing a module under COEP is the exact shape
 * of two earlier WebKit worker failures. It passes there in 3.6 s. Reverse
 * with the others.
 *
 * real-start.spec.js was Chromium only while Edge and Firefox had three
 * shards (booked at the default, it put the Edge lane at 35.2 of its 35
 * minutes). With four shards it runs in every lane.
 */
export const PROJECT_IGNORES = Object.freeze({
  chromium: [],
  msedge: [
    'drawing-editor.spec.js',
    'trace-start-cancel.spec.js',
    'potrace-engine.spec.js',
  ],
  firefox: [
    'wasm-smoke.spec.js',
    'drawing-editor.spec.js',
    'trace-start-cancel.spec.js',
    'potrace-engine.spec.js',
  ],
});

/**
 * Suites that run on CI but skip themselves the moment they start.
 *
 * The City Walk e2e suites are paused on CI: CI software-renders the 3D city
 * at about two seconds a frame, so every one of these files reports skipped
 * in seconds there while still costing its full measured minutes on a local
 * hardware board. `useCityWalkFixtures()` carries the one skip.
 *
 * The planner has to know, because it books time per file. Without this, the
 * three heaviest City Walk files were given a shard each (2,078 s, 2,068 s
 * and 2,050 s booked, seconds actually spent), which left three of six
 * shards idle on CI and pushed everything else into the remainder (shard 6
 * alone carried 44 files), and two tests began failing there for crowding
 * rather than for behavior.
 *
 * Reverse this the moment the suites come back: delete the `test.skip` in
 * `useCityWalkFixtures()` and this list together, or the lanes will be booked
 * for work they are once again doing.
 */
export const CI_SKIPPED = Object.freeze([
  'ascii-city-walk.spec.js',
  'ascii-city-walk-calibration.spec.js',
  'ascii-city-walk-controls.spec.js',
  'ascii-city-walk-furniture.spec.js',
  'ascii-city-walk-perf-smoke.spec.js',
  'ascii-city-walk-street.spec.js',
  'ascii-city-walk-teleport.spec.js',
]);

/** What a file that skips itself on arrival actually costs there. */
export const CI_SKIPPED_WEIGHT_S = 10;

/**
 * The weights to plan with, for the environment doing the planning.
 *
 * @param {boolean} [onCI] - default: whether this process is running on CI
 * @returns {Record<string, number>}
 */
export function weightsFor(onCI = !!process.env.CI) {
  if (!onCI) return MEASURED_SECONDS;
  const out = { ...MEASURED_SECONDS };
  for (const file of CI_SKIPPED) out[file] = CI_SKIPPED_WEIGHT_S;
  return out;
}

/**
 * The spec files a project runs: everything under tests/e2e, less what the
 * table above says it leaves out. An unknown project name runs everything.
 *
 * @param {string[]} files - every spec file name
 * @param {string} [project] - Playwright project name
 * @returns {string[]}
 */
export function filesForProject(files, project) {
  const skip = new Set(PROJECT_IGNORES[project] || []);
  return files.filter((f) => !skip.has(f));
}

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
  // Optional: the Playwright project the shard is for, so files that
  // project does not run are not dealt into it.
  const project = process.argv[4] || 'chromium';
  if (!Number.isInteger(index) || index < 1 || index > total) {
    console.error(
      'usage: node scripts/e2e-shard.mjs <shard> <total> [project]'
    );
    process.exit(2);
  }
  const dir = path.resolve('tests/e2e');
  const files = filesForProject(listSpecFiles(dir), project);
  if (files.length === 0) {
    console.error(
      `no spec files under ${dir} - refusing to run an empty shard`
    );
    process.exit(1);
  }
  const shard = planShards(files, weightsFor(), total)[index - 1];
  process.stdout.write(shard.map((f) => `tests/e2e/${f}`).join(' '));
}
