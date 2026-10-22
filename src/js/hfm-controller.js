/**
 * HFM/Alt View Controller
 * Manages the hidden-feature-mode (HFM) alternate ASCII art view, variant
 * theming, and pan-adjust controls. Extracted from main.js for
 * maintainability.
 * @license GPL-3.0-or-later
 */

import {
  STORAGE_KEY_HFM_CONTRAST_SCALE,
  STORAGE_KEY_HFM_FONT_SCALE,
  STORAGE_KEY_HFM_PERSIST_FADE,
  STORAGE_KEY_HFM_SURFACES,
  STORAGE_KEY_SOUNDS,
  STORAGE_KEY_SOUND_KINDS_OFF,
} from './storage-keys.js';
import { announce, announceImmediate } from './announcer.js';
import {
  isPermanent,
  noteDevUnlock,
  recordCodeEntry,
  takePendingBreak,
} from './alt-unlock-stages.js';
import {
  playFanfare,
  playThrillerTune,
  playUnlockJingle,
} from './unlock-jingle.js';
import {
  playControlSound,
  playCrtSound,
  playDialSound,
  playCameraSound,
  playMomentSound,
  startPanMotion,
  playDrawerSound,
  playKeySound,
  playTypingSound,
  playScrollSound,
  preloadCrtSounds,
  preloadLookSounds,
  preloadMomentSounds,
  setMuted,
  setSoundSet,
  stopCrtSound,
} from './crt-sounds.js';
import { closePhoneDrawer } from './phone-drawers.js';
import {
  onDrawerMove,
  openLookDrawers,
  setLookDrawer,
} from './drawer-motion.js';

// ---------------------------------------------------------------------------
// HFM / Alt View state (module-level singleton)
// ---------------------------------------------------------------------------

let _hfmUnlocked = false;
let _hfmAltView = null;
let _hfmInitPromise = null;
let _hfmEnabled = false;
let _hfmPendingEnable = false;
let _hfmSettingsLoaded = false;

const _HFM_CONTRAST_RANGE = { min: 0.5, max: 4.0, step: 0.05, default: 1 };
let _hfmContrastScale = _HFM_CONTRAST_RANGE.default;
let _hfmContrastControls = null;

// The default is finer than the renderer's own 1: at full size the first
// frame drew the model as a blob with no faces. A saved size wins. The top
// is where the characters stop growing: the renderer caps its font at
// 24 px, met at 170% of the 14 px base a preview gets. Under 40% the
// characters give way to the vector look: that is where an eye on a phone
// stops telling them apart.
const _HFM_FONT_SCALE_RANGE = { min: 0, max: 1.7, step: 0.05, default: 0.6 };
// Under 40% the model is drawn as its edges, the way a vector monitor's beam
// drew lines. The line's width follows the size: 1 px at 0% and 4 px at the
// first step under the edge, 35%, straight between (CSS px, the same on
// every screen).
const _HFM_VECTOR_BELOW = 0.4;
const _HFM_VECTOR_WIDTH_AT_0 = 1;
const _HFM_VECTOR_WIDTH_TOP = 4;
const _HFM_VECTOR_WIDTH_PER_SCALE =
  (_HFM_VECTOR_WIDTH_TOP - _HFM_VECTOR_WIDTH_AT_0) /
  (_HFM_VECTOR_BELOW - _HFM_FONT_SCALE_RANGE.step);
// In the vector look the Edges slider chooses which creases are lines: its
// named levels at 30, 15 and 5 degrees, its ends at 40 and 1, straight lines
// between.
const _HFM_VECTOR_CREASE = [
  [0.5, 40],
  [0.7, 30],
  [1, 15],
  [1.6, 5],
  [4, 1],
];
// How solid the vector look draws the model's surfaces: faint by default, so
// the lines read as a wireframe.
const _HFM_SURFACE_RANGE = { min: 0.01, max: 1, step: 0.01, default: 0.01 };
let _hfmSurfaceOpacity = _HFM_SURFACE_RANGE.default;
let _hfmSurfaceControls = null;
// A phone starts finer: 45% is one step above the edge where the characters
// give way to lines, the most detail that still reads on a phone's screen.
// A saved size wins on every device.
const _HFM_FONT_SCALE_PHONE_DEFAULT = 0.45;
const _HFM_PHONE_MAX_WIDTH_PX = 768;
let _hfmFontScale = _HFM_FONT_SCALE_RANGE.default;
let _hfmFontScaleControls = null;

// A gentle afterglow to begin with; a saved 0 stays 0, and reduced motion
// holds it at 0.
const _HFM_PERSIST_FADE_RANGE = { min: 0, max: 1, step: 0.05, default: 0.15 };
let _hfmPersistFade = _HFM_PERSIST_FADE_RANGE.default;
let _hfmPersistFadeControls = null;

let _hfmPanAdjustEnabled = false;
let _hfmPanToggleButtons = null;
let _hfmMotionListener = null;
let _hfmModeListener = null;

// Classic wears a retro look of its own while the Alt View is on; the root
// carries its name, and the variant stylesheet gives it its values.
const _HFM_CLASSIC_LOOK = 'dos';

// Heard once when the key appears: that something appeared, and where.
// Finding out what it does is the point, so the sentence says no more.
const _HFM_UNLOCK_SENTENCE = 'A key appeared next to the theme button.';
// announce() holds a polite message for 350 ms and a later call replaces a
// held one. The button that completes the sequence speaks its own action
// inside that hold, so the sentence waits past it and is written at once.
const _HFM_UNLOCK_ANNOUNCE_DELAY_MS = 600;
// With the tune playing, the sentence waits for its end and this pause.
const _HFM_AFTER_TUNE_MS = 300;
// The screen draws in once its sound has started, after a quarter second at
// the most: a sound that cannot start does not hold the picture back.
const _HFM_SOUND_LEAD_MS = 250;
let _hfmMomentBegin = null;
let _hfmMomentTimer = null;
// Every button pressed while the look is on sounds a key of its size: the
// band edges in CSS px squared, from a letter key to the space bar.
const _HFM_KEY_BANDS_PX2 = [1000, 1600, 2500, 4000, 7000, 12000];
const _HFM_KEY_TARGET =
  'button, summary, a[href], [role="button"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="tab"]';
// A switch, a checkbox or a radio button snaps on and off instead.
const _HFM_SNAP_TARGET =
  'input[type="checkbox"], input[type="radio"], [role="switch"], [role="checkbox"], [role="radio"]';
// A press that came with no press of its own first, a screen reader's in
// browse mode or a controller's, plays its key's press and release this far
// apart.
const _HFM_KEY_TAP_MS = 60;
let _hfmKeyListeners = null;
let _hfmKeyDown = null;
/** The last control a press sounded for, so its click does not sound again. */
let _hfmKeyHeard = null;
// Typing into a field is a quiet key per keystroke, at most this many a
// second; a keystroke that would sound sooner is passed over.
const _HFM_TYPING_PER_SECOND = 15;
const _HFM_TYPED_INPUTS = new Set([
  'text',
  'search',
  'url',
  'email',
  'tel',
  'password',
  'number',
]);
let _hfmTypingLastAt = -Infinity;
/** When each field was last typed into, so a typed number is not a step. */
const _hfmTypedAt = new WeakMap();
// A grip moved by hand ticks for every 2 % of the window it travels, at most
// as often as a dial clicks, at the dial's middle tone.
const _HFM_GRIP_TARGET = '[role="separator"][tabindex], .gutter';
const _HFM_GRIP_STEP = 0.02;
const _HFM_GRIP_TONE = 4;
let _hfmGrip = null;
let _hfmGripLastAt = -Infinity;
// What a latch opens and closes: a dialog or a menu by its aria-hidden, a
// pop-out list by its hidden.
const _HFM_LATCH_BY_ARIA_HIDDEN = '[role="dialog"], .toolbar-menu-modal';
const _HFM_LATCH_BY_HIDDEN = '.camera-shortcuts-panel, [role="menu"]';
let _hfmLatches = null;
// The look's drawers that sound, by the names they move by: the
// Customizer, camera, ASCII and Preview Settings drawers, and Classic's
// Customizer, editor and console and the fields that hold them. Each is the
// same drawer: a latch, a roll, a stop.
const _HFM_SOUNDING_DRAWERS = new Set([
  'customizer',
  'phone-customizer',
  'camera',
  'phone-camera',
  'phone-ascii',
  'preview-settings',
  'lens',
  'classic-customizer',
  'classic-right-top',
  'classic-right-bottom',
  'classic-editor',
  'classic-left',
  'classic-console',
]);
// A drawer's own buttons, which open and shut it: their press is heard as
// the drawer itself, not as a key.
const _HFM_DRAWER_BUTTONS = [
  '#collapseParamPanelBtn',
  '#cameraPanelToggle',
  '#previewDrawerToggle',
  '#lensDrawerToggle',
  '#mobileDrawerToggle',
  '#cameraDrawerToggle',
  '#asciiDrawerToggle',
  '#classicEditorCloseBtn',
  '#classicCustomizerCloseBtn',
  '.classic-stow-btn',
].join(', ');
// A slider moved while the look is on clicks as a dial does, its tone by
// how many steps the slider has: the edges of the seven tones, a slider of
// eight steps or fewer the lowest, one of more than a hundred the highest.
// A click comes at most this many times a second, however fast the drag;
// a step that would click sooner is passed over, never queued, so a fast
// drag stays a ratchet and not a saw, and release is silence.
const _HFM_DIAL_STEP_EDGES = [8, 14, 22, 32, 48, 100];
const _HFM_DIAL_CLICKS_PER_SECOND = 15;
const _hfmDials = new WeakMap();
let _hfmDialLastClickAt = -Infinity;
// The 3D view's own ticks while the look is on: a bearing for every 15
// degrees it turns, a ratchet for every 10 it tilts, a lens detent for every
// 5 % it zooms (a wheel notch), a lead screw's step for every 5 % of its
// distance it is panned across or up (the stage moved under the lens). Only
// for a move made directly: a drag, the wheel or a pinch on the view, the
// arrow keys on the focused preview, a controller's stick or trigger. A
// move a view or View All made is heard as that button's key. A tick comes
// at most every 70 ms, a step that would tick sooner is passed over, and
// turning back after a tick takes a step and a little more, so a jitter is
// silent.
const _HFM_CAMERA_STEPS = {
  turn: 15,
  tilt: 10,
  zoom: Math.log(1.05),
  pan: 0.05,
};
const _HFM_CAMERA_DEAD_BAND = {
  turn: 1,
  tilt: 1,
  zoom: Math.log(1.01),
  pan: 0.01,
};
const _HFM_CAMERA_TICK_GAP_MS = 70;
// A pan is one motion of the stage rather than a tick a step: the motor
// starts at the first step, runs while what the view looks at keeps moving
// (a move this share of the camera's distance between frames counts), and
// winds down once it has rested this long.
const _HFM_PAN_REST_MS = 100;
const _HFM_PAN_MOVE_MIN = 1e-4;
// A drag's damping glides on after the pointer lifts; a key moves at once.
const _HFM_CAMERA_GLIDE_MS = 1500;
const _HFM_CAMERA_KEY_MS = 400;
const _HFM_CAMERA_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  '+',
  '=',
  '-',
]);
// The controller's own dead zone (gamepad-controller.js).
const _HFM_STICK_DEAD_ZONE = 0.15;
// The camera's rotate, pan and zoom buttons, in the panel, the phone's
// drawer and Classic's 3D view toolbar: each press moves the view one step,
// heard as the view's own tick for that move instead of a key, a turn by its
// way (left -1, right 1), a tilt (down -1, up 1), a zoom (out -1, in 1), a
// pan (left or down -1, right or up 1).
const _HFM_CAMERA_BUTTONS = new Map([
  ['cameraRotateLeft', ['turn', -1]],
  ['cameraRotateRight', ['turn', 1]],
  ['mobileCameraRotateLeft', ['turn', -1]],
  ['mobileCameraRotateRight', ['turn', 1]],
  ['cameraRotateUp', ['tilt', 1]],
  ['cameraRotateDown', ['tilt', -1]],
  ['mobileCameraRotateUp', ['tilt', 1]],
  ['mobileCameraRotateDown', ['tilt', -1]],
  ['cameraZoomIn', ['zoom', 1]],
  ['cameraZoomOut', ['zoom', -1]],
  ['mobileCameraZoomIn', ['zoom', 1]],
  ['mobileCameraZoomOut', ['zoom', -1]],
  ['classicZoomInBtn', ['zoom', 1]],
  ['classicZoomOutBtn', ['zoom', -1]],
  ['cameraPanLeft', ['pan', -1]],
  ['cameraPanRight', ['pan', 1]],
  ['cameraPanUp', ['pan', 1]],
  ['cameraPanDown', ['pan', -1]],
  ['mobileCameraPanLeft', ['pan', -1]],
  ['mobileCameraPanRight', ['pan', 1]],
  ['mobileCameraPanUp', ['pan', 1]],
  ['mobileCameraPanDown', ['pan', -1]],
]);
// Scrolling by hand ticks a line at a time, as paper turns through a
// typewriter's platen: a tick for every 40 px a list moves, going down a
// little lower and up a little higher, at most every 70 ms (a line that
// would tick sooner is passed over), and the end of the list once as it is
// reached. Only a scroll by hand: the wheel, a finger, the scrollbar or a
// key that scrolls, and the glide after them; a scroll the page makes (a
// field brought into view, a jump to a group) is silent.
const _HFM_SCROLL_LINE_PX = 40;
const _HFM_SCROLL_TICK_GAP_MS = 70;
const _HFM_SCROLL_HAND_MS = 1000;
const _HFM_SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
]);
let _hfmScrollHandUntil = 0;
let _hfmScrollTickAt = -Infinity;
const _hfmScrolls = new WeakMap();
let _hfmScrollListeners = null;
let _hfmCamera = null;
// When the view last ticked, by hand or by a camera button.
let _hfmCameraTickAt = -Infinity;

// The key's name says what it is; what it does is said once it is pressed.
const _HFM_TOGGLE_NAME = 'Alt View';
// The sounds button beside it: its pressed state is whether sounds are on,
// the same setting as Preferences > Play sounds.
const _HFM_SOUNDS_NAME = 'Sounds';
const _HFM_SOUNDS_ICON_ON = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" />
      <path d="M19 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  `;
