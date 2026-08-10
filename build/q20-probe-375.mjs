// Q-20 supplement: what the stacked <1024px Classic layout does with the
// fields at 375px. Read-only.
import { chromium } from '@playwright/test';
import path from 'path';

const BASE = process.argv[2] || 'http://localhost:5174';
const FIXTURE = path.join(process.cwd(), 'tests', 'fixtures',
  'universal-cuff', 'universal_cuff_utensil_holder.scad');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
await page.addInitScript(() => {
  localStorage.setItem('openscad-forge-first-visit-seen', 'true');
  localStorage.setItem('openscad-forge-classic-panes', JSON.stringify({
    editorVisible: true, customizerVisible: true, consoleCollapsed: false,
    animateVisible: false, fontListVisible: false, viewportControlVisible: true,
  }));
});
await page.goto(BASE);
await page.waitForSelector('body[data-wasm-ready="true"]', { state: 'attached', timeout: 180_000 });
await page.locator('#fileInput').setInputFiles(FIXTURE);
await page.locator('#welcomeScreen').waitFor({ state: 'hidden', timeout: 30_000 });
try {
  const notNow = page.locator('#saveProjectNotNow');
  await notNow.waitFor({ state: 'visible', timeout: 3_000 });
  await notNow.click();
} catch {}
await page.locator('#classicModeToggle').click();
await page.waitForSelector('body[data-ui-mode="classic"]', { timeout: 10_000 });
const density = page.locator('#classicDensityToggle');
await density.waitFor({ state: 'visible', timeout: 10_000 });
if ((await density.getAttribute('aria-checked')) !== 'true') await density.click();
await page.waitForTimeout(3_000);

const report = await page.evaluate(() => {
  const sel = {
    mainInterface: '.main-interface',
    editorSlot: '.classic-editor-slot',
    paramPanel: '#paramPanel',
    bottomStrip: '.classic-bottom-strip',
    viewportSlot: '.classic-viewport-control-slot',
    previewPanel: '.preview-panel',
    cameraBar: '.classic-camera-bar',
  };
  const out = {};
  for (const [name, s] of Object.entries(sel)) {
    const el = document.querySelector(s);
    if (!el) { out[name] = null; continue; }
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    out[name] = {
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      display: cs.display, overflowY: cs.overflowY,
      scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
    };
  }
  const mi = document.querySelector('.main-interface');
  out.viewport = { w: innerWidth, h: innerHeight };
  out.docScroll = { scrollHeight: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight };
  out.mainInterfaceScrollable = mi ? mi.scrollHeight > mi.clientHeight : null;
  return out;
});
console.log(JSON.stringify(report, null, 2));

// Scroll the main interface (or window) to the editor slot and screenshot.
await page.evaluate(() => {
  document.querySelector('.classic-editor-slot')?.scrollIntoView({ block: 'start' });
});
await page.waitForTimeout(500);
await page.screenshot({ path: path.join('build', 'uf2-q20', '05-stacked-375-scrolled-to-editor.png') });
await browser.close();
