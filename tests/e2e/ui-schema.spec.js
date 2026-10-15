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
const NOT_MET_YET = {};

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

      /**
       * Wait until a toggle holds still: every CSS transition on the page has
       * ended (a busy page can stall one mid-way, so two equal reads alone
       * are not proof), then two reads agree.
       */
      async function settle(sel) {
        await page.waitForFunction(
          () =>
            !document
              .getAnimations()
              .some(
                (a) => a instanceof CSSTransition && a.playState === 'running'
              ),
          null,
          { timeout: 5_000 }
        );
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
        const target = await page.evaluate(() =>
          parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue(
              '--size-touch-target'
            )
          )
        );
        const sizes = await page.evaluate(() =>
          ['#cameraPanel', '#cameraPanelBody'].map((sel) => {
            const el = document.querySelector(sel);
            const box = el.getBoundingClientRect();
            const below = [...el.querySelectorAll('button')]
              .filter((b) => {
                const r = b.getBoundingClientRect();
                return r.width > 0 && r.bottom > box.bottom + 0.5;
              })
              .map(
                (b) =>
                  b.id ||
                  b.getAttribute('aria-label') ||
                  b.textContent.trim().slice(0, 20)
              );
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
          // The Alt View's sliders may sit below the fold, and so may the
          // last rows wherever the targets are 44 px (high contrast, a touch
          // screen, a browser that reports no mouse): the one column is then
          // taller than a 720 px window holds.
          const mayScrollDown =
            look.altView || (target >= 44 && size.height < 935);
          if (!mayScrollDown) {
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
          // The button's color eases in: read it once the transition ends.
          await btn.evaluate((el) =>
            Promise.all(el.getAnimations().map((a) => a.finished))
          );
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

/**
 * The simple box open in Standard on a desktop window, in a look, with the
 * camera panel as it starts (closed) or opened by its toggle.
 */
async function openDesktopCameraProject(page, look, { open }) {
  await page.addInitScript((l) => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    localStorage.setItem('openscad-forge-theme', l.theme);
    if (l.highContrast) {
      localStorage.setItem('openscad-forge-high-contrast', 'true');
    }
    localStorage.setItem(
      'openscad-forge-ui-mode',
      JSON.stringify({ mode: 'standard', lastCustomMode: 'standard' })
    );
  }, look);
  await page.goto('/?example=simple-box', { timeout: 60_000 });
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
  const panelToggle = page.locator('#cameraPanelToggle');
  if (open && (await panelToggle.getAttribute('aria-expanded')) !== 'true') {
    await panelToggle.focus();
    await page.keyboard.press('Enter');
  }
  await expect(panelToggle).toHaveAttribute(
    'aria-expanded',
    open ? 'true' : 'false'
  );
  await page.waitForTimeout(500);
}

// The desktop camera panel: closed, a strip with its toggle and title and
// nothing else; open, one column: Rotate View above Pan View, then Zoom,
// then the six standard views two to a row, then the tools row.
for (const look of LOOKS.filter((l) => !l.altView)) {
  test.describe(`The desktop camera panel, ${look.name}`, () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test('closed, it shows only its toggle and title', async ({ page }) => {
      test.setTimeout(WASM_READY_TIMEOUT + 60_000);
      await openDesktopCameraProject(page, look, { open: false });
      const shown = await page.evaluate(() => {
        const panel = document.getElementById('cameraPanel');
        return [...panel.querySelectorAll('button, h3, svg, dl')]
          .filter((el) => !el.closest('.camera-panel-header'))
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          })
          .map(
            (el) =>
              el.id ||
              el.dataset.view ||
              el.className.baseVal ||
              el.className ||
              el.tagName
          );
      });
      expect(shown, 'controls showing in the closed panel').toEqual([]);
    });

    test('open, it is one column in the order Rotate, Pan, Zoom, Views, tools', async ({
      page,
    }) => {
      test.setTimeout(WASM_READY_TIMEOUT + 60_000);
      await openDesktopCameraProject(page, look, { open: true });
      const m = await page.evaluate(() => {
        const box = (el) => el.getBoundingClientRect();
        const q = (sel) => document.querySelector(`#cameraPanel ${sel}`);
        const sections = [
          '.camera-section-rotate',
          '.camera-section-pan',
          '.camera-section-zoom',
          '.camera-section-views',
          '.camera-section-tools',
        ].map((sel) => {
          const r = box(q(sel));
          return { sel, top: r.top, bottom: r.bottom, left: r.left };
        });
        const views = [
          ...document.querySelectorAll('#cameraPanel .camera-view-btn'),
        ].map((b) => ({
          view: b.dataset.view,
          left: Math.round(box(b).left),
          top: Math.round(box(b).top),
        }));
        return {
          width: box(document.getElementById('cameraPanel')).width,
          sections,
          views,
        };
      });
      for (let i = 1; i < m.sections.length; i++) {
        expect
          .soft(
            m.sections[i].top,
            `${m.sections[i].sel} starts below ${m.sections[i - 1].sel}`
          )
          .toBeGreaterThanOrEqual(m.sections[i - 1].bottom - 1);
      }
      expect(m.views.map((v) => v.view)).toEqual([
        'top',
        'front',
        'right',
        'left',
        'back',
        'bottom',
      ]);
      expect(new Set(m.views.map((v) => v.left)).size, 'view columns').toBe(2);
      expect(new Set(m.views.map((v) => v.top)).size, 'view rows').toBe(3);
      expect(Math.round(m.width), 'the open panel width').toBe(180);
    });

    test('open, every button is at least the touch target on each side', async ({
      page,
    }) => {
      test.setTimeout(WASM_READY_TIMEOUT + 60_000);
      await openDesktopCameraProject(page, look, { open: true });
      const m = await page.evaluate(() => {
        const target = parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            '--size-touch-target'
          )
        );
        const small = [...document.querySelectorAll('#cameraPanel button')]
          .filter((b) => b.offsetParent !== null)
          .map((b) => {
            const r = b.getBoundingClientRect();
            return {
              name: b.getAttribute('aria-label'),
              width: r.width,
              height: r.height,
            };
          })
          .filter((b) => b.width + 0.5 < target || b.height + 0.5 < target);
        return { target, small };
      });
      expect(m.target).toBeGreaterThan(0);
      expect(m.small, `buttons smaller than ${m.target} px`).toEqual([]);
    });
  });
}

