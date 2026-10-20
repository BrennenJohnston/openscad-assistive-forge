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
  // The City Walk suites skip on CI (CI_SKIPPED, below), so no CI run
  // measures them, and on CI each is planned at CI_SKIPPED_WEIGHT_S. These
  // seven numbers plan a local board: a green local Chromium board's
  // per-file sums times 1.8, with the street file priced level with the
  // walk and controls files from whole-lane CI evidence when the suites
  // still ran there, and the teleport and perf-smoke files scaled from the
  // controls file. Two of the walk file's cases hold a key until something
  // happens, so their cost follows the frame rate: the ones to watch.
  'ascii-city-walk-calibration.spec.js': 228,
  'ascii-city-walk-controls.spec.js': 2068,
  'ascii-city-walk-furniture.spec.js': 164,
  'ascii-city-walk-perf-smoke.spec.js': 66,
  'ascii-city-walk-street.spec.js': 2050,
  'ascii-city-walk-teleport.spec.js': 211,
  'ascii-city-walk.spec.js': 2078,

  // Every number below is the sum of the durations the list reporter
  // printed for that file, every attempt counted (a retry too: the shard
  // pays for it), on the seven Chromium shards of a green run, rounded up to
  // the next tenth of a second: the higher of Test Suite runs 39167740032 and
  // 39179291729 (2026-10-18). One run is not enough for the heaviest files:
  // the same cases of ui-schema.spec.js took 909 s in one and 1,474 s in the
  // other, as the files sharing its runner changed. Re-measure the same way.
  // 243.3 by the two runs above, plus two cases since (the upload area's one
  // Tab stop and its file picker: 5.8 s locally), booked at four times that.
  'accessibility.spec.js': 266.5,
  // 127.3 by the two runs above, plus eleven cases since (the key that
  // stays, the crack and the break-through, on the Main Page and the box:
  // 51 s locally), booked at about four times that.
  'alt-view-arrival.spec.js': 333.7,
  'alt-view-consistency.spec.js': 258.6,
  'alt-view-cursors.spec.js': 35.7,
  'alt-view-drawers.spec.js': 79.7,
  'alt-view-entry.spec.js': 69.5,
  'alt-view-icon-states.spec.js': 810.0,
  'alt-view-reveal.spec.js': 85.2,
  'alt-view-sounds.spec.js': 194.3,
  'alt-view-vector.spec.js': 57.3,
  'alt-view-without-webgl.spec.js': 4.7,
  'auto-preview.spec.js': 55.4,
  'axis-depth-truth.spec.js': 25.4,
  'axis-mark-colors.spec.js': 9.1,
  'back-guard.spec.js': 73.9,
  'background-shapes.spec.js': 7.8,
  'basic-workflow.spec.js': 11.9,
  'braille-card.spec.js': 31.7,
  'camera-face-view-orbit.spec.js': 185.0,
  'classic-mobile-gate.spec.js': 46.2,
  // 454.5 by the two runs above, plus one case since (the 3D view toolbar
  // wraps at two window sizes: 2.0 s locally), booked at four times that.
  'classic-mode.spec.js': 462.5,
  'classic-names.spec.js': 36.8,
  'classic-pane-focus.spec.js': 21.0,
  'classic-panels.spec.js': 403.4,
  'classic-preview-flush.spec.js': 10.6,
  'classic-render-workflow.spec.js': 38.7,
  'classic-stow.spec.js': 68.8,
  'classic-tutorial.spec.js': 25.5,
  'coff-color-probe.spec.js': 25.5,
  'console-fidelity.spec.js': 49.4,
  'console-tail.spec.js': 44.9,
  'csg-color-injection.spec.js': 23.1,
  'dialog-centering.spec.js': 2.4,
  'dialog-focus-return.spec.js': 80.1,
  'dialog-focus-sweep.spec.js': 24.9,
  'draft-after-edit.spec.js': 25.5,
  'drawer-reduction.spec.js': 18.4,
  'drawing-editor-close-focus.spec.js': 6.0,
  'drawing-editor.spec.js': 502.6,
  'dxf-roundtrip.spec.js': 24.8,
  'echo-drawer-phone.spec.js': 15.3,
  'edges-overlay.spec.js': 11.4,
  'editor-content-sync.spec.js': 73.1,
  'editor-fold-markers.spec.js': 31.4,
  'editor-truth.spec.js': 41.6,
  'editor-wrap-marks.spec.js': 42.2,
  'editor-wrap.spec.js': 7.6,
  'engine-depth.spec.js': 4.3,
  'engine-recovery.spec.js': 14.4,
  'engine-stale-cache.spec.js': 4.5,
  'escape-cancel-render.spec.js': 53.4,
  'examples.spec.js': 21.1,
  'expert-mode.spec.js': 21.6,
  'export-messages.spec.js': 30.3,
  'features-guide.spec.js': 7.5,
  'first-visit-choice.spec.js': 111.6,
  'first-visit-links.spec.js': 6.8,
  'folder-import.spec.js': 48.9,
  'folder-projects.spec.js': 10.7,
  'folder-write-back.spec.js': 21.0,
  // 33.1 by the two runs above, plus six cases since (the parts the right
  // trigger visits, in Standard, Simplified and on a phone; the D-pad down
  // the Customizer; a group header's ring; the controller's Keys button:
  // 33 s locally), booked at about four times that; and one more (a PS5 pad
  // beside a 3D mouse's virtual joystick: 5.3 s locally), the same way; and
  // three more (Joy-Cons: the two questions and a kept choice: 16.1 s
  // locally), the same way; and one more (a Joy-Con question answered on
  // the Main Page: 4.7 s locally), the same way.
  'gamepad-navigation.spec.js': 269.5,
  'guide-example-focus.spec.js': 15.1,
  'header-names.spec.js': 38.9,
  'ink-modes.spec.js': 140.6,
  'invariants-selftest.spec.js': 3.8,
  'keyguard-compilation-smoke.spec.js': 14.7,
  'keyguard-workflow.spec.js': 6.2,
  'layered-design.spec.js': 95.5,
  'layout-rework-number-box.spec.js': 11.3,
  'library-panel.spec.js': 24.9,
  'link-failure-notice.spec.js': 30.9,
  'linked-drawing.spec.js': 38.2,
  'main-page-return.spec.js': 9.8,
  'manifest-loading.spec.js': 91.0,
  'memory-banner.spec.js': 77.7,
  'menu-dialog-focus.spec.js': 55.7,
  'menu-parity.spec.js': 304.0,
  'menu-reach.spec.js': 41.1,
  'mesh-companion.spec.js': 13.1,
  'mobile-drawer.spec.js': 13.2,
  // 101.3 by the two runs above, plus three cases since (the first row in
  // high contrast at two heights, and held sideways: 7 s locally), booked at
  // about four times that.
  'mobile-toolbar.spec.js': 189.3,
  'mobile-viewport.spec.js': 75.5,
  'overlay-placement.spec.js': 168.9,
  'page-fits-window.spec.js': 62.0,
  'param-links.spec.js': 95.6,
  'parameter-filter.spec.js': 5.1,
  'parity-regression.spec.js': 38.7,
  'potrace-engine.spec.js': 2.4,
  'preference-matrix.spec.js': 40.7,
  // 24.3 by the two runs above, plus one case since (a library file's plain
  // badge: 1.7 s locally), booked at four times that.
  'preview-stats.spec.js': 31.1,
  'project-link-lane.spec.js': 3.9,
  'project-share.spec.js': 31.7,
  'project-switch.spec.js': 73.4,
  'publish-dialog.spec.js': 50.3,
  'real-start.spec.js': 52.3,
  'recovery-mode.spec.js': 33.6,
  'responsive-audit.spec.js': 99.3,
  'saved-projects-dialogs.spec.js': 36.2,
  'saved-projects-focus.spec.js': 22.5,
  'saved-projects.spec.js': 118.5,
  'self-disabling-controls-focus.spec.js': 74.7,
  'settings-follow-the-person.spec.js': 15.4,
  'share-settings.spec.js': 58.5,
  'stakeholder-acceptance.spec.js': 39.2,
  'startup-questions.spec.js': 9.9,
  'status-announcements.spec.js': 67.1,
  'stl-view.spec.js': 13.1,
  'svg-edit-door.spec.js': 422.5,
  'svg-preparer.spec.js': 12.0,
  'terminology.spec.js': 29.8,
  'theme-switching.spec.js': 189.6,
  'touch-targets.spec.js': 103.4,
  'tour-interaction.spec.js': 271.6,
  'tour-nudge.spec.js': 59.8,
  'trace-start-cancel.spec.js': 153.9,
  'tutorials.spec.js': 206.7,
  'typed-preset.spec.js': 10.3,
  // 1474.1 by the two runs above, plus four cases since (the open phone
  // Customizer closed by its own arrow, in four looks: 28 s locally), booked
  // at about four times that. Then eight more (Preview Settings opened over
  // the preview without moving it, two desktop sizes in four looks), booked
  // at 45.4 s from CI's own pace in Test Suite 39315966307: two presses of a
  // toggle each, at the 2.2 to 3.3 s a press its S1 case took there.
  'ui-schema.spec.js': 1668.5,
  'wasm-smoke.spec.js': 35.6,
  'welcome-spotlight.spec.js': 37.4,
  'welcome-surface.spec.js': 18.6,

  // Not yet measured on CI, booked from a local run at about four times its
  // local cost (CI draws in software): engine-choice, two cases that load the
  // box two and three times and download one official engine, 19 s locally.
  'engine-choice.spec.js': 80.0,
  // engine-fault-ladder, four cases that start or render the box two or three
  // times and download one official engine, 29 s locally.
  'engine-fault-ladder.spec.js': 120.0,
  // keys-dialog, nine cases that each load the app once and open Keys,
  // 22 s locally; the first eight took 37 s on CI.
  'keys-dialog.spec.js': 95.0,
  // 137.2 by the two runs above, plus one case since (the Engine group, which
  // downloads an engine and switches twice: 9.3 s locally), booked at 40.
  'preferences-dialog.spec.js': 237.2,

  // Ran on no lane of either run: every case skips on CI for want of a
  // fixture. Kept at zero, so that a file which starts running again is
  // visible as a change rather than as a silent newcomer.
  'benchmark-runner.spec.js': 0,
  'companion-navigation.spec.js': 0,
  'echo-drawer.spec.js': 0,
  'full-render-color.spec.js': 0,
  'generic-project-baseline.spec.js': 0,
  'keyguard-parser-smoke.spec.js': 0,
  'library-archive.spec.js': 0,
  'lwfl-parity-reproduction.spec.js': 0,
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
 *
 * alt-view-icon-states.spec.js runs on Chromium only. It forces :hover and
 * :active through the DevTools protocol, which Firefox does not have (every
 * case would skip), and Edge draws with Chromium's engine, so it would
 * measure the same pixels; booked honestly at 600 s it put the Edge lane at
 * 35.0 of its 35 minutes. Reverse: delete the two entries once the lanes are
 * re-split.
 *
 * trace-start-cancel.spec.js runs on Chromium only: it slows the processor
 * through the DevTools protocol, which the other engines do not have.
 */
export const PROJECT_IGNORES = Object.freeze({
  chromium: [],
  msedge: [
    'drawing-editor.spec.js',
    'trace-start-cancel.spec.js',
    'potrace-engine.spec.js',
    'alt-view-icon-states.spec.js',
  ],
  firefox: [
    'wasm-smoke.spec.js',
    'drawing-editor.spec.js',
    'trace-start-cancel.spec.js',
    'potrace-engine.spec.js',
    'alt-view-icon-states.spec.js',
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
