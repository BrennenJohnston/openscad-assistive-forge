/**
 * Nintendo Joy-Cons, as a browser lists them: one alone is a small standard
 * controller already turned for a sideways hold (17 buttons, one stick on
 * axes 0 and 1); the two together are one upright controller the browser
 * merges ("Joy-Con L+R", 22 buttons, 4 axes). The pads below are shaped as
 * Chrome on Windows reported a person's own Joy-Cons.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GamepadController } from '../../src/js/gamepad-controller.js';
import {
  joyConKind,
  joyConLayout,
  joyConWalkLayout,
  loadJoyConChoice,
  saveJoyConChoice,
} from '../../src/js/joycon.js';

const LEFT_ID =
  'Wireless Gamepad (STANDARD GAMEPAD Vendor: 057e Product: 2006)';
const RIGHT_ID =
  'Wireless Gamepad (STANDARD GAMEPAD Vendor: 057e Product: 2007)';
const PAIR_ID = 'Joy-Con L+R (STANDARD GAMEPAD Vendor: 057e Product: 200e)';

const makePad = (id, buttons, axes) => ({
  id,
  index: 0,
  connected: true,
  mapping: 'standard',
  buttons: Array.from({ length: buttons }, () => ({
    pressed: false,
    touched: false,
    value: 0,
  })),
  axes: new Array(axes).fill(0),
});
const press = (pad, index) => {
  pad.buttons[index] = { pressed: true, touched: true, value: 1 };
};

describe('which Joy-Con the browser lists', () => {
  it('tells the left, the right and the merged pair by their ids', () => {
    expect(joyConKind({ id: LEFT_ID })).toBe('left');
    expect(joyConKind({ id: RIGHT_ID })).toBe('right');
    expect(joyConKind({ id: PAIR_ID })).toBe('pair');
    expect(joyConKind({ id: '57e-2006-Joy-Con (L)' })).toBe('left');
    expect(
      joyConKind({
        id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
      })
    ).toBeNull();
  });
});

describe('the app reads a Joy-Con through its layout', () => {
  let pad;
  let choice;
  let controller;
  let heard;

  /** The controller over `pad` with `choice`, and what it said. */
  const start = () => {
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [pad, null, null, null],
    });
    controller = new GamepadController({
      layout: (gamepad) => joyConLayout(gamepad, choice),
    });
    heard = [];
    for (const name of ['camera:rotate', 'camera:pan', 'camera:zoom']) {
      controller.on(name, (data) => heard.push({ name, ...data }));
    }
    controller.on('input', ({ name }) =>
      heard.push({ name: 'input', input: name })
    );
    controller.init();
    controller._pollGamepads(1000);
  };
  /** One poll a tenth of a second on, and what it said. */
  let at = 1000;
  const poll = () => {
    heard.length = 0;
    at += 100;
    controller._pollGamepads(at);
    return heard;
  };
  const of = (events, name) => events.find((event) => event.name === name);
  const actionFor = (input) => controller.layoutInputs()?.[input];

  beforeEach(() => {
    at = 1000;
    choice = { hold: 'sideways', pair: null };
  });

  afterEach(() => {
    controller?.destroy();
    controller = null;
  });

  describe('one Joy-Con held sideways', () => {
    beforeEach(() => {
      pad = makePad(RIGHT_ID, 17, 2);
      start();
    });

    it('its stick turns the view and pans nothing', () => {
      pad.axes = [0, -1];
      const events = poll();
      expect(of(events, 'camera:rotate')?.y).toBeGreaterThan(0);
      expect(of(events, 'camera:pan')).toBeUndefined();
    });

    it('its four buttons pan, the top one up and the right one right', () => {
      press(pad, 3);
      expect(of(poll(), 'camera:pan')?.y).toBeGreaterThan(0);
      pad = makePad(RIGHT_ID, 17, 2);
      press(pad, 1);
      expect(of(poll(), 'camera:pan')?.x).toBeGreaterThan(0);
    });

    it('SR zooms in and SL zooms out', () => {
      press(pad, 5);
      expect(of(poll(), 'camera:zoom')?.delta).toBeGreaterThan(0);
      pad = makePad(RIGHT_ID, 17, 2);
      press(pad, 4);
      expect(of(poll(), 'camera:zoom')?.delta).toBeLessThan(0);
    });

    it('the trigger activates, the side button goes back, Plus is Full Screen, Home is Keys, the stick pressed resets the view', () => {
      const cases = [
        [7, 'activate'],
        [8, 'back'],
        [9, 'fullScreen'],
        [16, 'keys'],
        [10, 'resetView'],
      ];
      for (const [index, action] of cases) {
        pad = makePad(RIGHT_ID, 17, 2);
        poll();
        press(pad, index);
        const input = of(poll(), 'input')?.input;
        expect(actionFor(input), `button ${index}`).toBe(action);
      }
    });
  });

  describe('one Joy-Con held upright', () => {
    it('the left one: up on its stick turns the view up, and its top button pans up', () => {
      choice = { hold: 'upright', pair: null };
      pad = makePad(LEFT_ID, 17, 2);
      start();
      // Upright, the browser reads a push up as -1 on axis 0 (measured).
      pad.axes = [-0.98, -0.06];
      expect(of(poll(), 'camera:rotate')?.y).toBeGreaterThan(0);
      pad = makePad(LEFT_ID, 17, 2);
      press(pad, 2);
      expect(of(poll(), 'camera:pan')?.y).toBeGreaterThan(0);
    });

    it('the right one: a push to the right turns the view right', () => {
      choice = { hold: 'upright', pair: null };
      pad = makePad(RIGHT_ID, 17, 2);
      start();
      pad.axes = [0, 1];
      expect(of(poll(), 'camera:rotate')?.x).toBeGreaterThan(0);
    });
  });

  describe('both Joy-Cons, merged by the browser', () => {
    beforeEach(() => {
      pad = makePad(PAIR_ID, 22, 4);
    });

    it('together: one standard controller, the left stick pans as on any pad', () => {
      choice = { hold: null, pair: 'together' };
      start();
      expect(controller.layoutInputs()).toBeNull();
      pad.axes = [0, -1, 0, 0];
      expect(of(poll(), 'camera:pan')?.y).toBeGreaterThan(0);
    });

    it('left only: the left half held sideways as one Joy-Con; the right half does nothing', () => {
      choice = { hold: null, pair: 'left' };
      start();
      // Held sideways, up on the left stick reads +0.88 on axis 0 (measured).
      pad.axes = [0.88, -0.01, 0, 0];
      expect(of(poll(), 'camera:rotate')?.y).toBeGreaterThan(0);
      pad = makePad(PAIR_ID, 22, 4);
      press(pad, 15);
      expect(of(poll(), 'camera:pan')?.y).toBeGreaterThan(0);
      pad = makePad(PAIR_ID, 22, 4);
      press(pad, 19);
      expect(of(poll(), 'camera:zoom')?.delta).toBeGreaterThan(0);
      pad = makePad(PAIR_ID, 22, 4);
      pad.axes = [0, 0, 0, -1];
      press(pad, 1);
      expect(poll()).toEqual([]);
    });

    it('right only: the right half held sideways as one Joy-Con', () => {
      choice = { hold: null, pair: 'right' };
      start();
      // Held sideways, up on the right stick reads -0.88 on axis 2 (measured).
      pad.axes = [0, 0, -0.88, 0.03];
      expect(of(poll(), 'camera:rotate')?.y).toBeGreaterThan(0);
      pad = makePad(PAIR_ID, 22, 4);
      press(pad, 2);
      expect(of(poll(), 'camera:pan')?.y).toBeGreaterThan(0);
      pad = makePad(PAIR_ID, 22, 4);
      press(pad, 21);
      expect(of(poll(), 'camera:zoom')?.delta).toBeGreaterThan(0);
    });

    it('separately: the right one moves the view, the left one walks the Customizer', () => {
      choice = { hold: null, pair: 'separately' };
      start();
      pad.axes = [0, 0, 0, -1];
      expect(of(poll(), 'camera:rotate')?.y).toBeGreaterThan(0);
      pad = makePad(PAIR_ID, 22, 4);
      press(pad, 3);
      expect(of(poll(), 'camera:pan')?.y).toBeGreaterThan(0);
      pad = makePad(PAIR_ID, 22, 4);
      press(pad, 21);
      expect(of(poll(), 'camera:zoom')?.delta).toBeGreaterThan(0);

      const cases = [
        [12, 'up'],
        [15, 'right'],
        [18, 'previousParameter'],
        [19, 'nextParameter'],
        [6, 'activate'],
        [4, 'back'],
      ];
      for (const [index, action] of cases) {
        pad = makePad(PAIR_ID, 22, 4);
        poll();
        press(pad, index);
        const input = of(poll(), 'input')?.input;
        expect(actionFor(input), `button ${index}`).toBe(action);
      }
      pad = makePad(PAIR_ID, 22, 4);
      poll();
      pad.axes = [0, -1, 0, 0];
      expect(actionFor(of(poll(), 'input')?.input)).toBe('previousParameter');
      pad = makePad(PAIR_ID, 22, 4);
      poll();
      pad.axes = [1, 0, 0, 0];
      expect(actionFor(of(poll(), 'input')?.input)).toBe('nextGroup');
    });
  });
});

