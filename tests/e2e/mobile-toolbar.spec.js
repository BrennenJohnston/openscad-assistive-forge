import { test, expect } from '@playwright/test';
import path from 'path';
import { skipWithoutWebGL } from './helpers/webgl.js';

// A header that earns its rows.
//
// At 412px with a project open, four stacked rows before any content would
// cost 147px in Simplified and 187px in Standard, one of them a 54px band
// holding four 44px icons in a 396px width. Instead those four controls
// join the Customizer row, which has the space once its visible heading
// stands down, and the row they would have used collapses.
//
// On mobile the preview status line sits at the top of the preview, where
// it is readable in both camera-pad states.
//
// What is asserted is the structure (the four icons' row is gone and they
// are in the Customizer row) plus a ceiling at the four-row cost, with the
// measurements in the messages. The px totals are deliberately not
// asserted exactly: the header row wraps rather than clips when a
// platform's fonts need more width than 412px allows (see layout.css), so
// its height is font-dependent by design, and a lane with wider glyphs
// must fail here on a lost row and not on a font.

const FIXTURE = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
const WASM_READY_TIMEOUT = 180_000;

// A 1080x2520 phone at DPR ~2.62 leaves about 810 CSS px once the address
// bar, status bar and gesture nav are counted, so both heights are
// exercised: 915 is what emulation defaults to, 810 is what a phone
// actually has.
const HEIGHTS = [915, 810];

// What Chromium measures, and the ceiling: what four stacked rows cost.
// Measured again with the Customizer button in the settings row and Main Page
// twice a button wide: the same 93 and 135.
const TOP_CHROME = { simplified: 93, standard: 135 };
const BASE_TOP_CHROME = { simplified: 147, standard: 187 };
const QUARTET = [
  '#contrastToggle',
  '#themeToggle',
  '#focusModeBtn',
  '#featuresGuideBtn',
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
});

async function loadSampleProject(page) {
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  await page.locator('#fileInput').setInputFiles(FIXTURE);
  await expect(page.locator('#welcomeScreen')).toBeHidden({ timeout: 60_000 });
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 20_000 });
  const notNow = page.locator('#saveProjectNotNow');
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3_000 });
    await notNow.click();
  } catch {
    // Save-project modal did not appear; nothing to dismiss.
  }
}

async function switchToStandard(page) {
  const toggle = page.locator('#uiModeToggle');
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  }
}

/** Bottom of the deepest visible bar above the content. */
const topChrome = (page) =>
  page.evaluate(() =>
    ['.app-header', '#workflowProgress', '.preview-drawer-header']
      .map((s) => document.querySelector(s))
      .filter((el) => el && getComputedStyle(el).display !== 'none')
      .reduce(
        (lowest, el) => Math.max(lowest, el.getBoundingClientRect().bottom),
        0
      )
  );

