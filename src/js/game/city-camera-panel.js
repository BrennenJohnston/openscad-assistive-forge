/**
 * @license GPL-3.0-or-later
 */
// The Camera panel, inside the City Walk (CW-35, CW-Q32).
//
// The Assistive Forge's 3D preview has a Camera panel down its right-hand
// side: Rotate, Pan, Zoom, Standard Views, Reset. Anyone who has used the
// preview knows where those buttons are and what they do. The game had its
// own vocabulary along the bottom instead - Turn left, Look up, Forward, Step
// left - which is a second thing to learn for the same job.
//
// So the panel comes into the game. Same markup pattern, same classes, so it
// is the same panel to look at and the existing stylesheet dresses it with no
// new CSS. The buttons do NOT reimplement anything: each one drives an action
// the game already had, through the press-and-hold machinery the bottom
// toolbar proved. The owner's instruction was exactly that - "tune those
// buttons to deliver the correct keyboard keys that are already wired".
//
// WHY THE SAME BUTTON DOES TWO THINGS. The game has two views and the panel
// serves both. In the street the D-pads walk and look; over the map they pan.
// That is not a special case bolted on here: the game's frame loop already
// reads the same held actions differently per view (`forward` walks in the
// street and pans the map), so most of the mapping is nothing more than
// sending the action the game already understands. Where a control genuinely
// means something different - Zoom is character size in the street and map
// zoom overhead - the panel switches which action it sends.
//
// The app's own #cameraPanel is untouched. It sits behind the game layer,
// hidden with the rest of the app.

import { headingLabel } from './walk-controls.js';

/**
 * ACCESSIBILITY-CRITICAL STRINGS (D-35) — flagged for owner review, recorded
 * in CW-R5-TEXT-PACK.md. Every one of these is spoken to a screen reader and
 * nothing else says it.
 */
const FACING_MESSAGE = (word) => `Facing ${word}.`;
const TOWER_GAZE_MESSAGE = 'Looking up at the towers.';

/**
 * Compass bearings in radians. Heading 0 is north; the world is Z-up.
 *
 * `text` is what the button shows and `label` what a screen reader hears:
 * "North" reads as a place next to Top, Street and Towers, while "Face
 * north" is the instruction the button carries out.
 */
const HEADINGS = [
  { id: 'front', text: 'North', label: 'Face north', rad: 0 },
  { id: 'right', text: 'East', label: 'Face east', rad: Math.PI / 2 },
  { id: 'back', text: 'South', label: 'Face south', rad: Math.PI },
  { id: 'left', text: 'West', label: 'Face west', rad: -Math.PI / 2 },
];

/** How far up the Diagonal view tilts. Chosen on the photograph (CW-35 P5). */
export const TOWER_GAZE_PITCH_RAD = (30 * Math.PI) / 180;

const svg = (paths, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
  `stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
  `stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const ICONS = {
  up: svg('<polyline points="18 15 12 9 6 15"></polyline>'),
  down: svg('<polyline points="6 9 12 15 18 9"></polyline>'),
  left: svg('<polyline points="15 18 9 12 15 6"></polyline>'),
  right: svg('<polyline points="9 18 15 12 9 6"></polyline>'),
  zoomIn: svg(
    '<circle cx="11" cy="11" r="7"></circle><line x1="20" y1="20" x2="16.65" y2="16.65"></line>' +
      '<line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line>'
  ),
  zoomOut: svg(
    '<circle cx="11" cy="11" r="7"></circle><line x1="20" y1="20" x2="16.65" y2="16.65"></line>' +
      '<line x1="8" y1="11" x2="14" y2="11"></line>'
  ),
  reset: svg(
    '<polyline points="1 4 1 10 7 10"></polyline>' +
      '<path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>'
  ),
  collapse: svg(
    '<polyline points="13 6 19 12 13 18"></polyline>' +
      '<line x1="7" y1="4" x2="7" y2="20"></line>',
    20
  ),
};

function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) node.setAttribute(k, String(v));
  }
  return node;
}

