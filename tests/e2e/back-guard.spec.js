/**
 * UF-39 "The way back" (U-41): the browser Back button, made answerable.
 *
 * The owner, stuck mid-tutorial on their phone, pressed Back and the app
 * closed entirely. MEASURED at the release base 9e4805f, at 412x810, 412x915
 * and 1280x800: page.goBack() from the project surface unloads the document to
 * about:blank, `#app` is gone and body carries no data-app-surface.
 *
 * The fix is a history sentinel: one pushState when a project opens, so the
 * first Back press lands in the app instead of leaving it. Q-72 (owner,
 * 2026-08-22) chose warn-only, so "Leave" really leaves. Q-85 (owner, same
 * day) scopes the guard to the project surface: on the Main Page, Back behaves
 * as it always has.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';

const LEAVE_TITLE = 'Leave the app?';
const LEAVE_BODY =
  "The browser's Back button closes this app. It does not go back to the " +
  'Main Page or the previous menu. Your saved projects stay in this browser.';

const leaveDialog = (page) => page.locator('.confirm-modal', { hasText: LEAVE_TITLE });
const stayBtn = (page) => leaveDialog(page).locator('[data-action="cancel"]');
const leaveBtn = (page) => leaveDialog(page).locator('[data-action="confirm"]');

async function seed(page) {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
}

/** Somewhere to have come FROM. Any same-origin document that is not the app. */
const ELSEWHERE = '/icons/logo.png';

/**
 * A project surface with no tour running, reached the way people reach it:
 * from somewhere else. The Beginners card carries data-tutorial, so the deep
 * link is the quiet door; it also exercises the replaceState URL cleanup the
 * guard must leave alone.
 *
 * MEASURED, and the reason for the first goto: a plain page.goto('/') leaves
 * the app as history entry 1 in Firefox (history.length is 1), while Chromium
 * keeps its own initial about:blank as an entry. With no real document
 * underneath, "Leave" has nowhere to go and the case cannot be written
 * honestly. An explicit goto('about:blank') does not help - Firefox does not
 * keep it. The first-entry situation is a real one and is pinned separately.
 */
async function openProject(page) {
  await seed(page);
  await page.goto(ELSEWHERE);
  await page.goto('/?example=simple-box');
  await expect(page.locator('body')).toHaveAttribute(
    'data-app-surface',
    'project',
    { timeout: 180_000 }
  );
}

/** What is left of the app after a Back press. */
const appState = (page) =>
  page.evaluate(() => ({
    href: location.href,
    hasApp: !!document.getElementById('app'),
    surface: document.body?.dataset?.appSurface ?? null,
    historyLength: history.length,
  }));

const VIEWPORTS = [
  { name: 'phone 412x810', width: 412, height: 810 },
  { name: 'phone 412x915', width: 412, height: 915 },
  { name: 'desktop 1280x800', width: 1280, height: 800 },
];

