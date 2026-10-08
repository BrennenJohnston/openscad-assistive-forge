/**
 * Tours that survive touch.
 *
 * Press the control a tour is pointing at, and the tour should still be
 * there.
 *
 * The boundary: a change inside the tour's own interface family keeps the
 * tour, while crossing between Forge and Classic still closes it. The
 * Simplified/Standard teaching lives in the two box tours, where pressing
 * the switch does something, not in the two welcome tours.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';

const REGISTRY_KEY = 'openscad-forge-tutorial-state';
const CLASSIC_STAMP = JSON.stringify({
  mode: 'classic',
  lastCustomMode: 'standard',
});

/** Live regions clear themselves, so record every write instead of probing late. */
async function boot(page, { classic = false } = {}) {
  await page.addInitScript(
    ({ stamp, useClassic }) => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
      if (useClassic) localStorage.setItem('openscad-forge-ui-mode', stamp);
      window.__said = [];
      document.addEventListener('DOMContentLoaded', () => {
        for (const id of ['srAnnouncer', 'srAnnouncerAssertive']) {
          const el = document.getElementById(id);
          if (!el || el.__watched) continue;
          el.__watched = true;
          new MutationObserver(() => {
            const text = el.textContent.trim();
            if (text) window.__said.push(text);
          }).observe(el, {
            childList: true,
            characterData: true,
            subtree: true,
          });
        }
      });
    },
    { stamp: CLASSIC_STAMP, useClassic: classic }
  );
  await page.goto('/');
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 30_000 });
  // A visible welcome screen is not a wired one: on CI Firefox (cold, slow
  // module evaluation) the Try/tour clicks can fire before main.js attaches
  // their handlers, leaving the app on the welcome surface. The tours load
  // the sample through the engine anyway, so the engine-ready stamp is the
  // honest gate, the same one every sibling suite boots on.
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 180_000,
  });
}

const said = (page) => page.evaluate(() => window.__said.slice());
const registry = (page) =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, REGISTRY_KEY);

async function startWelcomeTour(page) {
  await page.locator('#startWelcomeTourBtn').click();
  await expect(page.locator('.tutorial-panel')).toBeVisible({ timeout: 15_000 });
}

/**
 * What the tour is still painting while a dialog is up.
 *
 * `topmost` answers the only question that matters for WCAG 2.4.11: if a
 * person aims at the middle of this control, does the browser hand the press
 * to it? A veil with `pointer-events: none` passes that test while still
 * painting over the dialog, so the veil is checked separately: it dims the
 * dialog without swallowing the tap.
 */
function tourPaintingOver(page, selectors = []) {
  return page.evaluate((sels) => {
    const name = (el) =>
      `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}`;
    const svg = document.querySelector('.tutorial-spotlight-svg');
    const topmost = {};
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) {
        topmost[sel] = 'missing';
        continue;
      }
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(
        Math.round(r.left + r.width / 2),
        Math.round(r.top + r.height / 2)
      );
      topmost[sel] = !hit
        ? 'nothing'
        : el === hit || el.contains(hit)
          ? 'self'
          : name(hit);
    }
    return {
      veilRendered: svg ? svg.checkVisibility() : false,
      highlighted: [
        ...document.querySelectorAll('.tutorial-target-highlight'),
      ].map(name),
      topmost,
    };
  }, selectors);
}

/** Does the minimized pill intersect the box this dialog actually paints? */
function pillOverlapsDialog(page, dialogSelector) {
  return page.evaluate((sel) => {
    const pill = document.querySelector('.tutorial-minimized');
    const dialog = document.querySelector(sel);
    if (!pill || !dialog) return null;
    if (!pill.checkVisibility()) return false;
    const box = dialog.querySelector('.preset-modal-content, .modal-content');
    if (!box) return null;
    const a = pill.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    return !(
      a.right <= b.left ||
      a.left >= b.right ||
      a.bottom <= b.top ||
      a.top >= b.bottom
    );
  }, dialogSelector);
}

/** Walk the Main Page tour to the Clear Cache step and press what it points at. */
async function pressTheSpotlightedClearCache(page) {
  await boot(page);
  await startWelcomeTour(page);
  await walkTo(page, 'Clear Cache');
  await expect(page.locator('#clearStorageBtn')).toHaveClass(
    /tutorial-target-highlight/
  );

  await page.locator('#clearStorageBtn').click();
  await expect(page.locator('.cache-clear-dialog')).toBeVisible({
    timeout: 10_000,
  });
  // the watcher syncs on a rAF after the mutation, then the pill is placed
  await page.waitForTimeout(700);
}

/** Walk Next until the panel shows `title`. Welcome steps are all passive. */
async function walkTo(page, title, cap = 20) {
  for (let i = 0; i < cap; i++) {
    if ((await page.locator('#tutorial-step-title').textContent()) === title) {
      return;
    }
    await page.locator('#tutorialNextBtn').click();
    await page.waitForTimeout(250);
  }
  await expect(page.locator('#tutorial-step-title')).toHaveText(title);
}

/**
 * The box tour, on the project surface where it belongs. The Beginners card's
 * button carries both data-example and data-tutorial, so one click loads the
 * example and starts the tour 500ms later.
 */
async function startBoxTour(page, { classic = false } = {}) {
  await boot(page, { classic });
  await page.locator('.btn-role-try[data-tutorial="intro"]').click();
  await expect(page.locator('body')).toHaveAttribute(
    'data-app-surface',
    'project',
    { timeout: 180_000 }
  );
  await expect(page.locator('.tutorial-panel')).toBeVisible({ timeout: 60_000 });
}

/**
 * Jump to the density step without satisfying every completion gate between
 * here and there: End goes to the last step (the Main Page ending), and two
 * Backs reach step 16 of 18.
 */
async function jumpToDensityStep(page) {
  await page.keyboard.press('End');
  await expect(page.locator('#tutorial-step-title')).toHaveText(
    'Back to the Main Page',
    { timeout: 15_000 }
  );
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#tutorial-step-title')).toHaveText(
    "You're ready!",
    { timeout: 15_000 }
  );
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#tutorial-step-title')).toHaveText(
    'Simplified or Standard',
    { timeout: 15_000 }
  );
}