const _HFM_SOUNDS_ICON_OFF = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      <path d="M3 3l18 18" />
    </svg>
  `;
const _HFM_ON_SENTENCE =
  'Alt View on. The preview is drawn with characters and the interface follows.';
const _HFM_OFF_SENTENCE = 'Alt View off.';
// Shown and said when the preview has no 3D picture to draw with characters.
const _HFM_NO_GRAPHICS_SENTENCE =
  'Alt View needs 3D graphics, which this browser has turned off.';
// Pan adjust keeps one name in both states; the values it changes show in
// the preview's status line, and each change is spoken on its own.
const _HFM_PAN_ADJUST_NAME = 'Adjust the Alt View with the pan arrows';
const _HFM_PAN_ADJUST_ON_SENTENCE =
  'Pan arrows now adjust the Alt View: up and down for edges, left and right for focus, Shift with up and down for glow.';
const _HFM_PAN_ADJUST_OFF_SENTENCE = 'Pan arrows move the view again.';

// The character sizes a person steps through from the status strip. The
// slider and the pan arrows still move in 5% steps between them.
const _HFM_CHARACTER_STEPS = [
  { name: 'Fine', scale: 0.5 },
  { name: 'Normal', scale: 0.6 },
  { name: 'Bold', scale: 1 },
];
const _HFM_STEP_TOLERANCE = 0.001;
// The first Alt View in a page draws in from the top and the status line
// types a greeting before its ordinary line; later ones start at once. The
// line is not live, so the greeting is for the eye only.
const _HFM_GREETING = 'ALT VIEW ONLINE';
const _HFM_GREETING_LETTER_MS = 40;
const _HFM_GREETING_HOLD_MS = 700;
// The draw-in lasts the variant's --crt-reveal-duration (1 s) once it starts,
// and a slow machine takes most of a second to start it (0.65 s measured
// under 4x CPU throttling). This clears it if the animation never runs, as
// with forced colors.
const _HFM_REVEAL_FALLBACK_MS = 3000;
let _hfmRevealTimer = null;
let _hfmGreetingTimer = null;
let _hfmStatusOverride = null;
// The picture powers on after the draw-in when that plays; the stylesheet
// times both. This clears it if it never ends.
const _HFM_POWER_ON_FALLBACK_MS = 4000;
let _hfmPowerOnTimer = null;
/** Waiting for the picture to finish powering on. */
let _hfmPowerOnWaiters = [];
// The look comes on with its drawers shut: the ones that were open shut at
// once before the screen draws in, and once the picture has powered on they
// open again one at a time, left to right, the pause of a hand moving from
// one drawer to the next between them.
const _HFM_DRAWER_PAUSE_MS = 300;
/** @type {{names: string[], stopped: boolean}|null} */
let _hfmDrawerStaging = null;

// Found by the camera sequence, the key drops into its place wearing the Alt
// View's colors, rests a moment, then redraws itself as the ordinary key. The
// stylesheet times the drop and the redraw; the rest is here.
const _HFM_KEY_REST_MS = 300;
// Clears the arrival if its animations never end, as in a hidden tab.
const _HFM_ARRIVAL_FALLBACK_MS = 12000;
let _hfmArrival = null;
const _hfmArrivalTimers = { rest: null, fallback: null };
// Heard after the second finding: something happened at the key, and that it
// was not the last of it is left to be found.
const _HFM_CRACK_SENTENCE = 'Something cracked around the key.';
// The thriller comes in this long after the crack, under its tail.
const _HFM_THRILLER_AFTER_S = 0.15;
// A crack whose lines never report their end is cleared after this.
const _HFM_CRACK_FALLBACK_MS = 5000;
let _hfmCrack = null;
const _SVG_NS = 'http://www.w3.org/2000/svg';
// Heard after the third finding's break-through: the key is not going away.
const _HFM_BREAK_SENTENCE = 'The key is here to stay.';
// The glass breaks this far into the break-through: the stylesheet's
// --alt-view-break-grow. The shatter plays then, the fanfare a moment after.
const _HFM_BREAK_IMPACT_S = 1.6;
const _HFM_FANFARE_AFTER_S = 0.2;
// A break-through whose shards never report their end is cleared after this.
const _HFM_BREAK_FALLBACK_MS = 4000;
const _HFM_BREAK_SHARDS = 12;
let _hfmBreak = null;

// Late-bound dependencies set via initHfmController
let _getPreviewManager = () => null;
let _getDisplayOptionsController = () => null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _isLightThemeActive() {
  const root = document.documentElement;
  const dataTheme = root.getAttribute('data-theme');
  if (dataTheme === 'light') return true;
  if (dataTheme === 'dark') return false;
  return !window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function _prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

// Preferences ▸ Advanced ▸ Play sounds, on unless turned off.
function _soundsOn() {
  try {
    return localStorage.getItem(STORAGE_KEY_SOUNDS) !== 'false';
  } catch (_) {
    return true;
  }
}

// The kinds of sound a person can turn off one by one (Preferences ▸
// Advanced ▸ Sounds in Alt View), each the sounds of one set of controls;
// the look's own switch sounds follow Play sounds alone.
const _HFM_SOUND_KINDS = [
  'keys',
  'dials',
  'camera',
  'drawers',
  'switches',
  'menus',
  'typing',
  'scroll',
];
const _hfmKindsOff = _readKindsOff();

function _readKindsOff() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY_SOUND_KINDS_OFF);
  } catch (_) {
    return new Set();
  }
  if (!raw) return new Set();
  try {
    const list = JSON.parse(raw);
    return new Set(
      Array.isArray(list)
        ? list.filter((kind) => _HFM_SOUND_KINDS.includes(kind))
        : []
    );
  } catch (error) {
    console.warn(
      '[Alt View] The sound kinds setting could not be read:',
      error
    );
    return new Set();
  }
}

// Whether a kind of sound plays: the sounds on, and this kind not turned
// off.
function _soundOn(kind) {
  return _soundsOn() && !_hfmKindsOff.has(kind);
}

/**
 * The kinds of sound turned off, in the order they are listed.
 * @returns {string[]}
 */
export function soundKindsOff() {
  return _HFM_SOUND_KINDS.filter((kind) => _hfmKindsOff.has(kind));
}

/**
 * Turn one kind of sound off or on: the setting is kept, and anything
 * showing it listens for `sound-kinds-change` on the document.
 * @param {'keys'|'dials'|'camera'|'drawers'|'switches'|'menus'|'typing'|'scroll'} kind
 * @param {boolean} off
 */
export function setSoundKindOff(kind, off) {
  if (!_HFM_SOUND_KINDS.includes(kind)) {
    throw new Error(`No such kind of sound: ${kind}`);
  }
  if (off) _hfmKindsOff.add(kind);
  else _hfmKindsOff.delete(kind);
  try {
    localStorage.setItem(
      STORAGE_KEY_SOUND_KINDS_OFF,
      JSON.stringify(soundKindsOff())
    );
  } catch (error) {
    console.warn('[Alt View] Could not save the sound kinds setting:', error);
  }
  document.dispatchEvent(
    new CustomEvent('sound-kinds-change', { detail: { off: soundKindsOff() } })
  );
}

function _syncSoundsButton(on) {
  const button = document.getElementById('_hfmSounds');
  if (!button) return;
  button.setAttribute('aria-pressed', String(on));
  button.innerHTML = on ? _HFM_SOUNDS_ICON_ON : _HFM_SOUNDS_ICON_OFF;
}

/**
 * Turn the sounds on or off: the setting Preferences > Play sounds shows,
 * the mute, and the look's sounds button, together. Anything else showing
 * the setting listens for `sounds-setting-change` on the document.
 * @param {boolean} on
 */
export function setSoundsOn(on) {
  const value = Boolean(on);
  try {
    localStorage.setItem(STORAGE_KEY_SOUNDS, value ? 'true' : 'false');
  } catch (error) {
    console.warn('[Alt View] Could not save the sounds setting:', error);
  }
  setMuted(!value);
  _syncSoundsButton(value);
  // Turned on with the key there: its sounds are fetched now.
  if (value && _hfmUnlocked) {
    preloadCrtSounds();
    if (_hfmEnabled) _preloadLookSounds();
  }
  document.dispatchEvent(
    new CustomEvent('sounds-setting-change', { detail: { on: value } })
  );
}

// A controller's press that acts with no control of its own on screen is a
// key the size of a camera panel button.
const _HFM_PAD_KEY_BAND = 3;

/**
 * A controller's press that acts with no control on screen (Reset View,
 * View All, a standard view, the next preset): a key the size of a camera
 * panel button, its press and its release, while the look is on. A press
 * that presses a control on screen plays that control's own sound instead,
 * and a move of the view ticks as the view's own.
 */
export function playPadKey() {
  if (!_hfmEnabled || !_soundOn('keys')) return;
  const set = _hfmKeySet();
  const play = (phase) =>
    playKeySound(set, _HFM_PAD_KEY_BAND, phase).catch((error) => {
      console.warn('[Alt View] A key sound did not play:', error);
    });
  play('down');
  setTimeout(() => play('up'), _HFM_KEY_TAP_MS);
}

/**
 * A controller is moving the view now (a stick, a trigger, a zoom button):
 * the view's changes for the next while are its own and tick as a drag's.
 */
export function noteControllerMove() {
  if (_hfmCamera) {
    _hfmCamera.directUntil = performance.now() + _HFM_CAMERA_KEY_MS;
  }
}

function _formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

// Debounced localStorage writes so pan-adjust taps don't write per press.
const _SAVE_DEBOUNCE_MS = 200;
const _saveTimers = new Map();

function _debouncedSave(key, value) {
  const existing = _saveTimers.get(key);
  if (existing) clearTimeout(existing);
  _saveTimers.set(
    key,
    setTimeout(() => {
      _saveTimers.delete(key);
      try {
        localStorage.setItem(key, String(value));
      } catch (error) {
        console.warn(`[Alt View] Could not save setting (${key}):`, error);
      }
    }, _SAVE_DEBOUNCE_MS)
  );
}

function _updateHfmStatusBar() {
  const root = document.documentElement;
  const isMono = root.getAttribute('data-ui-variant') === 'mono';
  const statusBar = document.getElementById('previewStatusBar');
  const altAdjustEl = document.getElementById('previewStatusAltAdjust');

  if (!statusBar || !altAdjustEl) return;
  delete altAdjustEl.dataset.notice;

  // The desktop's Lens drawer (its toggle and title at the left of the
  // actions bar) and the phone's, which hold the sliders; each closes
  // before it hides.
  const lensToggle = document.getElementById('actionsLens');
  const lens = document.getElementById('lensDrawer');
  const asciiDrawer = document.getElementById('asciiDrawer');
  if (!isMono || !_hfmEnabled) {
    statusBar.classList.remove('has-alt-adjust');
    altAdjustEl.textContent = '';
    if (lens && !lens.hidden) {
      setLookDrawer('lens', false, { instant: true });
      lens.hidden = true;
    }
    if (lensToggle) lensToggle.hidden = true;
    if (asciiDrawer && !asciiDrawer.hidden) {
      closePhoneDrawer('ascii');
      asciiDrawer.hidden = true;
    }
    return;
  }
  if (lensToggle) lensToggle.hidden = false;
  if (lens) lens.hidden = false;
  if (asciiDrawer) asciiDrawer.hidden = false;

  let displayText;
  if (_hfmStatusOverride !== null) {
    displayText = _hfmStatusOverride;
  } else if (_hfmPanAdjustEnabled) {
    displayText =
      '[ALT ADJUST] \u25B2\u25BC edge \u00B7 \u25C4\u25BA size \u00B7 Shift+\u25B2\u25BC glow';
  } else {
    const edge = _formatPercent(_hfmContrastScale);
    const size = _formatPercent(_hfmFontScale);
    const sizeWord = _hfmIsVector() ? 'LINES' : 'FOCUS';
    const glow = _formatPercent(_prefersReducedMotion() ? 0 : _hfmPersistFade);
    displayText = `[ALT VIEW] EDGE ${edge} \u00B7 ${sizeWord} ${size} \u00B7 GLOW ${glow}`;
  }

  altAdjustEl.textContent = displayText;
  statusBar.classList.add('has-alt-adjust');
}

function _syncHfmPanToggleUi() {
  const btns = [_hfmPanToggleButtons?.desktop].filter(Boolean);

  btns.forEach((btn) => {
    btn.setAttribute('aria-pressed', _hfmPanAdjustEnabled ? 'true' : 'false');
    btn.classList.toggle('active', _hfmPanAdjustEnabled);
    btn.title = _HFM_PAN_ADJUST_NAME;
    btn.setAttribute('aria-label', _HFM_PAN_ADJUST_NAME);
  });

  _updateHfmStatusBar();
}

function _setHfmPanAdjustEnabled(enabled) {
  _hfmPanAdjustEnabled = Boolean(enabled);

  if (_hfmEnabled) {
    _initHfmContrastControls().setEnabled(!_hfmPanAdjustEnabled);
    _initHfmFontScaleControls().setEnabled(!_hfmPanAdjustEnabled);
    _initHfmPersistFadeControls().setEnabled(!_hfmPanAdjustEnabled);
    _initHfmSurfaceControls().setEnabled(!_hfmPanAdjustEnabled);
  }

  _syncHfmPanToggleUi();
}

function _resetHfmSettings() {
  try {
    localStorage.removeItem(STORAGE_KEY_HFM_CONTRAST_SCALE);
    localStorage.removeItem(STORAGE_KEY_HFM_FONT_SCALE);
    localStorage.removeItem(STORAGE_KEY_HFM_PERSIST_FADE);
    localStorage.removeItem(STORAGE_KEY_HFM_SURFACES);
  } catch (_) {
    // Storage unavailable
  }
  _applyHfmContrastScale(_HFM_CONTRAST_RANGE.default);
  _applyHfmFontScale(_HFM_FONT_SCALE_RANGE.default);
  _applyHfmPersistFade(_HFM_PERSIST_FADE_RANGE.default);
  _applyHfmSurfaceOpacity(_HFM_SURFACE_RANGE.default);
  if (import.meta.env.DEV) {
    console.log('[Alt View] Settings reset to defaults');
  }
}

// ---------------------------------------------------------------------------
// Contrast / font / persist-fade apply helpers
// ---------------------------------------------------------------------------

function _applyHfmContrastScale(scale) {
  const raw = Number(scale);
  const next = Number.isFinite(raw) ? raw : _HFM_CONTRAST_RANGE.default;
  const clamped = Math.max(
    _HFM_CONTRAST_RANGE.min,
    Math.min(_HFM_CONTRAST_RANGE.max, next)
  );
  _hfmContrastScale = clamped;

  if (_hfmAltView?.setContrastScale) {
    _hfmAltView.setContrastScale(clamped);
    _hfmAltView.invalidate?.();
  }

  _hfmContrastControls?.sync?.(clamped);
  _syncHfmVectorLook();
  _syncHfmPanToggleUi();
  _debouncedSave(STORAGE_KEY_HFM_CONTRAST_SCALE, clamped);

  return clamped;
}

function _applyHfmFontScale(scale) {
  const raw = Number(scale);
  const next = Number.isFinite(raw) ? raw : _HFM_FONT_SCALE_RANGE.default;
  const clamped = Math.max(
    _HFM_FONT_SCALE_RANGE.min,
    Math.min(_HFM_FONT_SCALE_RANGE.max, next)
  );
  _hfmFontScale = clamped;

  // The characters themselves never go under 40%: there they are lines, and
  // a look whose lines cannot load keeps its 40% characters.
  if (_hfmAltView?.setFontScale) {
    _hfmAltView.setFontScale(Math.max(clamped, _HFM_VECTOR_BELOW));
    _hfmAltView.invalidate?.();
  }

  _hfmFontScaleControls?.sync?.(clamped);
  _syncHfmVectorLook();
  _syncHfmPanToggleUi();
  _debouncedSave(STORAGE_KEY_HFM_FONT_SCALE, clamped);

  return clamped;
}

/**
 * True when a size is under 40%, where the model is drawn as lines.
 * @param {number} [scale]
 * @returns {boolean}
 */
function _hfmIsVector(scale = _hfmFontScale) {
  return scale < _HFM_VECTOR_BELOW - _HFM_STEP_TOLERANCE;
}

/**
 * What a size is called aloud: "Focus 60%", or under 40% "Vector lines,
 * 35%".
 * @param {number} scale
 * @returns {string}
 */
function _hfmSizeWords(scale) {
  return _hfmIsVector(scale)
    ? `Vector lines, ${_formatPercent(scale)}`
    : `Focus ${_formatPercent(scale)}`;
}

/**
 * The crease angle the Edges slider chooses in the vector look.
 * @param {number} scale - the Edges slider's value
 * @returns {number} degrees
 */
function _hfmCreaseDeg(scale) {
  const points = _HFM_VECTOR_CREASE;
  if (scale <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (scale <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + ((scale - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return points[points.length - 1][1];
}

/**
 * The vector look as the sliders set it, or null at 30% and above.
 * @returns {{widthPx: number, surfaceOpacity: number, creaseDeg: number,
 *   crisp: boolean}|null}
 */
function _hfmVectorLook() {
  if (!_hfmIsVector()) return null;
  return {
    // To a hundredth: the slope is a fraction, and 4 px should be 4 px.
    widthPx:
      Math.round(
        (_HFM_VECTOR_WIDTH_AT_0 + _HFM_VECTOR_WIDTH_PER_SCALE * _hfmFontScale) *
          100
      ) / 100,
    surfaceOpacity: _hfmSurfaceOpacity,
    creaseDeg: Math.round(_hfmCreaseDeg(_hfmContrastScale) * 10) / 10,
    // Classic's look draws crisp, as a raster card did; the phosphor looks
    // glow.
    crisp: document.body?.dataset.uiMode === 'classic',
  };
}

function _syncHfmVectorLook() {
  _hfmAltView?.setVectorLook?.(_hfmVectorLook());
}

function _applyHfmSurfaceOpacity(value) {
  const raw = Number(value);
  const next = Number.isFinite(raw) ? raw : _HFM_SURFACE_RANGE.default;
  const clamped = Math.max(
    _HFM_SURFACE_RANGE.min,
    Math.min(_HFM_SURFACE_RANGE.max, next)
  );
  _hfmSurfaceOpacity = clamped;
  _hfmSurfaceControls?.sync?.(clamped);
  _syncHfmVectorLook();
  _debouncedSave(STORAGE_KEY_HFM_SURFACES, clamped);
  return clamped;
}

function _applyHfmPersistFade(value) {
  const raw = Number(value);
  const next = Number.isFinite(raw) ? raw : _HFM_PERSIST_FADE_RANGE.default;
  const clamped = Math.max(
    _HFM_PERSIST_FADE_RANGE.min,
    Math.min(_HFM_PERSIST_FADE_RANGE.max, next)
  );
  _hfmPersistFade = clamped;

  if (_hfmAltView?.setPersistFade) {
    _hfmAltView.setPersistFade(clamped);
    _hfmAltView.invalidate?.();
  }

  _hfmPersistFadeControls?.sync?.(clamped);
  _syncHfmPanToggleUi();
  _debouncedSave(STORAGE_KEY_HFM_PERSIST_FADE, clamped);

  return clamped;
}

// ---------------------------------------------------------------------------
// Slider controls (contrast / font scale / afterglow)
// ---------------------------------------------------------------------------

/**
 * Build one Alt View slider in each of its homes (the desktop camera panel,
 * the phone's ASCII drawer, Classic's two) and return a { setEnabled, sync }
 * controls object over all of them.
 *
 * setEnabled(true) shows the sections while Alt View is on; setEnabled(false)
 * hides them entirely so they never appear in the standard UI.
 *
 * @param {Object} cfg
 * @param {string} cfg.idBase - DOM id base, e.g. '_hfmContrast'
 * @param {string} cfg.titleText - section heading
 * @param {{min:number,max:number,step:number}} cfg.range
 * @param {() => number} cfg.getValue
 * @param {(value:number) => void} cfg.onInput
 * @returns {{ setEnabled: Function, sync: Function }}
 */
function _buildHfmSliderControls({
  idBase,
  titleText,
  range,
  getValue,
  onInput,
  speak = _formatPercent,
  note = null,
}) {
  const inputs = [];
  const valueEls = [];
  const sections = [];
  const formatValue = _formatPercent;

  const buildSection = ({
    container,
    insertBefore,
    sectionClass,
    titleClass,
    inputId,
    noteVisible,
    titleTag = 'h3',
  }) => {
    if (!container || document.getElementById(inputId)) return;

    const section = document.createElement('div');
    section.className = sectionClass;

    const title = document.createElement(titleTag);
    title.className = titleClass;
    title.id = `${inputId}-label`;
    title.textContent = titleText;
    if (titleTag === 'label') title.htmlFor = inputId;

    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'slider-container';

    const input = document.createElement('input');
    input.type = 'range';
    input.id = inputId;
    input.min = String(range.min);
    input.max = String(range.max);
    input.step = String(range.step);
    input.value = String(getValue());
    input.setAttribute('aria-labelledby', title.id);

    const valueEl = document.createElement('span');
    valueEl.className = 'slider-value';
    valueEl.id = `${inputId}-value`;
    valueEl.textContent = formatValue(getValue());

    sliderContainer.appendChild(input);
    sliderContainer.appendChild(valueEl);
    section.appendChild(title);
    section.appendChild(sliderContainer);
    if (note) {
      const noteEl = document.createElement('p');
      noteEl.id = `${inputId}-note`;
      noteEl.className = noteVisible ? 'hfm-slider-note' : 'sr-only';
      noteEl.textContent = note;
      section.appendChild(noteEl);
      input.setAttribute('aria-describedby', noteEl.id);
    }

    if (insertBefore) {
      container.insertBefore(section, insertBefore);
    } else {
      container.appendChild(section);
    }

    inputs.push(input);
    valueEls.push(valueEl);
    sections.push(section);

    input.addEventListener('input', () => {
      onInput(parseFloat(input.value));
    });
  };

  // On a desktop the Lens drawer, risen from the actions bar's row, holds
  // these sliders and nothing else: a slider's note is its description
  // there, read but not shown.
  buildSection({
    container: document.getElementById('lensDrawerBody'),
    insertBefore: null,
    sectionClass: `lens-drawer-section hfm-slider-section ${idBase}-section`,
    titleClass: 'lens-drawer-section-title',
    inputId: idBase,
    noteVisible: false,
  });

  // The phone's ASCII drawer holds these sliders and nothing else: a
  // slider's note is its description there, read but not shown.
  buildSection({
    container: document.getElementById('asciiDrawerBody'),
    insertBefore: null,
    sectionClass: `camera-drawer-section hfm-slider-section ${idBase}-drawer-section`,
    titleClass: 'camera-drawer-section-title',
    inputId: `${idBase}Mobile`,
    noteVisible: false,
  });

  // Classic has no camera panel: its ASCII group in Viewport-Control, and
  // in the Simplified view, which has no Viewport-Control, at the foot of
  // the Customizer. Labels, as in the panel's other fields.
  for (const [containerId, suffix] of [
    ['vpAsciiGroup', 'Classic'],
    ['classicAsciiSimplified', 'Simplified'],
  ]) {
    buildSection({
      container: document.getElementById(containerId),
      insertBefore: null,
      sectionClass: `classic-ascii-field hfm-slider-section ${idBase}-classic-section`,
      titleClass: 'classic-ascii-label',
      inputId: `${idBase}${suffix}`,
      noteVisible: true,
      titleTag: 'label',
    });
  }

  const controls = {
    setEnabled(isEnabled) {
      const show = Boolean(isEnabled);
      sections.forEach((section) => {
        section.style.display = show ? '' : 'none';
      });
      inputs.forEach((input) => {
        input.disabled = !show;
      });
    },
    sync(value) {
      const formatted = formatValue(value);
      const rawValue = value.toFixed(2);
      inputs.forEach((input) => {
        if (input.value !== rawValue) {
          input.value = rawValue;
        }
        input.setAttribute('aria-valuetext', speak(value));
      });
      valueEls.forEach((el) => {
        el.textContent = formatted;
      });
    },
  };

  controls.setEnabled(false);
  controls.sync(getValue());

  return controls;
}

/**
 * Move the character size to the next named step below or above the
 * current size, and say the new size. At either end the size stays and is
 * said again.
 * @param {number} direction - -1 for smaller, 1 for larger
 * @returns {number} The size applied
 */
function _stepHfmCharacters(direction) {
  let target = _hfmFontScale;
  if (direction < 0) {
    const below = _HFM_CHARACTER_STEPS.filter(
      (step) => step.scale < _hfmFontScale - _HFM_STEP_TOLERANCE
    );
    if (below.length) target = below[below.length - 1].scale;
  } else {
    const above = _HFM_CHARACTER_STEPS.find(
      (step) => step.scale > _hfmFontScale + _HFM_STEP_TOLERANCE
    );
    if (above) target = above.scale;
  }
  const next = _applyHfmFontScale(target);
  announceImmediate(_hfmSizeWords(next));
  return next;
}

function _initHfmContrastControls() {
  if (_hfmContrastControls) return _hfmContrastControls;
  _hfmContrastControls = _buildHfmSliderControls({
    idBase: '_hfmContrast',
    titleText: 'Edges',
    range: _HFM_CONTRAST_RANGE,
    getValue: () => _hfmContrastScale,
    onInput: (value) => _applyHfmContrastScale(value),
  });
  return _hfmContrastControls;
}

function _initHfmFontScaleControls() {
  if (_hfmFontScaleControls) return _hfmFontScaleControls;
  _hfmFontScaleControls = _buildHfmSliderControls({
    idBase: '_hfmFontScale',
    titleText: 'Focus',
    range: _HFM_FONT_SCALE_RANGE,
    getValue: () => _hfmFontScale,
    onInput: (value) => _applyHfmFontScale(value),
    speak: (value) =>
      _hfmIsVector(value)
        ? `Vector lines, ${_formatPercent(value)}`
        : _formatPercent(value),
  });
  return _hfmFontScaleControls;
}

function _initHfmPersistFadeControls() {
  if (_hfmPersistFadeControls) return _hfmPersistFadeControls;
  const base = _buildHfmSliderControls({
    idBase: '_hfmPersistFade',
    titleText: 'Glow',
    range: _HFM_PERSIST_FADE_RANGE,
    getValue: () => _hfmPersistFade,
    onInput: (value) => _applyHfmPersistFade(value),
  });
  // Afterglow is motion; hide the slider entirely under reduced-motion.
  _hfmPersistFadeControls = {
    setEnabled(isEnabled) {
      base.setEnabled(isEnabled && !_prefersReducedMotion());
    },
    sync(value) {
      base.sync(value);
    },
  };
  return _hfmPersistFadeControls;
}

// The vector look's surfaces: the last of the look's sliders.
function _initHfmSurfaceControls() {
  if (_hfmSurfaceControls) return _hfmSurfaceControls;
  _hfmSurfaceControls = _buildHfmSliderControls({
    idBase: '_hfmSurfaces',
    titleText: 'Surfaces',
    range: _HFM_SURFACE_RANGE,
    getValue: () => _hfmSurfaceOpacity,
    onInput: (value) => _applyHfmSurfaceOpacity(value),
    note: 'Below 40% Focus: how solid the faces under the lines are.',
  });
  return _hfmSurfaceControls;
}

function _setHfmSlidersEnabled(enabled) {
  _initHfmContrastControls().setEnabled(enabled);
  _initHfmFontScaleControls().setEnabled(enabled);
  _initHfmPersistFadeControls().setEnabled(enabled);
  _initHfmSurfaceControls().setEnabled(enabled);
}

// ---------------------------------------------------------------------------
// Variant asset switching (logo, favicon)
// ---------------------------------------------------------------------------

function _setHeaderLogoForVariant(enabled) {
  const img = document.querySelector('.header-logo');
  if (!img) return;

  if (!img.dataset.defaultSrc) {
    img.dataset.defaultSrc = img.getAttribute('src') || '';
  }

  if (enabled) {
    const isLight = _isLightThemeActive();
    const logoSrc = isLight
      ? '/icons/logo-mono-hc.svg'
      : '/icons/logo-mono.svg';
    img.setAttribute('src', logoSrc);
  } else if (img.dataset.defaultSrc) {
    img.setAttribute('src', img.dataset.defaultSrc);
  }
}

function _setFaviconForVariant(enabled) {
  const faviconSvg = document.querySelector(
    'link[rel="icon"][type="image/svg+xml"]'
  );
  if (!faviconSvg) return;

  if (!faviconSvg.dataset.defaultHref) {
    faviconSvg.dataset.defaultHref = faviconSvg.getAttribute('href') || '';
  }

  if (enabled) {
    const isLight = _isLightThemeActive();
    const faviconSrc = isLight
      ? '/icons/favicon-mono-hc.svg'
      : '/icons/favicon-mono.svg';
    faviconSvg.setAttribute('href', faviconSrc);
  } else if (faviconSvg.dataset.defaultHref) {
    faviconSvg.setAttribute('href', faviconSvg.dataset.defaultHref);
  }
}

function _setAssetsForVariant(enabled) {
  _setHeaderLogoForVariant(enabled);
  _setFaviconForVariant(enabled);
  if (enabled) {
    document.documentElement.setAttribute(
      'data-classic-retro',
      _HFM_CLASSIC_LOOK
    );
  } else {
    document.documentElement.removeAttribute('data-classic-retro');
  }
}

// ---------------------------------------------------------------------------
// Alt view enable / disable (requires previewManager)
// ---------------------------------------------------------------------------

function _loadSavedHfmSettings() {
  if (_hfmSettingsLoaded) return;
  _hfmSettingsLoaded = true;

  let savedContrast = null;
  let savedFont = null;
  let savedPersistFade = null;
  let savedSurfaces = null;
  try {
    savedContrast = localStorage.getItem(STORAGE_KEY_HFM_CONTRAST_SCALE);
    savedFont = localStorage.getItem(STORAGE_KEY_HFM_FONT_SCALE);
    savedPersistFade = localStorage.getItem(STORAGE_KEY_HFM_PERSIST_FADE);
    savedSurfaces = localStorage.getItem(STORAGE_KEY_HFM_SURFACES);
  } catch (_) {
    // Private browsing or storage unavailable
  }

  const parsedContrast =
    savedContrast !== null ? parseFloat(savedContrast) : NaN;
  const parsedFont = savedFont !== null ? parseFloat(savedFont) : NaN;
  const parsedPersistFade =
    savedPersistFade !== null ? parseFloat(savedPersistFade) : NaN;

  if (
    Number.isFinite(parsedContrast) &&
    parsedContrast >= _HFM_CONTRAST_RANGE.min &&
    parsedContrast <= _HFM_CONTRAST_RANGE.max
  ) {
    _hfmContrastScale = parsedContrast;
  }
  if (
    Number.isFinite(parsedFont) &&
    parsedFont >= _HFM_FONT_SCALE_RANGE.min &&
    parsedFont <= _HFM_FONT_SCALE_RANGE.max
  ) {
    _hfmFontScale = parsedFont;
  } else if (window.innerWidth < _HFM_PHONE_MAX_WIDTH_PX) {
    _hfmFontScale = _HFM_FONT_SCALE_PHONE_DEFAULT;
  }
  if (
    Number.isFinite(parsedPersistFade) &&
    parsedPersistFade >= _HFM_PERSIST_FADE_RANGE.min &&
    parsedPersistFade <= _HFM_PERSIST_FADE_RANGE.max
  ) {
    _hfmPersistFade = parsedPersistFade;
  }
  const parsedSurfaces =
    savedSurfaces !== null ? parseFloat(savedSurfaces) : NaN;
  if (
    Number.isFinite(parsedSurfaces) &&
    parsedSurfaces >= _HFM_SURFACE_RANGE.min &&
    parsedSurfaces <= _HFM_SURFACE_RANGE.max
  ) {
    _hfmSurfaceOpacity = parsedSurfaces;
  }
}

function _onAltViewRevealEnd(event) {
  if (event.animationName === 'alt-view-reveal') _endAltViewReveal();
}

function _endAltViewReveal() {
  clearTimeout(_hfmRevealTimer);
  _hfmRevealTimer = null;
  document.body?.removeEventListener('animationend', _onAltViewRevealEnd);
  document.documentElement.removeAttribute('data-alt-view-reveal');
}

/** @returns {boolean} Whether the draw-in is playing now. */
function _playAltViewReveal() {
  if (_prefersReducedMotion()) return false;
  document.body?.addEventListener('animationend', _onAltViewRevealEnd);
  _hfmRevealTimer = setTimeout(_endAltViewReveal, _HFM_REVEAL_FALLBACK_MS);
  document.documentElement.setAttribute('data-alt-view-reveal', '');
  return true;
}

function _onPowerOnEnd(event) {
  if (event.animationName.startsWith('alt-view-power-on')) _endPowerOn();
}

function _endPowerOn() {
  clearTimeout(_hfmPowerOnTimer);
  _hfmPowerOnTimer = null;
  const waiters = _hfmPowerOnWaiters;
  _hfmPowerOnWaiters = [];
  waiters.forEach((done) => done());
  const canvas = document.querySelector('.hfm-overlay-canvas');
  if (!canvas) return;
  canvas.removeEventListener('animationend', _onPowerOnEnd);
  canvas.classList.remove(
    'alt-view-power-on',
    'alt-view-power-on--after-reveal'
  );
}

// The picture powers on like a monitor (the look's own way, in the styles);
// when the screen is drawing in, it waits for that to finish.
function _powerOnPicture(afterReveal) {
  const canvas = document.querySelector('.hfm-overlay-canvas');
  if (!canvas || _prefersReducedMotion()) return;
  canvas.addEventListener('animationend', _onPowerOnEnd);
  _hfmPowerOnTimer = setTimeout(_endPowerOn, _HFM_POWER_ON_FALLBACK_MS);
  canvas.classList.add('alt-view-power-on');
  if (afterReveal) canvas.classList.add('alt-view-power-on--after-reveal');
}

/** @returns {Promise<void>} once the picture has powered on, or would have */
function _poweredOn() {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(
      done,
      _HFM_SOUND_LEAD_MS + _HFM_POWER_ON_FALLBACK_MS
    );
    _hfmPowerOnWaiters.push(done);
  });
}

/**
 * Shut the open drawers at once, quietly and without remembering it, and
 * say which they were, left to right. With reduced motion they stay open.
 * @returns {string[]}
 */
function _shutDrawersForDrawIn() {
  if (_prefersReducedMotion()) return [];
  const names = openLookDrawers();
  const how = { instant: true, quiet: true, remember: false };
  names.forEach((name) => setLookDrawer(name, false, how));
  return names;
}

/** Open the shut drawers again once the picture is on, one at a time. */
async function _openDrawersAfterDrawIn(names) {
  if (!names.length) return;
  const staging = { names: [...names], stopped: false };
  _hfmDrawerStaging = staging;
  // While they come back the page says so, for anything that waits on them.
  document.documentElement.dataset.altViewDrawers = 'returning';
  await _poweredOn();
  while (staging.names.length && !staging.stopped) {
    const slide = setLookDrawer(staging.names.shift(), true, {
      quiet: true,
      remember: false,
    });
    if (slide) await slide;
    if (staging.names.length && !staging.stopped) {
      await new Promise((resolve) => setTimeout(resolve, _HFM_DRAWER_PAUSE_MS));
    }
  }
  if (_hfmDrawerStaging === staging) {
    _hfmDrawerStaging = null;
    delete document.documentElement.dataset.altViewDrawers;
  }
}

/** Leaving the look in the middle: what is still shut opens at once. */
function _endDrawerStaging() {
  const staging = _hfmDrawerStaging;
  if (!staging) return;
  _hfmDrawerStaging = null;
  delete document.documentElement.dataset.altViewDrawers;
  staging.stopped = true;
  const how = { instant: true, quiet: true, remember: false };
  staging.names.forEach((name) => setLookDrawer(name, true, how));
  staging.names = [];
}

function _typeAltViewGreeting() {
  let shown = _prefersReducedMotion() ? _HFM_GREETING.length : 1;
  const step = () => {
    _hfmStatusOverride = _HFM_GREETING.slice(0, shown);
    _updateHfmStatusBar();
    if (shown < _HFM_GREETING.length) {
      shown += 1;
      _hfmGreetingTimer = setTimeout(step, _HFM_GREETING_LETTER_MS);
      return;
    }
    _hfmGreetingTimer = setTimeout(() => {
      _hfmGreetingTimer = null;
      _hfmStatusOverride = null;
      _updateHfmStatusBar();
    }, _HFM_GREETING_HOLD_MS);
  };
  step();
}

function _stopAltViewStart() {
  _endAltViewReveal();
  _endPowerOn();
  clearTimeout(_hfmGreetingTimer);
  _hfmGreetingTimer = null;
  _hfmStatusOverride = null;
  clearTimeout(_hfmMomentTimer);
  _hfmMomentTimer = null;
  _hfmMomentBegin = null;
  stopCrtSound();
}

// The switch sounds follow Preferences > Play sounds, as the unlock tune
// does; reduced motion leaves them alone, since sound is not motion.
// Classic is the blue DOS look and has sounds of its own: one set for every
// family, chosen here. The keys and the dials take it as an argument; the
// rest read it from the module, told at the look's start and at each
// change of mode while the look is on.
function _hfmKeySet() {
  return document.body?.dataset.uiMode === 'classic' ? 'd' : 'p';
}

function _syncSoundSet() {
  setSoundSet(_hfmKeySet());
}

function _hfmKeyBand(el) {
  const box = el.getBoundingClientRect();
  const area = box.width * box.height;
  let band = 1;
  for (const edge of _HFM_KEY_BANDS_PX2) if (area >= edge) band++;
  return band;
}

// The button a press lands on; the look's own key keeps its switch sounds,
// the sounds button plays its key only when it turns sounds on, and a
// switch snaps instead.
function _hfmKeyTarget(event) {
  const el =
    event.target?.closest?.(_HFM_KEY_TARGET) ?? _hfmChooserLabel(event.target);
  if (
    !el ||
    el.id === '_hfmToggle' ||
    el.id === '_hfmSounds' ||
    el.disabled ||
    el.matches(_HFM_SNAP_TARGET)
  ) {
    return null;
  }
  return el;
}

// A file chooser drawn as a button is a label around its file input; a
// press on either is the label's key.
function _hfmChooserLabel(target) {
  const label =
    target instanceof HTMLInputElement
      ? target.labels?.[0]
      : target?.closest?.('label');
  const control = label?.control;
  return control?.type === 'file' && !control.disabled ? label : null;
}

// A controller's button held down: the press a controller makes is a click.
function _hfmPadButtonHeld() {
  for (const pad of navigator.getGamepads?.() ?? []) {
    if (pad?.buttons?.some((button) => button?.pressed)) return true;
  }
  return false;
}

// A field a keystroke types into.
function _hfmTypedInto(el) {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    return _HFM_TYPED_INPUTS.has(el.type) && !el.readOnly && !el.disabled;
  }
  return Boolean(el?.isContentEditable);
}

// A key that types or edits, not a shortcut, a modifier or a move.
function _hfmTypes(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return (
    event.key?.length === 1 ||
    event.key === 'Backspace' ||
    event.key === 'Delete' ||
    event.key === 'Enter'
  );
}

// A list or a color well: one that opens to be chosen from.
function _hfmSelector(el) {
  if (el instanceof HTMLSelectElement) return !el.multiple && el.size <= 1;
  return el instanceof HTMLInputElement && el.type === 'color';
}

// A latch is a menu's or a dialog's; the snaps, levers and selectors are
// the switches' and lists'.
function _playControlSound(kind) {
  if (!_soundOn(kind.startsWith('latch') ? 'menus' : 'switches')) return;
  playControlSound(kind).catch((error) => {
    console.warn(`[Alt View] The ${kind} sound did not play:`, error);
  });
}

function _playTypingSound() {
  if (!_soundOn('typing')) return;
  playTypingSound(_hfmKeySet()).catch((error) => {
    console.warn('[Alt View] A typing sound did not play:', error);
  });
}

// A drawer the look heard move: its own sound in the look's set.
function _playDrawerSound(name, open, move) {
  if (!_HFM_SOUNDING_DRAWERS.has(name) || !_soundOn('drawers')) return;
  playDrawerSound(name, open ? 'open' : 'close', move).catch((error) => {
    console.warn(`[Alt View] The ${name} drawer's sound did not play:`, error);
  });
}