for (const height of HEIGHTS) {
  test.describe(`The top chrome's px budget (412x${height})`, () => {
    test.use({ viewport: { width: 412, height } });

    test(`toolbar-budget: Simplified spends ${TOP_CHROME.simplified}px and Standard ${TOP_CHROME.standard}px before any content`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await loadSampleProject(page);

      // Do not assert a measurement as a promise. The header row wraps rather
      // than clips when a platform's fonts need more width than 412px allows
      // (see layout.css), so its height is font-dependent, and a lane with 2px
      // wider glyphs would fail here on a font rather than on a lost row.
      //
      // What is promised is the structure: the four icons' row is gone, they
      // are in the Customizer row, and the top chrome costs less than the
      // 147px / 187px of four stacked rows. Chromium measures 93 and 135; those
      // numbers are the record, and the ceiling is the promise.
      const simplified = await topChrome(page);
      expect(
        simplified,
        `Simplified: header + Customizer row and nothing between them (was 147px, Chromium measures 93px, got ${simplified})`
      ).toBeLessThan(BASE_TOP_CHROME.simplified);
      expect(
        await page.evaluate(
          () =>
            getComputedStyle(document.getElementById('workflowProgress'))
              .display
        ),
        'the row the four icons left has collapsed'
      ).toBe('none');

      await switchToStandard(page);
      const standard = await topChrome(page);
      expect(
        standard,
        `Standard: the menu bar keeps its own row, the action icons do not (was 187px, Chromium measures 135px, got ${standard})`
      ).toBeLessThan(BASE_TOP_CHROME.standard);
      expect(
        await page.locator('#toolbarMenuBar').isVisible(),
        'Standard keeps its menu bar'
      ).toBe(true);
      expect(
        await page.evaluate(() =>
          document
            .querySelector('.workflow-actions')
            .closest('#workflowProgress')
        ),
        'and the action icons are not in it'
      ).toBeNull();
    });

    test('toolbar-fits: nothing in the top chrome runs off the screen or sits on a neighbour', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await loadSampleProject(page);
      await switchToStandard(page);

      const geometry = await page.evaluate(() => {
        const controls = [];
        const selector =
          '.app-header button, .app-header a, #workflowProgress button, ' +
          '.preview-drawer-header button, .preview-drawer-header a';
        for (const el of document.querySelectorAll(selector)) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect();
          if (!r.width && !r.height) continue;
          controls.push({
            id: el.id || String(el.className).split(' ')[0],
            x: r.x,
            y: r.y,
            right: r.right,
            bottom: r.bottom,
            w: Math.round(r.width * 10) / 10,
            h: Math.round(r.height * 10) / 10,
          });
        }
        const offscreen = controls
          .filter((c) => c.right > window.innerWidth + 0.5 || c.x < -0.5)
          .map((c) => `${c.id} [${Math.round(c.x)}..${Math.round(c.right)}]`);
        const overlaps = [];
        for (let i = 0; i < controls.length; i++) {
          for (let j = i + 1; j < controls.length; j++) {
            const a = controls[i];
            const b = controls[j];
            const ox = Math.min(a.right, b.right) - Math.max(a.x, b.x);
            const oy = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
            if (ox > 0.5 && oy > 0.5)
              overlaps.push(
                `${a.id} x ${b.id} = ${Math.round(ox * 10) / 10}px`
              );
          }
        }
        return { offscreen, overlaps };
      });

      // Nothing may end past the right edge, the Classic button included.
      expect(geometry.offscreen, 'no control runs off the screen').toEqual([]);
      // #clearFileBtn and the GitHub link must not overlap: an overlap makes a
      // hit test across "Main Page" return the GitHub link.
      expect(geometry.overlaps, 'no control sits on a neighbour').toEqual([]);
    });

    test('toolbar-back-button: every point across the Main Page button belongs to the Main Page button', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await loadSampleProject(page);

      const hits = await page.evaluate(() => {
        const back = document.getElementById('clearFileBtn');
        const r = back.getBoundingClientRect();
        const seen = new Set();
        // A point on the arrow or the words lands on their span, which
        // belongs to the button it sits in.
        for (let x = Math.round(r.x) + 2; x < r.right; x += 4) {
          const el = document
            .elementFromPoint(x, r.y + r.height / 2)
            ?.closest('button, a');
          seen.add(el ? el.id || el.tagName.toLowerCase() : 'null');
        }
        return [...seen];
      });
      expect(hits, 'the tail of the label was the GitHub link').toEqual([
        'clearFileBtn',
      ]);
    });
  });

  // The header's first row holds Main Page, the Simplified/Standard switch,
  // GitHub and Keys, left to right, and the switch never sits on a row of its
  // own. Main Page is twice a button wide, with its words where they fit (its
  // arrow alone in high contrast). The Customizer button leads the Preview
  // Settings row, at the left of its arrow, with its word where it fits (its
  // arrow alone in the Alt View, whose row holds two more buttons). Nothing in
  // either row sits on a neighbour: a row can be as wide as the screen and
  // still have two controls drawn over each other.
  test.describe(`The first header row and the settings row (412x${height})`, () => {
    test.use({ viewport: { width: 412, height } });

    for (const look of [
      { label: '' },
      { label: ' in high contrast', highContrast: true },
      { label: ' in the Alt View', altView: true },
    ]) {
      test(`toolbar-first-row: Main Page, the switch, GitHub and Keys share one row, and the Customizer button leads the settings row${look.label}`, async ({
        page,
      }) => {
        test.setTimeout(240_000);
        await page.addInitScript((l) => {
          if (l.altView) {
            localStorage.setItem('openscad-customizer-hfm-unlock', 'true');
          }
          if (l.highContrast) {
            localStorage.setItem('openscad-forge-high-contrast', 'true');
          }
        }, look);
        await loadSampleProject(page);
        await switchToStandard(page);
        if (look.altView) {
          await skipWithoutWebGL(
            page,
            'no WebGL: the Alt View draws its characters from the 3D picture'
          );
          await page.locator('#_hfmToggle').click();
          await expect(page.locator('html')).toHaveAttribute(
            'data-ui-variant',
            'mono'
          );
          await page.waitForTimeout(500);
        }

        const row = await page.evaluate(() => {
          const wanted = {
            mainPage: '#clearFileBtn',
            mode: '#uiModeToggle',
            github: '.app-header .github-link',
            keys: '#shortcutsToggle',
          };
          return Object.entries(wanted).map(([key, selector]) => {
            const el = document.querySelector(selector);
            const r = el.getBoundingClientRect();
            return {
              key,
              inHeader: !!el.closest('.app-header'),
              top: Math.round(r.top),
              left: Math.round(r.left),
              width: Math.round(r.width),
              height: Math.round(r.height),
              name: el.getAttribute('aria-label'),
            };
          });
        });
        const where = row
          .map((c) => `${c.key} ${c.left},${c.top} ${c.width}x${c.height}`)
          .join('; ');

        for (const c of row) {
          expect(c.inHeader, `${c.key} is in the header (${where})`).toBe(true);
          expect(c.width, `${c.key} width`).toBeGreaterThanOrEqual(44);
          expect(c.height, `${c.key} height`).toBeGreaterThanOrEqual(44);
        }
        const tops = row.map((c) => c.top);
        expect(
          Math.max(...tops) - Math.min(...tops),
          `one row (${where})`
        ).toBeLessThanOrEqual(2);
        expect(
          [...row].sort((a, b) => a.left - b.left).map((c) => c.key),
          'left to right'
        ).toEqual(['mainPage', 'mode', 'github', 'keys']);
        const mainPage = row.find((c) => c.key === 'mainPage');
        expect(mainPage.name).toBe('Main Page');
        expect(
          mainPage.width,
          'Main Page is twice a button wide'
        ).toBeGreaterThanOrEqual(92);

        const words = await page.evaluate(() => ({
          mainPage: document
            .querySelector('#clearFileBtn .clear-file-label')
            .checkVisibility(),
          customizer: document
            .querySelector('#mobileDrawerToggle .btn-label')
            .checkVisibility(),
        }));
        expect(words.mainPage, "Main Page's words").toBe(!look.highContrast);
        expect(words.customizer, "the Customizer button's word").toBe(
          !look.altView
        );

        // The Customizer button leads the settings row, the arrow next.
        const settings = await page.evaluate(() => {
          const button = document.getElementById('mobileDrawerToggle');
          const r = button.getBoundingClientRect();
          return {
            parent: button.parentElement.className,
            next: button.nextElementSibling?.id ?? null,
            first: button.parentElement.firstElementChild === button,
            name: button.getAttribute('aria-label'),
            width: Math.round(r.width),
            height: Math.round(r.height),
          };
        });
        expect(settings.parent).toContain('preview-drawer-header-left');
        expect(settings.first, 'the first control of the row').toBe(true);
        expect(settings.next).toBe('previewDrawerToggle');
        expect(settings.name).toBe('Customizer panel');
        expect(settings.width).toBeGreaterThanOrEqual(44);
        expect(settings.height).toBeGreaterThanOrEqual(44);

        // Nothing in the header or the settings row sits on a neighbour or
        // runs off the screen.
        const crowding = await page.evaluate(() => {
          const boxes = [];
          for (const el of document.querySelectorAll(
            '.app-header button, .app-header a, .preview-drawer-header button'
          )) {
            if (!el.checkVisibility()) continue;
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            boxes.push({ id: el.id || String(el.className).split(' ')[0], r });
          }
          const overlaps = [];
          for (let a = 0; a < boxes.length; a++) {
            for (let b = a + 1; b < boxes.length; b++) {
              const p = boxes[a].r;
              const q = boxes[b].r;
              const ox = Math.min(p.right, q.right) - Math.max(p.left, q.left);
              const oy = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
              if (ox > 0.5 && oy > 0.5) {
                overlaps.push(
                  `${boxes[a].id} x ${boxes[b].id} = ${Math.round(ox)}px`
                );
              }
            }
          }
          const offscreen = boxes
            .filter((b) => b.r.right > innerWidth + 0.5 || b.r.left < -0.5)
            .map((b) => b.id);
          return { overlaps, offscreen };
        });
        expect(crowding.overlaps, 'no control sits on a neighbour').toEqual([]);
        expect(crowding.offscreen, 'no control runs off the screen').toEqual(
          []
        );

        // Tab order follows the row.
        const order = await page.evaluate(() => {
          const focusable = [
            ...document.querySelectorAll('.app-header button, .app-header a'),
          ].filter((el) => el.checkVisibility() && el.tabIndex >= 0);
          return focusable.map(
            (el) => el.id || String(el.className).split(' ').pop()
          );
        });
        expect(
          order.filter((id) =>
            [
              'clearFileBtn',
              'uiModeToggle',
              'github-link',
              'shortcutsToggle',
            ].includes(id)
          ),
          'the header in tab order'
        ).toEqual([
          'clearFileBtn',
          'uiModeToggle',
          'github-link',
          'shortcutsToggle',
        ]);

        // The header is one row high.
        const header = await page.evaluate(() =>
          Math.round(
            document.querySelector('.app-header').getBoundingClientRect().height
          )
        );
        expect(header, 'the header height').toBeLessThan(60);
      });
    }
  });

  test.describe(`The four controls in the Customizer row (412x${height})`, () => {
    test.use({ viewport: { width: 412, height } });

    test('toolbar-quartet: all four keep 44px, a name, and keyboard reach in the Customizer row', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await loadSampleProject(page);

      for (const selector of QUARTET) {
        const control = page.locator(selector);
        await expect(control, `${selector} is on screen`).toBeVisible();

        const box = await control.boundingBox();
        expect(box.width, `${selector} width`).toBeGreaterThanOrEqual(44);
        expect(box.height, `${selector} height`).toBeGreaterThanOrEqual(44);

        const placement = await control.evaluate((el) => ({
          inCustomizerRow: !!el.closest('.preview-drawer-header'),
          name: (el.getAttribute('aria-label') || el.textContent || '').trim(),
        }));
        expect(
          placement.inCustomizerRow,
          `${selector} joined the Customizer row`
        ).toBe(true);
        expect(placement.name, `${selector} keeps an accessible name`).not.toBe(
          ''
        );

        // Reachable and operable from the keyboard, with a visible ring.
        //
        // Reachable, and honestly: at 412x810 these four sit at tab stops
        // 28-31, because the Customizer row sits after #paramPanel in the
        // document. They come immediately after the two controls they share
        // that row with (26, 27), so the order agrees with the layout, which is
        // what WCAG 2.4.3 asks. The distance comes from the closed off-canvas
        // Customizer: 18 of the stops in between are inside it, and it is fully
        // tabbable while closed. Making the closed drawer untabbable would
        // bring these four to around stop 10. Both chords are advertised (see
        // the case below), which is the direct route in the meantime.
        const reachable = await control.evaluate((el) => {
          el.focus();
          return document.activeElement === el;
        });
        expect(reachable, `${selector} takes focus`).toBe(true);
        const ring = await control.evaluate((el) => {
          const cs = getComputedStyle(el);
          return cs.outlineStyle !== 'none' || cs.boxShadow !== 'none';
        });
        expect(ring, `${selector} paints a focus indicator`).toBe(true);
      }

      // The page keeps its only <h1>. The branding is taken out of the FLOW
      // here — it has measured 0px wide on this surface for as long as the
      // Main Page button has been in the row, and its two 4px gaps are what
      // buys the row a single line — but taking it out of the ACCESSIBILITY
      // TREE is a different thing entirely. display:none was tried first and
      // did exactly that.
      const heading1 = await page.evaluate(() => {
        const h = document.querySelector('.header-branding h1');
        if (!h) return { present: false };
        for (let n = h; n; n = n.parentElement) {
          if (getComputedStyle(n).display === 'none') {
            return {
              present: false,
              hiddenBy: n.id || String(n.className).split(' ')[0],
            };
          }
        }
        return {
          present: true,
          text: h.textContent.replace(/\s+/g, ' ').trim(),
        };
      });
      expect(
        heading1.present,
        `the document's only h1 is still announced${heading1.hiddenBy ? ` (display:none on .${heading1.hiddenBy})` : ''}`
      ).toBe(true);
      expect(heading1.text).toContain('OpenSCAD');

      // The heading that stood down is still the region's accessible name.
      const heading = page.locator('#preview-settings-heading');
      await expect(heading).toHaveClass(/sr-only/);
      const regionName = await page.evaluate(() => {
        const region = document.getElementById('previewInfoContent');
        const id = region?.getAttribute('aria-labelledby');
        return id ? document.getElementById(id)?.textContent.trim() : null;
      });
      expect(regionName).toBe('Preview Settings & Info');
    });

    test('toolbar-hc-keyshortcut: high contrast advertises its chord like its twin', async ({
      page,
    }) => {
      await page.goto('/');
      await page.waitForSelector('body[data-wasm-ready="true"]', {
        state: 'attached',
        timeout: WASM_READY_TIMEOUT,
      });
      // Generated from the live shortcut config, so it follows a re-mapped
      // chord rather than going stale — which is why it is not an attribute
      // in index.html.
      await expect(page.locator('#contrastToggle')).toHaveAttribute(
        'aria-keyshortcuts',
        'Control+Shift+H'
      );
      await expect(page.locator('#themeToggle')).toHaveAttribute(
        'aria-keyshortcuts',
        'Control+Shift+T'
      );
    });
  });

  test.describe(`The status line can be read (412x${height})`, () => {
    test.use({ viewport: { width: 412, height } });

    test('status-line-clear: legible with the camera pad shut and open', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await loadSampleProject(page);

      const measure = () =>
        page.evaluate(() => {
          const bar = document.querySelector('.preview-status-bar');
          const pad = document.getElementById('cameraDrawerBody');
          const actions = document.getElementById('actionsBar');
          const b = bar.getBoundingClientRect();
          const p = pad.getBoundingClientRect();
          const a = actions.getBoundingClientRect();
          const padOpen = getComputedStyle(pad).display !== 'none';
          return {
            padOpen,
            height: Math.round(b.height),
            behindActionsBar: b.bottom > a.top && b.top < a.bottom,
            behindPad: padOpen && b.top < p.bottom && b.bottom > p.top,
          };
        });

      const shut = await measure();
      expect(shut.padOpen).toBe(false);
      // A line at y 829..854 against an actions bar starting at y 816 is not
      // visible at all.
      expect(shut.behindActionsBar, 'clear of the actions bar').toBe(false);
      // Both edges must be written or the box stretches the whole preview.
      expect(shut.height, 'one line tall, not stretched').toBeLessThan(60);

      await page.locator('#cameraDrawerToggle').click();
      await expect(page.locator('#cameraDrawerBody')).toBeVisible();
      const open = await measure();
      expect(open.padOpen).toBe(true);
      // A line at y 665..690 inside the pad's 498..811 band is washed out, with
      // the pad's own heading printed through it.
      expect(open.behindPad, 'clear of the camera pad').toBe(false);
      expect(open.behindActionsBar, 'still clear of the actions bar').toBe(
        false
      );
    });
  });
}

