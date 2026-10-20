/**
 * The Alt View's look is a set of tokens. This spec reads every visible
 * element of the surfaces a person meets and compares its computed colors
 * and fonts with what the mono rules declare: a color outside the palette,
 * a font off the monospace stack, a rounded corner or a shadow is a
 * failure (gradients are counted). The standard look is read the same way,
 * against every token that
 * resolves to a color, and pinned at the counts it had before this work
 * so the Alt View's rules cannot bleed into it.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';
import { skipWithoutWebGL } from './helpers/webgl.js';
import { drawersBack } from './helpers/alt-view.js';

test.describe.configure({ mode: 'serial', timeout: 240_000 });

const WASM_READY_TIMEOUT = 180_000;

// The standard look's counts on 2026-10-13 (color offenders, font offenders)
// per surface: translucent overlays made from the tokens, and `code`
// elements whose monospace stack is a literal, not a token.
const STANDARD_BASELINE = {
  'main page': [0, 0],
  'project, Standard': [1, 2],
  'project, Simplified': [1, 0],
  'camera panel open': [1, 2],
  Preferences: [1, 0],
  'Keyboard Shortcuts': [1, 0],
};

async function seed(page, { unlock, theme }) {
  await page.addInitScript(
    ({ unlock, theme }) => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
      localStorage.setItem('openscad-forge-theme', theme);
      if (unlock) localStorage.setItem('openscad-customizer-hfm-unlock', 'true');
    },
    { unlock, theme }
  );
}

async function openProject(page, example = 'simple-box') {
  await page.goto(`/?example=${example}`);
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  await page.waitForFunction(() => window.previewManager?.mesh, null, {
    timeout: WASM_READY_TIMEOUT,
  });
  const notNow = page.locator('#saveProjectNotNow');
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3_000 });
    await notNow.click();
  } catch {
    // No save-project prompt to dismiss.
  }
  const uiToggle = page.locator('#uiModeToggle');
  if ((await uiToggle.getAttribute('aria-checked')) !== 'true') {
    await uiToggle.click();
  }
}

// With a project open the Alt View draws from the 3D picture; on the Main
// Page it is the interface alone, which needs no WebGL.
async function altViewOn(page) {
  if (await page.evaluate(() => Boolean(window.previewManager))) {
    await skipWithoutWebGL(
      page,
      'no WebGL: the Alt View draws its characters from the 3D picture'
    );
  }
  const key = page.locator('#_hfmToggle');
  await key.waitFor({ state: 'attached', timeout: 60_000 });
  if ((await key.getAttribute('aria-pressed')) !== 'true') await key.click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.getAttribute('data-ui-variant')
      )
    )
    .toBe('mono');
  await drawersBack(page);
  await page.waitForTimeout(1_000);
}

// A transition still running when a surface is read (the mode toggle's
// colours on a slow machine) shows as a colour off the tokens, and the first
// Alt View's draw-in covers the screen for a second: let every CSS
// transition and every animation that ends finish or be cancelled first,
// within a bound.
async function settle(page) {
  await page.evaluate(() =>
    Promise.race([
      Promise.allSettled(
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation instanceof CSSTransition ||
              (animation instanceof CSSAnimation &&
                Number.isFinite(animation.effect?.getComputedTiming().endTime))
          )
          .map((animation) => animation.finished)
      ),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ])
  );
}

/**
 * Every visible element under `rootSelector` against the palette: the mono
 * rules' own colors when the Alt View is on, every color token otherwise.
 * Elements matching `contentColors` show colors that are information (a
 * drawing's own colors), so their colors are not read.
 */