// Whether a latch's pop-up shows, by the attribute that hides it.
function _hfmLatchShown(attr, value) {
  return attr === 'aria-hidden' ? value === 'false' : value === null;
}

// A dialog or a menu that opened or closed since the last look: a latch
// each. The first change an element had in the batch says how it was.
function _hfmLatchesMoved(records) {
  const first = new Map();
  for (const record of records) {
    const seen = first.get(record.target) ?? new Map();
    if (!seen.has(record.attributeName)) {
      seen.set(record.attributeName, record.oldValue);
    }
    first.set(record.target, seen);
  }
  for (const [el, seen] of first) {
    for (const [attr, was] of seen) {
      const latch =
        attr === 'aria-hidden'
          ? el.matches(_HFM_LATCH_BY_ARIA_HIDDEN)
          : el.matches(_HFM_LATCH_BY_HIDDEN);
      if (!latch) continue;
      const shown = _hfmLatchShown(attr, el.getAttribute(attr));
      if (shown === _hfmLatchShown(attr, was)) continue;
      _playControlSound(shown ? 'latch-open' : 'latch-close');
    }
  }
}

// Where a grip is now.
function _hfmGripAt(el) {
  const box = el.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

// A grip's tick when it has come 2 % of the window or more from the last
// one, no sooner than a dial's click.
function _hfmGripMoved(grip, { anyMove = false } = {}) {
  const at = _hfmGripAt(grip.el);
  const share = Math.max(
    Math.abs(at.x - grip.from.x) / Math.max(1, window.innerWidth),
    Math.abs(at.y - grip.from.y) / Math.max(1, window.innerHeight)
  );
  const moved = anyMove ? share > 0 : share >= _HFM_GRIP_STEP - 1e-9;
  if (!moved) return;
  grip.from = at;
  const now = performance.now();
  if (now - _hfmGripLastAt < 1000 / _HFM_DIAL_CLICKS_PER_SECOND) return;
  _hfmGripLastAt = now;
  _playDialSound(_HFM_GRIP_TONE);
}

function _stopGripWatch() {
  if (!_hfmGrip) return;
  cancelAnimationFrame(_hfmGrip.frame);
  _hfmGrip = null;
}

function _playKeySound(el, phase) {
  if (
    !_soundOn('keys') ||
    _HFM_CAMERA_BUTTONS.has(el.id) ||
    el.matches(_HFM_DRAWER_BUTTONS)
  ) {
    return;
  }
  playKeySound(_hfmKeySet(), _hfmKeyBand(el), phase).catch((error) => {
    console.warn(`[Alt View] A key sound did not play:`, error);
  });
}

// The slider, or the number box stepped by its arrows, a press or a move
// lands on.
function _hfmDialTarget(event) {
  const el = event.target;
  return el instanceof HTMLInputElement &&
    (el.type === 'range' || el.type === 'number') &&
    !el.disabled
    ? el
    : null;
}

function _hfmDialVariant(el) {
  const min = Number(el.min) || 0;
  const max = Number(el.max) || 100;
  const step = Number(el.step) || 1;
  const steps = Math.round(Math.abs(max - min) / step);
  let variant = 1;
  for (const edge of _HFM_DIAL_STEP_EDGES) if (steps > edge) variant++;
  return variant;
}

// A slider's tone is chosen once and kept, so one drag plays one file.
function _hfmDial(el) {
  let dial = _hfmDials.get(el);
  if (!dial) {
    dial = { variant: _hfmDialVariant(el), value: NaN };
    _hfmDials.set(el, dial);
  }
  return dial;
}

function _playDialSound(variant) {
  if (!_soundOn('dials')) return;
  playDialSound(_hfmKeySet(), variant).catch((error) => {
    console.warn(`[Alt View] A dial click did not play:`, error);
  });
}

function _preloadLookSounds() {
  _syncSoundSet();
  if (!_soundsOn()) return;
  preloadLookSounds();
}

// Where the camera is, seen from what it looks at: its turn and tilt in
// degrees, and how far away as a logarithm, so in and out count alike (an
// orthographic view zooms without moving); with it, what it looks at, its
// distance, and the camera's right and up as unit vectors (Z is up; looking
// straight down or up, right falls back to +x), the axes a pan moves along.
function _hfmCameraPose(previewManager) {
  const camera = previewManager.getActiveCamera?.();
  const target = previewManager.controls?.target;
  if (!camera || !target) return null;
  const x = camera.position.x - target.x;
  const y = camera.position.y - target.y;
  const z = camera.position.z - target.z;
  const distance = Math.hypot(x, y, z);
  if (distance < 1e-6) return null;
  const ortho =
    previewManager.projectionMode === 'orthographic'
      ? previewManager.orthoCamera
      : null;
  const forward = { x: -x / distance, y: -y / distance, z: -z / distance };
  const sideways = Math.hypot(forward.y, forward.x);
  const right =
    sideways < 1e-6
      ? { x: 1, y: 0, z: 0 }
      : { x: forward.y / sideways, y: -forward.x / sideways, z: 0 };
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };
  return {
    turn: (Math.atan2(y, x) * 180) / Math.PI,
    tilt: (Math.asin(Math.max(-1, Math.min(1, z / distance))) * 180) / Math.PI,
    zoom: Math.log(ortho ? 1 / ortho.zoom : distance),
    distance,
    target: { x: target.x, y: target.y, z: target.z },
    right,
    up,
  };
}

