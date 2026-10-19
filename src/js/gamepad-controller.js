/**
 * Gamepad Controller
 * Reads a game controller through the Gamepad API: the sticks and the zoom
 * inputs move the view, and every button press or stick push is told as an
 * `input` event the app turns into an action by the person's assignments.
 * The assignments, their presets, the families' button names and the saved
 * mapping live here too.
 * @license GPL-3.0-or-later
 */

import {
  STORAGE_KEY_GAMEPAD_MAPPING,
  STORAGE_KEY_GAMEPAD_WALK_MAPPING,
  safeGetItem,
  safeSetItem,
} from './storage-keys.js';

/**
 * Default gamepad button mappings (Standard Gamepad Layout)
 * Based on W3C Gamepad API standard mapping
 * https://w3c.github.io/gamepad/#remapping
 */
export const DEFAULT_GAMEPAD_MAPPINGS = {
  // Face buttons
  buttonA: 0, // A / Cross - Confirm/Select
  buttonB: 1, // B / Circle - Cancel/Back
  buttonX: 2, // X / Square - Secondary action
  buttonY: 3, // Y / Triangle - Tertiary action

  // Shoulder buttons
  leftBumper: 4, // LB / L1
  rightBumper: 5, // RB / R1
  leftTrigger: 6, // LT / L2 (analog)
  rightTrigger: 7, // RT / R2 (analog)

  // Center buttons
  select: 8, // Select / Share
  start: 9, // Start / Options
  leftStickPress: 10, // L3
  rightStickPress: 11, // R3

  // D-pad
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,

  // Special
  home: 16, // Xbox button / PS button

  // Axes
  leftStickX: 0, // Left stick horizontal
  leftStickY: 1, // Left stick vertical
  rightStickX: 2, // Right stick horizontal
  rightStickY: 3, // Right stick vertical
};

/**
 * How fast the sticks and triggers move the view at full deflection, per
 * second, so a slow frame rate never slows the camera: the orbit in
 * degrees, the pan and the zoom as a share of the camera's distance from
 * what it looks at.
 */
export const ORBIT_DEG_PER_S = 90;
export const PAN_SHARE_PER_S = 0.5;
export const ZOOM_SHARE_PER_S = 1;
/** The longest step one poll may take, after a pause such as a hidden tab. */
const MAX_STEP_S = 0.1;

/** Each button's short name, by its index in the standard mapping. */
export const GAMEPAD_BUTTON_NAMES = [
  'a',
  'b',
  'x',
  'y',
  'lb',
  'rb',
  'lt',
  'rt',
  'select',
  'start',
  'l3',
  'r3',
  'up',
  'down',
  'left',
  'right',
  'home',
];

/** Each stick push a person can assign: its axis and its direction. */
const STICK_INPUTS = {
  'ls-up': [1, -1],
  'ls-down': [1, 1],
  'ls-left': [0, -1],
  'ls-right': [0, 1],
  'rs-up': [3, -1],
  'rs-down': [3, 1],
  'rs-left': [2, -1],
  'rs-right': [2, 1],
};

/** Every input a person can assign: the buttons, then the stick pushes. */
export const GAMEPAD_INPUT_NAMES = [
  ...GAMEPAD_BUTTON_NAMES,
  ...Object.keys(STICK_INPUTS),
];

/** A stick pushed this far counts as a press of that direction. */
const STICK_PRESS = 0.5;

/**
 * A held input repeats, as a held key does: once at the press, again after
 * the wait, then at the interval. The wait keeps a slow press from stepping
 * twice.
 */
export const INPUT_REPEAT_DELAY_S = 0.5;
export const INPUT_REPEAT_S = 0.15;

/**
 * The actions a person can assign, in the Controller tab's order. `repeats`:
 * a held input repeats the action; `held`: the action lasts as long as the
 * input is held (the zoom), so it has no command of its own.
 */
