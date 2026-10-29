/**
 * Nintendo Joy-Cons, read as the app's controller layouts.
 *
 * A browser lists one Joy-Con alone as a small standard controller already
 * turned for a sideways hold: 17 buttons, its one stick on axes 0 and 1, the
 * four round buttons at a full pad's bottom (0), right (1), left (2) and top
 * (3), SL and SR as the bumpers (4, 5), the trigger as ZL (6) or ZR (7), the
 * side button as 8, Minus or Plus as 9, the stick press as 10 and Capture or
 * Home as 16. The two together it merges into one upright controller,
 * "Joy-Con L+R": the left stick on axes 0 and 1, the right on 2 and 3, the
 * standard buttons in their places, Capture at 17 and the left and right SL
 * and SR at 18 to 21. (Measured in Chrome on Windows.)
 *
 * A layout turns that into a full pad's controls the app already reads: the
 * stick on the right stick (it turns the view), the four buttons on an extra
 * pair of axes (they pan), SL and SR on the triggers (they zoom), and the
 * other buttons on the inputs its table names.
 *
 * @license GPL-3.0-or-later
 */

import {
  STORAGE_KEY_JOYCON,
  safeGetItem,
  safeSetItem,
} from './storage-keys.js';

/** How one Joy-Con can be held. */
export const JOYCON_HOLDS = ['sideways', 'upright'];

/** How the two together can be used. */
export const JOYCON_PAIR_MODES = ['together', 'left', 'right', 'separately'];

/** The axes a layout pans with, past a full pad's two sticks. */
export const JOYCON_PAN_AXES = [4, 5];

// What each input of a layout does: the camera jobs on one Joy-Con, and
// the Customizer's on the left one when the two are used separately.
const CAMERA_INPUTS = {
  a: 'activate',
  b: 'back',
  x: 'resetView',
  start: 'fullScreen',
  home: 'keys',
};
const SEPARATE_INPUTS = {
  ...CAMERA_INPUTS,
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  lb: 'previousParameter',
  rb: 'nextParameter',
  'ls-up': 'previousParameter',
  'ls-down': 'nextParameter',
  'ls-left': 'previousGroup',
  'ls-right': 'nextGroup',
};

const NINTENDO = /(^|[^0-9a-f])0?57e([^0-9a-f]|$)/i;
const product = (code) => new RegExp(`(^|[^0-9a-f])${code}([^0-9a-f]|$)`, 'i');

/**
 * Which Joy-Con a listed pad is.
 * @param {{id?: string}|null} pad
 * @returns {'left'|'right'|'pair'|null}
 */
export function joyConKind(pad) {
  const id = pad?.id ?? '';
  if (!NINTENDO.test(id)) return null;
  if (product('200e').test(id)) return 'pair';
  if (product('2006').test(id)) return 'left';
  if (product('2007').test(id)) return 'right';
  return null;
}

/**
 * The person's kept choice; anything not one of the choices reads as not
 * chosen yet.
 * @returns {{hold: string|null, pair: string|null}}
 */
export function loadJoyConChoice() {
  let saved = {};
  try {
    saved = JSON.parse(safeGetItem(STORAGE_KEY_JOYCON) ?? '{}') ?? {};
  } catch (error) {
    // A damaged value reads as not chosen, so the question comes again
    // and the answer writes a good one.
    console.warn('[Gamepad] The saved Joy-Con choice is unreadable:', error);
  }
  return {
    hold: JOYCON_HOLDS.includes(saved.hold) ? saved.hold : null,
    pair: JOYCON_PAIR_MODES.includes(saved.pair) ? saved.pair : null,
  };
}

/**
 * Keep the choice.
 * @param {{hold: string|null, pair: string|null}} choice
 */
export function saveJoyConChoice(choice) {
  safeSetItem(
    STORAGE_KEY_JOYCON,
    JSON.stringify({ hold: choice.hold ?? null, pair: choice.pair ?? null })
  );
}

const valueOf = (pad, index) => {
  const button = pad.buttons[index];
  if (!button) return 0;
  return typeof button === 'object'
    ? Math.max(button.value ?? 0, button.pressed ? 1 : 0)
    : button;
};

/**
 * One Joy-Con's parts, with its stick and its four buttons as a person
 * holds it: `stick` is [right, down], the buttons by where they sit.
 * @typedef {{stick: number[], up: number, down: number, left: number,
 *   right: number, sl: number, sr: number, trigger: number, side: number,
 *   plus: number, stickPress: number, home: number}} JoyConParts
 */

/**
 * A Joy-Con alone, which the browser reads sideways. Upright, the left one
 * reads a push up as -1 on axis 0 (measured); the right one turns the other
 * way.
 * @returns {JoyConParts}
 */
function singleParts(pad, side, hold) {
  const v = (index) => valueOf(pad, index);
  const [x, y] = [pad.axes[0] ?? 0, pad.axes[1] ?? 0];
  const common = {
    sl: v(4),
    sr: v(5),
    trigger: Math.max(v(6), v(7)),
    side: v(8),
    plus: v(9),
    stickPress: v(10),
    home: v(16),
  };
  if (hold !== 'upright') {
    return {
      ...common,
      stick: [x, y],
      up: v(3),
      down: v(0),
      left: v(2),
      right: v(1),
    };
  }
  if (side === 'left') {
    return {
      ...common,
      stick: [-y, x],
      up: v(2),
      down: v(1),
      left: v(0),
      right: v(3),
    };
  }
  return {
    ...common,
    stick: [y, -x],
    up: v(1),
    down: v(2),
    left: v(3),
    right: v(0),
  };
}

