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
  '#lensDrawerToggle': 'up',
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

      // The Alt View reads its picture back from the graphics card while a
      // drawer moves. Where that picture is drawn in software (a CI runner
      // has no graphics card), one step can hold the page for seconds, so
      // these groups wait longer; what they measure is unchanged.
      test.slow(
        Boolean(look.altView),
        'The Alt View is drawn in software on a machine without a graphics card'
      );
      const limits = look.altView
        ? { action: 30_000, settle: 20_000, expect: 20_000 }
        : { action: 10_000, settle: 5_000, expect: 5_000 };

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
        page.setDefaultTimeout(limits.action);
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
          { timeout: limits.settle }
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
          before.expanded ? 'false' : 'true',
          { timeout: limits.expect }
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

      test('S7: a menu drops under its pressed button with nothing over the page', async () => {
        expectRule('S7');
        for (const name of MENUS) {
          const btn = page.locator(`#${name}MenuBtn`);
          await btn.click();
          await expect(page.locator(`#${name}MenuModal`)).not.toHaveClass(
            /\bhidden\b/,
            { timeout: limits.expect }
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
            /\bhidden\b/,
            { timeout: limits.expect }
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

/** The simple box open in Standard at a phone's size, in a look. */
async function openPhoneProject(page, look) {
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
}

/**
 * The simple box open in Standard at a phone's size, in a look, with the
 * camera drawer opened by its toggle.
 */
async function openPhoneCameraDrawer(page, look) {
  await openPhoneProject(page, look);
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

/** The open Lens drawer and the bar it opens from, read in the page. */
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
            .soft(m.asciiToggle, 'no Lens drawer outside the Alt View')
            .toBe(false);
          return;
        }
        // The Alt View's own controls: off the preview, in the Lens drawer
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
        expect.soft(a.leftOfCamera, 'Lens at the left of Camera').toBe(true);
        expect.soft(a.small, 'Lens drawer buttons under 44 px').toEqual([]);
      });

      test('S6: each drawer as tall as its controls, in and out of Full Screen', async ({
        page,
      }) => {
        expectRule('S6-drawers');
        test.setTimeout(WASM_READY_TIMEOUT + 60_000);
        await openPhoneCameraDrawer(page, look);
        const drawers = [['camera', '#cameraDrawerToggle', 'cameraDrawerBody']];
        if (look.altView) {
          drawers.push(['Lens', '#asciiDrawerToggle', 'asciiDrawerBody']);
        }
        const openDrawer = async (selector) => {
          const toggle = page.locator(selector);
          if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
            await toggle.focus();
            await page.keyboard.press('Enter');
          }
          await expect(toggle).toHaveAttribute('aria-expanded', 'true');
          await page.waitForTimeout(500);
        };

        for (const [name, selector, bodyId] of drawers) {
          await openDrawer(selector);
          const d = await page.evaluate(readDrawerBand, bodyId);
          expect
            .soft(
              d.band,
              `S6: the ${name} drawer is ${Math.round(d.height)} px tall for ${Math.round(d.content)} px of controls`
            )
            .toBeLessThanOrEqual(DRAWER_BAND_PX);
          expect
            .soft(
              d.height,
              `S6: the ${name} drawer at most half of a ${d.viewportHeight} px screen`
            )
            .toBeLessThanOrEqual(d.viewportHeight / 2 + 0.5);
        }

        await page.locator('#focusModeBtn').focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('#mainInterface')).toHaveClass(
          /camera-focus-mode/
        );
        await page.waitForTimeout(500);
        for (const [name, selector, bodyId] of drawers) {
          await openDrawer(selector);
          await expect(page.locator('#mainInterface')).toHaveClass(
            /camera-focus-mode/
          );
          const d = await page.evaluate(readDrawerBand, bodyId);
          const m = await page.evaluate(readFullScreenSplit, bodyId);
          expect
            .soft(
              d.band,
              `S6: in Full Screen the ${name} drawer is ${Math.round(d.height)} px tall for ${Math.round(d.content)} px of controls`
            )
            .toBeLessThanOrEqual(DRAWER_BAND_PX);
          expect
            .soft(
              m.bodyTop - m.previewFoot,
              `S6: in Full Screen the preview runs down to the ${name} drawer (the preview ends at y ${Math.round(m.previewFoot)}, the drawer begins at y ${Math.round(m.bodyTop)})`
            )
            .toBeLessThanOrEqual(SPLIT_TOLERANCE_PX);
          expect
            .soft(m.bodyBottom, `the ${name} drawer ends above the bar`)
            .toBeLessThanOrEqual(m.barTop + 1);
          expect
            .soft(m.generateReachable, 'Generate stays in reach')
            .toBe(true);
          expect
            .soft(m.generateHeight, 'Generate keeps the touch target')
            .toBeGreaterThanOrEqual(43.5);
        }

        // Leaving Full Screen, the drawer that is open goes back to its
        // controls' height, whichever drawer was opened inside Full Screen.
        await page.locator('#cameraFocusExitBtn').click();
        await expect(page.locator('#mainInterface')).not.toHaveClass(
          /camera-focus-mode/
        );
        await page.waitForTimeout(500);
        const [lastName, , lastBody] = drawers[drawers.length - 1];
        const after = await page.evaluate(readDrawerBand, lastBody);
        expect
          .soft(
            after.band,
            `S6: after Full Screen the ${lastName} drawer is ${Math.round(after.height)} px tall for ${Math.round(after.content)} px of controls`
          )
          .toBeLessThanOrEqual(DRAWER_BAND_PX);
      });

      if (look.altView) {
        test('S5: the Lens drawer holds the four sliders only', async ({
          page,
        }) => {
          expectRule('S5-ascii');
          test.setTimeout(WASM_READY_TIMEOUT + 60_000);
          await openPhoneProject(page, look);
          const ascii = page.locator('#asciiDrawerToggle');
          await ascii.focus();
          await page.keyboard.press('Enter');
          await expect(ascii).toHaveAttribute('aria-expanded', 'true');
          await page.waitForTimeout(300);
          const m = await page.evaluate(() => {
            const body = document.getElementById('asciiDrawerBody');
            const shown = (el) =>
              el.checkVisibility() && el.getBoundingClientRect().width > 0;
            return {
              sliders: [...body.querySelectorAll('input[type="range"]')]
                .filter(shown)
                .map((s) => s.id),
              others: [...body.querySelectorAll('button, fieldset')]
                .filter(shown)
                .map(
                  (el) =>
                    el.id ||
                    el.getAttribute('aria-label') ||
                    el.textContent.trim().slice(0, 20)
                ),
            };
          });
          expect
            .soft(
              m.sliders.length,
              `Edges, Focus, Glow and Surfaces (${m.sliders})`
            )
            .toBe(4);
          expect.soft(m.others, 'nothing but the sliders').toEqual([]);
        });
      }
    });
  }
}