export const GAMEPAD_ACTIONS = [
  { id: 'previous', name: 'Previous control', repeats: true },
  { id: 'next', name: 'Next control', repeats: true },
  { id: 'previousRegion', name: 'Previous toolbar' },
  { id: 'nextRegion', name: 'Next toolbar' },
  { id: 'activate', name: 'Activate' },
  { id: 'back', name: 'Back' },
  { id: 'up', name: 'Up', repeats: true },
  { id: 'down', name: 'Down', repeats: true },
  { id: 'left', name: 'Left', repeats: true },
  { id: 'right', name: 'Right', repeats: true },
  { id: 'zoomIn', name: 'Zoom in', held: true },
  { id: 'zoomOut', name: 'Zoom out', held: true },
  { id: 'fullScreen', name: 'Full Screen' },
  { id: 'keys', name: 'Keys' },
  { id: 'resetView', name: 'Reset View' },
  { id: 'viewAll', name: 'View All' },
  { id: 'turnLeft', name: 'Turn left', repeats: true },
  { id: 'turnRight', name: 'Turn right', repeats: true },
  { id: 'tiltUp', name: 'Tilt up', repeats: true },
  { id: 'tiltDown', name: 'Tilt down', repeats: true },
  { id: 'previousView', name: 'Previous view', repeats: true },
  { id: 'nextView', name: 'Next view', repeats: true },
  { id: 'previousParameter', name: 'Previous parameter', repeats: true },
  { id: 'nextParameter', name: 'Next parameter', repeats: true },
  { id: 'previousGroup', name: 'Previous group' },
  { id: 'nextGroup', name: 'Next group' },
  { id: 'resetParameter', name: 'Reset parameter' },
  { id: 'generate', name: 'Generate' },
  { id: 'nextPreset', name: 'Next preset' },
];

/** A preset's table: every action, the ones not given unassigned. */
const presetTable = (given) =>
  Object.fromEntries(GAMEPAD_ACTIONS.map((a) => [a.id, given[a.id] ?? null]));

/**
 * The presets, named for what they drive, in the order the View button
 * steps through them:
 * - "Camera": the D-pad turns and tilts the view a step, the bumpers walk
 *   the six standard views, the triggers zoom by how far they are pressed,
 *   X resets the view and Y fits the model in it.
 * - "Customizer": the bumpers step from parameter to parameter, the
 *   triggers from group to group, the D-pad steps a slider or chooses in a
 *   list, X puts the parameter back to its default, Y generates.
 * - "Menus": the bumpers step from control to control as Tab does, the
 *   triggers jump between the window's parts, X and Y zoom.
 * In each, A presses, B goes back, Menu is Full Screen and View steps to
 * the next preset; the sticks always orbit and pan. Keys keeps the Help
 * menu, and a button when a person gives it one.
 */
export const GAMEPAD_PRESETS = {
  camera: {
    name: 'Camera',
    assignments: presetTable({
      activate: 'a',
      back: 'b',
      zoomIn: 'rt',
      zoomOut: 'lt',
      fullScreen: 'start',
      resetView: 'x',
      viewAll: 'y',
      turnLeft: 'left',
      turnRight: 'right',
      tiltUp: 'up',
      tiltDown: 'down',
      previousView: 'lb',
      nextView: 'rb',
      nextPreset: 'select',
    }),
  },
  customizer: {
    name: 'Customizer',
    assignments: presetTable({
      activate: 'a',
      back: 'b',
      up: 'up',
      down: 'down',
      left: 'left',
      right: 'right',
      fullScreen: 'start',
      previousParameter: 'lb',
      nextParameter: 'rb',
      previousGroup: 'lt',
      nextGroup: 'rt',
      resetParameter: 'x',
      generate: 'y',
      nextPreset: 'select',
    }),
  },
  menus: {
    name: 'Menus',
    assignments: presetTable({
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
      nextPreset: 'select',
    }),
  },
};

/** The presets in the order the View button steps through them. */
export const GAMEPAD_PRESET_ORDER = Object.freeze(Object.keys(GAMEPAD_PRESETS));

/** The preset a person starts with. */
export const DEFAULT_GAMEPAD_PRESET = 'camera';

/**
 * The City Walk's own actions, in its table's order. The sticks and the
 * D-pad are not among them: they always walk and look there.
 */
export const CITY_WALK_ACTIONS = [
  { id: 'map', name: 'Map' },
  { id: 'back', name: 'Back' },
  { id: 'help', name: 'Help' },
  { id: 'previousLandmark', name: 'Previous landmark' },
  { id: 'nextLandmark', name: 'Next landmark' },
  { id: 'walkTo', name: 'Walk to the landmark' },
  { id: 'autoWalk', name: 'Auto-walk' },
];

/** The City Walk's one preset: its buttons before anyone changes them. */
export const CITY_WALK_PRESETS = {
  walk: {
    name: 'City Walk buttons',
    assignments: {
      map: 'a',
      back: 'b',
      help: 'start',
      previousLandmark: 'lb',
      nextLandmark: 'rb',
      walkTo: 'rt',
      autoWalk: 'lt',
    },
  },
};

