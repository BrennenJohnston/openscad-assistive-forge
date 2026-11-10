/**
 * A place map of 3600 Ferry Pl NE from the chooser to the zip, by keyboard,
 * with an accessibility scan at each step: the places named in the editor,
 * what each detail level turns on, the University of Oregon symbols in the
 * key and the README, and the key's plates with their label tape.
 *
 * The address search is routed and the map tiles come from the fixtures
 * (OpenStreetMap contributors, ODbL), so every count here is exact.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { parseSTL } from '../../scripts/parity/stl-stats.mjs';
import {
  routeMapServices,
  openChooser,
  tabTo,
  axeClean,
  chooseByKeyboard,
  nextStep,
  searchByKeyboard,
} from './helpers/map-keyboard.js';

const FERRY = {
  place_id: 1,
  lat: '47.6481285',
  lon: '-122.3086726',
  type: 'building',
  importance: 0.5,
  display_name:
    'Center on Human Development and Disability South, 3600, Ferry Place Northeast, Seattle, Washington, 98195, United States',
};

/**
 * Press Make the map from where focus is; the editor opens on the draft and
 * takes focus. A closed editor stays in the page, so focus is what says this
 * one is open.
 */
async function makeTheMap(page) {
  await tabTo(page, '#tactileMapMake');
  await page.keyboard.press('Enter');
  await expect(
    page.locator('#drawingEditorSurface .drawing-editor').first()
  ).toHaveAttribute('data-purpose', 'map', { timeout: 60000 });
  await expect(page.locator('#drawingEditorSurface :focus')).toHaveCount(1, {
    timeout: 60000,
  });
}

/** Escape the editor; focus comes back to Make the map. */
async function closeTheEditor(page) {
  await page.keyboard.press('Escape');
  await expect(page.locator('#tactileMapMake')).toBeFocused();
}

/** The Ferry Place draft open in the editor, by keyboard, the services stubbed. */
async function openFerryDraft(page) {
  await routeMapServices(page);
  await page.route('https://nominatim.openstreetmap.org/search*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify([FERRY]),
    })
  );
  await openChooser(page);
  await chooseByKeyboard(page, 'A place map');
  await searchByKeyboard(page, '#tactileMapAddress', '3600 Ferry Pl NE');
  const first = page.locator('#tactileMapResults input[type="radio"]').first();
  await expect(first).toBeFocused({ timeout: 15000 });
  await page.keyboard.press('Space');
  await expect(first).toBeChecked();
  await nextStep(page, 2, 'How much ground');
  await nextStep(page, 3, 'What to show');
  await nextStep(page, 4, 'Make the map');
  await makeTheMap(page);
}

/** A mark's region on the editor's canvas, by its row's name. */
async function markRegion(page, name) {
  const rows = await page
    .locator('#drawingEditorSurface .svg-prep-object-name')
    .allTextContents();
  const index = rows.indexOf(name);
  expect(index, `${name} has a row`).toBeGreaterThanOrEqual(0);
  return page.locator(
    `#drawingEditorSurface [data-layer="regions"] [data-region="${index}"]`
  );
}

const MOVED_TO = /to ([\d.]+), ([\d.]+) mm/;
const placeOf = async (status) =>
  (await status.textContent()).match(MOVED_TO).slice(1, 3).map(Number);

