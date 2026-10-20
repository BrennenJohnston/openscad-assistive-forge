/**
 * The Keys dialog's Controller tab: the status line, the layout and preset
 * pickers, one row per action with its button and a Change button that waits
 * for one press, and a readout of what the browser reads from the pad. Once
 * the game is found, a second table holds its own buttons.
 *
 * The readout's lines follow the pad on every frame while the tab is shown.
 * A press still does what it is assigned to do, so a test takes each press
 * for itself while it runs: then a press only shows here and is spoken once,
 * and B, for one, can be tested without closing the dialog.
 * @license GPL-3.0-or-later
 */

import {
  CITY_WALK_ACTIONS,
  CITY_WALK_PRESETS,
  GAMEPAD_ACTIONS,
  GAMEPAD_BUTTON_NAMES,
  GAMEPAD_PRESETS,
  gamepadDiagramLabel,
  gamepadInputLabel,
  preferredPad,
} from './gamepad-controller.js';

/**
 * @typedef {Object} ControllerPanelHandlers
 * @property {() => {supported: boolean, padName: string|null}} [getGamepadStatus]
 * @property {GamepadHandlers} [gamepad]
 * @property {ReturnType<typeof import('./gamepad-controller.js').createWalkMapping>} [walkMapping]
 */

/**
 * @typedef {Object} GamepadHandlers
 * @property {ReturnType<typeof import('./gamepad-controller.js').createGamepadMapping>} mapping
 * @property {(timeoutMs: number) => Promise<string|null>} capture - waits
 *   for one press on the controller, which nothing else is told about
 * @property {() => void} cancelCapture
 * @property {(text: string) => void} announce
 */

/** How long Change waits for a press, in milliseconds. */
const GAMEPAD_CAPTURE_MS = 5000;
const GAMEPAD_CAPTURE_PROMPT =
  'Press a button on your controller. Esc cancels.';

/** A test ends after this long without a press, in milliseconds. */
export const READOUT_TEST_MS = 10000;
/** The shortest time between two spoken readouts, in milliseconds. */
export const READOUT_SPEAK_MS = 250;
/** A stick or an extra axis counts as moved past this. */
const READOUT_AXIS_MIN = 0.15;
/** The triggers, whose value is shown with their name. */
const TRIGGER_INDEXES = new Set([6, 7]);
const STICKS = [
  { id: 'ls', name: 'Left stick', axes: [0, 1] },
  { id: 'rs', name: 'Right stick', axes: [2, 3] },
];

/** @returns {HTMLElement|null} */
const el = (id) => document.getElementById(id);

/**
 * The tab's two tables: the app's, and the game's own, each with its
 * actions, its presets, its mapping and the prefix of its ids.
 */
const TABLES = [
  {
    prefix: 'prefsGamepad',
    actions: GAMEPAD_ACTIONS,
    presets: GAMEPAD_PRESETS,
    mapping: () => handlers.gamepad?.mapping,
  },
  {
    prefix: 'keysWalk',
    actions: CITY_WALK_ACTIONS,
    presets: CITY_WALK_PRESETS,
    mapping: () => handlers.walkMapping,
  },
];

/** @type {ControllerPanelHandlers} */
let handlers = {};
let wired = false;

/** The table and action whose Change button waits for a press, if any. */
let capturing = null;

const readout = {
  frame: null,
  padKey: null,
  down: new Set(),
  spokeAt: -Infinity,
  pending: null,
  testing: false,
  quiet: false,
};

/**
 * The tab's read-only status line, so a person can check that their
 * controller was seen.
 *
 * @param {{supported: boolean, padName: string|null}} [status]
 * @returns {string}
 */
export function formatGamepadStatus(status) {
  if (!status?.supported) {
    return 'This browser does not offer game controller input.';
  }
  if (!status.padName) {
    return 'No controller detected. Connect one and press any button.';
  }
  return `Controller detected: ${status.padName}.`;
}

/**
 * The readout's first line: the pad as the browser reports it.
 * @param {Gamepad} pad
 * @returns {string}
 */
export function readoutPadLine(pad) {
  const mapping = pad.mapping === 'standard' ? 'standard' : 'not standard';
  return `${pad.id}: mapping ${mapping}, ${pad.buttons.length} buttons, ${pad.axes.length} axes.`;
}

const value = (number) => number.toFixed(2);

/**
 * What is held on the pad now, each part with an id that stays the same
 * while it is held: buttons by the layout's name and their index, a
 * trigger with its value, a stick with both its axes, and any axis past
 * the sticks by its index.
 * @param {Gamepad} pad
 * @param {string} family
 * @returns {{id: string, text: string}[]}
 */
