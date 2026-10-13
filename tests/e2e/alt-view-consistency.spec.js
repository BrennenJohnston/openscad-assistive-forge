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

async function altViewOn(page) {
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
  await page.waitForTimeout(1_000);
}

// A transition still running when a surface is read (the mode toggle's
// colours on a slow machine) shows as a colour off the tokens: let every
// CSS transition finish or be cancelled first, within a bound.
async function settle(page) {
  await page.evaluate(() =>
    Promise.race([
      Promise.allSettled(
        document
          .getAnimations()
          .filter((animation) => animation instanceof CSSTransition)
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
        if (!palette.has(value)) {
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

// The drawing's own colors (a shape's swatch) and the layer tints the
// picture paints, which the legend under it repeats: information, shown in
// their true colors.
const DRAWING_COLORS = [
  '.svg-prep-swatch',
  '.svg-prep-legend-chip--layer-1',
  '.svg-prep-legend-chip--layer-2',
  '.svg-prep-legend-chip--layer-3',
  '.svg-prep-legend-chip--ignore',
].join(', ');

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
      name: 'the Actions drawer open',
      act: async () => {
        await page.locator('#actionsDrawerToggle').click();
        await page.waitForTimeout(600);
      },
      after: async () => {
        await page.locator('#actionsDrawerToggle').click();
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
      if (surface.after) await surface.after();
    }
    for (const [name, result] of Object.entries(report)) {
      expectInTheLook(result, name);
    }

    // The page is in Classic now: a dialog's backdrop is tinted with this
    // look's own accent, not the green of the Alt View's other looks.
    // (Classic's Preferences opens as a window with no backdrop; About keeps
    // one.)
    await page.locator('#helpMenuBtn').click();
    await page.getByRole('menuitem', { name: /^About/ }).first().click();
    await expect(page.locator('#aboutModalOverlay')).toBeVisible();
    const tint = await page.evaluate(() => {
      const rgb = (value) => {
        const n = (value.match(/[\d.]+/g) || []).map(Number).slice(0, 3);
        return value.startsWith('color(') ? n : n.map((v) => v / 255);
      };
      const probe = document.createElement('div');
      probe.style.color = getComputedStyle(document.body).getPropertyValue(
        '--color-accent'
      );
      document.body.appendChild(probe);
      const accent = rgb(getComputedStyle(probe).color);
      probe.remove();
      const overlay = document.getElementById('aboutModalOverlay');
      return { accent, backdrop: rgb(getComputedStyle(overlay).backgroundColor) };
    });
    tint.backdrop.forEach((channel, i) =>
      expect
        .soft(channel, `Classic's backdrop, channel ${i}, against its accent`)
        .toBeCloseTo(tint.accent[i], 1)
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
    await page.getByRole('button', { name: 'Open the drawing editor' }).first().click();
    await expect(page.locator('.svg-prep-result-pane svg').first()).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.locator('.hfm-overlay-canvas')).toBeHidden();
    const editor = await audit(page, null, DRAWING_COLORS);
    expectInTheLook(editor, 'the page with the drawing editor open');
    console.log(
      JSON.stringify({
        charm: charm.counts,
        'drawing editor': editor.counts,
        ordinary,
        ink,
      })
    );

    await page.locator('.drawing-editor .drawing-editor-close').first().click();
    await expect(page.locator('.hfm-overlay-canvas')).toBeVisible();
  });
});

test.describe('The Alt View at a phone width', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test.beforeEach(async ({ page }) => {
    await seed(page, { unlock: true, theme: 'dark' });
  });

  test('a project and its camera drawer', async ({ page }) => {
    test.setTimeout(300_000);
    await openProject(page);
    expect(
      await page.evaluate(() => [innerWidth, matchMedia('(pointer: coarse)').matches]),
      'a phone: 390 px wide, a finger for a pointer'
    ).toEqual([390, true]);
    await altViewOn(page);
    expectInTheLook(await audit(page, null), 'a project at a phone width');
    await page.locator('#cameraDrawerToggle').click();
    await page.waitForTimeout(800);
    expectInTheLook(await audit(page, null), 'the camera drawer at a phone width');
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

  test('high contrast keeps to its own palette', async ({ page }) => {
    test.setTimeout(300_000);
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-high-contrast', 'true');
    });
    await openProject(page);
    await altViewOn(page);
    await expect(page.locator('html')).toHaveAttribute('data-high-contrast', 'true');
    expectInTheLook(await audit(page, null), 'a project with high contrast');
  });

  test('reduced transparency keeps a dialog backdrop solid', async ({ page }) => {
    test.setTimeout(300_000);
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
