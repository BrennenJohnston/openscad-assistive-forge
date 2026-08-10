// UF-2b visual pass: the converted bottom stow at 1400, both arrangements,
// plus everything stowed at once.
import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE = process.argv[2] || 'http://localhost:5174';
const OUT = 'build\\uf2b-shots';
fs.mkdirSync(OUT, { recursive: true });

const FIXTURE = path.join(process.cwd(), 'tests', 'fixtures',
  'universal-cuff', 'universal_cuff_utensil_holder.scad');

const browser = await chromium.launch();

async function boot(panes, viewport = { width: 1400, height: 900 }) {
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

// 1: default (VPC off), strip stowed — the common case; measure the strip
// default height first for the Q-20e before/after numbers.
let page = await boot({});
const stripDefault = await page.locator('.classic-bottom-strip').boundingBox();
await page.screenshot({ path: path.join(OUT, '01-default-taller-strip.png') });
await page.locator('.classic-stow-btn[data-classic-stow-field="bottom"]').click();
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT, '02-bottom-stowed.png') });
const tab = await page.locator('.classic-stow-tab[data-classic-stow-field="bottom"]').boundingBox();
console.log(JSON.stringify({ stripDefaultHeight: stripDefault?.height, bottomTab: tab }));
await page.close();

// 2: VPC on, strip stowed — Viewport-Control must keep its height.
page = await boot({ viewportControlVisible: true, consoleCollapsed: true });
await page.screenshot({ path: path.join(OUT, '03-bottom-stowed-vpc-kept.png') });
await page.close();

// 3: EVERYTHING stowed — the maximum 3D view.
page = await boot({
  consoleCollapsed: true, stowLeft: true, stowRightTop: true,
  viewportControlVisible: true, stowRightBottom: true,
});
await page.screenshot({ path: path.join(OUT, '04-everything-stowed.png') });
await page.close();

await browser.close();
console.log('done');