// A controller moving the view itself: a stick past its dead zone, a
// trigger (the standard layout's zoom), or the D-pad (a turn or a tilt a
// step in the Camera preset).
function _hfmStickPushed() {
  for (const pad of navigator.getGamepads?.() ?? []) {
    if (!pad) continue;
    if (pad.axes?.some((value) => Math.abs(value) >= _HFM_STICK_DEAD_ZONE)) {
      return true;
    }
    if ([12, 13, 14, 15].some((index) => pad.buttons?.[index]?.pressed)) {
      return true;
    }
    if (
      [6, 7].some(
        (index) => (pad.buttons?.[index]?.value ?? 0) >= _HFM_STICK_DEAD_ZONE
      )
    ) {
      return true;
    }
  }
  return false;
}

// One of the view's ticks, unless one came under 70 ms ago, by its way; a
// pan is the stage's motion instead.
function _playCameraTick(kind, way = 0) {
  if (kind === 'pan') {
    _panStart(way);
    return;
  }
  const now = performance.now();
  if (now - _hfmCameraTickAt < _HFM_CAMERA_TICK_GAP_MS) return;
  _hfmCameraTickAt = now;
  if (!_soundOn('camera')) return;
  playCameraSound(kind, { way }).catch((error) => {
    console.warn('[Alt View] A camera tick did not play:', error);
  });
}

