// Q-20 design-sheet probe: screenshots + measurements of the current Classic
// fields at HEAD (branch remediation/classic-uf2-drawers). Read-only — no app
// code is changed. Run: node probe.mjs <baseURL> <outDir>
import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE = process.argv[2] || 'http://localhost:5173';
const OUT = process.argv[3] || path.join(process.cwd(), 'shots');
fs.mkdirSync(OUT, { recursive: true });

const FIXTURE = path.join(
  'C:\\Users\\WATAP\\Documents\\github\\openscad-assistive-forge',
  'tests', 'fixtures', 'universal-cuff', 'universal_cuff_utensil_holder.scad'
);

const measurements = {};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
});
const page = await context.newPage();

await page.addInitScript(() => {
  localStorage.setItem('openscad-forge-first-visit-seen', 'true');
  localStorage.setItem('openscad-forge-classic-panes', JSON.stringify({
    editorVisible: true,
    customizerVisible: true,
    consoleCollapsed: false,
    animateVisible: false,
    fontListVisible: false,
    viewportControlVisible: true,
  }));
});

await page.goto(BASE);
await page.waitForSelector('body[data-wasm-ready="true"]', {
  state: 'attached', timeout: 180_000,
});
await page.locator('#fileInput').setInputFiles(FIXTURE);
await page.locator('#welcomeScreen').waitFor({ state: 'hidden', timeout: 30_000 });
try {
  const notNow = page.locator('#saveProjectNotNow');
  await notNow.waitFor({ state: 'visible', timeout: 3_000 });
  await notNow.click();
} catch { /* modal did not appear */ }

// Enter Classic Standard
await page.locator('#classicModeToggle').click();
await page.waitForSelector('body[data-ui-mode="classic"]', { timeout: 10_000 });
const density = page.locator('#classicDensityToggle');
await density.waitFor({ state: 'visible', timeout: 10_000 });
if ((await density.getAttribute('aria-checked')) !== 'true') {
  await density.click();
}
await page.waitForSelector('body[data-classic-density="standard"]', { timeout: 10_000 });

// Let the auto-preview land so the 3D view is real, not empty.
await page.waitForFunction(
  () => {
    const t = document.getElementById('previewStatusText');
    return t && /ready|complete|preview/i.test(t.textContent || '');
  },
  { timeout: 120_000 }
).catch(() => {});
await page.waitForTimeout(4_000);

async function box(selector) {
  const el = page.locator(selector).first();
  if ((await el.count()) === 0) return null;
  return await el.boundingBox();
}

// ── Measurements: the Console pane and its log area ─────────────────────────
measurements.consolePane = await box('.classic-console-slot');
measurements.consoleLogArea = await box('#console-output');
measurements.consoleTitlebar = await box('.classic-console-slot .classic-pane-titlebar');
measurements.consoleFilterRow = await box('.classic-console-slot .console-controls');
measurements.foldBtn = await box('#classicConsoleFoldBtn');
measurements.editorTitlebar = await box('.classic-editor-slot .classic-pane-titlebar');
measurements.bottomStrip = await box('.classic-bottom-strip');
measurements.previewPanel = await box('.preview-panel');
measurements.logLineHeight = await page.evaluate(() => {
  const el = document.getElementById('console-output');
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { lineHeight: cs.lineHeight, fontSize: cs.fontSize, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight };
});
measurements.touchTargetToken = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--size-touch-target').trim()
);

// ── 01: the whole Classic window, all four fields occupied ──────────────────
await page.screenshot({ path: path.join(OUT, '01-classic-1400-default.png') });

// ── 02: title-bar close-ups (the current controls Q-20 must reconcile) ──────
const bars = [
  ['console', '.classic-console-slot .classic-pane-titlebar'],
  ['errorlog', '.classic-error-log-slot .classic-pane-titlebar'],
  ['editor', '.classic-editor-slot .classic-pane-titlebar'],
  ['customizer', '#paramPanel .classic-pane-titlebar'],
  ['viewport', '.classic-viewport-control-slot .classic-pane-titlebar'],
];
for (const [name, sel] of bars) {
  const el = page.locator(sel).first();
  if ((await el.count()) > 0 && (await el.isVisible().catch(() => false))) {
    await el.screenshot({ path: path.join(OUT, `02-titlebar-${name}.png`) });
  } else {
    measurements[`titlebarMissing_${name}`] = sel;
  }
}

// ── 03: what today's per-panel ▾ does (Editor collapsed) ────────────────────
const editorCollapse = page.locator('.classic-editor-slot .classic-pane-collapse, .classic-editor-slot [aria-label^="Collapse"]').first();
if ((await editorCollapse.count()) > 0) {
  await editorCollapse.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '03-editor-collapsed.png') });
  await editorCollapse.click();
  await page.waitForTimeout(400);
} else {
  // fall back: find any collapse button on the left field
  const anyCollapse = page.locator('.classic-dock-field--left [aria-label^="Collapse"]').first();
  if ((await anyCollapse.count()) > 0) {
    await anyCollapse.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, '03-editor-collapsed.png') });
    await anyCollapse.click();
    await page.waitForTimeout(400);
  }
}

// ── 04: what today's strip ▾ does (bottom strip folded) ─────────────────────
await page.locator('#classicConsoleFoldBtn').click();
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, '04-strip-folded.png') });
measurements.bottomStripFolded = await box('.classic-bottom-strip');
await page.locator('#classicConsoleFoldBtn').click();
await page.waitForTimeout(400);

// ── 05: the stacked <1024px layout (UF-2c's ground) ─────────────────────────
await page.setViewportSize({ width: 375, height: 812 });
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, '05-stacked-375.png'), fullPage: false });
await page.screenshot({ path: path.join(OUT, '05-stacked-375-full.png'), fullPage: true });
await page.setViewportSize({ width: 1400, height: 900 });
await page.waitForTimeout(800);

// ── 06: the Forge drawer look (the pattern UF-2b echoes) ────────────────────
await page.locator('#classicModeToggle').click();
await page.waitForFunction(() => document.body.dataset.uiMode !== 'classic', { timeout: 10_000 });
await page.waitForTimeout(800);
const drawerHeader = page.locator('.preview-drawer-header');
if (await drawerHeader.isVisible().catch(() => false)) {
  await drawerHeader.screenshot({ path: path.join(OUT, '06-forge-drawer-header-collapsed.png') });
}
const toggle = page.locator('#previewDrawerToggle');
if (await toggle.isVisible().catch(() => false)) {
  await toggle.click();
  await page.waitForTimeout(500);
  const info = page.locator('#previewInfoSection');
  await info.screenshot({ path: path.join(OUT, '06-forge-drawer-expanded.png') });
}
const echo = page.locator('#echoDrawer');
if (await echo.isVisible().catch(() => false)) {
  await echo.screenshot({ path: path.join(OUT, '06-forge-echo-drawer.png') });
}
await page.screenshot({ path: path.join(OUT, '06-forge-1400.png') });

fs.writeFileSync(path.join(OUT, 'measurements.json'), JSON.stringify(measurements, null, 2));
console.log(JSON.stringify(measurements, null, 2));
await browser.close();
