/**
 * Desktop-parity harness orchestrator.
 *
 *   node scripts/parity/run-parity.mjs --wasm            render fixtures via WASM (needs the app served; see --base-url)
 *   node scripts/parity/run-parity.mjs --desktop         render fixtures via desktop CLI
 *   node scripts/parity/run-parity.mjs --compare         compare artifacts (wasm vs desktop, or vs golden)
 *   node scripts/parity/run-parity.mjs --all             wasm + desktop + compare
 *
 * Options:
 *   --profile matched|cross-version|golden   tolerance profile (default cross-version;
 *                                            'golden' compares WASM output against
 *                                            scripts/parity/golden/golden-manifest.json)
 *   --ci-only                                only fixtures marked ci:true
 *   --base-url <url>                         app URL for the WASM side (default http://localhost:5173)
 *   --openscad <path>                        desktop binary (default OpenSCAD Nightly)
 *   --bless-golden                           write golden-manifest.json from current WASM stats
 *
 * Desktop rendering happens through Node's execFile, which passes each
 * -D argument verbatim to the binary — no shell, no PowerShell 5.1
 * quote-mangling (the historical failure mode of Start-Process harnesses).
 * The exact -D strings come from the same src/js/scad-param-formatter.js
 * the app uses, so both engines receive byte-identical parameter values;
 * they are also dumped to artifacts/parity/args/ for inspection.
 *
 * @license GPL-3.0-or-later
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDefineArgs } from '../../src/js/scad-param-formatter.js';
import { parseSTL, computeStats, compareStats } from './stl-stats.mjs';
import { renderAllWasm } from './render-wasm.mjs';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const artifactsDir = path.join(repoRoot, 'artifacts', 'parity');
const goldenPath = path.join(__dirname, 'golden', 'golden-manifest.json');

const DEFAULT_OPENSCAD =
  'C:\\Program Files\\OpenSCAD (Nightly)\\openscad.com';
const DESKTOP_TIMEOUT_MS = 600_000;

function getArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

function loadFixtures(ciOnly) {
  const manifest = JSON.parse(
    readFileSync(path.join(__dirname, 'fixtures.json'), 'utf-8')
  );
  return manifest.fixtures.filter((f) => !ciOnly || f.ci);
}

function prepareDefineArgs(fixtures) {
  const argsDir = path.join(artifactsDir, 'args');
  mkdirSync(argsDir, { recursive: true });
  const jobs = [];
  for (const fixture of fixtures) {
    const scadAbs = path.join(repoRoot, fixture.scad);
    const scadText = readFileSync(scadAbs, 'utf-8');
    const args = buildDefineArgs(
      fixture.params || {},
      fixture.paramTypes || {},
      scadText
    );
    const job = { id: fixture.id, scad: scadAbs, args };
    writeFileSync(
      path.join(argsDir, `${fixture.id}.args.json`),
      JSON.stringify(job, null, 2)
    );
    jobs.push(job);
  }
  return jobs;
}

async function renderAllDesktop({ openscadPath, ciOnly }) {
  if (!existsSync(openscadPath)) {
    throw new Error(
      `Desktop OpenSCAD not found at "${openscadPath}" — pass --openscad <path>`
    );
  }
  const outDir = path.join(artifactsDir, 'desktop');
  mkdirSync(outDir, { recursive: true });
  const jobs = prepareDefineArgs(loadFixtures(ciOnly));

  const failed = [];
  for (const job of jobs) {
    const outStl = path.join(outDir, `${job.id}.stl`);
    const argv = [
      '--backend=Manifold',
      '--export-format=binstl',
      '-o',
      outStl,
      ...job.args,
      job.scad,
    ];
    console.log(`[parity:desktop] Rendering ${job.id} ...`);
    const started = Date.now();
    let consoleOut = '';
    try {
      const { stdout, stderr } = await execFileAsync(openscadPath, argv, {
        timeout: DESKTOP_TIMEOUT_MS,
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
      });
      consoleOut = `${stdout}\n${stderr}`;
    } catch (err) {
      // OpenSCAD writes its summary to stderr and can exit non-zero on
      // warnings; judge success by the STL existing, per project rules.
      consoleOut = `${err.stdout || ''}\n${err.stderr || ''}\n${err.message}`;
    }
    writeFileSync(path.join(outDir, `${job.id}.log`), consoleOut);

    if (!existsSync(outStl)) {
      console.error(`[parity:desktop] ${job.id} FAILED (no STL written)`);
      failed.push(job.id);
      continue;
    }
    const stats = computeStats(parseSTL(readFileSync(outStl)));
    writeFileSync(
      path.join(outDir, `${job.id}.stats.json`),
      JSON.stringify(
        {
          id: job.id,
          engine: 'desktop',
          openscadPath,
          elapsedMs: Date.now() - started,
          ...stats,
        },
        null,
        2
      )
    );
    console.log(
      `[parity:desktop] ${job.id}: ${stats.facets} facets, ${stats.volume.toFixed(3)} mm³`
    );
  }

  if (failed.length > 0) {
    throw new Error(`Desktop render failed for: ${failed.join(', ')}`);
  }
}

function readStats(dir, id) {
  const file = path.join(dir, `${id}.stats.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf-8'));
}

function compareAll({ profile, ciOnly }) {
  const fixtures = loadFixtures(ciOnly);
  const wasmDir = path.join(artifactsDir, 'wasm');
  const desktopDir = path.join(artifactsDir, 'desktop');

  let golden = null;
  if (profile === 'golden') {
    if (!existsSync(goldenPath)) {
      throw new Error(
        `Golden manifest missing at ${goldenPath} — run --bless-golden after a verified matched-parity run`
      );
    }
    golden = JSON.parse(readFileSync(goldenPath, 'utf-8'));
  }

  const rows = [];
  let anyFail = false;

  for (const fixture of fixtures) {
    const wasmStats = readStats(wasmDir, fixture.id);
    const refStats =
      profile === 'golden'
        ? golden.fixtures[fixture.id]
        : readStats(desktopDir, fixture.id);

    if (!wasmStats || !refStats) {
      rows.push({
        id: fixture.id,
        verdict: 'MISSING',
        detail: `${wasmStats ? '' : 'wasm '}${refStats ? '' : profile === 'golden' ? 'golden' : 'desktop'} stats absent`,
      });
      anyFail = true;
      continue;
    }

    const result = compareStats(wasmStats, refStats, profile);
    anyFail = anyFail || !result.pass;
    rows.push({
      id: fixture.id,
      verdict: result.pass ? 'PASS' : 'FAIL',
      volumePct: (result.metrics.volumeRelDiff * 100).toFixed(4),
      bboxMm: result.metrics.bboxMaxAxisDiff.toFixed(4),
      facetPct: (result.metrics.facetRelDiff * 100).toFixed(2),
      hashEqual: result.metrics.hashEqual,
      failures: result.failures,
      warnings: result.warnings,
    });
  }

  const lines = [
    `# Parity Report`,
    ``,
    `- Profile: **${profile}**`,
    `- Generated: (see file mtime; timestamps intentionally omitted for reproducibility)`,
    ``,
    `| Fixture | Volume Δ% | BBox Δmm | Facets Δ% | Hash | Verdict |`,
    `|---|---|---|---|---|---|`,
  ];
  for (const r of rows) {
    if (r.verdict === 'MISSING') {
      lines.push(`| ${r.id} | — | — | — | — | ⚠ MISSING (${r.detail}) |`);
    } else {
      lines.push(
        `| ${r.id} | ${r.volumePct} | ${r.bboxMm} | ${r.facetPct} | ${r.hashEqual ? '=' : '≠'} | ${r.verdict === 'PASS' ? '✅ PASS' : '❌ FAIL'} |`
      );
    }
  }
  const notes = rows.flatMap((r) =>
    [...(r.failures || []), ...(r.warnings || [])].map((n) => `- ${r.id}: ${n}`)
  );
  if (notes.length) {
    lines.push('', '## Details', '', ...notes);
  }

  mkdirSync(artifactsDir, { recursive: true });
  writeFileSync(path.join(artifactsDir, 'report.md'), lines.join('\n') + '\n');
  writeFileSync(
    path.join(artifactsDir, 'report.json'),
    JSON.stringify({ profile, rows }, null, 2)
  );

  console.log(lines.join('\n'));
  console.log(`\n[parity] Report written to artifacts/parity/report.md`);
  return !anyFail;
}

function blessGolden({ ciOnly }) {
  const fixtures = loadFixtures(ciOnly);
  const wasmDir = path.join(artifactsDir, 'wasm');
  const out = { engineVersion: 'OpenSCAD-2026.04.03 WASM (Manifold)', fixtures: {} };
  for (const fixture of fixtures) {
    const stats = readStats(wasmDir, fixture.id);
    if (!stats) {
      throw new Error(
        `Cannot bless golden: missing WASM stats for ${fixture.id} (run --wasm first)`
      );
    }
    const { id: _id, engine: _e, elapsedMs: _t, ...geom } = stats;
    out.fixtures[fixture.id] = geom;
  }
  mkdirSync(path.dirname(goldenPath), { recursive: true });
  writeFileSync(goldenPath, JSON.stringify(out, null, 2));
  console.log(
    `[parity] Golden manifest blessed for ${Object.keys(out.fixtures).length} fixtures → ${goldenPath}`
  );
}

async function main() {
  const doAll = process.argv.includes('--all');
  const doWasm = doAll || process.argv.includes('--wasm');
  const doDesktop = doAll || process.argv.includes('--desktop');
  const doCompare = doAll || process.argv.includes('--compare');
  const doBless = process.argv.includes('--bless-golden');
  const profile = getArg('--profile', 'cross-version');
  const ciOnly = process.argv.includes('--ci-only');
  const openscadPath = getArg('--openscad', DEFAULT_OPENSCAD);
  const baseUrl = getArg('--base-url', 'http://localhost:5173');

  if (!doWasm && !doDesktop && !doCompare && !doBless) {
    console.error(
      'Nothing to do — pass --wasm, --desktop, --compare, --all, or --bless-golden'
    );
    process.exit(2);
  }

  if (doWasm) {
    await renderAllWasm({ baseUrl, ciOnly });
  }
  if (doDesktop) {
    await renderAllDesktop({ openscadPath, ciOnly });
  }
  if (doBless) {
    blessGolden({ ciOnly });
  }
  if (doCompare) {
    const ok = compareAll({ profile, ciOnly });
    if (!ok) process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