// Held sideways the menu bar shares the settings row, which has no room left,
// so the Customizer button keeps its place at the head of the header's first
// row, where there is room; Main Page is twice a button wide here too.
test.describe('Held sideways (740x360)', () => {
  test.use({ viewport: { width: 740, height: 360 }, hasTouch: true });

  test('toolbar-sideways: the Customizer button heads the header, and the settings row with the menu bar fits', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await loadSampleProject(page);
    await switchToStandard(page);
    const facts = await page.evaluate(() => {
      const button = document.getElementById('mobileDrawerToggle');
      const back = document.getElementById('clearFileBtn');
      const header = document.querySelector('.header-content');
      const row = document.querySelector('.preview-drawer-header');
      return {
        inHeader: button.parentElement === header,
        beforeMainPage: button.nextElementSibling === back,
        mainPageWidth: Math.round(back.getBoundingClientRect().width),
        rowFits: row.scrollWidth <= row.clientWidth + 1,
        menuInRow: !!row.querySelector('#toolbarMenuBar'),
      };
    });
    expect(facts.menuInRow, 'the menu bar shares the settings row').toBe(true);
    expect(facts.inHeader, 'the Customizer button is in the header').toBe(true);
    expect(facts.beforeMainPage, 'at its head, before Main Page').toBe(true);
    expect(
      facts.mainPageWidth,
      'Main Page is twice a button wide'
    ).toBeGreaterThanOrEqual(92);
    expect(facts.rowFits, 'the settings row fits its width').toBe(true);

    // Open, the button takes the accent fill, which is the header's own
    // color here: its edge is what still shows it is pressed.
    await page.locator('#mobileDrawerToggle').click();
    await expect(page.locator('#mobileDrawerToggle')).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    // Past the colors' transition: mid-way the edge is neither color.
    await page.waitForTimeout(600);
    const pressed = await page.evaluate(() => {
      const cs = getComputedStyle(
        document.getElementById('mobileDrawerToggle')
      );
      return {
        fill: cs.backgroundColor,
        edge: cs.borderTopColor,
        width: parseFloat(cs.borderTopWidth),
        header: getComputedStyle(document.querySelector('.app-header'))
          .backgroundColor,
      };
    });
    expect(pressed.width, 'the open button has an edge').toBeGreaterThanOrEqual(
      1
    );
    expect(
      pressed.edge,
      `its edge stands out from the header (${JSON.stringify(pressed)})`
    ).not.toBe(pressed.header);
  });
});

