import { test, expect } from '@playwright/test';
import { hasWebGL } from './helpers/webgl.js';

// The drawer and menu rules in docs/specs/UI_STANDARDS.md ("Drawers, sheets
// and menus: the schema"), measured on the page as a person meets it: the
// Q charm open in Standard, at two desktop window sizes, in four looks.
//
// Each look and size opens the project once and every rule case reads the
// same page. A case reports every element that breaks its rule (soft
// assertions), so one run lists the whole picture, not just the first miss.
//
// The arrow is measured, never read from a comment: CSS turns clockwise, so
// the direction a glyph points on screen is computed from its drawing's base
// direction pushed through the transform, rotate and scale it renders with.

const WASM_READY_TIMEOUT = 180_000;

const SIZES = [
  { width: 1280, height: 720 },
  { width: 1910, height: 935 },
];

const LOOKS = [
  { name: 'dark', theme: 'dark' },
  { name: 'light', theme: 'light' },
  { name: 'high contrast', theme: 'dark', highContrast: true },
  { name: 'Alt View', theme: 'dark', altView: true },
];

// Which way each drawer's leading edge moves when it opens.
const TRAVEL = {
  '#collapseParamPanelBtn': 'right',
  '#cameraPanelToggle': 'left',
  '#previewDrawerToggle': 'down',
  '#actionsDrawerToggle': 'up',
  '#echoDrawerToggle': 'up',
};

// Every drawer toggle the rules cover. A toggle added later is found by its
// class and held to the same rules.
const TOGGLES =
  '.btn-collapse-panel, .echo-drawer-toggle, .camera-drawer-toggle-btn, #mobileDrawerToggle';

// The shared arrow's base drawing points right; the turn for each direction.
const ANGLE = { right: 0, down: 90, left: 180, up: -90 };

const MENUS = ['file', 'edit', 'design', 'view', 'window', 'help'];

// Rules the page does not meet yet. A case listed here is expected to fail,
// so the rest of the suite stays green while a rule is being met; once the
// page meets it, the case reports that it passed unexpectedly and its entry
// comes out. Entries only ever leave this list.
const NOT_MET_YET = {
  S1: 'The drawer toggles carry no travel attribute and no shared arrow',
  S2: "The side panels' toggles drop a row when their panel opens",
  S3: "An open drawer's toggle is not drawn in the accent",
  S4: 'The camera panel and the Customizer put their toggles on a second row',
  S5: 'The camera panel scrolls at 180 px wide',
  S7: "Menus open at the window's corner over a blurred page, with a title bar",
};

function expectRule(rule) {
  test.fail(Boolean(NOT_MET_YET[rule]), NOT_MET_YET[rule]);
}