/** The inputs the City Walk's actions can take: every button but the D-pad. */
const CITY_WALK_INPUTS = GAMEPAD_BUTTON_NAMES.filter(
  (name) => !['up', 'down', 'left', 'right'].includes(name)
);

/** The controller families whose button names the Controller tab uses. */
export const GAMEPAD_FAMILIES = [
  { id: 'xbox', name: 'Xbox' },
  { id: 'playstation', name: 'PlayStation' },
  { id: 'nintendo', name: 'Nintendo' },
  { id: 'generic', name: 'Generic' },
];

/** Names every family shares. */
const COMMON_LABELS = {
  l3: 'Left stick press',
  r3: 'Right stick press',
  up: 'D-pad up',
  down: 'D-pad down',
  left: 'D-pad left',
  right: 'D-pad right',
  'ls-up': 'Left stick up',
  'ls-down': 'Left stick down',
  'ls-left': 'Left stick left',
  'ls-right': 'Left stick right',
  'rs-up': 'Right stick up',
  'rs-down': 'Right stick down',
  'rs-left': 'Right stick left',
  'rs-right': 'Right stick right',
};

/**
 * Each family's names for the buttons, by position in the standard mapping.
 * Nintendo prints A on the right button and B on the bottom one, the other
 * way round from Xbox.
 */
const FAMILY_LABELS = {
  xbox: {
    a: 'A',
    b: 'B',
    x: 'X',
    y: 'Y',
    lb: 'LB',
    rb: 'RB',
    lt: 'LT',
    rt: 'RT',
    select: 'View',
    start: 'Menu',
    home: 'Xbox button',
  },
  playstation: {
    a: 'Cross',
    b: 'Circle',
    x: 'Square',
    y: 'Triangle',
    lb: 'L1',
    rb: 'R1',
    lt: 'L2',
    rt: 'R2',
    select: 'Create',
    start: 'Options',
    l3: 'L3',
    r3: 'R3',
    home: 'PS button',
  },
  nintendo: {
    a: 'B',
    b: 'A',
    x: 'Y',
    y: 'X',
    lb: 'L',
    rb: 'R',
    lt: 'ZL',
    rt: 'ZR',
    select: 'Minus',
    start: 'Plus',
    home: 'Home',
  },
  generic: {
    a: 'Bottom button',
    b: 'Right button',
    x: 'Left button',
    y: 'Top button',
    lb: 'Left bumper',
    rb: 'Right bumper',
    lt: 'Left trigger',
    rt: 'Right trigger',
    select: 'Left center button',
    start: 'Right center button',
    home: 'Center button',
  },
};

/**
 * The short words on the Controller tab's picture of a controller, by part.
 * The picture is hidden from assistive technology: the list of actions
 * beside it names every button in full.
 */
const DIAGRAM_LABELS = {
  xbox: {
    a: 'A',
    b: 'B',
    x: 'X',
    y: 'Y',
    lb: 'LB',
    rb: 'RB',
    lt: 'LT',
    rt: 'RT',
    select: 'View',
    start: 'Menu',
  },
  playstation: {
    a: '✕',
    b: '○',
    x: '□',
    y: '△',
    lb: 'L1',
    rb: 'R1',
    lt: 'L2',
    rt: 'R2',
    select: 'Create',
    start: 'Options',
  },
  nintendo: {
    a: 'B',
    b: 'A',
    x: 'Y',
    y: 'X',
    lb: 'L',
    rb: 'R',
    lt: 'ZL',
    rt: 'ZR',
    select: '−',
    start: '+',
  },
  generic: {
    a: '',
    b: '',
    x: '',
    y: '',
    lb: 'Bumper',
    rb: 'Bumper',
    lt: 'Trigger',
    rt: 'Trigger',
    select: '',
    start: '',
  },
};

/**
 * The family a pad belongs to, from the name and maker the browser reports
 * (Microsoft 045e, Sony 054c, Nintendo 057e).
 * @param {string} [id] - the pad's `id`
 * @returns {'xbox'|'playstation'|'nintendo'|'generic'}
 */
export function gamepadFamilyFromId(id) {
  const text = String(id || '').toLowerCase();
  if (/xbox|xinput|vendor: 045e|^045e-/.test(text)) return 'xbox';
  if (/dualsense|dualshock|playstation|vendor: 054c|^054c-/.test(text)) {
    return 'playstation';
  }
  if (/nintendo|pro controller|joy-con|vendor: 057e|^057e-/.test(text)) {
    return 'nintendo';
  }
  return 'generic';
}