test.describe('High contrast grows the row rather than hiding it', () => {
  test.use({ viewport: { width: 412, height: 810 } });

  test('toolbar-high-contrast: nothing slides off the left edge, and #app gains no hidden scroll', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.goto('/');
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });
    await page.evaluate(() =>
      document.documentElement.setAttribute('data-high-contrast', 'true')
    );
    await page.locator('#fileInput').setInputFiles(FIXTURE);
    await expect(page.locator('#welcomeScreen')).toBeHidden({
      timeout: 60_000,
    });
    await expect(page.locator('#mainInterface')).toBeVisible({
      timeout: 20_000,
    });
    const notNow = page.locator('#saveProjectNotNow');
    try {
      await notNow.waitFor({ state: 'visible', timeout: 3_000 });
      await notNow.click();
    } catch {
      // no modal
    }
    await switchToStandard(page);
    await expect(page.locator('html')).toHaveAttribute(
      'data-high-contrast',
      'true'
    );

    // High contrast thickens every border, so the header's own controls grow:
    // the Main Page button 100.8 -> 116.6px and the interface switch 193.6 ->
    // 213.8px. A row that then overflows to the left gives #app 100px of
    // hidden scroll range and puts the Classic button 96px off the right edge;
    // hidden overflow has no scrollbar, so those pixels are simply gone.
    const state = await page.evaluate(() => {
      const app = document.getElementById('app');
      const clipped = [];
      const selector =
        '.app-header button, .app-header a, #workflowProgress button, ' +
        '.preview-drawer-header button';
      for (const el of document.querySelectorAll(selector)) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (!r.width) continue;
        if (r.right > window.innerWidth + 0.5 || r.left < -0.5) {
          clipped.push(
            `${el.id || String(el.className).split(' ')[0]} [${Math.round(r.left)}..${Math.round(r.right)}]`
          );
        }
      }
      return {
        clipped,
        hiddenScrollRange: app.scrollWidth - app.clientWidth,
        appScrollLeft: app.scrollLeft,
      };
    });

    expect(state.clipped, 'no control is pushed off an edge').toEqual([]);
    expect(
      state.hiddenScrollRange,
      '#app carries no horizontal scroll a user cannot see or reach'
    ).toBe(0);
    expect(state.appScrollLeft).toBe(0);
  });
});

