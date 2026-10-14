/**
 * The header's controls are named by their visible words, first: a person
 * who sees "Help" and says "click Help" is understood, and a screen reader
 * says the word on the button before anything else. The longer words are
 * descriptions. The logo is decorative beside the title, and the title
 * holds the app's name at every width.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe.configure({ timeout: 120_000 });

async function openBox(page) {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
  await page.goto('/?example=simple-box');
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-current/,
    { timeout: 120_000 }
  );
}

/** The accessible name, as a screen reader computes it. */
const nameOf = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const label = el.getAttribute('aria-label');
    if (label) return label;
    const by = el.getAttribute('aria-labelledby');
    if (by) return document.getElementById(by)?.textContent.trim();
    return el.textContent.replace(/\s+/g, ' ').trim();
  }, selector);

const visibleWordsOf = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return [...el.querySelectorAll('span, .btn-text')]
      .filter(
        (s) =>
          s.getAttribute('aria-hidden') !== 'true' &&
          getComputedStyle(s).display !== 'none'
      )
      .map((s) => s.textContent.trim())
      .filter(Boolean)
      .join(' ')
      .trim();
  }, selector);

test('each header control is named by its visible words, first', async ({
  page,
}) => {
  await openBox(page);
  const mode = page.locator('#uiModeToggle');
  if ((await mode.getAttribute('aria-checked')) !== 'true') await mode.click();
  await page.evaluate(() =>
    document.getElementById('actionsDrawer')?.classList.remove('collapsed')
  );

  for (const [selector, word] of [
    ['#clearFileBtn', 'Main Page'],
    ['#shortcutsToggle', 'Keys'],
    ['#contrastToggle', 'HC'],
    ['#focusModeBtn', 'Full Screen'],
    ['#featuresGuideBtn', 'Help'],
    ['#publishProjectBtn', 'Publish'],
    ['#copySettingsLinkBtn', 'Copy Link'],
    ['#editDrawingActionBtn', 'Edit Drawing'],
  ]) {
    const name = await nameOf(page, selector);
    expect(name, `${selector} is named "${name}"`).toMatch(
      new RegExp(`^${word}\\b`)
    );
  }
});

test('Main Page warns about unsaved changes only when there are some', async ({
  page,
}) => {
  await openBox(page);
  expect(await nameOf(page, '#clearFileBtn')).toBe('Main Page');
  await page.evaluate(() => {
    const g = document.querySelector(
      '.param-group[data-group-id="Dimensions"]'
    );
    if (g) g.open = true;
  });
  await page.locator('#param-width-spinbox').fill('55');
  await page.locator('#param-width-spinbox').press('Enter');
  await expect
    .poll(() => nameOf(page, '#clearFileBtn'))
    .toMatch(/^Main Page\b.*unsaved/i);
});

test('the theme button says which theme is on; the mode switch its two options', async ({
  page,
}) => {
  await openBox(page);
  expect(await nameOf(page, '#themeToggle')).toMatch(
    /^Theme: (Auto|Light|Dark)$/
  );
  await page.locator('#themeToggle').click();
  expect(await nameOf(page, '#themeToggle')).toMatch(
    /^Theme: (Auto|Light|Dark)$/
  );

  const mode = page.locator('#uiModeToggle');
  expect(await nameOf(page, '#uiModeToggle')).toBe(
    'Interface mode: Simplified, Standard'
  );
  expect(await visibleWordsOf(page, '#uiModeToggle')).toBe(
    'Simplified Standard'
  );
  await expect(mode).toHaveAttribute('role', 'switch');
});

test('the logo is decorative and the title names the app at every width', async ({
  page,
}) => {
  await openBox(page);
  await expect(page.locator('.header-logo')).toHaveAttribute('alt', '');
  const heading = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('h1 *')]
        .filter(
          (el) =>
            el.getAttribute('aria-hidden') !== 'true' &&
            getComputedStyle(el).display !== 'none'
        )
        .map((el) => el.textContent.trim())
        .join(' ')
        .trim()
    );
  expect(await heading()).toBe('OpenSCAD Assistive Forge');
  await page.setViewportSize({ width: 412, height: 915 });
  await page.waitForTimeout(300);
  expect(await heading()).toBe('OpenSCAD Assistive Forge');
});

test('Help is not inside the "Workflow progress" landmark', async ({
  page,
}) => {
  await openBox(page);
  const inside = await page.evaluate(() =>
    Boolean(
      document
        .getElementById('featuresGuideBtn')
        ?.closest('[role="navigation"], nav, [role="region"], [role="toolbar"]')
    )
  );
  expect(inside).toBe(false);
});

test("the Main Page's controls are named by their visible words, first", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
  // The rule reads only text on screen: a window tall enough for the whole
  // Main Page, or the controls below the fold are never checked.
  await page.setViewportSize({ width: 1280, height: 4000 });
  await page.goto('/');
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 30_000 });
  const results = await new AxeBuilder({ page })
    .include('#welcomeScreen')
    .withRules(['label-content-name-mismatch'])
    .analyze();
  const named = results.violations.flatMap((v) =>
    v.nodes.map((n) => n.target.join(' '))
  );
  expect(named, `label-content-name-mismatch: ${named.join(', ')}`).toEqual([]);
});