test.describe('A tour survives the control it highlights', () => {
  test('Forge box tour: pressing Simplified/Standard keeps the tour on its step, and it still advances', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await startBoxTour(page);
    await jumpToDensityStep(page);

    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'simplified'
    );
    await page.locator('#uiModeToggle').click();
    await page.waitForTimeout(1500);

    // The whole point: still open, still on this step, still spotlighting it
    await expect(page.locator('.tutorial-overlay')).toBeAttached();
    await expect(page.locator('#tutorial-step-title')).toHaveText(
      'Simplified or Standard'
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'standard'
    );
    await expect(page.locator('#uiModeToggle')).toHaveClass(
      /tutorial-target-highlight/
    );
    expect((await said(page)).join(' | ')).not.toContain(
      'because the interface changed'
    );

    // and the tour is not merely alive, it still works
    await page.locator('#tutorialNextBtn').click();
    await expect(page.locator('#tutorial-step-title')).toHaveText(
      "You're ready!",
      { timeout: 15_000 }
    );
  });

  test('Classic box tour: pressing the density switch keeps the tour on its step', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await startBoxTour(page, { classic: true });
    await expect(page.locator('#tutorial-panel-title')).toHaveText(
      'Classic Getting Started'
    );
    await jumpToDensityStep(page);

    await page.locator('#classicDensityToggle').click();
    await page.waitForTimeout(1500);

    await expect(page.locator('.tutorial-overlay')).toBeAttached();
    await expect(page.locator('#tutorial-step-title')).toHaveText(
      'Simplified or Standard'
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-density',
      'simplified'
    );
    await expect(page.locator('#classicDensityToggle')).toHaveClass(
      /tutorial-target-highlight/
    );
  });

  test('crossing between Forge and Classic still closes the tour', async ({
    page,
  }) => {
    await boot(page);
    await startWelcomeTour(page);
    await walkTo(page, 'Keyboard shortcuts');

    await page.locator('#classicModeToggle').click();
    await expect(page.locator('.tutorial-overlay')).toHaveCount(0, {
      timeout: 15_000,
    });
    expect((await said(page)).join(' | ')).toContain(
      'because the interface changed'
    );
    // progress saved, completion not recorded
    const state = await registry(page);
    expect(state.welcome.opened).toEqual(expect.any(Number));
    expect(state.welcome.completed).toBeUndefined();
  });

  test('A press that opens a dialog stands the tour aside, and closing it brings the tour back', async ({
    page,
  }) => {
    await boot(page);
    await startWelcomeTour(page);
    await walkTo(page, 'Keyboard shortcuts');

    await page.locator('#shortcutsToggle').click();
    await expect(page.locator('.tutorial-minimized')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('.tutorial-panel')).toBeHidden();
    await expect(page.locator('.tutorial-overlay')).toBeAttached();

    // Shrinking to a bar is not standing down: the veil must stop painting the
    // dialog, and the target must give up the elevation and ring its highlight
    // class carries.
    await page.waitForTimeout(400);
    const aside = await tourPaintingOver(page);
    expect(
      aside.veilRendered,
      'the veil must not paint over a dialog the user opened'
    ).toBe(false);
    expect(
      aside.highlighted,
      'no target may keep its ring or its elevation while a dialog is up'
    ).toEqual([]);
    // This dialog paints a centered box the pill's corner never reaches, so the
    // pill must be left exactly where it lives; the visibility assertion above
    // catches a placement rule that hides it too eagerly.
    expect(await pillOverlapsDialog(page, '#shortcutsModal')).toBe(false);

    // Escape belongs to the dialog first
    await page.keyboard.press('Escape');
    await expect(page.locator('.tutorial-panel')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('#tutorial-step-title')).toHaveText(
      'Keyboard shortcuts'
    );
    // and the tour comes back whole, not just visible
    await expect(page.locator('#shortcutsToggle')).toHaveClass(
      /tutorial-target-highlight/
    );
    expect((await tourPaintingOver(page)).veilRendered).toBe(true);

    // the next Escape is the tour's
    await page.keyboard.press('Escape');
    await expect(page.locator('.tutorial-overlay')).toHaveCount(0, {
      timeout: 10_000,
    });
  });
});

test.describe('the spotlight itself', () => {
  test('a tall target is scrolled clear of the chrome above its scroll container', async ({
    page,
  }) => {
    await boot(page)
    await startWelcomeTour(page)
    await walkTo(page, 'Open or start a project')

    // Push the target's top above the fold, still overlapping the viewport so
    // the engine can resolve it, and let the engine correct the scroll. This
    // drives the exact branch the defect lived in, instead of depending on
    // wherever the previous step happened to leave things. (Scrolling it out
    // of view entirely would make the target unresolvable and clear the
    // spotlight, which is a different path.)
    await page.evaluate(() => {
      document.getElementById('welcomeScreen').scrollTop = 600
      window.dispatchEvent(new Event('scroll'))
    })
    await page.waitForTimeout(900) // the engine scrolls smoothly

    const geometry = await page.evaluate(() => {
      const target = document.querySelector('.tutorial-target-highlight')
      const style = getComputedStyle(target)
      // the halo is drawn outside the border box
      const halo =
        parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth)
      const rect = target.getBoundingClientRect()
      const header = document.querySelector('.app-header')

      // Everything between the target and the root that clips or scrolls, so a
      // failure on a runner that does not reproduce locally explains itself.
      const ancestors = []
      let parent = target.parentElement
      while (parent && parent !== document.documentElement) {
        const parentStyle = getComputedStyle(parent)
        if (
          parentStyle.overflowY !== 'visible' ||
          parentStyle.overflowX !== 'visible'
        ) {
          const r = parent.getBoundingClientRect()
          ancestors.push(
            `${parent.id || parent.tagName.toLowerCase()}` +
              ` top=${Math.round(r.top)} h=${Math.round(r.height)}` +
              ` oy=${parentStyle.overflowY}` +
              ` scroll=${parent.scrollTop}/${parent.scrollHeight}-${parent.clientHeight}`
          )
        }
        parent = parent.parentElement
      }

      return {
        haloTop: Math.round(rect.top - halo),
        headerBottom: Math.round(header.getBoundingClientRect().bottom),
        targetTop: Math.round(rect.top),
        targetHeight: Math.round(rect.height),
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        clippingAncestors: ancestors,
      }
    })

    // A halo that starts behind the header (haloTop 8 against a header bottom
    // of 74) hides its own top edge and the panel's own heading.
    expect(
      geometry.haloTop,
      `halo must clear the header: ${JSON.stringify(geometry)}`
    ).toBeGreaterThan(geometry.headerBottom)
  })

  test('and still clears it when the target is taller than the box it lives in', async ({
    page,
  }) => {
    // The CI Firefox runner's wider fonts wrap this panel to 648px inside a
    // 572px container, and that is a different branch: showing the target's
    // bottom drags its top back under the header. Reproduced here by making
    // the window short and narrow enough for the same thing to be true.
    // Width stays clear of the 768px mobile threshold, which would change the
    // tour's drawer handling and make this a different test.
    await page.setViewportSize({ width: 800, height: 500 })
    await boot(page)
    await startWelcomeTour(page)
    await walkTo(page, 'Open or start a project')

    await page.evaluate(() => {
      document.getElementById('welcomeScreen').scrollTop = 600
      window.dispatchEvent(new Event('scroll'))
    })
    await page.waitForTimeout(900)

    const geometry = await page.evaluate(() => {
      const target = document.querySelector('.tutorial-target-highlight')
      const style = getComputedStyle(target)
      const halo =
        parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth)
      const rect = target.getBoundingClientRect()
      const container = document.getElementById('welcomeScreen')
      return {
        haloTop: Math.round(rect.top - halo),
        headerBottom: Math.round(
          document.querySelector('.app-header').getBoundingClientRect().bottom
        ),
        targetHeight: Math.round(rect.height),
        containerHeight: container.clientHeight,
        tallerThanBox: rect.height > container.clientHeight,
      }
    })

    expect(
      geometry.tallerThanBox,
      `this case is only meaningful when the target does not fit: ${JSON.stringify(geometry)}`
    ).toBe(true)
    expect(
      geometry.haloTop,
      `halo must clear the header: ${JSON.stringify(geometry)}`
    ).toBeGreaterThan(geometry.headerBottom)
  })
})