export function readoutParts(pad, family) {
  const parts = [];
  pad.buttons.forEach((button, index) => {
    if (!button.pressed && !(button.value > READOUT_AXIS_MIN)) return;
    const name = GAMEPAD_BUTTON_NAMES[index];
    const label = name ? gamepadInputLabel(name, family) : 'Button';
    const text = TRIGGER_INDEXES.has(index)
      ? `${label} [${index}] ${value(button.value)}`
      : `${label} [${index}]`;
    parts.push({ id: `b${index}`, text });
  });
  for (const stick of STICKS) {
    const [x, y] = stick.axes.map((i) => pad.axes[i] ?? 0);
    if (Math.abs(x) > READOUT_AXIS_MIN || Math.abs(y) > READOUT_AXIS_MIN) {
      parts.push({
        id: stick.id,
        text: `${stick.name} ${value(x)}, ${value(y)}`,
      });
    }
  }
  pad.axes.forEach((axis, index) => {
    if (index < 4 || !(Math.abs(axis) > READOUT_AXIS_MIN)) return;
    parts.push({ id: `a${index}`, text: `Axis [${index}] ${value(axis)}` });
  });
  return parts;
}

/**
 * The readout's second line.
 * @param {{text: string}[]} parts
 * @returns {string}
 */
export function readoutPressLine(parts) {
  return parts.length
    ? `Pressed: ${parts.map((part) => part.text).join(', ')}.`
    : 'Nothing pressed.';
}

/**
 * Write the tab from the saved mappings: the pickers, the picture's words
 * for the layout, and each table.
 */
function renderGamepadPanel() {
  const mapping = handlers.gamepad?.mapping;
  if (!mapping) return;
  const now = mapping.get();

  const family = el('prefsGamepadFamily');
  if (family) family.value = now.family;
  const preset = el('prefsGamepadPreset');
  if (preset) preset.value = now.preset;
  const joyConRows = el('prefsJoyConRows');
  if (joyConRows) joyConRows.hidden = now.family !== 'nintendo';
  // Not chosen yet reads as what the Joy-Cons do until then.
  const joyCon = handlers.joyCon?.get();
  const hold = el('prefsJoyConHold');
  if (hold) hold.value = joyCon?.hold ?? 'sideways';
  const pair = el('prefsJoyConPair');
  if (pair) pair.value = joyCon?.pair ?? 'together';

  for (const part of document.querySelectorAll(
    '#prefsGamepadDiagram [data-part]'
  )) {
    part.textContent = gamepadDiagramLabel(part.dataset.part, now.family);
  }

  for (const table of TABLES) renderTable(table, now.family);
}

/**
 * One row per action with its button and a Change button named for the
 * action. Every table is named by the layout the picker shows.
 * @param {typeof TABLES[number]} table
 * @param {string} family
 */
function renderTable(table, family) {
  const mapping = table.mapping();
  const body = el(`${table.prefix}Assignments`)?.querySelector('tbody');
  if (!mapping || !body) return;
  const { prefix, actions } = table;

  if (body.rows.length !== actions.length) {
    body.textContent = '';
    for (const action of actions) {
      const row = document.createElement('tr');
      row.dataset.action = action.id;
      const name = document.createElement('th');
      name.scope = 'row';
      name.id = `${prefix}Action-${action.id}`;
      name.textContent = action.name;
      const cell = document.createElement('td');
      const wrap = document.createElement('div');
      wrap.className = 'gamepad-assignment';
      const input = document.createElement('span');
      input.className = 'gamepad-input';
      input.id = `${prefix}Input-${action.id}`;
      const change = document.createElement('button');
      change.type = 'button';
      change.className = 'btn btn-sm btn-outline gamepad-change';
      change.id = `${prefix}Change-${action.id}`;
      change.textContent = 'Change';
      // "Change Activate": the visible word and the row's action, so each
      // button says which action it changes.
      change.setAttribute('aria-labelledby', `${change.id} ${name.id}`);
      // On the button itself: a listener on the table makes screen readers
      // call the whole table clickable.
      change.addEventListener('click', () =>
        changeGamepadAssignment(table, action.id)
      );
      wrap.append(input, change);
      cell.append(wrap);
      row.append(name, cell);
      body.append(row);
    }
  }

  const { assignments } = mapping.get();
  for (const action of actions) {
    if (capturing?.table === table && capturing.actionId === action.id) {
      continue;
    }
    const input = el(`${prefix}Input-${action.id}`);
    if (input) {
      input.textContent = gamepadInputLabel(assignments[action.id], family);
    }
  }
}

