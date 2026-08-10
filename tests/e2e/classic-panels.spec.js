import { test, expect } from '@playwright/test';
import path from 'path';
import AxeBuilder from '@axe-core/playwright';

// Classic panels (sub-plan F, release R3a) — the Error-Log's keyboard route
// and the three panels the desktop has that Classic did not: Font List,
// Viewport-Control and Animate.
//
// Kept out of classic-mode.spec.js on purpose: that file is already 2500
// lines and 46 WASM-loading cases, and R2a had to raise the Chromium job's
// globalTimeout once already. Animation cases are slow by nature.

const SAMPLE = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
const FONT_TEXT = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'font-text.scad'
);
const ANIMATE_SPIN = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'animate-spin.scad'
);
/**
 * The owner's real 1,017-line file. Used where the FILE's own content is what
 * is being asserted — its parameter groups, its line lengths — rather than as a
 * cheap way to get the interface on screen. sample.scad stays for the latter.
 */
const UNIVERSAL_CUFF = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'universal-cuff',
  'universal_cuff_utensil_holder.scad'
);

const WASM_READY_TIMEOUT = 180_000;
const PREVIEW_TIMEOUT = 120_000;

const PANES_KEY = 'openscad-forge-classic-panes';

/**
 * Seed the pane-visibility preference so a test can open on the panels it
 * needs. They are off by default (upstream starts the same way), and F6
 * covers turning them on through the Window menu.
 */
function seedPanes(page, panes = {}) {
  return page.addInitScript(
    ([key, value]) => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem(key, JSON.stringify(value));
    },
    [
      PANES_KEY,
      {
        editorVisible: true,
        customizerVisible: true,
        consoleCollapsed: false,
        animateVisible: false,
        fontListVisible: false,
        viewportControlVisible: false,
        ...panes,
      },
    ]
  );
}

/**
 * Only mark the tour as seen. Used where the pane DEFAULTS are the point:
 * addInitScript re-runs on every navigation, so seeding panes would silently
 * re-write them during the reload a persistence test is measuring.
 */
function seedFirstVisit(page) {
  return page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
  });
}

async function loadProject(page, fixture = SAMPLE) {
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  await page.locator('#fileInput').setInputFiles(fixture);
  await expect(page.locator('#welcomeScreen')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 10_000 });

  const notNowBtn = page.locator('#saveProjectNotNow');
  try {
    await notNowBtn.waitFor({ state: 'visible', timeout: 3_000 });
    await notNowBtn.click();
  } catch {
    // Save-project modal did not appear; nothing to dismiss.
  }
}

/** The app boots Simplified, which hides the console and the Window menu. */
async function switchToStandardMode(page) {
  const toggle = page.locator('#uiModeToggle');
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  }
}

/** Classic has its own density switch, and it too starts Simplified. */
async function enterClassicStandard(page) {
  await page.locator('#classicModeToggle').click();
  await expect(page.locator('body')).toHaveAttribute('data-ui-mode', 'classic');
  const densityToggle = page.locator('#classicDensityToggle');
  await expect(densityToggle).toBeVisible({ timeout: 10_000 });
  if ((await densityToggle.getAttribute('aria-checked')) !== 'true') {
    await densityToggle.click();
  }
  await expect(page.locator('body')).toHaveAttribute(
    'data-classic-density',
    'standard'
  );
}

/**
 * CI Firefox has NO WebGL: PreviewManager initializes headless and creates no
 * canvas at all, so there is no camera to read and nothing to animate into.
 * Skip on the missing capability, never on the browser name — Firefox locally
 * does have WebGL and these cases are worth running there.
 */
async function skipWithoutRenderer(page) {
  const canvases = await page.locator('.preview-panel canvas').count();
  test.skip(
    canvases === 0,
    'no WebGL renderer: no camera, no animation target'
  );
}

async function openWindowMenuItem(page, name) {
  await page.locator('#windowMenuBtn').click();
  const item = page.getByRole('menuitemcheckbox', { name });
  await expect(item).toBeVisible({ timeout: 5_000 });
  await item.click();
}

/**
 * Every dock title bar's controls, in DOM order, with geometry. Reads the live
 * DOM rather than trusting a selector list, so a bar that gains a control is
 * covered without editing the test.
 */
function readTitlebars(page) {
  return page.evaluate(() => {
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return {
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    };
    return [
      ...document.querySelectorAll('#mainInterface .classic-pane-titlebar'),
    ]
      .filter((bar) => bar.getClientRects().length > 0)
      .map((bar) => ({
        title:
          bar.querySelector('.classic-pane-title')?.textContent || '(none)',
        bar: box(bar),
        paddingRight: getComputedStyle(bar).paddingRight,
        controls: [...bar.children]
          .filter((el) => el.tagName === 'BUTTON')
          .map((el) => ({
            kind: el.classList.contains('classic-panel-menu-btn')
              ? 'menu'
              : el.hasAttribute('aria-expanded')
                ? 'disclosure'
                : 'close',
            name: el.getAttribute('aria-label'),
            box: box(el),
          })),
      }));
  });
}

// ─── P3: title-bar control order (D1/D2) ─────────────────────────────────────

test.describe('Title-bar control order (P3)', () => {
  test('classic-titlebar-order: the close button is hard right, the move menu sits before it', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    // Every optional panel on, so "every title bar" means every one of them.
    await seedPanes(page, {
      animateVisible: true,
      fontListVisible: true,
      viewportControlVisible: true,
    });
    await loadProject(page);
    await enterClassicStandard(page);
    await expect(page.locator('.classic-panel-menu-btn').first()).toBeVisible();

    const bars = await readTitlebars(page);
    console.log('[p3] title bars:', JSON.stringify(bars, null, 2));

    expect(
      bars.length,
      'no title bars found — the probe selector is wrong'
    ).toBeGreaterThanOrEqual(4);

    let barsWithClose = 0;
    for (const bar of bars) {
      const menu = bar.controls.find((c) => c.kind === 'menu');
      const close = bar.controls.find((c) => c.kind === 'close');

      // D1: on the desktop every dock title bar's ✕ is hard against the right
      // edge. Ours may sit one padding token in, no further.
      if (close) {
        barsWithClose += 1;
        const inset = bar.bar.right - close.box.right;
        expect(
          inset,
          `${bar.title}: ✕ right edge is ${inset}px from the bar edge (padding-right ${bar.paddingRight})`
        ).toBeLessThanOrEqual(6);
        expect(
          inset,
          `${bar.title}: ✕ overflows the bar`
        ).toBeGreaterThanOrEqual(0);
      }

      if (menu && close) {
        // Visual order, and DOM order with it — a CSS-only reorder would put
        // the focus order out of step with the reading order (WCAG 2.4.3).
        expect(
          menu.box.left,
          `${bar.title}: ⋮ at x=${menu.box.left} must be left of ✕ at x=${close.box.left}`
        ).toBeLessThan(close.box.left);
        const order = bar.controls.map((c) => c.kind);
        expect(
          order.indexOf('menu'),
          `${bar.title}: DOM order is ${order.join(' → ')}`
        ).toBeLessThan(order.indexOf('close'));
      }

      // Q-1 order: the ⋮ follows the bar's disclosures.
      if (menu) {
        const order = bar.controls.map((c) => c.kind);
        const lastDisclosure = order.lastIndexOf('disclosure');
        if (lastDisclosure !== -1) {
          expect(
            order.indexOf('menu'),
            `${bar.title}: DOM order is ${order.join(' → ')}`
          ).toBeGreaterThan(lastDisclosure);
        }

        // D2: the ⋮ was a sliver flush against the bar edge. It carries the
        // touch-target token like every other pane button; 36px is that token
        // on a fine pointer, which is what Playwright's Chromium reports as.
        expect(
          menu.box.width,
          `${bar.title}: ⋮ hit area is ${menu.box.width}x${menu.box.height}px`
        ).toBeGreaterThanOrEqual(36);
        expect(menu.box.height).toBeGreaterThanOrEqual(36);
      }
    }

    // Guards the loop above: if no bar had a ✕, every close assertion was
    // skipped and the test would pass having checked nothing.
    expect(
      barsWithClose,
      'no title bar had a close button'
    ).toBeGreaterThanOrEqual(2);

    // The focus order has to agree with the reading order, or the visual fix
    // has been bought with a keyboard regression (WCAG 2.4.3).
    await page
      .getByRole('button', { name: 'Move Editor', exact: true })
      .focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#classicEditorCloseBtn')).toBeFocused();
  });
});

// ─── P4: per-panel collapse (D3) ─────────────────────────────────────────────

/**
 * Record everything the polite live region says from here on. Installed BEFORE
 * the action, because a disclosure that announces twice is only visible as a
 * count.
 */
async function watchAnnouncements(page, name = '__recordP4Announcement') {
  const seen = [];
  await page.exposeFunction(name, (text) => {
    if (text) seen.push(text);
  });
  await page.evaluate((fn) => {
    const region = document.getElementById('srAnnouncer');
    region.textContent = '';
    new MutationObserver(() => window[fn](region.textContent.trim())).observe(
      region,
      { childList: true, characterData: true, subtree: true }
    );
  }, name);
  return seen;
}