/** The empty band under a drawer body's controls, read in the page. */
function readDrawerBand(bodyId) {
  const body = document.getElementById(bodyId);
  const r = body.getBoundingClientRect();
  const cs = getComputedStyle(body);
  let last = r.top;
  for (const el of body.querySelectorAll('*')) {
    const e = el.getBoundingClientRect();
    const ecs = getComputedStyle(el);
    if (!e.height || ecs.display === 'none' || ecs.visibility === 'hidden') {
      continue;
    }
    if (ecs.position === 'absolute' || ecs.position === 'fixed') continue;
    last = Math.max(last, e.bottom);
  }
  const content = last - r.top + (parseFloat(cs.paddingBottom) || 0);
  return {
    viewportHeight: innerHeight,
    height: r.height,
    content,
    band: r.height - content,
  };
}

/** How much taller than its controls a drawer may be: rounding and borders. */
const DRAWER_BAND_PX = 8;

/**
 * How far from half the screen each part of the Full Screen split may sit:
 * the sliver the sheets add to the preview's half, and a few pixels for the
 * preview's own inset and rounding.
 */
const SPLIT_TOLERANCE_PX = 14;

/** Full Screen with a phone drawer open: where the preview and the drawer meet. */
function readFullScreenSplit(bodyId) {
  const box = (el) => el.getBoundingClientRect();
  const body = box(document.getElementById(bodyId));
  const bar = box(document.getElementById('actionsBar'));
  const generate = document.getElementById('primaryActionBtn');
  const g = box(generate);
  const hit = document.elementFromPoint(g.x + g.width / 2, g.y + g.height / 2);
  const x = innerWidth / 2;
  let seen = 0;
  for (let y = 0; y < innerHeight; y++) {
    if (document.elementFromPoint(x, y + 0.5)?.closest('#previewContainer')) {
      seen++;
    }
  }
  let previewFoot = 0;
  for (let y = innerHeight - 1; y >= 0; y--) {
    if (document.elementFromPoint(x, y + 0.5)?.closest('#previewContainer')) {
      previewFoot = y + 1;
      break;
    }
  }
  return {
    viewportHeight: innerHeight,
    previewPx: seen,
    previewFoot,
    bodyTop: body.top,
    bodyBottom: body.bottom,
    barTop: bar.top,
    generateHeight: g.height,
    generateReachable: !!hit && generate.contains(hit),
  };
}

