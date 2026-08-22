/**
 * Tours that survive touch (UF-21: U-28, U-29, defects D-28 / D-32 / D-33).
 *
 * The walk this file pins is the one the owner reported: press the control a
 * tour is pointing at and the tour should still be there. MEASURED at the
 * release base 24b76a2, pressing every spotlighted control in both welcome
 * tours, exactly one press ended a tour - the Forge Simplified/Standard
 * switch at its own step.
 *
 * Q-50 (owner, 2026-08-14) sets the boundary: a change inside the tour's own
 * interface family keeps the tour, crossing between Forge and Classic still
 * closes it. Q-51 moved the Simplified/Standard teaching out of the two
 * welcome tours and into the two box tours, where pressing the switch does
 * something.
 *
 * Red-proven on 24b76a2 by in-tree revert of src/js/tutorial-sandbox.js,
 * src/styles/layout.css and src/styles/classic.css.
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
 * What the tour is still painting while a dialog is up (UF-36, D-61).
 *
 * `topmost` answers the only question that matters for WCAG 2.4.11: if a
 * person aims at the middle of this control, does the browser hand the press
 * to it? A veil with `pointer-events: none` passes that test while still
 * painting over the dialog, so the veil is checked separately - it is the
 * thing that dimmed the owner's dialog, not the thing that swallowed the tap.
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
 * here and there: End goes to the last step, one Back reaches step 16 of 17.
 */
async function jumpToDensityStep(page) {
  await page.keyboard.press('End');
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

test.describe('U-28: a tour survives the control it highlights', () => {
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

  test('crossing between Forge and Classic still closes the tour (Q-28a preserved)', async ({
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
    // progress saved, completion NOT recorded
    const state = await registry(page);
    expect(state.welcome.opened).toEqual(expect.any(Number));
    expect(state.welcome.completed).toBeUndefined();
  });

  test('Q-50c: a press that opens a dialog stands the tour aside, and closing it brings the tour back', async ({
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

    // UF-36 (D-61). This case only ever asked whether the panel got out of the
    // way, and shrinking to a bar is not standing down: at the base the veil
    // kept painting the dialog at 0.3 and the target kept the elevation and
    // ring its highlight class carries. That is the vacuous green this closes.
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
    // This dialog paints a centred box the pill's corner never reaches, so the
    // pill must be left exactly where it lives. The assertion above it (the
    // pill is visible) is the one CI Firefox used to catch an over-eager first
    // cut of the placement rule.
    expect(await pillOverlapsDialog(page, '#shortcutsModal')).toBe(false);

    // Escape belongs to the dialog first
    await page.keyboard.press('Escape');
    await expect(page.locator('.tutorial-panel')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('#tutorial-step-title')).toHaveText(
      'Keyboard shortcuts'
    );
    // and the tour comes back WHOLE, not just visible
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
  test('triage Table 1 #5: a tall target is scrolled clear of the chrome above its scroll container', async ({
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
      // the halo is drawn OUTSIDE the border box
      const halo =
        parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth)
      const rect = target.getBoundingClientRect()
      const header = document.querySelector('.app-header')

      // Everything between the target and the root that clips or scrolls, so a
      // failure on a runner I cannot reproduce locally explains itself instead
      // of needing another round trip.
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

    // MEASURED at the base: haloTop 8 against a header bottom of 74, so the
    // top edge of the halo and the panel's own heading were both hidden.
    expect(
      geometry.haloTop,
      `halo must clear the header: ${JSON.stringify(geometry)}`
    ).toBeGreaterThan(geometry.headerBottom)
  })

  test('and still clears it when the target is TALLER than the box it lives in', async ({
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

test.describe('UF-21 defects: a tour must not claim it finished', () => {
  test('D-28: a failure-driven skip past the last step does not record completion', async ({
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

  test('D-32: the X exits without recording completion and keeps the progress', async ({
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
    // and the spotlight has NOT handed over as though the tour were finished.
    // Starting the tour already stripped the tag (UF-17: the 'opened' write
    // does that), so the tell is that NO card wears it. MEASURED at the base,
    // where the false completion fired the chain: 'Beginners Start Here'.
    await expect(page.locator('.role-path-card.welcome-spotlight')).toHaveCount(
      0
    );
  });

  test('D-33: starting a second tour replaces the first instead of crashing', async ({
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

test.describe('U-29: the welcome page does not offer an inert switch', () => {
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

  test('Q-51a: the welcome tours are one step shorter in both interfaces', async ({
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
    // and the step it lost is gone, not merely renumbered
    await walkTo(page, 'High contrast');
    expect(await page.locator('#tutorial-step-current').textContent()).toBe('3');
  });

  test('Q-51a: the Classic welcome tour is one step shorter too', async ({
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
 * U-40 / D-61 (owner, 2026-08-21): the curiosity path.
 *
 * The owner followed the Main Page tour to step 12 of 13 on their phone,
 * pressed the Clear Cache button it was pointing at, and could not answer the
 * dialog that opened. The tour had "stood aside" by shrinking to a bar, but the
 * veil still painted the dialog at 0.3, the button kept the z-index and ring
 * its highlight class carries, and the pill kept the dialog's footer corner.
 * Their words: "they will get stuck in a loop, deleting the app and starting
 * the tutorial again over and over."
 *
 * The round's standing test method: assume a curious new user CLICKS what the
 * tour highlights, and prove they can get back.
 */
test.describe('UF-36: a dialog you can always answer', () => {
  test.describe('on a phone-shaped viewport', () => {
    test.use({ viewport: { width: 412, height: 915 } });

    test('D-61: pressing the spotlighted Clear Cache leaves the dialog operable, and Cancel returns to the tour', async ({
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

      // and the way back is real: Cancel restores the tour WHERE IT WAS
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

  test.describe("at the owner's device height, where the button lands ON the footer", () => {
    // 412px wide with the phone browser's chrome taken off the height. At the
    // full 915 the elevated button sat just BELOW the dialog's footer and the
    // occlusion did not reproduce; here it lands squarely on Cancel and the red
    // confirm, which is the state the owner photographed.
    test.use({ viewport: { width: 412, height: 730 } });

    test('D-61: the elevated button cannot bury the dialog it opened, and pressing where it was does not stack another', async ({
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
      // MEASURED at the base: both returned button#clearStorageBtn.
      expect(state.topmost['#cacheClearCancelBtn']).toBe('self');
      expect(state.topmost['#cacheClearConfirmBtn']).toBe('self');

      // The loop itself. At the base a second press on the ringed button opened
      // a SECOND dialog on top of the first, each with its Cancel buried under
      // that same button, and every press added another.
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

  test.describe('on a short desktop, where the first placement rule went wrong', () => {
    // 1280x600 is where CI Firefox's fonts put the keyboard-shortcuts dialog:
    // it paints x 290-990 and leaves only ~51px above and below. The pill lives
    // at x 1152, so it was never in danger - but a rule that looked only at
    // vertical gaps hid it anyway, and the Q-50c case went red on that lane
    // alone. MEASURED before the fix: pill display:none at this exact size.
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

  test('D-61 on the desktop the tour was built for: the dialog is topmost there too', async ({
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

  test('D-67: the overlay stops re-raising itself above its own highlight', async ({
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
        // MEASURED at the base: 10002/10003/10004, escalated off the engine's
        // own ring on a page whose real ancestors all sit below 950.
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
    // the ordering the escalation used to provide by accident, now stated
    expect(stack.target).toBe(stack.highlightToken);
    expect(stack.overlay).toBeGreaterThan(stack.target);
    expect(stack.card).toBeGreaterThan(stack.veil);
  });
});
