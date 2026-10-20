import { test, expect } from '@playwright/test';
import { skipWithoutWebGL } from './helpers/webgl.js';

// A game controller drives the interface as a keyboard would: in the Menus
// preset the right bumper steps to the next control and its focus ring
// shows, A presses the File menu's button, B closes the menu again, and the
// right trigger jumps to the next part of the window; the View button steps
// from the Camera preset, the default, to the next and says which one is
// on. The pad is a stand-in the page reads through navigator.getGamepads().

const WASM_READY_TIMEOUT = 180_000;

/** The standard mapping's indexes for the buttons these cases press. */
const BUTTON = { a: 0, b: 1, rb: 5, rt: 7, select: 8, home: 16 };

async function openWithPad(
  page,
  {
    preset = null,
    mode = 'standard',
    custom = null,
    besideJoystick = false,
    joyCon = null,
    joyConChoice = null,
  } = {}
) {
  await page.addInitScript(({ chosen, mode, custom, besideJoystick, joyCon, joyConChoice }) => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    localStorage.setItem('openscad-forge-theme', 'dark');
    localStorage.setItem(
      'openscad-forge-ui-mode',
      JSON.stringify({ mode, lastCustomMode: mode })
    );
    if (chosen || custom) {
      localStorage.setItem(
        'openscad-forge-gamepad-mapping',
        JSON.stringify({ preset: chosen ?? 'camera', custom })
      );
    }
    if (joyConChoice) {
      localStorage.setItem('openscad-forge-joycon', JSON.stringify(joyConChoice));
    }
    // As a browser listed Joy-Cons: the right one alone, or the two merged.
    const joyConShape = {
      right: {
        id: 'Wireless Gamepad (STANDARD GAMEPAD Vendor: 057e Product: 2007)',
        buttons: 17,
        axes: 2,
      },
      pair: {
        id: 'Joy-Con L+R (STANDARD GAMEPAD Vendor: 057e Product: 200e)',
        buttons: 22,
        axes: 4,
      },
    }[joyCon];
    window.__padButtons = Array.from(
      { length: joyConShape?.buttons ?? (besideJoystick ? 18 : 17) },
      () => ({
        pressed: false,
        touched: false,
        value: 0,
      })
    );
    const pad = {
      id:
        joyConShape?.id ??
        (besideJoystick
          ? 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'
          : 'Test pad (STANDARD GAMEPAD Vendor: 045e Product: 02ea)'),
      index: besideJoystick ? 2 : 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      axes: new Array(joyConShape?.axes ?? 4).fill(0),
      get buttons() {
        return window.__padButtons;
      },
    };
    // As a browser listed a PS5 pad beside a 3D mouse's virtual joystick:
    // the joystick first, not a standard gamepad.
    const joystick = {
      id: 'Unknown Gamepad (Vendor: beef Product: 046d)',
      index: 1,
      connected: true,
      mapping: '',
      timestamp: 0,
      axes: new Array(10).fill(0),
      buttons: Array.from({ length: 4 }, () => ({
        pressed: false,
        touched: false,
        value: 0,
      })),
    };
    const list = besideJoystick ? [null, joystick, pad, null] : [pad, null, null, null];
    Object.defineProperty(Navigator.prototype, 'getGamepads', {
      configurable: true,
      value: () => list,
    });
  }, { chosen: preset, mode, custom, besideJoystick, joyCon, joyConChoice });
  await page.goto('/?example=simple-box', { timeout: 60_000 });
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  await page
    .locator('.param-control')
    .first()
    .waitFor({ state: 'attached', timeout: 60_000 });
  const notNow = page.locator('#saveProjectNotNow');
  if (
    await notNow.waitFor({ state: 'visible', timeout: 3_000 }).then(
      () => true,
      () => false
    )
  ) {
    await notNow.click();
  }
  // Each listed pad announces itself; beside the joystick, in the order a
  // browser announced them, the pad first and the joystick after it.
  await page.evaluate(() => {
    const listed = navigator.getGamepads().filter(Boolean);
    for (const gamepad of listed.reverse()) {
      const e = new Event('gamepadconnected');
      e.gamepad = gamepad;
      window.dispatchEvent(e);
    }
  });
}