test.describe('The row goes home when the window grows', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('toolbar-restore: a desktop-shaped resize puts the four controls back, live', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await loadSampleProject(page);

    await expect(page.locator('body')).toHaveAttribute(
      'data-mobile-toolbar',
      'relocated'
    );
    await expect(page.locator('#preview-settings-heading')).toHaveClass(
      /sr-only/
    );

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('body')).toHaveAttribute(
      'data-mobile-toolbar',
      'home'
    );
    await expect(page.locator('#preview-settings-heading')).not.toHaveClass(
      /sr-only/
    );
    const home = await page
      .locator('.workflow-actions')
      .evaluate((el) => el.parentElement.id);
    expect(home).toBe('workflowProgress');

    // And back again, without a reload.
    await page.setViewportSize({ width: 412, height: 915 });
    await expect(page.locator('body')).toHaveAttribute(
      'data-mobile-toolbar',
      'relocated'
    );
    const away = await page
      .locator('.workflow-actions')
      .evaluate((el) => el.parentElement.className);
    expect(away).toContain('preview-drawer-header-right');
  });
});

test.describe('The row follows the surface, not just the viewport', () => {
  test.use({ viewport: { width: 412, height: 810 } });

  test('toolbar-surface-round-trip: Main Page, into a project, and back again', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    // The relocation has two conditions and the specs above only exercise one
    // of them. This is the other: the Customizer row does not exist on the
    // welcome screen, so the four controls must come home when a project
    // closes, and go back when one opens — via onAppSurfaceChange, not a
    // resize.
    await page.goto('/');
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });
    const state = () =>
      page.evaluate(() => ({
        surface: document.body.dataset.appSurface,
        toolbar: document.body.dataset.mobileToolbar,
        inWorkflowRow: !!document
          .querySelector('.workflow-actions')
          ?.closest('#workflowProgress'),
        titleSrOnly: document
          .querySelector('#preview-settings-heading')
          ?.classList.contains('sr-only'),
      }));

    expect(await state()).toMatchObject({
      surface: 'welcome',
      toolbar: 'home',
      inWorkflowRow: true,
      titleSrOnly: false,
    });

    await page.locator('#fileInput').setInputFiles(FIXTURE);
    await expect(page.locator('#welcomeScreen')).toBeHidden({
      timeout: 60_000,
    });
    await expect(page.locator('#mainInterface')).toBeVisible({
      timeout: 20_000,
    });
    const notNow = page.locator('#saveProjectNotNow');
    try {
      await notNow.waitFor({ state: 'visible', timeout: 3_000 });
      await notNow.click();
    } catch {
      // no modal
    }
    await expect.poll(async () => (await state()).toolbar).toBe('relocated');
    expect(await state()).toMatchObject({
      surface: 'project',
      inWorkflowRow: false,
      titleSrOnly: true,
    });

    // Nothing was changed, so the trip home is one press: the button asks
    // only when a change would be lost.
    await page.locator('#clearFileBtn').click();
    await expect(page.locator('#welcomeScreen')).toBeVisible({
      timeout: 20_000,
    });
    await expect.poll(async () => (await state()).toolbar).toBe('home');
    expect(await state()).toMatchObject({
      surface: 'welcome',
      inWorkflowRow: true,
      titleSrOnly: false,
    });
    // and they are on screen there, which is the point of coming home
    for (const selector of ['#contrastToggle', '#themeToggle']) {
      await expect(page.locator(selector)).toBeVisible();
    }
  });
});

