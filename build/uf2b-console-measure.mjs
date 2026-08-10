// Q-20e after-measurement: the Console log area at the new default height.
import { chromium } from '@playwright/test';
import path from 'path';

const BASE = process.argv[2] || 'http://localhost:5174';
const FIXTURE = path.join(process.cwd(), 'tests', 'fixtures',
  'universal-cuff', 'universal_cuff_utensil_holder.scad');

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
await p.addInitScript(() => {
  localStorage.setItem('openscad-forge-first-visit-seen', 'true');
  localStorage.setItem('openscad-forge-classic-panes', JSON.stringify({
    editorVisible: true, customizerVisible: true, consoleCollapsed: false,
    animateVisible: false, fontListVisible: false, viewportControlVisible: true,
  }));
});
await p.goto(BASE);
await p.waitForSelector('body[data-wasm-ready="true"]', { state: 'attached', timeout: 180_000 });
await p.locator('#fileInput').setInputFiles(FIXTURE);
await p.locator('#welcomeScreen').waitFor({ state: 'hidden', timeout: 30_000 });
try {
  const n = p.locator('#saveProjectNotNow');
  await n.waitFor({ state: 'visible', timeout: 3_000 });
  await n.click();
} catch {}
await p.locator('#classicModeToggle').click();
await p.waitForSelector('body[data-ui-mode="classic"]', { timeout: 10_000 });
const d = p.locator('#classicDensityToggle');
await d.waitFor({ state: 'visible', timeout: 10_000 });
if ((await d.getAttribute('aria-checked')) !== 'true') await d.click();
await p.waitForTimeout(3_000);

const out = await p.evaluate(() => {
  const rect = (el) => el?.getBoundingClientRect() ?? null;
  const pane = document.querySelector('.classic-console-slot');
  const log = document.getElementById('console-output');
  const paneR = rect(pane);
  const logR = rect(log);
  const lh = log ? parseFloat(getComputedStyle(log).lineHeight) : null;
  const visibleLog = paneR && logR
    ? Math.max(0, Math.min(paneR.bottom, logR.bottom) - Math.max(paneR.top, logR.top))
    : null;
  return {
    paneHeight: paneR?.height,
    visibleLogWindow: visibleLog,
    lineHeight: lh,
    approxVisibleLines: visibleLog && lh ? Math.floor(visibleLog / lh) : null,
  };
});
console.log(JSON.stringify(out, null, 2));
await b.close();
