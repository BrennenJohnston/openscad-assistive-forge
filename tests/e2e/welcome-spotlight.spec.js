/**
 * Welcome spotlight (U-23 UF-16, U-24 UF-17)
 *
 * ONE welcome card at a time carries a passive spotlight (halo + tag +
 * dismiss) — recorded in the persistent registry under
 * openscad-forge-tutorial-state. Precedence (Q-44a): the Welcome Page
 * Tour card wears it while its family was never opened, completed, or
 * dismissed; afterwards the Beginners Start Here card wears it while the
 * intro family is untouched. The spotlight may only exist after the
 * first-visit gate resolves (inside the inert #app it would be
 * unreachable), announces exactly one polite tip, and clears live on its
 * own family's registry write. Dismissal is permanent (Q-43a) and hands
 * over on the NEXT visit, not instantly.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';

const REGISTRY_KEY = 'openscad-forge-tutorial-state';
const SPOTLIGHT_CARD = '.role-path-card.welcome-spotlight';
const TAG = '.welcome-spotlight-tag';
const DISMISS = '.welcome-spotlight-dismiss';

async function stampFirstVisitSeen(page) {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
}

// UF-9's observer idiom: live-region text clears itself (announcer.js wipes
// after ~1.5s), so record every non-empty write instead of probing late.
async function watchAnnouncements(page) {
  await page.addInitScript(() => {
    window.__said = [];
    const wire = () => {
      for (const id of ['srAnnouncer', 'srAnnouncerAssertive']) {
        const el = document.getElementById(id);
        if (el && !el.__watched) {
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
      }
    };
    document.addEventListener('DOMContentLoaded', wire);
  });
}

const readRegistry = (page) =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, REGISTRY_KEY);

test.describe('Welcome spotlight (U-23, UF-16)', () => {
  test('fresh profile: absent while the first-visit modal blocks, present after acceptance, announced once', async ({
    page,
  }) => {
    await watchAnnouncements(page);
    // Deliberately NO first-visit stamp — the gate sequencing is the point.
    await page.goto('/');
    await page
      .locator('#first-visit-modal:not(.hidden)')
      .waitFor({ state: 'visible', timeout: 10_000 });

    // While the modal blocks, the spotlight must not exist anywhere.
    await expect(page.locator(SPOTLIGHT_CARD)).toHaveCount(0);
    await expect(page.locator(TAG)).toHaveCount(0);

    await page.locator('#firstVisitChoiceForge').check();
    await page.locator('#first-visit-continue').click();
    await expect(page.locator('#first-visit-modal')).toBeHidden();

    // Now exactly ONE card carries the halo — the Welcome Page Tour card
    // (Q-44a precedence), with the tag and a real dismiss button.
    await expect(page.locator(SPOTLIGHT_CARD)).toHaveCount(1);
    const card = page.locator(SPOTLIGHT_CARD);
    await expect(card.locator('.role-path-title')).toHaveText(
      'Welcome Page Tour'
    );
    await expect(card.locator('.welcome-spotlight-tag-text')).toHaveText(
      'New here? Start with this tour'
    );
    const dismiss = card.locator(DISMISS);
    await expect(dismiss).toBeVisible();
    await expect(dismiss).toHaveText('Dismiss tip');
    const box = await dismiss.boundingBox();
    expect(box.width, 'dismiss target width').toBeGreaterThanOrEqual(44);
    expect(box.height, 'dismiss target height').toBeGreaterThanOrEqual(44);

    // One polite tip reached the live region after the gate resolved.
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            window.__said.some((t) => t.includes('Welcome Page Tour'))
          ),
        { timeout: 5_000 }
      )
      .toBe(true);

    // Showing the spotlight writes nothing — the registry stays empty.
    expect(await readRegistry(page)).toBeNull();
  });

  test('starting the welcome tour from the card clears the spotlight and records opened', async ({
    page,
  }) => {
    await stampFirstVisitSeen(page);
    await page.goto('/');
    await expect(page.locator(SPOTLIGHT_CARD)).toHaveCount(1);

    // The real U-24 path: the card's own Start button. No example loads,
    // so no WASM wait is needed — the tour lives on the welcome surface.
    await page.locator('button[data-tutorial="welcome"]').click();

    // The registry write at startTutorial's commitment point removes the
    // decoration live and durably.
    await expect(page.locator(SPOTLIGHT_CARD)).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.locator(TAG)).toHaveCount(0);
    await expect
      .poll(async () => (await readRegistry(page))?.welcome?.opened, {
        timeout: 10_000,
      })
      .toEqual(expect.any(Number));

    // Q-44a soft handoff: the NEXT visit hands the tip to the Beginners
    // card, because the welcome family now carries a record and intro
    // does not.
    await page.reload();
    await expect(page.locator('#welcomeScreen')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator(SPOTLIGHT_CARD)).toHaveCount(1);
    await expect(
      page.locator(SPOTLIGHT_CARD).locator('.role-path-title')
    ).toHaveText('Beginners Start Here');
  });

  test('Dismiss tip is permanent (Q-43a) and hands over on the next visit, not instantly (Q-44a)', async ({
    page,
  }) => {
    await stampFirstVisitSeen(page);
    await page.goto('/');
    const dismiss = page.locator(DISMISS);
    await expect(dismiss).toBeVisible();

    await dismiss.click();

    // No instant whack-a-mole: the Beginners tip must NOT pop up in the
    // same visit the welcome tip was dismissed.
    await expect(page.locator(SPOTLIGHT_CARD)).toHaveCount(0);
    await expect(page.locator(TAG)).toHaveCount(0);
    // Focus lands on the card's Start button, never on <body>.
    await expect(page.locator('button[data-tutorial="welcome"]')).toBeFocused();
    const registry = await readRegistry(page);
    expect(registry.welcome.dismissed).toEqual(expect.any(Number));
    expect(registry.welcome.opened).toBeUndefined();
    expect(registry.intro).toBeUndefined();

    // Next visit: the Beginners card wears the tip. Dismissing that one
    // too ends the affordance for good.
    await page.reload();
    await expect(page.locator('#welcomeScreen')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator(SPOTLIGHT_CARD)).toHaveCount(1);
    await expect(
      page.locator(SPOTLIGHT_CARD).locator('.role-path-title')
    ).toHaveText('Beginners Start Here');
    await page.locator(DISMISS).click();
    await expect(page.locator(SPOTLIGHT_CARD)).toHaveCount(0);

    await page.reload();
    await expect(page.locator('#welcomeScreen')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator(SPOTLIGHT_CARD)).toHaveCount(0);
    await expect(page.locator(TAG)).toHaveCount(0);
  });

  test('completing a tutorial records completed; other families leave the welcome spotlight alone', async ({
    page,
  }) => {
    await stampFirstVisitSeen(page);
    await page.goto('/');
    await expect(page.locator(SPOTLIGHT_CARD)).toHaveCount(1);

    // voice-input: five steps, no completion gates — a pure Next walk to
    // the real closeTutorial(true). Fire-and-forget (the UF-8 evaluate
    // trap: awaiting startTutorial's promise deadlocks if a dialog opens).
    await page.waitForFunction(
      () => typeof window.startTutorial === 'function',
      { timeout: 10_000 }
    );
    await page.evaluate(() => {
      void window.startTutorial('voice-input');
    });
    await page
      .locator('.tutorial-panel')
      .waitFor({ state: 'visible', timeout: 10_000 });

    for (let i = 0; i < 10; i++) {
      const overlayGone = await page
        .locator('.tutorial-panel')
        .isHidden()
        .catch(() => true);
      if (overlayGone) break;
      await page
        .locator(
          '.tutorial-panel button:has-text("Next"), .tutorial-panel button:has-text("Finish")'
        )
        .first()
        .click();
      await page.waitForTimeout(300);
    }
    await expect(page.locator('.tutorial-panel')).toHaveCount(0, {
      timeout: 10_000,
    });

    const registry = await readRegistry(page);
    expect(registry['voice-input'].opened).toEqual(expect.any(Number));
    expect(registry['voice-input'].completed).toEqual(expect.any(Number));
    // Family isolation: the welcome spotlight is still up and unrecorded.
    expect(registry.welcome).toBeUndefined();
    expect(registry.intro).toBeUndefined();
    await expect(page.locator(SPOTLIGHT_CARD)).toHaveCount(1);
    await expect(
      page.locator(SPOTLIGHT_CARD).locator('.role-path-title')
    ).toHaveText('Welcome Page Tour');
  });

  test('reduced motion collapses the pulse to a static halo', async ({
    page,
  }) => {
    await stampFirstVisitSeen(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const card = page.locator(SPOTLIGHT_CARD);
    await expect(card).toHaveCount(1);
    const style = await card.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        animationName: cs.animationName,
        outlineWidth: cs.outlineWidth,
        outlineStyle: cs.outlineStyle,
      };
    });
    expect(style.animationName).toBe('none');
    expect(style.outlineWidth).toBe('3px');
    expect(style.outlineStyle).toBe('solid');
  });

  test('the Classic welcome shows the same spotlight (both UIs, one card)', async ({
    page,
  }) => {
    await stampFirstVisitSeen(page);
    await page.addInitScript(() => {
      localStorage.setItem(
        'openscad-forge-ui-mode',
        JSON.stringify({ mode: 'classic', lastCustomMode: 'standard' })
      );
    });
    await page.goto('/');

    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-app-surface',
      'welcome'
    );
    const card = page.locator(SPOTLIGHT_CARD);
    await expect(card).toHaveCount(1);
    await expect(card.locator(DISMISS)).toBeVisible();
    await expect(card.locator('.welcome-spotlight-tag-text')).toHaveText(
      'New here? Start with this tour'
    );
  });
});