/** The first control on the screen that leaves Full Screen, by its id. */
function wayOutOfFullScreen() {
  for (const id of ['focusModeBtn', 'cameraFocusExitBtn']) {
    const el = document.getElementById(id);
    if (!el) continue;
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) continue;
    const hit = document.elementFromPoint(
      b.x + b.width / 2,
      b.y + b.height / 2
    );
    if (hit && el.contains(hit)) return id;
  }
  return null;
}

// On a phone, Full Screen with no drawer open, or held sideways, keeps a
// control on the screen that leaves it: a phone has no Escape key.
for (const size of [
  { width: 412, height: 915 },
  { width: 740, height: 360 },
  { width: 915, height: 412 },
]) {
  test.describe(`Leaving Full Screen on a phone, ${size.width} x ${size.height}`, () => {
    test.use({ viewport: size, hasTouch: true });

    test('a control that leaves Full Screen stays on the screen', async ({
      page,
    }) => {
      test.setTimeout(WASM_READY_TIMEOUT + 60_000);
      await openPhoneProject(page, LOOKS[0]);
      await page.locator('#focusModeBtn').focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#mainInterface')).toHaveClass(/focus-mode/);
      await page.waitForTimeout(500);

      const way = await page.evaluate(wayOutOfFullScreen);
      expect(way, 'a way out of Full Screen on the screen').not.toBeNull();
      await page.locator(`#${way}`).tap();
      await expect(page.locator('#mainInterface')).not.toHaveClass(
        /focus-mode/
      );
    });
  });
}

/** The share of the screen's height, down its middle, where the preview shows. */
function previewHeightShare() {
  const x = innerWidth / 2;
  let seen = 0;
  let total = 0;
  for (let y = 1; y < innerHeight; y += 2) {
    total++;
    if (document.elementFromPoint(x, y)?.closest('#previewContainer')) seen++;
  }
  return seen / total;
}

/** The preview canvas's box, rounded. */
function readPreviewBox() {
  const r = document
    .getElementById('previewCanvasSection')
    .getBoundingClientRect();
  return { width: Math.round(r.width), height: Math.round(r.height) };
}

/**
 * The phone Customizer pop-out's box and surfaces, read in the page. Its
 * see-through tint and blur are drawn by a layer behind it when one shows
 * (a blur on the panel would hold its pop-up lists inside it).
 */
function readPopout() {
  const panel = document.getElementById('paramPanel');
  const r = panel.getBoundingClientRect();
  const glass = document.querySelector('.customizer-glass');
  const behind =
    glass &&
    glass.checkVisibility() &&
    /rgba?\(0, 0, 0, 0\)|transparent/.test(
      getComputedStyle(panel).backgroundColor
    )
      ? glass
      : panel;
  const cs = getComputedStyle(behind);
  const header = panel.querySelector('.panel-header');
  const settings = document.querySelector('.preview-drawer-header');
  const backdrop = cs.backdropFilter || cs.webkitBackdropFilter || '';
  return {
    left: r.left,
    right: r.right,
    top: r.top,
    bottom: r.bottom,
    panelWidth: r.width,
    width: innerWidth,
    settingsBottom: settings ? settings.getBoundingClientRect().bottom : 0,
    background: cs.backgroundColor,
    backdrop,
    blurred: /blur\(/.test(backdrop),
    headerBackground: header
      ? getComputedStyle(header).backgroundColor
      : 'rgb(0, 0, 0)',
  };
}

/** The pop-out's width grip, or null when there is none on the screen. */
function readGrip() {
  const g = document.getElementById('customizerWidthGrip');
  if (!g || !g.checkVisibility()) return null;
  const r = g.getBoundingClientRect();
  return {
    role: g.getAttribute('role'),
    orientation: g.getAttribute('aria-orientation'),
    name: g.getAttribute('aria-label'),
    width: r.width,
    height: r.height,
    centerX: r.left + r.width / 2,
  };
}

/**
 * The same project opened again in the same browser, the look as it was: a
 * new start of the page that keeps what was saved. (The page drops the
 * example from its address once it opens it, so a plain reload would land
 * on the Main Page.)
 */
async function reloadPhoneProject(page, look) {
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
  if (look.altView) {
    const on = await page.evaluate(
      () => document.documentElement.getAttribute('data-ui-variant') === 'mono'
    );
    if (!on) {
      await page.locator('#_hfmToggle').click();
      await page.waitForFunction(
        () =>
          document.documentElement.getAttribute('data-ui-variant') === 'mono'
      );
    }
  }
  await page.waitForTimeout(500);
}

/** The open Customizer sheet and what is around it, read in the page. */
function readCustomizerSheet() {
  const box = (el) => el.getBoundingClientRect();
  const shown = (el) => !!el && el.checkVisibility() && box(el).width > 0;
  const sheet = document.getElementById('paramPanel');
  const s = box(sheet);
  const bar = box(document.getElementById('actionsBar'));
  const camera = document.getElementById('cameraDrawerToggle');
  const c = box(camera);
  const hit = document.elementFromPoint(c.x + c.width / 2, c.y + c.height / 2);
  const header = sheet.querySelector('.panel-header');
  const scrollTop =
    header && getComputedStyle(header).position === 'sticky'
      ? box(header).bottom
      : s.top;
  const underHeader = document.elementFromPoint(
    s.left + s.width / 2,
    scrollTop + 4
  );
  const params =
    document.getElementById('paramSearchSection') ||
    document.getElementById('parametersContainer');
  const focused = document.activeElement ? box(document.activeElement) : null;
  return {
    top: s.top,
    bottom: s.bottom,
    barTop: bar.top,
    cameraReachable: !!hit && camera.contains(hit),
    backdrop: shown(document.getElementById('drawerBackdrop')),
    modal: sheet.getAttribute('aria-modal'),
    role: sheet.getAttribute('role'),
    // The parameters in view when it opens: at the top of what scrolls when
    // the panel is short, or in view below the sections above them when the
    // panel is tall enough to hold both.
    atParameters:
      !!underHeader?.closest('#paramSearchSection, #parametersContainer') ||
      (!!params &&
        box(params).top >= scrollTop - 1 &&
        box(params).top <= s.bottom - 44),
    focusInParameters: !!document.activeElement?.closest(
      '#paramSearchSection, #parametersContainer'
    ),
    focusInView:
      !!focused &&
      focused.top >= scrollTop - 1 &&
      focused.bottom <= s.bottom + 1,
    height: s.height,
    // The least a sheet keeps: its header, one row of controls, its borders.
    floor:
      (header ? header.offsetHeight : 0) +
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--size-touch-target'
        )
      ) +
      (sheet.offsetHeight - sheet.clientHeight),
  };
}

