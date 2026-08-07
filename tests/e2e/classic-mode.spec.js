import { test, expect } from '@playwright/test';
import path from 'path';

// Classic mode (desktop-OpenSCAD-style layout) — C4 acceptance.
//
// Classic is gated on the classic_mode feature flag (default ON since C4.6);
// flag-off behavior is covered via the URL override. Mode switching goes
// through the real UI: the header Classic toggle, the Simplified/Standard
// switch, and View > Interface Mode radios.

const FIXTURE = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');

const WASM_READY_TIMEOUT = 180_000;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
  });
});

async function loadSampleProject(page, { query = '' } = {}) {
  await page.goto(`/${query}`);
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });

  await page.locator('#fileInput').setInputFiles(FIXTURE);
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

async function switchToStandardMode(page) {
  const toggle = page.locator('#uiModeToggle');
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  }
}

async function pickInterfaceMode(page, radioName) {
  await page.locator('#viewMenuBtn').click();
  const radio = page.getByRole('menuitemradio', { name: radioName });
  await expect(radio).toBeVisible({ timeout: 5_000 });
  await radio.click();
}

test.describe('Classic header toggle (C1)', () => {
  test('classic-header-toggle: always-visible button enters classic and returns to the remembered custom mode', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await loadSampleProject(page);

    const classicToggle = page.locator('#classicModeToggle');
    await expect(classicToggle).toBeVisible();
    await expect(classicToggle).toHaveAttribute('aria-pressed', 'false');

    // Enter classic straight from the default Simplified mode
    await classicToggle.click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    await expect(classicToggle).toHaveAttribute('aria-pressed', 'true');

    // The View menu radio agrees with the header toggle
    await page.locator('#viewMenuBtn').click();
    await expect(
      page.getByRole('menuitemradio', { name: /Classic/ })
    ).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');

    // Exiting returns to the mode the user came FROM (simplified, not standard)
    await classicToggle.click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'simplified'
    );
    await expect(classicToggle).toHaveAttribute('aria-pressed', 'false');

    // From Standard, the round-trip remembers standard
    await switchToStandardMode(page);
    await classicToggle.click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    await classicToggle.click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'standard'
    );
  });

  test('classic mode persists across reload and exit still returns to the remembered mode', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await loadSampleProject(page);
    await switchToStandardMode(page);

    const classicToggle = page.locator('#classicModeToggle');
    await classicToggle.click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );

    await page.reload();
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    await expect(classicToggle).toHaveAttribute('aria-pressed', 'true');

    await classicToggle.click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'standard'
    );
  });

  test('header toggle is hidden when the classic_mode flag is off', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await page.goto('/?flag_classic_mode=false');
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });

    await expect(page.locator('#classicModeToggle')).toHaveClass(/hidden/);
  });
});

test.describe('Classic chrome strip (C3)', () => {
  test('classic-strips-custom-chrome: Forge chrome hides in classic and returns on exit', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await loadSampleProject(page);
    await switchToStandardMode(page);

    // Sanity: the chrome exists in the custom modes
    for (const sel of [
      '#uiModeToggle',
      '#actionsBar',
      '#paramPanel > .panel-header',
      '#clearFileBtn',
    ]) {
      await expect(page.locator(sel)).toBeVisible();
    }

    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );

    const hiddenInClassic = [
      '#uiModeToggle',
      // Classic renders one fixed desktop appearance (owner decision)
      '#themeToggle',
      '#contrastToggle',
      '#focusModeBtn',
      '#featuresGuideBtn',
      '#clearFileBtn',
      '#actionsBar',
      '#previewInfoSection',
      '#previewDrawerToggle',
      '#paramSearchSection',
      '.output-format-section',
      '#paramPanel > .panel-header',
      '#cameraPanel',
      // The floating render-state pill duplicates the classic status bar
      '.preview-state-indicator',
    ];
    for (const sel of hiddenInClassic) {
      await expect(
        page.locator(sel).first(),
        `${sel} must be hidden in classic`
      ).toBeHidden();
    }

    // The desktop-style menu bar and all six menus stay visible
    await expect(page.locator('#toolbarMenuBar')).toBeVisible();
    for (const id of [
      '#fileMenuBtn',
      '#editMenuBtn',
      '#designMenuBtn',
      '#viewMenuBtn',
      '#windowMenuBtn',
      '#helpMenuBtn',
    ]) {
      await expect(page.locator(id)).toBeVisible();
    }

    // The Classic-only density switch replaces the custom-mode toggle
    await expect(page.locator('#classicDensityToggle')).toBeVisible();

    // Exit restores the chrome
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'standard'
    );
    for (const sel of [
      '#uiModeToggle',
      '#themeToggle',
      '#contrastToggle',
      '#actionsBar',
      '#paramPanel > .panel-header',
      '#clearFileBtn',
    ]) {
      await expect(page.locator(sel)).toBeVisible();
    }
    await expect(page.locator('#classicDensityToggle')).toBeHidden();
  });
});

