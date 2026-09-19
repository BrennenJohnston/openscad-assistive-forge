import { test, expect } from '@playwright/test';
import path from 'path';

// UF-14 (U-25): the per-interface preference matrix. Forge and Classic hold
// independently saved VIEWING preferences; code, parameters and camera stay
// shared by explicit owner order. The signed Q-40 table's 23 PER-UI keys
// live as <base>--forge / <base>--classic; a Forge<->Classic flip reloads
// the target namespace live.
//
// Budget note (Q-36): two WASM loads total. The first case drives the
// flagship rows through their real controls and ends with the reload-
// persistence walk; the second pre-seeds EVERY row's two namespaces with
// distinct values and proves the live swap serves each side's own state in
// both directions. Per-row write routing is unit-proven (ui-scoped-prefs,
// display-options-controller, preview suites); what only e2e can prove is
// the live flip, and that is what these cases spend their minutes on.

const SAMPLE = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
const WASM_READY_TIMEOUT = 180_000;

const K = {
  grid: 'openscad-forge-grid',
  gridSize: 'openscad-forge-grid-size',
  gridColor: 'openscad-forge-grid-color',
  gridOpacity: 'openscad-forge-grid-opacity',
  axes: 'openscad-forge-display-axes',
  axisMarks: 'openscad-forge-display-axisMarks',
  edges: 'openscad-forge-display-edges',
  edgeBudget: 'openscad-forge-display-edgeBudget',
  crosshairs: 'openscad-forge-display-crosshairs',
  wireframe: 'openscad-forge-display-wireframe',
  measurements: 'openscad-forge-measurements',
  scheme: 'openscad-forge-viewport-scheme',
  statusBar: 'openscad-forge-status-bar',
  autoRotate: 'openscad-forge-auto-rotate',
  rotateSpeed: 'openscad-forge-rotate-speed',
  autoBed: 'openscad-forge-auto-bed',
  zoomToCursor: 'openscad-forge-zoom-to-cursor',
  modelColor: 'openscad-forge-model-color',
  modelColorEnabled: 'openscad-forge-model-color-enabled',
  modelOpacity: 'openscad-forge-model-opacity',
  brightness: 'openscad-forge-brightness',
  contrast: 'openscad-forge-contrast',
  appearanceEnabled: 'openscad-forge-model-appearance-enabled',
};
const SEED_MARKER = 'openscad-forge-scoped-prefs-seeded-v1';

async function loadProject(page, fixture = SAMPLE) {
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  await page.locator('#fileInput').setInputFiles(fixture);
  await expect(page.locator('#welcomeScreen')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('#mainInterface')).toBeVisible({
    timeout: 10_000,
  });

  const notNowBtn = page.locator('#saveProjectNotNow');
  try {
    await notNowBtn.waitFor({ state: 'visible', timeout: 3_000 });
    await notNowBtn.click();
  } catch {
    // Save-project modal did not appear; nothing to dismiss.
  }
}

/** The app boots Simplified, which hides the console and the menus. */
async function switchToStandardMode(page) {
  const toggle = page.locator('#uiModeToggle');
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  }
}

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
  await page.waitForTimeout(1200);
}

async function backToForge(page) {
  await page.locator('#classicModeToggle').click();
  await expect(page.locator('body')).not.toHaveAttribute(
    'data-ui-mode',
    'classic'
  );
  await page.waitForTimeout(1000);
}