test.describe('A tour must not claim it finished', () => {
  test('A failure-driven skip past the last step does not record completion', async ({
    page,
  }) => {
    await boot(page);
    await startWelcomeTour(page);
    await walkTo(page, 'Your next step');

    await page.evaluate(() => {
      document.querySelector('.tutorial-target-highlight')?.remove();
    });
    await expect(page.locator('.tutorial-overlay')).toHaveCount(0, {
      timeout: 20_000,
    });

    const state = await registry(page);
    expect(state.welcome.opened).toEqual(expect.any(Number));
    expect(state.welcome.completed).toBeUndefined();
  });

  test('The X exits without recording completion and keeps the progress', async ({
    page,
  }) => {
    await boot(page);
    await startWelcomeTour(page);
    await page.locator('#tutorialNextBtn').click();
    await page.waitForTimeout(300);
    await page.locator('#tutorialNextBtn').click();
    await page.waitForTimeout(300);

    await page.locator('.tutorial-close').click();
    await expect(page.locator('.tutorial-overlay')).toHaveCount(0, {
      timeout: 10_000,
    });

    const state = await registry(page);
    expect(state.welcome.completed).toBeUndefined();
    // the saved progress survives, so Resume is still offered
    const progress = await page.evaluate(() =>
      sessionStorage.getItem('tutorialProgress')
    );
    expect(JSON.parse(progress)).toMatchObject({ tutorialId: 'welcome' });
    // and the spotlight has not handed over as though the tour were finished.
    // Starting the tour already stripped the tag (the 'opened' write does
    // that), so the tell is that no card wears it; a false completion would
    // hand it to 'Beginners Start Here'.
    await expect(page.locator('.role-path-card.welcome-spotlight')).toHaveCount(
      0
    );
  });

  test('Starting a second tour replaces the first instead of crashing', async ({
    page,
  }) => {
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    await boot(page);
    await startWelcomeTour(page);
    await page.locator('#tutorialNextBtn').click();
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      void window.startTutorial('low-vision');
    });

    await expect(page.locator('#tutorial-panel-title')).toHaveText(
      'Visual Accessibility',
      { timeout: 20_000 }
    );
    await expect(page.locator('.tutorial-overlay')).toBeAttached();
    expect(pageErrors).toEqual([]);
  });
});

test.describe('The welcome page does not offer an inert switch', () => {
  test('Forge: Simplified/Standard is absent on the welcome surface and present once a project opens', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await boot(page);
    await expect(page.locator('body')).toHaveAttribute(
      'data-app-surface',
      'welcome'
    );
    await expect(page.locator('#uiModeToggle')).toBeHidden();
    // display:none, not merely invisible: it must not be a tab stop
    expect(
      await page.evaluate(
        () => document.getElementById('uiModeToggle').checkVisibility?.() ?? null
      )
    ).toBe(false);

    await page.locator('.btn-role-try[data-tutorial="intro"]').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-app-surface',
      'project',
      { timeout: 180_000 }
    );
    await expect(page.locator('#uiModeToggle')).toBeVisible({ timeout: 30_000 });
  });

  test('Classic: the density switch is absent on the welcome surface and present once a project opens', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await boot(page, { classic: true });
    await expect(page.locator('body')).toHaveAttribute(
      'data-app-surface',
      'welcome'
    );
    await expect(page.locator('#classicDensityToggle')).toBeHidden();
    expect(
      await page.evaluate(
        () =>
          document.getElementById('classicDensityToggle').checkVisibility?.() ??
          null
      )
    ).toBe(false);

    await page.locator('.btn-role-try[data-tutorial="intro"]').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-app-surface',
      'project',
      { timeout: 180_000 }
    );
    await expect(page.locator('#classicDensityToggle')).toBeVisible({
      timeout: 30_000,
    });
  });

  test('The Forge welcome tour has no Simplified/Standard step', async ({
    page,
  }) => {
    await boot(page);
    await startWelcomeTour(page);
    await expect(page.locator('.tutorial-progress')).toContainText(
      'Step 1 of 13'
    );
    await expect(page.locator('#tutorial-step-title')).toHaveText(
      'Welcome to the Forge!'
    );
    // and the step is gone, not merely renumbered
    await walkTo(page, 'High contrast');
    expect(await page.locator('#tutorial-step-current').textContent()).toBe('3');
  });

  test('The Classic welcome tour has no density step either', async ({
    page,
  }) => {
    await boot(page, { classic: true });
    await startWelcomeTour(page);
    await expect(page.locator('.tutorial-progress')).toContainText(
      'Step 1 of 10'
    );
    await walkTo(page, 'Open or start a project');
    expect(await page.locator('#tutorial-step-current').textContent()).toBe('3');
  });
});