test.describe('Classic density: Simplified / Standard inside Classic', () => {
  test('classic-density-switch: the header switch changes the shell without leaving Classic', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    // Default mode is Simplified, so Classic opens in the Simplified view
    await loadSampleProject(page);
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-density',
      'simplified'
    );

    const densityToggle = page.locator('#classicDensityToggle');
    await expect(densityToggle).toBeVisible();
    await expect(densityToggle).toHaveAttribute('role', 'switch');
    await expect(densityToggle).toHaveAttribute('aria-checked', 'false');

    // Simplified drops the code-facing docks and the programmer buttons
    await expect(page.locator('#classicEditorSlot')).toBeHidden();
    await expect(page.locator('#classicConsoleSlot')).toBeHidden();
    await expect(page.locator('#classicTbNewBtn')).toBeHidden();
    await expect(page.locator('#classicTbSaveBtn')).toBeHidden();
    await expect(page.locator('#classicTbUndoBtn')).toBeHidden();
    await expect(page.locator('#editMenuBtn')).toBeHidden();
    await expect(page.locator('#windowMenuBtn')).toBeHidden();

    // ...and keeps everything customizing needs
    await expect(page.locator('.preview-panel')).toBeVisible();
    await expect(page.locator('#paramPanel')).toBeVisible();
    await expect(page.locator('#classicPresetRow #presetControls')).toHaveCount(
      1
    );
    await expect(page.locator('#classicRenderBtn')).toBeVisible();
    await expect(page.locator('#classicTbExportStlBtn')).toBeVisible();
    for (const id of [
      '#fileMenuBtn',
      '#designMenuBtn',
      '#viewMenuBtn',
      '#helpMenuBtn',
    ]) {
      await expect(page.locator(id)).toBeVisible();
    }

    // Switching to Standard restores the full shell — still in Classic
    await densityToggle.click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-density',
      'standard'
    );
    await expect(densityToggle).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#classicEditorSlot')).toBeVisible();
    await expect(page.locator('#classicConsoleSlot')).toBeVisible();
    await expect(page.locator('#classicTbNewBtn')).toBeVisible();
    await expect(page.locator('#editMenuBtn')).toBeVisible();
    await expect(page.locator('#windowMenuBtn')).toBeVisible();
  });

  test('classic-density-menu: View > Simplified view drives the same state', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await loadSampleProject(page);
    await switchToStandardMode(page);
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-density',
      'standard'
    );

    await page.locator('#viewMenuBtn').click();
    const item = page.getByRole('menuitemcheckbox', {
      name: 'Simplified view',
    });
    await expect(item).toBeVisible({ timeout: 5_000 });
    await expect(item).toHaveAttribute('aria-checked', 'false');
    await item.click();

    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-density',
      'simplified'
    );
    await expect(page.locator('#classicDensityToggle')).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  test('classic-density-shared: the choice carries out of Classic and survives reload', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await loadSampleProject(page);
    await switchToStandardMode(page);
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );

    // Choosing Simplified inside Classic is the same preference the custom
    // modes use, so leaving Classic lands in Simplified
    await page.locator('#classicDensityToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-density',
      'simplified'
    );
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'simplified'
    );

    // Back into Classic, the density persists across a reload
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-density',
      'simplified'
    );
    await page.reload();
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-density',
      'simplified'
    );
  });
});

test.describe('Classic on mobile (375px, touch)', () => {
  test.use({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  });

  test('classic-mobile-customizer: the Customizer joins the stacked flow instead of the off-canvas drawer', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await loadSampleProject(page);
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );

    // The custom modes' mobile drawer turns #paramPanel into a fixed,
    // translated off-canvas dialog whose open button lives in the
    // classic-hidden #actionsBar — in classic it must be a normal pane
    const panel = await page.locator('#paramPanel').evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        position: cs.position,
        transform: cs.transform,
        height: Math.round(r.height),
      };
    });
    expect(panel.position, 'not the fixed drawer').toBe('relative');
    expect(panel.transform, 'not translated off-canvas').toBe('none');
    expect(panel.height, 'has real height in the stack').toBeGreaterThan(100);

    await expect(page.locator('#drawerBackdrop')).toBeHidden();

    // Reachable: scrolling the main area brings it fully on screen
    await page.evaluate(() =>
      document.getElementById('paramPanel').scrollIntoView({ block: 'start' })
    );
    await expect
      .poll(async () =>
        page
          .locator('#paramPanel')
          .evaluate(
            (el) => el.getBoundingClientRect().y < window.innerHeight / 2
          )
      )
      .toBe(true);
    await expect(page.locator('#classicCustomizerBar')).toBeVisible();

    // The window itself gained no phantom scroll from the re-flow
    const docOverflow = await page.evaluate(
      () =>
        document.scrollingElement.scrollHeight -
        document.documentElement.clientHeight
    );
    expect(docOverflow, 'no page-level vertical overflow').toBeLessThanOrEqual(
      1
    );
    const hOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    );
    expect(hOverflow, 'no horizontal overflow').toBeLessThanOrEqual(1);
  });

  test('classic-mobile-toolbar: menu-duplicated groups drop out; menus stay on screen', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await loadSampleProject(page);
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );

    // Snap views / projection / overlay toggles are hidden at phone width —
    // every one of them lives in the View menu
    await expect(
      page.locator('.classic-tb-group[aria-label="Views"]')
    ).toBeHidden();
    await expect(
      page.locator('.classic-tb-group[aria-label="Projection"]')
    ).toBeHidden();
    await expect(page.locator('#classicEdgesToggle')).toBeHidden();
    // Primary actions and the bed grid keep their toolbar seats
    await expect(page.locator('#classicPreviewBtn')).toBeVisible();
    await expect(page.locator('#classicRenderBtn')).toBeVisible();
    await expect(page.locator('#classicGridToggle')).toBeVisible();

    await page.locator('#viewMenuBtn').click();
    await expect(
      page.getByRole('menuitem', { name: 'Top', exact: true })
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole('menuitemcheckbox', { name: 'Show Edges' })
    ).toBeVisible();
    await page.keyboard.press('Escape');

    // A right-edge menu re-anchors instead of running off screen
    await page.locator('#helpMenuBtn').click();
    const menuBox = await page
      .locator('.toolbar-menu-modal:not(.hidden) .toolbar-menu-content')
      .boundingBox();
    const viewport = page.viewportSize();
    expect(
      menuBox.x + menuBox.width,
      'menu right edge stays on screen'
    ).toBeLessThanOrEqual(viewport.width);
    expect(menuBox.x, 'menu left edge stays on screen').toBeGreaterThanOrEqual(
      0
    );
    await page.keyboard.press('Escape');
  });

  test('classic-mobile-drawer-interlock: an open drawer closes when Classic takes over', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await loadSampleProject(page);

    // Open the custom-mode mobile drawer first
    const drawerToggle = page.locator('#mobileDrawerToggle');
    await expect(drawerToggle).toBeVisible();
    await drawerToggle.click();
    await expect(page.locator('#paramPanel')).toHaveClass(/drawer-open/);

    // Entering Classic must close it: no lingering focus trap, scroll lock,
    // or backdrop on a panel that is now in the normal flow. A pointer
    // can't reach the header toggle through the backdrop, but programmatic
    // mode flips (deep links, per-project UI preferences) can fire while
    // the drawer is open — a DOM click exercises exactly that path.
    await page.evaluate(() =>
      document.getElementById('classicModeToggle').click()
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    await expect(page.locator('#paramPanel')).not.toHaveClass(/drawer-open/);
    await expect(page.locator('body')).not.toHaveClass(/drawer-open/);
    await expect(page.locator('#drawerBackdrop')).toBeHidden();
  });
});