/** Scene truth + control truth in one read. */
function probe(page) {
  return page.evaluate(() => {
    const dbg = window.__forgeDebug ?? {};
    return {
      grid: dbg.grid?.() ?? null,
      ticksInScene: dbg.axisTickOverlay?.()?.inScene ?? null,
      triadPresent: dbg.axisTriad?.()?.present ?? null,
      scheme: dbg.previewColorScheme?.() ?? null,
      zoomToCursor: dbg.zoomToCursor?.() ?? null,
      statusBarHidden: document
        .getElementById('previewStatusBar')
        ?.classList.contains('user-hidden'),
      modelColor: document.getElementById('modelColorPicker')?.value ?? null,
      modelColorEnabled:
        document.getElementById('modelColorEnabled')?.checked ?? null,
      opacity: document.getElementById('modelOpacityInput')?.value ?? null,
      brightness: document.getElementById('brightnessInput')?.value ?? null,
      contrast: document.getElementById('contrastInput')?.value ?? null,
      appearanceEnabled:
        document.getElementById('modelAppearanceEnabled')?.checked ?? null,
      rotateSpeed:
        document.getElementById('rotationSpeedInput')?.value ?? null,
      autoRotatePressed:
        document
          .getElementById('autoRotateToggle')
          ?.getAttribute('aria-pressed') ?? null,
    };
  });
}

function readScoped(page, baseKeys) {
  return page.evaluate((keys) => {
    const out = {};
    for (const key of keys) {
      out[`${key}--forge`] = localStorage.getItem(`${key}--forge`);
      out[`${key}--classic`] = localStorage.getItem(`${key}--classic`);
    }
    return out;
  }, baseKeys);
}

async function openViewMenuCheckbox(page, name) {
  await page.locator('#viewMenuBtn').click();
  const item = page.getByRole('menuitemcheckbox', { name });
  await expect(item).toBeVisible({ timeout: 5_000 });
  await item.click();
  await page.keyboard.press('Escape');
}