async function audit(page, rootSelector, contentColors = null) {
  await settle(page);
  return page.evaluate(({ rootSelector, contentColors }) => {
    const mono =
      document.documentElement.getAttribute('data-ui-variant') === 'mono';
    // The standard look is read on the body, where Classic keeps its tokens
    // and the body inherits the root's. The Alt View's palette is what its
    // own rules declare: the root's values, and for the rules scoped to
    // Classic's body, the values those resolve to there.
    const cs = getComputedStyle(document.body);
    const rootCs = getComputedStyle(document.documentElement);
    const probe = document.createElement('div');
    document.body.appendChild(probe);
    const toRgb = (value) => {
      probe.style.color = '';
      probe.style.color = value;
      return getComputedStyle(probe).color;
    };
    const rules = [];
    const walk = (list) => {
      for (const rule of list) {
        rules.push(rule);
        if (rule.cssRules) walk([...rule.cssRules]);
      }
    };
    for (const sheet of document.styleSheets) {
      try {
        walk([...sheet.cssRules]);
      } catch {
        // A sheet from another origin cannot be read; none of ours is.
      }
    }
    // A translucent color as the same color, opaque: rgba(r, g, b, a) and
    // color(srgb r g b / a) both read as rgb(r, g, b); anything else, null.
    const opaque = (value) => {
      const rgba = /^rgba\((\d+), (\d+), (\d+), [\d.]+\)$/.exec(value);
      if (rgba) return `rgb(${rgba[1]}, ${rgba[2]}, ${rgba[3]})`;
      const srgb = /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+) \/ [\d.]+\)$/.exec(
        value
      );
      if (!srgb) return null;
      const [r, g, b] = srgb.slice(1, 4).map((n) => Math.round(Number(n) * 255));
      return `rgb(${r}, ${g}, ${b})`;
    };
    const palette = new Set([
      'rgba(0, 0, 0, 0)',
      'rgb(0, 0, 0)',
      'rgb(255, 255, 255)',
    ]);
    let fontOk;
    if (mono) {
      const monoRule = (rule) =>
        rule.selectorText &&
        /data-ui-variant=['"]mono['"]/.test(rule.selectorText);
      for (const rule of rules.filter(monoRule)) {
        const scope = /data-ui-mode=['"]classic['"]/.test(rule.selectorText)
          ? cs
          : rootCs;
        for (const prop of [...rule.style]) {
          if (prop.startsWith('--color')) {
            const value = scope.getPropertyValue(prop).trim();
            if (value) palette.add(toRgb(value));
          }
        }
        for (const prop of [
          'color',
          'background-color',
          'border-color',
          'outline-color',
        ]) {
          const value = rule.style.getPropertyValue(prop);
          if (value && !/var\(/.test(value)) palette.add(toRgb(value));
        }
      }
      fontOk = (family) => /iosevka|monospace|courier|consolas|menlo/i.test(family);
    } else {
      const names = new Set();
      for (const rule of rules) {
        if (!rule.style) continue;
        for (const prop of [...rule.style]) {
          if (prop.startsWith('--')) names.add(prop);
        }
      }
      for (const name of names) {
        const value = cs.getPropertyValue(name).trim();
        if (value && !/^var\(/.test(value) && CSS.supports('color', value)) {
          palette.add(toRgb(value));
        }
      }
      const norm = (family) =>
        family.toLowerCase().replace(/["']/g, '').replace(/\s*,\s*/g, ',').trim();
      const fonts = new Set(
        [...names]
          .filter((name) => name.startsWith('--font-family'))
          .map((name) => norm(cs.getPropertyValue(name)))
          .filter(Boolean)
      );
      fontOk = (family) => fonts.has(norm(family));
    }
    probe.remove();

    const root = rootSelector
      ? [...document.querySelectorAll(rootSelector)].find(
          (el) => el.offsetParent !== null || el.getClientRects().length
        ) || document.querySelector(rootSelector)
      : document.body;
    if (!root) return { missingRoot: rootSelector };
    const describe = (el) => {
      const parts = [];
      let node = el;
      for (let i = 0; node && node !== document.body && i < 4; i++) {
        parts.unshift(
          node.tagName.toLowerCase() +
            (node.id ? `#${node.id}` : '') +
            (node.classList.length
              ? `.${[...node.classList].slice(0, 2).join('.')}`
              : '')
        );
        node = node.parentElement;
      }
      return parts.join(' > ');
    };
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const s = getComputedStyle(el);
      return (
        s.visibility !== 'hidden' &&
        s.display !== 'none' &&
        parseFloat(s.opacity) > 0.05 &&
        r.bottom > 0 &&
        r.right > 0 &&
        r.top < innerHeight &&
        r.left < innerWidth
      );
    };
    // A shadow is decoration when it is cast (offset and not inset) or blurs
    // in a color off the palette. An inset line with no blur (a divider, a
    // selection bar) and a ring made by spread alone draw lines, as borders
    // and outlines do; a glow in the look's own colors is its phosphor bloom.
    const decorative = (value) =>
      value !== 'none' &&
      value.split(/,(?![^(]*\))/).some((layer) => {
        const [x = 0, y = 0, blur = 0] = (layer.match(/-?[\d.]+px/g) || []).map(
          parseFloat
        );
        const color = layer.replace(/-?[\d.]+px|inset/g, '').trim();
        const cast = !/inset/.test(layer) && (x !== 0 || y !== 0);
        return cast || (blur > 0 && !palette.has(color));
      });
    const offenders = { color: [], font: [], radius: [], gradient: [], shadow: [] };
    let seen = 0;
    for (const el of root.querySelectorAll('*')) {
      if (
        ['CANVAS', 'SCRIPT', 'STYLE', 'SVG'].includes(el.tagName) ||
        el.closest('svg')
      ) {
        continue;
      }
      if (!visible(el)) continue;
      seen++;
      const s = getComputedStyle(el);
      const hasText = [...el.childNodes].some(
        (n) => n.nodeType === 3 && n.textContent.trim()
      );
      const checks = [
        ['color', s.color, hasText],
        ['background-color', s.backgroundColor, true],
        [
          'border-color',
          s.borderTopColor,
          parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none',
        ],
        [
          'outline-color',
          s.outlineColor,
          parseFloat(s.outlineWidth) > 0 && s.outlineStyle !== 'none',
        ],
      ];
      const isContent = Boolean(contentColors && el.matches(contentColors));
      for (const [prop, value, applies] of checks) {
        if (isContent || !applies || !value || value === 'rgba(0, 0, 0, 0)') {
          continue;
        }
        // A see-through surface is the look's own color, let partly through.
        const seeThrough = prop === 'background-color' && opaque(value);
        if (!palette.has(value) && !(seeThrough && palette.has(seeThrough))) {
          offenders.color.push(`${describe(el)} ${prop} ${value}`);
        }
      }
      if (hasText && !fontOk(s.fontFamily)) {
        offenders.font.push(`${describe(el)} ${s.fontFamily.slice(0, 40)}`);
      }
      if (
        parseFloat(s.borderTopLeftRadius) > 0 &&
        el.tagName !== 'INPUT' &&
        !/circle|dot|badge|switch/i.test(el.className)
      ) {
        offenders.radius.push(`${describe(el)} ${s.borderTopLeftRadius}`);
      }
      if (/gradient\(/.test(s.backgroundImage)) offenders.gradient.push(describe(el));
      if (s.boxShadow && decorative(s.boxShadow)) {
        offenders.shadow.push(`${describe(el)} ${s.boxShadow}`);
      }
    }
    return {
      seen,
      mono,
      counts: Object.fromEntries(
        Object.entries(offenders).map(([k, v]) => [k, v.length])
      ),
      samples: {
        color: offenders.color.slice(0, 8),
        font: offenders.font.slice(0, 4),
        radius: offenders.radius.slice(0, 8),
        shadow: offenders.shadow.slice(0, 8),
      },
    };
  }, { rootSelector, contentColors });
}

/**
 * The pixels of a design chooser option's drawing as the page shows it: a
 * picture of the option above its label, read back in the page. Counts the
 * white pixels, those in the green phosphor's family, and the dark pixels
 * inside the drawing (between a row's first and last lit pixel), which are
 * its details: a face's eyes and mouth.
 */
async function iconInk(page, option) {
  const box = await option.boundingBox();
  const label = await option.locator('.svg-gallery-label').boundingBox();
  const shot = await page.screenshot({
    clip: {
      x: box.x + 3,
      y: box.y + 3,
      width: box.width - 6,
      height: label.y - box.y - 4,
    },
  });
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data: px } = ctx.getImageData(0, 0, img.width, img.height);
    let white = 0;
    let green = 0;
    let details = 0;
    for (let y = 0; y < img.height; y++) {
      const lit = [];
      for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
        if (r > 200 && g > 200 && b > 200) white += 1;
        else if (g > 120 && r < 90 && b < 90) green += 1;
        lit.push(Math.max(r, g, b));
      }
      const first = lit.findIndex((v) => v > 120);
      const last = lit.findLastIndex((v) => v > 120);
      for (let x = first + 1; first >= 0 && x < last; x++) {
        if (lit[x] < 60) details += 1;
      }
    }
    return { white, green, details };
  }, shot.toString('base64'));
}