test.describe('Per-panel collapse (P4)', () => {
  test('classic-collapse-keyboard: Enter folds a panel to its title bar and says so once', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await seedPanes(page);
    await loadProject(page);
    await enterClassicStandard(page);

    const btn = page.locator('#classicEditorSlot .classic-pane-collapse-btn');
    await expect(btn).toBeVisible();
    // Static name, state in aria-expanded — never the state in the name.
    await expect(btn).toHaveAttribute('aria-label', 'Collapse Editor');
    await expect(btn).toHaveAttribute('aria-expanded', 'true');

    const openHeight = (await page.locator('#classicEditorSlot').boundingBox())
      .height;
    expect(
      openHeight,
      'the editor slot should be tall while open'
    ).toBeGreaterThan(200);

    const announcements = await watchAnnouncements(page);

    // Keyboard only: focus the button and press Enter, no click.
    await btn.focus();
    await expect(btn).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#classicEditorSlot')).toHaveAttribute(
      'data-classic-collapsed',
      'true'
    );
    // Name unchanged by the state (APG); glyph flipped for eyes.
    await expect(btn).toHaveAttribute('aria-label', 'Collapse Editor');
    await expect(btn).toHaveText('▸');

    // The point of the whole phase: the body is gone, the title bar is not.
    await expect(
      page.locator('#classicEditorSlot .classic-pane-titlebar')
    ).toBeVisible();
    const foldedHeight = (
      await page.locator('#classicEditorSlot').boundingBox()
    ).height;
    expect(
      foldedHeight,
      `collapsed slot is ${foldedHeight}px; it should be about one title bar (was ${openHeight}px)`
    ).toBeLessThan(60);

    // A collapsed disclosure must hide its content from the KEYBOARD too, not
    // merely clip it. Clipped-but-focusable was the first attempt, and it left
    // the editor toolbar reachable inside a "collapsed" panel.
    await expect(page.locator('#classicEditorSlot .classic-fold')).toBeHidden();
    const reachable = await page.evaluate(() => {
      const fold = document.querySelector('#classicEditorSlot .classic-fold');
      return [
        ...fold.querySelectorAll('button, [href], input, select, textarea'),
      ].filter((el) => el.offsetParent !== null || el.getClientRects().length)
        .length;
    });
    expect(reachable, 'a collapsed panel still offers focusable controls').toBe(
      0
    );

    await page.keyboard.press('Enter');
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await expect(btn).toHaveText('▾');

    // Owner-approved wording, 2026-08-08. Polled, not read straight off: the
    // announcer writes inside a requestAnimationFrame, so asserting on the very
    // next statement measured the frame before the message landed.
    await expect
      .poll(() => announcements.filter((t) => t === 'Editor expanded').length)
      .toBe(1);
    // Exactly once each: announceImmediate does not debounce, so a double-fire
    // would show up here as two.
    expect(
      announcements.filter((t) => t === 'Editor collapsed'),
      `announcements seen: ${JSON.stringify(announcements)}`
    ).toHaveLength(1);
    expect(
      announcements.filter((t) => t === 'Editor expanded'),
      `announcements seen: ${JSON.stringify(announcements)}`
    ).toHaveLength(1);
  });

  test('classic-collapse-persist: a collapsed panel is still collapsed after a reload', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    // seedFirstVisit, not seedPanes: addInitScript re-runs on the reload and
    // would rewrite the very preference this case is measuring.
    await seedFirstVisit(page);
    await loadProject(page);
    await enterClassicStandard(page);

    await page
      .locator('#classicErrorLogSlot .classic-pane-collapse-btn')
      .click();
    await expect(page.locator('#classicErrorLogSlot')).toHaveAttribute(
      'data-classic-collapsed',
      'true'
    );

    // `collapsed<Panel>`, not `<panel>Collapsed`: `consoleCollapsed` already
    // exists and means the whole strip is folded (D-8).
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('openscad-forge-classic-panes'))
    );
    expect(stored.collapsedErrorLog).toBe(true);
    expect(stored.collapsedEditor).toBe(false);
    expect(
      stored.consoleCollapsed,
      'the strip fold must not have been switched on by a panel collapse'
    ).toBe(false);

    await page.reload();
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });
    // A reload with no saved project lands on the welcome screen, so the
    // persisted attribute is what there is to assert, not the pixels.
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    const after = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('openscad-forge-classic-panes'))
    );
    expect(after.collapsedErrorLog).toBe(true);
  });

  test('classic-collapse-legacy-prefs: a preference saved before collapse existed still loads', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    // Exactly the shape R3a wrote — no collapse keys at all.
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem(
        'openscad-forge-classic-panes',
        JSON.stringify({
          editorVisible: true,
          customizerVisible: true,
          consoleCollapsed: false,
          animateVisible: false,
          fontListVisible: false,
          viewportControlVisible: false,
        })
      );
    });
    await loadProject(page);
    await enterClassicStandard(page);

    await expect(page.locator('#classicEditorSlot')).toHaveAttribute(
      'data-classic-collapsed',
      'false'
    );
    await expect(
      page.locator('#classicEditorSlot .classic-pane-collapse-btn')
    ).toHaveAttribute('aria-expanded', 'true');
  });

  test('classic-collapse-merged: a merged field collapses as one, and stays collapsed across tabs', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await seedPanes(page);
    await loadProject(page);
    await enterClassicStandard(page);

    // Merge Error-Log into Console's cell, so one shared bar serves both (B7).
    await page.locator('#classicErrorLogSlot .classic-panel-menu-btn').click();
    await page
      .getByRole('menuitem', { name: 'Merge with Console', exact: true })
      .click();
    const group = page.locator('.classic-dock-tabgroup');
    await expect(group).toHaveCount(1);

    const shared = group.locator('.classic-pane-collapse-btn');
    await expect(shared).toHaveCount(1);
    // Named for the group, not for whichever tab happens to be selected (Q-1).
    await expect(shared).toHaveAttribute('aria-label', 'Collapse panels');

    const announcements = await watchAnnouncements(
      page,
      '__recordMergedAnnouncement'
    );
    await shared.click();

    // Both members carry the flag, so switching tabs cannot spring it open.
    await expect(page.locator('#classicConsoleSlot')).toHaveAttribute(
      'data-classic-collapsed',
      'true'
    );
    await expect(page.locator('#classicErrorLogSlot')).toHaveAttribute(
      'data-classic-collapsed',
      'true'
    );
    await expect(group).toHaveAttribute('data-classic-collapsed', 'true');

    await page.getByRole('tab', { name: 'Error-Log', exact: true }).click();
    await expect(group).toHaveAttribute('data-classic-collapsed', 'true');
    await expect(group.locator('.classic-pane-collapse-btn')).toHaveAttribute(
      'aria-expanded',
      'false'
    );

    await expect
      .poll(() => announcements.filter((t) => t === 'Panels collapsed').length)
      .toBe(1);
    expect(
      announcements.filter((t) => t === 'Panels collapsed'),
      `announcements seen: ${JSON.stringify(announcements)}`
    ).toHaveLength(1);
  });

  test('classic-collapse-customizer: the Customizer folds to its title bar and back', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await seedPanes(page);
    await loadProject(page);
    await enterClassicStandard(page);

    const btn = page.locator('#paramPanel .classic-pane-collapse-btn');
    await expect(btn).toHaveAttribute('aria-label', 'Collapse Customizer');
    await expect(page.locator('#classicPresetRow')).toBeVisible();

    await btn.click();
    await expect(page.locator('#paramPanel')).toHaveAttribute(
      'data-classic-collapsed',
      'true'
    );
    // The Customizer has no .classic-fold — its body is siblings of the bar,
    // so this is the case that would silently do nothing if the CSS were wrong.
    await expect(page.locator('#classicPresetRow')).toBeHidden();
    await expect(page.locator('#paramPanelBody')).toBeHidden();
    await expect(
      page.locator('#paramPanel .classic-pane-titlebar')
    ).toBeVisible();

    await btn.click();
    await expect(page.locator('#classicPresetRow')).toBeVisible();
    await expect(page.locator('#paramPanelBody')).toBeVisible();
  });

  test('classic-collapse-exit: the buttons do not follow the user into Forge', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await seedPanes(page);
    await loadProject(page);
    await enterClassicStandard(page);
    await expect(
      page.locator('.classic-pane-collapse-btn').first()
    ).toBeVisible();

    // The Customizer's title bar is static markup that outlives Classic, so a
    // button left on it would appear in Forge — the trap the ⋮ already pays.
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).not.toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    await expect(page.locator('.classic-pane-collapse-btn')).toHaveCount(0);
  });
});

// ─── P5: Customizer header rows ──────────────────────────────────────────────