test.describe('UF-14 per-interface preference matrix', () => {
  test('uf14-matrix-flagship: real controls write their own namespace and every flip restores it', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    });
    await loadProject(page);
    await switchToStandardMode(page);

    const canvases = await page.locator('.preview-panel canvas').count();
    test.skip(canvases === 0, 'no WebGL renderer: no scene to assert on');

    // FORGE: axes on, status bar hidden — through the View menu, the real
    // Forge home for these toggles (UF-11).
    await openViewMenuCheckbox(page, 'Show Axes');
    await openViewMenuCheckbox(page, 'Show Status Bar');
    let forge = await probe(page);
    expect(forge.triadPresent, 'Forge axes just turned on').toBe(true);
    expect(forge.statusBarHidden, 'Forge status bar just hidden').toBe(true);
    expect(forge.grid?.enabled, 'the Forge grid defaults on').toBe(true);
    expect(forge.scheme).toBe('light');

    // CLASSIC: its own desktop defaults appear (nothing written), then a
    // divergent Classic reality: axes off, grid on at 256x256 and the
    // Nature scheme — all through Classic Preferences, its Q-40c home.
    await enterClassicStandard(page);
    let classic = await probe(page);
    expect(classic.ticksInScene, 'Classic ticks default on').toBe(true);
    expect(classic.triadPresent, 'Classic axes default on').toBe(true);
    expect(classic.grid?.enabled, 'Classic grid defaults off').toBe(false);
    expect(classic.statusBarHidden, 'the Forge hide is not Classic').toBe(
      false
    );
    expect(classic.scheme).toBe('classic');

    await page.locator('#classicAxesToggle').click();
    await expect(page.locator('#classicAxesToggle')).toHaveAttribute(
      'aria-pressed',
      'false'
    );

    await page.locator('#editMenuBtn').click();
    await page.getByRole('menuitem', { name: /preferences/i }).click();
    await page.locator('#prefs-tab-3dview').click();
    await page.locator('#prefsShowGrid').check();
    await page.locator('#prefsGridSizeSelect').selectOption('256x256');
    await page.locator('#prefsScheme-nature').check();
    await page.locator('#preferencesModalDone').click();

    classic = await probe(page);
    expect(classic.grid?.enabled).toBe(true);
    expect(classic.grid?.size).toEqual({ widthMm: 256, heightMm: 256 });
    expect(classic.scheme).toBe('nature');

    // Each side wrote its OWN keys and only those.
    const keys = await readScoped(page, [
      K.grid,
      K.gridSize,
      K.axes,
      K.scheme,
      K.statusBar,
    ]);
    expect(keys[`${K.grid}--classic`]).toBe('true');
    expect(keys[`${K.grid}--forge`]).toBeNull();
    expect(keys[`${K.gridSize}--classic`]).toBe(
      '{"widthMm":256,"heightMm":256}'
    );
    expect(keys[`${K.gridSize}--forge`]).toBeNull();
    expect(keys[`${K.axes}--classic`]).toBe('false');
    expect(keys[`${K.axes}--forge`]).toBe('true');
    expect(keys[`${K.scheme}--classic`]).toBe('nature');
    expect(keys[`${K.scheme}--forge`]).toBeNull();
    expect(keys[`${K.statusBar}--forge`]).toBe('false');
    expect(keys[`${K.statusBar}--classic`]).toBeNull();

    // FORGE again: its own look returns untouched by everything Classic did.
    await backToForge(page);
    forge = await probe(page);
    expect(forge.triadPresent, 'Forge axes still on').toBe(true);
    expect(forge.ticksInScene, 'Forge never had ticks').toBe(false);
    expect(forge.grid?.enabled, 'Forge grid still on').toBe(true);
    expect(forge.grid?.size, 'Forge grid size untouched by Classic').toEqual({
      widthMm: 220,
      heightMm: 220,
    });
    expect(forge.statusBarHidden, 'Forge status bar still hidden').toBe(true);
    expect(forge.scheme).toBe('light');

    // CLASSIC again: its choices survived the round trip.
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    await page.waitForTimeout(1200);
    classic = await probe(page);
    expect(classic.triadPresent, 'the Classic axes-off choice stuck').toBe(
      false
    );
    expect(classic.grid?.enabled).toBe(true);
    expect(classic.grid?.size).toEqual({ widthMm: 256, heightMm: 256 });
    expect(classic.scheme).toBe('nature');

    // RELOAD-PERSISTENCE: both namespaces survive a full page load intact.
    await page.reload();
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    const persisted = await readScoped(page, [K.grid, K.gridSize, K.axes, K.scheme, K.statusBar]);
    expect(persisted[`${K.grid}--classic`]).toBe('true');
    expect(persisted[`${K.gridSize}--classic`]).toBe(
      '{"widthMm":256,"heightMm":256}'
    );
    expect(persisted[`${K.axes}--classic`]).toBe('false');
    expect(persisted[`${K.axes}--forge`]).toBe('true');
    expect(persisted[`${K.scheme}--classic`]).toBe('nature');
    expect(persisted[`${K.statusBar}--forge`]).toBe('false');
  });

  test('uf14-matrix-all-rows: every signed PER-UI row serves its own side across flips', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    // Pre-seed EVERY row's two namespaces with distinct values (the seed
    // marker set so the one-time split cannot overwrite them). What this
    // proves is the READ half of every row: boot serves Forge's copy, a
    // flip serves Classic's, a flip back serves Forge's again.
    await page.addInitScript(
      ([keys, marker]) => {
        localStorage.setItem('openscad-forge-first-visit-seen', 'true');
        localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
        localStorage.setItem(marker, 'true');
        const seed = {
          [`${keys.grid}--forge`]: 'true',
          [`${keys.grid}--classic`]: 'false',
          [`${keys.gridSize}--forge`]: '{"widthMm":250,"heightMm":210}',
          [`${keys.gridSize}--classic`]: '{"widthMm":256,"heightMm":256}',
          [`${keys.gridColor}--forge`]: '#112233',
          [`${keys.gridColor}--classic`]: '#445566',
          [`${keys.gridOpacity}--forge`]: '40',
          [`${keys.gridOpacity}--classic`]: '70',
          [`${keys.axes}--forge`]: 'false',
          [`${keys.axes}--classic`]: 'true',
          [`${keys.axisMarks}--forge`]: 'false',
          [`${keys.axisMarks}--classic`]: 'true',
          [`${keys.edges}--forge`]: 'true',
          [`${keys.edges}--classic`]: 'false',
          [`${keys.edgeBudget}--forge`]: '250000',
          [`${keys.edgeBudget}--classic`]: '5000',
          [`${keys.crosshairs}--forge`]: 'false',
          [`${keys.crosshairs}--classic`]: 'true',
          [`${keys.wireframe}--forge`]: 'false',
          [`${keys.wireframe}--classic`]: 'true',
          [`${keys.measurements}--forge`]: 'false',
          [`${keys.measurements}--classic`]: 'true',
          [`${keys.scheme}--forge`]: 'cornfield',
          [`${keys.scheme}--classic`]: 'tomorrow',
          [`${keys.statusBar}--forge`]: 'true',
          [`${keys.statusBar}--classic`]: 'false',
          [`${keys.autoRotate}--forge`]: 'false',
          [`${keys.autoRotate}--classic`]: 'false',
          [`${keys.rotateSpeed}--forge`]: '0.5',
          [`${keys.rotateSpeed}--classic`]: '2',
          [`${keys.autoBed}--forge`]: 'true',
          [`${keys.autoBed}--classic`]: 'false',
          [`${keys.zoomToCursor}--forge`]: 'true',
          [`${keys.zoomToCursor}--classic`]: 'false',
          [`${keys.modelColor}--forge`]: '#aabbcc',
          [`${keys.modelColor}--classic`]: '#0000ff',
          [`${keys.modelColorEnabled}--forge`]: 'true',
          [`${keys.modelColorEnabled}--classic`]: 'false',
          [`${keys.modelOpacity}--forge`]: '80',
          [`${keys.modelOpacity}--classic`]: '60',
          [`${keys.brightness}--forge`]: '90',
          [`${keys.brightness}--classic`]: '70',
          [`${keys.contrast}--forge`]: '110',
          [`${keys.contrast}--classic`]: '85',
          [`${keys.appearanceEnabled}--forge`]: 'true',
          [`${keys.appearanceEnabled}--classic`]: 'false',
        };
        for (const [key, value] of Object.entries(seed)) {
          localStorage.setItem(key, value);
        }
      },
      [K, SEED_MARKER]
    );
    await loadProject(page);
    await switchToStandardMode(page);

    const canvases = await page.locator('.preview-panel canvas').count();
    test.skip(canvases === 0, 'no WebGL renderer: no scene to assert on');

    const expectForgeSide = (p) => {
      expect(p.grid?.enabled).toBe(true);
      expect(p.grid?.size).toEqual({ widthMm: 250, heightMm: 210 });
      expect(p.triadPresent).toBe(false);
      expect(p.ticksInScene).toBe(false);
      expect(p.statusBarHidden).toBe(false);
      expect(p.zoomToCursor).toBe(true);
      expect(p.scheme).toBe('light');
      expect(p.modelColor).toBe('#aabbcc');
      expect(p.modelColorEnabled).toBe(true);
      expect(p.opacity).toBe('80');
      expect(p.brightness).toBe('90');
      expect(p.contrast).toBe('110');
      expect(p.appearanceEnabled).toBe(true);
      expect(p.rotateSpeed).toBe('0.5');
      expect(p.autoRotatePressed).toBe('false');
    };

    let p = await probe(page);
    expectForgeSide(p);

    await enterClassicStandard(page);
    p = await probe(page);
    expect(p.grid?.enabled).toBe(false);
    expect(p.grid?.size).toEqual({ widthMm: 256, heightMm: 256 });
    expect(p.triadPresent).toBe(true);
    expect(p.ticksInScene).toBe(true);
    expect(p.statusBarHidden).toBe(true);
    expect(p.zoomToCursor).toBe(false);
    expect(p.scheme, 'the Classic-saved Tomorrow scheme paints').toBe(
      'tomorrow'
    );
    expect(p.modelColor).toBe('#0000ff');
    expect(p.modelColorEnabled).toBe(false);
    expect(p.opacity).toBe('60');
    expect(p.brightness).toBe('70');
    expect(p.contrast).toBe('85');
    expect(p.appearanceEnabled).toBe(false);
    expect(p.rotateSpeed).toBe('2');
    expect(p.autoRotatePressed).toBe('false');

    // The remaining rows have no cheap scene probe; the storage half of the
    // walk pins them: values still distinct per side after the flip.
    const still = await readScoped(page, [
      K.gridColor,
      K.gridOpacity,
      K.edges,
      K.edgeBudget,
      K.crosshairs,
      K.wireframe,
      K.measurements,
      K.autoBed,
    ]);
    expect(still[`${K.gridColor}--forge`]).toBe('#112233');
    expect(still[`${K.gridColor}--classic`]).toBe('#445566');
    expect(still[`${K.gridOpacity}--forge`]).toBe('40');
    expect(still[`${K.gridOpacity}--classic`]).toBe('70');
    expect(still[`${K.edges}--forge`]).toBe('true');
    expect(still[`${K.edges}--classic`]).toBe('false');
    expect(still[`${K.edgeBudget}--forge`]).toBe('250000');
    expect(still[`${K.edgeBudget}--classic`]).toBe('5000');
    expect(still[`${K.crosshairs}--classic`]).toBe('true');
    expect(still[`${K.wireframe}--classic`]).toBe('true');
    expect(still[`${K.measurements}--classic`]).toBe('true');
    expect(still[`${K.autoBed}--classic`]).toBe('false');

    await backToForge(page);
    p = await probe(page);
    expectForgeSide(p);
  });

  // UF-15 P3 (U-26d): the cross-wire candidates OUTSIDE the per-UI set.
  // The signed Q-40 table marks auto-preview, preview quality and the
  // editor prefs APP-LEVEL (one value, both interfaces), and projection is
  // live camera state SHARED BY ORDER (never persisted at all). MEASURED
  // while writing this: auto-preview enablement is itself live session
  // state — its storage key is written only by memory recovery and read by
  // nothing — so its sharing proof is the live control state, not storage.
  // This case proves the sharing is sanctioned and whole: values set in
  // Classic arrive in Forge, no row grows a --forge/--classic sibling, and
  // nothing invents a projection key. It also pins UF-15 P2's promise: a
  // scheme choice persists at once, announces, and the reopened control
  // shows it. One WASM load.
  test('uf15-matrix-app-level: shared rows stay shared and a scheme choice is never lost', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    });
    await loadProject(page);
    await switchToStandardMode(page);
    await enterClassicStandard(page);

    const canvases = await page.locator('.preview-panel canvas').count();
    test.skip(canvases === 0, 'no WebGL renderer: no scene to assert on');

    // ── The scheme choice is saved and announced the moment it is made
    // (UF-15 P2), and the reopened dialog shows it (the multi-copy rule).
    await page.locator('#editMenuBtn').click();
    await page.getByRole('menuitem', { name: /preferences/i }).click();
    await page.locator('#prefs-tab-3dview').click();
    await page.locator('#prefsScheme-nature').check();
    // The announcer clears itself after 1.5s; probe inside the window.
    await page.waitForTimeout(400);
    expect(
      await page.evaluate(
        () => document.getElementById('srAnnouncer')?.textContent ?? null
      )
    ).toBe('Color scheme Nature');
    await page.locator('#preferencesModalDone').click();

    const schemeKeys = await readScoped(page, [K.scheme]);
    expect(schemeKeys[`${K.scheme}--classic`]).toBe('nature');
    expect(schemeKeys[`${K.scheme}--forge`]).toBeNull();

    await page.locator('#editMenuBtn').click();
    await page.getByRole('menuitem', { name: /preferences/i }).click();
    await expect(page.locator('#prefsScheme-nature')).toBeChecked();
    await page.locator('#preferencesModalDone').click();

    // ── The APP-LEVEL rows, set through Classic's own controls. Auto-
    // preview off first, so the quality change below cannot queue a
    // re-render this case would then have to wait out.
    await page.locator('#classicAutoPreviewCheck').uncheck();

    await page.locator('#editMenuBtn').click();
    await page.getByRole('menuitem', { name: /preferences/i }).click();
    await page.locator('#prefs-tab-editor').click();
    const font = page.locator('#prefsEditorFontSize');
    await font.fill('18');
    await font.dispatchEvent('change');
    await page.locator('#preferencesModalDone').click();

    await page.locator('#viewMenuBtn').click();
    await page.getByRole('menuitem', { name: 'Preview Quality' }).click();
    await page
      .getByRole('menuitemradio', { name: 'Fast (lower resolution)' })
      .click();

    await page.locator('#classicTbOrthogonalBtn').click();
    await expect
      .poll(() => page.evaluate(() => window.__forgeDebug.projection()), {
        timeout: 5_000,
      })
      .toBe('orthographic');

    // Storage truth: one unsuffixed value per row, no namespaced siblings,
    // and no projection key exists at all.
    const APP_LEVEL_BASES = [
      'openscad-forge-auto-preview-enabled',
      'openscad-forge-preview-quality-mode',
      'openscad-forge-editor-font-size',
      'openscad-forge-editor-indent-width',
      'openscad-forge-editor-tab-width',
      'openscad-forge-editor-line-wrap',
      'openscad-forge-editor-highlight-line',
    ];
    const shared = await page.evaluate((bases) => {
      const keys = Object.keys(localStorage);
      return {
        quality: localStorage.getItem('openscad-forge-preview-quality-mode'),
        editorFont: localStorage.getItem('openscad-forge-editor-font-size'),
        projectionKeys: keys.filter((k) => /projection/i.test(k)),
        scopedSiblings: keys.filter((k) =>
          bases.some((b) => k === `${b}--forge` || k === `${b}--classic`)
        ),
      };
    }, APP_LEVEL_BASES);
    expect(shared.quality).toBe('fast');
    expect(shared.editorFont).toBe('18');
    expect(shared.projectionKeys).toEqual([]);
    expect(shared.scopedSiblings).toEqual([]);

    // ── Forge: every shared row ARRIVES; the per-UI scheme does not.
    await backToForge(page);
    expect(
      await page.evaluate(() => window.__forgeDebug.projection())
    ).toBe('orthographic');
    // The Classic uncheck reached Forge's toggle live (the shared
    // controller state — auto-preview's sharing is not a storage story).
    expect(
      await page.evaluate(
        () => document.getElementById('autoPreviewToggle')?.checked
      )
    ).toBe(false);
    expect(
      await page.evaluate(() => window.__forgeDebug.previewColorScheme())
    ).toBe('light');

    await page.locator('#editMenuBtn').click();
    await page.getByRole('menuitem', { name: /preferences/i }).click();
    await page.locator('#prefs-tab-editor').click();
    await expect(page.locator('#prefsEditorFontSize')).toHaveValue('18');
    // And the scheme group is Classic-only here (Q-41).
    await page.locator('#prefs-tab-3dview').click();
    await expect(page.locator('#prefsColorSchemeList')).toBeHidden();
    await page.locator('#preferencesModalDone').click();

    // ── Classic again: its own scheme returns; the live camera stays put.
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    await page.waitForTimeout(1200);
    expect(
      await page.evaluate(() => window.__forgeDebug.previewColorScheme())
    ).toBe('nature');
    expect(
      await page.evaluate(() => window.__forgeDebug.projection())
    ).toBe('orthographic');
  });
});