test.describe('Classic editor content integrity', () => {
  test('classic-editor-reload-cycle: no ghost editor on the welcome screen; code appears after load and survives the round-trip', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    // The user's persisted state: reload lands straight in Classic
    await page.addInitScript(() => {
      localStorage.setItem(
        'openscad-forge-ui-mode',
        JSON.stringify({ mode: 'classic', lastCustomMode: 'standard' })
      );
    });
    await page.goto('/');
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });

    // On the welcome screen no editor instance may exist — a zero-size
    // CodeMirror created here reported '' as the document and poisoned the
    // editor-state capture, which is how both UIs ended up with an empty
    // editor while a project was loaded
    await expect(page.locator('#expertModeBody .cm-content')).toHaveCount(0);

    // Load a project through the Classic welcome
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

    // The Classic editor pane shows the file's source
    const cmContent = page.locator('#expertModeBody .cm-content');
    await expect(cmContent).toHaveCount(1, { timeout: 15_000 });
    await expect(cmContent).toContainText('Simple Box', { timeout: 15_000 });

    // Exit to the custom UI and open the Code Editor: same source, not an
    // empty buffer
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'standard'
    );
    await page.locator('#expertModeToggle').click();
    await expect(cmContent).toContainText('Simple Box', { timeout: 10_000 });
  });
});

test.describe('Classic toolbar keyboard access', () => {
  test('classic-toolbar-roving: one tab stop, arrows traverse, hidden buttons skipped', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await loadSampleProject(page);
    await switchToStandardMode(page);
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );

    // Exactly one toolbar button is in the tab order (APG toolbar pattern)
    const tabStops = await page
      .locator('#classicToolbar button[tabindex="0"]')
      .count();
    expect(tabStops, 'single roving tab stop').toBe(1);

    // Arrow keys move focus between buttons
    await page.locator('#classicToolbar button[tabindex="0"]').focus();
    const first = await page.evaluate(() => document.activeElement.id);
    await page.keyboard.press('ArrowRight');
    const second = await page.evaluate(() => document.activeElement.id);
    expect(second).not.toBe(first);
    await page.keyboard.press('ArrowLeft');
    const back = await page.evaluate(() => document.activeElement.id);
    expect(back).toBe(first);

    // End jumps to the last visible button
    await page.keyboard.press('End');
    const last = await page.evaluate(() => document.activeElement.id);
    expect(last).toBe('classicTbCustomizerBtn');

    // In Simplified the stop lands on a visible button — a hidden stop
    // would drop the whole toolbar from the tab order
    await page.locator('#classicDensityToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-density',
      'simplified'
    );
    const stopVisible = await page
      .locator('#classicToolbar button[tabindex="0"]')
      .evaluate((el) => el.offsetParent !== null);
    expect(stopVisible, 'roving stop is a visible button').toBe(true);
  });
});