/**
 * Change one action's button: wait for one press on the controller (Escape
 * stops waiting), then assign it and say what changed. A press the table
 * cannot take (the game's D-pad walks) changes nothing.
 * @param {typeof TABLES[number]} table
 * @param {string} actionId
 */
async function changeGamepadAssignment(table, actionId) {
  const gamepad = handlers.gamepad;
  const mapping = table.mapping();
  if (!gamepad || !mapping || capturing) return;
  // Its wait ends a running test; the prompt below is what to hear.
  if (readout.testing) readout.quiet = true;
  capturing = { table, actionId };
  const input = el(`${table.prefix}Input-${actionId}`);
  if (input) input.textContent = GAMEPAD_CAPTURE_PROMPT;
  gamepad.announce?.(GAMEPAD_CAPTURE_PROMPT);

  const stopEscape = escapeStops(() => gamepad.cancelCapture());
  let pressed = null;
  try {
    pressed = await gamepad.capture(GAMEPAD_CAPTURE_MS);
  } finally {
    stopEscape();
    capturing = null;
  }

  const result = pressed ? mapping.assign(actionId, pressed) : null;
  renderGamepadPanel();
  if (!result?.assigned) {
    gamepad.announce?.('Nothing changed.');
    return;
  }
  const { swappedWith } = result;
  const { assignments } = mapping.get();
  const family = gamepad.mapping.get().family;
  const said = (id) =>
    `${table.actions.find((a) => a.id === id).name}: ${gamepadInputLabel(
      assignments[id],
      family
    )}.`;
  gamepad.announce?.(
    swappedWith ? `${said(actionId)} ${said(swappedWith)}` : said(actionId)
  );
}

/**
 * While a wait runs, Escape stops it and nothing else: in the capture
 * phase, before the dialog's own Escape closes it.
 * @param {() => void} stop
 * @returns {() => void} removes the listener
 */
function escapeStops(stop) {
  const onEscape = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    stop();
  };
  document.addEventListener('keydown', onEscape, true);
  return () => document.removeEventListener('keydown', onEscape, true);
}

/**
 * Render the status line. Skipped entirely when no handler was provided:
 * a claim about controller support with no data behind it would be a false
 * reason.
 */
function renderGamepadStatus() {
  if (!handlers.getGamepadStatus) return;
  const node = el('prefsGamepadStatus');
  if (!node) return;
  node.textContent = formatGamepadStatus(handlers.getGamepadStatus());
}

/** Whether the Controller tab is on screen in an open Keys dialog. */
function readoutShown() {
  const modal = el('shortcutsModal');
  const panel = el('keysPanelController');
  return (
    !!modal && !modal.classList.contains('hidden') && !!panel && !panel.hidden
  );
}

/**
 * The pad the app listens to, else the one it would start with, and the
 * other devices the browser lists beside it.
 * @returns {{pad: Gamepad|null, others: Gamepad[]}}
 */
function readoutPads() {
  const listed = Array.from(navigator.getGamepads?.() ?? []).filter(
    (pad) => pad && pad.connected !== false
  );
  const pad = handlers.gamepad?.pad?.() ?? preferredPad(listed);
  return {
    pad,
    others: listed.filter((other) => other.index !== pad?.index),
  };
}

function renderTestButton() {
  const button = el('controllerReadoutTest');
  if (button) {
    button.textContent = readout.testing ? 'Stop the test' : 'Start the test';
  }
}

/**
 * One frame of the readout. The lines are written when they change; what
 * is spoken waits for a new press during a test, and comes at most every
 * READOUT_SPEAK_MS so a run of quick presses is not a run of sentences.
 * @param {number} now - the frame's time, in milliseconds
 */
function readoutFrame(now) {
  readout.frame = null;
  if (!readoutShown()) {
    stopReadout();
    return;
  }
  const padLine = el('controllerReadoutPad');
  const pressLine = el('controllerReadoutPress');
  const { pad, others } = readoutPads();
  if (!pad) {
    readout.padKey = null;
    readout.down = new Set();
    if (padLine) padLine.textContent = '';
    if (pressLine) pressLine.textContent = '';
  } else {
    const key = [pad, ...others].map((p) => `${p.index}:${p.id}`).join('|');
    if (key !== readout.padKey) {
      readout.padKey = key;
      const also = others.length
        ? ` Also connected: ${others.map((other) => other.id).join('; ')}.`
        : '';
      if (padLine) padLine.textContent = readoutPadLine(pad) + also;
    }
    const family = handlers.gamepad?.mapping.get().family ?? 'generic';
    const parts = readoutParts(pad, family);
    const line = readoutPressLine(parts);
    if (pressLine && pressLine.textContent !== line) {
      pressLine.textContent = line;
    }
    const held = new Set(parts.map((part) => part.id));
    const fresh = [...held].some((id) => !readout.down.has(id));
    readout.down = held;
    if (readout.testing && fresh) readout.pending = line;
  }
  if (readout.pending && now - readout.spokeAt >= READOUT_SPEAK_MS) {
    handlers.gamepad?.announce?.(readout.pending);
    readout.spokeAt = now;
    readout.pending = null;
  }
  readout.frame = window.requestAnimationFrame(readoutFrame);
}