/**
 * The simple box open in Standard at a phone's size, in a look, with the
 * camera drawer opened by its toggle.
 */
async function openPhoneCameraDrawer(page, look) {
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
    localStorage.setItem(
      'openscad-forge-ui-mode',
      JSON.stringify({ mode: 'standard', lastCustomMode: 'standard' })
    );
  }, look);
  await page.goto('/?example=simple-box', { timeout: 60_000 });
  if (look.altView) {
    test.skip(
      !(await hasWebGL(page)),
      'The Alt View draws from the 3D picture; this browser has no WebGL'
    );
  }
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
  if (look.altView) {
    await page.locator('#_hfmToggle').click();
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-ui-variant') === 'mono'
    );
  }
  const toggle = page.locator('#cameraDrawerToggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.focus();
    await page.keyboard.press('Enter');
  }
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.waitForTimeout(500);
}

/** A computed background color's alpha: rgb(), rgba() or color(... / a). */
function alphaOf(color) {
  const slash = /\/\s*([\d.]+)\s*\)$/.exec(color);
  if (slash) return Number(slash[1]);
  const rgba = /rgba\(([^)]+)\)/.exec(color);
  if (rgba) return Number(rgba[1].split(/[ ,]+/).filter(Boolean)[3]);
  return 1;
}