test.describe('Classic desktop appearance', () => {
  test('classic-desktop-palette: Classic paints itself, not the Forge theme', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await loadSampleProject(page);
    await switchToStandardMode(page);

    // Turn dark theme AND high contrast on in a custom mode first.
    // The theme button cycles Auto → Light → Dark, so click until dark.
    for (let i = 0; i < 3; i++) {
      if ((await page.locator('html').getAttribute('data-theme')) === 'dark') {
        break;
      }
      await page.locator('#themeToggle').click();
    }
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.locator('#contrastToggle').click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-high-contrast',
      'true'
    );

    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );

    // Classic ignores both: chrome stays the desktop light gray/white pair
    const paint = await page.evaluate(() => {
      const cs = getComputedStyle(document.body);
      return {
        chrome: cs.getPropertyValue('--color-bg-secondary').trim(),
        surface: cs.getPropertyValue('--color-bg-primary').trim(),
        accent: cs.getPropertyValue('--color-accent').trim(),
      };
    });
    expect(paint.chrome).toBe('#f0f0f0');
    expect(paint.surface).toBe('#ffffff');
    // Selection blue, never the Forge brand yellow
    expect(paint.accent).toBe('#0067c0');

    // The 3D viewport switches to the desktop Cornfield scheme
    await expect
      .poll(async () =>
        page.evaluate(() => window.__forgeDebug?.previewColorScheme?.() ?? null)
      )
      .toBe('classic');

    // Leaving Classic restores the user's dark + high-contrast preference
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'standard'
    );
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute(
      'data-high-contrast',
      'true'
    );
  });
});

test.describe('Classic acceptance (C13)', () => {
  test('classic-menu-reachability: every hidden control has a menu home', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await loadSampleProject(page);
    // Standard density: the Simplified Classic view drops the Edit and
    // Window menus, and this test walks both
    await switchToStandardMode(page);
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-density',
      'standard'
    );

    // No "(planned)" stubs anywhere in the menus
    for (const menuBtn of [
      '#fileMenuBtn',
      '#designMenuBtn',
      '#viewMenuBtn',
      '#windowMenuBtn',
    ]) {
      await page.locator(menuBtn).click();
      const menuText = await page
        .locator('.toolbar-menu-modal:not(.hidden)')
        .textContent();
      expect(menuText, `${menuBtn} has no planned stubs`).not.toContain(
        '(planned)'
      );
      await page.keyboard.press('Escape');
    }

    // Design > Automatic Reload and Preview is a real, checkable toggle
    await page.locator('#designMenuBtn').click();
    await expect(
      page.getByRole('menuitemcheckbox', {
        name: 'Automatic Reload and Preview',
      })
    ).toBeVisible();
    await page.keyboard.press('Escape');

    // Window > Customizer hides and restores the dock
    await page.locator('#windowMenuBtn').click();
    await page.getByRole('menuitemcheckbox', { name: 'Customizer' }).click();
    await expect(page.locator('#paramPanel')).toBeHidden();
    await page.locator('#windowMenuBtn').click();
    await page.getByRole('menuitemcheckbox', { name: 'Customizer' }).click();
    await expect(page.locator('#paramPanel')).toBeVisible();

    // View > Preview Quality submenu proxies the real select
    await page.locator('#viewMenuBtn').click();
    const qualitySubmenu = page.getByRole('menuitem', {
      name: 'Preview Quality',
    });
    await expect(qualitySubmenu).toBeVisible();
    await page.keyboard.press('Escape');

    // File > Close returns to the welcome screen (accept the unsaved-changes
    // confirmation the #clearFileBtn handler shows)
    await page.locator('#fileMenuBtn').click();
    await page.getByRole('menuitem', { name: 'Close', exact: true }).click();
    await page
      .locator('button:has-text("Confirm")')
      .first()
      .click({ timeout: 5_000 });
    await expect(page.locator('#welcomeScreen')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('classic-midwidth: 900px classic stacks with all panes reachable', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await page.setViewportSize({ width: 900, height: 800 });
    await loadSampleProject(page);
    // Standard density so every pane is in play for the stack assertions
    await switchToStandardMode(page);
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );

    await expect(page.locator('.preview-panel')).toBeVisible();
    await expect(page.locator('#paramPanel')).toBeVisible();
    await expect(page.locator('#classicConsoleSlot')).toBeVisible();
    await expect(page.locator('#classicEditorSlot')).toBeVisible();
    await expect(page.locator('#cameraPanel')).toBeHidden();

    // The viewport must keep a usable height: flex:1 with a zero basis used
    // to hand it whatever the fixed-height panes left over, i.e. nothing,
    // collapsing it to a 2px sliver that still counted as "visible"
    const previewBox = await page.locator('.preview-panel').boundingBox();
    expect(previewBox.height, 'viewport keeps a usable height').toBeGreaterThan(
      250
    );

    // No horizontal page scroll in the stacked layout
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    );
    expect(overflow, 'no horizontal overflow').toBeLessThanOrEqual(1);
  });

  test('reduced-motion: classic folds complete instantly', async ({ page }) => {
    test.setTimeout(240_000);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loadSampleProject(page);
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );

    // The app-wide reduced-motion rule clamps durations to ~0.01ms (the
    // standard can't-observe trick), so assert "effectively instant".
    const duration = await page
      .locator('#classicConsoleSlot .classic-fold')
      .evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
    expect(
      duration,
      'fold transition effectively instant under reduced motion'
    ).toBeLessThan(0.005);
  });
});

