/**
 * First-visit interface choice (U-9, UF-3b)
 *
 * The first-visit modal carries a Forge/Classic choice: two labelled radio
 * cards with screenshots, no pre-selection, a remember-my-choice checkbox
 * (default checked), and one Download & Continue action that still gates the
 * WASM download. These cases deliberately do NOT stamp
 * openscad-forge-first-visit-seen — the modal appearing is the point — and
 * none of them needs WASM, so they assert against the blocked state only.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const MODAL = '#first-visit-modal';

async function waitForModal(page) {
  // main.js opens the modal on a 500ms timer after load
  await page
    .locator(`${MODAL}:not(.hidden)`)
    .waitFor({ state: 'visible', timeout: 10_000 });
}

test.describe('First-visit interface choice', () => {
  // UF-22: the gate is this file's subject, and the tour nudge arrives right
  // behind it once the choice is made. Suppressed here so it cannot land in
  // the middle of a case about the modal. The nudge's own behaviour at this
  // gate is covered in tour-nudge.spec.js.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    });
  });

  test('modal appears with both options unchosen and the app blocked', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForModal(page);

    await expect(page.locator('body')).toHaveClass(/first-visit-blocking/);
    await expect(page.locator('#app')).toHaveAttribute('aria-hidden', 'true');

    await expect(page.locator('#firstVisitChoiceForge')).not.toBeChecked();
    await expect(page.locator('#firstVisitChoiceClassic')).not.toBeChecked();
    await expect(page.locator('#firstVisitRemember')).toBeChecked();

    // Both screenshots actually load from public/screenshots/
    for (const id of ['#firstVisitForgeShot', '#firstVisitClassicShot']) {
      const width = await page
        .locator(id)
        .evaluate((img) => img.naturalWidth);
      expect(width, `${id} must load`).toBeGreaterThan(0);
    }

    // The gate has no escape hatch: Escape leaves the modal open
    await page.keyboard.press('Escape');
    await expect(page.locator(MODAL)).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/first-visit-blocking/);
  });

  test('continue without a choice blocks with a visible, announced message', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForModal(page);

    await page.locator('#first-visit-continue').click();

    const error = page.locator('#firstVisitChoiceError');
    await expect(error).toBeVisible();
    await expect(error).toHaveText('Choose an interface to continue.');
    await expect(error).toHaveAttribute('role', 'alert');
    await expect(page.locator(MODAL)).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/first-visit-blocking/);
    await expect(page.locator('#firstVisitChoiceForge')).toBeFocused();

    // Picking an option clears the message; Continue then proceeds
    await page.locator('#firstVisitChoiceForge').check();
    await expect(error).toBeHidden();
    await page.locator('#first-visit-continue').click();
    await expect(page.locator(MODAL)).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/first-visit-blocking/);
  });

  test('choosing Assistive Forge stays in the default UI and remembers', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForModal(page);

    await page.locator('#firstVisitChoiceForge').check();
    await page.locator('#first-visit-continue').click();
    await expect(page.locator(MODAL)).toBeHidden();

    await expect(page.locator('body')).not.toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    const seen = await page.evaluate(() =>
      localStorage.getItem('openscad-forge-first-visit-seen')
    );
    expect(seen).toBe('true');
  });

  test('choosing Classic applies the existing ui-mode switch after acceptance', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForModal(page);

    await page.locator('#firstVisitChoiceClassic').check();
    await page.locator('#first-visit-continue').click();
    await expect(page.locator(MODAL)).toBeHidden();

    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    const stored = await page.evaluate(() => ({
      seen: localStorage.getItem('openscad-forge-first-visit-seen'),
      uiMode: localStorage.getItem('openscad-forge-ui-mode'),
    }));
    expect(stored.seen).toBe('true');
    expect(JSON.parse(stored.uiMode).mode).toBe('classic');
  });

  test('unchecked remember proceeds this session and prompts again next visit', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForModal(page);

    await page.locator('#firstVisitRemember').uncheck();
    await page.locator('#firstVisitChoiceForge').check();
    await page.locator('#first-visit-continue').click();
    await expect(page.locator(MODAL)).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/first-visit-blocking/);

    const seen = await page.evaluate(() =>
      localStorage.getItem('openscad-forge-first-visit-seen')
    );
    expect(seen).toBeNull();

    await page.reload();
    await waitForModal(page);
    await expect(page.locator('body')).toHaveClass(/first-visit-blocking/);
  });

  test('the modal speaks the approved copy and the remember-hint is gone (UF-12, U-19)', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForModal(page);

    // The intro is a heading + four bullets, in DOM order 1-4.
    await expect(
      page.locator('#first-visit-intro .first-visit-note-title')
    ).toHaveText('Note for first time users:');
    const bullets = page.locator('#first-visit-intro .first-visit-note-list li');
    await expect(bullets).toHaveCount(4);
    await expect(bullets.nth(0)).toContainText(
      'This app runs entirely in your browser.'
    );
    await expect(bullets.nth(3)).toContainText(
      "Clearing the browser's site data"
    );

    // One-line interface descriptions (the owner's approved strings).
    await expect(page.locator('#firstVisitForgeGuide')).toHaveText(
      'Choose Assistive Forge for the most accessible experience.'
    );
    await expect(page.locator('#firstVisitClassicGuide')).toHaveText(
      'Choose this if you already use the OpenSCAD desktop application or are following an OpenSCAD tutorial.'
    );

    // The follow-up statement is the approved one-liner.
    await expect(page.locator('.first-visit-compromise')).toHaveText(
      'On a desktop, you can switch between interfaces at any time with the button in the top right corner of the app.'
    );

    // The redundant remember-hint is deleted outright.
    await expect(page.locator('.first-visit-remember-hint')).toHaveCount(0);
  });

  test('card links are siblings of the labels and cannot toggle the radios (UF-12, U-19)', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForModal(page);

    // No anchor may live inside a card label: there it would toggle the
    // radio on click and join the radio's accessible description.
    await expect(
      page.locator('#first-visit-modal label.first-visit-option a')
    ).toHaveCount(0);

    const forgeLink = page
      .locator('.first-visit-option-cell')
      .nth(0)
      .locator('.first-visit-option-more a');
    const classicLink = page
      .locator('.first-visit-option-cell')
      .nth(1)
      .locator('.first-visit-option-more a');
    await expect(forgeLink).toHaveAttribute(
      'href',
      /ACCESSIBILITY_HIGHLIGHTS\.md/
    );
    await expect(classicLink).toHaveAttribute('href', /CLASSIC_UI_GUIDE\.md/);

    // Click each link (navigation suppressed - no network in this suite)
    // and prove neither radio picked up the click.
    await page.evaluate(() => {
      document
        .querySelectorAll('.first-visit-option-more a')
        .forEach((a) =>
          a.addEventListener('click', (e) => e.preventDefault())
        );
    });
    await forgeLink.click();
    await classicLink.click();
    await expect(page.locator('#firstVisitChoiceForge')).not.toBeChecked();
    await expect(page.locator('#firstVisitChoiceClassic')).not.toBeChecked();
  });

  test('modal links look like links in light and dark (UF-12, U-20)', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForModal(page);

    const probe = async () => {
      const links = page.locator('.modal-first-visit a');
      const count = await links.count();
      expect(count).toBeGreaterThanOrEqual(4);
      const bodyColor = await page
        .locator('.first-visit-compromise')
        .evaluate((el) => getComputedStyle(el).color);
      for (let i = 0; i < count; i++) {
        const style = await links
          .nth(i)
          .evaluate((el) => ({
            underline: getComputedStyle(el).textDecorationLine,
            color: getComputedStyle(el).color,
          }));
        expect(style.underline).toContain('underline');
        expect(style.color).not.toBe(bodyColor);
      }
    };

    await probe();
    await page.emulateMedia({ colorScheme: 'dark' });
    await probe();
  });

  test('dark theme shows the dark Forge capture; Classic stays light (UF-12, U-21)', async ({
    page,
  }) => {
    // Order matters on Firefox, and this is the sequence that works there.
    // Emulating BEFORE a fresh page's first navigation does not take: Firefox
    // still answers matchMedia light, the app resolves light, and the light
    // capture loads - which is why this case failed on the Firefox lane, not
    // anything the app got wrong. MEASURED on this app, three ways: emulate
    // then goto gives dark=false on Firefox (true on Chromium); the
    // colorScheme context option gives false too; goto, then emulate, then
    // reload gives true on both, and Firefox then sets data-theme=dark and
    // swaps to the dark capture by itself. The modal still opens on the
    // reload: the first-visit flag is written when a choice is made, not when
    // the modal is shown.
    await page.goto('/');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload();
    await waitForModal(page);

    await expect(page.locator('#firstVisitForgeShot')).toHaveAttribute(
      'src',
      /forge-standard-dark\.webp$/
    );
    await expect(page.locator('#first-visit-modal')).toHaveClass(
      /first-visit-forge-dark/
    );
    // Classic is light by design - its capture never swaps.
    await expect(page.locator('#firstVisitClassicShot')).toHaveAttribute(
      'src',
      /classic-standard\.webp$/
    );
    // The dark asset really loads, not just points somewhere.
    const width = await page
      .locator('#firstVisitForgeShot')
      .evaluate((img) => img.naturalWidth);
    expect(width).toBeGreaterThan(0);
  });

  test('light theme keeps the light Forge capture (UF-12, U-21)', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await waitForModal(page);

    await expect(page.locator('#firstVisitForgeShot')).toHaveAttribute(
      'src',
      /forge-standard\.webp$/
    );
    await expect(page.locator('#first-visit-modal')).not.toHaveClass(
      /first-visit-forge-dark/
    );
  });

  test('the open modal has no axe violations', async ({ page }) => {
    await page.goto('/');
    await waitForModal(page);

    const results = await new AxeBuilder({ page })
      .include(MODAL)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    if (results.violations.length > 0) {
      console.log(JSON.stringify(results.violations, null, 2));
    }
    expect(results.violations).toEqual([]);
  });
});

test.describe('First-visit choice on a phone-shaped viewport (U-10, UF-5)', () => {
  // Plain viewport only — Firefox rejects isMobile at browser-context
  // creation (the mobile-viewport.spec.js lesson).
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    });
  });

  test('the Classic card is genuinely disabled with a visible notice; Forge still works', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForModal(page);

    // C-15 shape: a real disabled attribute (the label click does nothing,
    // no snap-back) plus a VISIBLE reason inside the card.
    const classicRadio = page.locator('#firstVisitChoiceClassic');
    await expect(classicRadio).toBeDisabled();
    const note = page.locator('#firstVisitClassicGate');
    await expect(note).toBeVisible();
    await expect(note).toContainText('desktop-only for now');
    await expect(classicRadio).toHaveAttribute(
      'aria-describedby',
      /firstVisitClassicGate/
    );

    // The Forge path is untouched by the gate.
    await page.locator('#firstVisitChoiceForge').check();
    await page.locator('#first-visit-continue').click();
    await expect(page.locator(MODAL)).toBeHidden();
    await expect(page.locator('body')).not.toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
  });

  test('the Classic card re-enables live when the window turns desktop-shaped', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForModal(page);

    const classicRadio = page.locator('#firstVisitChoiceClassic');
    await expect(classicRadio).toBeDisabled();

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(classicRadio).toBeEnabled();
    await expect(page.locator('#firstVisitClassicGate')).toBeHidden();

    // Narrowing again re-gates, and a checked Classic choice is cleared
    // rather than silently submitted.
    await classicRadio.check();
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(classicRadio).toBeDisabled();
    await expect(classicRadio).not.toBeChecked();
  });
});

/*
 * UF-41 (U-39): a modal that fits the phone.
 *
 * The owner's own first-run session on a real phone found the interface
 * pictures far too large, no indication of any kind that the modal scrolled,
 * and both the Download button and the entire Classic card below the fold.
 * The measurement behind these cases (release record §8f): Download &
 * Continue sat below an UNMARKED internal fold at all six sizes tested,
 * 1366x768 included, because the whole box scrolled as one.
 *
 * These assert by HIT TEST, never by rectangle. UF-12's trap: a control can
 * have a perfectly good boundingBox and still be under the fold of an
 * internal scroller, so `toBeVisible` and a rect both pass on a button
 * nobody can press.
 */