describe('the City Walk reads one Joy-Con through its own layout', () => {
  let pad;
  let choice;
  let controller;
  let inputs;
  let at;

  const start = () => {
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [pad, null, null, null],
    });
    controller = new GamepadController({
      layout: (gamepad) => joyConWalkLayout(gamepad, choice),
    });
    inputs = [];
    controller.on('input', ({ name }) => inputs.push(name));
    controller.init();
    at = 1000;
    controller._pollGamepads(at);
  };
  const poll = () => {
    inputs.length = 0;
    at += 100;
    controller._pollGamepads(at);
  };
  /** What the game reads each frame: the walk and the look, -1 to 1. */
  const moves = () => {
    const s = controller.state;
    // 0 - a value, not -value: a still stick reads 0, never -0.
    return {
      forward: 0 - s.getShapedAxis(1, 0.15),
      strafe: s.getShapedAxis(0, 0.15),
      turn: s.getShapedAxis(2, 0.15),
      pitch: 0 - s.getShapedAxis(3, 0.15),
    };
  };
  const actionOf = (input) => controller.layoutInputs()?.[input];

  beforeEach(() => {
    choice = { hold: 'sideways', pair: null };
  });

  afterEach(() => {
    controller?.destroy();
    controller = null;
  });

  it('held sideways, the stick walks and the four buttons look: up and down look, left and right turn', () => {
    pad = makePad(RIGHT_ID, 17, 2);
    start();
    pad.axes = [0, -1];
    poll();
    expect(moves()).toMatchObject({ forward: 1, turn: 0, pitch: 0 });
    pad.axes = [1, 0];
    poll();
    expect(moves()).toMatchObject({ strafe: 1, turn: 0, pitch: 0 });

    const looks = [
      [3, { pitch: 1 }],
      [0, { pitch: -1 }],
      [2, { turn: -1 }],
      [1, { turn: 1 }],
    ];
    for (const [index, look] of looks) {
      pad = makePad(RIGHT_ID, 17, 2);
      press(pad, index);
      poll();
      expect(moves(), `button ${index}`).toMatchObject({
        forward: 0,
        strafe: 0,
        ...look,
      });
      // A look is not one of the game's buttons.
      expect(inputs.map(actionOf).filter(Boolean), `button ${index}`).toEqual(
        []
      );
    }
  });

  it('the trigger opens the map, the side button goes back, SL and SR step the landmarks, the stick pressed walks there, Home auto-walks, Plus is the help', () => {
    pad = makePad(RIGHT_ID, 17, 2);
    start();
    const cases = [
      [7, 'map'],
      [8, 'back'],
      [4, 'previousLandmark'],
      [5, 'nextLandmark'],
      [10, 'walkTo'],
      [16, 'autoWalk'],
      [9, 'help'],
    ];
    for (const [index, action] of cases) {
      pad = makePad(RIGHT_ID, 17, 2);
      poll();
      press(pad, index);
      poll();
      expect(inputs.map(actionOf).filter(Boolean), `button ${index}`).toEqual([
        action,
      ]);
    }
    // The left one's trigger is ZL.
    pad = makePad(LEFT_ID, 17, 2);
    poll();
    press(pad, 6);
    poll();
    expect(inputs.map(actionOf).filter(Boolean)).toEqual(['map']);
  });

  it('held upright, the left one walks forward on a push up and looks up on its top button', () => {
    choice = { hold: 'upright', pair: null };
    pad = makePad(LEFT_ID, 17, 2);
    start();
    pad.axes = [-0.98, -0.06];
    poll();
    expect(moves().forward).toBeGreaterThan(0.9);
    pad = makePad(LEFT_ID, 17, 2);
    press(pad, 2);
    poll();
    expect(moves()).toMatchObject({ forward: 0, pitch: 1 });
  });

  it('one half of the pair used alone walks and looks the same; the pair together or separately is read as it is', () => {
    pad = makePad(PAIR_ID, 22, 4);
    choice = { hold: null, pair: 'left' };
    start();
    pad.axes = [0.88, -0.01, 0, 0];
    poll();
    expect(moves().forward).toBeGreaterThan(0.8);
    pad = makePad(PAIR_ID, 22, 4);
    press(pad, 15);
    poll();
    expect(moves()).toMatchObject({ forward: 0, pitch: 1 });

    for (const pair of ['together', 'separately']) {
      expect(joyConWalkLayout(pad, { hold: null, pair }), pair).toBeNull();
    }
    expect(
      joyConWalkLayout(
        makePad(
          'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)',
          17,
          4
        ),
        choice
      )
    ).toBeNull();
  });
});

describe('the choice is kept', () => {
  beforeEach(() => localStorage.clear());

  it('a saved choice comes back, and an unknown one is not taken', () => {
    expect(loadJoyConChoice()).toEqual({ hold: null, pair: null });
    saveJoyConChoice({ hold: 'upright', pair: 'separately' });
    expect(loadJoyConChoice()).toEqual({ hold: 'upright', pair: 'separately' });
    localStorage.setItem(
      'openscad-forge-joycon',
      JSON.stringify({ hold: 'sideways', pair: 'both' })
    );
    expect(loadJoyConChoice()).toEqual({ hold: 'sideways', pair: null });
  });
});