/** Whether the bottom bar's toggles and Generate share one row. */
function readBarRow() {
  const box = (el) => el.getBoundingClientRect();
  const shown = (el) => !!el && el.checkVisibility() && box(el).width > 0;
  const ids = ['asciiDrawerToggle', 'cameraDrawerToggle', 'primaryActionBtn'];
  const boxes = ids
    .map((id) => document.getElementById(id))
    .filter(shown)
    .map(box);
  const centers = boxes.map((b) => Math.round(b.top + b.height / 2));
  const shortest = Math.min(...boxes.map((b) => b.height));
  return {
    centers,
    oneRow: Math.max(...centers) - Math.min(...centers) <= shortest / 2,
  };
}

// Phones held upright: the Customizer slides in from the left over the
// preview, see-through, at a width a person drags and that is kept; the
// preview keeps its size behind it. It is not a dialog: no backdrop, the
// preview and the bar stay usable, it opens at the parameters, Escape closes
// it, and closed it is out of the way of Tab and of a screen reader. Preview
// Settings & Info drops from its own row and leaves the preview half.
for (const height of [915, 810]) {
  for (const look of LOOKS) {
    test.describe(`The phone sheets, 412 x ${height}, ${look.name}`, () => {
      // No isMobile: Firefox rejects it when the browser context is created.
      test.use({ viewport: { width: 412, height }, hasTouch: true });

      test('S6: the Customizer opens from the left over the preview, see-through, at a width that is kept', async ({
        page,
      }) => {
        expectRule('S6-popout');
        test.setTimeout(WASM_READY_TIMEOUT * 2 + 90_000);
        await openPhoneProject(page, look);
        await page.waitForTimeout(500);
        const bar = await page.evaluate(readBarRow);
        expect
          .soft(bar.oneRow, `S8: the bottom bar on one row (${bar.centers})`)
          .toBe(true);

        const toggle = page.locator('#mobileDrawerToggle');
        const closed = await page.evaluate(readToggle, '#mobileDrawerToggle');
        expect
          .soft(closed.travel, 'S1: the Customizer comes in from the left')
          .toBe('right');
        expect
          .soft(
            angleDiff(closed.arrow ?? 999, ANGLE.right),
            `S1: the closed Customizer's arrow points at ${Math.round(closed.arrow)} degrees`
          )
          .toBeLessThanOrEqual(1);
        const before = await page.evaluate(readPreviewBox);

        const openCustomizer = async () => {
          await toggle.focus();
          await page.keyboard.press('Enter');
          await expect(toggle).toHaveAttribute('aria-expanded', 'true');
          await page.waitForTimeout(600);
        };
        const closeCustomizer = async () => {
          await toggle.focus();
          await page.keyboard.press('Enter');
          await expect(toggle).toHaveAttribute('aria-expanded', 'false');
          await page.waitForTimeout(600);
        };

        await openCustomizer();
        const c = await page.evaluate(readCustomizerSheet);
        const pop = await page.evaluate(readPopout);
        expect
          .soft(
            Math.abs(pop.left),
            'S6: the Customizer starts at the left edge'
          )
          .toBeLessThanOrEqual(1);
        expect
          .soft(
            pop.right,
            `S6: a strip of the preview at least 44 px wide stays at its right (it ends at x ${Math.round(pop.right)} of ${pop.width})`
          )
          .toBeLessThanOrEqual(pop.width - 44 + 0.5);
        expect
          .soft(
            pop.top + 1,
            `it starts below the Preview Settings row (y ${Math.round(pop.top)}, the row ends at ${Math.round(pop.settingsBottom)})`
          )
          .toBeGreaterThanOrEqual(pop.settingsBottom);
        expect
          .soft(
            Math.abs(pop.bottom - c.barTop),
            `it ends at the bar (${Math.round(pop.bottom)} and ${Math.round(c.barTop)})`
          )
          .toBeLessThanOrEqual(1);
        // Every control fits inside it at the width it opens at, the Presets
        // open: the preset buttons ran off its right edge in the Alt View.
        const spill = await page.evaluate(() => {
          const panel = document.getElementById('paramPanel')
          const presets = document.getElementById('presetControls')
          const wasOpen = presets?.open
          if (presets) presets.open = true
          const edge = panel.getBoundingClientRect().right
          const out = [...panel.querySelectorAll('button, select, input')]
            .filter((el) => el.checkVisibility())
            .filter((el) => el.getBoundingClientRect().right > edge + 0.5)
            .map((el) => `${el.id || el.getAttribute('aria-label') || el.tagName} ends at ${Math.round(el.getBoundingClientRect().right)}`)
          if (presets) presets.open = wasOpen
          return { edge: Math.round(edge), out }
        })
        expect
          .soft(spill.out, `S6: nothing past the Customizer's right edge at x ${spill.edge}`)
          .toEqual([])
        const after = await page.evaluate(readPreviewBox);
        expect
          .soft(
            Math.abs(after.width - before.width) +
              Math.abs(after.height - before.height),
            `S6: the preview keeps its size behind it (${before.width} x ${before.height} closed, ${after.width} x ${after.height} open)`
          )
          .toBeLessThanOrEqual(1);
        if (look.highContrast) {
          expect
            .soft(
              alphaOf(pop.background),
              `high contrast keeps it solid (${pop.background})`
            )
            .toBe(1);
        } else {
          expect
            .soft(
              alphaOf(pop.background),
              `S6: see-through (${pop.background})`
            )
            .toBeLessThan(1);
          expect
            .soft(
              pop.blurred,
              `S6: what is behind it is blurred (${pop.backdrop || 'none'})`
            )
            .toBe(true);
        }
        expect
          .soft(
            alphaOf(pop.headerBackground),
            `its header stays solid (${pop.headerBackground})`
          )
          .toBe(1);
        expect.soft(c.cameraReachable, 'Camera stays in reach').toBe(true);
        expect.soft(c.backdrop, 'no backdrop over the preview').toBe(false);
        expect.soft(c.modal, 'the Customizer is not modal').toBeNull();
        expect.soft(c.role, 'the Customizer is a region').toBe('region');
        expect.soft(c.atParameters, 'it opens at the parameters').toBe(true);
        expect
          .soft(c.focusInParameters, 'focus starts at the parameters')
          .toBe(true);
        expect
          .soft(c.focusInView, 'the focused control in view in the Customizer')
          .toBe(true);

        await page.keyboard.press('Escape');
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await expect(toggle).toBeFocused();
        const name = await page.evaluate(() =>
          document.getElementById('paramPanel').getAttribute('aria-labelledby')
        );
        expect
          .soft(name, 'the region keeps its name once closed')
          .toBe('parameters-heading');
        // Closed means once it has slid away.
        await page
          .locator('#paramPanel')
          .evaluate((el) =>
            Promise.all(el.getAnimations().map((a) => a.finished))
          );
        let reachedClosed = 0;
        for (let i = 0; i < 40; i++) {
          await page.keyboard.press('Tab');
          if (
            await page.evaluate(
              () => !!document.activeElement?.closest('#paramPanel')
            )
          ) {
            reachedClosed++;
          }
        }
        expect
          .soft(reachedClosed, 'Tab presses that land in the closed Customizer')
          .toBe(0);

        // The width is the person's: the grip on its right edge moves it,
        // and the width is kept when it closes and opens and after a reload.
        await openCustomizer();
        const g = await page.evaluate(readGrip);
        expect
          .soft(g, "S6: a grip on the Customizer's right edge")
          .not.toBeNull();
        if (g) {
          const open = await page.evaluate(readPopout);
          expect.soft(g.role, 'the grip is a separator').toBe('separator');
          expect
            .soft(g.orientation, 'the grip moves sideways')
            .toBe('vertical');
          expect.soft(g.name, 'the grip has a name').toBeTruthy();
          expect
            .soft(
              Math.min(g.width, g.height),
              `the grip is ${Math.round(g.width)} x ${Math.round(g.height)} px`
            )
            .toBeGreaterThanOrEqual(43.5);
          expect
            .soft(
              Math.abs(g.centerX - open.right),
              'the grip sits on the right edge'
            )
            .toBeLessThanOrEqual(g.width / 2 + 1);
          await page.locator('#customizerWidthGrip').focus();
          await page.keyboard.press('ArrowLeft');
          await page.keyboard.press('ArrowLeft');
          await page.waitForTimeout(500);
          const narrower = (await page.evaluate(readPopout)).panelWidth;
          expect
            .soft(
              narrower,
              `the arrow keys narrow it (${Math.round(open.panelWidth)} to ${Math.round(narrower)} px)`
            )
            .toBeLessThan(open.panelWidth - 1);
          await closeCustomizer();
          await openCustomizer();
          const again = (await page.evaluate(readPopout)).panelWidth;
          expect
            .soft(
              Math.abs(again - narrower),
              `the width kept when it opens again (${Math.round(narrower)} and ${Math.round(again)} px)`
            )
            .toBeLessThanOrEqual(1);
          await closeCustomizer();
          await reloadPhoneProject(page, look);
          await openCustomizer();
          const reloaded = (await page.evaluate(readPopout)).panelWidth;
          expect
            .soft(
              Math.abs(reloaded - narrower),
              `the width kept after a reload (${Math.round(narrower)} and ${Math.round(reloaded)} px)`
            )
            .toBeLessThanOrEqual(1);
        }
        await closeCustomizer();

        const settings = page.locator('#previewDrawerToggle');
        await settings.focus();
        await page.keyboard.press('Enter');
        await expect(settings).toHaveAttribute('aria-expanded', 'true');
        await page.waitForTimeout(600);
        const p = await page.evaluate(() => {
          const box = (el) => el.getBoundingClientRect();
          return {
            sectionBottom: box(document.getElementById('previewInfoSection'))
              .bottom,
            canvasTop: box(document.getElementById('previewCanvasSection')).top,
          };
        });
        expect
          .soft(
            await page.evaluate(previewHeightShare),
            'S6: the preview with Preview Settings open'
          )
          .toBeGreaterThanOrEqual(0.5);
        expect
          .soft(
            p.canvasTop,
            'Preview Settings drops from its row, the preview below it'
          )
          .toBeGreaterThanOrEqual(p.sectionBottom - 1);
      });
    });
  }
}

