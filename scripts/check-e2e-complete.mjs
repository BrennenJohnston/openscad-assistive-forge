/**
 * Fail when a Playwright run reports tests that never started (Q-23).
 *
 * The Chromium job once passed for a whole release while two menu-parity
 * tests were red, because tests the global clock cut off report as
 * "did not run" rather than failed — a green check over an incomplete run.
 * This walks the JSON report and exits non-zero when any test has no
 * results at all (a skipped test carries a result with status 'skipped',
 * so legitimate skips pass).
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

function walkSuite(suite, trail) {
  for (const child of suite.suites ?? []) {
    walkSuite(child, `${trail}${child.title} › `);
  }
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      total++;
      if ((test.results ?? []).length === 0) {
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

if (neverStarted.length > 0) {
  console.error(
    `[e2e-complete] ${neverStarted.length} of ${total} tests NEVER STARTED — ` +
      'the clock cut them off before they ran. A green summary over an ' +
      'incomplete run hides real reds; raise the ceiling or trim the suite.'
  );
  for (const name of neverStarted) {
    console.error(`  did not run: ${name}`);
  }
  process.exit(1);
}

console.log(`[e2e-complete] all ${total} tests ran (or were formally skipped)`);