/** The open phone drawer's layout, read in the page. */
function readPhoneDrawer() {
  const body = document.getElementById('cameraDrawerBody');
  const box = (el) => el.getBoundingClientRect();
  const center = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  const shown = (el) => !!el && el.checkVisibility() && box(el).width > 0;
  const name = (el) =>
    el.getAttribute('aria-label') || el.dataset.level || el.textContent.trim();
  const padOf = (id) =>
    document.getElementById(id)?.closest('.camera-drawer-dpad') ?? null;
  const offCenter = (id, pad) => {
    const button = document.getElementById(id);
    if (!pad || !button || !pad.contains(button)) return null;
    const a = center(box(button));
    const b = center(box(pad));
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const rotatePad = padOf('mobileCameraRotateUp');
  const panPad = padOf('mobileCameraPanUp');
  const buttons = [...body.querySelectorAll('button')]
    .filter(shown)
    .map((b) => {
      const r = box(b);
      return { name: name(b), y: r.y, w: r.width, h: r.height };
    });
  // Alone on its row: no other button shares half of its height band.
  const lone = buttons
    .filter(
      (c) =>
        !buttons.some(
          (o) =>
            o !== c &&
            Math.min(c.y + c.h, o.y + o.h) - Math.max(c.y, o.y) >= c.h / 2
        )
    )
    .map((c) => c.name);
  return {
    viewportHeight: innerHeight,
    bodyHeight: box(body).height,
    background: getComputedStyle(body).backgroundColor,
    sideBySide:
      !!rotatePad &&
      !!panPad &&
      box(rotatePad).right <= box(panPad).left &&
      Math.abs(box(rotatePad).top - box(panPad).top) <= 2,
    resetOffCenter: offCenter('mobileCameraResetView', rotatePad),
    viewAllOffCenter: offCenter('mobileCameraViewAll', panPad),
    views: [...body.querySelectorAll('.camera-view-btn')]
      .filter(shown)
      .map((b) => b.dataset.view),
    small: buttons
      .filter((b) => b.w + 0.5 < 44 || b.h + 0.5 < 44)
      .map((b) => `${b.name} ${Math.round(b.w)}x${Math.round(b.h)}`),
    lone,
    strip: shown(document.getElementById('altViewControls')),
    asciiToggle: shown(document.getElementById('asciiDrawerToggle')),
  };
}

/** The open ASCII drawer and the bar it opens from, read in the page. */
function readAsciiDrawer() {
  const box = (el) => el.getBoundingClientRect();
  const shown = (el) => !!el && el.checkVisibility() && box(el).width > 0;
  const body = document.getElementById('asciiDrawerBody');
  const ascii = box(document.getElementById('asciiDrawerToggle'));
  const camera = box(document.getElementById('cameraDrawerToggle'));
  return {
    bodyHeight: box(body).height,
    leftOfCamera:
      Math.abs(ascii.top - camera.top) <= 1 && ascii.right <= camera.left + 1,
    steps:
      shown(document.getElementById('altViewCharactersSmallerMobile')) &&
      shown(document.getElementById('altViewCharactersLargerMobile')) &&
      [
        ...body.querySelectorAll('#altViewEdgesMobile .alt-view-level-btn'),
      ].filter(shown).length === 3 &&
      shown(document.getElementById('_hfmPanAdjustMobile')),
    small: [...body.querySelectorAll('button')]
      .filter(shown)
      .map((b) => {
        const r = box(b);
        return {
          name: b.getAttribute('aria-label') || b.textContent.trim(),
          w: r.width,
          h: r.height,
        };
      })
      .filter((b) => b.w + 0.5 < 44 || b.h + 0.5 < 44)
      .map((b) => `${b.name} ${Math.round(b.w)}x${Math.round(b.h)}`),
  };
}

// The phone camera drawer, upright: Rotate and Pan side by side with Zoom
// between them, Reset View and View All in the pads' centers, the six views
// and the tools sharing a row; at most half the screen tall, see-through
// (high contrast keeps its solid surfaces), no button alone on a row, and in
// the Alt View its own controls in the drawer rather than over the preview.
for (const height of [915, 810]) {
  for (const look of LOOKS) {
    test.describe(`The phone camera drawer, 412 x ${height}, ${look.name}`, () => {
      // No isMobile: Firefox rejects it when the browser context is created.
      test.use({ viewport: { width: 412, height }, hasTouch: true });

      test('upright: the pads side by side with their centers, half the screen at most, see-through, nothing alone', async ({
        page,
      }) => {
        test.setTimeout(WASM_READY_TIMEOUT + 60_000);
        await openPhoneCameraDrawer(page, look);
        const m = await page.evaluate(readPhoneDrawer);
        expect
          .soft(
            m.bodyHeight,
            `S6: the drawer is ${Math.round(m.bodyHeight)} px of a ${m.viewportHeight} px screen`
          )
          .toBeLessThanOrEqual(m.viewportHeight / 2 + 0.5);
        if (!look.highContrast) {
          expect
            .soft(
              alphaOf(m.background),
              `S6: the drawer is see-through (${m.background})`
            )
            .toBeLessThan(1);
        }
        expect.soft(m.sideBySide, 'S5: Rotate and Pan side by side').toBe(true);
        expect
          .soft(m.resetOffCenter, 'S5: Reset View in the Rotate pad center')
          .not.toBeNull();
        expect.soft(m.resetOffCenter ?? 99).toBeLessThanOrEqual(2);
        expect
          .soft(m.viewAllOffCenter, 'S5: View All in the Pan pad center')
          .not.toBeNull();
        expect.soft(m.viewAllOffCenter ?? 99).toBeLessThanOrEqual(2);
        expect
          .soft(m.views, 'the six standard views, no Diagonal')
          .toEqual(['top', 'front', 'right', 'left', 'back', 'bottom']);
        expect.soft(m.small, 'buttons under 44 px').toEqual([]);
        expect.soft(m.lone, 'S8: buttons alone on a row').toEqual([]);
        if (!look.altView) {
          expect
            .soft(m.asciiToggle, 'no ASCII drawer outside the Alt View')
            .toBe(false);
          return;
        }
        // The Alt View's own controls: off the preview, in the ASCII drawer
        // at the left of the bar, which opens into the camera drawer's space
        // and closes the camera drawer first.
        expect
          .soft(m.strip, "the strip's controls stay off the preview")
          .toBe(false);
        const ascii = page.locator('#asciiDrawerToggle');
        await ascii.focus();
        await page.keyboard.press('Enter');
        await expect(ascii).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#cameraDrawerToggle')).toHaveAttribute(
          'aria-expanded',
          'false'
        );
        await page.waitForTimeout(300);
        const a = await page.evaluate(readAsciiDrawer);
        expect.soft(a.leftOfCamera, 'ASCII at the left of Camera').toBe(true);
        expect
          .soft(
            Math.abs(a.bodyHeight - m.bodyHeight),
            `the ASCII drawer opens into the camera drawer's space (${Math.round(a.bodyHeight)} and ${Math.round(m.bodyHeight)} px)`
          )
          .toBeLessThanOrEqual(1);
        expect
          .soft(a.steps, "the Alt View's steps and levels in the ASCII drawer")
          .toBe(true);
        expect.soft(a.small, 'ASCII drawer buttons under 44 px').toEqual([]);
      });
    });
  }
}