test.describe('The welcome surface is left alone', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('toolbar-welcome-untouched: high contrast and theme stay in the workflow row before a file is open', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });

    // The Customizer row does not exist here, and components.css force-shows
    // the workflow row on this surface precisely so these two stay reachable
    // on the first screen a low-vision user meets.
    await expect(page.locator('body')).toHaveAttribute(
      'data-mobile-toolbar',
      'home'
    );
    for (const selector of ['#contrastToggle', '#themeToggle']) {
      const control = page.locator(selector);
      await expect(control).toBeVisible();
      expect(
        await control.evaluate((el) => el.closest('#workflowProgress') !== null)
      ).toBe(true);
    }
    await expect(page.locator('#preview-settings-heading')).not.toHaveClass(
      /sr-only/
    );
  });
});

// A drawer toggle on the bottom bar says its new name once per press. A
// tooltip repeating the name reached a screen reader as a description, and
// NVDA spoke the new name twice.
test.describe('The bottom bar toggles say their name once', () => {
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true });

  async function nameOnly(page, id, label) {
    const toggle = page.locator(`#${id}`);
    await expect(toggle).toHaveAccessibleName(`Expand ${label}`);
    await expect(toggle).toHaveAccessibleDescription('');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAccessibleName(`Collapse ${label}`);
    await expect(toggle).toHaveAccessibleDescription('');
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  }

  test('Camera: a name and no description, before and after a press', async ({
    page,
  }) => {
    test.setTimeout(WASM_READY_TIMEOUT + 60_000);
    await loadSampleProject(page);
    await nameOnly(page, 'cameraDrawerToggle', 'camera controls');
  });

  test('Lens, in the Alt View: a name and no description, before and after a press', async ({
    page,
  }) => {
    test.setTimeout(WASM_READY_TIMEOUT + 60_000);
    await page.addInitScript(() => {
      localStorage.setItem('openscad-customizer-hfm-unlock', 'true');
    });
    await loadSampleProject(page);
    await skipWithoutWebGL(
      page,
      'The Alt View draws from the 3D picture; this browser has no WebGL'
    );
    await page.locator('#_hfmToggle').click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.documentElement.getAttribute('data-ui-variant')
        )
      )
      .toBe('mono');
    await nameOnly(page, 'asciiDrawerToggle', 'Lens controls');
  });
});