// The stage's motion: started once, kept going while the view moves, and
// wound down once it has rested; a pan with no view to watch (no controls)
// is a short motion on its own.
function _panStart(way) {
  const cam = _hfmCamera;
  const now = performance.now();
  if (cam?.pan) {
    cam.panMovedAt = now;
    return;
  }
  if (!_soundOn('camera')) return;
  const handle = startPanMotion({ way }).catch((error) => {
    console.warn('[Alt View] The pan did not play:', error);
    return null;
  });
  if (!cam) {
    setTimeout(() => handle.then((h) => h?.stop()), _HFM_PAN_REST_MS);
    return;
  }
  cam.pan = { handle };
  cam.panMovedAt = now;
  _panArm(cam);
}

function _panArm(cam) {
  clearTimeout(cam.panTimer);
  cam.panTimer = setTimeout(() => _panRestCheck(cam), _HFM_PAN_REST_MS + 10);
}

function _panRestCheck(cam) {
  if (!cam.pan) return;
  if (performance.now() - cam.panMovedAt < _HFM_PAN_REST_MS) {
    _panArm(cam);
    return;
  }
  _panStop(cam);
}

function _panStop(cam) {
  const motion = cam.pan;
  if (!motion) return;
  cam.pan = null;
  clearTimeout(cam.panTimer);
  cam.panTimer = null;
  motion.handle.then((h) => h?.stop());
}

// A pan carries the camera and what it looks at together, so the camera's
// place seen from its target (its turn, tilt and distance) stays. A frame
// that also turned, tilted or zoomed (a zoom toward the pointer re-aims the
// target) is not a pan's.
function _panTogether(cam, pose) {
  const last = cam.lastPose;
  cam.lastPose = pose;
  if (!last) return false;
  const turned = ((((pose.turn - last.turn) % 360) + 540) % 360) - 180;
  return (
    Math.abs(turned) < 0.01 &&
    Math.abs(pose.tilt - last.tilt) < 0.01 &&
    Math.abs(pose.zoom - last.zoom) < 1e-4
  );
}

// What the view looks at, watched frame by frame: a move with the camera
// keeps the stage's motion going, rest winds it down.
function _panTrack(cam, pose, together) {
  const last = cam.lastTarget;
  cam.lastTarget = pose.target;
  if (!last || !cam.pan) return;
  const moved = together
    ? Math.hypot(
        pose.target.x - last.x,
        pose.target.y - last.y,
        pose.target.z - last.z
      ) / pose.distance
    : 0;
  if (moved > _HFM_PAN_MOVE_MIN) {
    cam.panMovedAt = performance.now();
    _panArm(cam);
  } else {
    _panRestCheck(cam);
  }
}

function _installCameraTicks(previewManager) {
  const controls = previewManager?.controls;
  if (_hfmCamera || !controls?.addEventListener) return;
  const cam = {
    from: null,
    way: { turn: 0, tilt: 0, zoom: 0, across: 0, up: 0 },
    dragging: false,
    directUntil: 0,
    pan: null,
    panMovedAt: 0,
    panTimer: null,
    lastTarget: null,
    lastPose: null,
  };
  // A move of the view's own: a drag (and its glide after), a stick, or
  // auto-rotate turning it every frame.
  const direct = () =>
    cam.dragging ||
    performance.now() < cam.directUntil ||
    _hfmStickPushed() ||
    Boolean(previewManager.isAutoRotateEnabled?.());
  const onStart = () => {
    cam.dragging = true;
  };
  const onEnd = () => {
    cam.dragging = false;
    cam.directUntil = performance.now() + _HFM_CAMERA_GLIDE_MS;
  };
  const onChange = () => {
    const pose = _hfmCameraPose(previewManager);
    if (!pose) return;
    const together = _panTogether(cam, pose);
    _panTrack(cam, pose, together);
    if (!cam.from || !direct()) {
      cam.from = pose;
      return;
    }
    let kind = null;
    for (const name of ['turn', 'tilt', 'zoom']) {
      let moved = pose[name] - cam.from[name];
      if (name === 'turn') moved = (((moved % 360) + 540) % 360) - 180;
      const sign = Math.sign(moved);
      const reach =
        _HFM_CAMERA_STEPS[name] +
        (sign === -cam.way[name] ? _HFM_CAMERA_DEAD_BAND[name] : 0);
      // A whisker of slack: a pose read back through the trigonometry
      // lands a hair under an exact step.
      const size = Math.abs(moved) + 1e-6;
      if (size < reach) continue;
      const steps = Math.floor(size / _HFM_CAMERA_STEPS[name]);
      cam.from[name] += sign * steps * _HFM_CAMERA_STEPS[name];
      cam.way[name] = sign;
      kind ??= name;
    }
    // A pan moves what the view looks at along the camera's right and up;
    // each counts as a share of the camera's distance, so a pan ticks alike
    // close up and far off. A frame that was not a pan's starts the count
    // again from where the target is.
    let panWay = 0;
    const target = cam.from.target;
    if (!together) {
      target.x = pose.target.x;
      target.y = pose.target.y;
      target.z = pose.target.z;
    }
    const moved = {
      x: pose.target.x - target.x,
      y: pose.target.y - target.y,
      z: pose.target.z - target.z,
    };
    for (const [name, axis] of [
      ['across', pose.right],
      ['up', pose.up],
    ]) {
      const along =
        (moved.x * axis.x + moved.y * axis.y + moved.z * axis.z) /
        pose.distance;
      const sign = Math.sign(along);
      const reach =
        _HFM_CAMERA_STEPS.pan +
        (sign === -cam.way[name] ? _HFM_CAMERA_DEAD_BAND.pan : 0);
      const size = Math.abs(along) + 1e-9;
      if (size < reach) continue;
      const steps = Math.floor(size / _HFM_CAMERA_STEPS.pan);
      const by = sign * steps * _HFM_CAMERA_STEPS.pan * pose.distance;
      target.x += axis.x * by;
      target.y += axis.y * by;
      target.z += axis.z * by;
      cam.way[name] = sign;
      kind ??= 'pan';
      panWay ||= sign;
    }
    // The turn's angle grows as the view turns left (as Rotate left turns
    // it), the tilt's as it tilts up, the distance as it zooms out; a pan
    // right or up is its way.
    const ways = {
      turn: -cam.way.turn,
      tilt: cam.way.tilt,
      zoom: -cam.way.zoom,
      pan: panWay,
    };
    if (kind) _playCameraTick(kind, ways[kind]);
  };
  // Any other press is not a direct move of the view: what it moves, it
  // moves as a button, a menu or a shortcut does.
  const elsewhere = (event) => {
    const canvas = previewManager.renderer?.domElement;
    if (
      canvas &&
      event.target instanceof Node &&
      canvas.contains(event.target)
    ) {
      return;
    }
    cam.directUntil = 0;
  };
  const onKey = (event) => {
    const focused = document.activeElement;
    const onPreview =
      !!focused &&
      (previewManager.container?.contains(focused) ||
        focused === previewManager.renderer?.domElement);
    const plain = !event.ctrlKey && !event.altKey && !event.metaKey;
    cam.directUntil =
      onPreview && plain && _HFM_CAMERA_KEYS.has(event.key)
        ? performance.now() + _HFM_CAMERA_KEY_MS
        : 0;
  };
  cam.controls = controls;
  cam.controlListeners = [
    ['start', onStart],
    ['change', onChange],
    ['end', onEnd],
  ];
  cam.pageListeners = [
    ['pointerdown', elsewhere],
    ['click', elsewhere],
    ['keydown', onKey],
  ];
  for (const [type, fn] of cam.controlListeners) {
    controls.addEventListener(type, fn);
  }
  for (const [type, fn] of cam.pageListeners) {
    document.addEventListener(type, fn, true);
  }
  _hfmCamera = cam;
}

function _removeCameraTicks() {
  if (!_hfmCamera) return;
  _panStop(_hfmCamera);
  const { controls, controlListeners, pageListeners } = _hfmCamera;
  for (const [type, fn] of controlListeners) {
    controls.removeEventListener(type, fn);
  }
  for (const [type, fn] of pageListeners) {
    document.removeEventListener(type, fn, true);
  }
  _hfmCamera = null;
}

