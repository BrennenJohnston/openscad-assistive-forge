import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Production-parity smoke: the built app behind the shipped CSP.
//
// D4 — the editor renders line numbers but no code on the deployed site — is
// invisible to every other spec in this repository, because they all run
// against the dev server, which sends no Content-Security-Policy. This spec
// exists to make the shipped headers part of what "green" means.
//
// It uses the owner's real 1,017-line file, not sample.scad: the failure this
// lane was built to catch is a layout collapse, and a 28-line toy makes the
// resulting screenshot too small to compare against the owner's evidence.

const FIXTURE = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'universal-cuff',
  'universal_cuff_utensil_holder.scad'
);

const SCREENSHOT_DIR = path.join(
  process.cwd(),
  'test-results',
  'production-smoke'
);

// Line 4 of the fixture. Short enough to sit inside the editor pane, long
// enough to be the line that wraps once P2 lands.
const KNOWN_LINE =
  '// To the extent possible under law, the author(s) have dedicated all';

const WASM_READY_TIMEOUT = 180_000;

test.describe('Production build behind the shipped CSP', () => {
  test('prod-editor-styles: the Classic editor shows real code, and nothing is blocked by the CSP', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    // Both init scripts must be registered before the first navigation: the
    // violation listener has to be attached before the app's own scripts run,
    // or the earliest blocked styles are never recorded.
    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__cspViolations.push({
          directive: event.effectiveDirective || event.violatedDirective,
          blockedURI: event.blockedURI,
          sourceFile: event.sourceFile,
          lineNumber: event.lineNumber,
          sample: (event.sample || '').slice(0, 120),
        });
      });
    });
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    });

    const response = await page.goto('/');
    const servedCsp = response.headers()['content-security-policy'];
    expect(
      servedCsp,
      'the preview server must serve the production CSP, or this lane proves nothing'
    ).toContain("style-src 'self'");

    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });

    await page.locator('#fileInput').setInputFiles(FIXTURE);
    await expect(page.locator('#mainInterface')).toBeVisible({
      timeout: 30_000,
    });

    const notNowBtn = page.locator('#saveProjectNotNow');
    try {
      await notNowBtn.waitFor({ state: 'visible', timeout: 3_000 });
      await notNowBtn.click();
    } catch {
      // Save-project modal did not appear; nothing to dismiss.
    }

    // Classic opens in Simplified, which hides the editor slot by design
    // (D-7). Standard is the density this defect lives in.
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    const densityToggle = page.locator('#classicDensityToggle');
    if ((await densityToggle.getAttribute('aria-checked')) !== 'true') {
      await densityToggle.click();
    }
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-density',
      'standard'
    );

    const editorSlot = page.locator('#classicEditorSlot');
    await expect(editorSlot).toBeVisible({ timeout: 15_000 });
    await expect(editorSlot.locator('.cm-content')).toBeVisible({
      timeout: 15_000,
    });
    // The gutter renders before the styles settle; give layout a frame.
    await page.waitForTimeout(500);

    // Written before the assertions on purpose: when this fails, the
    // screenshot of the failure is the artifact worth having.
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const shotPath = path.join(SCREENSHOT_DIR, 'classic-standard-editor.png');
    await page.screenshot({ path: shotPath });
    console.log(`[production-smoke] whole-window screenshot: ${shotPath}`);

    const measured = await page.evaluate((knownLine) => {
      const slot = document.getElementById('classicEditorSlot');
      const content = slot.querySelector('.cm-content');
      const scroller = slot.querySelector('.cm-scroller');
      const gutters = slot.querySelector('.cm-gutters');
      const contentStyle = getComputedStyle(content);
      const gutterStyle = gutters ? getComputedStyle(gutters) : null;

      const line = Array.from(slot.querySelectorAll('.cm-line')).find(
        (el) => el.textContent.trim() === knownLine
      );

      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          top: Math.round(r.top),
          left: Math.round(r.left),
          bottom: Math.round(r.bottom),
          right: Math.round(r.right),
          width: Math.round(r.width),
          height: Math.round(r.height),
        };
      };

      return {
        whiteSpace: contentStyle.whiteSpace,
        fontFamily: contentStyle.fontFamily,
        gutterDisplay: gutterStyle ? gutterStyle.display : null,
        gutterWidth: gutters ? Math.round(gutters.getBoundingClientRect().width) : null,
        scrollHeight: scroller ? scroller.scrollHeight : null,
        knownLineFound: !!line,
        knownLineRect: rect(line),
        scrollerRect: rect(scroller),
      };
    }, KNOWN_LINE);

    console.log(
      '[production-smoke] measured:',
      JSON.stringify(measured, null, 2)
    );

    const violations = await page.evaluate(() => window.__cspViolations);
    if (violations.length) {
      console.log(
        `[production-smoke] ${violations.length} CSP violation(s):`,
        JSON.stringify(violations.slice(0, 5), null, 2)
      );
    }

    // (a) CodeMirror's own styles reached the document.
    // "pre" unwrapped, "break-spaces" once lineWrapping is on; both preserve
    // whitespace. "normal" is the collapsed, unstyled state.
    expect(
      measured.whiteSpace,
      'CodeMirror preserves whitespace on .cm-content; "normal" means its stylesheet never applied'
    ).toMatch(/^(pre|break-spaces)/);
    expect(
      measured.fontFamily.toLowerCase(),
      'CodeMirror sets a monospace family on the scroller; a system font means its stylesheet never applied'
    ).toContain('mono');
    expect(
      measured.gutterDisplay,
      'the gutter is a flex sidebar; "block" means it collapsed to a full-width row and pushed the code off-screen'
    ).not.toBe('block');

    // (b) A known line of the real file is on screen, inside the scroller.
    expect(measured.knownLineFound, `line 4 not rendered: ${KNOWN_LINE}`).toBe(
      true
    );
    const { knownLineRect: line, scrollerRect: scroller } = measured;
    expect(line.height, 'the rendered line has no height').toBeGreaterThan(0);
    expect(
      line.top,
      `line 4 is at y=${line.top}, outside the scroller (${scroller.top}..${scroller.bottom})`
    ).toBeGreaterThanOrEqual(scroller.top - 1);
    expect(
      line.top,
      `line 4 is at y=${line.top}, below the scroller (${scroller.top}..${scroller.bottom})`
    ).toBeLessThanOrEqual(scroller.bottom + 1);
    expect(
      line.left,
      `line 4 starts at x=${line.left}, outside the scroller (${scroller.left}..${scroller.right})`
    ).toBeGreaterThanOrEqual(scroller.left - 1);

    // (c) Permanent tripwire: the shipped CSP is a documented product
    // feature, so anything it blocks is a defect in us, not in the header —
    // with exactly one exception. CodeMirror's styling library inserts a
    // <style> element that `style-src 'self'` correctly refuses, and its
    // rules are re-homed through CSSOM instead (codemirror-csp-styles.js).
    // Stopping the insertion itself would mean mounting the editor in a
    // shadow root, which would cut the app's forced-colors high-contrast
    // rules off from the editor, or patching style-mod's private internals.
    // Neither is worth one blocked element. So: that element must be the
    // only thing the policy ever blocks, and it must really be style-mod's.
    const blockedStyleElements = await page.evaluate(() =>
      Array.from(document.querySelectorAll('style'))
        .filter((element) => element.sheet === null)
        // style-mod names every class it generates with this character.
        .map((element) => ({ isStyleMod: element.textContent.includes('ͼ') }))
    );
    expect(
      blockedStyleElements.filter((element) => !element.isStyleMod),
      "the CSP blocked a stylesheet that is not CodeMirror's"
    ).toEqual([]);
    expect(
      violations.filter(
        (violation) => violation.directive !== 'style-src-elem'
      ),
      `the app violated its own Content-Security-Policy ${violations.length} time(s)`
    ).toEqual([]);
    expect(
      violations.length,
      'more was blocked than the single known CodeMirror <style> element'
    ).toBeLessThanOrEqual(1);
  });

  test('prod-preferences: the 3D View panel is really styled behind the CSP', async ({
    page,
  }) => {
    // R-I found TWO defects in this family, not one: CodeMirror's blocked
    // stylesheet, and a dialog built by innerHTML whose inline style
    // attributes the policy stripped — which shipped a permanently visible
    // false warning. P11 adds a new panel with new CSS to a modal, so it is
    // the same shape. Dev-server green proves nothing about the deployed app.
    test.setTimeout(240_000);

    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__cspViolations.push({
          directive: event.effectiveDirective || event.violatedDirective,
          blockedURI: event.blockedURI,
          sample: (event.sample || '').slice(0, 120),
        });
      });
    });
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    });

    await page.goto('/');
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });
    await page.locator('#fileInput').setInputFiles(FIXTURE);
    await expect(page.locator('#mainInterface')).toBeVisible({
      timeout: 30_000,
    });
    const notNow = page.locator('#saveProjectNotNow');
    try {
      await notNow.waitFor({ state: 'visible', timeout: 3_000 });
      await notNow.click();
    } catch {
      // Save-project modal did not appear.
    }
    await page.locator('#uiModeToggle').click();

    // Q-41 (UF-15): the scheme group exists only in Classic now, so the
    // styling proof runs where the panel actually paints for a user.
    // Classic Standard keeps the menu bar (Simplified hides it).
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    const densityToggle = page.locator('#classicDensityToggle');
    await expect(densityToggle).toBeVisible();
    if ((await densityToggle.getAttribute('aria-checked')) !== 'true') {
      await densityToggle.click();
    }
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-density',
      'standard'
    );

    await page.locator('#editMenuBtn').click();
    await page
      .locator('#editMenuItems')
      .getByText('Preferences…', { exact: true })
      .click();
    await page.locator('#prefs-tab-3dview').click();
    await expect(page.locator('#prefsColorSchemeList')).toBeVisible();
    await page.waitForTimeout(300);

    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const shot = path.join(SCREENSHOT_DIR, 'preferences-3dview.png');
    await page.screenshot({ path: shot });
    console.log(`[production-smoke] whole-window screenshot: ${shot}`);

    const measured = await page.evaluate(() => {
      const list = document.getElementById('prefsColorSchemeList');
      const row = list.querySelector('.preferences-scheme-row');
      const listStyle = getComputedStyle(list);
      const rowStyle = getComputedStyle(row);
      return {
        rows: list.querySelectorAll('.preferences-scheme-row').length,
        // A real border proves the panel's own rules reached the document,
        // rather than the browser's default no-border on a plain div.
        borderWidth: listStyle.borderTopWidth,
        rowDisplay: rowStyle.display,
        rowHeight: Math.round(row.getBoundingClientRect().height),
        // Compared against the token rather than a literal 44: the token
        // resolves to 44 on touch and 36 on a fine pointer, and headless
        // Chromium is the latter. Hardcoding 44 would assert something the
        // design system deliberately does not promise here.
        touchTarget: Math.round(
          parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue(
              '--size-touch-target'
            )
          )
        ),
        // No AUTHORED inline style in this panel: the policy refuses those,
        // so a layout depending on one is broken only in production — the
        // exact failure R-I shipped once.
        //
        // Counts NON-EMPTY values only. MEASURED: all twelve inputs here
        // carry `style=""`, materialised by something touching el.style at
        // runtime rather than written by hand — index.html contains no
        // style= attribute anywhere. An empty attribute declares nothing and
        // there is nothing for CSP to strip. Anything genuinely blocked
        // shows up in the violation assertion below instead.
        inlineStyled: [
          ...document.querySelectorAll('#prefs-panel-3dview [style]'),
        ].filter((e) => e.getAttribute('style').trim() !== '').length,
      };
    });
    console.log(
      '[production-smoke] preferences:',
      JSON.stringify(measured, null, 2)
    );

    expect(measured.rows).toBe(10);
    expect(
      measured.borderWidth,
      'the scheme list has no border: its stylesheet never applied'
    ).not.toBe('0px');
    expect(measured.rowDisplay).toBe('flex');
    expect(measured.touchTarget).toBeGreaterThan(0);
    expect(
      measured.rowHeight,
      'scheme rows collapsed below the touch-target token'
    ).toBeGreaterThanOrEqual(measured.touchTarget);
    expect(
      measured.inlineStyled,
      'an inline style attribute in this dialog is stripped in production'
    ).toBe(0);

    const violations = await page.evaluate(() => window.__cspViolations);
    expect(
      violations.filter((v) => v.directive !== 'style-src-elem'),
      'opening Preferences violated the shipped CSP'
    ).toEqual([]);
    expect(violations.length).toBeLessThanOrEqual(1);
  });
});