// On a phone one drawer is open at a time: opening the Customizer, Preview
// Settings & Info or the camera drawer first closes whichever is open. On a
// desktop window the panels sit side by side and stay open together.
test.describe('One drawer at a time on a phone, 412 x 915', () => {
  // No isMobile: Firefox rejects it when the browser context is created.
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true });

  test('opening a drawer closes the one that is open', async ({ page }) => {
    test.setTimeout(WASM_READY_TIMEOUT + 60_000);
    await openPhoneCameraDrawer(page, LOOKS[0]);
    const camera = page.locator('#cameraDrawerToggle');
    const customizer = page.locator('#mobileDrawerToggle');
    const settings = page.locator('#previewDrawerToggle');

    // The camera drawer is open; the Customizer button closes it.
    await customizer.click();
    await expect(customizer).toHaveAttribute('aria-expanded', 'true');
    await expect(camera).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Escape');
    await expect(customizer).toHaveAttribute('aria-expanded', 'false');

    // Preview Settings & Info, then the camera drawer: it closes.
    await settings.click();
    await expect(settings).toHaveAttribute('aria-expanded', 'true');
    await camera.click();
    await expect(camera).toHaveAttribute('aria-expanded', 'true');
    await expect(settings).toHaveAttribute('aria-expanded', 'false');
    await expect(camera).toBeFocused();

    // And the other way: the camera drawer closes for Preview Settings.
    await settings.click();
    await expect(settings).toHaveAttribute('aria-expanded', 'true');
    await expect(camera).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('Panels side by side on a desktop window, 1280 x 720', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the camera panel and Preview Settings open together with the Customizer', async ({
    page,
  }) => {
    test.setTimeout(WASM_READY_TIMEOUT + 60_000);
    await openDesktopCameraProject(page, LOOKS[0], { open: true });
    const settings = page.locator('#previewDrawerToggle');
    if ((await settings.getAttribute('aria-expanded')) !== 'true') {
      await settings.click();
    }
    await expect(settings).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#cameraPanelToggle')).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    await expect(page.locator('#paramPanel')).toBeVisible();
    await expect(page.locator('#paramPanel')).not.toHaveClass(/\bcollapsed\b/);
  });
});

