/**
 * The Alt View's look is a set of tokens. This spec reads every visible
 * element of the surfaces a person meets and compares its computed colors
 * and fonts with what the mono rules declare: a color outside the palette
 * or a font off the monospace stack is a failure. Corners, gradients and
 * shadows are counted and reported, not failed, until the leftovers are
 * fixed. The standard look is read the same way, against every token that
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

async function openProject(page) {
  await page.goto('/?example=simple-box');
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

/**
 * Every visible element under `rootSelector` against the palette: the mono
 * rules' own colors when the Alt View is on, every color token otherwise.
 */
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

async function audit(page, rootSelector) {
  await settle(page);
  return page.evaluate((rootSelector) => {
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
      for (const [prop, value, applies] of checks) {
        if (!applies || !value || value === 'rgba(0, 0, 0, 0)') continue;
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
        offenders.radius.push(describe(el));
      }
      if (/gradient\(/.test(s.backgroundImage)) offenders.gradient.push(describe(el));
      if (s.boxShadow && s.boxShadow !== 'none') offenders.shadow.push(describe(el));
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
      },
    };
  }, rootSelector);
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
    const result = await audit(page, null);
    expect(result.mono).toBe(true);
    expect(result.samples.color, 'colors off the palette').toEqual([]);
    expect(result.samples.font, 'fonts off the stack').toEqual([]);
  });

  test('a project: Standard, Simplified, the editor, the camera panel, Preferences, Keyboard Shortcuts', async ({
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
      expect(result.missingRoot, `${name}: root found`).toBeUndefined();
      expect(result.mono, `${name}: the Alt View on`).toBe(true);
      expect(result.samples.color, `${name}: colors off the palette`).toEqual(
        []
      );
      expect(result.samples.font, `${name}: fonts off the stack`).toEqual([]);
    }
    // Corners, gradients and shadows are reported for the record.
    console.log(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(report).map(([k, v]) => [k, v.counts])
        )
      )
    );
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
