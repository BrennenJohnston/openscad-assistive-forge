/**
 * A game controller's assignments: the two presets, the Nintendo pad's
 * printed A and B, the labels each family prints on its buttons, the saved
 * mapping a person changes one action at a time, and catching the one
 * button a person presses to assign it.
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  GAMEPAD_ACTIONS,
  GAMEPAD_FAMILIES,
  GamepadController,
  createGamepadMapping,
  gamepadFamilyFromId,
  gamepadInputLabel,
  presetAssignments,
} from '../../src/js/gamepad-controller.js';
import { STORAGE_KEY_GAMEPAD_MAPPING } from '../../src/js/storage-keys.js';

describe('the presets', () => {
  it("Menus first is the owner's layout", () => {
    expect(presetAssignments('menus', 'xbox')).toEqual({
      previous: 'lb',
      next: 'rb',
      previousRegion: 'lt',
      nextRegion: 'rt',
      activate: 'a',
      back: 'b',
      up: 'up',
      down: 'down',
      left: 'left',
      right: 'right',
      zoomIn: 'y',
      zoomOut: 'x',
      fullScreen: 'start',
      keys: 'select',
      resetView: null,
      viewAll: null,
    });
  });

  it('Camera first zooms with the triggers; X resets the view and Y fits the model', () => {
    expect(presetAssignments('camera', 'xbox')).toMatchObject({
      previous: 'lb',
      next: 'rb',
      previousRegion: null,
      nextRegion: null,
      zoomIn: 'rt',
      zoomOut: 'lt',
      resetView: 'x',
      viewAll: 'y',
    });
  });

  it('on a Nintendo pad, the printed A activates and the printed B goes back', () => {
    const nintendo = presetAssignments('menus', 'nintendo');
    // The standard mapping goes by position: index 1, the right button, is
    // the one Nintendo prints A on.
    expect(nintendo.activate).toBe('b');
    expect(nintendo.back).toBe('a');
    expect(gamepadInputLabel(nintendo.activate, 'nintendo')).toBe('A');
    expect(gamepadInputLabel(nintendo.back, 'nintendo')).toBe('B');
  });

  it('lists every action a person can assign, by name', () => {
    expect(GAMEPAD_ACTIONS.map((a) => a.name)).toEqual([
      'Previous control',
      'Next control',
      'Previous toolbar',
      'Next toolbar',
      'Activate',
      'Back',
      'Up',
      'Down',
      'Left',
      'Right',
      'Zoom in',
      'Zoom out',
      'Full Screen',
      'Keyboard shortcuts',
      'Reset View',
      'View All',
    ]);
    expect(GAMEPAD_FAMILIES.map((f) => f.name)).toEqual([
      'Xbox',
      'PlayStation',
      'Nintendo',
      'Generic',
    ]);
  });
});

describe('the families', () => {
  it("reads the family from the pad's name and maker", () => {
    expect(
      gamepadFamilyFromId(
        'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)'
      )
    ).toBe('xbox');
    expect(
      gamepadFamilyFromId(
        'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'
      )
    ).toBe('playstation');
    expect(gamepadFamilyFromId('054c-09cc-Wireless Controller')).toBe(
      'playstation'
    );
    expect(
      gamepadFamilyFromId(
        'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)'
      )
    ).toBe('nintendo');
    expect(
      gamepadFamilyFromId('Unknown Gamepad (Vendor: 1234 Product: 5678)')
    ).toBe('generic');
    expect(gamepadFamilyFromId('')).toBe('generic');
    expect(gamepadFamilyFromId(undefined)).toBe('generic');
  });

  it('names each button as its family prints it', () => {
    expect(gamepadInputLabel('a', 'xbox')).toBe('A');
    expect(gamepadInputLabel('lb', 'xbox')).toBe('LB');
    expect(gamepadInputLabel('select', 'xbox')).toBe('View');
    expect(gamepadInputLabel('a', 'playstation')).toBe('Cross');
    expect(gamepadInputLabel('rt', 'playstation')).toBe('R2');
    expect(gamepadInputLabel('lt', 'nintendo')).toBe('ZL');
    expect(gamepadInputLabel('start', 'nintendo')).toBe('Plus');
    expect(gamepadInputLabel('a', 'generic')).toBe('Bottom button');
    expect(gamepadInputLabel('up', 'generic')).toBe('D-pad up');
    expect(gamepadInputLabel('rs-left', 'xbox')).toBe('Right stick left');
    expect(gamepadInputLabel(null, 'xbox')).toBe('Not assigned');
  });
});

describe('the saved mapping', () => {
  const XBOX = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)';
  const PRO = 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)';
  let padId;
  const make = () => createGamepadMapping({ getPadId: () => padId });

  beforeEach(() => {
    localStorage.clear();
    padId = XBOX;
  });

  it('starts on Menus first, the family read from the pad', () => {
    const now = make().get();
    expect(now.preset).toBe('menus');
    expect(now.family).toBe('xbox');
    expect(now.familyChosen).toBe(false);
    expect(now.assignments).toEqual(presetAssignments('menus', 'xbox'));
    padId = PRO;
    expect(make().get().assignments.activate).toBe('b');
  });

  it('a change takes the button from the action that had it, which gets the old one, and is kept', () => {
    const mapping = make();
    const result = mapping.assign('activate', 'x');
    expect(result.swappedWith).toBe('zoomOut');
    expect(mapping.get().assignments.activate).toBe('x');
    expect(mapping.get().assignments.zoomOut).toBe('a');
    const again = make().get();
    expect(again.assignments.activate).toBe('x');
    expect(again.assignments.zoomOut).toBe('a');
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY_GAMEPAD_MAPPING))
    ).toBeTruthy();
  });

  it('a free button moves without taking anything', () => {
    const mapping = make();
    const result = mapping.assign('resetView', 'r3');
    expect(result.swappedWith).toBeNull();
    expect(mapping.get().assignments.resetView).toBe('r3');
  });

  it('Reset to preset drops the changes; a new preset starts from its own table', () => {
    const mapping = make();
    mapping.assign('activate', 'x');
    mapping.reset();
    expect(mapping.get().assignments).toEqual(
      presetAssignments('menus', 'xbox')
    );
    mapping.assign('activate', 'x');
    mapping.setPreset('camera');
    expect(mapping.get().preset).toBe('camera');
    expect(mapping.get().assignments).toEqual(
      presetAssignments('camera', 'xbox')
    );
  });

  it('a chosen family stays chosen whatever pad is plugged in', () => {
    const mapping = make();
    mapping.setFamily('nintendo');
    padId = XBOX;
    const now = make().get();
    expect(now.family).toBe('nintendo');
    expect(now.familyChosen).toBe(true);
    expect(now.assignments.activate).toBe('b');
  });

  it('tells its listeners of each change', () => {
    const mapping = make();
    const heard = vi.fn();
    mapping.subscribe(heard);
    mapping.assign('back', 'y');
    mapping.setPreset('camera');
    mapping.reset();
    expect(heard).toHaveBeenCalledTimes(3);
  });

  it('a damaged saved value falls back to the default', () => {
    localStorage.setItem(STORAGE_KEY_GAMEPAD_MAPPING, '{not json');
    expect(make().get().assignments).toEqual(
      presetAssignments('menus', 'xbox')
    );
    localStorage.setItem(
      STORAGE_KEY_GAMEPAD_MAPPING,
      JSON.stringify({ preset: 'nope', custom: { activate: 'nope' } })
    );
    const now = make().get();
    expect(now.preset).toBe('menus');
    expect(now.assignments.activate).toBe('a');
  });
});

describe('catching the one button a person presses', () => {
  let pad;
  let controller;

  beforeEach(() => {
    pad = {
      id: 'Test pad (STANDARD GAMEPAD)',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({
        pressed: false,
        touched: false,
        value: 0,
      })),
    };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [pad, null, null, null],
    });
    controller = new GamepadController();
    controller.state.gamepadIndex = 0;
  });

  afterEach(() => {
    controller.destroy();
    vi.useRealTimers();
  });

  const poll = () => {
    controller.state.update(pad);
    controller._processInput(0.016);
  };
  const press = (i) => {
    pad.buttons[i] = { pressed: true, touched: true, value: 1 };
  };
  const release = (i) => {
    pad.buttons[i] = { pressed: false, touched: false, value: 0 };
  };

  it('resolves with the next button pressed, and the press does nothing else', async () => {
    const heard = [];
    controller.on('input', (e) => heard.push(e.name));
    const caught = controller.captureNextInput(5000);
    poll();
    press(2);
    poll();
    await expect(caught).resolves.toBe('x');
    expect(heard).toEqual([]);
    release(2);
    poll();
    press(2);
    poll();
    expect(heard).toEqual(['x']);
  });

  it('a stick pushed past halfway counts', async () => {
    const caught = controller.captureNextInput(5000);
    pad.axes = [0, 0, 0, -0.8];
    poll();
    await expect(caught).resolves.toBe('rs-up');
  });

  it('a button already held when it starts does not count', async () => {
    press(0);
    poll();
    const caught = controller.captureNextInput(5000);
    poll();
    poll();
    release(0);
    poll();
    press(1);
    poll();
    await expect(caught).resolves.toBe('b');
  });

  it('resolves with nothing after five seconds, or when cancelled', async () => {
    vi.useFakeTimers();
    const late = controller.captureNextInput(5000);
    vi.advanceTimersByTime(5000);
    await expect(late).resolves.toBeNull();
    const cancelled = controller.captureNextInput(5000);
    controller.cancelCapture();
    await expect(cancelled).resolves.toBeNull();
  });
});
