/**
 * WASM-side renderer for the desktop-parity harness.
 *
 * Drives the app in headless Chromium via the window.__forgeDebug.parityRender
 * hook, renders every fixture from fixtures.json to binary STL, and writes
 * bytes + computed stats to artifacts/parity/wasm/.
 *
 * The app must be reachable at --base-url (default http://localhost:5173,
 * i.e. `npm run dev`; pass http://localhost:4173 for `npm run preview`).
 * Invoked by run-parity.mjs, or standalone:
 *
 *   node scripts/parity/render-wasm.mjs [--base-url http://localhost:5173] [--ci-only]
 *
 * @license GPL-3.0-or-later
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { parseSTL, computeStats } from './stl-stats.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const WASM_READY_TIMEOUT_MS = 180_000;

function getArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

export async function renderAllWasm({
  baseUrl = getArg('--base-url', 'http://localhost:5173'),
  ciOnly = process.argv.includes('--ci-only'),
  outDir = path.join(repoRoot, 'artifacts', 'parity', 'wasm'),
} = {}) {
  const manifest = JSON.parse(
    readFileSync(path.join(__dirname, 'fixtures.json'), 'utf-8')
  );
  const fixtures = manifest.fixtures.filter((f) => !ciOnly || f.ci);
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (err) => console.error('[page error]', err.message));

  const results = [];
  try {
    console.log(`[parity:wasm] Loading app at ${baseUrl} ...`);
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT_MS,
    });
    console.log('[parity:wasm] WASM engine ready.');

    for (const fixture of fixtures) {
      const scadPath = path.join(repoRoot, fixture.scad);
      const scadText = readFileSync(scadPath, 'utf-8');
      const scadName = path.basename(fixture.scad);

      let files = null;
      let mainFile = null;
      if (fixture.companions?.length) {
        files = { [scadName]: scadText };
        mainFile = scadName;
        for (const rel of fixture.companions) {
          files[rel] = readFileSync(
            path.join(path.dirname(scadPath), rel),
            'utf-8'
          );
        }
      }

      console.log(`[parity:wasm] Rendering ${fixture.id} ...`);
      const started = Date.now();
      const outcome = await page.evaluate(
        (job) => window.__forgeDebug.parityRender(job),
        {
          scadText,
          params: fixture.params || {},
          paramTypes: fixture.paramTypes || {},
          files,
          mainFile,
        }
      );
      const elapsedMs = Date.now() - started;

      if (!outcome || outcome.error) {
        console.error(
          `[parity:wasm] ${fixture.id} FAILED: ${outcome?.error || 'no result'}`
        );
        results.push({ id: fixture.id, ok: false, error: outcome?.error });
        continue;
      }

      const bytes = Buffer.from(outcome.base64Stl, 'base64');
      const stats = computeStats(parseSTL(bytes));
      writeFileSync(path.join(outDir, `${fixture.id}.stl`), bytes);
      writeFileSync(
        path.join(outDir, `${fixture.id}.stats.json`),
        JSON.stringify(
          { id: fixture.id, engine: 'wasm', elapsedMs, ...stats },
          null,
          2
        )
      );
      console.log(
        `[parity:wasm] ${fixture.id}: ${stats.facets} facets, ` +
          `${stats.volume.toFixed(3)} mm³, ${elapsedMs}ms`
      );
      results.push({ id: fixture.id, ok: true, stats });
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    throw new Error(
      `WASM render failed for: ${failed.map((f) => f.id).join(', ')}`
    );
  }
  return results;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  renderAllWasm().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