// The camera panel's keyboard shortcuts open as a pop-out above their button,
// inside the panel, and close the three ways a pop-out closes: its button,
// Escape, and a press anywhere else.
test.describe('The camera panel keyboard shortcuts pop-out', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('opens above its button and closes on the button, Escape and a press elsewhere', async ({
    page,
  }) => {
    test.setTimeout(WASM_READY_TIMEOUT + 60_000);
    await openDesktopCameraProject(page, LOOKS[0], { open: true });

    const button = page.locator('#cameraShortcutsBtn');
    const popout = page.locator('#cameraShortcutsPanel');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toHaveAttribute(
      'aria-controls',
      'cameraShortcutsPanel'
    );
    await expect(popout).toBeHidden();

    // Opened by the button: above it, inside the camera panel, the button
    // drawn pressed. Hover paints the same accent, so the pointer moves off
    // and the color transition ends before the colors are read.
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(popout).toBeVisible();
    await page.mouse.move(640, 400);
    await button.evaluate((el) =>
      Promise.all(el.getAnimations().map((a) => a.finished))
    );
    const boxes = await page.evaluate(() => {
      const box = (id) => document.getElementById(id).getBoundingClientRect();
      const b = document.getElementById('cameraShortcutsBtn');
      const probe = document.createElement('span');
      probe.style.cssText =
        'position:absolute;width:1px;height:1px;background:var(--color-accent);color:var(--color-accent-text)';
      b.parentElement.appendChild(probe);
      const accent = getComputedStyle(probe).backgroundColor;
      const accentText = getComputedStyle(probe).color;
      probe.remove();
      return {
        button: box('cameraShortcutsBtn'),
        popout: box('cameraShortcutsPanel'),
        panel: box('cameraPanel'),
        background: getComputedStyle(b).backgroundColor,
        color: getComputedStyle(b).color,
        accent,
        accentText,
      };
    });
    expect(boxes.popout.bottom).toBeLessThanOrEqual(boxes.button.top + 1);
    expect(boxes.popout.left).toBeGreaterThanOrEqual(boxes.panel.left - 1);
    expect(boxes.popout.right).toBeLessThanOrEqual(boxes.panel.right + 1);
    expect(boxes.background).toBe(boxes.accent);
    expect(boxes.color).toBe(boxes.accentText);

    // Escape closes it and leaves focus on the button.
    await page.keyboard.press('Escape');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(popout).toBeHidden();
    await expect(button).toBeFocused();

    // The keyboard opens it, and the button closes it.
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'false');

    // A press anywhere else closes it: here the panel's own title, which the
    // pop-out never covers.
    await button.click();
    await expect(popout).toBeVisible();
    await page.locator('#camera-controls-heading').click();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(popout).toBeHidden();
  });
});
