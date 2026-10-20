/**
 * Keys ▸ Controller: the status sentence, the layout and preset pickers, the
 * list of actions, each with its button and a Change button that waits for
 * one press and assigns it, and the readout of what the browser reads from
 * the pad, with a test that takes each press for itself.
 *
 * @license GPL-3.0-or-later
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  formatGamepadStatus,
  initControllerPanel,
  readoutPadLine,
  readoutParts,
  readoutPressLine,
  syncControllerPanel,
  _resetControllerPanelForTests,
} from '../../src/js/controller-panel.js';
import {
  createGamepadMapping,
  createWalkMapping,
} from '../../src/js/gamepad-controller.js';

const INDEX = readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
const XBOX = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)';

/** A pad as the browser lists it: 17 buttons and 4 axes, all at rest. */
function stubPad({ id = XBOX, mapping = 'standard', buttons = 17, axes = 4 } = {}) {
  return {
    id,
    index: 0,
    connected: true,
    mapping,
    buttons: Array.from({ length: buttons }, () => ({ pressed: false, value: 0 })),
    axes: Array.from({ length: axes }, () => 0),
  };
}

describe('formatGamepadStatus', () => {
  it('reports an unsupported browser, including when no status exists', () => {
    const unsupported = 'This browser does not offer game controller input.';
    expect(formatGamepadStatus(undefined)).toBe(unsupported);
    expect(formatGamepadStatus(null)).toBe(unsupported);
    expect(formatGamepadStatus({ supported: false, padName: null })).toBe(
      unsupported
    );
  });

  it('invites connecting when the API exists but no pad is seen', () => {
    expect(formatGamepadStatus({ supported: true, padName: null })).toBe(
      'No controller detected. Connect one and press any button.'
    );
  });

  it('names the detected pad, and nothing about a dead zone', () => {
    expect(
      formatGamepadStatus({
        supported: true,
        padName: 'Xbox Wireless Controller',
        deadZone: 0.15,
      })
    ).toBe('Controller detected: Xbox Wireless Controller.');
  });
});

describe('the readout lines', () => {
  it('name the pad as the browser reports it', () => {
    expect(readoutPadLine(stubPad())).toBe(
      `${XBOX}: mapping standard, 17 buttons, 4 axes.`
    );
    expect(
      readoutPadLine(stubPad({ id: 'Wireless Controller', mapping: '', buttons: 18, axes: 6 }))
    ).toBe('Wireless Controller: mapping not standard, 18 buttons, 6 axes.');
  });

  it('name each held part by the layout, with its index, a trigger value and a stick', () => {
    const pad = stubPad({ buttons: 18, axes: 6 });
    pad.buttons[0] = { pressed: true, value: 1 };
    pad.buttons[7] = { pressed: true, value: 0.537 };
    pad.buttons[17] = { pressed: true, value: 1 };
    pad.axes[0] = 0.1;
    pad.axes[1] = -0.98;
    pad.axes[2] = 0.05;
    pad.axes[4] = -1;
    const parts = readoutParts(pad, 'playstation');
    expect(readoutPressLine(parts)).toBe(
      'Pressed: Cross [0], R2 [7] 0.54, Button [17], Left stick 0.10, -0.98, Axis [4] -1.00.'
    );
    expect(parts.map((part) => part.id)).toEqual(['b0', 'b7', 'b17', 'ls', 'a4']);
    expect(readoutPressLine(readoutParts(stubPad(), 'xbox'))).toBe('Nothing pressed.');
  });
});