test.describe('Customizer header rows (P5)', () => {
  test('classic-customizer-rows: Reset ends row 1 and save preset ends row 2', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await seedPanes(page);
    await loadProject(page);
    await enterClassicStandard(page);

    const row1 = page.locator('#classicCustomizerControls');
    const row2 = page.locator('#classicPresetRow');

    // Membership: the desktop's row 1 is Automatic Preview + the detail
    // combobox + Reset, and its row 2 ends in save preset (OpenSCAD_1).
    await expect(row1.locator('#resetAllBtn')).toHaveCount(1);
    await expect(row2.locator('#savePresetBtn')).toHaveCount(1);
    await expect(
      page.locator('#classicForgeExtrasRow #resetAllBtn'),
      'Reset is a control the desktop Customizer has, so it does not belong in a section named for what it lacks'
    ).toHaveCount(0);
    await expect(
      page.locator('#classicForgeExtrasRow #savePresetBtn')
    ).toHaveCount(0);

    const readRows = () =>
      page.evaluate(() => {
        const ids = (id) =>
          [...document.getElementById(id).children].map(
            (el) => el.id || el.className
          );
        const box = (sel) => {
          const r = document.querySelector(sel).getBoundingClientRect();
          return {
            left: Math.round(r.left),
            right: Math.round(r.right),
            top: Math.round(r.top),
            height: Math.round(r.height),
          };
        };
        return {
          row1: ids('classicCustomizerControls'),
          row2: ids('classicPresetRow'),
          reset: box('#classicCustomizerControls #resetAllBtn'),
          detail: box('#classicCustomizerControls #paramDetailLevelWrap'),
          save: box('#classicPresetRow #savePresetBtn'),
          del: box('#classicPresetRow #deletePresetBtn'),
          bar: box('#classicCustomizerBar'),
        };
      });

    // Reference width. OpenSCAD_1.png is a 1920px window, and the desktop's
    // row 1 fits Automatic Preview, the detail combobox and Reset on one line
    // there. The default 1280px test viewport does not — see the narrow case
    // at the end, where wrapping is the wanted behaviour.
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(400);
    const wide = await readRows();
    console.log('[p5] header rows at 1920:', JSON.stringify(wide, null, 2));

    // Last in each row, and in the reading order too — a CSS-only nudge would
    // leave the focus order out of step (WCAG 2.4.3).
    expect(wide.row1[wide.row1.length - 1]).toBe('resetAllBtn');
    expect(wide.row2[wide.row2.length - 1]).toBe('savePresetBtn');
    expect(wide.reset.left).toBeGreaterThan(wide.detail.right - 1);
    expect(wide.save.left).toBeGreaterThan(wide.del.right - 1);
    // Both end the line, one padding token in, as they do on the desktop.
    expect(wide.bar.right - wide.reset.right).toBeLessThanOrEqual(12);
    expect(wide.bar.right - wide.save.right).toBeLessThanOrEqual(12);

    // Reset came out of Forge additions 32px tall, four short of the token and
    // visibly short beside the select it now stands next to.
    expect(
      wide.reset.height,
      `Reset is ${wide.reset.height}px tall; the detail select beside it is ${wide.detail.height}px`
    ).toBeGreaterThanOrEqual(36);

    // Still wired: Reset delegates to the Forge reset button (main.js).
    await expect(row1.locator('#resetAllBtn')).toBeEnabled();

    // Narrow: three controls do not fit one line in a 343px column, so the row
    // wraps. That is the wanted answer — the same one R2a gave the toolbars
    // rather than letting them overflow. What must NOT happen is clipping.
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(400);
    const narrow = await readRows();
    expect(
      narrow.reset.top,
      'at 1280px Reset is expected to wrap to a second line'
    ).toBeGreaterThan(narrow.detail.top);
    expect(
      narrow.reset.right,
      `Reset is clipped: right edge ${narrow.reset.right} vs bar ${narrow.bar.right}`
    ).toBeLessThanOrEqual(narrow.bar.right);
    await expect(row1.locator('#resetAllBtn')).toBeVisible();
  });

  test('classic-customizer-rows-simplified: both controls stay visible in Simplified', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await seedPanes(page);
    await loadProject(page);
    await enterClassicStandard(page);

    // Owner-approved 2026-08-08: leaving Forge additions means these two no
    // longer vanish with it in Simplified. Simplified already shows the preset
    // box with its + and −, so hiding only save would be the odd pairing.
    await page.locator('#classicDensityToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-density',
      'simplified'
    );
    await expect(page.locator('#classicForgeExtras')).toBeHidden();
    await expect(
      page.locator('#classicCustomizerControls #resetAllBtn')
    ).toBeVisible();
    await expect(
      page.locator('#classicPresetRow #savePresetBtn')
    ).toBeVisible();
  });
});

// ─── P6: Forge extras out of the Customizer column (Q-4) ─────────────────────

/** The five panels Q-4 makes Window-menu-only in Classic, in column order. */
const FORGE_EXTRAS = [
  { selector: '#measureSection', label: 'Image Measurement' },
  { selector: '#overlaySection', label: 'Reference Image' },
  { selector: '#libraryControls > details', label: 'Libraries' },
  { selector: '#projectFilesControls > details', label: 'Companion Files' },
  { selector: '#advancedMenu', label: 'Advanced' },
];

test.describe('Forge extras out of the Customizer column (P6)', () => {
  test('classic-forge-extras-hidden: parameter groups come straight after the header', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    // The real file, because the assertion is about ITS parameter groups —
    // sample.scad's first group is "Dimensions", not "Part to Print".
    await seedPanes(page);
    await loadProject(page, UNIVERSAL_CUFF);
    await enterClassicStandard(page);

    for (const { selector, label } of FORGE_EXTRAS) {
      await expect(
        page.locator(selector),
        `${label} should not be in the Classic column by default (Q-4)`
      ).toBeHidden();
    }

    // The point of the phase: nothing to walk past before the parameters.
    const gap = await page.evaluate(() => {
      const container = document.getElementById('parametersContainer');
      const firstGroup = container.querySelector('details.param-group');
      const presetRow = document.getElementById('classicPresetRow');
      // Everything focusable between the end of the header and the first group.
      // Scoped to the whole panel, not #paramPanelBody: "Forge additions" is a
      // sibling of it, and a stop a user walks past counts wherever it lives.
      const between = [
        ...document.querySelectorAll(
          '#paramPanel summary, #paramPanel button, #paramPanel input, #paramPanel select, #paramPanel [href]'
        ),
      ].filter((el) => {
        const r = el.getBoundingClientRect();
        return (
          el.getClientRects().length > 0 &&
          r.top >= presetRow.getBoundingClientRect().bottom &&
          r.bottom <= firstGroup.getBoundingClientRect().top
        );
      });
      return {
        firstGroupLabel: firstGroup
          .querySelector('summary')
          ?.textContent.trim(),
        stopsBetween: between.map((el) =>
          (el.textContent || el.getAttribute('aria-label') || el.tagName)
            .trim()
            .replace(/\s+/g, ' ')
            .slice(0, 30)
        ),
      };
    });
    console.log('[p6] before the parameters:', JSON.stringify(gap));

    // Five disclosures stood here before this phase. "Forge additions" is a
    // deliberate Forge extra (D-20) and stays, so it is the only stop left.
    expect(
      gap.stopsBetween.length,
      `stops before the parameters: ${gap.stopsBetween.join(' | ')}`
    ).toBeLessThanOrEqual(1);
    expect(gap.firstGroupLabel).toContain('Part to Print');
  });

  test('classic-forge-extras-window: each panel comes back from the Window menu, once', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await seedPanes(page);
    await loadProject(page);
    await enterClassicStandard(page);

    const announcements = await watchAnnouncements(
      page,
      '__recordForgeExtraAnnouncement'
    );

    for (const { selector, label } of FORGE_EXTRAS) {
      await openWindowMenuItem(page, label);
      await expect(
        page.locator(selector),
        `${label} should appear when its Window item is ticked`
      ).toBeVisible();

      // The tick and the CSS read one state, so the menu cannot claim a hidden
      // panel is showing — the mistake the Console tick made once.
      await page.locator('#windowMenuBtn').click();
      await expect(
        page.getByRole('menuitemcheckbox', { name: label })
      ).toHaveAttribute('aria-checked', 'true');
      await page.keyboard.press('Escape');

      await openWindowMenuItem(page, label);
      await expect(page.locator(selector)).toBeHidden();
    }

    // Once per toggle, ten toggles. Any panel announcing twice shows up here.
    // Polled in both directions: the announcer writes inside a
    // requestAnimationFrame, so the final "closed" lands after the last click
    // resolves. The counts are then asserted exactly, not just "at least one".
    for (const { label } of FORGE_EXTRAS) {
      for (const state of ['opened', 'closed']) {
        await expect
          .poll(
            () => announcements.filter((t) => t === `${label} ${state}`).length,
            {
              message: `announcements seen: ${JSON.stringify(announcements)}`,
            }
          )
          .toBe(1);
      }
    }
  });

  test('classic-forge-extras-forge-untouched: all five still sit in the Forge column', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await seedPanes(page);
    await loadProject(page);
    await switchToStandardMode(page);

    // Q-4 is a Classic decision. Forge is where these panels live.
    await expect(page.locator('body')).not.toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    for (const { selector, label } of FORGE_EXTRAS) {
      await expect(
        page.locator(selector),
        `${label} must still be in the Forge Customizer`
      ).toBeVisible();
    }
  });
});