// The drawing's own colors (a shape's swatch): information, shown in their
// true colors.
const DRAWING_COLORS = '.svg-prep-swatch';

/** A dialog backdrop's color channels (0 to 1), its opacity and its blur. */
function backdropOf(page, overlayId) {
  return page.evaluate((id) => {
    const style = getComputedStyle(document.getElementById(id));
    const n = (style.backgroundColor.match(/[\d.]+/g) || []).map(Number);
    const color = style.backgroundColor.startsWith('color(')
      ? n.slice(0, 3)
      : n.slice(0, 3).map((v) => v / 255);
    return { color, alpha: n.length > 3 ? n[3] : 1, blur: style.backdropFilter };
  }, overlayId);
}

function expectFlatBlackBackdrop(backdrop, name) {
  expect.soft(backdrop.color, `${name}: black`).toEqual([0, 0, 0]);
  expect.soft(backdrop.alpha, `${name}: at 70%`).toBeCloseTo(0.7, 2);
  expect.soft(backdrop.blur, `${name}: no blur`).toBe('none');
}

/**
 * The drawing editor's picture as the page shows it, read back in the page:
 * its pixels in the green phosphor's family and in blue.
 */
async function paneInk(page) {
  const shot = await page.locator('.svg-prep-result-pane').first().screenshot();
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data: px } = ctx.getImageData(0, 0, img.width, img.height);
    let green = 0;
    let blue = 0;
    for (let i = 0; i < px.length; i += 4) {
      const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
      if (g > 120 && r < 90 && b < 90) green += 1;
      else if (b > 150 && r < 100) blue += 1;
    }
    return { green, blue };
  }, shot.toString('base64'));
}

