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