/**
 * One half of the merged pair, held sideways as a Joy-Con alone.
 * @returns {JoyConParts}
 */
function halfSideways(pad, side) {
  const v = (index) => valueOf(pad, index);
  const a = pad.axes;
  if (side === 'left') {
    return {
      stick: [a[1] ?? 0, -(a[0] ?? 0)],
      up: v(15),
      down: v(14),
      left: v(12),
      right: v(13),
      sl: v(18),
      sr: v(19),
      trigger: v(6),
      side: v(4),
      plus: v(8),
      stickPress: v(10),
      home: v(17),
    };
  }
  return {
    stick: [-(a[3] ?? 0), a[2] ?? 0],
    up: v(2),
    down: v(1),
    left: v(0),
    right: v(3),
    sl: v(20),
    sr: v(21),
    trigger: v(7),
    side: v(5),
    plus: v(9),
    stickPress: v(11),
    home: v(16),
  };
}

/** The right half of the merged pair, held upright. @returns {JoyConParts} */
function rightUpright(pad) {
  const v = (index) => valueOf(pad, index);
  return {
    stick: [pad.axes[2] ?? 0, pad.axes[3] ?? 0],
    up: v(3),
    down: v(0),
    left: v(2),
    right: v(1),
    sl: v(20),
    sr: v(21),
    trigger: v(7),
    side: v(5),
    plus: v(9),
    stickPress: v(11),
    home: v(16),
  };
}

const button = (value) => ({ pressed: value > 0.5, touched: value > 0, value });

/**
 * A full pad's controls from one Joy-Con's parts: the stick on the right
 * stick, the four buttons on the pan axes, SL and SR on the triggers.
 */
function cameraPad(pad, parts) {
  const values = new Array(17).fill(0);
  values[0] = parts.trigger;
  values[1] = parts.side;
  values[2] = parts.stickPress;
  values[6] = parts.sl;
  values[7] = parts.sr;
  values[9] = parts.plus;
  values[16] = parts.home;
  return {
    id: pad.id,
    index: pad.index,
    connected: true,
    mapping: 'standard',
    buttons: values.map(button),
    axes: [
      0,
      0,
      parts.stick[0],
      parts.stick[1],
      parts.right - parts.left,
      parts.down - parts.up,
    ],
  };
}

/** The pair used separately: the right half the camera, the left the Customizer. */
function separatePad(pad) {
  const v = (index) => valueOf(pad, index);
  const view = cameraPad(pad, rightUpright(pad));
  const raise = (index, value) => {
    view.buttons[index] = button(Math.max(view.buttons[index].value, value));
  };
  raise(0, v(6));
  raise(1, v(4));
  raise(4, v(18));
  raise(5, v(19));
  raise(12, v(12));
  raise(13, v(13));
  raise(14, v(14));
  raise(15, v(15));
  view.axes[0] = pad.axes[0] ?? 0;
  view.axes[1] = pad.axes[1] ?? 0;
  return view;
}

/**
 * The layout for a listed pad, or null when it is read as it is (not a
 * Joy-Con, the pair used together, or a shape the browser did not give).
 * @param {Gamepad|null} pad
 * @param {{hold: string|null, pair: string|null}} choice
 * @returns {{name: string, view: (pad: Gamepad) => object,
 *   inputs: Object<string, string>}|null}
 */
export function joyConLayout(pad, choice) {
  const one = oneJoyCon(pad, choice);
  if (one) {
    return {
      name: one.name,
      view: (gamepad) => cameraPad(gamepad, one.parts(gamepad)),
      inputs: CAMERA_INPUTS,
    };
  }
  if (pairShape(pad) && choice?.pair === 'separately') {
    return {
      name: 'pair-separately',
      view: separatePad,
      inputs: SEPARATE_INPUTS,
    };
  }
  return null;
}

/** Whether a listed pad is the merged pair in the shape measured. */
function pairShape(pad) {
  return (
    joyConKind(pad) === 'pair' &&
    pad.mapping === 'standard' &&
    pad.axes.length >= 4 &&
    pad.buttons.length >= 22
  );
}

/**
 * One Joy-Con as it is used: alone, or one half of the pair used alone.
 * @returns {{name: string, parts: (pad: Gamepad) => JoyConParts}|null}
 */
function oneJoyCon(pad, choice) {
  const kind = joyConKind(pad);
  if (!kind || pad.mapping !== 'standard') return null;
  if (kind === 'left' || kind === 'right') {
    if (pad.axes.length < 2) return null;
    const hold = choice?.hold === 'upright' ? 'upright' : 'sideways';
    return {
      name: `${kind}-${hold}`,
      parts: (gamepad) => singleParts(gamepad, kind, hold),
    };
  }
  const mode = choice?.pair;
  if (pairShape(pad) && (mode === 'left' || mode === 'right')) {
    return {
      name: `pair-${mode}`,
      parts: (gamepad) => halfSideways(gamepad, mode),
    };
  }
  return null;
}