/** A surface in the look: no color, font, corner or shadow of its own. */
function expectInTheLook(result, name) {
  expect.soft(result.missingRoot, `${name}: found`).toBeUndefined();
  expect.soft(result.mono, `${name}: the Alt View on`).toBe(true);
  expect.soft(result.samples.color, `${name}: colors off the palette`).toEqual([]);
  expect.soft(result.samples.font, `${name}: fonts off the stack`).toEqual([]);
  expect.soft(result.samples.radius, `${name}: rounded corners`).toEqual([]);
  expect.soft(result.samples.shadow, `${name}: shadows`).toEqual([]);
}

// The page keeps every dialog in the document; the audit reads the drawn one
// (the first with a box), and the waits use Playwright's own visibility.
const DIALOG = '[role="dialog"]';
const DIALOG_VISIBLE = '[role="dialog"]:visible';

/** The surfaces, each an action on an open project and the root to read. */
function surfaces(page) {
  return [
    {
      name: 'project, Standard',
      act: async () => {},
    },
    {
      name: 'project, Simplified',
      act: async () => {
        await page.locator('#uiModeToggle').click();
        await page.waitForTimeout(600);
      },
      after: async () => {
        await page.locator('#uiModeToggle').click();
        await page.waitForTimeout(400);
      },
    },
    {
      name: 'the code editor open',
      act: async () => {
        await page.keyboard.press('Control+e');
        await expect(page.locator('.cm-editor').first()).toBeVisible({
          timeout: 20_000,
        });
        await page.waitForTimeout(600);
      },
      after: async () => {
        // Ctrl+E is a typing key while focus sits in the editor's text; the
        // editor's own button closes it from anywhere.
        await page.getByRole('button', { name: /Exit Code Editor/ }).click();
        await expect(page.locator('.cm-editor').first()).toBeHidden();
        await page.waitForTimeout(400);
      },
    },
    {
      name: 'camera panel open',
      act: async () => {
        await page.locator('#cameraPanelToggle').click();
        await page.waitForTimeout(600);
      },
      after: async () => {
        await page.locator('#cameraPanelToggle').click();
        await page.waitForTimeout(300);
      },
    },
    {
      name: 'Preview Settings open',
      act: async () => {
        await page.locator('#previewDrawerToggle').click();
        await page.waitForTimeout(600);
      },
      after: async () => {
        await page.locator('#previewDrawerToggle').click();
        await page.waitForTimeout(400);
      },
    },
    {
      name: 'Preferences',
      root: DIALOG,
      act: async () => {
        await page.locator('#editMenuBtn').click();
        await page.getByRole('menuitem', { name: /Preferences/ }).first().click();
        await expect(page.locator(DIALOG_VISIBLE).first()).toBeVisible();
        await page.waitForTimeout(600);
      },
      check: async () => {
        expectFlatBlackBackdrop(
          await backdropOf(page, 'preferencesModalOverlay'),
          'the backdrop behind Preferences'
        );
      },
      after: async () => {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
      },
    },
    {
      name: 'Keyboard Shortcuts',
      root: DIALOG,
      act: async () => {
        await page.locator('#shortcutsToggle').click();
        await expect(page.locator(DIALOG_VISIBLE).first()).toBeVisible();
        await page.waitForTimeout(600);
      },
      after: async () => {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
      },
    },
    // Last: the page stays in Classic afterwards.
    {
      name: 'Classic',
      act: async () => {
        await page.locator('#classicModeToggle').click();
        await expect(page.locator('body')).toHaveAttribute(
          'data-ui-mode',
          'classic'
        );
        await page.waitForTimeout(1_500);
      },
    },
  ];
}