test.describe('Classic mode layout (C4)', () => {
  test('entering Classic moves console and presets into pane slots, exiting restores them', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await loadSampleProject(page, { query: '?flag_classic_mode=true' });
    await switchToStandardMode(page);

    // Open a parameter group so the Classic startup contract (all groups
    // collapsed) is observable rather than trivially true
    const firstGroup = page.locator('details.param-group').first();
    await expect(firstGroup).toBeVisible({ timeout: 15_000 });
    if (!(await firstGroup.evaluate((el) => el.open))) {
      await firstGroup.locator('summary').click();
    }
    await expect(firstGroup).toHaveJSProperty('open', true);

    // Record the original DOM location of the panes to be moved
    const originalParents = await page.evaluate(() => ({
      console: document.getElementById('consolePanel')?.parentElement?.id,
      presets: document.getElementById('presetControls')?.parentElement?.id,
    }));
    expect(originalParents.console).toBeTruthy();
    expect(originalParents.presets).toBeTruthy();

    await pickInterfaceMode(page, 'Classic (Desktop Layout)');

    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );

    // Console pane: moved into its labelled slot and forced open
    const consoleSlot = page.locator('#classicConsoleSlot');
    await expect(consoleSlot).toBeVisible();
    await expect(consoleSlot.locator('#consolePanel')).toHaveCount(1);
    await expect(page.locator('#consolePanel')).toHaveAttribute('open', '');

    // Presets: moved INTO the Customizer dock's preset row (C7); the old
    // standalone presets slot no longer exists
    await expect(page.locator('#classicPresetsSlot')).toHaveCount(0);
    await expect(page.locator('#classicPresetRow #presetControls')).toHaveCount(
      1
    );
    await expect(page.locator('#classicCustomizerBar')).toBeVisible();

    // Editor pane (C5): visible by default alongside the customizer
    const editorSlot = page.locator('#classicEditorSlot');
    await expect(editorSlot).toBeVisible();
    await expect(editorSlot.locator('#expertModePanel')).toHaveCount(1);
    await expect(page.locator('#parametersContainer')).toBeVisible();

    // Display + customizer panes still present
    await expect(page.locator('.preview-panel')).toBeVisible();
    await expect(page.locator('#paramPanel')).toBeVisible();

    // Startup contract: every customizer group is collapsed on entry
    const openGroups = await page
      .locator('#parametersContainer details.param-group[open]')
      .count();
    expect(openGroups, 'all param groups collapsed in Classic').toBe(0);

    // Icon toolbar (C6): docked under the menu bar with snap views, overlay
    // toggles, bed-size select, and Preview/Render — chokusen icons render
    const toolbar = page.locator('#classicToolbar');
    await expect(toolbar).toBeVisible();
    await expect(toolbar.locator('[data-classic-view]')).toHaveCount(7);
    await expect(toolbar.locator('#classicRenderBtn')).toBeVisible();
    const toolbarBox = await toolbar.boundingBox();
    const menuBox = await page.locator('#toolbarMenuBar').boundingBox();
    expect(
      toolbarBox.y,
      'toolbar sits below the menu bar'
    ).toBeGreaterThanOrEqual(menuBox.y);
    const iconImage = await toolbar
      .locator('.classic-icon[data-icon="render"]')
      .evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(iconImage, 'vendored icon resolves').toContain('openscad-icons');
    const bedOptions = await toolbar
      .locator('#classicGridSizeSelect option')
      .count();
    expect(
      bedOptions,
      'bed-size select populated from grid presets'
    ).toBeGreaterThan(3);

    // Axes toggle reflects pressed state
    const axesToggle = toolbar.locator('#classicAxesToggle');
    const before = await axesToggle.getAttribute('aria-pressed');
    await axesToggle.click();
    await expect(axesToggle).toHaveAttribute(
      'aria-pressed',
      before === 'true' ? 'false' : 'true'
    );
    await axesToggle.click();

    // Window-bottom status bar (C8): visible at the bottom, mirroring the
    // hidden in-viewport overlay's text; only one aria-live status source
    const statusBar = page.locator('#classicStatusBar');
    await expect(statusBar).toBeVisible();
    await expect(page.locator('#previewStatusBar')).toBeHidden();
    const barBox = await statusBar.boundingBox();
    const viewport = page.viewportSize();
    expect(
      barBox.y + barBox.height,
      'status bar sits at the window bottom'
    ).toBeGreaterThan(viewport.height * 0.8);
    await expect
      .poll(async () =>
        page.locator('#classicStatusText').evaluate((el) => el.textContent)
      )
      .toBe(
        await page
          .locator('#previewStatusText')
          .evaluate((el) => el.textContent)
      );

    // Console fold (C10): the titlebar button folds the console pane and
    // the display pane grows into the freed row
    const consoleFold = page.locator('#classicConsoleFoldBtn');
    await expect(consoleFold).toBeVisible();
    const displayBefore = await page.locator('.preview-panel').boundingBox();
    await consoleFold.click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-console-collapsed',
      'true'
    );
    await expect
      .poll(
        async () => (await page.locator('.preview-panel').boundingBox()).height
      )
      .toBeGreaterThan(displayBefore.height);
    await consoleFold.click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-console-collapsed',
      'false'
    );

    // Exit back to Standard: exact DOM restore, slots removed
    await pickInterfaceMode(page, 'Standard');
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'standard'
    );

    const restoredParents = await page.evaluate(() => ({
      console: document.getElementById('consolePanel')?.parentElement?.id,
      presets: document.getElementById('presetControls')?.parentElement?.id,
    }));
    expect(restoredParents.console).toBe(originalParents.console);
    expect(restoredParents.presets).toBe(originalParents.presets);
    await expect(page.locator('#classicConsoleSlot')).toHaveCount(0);
    await expect(page.locator('#classicEditorSlot')).toHaveCount(0);
    await expect(page.locator('#classicToolbar')).toBeHidden();
    await expect(page.locator('#classicCustomizerBar')).toBeHidden();
  });

  test('preset copy and unsaved-changes guard (C4.4)', async ({ page }) => {
    test.setTimeout(240_000);

    // Legacy native select (combobox flag off) so the test can drive the
    // preset dropdown directly
    await loadSampleProject(page, {
      query: '?flag_classic_mode=true&flag_searchable_combobox=false',
    });
    await switchToStandardMode(page);
    await pickInterfaceMode(page, 'Classic (Desktop Layout)');
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );

    const presetSelect = page.locator('#presetSelect');

    // Ken's contract: "design default values" is the first real entry
    await expect(presetSelect.locator('option').nth(1)).toHaveText(
      'design default values'
    );

    // Copy design defaults into a new preset; it becomes the selection
    await presetSelect.selectOption('__design_defaults__');
    await page.locator('#copyPresetBtn').click();
    await expect(
      presetSelect.locator('option', {
        hasText: 'design default values (copy)',
      })
    ).toHaveCount(1);
    const copyValue = await presetSelect.inputValue();
    expect(copyValue).not.toBe('__design_defaults__');
    expect(copyValue).not.toBe('');

    // Dirty the copy: change a parameter
    const firstGroup = page.locator('details.param-group').first();
    await firstGroup.locator('summary').click();
    const widthInput = page
      .locator('.param-group input[type="number"]')
      .first();
    await expect(widthInput).toBeVisible({ timeout: 15_000 });
    await widthInput.fill('77');
    await widthInput.blur();

    // Switching away now prompts; Cancel keeps the dirty preset selected
    await presetSelect.selectOption('__design_defaults__');
    const dialog = page.locator('dialog', {
      hasText: 'Unsaved preset changes',
    });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(presetSelect).toHaveValue(copyValue);

    // Switching again and discarding completes the switch
    await presetSelect.selectOption('__design_defaults__');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole('button', { name: 'Discard changes' }).click();
    await expect(presetSelect).toHaveValue('__design_defaults__');
  });

  test('Classic radio is absent when the classic_mode flag is off', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    // classic_mode defaults on since C4.6; force it off via URL override
    await loadSampleProject(page, { query: '?flag_classic_mode=false' });
    await switchToStandardMode(page);

    await page.locator('#viewMenuBtn').click();
    await expect(
      page.getByRole('menuitemradio', { name: 'Standard' })
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole('menuitemradio', { name: 'Classic (Desktop Layout)' })
    ).toHaveCount(0);
  });
});