describe('the Controller tab', () => {
  let mapping;
  let walkMapping;
  let capture;
  let pending;
  let announce;
  let cancelCapture;
  let originalRects;
  let frames;
  let pads;

  function mount() {
    const doc = new DOMParser().parseFromString(INDEX, 'text/html');
    document.body.innerHTML = '';
    document.body.append(
      document.importNode(doc.getElementById('shortcutsModal'), true)
    );
  }

  /** Open Keys on its Controller tab, as the app's opener does. */
  function open() {
    document.getElementById('shortcutsModal').classList.remove('hidden');
    const keyboard = document.getElementById('keysPanelKeyboard');
    const controller = document.getElementById('keysPanelController');
    if (keyboard) keyboard.hidden = true;
    if (controller) controller.hidden = false;
    syncControllerPanel();
  }

  /** Run the readout's waiting frame at `now` milliseconds. */
  function frame(now) {
    const queued = frames;
    frames = [];
    for (const callback of queued) callback(now);
  }

  beforeEach(() => {
    localStorage.clear();
    mount();
    _resetControllerPanelForTests();
    // jsdom lays nothing out: every element counts as having a box here.
    originalRects = Element.prototype.getClientRects;
    Element.prototype.getClientRects = function () {
      return [{ width: 10, height: 10 }];
    };
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {
      frames = [];
    });
    pads = [null, null, null, null];
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => pads,
    });
    mapping = createGamepadMapping({ getPadId: () => XBOX });
    walkMapping = createWalkMapping({ getPadId: () => XBOX });
    pending = null;
    // As the controller's own wait does: a new wait ends the one before.
    capture = vi.fn(() => {
      pending?.(null);
      return new Promise((resolve) => {
        pending = resolve;
      });
    });
    cancelCapture = vi.fn(() => pending?.(null));
    announce = vi.fn();
    initControllerPanel({
      getGamepadStatus: () => ({
        supported: true,
        padName: 'Xbox Wireless Controller',
      }),
      gamepad: { mapping, capture, cancelCapture, announce },
      walkMapping,
    });
    open();
  });

  afterEach(() => {
    _resetControllerPanelForTests();
    Element.prototype.getClientRects = originalRects;
    vi.unstubAllGlobals();
    delete navigator.getGamepads;
    document.body.innerHTML = '';
    document.body.style.overflow = '';
  });

  const row = (action) =>
    document.querySelector(
      `#prefsGamepadAssignments tr[data-action="${action}"]`
    );
  const buttonOf = (action) =>
    row(action).querySelector('.gamepad-input').textContent.trim();
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const text = (id) => document.getElementById(id).textContent.trim();

  it('is the Keys dialog second tab, beside Keyboard', () => {
    const tabs = [...document.querySelectorAll('#keysTablist [role="tab"]')];
    expect(tabs.map((t) => t.textContent.trim())).toEqual([
      'Keyboard',
      'Controller',
    ]);
    expect(tabs[1].getAttribute('aria-controls')).toBe('keysPanelController');
    expect(
      document
        .getElementById('keysPanelController')
        .contains(document.getElementById('prefsGamepadAssignments'))
    ).toBe(true);
  });

  it('shows the status, the layout, the preset, and every action with its button', () => {
    expect(text('prefsGamepadStatus')).toBe(
      'Controller detected: Xbox Wireless Controller.'
    );
    expect(document.getElementById('prefsGamepadFamily').value).toBe('xbox');
    expect(document.getElementById('prefsGamepadPreset').value).toBe('camera');
    const rows = document.querySelectorAll('#prefsGamepadAssignments tbody tr');
    expect(rows).toHaveLength(29);
    expect(row('previous').querySelector('th').textContent.trim()).toBe(
      'Previous control'
    );
    expect(buttonOf('previous')).toBe('Not assigned');
    expect(buttonOf('nextView')).toBe('RB');
    expect(buttonOf('resetView')).toBe('X');
    expect(buttonOf('nextPreset')).toBe('View');
    const change = row('activate').querySelector('button');
    expect(change.textContent.trim()).toBe('Change');
    // Its name says which action it changes.
    const name = change
      .getAttribute('aria-labelledby')
      .split(' ')
      .map((id) => document.getElementById(id).textContent.trim())
      .join(' ');
    expect(name).toBe('Change Activate');
    const diagramLabel = document.querySelector(
      '#prefsGamepadDiagram [data-part="lb"]'
    );
    expect(diagramLabel.textContent).toBe('LB');
    expect(
      document.getElementById('prefsGamepadDiagram').getAttribute('aria-hidden')
    ).toBe('true');
  });

  it('Change waits for one press, assigns it, and says what changed', async () => {
    row('activate').querySelector('button').click();
    expect(capture).toHaveBeenCalledWith(5000);
    expect(buttonOf('activate')).toBe(
      'Press a button on your controller. Esc cancels.'
    );
    pending('x');
    await flush();
    expect(buttonOf('activate')).toBe('X');
    expect(buttonOf('resetView')).toBe('A');
    expect(announce).toHaveBeenLastCalledWith('Activate: X. Reset View: A.');
    expect(mapping.get().assignments.activate).toBe('x');
  });

  it('Escape cancels the wait, changes nothing and keeps the dialog open', async () => {
    const change = row('activate').querySelector('button');
    change.focus();
    change.click();
    change.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      })
    );
    await flush();
    expect(cancelCapture).toHaveBeenCalledTimes(1);
    expect(buttonOf('activate')).toBe('A');
    expect(announce).toHaveBeenLastCalledWith('Nothing changed.');
    expect(
      document.getElementById('shortcutsModal').classList.contains('hidden')
    ).toBe(false);
    expect(mapping.get().assignments.activate).toBe('a');
  });

  it('the pickers relabel and reassign; Reset to preset restores', async () => {
    const family = document.getElementById('prefsGamepadFamily');
    family.value = 'playstation';
    family.dispatchEvent(new Event('change', { bubbles: true }));
    expect(buttonOf('activate')).toBe('Cross');
    expect(
      document.querySelector('#prefsGamepadDiagram [data-part="lb"]')
        .textContent
    ).toBe('L1');

    const preset = document.getElementById('prefsGamepadPreset');
    expect(
      [...preset.options].map((o) => [o.value, o.textContent.trim()])
    ).toEqual([
      ['camera', 'Camera'],
      ['customizer', 'Customizer'],
      ['menus', 'Menus'],
    ]);
    preset.value = 'menus';
    preset.dispatchEvent(new Event('change', { bubbles: true }));
    expect(buttonOf('zoomIn')).toBe('Triangle');
    expect(buttonOf('resetView')).toBe('Not assigned');
    expect(buttonOf('previous')).toBe('L1');

    row('back').querySelector('button').click();
    pending('r3');
    await flush();
    expect(buttonOf('back')).toBe('R3');
    document.getElementById('prefsGamepadReset').click();
    expect(buttonOf('back')).toBe('Circle');
  });

  it('shows the Joy-Con choices only while the layout is Nintendo', () => {
    const rows = document.getElementById('prefsJoyConRows');
    expect(rows.contains(document.getElementById('prefsJoyConHold'))).toBe(true);
    expect(rows.contains(document.getElementById('prefsJoyConPair'))).toBe(true);
    expect(rows.hidden).toBe(true);

    const family = document.getElementById('prefsGamepadFamily');
    family.value = 'nintendo';
    family.dispatchEvent(new Event('change', { bubbles: true }));
    expect(rows.hidden).toBe(false);
    family.value = 'xbox';
    family.dispatchEvent(new Event('change', { bubbles: true }));
    expect(rows.hidden).toBe(true);

    // Not chosen, the layout follows the pad: a Joy-Con shows them.
    localStorage.clear();
    initControllerPanel({
      gamepad: {
        mapping: createGamepadMapping({
          getPadId: () =>
            'Joy-Con (R) (STANDARD GAMEPAD Vendor: 057e Product: 2007)',
        }),
        capture,
        cancelCapture,
        announce,
      },
    });
    syncControllerPanel();
    expect(family.value).toBe('nintendo');
    expect(rows.hidden).toBe(false);
  });

  it('the readout follows the pad on every frame, and says nothing outside a test', () => {
    expect(text('controllerReadoutPad')).toBe('');
    pads[0] = stubPad();
    frame(0);
    expect(text('controllerReadoutPad')).toBe(
      `${XBOX}: mapping standard, 17 buttons, 4 axes.`
    );
    expect(text('controllerReadoutPress')).toBe('Nothing pressed.');
    pads[0].buttons[1] = { pressed: true, value: 1 };
    frame(16);
    expect(text('controllerReadoutPress')).toBe('Pressed: B [1].');
    pads[0].buttons[1] = { pressed: false, value: 0 };
    pads[0].axes[3] = -0.5;
    frame(32);
    expect(text('controllerReadoutPress')).toBe('Pressed: Right stick 0.00, -0.50.');
    expect(announce).not.toHaveBeenCalled();
    expect(
      document.getElementById('controllerReadoutPress').hasAttribute('aria-live')
    ).toBe(false);
  });

  // As a browser listed a PS5 pad beside a 3D mouse's virtual joystick.
  const JOYSTICK = 'Unknown Gamepad (Vendor: beef Product: 046d)';
  const DUALSENSE =
    'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
  const ownersPads = () => {
    pads[1] = { ...stubPad({ id: JOYSTICK, mapping: '', buttons: 4, axes: 10 }), index: 1 };
    pads[2] = { ...stubPad({ id: DUALSENSE, buttons: 18 }), index: 2 };
  };

  it('the readout shows the standard gamepad, and names the other device', () => {
    ownersPads();
    frame(0);
    expect(text('controllerReadoutPad')).toBe(
      `${DUALSENSE}: mapping standard, 18 buttons, 4 axes. Also connected: ${JOYSTICK}.`
    );
  });

  it('the readout shows the pad the app listens to', () => {
    ownersPads();
    _resetControllerPanelForTests();
    initControllerPanel({
      getGamepadStatus: () => ({ supported: true, padName: null }),
      gamepad: { mapping, capture, cancelCapture, announce, pad: () => pads[1] },
      walkMapping,
    });
    open();
    frame(0);
    expect(text('controllerReadoutPad')).toBe(
      `${JOYSTICK}: mapping not standard, 4 buttons, 10 axes. Also connected: ${DUALSENSE}.`
    );
  });

  it('a test takes each press, speaks it once and at most every 250 ms, and ends without a press', async () => {
    pads[0] = stubPad();
    frame(0);
    const test = document.getElementById('controllerReadoutTest');
    expect(test.textContent.trim()).toBe('Start the test');
    test.click();
    expect(test.textContent).toBe('Stop the test');
    expect(capture).toHaveBeenLastCalledWith(10000);
    expect(announce).toHaveBeenLastCalledWith(
      'Test started. Press a button on your controller.'
    );
    announce.mockClear();

    // B is pressed and held: it goes to the test, so the dialog stays.
    pads[0].buttons[1] = { pressed: true, value: 1 };
    pending('b');
    await flush();
    expect(capture).toHaveBeenCalledTimes(2);
    frame(1000);
    frame(1016);
    frame(1100);
    expect(announce.mock.calls).toEqual([['Pressed: B [1].']]);

    // A second press 100 ms later waits for the 250 ms to pass.
    pads[0].buttons[0] = { pressed: true, value: 1 };
    frame(1100);
    expect(announce).toHaveBeenCalledTimes(1);
    frame(1200);
    expect(announce).toHaveBeenCalledTimes(1);
    frame(1250);
    expect(announce.mock.calls[1]).toEqual(['Pressed: A [0], B [1].']);
    frame(1600);
    expect(announce).toHaveBeenCalledTimes(2);

    // Ten seconds without a press end the wait, and the test.
    pending(null);
    await flush();
    expect(test.textContent).toBe('Start the test');
    expect(announce).toHaveBeenLastCalledWith('Test stopped.');
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it('Escape and Stop the test end a test and keep the dialog open', async () => {
    const test = document.getElementById('controllerReadoutTest');
    test.click();
    test.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );
    await flush();
    expect(cancelCapture).toHaveBeenCalledTimes(1);
    expect(test.textContent).toBe('Start the test');
    expect(announce).toHaveBeenLastCalledWith('Test stopped.');
    expect(
      document.getElementById('shortcutsModal').classList.contains('hidden')
    ).toBe(false);

    test.click();
    expect(test.textContent).toBe('Stop the test');
    test.click();
    await flush();
    expect(cancelCapture).toHaveBeenCalledTimes(2);
    expect(test.textContent).toBe('Start the test');
  });

  it('the City Walk section stays hidden until the game is found', () => {
    const section = document.getElementById('keysWalkSection');
    expect(section).not.toBeNull();
    expect(section.hidden).toBe(true);
    expect(section.hasAttribute('data-hfm-gated')).toBe(true);
  });

  it("found, the section lists the game's seven actions from its own table, and Change keeps a press there", async () => {
    document.getElementById('keysWalkSection').hidden = false;
    syncControllerPanel();
    const walkRows = [
      ...document.querySelectorAll('#keysWalkAssignments tbody tr'),
    ];
    expect(walkRows.map((r) => r.querySelector('th').textContent)).toEqual([
      'Map',
      'Back',
      'Help',
      'Previous landmark',
      'Next landmark',
      'Walk to the landmark',
      'Auto-walk',
    ]);
    const walkButton = (id) =>
      document.getElementById(`keysWalkInput-${id}`).textContent;
    expect(walkButton('map')).toBe('A');
    expect(walkButton('autoWalk')).toBe('LT');
    const change = document.getElementById('keysWalkChange-map');
    const name = change
      .getAttribute('aria-labelledby')
      .split(' ')
      .map((id) => document.getElementById(id).textContent.trim())
      .join(' ');
    expect(name).toBe('Change Map');

    change.click();
    expect(walkButton('map')).toBe(
      'Press a button on your controller. Esc cancels.'
    );
    pending('x');
    await flush();
    expect(walkButton('map')).toBe('X');
    expect(announce).toHaveBeenLastCalledWith('Map: X.');
    expect(walkMapping.get().assignments.map).toBe('x');
    expect(mapping.get().assignments.activate).toBe('a');

    change.click();
    pending('up');
    await flush();
    expect(walkButton('map')).toBe('X');
    expect(announce).toHaveBeenLastCalledWith('Nothing changed.');

    document.getElementById('keysWalkReset').click();
    expect(walkButton('map')).toBe('A');
    expect(buttonOf('back')).toBe('B');
  });

  it('closing the dialog stops the readout and ends a test without a word', async () => {
    pads[0] = stubPad();
    document.getElementById('controllerReadoutTest').click();
    announce.mockClear();
    document.getElementById('shortcutsModal').classList.add('hidden');
    frame(0);
    await flush();
    expect(frames).toHaveLength(0);
    expect(cancelCapture).toHaveBeenCalledTimes(1);
    expect(announce).not.toHaveBeenCalled();
    expect(document.getElementById('controllerReadoutTest').textContent).toBe(
      'Start the test'
    );
  });
});