/**
 * The curiosity path: assume a curious new user presses what the tour
 * highlights, and prove they can get back.
 *
 * On a phone, the Main Page tour points at Clear Cache near its end.
 * Pressing it opens a dialog that must be answerable: shrinking the tour to
 * a bar is not enough while the veil still paints the dialog at 0.3, the
 * button keeps the z-index and ring its highlight class carries, or the
 * pill sits on the dialog's footer corner. A user who cannot answer the
 * dialog is stuck in a loop.
 */
test.describe('A dialog you can always answer', () => {
  test.describe('on a phone-shaped viewport', () => {
    test.use({ viewport: { width: 412, height: 915 } });

    test('Pressing the spotlighted Clear Cache leaves the dialog operable, and Cancel returns to the tour', async ({
      page,
    }) => {
      await pressTheSpotlightedClearCache(page);

      const state = await tourPaintingOver(page, [
        '#cacheClearCancelBtn',
        '#cacheClearConfirmBtn',
      ]);

      expect(
        state.veilRendered,
        `the veil must not paint over the dialog: ${JSON.stringify(state)}`
      ).toBe(false);
      expect(
        state.highlighted,
        'the page button must not keep the ring that invites another press'
      ).not.toContain('button#clearStorageBtn');
      expect(state.topmost['#cacheClearCancelBtn']).toBe('self');
      expect(state.topmost['#cacheClearConfirmBtn']).toBe('self');

      // the pill may stay pressable, but never over the dialog's own box
      expect(
        await page.evaluate(() => {
          const pill = document.querySelector('.tutorial-minimized');
          const box = document.querySelector(
            '.cache-clear-dialog .preset-modal-content'
          );
          if (!pill || !box || !pill.checkVisibility()) return false;
          const a = pill.getBoundingClientRect();
          const b = box.getBoundingClientRect();
          return !(
            a.right <= b.left ||
            a.left >= b.right ||
            a.bottom <= b.top ||
            a.top >= b.bottom
          );
        }),
        'the minimized pill must not overlap the dialog'
      ).toBe(false);

      // and the way back is real: Cancel restores the tour where it was
      await page.locator('#cacheClearCancelBtn').click();
      await expect(page.locator('.cache-clear-dialog')).toHaveCount(0, {
        timeout: 10_000,
      });
      await expect(page.locator('.tutorial-panel')).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.locator('#tutorial-step-title')).toHaveText(
        'Clear Cache'
      );
      await expect(page.locator('#clearStorageBtn')).toHaveClass(
        /tutorial-target-highlight/
      );
      expect((await tourPaintingOver(page)).veilRendered).toBe(true);
    });
  });

  test.describe("at a phone height where the button lands on the footer", () => {
    // 412px wide with the phone browser's chrome taken off the height. At the
    // full 915 the elevated button sits just below the dialog's footer; here it
    // lands squarely on Cancel and the red confirm.
    test.use({ viewport: { width: 412, height: 730 } });

    test('The elevated button cannot bury the dialog it opened, and pressing where it was does not stack another', async ({
      page,
    }) => {
      await pressTheSpotlightedClearCache(page);

      const overlap = await page.evaluate(() => {
        const btn = document.getElementById('clearStorageBtn');
        const footer = document.getElementById('cacheClearCancelBtn');
        if (!btn || !footer) return null;
        const a = btn.getBoundingClientRect();
        const b = footer.getBoundingClientRect();
        return !(
          a.right <= b.left ||
          a.left >= b.right ||
          a.bottom <= b.top ||
          a.top >= b.bottom
        );
      });
      expect(
        overlap,
        'this case is only meaningful while the page button still lies across the footer'
      ).toBe(true);

      const state = await tourPaintingOver(page, [
        '#cacheClearCancelBtn',
        '#cacheClearConfirmBtn',
      ]);
      // An elevated page button would win both of these hit tests.
      expect(state.topmost['#cacheClearCancelBtn']).toBe('self');
      expect(state.topmost['#cacheClearConfirmBtn']).toBe('self');

      // The loop itself: a second press on the ringed button must not open a
      // second dialog on top of the first, its Cancel buried under that same
      // button.
      //
      // Once the button is no longer elevated the press belongs to the dialog
      // lying over it, and what that means differs by engine: Chromium hands it
      // to the dialog's own body and nothing happens, Firefox hands it to the
      // scrim and the dialog dismisses. Both are the dialog answering for
      // itself. Only growth is the defect, so only growth is asserted.
      const before = await page.locator('.cache-clear-dialog').count();
      const box = await page.locator('#clearStorageBtn').boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(1000);
      const after = await page.locator('.cache-clear-dialog').count();
      expect(
        after,
        `pressing where the ring was must not stack another dialog (was ${before}, now ${after})`
      ).toBeLessThanOrEqual(before);
    });
  });

  test.describe('on a short desktop', () => {
    // 1280x600 is where CI Firefox's fonts put the keyboard-shortcuts dialog:
    // it paints x 290-990 and leaves only ~51px above and below. The pill lives
    // at x 1152, so it is never in danger, yet a rule that looked only at
    // vertical gaps would hide it.
    test.use({ viewport: { width: 1280, height: 600 } });

    test('a dialog the pill does not touch leaves the pill exactly where it lives', async ({
      page,
    }) => {
      await boot(page);
      await startWelcomeTour(page);
      await walkTo(page, 'Keyboard shortcuts');

      const restingCorner = await page.evaluate(() => {
        const pill = document.querySelector('.tutorial-minimized');
        // it is hidden behind .hidden while the panel is up, so read the CSS
        return getComputedStyle(pill).right;
      });

      await page.locator('#shortcutsToggle').click();
      await expect(page.locator('.tutorial-minimized')).toBeVisible({
        timeout: 10_000,
      });
      await page.waitForTimeout(500);

      expect(await pillOverlapsDialog(page, '#shortcutsModal')).toBe(false);
      // and it was not moved at all: no inline placement was written
      const placement = await page.evaluate(() => {
        const pill = document.querySelector('.tutorial-minimized');
        return {
          top: pill.style.top,
          bottom: pill.style.bottom,
          display: pill.style.display,
          right: getComputedStyle(pill).right,
        };
      });
      expect(placement.display).not.toBe('none');
      expect(placement.top).toBe('');
      expect(placement.bottom).toBe('');
      expect(placement.right).toBe(restingCorner);
    });
  });

  test('On the desktop the tour was built for: the dialog is topmost there too', async ({
    page,
  }) => {
    await pressTheSpotlightedClearCache(page);

    const state = await tourPaintingOver(page, [
      '#cacheClearCancelBtn',
      '#cacheClearConfirmBtn',
    ]);
    expect(state.veilRendered).toBe(false);
    expect(state.highlighted).not.toContain('button#clearStorageBtn');
    expect(state.topmost['#cacheClearCancelBtn']).toBe('self');
    expect(state.topmost['#cacheClearConfirmBtn']).toBe('self');

    await page.locator('#cacheClearCancelBtn').click();
    await expect(page.locator('.tutorial-panel')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('#tutorial-step-title')).toHaveText('Clear Cache');
  });

  test('The overlay does not re-raise itself above its own highlight', async ({
    page,
  }) => {
    await boot(page);
    await startWelcomeTour(page);
    await walkTo(page, 'Clear Cache');
    await expect(page.locator('#clearStorageBtn')).toHaveClass(
      /tutorial-target-highlight/
    );

    const stack = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const token = (n) =>
        parseInt(root.getPropertyValue(`--z-index-tutorial-${n}`), 10);
      const z = (sel) => {
        const el = document.querySelector(sel);
        return el ? parseInt(getComputedStyle(el).zIndex, 10) : null;
      };
      return {
        // Escalating here would only answer the engine's own ring: the page's
        // real ancestors all sit below 950.
        escalated:
          document.querySelector('.tutorial-overlay')?.style.getPropertyValue(
            '--z-index-tutorial-backdrop'
          ) || '',
        overlay: z('.tutorial-overlay'),
        veil: z('.tutorial-spotlight-svg'),
        card: z('.tutorial-panel'),
        target: z('#clearStorageBtn'),
        highlightToken: token('highlight'),
      };
    });

    expect(
      stack.escalated,
      `no ordinary step may escalate the overlay: ${JSON.stringify(stack)}`
    ).toBe('');
    // the ordering, stated rather than left to escalation
    expect(stack.target).toBe(stack.highlightToken);
    expect(stack.overlay).toBeGreaterThan(stack.target);
    expect(stack.card).toBeGreaterThan(stack.veil);
  });
});

