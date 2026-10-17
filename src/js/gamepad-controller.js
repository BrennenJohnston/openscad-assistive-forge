/**
 * Gamepad Controller
 * Provides gamepad support for 3D navigation and parameter control
 * @license GPL-3.0-or-later
 */

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

/** The D-pad's buttons in the standard mapping, and their directions. */
const DPAD_DIRECTIONS = [
  [12, 'up'],
  [13, 'down'],
  [14, 'left'],
  [15, 'right'],
];

/** The D-pad's directions, as its `dpad:<direction>` events name them. */
export const DPAD_DIRECTION_NAMES = DPAD_DIRECTIONS.map(([, d]) => d);

/**
 * A held D-pad direction repeats, as a held arrow key does: once at the
 * press, again after the wait, then at the interval. The wait keeps a slow
 * press from stepping twice.
 */
export const DPAD_REPEAT_DELAY_S = 0.5;
export const DPAD_REPEAT_S = 0.15;

/**
 * The presets: which inputs move the view (`actions`) and what each button
 * does (`buttons`, a button's name to a command the app runs). The D-pad
 * sends the arrow keys in both.
 * - "Menus first": the bumpers step from control to control as Tab does,
 *   the triggers jump between the window's parts, X and Y zoom.
 * - "Camera first": the triggers zoom by how far they are pressed; X resets
 *   the view and Y fits the model in it.
 */
export const GAMEPAD_PRESETS = {
  menus: {
    actions: { cameraZoomOut: 'buttonX', cameraZoomIn: 'buttonY' },
    buttons: {
      lb: 'previous',
      rb: 'next',
      lt: 'previousRegion',
      rt: 'nextRegion',
      a: 'activate',
      b: 'back',
      start: 'fullScreen',
      select: 'keys',
    },
  },
  camera: {
    actions: { cameraZoomOut: 'leftTrigger', cameraZoomIn: 'rightTrigger' },
    buttons: {
      lb: 'previous',
      rb: 'next',
      a: 'activate',
      b: 'back',
      x: 'resetView',
      y: 'viewAll',
      start: 'fullScreen',
      select: 'keys',
    },
  },
};

/** The preset a person starts with. */
export const DEFAULT_GAMEPAD_PRESET = 'menus';

/**
 * Default action bindings: the inputs that move the view, as the default
 * preset sets them.
 */
export const DEFAULT_GAMEPAD_ACTIONS = {
  // The right stick orbits, the left stick pans.
  cameraRotateX: 'rightStickX',
  cameraRotateY: 'rightStickY',
  cameraPanX: 'leftStickX',
  cameraPanY: 'leftStickY',
  cameraZoomOut: null,
  cameraZoomIn: null,

  // Speed modifiers, unbound until a person assigns them: held, they move
  // the view at 0.3 times or 2 times the usual speed.
  fineAdjust: null,
  fastAdjust: null,

  ...GAMEPAD_PRESETS[DEFAULT_GAMEPAD_PRESET].actions,
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

    // Seconds until each held D-pad direction repeats (null: not held)
    this._dpadRepeatIn = { up: null, down: null, left: null, right: null };

    // Bound event handlers
    this._onGamepadConnected = this._onGamepadConnected.bind(this);
    this._onGamepadDisconnected = this._onGamepadDisconnected.bind(this);
    this._pollGamepads = this._pollGamepads.bind(this);
  }

  /**
   * Choose which inputs move the view, over the defaults: a preset's
   * `actions`, or a person's own.
   * @param {Object} actions - action name to input name (null unbinds)
   */
  setActions(actions = {}) {
    this.actions = { ...DEFAULT_GAMEPAD_ACTIONS, ...actions };
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
   * Process input and emit actions. The camera's events carry how far to
   * move in this step: `camera:rotate` degrees (x right, y up),
   * `camera:pan` and `camera:zoom` shares of the camera's distance (pan x
   * right and y up; zoom positive in).
   * @param {number} [elapsed] - seconds since the last poll
   * @private
   */
  _processInput(elapsed = 0) {
    const { state, mappings, actions, deadzone } = this;
    const pressed = (action) =>
      actions[action] != null &&
      state.getButtonValue(mappings[actions[action]]) > 0.5;
    const axis = (action) =>
      actions[action] == null
        ? 0
        : state.getShapedAxis(mappings[actions[action]], deadzone);
    const trigger = (action) =>
      actions[action] == null
        ? 0
        : state.getButtonValue(mappings[actions[action]]) || 0;

    let speed = 1;
    if (pressed('fineAdjust')) speed = 0.3;
    if (pressed('fastAdjust')) speed = 2;
    const step = elapsed * speed * this.sensitivity.camera;

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

    // The triggers zoom by how far they are pressed; a trigger that is only
    // on or off zooms at full speed.
    const zoom = trigger('cameraZoomIn') - trigger('cameraZoomOut');
    if (zoom !== 0 && step > 0) {
      this.emit('camera:zoom', { delta: zoom * ZOOM_SHARE_PER_S * step });
    }

    // Every other button tells its press once, by name (`button:a`); what
    // it does is the preset's to say.
    GAMEPAD_BUTTON_NAMES.forEach((name, index) => {
      if (index >= 12 && index <= 15) return;
      if (state.isButtonJustPressed(index)) {
        this.emit(`button:${name}`, { name });
      }
    });

    // The D-pad tells a press at once (`dpad:up`), and a held direction
    // again after the wait, then at the interval.
    for (const [index, direction] of DPAD_DIRECTIONS) {
      if (!state.isButtonPressed(index)) {
        this._dpadRepeatIn[direction] = null;
        continue;
      }
      if (this._dpadRepeatIn[direction] === null) {
        this._dpadRepeatIn[direction] = DPAD_REPEAT_DELAY_S;
        this.emit(`dpad:${direction}`, { direction, repeat: false });
        continue;
      }
      this._dpadRepeatIn[direction] -= elapsed;
      if (this._dpadRepeatIn[direction] <= 1e-9) {
        this._dpadRepeatIn[direction] += DPAD_REPEAT_S;
        this.emit(`dpad:${direction}`, { direction, repeat: true });
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

  /**
   * Remap a button or axis
   * @param {string} action - Action to remap
   * @param {string} input - New input binding
   */
  remap(action, input) {
    if (this.actions[action] !== undefined) {
      this.actions[action] = input;
    }
  }

  /**
   * Get current mappings
   * @returns {Object}
   */
  getMappings() {
    return { ...this.actions };
  }

  /**
   * Reset to default mappings
   */
  resetMappings() {
    this.actions = { ...DEFAULT_GAMEPAD_ACTIONS };
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