test.describe('The Alt View keeps to its tokens', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page, { unlock: true, theme: 'dark' });
  });

  test('the Main Page', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });
    await altViewOn(page);
    expectInTheLook(await audit(page, null), 'the Main Page');

    await page.locator('#clearStorageBtn').click();
    await expect(page.locator('.cache-clear-dialog')).toBeVisible();
    await page.waitForTimeout(600);
    expectInTheLook(
      await audit(page, '.cache-clear-dialog'),
      'the Clear Cache question'
    );
    await page.keyboard.press('Escape');
  });

  test('the tour card', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });
    await page.locator('.btn-role-try[data-tutorial="intro"]').click();
    await expect(page.locator('.tutorial-panel').first()).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator('#tutorial-step-title')).not.toBeEmpty();
    await altViewOn(page);
    expectInTheLook(await audit(page, '.tutorial-panel'), 'the tour card');
  });

  test('a project: its views, panels, drawers, dialogs, the editor and Classic', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openProject(page);
    await altViewOn(page);
    const report = {};
    for (const surface of surfaces(page)) {
      await surface.act();
      const result = await audit(page, surface.root ?? null);
      report[surface.name] = result;
      if (surface.check) await surface.check();
      if (surface.after) await surface.after();
    }
    for (const [name, result] of Object.entries(report)) {
      expectInTheLook(result, name);
    }

    // The page is in Classic now, and its dialogs' backdrop is the same flat
    // black. (Classic's Preferences opens as a window with no backdrop;
    // About keeps one.)
    await page.locator('#helpMenuBtn').click();
    await page.getByRole('menuitem', { name: /^About/ }).first().click();
    await expect(page.locator('#aboutModalOverlay')).toBeVisible();
    expectFlatBlackBackdrop(
      await backdropOf(page, 'aboutModalOverlay'),
      "Classic's backdrop behind About"
    );
    await page.locator('#aboutModalDone').click();
    console.log(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(report).map(([k, v]) => [k, v.counts])
        )
      )
    );
  });

  test('the charm: the design chooser and the drawing editor', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openProject(page, 'q-charm');
    await page.evaluate(() => {
      let group = document.querySelector('#param-design_file')?.closest('details');
      while (group) {
        group.open = true;
        group = group.parentElement?.closest('details');
      }
    });
    const chooser = page.locator('.svg-gallery-listbox').first();
    await chooser.scrollIntoViewIfNeeded();
    const firstDesign = chooser.locator('.svg-gallery-option').first();
    // The ordinary look draws the design white with its details dark.
    const ordinary = await iconInk(page, firstDesign);
    await altViewOn(page);
    const charm = await audit(page, null);
    expectInTheLook(charm, 'the charm');

    // The chooser's drawings take the look's own color, not white, and keep
    // their details.
    const ink = await iconInk(page, firstDesign);
    expect(ordinary.details, 'the first design has details').toBeGreaterThan(20);
    expect.soft(ink.white, 'white pixels in the first design').toBe(0);
    expect.soft(ink.green, 'green pixels in the first design').toBeGreaterThan(
      ordinary.white / 2
    );
    expect
      .soft(ink.details, 'the first design keeps its details')
      .toBeGreaterThan(ordinary.details / 2);

    // The drawing editor takes the preview area, as in the ordinary look:
    // the characters step back while it is open and come back after.
    await page.setInputFiles(
      '#param-design_file',
      'tests/fixtures/svg-edit/two-papers.svg'
    );
    await page
      .locator('.svg-prep-status')
      .getByRole('button', { name: 'Open the drawing editor' })
      .first()
      .click();
    await expect(page.locator('.svg-prep-result-pane svg').first()).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.locator('.hfm-overlay-canvas')).toBeHidden();
    const editor = await audit(page, null, DRAWING_COLORS);
    expectInTheLook(editor, 'the page with the drawing editor open');
    // The picture paints its layers in the look's own steps, not in blue,
    // orange and green.
    await page.waitForTimeout(1_000);
    const pane = await paneInk(page);
    expect.soft(pane.blue, 'blue pixels in the picture').toBe(0);
    expect.soft(pane.green, 'green pixels in the picture').toBeGreaterThan(200);
    console.log(
      JSON.stringify({
        charm: charm.counts,
        'drawing editor': editor.counts,
        ordinary,
        ink,
        pane,
      })
    );

    await page.locator('.drawing-editor .drawing-editor-close').first().click();
    await expect(page.locator('.hfm-overlay-canvas')).toBeVisible();
  });
});