// On a phone, as on the desktop, a slider's value sits on the slider's own
// row, to its right, so the number and the control it reports read together;
// and a finger has room to set it: never shorter than three touch targets,
// the floor the Customizer's own sliders keep.
test.describe("A slider's value sits beside it (412x915)", () => {
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true });

  test('slider-value-beside: every slider in Preview Settings, with room', async ({
    page,
  }) => {
    test.setTimeout(WASM_READY_TIMEOUT + 60_000);
    await loadSampleProject(page);
    await page.locator('#previewDrawerToggle').click();
    await expect(page.locator('#rotationSpeedInput')).toBeVisible();
    await page.waitForTimeout(600);
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('#previewInfoContent .slider-container')]
        .filter((c) => c.querySelector('.slider-value') && c.offsetParent)
        .map((c) => {
          const r = c
            .querySelector('input[type="range"]')
            .getBoundingClientRect();
          const v = c.querySelector('.slider-value').getBoundingClientRect();
          const middle = v.top + v.height / 2;
          return {
            id: c.querySelector('input[type="range"]').id,
            beside:
              middle > r.top && middle < r.bottom && v.left >= r.right - 1,
            width: Math.round(r.width),
          };
        })
    );
    expect(rows.map((r) => r.id)).toContain('rotationSpeedInput');
    expect(
      rows.filter((r) => !r.beside).map((r) => r.id),
      'sliders whose value is not beside them'
    ).toEqual([]);
    expect(
      rows.filter((r) => r.width < 3 * 44).map((r) => `${r.id} ${r.width}px`),
      'sliders shorter than three touch targets'
    ).toEqual([]);
  });
});
