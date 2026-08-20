/**
 * ASCII City Walk — game layer controller (CW-4).
 *
 * Lifecycle owner for the hidden walking game: builds the fullscreen layer
 * DOM, forces the mono (Alt View) variant on while open, loads a bundled
 * city extract, and renders its own three.js scene through a dedicated
 * instance of the Alt View ASCII converter (initAltView — per-instance
 * since CW-1). Every action has a key (Q-67): arrows/WASD walk, Q/E turn,
 * R/F look up and down, V levels the gaze, Shift is faster, M toggles the
 * top-down map view, H help, Escape leaves. Dragging the viewport with a
 * pointer looks around too (CW-13) — an addition for mouse players, never
 * the only way to reach anything.
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
} from './city-data.js';
import {
  buildCityGroup,
  attachCityLighting,
  buildLandmarkBeacons,
} from './city-scene.js';
import {
  createWalkState,
  stepWalk,
  firstPersonPose,
  levelView,
  headingLabel,
  pitchLabel,
  buildCollisionGrid,
  findSpawn,
  createMapCamera,
  stepMapCamera,
  recenterMapCamera,
  mapCameraFrustum,
  clampCharScale,
  seedCharScale,
  CHAR_SCALE_MIN,
  CHAR_SCALE_STEP,
} from './walk-controls.js';
import { initAltView } from '../_hfm.js';
import { createDocumentFocusTrap } from '../focus-trap.js';
import { announce } from '../announcer.js';
import { HC_PALETTE_GREEN, HC_PALETTE_AMBER } from './hc-palettes.js';
import {
  safeGetItem,
  safeSetItem,
  STORAGE_KEY_HFM_FONT_SCALE,
  STORAGE_KEY_CITY_WALK_SPEED,
  STORAGE_KEY_CITY_WALK_FONT_SCALE,
} from '../storage-keys.js';

// Bundled extracts (Q-68). Slugs match public/examples/ascii-city/*.json.
const CITIES = [
  { slug: 'seattle', label: 'Seattle, Washington' },
  { slug: 'denver', label: 'Denver, Colorado' },
  { slug: 'albuquerque', label: 'Albuquerque, New Mexico' },
  { slug: 'burnaby', label: 'Burnaby, British Columbia' },
];

const ORTHO_CAMERA_HEIGHT_M = 1000;

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
    keys: new Set(),
    shiftHeld: false,
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

    announceInLayer('ASCII City Walk opened. Choose a city to start walking.');
  }

  function close() {
    unloadCity();

    state.trap?.deactivate();
    layer.removeEventListener('keydown', handleGameKeyDown);
    layer.removeEventListener('keyup', handleGameKeyUp);
    window.removeEventListener('blur', clearHeldKeys);

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
      'On the map: arrow keys pan, Minus and Equals zoom, Home returns to you',
      'L and Shift+L: cycle landmarks on the map',
      `Minus and Equals in street view: smaller or larger characters (${Math.round(
        CHAR_SCALE_MIN * 100
      )}% to 100%)`,
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
      helpBtn,
      exitBtn,
      startPanel,
      startError,
      cityButtons: Array.from(cityList.children),
      firstCityBtn,
      viewport,
      hud,
      hudStatus,
      help,
      legend,
      announcer,
    };
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
      li.textContent = `${lm.name} — ${headingLabel(bearing)}`;
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

    let model;
    try {
      const response = await fetch(`/examples/ascii-city/${city.slug}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      model = parseCityExtract(await response.json());
    } catch (error) {
      console.error(`[CityWalk] Could not load ${city.slug}:`, error);
      pickedBtn.removeAttribute('aria-busy');
      refs.cityButtons.forEach((b) => (b.disabled = false));
      refs.startError.textContent =
        'That city could not be loaded. Check your connection and try again.';
      refs.startError.hidden = false;
      return;
    }

    refs.startPanel.hidden = true;
    refs.viewport.hidden = false;
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
    const markerMat = new MeshBasicMaterial({ color: 0xffffff });
    const marker = new Mesh(markerGeom, markerMat);
    marker.visible = false;
    scene.add(marker);

    const collision = buildCollisionGrid(model);
    const spawn = findSpawn(model, collision);
    const walkState = createWalkState({ ...spawn, headingRad: 0 });
    const mapCam = createMapCamera(model.boundsM);

    // CW-Q8: persisted walking-speed multiplier (comfort preference).
    const savedSpeed = parseFloat(
      safeGetItem(STORAGE_KEY_CITY_WALK_SPEED) ?? ''
    );
    const speedScale = Number.isFinite(savedSpeed)
      ? Math.max(0.5, Math.min(3, savedSpeed))
      : 1;

    const game = {
      city,
      model,
      renderer,
      scene,
      fpCamera,
      orthoCamera,
      city3d,
      lighting,
      marker,
      markerGeom,
      markerMat,
      collision,
      walkState,
      mapCam,
      speedScale,
      landmarks,
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
    game.altView = await initAltView(managerLike, { allowTinyCells: true });

    // Character size (CW-Q10): the game's own saved value wins, then the
    // shared Alt View preference clamped into the game's range, then 50%.
    // The game persists to its OWN key and never writes the shared pref back,
    // because the game's range reaches far below the preview slider's floor.
    game.altView.setFontScale(
      seedCharScale(
        safeGetItem(STORAGE_KEY_CITY_WALK_FONT_SCALE),
        safeGetItem(STORAGE_KEY_HFM_FONT_SCALE)
      )
    );

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

    if (import.meta.env.DEV) {
      // Dev-lane debug handle (mirrors hfm-controller's DEV-only logging).
      window.__cityWalkGame = game;
    }

    applyFirstPersonCamera();
    applyMapCamera();
    updateHud();

    game.resizeObserver = new ResizeObserver(() => handleViewportResize());
    game.resizeObserver.observe(viewport);

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
    const { viewport, startPanel, hud } = state.refs;
    viewport.hidden = true;
    hud.hidden = true;
    startPanel.hidden = false;
    state.refs.cityButtons.forEach((b) => (b.disabled = true));
    state.refs.startError.textContent =
      '3D rendering is not available in this browser, so the city cannot ' +
      'be drawn. Press Escape to leave the game.';
    state.refs.startError.hidden = false;
  }

  /**
   * CW-Q2 gate: palette only when high contrast is on; scheme picks the set
   * (light = amber -> neon, dark = green -> ANSI bright). Otherwise the
   * classic single phosphor.
   */
  function applyHcPalette(game) {
    const root = document.documentElement;
    const hc = root.getAttribute('data-high-contrast') === 'true';
    if (!hc) {
      game.altView.setPalette(null);
      return;
    }
    const light = root.getAttribute('data-theme') === 'light';
    // chromaBoost exaggerates the scene's deliberately mild tints (kept low
    // so monochrome stays luminance-true) into decisive palette picks.
    game.altView.setPalette(light ? HC_PALETTE_AMBER : HC_PALETTE_GREEN, {
      chromaBoost: 3.5,
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
    game.altView?.dispose();
    game.lighting?.detach();
    game.beacons?.dispose();
    game.city3d?.dispose();
    game.markerGeom?.dispose();
    game.markerMat?.dispose();
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

    if (
      event.code === 'Minus' ||
      event.code === 'NumpadSubtract' ||
      event.code === 'Equal' ||
      event.code === 'NumpadAdd'
    ) {
      event.preventDefault();
      event.stopPropagation();
      const minus = event.code === 'Minus' || event.code === 'NumpadSubtract';
      if (state.game.mapView) {
        // Map mode: -/= are HELD zoom keys (see frame()).
        state.keys.add(minus ? 'zoomOut' : 'zoomIn');
      } else {
        adjustCharacterSize(minus ? -CHAR_SCALE_STEP : CHAR_SCALE_STEP);
      }
      return;
    }

    if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      event.preventDefault();
      event.stopPropagation();
      adjustWalkSpeed(event.code === 'BracketLeft' ? -0.25 : 0.25);
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
      recenterMapCamera(
        state.game.mapCam,
        state.game.walkState.x,
        state.game.walkState.y
      );
      applyMapCamera();
      state.game.altView.invalidate();
      updateHud();
      announceInLayer('Map centered on you.');
      return;
    }

    const action = KEY_ACTIONS.get(event.code);
    if (action) {
      event.preventDefault();
      event.stopPropagation();
      state.keys.add(action);
    }
  }

  function handleGameKeyUp(event) {
    if (event.key === 'Shift') {
      state.shiftHeld = false;
      return;
    }
    if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
      state.keys.delete('zoomOut');
    }
    if (event.code === 'Equal' || event.code === 'NumpadAdd') {
      state.keys.delete('zoomIn');
    }
    const action = KEY_ACTIONS.get(event.code);
    if (action) state.keys.delete(action);
  }

  function clearHeldKeys() {
    state.keys.clear();
    state.shiftHeld = false;
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

  function adjustCharacterSize(delta) {
    const game = state.game;
    if (!game) return;
    // Clamp to the GAME's range before the renderer sees it: the renderer
    // instance itself accepts down to 0.05, which is below the smallest size
    // that changes anything on screen.
    const next = clampCharScale(game.altView.getFontScale() + delta);
    game.altView.setFontScale(next);
    game.altView.invalidate();
    safeSetItem(STORAGE_KEY_CITY_WALK_FONT_SCALE, String(next));
    announceInLayer(`Character size ${Math.round(next * 100)} percent.`);
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
  }

  function toggleMapView() {
    const game = state.game;
    game.mapView = !game.mapView;
    game.marker.visible = game.mapView;
    game.city3d.setMapView(game.mapView);
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
      state.keys.delete('zoomIn');
      state.keys.delete('zoomOut');
      game.landmarkIndex = -1;
      game.beacons.setSelected(null);
    }
    game.altView.invalidate();
    updateHud();
    announceInLayer(
      game.mapView
        ? 'Map view, seen from above. Arrow keys pan, minus and equals zoom, Home returns to you.'
        : 'Street view.'
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
    game.speedScale = Math.max(
      0.5,
      Math.min(3, Math.round((game.speedScale + delta) * 100) / 100)
    );
    safeSetItem(STORAGE_KEY_CITY_WALK_SPEED, String(game.speedScale));
    updateHud();
    announceInLayer(
      `Walking speed ${Math.round(game.speedScale * 100)} percent.`
    );
  }

  function updateHud() {
    const game = state.game;
    if (!game) return;
    const view = game.mapView
      ? `map view · zoom ${game.mapCam.zoom.toFixed(1)}x`
      : `street view · speed ${Math.round(game.speedScale * 100)}%`;
    const near =
      !game.mapView && game.nearLandmark ? ` · near ${game.nearLandmark}` : '';
    const looking = game.mapView ? null : pitchLabel(game.walkState.pitchRad);
    const gaze = looking ? ` · looking ${looking}` : '';
    const text =
      `${game.city.label} · facing ${headingLabel(game.walkState.headingRad)}` +
      `${gaze} · ${view}${near}`;
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
  }

  function frame(nowMs) {
    const game = state.game;
    if (!game) return;
    state.rafId = requestAnimationFrame(frame);

    const dtS = Math.max(0, (nowMs - game.lastFrameMs) / 1000);
    game.lastFrameMs = nowMs;

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
      fast: state.shiftHeld,
      speedScale: game.speedScale,
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
        const near = nearestLandmarkName(
          game.landmarks,
          game.walkState.x,
          game.walkState.y,
          game.nearLandmark
        );
        if (near !== game.nearLandmark) {
          game.nearLandmark = near;
          if (near) announceInLayer(`Near ${near}.`);
        }
      }
      game.altView.invalidate();
      updateHud();
    }

    game.altView.render();
  }

  return { open, close };
}

/** Test hook: whether a session is currently open. */
export function isCityWalkOpen() {
  return activeSession !== null;
}
