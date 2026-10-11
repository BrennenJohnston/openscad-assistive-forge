/**
 * Classic's controls, as a screen reader meets them: each pane separator
 * says its real share from the start; the "A. Forge" button is named by its
 * words; Play has one state signal; a font radio says its style; a slider
 * says its value with its unit.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';

test.describe.configure({ timeout: 180_000 });

test.use({ viewport: { width: 1400, height: 900 } });

async function openClassic(page) {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
  await page.goto('/?example=simple-box');
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-current/,
    { timeout: 120_000 }
  );
  await page.locator('#classicModeToggle').click();
  await expect(page.locator('body')).toHaveAttribute(
    'data-ui-mode',
    'classic',
    {
      timeout: 30_000,
    }
  );
  // Standard: the Window menu, the editor pane and the separators live there.
  const density = page.locator('#classicDensityToggle');
  await expect(density).toBeVisible({ timeout: 10_000 });
  if ((await density.getAttribute('aria-checked')) !== 'true') {
    await density.click();
  }
  await expect(page.locator('body')).toHaveAttribute(
    'data-classic-density',
    'standard'
  );
}

test('each pane separator says its real share from the start', async ({
  page,
}) => {
  await openClassic(page);
  for (const [id, word] of [
    ['#classicResizerEditor', 'Editor'],
    ['#classicResizerCustomizer', 'Customizer'],
    ['#classicResizerStrip', 'Bottom panels'],
  ]) {
    const sep = page.locator(id);
    await expect(sep).toHaveAttribute(
      'aria-valuetext',
      new RegExp(`^${word}: [1-9]\\d*%$`)
    );
  }
});

test('A. Forge is named by its words, with no pressed state', async ({
  page,
}) => {
  await openClassic(page);
  const btn = page.locator('#classicModeToggle');
  await expect(btn).toHaveAttribute('aria-label', 'A. Forge');
  await expect(btn).not.toHaveAttribute('aria-pressed', /.*/);
  const describedBy = await btn.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`#${describedBy}`)).toHaveText(
    'Switch to the Assistive Forge interface'
  );
});

test('Play says its action and carries no pressed state', async ({ page }) => {
  await openClassic(page);
  await page.locator('#windowMenuBtn').click();
  await page.getByRole('menuitemcheckbox', { name: 'Animate' }).click();
  const play = page.locator('#animatePlayBtn');
  await expect(play).toBeVisible();
  await expect(play).toHaveAttribute('aria-label', 'Play animation');
  await expect(play).not.toHaveAttribute('aria-pressed', /.*/);
  await play.click();
  await expect(play).toHaveAttribute('aria-label', 'Pause animation');
  await expect(play).not.toHaveAttribute('aria-pressed', /.*/);
  await play.click();
});

test('font radios say their style; sliders say their value with its unit', async ({
  page,
}) => {
  await openClassic(page);
  await page.locator('#windowMenuBtn').click();
  await page.getByRole('menuitemcheckbox', { name: 'Font List' }).click();
  await expect(
    page.getByRole('radio', { name: 'Liberation Sans Bold' })
  ).toBeVisible();
  await expect(
    page.getByRole('radio', { name: 'Liberation Sans Italic' })
  ).toBeVisible();

  for (const id of ['modelOpacityInput', 'brightnessInput', 'contrastInput']) {
    const slider = page.locator(`#${id}`);
    const value = await slider.inputValue();
    await expect(slider).toHaveAttribute('aria-valuetext', `${value}%`);
  }
});