test.describe('The Alt View at a phone width', () => {
  // No isMobile: Firefox rejects it when the browser context is created.
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await seed(page, { unlock: true, theme: 'dark' });
  });

  test('a project and its camera drawer', async ({ page }) => {
    test.setTimeout(300_000);
    await openProject(page);
    const [width, coarse] = await page.evaluate(() => [
      innerWidth,
      matchMedia('(pointer: coarse)').matches,
    ]);
    expect(width, 'a phone: 390 px wide').toBe(390);
    test.skip(!coarse, 'this browser does not emulate a finger for a pointer');
    await altViewOn(page);
    expectInTheLook(await audit(page, null), 'a project at a phone width');
    await page.locator('#cameraDrawerToggle').click();
    await page.waitForTimeout(800);
    expectInTheLook(await audit(page, null), 'the camera drawer at a phone width');
  });

  test("a list opens in the page, in the look's colors", async ({ page }) => {
    test.setTimeout(300_000);
    await openProject(page);
    const [coarse, pageList] = await page.evaluate(() => [
      matchMedia('(pointer: coarse)').matches,
      CSS.supports('appearance', 'base-select'),
    ]);
    test.skip(!coarse, 'this browser does not emulate a finger for a pointer');
    test.skip(!pageList, 'this browser draws every list itself');
    await altViewOn(page);
    await page.locator('#mobileDrawerToggle').tap();
    const list = page.locator('#paramDetailLevel');
    await expect(list).toBeVisible();
    expect(await list.evaluate((el) => getComputedStyle(el).appearance)).toBe(
      'base-select'
    );
    await list.tap();
    await expect.poll(() => list.evaluate((el) => el.matches(':open'))).toBe(true);
    const option = list.locator('option').first();
    await expect(option).toBeVisible();
    expect(
      (await option.boundingBox()).height,
      'an option is a touch target high'
    ).toBeGreaterThanOrEqual(44);
    expect(await offGreenInk(option), 'pixels off the green').toBe(0);
    await page.keyboard.press('Escape');
    await expect.poll(() => list.evaluate((el) => el.matches(':open'))).toBe(false);
  });
});

/** The range inputs on the screen, and those shorter than the touch target. */
function shortSliders() {
  const target = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(
      '--size-touch-target'
    )
  );
  const shown = [...document.querySelectorAll("input[type='range']")].filter(
    (el) =>
      el.checkVisibility({ visibilityProperty: true }) &&
      el.getBoundingClientRect().width > 0
  );
  return {
    target,
    count: shown.length,
    short: shown
      .map((el) => ({
        name: el.id || el.name,
        height: el.getBoundingClientRect().height,
      }))
      .filter((s) => s.height + 0.5 < target)
      .map((s) => `${s.name} ${Math.round(s.height)} px`),
  };
}