/** Press and release one button, a few frames each way. */
async function press(page, index) {
  await page.evaluate((i) => {
    window.__padButtons[i] = { pressed: true, touched: true, value: 1 };
  }, index);
  await page.waitForTimeout(120);
  await page.evaluate((i) => {
    window.__padButtons[i] = { pressed: false, touched: false, value: 0 };
  }, index);
  await page.waitForTimeout(120);
}

const activeId = (page) => page.evaluate(() => document.activeElement?.id);

/** What the page has said aloud, both of its live regions together. */
const said = (page) =>
  page.evaluate(() =>
    ['srAnnouncer', 'srAnnouncerAssertive']
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
  );

test.describe('A game controller drives the interface', () => {
  test('View steps from the Camera preset to the Customizer, to Menus and round again, saying which is on', async ({
    page,
  }) => {
    await openWithPad(page);
    await press(page, BUTTON.select);
    await expect.poll(() => said(page)).toContain('Customizer controls');
    await press(page, BUTTON.select);
    await expect.poll(() => said(page)).toContain('Menu controls');
    await press(page, BUTTON.select);
    await expect.poll(() => said(page)).toContain('Camera controls');
    // Preferences > Controller shows the preset the button chose.
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('openscad-forge-gamepad-mapping') ?? '{}')
    );
    expect(stored.preset).toBe('camera');
  });

  test('the right bumper steps to the next control, its ring showing', async ({
    page,
  }) => {
    await openWithPad(page, { preset: 'menus' });
    // Where Tab goes from the File menu's button is where the bumper goes.
    await page.locator('#fileMenuBtn').focus();
    await page.keyboard.press('Tab');
    const expected = await activeId(page);
    expect(expected).toBeTruthy();
    await page.locator('#fileMenuBtn').focus();
    await press(page, BUTTON.rb);
    expect(await activeId(page)).toBe(expected);
    const ring = await page.evaluate(() => {
      const el = document.activeElement;
      const style = getComputedStyle(el);
      return {
        source: el.getAttribute('data-focus-source'),
        outline: style.outlineStyle,
        width: parseFloat(style.outlineWidth),
      };
    });
    expect(ring.source).toBe('gamepad');
    expect(ring.outline).not.toBe('none');
    expect(ring.width).toBeGreaterThanOrEqual(2);
  });

  test('beside a 3D mouse joystick listed first, the PS5 pad still steps with its bumper', async ({
    page,
  }) => {
    await openWithPad(page, { preset: 'menus', besideJoystick: true });
    await page.locator('#fileMenuBtn').focus();
    await page.keyboard.press('Tab');
    const expected = await activeId(page);
    expect(expected).toBeTruthy();
    await page.locator('#fileMenuBtn').focus();
    await press(page, BUTTON.rb);
    expect(await activeId(page)).toBe(expected);
  });

  test('the Keys button on the controller opens Keys on its Controller tab', async ({
    page,
  }) => {
    await openWithPad(page, {
      custom: { activate: 'a', back: 'b', keys: 'home' },
    });
    await page.locator('#fileMenuBtn').focus();
    await press(page, BUTTON.home);
    await expect(page.locator('#shortcutsModal')).not.toHaveClass(/hidden/);
    await expect(page.locator('#keys-tab-controller')).toBeFocused();
    await expect(page.locator('#keysPanelController')).toBeVisible();
    await press(page, BUTTON.b);
    await expect(page.locator('#shortcutsModal')).toHaveClass(/hidden/);
    expect(await activeId(page)).toBe('fileMenuBtn');
  });

  test('A opens the File menu and B closes it', async ({ page }) => {
    await openWithPad(page);
    const file = page.locator('#fileMenuBtn');
    await file.focus();
    await press(page, BUTTON.a);
    await expect(file).toHaveAttribute('aria-expanded', 'true');
    await press(page, BUTTON.b);
    await expect(file).toHaveAttribute('aria-expanded', 'false');
    expect(await activeId(page)).toBe('fileMenuBtn');
  });

  test('the right trigger jumps from the preview to the camera panel', async ({
    page,
  }) => {
    await openWithPad(page, { preset: 'menus' });
    await skipWithoutWebGL(
      page,
      'no WebGL context: this browser draws no preview canvas to start from'
    );
    await page.locator('#previewContainer canvas').first().focus();
    await press(page, BUTTON.rt);
    const landed = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        inCamera: !!el?.closest('#cameraPanel, #cameraDrawer'),
        label: el?.getAttribute('aria-label') || el?.textContent?.trim(),
      };
    });
    expect(landed.inCamera, `landed on ${landed.label}`).toBe(true);
  });
});