function angleDiff(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/** A visible drawer toggle's state, box, colors and arrow, read in the page. */
function readToggle(sel) {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const out = {
    expanded: el.getAttribute('aria-expanded') === 'true',
    travel: el.getAttribute('data-travel-open'),
    cx: r.x + r.width / 2,
    cy: r.y + r.height / 2,
    background: cs.backgroundColor,
    color: cs.color,
    icons: el.querySelectorAll('svg').length,
    arrow: null,
  };
  const probe = document.createElement('span');
  probe.style.cssText =
    'position:absolute;width:1px;height:1px;background:var(--color-accent);color:var(--color-accent-text)';
  el.parentElement.appendChild(probe);
  out.accent = getComputedStyle(probe).backgroundColor;
  out.accentText = getComputedStyle(probe).color;
  probe.remove();
  const glyph = el.querySelector('.drawer-arrow');
  if (glyph) {
    const g = getComputedStyle(glyph);
    const m = new DOMMatrix(g.transform === 'none' ? undefined : g.transform);
    const p0 = m.transformPoint({ x: 0, y: 0 });
    const p1 = m.transformPoint({ x: 1, y: 0 });
    let vx = p1.x - p0.x;
    let vy = p1.y - p0.y;
    if (g.scale && g.scale !== 'none') {
      const [sx, sy = sx] = g.scale.split(/\s+/).map(Number);
      vx *= sx;
      vy *= sy;
    }
    if (g.rotate && g.rotate !== 'none') {
      const m2 = /(-?[\d.]+)(deg|rad|turn)\s*$/.exec(g.rotate);
      if (m2) {
        const n = Number(m2[1]);
        const t =
          m2[2] === 'deg'
            ? (n * Math.PI) / 180
            : m2[2] === 'turn'
              ? n * 2 * Math.PI
              : n;
        [vx, vy] = [
          vx * Math.cos(t) - vy * Math.sin(t),
          vx * Math.sin(t) + vy * Math.cos(t),
        ];
      }
    }
    out.arrow = (Math.atan2(vy, vx) * 180) / Math.PI;
  }
  return out;
}

for (const size of SIZES) {
  for (const look of LOOKS) {
    test.describe(`${size.width} x ${size.height}, ${look.name}`, () => {
      test.describe.configure({ mode: 'default' });

      /** @type {import('@playwright/test').BrowserContext} */
      let context;
      /** @type {import('@playwright/test').Page} */
      let page;

      test.beforeAll(async ({ browser }, testInfo) => {
        testInfo.setTimeout(WASM_READY_TIMEOUT + 120_000);
        context = await browser.newContext({
          baseURL: testInfo.project.use.baseURL,
          viewport: size,
        });
        page = await context.newPage();
        page.setDefaultTimeout(10_000);
        if (look.altView) {
          test.skip(
            !(await hasWebGL(page)),
            'The Alt View draws from the 3D picture; this browser has no WebGL'
          );
        }
        await page.addInitScript((l) => {
          localStorage.setItem('openscad-forge-first-visit-seen', 'true');
          localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
          localStorage.setItem('openscad-forge-theme', l.theme);
          if (l.highContrast) {
            localStorage.setItem('openscad-forge-high-contrast', 'true');
          }
          if (l.altView) {
            localStorage.setItem('openscad-customizer-hfm-unlock', 'true');
          }
        }, look);
        await page.goto('/?example=q-charm', { timeout: 60_000 });
        await page.waitForSelector('body[data-wasm-ready="true"]', {
          state: 'attached',
          timeout: WASM_READY_TIMEOUT,
        });
        await page
          .locator('.param-control')
          .first()
          .waitFor({ state: 'attached', timeout: 60_000 });
        const notNow = page.locator('#saveProjectNotNow');
        if (
          await notNow.waitFor({ state: 'visible', timeout: 3_000 }).then(
            () => true,
            () => false
          )
        ) {
          await notNow.click();
        }
        const density = page.locator('#uiModeToggle');
        if ((await density.getAttribute('aria-checked')) !== 'true') {
          await density.click();
        }
        await expect(density).toHaveAttribute('aria-checked', 'true');
        // The charm writes two echo messages, which shows the echo drawer.
        await page
          .locator('#echoDrawer.visible')
          .waitFor({ state: 'attached', timeout: 90_000 });
        if (look.altView) {
          const key = page.locator('#_hfmToggle');
          await key.waitFor({ state: 'visible', timeout: 60_000 });
          await key.click();
          await page.waitForFunction(
            () =>
              document.documentElement.getAttribute('data-ui-variant') ===
              'mono'
          );
        }
        await page.waitForTimeout(1_500);
      });

      test.afterAll(async () => {
        await context?.close();
      });

      /** The visible drawer toggles, by selector. */
      async function visibleToggles() {
        return page.evaluate((selector) => {
          return [...document.querySelectorAll(selector)]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            })
            .map((el) => `#${el.id}`);
        }, TOGGLES);
      }

      /** Wait until a toggle's box holds still (its drawer's move has ended). */
      async function settle(sel) {
        let last = await page.evaluate(readToggle, sel);
        for (let i = 0; i < 20; i++) {
          await page.waitForTimeout(100);
          const now = await page.evaluate(readToggle, sel);
          if (
            Math.abs(now.cx - last.cx) < 0.5 &&
            Math.abs(now.cy - last.cy) < 0.5 &&
            now.arrow === last.arrow &&
            now.background === last.background
          ) {
            return now;
          }
          last = now;
        }
        return last;
      }

      // By keyboard: in some looks another surface lies over a toggle, and a
      // case must fail on its own rule, not on a click that cannot land.
      async function press(sel) {
        const before = await page.evaluate(readToggle, sel);
        await page.locator(sel).focus();
        await page.keyboard.press('Enter');
        await expect(page.locator(sel)).toHaveAttribute(
          'aria-expanded',
          before.expanded ? 'false' : 'true'
        );
        return settle(sel);
      }

      /** A toggle measured closed and open, then left as it was found. */
      async function bothStates(sel) {
        const first = await settle(sel);
        const second = await press(sel);
        await press(sel);
        return first.expanded
          ? { closed: second, open: first }
          : { closed: first, open: second };
      }

      test('S1: each drawer toggle points where its drawer travels', async () => {
        expectRule('S1');
        const toggles = await visibleToggles();
        expect(toggles.length, 'S1: no drawer toggles found').toBeGreaterThan(
          0
        );
        for (const sel of toggles) {
          const { closed, open } = await bothStates(sel);
          const travel = closed.travel;
          expect
            .soft(travel, `S1: no travel attribute on ${sel}`)
            .not.toBeNull();
          if (TRAVEL[sel] && travel) {
            expect
              .soft(travel, `S1: ${sel} says it travels ${travel}`)
              .toBe(TRAVEL[sel]);
          }
          expect
            .soft(closed.arrow, `S1: no shared arrow glyph in ${sel}`)
            .not.toBeNull();
          expect
            .soft(closed.icons, `S1: ${sel} draws ${closed.icons} icons`)
            .toBeLessThanOrEqual(1);
          const dir = TRAVEL[sel] ?? travel;
          if (dir && closed.arrow !== null) {
            const want = ANGLE[dir];
            expect
              .soft(
                angleDiff(closed.arrow, want),
                `S1: ${sel} closed points at ${Math.round(closed.arrow)} degrees, its drawer opens ${dir} (${want})`
              )
              .toBeLessThanOrEqual(1);
            expect
              .soft(
                angleDiff(open.arrow, want + 180),
                `S1: ${sel} open points at ${Math.round(open.arrow)} degrees, its drawer closes the other way (${want + 180})`
              )
              .toBeLessThanOrEqual(1);
          }
        }
      });

      test("S2: each drawer toggle moves on its drawer's axis only", async () => {
        expectRule('S2');
        for (const sel of await visibleToggles()) {
          const { closed, open } = await bothStates(sel);
          const dir = TRAVEL[sel] ?? closed.travel;
          expect
            .soft(dir, `S2: no known travel axis for ${sel}`)
            .not.toBeNull();
          if (!dir) continue;
          const across =
            dir === 'left' || dir === 'right'
              ? Math.abs(open.cy - closed.cy)
              : Math.abs(open.cx - closed.cx);
          expect
            .soft(
              across,
              `S2: ${sel} moves ${across.toFixed(1)} px across its ${dir} axis between closed and open`
            )
            .toBeLessThanOrEqual(2);
        }
      });

      test("S3: an open drawer's toggle is drawn pressed", async () => {
        expectRule('S3');
        for (const sel of await visibleToggles()) {
          const { closed, open } = await bothStates(sel);
          expect
            .soft(
              open.background,
              `S3: ${sel} looks the same open as closed (${closed.background})`
            )
            .not.toBe(closed.background);
          expect
            .soft(
              open.background,
              `S3: ${sel} open is ${open.background}, not the accent ${open.accent}`
            )
            .toBe(open.accent);
          expect
            .soft(
              open.color,
              `S3: ${sel} open text is ${open.color}, not the accent text ${open.accentText}`
            )
            .toBe(open.accentText);
        }
      });

      test("S4: a panel's title and toggle share one row", async () => {
        expectRule('S4');
        const rows = [
          {
            panel: 'the camera panel',
            toggle: '#cameraPanelToggle',
            title: '#camera-controls-heading',
            edge: 'left',
          },
          {
            panel: 'the Customizer',
            toggle: '#collapseParamPanelBtn',
            title: '#parameters-heading',
            edge: 'right',
          },
        ];
        for (const row of rows) {
          const opened = !(await page.evaluate(readToggle, row.toggle))
            .expanded;
          if (opened) await press(row.toggle);
          const box = await page.evaluate(
            ({ toggle, title }) => {
              const t = document.querySelector(toggle).getBoundingClientRect();
              const h = document.querySelector(title).getBoundingClientRect();
              return {
                toggleY: t.y + t.height / 2,
                titleY: h.y + h.height / 2,
                toggleX: t.x + t.width / 2,
                titleX: h.x + h.width / 2,
              };
            },
            { toggle: row.toggle, title: row.title }
          );
          const gap = Math.abs(box.toggleY - box.titleY);
          expect
            .soft(
              gap,
              `S4: ${row.panel}'s title and toggle centers are ${gap.toFixed(1)} px apart vertically`
            )
            .toBeLessThanOrEqual(4);
          const atEdge =
            row.edge === 'left'
              ? box.toggleX < box.titleX
              : box.toggleX > box.titleX;
          expect
            .soft(
              atEdge,
              `S4: ${row.panel}'s toggle is not at its ${row.edge} edge, where the panel opens from`
            )
            .toBe(true);
          if (opened) await press(row.toggle);
        }
      });

      test('S5: the camera panel shows every button without scrolling', async () => {
        expectRule('S5');
        const wasOpen = (await page.evaluate(readToggle, '#cameraPanelToggle'))
          .expanded;
        if (!wasOpen) await press('#cameraPanelToggle');
        const sizes = await page.evaluate(() =>
          ['#cameraPanel', '#cameraPanelBody'].map((sel) => {
            const el = document.querySelector(sel);
            const box = el.getBoundingClientRect();
            const below = [...el.querySelectorAll('button')]
              .filter((b) => {
                const r = b.getBoundingClientRect();
                return r.width > 0 && r.bottom > box.bottom + 0.5;
              })
              .map((b) => b.id || b.textContent.trim().slice(0, 20));
            return {
              sel,
              scrollWidth: el.scrollWidth,
              clientWidth: el.clientWidth,
              scrollHeight: el.scrollHeight,
              clientHeight: el.clientHeight,
              below,
            };
          })
        );
        for (const s of sizes) {
          expect
            .soft(
              s.scrollWidth,
              `S5: ${s.sel} scrolls sideways (${s.scrollWidth} px of content in ${s.clientWidth})`
            )
            .toBeLessThanOrEqual(s.clientWidth);
          if (!look.altView) {
            expect
              .soft(
                s.scrollHeight,
                `S5: ${s.sel} scrolls down (${s.scrollHeight} px of content in ${s.clientHeight}); below the fold: ${s.below.join(', ')}`
              )
              .toBeLessThanOrEqual(s.clientHeight);
          }
        }
        if (!wasOpen) await press('#cameraPanelToggle');
      });

      test('S6: on a phone the preview keeps half the screen', () => {
        test.skip(
          true,
          'The phone case: today the Customizer and Preview Settings sheets cover the whole preview on a phone'
        );
      });

      test('S7: a menu drops under its pressed button with nothing over the page', async () => {
        expectRule('S7');
        for (const name of MENUS) {
          const btn = page.locator(`#${name}MenuBtn`);
          await btn.click();
          await expect(page.locator(`#${name}MenuModal`)).not.toHaveClass(
            /\bhidden\b/
          );
          await page.waitForTimeout(250);
          const m = await page.evaluate((n) => {
            const b = document.getElementById(`${n}MenuBtn`);
            const modal = document.getElementById(`${n}MenuModal`);
            const overlay = modal.querySelector('.modal-overlay');
            const content = modal.querySelector('.toolbar-menu-content');
            const header = modal.querySelector('.toolbar-menu-header');
            const oc = getComputedStyle(overlay);
            const br = b.getBoundingClientRect();
            const cr = content.getBoundingClientRect();
            const hr = header ? header.getBoundingClientRect() : null;
            const probe = document.createElement('span');
            probe.style.cssText =
              'position:absolute;background:var(--color-accent);color:var(--color-accent-text)';
            b.parentElement.appendChild(probe);
            const accent = getComputedStyle(probe).backgroundColor;
            const accentText = getComputedStyle(probe).color;
            probe.remove();
            return {
              blur: oc.backdropFilter || oc.webkitBackdropFilter || 'none',
              tint: oc.backgroundColor,
              header: !!hr && hr.width > 0 && hr.height > 0,
              button: { left: br.left, right: br.right, bottom: br.bottom },
              content: { left: cr.left, right: cr.right, top: cr.top },
              pressed: getComputedStyle(b).backgroundColor,
              pressedText: getComputedStyle(b).color,
              accent,
              accentText,
            };
          }, name);
          expect
            .soft(m.blur, `S7: the ${name} menu blurs the page (${m.blur})`)
            .toBe('none');
          expect
            .soft(m.tint, `S7: the ${name} menu tints the page (${m.tint})`)
            .toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
          expect
            .soft(m.header, `S7: the ${name} menu shows a title bar`)
            .toBe(false);
          const under =
            Math.abs(m.content.top - m.button.bottom) <= 2 &&
            m.content.left <= m.button.left + 2 &&
            m.content.right >= m.button.right - 2;
          expect
            .soft(
              under,
              `S7: the ${name} menu opens at (${Math.round(m.content.left)}, ${Math.round(m.content.top)}), not under its button (${Math.round(m.button.left)}, ${Math.round(m.button.bottom)})`
            )
            .toBe(true);
          expect
            .soft(
              m.pressed,
              `S7: the ${name} button is ${m.pressed} while its menu is open, not the accent ${m.accent}`
            )
            .toBe(m.accent);
          expect
            .soft(
              m.pressedText,
              `S7: the ${name} button's text is ${m.pressedText} while open, not the accent text ${m.accentText}`
            )
            .toBe(m.accentText);
          await page.keyboard.press('Escape');
          await expect(page.locator(`#${name}MenuModal`)).toHaveClass(
            /\bhidden\b/
          );
        }
      });
    });
  }
}
