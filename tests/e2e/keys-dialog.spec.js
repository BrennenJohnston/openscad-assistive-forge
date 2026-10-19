import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { skipWithoutWebGL } from './helpers/webgl.js';

// Keys holds the keyboard shortcuts and the controller in two tabs and
// scrolls in one place. The Controller tab's table and Change work as they
// did in Preferences, and its readout names the pad and what is pressed.
// The pad is a stand-in the page reads through navigator.getGamepads().

const WASM_READY_TIMEOUT = 180_000;
const PAD_ID = 'Test pad (STANDARD GAMEPAD Vendor: 045e Product: 02ea)';

async function openApp(page, { pad = true } = {}) {
  await page.addInitScript(
    ({ pad, id }) => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
      window.__padButtons = Array.from({ length: 17 }, () => ({
        pressed: false,
        touched: false,
        value: 0,
      }));
      window.__padAxes = [0, 0, 0, 0];
      const stand = {
        id,
        index: 0,
        connected: true,
        mapping: 'standard',
        timestamp: 0,
        get axes() {
          return window.__padAxes;
        },
        get buttons() {
          return window.__padButtons;
        },
      };
      Object.defineProperty(Navigator.prototype, 'getGamepads', {
        configurable: true,
        value: () => (pad ? [stand, null, null, null] : []),
      });
      // A real pad on the test machine stays out of a case without one.
      if (!pad) {
        window.addEventListener(
          'gamepadconnected',
          (event) => event.stopImmediatePropagation(),
          true
        );
      }
    },
    { pad, id: PAD_ID }
  );
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  if (pad) {
    await page.evaluate(() => {
      const e = new Event('gamepadconnected');
      e.gamepad = navigator.getGamepads()[0];
      window.dispatchEvent(e);
    });
  }
}

async function openKeys(page) {
  await page.locator('#shortcutsToggle').click();
  await expect(page.locator('#shortcutsModal')).not.toHaveClass(/hidden/);
  await expect(
    page.locator('#shortcutsModal .shortcut-item').first()
  ).toBeVisible();
}

const controllerTab = (page) => page.locator('#keys-tab-controller');
const keyboardTab = (page) => page.locator('#keys-tab-keyboard');

/** The dialog's box and its body: whether each scrolls. */
const scrollState = (page) =>
  page.evaluate(() => {
    const box = document.querySelector('#shortcutsModal .modal-content');
    const body = document.querySelector('#shortcutsModal .shortcuts-modal-body');
    return {
      box: [box.scrollHeight, box.clientHeight],
      body: [body.scrollHeight, body.clientHeight],
    };
  });

/** What the page has said aloud, both of its live regions together. */
const said = (page) =>
  page.evaluate(() =>
    ['srAnnouncer', 'srAnnouncerAssertive']
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
  );

async function hold(page, index, pressed) {
  await page.evaluate(
    ({ i, on }) => {
      window.__padButtons[i] = { pressed: on, touched: on, value: on ? 1 : 0 };
    },
    { i: index, on: pressed }
  );
}

