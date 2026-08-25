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
  Mesh,
  MeshBasicMaterial,
} from 'three';
import {
  parseCityExtract,
  extractLandmarks,
  nearestLandmarkName,
  buildStreetIndex,
} from './city-data.js';
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
} from './walk-controls.js';
import { initAltView } from '../_hfm.js';
import {
  CALIBRATION_CANDIDATES,
  CALIBRATION_SAMPLES_PER_SCALE,
  chooseCalibratedSize,
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
  MONO_BLOOM_PX,
  MONO_GLOW_FADE,
} from './hc-palettes.js';
import { buildRain, RAIN_LEVEL_COUNT, RAIN_LEVEL_NAMES } from './city-scene.js';
import { buildCityCameraPanel } from './city-camera-panel.js';
import { createClassPass } from './city-class-pass.js';
import { GLYPH_VOCABULARIES } from './glyph-vocabularies.js';
import {
  safeGetItem,
  safeSetItem,
  STORAGE_KEY_HFM_FONT_SCALE,
  STORAGE_KEY_CITY_WALK_SPEED,
  STORAGE_KEY_CITY_WALK_FONT_SCALE,
  STORAGE_KEY_CITY_WALK_CALIBRATED_FLOOR,
  STORAGE_KEY_CITY_WALK_COLOUR,
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
// announcements with it. The button arms PIN MODE instead; a click commits.
const TELEPORT_MODE_ON_MESSAGE =
  'Teleport mode on. Click the map to travel there.';
const TELEPORT_MODE_OFF_MESSAGE = 'Teleport mode off.';
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
    teleportArmed: false,
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
    if (state.helpOpen) {
      toggleHelp(false);
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
      'Drag with the mouse in street view: look around',
      'Shift (hold): move faster',
      'Left and Right Bracket: walking speed down or up',
      'M: switch between street view and map view',
      'On the map: arrow keys pan, Page Up and Page Down zoom, Home returns to you',
      'On the map: press Teleport, then click where you want to go; J drops you at the middle of the map',
      'L and Shift+L: cycle landmarks on the map',
      'X: say where you are',
      // CW-42 (CW-Q39): the bottom of the range is per machine now, so the
      // help says how it is set instead of naming a number.
      'Minus and Equals: smaller or larger characters, up to 100% ' +
        "(the smallest size is set by this machine's own speed)",
      'C: high contrast on or off',
      'T: change the theme',
      'O: color on or off (off is a single-color retro screen)',
      'G: rain off, light, heavy (stays off if you use reduced motion)',
      'P: save a picture of what you can see',
      'High contrast, theme and color: the three buttons at the top of the screen',
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
      contrastBtn,
      themeBtn,
      colourBtn,
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
      hud,
      hudStatus,
      help,
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
        // CW-35: Fast moved here when the Move group retired. The Camera
        // panel has no equivalent, and Shift is a KEYBOARD route only — with
        // no button, anyone walking the city by mouse or touch would have
        // lost the ability to hurry entirely. It belongs with Speed anyway.
        {
          id: 'cityWalkFastBtn',
          label: 'Fast',
          keys: 'Shift (hold)',
          press: toggleFastWalk,
          toggle: true,
          views: 'street',
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
      name: 'Weather',
      buttons: [
        {
          id: 'cityWalkPhotoBtn',
          label: 'Photo',
          keys: 'P',
          press: savePhoto,
          views: 'both',
        },
        {
          id: 'cityWalkRainBtn',
          label: 'Rain',
          keys: 'G',
          press: cycleRain,
          toggle: true,
          views: 'street',
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
        // CW-40 (CW-Q40): an ARMING TOGGLE now, not a commit button. Press
        // it, the cursor becomes the ring, and a click on the map travels
        // there. J stays the keyboard commit at the centre crosshair, which
        // is why it is still the key this button teaches.
        {
          id: 'cityWalkTeleportBtn',
          label: 'Teleport',
          keys: 'J',
          press: toggleTeleportMode,
          toggle: true,
          views: 'map',
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

      for (const spec of group.buttons) {
        const btn = makeToolbarButton(spec);
        groupEl.appendChild(btn);
        buttons.push({ spec, btn });
        if (spec.id === 'cityWalkMapBtn') mapBtn = btn;
        if (spec.id === 'cityWalkFastBtn') fastBtn = btn;
      }

      el.appendChild(groupEl);
    }

    return { el, buttons, mapBtn, fastBtn };
  }

  function makeToolbarButton(spec) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secondary city-walk-btn city-walk-toolbar-btn';
    btn.id = spec.id;
    btn.textContent = spec.label;
    // The tooltip teaches the key instead of repeating the visible label,
    // which stays the accessible name.
    btn.title = 'Keyboard: ' + spec.keys;
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
    const { toolbarButtons, mapBtn, fastBtn } = state.refs;
    if (!toolbarButtons) return;
    const mapView = Boolean(state.game?.mapView);

    mapBtn?.setAttribute('aria-pressed', mapView ? 'true' : 'false');
    fastBtn?.setAttribute('aria-pressed', state.fastWalk ? 'true' : 'false');

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

    const teleportBtn = toolbarButtons.find(
      (b) => b.spec.id === 'cityWalkTeleportBtn'
    )?.btn;
    teleportBtn?.setAttribute(
      'aria-pressed',
      state.teleportArmed ? 'true' : 'false'
    );

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

    const hint = document.createElement('p');
    hint.className = 'city-walk-legend-hint';
    hint.textContent = 'L cycles landmarks on the map.';
    legend.appendChild(hint);
  }

  /**
   * Refresh legend rows with the compass direction from the player and mark
   * the selected landmark. Directions update when the map opens, not per
   * frame — the player cannot move while the map is up.
   */
  function refreshLegend(game) {
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

    const city3d = buildCityGroup(model);
    scene.add(city3d.group);
    // Streets are visible in both views since CW-8: dim under the fog at
    // street level, brightened into the map's street network overhead
    // (city3d.setMapView swaps the tone on toggle).
    const lighting = attachCityLighting(scene, fpCamera);

    // Landmarks (CW-10): beacons on the map, a legend, proximity text.
    const landmarks = extractLandmarks(model);
    const beacons = buildLandmarkBeacons(landmarks);
    beacons.group.visible = false;
    scene.add(beacons.group);
    buildLegend(landmarks);

    // Bright beacon marking the player in the top-down map view, sized
    // relative to the city so it stays visible at map scale.
    const spanM = Math.max(
      model.boundsM.maxX - model.boundsM.minX,
      model.boundsM.maxY - model.boundsM.minY,
      100
    );
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

    // CW-36's pick-preview ring retired with the pick flow (CW-40): while
    // pin mode is armed the ring is the CURSOR, and the committed landing
    // is marked by the player marker itself - the walker is really there.

    // Order matters here. The collision grid is built from the buildings
    // first so the props can refuse to stand inside one; the props then hand
    // back their own footprints, which are stamped in BEFORE the spawn probe
    // runs — otherwise the player can start the game inside a parked car.
    const collision = buildCollisionGrid(model);
    const props = buildStreetProps(model, collision);
    // CW-20: weather. The drops are scene geometry going through the same
    // pipeline as the city, so the converter turns them into streak
    // characters for free — no DOM rain, no converter changes.
    const rain = buildRain();
    scene.add(rain.group);
    scene.add(props.group);
    stampObstacles(collision, props.obstacles);
    const spawn = findSpawn(model, collision);
    // CW-44: face down the open street, never into whatever happens to
    // stand north - the bigger Seattle's spawn had a storefront 2.5 m that
    // way, and a first frame nose-to-wall walks the player straight into it.
    const walkState = createWalkState({
      ...spawn,
      headingRad: findClearHeading(collision, spawn.x, spawn.y),
    });
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
      lighting,
      marker,
      markerGeom,
      markerMat,
      markerInnerGeom,
      markerInnerMat,
      collision,
      walkState,
      mapCam,
      speedLabel,
      landmarks,
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
      classMapProvider: (cols, rows) =>
        game.classPass?.read(
          game.mapView ? orthoCamera : fpCamera,
          cols,
          rows
        ) ?? null,
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
    game.calibratedFloor = storedCalibration?.floorScale ?? null;
    game.altView.setFontScale(
      seedCharScale(
        savedManualScale,
        safeGetItem(STORAGE_KEY_HFM_FONT_SCALE),
        storedCalibration?.defaultScale ?? null
      )
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

    // CW-Q2/CW-Q5/CW-Q6: multicolor exists ONLY under high contrast —
    // neon in amber (light), the ANSI bright set in green (dark). The
    // observer follows live theme/contrast flips (e.g. a system
    // prefers-color-scheme change mid-game).
    applyHcPalette(game);
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
    // CW-20: which landmarks this session has walked past. Per-session on
    // purpose — a fresh city is a fresh walk, and nothing is stored.
    game.visited = new Set();
    game.announcedAllFound = false;
    game.rainLevel = null;
    game.thunderStartMs = 0;
    game.nextThunderMs = THUNDER_GAP_MS;
    game.motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    game.motionReduced = Boolean(game.motionQuery?.matches);
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
    }

    applyFirstPersonCamera();
    applyMapCamera();
    updateHud();
    syncToolbarView();

    game.resizeObserver = new ResizeObserver(() => handleViewportResize());
    game.resizeObserver.observe(viewport);

    viewport.addEventListener('pointerdown', handleViewportPointerDown);
    viewport.addEventListener('pointermove', handleViewportPointerMove);
    viewport.addEventListener('pointerup', handleViewportPointerUp);
    viewport.addEventListener('pointercancel', handleViewportPointerUp);

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
    game.rain?.dispose();
    game.classPass?.dispose();
    game.altView?.dispose();
    game.lighting?.detach();
    game.beacons?.dispose();
    game.city3d?.dispose();
    game.props?.dispose();
    game.markerGeom?.dispose();
    game.markerMat?.dispose();
    game.markerInnerGeom?.dispose();
    game.markerInnerMat?.dispose();
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

    const action = KEY_ACTIONS.get(event.code);
    if (action) {
      event.preventDefault();
      event.stopPropagation();
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
      // CW-40 (CW-Q40): while pin mode is armed, a click on the map IS the
      // teleport - one step, no confirmation press. Unarmed, a click does
      // nothing here again (the pre-CW-36 behaviour): the two-step
      // pick-then-J flow this branch used to start is retired, and a ring
      // that no longer led anywhere would be a promise the game cannot
      // keep.
      if (state.teleportArmed) {
        const world = mapPointToWorld(event.clientX, event.clientY);
        if (world) commitTeleport(world.x, world.y);
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
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!game || game.mapView) {
      endDrag();
      return;
    }

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
    // mouselook every first-person game uses.
    const { turned, pitched } = applyLookDelta(
      game.walkState,
      dx * DRAG_RAD_PER_PX,
      -dy * DRAG_RAD_PER_PX
    );
    if (!turned && !pitched) return;

    applyFirstPersonCamera();
    game.altView.invalidate();
    updateHud();
  }

  function handleViewportPointerUp(event) {
    if (state.drag && state.drag.pointerId !== event.pointerId) return;
    endDrag();
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
    refreshLegend(game);
    updateHud();
    if (
      !game.announcedAllFound &&
      game.landmarks.length > 0 &&
      game.visited.size >= game.landmarks.length
    ) {
      game.announcedAllFound = true;
      // ACCESSIBILITY-CRITICAL STRING (D-35) — flagged for owner review.
      announceInLayer(ALL_LANDMARKS_MESSAGE);
    }
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
    if (delta < 0 && floorRaised && current <= floor + 1e-9) {
      // The stop is the calibrated floor, and it says why (CW-Q39). Also
      // true below the floor (a grandfathered manual choice): calibration
      // found smaller sizes cannot hold the bar on this machine.
      announceInLayer(
        `Character size ${Math.round(current * 100)} percent. Smaller ` +
          'sizes cannot hold 30 frames per second on this machine.'
      );
      return;
    }
    // Clamp to the GAME's range before the renderer sees it: the renderer
    // instance itself accepts down to 0.05, which is below the smallest size
    // that changes anything on screen. The calibrated floor bounds gestures
    // only - a stored below-floor manual choice was seeded as-is.
    const next = clampCharScale(current + delta, floor);
    game.altView.setFontScale(next);
    syncCellRaster(game);
    game.altView.invalidate();
    safeSetItem(STORAGE_KEY_CITY_WALK_FONT_SCALE, String(next));
    syncCharSizeControls();
    announceInLayer(`Character size ${Math.round(next * 100)} percent.`);
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
      !CALIBRATION_CANDIDATES.some((s) => sameScale(s, current))
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
    const result = chooseCalibratedSize(cal.readings);
    cal.result = result;
    game.calibratedFloor = result.floorScale;
    safeSetItem(
      STORAGE_KEY_CITY_WALK_CALIBRATED_FLOOR,
      encodeCalibration(result)
    );
    if (cal.manual) {
      restoreEntryScale(game);
    } else if (!sameScale(game.altView.getFontScale(), result.defaultScale)) {
      // The calibrated default lands through the renderer only - writing
      // the manual key here would freeze the calibration as a choice.
      game.altView.setFontScale(result.defaultScale);
      syncCellRaster(game);
      game.altView.invalidate();
    }
    syncCharSizeControls();
    if (result.fallback) {
      const pct = Math.round(game.altView.getFontScale() * 100);
      announceInLayer(
        'Small character sizes cannot hold 30 frames per second on this ' +
          `machine. Character size stays at ${pct} percent.`
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
    const floor = game?.calibratedFloor;
    const atFloor =
      Boolean(game) &&
      Number.isFinite(floor) &&
      floor > CHAR_SCALE_MIN + 1e-9 &&
      game.altView.getFontScale() <= floor + 1e-9;
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
  }

  function toggleMapView() {
    const game = state.game;
    endDrag();
    game.mapView = !game.mapView;
    game.marker.visible = game.mapView;
    // CW-40: pin mode belongs to the map it was armed on. Leaving the map
    // disarms it - silently, because this function's own announcement is
    // the sentence this turn speaks.
    if (!game.mapView) setTeleportArmed(false, false);
    game.city3d.setMapView(game.mapView);
    game.props.setMapView(game.mapView);
    // CW-20: the weather belongs to the street. Seen from overhead the drops
    // streak diagonally across the whole map and read as scratches on the
    // picture rather than as rain — caught by eye in the four-city tour.
    if (game.rain)
      game.rain.group.visible = !game.mapView && game.rainLevel !== null;
    game.lighting.setMapBoost(game.mapView);
    game.beacons.group.visible = game.mapView;
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
        ? 'Map view, seen from above. Arrow keys pan, Page Up and Page Down zoom, Home returns to you. The toolbar now shows the map buttons.'
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
   * CW-40 (CW-Q40): the Teleport button arms PIN MODE. This supersedes
   * CW-36's pick-then-J: while armed, a left click on the map IS the
   * teleport, in one step, and the game stays on the map - entering the
   * street is the player's separate choice. A second press disarms, and
   * leaving the map disarms silently (the view change's own sentence is
   * the one announcement that turn makes).
   */
  function toggleTeleportMode() {
    const game = state.game;
    if (!game?.mapView) return;
    setTeleportArmed(!state.teleportArmed, true);
  }

  function setTeleportArmed(armed, announce) {
    if (state.teleportArmed === armed) return;
    state.teleportArmed = armed;
    // The ring the pick flow used to draw in the world is the CURSOR now.
    state.refs.viewport?.classList.toggle('city-walk-teleport-armed', armed);
    syncToolbarView();
    if (announce) {
      announceInLayer(
        armed ? TELEPORT_MODE_ON_MESSAGE : TELEPORT_MODE_OFF_MESSAGE
      );
    }
  }

  /**
   * J: commit at the map's centre crosshair, armed or not. The keyboard
   * route needs no arming, because the arrows already steer the middle of
   * the screen onto a street and PageUp/PageDown already zoom it (CW-Q41),
   * so travelling from the keyboard was always one step.
   */
  function teleportAtCrosshair() {
    const game = state.game;
    if (!game || !game.mapView) return;
    commitTeleport(game.mapCam.centerX, game.mapCam.centerY);
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
    if (street && game.streetOn) {
      return landmark
        ? `You are on ${street}, near ${landmark}, facing ${facing}.`
        : `You are on ${street}, facing ${facing}.`;
    }
    if (street) {
      return landmark
        ? `You are near ${street} and ${landmark}, facing ${facing}.`
        : `You are near ${street}, facing ${facing}.`;
    }
    if (landmark) return `You are near ${landmark}, facing ${facing}.`;
    return `You are not near a named street, facing ${facing}.`;
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
    const view = game.mapView
      ? `map view · zoom ${game.mapCam.zoom.toFixed(1)}x`
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

    const input = {
      forward:
        (state.keys.has('forward') ? 1 : 0) - (state.keys.has('back') ? 1 : 0),
      strafe:
        (state.keys.has('strafeRight') ? 1 : 0) -
        (state.keys.has('strafeLeft') ? 1 : 0),
      turn:
        (state.keys.has('turnRight') ? 1 : 0) -
        (state.keys.has('turnLeft') ? 1 : 0),
      pitch:
        (state.keys.has('lookUp') ? 1 : 0) -
        (state.keys.has('lookDown') ? 1 : 0),
      fast: state.shiftHeld || state.fastWalk,
      speedLabel: game.speedLabel,
    };

    const { moved, turned, pitched } = stepWalk(
      game.walkState,
      input,
      dtS,
      game.collision
    );

    if (moved || turned || pitched) {
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
      }
      game.altView.invalidate();
      updateHud();
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