// ─── F1: reaching the Error Log ──────────────────────────────────────────────

test.describe('Error Log reach (F1)', () => {
  test.beforeEach(async ({ page }) => {
    await seedFirstVisit(page);
  });

  test('classic-errorlog-forge: Ctrl+Alt+2 opens the Structured view and toggles back', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await loadProject(page);
    await switchToStandardMode(page);

    const consolePanel = page.locator('#consolePanel');
    const structuredTab = page.locator('#console-tab-structured');
    const openBefore = await consolePanel.evaluate((el) => el.open);
    await expect(structuredTab).toHaveAttribute('aria-selected', 'false');

    await page.keyboard.press('Control+Alt+Digit2');

    expect(await consolePanel.evaluate((el) => el.open)).toBe(true);
    await expect(structuredTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#console-view-structured')).toBeVisible();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe(
      'console-tab-structured'
    );

    // Toggling off returns to Log, and re-closes the console if we opened it.
    await page.keyboard.press('Control+Alt+Digit2');
    await expect(structuredTab).toHaveAttribute('aria-selected', 'false');
    expect(await consolePanel.evaluate((el) => el.open)).toBe(openBefore);
  });

  test('classic-errorlog-classic: Ctrl+Alt+2 focuses the strip pane and hands focus back', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await loadProject(page);
    await enterClassicStandard(page);
    await expect(page.locator('#classicErrorLogSlot')).toBeVisible();

    await page.locator('#classicModeToggle').focus();
    await page.keyboard.press('Control+Alt+Digit2');

    const landed = await page.evaluate(() => ({
      id: document.activeElement?.id,
      insideSlot: Boolean(
        document
          .getElementById('classicErrorLogSlot')
          ?.contains(document.activeElement)
      ),
    }));
    expect(landed.insideSlot).toBe(true);

    // Classic must NEVER click the hidden Structured tab (D-9).
    await expect(page.locator('#console-tab-structured')).toHaveAttribute(
      'aria-selected',
      'false'
    );

    await page.keyboard.press('Control+Alt+Digit2');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe(
      'classicModeToggle'
    );
  });

  test('classic-errorlog-fold: a folded strip unfolds before focus lands', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await loadProject(page);
    await enterClassicStandard(page);

    await page.locator('#classicConsoleFoldBtn').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-console-collapsed',
      'true'
    );

    await page.keyboard.press('Control+Alt+Digit2');
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-console-collapsed',
      'false'
    );
  });

  test('classic-strip-fold: a folded strip hides its controls from the keyboard', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await loadProject(page);
    await enterClassicStandard(page);

    await page.locator('#classicConsoleFoldBtn').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-console-collapsed',
      'true'
    );

    // The per-panel collapse learned this in P4; the older whole-strip fold
    // kept grid-template-rows: 0fr, which only CLIPS. MEASURED before the fix:
    // the strip was 0px tall but still visibility:visible, and eleven Tab stops
    // landed on invisible 13x13 checkboxes and 36x36 buttons inside it.
    // WCAG 2.2 2.4.11 Focus Not Obscured (Minimum).
    const reachable = await page.evaluate(
      () =>
        [
          ...document.querySelectorAll(
            '.classic-bottom-strip .classic-fold button, .classic-bottom-strip .classic-fold input, .classic-bottom-strip .classic-fold select, .classic-bottom-strip .classic-fold textarea, .classic-bottom-strip .classic-fold [href]'
          ),
        ].filter((el) => el.offsetParent !== null || el.getClientRects().length)
          .length
    );
    expect(
      reachable,
      'a folded strip still offers focusable controls'
    ).toBe(0);

    // Tab out of the fold button and confirm focus never lands inside.
    await page.locator('#classicConsoleFoldBtn').focus();
    const landings = [];
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(
        () =>
          !!document.activeElement?.closest(
            '.classic-bottom-strip .classic-fold'
          )
      );
      if (inside) landings.push(i);
    }
    expect(landings, 'Tab landed inside the folded strip').toEqual([]);

    // The title bars are the point of a fold — they must stay.
    await expect(
      page.locator('#classicConsoleSlot .classic-pane-titlebar')
    ).toBeVisible();
  });

  test('classic-errorlog-menu: Window > Error-Log toggles and reports its state', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await loadProject(page);
    await switchToStandardMode(page);

    await page.locator('#windowMenuBtn').click();
    const item = page.getByRole('menuitemcheckbox', { name: 'Error-Log' });
    await expect(item).toBeVisible({ timeout: 5_000 });
    await expect(item).toHaveAttribute('aria-checked', 'false');
    await item.click();

    await expect(page.locator('#console-tab-structured')).toHaveAttribute(
      'aria-selected',
      'true'
    );

    await page.locator('#windowMenuBtn').click();
    await expect(
      page.getByRole('menuitemcheckbox', { name: 'Error-Log' })
    ).toHaveAttribute('aria-checked', 'true');
  });

  test('classic-errorlog-badge: the badge element the panel writes to exists', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await loadProject(page);

    const badge = page.locator('#error-log-badge');
    await expect(badge).toBeAttached();
    // Decorative: ErrorLogPanel already announces errors and warnings, so the
    // count must not reach assistive tech a second time.
    await expect(badge).toHaveAttribute('aria-hidden', 'true');
  });
});

// ─── F2: the shared font manifest ────────────────────────────────────────────

test.describe('Font manifest (F2)', () => {
  test('classic-fonts-mount: text() renders from the manifest-driven mount', async ({
    page,
  }) => {
    test.setTimeout(300_000);

    // "Font mounting complete: 4 mounted, 0 failed" is the SUCCESS line and
    // must not be mistaken for a failure just because it contains "failed".
    const FAILURES = [
      /Font not found:/i,
      /Failed to mount font/i,
      /No fonts mounted/i,
      /invalid TTF header/i,
    ];
    const failures = [];
    const summaries = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (FAILURES.some((re) => re.test(text))) failures.push(text);
      if (/Font mounting complete/i.test(text)) summaries.push(text);
    });

    await seedFirstVisit(page);
    await loadProject(page, FONT_TEXT);
    await switchToStandardMode(page);

    // A preview that reaches "current" means OpenSCAD produced geometry from
    // text(), which it cannot do without the fonts mounted.
    await expect(page.locator('.preview-state-indicator')).toHaveClass(
      /state-current/,
      { timeout: PREVIEW_TIMEOUT }
    );

    const details = page.locator('#consolePanel');
    if (!(await details.evaluate((el) => el.open))) {
      await details.locator('summary').click();
    }
    const consoleText =
      (await page.locator('#console-output').textContent()) || '';
    expect(consoleText).not.toMatch(/Can't find font/i);
    expect(consoleText).not.toMatch(/unknown font/i);

    expect(failures).toEqual([]);
    expect(summaries.length).toBeGreaterThan(0);
    for (const line of summaries) {
      expect(line).toMatch(/4 mounted, 0 failed/);
    }
  });
});

// ─── F3: Font List panel ─────────────────────────────────────────────────────

test.describe('Font List panel (F3)', () => {
  test.beforeEach(async ({ page }) => {
    await seedPanes(page, { fontListVisible: true });
  });

  test('classic-fontlist-rows: the panel is in its dock slot listing the real fonts', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await loadProject(page);
    await enterClassicStandard(page);

    await expect(
      page.locator('#classicFontListSlot #fontListPanel')
    ).toHaveCount(1);
    await expect(page.locator('#fontListRows tr')).toHaveCount(4);
    await expect(page.locator('#fontListRows')).toContainText(
      'Liberation Sans'
    );
    await expect(page.locator('#fontListRows')).toContainText(
      'Liberation Mono'
    );
  });

  test('classic-fontlist-filter: "mono" narrows to one row, nonsense to none', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await loadProject(page);
    await enterClassicStandard(page);

    await page.locator('#fontListFilterText').fill('mono');
    await expect(page.locator('#fontListRows tr')).toHaveCount(1);
    await expect(page.locator('#fontListRows')).toContainText(
      'Liberation Mono'
    );

    await page.locator('#fontListFilterText').fill('Comic Sans');
    await expect(page.locator('#fontListRows tr')).toHaveCount(0);
    await expect(page.locator('#fontListEmpty')).toBeVisible();
  });

  test('classic-fontlist-regexp: an unfinished pattern hints without blanking', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await loadProject(page);
    await enterClassicStandard(page);

    await page.locator('#fontListFilterMode').selectOption('regexp');
    await page.locator('#fontListFilterText').fill('[abc');

    const hint = page.locator('#fontListFilterHint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('pattern');
    // Non-blocking: every font is still listed.
    await expect(page.locator('#fontListRows tr')).toHaveCount(4);

    await page.locator('#fontListFilterText').fill('mono$');
    await expect(hint).toBeHidden();
    await expect(page.locator('#fontListRows tr')).toHaveCount(1);
  });

  test('classic-fontlist-selection: picking a row fills Selection and enables Copy', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await loadProject(page);
    await enterClassicStandard(page);

    const copyBtn = page.locator('#fontListCopyBtn');
    await expect(copyBtn).toBeDisabled();
    await expect(page.locator('#fontListSelName')).toHaveText('—');

    // The radio is labelled with the font, so it is reachable by name — the
    // accessible equivalent of upstream's drag-a-row.
    await page.locator('#classicFontListSlot').scrollIntoViewIfNeeded();
    await page.getByRole('radio', { name: 'Liberation Mono' }).check();

    await expect(page.locator('#fontListSelName')).toHaveText(
      'Liberation Mono'
    );
    await expect(page.locator('#fontListSelStyle')).toHaveText('Regular');
    await expect(page.locator('#fontListSelPath')).toContainText(
      '/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf'
    );
    await expect(copyBtn).toBeEnabled();
  });

  test('classic-fontlist-chars-disabled: the Chars filter says why it cannot work', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await loadProject(page);
    await enterClassicStandard(page);

    const chars = page.locator('#fontListChars');
    await expect(chars).toBeDisabled();
    await expect(chars).toHaveAttribute(
      'aria-describedby',
      'fontListCharsReason'
    );
    await expect(page.locator('#fontListCharsReason')).toContainText(
      'not available yet'
    );
  });
});

