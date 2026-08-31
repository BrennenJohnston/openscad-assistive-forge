/**
 * ASCII City Walk — game layer controller (CW-4).
 *
 * Lifecycle owner for the hidden walking game: builds the fullscreen layer
 * DOM, forces the mono (Alt View) variant on while open, loads a bundled
 * city extract, and renders its own three.js scene through a dedicated
 * instance of the Alt View ASCII converter (initAltView — per-instance
 * since CW-1). Every action in the city has a key (Q-67): arrows/WASD
 * walk, Q/E turn, R/F look up and down, V levels the gaze, Shift is faster,
 * M toggles the top-down map view, C and T reach the accessibility toggles
 * the header carries (CW-14), H help, Escape leaves. Dragging the viewport
 * with a pointer looks around too (CW-13), and every key also has a button
 * in the bottom toolbar (CW-15) — both are additions for mouse players,
 * never the only way to reach anything.
 *
 * The layer is modal: document-level capture focus trap, Escape on the
 * capture phase, focus restored to the launching control on exit. The
 * canvas is aria-hidden; the HUD, help panel, and attribution are real
 * text.
 *
 * Map data © OpenStreetMap contributors (ODbL) — attribution is shown in
 * the start panel, the HUD, and the help panel.
 *
 * @license GPL-3.0-or-later
 */

