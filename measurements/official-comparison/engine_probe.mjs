// Each engine run inside the Forge app, in place of the one it ships,
// without touching the app's files: Playwright routes the engine's three files
// (openscad.js, openscad.wasm with any query, INTEGRITY.json with the
// candidate's checksums and build name) to the candidate's copies. Service
// workers are blocked so no cache answers instead. Chromium only: Playwright
// in Firefox does not route a module worker's import.
//
// Run it from a checkout of the Forge app (its develop branch, with
// npm ci done), against the app's dev server (npx vite):
//
//   node engine_probe.mjs <base url> <engines folder> <out folder> [engines] [models]
//   <engines folder>/<id>/ holds openscad.js, openscad.wasm and an
//   INTEGRITY.json with a "build" name; models are read from ./models/,
//   and the two Plug Puller files from this repository's example-manifest
//   commit 82ddd6200e (plug-puller/), copied into ./models/ first.
//   engines: forge,official-2026-10-18,official-2026-04-03,official-2026-01-03,official-2025-03-25
//   models:  simple-box,q-charm,pp-one,pp-two,deep-100,deep-150,projection,roof,projection_3d,projection_nocut_3d
//
// Writes <out folder>/engines.json (merged run by run) and
// <out folder>/logs/<engine>-<model>.txt and .png.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(path.join(process.cwd(), 'package.json'))('playwright');
const HERE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'models');
const BASE = process.argv[2] || 'http://localhost:5173';
const ENGINE_DIR = path.resolve(process.argv[3]);
const OUT = path.resolve(process.argv[4]);
const ENGINES = (process.argv[5] || 'forge,official-2026-10-18,official-2026-04-03,official-2026-01-03,official-2025-03-25').split(',');
const MODELS = (process.argv[6] || 'simple-box,q-charm,pp-one,pp-two,deep-100,deep-150,projection,roof,projection_3d,projection_nocut_3d').split(',');
const FILES = {
  'pp-one': 'Plug_Puller_SingleFile.scad',
  'pp-two': 'Plug_Puller_Two_Sided_SingleFile.scad',
  'deep-100': 'deep-100.scad',
  'deep-150': 'deep-150.scad',
  projection: 'projection.scad',
  roof: 'roof.scad',
  projection_3d: 'projection_3d.scad',
  projection_nocut_3d: 'projection_nocut_3d.scad',
};
const RENDER_TIMEOUT = 240_000;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const outFile = path.join(OUT, 'engines.json');
const result = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : { base: BASE, runs: {} };
fs.mkdirSync(path.join(OUT, 'logs'), { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11'] });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function newContext(engine) {
  const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    localStorage.setItem('openscad-forge-theme', 'dark');
    localStorage.setItem('openscad-forge-ui-mode', JSON.stringify({ mode: 'standard', lastCustomMode: 'standard' }));
    // What the page sends the engine worker and what it answers, timed.
    window.__msgs = [];
    const Orig = window.Worker;
    window.Worker = class extends Orig {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', (e) => {
          const d = e.data;
          if (!d || typeof d !== 'object' || !d.type || /PROGRESS|MEMORY|HEARTBEAT/.test(d.type)) return;
          if (window.__msgs.length < 300) window.__msgs.push({ t: performance.now(), dir: 'in', type: d.type, code: d.payload?.code ?? null, message: d.payload?.message ? String(d.payload.message).slice(0, 240) : null });
        });
      }
      postMessage(m, ...rest) {
        if (m && typeof m === 'object' && m.type && window.__msgs.length < 300) window.__msgs.push({ t: performance.now(), dir: 'out', type: m.type });
        return super.postMessage(m, ...rest);
      }
    };
  });
  if (engine !== 'forge') {
    const dir = path.join(ENGINE_DIR, engine);
    const js = fs.readFileSync(path.join(dir, 'openscad.js'));
    const wasm = fs.readFileSync(path.join(dir, 'openscad.wasm'));
    const integrity = JSON.parse(fs.readFileSync(path.join(dir, 'INTEGRITY.json'), 'utf8'));
    await context.route('**/wasm/openscad-official/INTEGRITY.json*', async (route) => {
      const resp = await route.fetch();
      const j = await resp.json();
      j.build = integrity.build;
      j.files['openscad.js'] = { sha256: sha(js), size: js.length };
      j.files['openscad.wasm'] = { sha256: sha(wasm), size: wasm.length };
      await route.fulfill({ response: resp, body: JSON.stringify(j), headers: { ...resp.headers(), 'content-type': 'application/json' } });
    });
    await context.route('**/wasm/openscad-official/openscad.js*', (r) => r.fulfill({ status: 200, body: js, headers: { 'content-type': 'text/javascript', 'cross-origin-resource-policy': 'same-origin' } }));
    await context.route('**/wasm/openscad-official/openscad.wasm*', (r) => r.fulfill({ status: 200, body: wasm, headers: { 'content-type': 'application/wasm', 'cross-origin-resource-policy': 'same-origin' } }));
  }
  return context;
}