/**
 * An input's name as its family prints it.
 * @param {string|null} input
 * @param {string} family
 * @returns {string}
 */
export function gamepadInputLabel(input, family) {
  if (!input) return 'Not assigned';
  return (
    FAMILY_LABELS[family]?.[input] ??
    COMMON_LABELS[input] ??
    FAMILY_LABELS.generic[input] ??
    input
  );
}

/**
 * The short word on the controller picture's part.
 * @param {string} part
 * @param {string} family
 * @returns {string}
 */
export function gamepadDiagramLabel(part, family) {
  return (DIAGRAM_LABELS[family] ?? DIAGRAM_LABELS.generic)[part] ?? '';
}

/**
 * A preset's assignments for a family. On a Nintendo pad the button printed
 * A activates and the one printed B goes back, as Nintendo's own menus do.
 * @param {string} presetId
 * @param {string} family
 * @param {Object} [presets] - the table of presets, the app's by default
 * @param {string} [defaultPreset]
 * @returns {Object<string, string|null>} action id to input
 */
export function presetAssignments(
  presetId,
  family,
  presets = GAMEPAD_PRESETS,
  defaultPreset = DEFAULT_GAMEPAD_PRESET
) {
  const preset = presets[presetId] ?? presets[defaultPreset];
  const table = { ...preset.assignments };
  if (family === 'nintendo') {
    for (const [action, input] of Object.entries(table)) {
      if (input === 'a') table[action] = 'b';
      else if (input === 'b') table[action] = 'a';
    }
  }
  return table;
}

const FAMILY_IDS = GAMEPAD_FAMILIES.map((f) => f.id);

/**
 * A person's own table, when every action in it names an input it may take
 * (or none) and no input is used twice; anything else is not kept.
 * @param {unknown} table
 * @param {string[]} actionIds
 * @param {string[]} inputs
 * @returns {Object<string, string|null>|null}
 */
function validAssignments(table, actionIds, inputs) {
  if (!table || typeof table !== 'object') return null;
  const seen = new Set();
  const out = {};
  for (const id of actionIds) {
    const input = table[id] ?? null;
    if (input !== null) {
      if (!inputs.includes(input) || seen.has(input)) return null;
      seen.add(input);
    }
    out[id] = input;
  }
  return out;
}

/**
 * The saved controller mapping: the preset, the family when a person chose
 * one (else it follows the pad), and a person's own assignments when they
 * changed any. The app's by default; the City Walk's table is the same
 * thing with its own actions, preset, inputs and key.
 * @param {Object} [options]
 * @param {() => string} [options.getPadId]
 * @param {() => string|null} [options.getFamily] - the family to follow
 *   when this table has none chosen, before the pad's own
 * @param {{id: string}[]} [options.actions]
 * @param {Object} [options.presets]
 * @param {string} [options.defaultPreset]
 * @param {string[]} [options.inputs] - the inputs an action may take
 * @param {string} [options.storageKey]
 */
