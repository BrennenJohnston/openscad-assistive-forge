// UF-2a smoke probe: stow each side field, look at the result, check focus,
// announcements and persistence. Read-only against the dev server.
import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE = process.argv[2] || 'http://localhost:5174';
const OUT = 'build\\uf2a-probe';
fs.mkdirSync(OUT, { recursive: true });

const FIXTURE = path.join(process.cwd(), 'tests', 'fixtures',
  'universal-cuff', 'universal_cuff_utensil_holder.scad');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
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

const out = {};

// Count announcements arriving in the live region during each toggle.
await page.evaluate(() => {
  window.__announced = [];
  const region = document.getElementById('srAnnouncer');
  if (region) {
    new MutationObserver(() => {
      if (region.textContent.trim()) window.__announced.push(region.textContent.trim());
    }).observe(region, { childList: true, subtree: true, characterData: true });
  }
});

const previewBefore = await page.locator('.preview-panel').boundingBox();

// 1. Stow the left column
await page.locator('[aria-label="Stow the left column"]').click();
await page.waitForTimeout(600);
out.afterStowLeft = {
  bodyAttr: await page.evaluate(() => document.body.dataset.classicStowLeft),
  fieldOccupancy: await page.evaluate(() => document.body.dataset.classicFieldLeft),
  fieldDisplayed: await page.evaluate(() => {
    const f = document.querySelector('.classic-dock-field--left');
    return f ? getComputedStyle(f).display : null;
  }),
  focusedIsTab: await page.evaluate(() =>
    document.activeElement?.className?.includes?.('classic-stow-tab') || false),
  focusedName: await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
  focusableInField: await page.evaluate(() => {
    const f = document.querySelector('.classic-dock-field--left');
    if (!f) return null;
    return [...f.querySelectorAll('button, [tabindex], input, select, textarea, a[href]')]
      .filter((el) => el.offsetParent !== null).length;
  }),
  preview: await page.locator('.preview-panel').boundingBox(),
};
await page.screenshot({ path: path.join(OUT, '01-left-stowed.png') });

// 2. Stow both right fields
await page.locator('[aria-label="Stow the upper right"]').click();
await page.waitForTimeout(400);
await page.locator('[aria-label="Stow the lower right"]').click();
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(OUT, '02-all-side-stowed.png') });
out.allStowed = {
  preview: await page.locator('.preview-panel').boundingBox(),
  rightRailTabs: await page.evaluate(() =>
    [...document.querySelectorAll('#classicStowRailRight .classic-stow-tab')]
      .map((t) => t.getAttribute('aria-label'))),
  leftRailTabs: await page.evaluate(() =>
    [...document.querySelectorAll('#classicStowRailLeft .classic-stow-tab')]
      .map((t) => t.getAttribute('aria-label'))),
  panes: await page.evaluate(() =>
    JSON.parse(localStorage.getItem('openscad-forge-classic-panes'))),
};

// 3. Restore the left column from its tab
await page.locator('#classicStowRailLeft .classic-stow-tab').click();
await page.waitForTimeout(600);
out.afterRestoreLeft = {
  fieldOccupancy: await page.evaluate(() => document.body.dataset.classicFieldLeft),
  focusedName: await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
  announced: await page.evaluate(() => window.__announced),
};
await page.screenshot({ path: path.join(OUT, '03-left-restored.png') });

out.previewBefore = previewBefore;
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
