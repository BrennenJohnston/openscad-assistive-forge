// UF-2a phase screenshots: the stow at 1400/1024, the mobile guard at 768/375.
import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE = process.argv[2] || 'http://localhost:5174';
const OUT = 'build\\uf2a-shots';
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
    animateVisible: false, fontListVisible: false, viewportControlVisible: true,
    ...panes,
  }]);
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
  return page;
}

// 1400: left + lower-right stowed (a working arrangement, not everything gone)
let page = await boot({ width: 1400, height: 900 }, { stowLeft: true, stowRightBottom: true });
await page.screenshot({ path: path.join(OUT, '1400-left-and-lower-right-stowed.png') });
await page.close();

// 1024: the narrowest desktop; all three stowed = the maximum 3D view
page = await boot({ width: 1024, height: 768 }, { stowLeft: true, stowRightTop: true, stowRightBottom: true });
await page.screenshot({ path: path.join(OUT, '1024-all-stowed.png') });
await page.close();

// 768 and 375: stowed preferences must hide NOTHING (the UF-2c guard)
page = await boot({ width: 768, height: 900 }, { stowLeft: true, stowRightTop: true });
await page.screenshot({ path: path.join(OUT, '768-guard-nothing-hidden.png') });
await page.close();

page = await boot({ width: 375, height: 812 }, { stowLeft: true, stowRightTop: true });
await page.evaluate(() => {
  document.querySelector('.classic-dock-field--left')?.scrollIntoView({ block: 'start' });
});
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT, '375-guard-editor-reachable.png') });
await page.close();

await browser.close();
console.log('done');