// ─── F4: Viewport-Control panel ──────────────────────────────────────────────

test.describe('Viewport-Control panel (F4)', () => {
  test.beforeEach(async ({ page }) => {
    await seedPanes(page, { viewportControlVisible: true });
  });

  test('classic-viewport-read: the panel reads the live camera', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await loadProject(page);
    await enterClassicStandard(page);
    await skipWithoutRenderer(page);

    await expect(
      page.locator('#classicViewportControlSlot #viewportControlPanel')
    ).toHaveCount(1);

    await expect
      .poll(async () => Number(await page.locator('#vpDistance').inputValue()))
      .toBeGreaterThan(0);

    // Width/Height report the live canvas size and cannot be set.
    await expect(page.locator('#vpWidth')).toHaveAttribute('readonly', '');
    await expect
      .poll(async () => Number(await page.locator('#vpWidth').inputValue()))
      .toBeGreaterThan(0);
  });

  test('classic-viewport-orbit: the fields track an orbit', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await loadProject(page);
    await enterClassicStandard(page);
    await skipWithoutRenderer(page);

    const rx = page.locator('#vpRx');
    await expect
      .poll(async () => (await rx.inputValue()).length)
      .toBeGreaterThan(0);
    const before = await rx.inputValue();

    const box = await page.locator('.preview-panel canvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i += 1) {
      await page.mouse.move(
        box.x + box.width / 2 + i * 10,
        box.y + box.height / 2 + i * 6
      );
    }
    await page.mouse.up();

    // Damping keeps the camera moving after mouse-up, so poll, never sample.
    await expect.poll(async () => rx.inputValue()).not.toBe(before);
  });

  test('classic-viewport-write: a typed translation moves the camera', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await loadProject(page);
    await enterClassicStandard(page);
    await skipWithoutRenderer(page);

    const tz = page.locator('#vpTz');
    await expect
      .poll(async () => (await tz.inputValue()).length)
      .toBeGreaterThan(0);

    await tz.fill('42');
    await tz.press('Enter');

    // The value survived the round trip through the camera and back.
    await expect
      .poll(async () => Number(await tz.inputValue()))
      .toBeCloseTo(42, 1);
    expect(
      Number(await page.locator('#vpDistance').inputValue())
    ).toBeGreaterThan(0);
  });

  test('classic-viewport-ortho: orthographic disables FOV', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await loadProject(page);
    await enterClassicStandard(page);
    await skipWithoutRenderer(page);

    const fov = page.locator('#vpFov');
    await expect(fov).toBeEnabled();
    await expect
      .poll(async () => Number(await fov.inputValue()))
      .toBeGreaterThan(0);

    // Switching projection need not move the camera, so OrbitControls emits no
    // 'change' — the panel hears preview-projection-change instead.
    await page.locator('#classicTbOrthogonalBtn').click();
    await expect.poll(async () => fov.isDisabled()).toBe(true);

    await page.locator('#classicTbPerspectiveBtn').click();
    await expect.poll(async () => fov.isDisabled()).toBe(false);
  });

  test('classic-viewport-silent: orbiting says nothing to a screen reader', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await loadProject(page);
    await enterClassicStandard(page);
    await skipWithoutRenderer(page);

    // Assert the panel is actually here first: "nothing announced" is trivially
    // true of a panel that does not exist, and this case must not be able to
    // pass that way.
    await expect(page.locator('#viewportControlPanel')).toBeVisible();
    await expect
      .poll(async () => (await page.locator('#vpDistance').inputValue()).length)
      .toBeGreaterThan(0);

    // The camera emits ~60 change events a second; a live region on that feed
    // would talk over the whole page.
    const liveRegions = await page
      .locator(
        '#viewportControlPanel [aria-live], #viewportControlPanel [role="status"], #viewportControlPanel [role="alert"]'
      )
      .count();
    expect(liveRegions).toBe(0);

    // Record every announcement made while orbiting. Asserting the announcer
    // is globally EMPTY over-reaches — unrelated parts of the app legitimately
    // announce, and on Firefox "Preview ready" landed inside the window. What
    // must be true is that the PANEL says nothing.
    const announcements = [];
    await page.exposeFunction('__recordOrbitAnnouncement', (text) => {
      if (text) announcements.push(text);
    });
    await page.evaluate(() => {
      const region = document.getElementById('srAnnouncer');
      region.textContent = '';
      new MutationObserver(() =>
        window.__recordOrbitAnnouncement(region.textContent.trim())
      ).observe(region, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    });

    const box = await page.locator('.preview-panel canvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 15; i += 1) {
      await page.mouse.move(
        box.x + box.width / 2 + i * 8,
        box.y + box.height / 2 + i * 5
      );
    }
    await page.mouse.up();
    await page.waitForTimeout(1500);

    // Nothing the panel could have said about the camera.
    const cameraChatter = announcements.filter((t) =>
      /translation|rotation|distance|field of view|fov|camera|viewport/i.test(t)
    );
    expect(cameraChatter).toEqual([]);

    // And nothing announced per frame. The drag produced ~118 camera events;
    // even a throttled per-frame announcer would speak 15+ times in this
    // window, while unrelated app chatter ("Preview ready") is one or two.
    // Five sits between those two populations, so the check still separates
    // them without failing on whichever unrelated message happens to land.
    expect(announcements.length).toBeLessThanOrEqual(5);
  });

  test('classic-viewport-typing: the camera never overwrites a focused field', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await loadProject(page);
    await enterClassicStandard(page);
    await skipWithoutRenderer(page);

    const tx = page.locator('#vpTx');
    await expect
      .poll(async () => (await tx.inputValue()).length)
      .toBeGreaterThan(0);

    await tx.click();
    await tx.fill('123');

    await page.evaluate(() => {
      document
        .querySelector('.preview-panel canvas')
        ?.dispatchEvent(
          new WheelEvent('wheel', { deltaY: -200, bubbles: true })
        );
    });
    await page.waitForTimeout(400);

    expect(await tx.inputValue()).toBe('123');
  });
});

// ─── F5: Animate panel ───────────────────────────────────────────────────────

