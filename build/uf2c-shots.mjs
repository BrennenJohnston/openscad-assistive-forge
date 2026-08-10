// UF-2c visual pass: the stacked restore bars at 375/768 + the Console
// log-area measurement in the stack (the R-II leftover's report).
import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE = process.argv[2] || 'http://localhost:5174';
const OUT = 'build\\uf2c-shots';
fs.mkdirSync(OUT, { recursive: true });

const FIXTURE = path.join(process.cwd(), 'tests', 'fixtures',
  'universal-cuff', 'universal_cuff_utensil_holder.scad');

const browser = await chromium.launch();

async function boot(viewport, panes = {}) {
  const page = await browser.newPage({ viewport });
  await page.addInitScript(([value]) => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-classic-panes', JSON.stringify(value));
  }, [{
    editorVisible: true, customizerVisible: true, consoleCollapsed: false,
    animateVisible: false, fontListVisible: false, viewportControlVisible: false,
    ...panes,
  }]);
  await page.goto(BASE);
  await page.waitForSelector('body[data-wasm-ready="true"]', { state: 'attached', timeout: 180_000 });
  await page.locator('#fileInput').setInputFiles(FIXTURE);
  await page.locator('#welcomeScreen').waitFor({ state: 'hidden', timeout: 30_000 });
  try {
    const n = page.locator('#saveProjectNotNow');
    await n.waitFor({ state: 'visible', timeout: 3_000 });
    await n.click();
  } catch {}
  await page.locator('#classicModeToggle').click();
  await page.waitForSelector('body[data-ui-mode="classic"]', { timeout: 10_000 });
  const d = page.locator('#classicDensityToggle');
  await d.waitFor({ state: 'visible', timeout: 10_000 });
  if ((await d.getAttribute('aria-checked')) !== 'true') await d.click();
  await page.waitForTimeout(3_000);
  return page;
}

// 375: everything stowed — the stack becomes preview + camera + three bars.
let page = await boot({ width: 375, height: 812 }, {
  stowLeft: true, stowRightTop: true, consoleCollapsed: true,
});
await page.screenshot({ path: path.join(OUT, '375-all-stowed-bars.png') });
// scroll to the bars
await page.evaluate(() => {
  document.querySelector('.classic-stow-rail--left')?.scrollIntoView({ block: 'end' });
});
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, '375-bars-in-view.png') });
await page.close();

// 768: one section stowed mid-stack.
page = await boot({ width: 768, height: 900 }, { stowRightTop: true });
await page.evaluate(() => {
  document.querySelector('.classic-stow-rail--right')?.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, '768-customizer-stowed-bar.png') });
await page.close();

// Console log-area in the stack at 375 (the R-II leftover's report).
page = await boot({ width: 375, height: 812 });
await page.evaluate(() => {
  document.querySelector('.classic-console-slot')?.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(400);
const consoleNumbers = await page.evaluate(() => {
  const rect = (el) => el?.getBoundingClientRect() ?? null;
  const pane = document.querySelector('.classic-console-slot');
  const log = document.getElementById('console-output');
  const paneR = rect(pane);
  const logR = rect(log);
  const lh = log ? parseFloat(getComputedStyle(log).lineHeight) : null;
  const visible = paneR && logR
    ? Math.max(0, Math.min(paneR.bottom, logR.bottom) - Math.max(paneR.top, logR.top))
    : null;
  return {
    paneHeight: paneR?.height,
    visibleLogWindow: visible,
    lineHeight: lh,
    approxVisibleLines: visible && lh ? Math.floor(visible / lh) : null,
  };
});
await page.screenshot({ path: path.join(OUT, '375-console-in-stack.png') });
console.log(JSON.stringify(consoleNumbers, null, 2));
await page.close();

await browser.close();
console.log('done');