// Every control of the look: the keys and the dials, the switches, the
// lists, the typing, the grips, the menus and dialogs, and the drawers.
function _installKeySounds() {
  if (_hfmKeyListeners) return;
  _preloadLookSounds();
  const down = (event) => {
    const el = _hfmKeyTarget(event);
    if (!el) return;
    _hfmKeyDown = el;
    _hfmKeyHeard = el;
    _playKeySound(el, 'down');
  };
  const up = () => {
    if (!_hfmKeyDown) return;
    const el = _hfmKeyDown;
    _hfmKeyDown = null;
    _playKeySound(el, 'up');
  };
  // Enter or Space on a focused button is a press too, once per press.
  const keydown = (event) => {
    if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
    const el = _hfmKeyTarget(event);
    if (!el || (el !== event.target && el.control !== event.target)) return;
    _hfmKeyDown = el;
    _hfmKeyHeard = el;
    _playKeySound(el, 'down');
  };
  const keyup = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    up();
  };
  // A click no press of ours came before: a screen reader's Enter in browse
  // mode, which the page gets as a click alone, or a controller's A button.
  // Anything else the page clicks for itself stays quiet. A label's click
  // is passed on to its file input, and the two are one press. A camera
  // button's click, after its press or alone, is its move: heard as the
  // view's tick instead of a key.
  const click = (event) => {
    const el = _hfmKeyTarget(event);
    if (!el) return;
    const control = el instanceof HTMLLabelElement ? el.control : null;
    const passing = control !== null && event.target !== control;
    const camera = _HFM_CAMERA_BUTTONS.get(el.id);
    if (el === _hfmKeyHeard) {
      if (!passing) _hfmKeyHeard = null;
      if (camera) _playCameraTick(...camera);
      return;
    }
    // A file input another control opens: that control has sounded.
    if (control && !passing && control !== document.activeElement) return;
    if (!event.isTrusted && !_hfmPadButtonHeld()) return;
    if (passing) _hfmKeyHeard = el;
    if (camera) {
      _playCameraTick(...camera);
      return;
    }
    _playKeySound(el, 'down');
    setTimeout(() => _playKeySound(el, 'up'), _HFM_KEY_TAP_MS);
  };
  // A checkbox flips its lever once it has changed, up for on and down for
  // off, and a radio button snaps as it is chosen; a switch or a radio drawn
  // as a button does so as it is pressed, by the state it leaves.
  const snapChange = (event) => {
    const el = event.target;
    if (!(el instanceof HTMLInputElement)) return;
    if (el.type === 'radio') {
      _playControlSound('snap-on');
    } else if (el.type === 'checkbox') {
      _playControlSound(el.checked ? 'lever-on' : 'lever-off');
    }
  };
  const snapClick = (event) => {
    const el = event.target?.closest?.(
      '[role="switch"], [role="checkbox"], [role="radio"]'
    );
    if (
      !el ||
      el instanceof HTMLInputElement ||
      el.disabled ||
      el.getAttribute('aria-disabled') === 'true'
    ) {
      return;
    }
    const on = el.getAttribute('aria-checked') === 'true';
    if (el.getAttribute('role') === 'radio') {
      // A radio button already chosen does nothing when pressed again.
      if (!on) _playControlSound('snap-on');
      return;
    }
    _playControlSound(on ? 'lever-off' : 'lever-on');
  };
  // A list clicks as it opens, by a press or by the keys that open it, and
  // again as a choice is made.
  const selectDown = (event) => {
    if (_hfmSelector(event.target) && !event.target.disabled) {
      _playControlSound('select-open');
    }
  };
  const selectKey = (event) => {
    const el = event.target;
    if (!_hfmSelector(el) || el.disabled) return;
    const opens =
      event.key === 'F4' ||
      (event.altKey &&
        (event.key === 'ArrowDown' || event.key === 'ArrowUp')) ||
      event.key === ' ' ||
      (el instanceof HTMLInputElement && event.key === 'Enter');
    if (opens && !event.repeat) _playControlSound('select-open');
  };
  const selectChange = (event) => {
    const el = event.target;
    if (el instanceof HTMLSelectElement || _hfmSelector(el)) {
      _playControlSound('select-choose');
    }
  };
  // A keystroke in a field: the quiet key.
  const typing = (event) => {
    const el = event.target;
    if (!_hfmTypedInto(el) || !_hfmTypes(event)) return;
    const now = performance.now();
    _hfmTypedAt.set(el, now);
    if (now - _hfmTypingLastAt < 1000 / _HFM_TYPING_PER_SECOND) return;
    _hfmTypingLastAt = now;
    _playTypingSound();
  };
  // A grip taken hold of: watched each frame until it is let go. Moved by
  // its keys: a tick for any move a key made.
  const gripDown = (event) => {
    const el = event.target?.closest?.(_HFM_GRIP_TARGET);
    if (!el) return;
    _stopGripWatch();
    const grip = { el, from: _hfmGripAt(el), frame: 0 };
    const watch = () => {
      _hfmGripMoved(grip);
      grip.frame = requestAnimationFrame(watch);
    };
    grip.frame = requestAnimationFrame(watch);
    _hfmGrip = grip;
  };
  const gripUp = () => _stopGripWatch();
  const gripKey = (event) => {
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(_HFM_GRIP_TARGET)) return;
    if (!/^(Arrow|Home$|End$|Page)/.test(event.key)) return;
    const grip = { el, from: _hfmGripAt(el) };
    requestAnimationFrame(() => _hfmGripMoved(grip, { anyMove: true }));
  };
  // A slider taken hold of, by pointer or key: where it stands, so the
  // first move's steps are counted from there.
  const dialDown = (event) => {
    const el = _hfmDialTarget(event);
    if (el) _hfmDial(el).value = Number(el.value);
  };
  // Every move the slider makes: one click when a step was crossed and the
  // last click is far enough behind; nothing for a move that left the
  // value where it was.
  const dialInput = (event) => {
    const el = _hfmDialTarget(event);
    if (!el) return;
    const dial = _hfmDial(el);
    const value = Number(el.value);
    // A number typed into the box was heard as typing.
    if (performance.now() - (_hfmTypedAt.get(el) ?? -Infinity) < 150) {
      dial.value = value;
      return;
    }
    const step = Number(el.step) || 1;
    const crossed = Number.isFinite(dial.value)
      ? Math.round(Math.abs(value - dial.value) / step)
      : 1;
    dial.value = value;
    if (!crossed) return;
    const now = performance.now();
    if (now - _hfmDialLastClickAt < 1000 / _HFM_DIAL_CLICKS_PER_SECOND) return;
    _hfmDialLastClickAt = now;
    _playDialSound(dial.variant);
  };
  _hfmKeyListeners = [
    ['pointerdown', down],
    ['pointerup', up],
    ['pointercancel', up],
    ['keydown', keydown],
    ['keyup', keyup],
    ['click', click],
    ['pointerdown', dialDown],
    ['keydown', dialDown],
    ['input', dialInput],
    ['change', snapChange],
    ['click', snapClick],
    ['pointerdown', selectDown],
    ['keydown', selectKey],
    ['change', selectChange],
    ['keydown', typing],
    ['pointerdown', gripDown],
    ['pointerup', gripUp],
    ['pointercancel', gripUp],
    ['keydown', gripKey],
  ];
  for (const [type, fn] of _hfmKeyListeners) {
    document.addEventListener(type, fn, true);
  }
  _hfmLatches = new MutationObserver(_hfmLatchesMoved);
  _hfmLatches.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-hidden', 'hidden'],
    attributeOldValue: true,
  });
  onDrawerMove(_playDrawerSound);
  _installScrollTicks();
}

function _playScrollTick(way) {
  const now = performance.now();
  if (now - _hfmScrollTickAt < _HFM_SCROLL_TICK_GAP_MS) return;
  _hfmScrollTickAt = now;
  if (!_soundOn('scroll')) return;
  playScrollSound({ way }).catch((error) => {
    console.warn('[Alt View] A scroll tick did not play:', error);
  });
}

function _playScrollEnd() {
  if (!_soundOn('scroll')) return;
  playScrollSound({ end: true }).catch((error) => {
    console.warn("[Alt View] The end of a list's sound did not play:", error);
  });
}

function _installScrollTicks() {
  if (_hfmScrollListeners) return;
  const hand = () => {
    _hfmScrollHandUntil = performance.now() + _HFM_SCROLL_HAND_MS;
  };
  const key = (event) => {
    if (_HFM_SCROLL_KEYS.has(event.key)) hand();
  };
  // A press on a scrollbar lands on the element that scrolls, outside its
  // content.
  const bar = (event) => {
    const el = event.target;
    if (
      el instanceof Element &&
      el.clientWidth > 0 &&
      (event.offsetX > el.clientWidth || event.offsetY > el.clientHeight)
    ) {
      hand();
    }
  };
  const scrolled = (event) => {
    const el =
      event.target === document ? document.scrollingElement : event.target;
    if (!(el instanceof Element)) return;
    const top = el.scrollTop;
    const seen = _hfmScrolls.get(el);
    if (!seen) {
      _hfmScrolls.set(el, { top, carry: 0, end: null });
      return;
    }
    const moved = top - seen.top;
    seen.top = top;
    if (!moved) return;
    if (performance.now() > _hfmScrollHandUntil) {
      seen.carry = 0;
      seen.end = null;
      return;
    }
    seen.carry =
      Math.sign(seen.carry) === Math.sign(moved) ? seen.carry + moved : moved;
    if (Math.abs(seen.carry) >= _HFM_SCROLL_LINE_PX) {
      seen.carry %= _HFM_SCROLL_LINE_PX;
      _playScrollTick(moved > 0 ? -1 : 1);
    }
    const bottom = el.scrollHeight - el.clientHeight;
    const end = top <= 0 ? 'top' : top >= bottom - 1 ? 'bottom' : null;
    if (end && end !== seen.end) _playScrollEnd();
    seen.end = end;
  };
  _hfmScrollListeners = [
    ['wheel', hand],
    ['touchstart', hand],
    ['touchmove', hand],
    ['touchend', hand],
    ['keydown', key],
    ['pointerdown', bar],
    ['scroll', scrolled],
  ];
  for (const [type, fn] of _hfmScrollListeners) {
    document.addEventListener(type, fn, { capture: true, passive: true });
  }
}

function _removeScrollTicks() {
  if (!_hfmScrollListeners) return;
  for (const [type, fn] of _hfmScrollListeners) {
    document.removeEventListener(type, fn, { capture: true });
  }
  _hfmScrollListeners = null;
}

function _removeKeySounds() {
  _removeScrollTicks();
  if (!_hfmKeyListeners) return;
  for (const [type, fn] of _hfmKeyListeners) {
    document.removeEventListener(type, fn, true);
  }
  _hfmKeyListeners = null;
  _hfmKeyDown = null;
  _hfmKeyHeard = null;
  _hfmDialLastClickAt = -Infinity;
  _hfmTypingLastAt = -Infinity;
  _stopGripWatch();
  _hfmGripLastAt = -Infinity;
  _hfmLatches?.disconnect();
  _hfmLatches = null;
  onDrawerMove(null);
}

/** @returns {Promise<void>|null} Settles once the sound has started or failed; null when none plays */
function _playCrtSound(name) {
  if (!name || !_soundsOn()) return null;
  return playCrtSound(name).catch((error) => {
    console.warn(`[Alt View] The ${name} sound did not play:`, error);
  });
}

/**
 * The Alt View's moment: the screen draws in, the picture powers on and,
 * when asked, the greeting is typed. It plays every time the look comes on
 * or changes (a theme switch, Classic entered or left), not once per page:
 * each switch is a screen coming on. A moment still running is ended first,
 * and the page is laid out in between so the same animation starts again.
 * The sound first, then the screen: the draw-in waits for the sound to
 * start (a quarter second at the most). With reduced motion nothing moves
 * and the greeting shows whole; the sound plays either way.
 *
 * @param {{greeting: boolean, sound: 'on'|'look'}} options
 */
function _playAltViewMoment({ greeting, sound }) {
  _stopAltViewStart();
  const begin = () => {
    if (_hfmMomentBegin !== begin) return;
    _hfmMomentBegin = null;
    clearTimeout(_hfmMomentTimer);
    _hfmMomentTimer = null;
    void document.body?.offsetWidth;
    const revealing = _playAltViewReveal();
    _powerOnPicture(revealing);
    if (greeting) _typeAltViewGreeting();
  };
  _hfmMomentBegin = begin;
  const started = _playCrtSound(sound);
  if (!started) {
    begin();
    return;
  }
  // While the screen waits, the status line holds blank for the greeting
  // rather than showing the ordinary line first.
  if (greeting) {
    _hfmStatusOverride = '';
    _updateHfmStatusBar();
  }
  _hfmMomentTimer = setTimeout(begin, _HFM_SOUND_LEAD_MS);
  started.then(begin);
}

/**
 * Where the preview made no 3D renderer (WebGL switched off or missing) there
 * is no picture to draw with characters: the page is left as it was, the look
 * a choice made on the Main Page set included, and the reason is shown under
 * the preview and said once.
 */
function _altViewCannotStart(toggleBtn) {
  _stopAltViewStart();
  document.documentElement.removeAttribute('data-ui-variant');
  _setAssetsForVariant(false);
  toggleBtn?.setAttribute('aria-pressed', 'false');
  _hfmPendingEnable = false;
  const strip = document.getElementById('previewStatusAltAdjust');
  if (strip) {
    strip.textContent = _HFM_NO_GRAPHICS_SENTENCE;
    strip.dataset.notice = '';
  }
  document.getElementById('previewStatusBar')?.classList.add('has-alt-adjust');
  announceImmediate(_HFM_NO_GRAPHICS_SENTENCE);
}