// A phone held sideways (a touch screen, landscape, a phone's height): the
// header keeps to one row, the menu bar shares the Preview Settings row,
// below 768 px the bottom bar keeps to one row, from 768 px the Customizer
// column starts closed; with nothing open the preview keeps at least 40
// percent of the screen; the camera controls open over the preview's right
// edge, stacked as on the desktop, see-through, at most a quarter of the
// width, every button 44 px.
const SIDEWAYS_SIZES = [
  { width: 667, height: 375 },
  { width: 740, height: 360 },
  { width: 844, height: 390 },
  { width: 915, height: 412 },
];
const SIDEWAYS_QUERY =
  '(orientation: landscape) and (pointer: coarse) and (max-height: 500px)';

/** The share of the screen where the 3D preview is the topmost thing. */
function previewShare() {
  const isPreview = (el) =>
    !!el && el.tagName === 'CANVAS' && !!el.closest('#previewContainer');
  let seen = 0;
  let total = 0;
  for (let y = 3; y < innerHeight; y += 6) {
    for (let x = 3; x < innerWidth; x += 6) {
      total++;
      if (isPreview(document.elementFromPoint(x, y))) seen++;
    }
  }
  return seen / total;
}

/** The sideways rows and the start state, read in the page. */
function readSidewaysRows() {
  const box = (el) => el.getBoundingClientRect();
  const shown = (el) => !!el && el.checkVisibility() && box(el).width > 0;
  const tops = [
    ...document.querySelectorAll(
      '.app-header button, .app-header a[href], .app-header [role="switch"]'
    ),
  ]
    .filter(shown)
    .filter((el) => !el.closest('.toolbar-menu-modal'))
    .map((el) => Math.round(box(el).top));
  const camera = document.getElementById('cameraDrawerToggle');
  const generate = document.getElementById('primaryActionBtn');
  return {
    headerRows: new Set(tops).size,
    headerTops: [...new Set(tops)],
    menusInSettingsRow: !!document
      .getElementById('toolbarMenuBar')
      ?.closest('.preview-drawer-header'),
    bottomBarOneRow:
      !shown(camera) ||
      Math.abs(box(camera).top - box(generate).top) <=
        Math.max(box(camera).height, box(generate).height) / 2,
    customizerColumnClosed:
      innerWidth < 768 ||
      document.getElementById('paramPanel').classList.contains('collapsed'),
  };
}