// The Alt View draws a thin track, but the slider a finger or a pointer
// aims at keeps the touch target's height, as it does in the standard look.
test.describe("The Alt View's sliders keep the touch target", () => {
  test.beforeEach(async ({ page }) => {
    await seed(page, { unlock: true, theme: 'dark' });
  });

  test('on a desktop window: the Customizer and the Lens drawer', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await openProject(page);
    await altViewOn(page);
    const toggle = page.locator('#lensDrawerToggle');
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.click();
    }
    await page.waitForTimeout(600);
    const m = await page.evaluate(shortSliders);
    expect(m.count, 'sliders on the screen').toBeGreaterThanOrEqual(3);
    expect(m.short, `sliders under the ${m.target} px target`).toEqual([]);
  });

  test.describe('on a phone', () => {
    // No isMobile: Firefox rejects it when the browser context is created.
    test.use({ viewport: { width: 412, height: 915 }, hasTouch: true });

    test('the Lens drawer and the Customizer', async ({ page }) => {
      test.setTimeout(300_000);
      await openProject(page);
      await altViewOn(page);
      await page.locator('#asciiDrawerToggle').click();
      await page.waitForTimeout(600);
      const ascii = await page.evaluate(shortSliders);
      expect(ascii.count, 'sliders in the Lens drawer').toBeGreaterThanOrEqual(
        3
      );
      expect(
        ascii.short,
        `Lens drawer sliders under the ${ascii.target} px target`
      ).toEqual([]);

      await page.locator('#mobileDrawerToggle').click();
      await page.waitForTimeout(600);
      const sheet = await page.evaluate(shortSliders);
      expect(
        sheet.short,
        `Customizer sliders under the ${sheet.target} px target`
      ).toEqual([]);
    });
  });
});

// The page is the window's size in the Alt View as in the standard look:
// nothing in it can be scrolled a pixel.
test.describe('The Alt View page fits the window', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page, { unlock: true, theme: 'dark' });
  });

  for (const size of [
    { width: 1280, height: 720 },
    { width: 412, height: 915 },
  ]) {
    test(`at ${size.width} x ${size.height}`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize(size);
      await openProject(page);
      await altViewOn(page);
      await settle(page);
      const [scrollHeight, height] = await page.evaluate(() => [
        document.documentElement.scrollHeight,
        innerHeight,
      ]);
      expect(scrollHeight, `the page's height in a ${height} px window`).toBe(
        height
      );
    });
  }
});

/** The echo drawer and the status line above it, read in the page. */
function echoAndStatus() {
  const toggle = document.getElementById('echoDrawerToggle');
  const t = toggle.getBoundingClientRect();
  const hit = document.elementFromPoint(t.x + t.width / 2, t.y + t.height / 2);
  const drawer = document.getElementById('echoDrawer').getBoundingClientRect();
  const bar = document.getElementById('previewStatusBar').getBoundingClientRect();
  return {
    shown: toggle.checkVisibility(),
    toggleReachable: !!hit && toggle.contains(hit),
    atCenter: hit ? `${hit.tagName.toLowerCase()}${hit.id ? '#' + hit.id : ''}` : null,
    overlap: Math.max(0, Math.round(bar.bottom - drawer.top)),
  };
}

// The status line with the Alt View's Characters and Edges controls rests on
// the echo drawer: the drawer's toggle and its messages stay in reach.
test.describe('The echo drawer stays clear of the status line', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page, { unlock: true, theme: 'dark' });
  });

  test('in the Alt View, closed and open', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await openProject(page, 'q-charm');
    await altViewOn(page);
    await settle(page);
    // The line moves when the drawer's new height reaches it, a frame after
    // the drawer's own layout: wait for it rather than read between the two.
    const overlap = () =>
      page.evaluate(echoAndStatus).then((m) => m.overlap);
    await expect
      .poll(overlap, {
        message: 'closed, the status line over the drawer',
        timeout: 5_000,
      })
      .toBe(0);
    const closed = await page.evaluate(echoAndStatus);
    expect(closed.shown, 'the charm prints echo lines').toBe(true);
    expect
      .soft(closed.toggleReachable, `closed, its center is ${closed.atCenter}`)
      .toBe(true);

    await page.locator('#echoDrawerToggle').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#echoDrawerToggle')).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    await expect
      .poll(overlap, {
        message: 'open, the status line over the messages',
        timeout: 5_000,
      })
      .toBe(0);
    const open = await page.evaluate(echoAndStatus);
    expect.soft(open.toggleReachable, 'open, the toggle in reach').toBe(true);
  });
});

test.describe('The Alt View with reduced motion', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page, { unlock: true, theme: 'dark' });
  });

  test('in the look, and the glow held off', async ({ page }) => {
    test.setTimeout(300_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openProject(page);
    expect(
      await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      'the setting is on'
    ).toBe(true);
    await altViewOn(page);
    expectInTheLook(await audit(page, null), 'a project with reduced motion');
    await expect(page.locator('#_hfmPersistFade')).toBeDisabled();
  });
});

