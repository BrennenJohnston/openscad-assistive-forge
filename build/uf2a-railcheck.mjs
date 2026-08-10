import { chromium } from '@playwright/test';

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
await p.addInitScript(() => {
  localStorage.setItem('openscad-forge-first-visit-seen', 'true');
  localStorage.setItem('openscad-forge-classic-panes', JSON.stringify({
    editorVisible: true, customizerVisible: true, consoleCollapsed: false,
    animateVisible: false, fontListVisible: false, viewportControlVisible: true,
    stowRightBottom: true,
  }));
});
await p.goto('http://localhost:5174');
await p.waitForSelector('body[data-wasm-ready="true"]', { state: 'attached', timeout: 180_000 });
await p.locator('#fileInput').setInputFiles('tests/fixtures/sample.scad');
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
await p.waitForTimeout(2_000);

const r = await p.evaluate(() => {
  const rail = document.getElementById('classicStowRailRight');
  const tab = rail?.querySelector('.classic-stow-tab');
  const cs = rail ? getComputedStyle(rail) : null;
  const ts = tab ? getComputedStyle(tab) : null;
  const rect = (el) => {
    if (!el) return null;
    const q = el.getBoundingClientRect();
    return { x: q.x, y: q.y, w: q.width, h: q.height };
  };
  return {
    railRect: rect(rail),
    railTop: cs?.top,
    railBottom: cs?.bottom,
    railPointerEvents: cs?.pointerEvents,
    railPosition: cs?.position,
    tabMarginTop: ts?.marginTop,
    tabField: tab?.dataset.classicStowField,
    tabRect: rect(tab),
    mainInterfacePosition: getComputedStyle(
      document.querySelector('.main-interface')
    ).position,
  };
});
console.log(JSON.stringify(r, null, 2));
await b.close();