/** Where focus is: its id, or its name when it has none, and its ring. */
const where = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return {
      id: el?.id || null,
      name: (el?.getAttribute('aria-label') || el?.textContent || '').trim(),
      inCustomizer: !!el?.closest('#paramPanel'),
      source: el?.getAttribute('data-focus-source') ?? null,
    };
  });

test.describe('Joy-Cons', () => {
  test('one Joy-Con connecting the first time asks how it is held, and keeps the answer', async ({
    page,
  }) => {
    await openWithPad(page, { joyCon: 'right' });
    const ask = page.locator('#joyConHoldModal');
    await expect(ask).toBeVisible();
    await expect(page.locator('#joyConHoldTitle')).toHaveText(
      'How do you hold the Joy-Con?'
    );
    await ask.getByRole('button', { name: 'Sideways, SL and SR on top' }).click();
    await expect(ask).toBeHidden();
    const kept = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('openscad-forge-joycon') ?? '{}')
    );
    expect(kept).toEqual({ hold: 'sideways', pair: null });
    await expect(page.locator('#prefsJoyConHold')).toHaveValue('sideways');
  });

  test('the two together ask how they are used', async ({ page }) => {
    await openWithPad(page, { joyCon: 'pair' });
    const ask = page.locator('#joyConPairModal');
    await expect(ask).toBeVisible();
    for (const name of [
      'Close',
      'Together, as one controller',
      'Left only, held sideways',
      'Right only, held sideways',
      'Separately: left for the Customizer, right for the camera',
    ]) {
      await expect(ask.getByRole('button', { name, exact: true })).toBeVisible();
    }
  });

  test('held sideways, the trigger presses the control that has focus and the side button goes back', async ({
    page,
  }) => {
    await openWithPad(page, {
      joyCon: 'right',
      joyConChoice: { hold: 'sideways', pair: null },
    });
    await expect(page.locator('#joyConHoldModal')).toBeHidden();
    const file = page.locator('#fileMenuBtn');
    await file.focus();
    // ZR is button 7 and R button 8 on a right Joy-Con alone.
    await press(page, 7);
    await expect(file).toHaveAttribute('aria-expanded', 'true');
    await press(page, 8);
    await expect(file).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('The right trigger reaches every part of the window', () => {
  test('the theme row and Preview Settings in their turn, and the Customizer past its own toggle', async ({
    page,
  }) => {
    await openWithPad(page, { preset: 'menus' });
    await page.locator('#fileMenuBtn').focus();
    await press(page, BUTTON.rt);
    expect((await where(page)).id, 'the theme row').toBe('contrastToggle');
    await press(page, BUTTON.rt);
    const customizer = await where(page);
    expect(customizer.id, 'the Customizer, past Collapse').toBe(
      'expertModeToggle'
    );
    expect(customizer.source).toBe('gamepad');
    await press(page, BUTTON.rt);
    expect((await where(page)).id, 'Preview Settings').toBe(
      'previewDrawerToggle'
    );
  });

  test('in Simplified the Customizer opens on its first action too', async ({
    page,
  }) => {
    await openWithPad(page, { preset: 'menus', mode: 'simplified' });
    await page.locator('#contrastToggle').focus();
    await press(page, BUTTON.rt);
    const landed = await where(page);
    expect(landed.inCustomizer).toBe(true);
    expect(landed.id, 'not the Collapse button').not.toBe(
      'collapseParamPanelBtn'
    );
    expect(landed.name).toMatch(/^About Presets/);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 412, height: 915 }, hasTouch: true });

    test('with the Customizer open, it lands past the sheet\'s close button', async ({
      page,
    }) => {
      await openWithPad(page, { preset: 'menus' });
      await page.locator('#mobileDrawerToggle').click();
      await expect(page.locator('#mobileDrawerToggle')).toHaveAttribute(
        'aria-expanded',
        'true'
      );
      await page.locator('#fileMenuBtn').focus();
      await press(page, BUTTON.rt);
      const landed = await where(page);
      expect(landed.inCustomizer).toBe(true);
      expect(landed.id, 'past Close customizer panel').toBe(
        'expertModeToggle'
      );
    });
  });
});