import {
  Color,
  Scene,
  PerspectiveCamera,
  OrthographicCamera,
  WebGLRenderer,
  BoxGeometry,
  RingGeometry,
  CircleGeometry,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import {
  parseCityExtract,
  nearestLandmarkName,
  buildStreetIndex,
} from './city-data.js';
import {
  cityLandmarks,
  findWaypointSpot,
  registryFor,
  WAYPOINT_TOUCH_M,
  WAYPOINT_LEAVE_M,
} from './landmark-registry.js';
import {
  buildCityGroup,
  buildStreetProps,
  attachCityLighting,
  buildLandmarkBeacons,
} from './city-scene.js';
import {
  createWalkState,
  stepWalk,
  firstPersonPose,
  applyLookDelta,
  levelView,
  normalizeHeading,
  clampPitch,
  headingLabel,
  pitchLabel,
  buildCollisionGrid,
  buildSurfaceGrid,
  easeGroundZ,
  stampObstacles,
  findSpawn,
  findClearHeading,
  findLandingNear,
  createMapCamera,
  stepMapCamera,
  recenterMapCamera,
  mapCameraFrustum,
  clampCharScale,
  seedCharScale,
  clampSpeedLabel,
  speedLabelFromStored,
  CHAR_SCALE_MIN,
  CHAR_SCALE_STEP,
  SPEED_LABEL_STEP,
  TURN_SPEED_RADPS,
  PITCH_SPEED_RADPS,
  findRoute,
  steerHeading,
  clearRunAhead,
  gradePercent,
} from './walk-controls.js';
import {
  DEFAULT_MAP_STYLE,
  mapStyleById,
  cycleMapStyle,
  mapStyleAnnouncement,
} from './city-map-styles.js';
import { describeJunction } from './city-junction.js';
import { readCityProgress, writeCityProgress } from './city-progress.js';
import { initAltView } from '../_hfm.js';
import {
  CALIBRATION_FLOOR_LADDER,
  CALIBRATION_SAMPLES_PER_SCALE,
  chooseCalibratedSize,
  raiseFloor,
  createProbePhase,
  decodeCalibration,
  encodeCalibration,
  isConclusive,
  nextProbeScale,
  stepProbePhase,
} from './size-calibration.js';
import { createDocumentFocusTrap } from '../focus-trap.js';
import { announce } from '../announcer.js';
import { themeManager } from '../theme-manager.js';
import {
  HC_PALETTE_GREEN,
  HC_PALETTE_AMBER,
  MONO_INTENSITY_LEVELS,
  MONO_REVERSE_THRESHOLD,
  CITY_TEMPORAL_HYSTERESIS,
  LUMINANCE_LAYER,
  LUMINANCE_LAYER_DEFAULT,
  CITY_PALETTE_INK_BUDGET,
  CITY_INK_FAMILY,
  MONO_BLOOM_PX,
  MONO_GLOW_FADE,
} from './hc-palettes.js';
import {
  buildFireworks,
  buildRain,
  buildTraveler,
  buildWaypointMarks,
  pickTravelerSpot,
  RAIN_LEVEL_COUNT,
  RAIN_LEVEL_NAMES,
} from './city-scene.js';
import { buildCityCameraPanel } from './city-camera-panel.js';
import { createClassPass } from './city-class-pass.js';
import {
  backingTable,
  buildBacking,
  sampledTable,
  SAMPLED_BACKING_DRIVE,
} from './city-backing.js';
import { GLYPH_VOCABULARIES } from './glyph-vocabularies.js';
import {
  safeGetItem,
  safeSetItem,
  STORAGE_KEY_CITY_WALK_SPEED,
  STORAGE_KEY_CITY_WALK_FONT_SCALE,
  STORAGE_KEY_CITY_WALK_CALIBRATED_FLOOR,
  STORAGE_KEY_CITY_WALK_COLOUR,
  STORAGE_KEY_CITY_WALK_DAYLIGHT,
  STORAGE_KEY_CITY_WALK_EMPTY_CITY,
  STORAGE_KEY_CITY_WALK_LOOK,
  STORAGE_KEY_CITY_WALK_MAP_STYLE,
  STORAGE_KEY_CITY_WALK_CAMERA_PANEL,
} from '../storage-keys.js';

// Bundled extracts (Q-68). Slugs match public/examples/ascii-city/*.json.
const CITIES = [
  { slug: 'seattle', label: 'Seattle, Washington' },
  { slug: 'denver', label: 'Denver, Colorado' },
  { slug: 'albuquerque', label: 'Albuquerque, New Mexico' },
  { slug: 'burnaby', label: 'Burnaby, British Columbia' },
];

const ORTHO_CAMERA_HEIGHT_M = 1000;

// Drag-look (CW-13). Degrees of rotation per pixel of pointer travel, both
// axes. Drag needs more per pixel than pointer-lock mouselook does, because
// the travel is bounded by the window instead of being unlimited: the MIT
// reference (justMoritz/3d-game-engine) uses 0.002 rad/px under pointer lock
// and 0.005 rad/px - 0.29 deg - on its drag path, which is where this sits.
const DRAG_RAD_PER_PX = (0.25 * Math.PI) / 180;
// A press that travels less than this is a click, not a drag, so a stray tap
// on the viewport never nudges the view.
const DRAG_THRESHOLD_PX = 4;

// CW-15: a hold-to-act toolbar button runs for as long as the pointer is
// down, but a click and a keyboard activation have no duration at all. Both
// are stretched to this, so every button does something visible once.
const TOOLBAR_STEP_MS = 250;

// CW-20 weather strings. ACCESSIBILITY-CRITICAL (D-35): these are announced
// to screen readers, so they are flagged for the owner and collected in the
// round text pack rather than being quietly final.
const RAIN_OFF_MESSAGE = 'Rain off.';
const PHOTO_SAVED_MESSAGE = 'Photo saved.';
const ALL_LANDMARKS_MESSAGE = 'All landmarks found.';
const RAIN_BLOCKED_MESSAGE = 'Rain is off because reduced motion is on.';
// ACCESSIBILITY-CRITICAL STRINGS (D-35) - flagged for owner review. The first
// two are the reward itself for a player who cannot see it; the third has to
// say why the sky is still rather than leaving a promise unkept.
const FIREWORKS_MESSAGE = 'Fireworks over the city.';
const FIREWORKS_REPLAY_MESSAGE = 'Fireworks again.';
const FIREWORKS_CALM_MESSAGE =
  'Fireworks over the city, held still because reduced motion is on.';
/** How long the calm celebration stays up. The plan's ~3 s. */
const FIREWORKS_STILL_MS = 3200;

// CW-78: the waypoint's words. ACCESSIBILITY-CRITICAL (D-35), flagged DOUBLY
// in the round text pack. For a blind traveler the touch IS the landmark
// visit: the plinth is a physical thing the cane-line walk runs into, and
// this sentence says what was just reached by name. It repeats only after
// leaving the mark's hysteresis ring, so pressing against the plinth is one
// sentence, not a stream.
const WAYPOINT_TOUCHED_MESSAGE = (name) => `Waypoint reached: ${name}.`;

// CW-81 (CW-Q72, CW-Q80): looking without a drag, walking without a held
// key. ACCESSIBILITY-CRITICAL STRINGS (D-35), flagged DOUBLY in the round
// text pack - auto-walk is the GAG "alternative to held buttons" and these
// sentences are how a screen-reader user knows the walker started, stopped,
// and why.
const AUTO_WALK_ON_MESSAGE =
  'Auto-walk on. Walking forward. Press N, Escape, or a walk key to stop.';
const AUTO_WALK_OFF_MESSAGE = 'Auto-walk off.';
const AUTO_WALK_BLOCKED_MESSAGE = 'Auto-walk stopped. Something is in the way.';
const LOOK_MODE_MESSAGES = {
  follow:
    'Mouse look follows the cursor. The view turns toward wherever you point.',
  drag: 'Mouse look needs a drag. Hold the mouse button and move to look.',
  off: 'Mouse look off. The keys and buttons still look around.',
};
/** The cycle order the toolbar button steps through. */
const LOOK_MODES = ['follow', 'drag', 'off'];

// CW-80: the spoken slope. ACCESSIBILITY-CRITICAL STRINGS (D-35), flagged
// DOUBLY in the round text pack - these sentences are the only place the
// game tells a player who cannot see the horizon that the street tilts,
// which is exactly the information CW-79's hills added for everyone else.
// US English, 'percent' spelled out (row 1's own precedent), no em dashes.
const SLOPE_MESSAGES = {
  up: (n) => `Uphill ${n} percent.`,
  down: (n) => `Downhill ${n} percent.`,
  level: 'Level.',
};
/** Under this magnitude a street is level - a US accessible route's 5 %
 * ramp threshold halved, so gentle camber never chatters. */
const SLOPE_LEVEL_MAX_PCT = 2;
/** Re-announce within one category only when the rounded figure moves
 * this far - a hill that steepens from 6 to 7 is not news. */
const SLOPE_RESTEP_PCT = 3;
/** And only after this much new ground - a boundary stood upon is one
 * sentence, never a stutter. */
const SLOPE_MIN_WALK_M = 6;

// CW-87 (CW-Q84): the tour. ACCESSIBILITY-CRITICAL STRINGS (D-35), flagged
// DOUBLY in the round text pack - the tour is the GAG "very simple control
// schemes" route (one key starts, one key stops) and these sentences are the
// whole of what a blind player hears about a walk the game is doing for them.
const TOUR_START_MESSAGE = (name) =>
  `Taking you to ${name}. Press I, Escape, or a walk key to stop.`;
const TOUR_STOPPED_MESSAGE = 'Tour stopped.';
const TOUR_BLOCKED_MESSAGE = 'Tour stopped. Something is in the way.';
const TOUR_NO_ROUTE_MESSAGE = (name) =>
  `No walkable route to ${name} from here.`;
const TOUR_TURN_MESSAGE = (dir, street) =>
  street ? `Turn ${dir} onto ${street}.` : `Turn ${dir}.`;
/** A bend gentler than this is a drift, not a turn - nothing is spoken. */
const TOUR_TURN_MIN_RAD = (30 * Math.PI) / 180;
/** A route waypoint is "reached" inside this - under the cell size, over
 * the per-frame stride, so a step can neither orbit nor skip it. */
const TOUR_WAYPOINT_REACH_M = 0.9;
// Stop-turn-go: with the heading this far off the leg's bearing the walk
// holds while the camera comes around (a curve cut at full stride could
// graze the corner the route cleared by inches), and resumes once inside
// the smaller angle - two thresholds so the boundary cannot chatter.
const TOUR_HOLD_ANGLE_RAD = (40 * Math.PI) / 180;
const TOUR_RESUME_ANGLE_RAD = (25 * Math.PI) / 180;
/** Street-following (CW-87): how short the way ahead must get before
 * auto-walk starts steering, and the fan it steers with (steerHeading). */
const AUTO_WALK_STEER_AT_M = 2.2;

// CW-81 hover-look numbers (plan §S 9.7). The dead zone is a share of the
// viewport half-extent; the rate rises linearly from its edge to the axis
// maximum at the viewport edge. Yaw reaches the key-turn 90 deg/s; pitch
// reaches the key-pitch 45 deg/s ("likewise" is the same curve on each
// axis's own speed) and the gaze clamp still binds.
const HOVER_DEAD_ZONE = 0.12;
const HOVER_MAX_YAW_RADPS = (90 * Math.PI) / 180;
const HOVER_MAX_PITCH_RADPS = (45 * Math.PI) / 180;
/**
 * CW-81 (the §10 reading): every look input steers a TARGET the camera
 * follows critically damped. At the hover edge rate the settled lag is
 * rate x tau = 9 degrees and the per-frame step at 60 fps is about
 * 1.4 degrees - under the 1.5 the drift note asks for, with no overshoot
 * because an exponential follow cannot overshoot.
 */
const LOOK_FOLLOW_TAU_S = 0.1;
/** Snap distance: below this the camera lands ON the target, so the
 * exponential tail cannot re-convert the frame forever. ~0.03 degrees. */
const LOOK_SNAP_RAD = 0.0005;
/** The walk acceleration ramp: rest to full speed, and full speed to rest,
 * over this many seconds (the §10 reading - no frame starts at 4.8 m/s). */
const WALK_RAMP_S = 0.25;
// Thunder no closer together than this, so it stays an event.
const THUNDER_GAP_MS = 30000;

// CW-36 teleport strings. ACCESSIBILITY-CRITICAL (D-35) and flagged in the
// round text pack. Picking and landing are separate sentences on purpose: a
// screen-reader user hears what they picked before committing to it, which is
// the only preview of the choice they get.
// "on" and "near" are the game's existing vocabulary for the same distinction
// the HUD draws (CW-27): inside the street, or beside it. Using the same two
// words here means the sentence a screen-reader user hears and the line a
// sighted user reads say the same thing about the same spot.
// CW-40 (CW-Q40): the two-step pick-then-J flow retired, and the pick
// announcements with it. The button armed PIN MODE instead; a click committed.
// CW-61 (CW-Q58) retires the arming as well - every map click now ASKS - so
// the two mode sentences have gone with the mode. What replaces them is a
// dialog that names the spot before you agree to it, which is a better
// preview than an announcement was: it stays on screen, and it can be read
// twice.
//
// ACCESSIBILITY-CRITICAL (D-35), flagged DOUBLY in the round text pack. For a
// blind traveler this sentence IS the map, and the rules behind which names
// it may use were MEASURED against the real road graph - see city-junction.js
// and the CW-61 record.
/**
 * CW-65 (CW-Q60): the traveler's words.
 *
 * ACCESSIBILITY-CRITICAL (D-35), flagged DOUBLY in the round text pack. The
 * warmer/colder clause below is not decoration and not only the non-visual
 * path: MEASURED, a whole person is 2.5 x 4.2 character cells at 30 m and the
 * high-visibility jacket stops separating them from the crowd by about 20 m,
 * so this sentence is the PRIMARY search instrument for every player.
 *
 * US English, no em dashes (UF-3). The traveler speaks for themselves in the
 * dialog because a found character who is described in the third person is a
 * specimen rather than a person.
 */
const TRAVELER_FOUND_TITLE = 'You found me!';
const TRAVELER_FOUND_BODY =
  'Thank you for stopping. I will walk with you from now on. ' +
  'Look for me near the spot where you start.';
const TRAVELER_FOUND_DISMISS = 'Close';
const TRAVELER_FOUND_ANNOUNCE =
  'You found the traveler. They will be waiting near where you start.';
/** The legend badge. A real text row with an sr-only word, never an icon -
 *  the same discipline CW-62 used for the visited tick. */
/**
 * ★★ THE WARMER/COLDER CLAUSE, AND IT IS NOT AN ACCESSIBILITY AFTERTHOUGHT.
 *
 * MEASURED (CW-65 P1): a whole person is 2.5 x 4.2 character cells at 30 m,
 * the jacket stops separating the traveler from the crowd by about 20 m, and
 * the city is 2,627 x 2,644 m. Nobody finds one figure in that by looking.
 * This sentence is the PRIMARY search instrument for every player; the jacket
 * and the cane are what make the traveler worth walking toward once near.
 *
 * The bands are distances a player can act on, not adjectives: each one says
 * roughly how far, so "warmer" is a direction to walk rather than a mood.
 */
const TRAVELER_BANDS = [
  [15, 'You can hear a cane tapping close by.'],
  [40, 'You are very near the traveler.'],
  [120, 'You are getting close to the traveler.'],
  [350, 'The traveler is somewhere in this part of the city.'],
  [Infinity, 'The traveler is a long way from here.'],
];
const TRAVELER_BADGE_FOUND = 'Traveler found in this city.';
const TRAVELER_BADGE_UNFOUND = 'Traveler: somewhere in this city.';

const TRAVEL_TITLE = 'Travel here?';
const TRAVEL_WHERE_CORNER = (a, b, on) =>
  `${on ? 'On' : 'Near'} ${a} and ${b}.`;
const TRAVEL_WHERE_ONE = (a, on) => `${on ? 'On' : 'Near'} ${a}.`;
const TRAVEL_WHERE_OPEN = 'Open ground, away from any named street.';
// ★ 'Travel here', not 'Travel', and the toolbar button beside it is the
// reason. That button opens this question; this one answers it. Two controls
// on screen at once, both called Travel, doing different jobs is precisely
// what WCAG's Consistent Identification is about, read from the wrong end.
// Answering the heading word for word is also the plainest thing the button
// could say.
const TRAVEL_CONFIRM_LABEL = 'Travel here';
const TRAVEL_CANCEL_LABEL = 'Cancel';
const TRAVEL_CANCELLED_MESSAGE = 'Travel cancelled. You have not moved.';
const TELEPORT_LANDED_MESSAGE = (street, on, compass) =>
  `Teleported ${on ? 'to' : 'near'} ${street}, facing ${compass}.`;
const TELEPORT_LANDED_OPEN_MESSAGE = (compass) =>
  `Teleported to open ground, facing ${compass}.`;
const TELEPORT_REFUSED_MESSAGE =
  'Nowhere to land near there. Pick a street or open ground.';

// CW-14: what the header's theme button calls each setting the app cycles
// through. 'auto' resolves to light or dark, which is what the phosphor
// colour follows, so the button names the SETTING and the announcement
// carries the manager's own fuller message.
const THEME_SETTING_LABELS = {
  auto: 'Auto',
  light: 'Light',
  dark: 'Dark',
};

let activeSession = null;

/**
 * Launch the game layer. Resolves when the layer is open (not when the
 * game ends). No-op if a session is already active.
 *
 * @param {Object} deps
 * @param {Object} deps.hfmCtrl - controller from initHfmController (mono
 *   variant + asset switching)
 * @param {HTMLElement} [deps.triggerEl] - control to restore focus to on
 *   exit; falls back to the currently focused element
 */
export async function launchCityWalk({ hfmCtrl, triggerEl }) {
  if (activeSession) return;

  const layer = document.getElementById('cityWalkLayer');
  if (!layer) {
    console.error('[CityWalk] #cityWalkLayer missing from the document');
    return;
  }

  const session = createSession({ layer, hfmCtrl, triggerEl });
  activeSession = session;
  session.open();
}

function createSession({ layer, hfmCtrl, triggerEl: providedTrigger }) {
  const root = document.documentElement;
  // UF-23: capture the trigger before any DOM work so exit can restore focus.
  const triggerEl =
    providedTrigger instanceof HTMLElement
      ? providedTrigger
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

  const state = {
    wasMono: root.getAttribute('data-ui-variant') === 'mono',
    prevBodyOverflow: document.body.style.overflow,
    trap: null,
    rafId: null,
    game: null, // per-city resources, see loadCity()
    helpOpen: false,
    // CW-60: which of the four map styles is showing. Absent storage means
    // Standard, so a player who never touches this sees the map they always
    // have.
    mapStyle: mapStyleById(
      safeGetItem(STORAGE_KEY_CITY_WALK_MAP_STYLE) ?? DEFAULT_MAP_STYLE
    ).id,
    // keys is the union frame() reads; keyHeld and btnHeld are its two
    // sources, so a click on Forward can never cancel a held Arrow Up.
    keys: new Set(),
    keyHeld: new Set(),
    btnHeld: new Set(),
    holdStarts: new Map(),
    holdTimers: new Map(),
    shiftHeld: false,
    fastWalk: false,
    drag: null,
    // CW-40 (CW-Q40): pin mode. Armed by the Teleport button; a map click
    // commits while armed. Never persisted - a mode you cannot see the
    // arming of should never outlive the map it was armed on.
    // CW-61: the spot the travel dialog is asking about, or null. Arming
    // (CW-40) has retired: every map click asks, and nothing travels without
    // a second press.
    travel: null,
    themeUnsub: null,
    refs: {},
  };

  function open() {
    if (!state.wasMono) {
      root.setAttribute('data-ui-variant', 'mono');
      hfmCtrl?.setVariantAssets?.(true);
    }
    document.body.style.overflow = 'hidden';

    buildLayerDom();
    layer.hidden = false;

    state.trap = createDocumentFocusTrap(layer, {
      onEscape: handleEscape,
      fallbackFocus: state.refs.exitBtn,
    });
    state.trap.activate({ initialFocus: state.refs.firstCityBtn });

    layer.addEventListener('keydown', handleGameKeyDown);
    layer.addEventListener('keyup', handleGameKeyUp);
    window.addEventListener('blur', clearHeldKeys);

    // CW-14: keep the header toggles honest when the flip comes from
    // somewhere else - the system switching schemes under 'auto', say.
    state.themeUnsub = themeManager.addListener(syncThemeButtons);

    announceInLayer('ASCII City Walk opened. Choose a city to start walking.');
  }

  function close() {
    unloadCity();
    clearHeldKeys();

    state.trap?.deactivate();
    layer.removeEventListener('keydown', handleGameKeyDown);
    layer.removeEventListener('keyup', handleGameKeyUp);
    window.removeEventListener('blur', clearHeldKeys);
    // CW-81: the hover pause rides window blur too, and the window outlives
    // the game - the viewport's own listeners die with the layer.
    window.removeEventListener('blur', handleViewportPointerLeave);
    state.themeUnsub?.();
    state.themeUnsub = null;

    layer.hidden = true;
    layer.replaceChildren();

    document.body.style.overflow = state.prevBodyOverflow;
    if (!state.wasMono) {
      root.removeAttribute('data-ui-variant');
      hfmCtrl?.setVariantAssets?.(false);
    }

    activeSession = null;
    // The layer is gone, so the app's global live region is back in charge.
    announce('Left the ASCII city.');
    triggerEl?.focus?.();
  }

  /**
   * In-layer polite announcer. While the layer is open it is aria-modal, so
   * AT may ignore the app's global live regions (the first-visit modal
   * documents the same constraint) — game messages go through a status
   * element inside the dialog instead.
   */
  function announceInLayer(message) {
    const el = state.refs.announcer;
    if (!el) return;
    el.textContent = '';
    requestAnimationFrame(() => {
      el.textContent = message;
    });
  }

  function handleEscape() {
    // CW-65: the traveler's bubble is now the innermost thing on screen, and
    // it opens by WALKING rather than by a keypress - so a player who reaches
    // for Escape is reaching for it, not for the map or the exit. One Escape,
    // one dismissal, innermost first (CW-61's rule, one layer deeper).
    if (!state.refs.found?.hidden) {
      closeFoundDialog();
      return;
    }
    // CW-61: the travel dialog is the innermost thing Escape can close, so it
    // goes first. Cancelling it must not also close the help or leave the
    // game - one Escape, one dismissal.
    if (state.travel) {
      closeTravelDialog(false);
      return;
    }
    if (state.helpOpen) {
      toggleHelp(false);
      return;
    }
    // CW-87: a touring player who reaches for Escape wants to STOP the
    // tour, not to leave the city mid-route - the same layer auto-walk
    // holds, and the tour is the one that is driving.
    if (state.game?.tour) {
      stopTour(TOUR_STOPPED_MESSAGE);
      return;
    }
    // CW-81: an auto-walking player who reaches for Escape wants to STOP,
    // not to leave the city mid-stride. One Escape, one dismissal - the
    // auto-walk is the next layer in after the dialogs.
    if (state.game?.autoWalk) {
      setAutoWalk(false, AUTO_WALK_OFF_MESSAGE);
      return;
    }
    close();
  }

  // -------------------------------------------------------------------
  // DOM
  // -------------------------------------------------------------------

  function buildLayerDom() {
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-label', 'ASCII City Walk game');

    layer.replaceChildren();

    const header = document.createElement('div');
    header.className = 'city-walk-header';

    const title = document.createElement('h2');
    title.className = 'city-walk-title';
    title.textContent = 'ASCII City Walk';
    header.appendChild(title);

    const headerActions = document.createElement('div');
    headerActions.className = 'city-walk-header-actions';

    // CW-14: the layer is aria-modal, so the app header's accessibility
    // controls are unreachable while playing. These two call the same theme
    // manager the header does, in the header's owner-signed order (U-16):
    // high contrast, theme, then the rest.
    const contrastBtn = document.createElement('button');
    contrastBtn.type = 'button';
    contrastBtn.className = 'btn btn-secondary city-walk-btn';
    contrastBtn.id = 'cityWalkContrastBtn';
    contrastBtn.textContent = 'High contrast';
    contrastBtn.addEventListener('click', flipHighContrast);
    headerActions.appendChild(contrastBtn);

    const themeBtn = document.createElement('button');
    themeBtn.type = 'button';
    themeBtn.className = 'btn btn-secondary city-walk-btn';
    themeBtn.id = 'cityWalkThemeBtn';
    themeBtn.addEventListener('click', cycleAppTheme);
    headerActions.appendChild(themeBtn);

    // CW-Q16: colour is the game's own switch now, not a side effect of high
    // contrast. It sits after the two app-wide controls because it changes
    // only this game.
    const colourBtn = document.createElement('button');
    colourBtn.type = 'button';
    colourBtn.className = 'btn btn-secondary city-walk-btn';
    colourBtn.id = 'cityWalkColourBtn';
    // CW-Q38: US English on every player-visible surface ('Color'), while
    // identifiers and the persisted key keep their spelling - renaming a
    // stored key strands every saved choice (the UF-14 lesson).
    colourBtn.textContent = 'Color';
    colourBtn.addEventListener('click', flipColour);
    headerActions.appendChild(colourBtn);

    /**
     * ★★ CW-Q59 SAYS "LEFT OF HIGH CONTRAST" AND THIS IS NOT THERE, ON
     * PURPOSE - IT IS THE OWNER'S CALL AND THE LEDGER CARRIES IT.
     *
     * `cityWalkContrastBtn` is the FIRST child of this row, and the comment
     * above it says why: the layer is aria-modal, so the app header's
     * accessibility controls are unreachable while playing, and these two sit
     * "in the header's owner-signed order (U-16): high contrast, theme, then
     * the rest". Putting a celebration control to their left moves a game
     * feature ahead of the accessibility controls in a modal's tab order,
     * which is the one thing U-16 signed.
     *
     * So it sits with the game's own controls, beside Color, exactly as the
     * Color button itself does "because it changes only this game". It is
     * equally reachable, and Y reaches it without tabbing at all. If the owner
     * wants CW-Q59's literal placement it is one `insertBefore`.
     */
    const fireworksBtn = document.createElement('button');
    fireworksBtn.type = 'button';
    fireworksBtn.className = 'btn btn-secondary city-walk-btn';
    fireworksBtn.id = 'cityWalkFireworksBtn';
    // FLAGGED STRING (D-35).
    fireworksBtn.textContent = 'Fireworks';
    fireworksBtn.hidden = true;
    fireworksBtn.addEventListener('click', playFireworks);
    headerActions.appendChild(fireworksBtn);

    const helpBtn = document.createElement('button');
    helpBtn.type = 'button';
    helpBtn.className = 'btn btn-secondary city-walk-btn';
    helpBtn.id = 'cityWalkHelpBtn';
    helpBtn.textContent = 'Help';
    helpBtn.setAttribute('aria-expanded', 'false');
    helpBtn.setAttribute('aria-controls', 'cityWalkHelpPanel');
    helpBtn.addEventListener('click', () => toggleHelp(!state.helpOpen));
    headerActions.appendChild(helpBtn);

    const exitBtn = document.createElement('button');
    exitBtn.type = 'button';
    exitBtn.className = 'btn btn-secondary city-walk-btn';
    exitBtn.id = 'cityWalkExitBtn';
    exitBtn.textContent = 'Exit game';
    exitBtn.addEventListener('click', close);
    headerActions.appendChild(exitBtn);

    header.appendChild(headerActions);
    layer.appendChild(header);

    // Start panel: city picker
    const startPanel = document.createElement('div');
    startPanel.className = 'city-walk-start';
    startPanel.id = 'cityWalkStartPanel';

    const startHeading = document.createElement('h3');
    startHeading.className = 'city-walk-start-heading';
    startHeading.textContent = 'Choose a city';
    startPanel.appendChild(startHeading);

    const startIntro = document.createElement('p');
    startIntro.className = 'city-walk-start-intro';
    startIntro.textContent =
      'Walk a real neighborhood drawn entirely in ASCII characters. ' +
      'Arrow keys or W A S D walk, Q and E turn, Shift is faster, ' +
      'M switches to the map view, Escape leaves.';
    startPanel.appendChild(startIntro);

    const cityList = document.createElement('div');
    cityList.className = 'city-walk-city-list';
    let firstCityBtn = null;
    for (const city of CITIES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary city-walk-btn city-walk-city-btn';
      btn.textContent = city.label;
      btn.addEventListener('click', () => loadCity(city, btn));
      cityList.appendChild(btn);
      if (!firstCityBtn) firstCityBtn = btn;
    }
    startPanel.appendChild(cityList);

    // CW-44: the big Seattle is ~4.9 MB and measured 47 s on Slow 4G - a
    // wait that long with only a silent aria-busy is a dead screen. This
    // line shows and speaks download progress. role=status (a polite live
    // region) rather than aria-label: a visible text line works here, and
    // percent updates land at ~10% steps so a screen reader hears progress
    // without chatter.
    const loadStatus = document.createElement('p');
    loadStatus.className = 'city-walk-start-loading';
    loadStatus.id = 'cityWalkLoadStatus';
    loadStatus.setAttribute('role', 'status');
    loadStatus.hidden = true;
    startPanel.appendChild(loadStatus);

    // role=alert announces assertively when text lands in it (the element
    // itself lives inside the modal, per the first-visit precedent).
    const startError = document.createElement('p');
    startError.className = 'city-walk-start-error';
    startError.id = 'cityWalkStartError';
    startError.setAttribute('role', 'alert');
    startError.hidden = true;
    startPanel.appendChild(startError);

    const startAttribution = document.createElement('p');
    startAttribution.className = 'city-walk-attribution';
    startAttribution.append('Map data © ');
    startAttribution.appendChild(makeOsmLink());
    startPanel.appendChild(startAttribution);

    layer.appendChild(startPanel);

    // Viewport: WebGL canvas + ASCII overlay live here. Decorative to AT.
    const viewport = document.createElement('div');
    viewport.className = 'city-walk-viewport';
    viewport.id = 'cityWalkViewport';
    viewport.setAttribute('aria-hidden', 'true');
    viewport.hidden = true;
    layer.appendChild(viewport);

    // Toolbar (CW-15): the mouse route to every key. Hidden until a city
    // starts, like the HUD.
    const toolbar = buildToolbar();
    layer.appendChild(toolbar.el);

    // CW-35: the Camera panel, the one Forge users already know.
    const cameraPanel = buildCityCameraPanel({
      hold: (action) => pressToolbarAction(action),
      release: (action) => releaseToolbarAction(action),
      isMapView: () => Boolean(state.game?.mapView),
      toggleMapView: () => toggleMapView(),
      levelView: () => levelTheView(),
      recenterMap: () => recenterMap(),
      adjustCharacterSize: (steps) =>
        adjustCharacterSize(steps * CHAR_SCALE_STEP),
      cycleMapStyle: (delta) => stepMapStyle(delta),
      setHeading: (rad) => faceHeading(rad),
      setPitch: (rad) => setGazePitch(rad),
      announce: (text) => announceInLayer(text),
      collapsedStore: {
        read: () => safeGetItem(STORAGE_KEY_CITY_WALK_CAMERA_PANEL) === 'true',
        write: (collapsed) =>
          safeSetItem(
            STORAGE_KEY_CITY_WALK_CAMERA_PANEL,
            collapsed ? 'true' : 'false'
          ),
      },
    });
    cameraPanel.el.hidden = true;
    // Inside the viewport, which is the positioned ancestor the other two
    // floating panels use.
    viewport.appendChild(cameraPanel.el);

    // HUD: real text, updated on state changes (not a live region — discrete
    // events are announced instead).
    const hud = document.createElement('div');
    hud.className = 'city-walk-hud';
    hud.hidden = true;

    const hudStatus = document.createElement('p');
    hudStatus.className = 'city-walk-hud-status';
    hudStatus.id = 'cityWalkHudStatus';
    hud.appendChild(hudStatus);

    const hudAttribution = document.createElement('p');
    hudAttribution.className = 'city-walk-attribution';
    hudAttribution.append('Map data © ');
    hudAttribution.appendChild(makeOsmLink());
    hud.appendChild(hudAttribution);

    layer.appendChild(hud);

    // Help panel
    const help = document.createElement('div');
    help.className = 'city-walk-help';
    help.id = 'cityWalkHelpPanel';
    help.hidden = true;

    const helpHeading = document.createElement('h3');
    helpHeading.textContent = 'How to play';
    help.appendChild(helpHeading);

    const helpList = document.createElement('ul');
    helpList.className = 'city-walk-help-list';
    const helpItems = [
      'Arrow Up or W: walk forward',
      'Arrow Down or S: walk backward',
      'A and D: sidestep left and right',
      'Arrow Left / Q and Arrow Right / E: turn',
      'R and F: look up and down',
      'V: level the view',
      // CW-81 (CW-Q72, CW-Q80). FLAGGED STRINGS (D-35). The drag line is
      // REVISED: dragging is one mode of three now, and the help teaches
      // the default first.
      'Move the mouse: the view turns toward the cursor (the Mouse look ' +
        'button changes this to a held drag, or off)',
      'Drag with the mouse: move the map in map view',
      'N: auto-walk forward, following the street, until something stops ' +
        'you; while it walks, Arrow Up and Arrow Down look, and W A S D ' +
        'take over',
      // CW-87 (CW-Q84). FLAGGED STRING (D-35).
      'I: walk to the selected landmark, turn by turn; I again, Escape, ' +
        'or a walk key stops the tour',
      'Shift (hold): move faster',
      'Left and Right Bracket: walking speed down or up',
      'M: switch between street view and map view',
      // CW-59: W A S D already panned the map and always had - the same keys
      // that walk the street, through the same actions. Only this line and
      // the map-view announcement said otherwise, so the fix is a sentence
      // rather than a key binding. Measured: W moves the map 302 m where
      // ArrowUp moves it 302 m, and A, S and D match their arrows too.
      'On the map: arrow keys or W A S D pan, Page Up and Page Down zoom, Home returns to you',
      'On the map: K and Shift+K change the map style, between Standard, Roads only, Buildings only and Wayfinding',
      'On the map: click anywhere to be asked whether to travel there; J asks about the middle of the map',
      'The travel question names the corner you would land on, and nothing moves until you press Travel',
      'L and Shift+L: cycle landmarks on the map',
      'X: say where you are',
      // CW-42 (CW-Q39): the bottom of the range is per machine now, so the
      // help says how it is set instead of naming a number.
      'Minus and Equals: smaller or larger characters, up to 100% ' +
        "(the smallest size is set by this machine's own speed)",
      'C: high contrast on or off',
      'T: change the theme',
      'O: color on or off (off is a single-color retro screen)',
      // CW-85 (CW-Q83, CW-Q86). FLAGGED STRINGS (D-35). Both name what the
      // key DOES rather than the state it leaves you in, because the help
      // is read from either state.
      'B: day or night (day fills in nearby surfaces behind the characters)',
      'U: empty the city of people and parked cars, or bring them back',
      'G: rain off, light, heavy (stays off if you use reduced motion)',
      'P: save a picture of what you can see',
      // FLAGGED STRING (D-35). It says "once you have found every landmark"
      // rather than naming the key alone, because a key that does nothing is
      // worse than a key nobody has been told about yet.
      'Y: fireworks again, once you have found every landmark in this city',
      // CW-64: the count moved when Fireworks joined this row, and it is
      // CONDITIONAL - it does not exist until a city is finished - so the line
      // names the joiner rather than counting buttons.
      'High contrast, theme and color: buttons at the top of the screen, with ' +
        'Fireworks joining them once you have found every landmark',
      // CW-35: the toolbar no longer holds all of them. Walking, turning,
      // looking and the standard views moved into the Camera panel, and a
      // help panel that still said "the toolbar" would send a mouse user
      // hunting along the bottom for buttons that are not there.
      'Walking, turning, looking and the standard views: the Camera panel on the right',
      'Every other key also has a button in the toolbar along the bottom',
      'H: open or close this help',
      'Escape: close this help, or leave the game',
    ];
    for (const item of helpItems) {
      const li = document.createElement('li');
      li.textContent = item;
      helpList.appendChild(li);
    }
    help.appendChild(helpList);

    const helpNote = document.createElement('p');
    helpNote.className = 'city-walk-help-note';
    helpNote.textContent =
      'The city is built from real OpenStreetMap building and street data. ' +
      'Buildings are solid — streets and open ground are walkable.';
    help.appendChild(helpNote);

    const helpAttribution = document.createElement('p');
    helpAttribution.className = 'city-walk-attribution';
    helpAttribution.append('Map data © ');
    helpAttribution.appendChild(makeOsmLink());
    help.appendChild(helpAttribution);

    layer.appendChild(help);

    /**
     * CW-61 (CW-Q58): the travel dialog.
     *
     * ★ NOT a second `aria-modal`. The layer is already `role="dialog"
     * aria-modal="true"` and owns the focus trap, and nesting a second modal
     * inside it would tell a screen reader that the outer one had gone away.
     * This is a focus-managed panel with `role="group"` and its own labelled
     * heading, the same shape the help panel has, plus Escape ahead of the
     * help in the chain.
     */
    const travel = document.createElement('div');
    travel.className = 'city-walk-travel';
    travel.id = 'cityWalkTravelDialog';
    travel.setAttribute('role', 'group');
    travel.setAttribute('aria-labelledby', 'cityWalkTravelTitle');
    travel.setAttribute('aria-describedby', 'cityWalkTravelWhere');
    travel.hidden = true;

    const travelTitle = document.createElement('h3');
    travelTitle.id = 'cityWalkTravelTitle';
    travelTitle.textContent = TRAVEL_TITLE;
    travel.appendChild(travelTitle);

    const travelWhere = document.createElement('p');
    travelWhere.className = 'city-walk-travel-where';
    travelWhere.id = 'cityWalkTravelWhere';
    travel.appendChild(travelWhere);

    const travelActions = document.createElement('div');
    travelActions.className = 'city-walk-travel-actions';

    const travelGo = document.createElement('button');
    travelGo.type = 'button';
    travelGo.id = 'cityWalkTravelGoBtn';
    travelGo.className = 'btn btn-primary city-walk-btn';
    travelGo.textContent = TRAVEL_CONFIRM_LABEL;

    const travelCancel = document.createElement('button');
    travelCancel.type = 'button';
    travelCancel.id = 'cityWalkTravelCancelBtn';
    travelCancel.className = 'btn btn-secondary city-walk-btn';
    travelCancel.textContent = TRAVEL_CANCEL_LABEL;

    travelActions.append(travelGo, travelCancel);
    travel.appendChild(travelActions);
    layer.appendChild(travel);

    travelGo.addEventListener('click', () => closeTravelDialog(true));
    travelCancel.addEventListener('click', () => closeTravelDialog(false));

    /**
     * CW-65 (CW-Q60): the traveler's speech bubble.
     *
     * ★ NOT a second `aria-modal`, for exactly CW-61's reason: the layer is
     * already `role="dialog" aria-modal="true"` and owns the focus trap, and
     * nesting a second modal inside it tells a screen reader the outer one has
     * gone away. A focus-managed `role="group"` with its own labelled heading,
     * like the help panel and the travel dialog before it.
     */
    const found = document.createElement('div');
    found.className = 'city-walk-found';
    found.id = 'cityWalkFoundDialog';
    found.setAttribute('role', 'group');
    found.setAttribute('aria-labelledby', 'cityWalkFoundTitle');
    found.setAttribute('aria-describedby', 'cityWalkFoundBody');
    found.hidden = true;

    const foundTitle = document.createElement('h3');
    foundTitle.id = 'cityWalkFoundTitle';
    foundTitle.textContent = TRAVELER_FOUND_TITLE;
    found.appendChild(foundTitle);

    const foundBody = document.createElement('p');
    foundBody.className = 'city-walk-found-body';
    foundBody.id = 'cityWalkFoundBody';
    foundBody.textContent = TRAVELER_FOUND_BODY;
    found.appendChild(foundBody);

    const foundClose = document.createElement('button');
    foundClose.type = 'button';
    foundClose.id = 'cityWalkFoundCloseBtn';
    foundClose.className = 'btn btn-primary city-walk-btn';
    foundClose.textContent = TRAVELER_FOUND_DISMISS;
    found.appendChild(foundClose);
    layer.appendChild(found);

    foundClose.addEventListener('click', () => closeFoundDialog());

    // Landmark legend (CW-10): real text beside the map view.
    const legend = document.createElement('aside');
    legend.className = 'city-walk-legend';
    legend.id = 'cityWalkLegend';
    legend.setAttribute('aria-label', 'Landmarks');
    legend.hidden = true;
    layer.appendChild(legend);

    // In-layer polite live region (see announceInLayer).
    const announcer = document.createElement('p');
    announcer.className = 'sr-only';
    announcer.id = 'cityWalkAnnouncer';
    announcer.setAttribute('role', 'status');
    layer.appendChild(announcer);

    state.refs = {
      found,
      foundClose,
      contrastBtn,
      themeBtn,
      colourBtn,
      fireworksBtn,
      helpBtn,
      exitBtn,
      startPanel,
      startError,
      loadStatus,
      cityButtons: Array.from(cityList.children),
      firstCityBtn,
      viewport,
      toolbar: toolbar.el,
      toolbarButtons: toolbar.buttons,
      cameraPanel,
      mapBtn: toolbar.mapBtn,
      fastBtn: toolbar.fastBtn,
      viewZone: toolbar.viewZone,
      hud,
      hudStatus,
      help,
      travel,
      travelWhere,
      travelGo,
      legend,
      announcer,
    };

    syncThemeButtons();
    // The layer element outlives a session, so a value left by the last
    // one would shorten the help panel on the picker, where there is no
    // toolbar at all. Rebuilding the DOM resets it to a measured zero.
    measureToolbar();
  }

  /**
   * Mirror the document's contrast and theme attributes onto the header
   * toggles. High contrast is a two-state toggle, so it carries
   * aria-pressed; the theme is the app's three-state cycle, so its visible
   * label names the current setting instead and the aria-label says what
   * pressing it does (U-7).
   */
  function syncThemeButtons() {
    const { contrastBtn, themeBtn, colourBtn } = state.refs;
    if (!contrastBtn || !themeBtn) return;

    if (colourBtn) {
      const on = colourIsOn();
      colourBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      colourBtn.setAttribute(
        'aria-label',
        on
          ? 'Color on. Press for a single-color screen.'
          : 'Color off. Press to show the city in color.'
      );
    }

    const hc = root.getAttribute('data-high-contrast') === 'true';
    contrastBtn.setAttribute('aria-pressed', hc ? 'true' : 'false');
    contrastBtn.setAttribute(
      'aria-label',
      hc ? 'Turn high contrast off' : 'Turn high contrast on'
    );

    const setting = root.getAttribute('data-theme-setting') ?? 'auto';
    const label = THEME_SETTING_LABELS[setting] ?? THEME_SETTING_LABELS.auto;
    themeBtn.textContent = `Theme: ${label}`;
    themeBtn.setAttribute(
      'aria-label',
      `Theme: ${label}. Press to cycle themes.`
    );
  }

  /** High contrast, from the header button and from C (CW-Q15). */
  function flipHighContrast() {
    const enabled = themeManager.toggleHighContrast();
    announceInLayer(enabled ? 'High contrast on.' : 'High contrast off.');
  }

  /** The app's three-state theme cycle, from the header button and from T. */
  function cycleAppTheme() {
    // cycleTheme() returns the app's own user-facing message.
    announceInLayer(themeManager.cycleTheme());
  }

  /**
   * Is the city drawn in colour right now? (CW-Q16.)
   *
   * With nothing stored, colour follows high contrast — which is exactly what
   * the palettes did when they were HC-only, so a player who never finds the
   * button sees no change at all. Once the player works the toggle their
   * choice is stored and wins from then on, in both directions.
   *
   * Turning colour off costs no contrast: the bare phosphors measure 15.30:1
   * (green) and 11.46:1 (amber) on black, above every palette entry.
   *
   * @returns {boolean}
   */
  function colourIsOn() {
    const stored = safeGetItem(STORAGE_KEY_CITY_WALK_COLOUR);
    if (stored === 'on') return true;
    if (stored === 'off') return false;
    return root.getAttribute('data-high-contrast') === 'true';
  }

  /** Colour on/off, from the header button and from O (CW-Q16). */
  function flipColour() {
    const next = !colourIsOn();
    safeSetItem(STORAGE_KEY_CITY_WALK_COLOUR, next ? 'on' : 'off');
    syncThemeButtons();
    if (state.game) {
      applyHcPalette(state.game);
      state.game.altView.rebuildGlyphs?.();
      state.game.altView.invalidate();
    }
    announceInLayer(
      next
        ? 'Color on. The city is drawn in the retro palette.'
        : 'Color off. The city is drawn in a single phosphor.'
    );
  }

  /**
   * Is the backing painted right now? (CW-85, CW-Q83.)
   *
   * ABSENT means NIGHT, and Night is the city exactly as it has always been
   * drawn: characters on the page's own black with nothing behind them. Day
   * fills the black gaps on nearby surfaces with a dark material tint UNDER
   * the glyphs, which is what makes a car read as a solid mass rather than as
   * characters in front of nothing. The owner asked for it as a toggle and
   * chose Night as the default.
   *
   * @returns {boolean}
   */
  function daylightIsOn() {
    return safeGetItem(STORAGE_KEY_CITY_WALK_DAYLIGHT) === 'day';
  }

  /**
   * The phosphor this theme paints monochrome with, read from the stylesheet
   * rather than copied - variant.css owns it, and a copy here would drift.
   */
  function monoPhosphor() {
    const value = getComputedStyle(root)
      .getPropertyValue('--color-accent')
      .trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value : '#00ff00';
  }

  /** Day/Night, from B and from the toolbar button (CW-85, CW-Q83). */
  function flipDaylight() {
    const next = !daylightIsOn();
    safeSetItem(STORAGE_KEY_CITY_WALK_DAYLIGHT, next ? 'day' : 'night');
    syncDaylightControls();
    // The backing is read at paint time, so nothing has to be rebuilt or
    // forgotten: one dirty frame is the whole of it.
    if (state.game) state.game.altView.invalidate();
    announceInLayer(
      next
        ? 'Day. Nearby surfaces are filled in behind the characters.'
        : 'Night. The characters stand on black, with nothing behind them.'
    );
  }

  /**
   * Are the streets empty right now? (CW-85, CW-Q86.)
   *
   * ABSENT means the city is populated, which is how it ships. Empty hides
   * the people and the cars so the buildings and the street can be looked at
   * on their own.
   *
   * @returns {boolean}
   */
  function emptyCityIsOn() {
    return safeGetItem(STORAGE_KEY_CITY_WALK_EMPTY_CITY) === 'on';
  }

  /** Meshes an empty city hides. Traffic never reached the collision grid. */
  const POPULATION_MESHES = new Set(['people', 'cars', 'traffic-cars']);

  /**
   * Put the city's population in or take it out, PICTURE AND GRID TOGETHER.
   *
   * ★ The grid is the half that is easy to forget, and forgetting it is worse
   * than not building the feature: an empty street you cannot walk down,
   * because you are bumping into cars nobody can see, is a broken city rather
   * than a quiet one. So the grid is rebuilt from the buildings and re-stamped
   * with only the footprints that are not population. `stepWalk` reads
   * `game.collision` through the game object every frame, so the swap lands
   * without anything having to be told about it.
   */
  function applyEmptyCity(game) {
    const empty = emptyCityIsOn();
    game.props?.group?.traverse((obj) => {
      if (obj.isMesh && POPULATION_MESHES.has(obj.name)) obj.visible = !empty;
    });
    const obstacles = empty
      ? (game.props?.obstacles ?? []).filter((o) => !o.population)
      : (game.props?.obstacles ?? []);
    const collision = buildCollisionGrid(game.model);
    stampObstacles(collision, obstacles);
    game.collision = collision;
    game.altView?.invalidate();
  }

  /** Empty city on/off, from U and from the toolbar button (CW-Q86). */
  function flipEmptyCity() {
    const next = !emptyCityIsOn();
    safeSetItem(STORAGE_KEY_CITY_WALK_EMPTY_CITY, next ? 'on' : 'off');
    syncDaylightControls();
    if (state.game) applyEmptyCity(state.game);
    announceInLayer(
      next
        ? 'Empty city. The people and the cars are gone, and you can walk where they stood.'
        : 'The city is busy again. People and parked cars are back.'
    );
  }

  /**
   * The toolbar spec (CW-15). A `hold` entry names an action frame()
   * already reads out of state.keys, so a held button reaches street mode
   * and map mode exactly the way its key does; `press` is the same discrete
   * handler the key calls. `views` hides a button in the mode where its key
   * does nothing. Since CW-Q41 the character-size keys mean character size
   * in BOTH views (map zoom moved to PageUp/PageDown), so the size pair is
   * an ordinary `both` group like Speed.
   */
  // CW-35/CW-Q32: the Camera and Move groups have RETIRED from this toolbar.
  // Their jobs moved to the Camera panel, which is the panel Forge users
  // already know from the 3D preview, so the same controls are in the same
  // place whichever part of the app they are in. The press-and-hold machinery
  // below stays exactly as it was - Speed, Characters, Weather, Map and
  // Landmarks all still use it.
  const TOOLBAR_GROUPS = [
    {
      name: 'Speed',
      buttons: [
        {
          id: 'cityWalkSpeedDownBtn',
          label: 'Slower',
          keys: 'Left Bracket',
          press: () => adjustWalkSpeed(-SPEED_LABEL_STEP),
          views: 'both',
        },
        {
          id: 'cityWalkSpeedUpBtn',
          label: 'Faster',
          keys: 'Right Bracket',
          press: () => adjustWalkSpeed(SPEED_LABEL_STEP),
          views: 'both',
        },
      ],
    },
    {
      name: 'Characters',
      buttons: [
        {
          id: 'cityWalkCharDownBtn',
          label: 'Smaller',
          keys: 'Minus',
          press: () => adjustCharacterSize(-CHAR_SCALE_STEP),
          views: 'both',
        },
        {
          id: 'cityWalkCharUpBtn',
          label: 'Larger',
          keys: 'Equals',
          press: () => adjustCharacterSize(CHAR_SCALE_STEP),
          views: 'both',
        },
      ],
    },
    {
      // CW-59: this group was 'Weather' and held Photo beside Rain. Rain is a
      // street-only control and now lives in the view zone, and a group of one
      // still captioned Weather would have been describing a button that
      // saves a picture.
      name: 'Picture',
      buttons: [
        {
          id: 'cityWalkPhotoBtn',
          label: 'Photo',
          keys: 'P',
          press: savePhoto,
          views: 'both',
        },
      ],
    },
    {
      name: 'Map',
      buttons: [
        {
          id: 'cityWalkMapBtn',
          label: 'Map view',
          keys: 'M',
          press: toggleMapView,
          toggle: true,
          views: 'both',
        },
      ],
    },
    {
      // CW-85: both of these are the owner's own asks, and both get a button
      // as well as a key - CW-60's promise is that every key has one.
      //
      // ★★ ONLY THE SHARED ONE IS HERE. Day is street-only (the map is an
      // overhead plan with its fog nulled, so there is no distance for the
      // tint to fade over), and CW-59's rule is that EVERY view-only button
      // lives in the view zone at the far end and nowhere else. Day sat here
      // first and the CW-59 guard caught it immediately: hiding it on the map
      // moved Empty city 48 px, because a width change anywhere left of a
      // shared button moves that button. The two stay together in the Camera
      // panel, which is where a mouse user browses them.
      name: 'Scene',
      buttons: [
        {
          id: 'cityWalkEmptyCityBtn',
          label: 'Empty city',
          keys: 'U',
          press: flipEmptyCity,
          toggle: true,
          views: 'both',
        },
      ],
    },
    {
      name: 'Landmarks',
      buttons: [
        {
          id: 'cityWalkLandmarkPrevBtn',
          label: 'Previous',
          keys: 'Shift + L',
          press: () => cycleLandmark(-1),
          views: 'both',
        },
        {
          id: 'cityWalkLandmarkNextBtn',
          label: 'Next',
          keys: 'L',
          press: () => cycleLandmark(1),
          views: 'both',
        },
        // CW-27: wayfinding belongs beside the landmarks, because it answers
        // the same question a player asks when they are lost.
        {
          id: 'cityWalkWhereBtn',
          label: 'Where am I?',
          keys: 'X',
          press: sayWhereYouAre,
          views: 'both',
        },
      ],
    },
    {
      /**
       * ★★ THE VIEW ZONE (CW-59, CW-Q61). Every button that exists in only
       * one view lives HERE, at the far end behind a divider, and nowhere
       * else.
       *
       * Before this, view-only buttons sat inside the group they belonged to
       * by meaning - Fast inside Speed, Rain inside Weather, the map controls
       * inside Map - and hiding them made the whole strip re-lay-out. Measured
       * on a 1280px window: **all NINE shared buttons moved**, by up to
       * 186 px, and some moved LEFT while others moved RIGHT, because the
       * toolbar centres itself and the total width changed. A player who
       * reaches for Larger in the street view found Photo under the cursor
       * after switching to the map.
       *
       * With every view-only button after every shared one, the shared zone
       * cannot move: nothing that changes width is ever to its left.
       *
       * The caption swaps with the view because that is the honest label for
       * a region whose contents come and go.
       */
      name: 'Street only',
      viewZone: true,
      buttons: [
        // CW-35: Fast lived with Speed when the Move group retired, and the
        // reasoning still holds - Shift is a keyboard-only route, so without
        // a button nobody on mouse or touch could hurry. It is here now
        // because it is street-only, not because it stopped belonging there.
        {
          id: 'cityWalkFastBtn',
          label: 'Fast',
          keys: 'Shift (hold)',
          press: toggleFastWalk,
          toggle: true,
          views: 'street',
        },
        {
          id: 'cityWalkRainBtn',
          label: 'Rain',
          keys: 'G',
          press: cycleRain,
          toggle: true,
          views: 'street',
        },
        // CW-85: Day is street-only, so by CW-59's rule it belongs in this
        // zone rather than beside its own key's sibling. Its partner, the
        // empty city, works in both views and stays in the shared Scene
        // group; the Camera panel keeps the pair together.
        {
          id: 'cityWalkDaylightBtn',
          label: 'Day',
          keys: 'B',
          press: flipDaylight,
          toggle: true,
          views: 'street',
        },
        // CW-81 (CW-Q80): auto-walk, the GAG alternative to held buttons.
        // Street-only - there is no walker to send anywhere on the map.
        {
          id: 'cityWalkAutoWalkBtn',
          label: 'Auto-walk',
          keys: 'N',
          press: () => toggleAutoWalk(),
          toggle: true,
          views: 'street',
        },
        // CW-81 (CW-Q72): the mouse-look preference. The signed decision
        // says the camera panel; CW-38's guard says the panel is EXACTLY
        // full (CW-85's Scene section overflowed it by 92 px and moved to
        // this toolbar for the same reason), so the preference follows that
        // precedent. Recorded as a deviation in the release record; the
        // visible label stays fixed so the zone's widths cannot shift
        // (CW-60's rule) and the aria-label carries the current mode.
        {
          id: 'cityWalkLookModeBtn',
          label: 'Mouse look',
          keys: '',
          press: () => cycleLookMode(),
          views: 'street',
        },
        {
          id: 'cityWalkCenterBtn',
          label: 'Center on you',
          keys: 'Home',
          press: recenterMap,
          views: 'map',
        },
        {
          id: 'cityWalkZoomOutBtn',
          label: 'Zoom out',
          keys: 'Page Down',
          hold: 'zoomOut',
          views: 'map',
        },
        {
          id: 'cityWalkZoomInBtn',
          label: 'Zoom in',
          keys: 'Page Up',
          hold: 'zoomIn',
          views: 'map',
        },
        // CW-61 (CW-Q58): the ARMING has retired and the button has not.
        // It opens the travel dialog at the map's centre, which is exactly
        // what J does - so a mouse-only player and a keyboard player reach
        // the same question the same way, and the toolbar promise (every key
        // has a button) survives the change. It is no longer a toggle:
        // there is no mode left to be in.
        {
          id: 'cityWalkTeleportBtn',
          label: 'Travel',
          keys: 'J',
          press: teleportAtCrosshair,
          views: 'map',
        },
        // CW-60: the toolbar promise - every key has a button. It goes LAST
        // in the zone, where its own width is behind everything else in it,
        // and the zone is behind every shared button (CW-59). The label does
        // not name the current style: a label that changed width would move
        // its neighbours, and the style is already said out loud, written in
        // the HUD, and visible on the map.
        {
          id: 'cityWalkMapStyleBtn',
          label: 'Map style',
          keys: 'K',
          press: () => stepMapStyle(1),
          views: 'map',
        },
      ],
    },
  ];

  /**
   * Build the control strip that gives a mouse-only player every key.
   *
   * Every button is its own tab stop rather than carrying the roving
   * tabindex the toolbar pattern usually does: the arrow keys walk the
   * player, so they cannot also move focus. Tab is the layer's only focus
   * mover and the focus trap already owns it.
   */
  function buildToolbar() {
    const el = document.createElement('div');
    el.className = 'city-walk-toolbar';
    el.id = 'cityWalkToolbar';
    el.setAttribute('role', 'toolbar');
    el.setAttribute('aria-label', 'City walk controls');
    el.hidden = true;

    const buttons = [];
    let mapBtn = null;
    let fastBtn = null;
    let viewZone = null;

    for (const group of TOOLBAR_GROUPS) {
      const groupEl = document.createElement('div');
      groupEl.className = 'city-walk-toolbar-group';
      groupEl.setAttribute('role', 'group');

      // The group is named by its own visible caption, so a sighted player
      // can tell the two smaller/larger pairs apart without a tooltip and
      // assistive tech reads the same word.
      const labelId = 'cityWalkToolbar' + group.name + 'Label';
      groupEl.setAttribute('aria-labelledby', labelId);

      const labelEl = document.createElement('span');
      labelEl.className = 'city-walk-toolbar-group-label';
      labelEl.id = labelId;
      labelEl.textContent = group.name;
      groupEl.appendChild(labelEl);

      if (group.viewZone) {
        groupEl.classList.add('city-walk-toolbar-view-zone');
        viewZone = { groupEl, labelEl };
      }

      for (const spec of group.buttons) {
        const btn = makeToolbarButton(spec);
        groupEl.appendChild(btn);
        buttons.push({ spec, btn });
        if (spec.id === 'cityWalkMapBtn') mapBtn = btn;
        if (spec.id === 'cityWalkFastBtn') fastBtn = btn;
      }

      el.appendChild(groupEl);
    }

    return { el, buttons, mapBtn, fastBtn, viewZone };
  }

  function makeToolbarButton(spec) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secondary city-walk-btn city-walk-toolbar-btn';
    btn.id = spec.id;
    btn.textContent = spec.label;
    // The tooltip teaches the key instead of repeating the visible label,
    // which stays the accessible name. A button with no key of its own
    // (CW-81's Mouse look) simply teaches nothing.
    if (spec.keys) btn.title = 'Keyboard: ' + spec.keys;
    if (spec.toggle) btn.setAttribute('aria-pressed', 'false');

    if (!spec.hold) {
      btn.addEventListener('click', spec.press);
      return btn;
    }

    btn.addEventListener('pointerdown', (event) => {
      // No preventDefault here. The viewport needs it precisely because it
      // is not focusable (D-59); a button is, and refusing the default
      // press would cost it both its focus ring and its keyboard
      // activation.
      if (event.button !== 0) return;
      pressToolbarAction(spec.hold);
    });
    const release = () => releaseToolbarAction(spec.hold);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('click', (event) => {
      // Enter and Space fire a click with no pointer behind it (detail 0).
      // A key press has no duration, so it gets one timed step.
      if (event.detail !== 0) return;
      pressToolbarAction(spec.hold);
      releaseToolbarAction(spec.hold);
    });
    return btn;
  }

  /**
   * Show the buttons that do something in the current view, hide the rest,
   * and keep the two pressed states honest. A button that disappears must
   * not strand the action it was holding, and must not leave focus on
   * <body> — that is D-59, and it kills every key for the rest of the
   * session.
   */
  /**
   * Publish the toolbar's height to the layer, so the help panel and the
   * landmark legend can size themselves to stop above it. Measured rather
   * than assumed: the strip is one row on a wide window and two on a narrow
   * one.
   */
  /**
   * The pressed state of the two CW-85 toggles.
   *
   * Both are ordinary aria-pressed buttons rather than a radio group: Day and
   * Night are one thing on or off, and so is an empty city, and a two-option
   * radio group for a binary is a control that reads as a choice between two
   * unrelated things.
   */
  function syncDaylightControls() {
    const find = (id) =>
      state.refs.toolbarButtons?.find((b) => b.spec.id === id)?.btn;
    find('cityWalkDaylightBtn')?.setAttribute(
      'aria-pressed',
      daylightIsOn() ? 'true' : 'false'
    );
    find('cityWalkEmptyCityBtn')?.setAttribute(
      'aria-pressed',
      emptyCityIsOn() ? 'true' : 'false'
    );
  }

  function measureToolbar() {
    const { toolbar } = state.refs;
    if (!toolbar) return;
    layer.style.setProperty(
      '--city-walk-toolbar-height',
      `${toolbar.offsetHeight}px`
    );
  }

  function syncToolbarView() {
    // The Camera panel reads the same view flag and relabels itself: the same
    // arrow that walks in the street pans over the map, and it has to say so.
    state.refs.cameraPanel?.syncView();
    const { toolbarButtons, mapBtn, fastBtn, viewZone } = state.refs;
    if (!toolbarButtons) return;
    const mapView = Boolean(state.game?.mapView);

    // CW-59: the zone says which view it is showing. Its caption is the only
    // thing in the strip that changes wording, and it sits INSIDE the zone,
    // so it cannot move a shared button however long the word is.
    if (viewZone) {
      viewZone.labelEl.textContent = mapView ? 'Map only' : 'Street only';
    }

    mapBtn?.setAttribute('aria-pressed', mapView ? 'true' : 'false');
    fastBtn?.setAttribute('aria-pressed', state.fastWalk ? 'true' : 'false');
    syncDaylightControls();

    // CW-81: the two new street-only controls carry their state in ARIA -
    // pressed for auto-walk, the current mode in Mouse look's name - while
    // the visible labels stay fixed widths (CW-60's rule).
    const autoWalkBtn = toolbarButtons.find(
      (b) => b.spec.id === 'cityWalkAutoWalkBtn'
    )?.btn;
    autoWalkBtn?.setAttribute(
      'aria-pressed',
      state.game?.autoWalk ? 'true' : 'false'
    );
    const lookBtn = toolbarButtons.find(
      (b) => b.spec.id === 'cityWalkLookModeBtn'
    )?.btn;
    if (lookBtn && state.game) {
      lookBtn.setAttribute('aria-label', `Mouse look: ${state.game.lookMode}`);
      lookBtn.title = `Mouse look: ${state.game.lookMode}`;
    }

    const rainBtn = toolbarButtons.find(
      (b) => b.spec.id === 'cityWalkRainBtn'
    )?.btn;
    if (rainBtn) {
      rainBtn.setAttribute(
        'aria-pressed',
        state.game?.rainLevel === null || state.game?.rainLevel === undefined
          ? 'false'
          : 'true'
      );
    }

    for (const { spec, btn } of toolbarButtons) {
      if (spec.views === 'both') continue;
      // Rain is motion: with reduced motion on there is nothing for this
      // button to do, so it goes away rather than sitting there inert.
      const blocked =
        spec.id === 'cityWalkRainBtn' && Boolean(state.game?.motionReduced);
      const show = !blocked && spec.views === (mapView ? 'map' : 'street');
      if (!show && !btn.hidden) {
        if (spec.hold) forceReleaseAction(spec.hold);
        if (document.activeElement === btn) mapBtn?.focus();
      }
      btn.hidden = !show;
    }

    syncCharSizeControls();
    measureToolbar();
  }

  /** Fill the map-view legend with this city's landmarks. */
  function buildLegend(landmarks) {
    const { legend } = state.refs;
    legend.replaceChildren();

    const heading = document.createElement('h3');
    heading.className = 'city-walk-legend-heading';
    heading.textContent = 'Landmarks';
    legend.appendChild(heading);

    if (landmarks.length === 0) {
      const none = document.createElement('p');
      none.className = 'city-walk-legend-empty';
      none.textContent = 'No landmarks found in this area.';
      legend.appendChild(none);
      return;
    }

    const list = document.createElement('ol');
    list.className = 'city-walk-legend-list';
    for (const lm of landmarks) {
      const li = document.createElement('li');
      li.textContent = lm.name;
      list.appendChild(li);
    }
    legend.appendChild(list);

    // CW-65: the traveler's badge, a sibling of the list rather than a row in
    // it - refreshLegend indexes that list by game.landmarks[i], so an extra
    // <li> would shift every landmark's compass direction by one.
    const badge = document.createElement('p');
    badge.className = 'city-walk-legend-badge';
    legend.appendChild(badge);

    // CW-87: the tour's mouse route. NOT a toolbar button: the strip is one
    // row by 37 px of slack in high contrast at 1600x900 (measured, CW-81's
    // record) and one more button wraps it into the Camera panel's space -
    // the same wall CW-85's panel section and CW-81's signed panel home hit.
    // The legend is where a landmark is chosen, so the button lives beside
    // the choice.
    const go = document.createElement('button');
    go.type = 'button';
    go.id = 'cityWalkTourBtn';
    go.className = 'btn btn-secondary city-walk-btn';
    // ACCESSIBILITY-CRITICAL STRING (D-35) — flagged for owner review.
    go.textContent = 'Take me there';
    go.addEventListener('click', () => startTour());
    legend.appendChild(go);

    const hint = document.createElement('p');
    hint.className = 'city-walk-legend-hint';
    // ACCESSIBILITY-CRITICAL STRING (D-35, REVISED) — flagged for review.
    hint.textContent =
      'L cycles landmarks on the map. I walks you to the selected one.';
    legend.appendChild(hint);
  }

  /**
   * Refresh legend rows with the compass direction from the player and mark
   * the selected landmark. Directions update when the map opens, not per
   * frame — the player cannot move while the map is up.
   */
  function refreshLegend(game) {
    refreshTravelerBadge(game);
    const items = state.refs.legend.querySelectorAll('li');
    items.forEach((li, i) => {
      const lm = game.landmarks[i];
      const bearing = Math.atan2(
        lm.x - game.walkState.x,
        lm.y - game.walkState.y
      );
      const seen = game.visited?.has(lm.name);
      // A real text mark, not a colour and not an icon font: the tick has
      // to survive a screen reader and a high-contrast theme alike, and
      // the word after it is what actually gets read out.
      li.textContent = `${seen ? '✓ ' : ''}${lm.name} — ${headingLabel(bearing)}`;
      if (seen) {
        const sr = document.createElement('span');
        sr.className = 'sr-only';
        sr.textContent = ' visited';
        li.appendChild(sr);
      }
      if (i === game.landmarkIndex) {
        li.setAttribute('aria-current', 'true');
        li.classList.add('selected');
      } else {
        li.removeAttribute('aria-current');
        li.classList.remove('selected');
      }
    });
  }

  function makeOsmLink() {
    const link = document.createElement('a');
    link.href = 'https://www.openstreetmap.org/copyright';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'OpenStreetMap contributors';
    const srNote = document.createElement('span');
    srNote.className = 'sr-only';
    srNote.textContent = ' (opens in new tab)';
    link.appendChild(srNote);
    return link;
  }

  function toggleHelp(show) {
    state.helpOpen = Boolean(show);
    state.refs.help.hidden = !state.helpOpen;
    state.refs.helpBtn.setAttribute(
      'aria-expanded',
      state.helpOpen ? 'true' : 'false'
    );
    if (state.helpOpen) {
      state.refs.help.setAttribute('tabindex', '-1');
      state.refs.help.focus();
    } else {
      state.refs.helpBtn.focus();
    }
  }

  // -------------------------------------------------------------------
  // City lifecycle
  // -------------------------------------------------------------------

  async function loadCity(city, pickedBtn) {
    const { refs } = state;
    refs.cityButtons.forEach((b) => (b.disabled = true));
    refs.startError.hidden = true;
    pickedBtn.setAttribute('aria-busy', 'true');
    refs.loadStatus.textContent = `Loading ${city.label}…`;
    refs.loadStatus.hidden = false;

    let model;
    try {
      const response = await fetch(`/examples/ascii-city/${city.slug}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      // CW-44: Seattle is ~4.9 MB and measured 47 s on Slow 4G. Stream the
      // body so the status line can carry real percent. content-length is
      // the size ON THE WIRE; when a compressing server makes the received
      // (decompressed) bytes overtake it, the numbers would lie, so the
      // line falls back to the plain "Loading…" instead.
      let text;
      const total = Number(response.headers.get('content-length')) || 0;
      if (response.body && total > 0) {
        const reader = response.body.getReader();
        const chunks = [];
        let received = 0;
        let shownPct = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.byteLength;
          if (received <= total) {
            const pct = Math.min(99, Math.floor((received / total) * 100));
            if (pct >= shownPct + 10) {
              shownPct = pct;
              refs.loadStatus.textContent = `Loading ${city.label}… ${pct}%`;
            }
          } else if (shownPct !== 0) {
            shownPct = 0;
            refs.loadStatus.textContent = `Loading ${city.label}…`;
          }
        }
        const joined = new Uint8Array(received);
        let offset = 0;
        for (const c of chunks) {
          joined.set(c, offset);
          offset += c.byteLength;
        }
        text = new TextDecoder().decode(joined);
      } else {
        text = await response.text();
      }
      refs.loadStatus.textContent = `Building ${city.label}…`;
      model = parseCityExtract(JSON.parse(text));
    } catch (error) {
      console.error(`[CityWalk] Could not load ${city.slug}:`, error);
      pickedBtn.removeAttribute('aria-busy');
      refs.cityButtons.forEach((b) => (b.disabled = false));
      refs.loadStatus.hidden = true;
      refs.loadStatus.textContent = '';
      refs.startError.textContent =
        'That city could not be loaded. Check your connection and try again.';
      refs.startError.hidden = false;
      return;
    }
    refs.loadStatus.hidden = true;
    refs.loadStatus.textContent = '';

    refs.startPanel.hidden = true;
    refs.viewport.hidden = false;
    refs.toolbar.hidden = false;
    refs.cameraPanel.el.hidden = false;
    refs.hud.hidden = false;

    const started = await startGame(city, model);
    pickedBtn.removeAttribute('aria-busy');
    if (!started) return;

    announceInLayer(
      `Walking in ${city.label}. ${model.stats.buildingCount} buildings around you. ` +
        'Press H for the controls, M for the map view, Escape to leave.'
    );
    refs.exitBtn.focus();
  }

  async function startGame(city, model) {
    const { viewport } = state.refs;
    const width = Math.max(1, viewport.clientWidth);
    const height = Math.max(1, viewport.clientHeight);

    let renderer;
    try {
      renderer = new WebGLRenderer({ antialias: false });
    } catch (error) {
      console.warn('[CityWalk] WebGL unavailable:', error?.message);
      showViewportFallback();
      return false;
    }
    renderer.setPixelRatio(1);
    renderer.setSize(width, height);
    viewport.appendChild(renderer.domElement);

    const scene = new Scene();
    scene.background = new Color(0x000000);

    const fpCamera = new PerspectiveCamera(60, width / height, 0.1, 3000);
    fpCamera.up.set(0, 0, 1);

    const orthoCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
    orthoCamera.up.set(0, 1, 0);

    // CW-85: the backing's own state, kept beside the cameras because that is
    // the scope its provider closes over. The lookup table is rebuilt only
    // when the mode or the phosphor moves - fifteen entries per converted
    // frame would be work for nothing - and the cell buffer is reused.
    let backingKey = '';
    let backingLut = null;
    let backingBuf = null;
    let sampledKey = '';
    let sampledLut = null;

    const city3d = buildCityGroup(model);
    scene.add(city3d.group);
    // Streets are visible in both views since CW-8: dim under the fog at
    // street level, brightened into the map's street network overhead
    // (city3d.setMapView swaps the tone on toggle).
    const lighting = attachCityLighting(scene, fpCamera);

    // Landmarks (CW-10, CW-78): the city's curated seven in table order
    // where a registry table exists, the scorer where none does. Beacons on
    // the map, a legend, proximity text.
    const landmarks = cityLandmarks(model, city.slug);
    // Bright beacon marking the player in the top-down map view, sized
    // relative to the city so it stays visible at map scale.
    const spanM = Math.max(
      model.boundsM.maxX - model.boundsM.minX,
      model.boundsM.maxY - model.boundsM.minY,
      100
    );

    // CW-62: the landmark marks need the city's span for the same reason the
    // player's marker does - a mark is a screen size, not a number of metres.
    const beacons = buildLandmarkBeacons(landmarks, spanM);
    beacons.group.visible = false;
    scene.add(beacons.group);
    buildLegend(landmarks);
    const markerSize = Math.max(14, spanM * 0.025);
    const markerGeom = new BoxGeometry(markerSize, markerSize, 120);
    // CW-40: never occluded. Once the marker scales with zoom (see
    // applyMapCamera) it can reach over a neighbouring building's
    // footprint, and a taller building would clip it exactly the way the
    // CW-36 ring was clipped at z=40. The marker is the one thing on the
    // map that must always win.
    const markerMat = new MeshBasicMaterial({
      color: 0xffffff,
      depthTest: false,
    });
    const marker = new Mesh(markerGeom, markerMat);
    marker.renderOrder = 999;
    marker.visible = false;
    scene.add(marker);

    // CW-40: a two-tone square-in-square, because a solid white block is
    // camouflage in colour mode - the CW-Q45 palettes fill the map with
    // white and grey buildings, and the six-teleport eyes-on tour could
    // not find the marker among them. The inner square is EXACT black,
    // which is the one value the converter reads as empty (CW-5), so the
    // marker renders as a bright frame around a hole - a footprint no
    // building has in any palette. A child of the marker, so the 1/zoom
    // scale applies to both and the frame stays ~a glyph thick.
    const markerInnerGeom = new BoxGeometry(
      markerSize * 0.5,
      markerSize * 0.5,
      1
    );
    const markerInnerMat = new MeshBasicMaterial({
      color: 0x000000,
      depthTest: false,
    });
    const markerInner = new Mesh(markerInnerGeom, markerInnerMat);
    markerInner.renderOrder = 1000;
    markerInner.position.z = 61;
    marker.add(markerInner);

    /**
     * ★★ CW-61: THE MAN IS REFUSED, AND THE REASON IS THE SHAPE OF A
     * CHARACTER CELL.
     *
     * The plan asked for the logo's accessibility figure to become the player
     * marker, with the pick spot as the logo's circle, reunited on travel. It
     * was built, photographed at five palettes and five zooms, and dropped.
     *
     * MEASURED at this head: the converter's cell is **4 px wide and 9 px
     * tall**, and the marker's black core is 35 px across at every zoom
     * inside the 2.2/zoom clamp (0.8 through 2), 22 px at the map's minimum
     * and 77 px at its maximum. In cells that is
     *
     *   zoom 0.4   5.6 wide x 2.4 tall
     *   zoom 0.8-2 8.8 wide x 3.9 tall
     *   zoom 8    19.2 wide x 8.6 tall
     *
     * A standing figure is head, arms, body and legs: five ROWS at the very
     * least. It gets 3.9 at every zoom a player spends time at. The mark is
     * not too small - it is too SHORT, because the cell is two and a quarter
     * times taller than it is wide, and a human figure needs its height most.
     *
     * Growing the marker to fit was the other way out and CW-40 already
     * refused it for a reason that still holds: a marker big enough to draw a
     * person in swallows a city block. And the first attempt at the figure
     * proved the cost of getting it wrong - arms 0.51 of the marker wide
     * against a core reaching 0.25 either side spilled onto the frame, and
     * the marker photographed as a solid white block, which is exactly the
     * camouflage the frame-around-a-hole exists to escape.
     *
     * So the player keeps the mark CW-40 photographed and chose. What ships
     * from the icon language is the CIRCLE below, which is a shape this grid
     * can carry.
     */

    /**
     * ★ CW-61: THE CIRCLE, which is where the dialog is asking about.
     *
     * The same laws as the marker - a bright ring around an exact-black core,
     * never occluded, one shared scale - so the two marks are the same family
     * and the eye reads them as one language. It shows only while the
     * question is open, and travelling retires it because the man is standing
     * there now.
     */
    const pickMat = new MeshBasicMaterial({
      color: 0xffffff,
      depthTest: false,
    });
    // ★ BIGGER THAN THE PLAYER'S MARK, ON PURPOSE. Both are bright outlines
    // around an empty middle, and at nine cells across the difference between
    // a ring and a square is not something this grid can carry (CW-60 found
    // the same thing about its wayfinding kinds, and CW-36's ring died of
    // it). What the grid CAN carry is size, so the circle is drawn wide
    // enough to read as a ring around a spot rather than as a second marker.
    const pickGeom = new RingGeometry(markerSize * 0.72, markerSize * 1.0, 28);
    const pickMark = new Mesh(pickGeom, pickMat);
    pickMark.position.z = 60;
    pickMark.renderOrder = 998;
    pickMark.visible = false;
    scene.add(pickMark);

    /**
     * ★★ AND THE HOLE, WITHOUT WHICH THE RING DOES NOT READ AT ALL.
     *
     * The ring shipped first as a bare outline and was photographed in five
     * palettes: clear in both monochromes, and INVISIBLE in colour, HC-dark
     * and HC-light. Those palettes fill the map with white and grey glyphs,
     * so a white ring is a white thing among white things - which is CW-40's
     * finding arriving a second time from a new direction.
     *
     * CW-40's law is not "a bright outline reads". It is "a bright outline
     * around EXACT BLACK reads", because exact black is the one value the
     * converter renders as an empty cell (CW-5), and an empty patch in the
     * middle of a mark is a footprint no building in any palette has. The
     * player's marker has had that hole since CW-40; the circle needed its
     * own.
     */
    const pickCoreGeom = new CircleGeometry(markerSize * 0.72, 28);
    const pickCoreMat = new MeshBasicMaterial({
      color: 0x000000,
      depthTest: false,
    });
    const pickCore = new Mesh(pickCoreGeom, pickCoreMat);
    pickCore.position.z = -1;
    pickCore.renderOrder = 997;
    pickMark.add(pickCore);

    // Order matters here. The collision grid is built from the buildings
    // first so the props can refuse to stand inside one; the props then hand
    // back their own footprints, which are stamped in BEFORE the spawn probe
    // runs — otherwise the player can start the game inside a parked car.
    const collision = buildCollisionGrid(model);
    // CW-50: what is underfoot, which is a different question from what is in
    // the way. Nothing here blocks anybody - the curb is navigable by
    // construction, because it never reaches the collision grid at all.
    const surface = buildSurfaceGrid(model);
    const props = buildStreetProps(model, collision);
    // CW-20: weather. The drops are scene geometry going through the same
    // pipeline as the city, so the converter turns them into streak
    // characters for free — no DOM rain, no converter changes.
    const rain = buildRain();
    scene.add(rain.group);
    // CW-64 (CW-Q59): the second mover, and the only other one. Built with the
    // city and idle until something starts it, so a city nobody celebrates in
    // costs 56 hidden meshes and nothing else.
    const fireworks = buildFireworks(spanM);
    scene.add(fireworks.group);
    scene.add(fireworks.mapGroup);
    // CW-65 (CW-Q60): the traveler stands OUTSIDE the city group, like the
    // fireworks and for the same reason - the city is built here, at load,
    // while the saved progress that says whether this city's traveler has been
    // found is not read until much further down. Finding them also MOVES them,
    // and rebuilding a city's props to move one person is absurd.
    const traveler = buildTraveler(city.slug, (x, y) => surface.heightAt(x, y));
    scene.add(traveler.group);
    scene.add(props.group);
    stampObstacles(collision, props.obstacles);

    // CW-78 (CW-Q71): a touchable waypoint mark at each landmark's street
    // face. Spots need the props' collision stamped (a mark must not stand
    // in a parked car) and must be stamped themselves BEFORE the spawn
    // probe, or the player could start the game inside a plinth.
    const waypointSpots = landmarks
      .map((lm) => findWaypointSpot(model, collision, surface, lm))
      .filter(Boolean);
    // CW-79: the marks stand on the same ground the walker's eye reads.
    const waypoints = buildWaypointMarks(waypointSpots, surface.terrain);
    scene.add(waypoints.group);
    stampObstacles(collision, waypoints.obstacles);

    // CW-78's spawn rule: a city with a registry spawns within 200 m of its
    // table's first row (Seattle: the Great Wheel), so the walk begins in
    // sight of the thing the legend leads with.
    const registry = registryFor(city.slug);
    const spawnAnchor = registry ? landmarks[0] : null;
    const spawn = findSpawn(
      model,
      collision,
      spawnAnchor
        ? {
            nearX: spawnAnchor.x,
            nearY: spawnAnchor.y,
            withinM: 200,
            // A facing spawn needs room to SEE the thing it faces: 60 m
            // keeps the Great Wheel a wheel instead of legs at the lens.
            minM: registry.spawnFacesFirstRow ? 60 : 0,
          }
        : undefined
    );
    // CW-44: face down the open street, never into whatever happens to
    // stand north - the bigger Seattle's spawn had a storefront 2.5 m that
    // way, and a first frame nose-to-wall walks the player straight into it.
    // CW-78: Seattle overrides that with the signed rule - it spawns FACING
    // the Great Wheel; the other cities keep the clear-heading facing.
    const walkState = createWalkState({
      ...spawn,
      headingRad:
        registry?.spawnFacesFirstRow && spawnAnchor
          ? Math.atan2(spawnAnchor.x - spawn.x, spawnAnchor.y - spawn.y)
          : findClearHeading(collision, spawn.x, spawn.y),
    });
    // CW-50: arriving is not walking, so the ground under a spawn is taken
    // whole rather than climbed up to.
    easeGroundZ(walkState, surface, 0);
    const mapCam = createMapCamera(model.boundsM);

    // CW-Q8: persisted walking-speed preference (comfort). CW-48 rebased the
    // scale, and speedLabelFromStored migrates anything the old one wrote.
    const speedLabel = speedLabelFromStored(
      safeGetItem(STORAGE_KEY_CITY_WALK_SPEED)
    );

    const game = {
      city,
      model,
      renderer,
      scene,
      fpCamera,
      orthoCamera,
      city3d,
      props,
      rain,
      fireworks,
      traveler,
      spawn,
      lighting,
      marker,
      markerGeom,
      markerMat,
      markerInnerGeom,
      markerInnerMat,
      // CW-61: the circle, disposed with the marker it belongs to rather
      // than left for the garbage collector to not collect.
      pickMark,
      pickGeom,
      pickMat,
      pickCoreGeom,
      pickCoreMat,
      collision,
      surface,
      walkState,
      mapCam,
      speedLabel,
      landmarks,
      // CW-78: the street-level waypoint marks and the touch hysteresis.
      waypoints,
      waypointSpots,
      touchedWaypoint: null,
      // CW-81: the look TARGET the camera follows critically damped. Every
      // look input - keys, hover, drag, the panel's standard views - writes
      // here; walkState carries the followed camera. lookMode is set from
      // storage a few lines down, once reduced motion is known.
      lookTarget: {
        headingRad: walkState.headingRad,
        pitchRad: walkState.pitchRad ?? 0,
      },
      // What the follow last wrote. If walkState differs from this at the
      // top of a frame, something else - a teleport, a standard view, an
      // instrument script - re-posed the walker directly, and the target
      // ADOPTS that pose instead of dragging the camera back to a stale one.
      lookSync: {
        headingRad: walkState.headingRad,
        pitchRad: walkState.pitchRad ?? 0,
      },
      lookMode: 'follow',
      hover: { nx: 0, ny: 0, over: false },
      autoWalk: false,
      walkRamp: 0,
      lastMove: { forward: 0, strafe: 0 },
      // CW-87: the running tour, or null - { name, route, at, holding }.
      tour: null,
      // CW-80: what the walker was last told about the street's tilt.
      slope: { cat: null, pct: null, sinceM: Infinity },
      // CW-27: named road segments, indexed once at city build.
      streetIndex: buildStreetIndex(model.roads),
      streetName: null,
      streetOn: false,
      beacons,
      landmarkIndex: -1,
      nearLandmark: null,
      mapView: false,
      altView: null,
      resizeObserver: null,
      lastFrameMs: 0,
      lastHudText: '',
    };
    state.game = game;

    const managerLike = {
      renderer,
      scene,
      container: viewport,
      camera: fpCamera,
      controls: null,
      getActiveCamera: () => (game.mapView ? orthoCamera : fpCamera),
      isAutoRotateEnabled: () => false,
    };
    // allowTinyCells: the game's range reaches a 2 px character cell, where a
    // glyph is almost all antialiasing. Without this the city dims as the
    // characters shrink (CW-12). The preview's Alt View does not opt in.
    // CW-23: a second, tiny render that says what each character cell is
    // looking at, so the converter can give pavement and a tower face their
    // own glyph voices instead of judging both on brightness alone.
    game.classPass = createClassPass(renderer, scene);

    game.altView = await initAltView(managerLike, {
      allowTinyCells: true,
      // CW-21: the phosphor trail rides the fast paint path rather than
      // dropping the frame back onto per-cell blits for it.
      glowInComposite: true,
      // CW-32: the per-cell sampling and glyph choice run on the GPU where
      // the machine allows it. Any failure disables it for the session and
      // the CPU path carries on.
      gpuSample: true,
      // The provider is asked once per conversion, not per rAF: the class
      // pass only has to run on the frames the converter actually converts.
      classMapProvider: (cols, rows) => {
        const map =
          game.classPass?.read(
            game.mapView ? orthoCamera : fpCamera,
            cols,
            rows
          ) ?? null;
        // CW-85: remembered so the backing can reuse this frame's read rather
        // than rendering the class pass a second time. On the GPU glyph path
        // this provider is never called at all and the backing reads for
        // itself, which is the cost Day carries on that path.
        game.lastClassMap = map;
        return map;
      },
      // CW-86: the glyph field, read off the SAME class frame the line above
      // just produced. The converter calls this immediately after
      // classMapProvider within one conversion, so lastField() is that frame's
      // G channel and not the previous one's - which is the whole reason the
      // pass exposes it as an accessor rather than returning it.
      glyphFieldProvider: () => game.classPass?.lastField() ?? null,
      // The same class frame, handed over as a TEXTURE rather than read back
      // to the CPU — on the GPU path the shader samples it directly, so the
      // class pass's own readback disappears too.
      gpuClassTextureProvider: (cols, rows) =>
        game.classPass?.texture(
          game.mapView ? orthoCamera : fpCamera,
          cols,
          rows
        ) ?? null,
      glyphVocabularies: GLYPH_VOCABULARIES,
      // CW-85 (CW-Q83): the backing. Asked at PAINT time, after every glyph
      // is already chosen, which is what makes "Day changes no glyph" a fact
      // about the order of the code rather than a promise.
      backingProvider: (cols, rows, ctx) => {
        const { usePalette } = ctx;
        if (!daylightIsOn()) return null;
        // Street only. The map is an overhead plan with its fog nulled, so
        // there is no distance for the tint to fade over and nothing it would
        // say that the map's own colours do not already say better.
        if (game.mapView) return null;
        const pass = game.classPass;
        if (!pass) return null;

        const light = root.getAttribute('data-theme') === 'light';
        const palette = light ? 'amber' : 'green';
        const mono = !usePalette;
        const phosphor = monoPhosphor();
        const key = `${palette}|${mono}|${phosphor}`;
        if (backingKey !== key) {
          backingKey = key;
          backingLut = backingTable({ mono, palette, phosphor });
        }

        let classMap = game.lastClassMap;
        if (!classMap || classMap.length !== cols * rows) {
          classMap = pass.read(fpCamera, cols, rows);
        }
        // One conversion, one read: dropping it here means the next frame
        // fetches its own rather than tinting this frame's classes onto the
        // next frame's picture.
        game.lastClassMap = null;
        const depthMap = pass.lastDepth();
        if (!classMap || !depthMap || depthMap.length !== classMap.length) {
          return null;
        }
        // CW-85's experiment, DEV-only and off unless a measurement turns it
        // on: tint from the cell's own colour instead of from its class. It
        // never reaches a player - the switch is not wired to a control and
        // production strips import.meta.env.DEV - and it exists so the two
        // sources could be photographed against ONE scene in one run rather
        // than argued about.
        let sampled = null;
        if (
          import.meta.env.DEV &&
          window.__cityWalkBackingSource === 'sampled' &&
          ctx.palette
        ) {
          const skey = `${ctx.palette.join(',')}`;
          if (sampledKey !== skey) {
            sampledKey = skey;
            sampledLut = sampledTable(ctx.palette, SAMPLED_BACKING_DRIVE);
          }
          sampled = sampledLut;
        }
        backingBuf = buildBacking({
          classMap,
          depthMap,
          table: backingLut,
          sampled,
          colorIndices: sampled ? ctx.colorIndices : null,
          out: backingBuf,
        });
        return backingBuf;
      },
    });

    // Character size (CW-Q10, amended CW-Q39): the game's own saved value
    // wins (the manual choice - it sticks, even below today's floor), then
    // the machine's last calibrated default, then the shared Alt View
    // preference clamped into the game's range, then 50%. The game persists
    // to its OWN key and never writes the shared pref back, because the
    // game's range reaches far below the preview slider's floor.
    const savedManualScale = safeGetItem(STORAGE_KEY_CITY_WALK_FONT_SCALE);
    const storedCalibration = decodeCalibration(
      safeGetItem(STORAGE_KEY_CITY_WALK_CALIBRATED_FLOOR)
    );
    // CW-72 (CW-Q75): ONE default size for everyone. What a machine can
    // measure about itself is a FLOOR - it may make the picture coarser, never
    // finer, and never a different game from anybody else's. A stored CW-42
    // landing below the default is migrated up by decodeCalibration.
    game.calibratedFloor = storedCalibration?.floorScale ?? null;
    game.calibrationPending = storedCalibration?.pending ?? 0;
    game.altView.setFontScale(
      seedCharScale(savedManualScale, game.calibratedFloor)
    );
    syncCellRaster(game);

    // CW-42 (CW-Q39): every entry re-measures this machine - a busy
    // yesterday must not brand it forever. The pass is stepped from frame();
    // a stored manual choice is measured where it stands but never applied
    // over.
    startCalibration(game, Number.isFinite(parseFloat(savedManualScale ?? '')));

    // CW-21: with colour off the city used to be one flat green or amber —
    // pavement, walls and lit windows all at the same drive. A monochrome
    // tube's intensity bit separates them, and the converter ignores this
    // whenever a palette is active, so it costs colour mode nothing.
    game.altView.setIntensityLevels(MONO_INTENSITY_LEVELS);
    game.altView.setReverseVideo(MONO_REVERSE_THRESHOLD);

    // CW-68: the game walks, so its converter gets a memory of the previous
    // frame. Opt-in per instance and OFF everywhere else, including the main
    // app's Alt View, which converts a still.
    game.altView.setTemporalHysteresis?.(CITY_TEMPORAL_HYSTERESIS);

    /**
     * CW-70 (CW-Q67): which treatment of the SOLID BRIGHT LAYER this session
     * draws - `stock`, `calm` or `off`. Two halves move together: the
     * converter's reverse-video threshold and its share cap, and the scene's
     * shopfront band brightness. Both are per instance; the main app's Alt
     * View is not touched by either.
     *
     * `stock` until the owner has seen all three side by side. The switch
     * exists so they can be compared in ONE session against ONE scene, which
     * is the only comparison this machine supports.
     *
     * @param {'stock'|'calm'|'off'} mode
     * @returns {string} the treatment now in force
     */
    game.setLuminanceLayer = (mode) => {
      const name = Object.prototype.hasOwnProperty.call(LUMINANCE_LAYER, mode)
        ? mode
        : LUMINANCE_LAYER_DEFAULT;
      const spec = LUMINANCE_LAYER[name];
      game.altView.setReverseVideo(spec.reverseAt);
      game.altView.setReverseShareCap?.(spec.reverseShareCap, {
        maxLift: spec.reverseLiftMax,
      });
      game.city3d?.setStorefrontBrightness?.(spec.storefrontScale);
      game.luminanceLayer = name;
      game.altView.invalidate();
      return name;
    };
    game.getLuminanceLayer = () => game.luminanceLayer;
    game.setLuminanceLayer(LUMINANCE_LAYER_DEFAULT);

    /**
     * CW-86: anchored glyphs on or off - BOTH halves, in one call.
     *
     * They are two switches in two modules and they have to move together:
     * the class pass must render the field into its G channel, and the
     * converter must be willing to read it. Either alone does nothing at all -
     * a field nobody samples, or a sampler with no field - and "nothing at
     * all" is the worst possible way for a prototype to fail, because it looks
     * exactly like a change that did not help.
     *
     * Prototype-first (plan §10.3): this is OFF at start, and only the
     * instrument and the release's own e2e case turn it on until the
     * three-column table says whether it earns its place.
     *
     * @param {boolean} on
     * @returns {boolean} what is now in force
     */
    game.setAnchoredGlyphs = (on) => {
      const next = on === true;
      game.classPass?.setGlyphField?.(next);
      game.altView.setAnchoredGlyphs?.(next);
      game.anchoredGlyphs = next;
      game.altView.invalidate();
      return next;
    };
    game.getAnchoredGlyphs = () => Boolean(game.anchoredGlyphs);
    /** CW-86 P2: the field lattice, for the sweep that chooses it. */
    game.setFieldMaxSize = (n) => {
      const size = game.classPass?.setFieldMaxSize?.(n) ?? null;
      game.altView.invalidate();
      return size;
    };
    game.getFieldMaxSize = () => game.classPass?.fieldMaxSize?.() ?? null;
    /** CW-86 P2: restrict the field to these classes, or null for all. */
    game.setFieldClasses = (ids) => {
      game.classPass?.setFieldClasses?.(ids);
      game.altView.invalidate();
    };
    // ★★★ CW-91: ON, and it is the game's default now (CW-Q90). CW-86 built
    // this and shipped it off for one reason - the anchored pick forced the CPU
    // converter and halved the frame rate - and that reason is gone: the glyph
    // shader reads the field byte out of the class texture's green channel and
    // indexes the ladder itself. The owner picked the facade at lattice 64
    // knowing it does not steady a wall, because at 64 the windows read.
    game.setAnchoredGlyphs(true);

    // CW-71: colour mode's own bright layer. Per instance; the main app's Alt
    // View is not given one. The thresholds are the owner's (CW-Q79).
    game.altView.setPaletteInkBudget?.(CITY_PALETTE_INK_BUDGET);

    // CW-Q2/CW-Q5/CW-Q6: multicolor exists ONLY under high contrast —
    // neon in amber (light), the ANSI bright set in green (dark). The
    // observer follows live theme/contrast flips (e.g. a system
    // prefers-color-scheme change mid-game).
    applyHcPalette(game);
    // CW-85 (CW-Q86): a stored empty city has to take effect at OPEN, not
    // only when the key is next pressed - and it moves the collision grid, so
    // it runs before the first frame rather than after the player has walked
    // into somebody who is not there.
    applyEmptyCity(game);
    game.themeObserver = new MutationObserver(() => {
      applyHcPalette(game);
      game.altView.rebuildGlyphs?.();
      game.altView.invalidate();
    });
    game.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-high-contrast', 'data-theme'],
    });

    game.altView.enable();

    // CW-Q36: bloom, on the owner's call after seeing it at their own
    // character size. It is baked into the glyph atlas rather than applied per
    // frame, so it costs nothing to keep on; enable() does not touch it, but
    // it sits here with the trail because both are the CRT look and both have
    // to follow enable() rather than precede it.
    game.altView.setCrtEffects({ bloomPx: MONO_BLOOM_PX });

    // CW-21: the phosphor trail. enable() resets the fade to the shared
    // default, so this has to follow it rather than sit with the other
    // display settings above.
    //
    // A trail is motion by definition, so it follows prefers-reduced-motion
    // and keeps following it LIVE — setPersistFade already refuses to set a
    // fade while reduced motion is on, and the listener below covers someone
    // turning the preference on mid-walk.
    game.applyGlow = () => {
      game.altView.setPersistFade(MONO_GLOW_FADE);
      game.altView.invalidate();
    };
    game.startedAtMs = performance.now();
    /**
     * CW-20 kept this per session and said so: "a fresh city is a fresh walk,
     * and nothing is stored". CW-62 (CW-Q56) reverses that. Eleven of twelve
     * landmarks found, the game closed, and twelve unfound on return is a
     * poor reward - and this store is the ground CW-64's fireworks and
     * CW-65's traveler are both meant to stand on.
     */
    const saved = readCityProgress(game.city.slug);
    game.visited = saved.visited;
    game.progressRaw = saved.raw;
    // ★ A COMPLETED CITY RE-ENTERED DOES NOT RE-ANNOUNCE. The all-found line
    // is a reward, and a reward that fires every time you walk back in stops
    // being one. CW-64's trigger wants the TRANSITION, so this seam stays
    // clean: the flag is seeded from the store, not recomputed from counts.
    game.announcedAllFound = saved.allFound;
    // CW-64: an unlocked city keeps its button. Read from the same object
    // CW-62 writes, so an older build's progress opens without losing it.
    game.fireworksUnlocked = saved.raw?.fireworksUnlocked === true;
    // CW-65: the traveler's spot and found-state ride in the SAME object
    // CW-62 writes, so an older build opens this city without losing either.
    // This must come after progressRaw is seeded and after the props exist.
    placeTraveler(game);
    // CW-62: start the marks from whatever the set says, so there is one
    // place the map's state comes from rather than two that can drift.
    game.beacons.setVisited(game.visited);
    game.rainLevel = null;
    game.thunderStartMs = 0;
    game.nextThunderMs = THUNDER_GAP_MS;
    game.motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    game.motionReduced = Boolean(game.motionQuery?.matches);
    // CW-81 (CW-Q72): the mouse-look preference. A stored choice always
    // wins; with nothing stored, reduced motion keeps hover-look OFF by
    // default (it is continuous camera motion) while leaving every mode
    // selectable.
    {
      const stored = safeGetItem(STORAGE_KEY_CITY_WALK_LOOK);
      game.lookMode = LOOK_MODES.includes(stored)
        ? stored
        : game.motionReduced
          ? 'off'
          : 'follow';
    }
    game.onMotionChange = (event) => {
      game.motionReduced = event.matches;
      game.altView.setReducedMotion(event.matches);
      // Reduced motion stops the weather frames, so a swell caught halfway
      // through would be frozen at its brightest (D-75).
      if (event.matches) clearThunder(game);
      // Rain is motion, and G already refuses to start it while reduced
      // motion is on. Rain that was ALREADY falling used to be left where it
      // stood: the drops stopped in mid-air as static diagonal streaks — the
      // scratches-on-the-picture look CW-20 removed from the map view — and
      // the Rain button stayed in a toolbar that no longer did anything
      // (D-76). Asking for less movement now ends the shower, and says so.
      if (event.matches && game.rainLevel !== null) {
        applyRainLevel(game, null);
        syncToolbarView();
        // ACCESSIBILITY-CRITICAL STRING (D-35) — flagged for owner review.
        // Reused verbatim from the key that refuses to start rain, because
        // it is the same fact arriving from the other direction.
        announceInLayer(RAIN_BLOCKED_MESSAGE);
      }
      game.applyGlow();
      // A freeze must be visible immediately, not at the next state change.
      game.altView.invalidate();
    };
    game.motionQuery?.addEventListener?.('change', game.onMotionChange);
    game.applyGlow();

    if (import.meta.env.DEV) {
      // Dev-lane debug handle (mirrors hfm-controller's DEV-only logging).
      window.__cityWalkGame = game;
      /**
       * CW-62: reaching a landmark, through the real path.
       *
       * A landmark is marked when a MOVING frame finds a new nearest one, and
       * an e2e cannot walk a player to twelve of them in a reasonable time.
       * This calls the same `markVisited` the walk calls - the legend, the
       * HUD, the map marks, the announcement and the store write all happen
       * exactly as they would - rather than letting a test poke
       * `game.visited` and prove nothing about any of them.
       *
       * DEV-only, beside the handle above, so it never ships.
       */
      window.__cwMark = (name) => markVisited(game, name);
    }

    applyFirstPersonCamera();
    applyMapCamera();
    updateHud();
    syncToolbarView();
    // CW-64: a city finished in an earlier session opens with its button.
    syncFireworksButton();

    game.resizeObserver = new ResizeObserver(() => handleViewportResize());
    game.resizeObserver.observe(viewport);

    viewport.addEventListener('pointerdown', handleViewportPointerDown);
    viewport.addEventListener('pointermove', handleViewportPointerMove);
    viewport.addEventListener('pointerup', handleViewportPointerUp);
    viewport.addEventListener('pointercancel', handleViewportPointerUp);
    // CW-81: hover-look pauses the moment the cursor leaves the viewport or
    // the window loses focus - a view that keeps turning while you answer a
    // chat message is motion nobody asked for.
    viewport.addEventListener('pointerleave', handleViewportPointerLeave);
    window.addEventListener('blur', handleViewportPointerLeave);

    // Mouse wheel zooms the map view (keyboard stays primary: -/= do the
    // same). preventDefault keeps the page from scrolling behind the layer.
    viewport.addEventListener(
      'wheel',
      (event) => {
        const g = state.game;
        if (!g || !g.mapView) return;
        event.preventDefault();
        const factor = Math.pow(1.0015, -event.deltaY);
        g.mapCam.zoom = Math.min(8, Math.max(0.4, g.mapCam.zoom * factor));
        applyMapCamera();
        g.altView.invalidate();
        updateHud();
      },
      { passive: false }
    );

    game.lastFrameMs = performance.now();
    state.rafId = requestAnimationFrame(frame);
    return true;
  }

  function showViewportFallback() {
    const { viewport, toolbar, startPanel, hud } = state.refs;
    viewport.hidden = true;
    toolbar.hidden = true;
    hud.hidden = true;
    startPanel.hidden = false;
    state.refs.cityButtons.forEach((b) => (b.disabled = true));
    state.refs.startError.textContent =
      '3D rendering is not available in this browser, so the city cannot ' +
      'be drawn. Press Escape to leave the game.';
    state.refs.startError.hidden = false;
  }

  /**
   * Colour gate (CW-Q2, amended by CW-Q16): the palette applies when the
   * game's Colour toggle is on, and the scheme picks the set (light = amber
   * -> neon, dark = green -> ANSI bright). Otherwise the classic single
   * phosphor.
   */
  function applyHcPalette(game) {
    const root = document.documentElement;
    if (!colourIsOn()) {
      game.altView.setPalette(null);
      // CW-92: mono has one phosphor, so there is no family to choose. Cleared
      // rather than left standing, or a return to colour would arrive with the
      // other theme's table already in force.
      game.altView.setInkFamilies?.(null);
      return;
    }
    const light = root.getAttribute('data-theme') === 'light';
    // chromaBoost exaggerates the scene's deliberately mild tints (kept low
    // so monochrome stays luminance-true) into decisive palette picks.
    // CW-Q11 raised it from 3.5: measured on a Seattle canyon, that cut the
    // share of the frame with no colour at all from 47.3% to 37.9%, and it
    // is the point at which every TINTED surface lands on a coloured entry.
    // Genuinely grey ones still land on white - dividing by the brightest
    // channel leaves a grey unchanged, whatever the boost.
    game.altView.setPalette(light ? HC_PALETTE_AMBER : HC_PALETTE_GREEN, {
      chromaBoost: 5,
    });
    // ★★★ CW-92 (D-127, CW-Q96): and each surface's colour comes from the
    // authored table, not from a nearest-palette match on the lit screen. The
    // two palettes get their own rows because they are different sets - amber
    // has seven entries, green six - and a class must name an entry that
    // exists. The boost above still governs the sky and anything the class
    // pass could not name, which keep the screen pick.
    game.altView.setInkFamilies?.(
      light ? CITY_INK_FAMILY.amber : CITY_INK_FAMILY.green
    );
  }

  function unloadCity() {
    if (state.rafId !== null) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
    const game = state.game;
    if (!game) return;

    game.themeObserver?.disconnect();
    game.resizeObserver?.disconnect();
    if (game.motionQuery && game.onMotionChange) {
      game.motionQuery.removeEventListener?.('change', game.onMotionChange);
    }
    window.clearTimeout(game.fireworksStillTimer);
    game.rain?.dispose();
    game.fireworks?.dispose();
    game.classPass?.dispose();
    game.altView?.dispose();
    game.lighting?.detach();
    game.beacons?.dispose();
    game.city3d?.dispose();
    game.props?.dispose();
    game.waypoints?.dispose();
    game.markerGeom?.dispose();
    game.markerMat?.dispose();
    game.markerInnerGeom?.dispose();
    game.markerInnerMat?.dispose();
    game.pickGeom?.dispose();
    game.pickMat?.dispose();
    game.pickCoreGeom?.dispose();
    game.pickCoreMat?.dispose();
    game.renderer?.dispose();
    game.renderer?.domElement?.remove();
    state.game = null;
  }

  // -------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------

  const KEY_ACTIONS = new Map([
    ['ArrowUp', 'forward'],
    ['KeyW', 'forward'],
    ['ArrowDown', 'back'],
    ['KeyS', 'back'],
    ['KeyA', 'strafeLeft'],
    ['KeyD', 'strafeRight'],
    ['ArrowLeft', 'turnLeft'],
    ['KeyQ', 'turnLeft'],
    ['ArrowRight', 'turnRight'],
    ['KeyE', 'turnRight'],
    ['KeyR', 'lookUp'],
    ['KeyF', 'lookDown'],
  ]);

  function handleGameKeyDown(event) {
    // Shift is the fast modifier; never preventDefault it (Shift+Tab must
    // keep working for the focus trap).
    if (event.key === 'Shift') {
      state.shiftHeld = true;
      return;
    }
    // Never swallow keys typed into form fields (none exist today; guard for
    // future panels) or modified combos like Ctrl+key browser shortcuts.
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.code === 'KeyH') {
      event.preventDefault();
      event.stopPropagation();
      toggleHelp(!state.helpOpen);
      return;
    }

    // CW-Q15: the header's two accessibility toggles get keys as well.
    // Both run through the handlers their buttons call, so there is one
    // announcement and one place the labels are kept in sync. They work on
    // the city picker too, which is why they sit above the game guard.
    if (event.code === 'KeyC') {
      event.preventDefault();
      event.stopPropagation();
      flipHighContrast();
      return;
    }

    if (event.code === 'KeyT') {
      event.preventDefault();
      event.stopPropagation();
      cycleAppTheme();
      return;
    }

    // CW-Q16: colour on or off. C is spoken for by high contrast, so the
    // key is O. Like the two above it, it works on the picker as well.
    if (event.code === 'KeyP') {
      event.preventDefault();
      event.stopPropagation();
      savePhoto();
      return;
    }

    if (event.code === 'KeyG') {
      event.preventDefault();
      event.stopPropagation();
      cycleRain();
      return;
    }

    if (event.code === 'KeyO') {
      event.preventDefault();
      event.stopPropagation();
      flipColour();
      return;
    }

    // CW-85 (CW-Q83): Day and Night. B was free - the letters in use across
    // this file are A C D E F G H J K L M O P Q R S T V W X Y, so B, I, N, U
    // and Z were the free set, N is spoken for by auto-walk (CW-Q80), and
    // this release spends B and U. I and Z are what is left.
    if (event.code === 'KeyB') {
      event.preventDefault();
      event.stopPropagation();
      flipDaylight();
      return;
    }

    // CW-85 (CW-Q86): the city with nobody in it.
    if (event.code === 'KeyU') {
      event.preventDefault();
      event.stopPropagation();
      flipEmptyCity();
      return;
    }

    // CW-64: replay the show. Only once the city has been finished, so the
    // key cannot conjure a reward nobody earned.
    //
    // ★ This comment used to carry a letter census that was wrong when it was
    // written - it listed U as taken and Y as free, and Y is the letter this
    // very block spends. Re-measured at CW-85 by grepping `'Key[A-Z]'` across
    // src/ (walk-controls.js binds no keys at all): in use are A B C D E F G
    // H J K L M O P Q R S T U V W X Y, leaving **I, N and Z**, of which N is
    // spoken for by auto-walk (CW-Q80). A census in prose goes stale the next
    // time anybody spends a letter; run the grep.
    if (event.code === 'KeyY') {
      event.preventDefault();
      event.stopPropagation();
      if (state.game?.fireworksUnlocked) playFireworks({ replay: true });
      return;
    }

    if (!state.game) return;

    if (event.code === 'KeyM') {
      event.preventDefault();
      event.stopPropagation();
      toggleMapView();
      return;
    }

    if (event.code === 'KeyV') {
      event.preventDefault();
      event.stopPropagation();
      levelTheView();
      return;
    }

    if (event.code === 'KeyL') {
      event.preventDefault();
      event.stopPropagation();
      cycleLandmark(event.shiftKey ? -1 : 1);
      return;
    }

    if (event.code === 'KeyX') {
      event.preventDefault();
      event.stopPropagation();
      sayWhereYouAre();
      return;
    }

    // CW-81 (CW-Q80): N toggles auto-walk - "navigate", answered at G2.
    // CW-87: while a tour is driving, N is a walk-mode input like the walk
    // keys - it stops the tour and does nothing else that press, so one
    // press can never both end a tour and start a walker.
    if (event.code === 'KeyN') {
      event.preventDefault();
      event.stopPropagation();
      if (state.game.tour) {
        stopTour(TOUR_STOPPED_MESSAGE);
        return;
      }
      toggleAutoWalk();
      return;
    }

    // CW-87 (CW-Q84): I walks you to the selected landmark, turn by turn -
    // "I" as in "take me there", the free set's own letter. Works from the
    // map (where landmarks are chosen) by closing it; pressed again, stops.
    if (event.code === 'KeyI') {
      event.preventDefault();
      event.stopPropagation();
      startTour();
      return;
    }

    // CW-36 chose J (the only free letter that says anything about jumping);
    // CW-40 keeps it as the one-step keyboard commit at the map's crosshair.
    if (event.code === 'KeyJ') {
      event.preventDefault();
      event.stopPropagation();
      teleportAtCrosshair();
      return;
    }

    if (
      event.code === 'Minus' ||
      event.code === 'NumpadSubtract' ||
      event.code === 'Equal' ||
      event.code === 'NumpadAdd'
    ) {
      event.preventDefault();
      event.stopPropagation();
      // CW-Q41: one key, one meaning. The owner pressed Minus over the map
      // to shrink the characters and got a zoomed-out map instead; the
      // overload lost. Size lives here in BOTH views, and map zoom moved
      // to PageUp/PageDown below.
      const minus = event.code === 'Minus' || event.code === 'NumpadSubtract';
      adjustCharacterSize(minus ? -CHAR_SCALE_STEP : CHAR_SCALE_STEP);
      return;
    }

    if (
      state.game.mapView &&
      (event.code === 'PageUp' || event.code === 'PageDown')
    ) {
      event.preventDefault();
      event.stopPropagation();
      // HELD zoom keys, exactly as -/= used to be over the map (see frame()).
      holdAction(state.keyHeld, event.code === 'PageUp' ? 'zoomIn' : 'zoomOut');
      return;
    }

    if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      event.preventDefault();
      event.stopPropagation();
      adjustWalkSpeed(
        event.code === 'BracketLeft' ? -SPEED_LABEL_STEP : SPEED_LABEL_STEP
      );
      return;
    }

    // CW-60 (CW-Q57): K steps forward through the map styles and Shift+K
    // steps back, the same pair L and Shift+L already spend on landmarks.
    // K was free at this head - the letters still unspoken are B I K N U Y Z,
    // re-derived here rather than taken from the plan.
    if (state.game.mapView && event.code === 'KeyK') {
      event.preventDefault();
      event.stopPropagation();
      stepMapStyle(event.shiftKey ? -1 : 1);
      return;
    }

    if (
      state.game.mapView &&
      (event.code === 'Home' ||
        event.code === 'Digit0' ||
        event.code === 'Numpad0')
    ) {
      event.preventDefault();
      event.stopPropagation();
      recenterMap();
      return;
    }

    // CW-81 arrow-look: while auto-walk carries the walking, the vertical
    // arrows look instead of driving - WASD still walks (and stops the
    // auto-walk, in the frame loop). The horizontal arrows already turn.
    if (
      (state.game.autoWalk || state.game.tour) &&
      !state.game.mapView &&
      (event.code === 'ArrowUp' || event.code === 'ArrowDown')
    ) {
      event.preventDefault();
      event.stopPropagation();
      holdAction(
        state.keyHeld,
        event.code === 'ArrowUp' ? 'lookUp' : 'lookDown'
      );
      return;
    }

    const action = KEY_ACTIONS.get(event.code);
    if (action) {
      event.preventDefault();
      event.stopPropagation();
      // CW-81: any WALK key takes the wheel back from auto-walk - HERE, on
      // the keydown, because a tapped key can land its down and its up
      // between two frames and the frame loop would never see it held.
      const isWalkKey =
        action === 'forward' ||
        action === 'back' ||
        action === 'strafeLeft' ||
        action === 'strafeRight';
      if (state.game?.autoWalk && isWalkKey) {
        setAutoWalk(false, AUTO_WALK_OFF_MESSAGE);
      }
      // CW-87: the same tap law for the tour.
      if (state.game?.tour && isWalkKey) {
        stopTour(TOUR_STOPPED_MESSAGE);
      }
      holdAction(state.keyHeld, action);
    }
  }

  function handleGameKeyUp(event) {
    if (event.key === 'Shift') {
      state.shiftHeld = false;
      return;
    }
    if (event.code === 'PageDown') {
      releaseAction(state.keyHeld, 'zoomOut');
    }
    if (event.code === 'PageUp') {
      releaseAction(state.keyHeld, 'zoomIn');
    }
    // CW-81: a vertical arrow may have been held as LOOK (auto-walk's
    // remap) and auto-walk may have ended in between - release both of the
    // actions the key could be holding; releasing an unheld one is a no-op.
    if (event.code === 'ArrowUp') releaseAction(state.keyHeld, 'lookUp');
    if (event.code === 'ArrowDown') releaseAction(state.keyHeld, 'lookDown');
    const action = KEY_ACTIONS.get(event.code);
    if (action) releaseAction(state.keyHeld, action);
  }

  function clearHeldKeys() {
    for (const timer of state.holdTimers.values()) clearTimeout(timer);
    state.holdTimers.clear();
    state.holdStarts.clear();
    state.keyHeld.clear();
    state.btnHeld.clear();
    state.keys.clear();
    state.shiftHeld = false;
    endDrag();
  }

  /**
   * state.keys is the union of what the keyboard and the toolbar are
   * holding: an action stays alive while EITHER source still wants it, so a
   * click on Forward can never cancel an Arrow Up that is still down.
   */
  function holdAction(held, action) {
    held.add(action);
    state.keys.add(action);
  }

  function releaseAction(held, action) {
    held.delete(action);
    if (!state.keyHeld.has(action) && !state.btnHeld.has(action)) {
      state.keys.delete(action);
    }
  }

  /** Drop an action whatever is holding it — a hidden button, a view swap. */
  function forceReleaseAction(action) {
    const timer = state.holdTimers.get(action);
    if (timer) clearTimeout(timer);
    state.holdTimers.delete(action);
    state.holdStarts.delete(action);
    state.keyHeld.delete(action);
    state.btnHeld.delete(action);
    state.keys.delete(action);
  }

  function pressToolbarAction(action) {
    const timer = state.holdTimers.get(action);
    if (timer) clearTimeout(timer);
    state.holdTimers.delete(action);
    state.holdStarts.set(action, performance.now());
    holdAction(state.btnHeld, action);
  }

  /**
   * A press shorter than TOOLBAR_STEP_MS is stretched to it, so a click
   * moves the player as far as a tap of the key would; a longer hold ends
   * the moment the pointer lifts.
   */
  function releaseToolbarAction(action) {
    if (!state.btnHeld.has(action)) return;
    if (state.holdTimers.has(action)) return;
    const startedAt = state.holdStarts.get(action) ?? 0;
    const remainingMs = Math.max(
      0,
      TOOLBAR_STEP_MS - (performance.now() - startedAt)
    );
    if (remainingMs === 0) {
      finishToolbarAction(action);
      return;
    }
    state.holdTimers.set(
      action,
      setTimeout(() => finishToolbarAction(action), remainingMs)
    );
  }

  function finishToolbarAction(action) {
    state.holdTimers.delete(action);
    state.holdStarts.delete(action);
    releaseAction(state.btnHeld, action);
  }

  /**
   * Shift is momentary and this is sticky, so the two are OR-ed rather than
   * synced: a mouse-only player has no way to hold a key down while
   * clicking. The pressed button is the indicator that it is on.
   */
  function toggleFastWalk() {
    state.fastWalk = !state.fastWalk;
    syncToolbarView();
    announceInLayer(state.fastWalk ? 'Fast walking on.' : 'Fast walking off.');
  }

  /**
   * CW-60 (CW-Q57): step through the four map styles.
   *
   * A style is a MAP state, so this does nothing in the street - the same
   * shape as Home and the zoom keys, which are also map-only and also say
   * nothing when there is no map to act on. The choice is stored either way,
   * so the pad, the key and the button all leave the same trace.
   *
   * @param {number} delta +1 forward through the list, -1 back
   */
  function stepMapStyle(delta) {
    const game = state.game;
    if (!game?.mapView) return;
    state.mapStyle = cycleMapStyle(state.mapStyle, delta);
    safeSetItem(STORAGE_KEY_CITY_WALK_MAP_STYLE, state.mapStyle);
    game.city3d.setMapStyle(state.mapStyle);
    game.city3d.setMapZoom(game.mapCam.zoom);
    game.altView.invalidate();
    updateHud();
    announceInLayer(mapStyleAnnouncement(state.mapStyle));
  }

  /** Home, and the map view's Center on you button. */
  function recenterMap() {
    const game = state.game;
    if (!game || !game.mapView) return;
    recenterMapCamera(game.mapCam, game.walkState.x, game.walkState.y);
    applyMapCamera();
    game.altView.invalidate();
    updateHud();
    announceInLayer('Map centered on you.');
  }

  /**
   * Turn the walker to a compass bearing (CW-35).
   *
   * Instant, not a slow turn: the panel's Front/Back/Left/Right are the
   * game's answer to the preview's standard views, and a standard view
   * arrives rather than being steered to. The announcement is what tells a
   * screen-reader user it happened, since the picture cannot.
   */
  function faceHeading(headingRad) {
    const game = state.game;
    if (!game || game.mapView) return;
    game.walkState.headingRad = normalizeHeading(headingRad);
    applyFirstPersonCamera();
    game.altView.invalidate();
    updateHud();
  }

  /** Tilt the gaze to a fixed pitch — the panel's Diagonal view (CW-35). */
  function setGazePitch(pitchRad) {
    const game = state.game;
    if (!game || game.mapView) return;
    game.walkState.pitchRad = clampPitch(pitchRad);
    applyFirstPersonCamera();
    game.altView.invalidate();
    updateHud();
  }

  /**
   * V works in both views on purpose. The map suspends the street camera
   * rather than replacing it, so a gaze left tilted while the map is open
   * would still be tilted on the way back; one key that always means "undo
   * my looking" cannot strand it. The announcement is unconditional - a key
   * that answers with silence reads as broken.
   */
  function levelTheView() {
    const game = state.game;
    if (!game) return;
    if (levelView(game.walkState)) {
      applyFirstPersonCamera();
      game.altView.invalidate();
      updateHud();
    }
    announceInLayer('View level.');
  }

  // -------------------------------------------------------------------
  // Drag-look (CW-13): pointer travel rotates the gaze. No pointer lock -
  // it hides the cursor and hijacks Escape, and every look action already
  // has a key. Street view only; the map has its own wheel zoom.
  // -------------------------------------------------------------------

  function handleViewportPointerDown(event) {
    const game = state.game;
    if (!game) return;
    if (event.button !== 0) return;

    // CW-35: the Camera panel floats INSIDE the viewport, so its buttons'
    // pointer events bubble to this handler. The preventDefault below would
    // then stop the browser generating their click and moving focus to them
    // - the panel looked right and did nothing at all, and Reset announced
    // nothing when pressed. The panel's own controls are real buttons: they
    // are focusable, so the reason for refusing the default does not apply
    // to them.
    if (event.target?.closest?.('#cityWalkCameraPanel')) return;

    // D-59, pre-existing since CW-4 and measured on this release's base: the
    // viewport is not focusable, so the browser's default press moves focus
    // to <body> - outside the layer the game's key listener is bound to. One
    // click on the city, in either view, and every key stopped working for
    // the rest of the session. Refusing the default keeps focus where the
    // trap put it, which is why this runs before the map-view return below.
    event.preventDefault();

    if (game.mapView) {
      // CW-59: a press on the map now STARTS A DRAG rather than acting.
      //
      // ★ AND THAT IS WHY THE TELEPORT MOVED TO THE POINTER-UP. It used to
      // fire here, on the way down, which cannot coexist with dragging: the
      // press that begins a pan is the same press that would have teleported,
      // so the map would jump away the instant you tried to move it. The
      // DRAG_THRESHOLD_PX boundary is what separates them - under it the
      // press was a click and still teleports; over it the press was a drag,
      // it pans, and it never clicks. CW-61's modal hangs on this same
      // boundary.
      if (state.drag) return;
      state.drag = {
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
        downX: event.clientX,
        downY: event.clientY,
        travelPx: 0,
        panning: false,
        map: true,
      };
      try {
        state.refs.viewport.setPointerCapture(event.pointerId);
      } catch {
        // Capture is an optimization; a drag without it simply ends at the
        // viewport edge. Never worth failing the press over.
      }
      return;
    }
    if (state.drag) return;

    state.drag = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      travelPx: 0,
      looking: false,
      map: false,
    };
    try {
      state.refs.viewport.setPointerCapture(event.pointerId);
    } catch {
      // Capture is an optimization: without it the drag simply ends when the
      // pointer leaves the viewport. Never worth failing the press over.
    }
  }

  function handleViewportPointerMove(event) {
    const drag = state.drag;
    const game = state.game;

    // CW-81 hover-look: every move over the viewport updates where the
    // cursor stands, drag or no drag. The frame loop turns it into motion;
    // this only measures. Normalized to the half-extent: -1 at the left
    // edge, +1 at the right, same for vertical.
    if (game) {
      const rect = state.refs.viewport?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        game.hover.nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        game.hover.ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
        game.hover.over = true;
      }
    }

    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!game) {
      endDrag();
      return;
    }
    // Boolean on BOTH sides. A street drag has no `map` field at all, and
    // `undefined !== false` is true, so an unguarded comparison ended every
    // street drag on its first move - mouselook stopped working entirely and
    // the suite caught it within the release.
    if (Boolean(drag.map) !== Boolean(game.mapView)) {
      // The view changed under a live drag. Whatever it was doing no longer
      // applies to what is on screen.
      endDrag();
      return;
    }
    if (drag.map) {
      panMapByDrag(drag, event);
      return;
    }

    // CW-81 (CW-Q72): the street drag looks around only in DRAG mode. In
    // follow mode the moving cursor already steers the view through the
    // hover path above (a drag that also applied deltas would double every
    // movement), and in off mode the pointer does not look at all.
    // CW-87: and never while a tour drives - the route owns the heading.
    if (game.lookMode !== 'drag' || game.tour) return;

    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;

    if (!drag.looking) {
      drag.travelPx += Math.abs(dx) + Math.abs(dy);
      if (drag.travelPx < DRAG_THRESHOLD_PX) return;
      drag.looking = true;
    }

    // Dragging right turns right and dragging down looks down, matching the
    // mouselook every first-person game uses. CW-81: the delta steers the
    // look TARGET; the frame loop's follow carries the camera, so a drag
    // and the keys ride one smoothing.
    const { turned, pitched } = applyLookDelta(
      game.lookTarget,
      dx * DRAG_RAD_PER_PX,
      -dy * DRAG_RAD_PER_PX
    );
    if (!turned && !pitched) return;

    game.altView.invalidate();
    updateHud();
  }

  /** CW-81: the cursor left, or the window did - hover-look stands down. */
  function handleViewportPointerLeave() {
    const game = state.game;
    if (game) game.hover.over = false;
  }

  function handleViewportPointerUp(event) {
    if (state.drag && state.drag.pointerId !== event.pointerId) return;
    const drag = state.drag;
    // A press that never crossed the threshold was a CLICK, and CW-61 makes
    // every such click ASK rather than only an armed one act. Measured from
    // where the press went DOWN, not from where it came up: a two-pixel
    // wobble should ask about where you aimed, not two pixels off it.
    if (drag?.map && !drag.panning) {
      const world = mapPointToWorld(drag.downX, drag.downY);
      if (world) openTravelDialog(world.x, world.y);
    }
    endDrag();
  }

  /**
   * Drag the map under the pointer. The world point you grabbed stays under
   * the cursor, which is the only behaviour that feels like moving a map
   * rather than nudging a camera.
   *
   * The arithmetic is `mapPointToWorld` inverted: that turns a screen point
   * into a world point through the same frustum, so one screen pixel is
   * `(right - left) / width` metres across and `(top - bottom) / height`
   * metres up. Screen y grows downward and world y grows north, so the y
   * term flips.
   */
  function panMapByDrag(drag, event) {
    const game = state.game;
    const { viewport } = state.refs;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;

    if (!drag.panning) {
      drag.travelPx += Math.abs(dx) + Math.abs(dy);
      if (drag.travelPx < DRAG_THRESHOLD_PX) return;
      drag.panning = true;
    }

    const rect = viewport.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
    const fit = mapCameraFrustum(game.mapCam, game.model.boundsM, aspect);
    const perPxX = (fit.right - fit.left) / rect.width;
    const perPxY = (fit.top - fit.bottom) / rect.height;

    const bounds = game.model.boundsM;
    const nextX = game.mapCam.centerX - dx * perPxX;
    const nextY = game.mapCam.centerY + dy * perPxY;
    game.mapCam.centerX = Math.min(bounds.maxX, Math.max(bounds.minX, nextX));
    game.mapCam.centerY = Math.min(bounds.maxY, Math.max(bounds.minY, nextY));
    // Any manual pan breaks player-follow, exactly as the keys and the
    // buttons do - otherwise the next frame snaps the map back and the drag
    // looks broken.
    game.mapCam.follow = false;

    game.altView.invalidate();
    updateHud();
  }

  function endDrag() {
    const drag = state.drag;
    state.drag = null;
    if (!drag) return;
    const viewport = state.refs.viewport;
    try {
      if (viewport?.hasPointerCapture?.(drag.pointerId)) {
        viewport.releasePointerCapture(drag.pointerId);
      }
    } catch {
      // The pointer is already gone; there is nothing left to release.
    }
  }

  /**
   * CW-65 (CW-Q60): how close you have to be for the traveler to speak.
   *
   * ★ NOT the landmark radius, and the difference is the whole point. A
   * landmark enters at 60 m because a landmark is a BUILDING you can see from
   * across a district. A person is 2.5 x 4.2 character cells at 30 m and stops
   * being distinguishable from the crowd by about 20 m (measured, CW-65 P1).
   * 6 m is arm's length in this city - the distance at which you have plainly
   * walked UP TO someone rather than past them.
   */
  const TRAVELER_FIND_RADIUS_M = 6;

  /** Where the companion stands once found: beside the spawn, not on it. */
  const COMPANION_OFFSET_M = 3;

  /**
   * Put the traveler where this city's saved state says, or choose a spot and
   * save it. Once found they are the COMPANION and stand by the spawn instead.
   */
  function placeTraveler(game) {
    const saved = game.progressRaw?.traveler;
    if (saved?.found) {
      // ★ The reward is that they are THERE, every time, without being
      // underfoot: a companion standing on the spawn would be the first thing
      // a player collides with.
      const facing = game.walkState.headingRad ?? 0;
      game.traveler.place(
        game.spawn.x + Math.cos(facing) * COMPANION_OFFSET_M,
        game.spawn.y + Math.sin(facing) * COMPANION_OFFSET_M,
        facing + Math.PI
      );
      game.travelerFound = true;
      game.travelerSpot = null;
      return;
    }
    // A spot saved before it was found is REUSED, so a city does not move its
    // traveler between visits. Only a city with no saved spot picks one.
    const spot =
      saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)
        ? saved
        : pickTravelerSpot(game.props.figureSpots, game.city.slug, {
            spawnX: game.spawn.x,
            spawnY: game.spawn.y,
          });
    if (!spot) return;
    game.travelerFound = false;
    game.travelerSpot = { x: spot.x, y: spot.y, facing: spot.facing ?? 0 };
    game.traveler.place(spot.x, spot.y, spot.facing ?? 0);
    // Written on first entry so the spot survives a reload even unfound - the
    // traveler is not re-rolled by closing the tab.
    game.progressRaw = {
      ...game.progressRaw,
      traveler: {
        x: spot.x,
        y: spot.y,
        facing: spot.facing ?? 0,
        found: false,
      },
    };
    writeCityProgress(game.city.slug, {
      visited: game.visited,
      allFound: game.announcedAllFound,
      raw: game.progressRaw,
    });
  }

  /**
   * How far the player is from an unfound traveler, or null when there is
   * nothing to say - before one is placed, and after they are found. The
   * "empty clause is never spoken" rule whereAmIMessage already sets.
   */
  function travelerDistanceM(game) {
    if (!game?.travelerSpot || game.travelerFound) return null;
    return Math.hypot(
      game.travelerSpot.x - game.walkState.x,
      game.travelerSpot.y - game.walkState.y
    );
  }

  /** Walked close enough? Then they speak, once, and the city remembers. */
  function checkTravelerFind(game) {
    const d = travelerDistanceM(game);
    if (d === null || d > TRAVELER_FIND_RADIUS_M) return;
    game.travelerFound = true;
    game.progressRaw = {
      ...game.progressRaw,
      traveler: { ...(game.progressRaw?.traveler ?? {}), found: true },
    };
    writeCityProgress(game.city.slug, {
      visited: game.visited,
      allFound: game.announcedAllFound,
      raw: game.progressRaw,
    });
    refreshTravelerBadge(game);
    // ACCESSIBILITY-CRITICAL STRING (D-35) - flagged for owner review.
    announceInLayer(TRAVELER_FOUND_ANNOUNCE);
    openFoundDialog();
  }

  function openFoundDialog() {
    state.refs.found.hidden = false;
    state.refs.foundClose.focus();
  }

  function closeFoundDialog() {
    if (state.refs.found.hidden) return;
    state.refs.found.hidden = true;
    // Focus goes to a real control rather than <body>, which is D-59 and kills
    // every key for the rest of the session.
    state.refs.helpBtn?.focus();
  }

  /**
   * The badge row. A REAL TEXT row with an sr-only word, never an icon and
   * never a colour - CW-62's legend tick pattern, for its reasons.
   *
   * ★ It sits OUTSIDE the numbered landmark list on purpose: that list is
   * indexed by game.landmarks[i] in refreshLegend, so an extra <li> would
   * silently shift every landmark's direction by one.
   */
  function refreshTravelerBadge(game) {
    const row = state.refs.legend?.querySelector('.city-walk-legend-badge');
    if (!row) return;
    // ★ NO sr-only COMPANION WORD HERE, AND THAT IS A DELIBERATE DEPARTURE
    // FROM CW-62's TICK. That row needs one because its mark is a GLYPH ('✓')
    // and a glyph reads badly; this row is a whole sentence in words, so an
    // added ' Found.' just makes a screen reader say "Traveler found in this
    // city. Found." Visible text that already says the thing does not want a
    // second copy for assistive tech.
    row.textContent = game.travelerFound
      ? TRAVELER_BADGE_FOUND
      : TRAVELER_BADGE_UNFOUND;
  }

  /**
   * Remember that the player has been here (CW-20).
   *
   * The proximity machinery already existed with its own hysteresis, so a
   * landmark you linger beside does not tick over and over; this only has
   * to notice the first arrival. The completion line is announced ONCE per
   * session — a message that repeats every time you re-approach the last
   * landmark stops being a reward and becomes noise.
   */
  function markVisited(game, name) {
    if (game.visited.has(name)) return;
    game.visited.add(name);
    // CW-62: the map's marks carry the same state the legend's ticks do.
    game.beacons.setVisited(game.visited);
    game.altView.invalidate();
    refreshLegend(game);
    updateHud();
    const justFinished =
      !game.announcedAllFound &&
      game.landmarks.length > 0 &&
      game.visited.size >= game.landmarks.length;
    if (justFinished) {
      game.announcedAllFound = true;
      // ACCESSIBILITY-CRITICAL STRING (D-35) — flagged for owner review.
      announceInLayer(ALL_LANDMARKS_MESSAGE);
      // CW-64: the reward, once, on the transition - and the button from here
      // on. The unlock is written with the visit that earned it, in the same
      // object, so a tab closed a second later does not lose it.
      game.fireworksUnlocked = true;
      game.progressRaw = { ...game.progressRaw, fireworksUnlocked: true };
      syncFireworksButton();
      playFireworks();
    }
    // CW-62: written through on every new find rather than at exit, because
    // there is no reliable exit - a tab closes, a laptop sleeps, a browser
    // is killed. The write is small and happens once per landmark, ever.
    writeCityProgress(game.city.slug, {
      visited: game.visited,
      allFound: game.announcedAllFound,
      raw: game.progressRaw,
    });
  }

  /**
   * CW-78: walking into a waypoint's plinth marks and announces its landmark.
   *
   * Distance-based against the stamped plinth cell rather than a collision
   * callback, because stepWalk stops a walker BEFORE a blocked cell - the
   * reachable minimum is the pressed-against distance WAYPOINT_TOUCH_M
   * derives in landmark-registry.js. Hysteresis mirrors nearestLandmarkName's:
   * one touch is one sentence until the player leaves the ring.
   */
  function checkWaypointTouch(game) {
    const spots = game.waypointSpots ?? [];
    if (spots.length === 0) return;
    const { x, y } = game.walkState;
    let touching = null;
    for (const spot of spots) {
      const d = Math.hypot(spot.x - x, spot.y - y);
      const holding = game.touchedWaypoint === spot.name;
      if (d <= (holding ? WAYPOINT_LEAVE_M : WAYPOINT_TOUCH_M)) {
        touching = spot.name;
        break;
      }
    }
    if (touching && touching !== game.touchedWaypoint) {
      game.touchedWaypoint = touching;
      // ACCESSIBILITY-CRITICAL STRING (D-35) — flagged for owner review.
      announceInLayer(WAYPOINT_TOUCHED_MESSAGE(touching));
      markVisited(game, touching);
    } else if (!touching) {
      game.touchedWaypoint = null;
    }
  }

  /**
   * CW-80: the slope's category and rounded figure at the walker's feet,
   * along their heading, or null where the city has no terrain.
   */
  function slopeReading(game) {
    const terrain = game.surface?.terrain;
    if (!terrain) return null;
    const pct = gradePercent(
      terrain,
      game.walkState.x,
      game.walkState.y,
      game.walkState.headingRad
    );
    if (pct === null) return null;
    const rounded = Math.round(Math.abs(pct));
    if (rounded < SLOPE_LEVEL_MAX_PCT) return { cat: 'level', pct: 0 };
    return { cat: pct > 0 ? 'up' : 'down', pct: rounded };
  }

  /**
   * CW-80: speak the street's tilt when it truly changes. The empty-clause
   * law runs backwards here: LEVEL IS THE ASSUMED STATE, so 'Level.' is
   * spoken only as the news that a grade ENDED, never as a greeting.
   */
  function checkSlope(game, movedM) {
    const reading = slopeReading(game);
    if (!reading) return;
    const s = game.slope;
    s.sinceM += movedM;
    if (s.cat === null) {
      // The first reading arms the tracker silently: spawning on a hill is
      // scenery, not an event.
      s.cat = reading.cat;
      s.pct = reading.pct;
      s.sinceM = 0;
      return;
    }
    if (s.sinceM < SLOPE_MIN_WALK_M) return;
    const catChanged = reading.cat !== s.cat;
    const stepped =
      !catChanged &&
      reading.cat !== 'level' &&
      Math.abs(reading.pct - s.pct) >= SLOPE_RESTEP_PCT;
    if (!catChanged && !stepped) return;
    s.cat = reading.cat;
    s.pct = reading.pct;
    s.sinceM = 0;
    // ACCESSIBILITY-CRITICAL STRING (D-35) — flagged for owner review.
    announceInLayer(
      reading.cat === 'level'
        ? SLOPE_MESSAGES.level
        : SLOPE_MESSAGES[reading.cat](reading.pct)
    );
  }

  /**
   * CW-81 (CW-Q80): auto-walk on or off, with its sentence. One function so
   * the key, the button, Escape, the wall and CW-87's coming tour all stop
   * it the same way and the announcement can never be forgotten.
   */
  function setAutoWalk(on, message) {
    const game = state.game;
    if (!game || game.autoWalk === Boolean(on)) return;
    game.autoWalk = Boolean(on);
    // ACCESSIBILITY-CRITICAL STRING (D-35) — flagged for owner review.
    if (message) announceInLayer(message);
    syncToolbarView();
  }

  function toggleAutoWalk() {
    const game = state.game;
    if (!game || game.mapView) return;
    setAutoWalk(
      !game.autoWalk,
      game.autoWalk ? AUTO_WALK_OFF_MESSAGE : AUTO_WALK_ON_MESSAGE
    );
  }

  /** CW-87: end the tour with its sentence. Safe to call when none runs. */
  function stopTour(message) {
    const game = state.game;
    if (!game?.tour) return;
    game.tour = null;
    // ACCESSIBILITY-CRITICAL STRING (D-35) — flagged for owner review.
    if (message) announceInLayer(message);
  }

  /**
   * CW-87 (CW-Q84): walk the player to the selected legend landmark. One
   * key starts and the same key stops (GAG "very simple control schemes");
   * the route is A* over the game's own collision grid to the landmark's
   * touchable waypoint, so ARRIVING is the CW-78 touch - the tour ends
   * silently there and the waypoint speaks, one arrival, one sentence.
   */
  function startTour() {
    const game = state.game;
    if (!game) return;
    if (game.tour) {
      stopTour(TOUR_STOPPED_MESSAGE);
      return;
    }
    if (game.landmarks.length === 0) {
      announceInLayer('No landmarks in this city.');
      return;
    }
    const index = game.landmarkIndex >= 0 ? game.landmarkIndex : 0;
    const lm = game.landmarks[index];
    const spot = (game.waypointSpots ?? []).find((s) => s.name === lm.name);
    const to = spot ?? lm;
    const route = findRoute(
      game.collision,
      { x: game.walkState.x, y: game.walkState.y },
      { x: to.x, y: to.y }
    );
    if (!route) {
      // ACCESSIBILITY-CRITICAL STRING (D-35) — flagged for owner review.
      announceInLayer(TOUR_NO_ROUTE_MESSAGE(lm.name));
      return;
    }
    if (game.mapView) toggleMapView();
    setAutoWalk(false, null);
    game.tour = { name: lm.name, route, at: 1, holding: false };
    // ACCESSIBILITY-CRITICAL STRING (D-35) — flagged for owner review.
    announceInLayer(TOUR_START_MESSAGE(lm.name));
  }

  /**
   * The spoken turn at a route bend: direction from the wrap of the
   * outgoing bearing against the incoming one (heading grows clockwise, so
   * a positive wrap is a right turn), the street named from the game's own
   * street index at the next leg's midpoint - and nothing at all for a
   * bend gentler than TOUR_TURN_MIN_RAD.
   */
  function announceTourTurn(game, fromPt, toPt) {
    const incoming = game.walkState.headingRad;
    const outgoing = Math.atan2(toPt.x - fromPt.x, toPt.y - fromPt.y);
    let delta = outgoing - incoming;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    if (Math.abs(delta) < TOUR_TURN_MIN_RAD) return;
    const midX = (fromPt.x + toPt.x) / 2;
    const midY = (fromPt.y + toPt.y) / 2;
    const street = game.streetIndex.query(midX, midY, STREET_NEAR_M)[0] ?? null;
    // ACCESSIBILITY-CRITICAL STRING (D-35) — flagged for owner review.
    announceInLayer(
      TOUR_TURN_MESSAGE(delta > 0 ? 'right' : 'left', street?.name ?? null)
    );
  }

  /**
   * CW-81 (CW-Q72): step the mouse-look preference follow -> drag -> off.
   * The choice persists; the announcement says what the mode DOES, because
   * a mode name alone teaches nothing.
   */
  function cycleLookMode() {
    const game = state.game;
    if (!game) return;
    const next =
      LOOK_MODES[(LOOK_MODES.indexOf(game.lookMode) + 1) % LOOK_MODES.length];
    game.lookMode = next;
    safeSetItem(STORAGE_KEY_CITY_WALK_LOOK, next);
    // ACCESSIBILITY-CRITICAL STRING (D-35) — flagged for owner review.
    announceInLayer(LOOK_MODE_MESSAGES[next]);
    syncToolbarView();
  }
  /**
   * Save what the player is looking at as a PNG (CW-20).
   *
   * The visible picture IS the overlay canvas — the WebGL canvas underneath
   * is transparent while the Alt View is on — so this composes that overlay
   * onto black rather than inventing a second render path. A PNG of the
   * overlay alone would come out as glyphs floating on transparency, which
   * is not what anyone means by a photo of the city.
   */
  function savePhoto() {
    const game = state.game;
    if (!game) return;
    const source = state.refs.viewport?.querySelector('.hfm-overlay-canvas');
    if (!source || !source.width || !source.height) return;

    const out = document.createElement('canvas');
    out.width = source.width;
    out.height = source.height;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(source, 0, 0);

    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = photoFilename(game);
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoking immediately can cancel the download in some browsers;
      // one turn of the event loop is enough for it to have started.
      setTimeout(() => URL.revokeObjectURL(url), 0);
      // ACCESSIBILITY-CRITICAL STRING (D-35) — flagged for owner review.
      announceInLayer(PHOTO_SAVED_MESSAGE);
    }, 'image/png');
  }

  /** ascii-city-<city>-<date>.png, so a folder of these sorts sensibly. */
  function photoFilename(game) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const slug = game.city?.slug ?? 'city';
    return `ascii-city-${slug}-${date}.png`;
  }
  /**
   * Off, light, heavy, off again (CW-20, CW-Q18).
   *
   * Rain is motion, so reduced motion refuses it outright rather than
   * silently doing nothing: a key that answers with an explanation is a key
   * the player can trust. The toolbar button is hidden in that state, so the
   * only way to arrive here is the keyboard.
   */
  /** The session clock stepWeather is driven by, so anchors agree with it. */
  function sessionNowMs(game) {
    return performance.now() - game.startedAtMs;
  }

  /**
   * Put the ambient light down, wherever in the swell it happened to be.
   *
   * The swell only lands back on zero if a frame arrives to bring it down,
   * and it is 320 ms long: stop the rain inside that window - or turn on
   * reduced motion, which stops the frames outright - and the lift stays on
   * the city until something else happens to reset it (D-75).
   */
  function clearThunder(game) {
    game.lighting.setThunder(0);
    game.thunderStartMs = 0;
  }

  /**
   * Move the rain to a level and take the weather that hangs off it with it.
   *
   * The fog and the thunder are only ever driven WHILE it is raining, so
   * every way out of the rain has to put them back itself — otherwise the
   * murk stays over a clear night and the ambient stays lifted (D-74, D-75).
   * There are two ways out: the key, and reduced motion turning on.
   *
   * @param {number|null} next - the new level, or null for a dry night
   */
  function applyRainLevel(game, next) {
    const wasRaining = game.rainLevel !== null;
    game.rainLevel = next;
    game.rain.setLevel(next);

    if (next === null) {
      game.lighting.setFogDensity(0);
      clearThunder(game);
    } else if (!wasRaining) {
      game.lighting.beginFogDrift(sessionNowMs(game));
    }
  }

  /**
   * Play the show, or say why it is not moving (CW-64, CW-Q59).
   *
   * ★ REDUCED MOTION GETS A REAL ALTERNATIVE, NOT A REFUSAL. The Rain button
   * disables itself under reduced motion and `cycleRain` answers with a
   * sentence; that is right for weather nobody promised. This is a REWARD, and
   * a reward that answers "no" is worse than one that answers quietly. So the
   * calm path holds the bursts still for a moment and says what they are - the
   * plan's words are "a static celebratory frame plus the announcement, never
   * nothing".
   */
  function playFireworks(options = {}) {
    const game = state.game;
    if (!game?.fireworks) return;
    const message = options.replay
      ? FIREWORKS_REPLAY_MESSAGE
      : FIREWORKS_MESSAGE;
    if (game.motionReduced) {
      window.clearTimeout(game.fireworksStillTimer);
      game.fireworks.showStill(
        game.walkState.x,
        game.walkState.y,
        game.walkState.headingRad
      );
      game.altView.invalidate();
      // ★ A TIMEOUT, NOT A FRAME COUNT, AND THAT IS RIGHT HERE. This round
      // forbids wall-clock holds where a quantity the GAME decides is being
      // measured - metres walked, frames converted. Nothing is being measured
      // here: a still picture is shown for a few seconds the way a message is,
      // and under reduced motion the step loop deliberately never runs, so
      // there are no frames to count in the first place.
      game.fireworksStillTimer = window.setTimeout(() => {
        game.fireworks?.clear();
        game.altView.invalidate();
      }, FIREWORKS_STILL_MS);
      // ACCESSIBILITY-CRITICAL STRING (D-35) - flagged for owner review.
      announceInLayer(FIREWORKS_CALM_MESSAGE);
      return;
    }
    game.fireworks.start();
    game.altView.invalidate();
    // ACCESSIBILITY-CRITICAL STRING (D-35) - flagged for owner review.
    announceInLayer(message);
  }

  /**
   * The button exists once a city has been finished, and keeps existing
   * (CW-64 P3). CW-62's store is EXTENDED rather than siblinged: one key per
   * city, a JSON object, unknown fields preserved on write.
   */
  function syncFireworksButton() {
    const btn = state.refs?.fireworksBtn;
    if (!btn) return;
    btn.hidden = !state.game?.fireworksUnlocked;
  }

  function cycleRain() {
    const game = state.game;
    if (!game) return;
    if (game.motionReduced) {
      // ACCESSIBILITY-CRITICAL STRING (D-35) — flagged for owner review.
      announceInLayer(RAIN_BLOCKED_MESSAGE);
      return;
    }
    const next = game.rainLevel === null ? 0 : game.rainLevel + 1;
    applyRainLevel(game, next >= RAIN_LEVEL_COUNT ? null : next);
    syncToolbarView();
    // ACCESSIBILITY-CRITICAL STRINGS (D-35) — flagged for owner review.
    announceInLayer(
      game.rainLevel === null
        ? RAIN_OFF_MESSAGE
        : `Rain: ${RAIN_LEVEL_NAMES[game.rainLevel]}.`
    );
    game.altView.invalidate();
  }

  /**
   * Weather that moves: the drops fall, the fog drifts, thunder swells.
   *
   * Called from the frame loop and ONLY while the street view is up and
   * reduced motion is off. Rain makes every frame dirty, which is the one
   * thing in this city that legitimately does — a still frame of falling
   * rain is not rain.
   *
   * @returns {boolean} whether the frame needs converting again
   */
  function stepWeather(game, dtS, nowMs) {
    let dirty = false;

    if (game.rainLevel !== null) {
      game.rain.update(dtS, game.walkState.x, game.walkState.y);
      dirty = true;

      // Thunder: rare, hashed off the session clock so it is not random
      // enough to surprise twice in a row, and never closer than its own
      // gap. A swell up and back down, not a switch.
      if (nowMs >= game.nextThunderMs) {
        game.thunderStartMs = nowMs;
        game.nextThunderMs = nowMs + THUNDER_GAP_MS + (nowMs % 7919) * 4;
      }
      const since = nowMs - game.thunderStartMs;
      const span = game.lighting.weatherTiming.thunderMs;
      if (game.thunderStartMs > 0 && since <= span) {
        // A single smooth hump: up over the first half, down over the
        // second, so there is no edge anywhere in it.
        const k = since / span;
        game.lighting.setThunder(Math.sin(k * Math.PI));
      } else if (game.thunderStartMs > 0) {
        game.lighting.setThunder(0);
        game.thunderStartMs = 0;
      }

      // Fog drift, minutes-scale: a slow breathe between a clear night and
      // a murky one. Only while it is raining — a clear night should not
      // wander on its own. The drift runs from the anchor the shower set,
      // never from the session clock, so it picks up where the fog actually
      // is instead of jumping to where a free-running clock had reached.
      game.lighting.stepFogDrift(nowMs);
    }

    return dirty;
  }

  /**
   * ★★ THE SHOW STEPS IN BOTH VIEWS, AND IT IS THE ONLY THING THAT DOES.
   *
   * `stepWeather` sits behind `!game.mapView`, because rain, thunder and the
   * fog drift are street weather and the map has no sky to put them in. The
   * fireworks are not weather: CW-Q59 asks for a 2D representation of the SAME
   * bursts at their true ring positions, so a player who opens the map
   * mid-show must see it carry on rather than freeze. Photographed as a dead
   * map first - the marks never appeared, because nothing was stepping them.
   *
   * It still marks frames dirty ONLY while it runs, which is what keeps the
   * frozen-world exception bounded rather than making a second permanent
   * mover, and reduced motion never reaches here at all.
   */
  function stepFireworks(game, dtS, nowMs) {
    if (!game.fireworks?.isRunning()) return false;
    game.fireworks.update(dtS, game.walkState.x, game.walkState.y, nowMs);
    game.fireworks.group.visible = !game.mapView;
    game.fireworks.mapGroup.visible = game.mapView;
    return true;
  }
  function adjustCharacterSize(delta) {
    const game = state.game;
    if (!game) return;
    // A size gesture mid-calibration takes over: the pass stops where the
    // player can see it (no restore - they are reacting to what is on
    // screen) and its floor arrives at the next entry instead.
    if (game.calibration && !game.calibration.done) {
      abortCalibration(game, { restore: false });
    }
    const current = game.altView.getFontScale();
    const floor = game.calibratedFloor;
    const floorRaised = Number.isFinite(floor) && floor > CHAR_SCALE_MIN + 1e-9;
    // CW-88 (CW-Q87): the calibrated floor no longer STOPS the gesture. It is
    // what this machine measured, not a rule about what a player is allowed
    // to look at, and the smallest size is theirs to choose again. The
    // information in the old refusal was its useful half, so it survives as
    // an advisory on the step that crosses below the floor. Clamping still
    // happens here, to the GAME's range: the renderer instance accepts down
    // to 0.05, which is below the smallest size that changes anything.
    const next = clampCharScale(current + delta);
    const crossedBelowFloor =
      floorRaised && current >= floor - 1e-9 && next < floor - 1e-9;
    game.altView.setFontScale(next);
    syncCellRaster(game);
    game.altView.invalidate();
    safeSetItem(STORAGE_KEY_CITY_WALK_FONT_SCALE, String(next));
    syncCharSizeControls();
    announceInLayer(
      crossedBelowFloor
        ? `Character size ${Math.round(next * 100)} percent. This machine ` +
            `measured ${Math.round(floor * 100)} percent as the smallest size ` +
            'that holds 30 frames per second.'
        : `Character size ${Math.round(next * 100)} percent.`
    );
  }

  /**
   * CW-41: the facade textures are filtered for the CELL raster (the
   * shimmer fix), so the scene has to hear about every cell-size change.
   */
  function syncCellRaster(game) {
    const cell = game.altView.getCellPx?.();
    if (cell) game.city3d.setCellRaster?.(cell.h);
  }

  // -------------------------------------------------------------------
  // Entry size calibration (CW-42, CW-Q39): the floor knows this machine
  // -------------------------------------------------------------------

  const sameScale = (a, b) => Math.abs(a - b) < 1e-9;

  function startCalibration(game, manual) {
    game.calibration = {
      readings: [],
      phase: null,
      done: false,
      manual,
      entryScale: game.altView.getFontScale(),
      result: null,
      aborted: false,
    };
  }

  /**
   * The size the pass should measure next, or null when it is finished.
   * A manual entry is measured where it stands and never flipped: the pass
   * may only conclude from what the player's own size reveals. An auto
   * entry at a non-candidate size measures it first as a free gate - no
   * flip, and a failure there condemns the whole range below it.
   */
  function nextCalibrationScale(game) {
    const cal = game.calibration;
    const current = game.altView.getFontScale();
    const measured = cal.readings.some((r) => sameScale(r.scale, current));
    if (cal.manual) return measured ? null : current;
    if (
      !measured &&
      cal.readings.length === 0 &&
      !CALIBRATION_FLOOR_LADDER.some((s) => sameScale(s, current))
    ) {
      return current;
    }
    return nextProbeScale(cal.readings, undefined, current);
  }

  function stepCalibration(game, nowMs) {
    const cal = game.calibration;
    if (!cal || cal.done) return;

    if (import.meta.env.DEV && window.__cityWalkCalibrationForce) {
      // E2E determinism hook: forced probe readings resolve the pass
      // instantly - CI renders in software and must never time real frames.
      const forced = window.__cityWalkCalibrationForce;
      for (;;) {
        const scale = nextCalibrationScale(game);
        if (scale === null) break;
        const avgMs = Number(forced[String(scale)]);
        if (!Number.isFinite(avgMs)) {
          abortCalibration(game, { restore: true });
          return;
        }
        cal.readings.push({
          scale,
          avgMs,
          samples: CALIBRATION_SAMPLES_PER_SCALE,
        });
      }
      finishCalibration(game);
      return;
    }

    const totals = game.altView.getConvertTotals?.();
    if (!totals) {
      cal.done = true;
      return;
    }

    if (!cal.phase) {
      const scale = nextCalibrationScale(game);
      if (scale === null) {
        finishCalibration(game);
        return;
      }
      if (!sameScale(game.altView.getFontScale(), scale)) {
        game.altView.setFontScale(scale);
        syncCellRaster(game);
      }
      cal.phase = createProbePhase(scale, nowMs);
    }

    // The probe must see conversions: standing frames self-heal at ~1 Hz,
    // so ask for a real one this frame. The scene does not change - the
    // converter re-reads the same pixels, which is exactly the cost under
    // measurement.
    game.altView.invalidate();

    const result = stepProbePhase(cal.phase, totals, nowMs);
    if (result.status === 'done') {
      cal.readings.push(result.reading);
      cal.phase = null;
    } else if (result.status === 'abandoned') {
      // A wedged phase (hidden tab) is an interruption, not a result:
      // nothing is stored, nothing announced, yesterday's floor stands.
      abortCalibration(game, { restore: true });
    }
  }

  function finishCalibration(game) {
    const cal = game.calibration;
    cal.done = true;
    cal.phase = null;
    if (!isConclusive(cal.readings)) {
      // Nothing decisive was measured (a comfortable manual size holding
      // says nothing about the range): keep yesterday's floor, store
      // nothing, announce nothing.
      restoreEntryScale(game);
      return;
    }
    const measured = chooseCalibratedSize(cal.readings);
    // CW-72: a raise needs two passes to agree, so a machine that was busy
    // once does not get a coarser picture for ever (the R6 floor-flapping
    // item). Nothing here lowers a floor.
    const next = raiseFloor(
      { floorScale: game.calibratedFloor, pending: game.calibrationPending },
      measured.floorScale
    );
    cal.result = { ...measured, ...next };
    const raised =
      Number.isFinite(game.calibratedFloor) &&
      next.floorScale > game.calibratedFloor + 1e-9;
    game.calibratedFloor = next.floorScale;
    game.calibrationPending = next.pending;
    safeSetItem(
      STORAGE_KEY_CITY_WALK_CALIBRATED_FLOOR,
      encodeCalibration(next)
    );
    // CW-88 (CW-Q87): a measurement never overrides a size the player chose.
    // The manual key's PRESENCE is what says they chose one (storage-keys.js
    // says so, and the step handler is its only writer), so this needs no new
    // marker. Without a saved choice the floor still lands, which is the seed
    // behaviour CW-Q68 asked for and this release keeps.
    const chosenBySomebody = Number.isFinite(
      parseFloat(safeGetItem(STORAGE_KEY_CITY_WALK_FONT_SCALE) ?? '')
    );
    if (cal.manual) {
      restoreEntryScale(game);
    } else if (
      !chosenBySomebody &&
      game.altView.getFontScale() < next.floorScale - 1e-9
    ) {
      // The floor lands through the renderer only - writing the manual key
      // here would freeze a measurement as if it were the player's choice.
      // `chosenBySomebody` rather than `cal.manual` because a size chosen
      // DURING this session must block the override too, and cal.manual was
      // captured at entry.
      game.altView.setFontScale(next.floorScale);
      syncCellRaster(game);
      game.altView.invalidate();
    }
    syncCharSizeControls();
    if (raised) {
      // ★★ CW-88: say what happened, not what the floor wanted. This branch
      // announced "Character size raised to N percent" for a manual entry as
      // well, where N was the size it had just RESTORED - a raise that never
      // happened, announced to a screen reader as if it had. Now the wording
      // follows the outcome: the size moved, or it did not and a larger one
      // is on offer.
      const scaleNow = game.altView.getFontScale();
      const leftBelowFloor = scaleNow < next.floorScale - 1e-9;
      announceInLayer(
        leftBelowFloor
          ? 'This machine cannot hold 30 frames per second at your character ' +
              `size. A larger size of ${Math.round(next.floorScale * 100)} ` +
              'percent is available, and your size is unchanged.'
          : 'This machine cannot hold 30 frames per second at the usual ' +
              `character size. Character size raised to ${Math.round(scaleNow * 100)} percent.`
      );
    }
  }

  function abortCalibration(game, { restore }) {
    const cal = game.calibration;
    if (!cal || cal.done) return;
    cal.done = true;
    cal.phase = null;
    cal.aborted = true;
    if (restore) restoreEntryScale(game);
    syncCharSizeControls();
  }

  function restoreEntryScale(game) {
    const cal = game.calibration;
    if (!cal || !Number.isFinite(cal.entryScale)) return;
    if (!sameScale(game.altView.getFontScale(), cal.entryScale)) {
      game.altView.setFontScale(cal.entryScale);
      syncCellRaster(game);
      game.altView.invalidate();
    }
  }

  /**
   * The Smaller controls at the calibrated floor are disabled-with-reason,
   * not hidden (the house pattern): aria-disabled keeps them focusable, and
   * pressing one speaks the reason via adjustCharacterSize's floor stop.
   * The Camera panel's zoom-out is only a character control in the street -
   * over the map it is the map's own zoom and is never floor-bound.
   */
  function syncCharSizeControls() {
    const game = state.game;
    // CW-88 (CW-Q87): the stop is the range's own bottom, not the machine's
    // measured floor. A control disabled at the floor is the clamp wearing a
    // different coat, and the player's choice now reaches 10 per cent.
    const atFloor =
      Boolean(game) && game.altView.getFontScale() <= CHAR_SCALE_MIN + 1e-9;
    const setDisabled = (btn, disabled) => {
      if (!btn) return;
      if (disabled) btn.setAttribute('aria-disabled', 'true');
      else btn.removeAttribute('aria-disabled');
    };
    setDisabled(
      state.refs.toolbarButtons?.find(
        (b) => b.spec.id === 'cityWalkCharDownBtn'
      )?.btn,
      atFloor
    );
    setDisabled(
      document.getElementById('cityWalkCamZoomOut'),
      atFloor && !game?.mapView
    );
  }

  // -------------------------------------------------------------------
  // Cameras / HUD / loop
  // -------------------------------------------------------------------

  function applyFirstPersonCamera() {
    const game = state.game;
    const pose = firstPersonPose(game.walkState);
    game.fpCamera.position.set(...pose.eye);
    game.fpCamera.lookAt(...pose.target);
  }

  function applyMapCamera() {
    const game = state.game;
    const { viewport } = state.refs;
    const aspect =
      Math.max(1, viewport.clientWidth) / Math.max(1, viewport.clientHeight);
    const fit = mapCameraFrustum(game.mapCam, game.model.boundsM, aspect);
    const cam = game.orthoCamera;
    cam.left = fit.left;
    cam.right = fit.right;
    cam.top = fit.top;
    cam.bottom = fit.bottom;
    cam.position.set(fit.centerX, fit.centerY, ORTHO_CAMERA_HEIGHT_M);
    cam.lookAt(fit.centerX, fit.centerY, 0);
    cam.updateProjectionMatrix();

    // CW-40: the "I'm here" marker keeps a constant GLYPH footprint across
    // zooms. Metre-sized, it was a two-cell pip at 0.8x - findable only if
    // you already knew where to look - and it would swallow a block at high
    // zoom. 2.2 rather than 1.4 because the marker is a hollow frame now,
    // and a frame's border has to stay comfortably over a glyph cell thick
    // or the grid eats it (the CW-36 ring's death). Photographed at
    // 0.8x/1x/2x, in colour mode too, before the factors were chosen.
    const markerScale = Math.min(3.5, Math.max(0.6, 2.2 / game.mapCam.zoom));
    game.marker.scale.set(markerScale, markerScale, 1);
    // CW-61: the circle is the same family and shares the same number. Two
    // marks that mean one thing between them cannot drift apart in size.
    game.pickMark.scale.set(markerScale, markerScale, 1);
    // CW-62: and so do the landmark diamonds. Three marks on one map, one
    // number deciding how big a mark is.
    game.beacons.setScale(markerScale);
    // CW-64: FOUR marks now, and still one number. The burst triangles take
    // the same clamp, so the map's marks cannot drift apart in size.
    game.fireworks?.setMapScale(markerScale);

    // CW-60: the wayfinding marks are sized on SCREEN, so they belong to the
    // same seam the marker's own scale does - every zoom, every frame of a
    // held zoom, not only the moment the map opened.
    game.city3d.setMapZoom(game.mapCam.zoom);
  }

  function toggleMapView() {
    const game = state.game;
    endDrag();
    game.mapView = !game.mapView;
    game.marker.visible = game.mapView;
    if (!game.mapView) game.pickMark.visible = false;
    // CW-61: a question about a spot on the map cannot outlive the map.
    // Closed silently, because this function's own announcement is the
    // sentence this turn speaks - and closing it as a CANCEL would be a lie,
    // since the player pressed M rather than Cancel.
    if (!game.mapView && state.travel) {
      state.travel = null;
      state.refs.travel.hidden = true;
      game.pickMark.visible = false;
    }
    game.city3d.setMapView(game.mapView);
    game.props.setMapView(game.mapView);
    // A person is street furniture as far as the map is concerned: at a
    // kilometre up they are overhead fuzz, exactly like the benches.
    game.traveler?.setMapView(game.mapView);
    // CW-60: the style is a map state, so it is applied on the way IN and
    // never has to be undone on the way out - setMapView restores the street.
    // The zoom follows from applyMapCamera below, which is the one place
    // anything screen-sized on the map is sized.
    if (game.mapView) game.city3d.setMapStyle(state.mapStyle);
    // CW-20: the weather belongs to the street. Seen from overhead the drops
    // streak diagonally across the whole map and read as scratches on the
    // picture rather than as rain — caught by eye in the four-city tour.
    if (game.rain)
      game.rain.group.visible = !game.mapView && game.rainLevel !== null;
    // CW-64: the street show is street geometry. The map gets its own 2D
    // representation (P2) rather than a bird's eye view of the same stars.
    if (game.fireworks) {
      game.fireworks.group.visible =
        !game.mapView && game.fireworks.isShowing();
      // CW-Q59 asks for a 2D representation at true ring scale and location,
      // so the map shows the same bursts from above rather than the street
      // show tipped on its side.
      game.fireworks.mapGroup.visible =
        game.mapView && game.fireworks.isShowing();
    }
    game.lighting.setMapBoost(game.mapView);
    game.beacons.group.visible = game.mapView;
    // CW-78: the waypoints are street furniture; the map has the beacons.
    if (game.waypoints) game.waypoints.group.visible = !game.mapView;
    state.refs.legend.hidden = !game.mapView;
    if (game.mapView) {
      // The whole map sits ~1 km from the overhead camera — distance fog
      // would black it out entirely. Street view gets the fog back.
      game.streetFog = game.scene.fog;
      game.scene.fog = null;
      game.marker.position.set(game.walkState.x, game.walkState.y, 0);
      // Open following the player; walking pauses while the map is up
      // (the arrows pan the map instead — CW-9).
      recenterMapCamera(game.mapCam, game.walkState.x, game.walkState.y);
      applyMapCamera();
      refreshLegend(game);
    } else {
      game.scene.fog = game.streetFog ?? null;
      // A zoom key held through the M press must not stick, and landmark
      // selection resets with the map.
      forceReleaseAction('zoomIn');
      forceReleaseAction('zoomOut');
      game.landmarkIndex = -1;
      game.beacons.setSelected(null);
    }
    syncToolbarView();
    // The phosphor trail is a persistence buffer: every painted frame is laid
    // over a fading copy of the one before, which is what makes movement leave
    // a wake. Between the street and the map those two pictures have nothing
    // in common, so the wake becomes a double exposure — the city you were
    // standing in shuttering over the map you just opened, and back again.
    // Nothing ever emptied that buffer here; the Forge preview has always
    // emptied it on an abrupt change (main.js) and the game never did (D-81).
    game.altView.clearPersistence();
    game.altView.invalidate();
    updateHud();
    announceInLayer(
      game.mapView
        ? 'Map view, seen from above. Arrow keys or W A S D pan, or drag with the mouse. Page Up and Page Down zoom, Home returns to you. The toolbar now shows the map buttons.'
        : 'Street view. The toolbar now shows the walking buttons.'
    );
  }

  // -------------------------------------------------------------------
  // Teleport (CW-36): drop the walker onto a street picked from the map
  // -------------------------------------------------------------------

  /**
   * Where a point on the map canvas is in the world.
   *
   * The overhead camera is orthographic, north up, looking straight down, so
   * the mapping is linear and needs no raycast: the frustum the camera is
   * using IS the visible rectangle of the city.
   *
   * @returns {{x:number, y:number}|null} null if the game is not on the map
   */
  function mapPointToWorld(clientX, clientY) {
    const game = state.game;
    if (!game?.mapView) return null;
    const { viewport } = state.refs;
    const rect = viewport.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
    const fit = mapCameraFrustum(game.mapCam, game.model.boundsM, aspect);
    const u = (clientX - rect.left) / rect.width;
    const v = (clientY - rect.top) / rect.height;
    return {
      x: fit.centerX + fit.left + u * (fit.right - fit.left),
      // Screen y grows downward and world y grows north, so this one flips.
      y: fit.centerY + fit.top - v * (fit.top - fit.bottom),
    };
  }

  /**
   * CW-61 (CW-Q58): the travel dialog, and the retirement of arming.
   *
   * ★★ THE REVERSAL, STATED PLAINLY. CW-40 made an unarmed map click do
   * NOTHING and an armed one travel immediately. Both halves are gone: every
   * sub-threshold click now ASKS, and nothing travels without a second press.
   * The trade is one extra press against a mode you could be in without
   * knowing - and against a single mis-click sending you across the city with
   * no way back to where you were.
   *
   * ★ AND J NO LONGER COMMITS SILENTLY. It opens this same dialog at the
   * crosshair, so the keyboard route and the pointer route ask the same
   * question and answer it with the same two buttons. CW-Q58 supersedes
   * CW-Q40's one-step J deliberately: the preview is the point.
   *
   * @param {number} x world metres
   * @param {number} y world metres
   */
  function openTravelDialog(x, y) {
    const game = state.game;
    if (!game?.mapView) return;

    // ★ THE LANDING FIRST, THEN THE NAME. findLandingNear snaps to a street
    // and refuses what it cannot stand on, so asking the street index where
    // the CLICK was would describe a spot the player is not going to.
    const landing = findLandingNear(game.model, game.collision, x, y);
    if (!landing) {
      announceInLayer(TELEPORT_REFUSED_MESSAGE);
      return;
    }

    const hits = game.streetIndex.query(landing.x, landing.y, STREET_NEAR_M);
    const where = describeJunction(hits, {
      onM: STREET_ON_M,
      junctionM: STREET_JUNCTION_M,
    });
    const sentence = where.primary
      ? where.secondary
        ? TRAVEL_WHERE_CORNER(where.primary, where.secondary, where.on)
        : TRAVEL_WHERE_ONE(where.primary, where.on)
      : TRAVEL_WHERE_OPEN;

    state.travel = { x: landing.x, y: landing.y };
    // ★ THE CIRCLE MARKS THE SPOT WHILE THE QUESTION IS OPEN. It stands on
    // the LANDING, not on the click: the sentence describes where you would
    // arrive, and a mark somewhere else would contradict it.
    game.pickMark.position.set(landing.x, landing.y, 0);
    game.pickMark.visible = true;
    game.altView.invalidate();
    state.refs.travelWhere.textContent = sentence;
    state.refs.travel.hidden = false;
    state.refs.travelGo.focus();
  }

  /**
   * @param {boolean} commit Travel, or Cancel.
   */
  function closeTravelDialog(commit) {
    const pick = state.travel;
    state.travel = null;
    state.refs.travel.hidden = true;
    // Either answer retires the circle. On Travel the man arrives and stands
    // where it was, which is the logo completing itself; on Cancel there is
    // no longer a spot in question.
    if (state.game) {
      state.game.pickMark.visible = false;
      state.game.altView.invalidate();
    }
    if (!pick) return;
    if (commit) {
      // commitTeleport speaks the landing, which is the sentence this turn
      // makes; a cancel has nothing else to say for it, so it says its own.
      commitTeleport(pick.x, pick.y);
    } else {
      announceInLayer(TRAVEL_CANCELLED_MESSAGE);
    }
    // Focus goes back to the control the map is driven from rather than to
    // <body>, which is D-59 and kills every key for the rest of the session.
    state.refs.mapBtn?.focus();
  }

  /**
   * J: ask at the map's centre crosshair. The arrows already steer the middle
   * of the screen onto a street and PageUp/PageDown already zoom it (CW-Q41),
   * so the keyboard reaches any spot; what it lacked was the preview.
   */
  function teleportAtCrosshair() {
    const game = state.game;
    if (!game || !game.mapView) return;
    if (state.travel) {
      closeTravelDialog(false);
      return;
    }
    openTravelDialog(game.mapCam.centerX, game.mapCam.centerY);
  }

  /**
   * Travel. The landing comes from the same snap-to-a-segment search the
   * pick flow proved (never a vertex - OSM draws a straight street as two
   * endpoints), so what the announcement names is where you stand. The
   * game STAYS in map view (CW-Q40).
   */
  function commitTeleport(x, y) {
    const game = state.game;
    if (!game || !game.mapView) return;

    const landing = findLandingNear(game.model, game.collision, x, y);
    if (!landing) {
      announceInLayer(TELEPORT_REFUSED_MESSAGE);
      return;
    }

    game.walkState.x = landing.x;
    game.walkState.y = landing.y;
    if (landing.headingRad !== null) {
      game.walkState.headingRad = normalizeHeading(landing.headingRad);
    }
    // CW-50: a teleport puts the walker on whatever is under the landing at
    // once. Easing here would ride the eye up from wherever they left.
    easeGroundZ(game.walkState, game.surface, 0);

    // The street name is sticky on purpose (updateStreet keeps the street you
    // are already on when two are near-equidistant, so the HUD does not flap
    // at a junction). Across a teleport that stickiness is wrong: the street
    // you were on is now a mile away, so the memory has to go first.
    game.streetName = null;
    updateStreet(game);
    game.nearLandmark = nearestLandmarkName(
      game.landmarks,
      game.walkState.x,
      game.walkState.y,
      null
    );
    // CW-78: landing inside a landmark's ring MARKS it. Before this, the
    // landing seeded nearLandmark without the tick, so the visit fired at
    // whatever later movement frame happened to re-enter the ring - the
    // "random time" the round's brief names. markVisited is idempotent and
    // announces nothing for a single visit, so a landing beside a landmark
    // ticks the legend without talking over the landing sentence below.
    if (game.nearLandmark) markVisited(game, game.nearLandmark);

    // ★ THE TRAP THIS RELEASE EXISTS INSIDE OF (Round 4, CW-20). The camera
    // is only re-posed inside a movement step, so a teleport that only moved
    // walkState would leave the first-person camera standing where the player
    // used to be — and the street view would photograph the spawn. Re-pose it
    // here, explicitly, even though the view is not changing now: M can come
    // at any moment after, and the street it opens must show the landing.
    applyFirstPersonCamera();

    // The aerial "I'm here" marker is only re-posed on map entry, so the
    // move has to place it - and the map camera deliberately stays where
    // the player steered it: the click was made on a visible spot.
    game.marker.position.set(game.walkState.x, game.walkState.y, 0);
    game.altView.invalidate();
    updateHud();

    // game.streetName and game.streetOn are what the HUD is now showing —
    // updateStreet has just written them, with the old street's stickiness
    // cleared — so the sentence and the line cannot disagree.
    const compass = headingLabel(game.walkState.headingRad);
    announceInLayer(
      game.streetName
        ? TELEPORT_LANDED_MESSAGE(game.streetName, game.streetOn, compass)
        : TELEPORT_LANDED_OPEN_MESSAGE(compass)
    );
  }

  function cycleLandmark(direction) {
    const game = state.game;
    if (!game) return;
    if (game.landmarks.length === 0) {
      announceInLayer('No landmarks in this city.');
      return;
    }
    // Landmarks live on the map — cycling from street view opens it.
    if (!game.mapView) toggleMapView();

    const count = game.landmarks.length;
    game.landmarkIndex = (game.landmarkIndex + direction + count) % count;
    const lm = game.landmarks[game.landmarkIndex];

    game.beacons.setSelected(game.landmarkIndex);
    // Center the map on the landmark; manual selection is not follow mode.
    game.mapCam.centerX = lm.x;
    game.mapCam.centerY = lm.y;
    game.mapCam.follow = false;
    applyMapCamera();
    refreshLegend(game);
    game.altView.invalidate();
    announceInLayer(
      `Landmark ${game.landmarkIndex + 1} of ${count}: ${lm.name}.`
    );
  }

  function adjustWalkSpeed(delta) {
    const game = state.game;
    if (!game) return;
    game.speedLabel = clampSpeedLabel(game.speedLabel + delta);
    safeSetItem(STORAGE_KEY_CITY_WALK_SPEED, String(game.speedLabel));
    updateHud();
    announceInLayer(`Walking speed ${game.speedLabel} percent.`);
  }

  // CW-27 wayfinding. A walker on the pavement of a 6 m residential street
  // sits about 5 m from its centreline, and on a 12 m primary about 8, so
  // ON_M covers standing in the street itself. Between that and NEAR_M the
  // HUD says "near" instead, and past it says nothing rather than lying.
  const STREET_ON_M = 12;
  const STREET_NEAR_M = 30;
  /**
   * CW-61: how close the SECOND street has to be before the travel dialog is
   * allowed to call a spot a corner. MEASURED by walking away from 120 real
   * junctions along one of their own streets: at 0, 5 and 10 m offsets ALL
   * 120 still had a second street within twelve metres, and at 15 m only 27
   * did. The runner-up's distance tracks the offset exactly, so the cliff is
   * a cliff in distance and twelve metres sits inside it. It is ON_M's value
   * and ON_M's meaning - close enough to be standing in it - which is why it
   * is written as the same number rather than a second one that happens to
   * match.
   */
  const STREET_JUNCTION_M = STREET_ON_M;
  // At an intersection two streets are almost equidistant (at the Seattle
  // spawn, 4th Avenue at 8.1 m and Union Street at 9.0 m). Without a margin
  // the clause would flap between them on every step.
  const STREET_SWITCH_M = 4;
  // D-71: the HUD is one line and has to stay one line at 1280 px, and its
  // budget is about 1010 px. MEASURED in Denver: standing near "Embassy
  // Suites by Hilton Denver Downtown Convention Center" wrapped the line to
  // TWO lines at 1028 px BEFORE this release existed - a pre-existing defect
  // CW-27 only made easier to reach. Both long names are therefore shortened
  // here, which brings the same worst case back to 1008 px and one line.
  // Nothing is lost: the announcements always speak both names in full.
  const HUD_NAME_MAX_CHARS = 28;

  /** Shorten a name for the HUD ONLY, on a word boundary where it can. */
  function hudShortName(name) {
    if (name.length <= HUD_NAME_MAX_CHARS) return name;
    const cut = name.slice(0, HUD_NAME_MAX_CHARS);
    const space = cut.lastIndexOf(String.fromCharCode(32));
    return (
      (space > 12 ? cut.slice(0, space) : cut).trimEnd() +
      String.fromCharCode(8230)
    );
  }

  /**
   * Update which street the player is on. Keeps the current answer unless a
   * different street is clearly closer, so an intersection does not flap.
   */
  function updateStreet(game) {
    const hits = game.streetIndex.query(
      game.walkState.x,
      game.walkState.y,
      STREET_NEAR_M
    );
    let pick = hits[0] ?? null;
    if (pick && game.streetName && pick.name !== game.streetName) {
      const held = hits.find((h) => h.name === game.streetName);
      if (held && held.rank - pick.rank < STREET_SWITCH_M) pick = held;
    }
    game.streetName = pick ? pick.name : null;
    game.streetOn = pick ? pick.distM <= STREET_ON_M : false;
  }

  /**
   * CW-27: "Where am I?" on the X key and the toolbar button. One
   * announcement per press, whichever clauses are true — an empty clause is
   * never spoken, and a street the player is not on is never claimed.
   *
   * Every string here is FLAGGED for the owner (D-35).
   */
  function whereAmIMessage(game) {
    const facing = headingLabel(game.walkState.headingRad);
    const street = game.streetName;
    const landmark = game.nearLandmark;
    let where;
    if (street && game.streetOn) {
      where = landmark
        ? `You are on ${street}, near ${landmark}, facing ${facing}.`
        : `You are on ${street}, facing ${facing}.`;
    } else if (street) {
      where = landmark
        ? `You are near ${street} and ${landmark}, facing ${facing}.`
        : `You are near ${street}, facing ${facing}.`;
    } else if (landmark) {
      where = `You are near ${landmark}, facing ${facing}.`;
    } else {
      where = `You are not near a named street, facing ${facing}.`;
    }
    // CW-65: the fifth clause, appended to whichever of the four is true.
    // ★ SILENT WHEN THERE IS NOTHING TO SAY - before a traveler is placed and
    // after they are found - which is this function's own standing rule: "an
    // empty clause is never spoken, and a street the player is not on is never
    // claimed."
    // CW-80: the slope clause, under the same standing rule - level ground
    // says nothing, a flat city says nothing, and the words are the exact
    // sentences the walk announces, so X and the walk can never disagree.
    const slope = slopeReading(game);
    if (slope && slope.cat !== 'level') {
      // ACCESSIBILITY-CRITICAL STRING (D-35) — flagged for owner review.
      where = `${where} ${SLOPE_MESSAGES[slope.cat](slope.pct)}`;
    }
    const d = travelerDistanceM(game);
    if (d === null) return where;
    const band = TRAVELER_BANDS.find(([limit]) => d < limit);
    return `${where} ${band[1]}`;
  }

  function sayWhereYouAre() {
    const game = state.game;
    if (!game) return;
    // The street is normally refreshed on movement frames; standing still
    // and pressing X must still get a true answer.
    updateStreet(game);
    announceInLayer(whereAmIMessage(game));
    updateHud();
  }

  function updateHud() {
    const game = state.game;
    if (!game) return;
    // CW-60: which map you are looking at, written down. The pad and the
    // button both cycle without naming a destination, so a sighted player
    // needs somewhere to read the answer that is not the announcement.
    const view = game.mapView
      ? `map view · ${mapStyleById(state.mapStyle).name} · ` +
        `zoom ${game.mapCam.zoom.toFixed(1)}x`
      : `street view · speed ${game.speedLabel}%`;
    const near =
      !game.mapView && game.nearLandmark
        ? ` · near ${hudShortName(game.nearLandmark)}`
        : '';
    const looking = game.mapView ? null : pitchLabel(game.walkState.pitchRad);
    const gaze = looking ? ` · looking ${looking}` : '';
    // CW-20: a reason to wander. Only while there is something to count.
    const found =
      game.landmarks?.length > 0
        ? ` · landmarks ${game.visited?.size ?? 0}/${game.landmarks.length}`
        : '';
    // CW-27: where you are, next to which way you are facing. Says nothing
    // at all rather than naming a street the player is nowhere near.
    const street =
      !game.mapView && game.streetName
        ? ` · ${game.streetOn ? 'on' : 'near'} ${hudShortName(game.streetName)}`
        : '';
    const text =
      `${game.city.label} · facing ${headingLabel(game.walkState.headingRad)}` +
      `${street}${gaze} · ${view}${near}${found}`;
    if (text !== game.lastHudText) {
      game.lastHudText = text;
      state.refs.hudStatus.textContent = text;
    }
  }

  function handleViewportResize() {
    const game = state.game;
    if (!game) return;
    const { viewport } = state.refs;
    const width = Math.max(1, viewport.clientWidth);
    const height = Math.max(1, viewport.clientHeight);
    game.renderer.setSize(width, height);
    game.fpCamera.aspect = width / height;
    game.fpCamera.updateProjectionMatrix();
    applyMapCamera();
    game.altView.resize(width, height);
    game.altView.invalidate();
    measureToolbar();
  }

  function frame(nowMs) {
    const game = state.game;
    if (!game) return;
    state.rafId = requestAnimationFrame(frame);

    const dtS = Math.max(0, (nowMs - game.lastFrameMs) / 1000);
    game.lastFrameMs = nowMs;

    // CW-42: the entry calibration pass rides the first seconds of real
    // frames, in either view; it goes quiet the moment it is done.
    stepCalibration(game, nowMs);

    // CW-64: and so does the show. This sits ABOVE the view split on purpose -
    // the map branch below ends in `render(); return;`, so anything after it
    // never runs overhead, and a player who opens the map mid-show would watch
    // a dead map. Photographed exactly that way first.
    if (!game.motionReduced && stepFireworks(game, dtS, nowMs)) {
      game.altView.invalidate();
    }

    if (game.mapView) {
      // Map mode (CW-9): the movement keys drive the camera, not the
      // player — walking is suspended while the overhead view is open.
      const { viewport } = state.refs;
      const aspect =
        Math.max(1, viewport.clientWidth) / Math.max(1, viewport.clientHeight);
      const { changed } = stepMapCamera(
        game.mapCam,
        {
          panX:
            (state.keys.has('strafeRight') || state.keys.has('turnRight')
              ? 1
              : 0) -
            (state.keys.has('strafeLeft') || state.keys.has('turnLeft')
              ? 1
              : 0),
          panY:
            (state.keys.has('forward') ? 1 : 0) -
            (state.keys.has('back') ? 1 : 0),
          zoom:
            (state.keys.has('zoomIn') ? 1 : 0) -
            (state.keys.has('zoomOut') ? 1 : 0),
        },
        dtS,
        game.model.boundsM,
        aspect
      );
      if (game.mapCam.follow) {
        game.mapCam.centerX = game.walkState.x;
        game.mapCam.centerY = game.walkState.y;
      }
      if (changed) {
        applyMapCamera();
        game.altView.invalidate();
        updateHud();
      }
      game.altView.render();
      return;
    }

    // CW-81: raw axes first. Turn and pitch steer the look TARGET below
    // rather than the camera itself; movement still goes through stepWalk.
    const turnAxis =
      (state.keys.has('turnRight') ? 1 : 0) -
      (state.keys.has('turnLeft') ? 1 : 0);
    const pitchAxis =
      (state.keys.has('lookUp') ? 1 : 0) - (state.keys.has('lookDown') ? 1 : 0);
    const input = {
      forward:
        (state.keys.has('forward') ? 1 : 0) - (state.keys.has('back') ? 1 : 0),
      strafe:
        (state.keys.has('strafeRight') ? 1 : 0) -
        (state.keys.has('strafeLeft') ? 1 : 0),
      turn: 0,
      pitch: 0,
      fast: state.shiftHeld || state.fastWalk,
      speedLabel: game.speedLabel,
    };

    // The clamped dt every look and ramp step uses - the same clamp
    // stepWalk applies, so a background tab cannot spin the view either.
    const lookDt = Math.min(Math.max(dtS, 0), 0.1);
    const target = game.lookTarget;

    // Adopt any external re-pose (teleport, a standard view, a script)
    // before steering: the target follows the world, never the other way.
    if (game.lookSync.headingRad !== game.walkState.headingRad) {
      target.headingRad = game.walkState.headingRad;
    }
    if (game.lookSync.pitchRad !== (game.walkState.pitchRad ?? 0)) {
      target.pitchRad = game.walkState.pitchRad ?? 0;
    }
    if (turnAxis !== 0) {
      target.headingRad = normalizeHeading(
        target.headingRad + turnAxis * TURN_SPEED_RADPS * lookDt
      );
    }
    if (pitchAxis !== 0) {
      target.pitchRad = clampPitch(
        target.pitchRad + pitchAxis * PITCH_SPEED_RADPS * lookDt
      );
    }

    // Hover-look (CW-81, CW-Q72): the cursor's offset from the viewport
    // centre turns the target - dead zone at the middle, rate rising to
    // the axis maximum at the edge. Paused whenever the cursor is away,
    // a dialog is up, or the map owns the pointer; a live street drag also
    // pauses it (the drag would double every movement otherwise).
    if (
      game.lookMode === 'follow' &&
      game.hover.over &&
      // CW-87: the tour owns the heading while it drives - a parked cursor
      // must not wrestle the route.
      !game.tour &&
      !state.drag &&
      !state.travel &&
      !state.helpOpen &&
      state.refs.found?.hidden !== false
    ) {
      const curve = (n) => {
        const a = Math.min(1, Math.abs(n));
        if (a <= HOVER_DEAD_ZONE) return 0;
        return (Math.sign(n) * (a - HOVER_DEAD_ZONE)) / (1 - HOVER_DEAD_ZONE);
      };
      const yaw = curve(game.hover.nx);
      const tilt = curve(game.hover.ny);
      if (yaw !== 0) {
        target.headingRad = normalizeHeading(
          target.headingRad + yaw * HOVER_MAX_YAW_RADPS * lookDt
        );
      }
      if (tilt !== 0) {
        // Screen y grows downward; pitching up means the cursor is high.
        target.pitchRad = clampPitch(
          target.pitchRad - tilt * HOVER_MAX_PITCH_RADPS * lookDt
        );
      }
    }

    // The critically damped follow (the §10 reading): the camera chases the
    // target and SNAPS the last fraction of a degree, so the exponential
    // tail cannot keep the converter busy forever.
    let turned = false;
    let pitched = false;
    {
      const alpha = 1 - Math.exp(-lookDt / LOOK_FOLLOW_TAU_S);
      let dh = target.headingRad - game.walkState.headingRad;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      if (Math.abs(dh) > LOOK_SNAP_RAD) {
        game.walkState.headingRad = normalizeHeading(
          game.walkState.headingRad + dh * alpha
        );
        turned = true;
      } else if (dh !== 0) {
        game.walkState.headingRad = target.headingRad;
        turned = true;
      }
      const dp = target.pitchRad - (game.walkState.pitchRad ?? 0);
      if (Math.abs(dp) > LOOK_SNAP_RAD) {
        game.walkState.pitchRad = clampPitch(
          (game.walkState.pitchRad ?? 0) + dp * alpha
        );
        pitched = true;
      } else if (dp !== 0) {
        game.walkState.pitchRad = target.pitchRad;
        pitched = true;
      }
      game.lookSync.headingRad = game.walkState.headingRad;
      game.lookSync.pitchRad = game.walkState.pitchRad ?? 0;
    }

    // Auto-walk (CW-81, CW-Q80): any WALK input the player makes takes the
    // wheel back - and stops the auto-walk, announced.
    if (game.autoWalk && (input.forward !== 0 || input.strafe !== 0)) {
      setAutoWalk(false, AUTO_WALK_OFF_MESSAGE);
    }
    // CW-87: the same law for the tour - a walk key is the player driving.
    if (game.tour && (input.forward !== 0 || input.strafe !== 0)) {
      stopTour(TOUR_STOPPED_MESSAGE);
    }

    // CW-87: the tour drives exactly like auto-walk - one look target, the
    // same ramp - with the heading taken from the route. Reached waypoints
    // advance (several can fall in one frame on a short leg), a real bend
    // is spoken before the walker turns into it, and arrival is SILENT
    // here: the route ends inside the waypoint's touch ring, so the CW-78
    // touch speaks the landmark - one arrival, one sentence.
    if (game.tour) {
      const t = game.tour;
      const w = game.walkState;
      let wp = t.route[t.at];
      while (
        wp &&
        Math.hypot(wp.x - w.x, wp.y - w.y) <= TOUR_WAYPOINT_REACH_M
      ) {
        t.at += 1;
        const next = t.route[t.at];
        if (next) announceTourTurn(game, wp, next);
        wp = next;
      }
      if (!wp) {
        game.tour = null;
      } else {
        const bearing = Math.atan2(wp.x - w.x, wp.y - w.y);
        target.headingRad = bearing;
        let err = bearing - w.headingRad;
        while (err > Math.PI) err -= 2 * Math.PI;
        while (err < -Math.PI) err += 2 * Math.PI;
        if (t.holding) {
          if (Math.abs(err) <= TOUR_RESUME_ANGLE_RAD) t.holding = false;
        } else if (Math.abs(err) >= TOUR_HOLD_ANGLE_RAD) {
          t.holding = true;
        }
        if (t.holding) {
          // Stop-turn-go must actually STOP: the ramp's release glide
          // would replay the last stride past the vertex, into the very
          // corner the hold exists to respect.
          game.lastMove.forward = 0;
          game.lastMove.strafe = 0;
        } else {
          input.forward = 1;
        }
      }
    }

    if (game.autoWalk) {
      input.forward = 1;
      // CW-87 street-following: when the way ahead closes, steer along the
      // clearest continuing pavement instead of walking into the wall. The
      // fan only runs once the run ahead is short, so over open ground the
      // player's own turning is never fought; when the fan finds nothing
      // (a true dead end) the walker presses on and the blocked stop below
      // says so - that sentence is now reserved for dead ends.
      const w = game.walkState;
      if (
        clearRunAhead(
          game.collision,
          w.x,
          w.y,
          w.headingRad,
          AUTO_WALK_STEER_AT_M
        ) < AUTO_WALK_STEER_AT_M
      ) {
        const steer = steerHeading(game.collision, w.x, w.y, w.headingRad);
        if (steer !== null) target.headingRad = normalizeHeading(steer);
      }
    }

    // The acceleration ramp: no frame starts at full speed from rest, and
    // releasing the keys glides to a stop over the same quarter second.
    const wantsMove = input.forward !== 0 || input.strafe !== 0;
    if (wantsMove) {
      game.lastMove.forward = input.forward;
      game.lastMove.strafe = input.strafe;
      game.walkRamp = Math.min(1, game.walkRamp + lookDt / WALK_RAMP_S);
    } else if (game.walkRamp > 0) {
      game.walkRamp = Math.max(0, game.walkRamp - lookDt / WALK_RAMP_S);
      input.forward = game.lastMove.forward;
      input.strafe = game.lastMove.strafe;
    }
    input.speedScale = game.walkRamp;

    const wasX = game.walkState.x;
    const wasY = game.walkState.y;
    const wasGroundZ = game.walkState.groundZ;
    const { moved } = stepWalk(game.walkState, input, dtS, game.collision);

    // CW-50: the eye climbs a curb over GROUND COVERED, not over time, so
    // this is fed the distance actually walked. It keeps re-posing the camera
    // while the climb finishes, which is why it is its own reason to redraw:
    // a walker crossing a kerb diagonally is still rising after the frame
    // that carried them over it.
    if (moved) {
      easeGroundZ(
        game.walkState,
        game.surface,
        Math.hypot(game.walkState.x - wasX, game.walkState.y - wasY)
      );
    }
    const climbed = game.walkState.groundZ !== wasGroundZ;

    if (moved || turned || pitched || climbed) {
      applyFirstPersonCamera();
      if (moved) {
        updateStreet(game);
        const near = nearestLandmarkName(
          game.landmarks,
          game.walkState.x,
          game.walkState.y,
          game.nearLandmark
        );
        if (near !== game.nearLandmark) {
          game.nearLandmark = near;
          if (near) {
            announceInLayer(`Near ${near}.`);
            markVisited(game, near);
          }
        }
        // CW-65: and whether you have walked up to the traveler. Checked on
        // the same movement frames a landmark is, so standing still never
        // triggers it and a single step can never step PAST the radius - the
        // walk is stepped in hops of PLAYER_RADIUS_M / 2 (CW-48).
        checkTravelerFind(game);
        // CW-78: and whether you have walked INTO a waypoint. The plinth's
        // cell blocks, so the walk stops pressed against it - the touch
        // radius is that pressed-against distance, and the leave radius is
        // the hysteresis that makes one touch one sentence.
        checkWaypointTouch(game); // CW-80: and what the street under the next stride does. Spoken
        // only on a real change, only after real ground covered, and only
        // where the city HAS terrain - a flat extract never says a word.
        checkSlope(
          game,
          Math.hypot(game.walkState.x - wasX, game.walkState.y - wasY)
        );
      }
      game.altView.invalidate();
      updateHud();
    }

    // CW-81: auto-walk stops at a wall, and says so. Only once the ramp has
    // real speed - the first ramp frames legitimately move less than a hop
    // and must not read as a collision. Since CW-87 steers along the
    // street, this sentence is reserved for a true dead end.
    if (game.autoWalk && !moved && game.walkRamp > 0.5) {
      setAutoWalk(false, AUTO_WALK_BLOCKED_MESSAGE);
    }
    // CW-87: the tour's own version - never while deliberately standing to
    // turn (the hold is not a collision).
    if (game.tour && !game.tour.holding && !moved && game.walkRamp > 0.5) {
      stopTour(TOUR_BLOCKED_MESSAGE);
    }

    // CW-19: the signals are the one thing in this time-frozen city that
    // moves, and they only ask for a repaint when a head actually changes —
    // about once every two seconds, not once a frame. Reduced motion stops
    // the clock entirely, which leaves every light holding a real state
    // rather than going dark.
    if (!game.mapView && !game.motionReduced) {
      const elapsed = performance.now() - game.startedAtMs;
      const changed = game.props?.trafficLights?.update(elapsed);
      const weatherMoved = stepWeather(game, dtS, elapsed);
      if (changed || weatherMoved) game.altView.invalidate();
    }
    game.altView.render();
  }

  return { open, close };
}

/** Test hook: whether a session is currently open. */
export function isCityWalkOpen() {
  return activeSession !== null;
}