async function axeViolations(page) {
  const results = await new AxeBuilder({ page })
    .options({ rules: { 'label-content-name-mismatch': { enabled: true } } })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .include('#shortcutsModal')
    .analyze();
  return results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`
  );
}

test.describe('Keys', () => {
  for (const size of [
    { width: 1280, height: 720 },
    { width: 412, height: 915 },
  ]) {
    test(`scrolls in one place at ${size.width} x ${size.height}, on both tabs`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await page.setViewportSize(size);
      await openApp(page);
      await openKeys(page);
      const keyboard = await scrollState(page);
      expect(keyboard.box[0], "the dialog's own scroll").toBe(keyboard.box[1]);
      expect(keyboard.body[0], 'the body').toBeGreaterThanOrEqual(
        keyboard.body[1]
      );
      await controllerTab(page).click();
      const controller = await scrollState(page);
      expect(controller.box[0], "Controller: the dialog's own scroll").toBe(
        controller.box[1]
      );
      expect(controller.body[0], 'Controller: the body').toBeGreaterThanOrEqual(
        controller.body[1]
      );
      const footer = await page
        .locator('#shortcutsModalDone')
        .evaluate((done) => {
          const r = done.getBoundingClientRect();
          return r.bottom <= window.innerHeight && r.top >= 0;
        });
      expect(footer, 'Done on screen').toBe(true);
    });
  }

  test('opens on Keyboard with focus on its tab, and the tabs answer the arrows, Home and End', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openApp(page);
    await openKeys(page);
    await expect(page.locator('#shortcutsModalTitle')).toHaveText('Keys');
    await expect(page.locator('#shortcutsToggle')).toHaveAccessibleName(
      'Keys: keyboard and controller'
    );
    await expect(keyboardTab(page)).toBeFocused();
    await expect(keyboardTab(page)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(controllerTab(page)).toBeFocused();
    await expect(controllerTab(page)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#keysPanelController')).toBeVisible();
    await expect(page.locator('#keysPanelKeyboard')).toBeHidden();
    await page.keyboard.press('ArrowRight');
    await expect(keyboardTab(page)).toBeFocused();
    await page.keyboard.press('End');
    await expect(controllerTab(page)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(keyboardTab(page)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(controllerTab(page)).toHaveAttribute('aria-selected', 'true');
    // Reset All belongs to the Keyboard tab.
    await expect(page.locator('#shortcutsResetAll')).toBeHidden();
  });

  test('the Controller tab says what it sees when no controller is attached', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openApp(page, { pad: false });
    await openKeys(page);
    await controllerTab(page).click();
    await expect(page.locator('#prefsGamepadStatus')).toHaveText(
      'No controller detected. Connect one and press any button.'
    );
    await expect(page.locator('#prefsGamepadAssignments tbody tr')).toHaveCount(
      29
    );
    await expect(page.locator('#controllerReadoutPad')).toBeHidden();
    // A fresh profile has not found the game: its section stays hidden.
    await expect(page.locator('#keysWalkSection')).toBeHidden();
  });

  test('a button changed in the Controller tab is kept after a reload', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const openController = async () => {
      await openApp(page);
      await openKeys(page);
      await controllerTab(page).click();
    };
    const buttonOf = (action) =>
      page.locator(`#prefsGamepadInput-${action}`).textContent();

    await openController();
    await expect(page.locator('#prefsGamepadStatus')).toHaveText(
      'Controller detected: Test pad.'
    );
    await expect(page.locator('#prefsGamepadFamily')).toHaveValue('xbox');
    expect(await buttonOf('activate')).toBe('A');

    const change = page.locator('#prefsGamepadChange-activate');
    await expect(change).toHaveAccessibleName('Change Activate');
    await change.click();
    await expect(page.locator('#prefsGamepadInput-activate')).toHaveText(
      'Press a button on your controller. Esc cancels.'
    );
    await hold(page, 2, true);
    await expect(page.locator('#prefsGamepadInput-activate')).toHaveText('X');
    await hold(page, 2, false);
    // X was Reset View's in the Camera preset, the default: the two swap.
    expect(await buttonOf('resetView')).toBe('A');

    await openController();
    expect(await buttonOf('activate')).toBe('X');
    expect(await buttonOf('resetView')).toBe('A');

    await page.locator('#prefsGamepadReset').click();
    expect(await buttonOf('activate')).toBe('A');
  });

  test('the readout names the pad and a press; during a test B is only shown and spoken', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openApp(page);
    await openKeys(page);
    await controllerTab(page).click();
    await expect(page.locator('#controllerReadoutPad')).toHaveText(
      `${PAD_ID}: mapping standard, 17 buttons, 4 axes.`
    );
    await expect(page.locator('#controllerReadoutPress')).toHaveText(
      'Nothing pressed.'
    );
    await page.evaluate(() => {
      window.__padAxes = [0.1, -0.98, 0, 0];
    });
    await expect(page.locator('#controllerReadoutPress')).toHaveText(
      'Pressed: Left stick 0.10, -0.98.'
    );
    await page.evaluate(() => {
      window.__padAxes = [0, 0, 0, 0];
    });

    const start = page.locator('#controllerReadoutTest');
    await start.click();
    await expect(start).toHaveText('Stop the test');
    await expect.poll(() => said(page)).toContain('Test started.');
    await hold(page, 1, true);
    await expect(page.locator('#controllerReadoutPress')).toHaveText(
      'Pressed: B [1].'
    );
    await expect.poll(() => said(page)).toContain('Pressed: B [1].');
    await hold(page, 1, false);
    await page.waitForTimeout(300);
    await expect(page.locator('#shortcutsModal')).not.toHaveClass(/hidden/);
    await start.click();
    await expect(start).toHaveText('Start the test');

    // Outside a test, B is Back again and closes the dialog.
    await controllerTab(page).focus();
    await hold(page, 1, true);
    await page.waitForTimeout(120);
    await hold(page, 1, false);
    await expect(page.locator('#shortcutsModal')).toHaveClass(/hidden/);
  });

  test('in the alternative look the selected tab still looks selected', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
      localStorage.setItem('openscad-customizer-hfm-unlock', 'true');
      localStorage.setItem('openscad-forge-theme', 'dark');
    });
    await page.goto('/?example=simple-box');
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });
    await skipWithoutWebGL(
      page,
      'no WebGL context: the alternative look does not start'
    );
    await page.locator('#_hfmToggle').click();
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-ui-variant') === 'mono'
    );
    await openKeys(page);
    await page.mouse.move(5, 5);
    const look = (tab) =>
      tab.evaluate((el) => {
        const s = getComputedStyle(el);
        return [
          s.borderBottomWidth,
          s.borderBottomColor,
          s.backgroundColor,
          s.color,
        ].join(' ');
      });
    expect(await look(keyboardTab(page))).not.toBe(
      await look(controllerTab(page))
    );
    await controllerTab(page).click();
    await page.mouse.move(5, 5);
    expect(await look(controllerTab(page))).not.toBe(
      await look(keyboardTab(page))
    );
  });

  test('both tabs pass the WCAG 2.2 A and AA rules', async ({ page }) => {
    test.setTimeout(240_000);
    await openApp(page);
    await openKeys(page);
    expect(await axeViolations(page)).toEqual([]);
    await controllerTab(page).click();
    await expect(page.locator('#controllerReadoutPress')).toHaveText(
      'Nothing pressed.'
    );
    expect(await axeViolations(page)).toEqual([]);
  });
});