/** @returns {Promise<boolean|undefined>} false when the Alt View could not start */
async function _enableAltViewWithPreview(toggleBtn) {
  const previewManager = _getPreviewManager();
  if (!previewManager) return;
  if (!previewManager.renderer) {
    _altViewCannotStart(toggleBtn);
    return false;
  }

  const root = document.documentElement;
  _setAssetsForVariant(true);

  if (!_hfmInitPromise) {
    _hfmInitPromise = import('./_hfm.js').then((mod) =>
      mod.initAltView(previewManager)
    );
  }
  _hfmAltView = await _hfmInitPromise;
  _hfmAltView.enable();

  const motionMql = window.matchMedia('(prefers-reduced-motion: reduce)');
  _hfmMotionListener = (event) => {
    _hfmAltView?.setReducedMotion(event.matches);
    _initHfmPersistFadeControls().setEnabled(
      _hfmEnabled && !_hfmPanAdjustEnabled
    );
    if (event.matches) {
      _hfmPersistFade = 0;
      _updateHfmStatusBar();
    } else {
      let savedFade = null;
      try {
        savedFade = localStorage.getItem(STORAGE_KEY_HFM_PERSIST_FADE);
      } catch (_) {
        /* storage unavailable */
      }
      const parsed = savedFade !== null ? parseFloat(savedFade) : NaN;
      const valid =
        Number.isFinite(parsed) &&
        parsed >= _HFM_PERSIST_FADE_RANGE.min &&
        parsed <= _HFM_PERSIST_FADE_RANGE.max;
      _applyHfmPersistFade(valid ? parsed : _HFM_PERSIST_FADE_RANGE.default);
    }
  };
  motionMql.addEventListener('change', _hfmMotionListener);

  // Classic's look carries an accent of its own, so the glyph atlas follows
  // the layout mode as it follows the theme.
  // Classic is a look of its own (the DOS blue), so entering or leaving it
  // is a screen coming on; a switch between Simplified and Standard is not.
  let lastMode = document.body?.dataset.uiMode;
  _hfmModeListener = (event) => {
    _hfmAltView?.rebuildGlyphs?.();
    _syncHfmVectorLook();
    _hfmAltView?.invalidate?.();
    const mode = event?.detail?.mode;
    const classicCrossed = mode === 'classic' || lastMode === 'classic';
    lastMode = mode;
    if (_hfmEnabled && classicCrossed) {
      // The set and its sounds first: the screen sound is the new look's.
      _preloadLookSounds();
      _playAltViewMoment({ greeting: true, sound: 'look' });
    }
  };
  document.addEventListener('ui-mode-changed', _hfmModeListener);

  _loadSavedHfmSettings();

  _applyHfmContrastScale(_hfmContrastScale);
  _applyHfmFontScale(_hfmFontScale);
  _applyHfmSurfaceOpacity(_hfmSurfaceOpacity);
  if (_prefersReducedMotion()) {
    // Afterglow is motion: held at 0 without saving, so the person's own
    // value is there when motion is allowed again.
    _hfmAltView.setPersistFade?.(0);
  } else {
    _applyHfmPersistFade(_hfmPersistFade);
  }
  _setHfmSlidersEnabled(true);

  // The model stays where the ordinary preview puts it, its bottom on the
  // grid: the orbit target is already at its middle, so nothing is moved.
  previewManager?.setPostLoadHook?.(() => {
    _getDisplayOptionsController().refreshOverlays();
    _hfmAltView?.invalidate?.();
  });

  previewManager.setRenderOverride(() => _hfmAltView.render());
  previewManager.setResizeHook(({ width, height }) => {
    _hfmAltView.resize(width, height);
    _hfmAltView.invalidate?.();
  });
  previewManager.applyGridForAltView?.(true);

  root.setAttribute('data-ui-variant', 'mono');
  // In the same task as the look comes on, so no frame of it shows a drawer
  // open, and under the look's own rules, so nothing eases shut.
  const shut = _shutDrawersForDrawIn();

  const newTheme = previewManager.detectTheme();
  previewManager.updateTheme(
    newTheme,
    root.getAttribute('data-high-contrast') === 'true'
  );
  // The mono palette is applied above after the variant attribute flips, so
  // rebuild the glyph atlas against the final --color-accent value.
  _hfmAltView.rebuildGlyphs?.();

  previewManager.handleResize?.();
  toggleBtn?.setAttribute('aria-pressed', 'true');
  _hfmEnabled = true;
  _hfmPendingEnable = false;
  // The look's set first: the screen coming on is the look's own sound.
  _syncSoundSet();
  _playAltViewMoment({ greeting: true, sound: 'on' });
  _installKeySounds();
  _installCameraTicks(previewManager);
  _openDrawersAfterDrawIn(shut);

  if (_hfmPanToggleButtons?.desktop)
    _hfmPanToggleButtons.desktop.style.display = 'flex';
  _setHfmPanAdjustEnabled(false);
}

function _disableAltViewWithPreview(toggleBtn) {
  const previewManager = _getPreviewManager();
  const root = document.documentElement;

  _endDrawerStaging();
  _stopAltViewStart();
  _playCrtSound('off');
  _removeKeySounds();
  _removeCameraTicks();

  if (_hfmMotionListener) {
    const motionMql = window.matchMedia('(prefers-reduced-motion: reduce)');
    motionMql.removeEventListener('change', _hfmMotionListener);
    _hfmMotionListener = null;
  }
  if (_hfmModeListener) {
    document.removeEventListener('ui-mode-changed', _hfmModeListener);
    _hfmModeListener = null;
  }

  if (_hfmAltView) {
    _hfmAltView.disable();
  }
  previewManager?.clearRenderOverride();
  previewManager?.clearResizeHook();
  previewManager?.clearPostLoadHook?.();
  previewManager?.applyGridForAltView?.(false);

  root.removeAttribute('data-ui-variant');
  _setAssetsForVariant(false);

  if (previewManager) {
    const normalTheme = previewManager.detectTheme();
    previewManager.updateTheme(
      normalTheme,
      root.getAttribute('data-high-contrast') === 'true'
    );
  }

  toggleBtn?.setAttribute('aria-pressed', 'false');
  _hfmEnabled = false;
  _hfmPendingEnable = false;

  _hfmPanAdjustEnabled = false;
  if (_hfmPanToggleButtons?.desktop)
    _hfmPanToggleButtons.desktop.style.display = 'none';
  _setHfmSlidersEnabled(false);

  _updateHfmStatusBar();
  _playPendingBreak();
}

// ---------------------------------------------------------------------------
// Toggle injection & unlock
// ---------------------------------------------------------------------------

function _endKeyArrival() {
  if (!_hfmArrival) return;
  const { toggle, shown, onEnd } = _hfmArrival;
  _hfmArrival = null;
  clearTimeout(_hfmArrivalTimers.rest);
  clearTimeout(_hfmArrivalTimers.fallback);
  toggle.removeEventListener('animationend', onEnd);
  toggle.removeAttribute('data-arrival');
  shown.remove();
}

function _playKeyArrival(toggle) {
  if (!toggle || _prefersReducedMotion()) return;
  const shown = document.createElement('span');
  shown.className = 'alt-view-arrival';
  shown.setAttribute('aria-hidden', 'true');
  shown.innerHTML = toggle.querySelector('svg')?.outerHTML ?? '';
  // From just above the top of the screen to the key's place.
  const bottom = Math.ceil(toggle.getBoundingClientRect().bottom);
  shown.style.setProperty('--alt-view-drop-from', `${-bottom}px`);

  const onEnd = (event) => {
    if (event.target !== shown || event.pseudoElement) return;
    if (event.animationName === 'alt-view-key-drop') {
      toggle.setAttribute('data-arrival', 'landed');
      _hfmArrivalTimers.rest = setTimeout(() => {
        toggle.setAttribute('data-arrival', 'settled');
      }, _HFM_KEY_REST_MS);
    } else if (event.animationName === 'alt-view-key-scan') {
      _endKeyArrival();
    }
  };
  _hfmArrival = { toggle, shown, onEnd };
  toggle.addEventListener('animationend', onEnd);
  _hfmArrivalTimers.fallback = setTimeout(
    _endKeyArrival,
    _HFM_ARRIVAL_FALLBACK_MS
  );
  toggle.appendChild(shown);
  toggle.setAttribute('data-arrival', 'dropping');
}

/**
 * A sentence after the sound playing for the same moment and a short pause,
 * or at its usual time where nothing plays or the sound cannot start: the
 * press that completed the code speaks first, inside the announcer's hold.
 * @param {string} sentence
 * @param {Promise<number>|null} playing - resolves with the seconds until the
 *   sound ends
 * @param {string} what - the sound, for a warning
 */
function _sayAfter(sentence, playing, what) {
  const sayIt = (delay) =>
    window.setTimeout(() => {
      announce(sentence, { immediate: true });
    }, delay);
  if (!playing) {
    sayIt(_HFM_UNLOCK_ANNOUNCE_DELAY_MS);
    return;
  }
  playing.then(
    (seconds) => sayIt(seconds * 1000 + _HFM_AFTER_TUNE_MS),
    (error) => {
      console.warn(`[Alt View] The ${what} did not play:`, error);
      sayIt(_HFM_UNLOCK_ANNOUNCE_DELAY_MS);
    }
  );
}

function _endKeyCrack() {
  if (!_hfmCrack) return;
  const { toggle, overlay, onEnd, timer } = _hfmCrack;
  _hfmCrack = null;
  clearTimeout(timer);
  toggle.removeEventListener('animationend', onEnd);
  toggle.removeAttribute('data-moment');
  overlay.remove();
}

// Seven jagged lines from the key's border outward, 10 to 18 px, in the
// overlay's own coordinates.
function _drawCrackLines(overlay, toggle) {
  const box = overlay.getBoundingClientRect();
  const key = toggle.getBoundingClientRect();
  const cx = key.left - box.left + key.width / 2;
  const cy = key.top - box.top + key.height / 2;
  const lines = 7;
  for (let i = 0; i < lines; i++) {
    const angle = (i / lines) * Math.PI * 2 + 0.35 * Math.sin(i * 2.3);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    // Where the ray leaves the key's box.
    const t = Math.min(
      Math.abs(key.width / 2 / (dx || 1e-6)),
      Math.abs(key.height / 2 / (dy || 1e-6))
    );
    const sx = cx + dx * t;
    const sy = cy + dy * t;
    const length = 10 + ((i * 5) % 9);
    const points = [[sx, sy]];
    for (let step = 1; step <= 3; step++) {
      const d = (length * step) / 3;
      const jag = (step % 2 ? 1 : -1) * (1.5 + (i % 3));
      points.push([sx + dx * d - dy * jag, sy + dy * d + dx * jag]);
    }
    const line = document.createElementNS(_SVG_NS, 'polyline');
    line.setAttribute(
      'points',
      points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    );
    line.setAttribute('pathLength', '1');
    overlay.appendChild(line);
  }
}

/**
 * The second finding: the glass around the key cracks. The lines are drawn
 * out, held and receding as the stylesheet times them; with Play sounds on,
 * the crack and then the thriller; then the sentence. With reduced motion,
 * the sounds and the sentence alone.
 * @param {HTMLElement|null} toggle - the key
 * @param {{appeared?: boolean}} [options] - appeared: the crack brought the
 *   key, on a visit where it was not showing, so the sentence says so first
 */
function _playKeyCrack(toggle, { appeared = false } = {}) {
  if (!toggle) return;
  _endKeyCrack();
  let playing = null;
  if (_soundsOn()) {
    playMomentSound('crack').catch((error) => {
      console.warn('[Alt View] The crack did not play:', error);
    });
    playing = playThrillerTune({ after: _HFM_THRILLER_AFTER_S });
  }
  _sayAfter(
    appeared
      ? `${_HFM_UNLOCK_SENTENCE} ${_HFM_CRACK_SENTENCE}`
      : _HFM_CRACK_SENTENCE,
    playing,
    'thriller'
  );
  if (_prefersReducedMotion()) return;

  const overlay = document.createElementNS(_SVG_NS, 'svg');
  overlay.setAttribute('class', 'alt-view-crack');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('focusable', 'false');
  toggle.setAttribute('data-moment', 'crack');
  toggle.appendChild(overlay);
  _drawCrackLines(overlay, toggle);
  const onEnd = (event) => {
    if (event.animationName === 'alt-view-crack-recede') _endKeyCrack();
  };
  toggle.addEventListener('animationend', onEnd);
  _hfmCrack = {
    toggle,
    overlay,
    onEnd,
    timer: setTimeout(_endKeyCrack, _HFM_CRACK_FALLBACK_MS),
  };
}

function _endKeyBreak() {
  if (!_hfmBreak) return;
  const { toggle, overlay, onEnd, timer } = _hfmBreak;
  _hfmBreak = null;
  clearTimeout(timer);
  toggle.removeEventListener('animationend', onEnd);
  // The key takes its own look at once, where the copy wearing it stood.
  toggle.style.transition = 'none';
  toggle.removeAttribute('data-moment');
  void toggle.offsetWidth;
  toggle.style.transition = '';
  overlay.remove();
}

// Shards of the glass: triangles cut from the key's box, from its center
// out, each flying its own way, 40 to 80 px, and turning as it goes.
function _addBreakShards(overlay) {
  for (let i = 0; i < _HFM_BREAK_SHARDS; i++) {
    const shard = document.createElement('span');
    shard.className = 'alt-view-break-shard';
    const way = (i / _HFM_BREAK_SHARDS) * Math.PI * 2 + 0.3 * Math.sin(i * 1.7);
    const far = 40 + ((i * 13) % 41);
    shard.style.setProperty('--dx', `${(Math.cos(way) * far).toFixed(1)}px`);
    shard.style.setProperty('--dy', `${(Math.sin(way) * far).toFixed(1)}px`);
    shard.style.setProperty('--spin', `${(i % 2 ? 1 : -1) * (90 + i * 23)}deg`);
    const corner = (k) => {
      const at = way + (k - 0.5) * ((Math.PI * 2) / _HFM_BREAK_SHARDS);
      return `${(50 + Math.cos(at) * 70).toFixed(1)}% ${(50 + Math.sin(at) * 70).toFixed(1)}%`;
    };
    shard.style.clipPath = `polygon(50% 50%, ${corner(0)}, ${corner(1)})`;
    overlay.appendChild(shard);
  }
}

/**
 * The third finding: a copy of the key grows toward the viewer from behind
 * the screen and breaks the glass, a flash and its shards, then settles into
 * the key's place, which keeps the look from then on. With Play sounds on,
 * the shatter as the glass breaks and the fanfare after it; then the
 * sentence. With reduced motion the key simply takes its look, and the
 * sounds and the sentence follow at once.
 * @param {HTMLElement|null} toggle - the key
 */
function _playKeyBreakThrough(toggle) {
  if (!toggle) return;
  _endKeyCrack();
  _endKeyBreak();
  _setKeyPermanent(toggle);
  const still = _prefersReducedMotion();
  const impact = still ? 0 : _HFM_BREAK_IMPACT_S;
  let playing = null;
  if (_soundsOn()) {
    // The fanfare is asked for now, inside the press, to start after the
    // shatter; the shatter plays as the glass breaks, even if the picture
    // is cut short.
    playing = playFanfare({ after: impact + _HFM_FANFARE_AFTER_S });
    setTimeout(() => {
      playMomentSound('shatter').catch((error) => {
        console.warn('[Alt View] The shatter did not play:', error);
      });
    }, impact * 1000);
  }
  _sayAfter(_HFM_BREAK_SENTENCE, playing, 'fanfare');
  if (still) return;

  const overlay = document.createElement('span');
  overlay.className = 'alt-view-break';
  overlay.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('span');
  copy.className = 'alt-view-break-copy';
  copy.innerHTML = toggle.querySelector('svg')?.outerHTML ?? '';
  const flash = document.createElement('span');
  flash.className = 'alt-view-break-flash';
  overlay.append(copy, flash);
  _addBreakShards(overlay);
  toggle.setAttribute('data-moment', 'break');
  toggle.appendChild(overlay);
  const onEnd = (event) => {
    if (event.animationName === 'alt-view-break-shard') _endKeyBreak();
  };
  toggle.addEventListener('animationend', onEnd);
  _hfmBreak = {
    toggle,
    overlay,
    onEnd,
    timer: setTimeout(_endKeyBreak, _HFM_BREAK_FALLBACK_MS),
  };
}