test.describe('Classic dock shell (B2)', () => {
  test('classic-dock-strip: Console and Error-Log sit side by side under a full-height editor', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await page.setViewportSize({ width: 1280, height: 800 });
    await loadSampleProject(page, { query: '?flag_classic_mode=true' });
    await switchToStandardMode(page);
    await pickInterfaceMode(page, 'Classic (Desktop Layout)');
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );

    const strip = page.locator('#classicBottomStrip');
    const consoleSlot = page.locator('#classicConsoleSlot');
    const errorLogSlot = page.locator('#classicErrorLogSlot');
    const editorSlot = page.locator('#classicEditorSlot');

    await expect(strip).toBeVisible();
    await expect(consoleSlot).toBeVisible();
    await expect(errorLogSlot).toBeVisible();

    // The Error-Log pane is a sibling of Console inside the strip, not a tab
    await expect(strip.locator('> #classicConsoleSlot')).toHaveCount(1);
    await expect(strip.locator('> #classicErrorLogSlot')).toHaveCount(1);
    await expect(errorLogSlot.locator('#error-log-output')).toHaveCount(1);

    const [stripBox, consoleBox, errorBox, editorBox] = await Promise.all([
      strip.boundingBox(),
      consoleSlot.boundingBox(),
      errorLogSlot.boundingBox(),
      editorSlot.boundingBox(),
    ]);

    // Error-Log is to the RIGHT of Console
    expect(errorBox.x).toBeGreaterThan(consoleBox.x);

    // R6: the editor runs full height — it starts above the strip and its
    // bottom edge lines up with the strip's
    expect(editorBox.y).toBeLessThan(consoleBox.y);
    expect(
      Math.abs(editorBox.y + editorBox.height - (stripBox.y + stripBox.height))
    ).toBeLessThanOrEqual(4);

    // R7: the strip no longer runs under the editor
    expect(consoleBox.x).toBeGreaterThanOrEqual(
      editorBox.x + editorBox.width - 2
    );

    // R8: the camera bar exists as its own row between view and strip
    await expect(page.locator('#classicCameraBar')).toHaveCount(1);

    // D-9: Classic replaces the console tabs with panes, so the tablist goes
    await expect(page.locator('.console-view-tabs')).toBeHidden();

    // Every dock field is stamped for the grid to size from
    const body = page.locator('body');
    await expect(body).toHaveAttribute('data-classic-field-left', 'occupied');
    await expect(body).toHaveAttribute(
      'data-classic-field-right-top',
      'occupied'
    );
    await expect(body).toHaveAttribute('data-classic-field-bottom', 'occupied');
    await expect(body).toHaveAttribute(
      'data-classic-field-right-bottom',
      'empty'
    );

    // Reserved fields exist but must not paint as empty dead panes
    await expect(page.locator('#classicAnimateSlot')).toBeHidden();
    await expect(page.locator('#classicFontListSlot')).toBeHidden();
    await expect(page.locator('#classicViewportControlSlot')).toBeHidden();
  });

  test('classic-console-tab-restore: a Structured selection is reset on entry and handed back on exit (D-9)', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await page.setViewportSize({ width: 1280, height: 800 });
    await loadSampleProject(page, { query: '?flag_classic_mode=true' });
    await switchToStandardMode(page);

    // Select the Structured tab in Forge — the console is a collapsed
    // <details>, so it has to be opened before its tablist is reachable
    const consolePanel = page.locator('#consolePanel');
    if (!(await consolePanel.evaluate((el) => el.open))) {
      await consolePanel.locator('summary').first().click();
    }
    const structuredTab = page.locator('#console-tab-structured');
    await expect(structuredTab).toBeVisible({ timeout: 10_000 });
    await structuredTab.click();
    await expect(structuredTab).toHaveAttribute('aria-selected', 'true');

    await pickInterfaceMode(page, 'Classic (Desktop Layout)');
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );

    // Entry sanitation: Log is selected, so exiting cannot strand the panel
    // showing a view whose content Classic moved away
    await expect(page.locator('#console-tab-log')).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(structuredTab).toHaveAttribute('aria-selected', 'false');

    await pickInterfaceMode(page, 'Standard');
    await expect(page.locator('body')).not.toHaveAttribute(
      'data-ui-mode',
      'classic'
    );

    // Exit restore: the panel is handed back as found
    await expect(structuredTab).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.locator('#console-view-structured #error-log-output')
    ).toHaveCount(1);
    await expect(page.locator('.console-view-tabs')).toBeVisible();
  });

  test('classic-dock-occupancy: Simplified empties the left and bottom fields', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await page.setViewportSize({ width: 1280, height: 800 });
    await loadSampleProject(page, { query: '?flag_classic_mode=true' });
    await switchToStandardMode(page);
    await pickInterfaceMode(page, 'Classic (Desktop Layout)');

    const body = page.locator('body');
    await expect(body).toHaveAttribute('data-classic-field-left', 'occupied');

    await page.locator('#classicDensityToggle').click();
    await expect(body).toHaveAttribute('data-classic-density', 'simplified');

    await expect(body).toHaveAttribute('data-classic-field-left', 'empty');
    await expect(body).toHaveAttribute('data-classic-field-bottom', 'empty');
    await expect(page.locator('#classicBottomStrip')).toBeHidden();
    await expect(page.locator('#classicEditorSlot')).toBeHidden();

    // The Customizer keeps its column — Simplified is not a blank screen
    await expect(body).toHaveAttribute(
      'data-classic-field-right-top',
      'occupied'
    );
    await expect(page.locator('#paramPanel')).toBeVisible();
  });
});