/**
 * A tour that follows the user, on a phone. The step that teaches the
 * panel must highlight something to interact with, and the user's own
 * presses on the drawer and on the tour's pill must register instead of
 * being overridden by the tour reopening the drawer.
 *
 * The sequence these cases pin, at 412x915 on the Beginners card path:
 *
 *   step-3 arrival   drawer shut, card up, ring on the button that opens it
 *   panel opened     card still up, ring on the Close button
 *   Restore          the card comes back and stays, drawer untouched
 *   user closes it   the drawer stays shut, and the tour asks instead
 *
 * The engine leaves the drawer to the user and keeps the card up beside it.
 */
test.describe('A tour that follows the user', () => {
  const REQUIREMENT_PENDING = '↑ Complete the action above to continue';

  /** Boot the intro tour and stop on the step that teaches the panel. */
  async function introTourAtStep3(page) {
    await startBoxTour(page);
    await walkTo(page, 'Open and close the Customizer');
    await page.waitForTimeout(500);
  }

  const drawerOpen = (page) =>
    page.evaluate(
      () =>
        !!document.getElementById('paramPanel')?.classList.contains(
          'drawer-open'
        )
    );

  test.describe('on a phone-shaped viewport', () => {
    test.use({ viewport: { width: 412, height: 915 } });

    test('Step 3 arrives with the panel shut and the ring on the button that opens it', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await introTourAtStep3(page);

      // The step teaches "press Params to open the panel". It cannot do that
      // from behind a panel it opened itself.
      expect(await drawerOpen(page)).toBe(false);
      await expect(page.locator('.tutorial-panel')).toBeVisible();
      await expect(page.locator('#mobileDrawerToggle')).toHaveClass(
        /tutorial-target-highlight/
      );
      // and the instructions are readable, not folded into a pill
      await expect(page.locator('.tutorial-minimized')).toBeHidden();
      await expect(page.locator('#tutorial-step-title')).toHaveText(
        'Open and close the Customizer'
      );
    });

    test('Opening the panel keeps the card up and walks the ring to the Close button', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await introTourAtStep3(page);

      await page.locator('#mobileDrawerToggle').click();
      await expect(page.locator('#drawerCloseBtn')).toHaveClass(
        /tutorial-target-highlight/,
        { timeout: 10_000 }
      );

      expect(await drawerOpen(page)).toBe(true);
      await expect(page.locator('.tutorial-panel')).toBeVisible();
      await expect(page.locator('.tutorial-minimized')).toBeHidden();
      await expect(page.locator('#mobileDrawerToggle')).not.toHaveClass(
        /tutorial-target-highlight/
      );

      // The card must not be sitting on the drawer's only way out: a top dock
      // starting at y 8 would cover the X.
      const closeIsPressable = await page.evaluate(() => {
        const btn = document.getElementById('drawerCloseBtn');
        const r = btn.getBoundingClientRect();
        const hit = document.elementFromPoint(
          Math.round(r.left + r.width / 2),
          Math.round(r.top + r.height / 2)
        );
        return !!hit && (hit === btn || btn.contains(hit));
      });
      expect(closeIsPressable).toBe(true);
    });

    test('Restore restores, holds, and leaves the drawer alone', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await introTourAtStep3(page);
      await page.locator('#tutorialNextBtn').click();
      await expect(page.locator('#tutorial-step-title')).toHaveText(
        'Expand a parameter group',
        { timeout: 15_000 }
      );
      await expect(page.locator('.tutorial-panel')).toBeVisible();
      expect(await drawerOpen(page)).toBe(true);

      await page.locator('.tutorial-minimize').click();
      await expect(page.locator('.tutorial-minimized')).toBeVisible();
      await expect(page.locator('.tutorial-panel')).toBeHidden();

      await page.locator('.tutorial-restore').click();
      await expect(page.locator('.tutorial-panel')).toBeVisible();

      // A restore must last, not vanish within a frame. Two seconds is long
      // enough for the watcher, the drawer transition and the reposition
      // scheduler to have had their say.
      await page.waitForTimeout(2000);
      await expect(page.locator('.tutorial-panel')).toBeVisible();
      await expect(page.locator('.tutorial-minimized')).toBeHidden();
      // and Restore does not have to shut the drawer to work
      expect(await drawerOpen(page)).toBe(true);
    });

    test('Closing the panel sticks, and the tour asks instead of fighting', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await introTourAtStep3(page);
      await page.locator('#tutorialNextBtn').click();
      await expect(page.locator('#tutorial-step-title')).toHaveText(
        'Expand a parameter group',
        { timeout: 15_000 }
      );
      expect(await drawerOpen(page)).toBe(true);

      await page.locator('#drawerCloseBtn').click();
      await expect(page.locator('#tutorialRequirement')).toHaveText(
        'Open the Customizer to continue.',
        { timeout: 10_000 }
      );
      await expect(page.locator('#mobileDrawerToggle')).toHaveClass(
        /tutorial-target-highlight/
      );
      expect(await drawerOpen(page)).toBe(false);

      // Hold well past 500ms and past the drawer's 400ms transition, so any
      // reopen would have happened by now.
      await page.waitForTimeout(2000);
      expect(await drawerOpen(page)).toBe(false);
      await expect(page.locator('.tutorial-panel')).toBeVisible();

      // ...and the way back in still leads to the step it left.
      await page.locator('#mobileDrawerToggle').click();
      await expect(page.locator('#tutorialRequirement')).toHaveText(
        REQUIREMENT_PENDING,
        { timeout: 10_000 }
      );
      await expect(
        page.locator('.param-group[data-group-id="Dimensions"] summary')
      ).toHaveClass(/tutorial-target-highlight/);
    });

    test('the step still completes and advances once the group is expanded', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await introTourAtStep3(page);
      await page.locator('#tutorialNextBtn').click();
      await expect(page.locator('#tutorial-step-title')).toHaveText(
        'Expand a parameter group',
        { timeout: 15_000 }
      );
      await expect(page.locator('#tutorialNextBtn')).toBeDisabled();

      await page
        .locator('.param-group[data-group-id="Dimensions"] summary')
        .click();
      await expect(page.locator('#tutorialNextBtn')).toBeEnabled({
        timeout: 10_000,
      });

      await page.locator('#tutorialNextBtn').click();
      await expect(page.locator('#tutorial-step-title')).toHaveText(
        'Adjust a parameter',
        { timeout: 15_000 }
      );
    });

    test('Escape closes the drawer first and the tour second', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await introTourAtStep3(page);
      await page.locator('#tutorialNextBtn').click();
      await expect(page.locator('#tutorial-step-title')).toHaveText(
        'Expand a parameter group',
        { timeout: 15_000 }
      );
      expect(await drawerOpen(page)).toBe(true);

      // The drawer's focus trap answers Escape by closing itself and does not
      // stop the event, so one press must not also end the tour.
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
      expect(await drawerOpen(page)).toBe(false);
      await expect(page.locator('.tutorial-panel')).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(page.locator('.tutorial-overlay')).toHaveCount(0, {
        timeout: 10_000,
      });
    });
  });

  /**
   * The desktop half of the same two rules. The panel is a collapsing sidebar
   * rather than a drawer, so the requirement has its own wording, and the
   * engine still has to expand a collapsed panel on the way in: the case a
   * flat "every target lives inside" rule would break, because when the
   * panel is shut the only candidate it has left is inside it.
   */
  test('desktop: a collapse the user asked for holds, and the panel still opens for the step that needs it', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await introTourAtStep3(page);

    // Here the only control this step can point at is inside the panel, so the
    // ring lands there and the panel is left open.
    await expect(page.locator('#collapseParamPanelBtn')).toHaveClass(
      /tutorial-target-highlight/
    );
    await expect(page.locator('#paramPanel')).not.toHaveClass(/collapsed/);

    await page.locator('#tutorialNextBtn').click();
    await expect(page.locator('#tutorial-step-title')).toHaveText(
      'Expand a parameter group',
      { timeout: 15_000 }
    );
    await expect(
      page.locator('.param-group[data-group-id="Dimensions"] summary')
    ).toHaveClass(/tutorial-target-highlight/);

    // Collapse it mid-step: the tour says what it needs and leaves it shut.
    await page.locator('#collapseParamPanelBtn').click();
    await expect(page.locator('#tutorialRequirement')).toHaveText(
      'Expand the Customizer to continue.',
      { timeout: 10_000 }
    );
    await page.waitForTimeout(2000);
    await expect(page.locator('#paramPanel')).toHaveClass(/collapsed/);

    // Stepping back into a panel step opens it, though: that is setup, not a
    // fight with the user.
    await page.locator('#tutorialBackBtn').click();
    await expect(page.locator('#tutorial-step-title')).toHaveText(
      'Open and close the Customizer',
      { timeout: 15_000 }
    );
    await expect(page.locator('#paramPanel')).not.toHaveClass(/collapsed/);
    await expect(page.locator('#collapseParamPanelBtn')).toHaveClass(
      /tutorial-target-highlight/
    );
  });
});

