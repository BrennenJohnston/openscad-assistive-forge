/**
 * A route map from two places, end to end: From the Husky Union Building,
 * To the Bill & Melinda Gates Center, Get map data, Make a route map. The
 * draft raises one route from door to door with the crossing and the flight
 * of steps on it, both buildings, nothing switched on beside the route, the
 * plate fitted to the walk, and the model renders with no warning.
 *
 * Nominatim and Overpass answer from the fixture of that walk (OpenStreetMap
 * contributors, ODbL).
 *
 * @license GPL-3.0-or-later
 */
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const WASM_READY_TIMEOUT = 180_000;
const PREVIEW_TIMEOUT = 120_000;
const OVERPASS = readFileSync(
  'tests/fixtures/tactile-map/uw-hub-gates.json',
  'utf8'
);
const HUB = {
  place_id: 1,
  lat: '47.6553685',
  lon: '-122.3051021',
  type: 'university',
  importance: 0.5,
  display_name:
    'Husky Union Building, 4001, East Stevens Way Northeast, Seattle, Washington, 98195, United States',
};
const GATES = {
  place_id: 2,
  lat: '47.652873',
  lon: '-122.3044814',
  type: 'university',
  importance: 0.5,
  display_name:
    'Bill & Melinda Gates Center, 3800, East Stevens Way Northeast, Seattle, Washington, 98195, United States',
};

function toSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)
        );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
const toLine = (p, pts) =>
  Math.min(...pts.slice(1).map((q, i) => toSegment(p, pts[i], q)));
const lengthOf = (pts) =>
  pts.reduce(
    (sum, p, i) =>
      i ? sum + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0,
    0
  );

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
  const answer = (body) => ({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body,
  });
  await page.route('https://nominatim.openstreetmap.org/search*', (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') || '';
    return route.fulfill(
      answer(JSON.stringify([/gates/i.test(q) ? GATES : HUB]))
    );
  });
  await page.route('https://overpass-api.de/api/interpreter', (route) =>
    route.fulfill(answer(OVERPASS))
  );
});

test('a route map from the Husky Union Building to the Bill & Melinda Gates Center: one route from door to door, the crossing and the steps on it, both buildings, nothing beside it, a fitted plate, no warning', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.goto('/?example=tactile-map');
  await expect(page.locator('#tactileMapPanel')).toBeVisible({
    timeout: 20000,
  });
  const notNow = page.locator('#saveProjectNotNow');
  try {
    await notNow.waitFor({ state: 'visible', timeout: 5000 });
    await notNow.click();
  } catch {
    // Prompt didn't appear
  }
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });

  const status = page.locator('#tactileMapAddressStatus');
  await page.locator('#tactileMapAddress').fill('Husky Union Building');
  await page.locator('#tactileMapSearch').click();
  await page.locator('#tactileMapPlace1').check();
  // Nominatim's policy: one search a second; the app refuses a faster one.
  await page.waitForTimeout(1100);
  await page.locator('#tactileMapTo').fill('Bill & Melinda Gates Center');
  await page.locator('#tactileMapToSearch').click();
  await page.locator('#tactileMapToPlace1').check();
  await page.locator('#tactileMapGetData').click();
  await expect(status).toHaveText(
    /^\d+ map features around Husky Union Building and Bill & Melinda Gates Center\.$/,
    { timeout: 30000 }
  );
  const draft = page.locator('#tactileMapDraft');
  await expect(draft).toHaveText('Make a route map');
  await draft.click();
  await expect(status).toHaveText(
    'Route map ready: a 244 m walk from Husky Union Building to Bill & Melinda Gates Center, 1 crossing and 1 flight of steps on the way. The map is 172 x 360 mm, fitted to the walk.',
    { timeout: 30000 }
  );
  const editor = page.locator('#drawingEditorSurface .drawing-editor');
  await expect(editor).toHaveAttribute('data-purpose', 'map', {
    timeout: 60000,
  });

  const plan = await page.evaluate(
    () => document.getElementById('tactileMapPanel').__forgeMapPanel.plan
  );
  const on = plan.features.filter((f) => f.on);
  const k = plan.meta.geo.mmPerM;
  expect(plan.size).toEqual({ w: 172, h: 360 });

  const routes = plan.features.filter((f) => f.class === 'route');
  expect(routes).toHaveLength(1);
  const route = routes[0].points;
  const metres = lengthOf(route) / k;
  expect(metres).toBeGreaterThanOrEqual(238);
  expect(metres).toBeLessThanOrEqual(250);

  const crossings = on.filter((f) => f.class === 'crossing');
  expect(crossings).toHaveLength(1);
  expect(
    Math.min(...crossings[0].points.map((p) => toLine(p, route)))
  ).toBeLessThan(1);
  const steps = on.filter((f) => f.class === 'stairs');
  expect(steps).toHaveLength(1);
  expect(toLine(steps[0].at, route)).toBeLessThan(1);

  const inside = ([x, y]) =>
    x >= 0 && x <= plan.size.w && y >= 0 && y <= plan.size.h;
  const buildings = on.filter((f) => f.class === 'area');
  expect(buildings.map((f) => f.name).sort()).toEqual([
    'Bill & Melinda Gates Center',
    'Husky Union Building',
  ]);
  for (const f of buildings) expect(f.ring.every(inside), f.name).toBe(true);

  // Side paths as stubs near the walk; curbs clear of it.
  for (const f of on.filter((g) => g.class === 'walkway')) {
    for (const p of f.points) {
      expect(toLine(p, route)).toBeLessThanOrEqual(15 * k + 0.5);
      expect(toLine(p, route)).toBeGreaterThanOrEqual(3 - 0.05);
    }
  }
  for (const f of on.filter((g) => g.class === 'curb')) {
    for (const p of f.points) {
      expect(toLine(p, route)).toBeGreaterThanOrEqual(3 - 0.05);
    }
  }
  await expect(page.locator('#tactileMapWarnings li')).toHaveCount(0);

  // The model takes the fitted size and renders with no warning.
  // Escape leaves the editor, and focus goes back to the button that opened it.
  await page.keyboard.press('Escape');
  await expect(draft).toBeFocused();
  await expect(page.locator('#param-map_width_mm-spinbox')).toHaveValue('172', {
    timeout: 10000,
  });
  await expect(page.locator('#param-map_height_mm-spinbox')).toHaveValue('360');
  // The preview holds the route map's model, not the sample's before it.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const g = window.previewManager?.mesh?.geometry;
          if (!g) return 0;
          g.computeBoundingBox();
          return Math.round(g.boundingBox.max.x - g.boundingBox.min.x);
        }),
      { timeout: PREVIEW_TIMEOUT }
    )
    .toBe(172);
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-current/,
    { timeout: PREVIEW_TIMEOUT }
  );
  await expect(page.locator('#echoDrawerLabel')).toHaveText(
    /^OpenSCAD Messages \(\d+ echo\)$/
  );
});
