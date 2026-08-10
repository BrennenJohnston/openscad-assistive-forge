// UF-2a mixed right-column cases: one right field stowed, the sibling stays.
import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE = process.argv[2] || 'http://localhost:5174';
const OUT = 'build\\uf2a-shots';
fs.mkdirSync(OUT, { recursive: true });

const FIXTURE = path.join(process.cwd(), 'tests', 'fixtures',
  'universal-cuff', 'universal_cuff_utensil_holder.scad');

const browser = await chromium.launch();

async function boot(panes) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
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

// Case A: lower-right stowed, Customizer stays — the tab must sit on the
// freed bottom row, over no control.
let page = await boot({ stowRightBottom: true });
const tabBox = await page.locator('.classic-stow-tab[data-classic-stow-field="right-bottom"]').boundingBox();
const paramBox = await page.locator('#paramPanel').boundingBox();
console.log(JSON.stringify({ caseA: { tabBox, paramBottom: paramBox ? paramBox.y + paramBox.height : null } }));
await page.screenshot({ path: path.join(OUT, '1400-caseA-lower-right-stowed.png') });
await page.close();

// Case B: upper-right stowed, Viewport-Control stays.
page = await boot({ stowRightTop: true });
await page.screenshot({ path: path.join(OUT, '1400-caseB-upper-right-stowed.png') });
await page.close();

await browser.close();