test.describe('Classic dock resizers (B4)', () => {
  test('classic-resizer-keyboard: each separator is a tab stop that moves its pane and announces the width', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await page.setViewportSize({ width: 1400, height: 900 });
    await loadSampleProject(page, { query: '?flag_classic_mode=true' });
    await switchToStandardMode(page);
    await pickInterfaceMode(page, 'Classic (Desktop Layout)');

    const editorResizer = page.locator('#classicResizerEditor');
    const customizerResizer = page.locator('#classicResizerCustomizer');
    const stripResizer = page.locator('#classicResizerStrip');

    for (const resizer of [editorResizer, customizerResizer, stripResizer]) {
      await expect(resizer).toBeVisible();
      await expect(resizer).toHaveAttribute('role', 'separator');
      await expect(resizer).toHaveAttribute('tabindex', '0');
    }

    await expect(editorResizer).toHaveAttribute(
      'aria-label',
      'Resize editor pane'
    );
    await expect(customizerResizer).toHaveAttribute(
      'aria-label',
      'Resize Customizer pane'
    );
    await expect(stripResizer).toHaveAttribute(
      'aria-label',
      'Resize bottom panels'
    );
    await expect(editorResizer).toHaveAttribute('aria-orientation', 'vertical');
    await expect(stripResizer).toHaveAttribute(
      'aria-orientation',
      'horizontal'
    );

    // ArrowLeft shrinks the editor, and the announced value follows it
    const editorSlot = page.locator('#classicEditorSlot');
    const widthBefore = (await editorSlot.boundingBox()).width;

    await editorResizer.focus();
    await expect(editorResizer).toBeFocused();
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');

    const widthAfter = (await editorSlot.boundingBox()).width;
    expect(widthAfter).toBeLessThan(widthBefore);

    const valueNow = Number(await editorResizer.getAttribute('aria-valuenow'));
    await expect(editorResizer).toHaveAttribute(
      'aria-valuetext',
      `Editor: ${valueNow}%`
    );

    // Home pins the editor at its minimum and stays there
    await page.keyboard.press('Home');
    const atMin = (await editorSlot.boundingBox()).width;
    await page.keyboard.press('ArrowLeft');
    expect((await editorSlot.boundingBox()).width).toBeCloseTo(atMin, 0);

    // The 3D view keeps its floor when the strip is dragged to its limit
    await stripResizer.focus();
    for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowUp');
    expect(
      (await page.locator('.preview-panel').boundingBox()).height
    ).toBeGreaterThanOrEqual(230);
  });

  test('classic-resizer-persist: a resized column survives a reload', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await page.setViewportSize({ width: 1400, height: 900 });
    await loadSampleProject(page, { query: '?flag_classic_mode=true' });
    await switchToStandardMode(page);
    await pickInterfaceMode(page, 'Classic (Desktop Layout)');

    const editorResizer = page.locator('#classicResizerEditor');
    await editorResizer.focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
    const stored = Number(await editorResizer.getAttribute('aria-valuenow'));

    await page.reload();
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );

    await expect(page.locator('#classicResizerEditor')).toHaveAttribute(
      'aria-valuenow',
      String(stored)
    );
  });

  test('classic-resizer-fold: folding parks the strip height and unfolding returns it', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await page.setViewportSize({ width: 1400, height: 900 });
    await loadSampleProject(page, { query: '?flag_classic_mode=true' });
    await switchToStandardMode(page);
    await pickInterfaceMode(page, 'Classic (Desktop Layout)');

    // Resize the strip away from its default first, so "returns it" means
    // the user's height rather than the default
    const stripResizer = page.locator('#classicResizerStrip');
    await stripResizer.focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp');

    const strip = page.locator('#classicBottomStrip');
    const resizedHeight = (await strip.boundingBox()).height;

    const foldBtn = page.locator('#classicConsoleFoldBtn');
    await expect(foldBtn).toHaveAttribute('aria-label', 'Fold bottom panels');
    await foldBtn.click();

    await expect(foldBtn).toHaveAttribute('aria-expanded', 'false');
    // The fold animates, so the height has to be polled rather than sampled
    await expect
      .poll(async () => (await strip.boundingBox()).height)
      .toBeLessThan(resizedHeight / 2);
    // The separator steps aside while folded rather than fighting the token
    await expect(stripResizer).toBeHidden();

    await foldBtn.click();
    await expect(foldBtn).toHaveAttribute('aria-expanded', 'true');
    // Back to the height the user chose, not the default
    await expect
      .poll(async () =>
        Math.abs((await strip.boundingBox()).height - resizedHeight)
      )
      .toBeLessThan(3);
    await expect(stripResizer).toBeVisible();
  });

  test('classic-resizer-scope: no separators outside Classic or below 1024px', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await page.setViewportSize({ width: 1400, height: 900 });
    await loadSampleProject(page, { query: '?flag_classic_mode=true' });
    await switchToStandardMode(page);

    // Forge keeps Split.js and must gain nothing
    await expect(page.locator('#classicResizerEditor')).toHaveCount(0);

    await pickInterfaceMode(page, 'Classic (Desktop Layout)');
    await expect(page.locator('#classicResizerEditor')).toBeVisible();

    // Below the desktop breakpoint the stacked fallback has no boundaries
    await page.setViewportSize({ width: 900, height: 900 });
    await expect(page.locator('#classicResizerEditor')).toBeHidden();

    await page.setViewportSize({ width: 1400, height: 900 });
    await expect(page.locator('#classicResizerEditor')).toBeVisible();

    // Leaving Classic removes them and the properties they wrote
    await pickInterfaceMode(page, 'Standard');
    await expect(page.locator('#classicResizerEditor')).toHaveCount(0);
    const leftovers = await page.evaluate(() => {
      const el = document.getElementById('mainInterface');
      return [
        el.style.getPropertyValue('--classic-col-editor'),
        el.style.getPropertyValue('--classic-col-customizer'),
        el.style.getPropertyValue('--classic-row-bottom'),
      ].filter(Boolean);
    });
    expect(leftovers).toEqual([]);
  });
});