function stateInPage() {
  const mesh = window.previewManager?.mesh;
  let triangles = null;
  if (mesh) {
    triangles = 0;
    mesh.traverse((o) => {
      const g = o.geometry;
      if (!g?.attributes?.position || !o.isMesh) return;
      triangles += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    });
  }
  const modal = [...document.querySelectorAll('[data-testid="friendly-error-modal"], [role="alertdialog"][aria-hidden="false"]')].pop();
  return {
    previewStatus: document.querySelector('#previewStatusText')?.textContent.trim().replace(/\s+/g, ' ').slice(0, 200) ?? null,
    badge: document.querySelector('.preview-state-indicator, #previewStateIndicator, .preview-status-badge, [data-preview-state]')?.textContent.trim().slice(0, 80) ?? null,
    dialog: modal ? modal.innerText.trim().replace(/\s+/g, ' ').slice(0, 300) : null,
    triangles,
    msgs: window.__msgs.slice(-40).map((m) => ({ ...m, t: Math.round(m.t) })),
  };
}

for (const engine of ENGINES) {
  for (const model of MODELS) {
    const key = `${engine}|${model}`;
    log(key);
    const rec = { engine, model };
    const context = await newContext(engine);
    const page = await context.newPage();
    const consoleLines = [];
    const errors = [];
    page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text().slice(0, 500)}`));
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
    page.on('worker', (w) => w.on('console', (m) => consoleLines.push(`W ${m.type()}: ${m.text().slice(0, 500)}`)));
    try {
      const url = FILES[model] ? '/' : `/?example=${model}`;
      await page.goto(url, { timeout: 60_000 });
      await page.waitForSelector('body[data-wasm-ready="true"]', { state: 'attached', timeout: 180_000 });
      rec.engineStarted = true;
      const from = await page.evaluate(() => window.__msgs.length);
      if (FILES[model]) {
        await page.locator('#fileInput').setInputFiles(path.join(HERE, FILES[model]));
      }
      const notNow = page.locator('#saveProjectNotNow');
      notNow.waitFor({ state: 'visible', timeout: 5000 }).then(() => notNow.click()).catch(() => {});
      const ended = await page
        .waitForFunction(
          (from) => window.__msgs.slice(from).some((m) => m.dir === 'in' && (m.type === 'COMPLETE' || m.type === 'ERROR')),
          from,
          { timeout: RENDER_TIMEOUT, polling: 250 }
        )
        .then(() => true, () => false);
      rec.ended = ended;
      await page.waitForTimeout(1500);
      const st = await page.evaluate(stateInPage);
      const msgs = await page.evaluate((from) => window.__msgs.slice(from).map((m) => ({ ...m, t: Math.round(m.t) })), from);
      const firstRender = msgs.find((m) => m.dir === 'out' && /RENDER/.test(m.type));
      const firstEnd = msgs.find((m) => m.dir === 'in' && (m.type === 'COMPLETE' || m.type === 'ERROR'));
      rec.result = firstEnd ? (firstEnd.type === 'COMPLETE' ? 'rendered' : `failed ${firstEnd.code}`) : 'no end';
      rec.errorMessage = firstEnd?.type === 'ERROR' ? firstEnd.message : null;
      rec.renderMs = firstRender && firstEnd ? firstEnd.t - firstRender.t : null;
      rec.outTypes = [...new Set(msgs.filter((m) => m.dir === 'out').map((m) => m.type))];
      rec.triangles = st.triangles;
      rec.previewStatus = st.previewStatus;
      rec.dialog = st.dialog;
      rec.buildLine = consoleLines.find((l) => l.includes('WASM build:'))?.replace(/^W? ?\w+: /, '') ?? null;
      rec.integrityWarning = consoleLines.some((l) => l.includes('integrity check FAILED'));
      rec.minkowskiFailed = consoleLines.filter((l) => l.includes('Minkowski failed')).length;
      rec.engineErrors = consoleLines
        .filter((l) => !l.includes('WASM build:') && !l.includes('Could not initialize localization'))
        .filter((l) => /OpenSCAD ERR|abort|Assertion|CGAL|unreachable|RuntimeError|out of bounds/i.test(l))
        .slice(0, 8);
      await page.screenshot({ path: path.join(OUT, 'logs', `${engine}-${model}.png`) }).catch(() => {});
    } catch (e) {
      rec.error = e.message.slice(0, 300);
    }
    rec.pageErrors = errors;
    fs.writeFileSync(path.join(OUT, 'logs', `${engine}-${model}.txt`), consoleLines.join('\n'));
    result.runs[key] = rec;
    result.when = new Date().toISOString();
    fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
    log(' ->', rec.result, rec.renderMs, 'ms', rec.triangles, 'tri', rec.buildLine, rec.error || '');
    await context.close();
  }
}
await browser.close();
log('done');