export function createGamepadMapping({
  getPadId = () => '',
  getFamily = () => null,
  actions = GAMEPAD_ACTIONS,
  presets = GAMEPAD_PRESETS,
  defaultPreset = DEFAULT_GAMEPAD_PRESET,
  inputs = GAMEPAD_INPUT_NAMES,
  storageKey = STORAGE_KEY_GAMEPAD_MAPPING,
} = {}) {
  const actionIds = actions.map((a) => a.id);
  const presetOrder = Object.keys(presets);
  const listeners = new Set();
  let saved = read();

  function read() {
    const raw = safeGetItem(storageKey);
    let data = null;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch (error) {
        // A damaged value starts over from the default preset; the next
        // change writes a good one.
        console.warn(
          '[Gamepad] The saved controller mapping is unreadable:',
          error
        );
      }
    }
    return {
      preset: presets[data?.preset] ? data.preset : defaultPreset,
      family: FAMILY_IDS.includes(data?.family) ? data.family : null,
      custom: validAssignments(data?.custom, actionIds, inputs),
    };
  }

  function write() {
    safeSetItem(storageKey, JSON.stringify(saved));
    for (const listener of listeners) listener();
  }

  function get() {
    const family =
      saved.family ?? getFamily() ?? gamepadFamilyFromId(getPadId());
    return {
      preset: saved.preset,
      family,
      familyChosen: saved.family !== null,
      assignments:
        saved.custom ??
        presetAssignments(saved.preset, family, presets, defaultPreset),
    };
  }

  return {
    get,

    /**
     * Give an action an input. An action that had the input takes this
     * action's old one, so every action stays reachable.
     * @param {string} actionId
     * @param {string} input
     * @returns {{assigned: boolean, swappedWith: string|null}} `assigned`
     *   false when the action or the input is not this table's to take
     */
    assign(actionId, input) {
      if (!actionIds.includes(actionId) || !inputs.includes(input)) {
        return { assigned: false, swappedWith: null };
      }
      const current = get().assignments;
      const next = { ...current };
      let swappedWith = null;
      for (const [id, held] of Object.entries(current)) {
        if (id !== actionId && held === input) {
          next[id] = current[actionId];
          swappedWith = id;
        }
      }
      next[actionId] = input;
      saved = { ...saved, custom: next };
      write();
      return { assigned: true, swappedWith };
    },

    /** Start from a preset's own table. */
    setPreset(presetId) {
      if (!presets[presetId]) return;
      saved = { ...saved, preset: presetId, custom: null };
      write();
    },

    /**
     * The next preset in their order, round again, from its own table.
     * @returns {string} the preset now on
     */
    nextPreset() {
      const at = presetOrder.indexOf(saved.preset);
      const next = presetOrder[(at + 1) % presetOrder.length];
      saved = { ...saved, preset: next, custom: null };
      write();
      return next;
    },

    /** Name the buttons as a family does; a person's own table is kept. */
    setFamily(family) {
      if (!FAMILY_IDS.includes(family)) return;
      saved = { ...saved, family };
      write();
    },

    /** Drop a person's changes: the preset's table again. */
    reset() {
      saved = { ...saved, custom: null };
      write();
    },

    /** @param {() => void} listener @returns {() => void} unsubscribe */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * The City Walk's table, kept apart from the app's: its seven actions, its
 * one preset, every button but the D-pad.
 * @param {{getPadId?: () => string, getFamily?: () => string|null}} [options]
 */
export function createWalkMapping({ getPadId, getFamily } = {}) {
  return createGamepadMapping({
    getPadId,
    getFamily,
    actions: CITY_WALK_ACTIONS,
    presets: CITY_WALK_PRESETS,
    defaultPreset: 'walk',
    inputs: CITY_WALK_INPUTS,
    storageKey: STORAGE_KEY_GAMEPAD_WALK_MAPPING,
  });
}

/**
 * Default action bindings: the inputs that move the view. The zoom inputs
 * follow the default preset's assignments.
 */
export const DEFAULT_GAMEPAD_ACTIONS = {
  // The right stick orbits, the left stick pans.
  cameraRotateX: 'rightStickX',
  cameraRotateY: 'rightStickY',
  cameraPanX: 'leftStickX',
  cameraPanY: 'leftStickY',
  cameraZoomIn: GAMEPAD_PRESETS[DEFAULT_GAMEPAD_PRESET].assignments.zoomIn,
  cameraZoomOut: GAMEPAD_PRESETS[DEFAULT_GAMEPAD_PRESET].assignments.zoomOut,

  // Speed modifiers, unbound until a person assigns them: held, they move
  // the view at 0.3 times or 2 times the usual speed.
  fineAdjust: null,
  fastAdjust: null,
};

/**
 * Gamepad state
 */
class GamepadState {
  constructor() {
    this.connected = false;
    this.gamepadIndex = null;
    this.buttons = new Array(17).fill(false);
    this.axes = new Array(4).fill(0);
    this.lastButtons = new Array(17).fill(false);
    this.lastAxes = new Array(4).fill(0);
  }

  update(gamepad) {
    if (!gamepad) {
      this.connected = false;
      return;
    }

    this.connected = true;
    this.gamepadIndex = gamepad.index;

    // Store previous state for edge detection
    this.lastButtons = [...this.buttons];
    this.lastAxes = [...this.axes];

    // Update current state
    this.buttons = gamepad.buttons.map((b) =>
      typeof b === 'object' ? b.pressed : b > 0.5
    );
    this.axes = [...gamepad.axes];
  }

  isButtonPressed(index) {
    return this.buttons[index] === true;
  }

  isButtonJustPressed(index) {
    return this.buttons[index] && !this.lastButtons[index];
  }

  isButtonJustReleased(index) {
    return !this.buttons[index] && this.lastButtons[index];
  }

  getAxis(index, deadzone = 0.15) {
    const value = this.axes[index] || 0;
    return Math.abs(value) < deadzone ? 0 : value;
  }

  /**
   * A stick axis past its dead zone, scaled so the dead zone's edge is 0 and
   * a full push is 1: a small push moves the view slowly, not at once at
   * 15 percent.
   * @param {number} index
   * @param {number} deadzone
   * @returns {number} -1 to 1
   */
  getShapedAxis(index, deadzone = 0.15) {
    const value = this.axes[index] || 0;
    const size = Math.abs(value);
    if (size < deadzone) return 0;
    return Math.sign(value) * Math.min(1, (size - deadzone) / (1 - deadzone));
  }

  getButtonValue(index) {
    // For analog triggers
    const gamepad = navigator.getGamepads()[this.gamepadIndex];
    if (gamepad?.buttons[index]) {
      const button = gamepad.buttons[index];
      return typeof button === 'object' ? button.value : button;
    }
    return 0;
  }
}

/**
 * GamepadController class
 * Manages gamepad input and action dispatch
 */
export class GamepadController {
  constructor(options = {}) {
    this.enabled = false;
    this.state = new GamepadState();
    this.mappings = { ...DEFAULT_GAMEPAD_MAPPINGS, ...options.mappings };
    this.actions = { ...DEFAULT_GAMEPAD_ACTIONS, ...options.actions };
    this.callbacks = {};
    this.animationFrameId = null;
    this.pollInterval = options.pollInterval || 16; // ~60fps
    this.deadzone = options.deadzone || 0.15;

    // Sensitivity settings: camera multiplies the per-second view rates
    this.sensitivity = {
      camera: options.cameraSensitivity || 1.0,
      parameter: options.parameterSensitivity || 1.0,
    };

    // When the last poll ran, for per-second rates
    this._lastPollAt = null;

    // Seconds until each held input repeats (absent: not held)
    this._repeatIn = {};

    // The pending capture of one input, while the Controller tab waits
    this._capture = null;

    // Bound event handlers
    this._onGamepadConnected = this._onGamepadConnected.bind(this);
    this._onGamepadDisconnected = this._onGamepadDisconnected.bind(this);
    this._pollGamepads = this._pollGamepads.bind(this);
  }

  /**
   * Follow a person's assignments: the zoom actions read their inputs. The
   * other actions are the app's to run from `input` events.
   * @param {Object<string, string|null>} assignments - action id to input
   */
  setAssignments(assignments = {}) {
    this.actions = {
      ...this.actions,
      cameraZoomIn: assignments.zoomIn ?? null,
      cameraZoomOut: assignments.zoomOut ?? null,
    };
  }

  /**
   * Wait for the next button pressed or stick pushed, and tell nothing else
   * about it. A button already held when the wait starts does not count.
   * @param {number} [timeoutMs]
   * @returns {Promise<string|null>} the input's name, or null after the
   *   time limit or a cancel
   */
  captureNextInput(timeoutMs = 5000) {
    this.cancelCapture();
    return new Promise((resolve) => {
      const timer = setTimeout(() => finish(null), timeoutMs);
      const finish = (input) => {
        clearTimeout(timer);
        if (this._capture?.finish === finish) this._capture = null;
        resolve(input);
      };
      this._capture = { finish };
    });
  }

  /** Stop waiting for an input; the wait resolves with null. */
  cancelCapture() {
    this._capture?.finish(null);
  }

  /**
   * Initialize gamepad support
   * @returns {boolean} True if Gamepad API is supported
   */
  init() {
    if (!navigator.getGamepads) {
      console.log('[Gamepad] Gamepad API not supported');
      return false;
    }

    // Add event listeners
    window.addEventListener('gamepadconnected', this._onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this._onGamepadDisconnected);

    // Check for already-connected gamepads
    const gamepads = navigator.getGamepads();
    for (const gamepad of gamepads) {
      if (gamepad) {
        this._onGamepadConnected({ gamepad });
        break;
      }
    }

    console.log('[Gamepad] Controller initialized');
    return true;
  }

  /**
   * Start the input polling loop
   */
  start() {
    if (this.enabled) return;

    this.enabled = true;
    this._pollGamepads();
    console.log('[Gamepad] Input polling started');
  }

  /**
   * Stop the input polling loop
   */
  stop() {
    this.enabled = false;
    this._lastPollAt = null;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    console.log('[Gamepad] Input polling stopped');
  }

  /**
   * Destroy the controller and clean up
   */
  destroy() {
    this.stop();
    this.cancelCapture();
    window.removeEventListener('gamepadconnected', this._onGamepadConnected);
    window.removeEventListener(
      'gamepaddisconnected',
      this._onGamepadDisconnected
    );
    this.callbacks = {};
  }

  /**
   * Register a callback for an action
   * @param {string} action - Action name
   * @param {Function} callback - Callback function
   */
  on(action, callback) {
    if (!this.callbacks[action]) {
      this.callbacks[action] = [];
    }
    this.callbacks[action].push(callback);
  }

  /**
   * Remove a callback for an action
   * @param {string} action - Action name
   * @param {Function} callback - Callback function to remove
   */
  off(action, callback) {
    if (this.callbacks[action]) {
      this.callbacks[action] = this.callbacks[action].filter(
        (cb) => cb !== callback
      );
    }
  }

  /**
   * Emit an action
   * @param {string} action - Action name
   * @param {*} data - Action data
   */
  emit(action, data) {
    if (this.callbacks[action]) {
      for (const callback of this.callbacks[action]) {
        try {
          callback(data);
        } catch (error) {
          console.error(`[Gamepad] Error in ${action} callback:`, error);
        }
      }
    }
  }

  /**
   * Check if a gamepad is connected
   * @returns {boolean}
   */
  isConnected() {
    return this.state.connected;
  }

  /**
   * Get gamepad info
   * @returns {Object|null}
   */
  getGamepadInfo() {
    if (!this.state.connected || this.state.gamepadIndex === null) {
      return null;
    }

    const gamepad = navigator.getGamepads()[this.state.gamepadIndex];
    if (!gamepad) return null;

    return {
      id: gamepad.id,
      index: gamepad.index,
      mapping: gamepad.mapping,
      buttons: gamepad.buttons.length,
      axes: gamepad.axes.length,
    };
  }

  /**
   * Handle gamepad connected event
   * @private
   */
  _onGamepadConnected(event) {
    console.log('[Gamepad] Connected:', event.gamepad.id);
    this.state.gamepadIndex = event.gamepad.index;
    this.emit('connected', this.getGamepadInfo());

    // Auto-start polling
    if (!this.enabled) {
      this.start();
    }
  }

  /**
   * Handle gamepad disconnected event
   * @private
   */
  _onGamepadDisconnected(event) {
    console.log('[Gamepad] Disconnected:', event.gamepad.id);
    this.state.connected = false;
    this.state.gamepadIndex = null;
    this.emit('disconnected', { id: event.gamepad.id });
  }

  /**
   * Poll gamepads and dispatch actions
   * @private
   */
  _pollGamepads(now) {
    if (!this.enabled) return;
    const at = typeof now === 'number' ? now : performance.now();
    const elapsed =
      this._lastPollAt === null
        ? 0
        : Math.min(MAX_STEP_S, Math.max(0, (at - this._lastPollAt) / 1000));
    this._lastPollAt = at;

    // Get current gamepad state
    const gamepads = navigator.getGamepads();
    const gamepad =
      this.state.gamepadIndex !== null
        ? gamepads[this.state.gamepadIndex]
        : gamepads.find((g) => g !== null);

    this.state.update(gamepad);

    if (this.state.connected) {
      this._processInput(elapsed);
    }

    // Schedule next poll
    this.animationFrameId = requestAnimationFrame(this._pollGamepads);
  }

  /**
   * Whether an input is pressed: a button down, or a stick pushed past
   * halfway in that direction.
   * @param {string} name
   * @returns {boolean}
   * @private
   */
  _inputDown(name) {
    const stick = STICK_INPUTS[name];
    if (stick) {
      const [axis, direction] = stick;
      return (this.state.axes[axis] || 0) * direction > STICK_PRESS;
    }
    return this.state.isButtonPressed(GAMEPAD_BUTTON_NAMES.indexOf(name));
  }

  /**
   * How far an input is pressed, 0 to 1: a trigger by its depth, a digital
   * button 0 or 1, a stick push past its dead zone.
   * @param {string|null} name
   * @returns {number}
   * @private
   */
  _inputValue(name) {
    if (!name) return 0;
    const stick = STICK_INPUTS[name];
    if (stick) {
      const [axis, direction] = stick;
      return Math.max(
        0,
        this.state.getShapedAxis(axis, this.deadzone) * direction
      );
    }
    const index = GAMEPAD_BUTTON_NAMES.indexOf(name);
    if (index < 0) return 0;
    const value = this.state.getButtonValue(index);
    if (typeof value === 'number' && value > 0) return value;
    return this.state.isButtonPressed(index) ? 1 : 0;
  }

  /**
   * Process input and emit actions. The camera's events carry how far to
   * move in this step: `camera:rotate` degrees (x right, y up),
   * `camera:pan` and `camera:zoom` shares of the camera's distance (pan x
   * right and y up; zoom positive in). Each press of a button or push of a
   * stick is told as `input` ({ name, repeat }), and again while held.
   * While a capture waits, the first new press goes to it and nothing else
   * is told.
   * @param {number} [elapsed] - seconds since the last poll
   * @private
   */
  _processInput(elapsed = 0) {
    const { state, mappings, actions, deadzone } = this;
    const capturing = this._capture !== null;
    const pressed = (action) =>
      actions[action] != null &&
      state.getButtonValue(mappings[actions[action]]) > 0.5;
    const axis = (action) =>
      actions[action] == null
        ? 0
        : state.getShapedAxis(mappings[actions[action]], deadzone);

    let speed = 1;
    if (pressed('fineAdjust')) speed = 0.3;
    if (pressed('fastAdjust')) speed = 2;
    const step = capturing ? 0 : elapsed * speed * this.sensitivity.camera;

    // The right stick orbits. A stick reads negative when pushed up, so its
    // vertical axis is turned over: up turns the view up.
    const orbitX = axis('cameraRotateX');
    const orbitY = -axis('cameraRotateY');
    if ((orbitX !== 0 || orbitY !== 0) && step > 0) {
      this.emit('camera:rotate', {
        x: orbitX * ORBIT_DEG_PER_S * step,
        y: orbitY * ORBIT_DEG_PER_S * step,
      });
    }

    // The left stick pans, both ways, up moving the view up.
    const panX = axis('cameraPanX');
    const panY = -axis('cameraPanY');
    if ((panX !== 0 || panY !== 0) && step > 0) {
      this.emit('camera:pan', {
        x: panX * PAN_SHARE_PER_S * step,
        y: panY * PAN_SHARE_PER_S * step,
      });
    }

    // The zoom inputs zoom by how far they are pressed; a button that is
    // only on or off zooms at full speed.
    const zoom =
      this._inputValue(actions.cameraZoomIn) -
      this._inputValue(actions.cameraZoomOut);
    if (zoom !== 0 && step > 0) {
      this.emit('camera:zoom', { delta: zoom * ZOOM_SHARE_PER_S * step });
    }

    for (const name of GAMEPAD_INPUT_NAMES) {
      if (!this._inputDown(name)) {
        delete this._repeatIn[name];
        continue;
      }
      if (this._repeatIn[name] === undefined) {
        this._repeatIn[name] = INPUT_REPEAT_DELAY_S;
        if (this._capture) {
          this._capture.finish(name);
        } else if (!capturing) {
          this.emit('input', { name, repeat: false });
        }
        continue;
      }
      this._repeatIn[name] -= elapsed;
      if (this._repeatIn[name] <= 1e-9) {
        this._repeatIn[name] += INPUT_REPEAT_S;
        if (!capturing) this.emit('input', { name, repeat: true });
      }
    }
  }

  /**
   * Update sensitivity settings
   * @param {Object} settings - { camera?: number, parameter?: number };
   *   camera multiplies the view's per-second rates (1 is 90 degrees a second)
   */
  setSensitivity(settings) {
    if (settings.camera !== undefined) {
      this.sensitivity.camera = settings.camera;
    }
    if (settings.parameter !== undefined) {
      this.sensitivity.parameter = settings.parameter;
    }
  }

  /**
   * Update deadzone setting
   * @param {number} value - Deadzone value (0-1)
   */
  setDeadzone(value) {
    this.deadzone = Math.max(0, Math.min(1, value));
  }
}

/**
 * Create and initialize a gamepad controller instance
 * @param {Object} options - Controller options
 * @returns {GamepadController}
 */
export function createGamepadController(options = {}) {
  const controller = new GamepadController(options);
  controller.init();
  return controller;
}

/**
 * Check if Gamepad API is supported
 * @returns {boolean}
 */
export function isGamepadSupported() {
  return 'getGamepads' in navigator;
}