/**
 * Cards that stay readable.
 *
 * The viewport here is 412x810, not 412x915: a 1080x2520 phone screen at
 * DPR ~2.62 is 960 CSS px tall, and its status bar, URL bar and gesture
 * nav take roughly 43 + 60 + 48 of that. At 915 every card fits and
 * nothing clips. At 810 the dock cap `viewport.height * 0.45` lands on
 * 364.5, and three steps of the intro tour overflow (by 47px, 19px and
 * 40px), so the card has to show that its body holds more.
 */
test.describe('Cards that stay readable', () => {
  /** Read the card's internals. */
  const cardGeometry = (page) =>
    page.evaluate(() => {
      const panel = document.querySelector('.tutorial-panel');
      const body = panel.querySelector('.tutorial-body');
      const title = panel.querySelector('#tutorial-step-title');
      const cue = panel.querySelector('.tutorial-scroll-cue');
      return {
        bodyHeight: body.getBoundingClientRect().height,
        contentHeight: body.scrollHeight,
        hiddenBelow: body.scrollHeight - body.scrollTop - body.clientHeight,
        hasMore: panel.classList.contains('tutorial-has-more'),
        cueOpacity: cue ? Number(getComputedStyle(cue).opacity) : null,
        cueTakesSpace: cue ? cue.getBoundingClientRect().height : null,
        cueAriaHidden: cue ? cue.getAttribute('aria-hidden') : null,
        cueTabbable: cue ? cue.tabIndex >= 0 : null,
        titleBottom: title.getBoundingClientRect().bottom,
        bodyBottom: body.getBoundingClientRect().bottom,
      };
    });

  /** End clears every completion gate; ArrowLeft walks back through them. */
  async function stepBackTo(page, title, cap = 24) {
    await page.keyboard.press('End');
    await expect(page.locator('#tutorial-step-title')).toHaveText(
      'Back to the Main Page',
      { timeout: 15_000 }
    );
    for (let i = 0; i < cap; i++) {
      if ((await page.locator('#tutorial-step-title').textContent()) === title) {
        await page.waitForTimeout(400);
        return;
      }
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(350);
    }
    await expect(page.locator('#tutorial-step-title')).toHaveText(title);
  }

  test.describe('on a phone-shaped viewport of the height a phone has', () => {
    test.use({ viewport: { width: 412, height: 810 } });

    test('A clipped body says so, and stops saying so at the end', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await startBoxTour(page);
      await stepBackTo(page, 'Preview Settings & Info');

      // At this height the body's last visible line is "You can resize this
      // drawer using the handle. With", cut mid-glyph: it must not be cut in
      // silence.
      const clipped = await cardGeometry(page);
      expect(clipped.hiddenBelow).toBeGreaterThan(2);
      expect(clipped.hasMore).toBe(true);
      expect(clipped.cueOpacity).toBe(1);

      // The cue reports on the body; it must never take room from it.
      expect(clipped.cueTakesSpace).toBe(0);
      // ...and it is decoration, not another thing to Tab through or hear.
      expect(clipped.cueAriaHidden).toBe('true');
      expect(clipped.cueTabbable).toBe(false);

      await page.evaluate(() => {
        const body = document.querySelector('.tutorial-body');
        body.scrollTop = body.scrollHeight;
      });
      await page.waitForTimeout(400);

      const atEnd = await cardGeometry(page);
      expect(atEnd.hiddenBelow).toBeLessThanOrEqual(2);
      expect(atEnd.hasMore).toBe(false);
      expect(atEnd.cueOpacity).toBe(0);
    });

    test('The body keeps a floor, and the step title with it', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await startBoxTour(page);
      await stepBackTo(page, 'Preview Settings & Info');

      // A folded body can shrink to ~22px: the top of the title and nothing
      // else. The floor is the title plus one line of text.
      const geo = await cardGeometry(page);
      expect(geo.bodyHeight).toBeGreaterThanOrEqual(72);
      expect(geo.titleBottom).toBeLessThanOrEqual(geo.bodyBottom + 0.5);
    });

    test('A new step opens at the top of its own text', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await startBoxTour(page);
      // Both of these steps overflow at this height (by 19px and 47px),
      // which is what makes the carried-over offset visible. Between two steps
      // where only the first overflows, the browser clamps the offset to 0 on
      // its own and the defect hides.
      await stepBackTo(page, 'Actions menu');

      // Read to the bottom of one step...
      await page.evaluate(() => {
        const body = document.querySelector('.tutorial-body');
        body.scrollTop = body.scrollHeight;
      });
      await page.waitForTimeout(300);
      expect(
        await page.evaluate(
          () => document.querySelector('.tutorial-body').scrollTop
        )
      ).toBeGreaterThan(0);

      // ...and the next one must not inherit that offset. The body is a scroll
      // container and it survives the innerHTML swap.
      await page.keyboard.press('ArrowLeft');
      await expect(page.locator('#tutorial-step-title')).toHaveText(
        'Preview Settings & Info',
        { timeout: 15_000 }
      );
      await page.waitForTimeout(700);
      const geo = await cardGeometry(page);
      expect(
        await page.evaluate(
          () => document.querySelector('.tutorial-body').scrollTop
        )
      ).toBe(0);
      expect(geo.titleBottom).toBeLessThanOrEqual(geo.bodyBottom + 0.5);
    });
  });

  test.describe('the Features Guide header at phone width', () => {
    test.use({ viewport: { width: 412, height: 810 } });

    test('The hint takes its own row instead of printing over the title', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await startBoxTour(page);
      await stepBackTo(page, 'Help & Examples');

      await page.locator('#featuresGuideBtn').click();
      await expect(page.locator('#tutorial-step-title')).toHaveText(
        'Features Guide',
        { timeout: 15_000 }
      );
      await expect(
        page.locator('#featuresGuideModal .modal-content')
      ).toHaveClass(/tutorial-target-highlight/);
      await page.waitForTimeout(500);

      // A pseudo-element has no rect to ask for, so this pins the two things
      // that decide whether it can collide: which rule is painting the words,
      // and whether the header grew a row to hold them. A hint hanging off the
      // close button at `right: 100%`, in a header one row high, prints "Close
      // to continue" straight across "Features Guide".
      const header = await page.evaluate(() => {
        const modal = document.querySelector(
          '#featuresGuideModal .modal-content'
        );
        const head = modal.querySelector('.modal-header');
        const title = modal.querySelector('#featuresGuideTitle');
        const close = modal.querySelector('.modal-close');
        const text = (el, pseudo) =>
          getComputedStyle(el, pseudo).content.replace(/^"|"$/g, '');
        return {
          onCloseButton: text(close, '::after'),
          onHeader: text(head, '::after'),
          headerHeight: head.getBoundingClientRect().height,
          titleHeight: title.getBoundingClientRect().height,
          closeHeight: close.getBoundingClientRect().height,
        };
      });

      expect(header.onCloseButton).toBe('none');
      expect(header.onHeader).toBe('Close to continue');
      // A second row: the header is taller than its tallest first-row item
      // by at least a line of the hint's own text.
      const firstRow = Math.max(header.titleHeight, header.closeHeight);
      expect(header.headerHeight).toBeGreaterThan(firstRow + 12);
    });
  });

  /**
   * `.cache-clear-dialog` names the `.preset-modal` scrim, not the box
   * inside it, so a `max-width` meant for the dialog must not land on the
   * full-screen centering container.
   */
  for (const width of [800, 1280]) {
    test.describe(`The Clear Cache dialog at ${width}px`, () => {
      test.use({ viewport: { width, height: 800 } });

      test('the backdrop covers the viewport and the dialog is centered', async ({
        page,
      }) => {
        test.setTimeout(240_000);
        await boot(page);
        await page.locator('#clearStorageBtn').click();
        await expect(page.locator('.cache-clear-dialog')).toBeVisible({
          timeout: 10_000,
        });

        const geo = await page.evaluate(() => {
          const scrim = document.querySelector('.cache-clear-dialog');
          const box = scrim.querySelector('.preset-modal-content');
          const s = scrim.getBoundingClientRect();
          const b = box.getBoundingClientRect();
          return {
            scrimLeft: s.left,
            scrimWidth: s.width,
            viewportWidth: window.innerWidth,
            boxCentre: b.left + b.width / 2,
            boxWidth: b.width,
          };
        });

        // A scrim held to the dialog's width leaves the dark backdrop a strip
        // and the dialog against the left edge.
        expect(geo.scrimLeft).toBe(0);
        expect(geo.scrimWidth).toBe(geo.viewportWidth);
        expect(Math.abs(geo.boxCentre - geo.viewportWidth / 2)).toBeLessThan(2);
        // and the dialog itself is still the narrow one it was meant to be
        expect(geo.boxWidth).toBeLessThanOrEqual(500);
      });
    });
  }

  /**
   * The mobile drawer is a modal dialog and the tour card lives outside it,
   * so the drawer's `aria-modal` would hide the instructions from a screen
   * reader, and its focus trap would make the card's buttons unreachable.
   */
  test.describe('The card is reachable and announced over the drawer', () => {
    test.use({ viewport: { width: 412, height: 915 } });

    async function introStep4WithDrawerOpen(page) {
      await startBoxTour(page);
      await walkTo(page, 'Open and close the Customizer');
      await page.waitForTimeout(500);
      await page.locator('#mobileDrawerToggle').click();
      await page.waitForTimeout(800);
      await page.locator('#tutorialNextBtn').click();
      await expect(page.locator('#tutorial-step-title')).toHaveText(
        'Expand a parameter group',
        { timeout: 15_000 }
      );
      await page.waitForTimeout(700);
    }

    test('the drawer stops claiming to be the only thing on screen', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await introStep4WithDrawerOpen(page);

      // Neither surface may claim `aria-modal` while both are up: whichever one
      // does, assistive technology hides the other.
      const drawer = page.locator('#paramPanel');
      await expect(drawer).toHaveAttribute('role', 'dialog');
      expect(await drawer.getAttribute('aria-modal')).toBeNull();
      expect(
        await page.locator('.tutorial-panel').getAttribute('aria-modal')
      ).toBeNull();

      // Closing the drawer hands the card its own modality back.
      await page.locator('#drawerCloseBtn').click();
      await page.waitForTimeout(800);
      await expect(page.locator('.tutorial-panel')).toHaveAttribute(
        'aria-modal',
        'true'
      );
    });

    test('the keyboard can get to Next, Back and Close', async ({ page }) => {
      test.setTimeout(240_000);
      await introStep4WithDrawerOpen(page);

      const inTour = () =>
        page.evaluate(() => {
          const overlay = document.querySelector('.tutorial-overlay');
          return !!overlay && overlay.contains(document.activeElement);
        });

      // Backwards is the short way round: the card's controls sit at the end of
      // the document, so one Shift+Tab from the drawer's first control reaches
      // them.
      await page.locator('#drawerCloseBtn').focus();
      await page.keyboard.press('Shift+Tab');
      expect(await inTour()).toBe(true);

      // and forwards arrives too, rather than cycling the drawer forever
      await page.locator('#drawerCloseBtn').focus();
      let reached = 0;
      for (let i = 1; i <= 60; i++) {
        await page.keyboard.press('Tab');
        if (await inTour()) {
          reached = i;
          break;
        }
      }
      expect(reached).toBeGreaterThan(0);
    });
  });
});