test.describe('The Alt View with the system settings', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page, { unlock: true, theme: 'dark' });
  });

  test("high contrast keeps the look's green", async ({ page }) => {
    test.setTimeout(300_000);
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-high-contrast', 'true');
    });
    await openProject(page);
    await altViewOn(page);
    await expect(page.locator('html')).toHaveAttribute('data-high-contrast', 'true');
    const colors = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return ['--color-accent', '--color-text-primary'].map((name) =>
        root.getPropertyValue(name).trim()
      );
    });
    expect.soft(colors, "the accent and the text in the look's green").toEqual([
      '#00ff00',
      '#00ff00',
    ]);
    expectInTheLook(await audit(page, null), 'a project with high contrast');
  });

  test('reduced transparency keeps a dialog backdrop solid', async ({
    page,
    browserName,
  }) => {
    test.setTimeout(300_000);
    test.skip(
      browserName !== 'chromium',
      'the setting is switched on through a Chromium DevTools session'
    );
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
    });
    await openProject(page);
    await altViewOn(page);
    await page.locator('#editMenuBtn').click();
    await page.getByRole('menuitem', { name: /Preferences/ }).first().click();
    await expect(page.locator('#preferencesModalOverlay')).toBeVisible();
    const backdrop = await page.evaluate(() => {
      const style = getComputedStyle(document.getElementById('preferencesModalOverlay'));
      const alpha = style.backgroundColor.match(/[\d.]+(?=\)$)/);
      return {
        reduce: matchMedia('(prefers-reduced-transparency: reduce)').matches,
        alpha: style.backgroundColor.startsWith('rgb(') ? 1 : Number(alpha?.[0] ?? 0),
        blur: style.backdropFilter,
      };
    });
    expect(backdrop.reduce, 'the setting is on').toBe(true);
    expect(backdrop.blur, 'no blur behind the dialog').toBe('none');
    expect(backdrop.alpha, 'a backdrop solid enough to read past').toBeGreaterThanOrEqual(
      0.8
    );
    await page.keyboard.press('Escape');
  });
});

/**
 * An element's pixels as the page shows it, read back in the page: those
 * more red or more blue than green, which the green look has none of.
 */
async function offGreenInk(locator) {
  const shot = await locator.screenshot();
  return locator.page().evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data: px } = ctx.getImageData(0, 0, img.width, img.height);
    let off = 0;
    for (let i = 0; i < px.length; i += 4) {
      const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
      if (r > g + 48 || b > g + 48) off += 1;
    }
    return off;
  }, shot.toString('base64'));
}

test.describe("The Alt View's Generate row", () => {
  test.beforeEach(async ({ page }) => {
    await seed(page, { unlock: true, theme: 'dark' });
  });

  test('draws the download icon as text, not as a picture in color', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openProject(page);
    await altViewOn(page);
    const button = page.locator('#primaryActionBtn');
    await button.click();
    await expect(button).toHaveAttribute('data-action', 'download', {
      timeout: 120_000,
    });
    await page.mouse.move(2, 2);
    expect(await offGreenInk(button), 'pixels off the green').toBe(0);
    await expect(button).toHaveAccessibleName(/^Download generated STL file/);
    const icon = button.locator('.btn-emoji');
    await expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(
      await icon.evaluate((el) => getComputedStyle(el, '::before').content)
    ).toBe('"[DL]"');
  });
});

test.describe('The standard look is untouched', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page, { unlock: false, theme: 'dark' });
  });

  test('its surfaces keep the counts they had', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });
    const main = await audit(page, null);
    expect(main.mono).toBe(false);
    expect(main.counts.color).toBeLessThanOrEqual(STANDARD_BASELINE['main page'][0]);
    expect(main.counts.font).toBeLessThanOrEqual(STANDARD_BASELINE['main page'][1]);

    await openProject(page);
    for (const surface of surfaces(page)) {
      const baseline = STANDARD_BASELINE[surface.name];
      await surface.act();
      if (baseline) {
        const result = await audit(page, surface.root ?? null);
        console.log(surface.name, JSON.stringify(result.counts), JSON.stringify(result.samples));
        expect(result.mono, `${surface.name}: the Alt View off`).toBe(false);
        expect(
          result.counts.color,
          `${surface.name}: colors off the tokens`
        ).toBeLessThanOrEqual(baseline[0]);
        expect(
          result.counts.font,
          `${surface.name}: fonts off the tokens`
        ).toBeLessThanOrEqual(baseline[1]);
      }
      if (surface.after) await surface.after();
    }
  });
});
