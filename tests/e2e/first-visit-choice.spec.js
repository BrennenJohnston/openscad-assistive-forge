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
