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
 * Default action bindings
 */
export const DEFAULT_GAMEPAD_ACTIONS = {
  // Camera controls (right stick)
  cameraRotateX: 'rightStickX',
  cameraRotateY: 'rightStickY',
  cameraZoom: 'leftStickY',
  cameraPan: 'leftStickX',

  // Parameter navigation (d-pad)
  parameterNext: 'dpadDown',
  parameterPrev: 'dpadUp',
  parameterIncrease: 'dpadRight',
  parameterDecrease: 'dpadLeft',

  // Actions (face buttons)
  render: 'buttonA',
  download: 'buttonX',
  togglePreview: 'buttonY',
  cancel: 'buttonB',

  // Modifiers (triggers)
  fineAdjust: 'leftTrigger', // Hold for fine parameter adjustment
  fastAdjust: 'rightTrigger', // Hold for fast parameter adjustment
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

    // Sensitivity settings
    this.sensitivity = {
      camera: options.cameraSensitivity || 2.0,
      parameter: options.parameterSensitivity || 1.0,
    };

    // Bound event handlers
    this._onGamepadConnected = this._onGamepadConnected.bind(this);
    this._onGamepadDisconnected = this._onGamepadDisconnected.bind(this);
    this._pollGamepads = this._pollGamepads.bind(this);
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
  _pollGamepads() {
    if (!this.enabled) return;

    // Get current gamepad state
    const gamepads = navigator.getGamepads();
    const gamepad =
      this.state.gamepadIndex !== null
        ? gamepads[this.state.gamepadIndex]
        : gamepads.find((g) => g !== null);

    this.state.update(gamepad);

    if (this.state.connected) {
      this._processInput();
    }

    // Schedule next poll
    this.animationFrameId = requestAnimationFrame(this._pollGamepads);
  }

  /**
   * Process input and emit actions
   * @private
   */
  _processInput() {
    const { state, mappings, actions, deadzone, sensitivity } = this;

    // Get modifier states for sensitivity adjustment
    const fineAdjust = state.getButtonValue(mappings[actions.fineAdjust]) > 0.5;
    const fastAdjust = state.getButtonValue(mappings[actions.fastAdjust]) > 0.5;

    let adjustMultiplier = 1.0;
    if (fineAdjust) adjustMultiplier = 0.2;
    if (fastAdjust) adjustMultiplier = 3.0;

    // Camera rotation (right stick)
    const cameraX = state.getAxis(mappings[actions.cameraRotateX], deadzone);
    const cameraY = state.getAxis(mappings[actions.cameraRotateY], deadzone);
    if (cameraX !== 0 || cameraY !== 0) {
      this.emit('camera:rotate', {
        x: cameraX * sensitivity.camera * adjustMultiplier,
        y: cameraY * sensitivity.camera * adjustMultiplier,
      });
    }

    // Camera zoom/pan (left stick)
    const zoom = state.getAxis(mappings[actions.cameraZoom], deadzone);
    const pan = state.getAxis(mappings[actions.cameraPan], deadzone);
    if (zoom !== 0) {
      this.emit('camera:zoom', {
        delta: zoom * sensitivity.camera * adjustMultiplier,
      });
    }
    if (pan !== 0) {
      this.emit('camera:pan', {
        x: pan * sensitivity.camera * adjustMultiplier,
      });
    }

    // Parameter navigation (d-pad)
    if (state.isButtonJustPressed(mappings[actions.parameterNext])) {
      this.emit('parameter:next', {});
    }
    if (state.isButtonJustPressed(mappings[actions.parameterPrev])) {
      this.emit('parameter:prev', {});
    }

    // Parameter adjustment (d-pad left/right)
    if (state.isButtonPressed(mappings[actions.parameterIncrease])) {
      this.emit('parameter:change', {
        delta: sensitivity.parameter * adjustMultiplier,
      });
    }
    if (state.isButtonPressed(mappings[actions.parameterDecrease])) {
      this.emit('parameter:change', {
        delta: -sensitivity.parameter * adjustMultiplier,
      });
    }

    // Action buttons
    if (state.isButtonJustPressed(mappings[actions.render])) {
      this.emit('action:render', {});
    }
    if (state.isButtonJustPressed(mappings[actions.download])) {
      this.emit('action:download', {});
    }
    if (state.isButtonJustPressed(mappings[actions.togglePreview])) {
      this.emit('action:togglePreview', {});
    }
    if (state.isButtonJustPressed(mappings[actions.cancel])) {
      this.emit('action:cancel', {});
    }
  }

  /**
   * Update sensitivity settings
   * @param {Object} settings - { camera?: number, parameter?: number }
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