/** From the third finding on the key stays, there at every start. */
function _setKeyPermanent(toggle) {
  toggle?.setAttribute('data-alt-key', 'permanent');
}

/** A break-through found while the look was on plays once it is off. */
function _playPendingBreak() {
  if (!takePendingBreak()) return;
  _playKeyBreakThrough(document.getElementById('_hfmToggle'));
}

/**
 * What a finding of the code plays on the key.
 * @param {string} stage - recordCodeEntry()'s answer
 * @param {HTMLElement|null} toggle - the key
 * @param {{appeared?: boolean}} [options] - appeared: the finding brought
 *   the key, on a visit where it was not showing
 * @returns {boolean} whether the moment says its own sentence
 */
function _playFinding(stage, toggle, { appeared = false } = {}) {
  if (stage === 'arrival') {
    _playKeyArrival(toggle);
  } else if (stage === 'crack') {
    _playKeyCrack(toggle, { appeared });
    return true;
  } else if (stage === 'break') {
    _playKeyBreakThrough(toggle);
    return true;
  } else if (stage === 'break-pending') {
    _setKeyPermanent(toggle);
  }
  return false;
}

// Whoever put it there: the Alt View, before a project opens or with one, or
// the City Walk.
function _lookOn() {
  return document.documentElement.getAttribute('data-ui-variant') === 'mono';
}

function _showGatedElements() {
  document.querySelectorAll('[data-hfm-gated]').forEach((el) => {
    el.hidden = false;
  });
}

function _injectAltToggle() {
  const themeToggle = document.getElementById('themeToggle');
  if (!themeToggle) return;
  if (document.getElementById('_hfmToggle')) return;

  const toggleBtn = document.createElement('button');
  toggleBtn.id = '_hfmToggle';
  toggleBtn.className = 'btn btn-sm btn-secondary alt-view-toggle';
  if (isPermanent()) _setKeyPermanent(toggleBtn);
  toggleBtn.setAttribute('aria-pressed', 'false');
  toggleBtn.setAttribute('aria-label', _HFM_TOGGLE_NAME);
  toggleBtn.setAttribute('title', _HFM_TOGGLE_NAME);
  toggleBtn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <!-- Key icon -->
      <circle cx="8" cy="8" r="5" />
      <path d="M11.3 11.3L21 21" />
      <path d="M16 16l3-3" />
      <path d="M18 18l3-3" />
    </svg>
  `;

  themeToggle.parentElement.insertBefore(toggleBtn, themeToggle.nextSibling);
  // The key is there: its sounds are fetched now, so the first press is not
  // waiting on a download, and its moments while it can still have them.
  if (_soundsOn()) {
    preloadCrtSounds();
    if (!isPermanent()) preloadMomentSounds();
  }

  // Just before the key; the stylesheet shows it while the look is on. The
  // row is right-aligned, so the key stays under the pointer that pressed it
  // when this appears (placed after the key, it pushed the key 48 px away).
  const soundsBtn = document.createElement('button');
  soundsBtn.id = '_hfmSounds';
  soundsBtn.type = 'button';
  soundsBtn.className =
    'btn btn-sm btn-secondary alt-view-toggle alt-view-sounds';
  soundsBtn.setAttribute('aria-label', _HFM_SOUNDS_NAME);
  soundsBtn.setAttribute('title', _HFM_SOUNDS_NAME);
  toggleBtn.before(soundsBtn);
  _syncSoundsButton(_soundsOn());
  soundsBtn.addEventListener('click', () => {
    const on = soundsBtn.getAttribute('aria-pressed') !== 'true';
    setSoundsOn(on);
    if (on) _playKeySound(soundsBtn, 'down');
  });

  const panToggleBtn = document.createElement('button');
  panToggleBtn.id = '_hfmPanAdjust';
  panToggleBtn.className = 'btn btn-sm btn-icon camera-btn alt-pan-toggle';
  panToggleBtn.setAttribute('aria-pressed', 'false');
  panToggleBtn.setAttribute('aria-label', _HFM_PAN_ADJUST_NAME);
  panToggleBtn.setAttribute('title', _HFM_PAN_ADJUST_NAME);
  panToggleBtn.style.display = 'none';
  panToggleBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3v18" />
      <path d="M3 12h18" />
      <path d="M7 7h0.01" />
      <path d="M17 17h0.01" />
    </svg>
  `;

  // Beside the projection button in the camera panel's tools row: the Pan
  // D-pad's center belongs to View All.
  document.getElementById('projectionToggle')?.after(panToggleBtn);

  // A desktop window's only: on a phone the ASCII drawer has the sliders.
  _hfmPanToggleButtons = { desktop: panToggleBtn };
  _setHfmPanAdjustEnabled(false);

  const handlePanToggleClick = () => {
    if (!_hfmAltView || !_hfmEnabled) return;
    _setHfmPanAdjustEnabled(!_hfmPanAdjustEnabled);
    announceImmediate(
      _hfmPanAdjustEnabled
        ? _HFM_PAN_ADJUST_ON_SENTENCE
        : _HFM_PAN_ADJUST_OFF_SENTENCE
    );
  };
  const handlePanToggleDblClick = (e) => {
    if (!_hfmAltView || !_hfmEnabled) return;
    e.preventDefault();
    _resetHfmSettings();
  };
  panToggleBtn.addEventListener('click', handlePanToggleClick);
  panToggleBtn.addEventListener('dblclick', handlePanToggleDblClick);

  toggleBtn.addEventListener('click', async () => {
    _endKeyArrival();
    const root = document.documentElement;
    const isCurrentlyEnabled =
      toggleBtn.getAttribute('aria-pressed') === 'true';

    // Resolve fresh on every click: the toggle can be injected on the welcome
    // screen (before any preview exists) and must pick up the preview manager
    // created later when a model loads.
    const previewManager = _getPreviewManager();

    if (!previewManager) {
      if (!isCurrentlyEnabled) {
        _setAssetsForVariant(true);
        // No picture and no status line yet: the draw-in alone.
        _syncSoundSet();
        _playAltViewMoment({ greeting: false, sound: 'on' });
        _installKeySounds();
        root.setAttribute('data-ui-variant', 'mono');
        toggleBtn.setAttribute('aria-pressed', 'true');
        _hfmPendingEnable = true;
      } else {
        _stopAltViewStart();
        _playCrtSound('off');
        _removeKeySounds();
        root.removeAttribute('data-ui-variant');
        _setAssetsForVariant(false);
        toggleBtn.setAttribute('aria-pressed', 'false');
        _hfmPendingEnable = false;
        _playPendingBreak();
      }
      announceImmediate(
        isCurrentlyEnabled ? _HFM_OFF_SENTENCE : _HFM_ON_SENTENCE
      );
      return;
    }

    if (!isCurrentlyEnabled) {
      // It said why it could not start; "on" would be untrue.
      if ((await _enableAltViewWithPreview(toggleBtn)) === false) return;
    } else {
      _disableAltViewWithPreview(toggleBtn);
    }
    announceImmediate(
      isCurrentlyEnabled ? _HFM_OFF_SENTENCE : _HFM_ON_SENTENCE
    );
  });

  if (_hfmEnabled) {
    toggleBtn.setAttribute('aria-pressed', 'true');
    _setHfmSlidersEnabled(true);
    if (_hfmPanToggleButtons?.desktop)
      _hfmPanToggleButtons.desktop.style.display = 'flex';
    _setHfmPanAdjustEnabled(false);
  }
}

/**
 * Every finding of the code counts, wherever it is made; a developer's door
 * counts as the first.
 *
 * @param {Object} [options]
 * @param {boolean} [options.moment] - Found by the camera sequence: the
 *   finding plays its moment instead of the key simply appearing.
 */
function _handleUnlock({ moment = false } = {}) {
  if (_hfmUnlocked) {
    if (moment) {
      _playFinding(
        recordCodeEntry({ altViewOn: _lookOn() }),
        document.getElementById('_hfmToggle')
      );
    }
    return;
  }
  _hfmUnlocked = true;

  _injectAltToggle();
  const toggle = document.getElementById('_hfmToggle');
  let stage = null;
  if (moment) {
    stage = recordCodeEntry({ altViewOn: _lookOn() });
  } else {
    noteDevUnlock();
  }
  // The first finding drops the key in. A later one made where the key was
  // not showing, on a new visit, brings it by its own moment instead.
  const drops = moment && (stage === 'arrival' || stage === 'none');
  let spoken = false;
  if (drops) {
    _playKeyArrival(toggle);
  } else if (stage) {
    spoken = _playFinding(stage, toggle, { appeared: true });
  }

  _showGatedElements();

  // The tune first, then the sentence, so neither covers the other.
  if (!spoken) {
    _sayAfter(
      _HFM_UNLOCK_SENTENCE,
      drops && _soundsOn() ? playUnlockJingle() : null,
      'unlock tune'
    );
  }

  const container = document.getElementById('previewContainer');
  if (container) {
    container.classList.add('_hfm-unlock');
    container.addEventListener(
      'animationend',
      () => {
        container.classList.remove('_hfm-unlock');
      },
      { once: true }
    );
  }
}

// ---------------------------------------------------------------------------
// Public initializer
// ---------------------------------------------------------------------------

/**
 * Initialize the HFM/Alt View controller.
 * @param {Object} deps
 * @param {Function} deps.getPreviewManager - Returns current PreviewManager (may be null)
 * @param {Function} deps.getDisplayOptionsController - Returns DisplayOptionsController
 * @returns {Object} Controller API
 */
export function initHfmController({
  getPreviewManager,
  getDisplayOptionsController,
}) {
  _getPreviewManager = getPreviewManager;
  _getDisplayOptionsController = getDisplayOptionsController;
  // A page that starts with sounds off starts muted.
  setMuted(!_soundsOn());

  // A key that stays is simply there: no drop, nothing said.
  if (isPermanent()) {
    _hfmUnlocked = true;
    _injectAltToggle();
    _showGatedElements();
  }

  return {
    handleUnlock: _handleUnlock,

    isLightThemeActive: _isLightThemeActive,

    refreshVariantAssets() {
      _setAssetsForVariant(true);
    },

    /**
     * Switch the variant-specific assets (logo, favicon) on or off without
     * touching the alt-view render state. Used by the City Walk game, which
     * forces the mono variant for its own lifetime and must restore the
     * standard assets on exit.
     * @param {boolean} enabled
     */
    setVariantAssets(enabled) {
      _setAssetsForVariant(Boolean(enabled));
    },

    /**
     * Notify the controller that the app theme changed while Alt View may be
     * active. Rebuilds the glyph atlas so the phosphor tint (green/amber)
     * follows the new theme.
     */
    onThemeChanged() {
      if (_hfmEnabled && _hfmAltView) {
        _hfmAltView.rebuildGlyphs?.();
        _hfmAltView.invalidate?.();
        // A new look comes on: the screen draws in again.
        _playAltViewMoment({ greeting: true, sound: 'look' });
      }
    },

    injectAltToggle: _injectAltToggle,

    async enableAltViewWithPreview(toggleBtn) {
      await _enableAltViewWithPreview(toggleBtn);
    },

    disableAltViewWithPreview(toggleBtn) {
      _disableAltViewWithPreview(toggleBtn);
    },

    clearPersistence() {
      if (_hfmEnabled && _hfmAltView?.clearPersistence) {
        _hfmAltView.clearPersistence();
      }
    },

    isEnabled() {
      return _hfmEnabled;
    },

    isUnlocked() {
      return _hfmUnlocked;
    },

    isPendingEnable() {
      return _hfmPendingEnable && !_hfmEnabled;
    },

    /**
     * The character-size shortcuts' action: a step smaller or larger while
     * the Alt View is on.
     * @param {number} direction - -1 for smaller, 1 for larger
     * @returns {boolean} False when the Alt View is off (nothing changed)
     */
    stepCharacters(direction) {
      if (!_hfmEnabled || !_hfmAltView) return false;
      _stepHfmCharacters(direction);
      return true;
    },

    /**
     * Camera pan control callback for HFM adjust mode.
     * @param {{ direction: string, shiftKey: boolean }} params
     * @returns {false|string|true} false if not handled, announcement string or true if handled
     */
    onPanControl({ direction, shiftKey }) {
      const root = document.documentElement;
      const isMono = root.getAttribute('data-ui-variant') === 'mono';
      const canAdjust = _hfmEnabled && _hfmAltView && _hfmPanAdjustEnabled;
      if (!isMono) return false;
      if (!canAdjust) return false;

      if (shiftKey && direction === 'up') {
        const next = _applyHfmPersistFade(
          _hfmPersistFade + _HFM_PERSIST_FADE_RANGE.step
        );
        return `Glow ${_formatPercent(next)}`;
      }
      if (shiftKey && direction === 'down') {
        const next = _applyHfmPersistFade(
          _hfmPersistFade - _HFM_PERSIST_FADE_RANGE.step
        );
        return `Glow ${_formatPercent(next)}`;
      }
      if (direction === 'up') {
        const next = _applyHfmContrastScale(
          _hfmContrastScale + _HFM_CONTRAST_RANGE.step
        );
        return `Edges ${_formatPercent(next)}`;
      }
      if (direction === 'down') {
        const next = _applyHfmContrastScale(
          _hfmContrastScale - _HFM_CONTRAST_RANGE.step
        );
        return `Edges ${_formatPercent(next)}`;
      }
      if (direction === 'left') {
        const next = _applyHfmFontScale(
          _hfmFontScale - _HFM_FONT_SCALE_RANGE.step
        );
        return _hfmSizeWords(next);
      }
      if (direction === 'right') {
        const next = _applyHfmFontScale(
          _hfmFontScale + _HFM_FONT_SCALE_RANGE.step
        );
        return _hfmSizeWords(next);
      }
      return true;
    },
  };
}