/** The tab was hidden or the dialog closed: stop reading, end a test. */
function stopReadout() {
  if (readout.frame !== null) window.cancelAnimationFrame(readout.frame);
  readout.frame = null;
  readout.padKey = null;
  readout.down = new Set();
  readout.pending = null;
  if (readout.testing) {
    // Nobody is on the tab to hear that the test ended.
    readout.quiet = true;
    handlers.gamepad?.cancelCapture();
  }
}

/**
 * The test: each wait takes the next press for itself, so nothing else
 * acts on it, and the next wait starts before the controller reads the pad
 * again. It ends after READOUT_TEST_MS without a press, with Escape, with
 * Stop the test, or when another wait (Change) takes over.
 */
async function runReadoutTest() {
  const gamepad = handlers.gamepad;
  if (!gamepad || readout.testing) return;
  readout.testing = true;
  readout.quiet = false;
  renderTestButton();
  gamepad.announce?.('Test started. Press a button on your controller.');
  const stopEscape = escapeStops(() => gamepad.cancelCapture());
  try {
    let pressed;
    do {
      pressed = await gamepad.capture(READOUT_TEST_MS);
    } while (pressed && readout.testing);
  } finally {
    stopEscape();
    readout.testing = false;
    renderTestButton();
  }
  if (!readout.quiet) gamepad.announce?.('Test stopped.');
  readout.quiet = false;
}

/** The tab's controls: the pickers, Reset to preset, the test button. */
function wireControllerTab() {
  el('prefsGamepadFamily')?.addEventListener('change', (event) => {
    handlers.gamepad?.mapping.setFamily(event.target.value);
    renderGamepadPanel();
  });

  el('prefsGamepadPreset')?.addEventListener('change', (event) => {
    handlers.gamepad?.mapping.setPreset(event.target.value);
    renderGamepadPanel();
  });

  el('prefsJoyConHold')?.addEventListener('change', (event) => {
    handlers.joyCon?.set({ hold: event.target.value });
  });
  el('prefsJoyConPair')?.addEventListener('change', (event) => {
    handlers.joyCon?.set({ pair: event.target.value });
  });

  for (const table of TABLES) {
    el(`${table.prefix}Reset`)?.addEventListener('click', () => {
      const mapping = table.mapping();
      if (!mapping) return;
      mapping.reset();
      renderGamepadPanel();
      const preset = table.presets[mapping.get().preset];
      handlers.gamepad?.announce?.(`${preset.name} restored.`);
    });
  }

  el('controllerReadoutTest')?.addEventListener('click', () => {
    if (readout.testing) handlers.gamepad?.cancelCapture();
    else runReadoutTest();
  });
}

/**
 * Wire the tab once; later calls only replace the handlers.
 * @param {ControllerPanelHandlers} [panelHandlers]
 */
export function initControllerPanel(panelHandlers = {}) {
  handlers = panelHandlers;
  if (wired || !el('keysPanelController')) return;
  wireControllerTab();
  // The status line heals itself while the dialog is open: without this,
  // "No controller detected" would sit beside a pad plugged in a second
  // after opening.
  window.addEventListener('gamepadconnected', renderGamepadStatus);
  window.addEventListener('gamepaddisconnected', renderGamepadStatus);
  wired = true;
}

/**
 * Write the tab from the app's state; when it is on screen, start the
 * readout. Called when Keys opens and when a tab is chosen.
 */
export function syncControllerPanel() {
  renderGamepadStatus();
  renderGamepadPanel();
  renderTestButton();
  if (readoutShown() && readout.frame === null) {
    readout.frame = window.requestAnimationFrame(readoutFrame);
  }
}

/** Test seam: forget the wiring so a fresh DOM can be wired again. */
export function _resetControllerPanelForTests() {
  window.removeEventListener('gamepadconnected', renderGamepadStatus);
  window.removeEventListener('gamepaddisconnected', renderGamepadStatus);
  if (readout.frame !== null) window.cancelAnimationFrame(readout.frame);
  Object.assign(readout, {
    frame: null,
    padKey: null,
    down: new Set(),
    spokeAt: -Infinity,
    pending: null,
    testing: false,
    quiet: false,
  });
  handlers = {};
  wired = false;
  capturing = null;
}
