/**
 * Fail when a Playwright run reports tests that never started (Q-23).
 *
 * The Chromium job once passed for a whole release while two menu-parity
 * tests were red, because tests the global clock cut off report as
 * "did not run" rather than failed — a green check over an incomplete run.
 *
 * UF-27 / D-50: on the installed Playwright (1.57) that is no longer how a
 * cut-off test is reported, and this script had stopped being able to see
 * the one thing it exists for. MEASURED against a deliberately timed-out
 * run: the tests the clock killed came back with `status: 'skipped'` and a
 * result attached, so the original "no results at all" test never fired and
 * the script printed "all 4 tests ran" over a run Playwright itself
 * described as "2 did not run".
 *
 * The discriminator, measured across every skip shape this repo uses
 * (declarative, runtime bare, runtime with a reason, raised from a hook,
 * describe-level, and fixme): a real skip always reports
 * `expectedStatus: 'skipped'` AND carries a skip/fixme annotation. A test
 * the clock cut off reports `expectedStatus: 'passed'` with no annotation
 * at all. Playwright also files "Timed out waiting Ns for the test suite to
 * run" in the report's top-level `errors`, which belong to no test.
 *
 * All three are checked. Playwright's own exit code does currently go
 * non-zero on a global timeout, so this is a backstop rather than the only
 * guard — but a backstop that cannot fail is exactly the vacuous green this
 * check was written to prevent.
 *
 * Sharding-safe: MEASURED that a `--shard=n/m` run reports only its own
 * shard's tests, each carrying a result, so this runs per shard.
 *
 * Usage: node scripts/check-e2e-complete.mjs <playwright-json-report>
 *
 * @license GPL-3.0-or-later
 */

import fs from 'node:fs';

const reportPath = process.argv[2];
if (!reportPath) {
  console.error('usage: check-e2e-complete.mjs <playwright-json-report>');
  process.exit(2);
}
if (!fs.existsSync(reportPath)) {
  console.error(
    `[e2e-complete] No JSON report at ${reportPath} — the run died before ` +
      'reporting, which is itself an incomplete run.'
  );
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

const neverStarted = [];
let total = 0;
let declaredSkips = 0;

/** A skip anyone wrote on purpose always leaves one of these behind. */
function isDeclaredSkip(test) {
  if (test.expectedStatus === 'skipped') return true;
  const annotations = [
    ...(test.annotations ?? []),
    ...(test.results ?? []).flatMap((result) => result.annotations ?? []),
  ];
  return annotations.some((a) => a.type === 'skip' || a.type === 'fixme');
}

function walkSuite(suite, trail) {
  for (const child of suite.suites ?? []) {
    walkSuite(child, `${trail}${child.title} › `);
  }
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      total++;
      const results = test.results ?? [];
      if (isDeclaredSkip(test)) {
        declaredSkips++;
        continue;
      }
      if (results.length === 0) {
        neverStarted.push(`${trail}${spec.title}`);
      } else if (results.every((result) => result.status === 'skipped')) {
        neverStarted.push(`${trail}${spec.title}`);
      }
    }
  }
}

for (const suite of report.suites ?? []) {
  walkSuite(suite, `${suite.title} › `);
}

if (total === 0) {
  console.error('[e2e-complete] The report contains zero tests — refusing.');
  process.exit(1);
}

// "Timed out waiting Ns for the test suite to run" lands here, belonging to no
// test at all. Anything in this list is a failure of the run itself.
const suiteErrors = (report.errors ?? []).map((error) =>
  // eslint-disable-next-line no-control-regex
  String(error.message ?? error).replace(/\[\d+m/g, '')
);

if (neverStarted.length > 0) {
  console.error(
    `[e2e-complete] ${neverStarted.length} of ${total} tests NEVER RAN — ` +
      'the clock cut them off before they started, and they are reported as ' +
      'skipped without anyone having asked for a skip. A green summary over ' +
      'an incomplete run hides real reds; raise the ceiling or trim the suite.'
  );
  for (const name of neverStarted) {
    console.error(`  did not run: ${name}`);
  }
}

if (suiteErrors.length > 0) {
  console.error(
    `[e2e-complete] ${suiteErrors.length} error(s) belong to no test at all — ` +
      'the run itself failed, whatever the per-test summary says.'
  );
  for (const message of suiteErrors) {
    console.error(`  ${message}`);
  }
}

if (neverStarted.length > 0 || suiteErrors.length > 0) {
  process.exit(1);
}

console.log(
  `[e2e-complete] all ${total} tests ran (${declaredSkips} formally skipped)`
);