test.describe('a place map at 3600 Ferry Pl NE', () => {
  test('from the chooser to the zip by keyboard: the names in the editor, the levels and their counts, the Oregon symbols in the key, the key plates and their tape', async ({
    page,
  }) => {
    test.setTimeout(600_000);
    await routeMapServices(page);
    await page.route('https://nominatim.openstreetmap.org/search*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify([FERRY]),
      })
    );
    const status = page.locator('#tactileMapAddressStatus');

    await openChooser(page);
    await chooseByKeyboard(page, 'A place map');
    await axeClean(page, 'step 1');
    await searchByKeyboard(page, '#tactileMapAddress', '3600 Ferry Pl NE');
    const first = page
      .locator('#tactileMapResults input[type="radio"]')
      .first();
    await expect(first).toBeFocused({ timeout: 15000 });
    await page.keyboard.press('Space');
    await expect(first).toBeChecked();

    await nextStep(page, 2, 'How much ground');
    await axeClean(page, 'step 2');
    await nextStep(page, 3, 'What to show');
    await axeClean(page, 'step 3');
    await expect(page.locator('#tactileMapDetail-named')).toBeChecked();
    await expect(
      page.locator('#tactileMapSymbolSet-forge-basic')
    ).toBeChecked();
    await nextStep(page, 4, 'Make the map');
    await axeClean(page, 'step 4');

    // The first draft: the places are named, and most of the data starts off.
    // Every named area and point carries a number, and a place with no room
    // for its name is no warning: its number carries it. The two warnings are
    // symbols closer than the gap; the margin's numbers keep the north arrow
    // beyond every symbol, so none moves for it.
    await makeTheMap(page);
    await expect(status).toHaveText(
      'Draft map ready: 19 of 286 features on; 2 warnings. Choose what stays. The key has 5 symbols and 15 numbered places.'
    );
    const rows = await page
      .locator('#drawingEditorSurface .svg-prep-object-name')
      .allTextContents();
    expect(rows).toHaveLength(286);
    // The rows read with the number first, the address's own building 1.
    expect(rows).toContain(
      '1 Building: Center on Human Development and Disability South'
    );
    const row = (pattern) => rows.some((name) => pattern.test(name));
    expect(row(/^\d+ Restaurant: Plaza Cafe$/)).toBe(true);
    expect(row(/^\d+ Cafe: Lobby Espresso$/)).toBe(true);
    expect(row(/^\d+ Bus stop 29405/)).toBe(true);
    await closeTheEditor(page);

    // Back in step 3 with the data here, the line says what each level turns on.
    await tabTo(page, '#tactileMapSteps-back');
    await page.keyboard.press('Enter');
    await expect(page.locator('#tactileMapSteps-heading')).toHaveText(
      'Step 3 of 5: What to show'
    );
    const line = page.locator('#tactileMapDetailCount');
    await expect(line).toHaveText('19 features on, 5 different symbols.');
    await tabTo(page, '#tactileMapDetail-named');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#tactileMapDetail-buildings')).toBeChecked();
    await expect(line).toHaveText('171 features on, 9 different symbols.', {
      timeout: 15000,
    });
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#tactileMapDetail-everything')).toBeChecked();
    await expect(line).toHaveText(/^285 features on, /, { timeout: 15000 });
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#tactileMapDetail-named')).toBeChecked();
    await expect(line).toHaveText('19 features on, 5 different symbols.', {
      timeout: 15000,
    });

    // The Oregon symbols, chosen by keyboard and said once.
    await tabTo(page, '#tactileMapSymbolSet-forge-basic');
    await page.keyboard.press('ArrowDown');
    await expect(
      page.locator('#tactileMapSymbolSet-oregon-2012')
    ).toBeChecked();
    await expect(status).toHaveText('Symbols: University of Oregon symbols.');
    await axeClean(page, 'step 3 with the set chosen');
    await nextStep(page, 4, 'Make the map');

    await makeTheMap(page);
    // The ready sentence waits for the braille translator, so the count of
    // warnings is taken with the labels measured in contracted UEB; no symbol
    // moves for the north arrow beyond the numbers' margin.
    await expect(status).toHaveText(
      'Draft map ready: 19 of 286 features on; 2 warnings. Choose what stays. The key has 5 symbols and 15 numbered places.'
    );
    await closeTheEditor(page);

    await nextStep(page, 5, 'Check and print');
    await axeClean(page, 'step 5');
    // A place map starts trimmed: the shapes at Ferry Place sit in a box well
    // inside the 480 x 360 face. Its band is 10 mm, wider at the sides whose
    // numbers stand there (braille wedges to start), and the sheet cuts into
    // four plates. Off, the whole face in its band cuts into six. The key is
    // a piece a row: its title, its five kinds and the fifteen places; on
    // wedges a name too long for one wedge goes on to a piece of its own (six
    // here).
    const trim = page.locator('#tactileMapTrim');
    await expect(trim).toBeChecked();
    await expect(page.locator('#tactileMapSummary')).toHaveText(
      '4 plates of 202.5 x 128 mm, A1 to B2. The key takes 27 plates.'
    );
    await trim.uncheck();
    await expect(page.locator('#tactileMapSummary')).toHaveText(
      '6 plates of 181.3 x 198 mm, A1 to B3. The key takes 27 plates.'
    );
    await trim.check();
    await expect(page.locator('#tactileMapSummary')).toHaveText(
      '4 plates of 202.5 x 128 mm, A1 to B2. The key takes 27 plates.'
    );
    // The key follows Labels, braille wedges to start.
    await expect(page.locator('#tactileMapLabels')).toHaveValue('wedge');
    const key = await page.evaluate(() => {
      const p = document.getElementById('tactileMapPanel').__forgeMapPanel;
      const k = p.labeled().key;
      return {
        set: k.set.name,
        entries: k.entries.map((e) => `${e.name}: ${e.shape}`),
        plates: p.keyPages.map((plate) => plate.id),
        first: p.keyPages[0].size,
      };
    });
    expect(key.set).toBe('University of Oregon symbols');
    // The destination first, its cone kept in every set; You are here is off
    // until the person places it, so it has no row yet.
    expect(key.entries).toEqual([
      'Destination, 3600 Ferry Pl NE: a cone 4.9 mm across and 4.9 mm tall, flat at the top',
      'Transit stop: Challenging feature, 13 mm',
      'Landmark: Flexible feature, 13 mm',
      'Walkway: a dashed line 1.2 mm wide, low',
      'Area: a raised area, low',
    ]);
    expect(key.plates).toEqual(
      Array.from({ length: 27 }, (_, i) => `key-${i + 1}`)
    );

    // Braille label tape, chosen by keyboard: its pieces are channels, quick
    // to render, and the README lists the tape to write.
    await tabTo(page, '#tactileMapLabels', 80);
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#tactileMapLabels')).toHaveValue('tape');
    await expect(page.locator('#tactileMapTapeGrade')).toHaveValue('g1');
    await expect(page.locator('#tactileMapTapeNote')).toHaveText(
      /^Label tape: uncontracted braille \(Grade 1\)\. /,
      { timeout: 30000 }
    );
    const summary = (
      await page.locator('#tactileMapSummary').textContent()
    ).trim();
    const pieces = await page.evaluate(() =>
      document
        .getElementById('tactileMapPanel')
        .__forgeMapPanel.keyPages.map((p) => ({ id: p.id, size: p.size }))
    );
    expect(pieces).toHaveLength(21);

    // The zip: the map's plates, the key's pieces, and the README.
    const downloadPromise = page.waitForEvent('download', { timeout: 420_000 });
    await tabTo(page, '#tactileMapRenderAll', 80);
    await page.keyboard.press('Enter');
    const download = await downloadPromise;
    const zip = await JSZip.loadAsync(readFileSync(await download.path()));
    const names = Object.keys(zip.files);
    for (const id of ['A1', 'A2', 'B1', 'B2', ...pieces.map((p) => p.id)]) {
      expect(names).toContain(`tactile_map_${id}.stl`);
      expect(names).toContain(`levels_${id}.svg`);
    }
    expect(names).not.toContain('tactile_map_B3.stl');
    const readme = await zip.file('README.txt').async('string');
    expect(summary).toBe(
      '4 plates of 218.5 x 128 mm, A1 to B2. The key takes 21 plates.'
    );
    expect(readme).toContain(
      'each 218.5 x 128 mm, trimmed to the shapes with a 10 mm margin, wider at the sides that hold numbers. Print one of each: A1, A2, B1, B2.'
    );
    expect(readme).toContain('\nKey\nSymbols: University of Oregon symbols.\n');
    expect(readme).toContain(
      'Symbols: Lobben and Lawrence 2012, University of Oregon, GPL-3'
    );
    // The tape measured by the translator, uncontracted to start.
    expect(readme).toMatch(
      /Label tape: uncontracted braille \(Grade 1\)\. \d+ labels?, \d+ cells, about \d+ mm of 12\.7 mm tape; contracted would take \d+ labels?, about \d+ mm\./
    );
    expect(readme).not.toContain('sized by an estimate');
    // Each place's number on the map, a label of its own with its braille.
    expect(readme).toMatch(/- #10 \([⠀-⣿]+, 3 cells, 26\.6 mm\): /);
    // Each key piece's tape, its number then its name.
    expect(readme).toContain('Key 1 plate, label tape top to bottom:');
    expect(readme.replace(/\n- /g, ' ')).toMatch(
      /#10 restaurant: plaza cafe\b/
    );
    expect(readme).not.toMatch(/Abbreviations/);
    // The map's labels in number order, wherever each number stands.
    const listed = [...readme.matchAll(/^- #(\d+) \(/gm)].map((m) =>
      Number(m[1])
    );
    expect(listed).toEqual(listed.map((_, i) => i + 1));

    // A key piece is the size of its row, its channels cut for the tape.
    const levels = await zip.file('levels_key-1.svg').async('string');
    expect(levels).toMatch(/<g id="channels"><path d="[^"]+"\/><\/g>/);
    const { triangles } = parseSTL(
      await zip.file('tactile_map_key-1.stl').async('uint8array')
    );
    const size = [0, 1].map((axis) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = axis; i < triangles.length; i += 3) {
        lo = Math.min(lo, triangles[i]);
        hi = Math.max(hi, triangles[i]);
      }
      return hi - lo;
    });
    expect(size[0]).toBeCloseTo(pieces[0].size.w, 1);
    expect(size[1]).toBeCloseTo(pieces[0].size.h, 1);
    expect(pieces[0].size.h).toBeLessThan(75);
    await expect(page.locator('#tactileMapRenderStatus')).toHaveText(
      'All 25 plates are in tactile_map_plates.zip.'
    );
  });

  test('the cone is dragged with the mouse, You are here placed and carried by keyboard, and the plan and the model rows follow', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openFerryDraft(page);
    const editor = page.locator('#drawingEditorSurface');
    const status = editor.locator('.drawing-editor-status');

    // The cone, dragged 60 px right and 30 px down.
    const cone = await markRegion(page, '3600 Ferry Pl NE');
    await expect(cone).toHaveAttribute('data-movable', 'true');
    const box = await cone.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 30, cy + 15, { steps: 4 });
    await page.mouse.move(cx + 60, cy + 30, { steps: 4 });
    await page.mouse.up();
    await expect(status).toHaveText(
      /^3600 Ferry Pl NE moved to [\d.]+, [\d.]+ mm\.$/
    );
    const moved = await placeOf(status);
    expect(moved[0]).toBeGreaterThan(240);
    expect(moved[1]).toBeGreaterThan(180);

    // You are here: placed by the button, then carried 2 mm right by keyboard.
    await editor.getByRole('button', { name: 'Place You are here' }).click();
    await expect(status).toHaveText(
      /^You are here placed at [\d.]+, [\d.]+ mm\./
    );
    await editor.locator('.drawing-editor-canvas-svg').focus();
    await page.keyboard.press('Space');
    await expect(status).toHaveText(/^You are here picked up\./);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(status).toHaveText(/^You are here at [\d.]+, [\d.]+ mm\.$/);
    await page.keyboard.press('Space');
    await expect(status).toHaveText(
      /^You are here moved to [\d.]+, [\d.]+ mm\.$/
    );
    const placed = await placeOf(status);
    await axeClean(page, 'the editor with the marks');

    // Apply: the plan holds both; the model's cone row names the cone's place.
    await editor.getByRole('button', { name: 'Apply classes' }).click();
    await expect(page.locator('#tactileMapMake')).toBeFocused({
      timeout: 30000,
    });
    const plan = await page.evaluate(() => {
      const p = document.getElementById('tactileMapPanel').__forgeMapPanel.plan;
      const f = (id) => p.features.find((x) => x.id === id);
      return {
        cone: f('destination').at,
        here: { on: f('you-are-here').on, at: f('you-are-here').at },
      };
    });
    expect(plan.cone).toEqual(moved);
    expect(plan.here).toEqual({ on: true, at: placed });
    // The model's row is in the sheet's frame: the face's point less the
    // trim's offset plus the band, y up from the sheet's bottom (the panel
    // holds the sheet and the trim it last built).
    await expect
      .poll(() =>
        page.evaluate(([mx, my]) => {
          const p = document.getElementById('tactileMapPanel').__forgeMapPanel;
          const [ax, ay] = p.sheet.faceAt;
          const [ox, oy] = p.view.offset;
          const want = `${Math.round((mx + ax - ox) * 10)}:${Math.round((p.sheet.h - (my + ay - oy)) * 10)}`;
          const got = window.stateManager.getState().parameters.cone_marks;
          return got === want ? 'match' : `${got} is not ${want}`;
        }, moved)
      )
      .toBe('match');
  });

  test('the picture pans by a drag on empty ground, by Shift with the arrows, by the arrows in the Hand tool, and by four buttons of 44 px', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openFerryDraft(page);
    const editor = page.locator('#drawingEditorSurface');
    const svg = editor.locator('.drawing-editor-canvas-svg');
    const viewBox = () => svg.getAttribute('viewBox');
    // The shapes drawn and the view fitted to them, before any move.
    await expect(
      editor.locator('[data-layer="regions"] path').first()
    ).toBeAttached();
    const before = await viewBox();
    // Empty ground near the canvas's top left corner: a drag there pans
    // under the Select tool, the tool the editor opens with. A shape's edge
    // can stand at the corner itself at some fits, so the first spot from
    // the corner inward with nothing drawn under it is the one taken.
    await expect(svg).toHaveAttribute('data-tool', 'select');
    const box = await svg.boundingBox();
    const start = await svg.evaluate(
      (el, b) => {
        const drawn =
          '[data-layer="regions"], [data-layer="edges"], [data-layer="plate"], [data-layer="art"]';
        for (let d = 20; d < 200; d += 10) {
          for (const [x, y] of [
            [d, d],
            [d, 20],
            [20, d],
          ]) {
            const hit = document.elementFromPoint(b.x + x, b.y + y);
            if (hit && hit.closest('svg') === el && !hit.closest(drawn))
              return [x, y];
          }
        }
        return [20, 20];
      },
      { x: box.x, y: box.y }
    );
    await page.mouse.move(box.x + start[0], box.y + start[1]);
    await page.mouse.down();
    // The picture travels with the hand at every step, and never flashes back.
    const seen = [];
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(
        box.x + start[0] + i * 5,
        box.y + start[1] + i * 2.5
      );
      seen.push(Number((await viewBox()).split(/[\s,]+/)[0]));
    }
    await page.mouse.up();
    const steps = seen.slice(1).map((x, i) => x - seen[i]);
    for (const step of steps) {
      expect(step).toBeLessThan(0);
      expect(step).toBeCloseTo(steps[0], 3);
    }
    const afterDrag = await viewBox();
    expect(afterDrag).not.toBe(before);
    await expect(svg).toHaveAttribute('data-tool', 'select');

    // Shift with an arrow pans; the bare arrow walks the shapes instead.
    await svg.focus();
    await page.keyboard.press('Shift+ArrowRight');
    const afterKey = await viewBox();
    expect(afterKey).not.toBe(afterDrag);
    await page.keyboard.press('ArrowRight');
    expect(await viewBox()).toBe(afterKey);
    await expect(editor.locator('.drawing-editor-status')).toHaveText(/, /);

    // In the Hand tool the bare arrow pans too.
    await editor.locator('.drawing-editor-tool[data-tool="hand"]').click();
    await svg.focus();
    await page.keyboard.press('ArrowLeft');
    expect(await viewBox()).not.toBe(afterKey);

    // The four buttons beside Fit, + and -, each the app's touch target:
    // 44 px where a finger points (the phone case below), 36 px with a
    // mouse, the desktop value of the token every button here takes.
    await editor.getByRole('button', { name: 'Fit' }).click();
    const fitted = await viewBox();
    for (const name of ['Pan left', 'Pan up', 'Pan down', 'Pan right']) {
      const b = editor.getByRole('button', { name });
      await expect(b).toBeVisible();
      const bb = await b.boundingBox();
      expect(bb.width, `${name} wide enough`).toBeGreaterThanOrEqual(36);
      expect(bb.height, `${name} tall enough`).toBeGreaterThanOrEqual(36);
      await expect(b).toHaveAttribute('aria-label', name);
    }
    await editor.getByRole('button', { name: 'Pan right' }).click();
    expect(await viewBox()).not.toBe(fitted);
    await editor.getByRole('button', { name: 'Pan left' }).click();
    expect(await viewBox()).toBe(fitted);
    await axeClean(page, 'the editor with the pan buttons');
  });
});