const DPAD_DOWN = 13;

/** The focused control's box against the screen and the panel's title. */
const placeOfFocused = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    const r = el.getBoundingClientRect();
    const title = el.closest('#paramPanel')?.querySelector('.panel-header');
    return {
      tag: el.tagName.toLowerCase(),
      closedHeader: el.tagName === 'SUMMARY' && !el.parentElement.open,
      onScreen: r.top >= 0 && r.bottom <= innerHeight && r.width > 0,
      clearOfTitle: title ? r.top >= title.getBoundingClientRect().bottom - 0.5 : true,
      name: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40),
    };
  });

/**
 * The share of the pixels just inside the top edge of a box, read from a
 * picture at twice the size, that are the focus ring's color.
 */
async function ringShareOnTopEdge(page, box) {
  const png = await page.screenshot({
    clip: { x: box.x, y: box.y, width: box.width, height: 6 },
  });
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    const probe = document.createElement('div');
    probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--color-focus');
    document.body.append(probe);
    const [fr, fg, fb] = getComputedStyle(probe).color.match(/\d+/g).map(Number);
    probe.remove();
    // The rows a 3 px ring drawn inside the edge covers at twice the size.
    const { data, width } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    let ring = 0;
    let all = 0;
    for (const y of [2, 3, 4]) {
      for (let x = 8; x < width - 8; x++) {
        const i = (y * width + x) * 4;
        all += 1;
        if (Math.abs(data[i] - fr) + Math.abs(data[i + 1] - fg) + Math.abs(data[i + 2] - fb) < 60) ring += 1;
      }
    }
    return ring / all;
  }, png.toString('base64'));
}

test.describe('Up and Down on controls that take no arrows', () => {
  test.use({ deviceScaleFactor: 2 });

  test('the D-pad walks the Customizer to a closed group, A opens it, and Down reaches its first control, in view', async ({
    page,
  }) => {
    await openWithPad(page, { preset: 'menus' });
    await page.locator('#expertModeToggle').focus();
    let header = null;
    for (let n = 0; n < 10 && !header; n++) {
      await press(page, DPAD_DOWN);
      const place = await placeOfFocused(page);
      if (place.closedHeader) header = place;
    }
    expect(header, 'a closed group header reached by Down').not.toBeNull();
    expect(header.onScreen).toBe(true);
    expect(header.clearOfTitle).toBe(true);
    await press(page, BUTTON.a);
    await expect
      .poll(() => page.evaluate(() => document.activeElement.parentElement.open))
      .toBe(true);
    await press(page, DPAD_DOWN);
    const first = await placeOfFocused(page);
    expect(first.tag, `the group's first control: ${first.name}`).not.toBe('summary');
    expect(first.onScreen).toBe(true);
    expect(first.clearOfTitle).toBe(true);
  });

  test('a closed group header shows its focus ring, from Tab and from the pad', async ({
    page,
  }) => {
    await openWithPad(page, { preset: 'menus' });
    const dimensions = page.locator('#paramPanel details.param-group:not([open]) > summary').first();
    const hide = page.locator('#paramPanel .param-group').first().locator('xpath=preceding::button[1]');
    await dimensions.scrollIntoViewIfNeeded();
    // From Tab: the button before the header, then Tab.
    await hide.focus();
    await page.keyboard.press('Tab');
    await expect(dimensions).toBeFocused();
    const box = await dimensions.boundingBox();
    expect(await ringShareOnTopEdge(page, box), 'from Tab').toBeGreaterThan(0.5);
    // From the pad: the same button, then the bumper.
    await hide.focus();
    await press(page, BUTTON.rb);
    await expect(dimensions).toBeFocused();
    expect(await dimensions.getAttribute('data-focus-source')).toBe('gamepad');
    expect(await ringShareOnTopEdge(page, await dimensions.boundingBox()), 'from the pad').toBeGreaterThan(0.5);
  });
});