test.describe('Classic canvas re-measure (B5)', () => {
  test('classic-resizer-remeasure: the 3D canvas follows a keyboard resize', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await page.setViewportSize({ width: 1400, height: 900 });
    await loadSampleProject(page, { query: '?flag_classic_mode=true' });
    await switchToStandardMode(page);
    await pickInterfaceMode(page, 'Classic (Desktop Layout)');

    const canvasSize = () =>
      page.evaluate(() => {
        const canvas = document.querySelector('.preview-panel canvas');
        return canvas
          ? { w: canvas.width, h: canvas.height, css: canvas.clientWidth }
          : null;
      });

    const before = await canvasSize();
    expect(before).not.toBeNull();
    expect(before.w).toBeGreaterThan(0);

    // Shrinking the editor gives the 3D view the space
    const editorResizer = page.locator('#classicResizerEditor');
    await editorResizer.focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');

    // The backing store has to follow the CSS box, not just the box change
    await expect
      .poll(async () => (await canvasSize()).w)
      .toBeGreaterThan(before.w);

    const after = await canvasSize();
    const ratio = after.w / after.css;
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(4);

    // And the same for the horizontal separator
    const stripResizer = page.locator('#classicResizerStrip');
    await stripResizer.focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowUp');

    await expect.poll(async () => (await canvasSize()).h).toBeLessThan(after.h);
  });
});