for (const vp of VIEWPORTS) {
  test.describe(`U-41: Back asks before it closes the app (${vp.name})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('Back shows the warning, Stay keeps the app, a second Back asks again, Leave leaves', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await openProject(page);

      await page.goBack();
      await expect(leaveDialog(page)).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('#confirmDialogTitle')).toHaveText(LEAVE_TITLE);
      await expect(page.locator('#confirmDialogMessage')).toHaveText(LEAVE_BODY);
      await expect(stayBtn(page)).toHaveText('Stay in the app');
      await expect(leaveBtn(page)).toHaveText('Leave');

      // The safe answer is the one that already has focus.
      await expect(stayBtn(page)).toBeFocused();

      await stayBtn(page).click();
      await expect(leaveDialog(page)).toHaveCount(0);
      const stayed = await appState(page);
      expect(stayed.hasApp).toBe(true);
      expect(stayed.surface).toBe('project');
      // Staying puts the address bar back where it was too: the deep link
      // cleaned its own URL on the way in, and a Back press must not undo that.
      expect(stayed.href).toBe(`${new URL(page.url()).origin}/`);

      // Re-armed: the guard is not a one-shot.
      await page.goBack();
      await expect(leaveDialog(page)).toBeVisible({ timeout: 10_000 });

      await leaveBtn(page).click();
      await page.waitForURL(`**${ELSEWHERE}`, { timeout: 15_000 });
      const left = await appState(page);
      expect(left.hasApp).toBe(false);
      expect(left.surface).toBe(null);
    });
  });
}

test.describe('U-41: the warning answers like every other dialog in the app', () => {
  test.use({ viewport: { width: 412, height: 810 } });

  test('Escape chooses Stay', async ({ page }) => {
    test.setTimeout(240_000);
    await openProject(page);

    await page.goBack();
    await expect(leaveDialog(page)).toBeVisible({ timeout: 10_000 });
    // The trap takes its initial focus on a rAF, and Escape is bound to the
    // modal, so a press before that lands on <body> and is not heard (the
    // UF-23 probe lesson, not a defect of this dialog).
    await expect(stayBtn(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(leaveDialog(page)).toHaveCount(0);

    const after = await appState(page);
    expect(after.hasApp).toBe(true);
    expect(after.surface).toBe('project');

    // Escape re-arms exactly like the button does.
    await page.goBack();
    await expect(leaveDialog(page)).toBeVisible({ timeout: 10_000 });
  });

  test('a press outside the box chooses Stay', async ({ page }) => {
    test.setTimeout(240_000);
    await openProject(page);

    await page.goBack();
    await expect(leaveDialog(page)).toBeVisible({ timeout: 10_000 });
    // The backdrop is the modal element itself; its centre is the box, so aim
    // at a corner (the mobile-drawer lesson, Q-78).
    await leaveDialog(page).click({ position: { x: 6, y: 6 } });
    await expect(leaveDialog(page)).toHaveCount(0);
    expect((await appState(page)).surface).toBe('project');
  });
});

test.describe('Q-85: the guard belongs to the project surface', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('returning to the Main Page in-app leaves no stale history entry', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openProject(page);

    await page.locator('#clearFileBtn').click();
    await page.locator('.confirm-modal [data-action="confirm"]').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-app-surface',
      'welcome',
      { timeout: 30_000 }
    );

    // Retracting the sentinel must not drag a stale address bar back with it.
    expect(await page.evaluate(() => location.search)).toBe('');

    // On the Main Page, Back is the browser's own again: it leaves, and it
    // does so in ONE press, with no swallowed press in between.
    await page.goBack();
    await page.waitForURL(`**${ELSEWHERE}`, { timeout: 15_000 });
    expect((await appState(page)).hasApp).toBe(false);
  });

  test('opening a project again re-arms the guard', async ({ page }) => {
    test.setTimeout(240_000);
    await openProject(page);

    await page.locator('#clearFileBtn').click();
    await page.locator('.confirm-modal [data-action="confirm"]').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-app-surface',
      'welcome',
      { timeout: 30_000 }
    );

    await page.locator('.btn-role-try[data-example="simple-box"]').first().click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-app-surface',
      'project',
      { timeout: 180_000 }
    );

    await page.goBack();
    await expect(leaveDialog(page)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('U-41: one Back press, one answer', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('the comparison view answers the press itself, and no dialog stacks on top', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openProject(page);

    await page.locator('#actionsDrawerToggle').click();
    await page.locator('#addToComparisonBtn').click();
    await expect(page.locator('#comparisonView')).toBeVisible({
      timeout: 30_000,
    });

    // The comparison listener predates the guard and could never fire before
    // it: nothing in the app pushed history. Now that something does, this
    // press belongs to the view that is open, not to the app's front door.
    await page.goBack();
    await expect(page.locator('#comparisonView')).toBeHidden({
      timeout: 15_000,
    });
    await expect(leaveDialog(page)).toHaveCount(0);
    expect((await appState(page)).surface).toBe('project');

    // and the press was spent, not the guard: the next one asks.
    await page.goBack();
    await expect(leaveDialog(page)).toBeVisible({ timeout: 10_000 });
  });

  test('Q-86: a tour is still on its step after Stay', async ({ page }) => {
    test.setTimeout(240_000);
    await seed(page);
    await page.goto('/');
    await page.locator('.btn-role-try[data-tutorial="intro"]').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-app-surface',
      'project',
      { timeout: 180_000 }
    );
    await expect(page.locator('.tutorial-panel')).toBeVisible({
      timeout: 60_000,
    });
    await page.locator('#tutorialNextBtn').click();
    const step = await page.locator('#tutorial-step-title').textContent();
    const number = await page.locator('#tutorial-step-current').textContent();

    await page.goBack();
    await expect(leaveDialog(page)).toBeVisible({ timeout: 10_000 });
    await stayBtn(page).click();

    // The tour stands down for any dialog (UF-36) and comes back when it
    // closes, so this also proves the two mechanisms compose.
    await expect(page.locator('.tutorial-panel')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('#tutorial-step-title')).toHaveText(step);
    await expect(page.locator('#tutorial-step-current')).toHaveText(number);
  });
});

/**
 * A reload leaves the tab standing ON the sentinel. The app boots to the Main
 * Page knowing nothing about it, so opening a project again stacks a second
 * one, and a single history.back() then lands on the app's own earlier entry
 * rather than leaving. MEASURED at this release's own HEAD before the fix: the
 * app was still on screen after "Leave" and the address bar had jumped back to
 * ?example=simple-box. Recognising the leftover by its state does not work -
 * the deep-link cleanup replaceStates it away.
 */
test.describe('U-41: a reload leaves an entry behind', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  async function reloadAndReopen(page) {
    await openProject(page);
    await page.reload();
    await expect(page.locator('#welcomeScreen')).toBeVisible({
      timeout: 60_000,
    });
  }

  test('Leave still leaves', async ({ page }) => {
    test.setTimeout(240_000);
    await reloadAndReopen(page);

    await page
      .locator('.btn-role-try[data-example="simple-box"]')
      .first()
      .click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-app-surface',
      'project',
      { timeout: 180_000 }
    );

    await page.goBack();
    await expect(leaveDialog(page)).toBeVisible({ timeout: 10_000 });
    await leaveBtn(page).click();

    await page.waitForURL(`**${ELSEWHERE}`, { timeout: 15_000 });
    expect((await appState(page)).hasApp).toBe(false);
  });

  test('Back on the Main Page still leaves, with no press swallowed', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await reloadAndReopen(page);

    // One press, from the Main Page, with a leftover entry underneath it.
    await page.goBack();
    await page.waitForURL(`**${ELSEWHERE}`, { timeout: 15_000 });
    expect((await appState(page)).hasApp).toBe(false);
  });
});

/**
 * The honest limit, pinned rather than described. When the app is the first
 * page in the tab there is no earlier document, so "Leave" has nothing to go
 * back to. The important half is what does NOT happen: the guard stands down
 * instead of asking again, because a guard that re-armed behind someone who
 * asked to leave would be a trap they could never get out of.
 */
test.describe('U-41: when the app is the first page in the tab', () => {
  test.use({ viewport: { width: 412, height: 810 } });

  test('Leave stands the guard down rather than trapping the user', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'firefox',
      'Only Firefox starts the app as history entry 1 here; Chromium keeps its own about:blank entry, so this situation cannot be built there.'
    );
    test.setTimeout(240_000);
    await seed(page);
    await page.goto('/?example=simple-box');
    await expect(page.locator('body')).toHaveAttribute(
      'data-app-surface',
      'project',
      { timeout: 180_000 }
    );
    // The app plus one sentinel, and nothing underneath them.
    expect(await page.evaluate(() => history.length)).toBe(2);

    await page.goBack();
    await expect(leaveDialog(page)).toBeVisible({ timeout: 10_000 });
    await leaveBtn(page).click();
    await expect(leaveDialog(page)).toHaveCount(0);

    // Nowhere to go, so the app is still here. Said out loud because it is
    // the limit, not the goal.
    expect((await appState(page)).hasApp).toBe(true);

    // And the guard is down: a further Back does not ask again. In a real
    // browser that press closes the tab, which is what it did before UF-39.
    await page.goBack().catch(() => {});
    await page.waitForTimeout(1000);
    await expect(leaveDialog(page)).toHaveCount(0);
  });
});

test.describe('U-41: the doors the guard must not touch', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('?example= still loads and still cleans its own URL', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openProject(page);
    await expect
      .poll(() => page.evaluate(() => location.search), { timeout: 30_000 })
      .toBe('');
    expect(await page.evaluate(() => location.pathname)).toBe('/');
  });

  test('?recovery=true still cleans its URL and keeps the app on the welcome surface', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await seed(page);
    await page.goto('/?recovery=true');
    await expect(page.locator('#welcomeScreen')).toBeVisible({
      timeout: 30_000,
    });
    await expect
      .poll(() => page.evaluate(() => location.search), { timeout: 30_000 })
      .toBe('');
  });
});