/** The open camera controls held sideways, read in the page. */
function readSidewaysCamera() {
  const box = (el) => el.getBoundingClientRect();
  const shown = (el) => !!el && el.checkVisibility() && box(el).width > 0;
  const open = shown(document.getElementById('cameraDrawerToggle'))
    ? document.getElementById('cameraDrawerBody')
    : document.getElementById('cameraPanel');
  const r = box(open);
  const order = [
    '.camera-drawer-rotate, .camera-section-rotate',
    '.camera-drawer-pan, .camera-section-pan',
    '.camera-drawer-zoom, .camera-section-zoom',
    '.camera-drawer-views, .camera-section-views',
  ].map((sel) => Math.round(box(open.querySelector(sel)).top));
  const bg = getComputedStyle(open).backgroundColor;
  return {
    left: r.left,
    right: r.right,
    top: r.top,
    bottom: r.bottom,
    width: r.width,
    background: bg,
    order,
    small: [...open.querySelectorAll('button')]
      .filter(shown)
      .map((b) => ({ n: b.getAttribute('aria-label'), r: box(b) }))
      .filter((b) => b.r.width + 0.5 < 44 || b.r.height + 0.5 < 44)
      .map((b) => `${b.n} ${Math.round(b.r.width)}x${Math.round(b.r.height)}`),
  };
}