test.describe('the marks on a phone', () => {
  // No isMobile: Firefox rejects it when the browser context is created.
  // A touch screen alone makes the page a phone's: hover none, pointer
  // coarse (MEASURED in Chromium and Firefox).
  test.use({
    viewport: { width: 412, height: 915 },
    hasTouch: true,
  });

  /** The Ferry Place draft open in the editor on a phone, by taps. */
  async function openFerryDraftOnPhone(page) {
    await routeMapServices(page);
    await page.route('https://nominatim.openstreetmap.org/search*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify([FERRY]),
      })
    );
    // On a phone the panel is a drawer: open it to reach the chooser.
    await page.goto('/?example=tactile-map');
    const notNow = page.locator('#saveProjectNotNow');
    try {
      await notNow.waitFor({ state: 'visible', timeout: 6000 });
      await notNow.click();
      await notNow.waitFor({ state: 'hidden', timeout: 5000 });
    } catch {
      // The prompt did not appear.
    }
    const toggle = page.locator('#mobileDrawerToggle');
    await expect(toggle).toBeVisible({ timeout: 30000 });
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.click();
    }
    await expect(page.locator('#tactileMapChooser')).toBeVisible({
      timeout: 30000,
    });
    await chooseByKeyboard(page, 'A place map');
    await page.locator('#tactileMapAddress').fill('3600 Ferry Pl NE');
    await page.locator('#tactileMapSearch').click();
    const first = page
      .locator('#tactileMapResults input[type="radio"]')
      .first();
    await first.check({ timeout: 15000 });
    for (const n of [2, 3, 4]) {
      await page.locator('#tactileMapSteps-next').click();
      await expect(page.locator('#tactileMapSteps-heading')).toHaveText(
        new RegExp(`^Step ${n} of 5`)
      );
    }
    await page.locator('#tactileMapMake').click();
    await expect(
      page.locator('#drawingEditorSurface .drawing-editor').first()
    ).toHaveAttribute('data-purpose', 'map', { timeout: 60000 });
  }

  /** A finger's drag, as the browser sends it. */
  async function touchDrag(page, from, to) {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, x, y) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
      });
    await touch('touchStart', from[0], from[1]);
    await touch('touchMove', (from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
    await touch('touchMove', to[0], to[1]);
    await touch('touchEnd', 0, 0);
  }

  /** A finger's tap, as the browser sends it: down and up in one place. */
  async function touchTap(page, x, y) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  }

  // A finger's touch is sent through CDP, which only Chromium has.
  test('the cone is dragged by touch', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'a touch through CDP, Chromium only');
    test.setTimeout(240_000);
    await openFerryDraftOnPhone(page);
    const editor = page.locator('#drawingEditorSurface');
    const status = editor.locator('.drawing-editor-status');
    const cone = await markRegion(page, '3600 Ferry Pl NE');
    await cone.scrollIntoViewIfNeeded();
    const box = await cone.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await touchDrag(page, [cx, cy], [cx + 40, cy + 20]);
    await expect(status).toHaveText(
      /^3600 Ferry Pl NE moved to [\d.]+, [\d.]+ mm\.$/
    );
    const moved = await placeOf(status);
    expect(moved[0]).toBeGreaterThan(240);
    expect(moved[1]).toBeGreaterThan(180);
  });

  test('a finger on empty ground pans the picture, and the pan buttons stand in the view row', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'a touch through CDP, Chromium only');
    test.setTimeout(240_000);
    await openFerryDraftOnPhone(page);
    const editor = page.locator('#drawingEditorSurface');
    const svg = editor.locator('.drawing-editor-canvas-svg');
    // The shapes drawn and the view fitted to them, before any move.
    await expect(
      editor.locator('[data-layer="regions"] path').first()
    ).toBeAttached();
    const before = await svg.getAttribute('viewBox');
    // The button first, by a finger: 44 px and a tenth of the view.
    const right = editor.getByRole('button', { name: 'Pan right' });
    await right.scrollIntoViewIfNeeded();
    await expect(right).toBeInViewport();
    const bb = await right.boundingBox();
    expect(bb.width).toBeGreaterThanOrEqual(44);
    expect(bb.height).toBeGreaterThanOrEqual(44);
    await touchTap(page, bb.x + bb.width / 2, bb.y + bb.height / 2);
    await expect.poll(() => svg.getAttribute('viewBox')).not.toBe(before);
    const afterTap = await svg.getAttribute('viewBox');
    // Then a finger on empty ground drags the picture.
    await svg.scrollIntoViewIfNeeded();
    const box = await svg.boundingBox();
    await touchDrag(page, [box.x + 20, box.y + 20], [box.x + 80, box.y + 60]);
    await expect.poll(() => svg.getAttribute('viewBox')).not.toBe(afterTap);
    await expect(svg).toHaveAttribute('data-tool', 'select');
  });
});