test.describe('Animate panel (F5)', () => {
  test.beforeEach(async ({ page }) => {
    await seedPanes(page, { animateVisible: true });
  });

  /**
   * Worker define-args prove $t really reached OpenSCAD.
   *
   * Read through msg.args() rather than msg.text(): Firefox renders an array
   * argument as the literal string "Array", so the flags never appear in the
   * text form and the assertion would fail on a working build.
   */
  function collectDefineArgs(page) {
    const lines = [];
    page.on('console', (msg) => {
      // ONLY the animation's own diagnostics. renderAnimationFrame logs under
      // "[Animate Diag]" and the ordinary preview path under "[AutoPreview
      // Diag]"; counting both would let a stray auto-preview render satisfy an
      // assertion about animation frames, which is exactly what happened on
      // Firefox.
      if (!msg.text().includes('[Animate Diag] Worker defineArgs')) return;
      Promise.all(
        msg.args().map((arg) => arg.jsonValue().catch(() => null))
      ).then(
        (values) => lines.push(JSON.stringify(values)),
        () => lines.push(msg.text())
      );
    });
    return lines;
  }

  async function openAnimate(page) {
    await loadProject(page, ANIMATE_SPIN);
    await enterClassicStandard(page);
    await expect(page.locator('#classicAnimateSlot')).toBeVisible();
    await expect(page.locator('.preview-state-indicator')).toHaveClass(
      /state-current/,
      { timeout: PREVIEW_TIMEOUT }
    );
  }

  test('classic-animate-buttons: five playback buttons, every glyph resolving', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openAnimate(page);

    await expect(page.locator('#classicAnimateSlot #animatePanel')).toHaveCount(
      1
    );
    for (const id of [
      '#animateStartBtn',
      '#animateStepBackBtn',
      '#animatePlayBtn',
      '#animateStepForwardBtn',
      '#animateEndBtn',
    ]) {
      await expect(page.locator(id)).toBeVisible();
    }

    const missing = await page.evaluate(() =>
      [...document.querySelectorAll('#animatePanel .classic-icon')]
        .filter((el) => {
          const bg = getComputedStyle(el).backgroundImage;
          return !bg || bg === 'none';
        })
        .map((el) => el.dataset.icon)
    );
    expect(missing).toEqual([]);
  });

  test('classic-animate-step: stepping renders a frame carrying $t', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const defineArgs = collectDefineArgs(page);
    await openAnimate(page);
    await skipWithoutRenderer(page);

    const before = defineArgs.length;
    await page.locator('#animateStepForwardBtn').click();

    await expect
      .poll(() => defineArgs.length, { timeout: PREVIEW_TIMEOUT })
      .toBeGreaterThan(before);
    expect(defineArgs.slice(before).join('\n')).toContain('$t');

    await expect
      .poll(async () => Number(await page.locator('#animateTime').inputValue()))
      .toBeGreaterThan(0);
  });

  test('classic-animate-play: play renders at least two frames, pause stops it', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const defineArgs = collectDefineArgs(page);
    await openAnimate(page);
    await skipWithoutRenderer(page);

    const before = defineArgs.length;
    const playBtn = page.locator('#animatePlayBtn');
    await expect(playBtn).toHaveAttribute('aria-label', 'Play animation');

    await playBtn.click();
    await expect(playBtn).toHaveAttribute('aria-pressed', 'true');
    // The name says what pressing it will DO, not what state it is in.
    await expect(playBtn).toHaveAttribute('aria-label', 'Pause animation');

    await expect
      .poll(() => defineArgs.length - before, { timeout: PREVIEW_TIMEOUT })
      .toBeGreaterThanOrEqual(2);

    await playBtn.click();
    await expect(playBtn).toHaveAttribute('aria-pressed', 'false');

    // The frame already inside the worker still completes — a blocking WASM
    // render cannot be cancelled mid-flight — but nothing follows it.
    const atPause = defineArgs.length;
    await page.waitForTimeout(3000);
    const afterInFlight = defineArgs.length;
    expect(afterInFlight - atPause).toBeLessThanOrEqual(1);
    await page.waitForTimeout(4000);
    expect(defineArgs.length).toBe(afterInFlight);
  });

  test('classic-animate-announce: playback announces once, not once per frame', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openAnimate(page);
    await skipWithoutRenderer(page);

    const announcements = [];
    await page.exposeFunction('__recordAnnouncement', (text) => {
      if (text) announcements.push(text);
    });
    await page.evaluate(() => {
      const region = document.getElementById('srAnnouncer');
      new MutationObserver(() =>
        window.__recordAnnouncement(region.textContent.trim())
      ).observe(region, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    });

    await page.locator('#animatePlayBtn').click();
    await page.waitForTimeout(6000);
    await page.locator('#animatePlayBtn').click();

    expect(announcements.filter((t) => t === 'Animation playing')).toHaveLength(
      1
    );
  });

  test('classic-animate-yield: an external render stops playback for good', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openAnimate(page);
    await skipWithoutRenderer(page);

    const playBtn = page.locator('#animatePlayBtn');
    await playBtn.click();
    await expect(playBtn).toHaveAttribute('aria-pressed', 'true');

    // Render goes through renderFull(), which sets no preview state — the
    // panel hears onFullRenderStart instead.
    await page.locator('#classicRenderBtn').click();
    await expect(playBtn).toHaveAttribute('aria-pressed', 'false', {
      timeout: PREVIEW_TIMEOUT,
    });

    // And it stays stopped rather than quietly picking back up.
    await page.waitForTimeout(3000);
    await expect(playBtn).toHaveAttribute('aria-pressed', 'false');
  });

  test('classic-animate-dump-disabled: Dump Pictures says why it cannot work', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openAnimate(page);

    const dump = page.locator('#animateDumpPictures');
    await expect(dump).toBeDisabled();
    await expect(dump).toHaveAttribute('aria-describedby', 'animateDumpReason');
    await expect(page.locator('#animateDumpReason')).toContainText(
      'not available'
    );
  });
});

// ─── F6: Window-menu toggles and persistence ─────────────────────────────────

const OPTIONAL_PANELS = [
  { name: 'Viewport-Control', slot: '#classicViewportControlSlot' },
  { name: 'Animate', slot: '#classicAnimateSlot' },
  { name: 'Font List', slot: '#classicFontListSlot' },
];

test.describe('Window-menu toggles (F6)', () => {
  test.beforeEach(async ({ page }) => {
    await seedFirstVisit(page);
  });

  test('classic-panel-toggles: each panel toggles and reports its state', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await loadProject(page);
    await enterClassicStandard(page);

    for (const panel of OPTIONAL_PANELS) {
      await expect(page.locator(panel.slot)).toBeHidden();

      await openWindowMenuItem(page, panel.name);
      await expect(page.locator(panel.slot)).toBeVisible();

      await page.locator('#windowMenuBtn').click();
      await expect(
        page.getByRole('menuitemcheckbox', { name: panel.name })
      ).toHaveAttribute('aria-checked', 'true');
      await page.keyboard.press('Escape');

      await openWindowMenuItem(page, panel.name);
      await expect(page.locator(panel.slot)).toBeHidden();
    }
  });

  test('classic-viewport-menu-live: Viewport-Control is no longer a disabled action', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await loadProject(page);
    await enterClassicStandard(page);

    await page.locator('#windowMenuBtn').click();
    const item = page.getByRole('menuitemcheckbox', {
      name: 'Viewport-Control',
    });
    await expect(item).toBeVisible();
    await expect(item).not.toHaveAttribute('aria-disabled', 'true');
    await expect(item).toHaveAttribute('aria-checked', 'false');
  });

  test('classic-panel-persist: the pane preferences survive a reload', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await loadProject(page);
    await enterClassicStandard(page);

    await openWindowMenuItem(page, 'Animate');
    await openWindowMenuItem(page, 'Font List');
    await expect(page.locator('#classicAnimateSlot')).toBeVisible();
    await expect(page.locator('#classicFontListSlot')).toBeVisible();

    await page.reload();
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );

    // A reload with no saved project returns to Welcome, so #mainInterface is
    // hidden and nothing inside it is "visible" — the same reason
    // classic-dock-persist asserts parentage rather than visibility. What has
    // to survive is the preference.
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-animate-visible',
      'true'
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-font-list-visible',
      'true'
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-viewport-control-visible',
      'false'
    );
    await expect(page.locator('#classicAnimateSlot')).toBeAttached();
    await expect(page.locator('#classicFontListSlot')).toBeAttached();
  });

  test('classic-panel-forge-clean: the panels stay out of the Forge layouts (D-32)', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await loadProject(page);
    await enterClassicStandard(page);
    for (const panel of OPTIONAL_PANELS) {
      await openWindowMenuItem(page, panel.name);
    }

    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).not.toHaveAttribute(
      'data-ui-mode',
      'classic'
    );

    for (const panel of OPTIONAL_PANELS) {
      await expect(page.locator(panel.slot)).toHaveCount(0);
    }
    for (const id of [
      '#fontListPanel',
      '#viewportControlPanel',
      '#animatePanel',
    ]) {
      await expect(page.locator(id)).toHaveCount(1);
      await expect(page.locator(id)).toBeHidden();
    }
  });
});

// ─── The dock: each new panel moves and merges like the ones already there ───

test.describe('New panels inside the dock (B6-B9)', () => {
  test.beforeEach(async ({ page }) => {
    await seedPanes(page, {
      animateVisible: true,
      fontListVisible: true,
      viewportControlVisible: true,
    });
  });

  test('classic-panel-move: a new panel relocates and keeps its listeners', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await loadProject(page);
    await enterClassicStandard(page);

    await page.locator('#fontListFilterText').fill('mono');
    await expect(page.locator('#fontListRows tr')).toHaveCount(1);

    await page.locator('#classicFontListSlot').scrollIntoViewIfNeeded();
    await page.locator('#classicFontListSlot .classic-panel-menu-btn').click();
    await page
      .locator('.classic-panel-menu [role="menuitem"]', {
        hasText: 'Move to left column',
      })
      .click();

    await expect(
      page.locator('#classicFieldLeft #classicFontListSlot')
    ).toHaveCount(1);

    // Re-parenting is appendChild, so the listeners came too.
    await expect(page.locator('#fontListRows tr')).toHaveCount(1);
    await page.locator('#fontListFilterText').fill('');
    await expect(page.locator('#fontListRows tr')).toHaveCount(4);
  });

  test('classic-panel-merge: a new panel merges into a tab group and splits back out', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await loadProject(page);
    await enterClassicStandard(page);

    await page
      .locator('#classicViewportControlSlot .classic-panel-menu-btn')
      .click();
    await page
      .locator('.classic-panel-menu [role="menuitem"]', {
        hasText: 'Merge with Customizer',
      })
      .click();

    // A merged field draws a real tablist with the panel as a tabpanel.
    const tablist = page.getByRole('tablist', { name: 'Upper right panels' });
    await expect(tablist).toBeVisible();
    await expect(
      tablist.getByRole('tab', { name: 'Viewport-Control' })
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#classicViewportControlSlot')).toHaveAttribute(
      'role',
      'tabpanel'
    );

    // Its fields still work while merged.
    await expect(page.locator('#vpDistance')).toBeVisible();

    // Splitting is the same move operation with a different target — but the
    // menu now lives on the group's SHARED bar, because a merged group shows
    // the active panel's title bar moved into it (B7). The button is renamed
    // for the group and its items name their subject.
    await page
      .getByRole('button', { name: 'Move panels', exact: true })
      .click();
    await page
      .locator('.classic-panel-menu [role="menuitem"]', {
        hasText: 'Move Viewport-Control to lower right',
      })
      .click();

    await expect(
      page.getByRole('tablist', { name: 'Upper right panels' })
    ).toHaveCount(0);
    await expect(
      page.locator('#classicViewportControlSlot')
    ).not.toHaveAttribute('role', 'tabpanel');
  });
});

