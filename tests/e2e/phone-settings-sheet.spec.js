import { test, expect } from '@playwright/test';
import {
  alphaOf,
  LOOKS,
  openPhoneProject,
  readPreviewBox,
  readSettingsSheet,
  reloadPhoneProject,
  WASM_READY_TIMEOUT,
} from './helpers/phone-sheets.js';

// Preview Settings & Info on a phone held upright (S6 in docs/specs/
// UI_STANDARDS.md, "Drawers, sheets and menus: the schema"): a sheet over
// the preview from under the status line, see-through, as tall as its
// controls at first (at most 40 percent of the screen) and then as tall as
// the grip on its bottom edge is dragged or keyed; the height is kept
// across a close and a reload, and the preview keeps its full size behind
// it. Its own file beside ui-schema.spec.js, which the lane planner's shard
// budget could not hold these cases in.

for (const height of [915, 810]) {
  for (const look of LOOKS) {
    test.describe(`The Preview Settings sheet, 412 x ${height}, ${look.name}`, () => {
      // No isMobile: Firefox rejects it when the browser context is created.
      test.use({ viewport: { width: 412, height }, hasTouch: true });

      test('S6: Preview Settings opens over the preview, see-through, at a height that is kept', async ({
        page,
      }) => {
        test.setTimeout(WASM_READY_TIMEOUT * 2 + 90_000);
        await openPhoneProject(page, look);
        await page.waitForTimeout(500);
        const settings = page.locator('#previewDrawerToggle');
        const sheetSettled = async () => {
          await page
            .locator('#previewInfoContent')
            .evaluate((el) =>
              Promise.all(
                el.getAnimations().map((a) => a.finished.catch(() => {}))
              )
            );
          await page.waitForTimeout(300);
        };
        const openSettings = async () => {
          await settings.focus();
          await page.keyboard.press('Enter');
          await expect(settings).toHaveAttribute('aria-expanded', 'true');
          await sheetSettled();
        };
        const closeSettings = async () => {
          await settings.focus();
          await page.keyboard.press('Enter');
          await expect(settings).toHaveAttribute('aria-expanded', 'false');
          await sheetSettled();
        };

        const before = await page.evaluate(readPreviewBox);
        await openSettings();
        const s = await page.evaluate(readSettingsSheet);
        const after = await page.evaluate(readPreviewBox);
        expect
          .soft(
            Math.abs(after.width - before.width) +
              Math.abs(after.height - before.height),
            `S6: the preview keeps its size behind it (${before.width} x ${before.height} closed, ${after.width} x ${after.height} open)`
          )
          .toBeLessThanOrEqual(2);
        expect
          .soft(s.position, 'S6: the sheet lies over the preview')
          .toBe('fixed');
        expect
          .soft(
            s.top + 0.5,
            `it starts under the status line (y ${Math.round(s.top)}, the line ends at ${Math.round(s.statusBottom)})`
          )
          .toBeGreaterThanOrEqual(s.statusBottom);
        expect
          .soft(s.statusCovered, 'the status line stays in view')
          .toBe(false);
        expect
          .soft(
            s.height,
            `S6: at its first open the sheet is ${Math.round(s.height)} px of a ${s.viewportHeight} px screen`
          )
          .toBeLessThanOrEqual(0.4 * s.viewportHeight + 1);
        expect
          .soft(
            s.bottom,
            `it ends above the bar (${Math.round(s.bottom)} and ${Math.round(s.barTop)})`
          )
          .toBeLessThanOrEqual(s.barTop + 1);
        if (look.highContrast) {
          expect
            .soft(
              alphaOf(s.background),
              `high contrast keeps it solid (${s.background})`
            )
            .toBe(1);
        } else {
          expect
            .soft(alphaOf(s.background), `S6: see-through (${s.background})`)
            .toBeLessThan(1);
          expect
            .soft(
              s.blurred,
              `S6: what is behind it is blurred (${s.backdrop || 'none'})`
            )
            .toBe(true);
        }

        const g = s.grip;
        expect.soft(g, "S6: a grip on the sheet's bottom edge").not.toBeNull();
        if (!g) {
          await closeSettings();
          return;
        }
        expect.soft(g.role, 'the grip is a separator').toBe('separator');
        expect
          .soft(g.orientation, 'the grip moves up and down')
          .toBe('horizontal');
        expect
          .soft(g.name, 'the grip has a name')
          .toBe('Resize the Preview Settings');
        expect
          .soft(g.text, 'the grip says its height')
          .toMatch(/^Preview Settings \d+% of the screen's height$/);
        expect
          .soft(g.height, `the grip is ${Math.round(g.height)} px tall`)
          .toBeGreaterThanOrEqual(43.5);
        expect
          .soft(
            g.width,
            `the grip spans the screen (${Math.round(g.width)} of ${s.viewportWidth})`
          )
          .toBeGreaterThanOrEqual(s.viewportWidth - 1);
        expect
          .soft(
            Math.abs(g.centerY - s.bottom),
            'the grip sits on the bottom edge'
          )
          .toBeLessThanOrEqual(g.height / 2 + 1);

        // The keys: Home the least, End the most (the bar's top), the arrows
        // 2 percent of the screen's height a step and 5 with Shift.
        const grip = page.locator('#settingsHeightGrip');
        const sheet = () => page.evaluate(readSettingsSheet);
        await grip.focus();
        await page.keyboard.press('Home');
        await page.waitForTimeout(200);
        const least = await sheet();
        expect
          .soft(least.grip.now, 'Home takes it to its least')
          .toBe(least.grip.min);
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(200);
        const step = await sheet();
        expect
          .soft(
            Math.abs(step.height - least.height - 0.02 * s.viewportHeight),
            `ArrowDown grows it by 2 percent of ${s.viewportHeight} px (${Math.round(step.height - least.height)})`
          )
          .toBeLessThanOrEqual(1.5);
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(200);
        const big = await sheet();
        expect
          .soft(
            Math.abs(big.height - step.height - 0.05 * s.viewportHeight),
            `Shift+ArrowDown grows it by 5 percent (${Math.round(big.height - step.height)})`
          )
          .toBeLessThanOrEqual(1.5);
        await page.keyboard.press('End');
        await page.waitForTimeout(200);
        const most = await sheet();
        expect
          .soft(most.grip.now, 'End takes it to its most')
          .toBe(most.grip.max);
        expect
          .soft(
            Math.abs(most.bottom - most.barTop),
            `at its most it ends at the bar (${Math.round(most.bottom)} and ${Math.round(most.barTop)})`
          )
          .toBeLessThanOrEqual(1);
        expect
          .soft(most.statusCovered, 'the status line stays in view at its most')
          .toBe(false);

        // A drag of 100 px up from there, taken inside the sheet's half of
        // the grip (its other half lies under the bar at the ceiling).
        await page.mouse.move(most.grip.centerX, most.grip.centerY - 8);
        await page.mouse.down();
        await page.mouse.move(most.grip.centerX, most.grip.centerY - 108, {
          steps: 10,
        });
        await page.mouse.up();
        await page.waitForTimeout(300);
        const dragged = await sheet();
        expect
          .soft(
            Math.abs(most.height - 100 - dragged.height),
            `a drag of 100 px makes it 100 px shorter (${Math.round(most.height)} to ${Math.round(dragged.height)})`
          )
          .toBeLessThanOrEqual(2);

        // The height is kept when it opens again and after a reload.
        await closeSettings();
        await openSettings();
        const again = await sheet();
        expect
          .soft(
            Math.abs(again.height - dragged.height),
            `the height kept when it opens again (${Math.round(dragged.height)} and ${Math.round(again.height)} px)`
          )
          .toBeLessThanOrEqual(1);
        await closeSettings();
        await reloadPhoneProject(page, look);
        await openSettings();
        const reloaded = await sheet();
        expect
          .soft(
            Math.abs(reloaded.height - dragged.height),
            `the height kept after a reload (${Math.round(dragged.height)} and ${Math.round(reloaded.height)} px)`
          )
          .toBeLessThanOrEqual(1);

        // Escape in the sheet closes it and puts focus back on its button.
        await grip.focus();
        await page.keyboard.press('Escape');
        await expect(settings).toHaveAttribute('aria-expanded', 'false');
        await expect(settings).toBeFocused();
      });
    });
  }
}