for (const size of SIDEWAYS_SIZES) {
  test.describe(`A phone held sideways, ${size.width} x ${size.height}`, () => {
    // No isMobile: Firefox rejects it when the browser context is created.
    test.use({ viewport: size, hasTouch: true });

    test('one row each, the preview kept, the camera controls over its right edge', async ({
      page,
    }) => {
      test.setTimeout(WASM_READY_TIMEOUT + 60_000);
      await page.addInitScript(() => {
        localStorage.setItem('openscad-forge-first-visit-seen', 'true');
        localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
        localStorage.setItem('openscad-forge-theme', 'dark');
        localStorage.setItem(
          'openscad-forge-ui-mode',
          JSON.stringify({ mode: 'standard', lastCustomMode: 'standard' })
        );
      });
      await page.goto('/?example=simple-box', { timeout: 60_000 });
      test.skip(
        !(await page.evaluate((q) => matchMedia(q).matches, SIDEWAYS_QUERY)),
        'this browser does not report a touch screen held sideways'
      );
      await page.waitForSelector('body[data-wasm-ready="true"]', {
        state: 'attached',
        timeout: WASM_READY_TIMEOUT,
      });
      await page.waitForFunction(() => window.previewManager?.mesh, null, {
        timeout: WASM_READY_TIMEOUT,
      });
      const notNow = page.locator('#saveProjectNotNow');
      if (
        await notNow.waitFor({ state: 'visible', timeout: 3_000 }).then(
          () => true,
          () => false
        )
      ) {
        await notNow.click();
      }
      await page.waitForTimeout(1_000);

      const rows = await page.evaluate(readSidewaysRows);
      expect
        .soft(rows.headerRows, `the header in one row (${rows.headerTops})`)
        .toBe(1);
      expect
        .soft(rows.menusInSettingsRow, 'the menus in the Preview Settings row')
        .toBe(true);
      expect.soft(rows.bottomBarOneRow, 'the bottom bar in one row').toBe(true);
      expect
        .soft(
          rows.customizerColumnClosed,
          'the Customizer column starts closed'
        )
        .toBe(true);
      const share = await page.evaluate(previewShare);
      expect
        .soft(share, 'S6: the preview with nothing open')
        .toBeGreaterThanOrEqual(0.4);

      const toggle = (await page.locator('#cameraDrawerToggle').isVisible())
        ? page.locator('#cameraDrawerToggle')
        : page.locator('#cameraPanelToggle');
      await toggle.focus();
      await page.keyboard.press('Enter');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await page.waitForTimeout(500);
      const c = await page.evaluate(readSidewaysCamera);
      // The column covers its own strip of the preview and nothing more.
      const shareOpen = await page.evaluate(previewShare);
      expect
        .soft(
          shareOpen,
          `S6: the preview with the camera controls open (${shareOpen.toFixed(3)}, ${share.toFixed(3)} closed)`
        )
        .toBeGreaterThanOrEqual(share * (1 - c.width / size.width) - 0.03);
      expect
        .soft(Math.abs(c.right - size.width), 'S5: at the right edge')
        .toBeLessThanOrEqual(1);
      expect
        .soft(c.top >= 0 && c.bottom <= size.height + 0.5, 'S5: on the screen')
        .toBe(true);
      expect
        .soft(c.width / size.width, 'S5: at most a quarter of the width')
        .toBeLessThanOrEqual(0.25);
      expect
        .soft(alphaOf(c.background), `S6: see-through (${c.background})`)
        .toBeLessThan(1);
      expect
        .soft(
          c.order.every((top, i) => i === 0 || top > c.order[i - 1]),
          `S5: stacked Rotate, Pan, Zoom, the views (${c.order})`
        )
        .toBe(true);
      expect.soft(c.small, 'buttons under 44 px').toEqual([]);
    });
  });
}