// ─── F7: appearance, targets and accessibility ───────────────────────────────

test.describe('Panels CSS and accessibility (F7)', () => {
  test.beforeEach(async ({ page }) => {
    await seedPanes(page, {
      animateVisible: true,
      fontListVisible: true,
      viewportControlVisible: true,
    });
  });

  test('classic-panels-targets: controls meet the touch-target token', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await loadProject(page);
    await enterClassicStandard(page);

    // The TOKEN, whatever the pointer type resolved it to — 44px touch,
    // 36px fine-pointer per the app-wide override. Never a literal 44.
    const target = await page.evaluate(() =>
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--size-touch-target'
        )
      )
    );
    expect(target).toBeGreaterThan(0);

    for (const selector of [
      '#fontListFilterText',
      '#fontListFilterMode',
      '#fontListCopyBtn',
      '#vpTx',
      '#vpDistance',
      '#animateFps',
      '#animatePlayBtn',
    ]) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      const box = await page.locator(selector).boundingBox();
      expect(box, `${selector} has no box`).not.toBeNull();
      expect(box.height, `${selector} height`).toBeGreaterThanOrEqual(
        target - 1
      );
    }
  });

  test('classic-panels-focus: every panel input shows a focus ring', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await loadProject(page);
    await enterClassicStandard(page);

    // components.css gives buttons and [tabindex] a global ring but not
    // input/select, so these panels carry their own.
    for (const selector of ['#fontListFilterText', '#vpTx', '#animateFps']) {
      await page.locator(selector).focus();
      const outline = await page.locator(selector).evaluate((el) => {
        const s = getComputedStyle(el);
        return { width: s.outlineWidth, style: s.outlineStyle };
      });
      expect(outline.style, `${selector} outline-style`).not.toBe('none');
      expect(
        parseFloat(outline.width),
        `${selector} outline-width`
      ).toBeGreaterThan(0);
    }
  });

  test('classic-panels-narrow: below 1024px the panels stack, capped at 40vh (D-6)', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await loadProject(page);
    await enterClassicStandard(page);

    await page.setViewportSize({ width: 900, height: 800 });
    await page.waitForTimeout(400);

    const cap = 0.4 * 800;
    for (const slot of [
      '#classicFontListSlot',
      '#classicAnimateSlot',
      '#classicConsoleSlot',
    ]) {
      const box = await page.locator(slot).boundingBox();
      if (!box) continue;
      expect(box.height, `${slot} exceeds the 40vh cap`).toBeLessThanOrEqual(
        cap + 2
      );
    }

    // Viewport-Control is desktop-only (D-7) and its field goes with it.
    await expect(page.locator('#classicViewportControlSlot')).toBeHidden();
  });

  test('classic-panels-no-hscroll: no phantom page scroll at 375px', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await loadProject(page);
    await enterClassicStandard(page);

    // sr-only spans are position:absolute; in a static container they resolve
    // against <html> and poke past the viewport — the 31px bug R2a paid for.
    for (const width of [375, 900]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(
        0
      );
    }
  });

  test('classic-panels-axe: the new panels add no axe violations', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await loadProject(page);
    await enterClassicStandard(page);

    const results = await new AxeBuilder({ page })
      .include('#mainInterface')
      .analyze();

    // Classic's default arrangement reports exactly two pre-existing
    // violations, measured in R2b and neither of them Classic's doing:
    // nested-interactive on Forge <summary> elements containing buttons, and
    // scrollable-region-focusable on CodeMirror's tabindex="-1" scroller.
    //
    // Node counts moved in R-II and are worth recording: nested-interactive
    // fell from 11 nodes to 2, because P6 took five Forge panels out of the
    // Classic column and their summaries went with them. Two rules is still
    // the ceiling; a third would fail here, as aria-required-parent did when
    // P7 gave the console its status lines back and twenty role="listitem"
    // entries appeared inside a role="log" that is not a list.
    //
    // The second is a false positive, measured in P2: axe does not count a
    // contenteditable child as focusable content, but .cm-content is reached
    // by Tab and PageDown scrolls the region (scrollTop 0 -> 4365). Putting
    // tabindex="0" on the scroller would silence axe at the cost of a second,
    // redundant tab stop on a region the keyboard already reaches. Do not.
    const allowed = ['nested-interactive', 'scrollable-region-focusable'];
    const unexpected = results.violations
      .map((v) => v.id)
      .filter((id) => !allowed.includes(id));
    expect(
      unexpected,
      `unexpected axe violations: ${unexpected.join(', ')}`
    ).toEqual([]);
  });
});

// ─── P8: status-bar viewport telemetry ───────────────────────────────────────

test.describe('Status-bar viewport telemetry (P8)', () => {
  test('classic-status-telemetry: the pose is on the bar and matches the camera', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await seedPanes(page);
    await loadProject(page, UNIVERSAL_CUFF);
    await enterClassicStandard(page);
    await skipWithoutRenderer(page);

    const viewport = page.locator('#classicStatusViewport');
    await expect
      .poll(() => viewport.textContent(), { timeout: 60_000 })
      .toMatch(/^Viewport: translate = \[/);

    // The desktop's line, verbatim in shape (OpenSCAD_1).
    const text = await viewport.textContent();
    console.log('[p8] status line:', text);
    expect(text).toMatch(
      /^Viewport: translate = \[ -?\d+\.\d\d -?\d+\.\d\d -?\d+\.\d\d \], rotate = \[ -?\d+\.\d\d -?\d+\.\d\d -?\d+\.\d\d \], distance = \d+\.\d\d(, fov = \d+\.\d\d)? \(\d+x\d+\)$/
    );
    // A rotation a hair below zero must read 0.00, not -0.00.
    expect(text, 'negative zero reached the status bar').not.toContain('-0.00');

    // Cross-checked against the camera itself, not against our own formatter.
    const pose = await page.evaluate(() => window.__forgeDebug.cameraPose());
    const shown = text.match(/translate = \[ ([-\d. ]+) \]/)[1].split(' ');
    for (const [i, axis] of ['x', 'y', 'z'].entries()) {
      expect(
        Number(shown[i]),
        `translate ${axis} on the bar vs the live camera target`
      ).toBeCloseTo(pose.target[i], 1);
    }
    const distance = Number(text.match(/distance = ([\d.]+)/)[1]);
    const expected = Math.hypot(
      pose.position[0] - pose.target[0],
      pose.position[1] - pose.target[1],
      pose.position[2] - pose.target[2]
    );
    expect(distance, 'distance on the bar vs the live camera').toBeCloseTo(
      expected,
      1
    );
  });

  test('classic-status-silent: orbiting says nothing to a screen reader', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await seedPanes(page);
    await loadProject(page, UNIVERSAL_CUFF);
    await enterClassicStandard(page);
    await skipWithoutRenderer(page);
    await expect
      .poll(() => page.locator('#classicStatusViewport').textContent(), {
        timeout: 60_000,
      })
      .toMatch(/^Viewport:/);

    // The whole point of the phase. The camera's feed fires ~118 times per
    // drag; if the telemetry were inside the bar's live region a screen reader
    // would read a pose ten times a second.
    const placement = await page.evaluate(() => {
      const bar = document.getElementById('classicStatusBar');
      const span = document.getElementById('classicStatusViewport');
      return {
        barHasAriaLive: bar.hasAttribute('aria-live'),
        barRole: bar.getAttribute('role'),
        telemetryInLiveRegion: Boolean(span.closest('[aria-live]')),
        // Still navigable: not hidden from assistive tech, just quiet.
        telemetryHidden: span.getAttribute('aria-hidden'),
        renderStateRole: document
          .getElementById('classicStatusText')
          .getAttribute('role'),
      };
    });
    expect(placement).toEqual({
      barHasAriaLive: false,
      barRole: null,
      telemetryInLiveRegion: false,
      telemetryHidden: null,
      renderStateRole: 'status',
    });

    const announcements = await watchAnnouncements(
      page,
      '__recordTelemetryAnnouncement'
    );
    const before = await page.locator('#classicStatusViewport').textContent();

    const box = await page.locator('.preview-panel canvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 30; i += 1) {
      await page.mouse.move(
        box.x + box.width / 2 + i * 6,
        box.y + box.height / 2 + i * 4
      );
    }
    await page.mouse.up();
    await page.waitForTimeout(1500);

    // Guards the assertion below: if the drag moved nothing, silence is free.
    expect(
      await page.locator('#classicStatusViewport').textContent(),
      'the orbit did not move the camera, so this proves nothing'
    ).not.toBe(before);
    // Asserting the announcer is globally EMPTY over-reaches, as F4's
    // classic-viewport-silent already records: an auto-preview legitimately says
    // "Rendering preview..." and "Preview ready" while the drag is in flight.
    // What must be true is that the TELEMETRY never speaks — no pose, no
    // "Viewport:", no coordinate triple.
    const telemetry = announcements.filter((text) =>
      /viewport|translate|rotate|distance =|fov =/i.test(text)
    );
    expect(
      telemetry,
      `orbiting announced telemetry: ${JSON.stringify(announcements)}`
    ).toEqual([]);
  });
});