test.describe('A docked card does not sit on a control it is not pointing at', () => {
  test.use({ viewport: { width: 412, height: 810 } });

  /** End clears every completion gate; ArrowLeft walks back through them. */
  async function walkBackTo(page, title, cap = 24) {
    await page.keyboard.press('End');
    await expect(page.locator('#tutorial-step-title')).toHaveText(
      'Back to the Main Page',
      { timeout: 15_000 }
    );
    for (let i = 0; i < cap; i++) {
      if ((await page.locator('#tutorial-step-title').textContent()) === title) {
        await page.waitForTimeout(400);
        return;
      }
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(350);
    }
    await expect(page.locator('#tutorial-step-title')).toHaveText(title);
  }

  /**
   * Which app controls does the card's own box hit-test over? At 412x810 on
   * the step below, a card over #uiModeToggle would win
   * document.elementFromPoint at that button's center. This asks about every
   * control in the top chrome, because the positioner has to clear them all.
   */
  const buriedControls = (page) =>
    page.evaluate(() => {
      const panel = document.querySelector('.tutorial-panel');
      if (!panel) return ['no tutorial panel'];
      const selector =
        '.app-header button, .app-header a, #workflowProgress button, ' +
        '.preview-drawer-header button';
      const buried = [];
      for (const el of document.querySelectorAll(selector)) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const top = document.elementFromPoint(
          r.x + r.width / 2,
          r.y + r.height / 2
        );
        if (top && (top === panel || panel.contains(top))) {
          buried.push(el.id || String(el.className).split(' ')[0]);
        }
      }
      return buried;
    });

  test('The card clears the header on a step that points at the bottom of the screen', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await startBoxTour(page);
    await walkBackTo(page, 'Generate and download your file');

    // The step points at #primaryActionBtn, low on the screen, so the card
    // docks upward, and the top dock must clear the app's own top chrome.
    await expect(page.locator('#tutorial-step-title')).toHaveText(
      'Generate and download your file'
    );
    expect(await buriedControls(page)).toEqual([]);

    // And the control it is pointing at stays tappable.
    const targetReachable = await page.evaluate(() => {
      const btn = document.getElementById('primaryActionBtn');
      const r = btn.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!top && (btn === top || btn.contains(top));
    });
    expect(targetReachable, 'the spotlighted button is still hit-testable').toBe(
      true
    );
  });

  test('The same holds on the camera step, which also docks upward', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await startBoxTour(page);
    await walkBackTo(page, 'Camera controls');

    await expect(page.locator('#tutorial-step-title')).toHaveText(
      'Camera controls'
    );
    expect(await buriedControls(page)).toEqual([]);
  });
});