// Held sideways under 768 px wide, the Customizer is a side sheet at most
// half the width, from the left edge, below the Preview Settings row; the
// preview beside it is neither dimmed nor covered and draws the model in the
// space that is left.
for (const size of SIDEWAYS_SIZES.filter((s) => s.width < 768)) {
  test.describe(`The Customizer held sideways, ${size.width} x ${size.height}`, () => {
    test.use({ viewport: size, hasTouch: true });

    test('a side sheet at most half the width, the preview live beside it', async ({
      page,
    }) => {
      test.setTimeout(WASM_READY_TIMEOUT + 60_000);
      await openPhoneProject(page, LOOKS[0]);
      test.skip(
        !(await page.evaluate((q) => matchMedia(q).matches, SIDEWAYS_QUERY)),
        'this browser does not report a touch screen held sideways'
      );
      await page.waitForTimeout(500);
      const toggle = page.locator('#mobileDrawerToggle');
      expect
        .soft(
          await toggle.getAttribute('data-travel-open'),
          'S1: held sideways the Customizer opens to the right'
        )
        .toBe('right');
      await toggle.focus();
      await page.keyboard.press('Enter');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await page.waitForTimeout(600);
      const m = await page.evaluate(() => {
        const box = (el) => el.getBoundingClientRect();
        const sheet = box(document.getElementById('paramPanel'));
        const row = box(document.querySelector('.preview-drawer-header'));
        const canvas = box(document.getElementById('previewCanvasSection'));
        const x = (sheet.right + innerWidth) / 2;
        const y = canvas.top + canvas.height / 2;
        return {
          left: sheet.left,
          right: sheet.right,
          top: sheet.top,
          width: sheet.width,
          rowBottom: row.bottom,
          canvasLeft: canvas.left,
          canvasBottom: canvas.bottom,
          barTop: box(document.getElementById('actionsBar')).top,
          besideIsPreview: !!document
            .elementFromPoint(x, y)
            ?.closest('#previewContainer'),
          backdrop: document.getElementById('drawerBackdrop').checkVisibility(),
        };
      });
      expect.soft(m.left, 'from the left edge').toBeLessThanOrEqual(0.5);
      expect
        .soft(m.width / size.width, 'at most half the width')
        .toBeLessThanOrEqual(0.5);
      expect
        .soft(m.top, 'below the Preview Settings row')
        .toBeGreaterThanOrEqual(m.rowBottom - 1);
      expect
        .soft(m.besideIsPreview, 'the preview beside it, not dimmed')
        .toBe(true);
      expect.soft(m.backdrop, 'no backdrop').toBe(false);
      expect
        .soft(m.canvasLeft, 'the model drawn in the space beside the sheet')
        .toBeGreaterThanOrEqual(m.right - 1);
      expect
        .soft(
          m.canvasBottom,
          `the preview ends at the bar (${Math.round(m.canvasBottom)} and ${Math.round(m.barTop)})`
        )
        .toBeLessThanOrEqual(m.barTop + 1);
    });
  });
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