// ─── P9: Classic 3D-view defaults ────────────────────────────────────────────

const AXES_PREF = 'openscad-forge-display-axes';
const AXIS_MARKS_PREF = 'openscad-forge-display-axisMarks';
const GRID_PREF = 'openscad-forge-grid';
// v2 since the U-3 heal (UF-1): the marker was bumped so profiles poisoned
// by the pre-#59 failure path get the Classic view defaults re-stamped once.
const CLASSIC_VIEW_MARKER = 'openscad-forge-classic-view-defaults-v2';

function readViewPrefs(page) {
  return page.evaluate(
    ([axes, marks, grid, marker]) => ({
      axes: localStorage.getItem(axes),
      axisMarks: localStorage.getItem(marks),
      grid: localStorage.getItem(grid),
      marker: localStorage.getItem(marker),
    }),
    [AXES_PREF, AXIS_MARKS_PREF, GRID_PREF, CLASSIC_VIEW_MARKER]
  );
}

test.describe('Classic 3D-view defaults (P9)', () => {
  test('classic-view-defaults: a fresh profile gets axes and ticks on, grid off', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    // seedFirstVisit only: the DEFAULTS are the point, so nothing may be seeded.
    await seedFirstVisit(page);
    await loadProject(page, UNIVERSAL_CUFF);
    await enterClassicStandard(page);
    await page.waitForTimeout(1500);

    // The desktop shows axes with tick marks and no ground grid (OpenSCAD_1).
    const prefs = await readViewPrefs(page);
    console.log('[p9] prefs after Classic entry:', JSON.stringify(prefs));
    expect(prefs).toEqual({
      axes: 'true',
      axisMarks: 'true',
      grid: 'false',
      marker: 'true',
    });

    // Every surface showing these flags has to agree — the toolbar learns
    // through display-option-change, not by watching its own clicks.
    await expect(page.locator('#classicAxesToggle')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(page.locator('#classicScaleMarkersToggle')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  test('classic-view-defaults-forge: Forge keeps its own defaults', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await seedFirstVisit(page);
    await loadProject(page, UNIVERSAL_CUFF);
    await switchToStandardMode(page);
    await page.waitForTimeout(1500);

    // Never entered Classic, so nothing was stamped: Forge's grid stays on and
    // its axes stay off. "Classic-scoped" has to mean this.
    const prefs = await readViewPrefs(page);
    expect(prefs.marker).toBeNull();
    expect(prefs.axes, 'Forge must not have had axes switched on').not.toBe(
      'true'
    );
    expect(
      prefs.grid,
      'Forge must not have had its grid switched off'
    ).not.toBe('false');
  });

  test('classic-view-defaults-once: a user choice survives re-entering Classic', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await seedFirstVisit(page);
    await loadProject(page, UNIVERSAL_CUFF);
    await enterClassicStandard(page);
    await page.waitForTimeout(1200);
    await expect(page.locator('#classicAxesToggle')).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // The user turns axes back off, on purpose.
    await page.locator('#classicAxesToggle').click();
    await expect(page.locator('#classicAxesToggle')).toHaveAttribute(
      'aria-pressed',
      'false'
    );

    // Leave and come back. The stamp runs once ever; re-deciding here would
    // quietly undo what they just did.
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).not.toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    await page.waitForTimeout(800);

    expect((await readViewPrefs(page)).axes).toBe('false');
    await expect(page.locator('#classicAxesToggle')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  test('classic-view-defaults-quiet: the stamp does not announce itself', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await seedFirstVisit(page);
    await loadProject(page, UNIVERSAL_CUFF);
    await switchToStandardMode(page);

    const announcements = await watchAnnouncements(
      page,
      '__recordViewDefaultAnnouncement'
    );
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    await page.waitForTimeout(1500);

    // Three flags change on entry. Announcing each would talk over the mode
    // change the user actually asked for, so the stamp is silent — while every
    // user-driven toggle still speaks (the case above proves the toggle works).
    const optionChatter = announcements.filter((text) =>
      /Axes (shown|hidden)|Axis distance markings (shown|hidden)|Grid/i.test(
        text
      )
    );
    expect(
      optionChatter,
      `entering Classic announced: ${JSON.stringify(announcements)}`
    ).toEqual([]);
  });
});

// ─── P13: small-defect sweep ─────────────────────────────────────────────────

test.describe('Small-defect sweep (P13)', () => {
  test('classic-delete-contrast: the destructive button meets WCAG AA', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await seedFirstVisit(page);
    await loadProject(page);

    // T2-A1. The real .btn.btn-danger in the app's own stylesheet — the class
    // dialogs.js gives the confirm button of every destructive action. Rendered
    // here rather than reached through the preset flow, which needs a saved
    // preset before Delete is even enabled.
    const measured = await page.evaluate(() => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-danger';
      btn.textContent = 'Delete';
      document.body.append(btn);
      const cs = getComputedStyle(btn);
      const read = (css) =>
        (css.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
      const luminance = (rgb) =>
        rgb
          .map((v) => {
            const s = v / 255;
            return s <= 0.03928
              ? s / 12.92
              : Math.pow((s + 0.055) / 1.055, 2.4);
          })
          .reduce((sum, c, i) => sum + [0.2126, 0.7152, 0.0722][i] * c, 0);
      const contrast = (a, b) => {
        const l1 = luminance(read(a));
        const l2 = luminance(read(b));
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      const out = {
        background: cs.backgroundColor,
        color: cs.color,
        ratio: Math.round(contrast(cs.color, cs.backgroundColor) * 100) / 100,
        // A 1px border is what carries non-text contrast (WCAG 1.4.11), so
        // darkening the fill cannot cost the button its edge.
        borderWidth: cs.borderTopWidth,
        borderStyle: cs.borderTopStyle,
      };
      btn.remove();
      return out;
    });
    console.log('[p13] danger button:', JSON.stringify(measured));

    // 4.5:1 is AA for normal text. It measured 3.82:1 before this phase.
    expect(
      measured.ratio,
      `Delete is ${measured.color} on ${measured.background} = ${measured.ratio}:1`
    ).toBeGreaterThanOrEqual(4.5);
    expect(measured.borderStyle).not.toBe('none');
  });
});

/**
 * P12 — the axis-tick overlay draws.
 *
 * R-II turned axis marks ON by default on first Classic entry, so this
 * shipped as a preference that claimed to do something and did nothing.
 * MEASURED on the parent commit: buildAxisTickOverlay threw
 * "three.CanvasTexture is not a constructor" — getThreeModule() exports
 * eleven classes and the overlay needs three it does not export — and
 * _applyAxisMarks caught it, logged a console.warn and returned. The
 * preference stayed on, the camera-bar button stayed pressed, and the scene
 * got nothing. Its own 20 unit tests pass because they inject a mock THREE
 * that DOES define the three missing classes.
 */
test('Classic draws the axis tick overlay it says is on', async ({ page }) => {
  test.setTimeout(240_000);
  await seedFirstVisit(page);
  await loadProject(page, UNIVERSAL_CUFF);
  await switchToStandardMode(page);
  await enterClassicStandard(page);
  await skipWithoutRenderer(page);

  const overlay = () =>
    page.evaluate(() => window.__forgeDebug.axisTickOverlay());

  // Read from the scene graph, not from the toggle: the whole point is that
  // the toggle said yes while the scene had nothing in it.
  const on = await expect
    .poll(overlay, { timeout: 20_000 })
    .toMatchObject({ enabled: true, inScene: true });
  void on;

  const state = await overlay();
  expect(state.ticks).toBeGreaterThan(0);
  expect(state.labels).toBeGreaterThan(0);

  // And it must come back out again, or "off" would be the lie instead.
  await page.evaluate(() => {
    document.getElementById('viewMenuBtn')?.click();
  });
  await page.waitForTimeout(300);
  await page
    .getByRole('menuitemcheckbox', { name: /scale marker|axis distance/i })
    .first()
    .click();
  await expect.poll(overlay).toMatchObject({ enabled: false, inScene: false });
});