/**
 * Build the game's Camera panel.
 *
 * @param {object} actions - everything the panel is allowed to do. It owns no
 *   game state of its own; it only asks.
 * @param {(action: string) => void} actions.hold - start a held action
 * @param {(action: string) => void} actions.release - end a held action
 * @param {() => boolean} actions.isMapView
 * @param {() => void} actions.toggleMapView
 * @param {() => void} actions.levelView
 * @param {() => void} actions.recenterMap
 * @param {(delta: number) => void} actions.adjustCharacterSize
 * @param {(rad: number, word: string) => void} actions.setHeading
 * @param {(rad: number) => void} actions.setPitch
 * @param {(text: string) => void} actions.announce
 * @param {{read: () => boolean, write: (open: boolean) => void}} actions.collapsedStore
 * @returns {{el: HTMLElement, syncView: () => void}}
 */
export function buildCityCameraPanel(actions) {
  const panel = el('aside', 'camera-panel city-walk-camera-panel', {
    id: 'cityWalkCameraPanel',
    role: 'region',
    'aria-labelledby': 'cityWalkCameraHeading',
  });

  // --- header -------------------------------------------------------------
  const header = el('div', 'panel-header camera-panel-header');
  const titleRow = el('div', 'camera-header-title-row');
  const heading = el('h2', null, { id: 'cityWalkCameraHeading' });
  heading.textContent = 'Camera';
  titleRow.appendChild(heading);
  const headerActions = el('div', 'camera-header-actions');
  const toggle = el('button', 'btn btn-sm btn-icon btn-collapse-panel', {
    type: 'button',
    id: 'cityWalkCameraToggle',
    'aria-controls': 'cityWalkCameraBody',
    title: 'Camera Controls',
  });
  toggle.innerHTML = ICONS.collapse;
  headerActions.appendChild(toggle);
  header.append(titleRow, headerActions);

  const body = el('div', 'camera-panel-body', { id: 'cityWalkCameraBody' });
  panel.append(header, body);

  // --- building blocks ----------------------------------------------------
  const section = (title) => {
    const wrap = el('div', 'camera-control-section');
    const h3 = el('h3', 'camera-control-section-title');
    h3.textContent = title;
    wrap.appendChild(h3);
    return wrap;
  };

  /** Buttons that must be told which view is showing get registered here. */
  const viewAware = [];

  /**
   * A press-and-hold button. The action it holds can differ per view, so the
   * button asks at press time rather than being rebuilt on every toggle.
   */
  const holdButton = ({ id, className, icon, label, action, press }) => {
    const btn = el('button', `btn btn-sm camera-btn ${className}`.trim(), {
      type: 'button',
      id,
    });
    btn.innerHTML = icon;
    let held = null;
    const start = () => {
      const isMap = actions.isMapView();
      const next = action(isMap);
      if (!next) {
        // Nothing to HOLD in this view. Character size moves one step at a
        // time, the way the key does, so the same button becomes a press.
        press?.(isMap);
        return;
      }
      held = next;
      actions.hold(next);
    };
    const stop = () => {
      if (!held) return;
      actions.release(held);
      held = null;
    };
    btn.addEventListener('pointerdown', (event) => {
      // No preventDefault: a button is focusable, and refusing the default
      // press costs it both its focus ring and its keyboard activation
      // (the same reasoning as the bottom toolbar's buttons).
      if (event.button === 0) start();
    });
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel', stop);
    // Keyboard: Enter and Space fire click, which has no press and release,
    // so a key press is one step of movement rather than a hold.
    btn.addEventListener('click', () => {
      start();
      stop();
    });
    btn.addEventListener('blur', stop);
    viewAware.push((isMap) => {
      const text = label(isMap);
      btn.setAttribute('aria-label', text);
      btn.title = text;
      btn.disabled = !action(isMap) && !press;
    });
    return btn;
  };

  const pressButton = ({ id, className, icon, text, label, onPress }) => {
    const btn = el('button', `btn btn-sm ${className}`, { type: 'button', id });
    if (icon) btn.innerHTML = icon;
    if (text) btn.textContent = text;
    btn.addEventListener('click', () => onPress(actions.isMapView()));
    if (label) {
      viewAware.push((isMap) => {
        const value = label(isMap);
        if (value === null) {
          btn.hidden = true;
          return;
        }
        btn.hidden = false;
        btn.setAttribute('aria-label', value);
        btn.title = value;
      });
    }
    return btn;
  };

  const dpad = (ariaLabel, buttons) => {
    const grid = el('div', 'camera-control-dpad', {
      role: 'group',
      'aria-label': ariaLabel,
    });
    for (const b of buttons) grid.appendChild(b);
    return grid;
  };

  // --- Rotate --------------------------------------------------------------
  // Street: turn the walker and tilt the gaze. Map: pan, because there is no
  // walker to turn and panning is what the arrows already do overhead.
  const rotate = section('Rotate View');
  rotate.appendChild(
    dpad('Rotation controls', [
      holdButton({
        id: 'cityWalkCamRotateUp',
        className: 'dpad-up',
        icon: ICONS.up,
        action: (isMap) => (isMap ? 'forward' : 'lookUp'),
        label: (isMap) => (isMap ? 'Pan map up' : 'Look up'),
      }),
      holdButton({
        id: 'cityWalkCamRotateLeft',
        className: 'dpad-left',
        icon: ICONS.left,
        action: () => 'turnLeft',
        label: (isMap) => (isMap ? 'Pan map left' : 'Turn left'),
      }),
      holdButton({
        id: 'cityWalkCamRotateRight',
        className: 'dpad-right',
        icon: ICONS.right,
        action: () => 'turnRight',
        label: (isMap) => (isMap ? 'Pan map right' : 'Turn right'),
      }),
      holdButton({
        id: 'cityWalkCamRotateDown',
        className: 'dpad-down',
        icon: ICONS.down,
        action: (isMap) => (isMap ? 'back' : 'lookDown'),
        label: (isMap) => (isMap ? 'Pan map down' : 'Look down'),
      }),
    ])
  );
  body.appendChild(rotate);

  // --- Pan -----------------------------------------------------------------
  const pan = section('Pan View');
  pan.appendChild(
    dpad('Pan controls', [
      holdButton({
        id: 'cityWalkCamPanUp',
        className: 'dpad-up',
        icon: ICONS.up,
        action: () => 'forward',
        label: (isMap) => (isMap ? 'Pan map up' : 'Walk forward'),
      }),
      holdButton({
        id: 'cityWalkCamPanLeft',
        className: 'dpad-left',
        icon: ICONS.left,
        action: (isMap) => (isMap ? 'turnLeft' : 'strafeLeft'),
        label: (isMap) => (isMap ? 'Pan map left' : 'Step left'),
      }),
      holdButton({
        id: 'cityWalkCamPanRight',
        className: 'dpad-right',
        icon: ICONS.right,
        action: (isMap) => (isMap ? 'turnRight' : 'strafeRight'),
        label: (isMap) => (isMap ? 'Pan map right' : 'Step right'),
      }),
      holdButton({
        id: 'cityWalkCamPanDown',
        className: 'dpad-down',
        icon: ICONS.down,
        action: () => 'back',
        label: (isMap) => (isMap ? 'Pan map down' : 'Walk back'),
      }),
    ])
  );
  body.appendChild(pan);

  // --- Zoom ----------------------------------------------------------------
  // The one control that genuinely means two things. In the street there is
  // nothing to zoom - the walker's eye is where it is - so the game has
  // always spent -/= on character size, and that is what a Forge user
  // reaching for Zoom in the street most likely wants: to see more or less
  // detail. Over the map it is the map's own zoom.
  const zoom = section('Zoom');
  const zoomRow = el('div', 'camera-control-row', {
    role: 'group',
    'aria-label': 'Zoom controls',
  });
  zoomRow.append(
    holdButton({
      id: 'cityWalkCamZoomIn',
      className: 'camera-btn-wide',
      icon: ICONS.zoomIn,
      action: (isMap) => (isMap ? 'zoomIn' : null),
      press: () => actions.adjustCharacterSize(1),
      label: (isMap) => (isMap ? 'Zoom map in' : 'Larger characters'),
    }),
    holdButton({
      id: 'cityWalkCamZoomOut',
      className: 'camera-btn-wide',
      icon: ICONS.zoomOut,
      action: (isMap) => (isMap ? 'zoomOut' : null),
      press: () => actions.adjustCharacterSize(-1),
      label: (isMap) => (isMap ? 'Zoom map out' : 'Smaller characters'),
    })
  );
  zoom.appendChild(zoomRow);
  body.appendChild(zoom);

  // --- Standard Views -------------------------------------------------------
  const views = section('Standard Views');
  const viewGrid = el('div', 'camera-standard-views', {
    role: 'group',
    'aria-label': 'Standard views',
  });

  const topBtn = pressButton({
    id: 'cityWalkCamViewTop',
    className: 'btn-sm btn-outline camera-view-btn',
    text: 'Top',
    onPress: (isMap) => {
      if (!isMap) actions.toggleMapView();
    },
  });
  topBtn.setAttribute('data-view', 'top');
  viewAware.push((isMap) => {
    topBtn.setAttribute('aria-pressed', isMap ? 'true' : 'false');
    topBtn.setAttribute('aria-label', isMap ? 'Map view, showing' : 'Map view');
  });

  const bottomBtn = pressButton({
    id: 'cityWalkCamViewBottom',
    className: 'btn-sm btn-outline camera-view-btn',
    text: 'Street',
    onPress: (isMap) => {
      if (isMap) actions.toggleMapView();
    },
  });
  bottomBtn.setAttribute('data-view', 'bottom');
  viewAware.push((isMap) => {
    bottomBtn.setAttribute('aria-pressed', isMap ? 'false' : 'true');
    bottomBtn.setAttribute(
      'aria-label',
      isMap ? 'Street view' : 'Street view, showing'
    );
  });

  viewGrid.append(topBtn, bottomBtn);

  // Front/Back/Left/Right turn the walker to a compass bearing. In the map
  // view there is no walker to turn, and panning to an edge is what the
  // arrows already do, so they are hidden rather than given a second meaning
  // nobody asked for. Recorded reversible.
  for (const { id, text, label, rad } of HEADINGS) {
    const btn = pressButton({
      id: `cityWalkCamView${id[0].toUpperCase()}${id.slice(1)}`,
      className: 'btn-sm btn-outline camera-view-btn',
      text,
      label: (isMap) => (isMap ? null : label),
      onPress: () => {
        actions.setHeading(rad);
        actions.announce(FACING_MESSAGE(headingLabel(rad)));
      },
    });
    btn.setAttribute('data-view', id);
    viewGrid.appendChild(btn);
  }

  const diagonalBtn = pressButton({
    id: 'cityWalkCamViewDiagonal',
    className: 'btn-sm btn-outline camera-view-btn',
    text: 'Towers',
    label: (isMap) => (isMap ? null : 'Look up at the towers'),
    onPress: () => {
      actions.setPitch(TOWER_GAZE_PITCH_RAD);
      actions.announce(TOWER_GAZE_MESSAGE);
    },
  });
  diagonalBtn.setAttribute('data-view', 'diagonal');
  viewGrid.appendChild(diagonalBtn);

  views.appendChild(viewGrid);
  body.appendChild(views);

  // --- Reset ----------------------------------------------------------------
  const resetSection = section('Reset');
  const resetBtn = pressButton({
    id: 'cityWalkCamReset',
    className: 'btn-sm btn-outline camera-btn-full',
    text: 'Reset View',
    label: (isMap) => (isMap ? 'Centre the map on you' : 'Level the view'),
    onPress: (isMap) => {
      if (isMap) actions.recenterMap();
      else actions.levelView();
    },
  });
  resetBtn.insertAdjacentHTML('afterbegin', ICONS.reset);
  resetSection.appendChild(resetBtn);
  body.appendChild(resetSection);

  // --- collapse -------------------------------------------------------------
  const setCollapsed = (collapsed, persist) => {
    panel.classList.toggle('collapsed', collapsed);
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggle.setAttribute(
      'aria-label',
      collapsed
        ? 'Expand camera controls panel'
        : 'Collapse camera controls panel'
    );
    if (persist) actions.collapsedStore.write(collapsed);
  };
  toggle.addEventListener('click', () => {
    setCollapsed(!panel.classList.contains('collapsed'), true);
  });
  setCollapsed(actions.collapsedStore.read(), false);

  const syncView = () => {
    const isMap = actions.isMapView();
    for (const apply of viewAware) apply(isMap);
  };
  syncView();

  return { el: panel, syncView };
}