async function continueFit(page) {
  return page.evaluate(() => {
    const btn = document.getElementById('first-visit-continue');
    const body = document.querySelector('#first-visit-modal .modal-body');
    const r = btn.getBoundingClientRect();
    const cx = Math.round(r.x + r.width / 2);
    const cy = Math.round(r.y + r.height / 2);
    const hit = document.elementFromPoint(cx, cy);
    return {
      inViewport:
        r.top >= 0 &&
        r.bottom <= window.innerHeight &&
        r.left >= 0 &&
        r.right <= window.innerWidth,
      topmostIsContinue: hit === btn || btn.contains(hit),
      hitTag: hit ? `${hit.tagName.toLowerCase()}#${hit.id}` : null,
      bodyOverflow: body.scrollHeight - body.clientHeight,
      // The body is the only thing allowed to scroll now; the box that
      // holds the title and the footer must not.
      boxOverflow: (() => {
        const box = document.querySelector('.modal-first-visit');
        return box.scrollHeight - box.clientHeight;
      })(),
      titleTop: Math.round(
        document.getElementById('first-visit-title').getBoundingClientRect().top
      ),
    };
  });
}

test.describe('UF-41: Download & Continue is reachable without scrolling', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    });
  });

  // The two sizes the acceptance oracle names. 412x915 is the emulated
  // phone; 1280x800 is the laptop the §2.5 table proved was also failing,
  // which is the half of this defect nobody had reported.
  for (const [width, height] of [
    [412, 915],
    [1280, 800],
  ]) {
    test(`the primary action is hit-testable and nothing scrolls at ${width}x${height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await waitForModal(page);

      const fit = await continueFit(page);
      expect(
        fit.inViewport,
        'Download & Continue must be inside the viewport'
      ).toBe(true);
      expect(
        fit.topmostIsContinue,
        `elementFromPoint at the button's centre returned ${fit.hitTag}`
      ).toBe(true);
      expect(fit.bodyOverflow, 'the body must not overflow here').toBeLessThanOrEqual(0);
      expect(fit.boxOverflow, 'the modal box itself must never scroll').toBeLessThanOrEqual(0);
    });
  }

  // 412x810 is the height a phone REALLY has once the address bar, status
  // bar and gesture nav are taken off a 412x915 emulation (UF-38's finding).
  // No-scroll is out of reach here — the release record's arithmetic shows
  // the remaining 65px cannot come out of anything but words or a touch
  // target — but the primary action must still be on screen, because the
  // footer no longer scrolls with the body.
  test('the primary action stays on screen at 412x810, where the body still scrolls', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 412, height: 810 });
    await page.goto('/');
    await waitForModal(page);

    const fit = await continueFit(page);
    expect(fit.inViewport).toBe(true);
    expect(fit.topmostIsContinue, `hit ${fit.hitTag}`).toBe(true);
    expect(fit.bodyOverflow, 'this size is expected to scroll').toBeGreaterThan(0);
    expect(fit.boxOverflow).toBeLessThanOrEqual(0);
  });

  // The title clip (164304) is a 100vh bug: 100vh is the LARGE viewport
  // height, so on a phone showing its browser chrome the box was taller
  // than the space it is centred in, and align-items:center cuts an
  // overflowing item off at both ends. Emulation has no dynamic chrome, so
  // the closest reproduction available here is the flush-top case — the
  // title must never sit above the top of the viewport at any size.
  for (const [width, height] of [
    [360, 640],
    [412, 810],
    [768, 1024],
    [1366, 768],
  ]) {
    test(`the title is not clipped at the top at ${width}x${height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await waitForModal(page);

      const fit = await continueFit(page);
      expect(fit.titleTop).toBeGreaterThanOrEqual(0);
      // And the primary action is reachable even at the sizes the
      // arithmetic says cannot fit.
      expect(fit.topmostIsContinue, `hit ${fit.hitTag}`).toBe(true);
    });
  }
});

test.describe('UF-41: the fold is visible when there is one', () => {
  // The smallest size in the §2.5 table, and the one the plan proved could
  // never reach no-scroll without deleting whole blocks.
  test.use({ viewport: { width: 360, height: 640 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    });
  });

  test('the cue shows while content is below the fold and goes at the end', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForModal(page);

    const box = page.locator('.modal-first-visit');
    const cue = page.locator('.first-visit-scroll-cue');

    await expect(box).toHaveClass(/first-visit-has-more/);
    await expect(cue).toHaveCSS('opacity', '1');

    // It is an announcement to the eye only: no tab stop, nothing for a
    // screen reader, no pointer target of its own.
    await expect(cue).toHaveAttribute('aria-hidden', 'true');
    await expect(cue).toHaveCSS('pointer-events', 'none');
    expect(await cue.evaluate((el) => el.querySelector('[tabindex]'))).toBeNull();

    // Scroll the body to the end; the cue must go.
    await page.evaluate(() => {
      const body = document.querySelector('#first-visit-modal .modal-body');
      body.scrollTop = body.scrollHeight;
    });
    await expect(box).not.toHaveClass(/first-visit-has-more/);
    await expect(cue).toHaveCSS('opacity', '0');
  });

  test('the cue costs the content no height', async ({ page }) => {
    await page.goto('/');
    await waitForModal(page);

    // Zero-height by construction, so it can never be the reason something
    // is cut off — the shape UF-38 reviewed for the tutorial card.
    const h = await page
      .locator('.first-visit-scroll-cue')
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(h).toBe(0);
  });

  test('opening a note row re-evaluates the fold', async ({ page }) => {
    await page.goto('/');
    await waitForModal(page);

    await page.evaluate(() => {
      const body = document.querySelector('#first-visit-modal .modal-body');
      body.scrollTop = body.scrollHeight;
    });
    await expect(page.locator('.modal-first-visit')).not.toHaveClass(
      /first-visit-has-more/
    );

    // A <details> firing `toggle` is the only signal that the amount below
    // the fold just changed; without listening for it the cue lies.
    await page.locator('.first-visit-note-row').first().locator('summary').click();
    await expect(page.locator('.modal-first-visit')).toHaveClass(
      /first-visit-has-more/
    );
  });
});

test.describe('UF-41: the collapsible intro on a mobile-shaped viewport', () => {
  test.use({ viewport: { width: 412, height: 810 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    });
  });

  test('four native details rows, stowed on first view, with the signed headlines', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForModal(page);

    const rows = page.locator('.first-visit-note-row');
    await expect(rows).toHaveCount(4);

    // Native disclosure, not an ARIA reconstruction: the element IS
    // <details> and the control IS its <summary>.
    for (let i = 0; i < 4; i += 1) {
      await expect(rows.nth(i)).toHaveJSProperty('tagName', 'DETAILS');
      await expect(rows.nth(i)).not.toHaveAttribute('open', '');
    }

    await expect(rows.nth(0).locator('summary')).toHaveText(
      'Browser based process'
    );
    await expect(rows.nth(1).locator('summary')).toHaveText(
      'Initial download, about 15 to 30 MB'
    );
    await expect(rows.nth(2).locator('summary')).toHaveText(
      'Local project storage'
    );
    await expect(rows.nth(3).locator('summary')).toHaveText(
      'Completely removable'
    );

    // The desktop bullet list is out of the layout here, so no screen
    // reader is offered both copies of the same four facts.
    await expect(page.locator('.first-visit-note-list')).toBeHidden();
    await expect(page.locator('.first-visit-note-rows')).toBeVisible();
  });

  test('the rows are keyboard-operable and meet the 44px target', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForModal(page);

    const first = page.locator('.first-visit-note-row').first();
    const summary = first.locator('summary');

    const boxHeight = (await summary.boundingBox()).height;
    expect(boxHeight).toBeGreaterThanOrEqual(44);

    await summary.focus();
    await expect(summary).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(first).toHaveAttribute('open', '');
    await page.keyboard.press('Enter');
    await expect(first).not.toHaveAttribute('open', '');

    // Space is the other native activation and must work too.
    await page.keyboard.press('Space');
    await expect(first).toHaveAttribute('open', '');
  });

  test('the two copies of the four facts cannot drift apart', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForModal(page);

    // Q-69 keeps the full bullets on desktop and gives mobile the stowed
    // rows, which means the four approved sentences are in the DOM twice.
    // That is only safe while the two copies say exactly the same thing.
    const normalise = (s) => s.replace(/\s+/g, ' ').trim();
    const bullets = (
      await page.locator('.first-visit-note-list li').allTextContents()
    ).map(normalise);
    const bodies = (
      await page.locator('.first-visit-note-row > p').allTextContents()
    ).map(normalise);

    expect(bodies).toEqual(bullets);
  });

  test('the pictures leave the layout but not the accessible description', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForModal(page);

    // Q-68a: no screenshots where no choice is offered.
    await expect(page.locator('#firstVisitForgeShot')).toBeHidden();
    await expect(page.locator('#firstVisitClassicShot')).toBeHidden();

    // ...and the layout description each picture used to carry is still
    // what the radio is described by, because it moved to an sr-only span
    // that is in the DOM at every size. This is the whole reason the
    // pictures were allowed to go.
    for (const [radio, descId, fragment] of [
      [
        '#firstVisitChoiceForge',
        'firstVisitForgeShotDesc',
        'the Customizer parameter panel is on the left',
      ],
      [
        '#firstVisitChoiceClassic',
        'firstVisitClassicShotDesc',
        'the code editor is on the left',
      ],
    ]) {
      await expect(page.locator(radio)).toHaveAttribute(
        'aria-describedby',
        new RegExp(descId)
      );
      await expect(page.locator(`#${descId}`)).toContainText(fragment);
    }
  });

  test('the modal has one definition of mobile, shared with the Classic gate', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForModal(page);

    // The layout swap and the gate ride the same isViewportDesktopShaped()
    // predicate, so the pictures can never be showing where the choice they
    // illustrate is refused.
    const modal = page.locator(MODAL);
    await expect(modal).toHaveClass(/first-visit-mobile-shaped/);
    await expect(page.locator('#firstVisitChoiceClassic')).toBeDisabled();

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(modal).not.toHaveClass(/first-visit-mobile-shaped/);
    await expect(page.locator('#firstVisitChoiceClassic')).toBeEnabled();
    await expect(page.locator('#firstVisitForgeShot')).toBeVisible();
    await expect(page.locator('.first-visit-note-list')).toBeVisible();
    await expect(page.locator('.first-visit-note-rows')).toBeHidden();
  });

  test('the no-choice error still announces from inside the modal', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForModal(page);

    // #srAnnouncer is inert while this modal blocks, so the in-modal
    // role=alert is the only voice here (UF-3). The rebuild must not have
    // moved it out of the scrolling body or muted it.
    const error = page.locator('#firstVisitChoiceError');
    await expect(error).toBeHidden();
    await page.locator('#first-visit-continue').click();
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute('role', 'alert');
    await expect(error).toHaveText('Choose an interface to continue.');
    await expect(page.locator(MODAL)).toBeVisible();
  });

  test('the open modal has no axe violations on a phone-shaped viewport', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForModal(page);

    const results = await new AxeBuilder({ page }).include(MODAL).analyze();
    expect(results.violations).toEqual([]);
  });
});
