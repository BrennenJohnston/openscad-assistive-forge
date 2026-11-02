/**
 * The Tactile Map Designer's address controls: a typed address or place
 * name, a Search press, up to five places to pick from (and, for a route
 * map, where the walk ends); the map's radius; the steps on the way; the
 * landmarks to show; Make the map, which gets the data and drafts in one
 * press; and a door for an OpenStreetMap export kept on the device. The
 * panel lays these parts out in its numbered steps (`parts`). Nothing is
 * sent until a press (Nominatim forbids autocomplete), one search a
 * second, and every sentence goes once through the announcer under the
 * panel's source, in a status box of its own.
 *
 * The network and file work is handed in (the panel loads each module as a
 * lazy chunk on the first press; a test stubs them):
 * - `searchPlaces(query)` resolves `[{ name, lat, lon, kind }]`, or rejects
 *   with a `code`: 'empty', 'rate', 'no-answer';
 * - `pullArea({ lat, lon, radiusM, onWait })` resolves `{ elements, bytes,
 *   host }`, calling `onWait(seconds)` before each back-off and
 *   `onWait(0, nextServer, { from, reason })` when it moves to the next
 *   server at once, or rejects with 'busy' or 'no-answer';
 * - `readOsmFile(file)` resolves `{ elements, center }` or rejects with
 *   'not-osm'.
 *
 * The data kept for the draft: `{ elements, center, radiusM, source, place,
 * landmarks, bytes, host, key }` with `source` 'overpass' or 'file', `host`
 * the name of the source that answered, and `key` what was asked for, so a
 * second press for the same place reuses it.
 *
 * @license GPL-3.0-or-later
 */

/** How a server failed, as the middle of the switch sentence. */
const HOST_FAILED = Object.freeze({
  refused: "refused this site's request",
  'no-answer': 'did not answer in time',
  'no-data': 'sent no map data',
});

export const ADDRESS_STRINGS = Object.freeze({
  label: 'Address or place',
  /** A route map's first place. */
  fromLabel: 'From',
  help: 'A street address, an intersection, or the name of a place. Nothing is sent until you press Search.',
  search: 'Search',
  /** A11Y: the status line while a search runs. */
  searching: (q) => `Searching for ${q}...`,
  /** A11Y: nothing found. */
  none: (q) => `No place found for ${q}. Try adding the city or a postal code.`,
  /** A11Y: the results group's name. */
  found: 'Places found',
  /** A11Y: after a pick. */
  picked: (name) => `${name} picked.`,
  /** A11Y: said after the pick while the preview shows the empty plate. */
  waiting: 'The preview shows an empty plate until you make the map.',
  /** A11Y: Edit drawing as a map pressed on the empty plate. */
  waitingDoor:
    'No map yet. Make the map first, or choose a drawing for the map file.',
  /** A11Y: Make the map pressed with no place and no file. */
  needPlace: 'Pick a place first, or use a file instead.',
  /** A11Y: the search did not answer. */
  noAnswer:
    'The address search did not answer. Check your connection and try again, or use a file instead.',
  /** A11Y: a second search within a second. */
  rate: 'One search a second; try again in a moment.',
  /** A11Y: nothing typed. */
  empty: 'Type an address or a place first.',
  toLabel: 'To',
  toHelp:
    'Pick a destination and the draft follows the walk between the two places.',
  /** A11Y: the destinations group's name. */
  toFound: 'Destinations found',
  /** A11Y: after a destination is picked. */
  toPicked: (name) => `${name} picked as where the walk ends.`,
  radiusLabel: 'Map radius (m)',
  radiusHelp:
    'How far from the address the map reaches, 100 to 600 m. The map is twice this wide.',
  /** A11Y: the route's steps choice, its group name and its two answers. */
  stepsLegend: 'Steps on the way',
  stepsAllow: 'Allowed, and marked on the map',
  stepsAvoid: 'Avoided where another way exists',
  landmarks: 'Landmarks to show',
  /** The one button: gets the data, drafts, opens the editor. */
  make: 'Make the map',
  /** A11Y: the status line while a pull runs. */
  getting: (r, place) => `Getting map data within ${r} m of ${place}...`,
  /** A11Y: the status line while a pull for two places runs. */
  gettingRoute: (from, to) => `Getting map data around ${from} and ${to}...`,
  /** A11Y: the status line after a pull for two places. */
  gotRoute: (n, from, to) => `${n} map features around ${from} and ${to}.`,
  /** A11Y: the status line after a pull. */
  got: (n, r, w, c, b, l) =>
    `${n} map features within ${r} m: ${w} walkways, ${c} crossings, ${b} buildings, ${l} landmarks.`,
  /** A11Y: one server failed and the pull moves to the next, in one breath. */
  hostSwitch: (from, next, reason) =>
    `${from} ${HOST_FAILED[reason] || HOST_FAILED.refused}. Trying ${next}; this can take half a minute.`,
  /** A11Y: every server failed; a back-off runs before the list again. */
  busyWait: (s) => `No map server answered. Trying again in ${s} seconds.`,
  /** A11Y: the last try of the list failed too. */
  busy: 'No map server answered. Try again in a few minutes, or export the area from openstreetmap.org and use the file instead.',
  /** A11Y: the pull did not answer. */
  noData:
    'The map data did not arrive. Check your connection and try again, or use a file instead.',
  attribution: ['Map data from ', 'OpenStreetMap contributors', ', ODbL.'],
  /** The map tiles' service asks for its own credit, with its link. */
  tilesCredit: [' Tiles by ', 'OSM US', '.'],
  loadFile: 'Use a file instead',
  fileHelp:
    'An .osm export from openstreetmap.org, or a .geojson file. The file stays on your device.',
  /** A11Y: after a file loads. */
  fileLoaded: (name, n) => `${name}: ${n} map features loaded.`,
  /** A11Y: a file that is neither. */
  notOsm: (name) => `${name} is not an OpenStreetMap export or a GeoJSON file.`,
  /** A11Y: a file loaded with no address picked. */
  fileNoPlace: (name) =>
    `${name} loaded; the map centers on the middle of the file. Pick an address first to center it there.`,
  /** A11Y: the pull's size warning. */
  big: (mb) =>
    `${mb} MB of map data arrived. A smaller radius makes a lighter map.`,
  /** A11Y: the status line after a route draft. */
  routeReady: (m, from, to, crossings, steps, w, h) =>
    `Route map ready: a ${m} m walk from ${from} to ${to}, ${crossings === 1 ? '1 crossing' : `${crossings} crossings`} and ${steps === 1 ? '1 flight of steps' : `${steps} flights of steps`} on the way. The map is ${w} x ${h} mm, fitted to the walk.`,
  /** A11Y: no walk joins the two places. */
  noWalk: (from, to) =>
    `No walking route joins ${from} and ${to} in this map data. Try other places, or use a file of the area instead.`,
  /** The route draft's name in the editor's header. */
  routeName: (from, to) => `Route map from ${from} to ${to}`,
  /** A11Y: the status line after a draft, with warnings. */
  draftReady: (on, total, w) =>
    `Draft map ready: ${on} of ${total} features on; ${w} warnings. Choose what stays.`,
  /** A11Y: the same, no warnings. */
  draftReadyClean: (on, total) =>
    `Draft map ready: ${on} of ${total} features on; no warnings. Choose what stays.`,
  /** A11Y: nothing near the address. */
  nothingNear: (d) =>
    `No sidewalks within ${d} m of the address. Try a larger radius or another address.`,
  /** The draft's name in the editor's header. */
  draftName: (place) => `Draft map of ${place}`,
  steepLabel: 'Mark steep sidewalks',
  steepHelp:
    'Chevrons along sidewalks steeper than the grade below, pointing uphill. Heights come from public terrain tiles at about 3 m per pixel, so a short steep step can be missed.',
  gradeLabel: 'Steep grade (%)',
  gradeHelp:
    'Sidewalks steeper than this get chevrons, 3 to 12 %. 5 % is the grade where a walking surface counts as a ramp.',
  /** A11Y: the status line while the tiles load. */
  reading: (n) => `Reading heights along ${n} sidewalks...`,
  /** A11Y: after, with steep segments. */
  steepMarked: (n, g) => `${n} steep segments marked, steeper than ${g} %.`,
  /** A11Y: the same, none. */
  steepNone: (g) => `No sidewalk is steeper than ${g} %.`,
  /** A11Y: the tiles did not answer. */
  tilesNoAnswer:
    'The height tiles did not answer. Steep sidewalks are not marked this time.',
});

export const GRADE = Object.freeze({ min: 3, max: 12, step: 0.5, value: 5 });

export const ATTRIBUTION_URL = 'https://www.openstreetmap.org/copyright';
export const TILES_CREDIT_URL = 'https://tiles.openstreetmap.us';
export const RADIUS = Object.freeze({
  min: 100,
  max: 600,
  step: 10,
  value: 250,
});
/** Row 37's threshold: a pull heavier than this gets the size warning. */
export const BIG_BYTES = 2 * 1024 * 1024;
export const FILE_ACCEPT = '.osm,.geojson,.json,application/json,text/xml';

/**
 * The landmark boxes in their order; `on` is the default tick; `value` is
 * the map class the box turns on in the draft (the class table's key).
 */
export const LANDMARKS = Object.freeze([
  { key: 'entrances', value: 'entrance', label: 'Entrances', on: true },
  { key: 'transit', value: 'transit-stop', label: 'Transit stops', on: true },
  { key: 'crossings', value: 'crossing', label: 'Crossings', on: false },
  { key: 'steps', value: 'stairs', label: 'Steps and stairs', on: false },
  { key: 'shops', value: 'shop', label: 'Shops', on: false },
  { key: 'benches', value: 'bench', label: 'Benches', on: false },
]);

/**
 * The counts row 27 says: walkways (ways with a highway tag), crossings
 * (crossing nodes and crossing footways), buildings, and the other tagged
 * nodes as landmarks.
 *
 * @param {object[]} elements
 * @returns {{n: number, walkways: number, crossings: number, buildings: number, landmarks: number}}
 */
export function countFeatures(elements) {
  const out = { n: 0, walkways: 0, crossings: 0, buildings: 0, landmarks: 0 };
  for (const e of elements || []) {
    const t = e?.tags || {};
    out.n += 1;
    if (e.type === 'node') {
      if (t.highway === 'crossing') out.crossings += 1;
      else out.landmarks += 1;
    } else if (t.building) {
      out.buildings += 1;
    } else if (t.highway) {
      if (t.footway === 'crossing' || t.highway === 'crossing') {
        out.crossings += 1;
      } else {
        out.walkways += 1;
      }
    }
  }
  return out;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Build the address controls.
 *
 * @param {object} args
 * @param {(query: string) => Promise<Array<{name: string, lat: number, lon: number, kind: string}>>} args.searchPlaces
 * @param {(where: object) => Promise<{elements: object[], bytes: number, host?: string}>} args.pullArea
 * @param {(file: File) => Promise<{elements: object[], center: {lat: number, lon: number}|null}>} args.readOsmFile
 * @param {(text: string, failed?: boolean, options?: {quiet?: boolean}) => void} args.say - writes the status box; announces once unless quiet
 * @param {(place: object) => boolean} [args.onPlace] - true when the preview
 *   now shows the empty plate, so the pick says so
 * @param {(osm: object) => void} [args.onData]
 * @param {() => void} [args.unsay] - take back a sentence still waiting to be said
 * @param {() => Promise<void>} [args.onDraft] - draft from the data kept and open the editor
 * @param {(on: boolean, gradePct: number) => void} [args.onSteep] - the switch moved
 * @param {() => void} [args.onChange] - a place, a destination or the data changed (the steps recheck their needs)
 * @returns {{ el: HTMLElement, refs: object, parts: object, setMode: (mode: string) => void, getPlace: () => object|null, getDest: () => object|null, getData: () => object|null, avoidSteps: () => boolean, steepWanted: () => {on: boolean, gradePct: number}, destroy: () => void }}
 */
export function createAddressSection({
  searchPlaces,
  pullArea,
  readOsmFile,
  say,
  unsay = () => {},
  onPlace,
  onData,
  onDraft,
  onSteep,
  onChange = () => {},
}) {
  const S = ADDRESS_STRINGS;
  // A holder for the parts until the panel's steps take them.
  const section = el('div', 'tactile-map-address');
  section.id = 'tactileMapAddressSection';

  const label = el('label', 'braille-panel-label', S.label);
  label.htmlFor = 'tactileMapAddress';
  section.appendChild(label);

  const help = el('p', 'braille-panel-help', S.help);
  help.id = 'tactileMapAddressHelp';
  section.appendChild(help);

  const row = el('div', 'braille-translate-row tactile-map-address-row');
  const input = document.createElement('input');
  input.type = 'search';
  input.id = 'tactileMapAddress';
  input.className = 'braille-panel-number tactile-map-address-input';
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('aria-describedby', 'tactileMapAddressHelp');
  input.enterKeyHint = 'search';
  const button = el(
    'button',
    'btn btn-primary braille-translate-btn',
    S.search
  );
  button.type = 'button';
  button.id = 'tactileMapSearch';
  row.appendChild(input);
  row.appendChild(button);
  section.appendChild(row);

  const results = el('fieldset', 'braille-panel-choice tactile-map-results');
  results.id = 'tactileMapResults';
  results.hidden = true;
  results.appendChild(el('legend', '', S.found));
  section.appendChild(results);

  const toLabel = el('label', 'braille-panel-label', S.toLabel);
  toLabel.htmlFor = 'tactileMapTo';
  toLabel.id = 'tactileMapToLabel';
  section.appendChild(toLabel);
  const toHelp = el('p', 'braille-panel-help', S.toHelp);
  toHelp.id = 'tactileMapToHelp';
  section.appendChild(toHelp);
  const toRow = el('div', 'braille-translate-row tactile-map-address-row');
  toRow.id = 'tactileMapToRow';
  const toInput = document.createElement('input');
  toInput.type = 'search';
  toInput.id = 'tactileMapTo';
  toInput.className = 'braille-panel-number tactile-map-address-input';
  toInput.setAttribute('autocomplete', 'off');
  toInput.setAttribute('aria-describedby', 'tactileMapToHelp');
  toInput.enterKeyHint = 'search';
  const toButton = el(
    'button',
    'btn btn-secondary braille-translate-btn',
    S.search
  );
  toButton.type = 'button';
  toButton.id = 'tactileMapToSearch';
  toRow.appendChild(toInput);
  toRow.appendChild(toButton);
  section.appendChild(toRow);
  const toResults = el('fieldset', 'braille-panel-choice tactile-map-results');
  toResults.id = 'tactileMapToResults';
  toResults.hidden = true;
  toResults.appendChild(el('legend', '', S.toFound));
  section.appendChild(toResults);

  const radiusRow = el('div', 'braille-panel-field-row tactile-map-radius-row');
  const radiusLabel = el('label', '', S.radiusLabel);
  radiusLabel.htmlFor = 'tactileMapRadius';
  const radius = document.createElement('input');
  radius.type = 'number';
  radius.id = 'tactileMapRadius';
  radius.className = 'braille-panel-number';
  radius.min = String(RADIUS.min);
  radius.max = String(RADIUS.max);
  radius.step = String(RADIUS.step);
  radius.value = String(RADIUS.value);
  radius.inputMode = 'numeric';
  radius.setAttribute('aria-describedby', 'tactileMapRadiusHelp');
  radiusRow.appendChild(radiusLabel);
  radiusRow.appendChild(radius);
  section.appendChild(radiusRow);
  const radiusHelp = el('p', 'braille-panel-help', S.radiusHelp);
  radiusHelp.id = 'tactileMapRadiusHelp';
  section.appendChild(radiusHelp);

  // A route on foot: may it take steps? Allowed and marked is the default.
  const stepsChoice = el(
    'fieldset',
    'braille-panel-choice tactile-map-steps-choice'
  );
  stepsChoice.id = 'tactileMapStepsChoice';
  stepsChoice.appendChild(el('legend', '', S.stepsLegend));
  const stepsRadios = [
    ['allow', S.stepsAllow, true],
    ['avoid', S.stepsAvoid, false],
  ].map(([value, text, on]) => {
    const line = el('div', 'braille-panel-toggle-row');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'tactileMapSteps';
    radio.id = `tactileMapSteps-${value}`;
    radio.value = value;
    radio.checked = on;
    const words = el('label', '', text);
    words.htmlFor = radio.id;
    line.appendChild(radio);
    line.appendChild(words);
    stepsChoice.appendChild(line);
    return radio;
  });
  section.appendChild(stepsChoice);

  const landmarks = el(
    'fieldset',
    'braille-panel-choice tactile-map-landmarks'
  );
  landmarks.id = 'tactileMapLandmarks';
  landmarks.appendChild(el('legend', '', S.landmarks));
  const boxes = LANDMARKS.map((item) => {
    const line = el('div', 'braille-panel-toggle-row');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = `tactileMapLandmark-${item.key}`;
    box.value = item.value;
    box.checked = item.on;
    const text = el('label', '', item.label);
    text.htmlFor = box.id;
    line.appendChild(box);
    line.appendChild(text);
    landmarks.appendChild(line);
    return box;
  });
  section.appendChild(landmarks);

  const steepRow = el('div', 'braille-panel-toggle-row tactile-map-steep-row');
  const steep = document.createElement('input');
  steep.type = 'checkbox';
  steep.id = 'tactileMapSteep';
  steep.setAttribute('aria-describedby', 'tactileMapSteepHelp');
  const steepLabel = el('label', '', S.steepLabel);
  steepLabel.htmlFor = steep.id;
  steepRow.appendChild(steep);
  steepRow.appendChild(steepLabel);
  section.appendChild(steepRow);
  const steepHelp = el('p', 'braille-panel-help', S.steepHelp);
  steepHelp.id = 'tactileMapSteepHelp';
  section.appendChild(steepHelp);

  const gradeRow = el('div', 'braille-panel-field-row tactile-map-grade-row');
  const gradeLabel = el('label', '', S.gradeLabel);
  gradeLabel.htmlFor = 'tactileMapGrade';
  const grade = document.createElement('input');
  grade.type = 'number';
  grade.id = 'tactileMapGrade';
  grade.className = 'braille-panel-number';
  grade.min = String(GRADE.min);
  grade.max = String(GRADE.max);
  grade.step = String(GRADE.step);
  grade.value = String(GRADE.value);
  grade.inputMode = 'decimal';
  grade.setAttribute('aria-describedby', 'tactileMapGradeHelp');
  gradeRow.appendChild(gradeLabel);
  gradeRow.appendChild(grade);
  section.appendChild(gradeRow);
  const gradeHelp = el('p', 'braille-panel-help', S.gradeHelp);
  gradeHelp.id = 'tactileMapGradeHelp';
  section.appendChild(gradeHelp);

  const makeRow = el('div', 'braille-translate-row tactile-map-make-row');
  makeRow.id = 'tactileMapMakeRow';
  const make = el('button', 'btn btn-primary braille-translate-btn', S.make);
  make.type = 'button';
  make.id = 'tactileMapMake';
  makeRow.appendChild(make);
  section.appendChild(makeRow);

  // A box directly under the button, where a person looks after a press.
  // Shown, not a live region: the panel says each sentence once through the
  // announcer, as it does for the plates line.
  const status = el('p', 'braille-panel-help tactile-map-status-box');
  status.id = 'tactileMapAddressStatus';
  section.appendChild(status);

  const fileRow = el('div', 'braille-translate-row tactile-map-file-row');
  const loadFile = el(
    'button',
    'btn btn-secondary braille-translate-btn',
    S.loadFile
  );
  loadFile.type = 'button';
  loadFile.id = 'tactileMapLoadFile';
  loadFile.setAttribute('aria-describedby', 'tactileMapFileHelp');
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = FILE_ACCEPT;
  fileInput.id = 'tactileMapOsmFile';
  fileInput.hidden = true;
  fileInput.tabIndex = -1;
  fileInput.setAttribute('aria-hidden', 'true');
  fileRow.appendChild(loadFile);
  fileRow.appendChild(fileInput);
  section.appendChild(fileRow);
  const fileHelp = el('p', 'braille-panel-help', S.fileHelp);
  fileHelp.id = 'tactileMapFileHelp';
  section.appendChild(fileHelp);

  const attribution = el(
    'p',
    'braille-panel-help tactile-map-attribution',
    S.attribution[0]
  );
  attribution.id = 'tactileMapAttribution';
  const outLink = (text, href) => {
    const a = el('a', '', text);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.appendChild(el('span', 'sr-only', ' (opens in new tab)'));
    return a;
  };
  attribution.appendChild(outLink(S.attribution[1], ATTRIBUTION_URL));
  attribution.appendChild(document.createTextNode(S.attribution[2]));
  attribution.appendChild(document.createTextNode(S.tilesCredit[0]));
  attribution.appendChild(outLink(S.tilesCredit[1], TILES_CREDIT_URL));
  attribution.appendChild(document.createTextNode(S.tilesCredit[2]));
  section.appendChild(attribution);

  /** The groups the panel's steps lay out. */
  const parts = {
    where: [label, help, row, results],
    to: [toLabel, toHelp, toRow, toResults],
    radius: [radiusRow, radiusHelp],
    steps: [stepsChoice],
    landmarks: [landmarks, steepRow, steepHelp, gradeRow, gradeHelp],
    make: [makeRow, status, fileRow, fileHelp, attribution],
  };

  let mode = 'place';
  let place = null;
  let dest = null;
  let osm = null;
  let running = false;
  let making = false;

  /** A place's own name: the first part of the geocoder's long one. */
  const short = (p) => (p?.name || '').split(',')[0].trim();

  function clearList(list) {
    list.hidden = true;
    for (const node of [...list.children]) {
      if (node.tagName !== 'LEGEND') node.remove();
    }
  }

  /** @returns {boolean} whether the preview now shows the empty plate */
  function setPlace(p) {
    place = p;
    const waiting = place ? Boolean(onPlace?.(place)) : false;
    onChange();
    return waiting;
  }

  /**
   * The destination: with one, the map covers the walk between the two
   * places; data pulled for another destination is let go, a file kept.
   */
  function setDest(p) {
    dest = p;
    if (osm?.source === 'file') {
      keep({ ...osm, to: dest });
    } else if (osm) {
      osm = null;
      onData?.(null);
    }
    onChange();
  }

  function showList(list, places, { name, prefix, onPick }) {
    clearList(list);
    places.forEach((p, i) => {
      const line = el('div', 'braille-panel-toggle-row');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = name;
      radio.id = `${prefix}${i + 1}`;
      radio.value = String(i);
      radio.addEventListener('change', () => {
        if (radio.checked) onPick(p);
      });
      const text = el('label', '', p.name);
      text.htmlFor = radio.id;
      line.appendChild(radio);
      line.appendChild(text);
      list.appendChild(line);
    });
    list.hidden = places.length === 0;
    status.textContent = '';
    list.querySelector('input[type="radio"]')?.focus();
  }

  const FROM = {
    field: input,
    press: button,
    list: results,
    name: 'tactileMapPlace',
    prefix: 'tactileMapPlace',
    onPick: (p) => {
      const waiting = setPlace(p);
      say(waiting ? `${S.picked(p.name)} ${S.waiting}` : S.picked(p.name));
    },
    onNone: () => setPlace(null),
  };
  const TO = {
    field: toInput,
    press: toButton,
    list: toResults,
    name: 'tactileMapToPlace',
    prefix: 'tactileMapToPlace',
    onPick: (p) => {
      setDest(p);
      say(S.toPicked(short(p)));
    },
    onNone: () => setDest(null),
  };

  async function search(which = FROM) {
    if (running) return;
    const q = which.field.value.trim();
    if (!q) {
      say(S.empty, true);
      which.field.focus();
      return;
    }
    running = true;
    which.press.disabled = true;
    say(S.searching(q));
    try {
      const places = await searchPlaces(q);
      if (!places || places.length === 0) {
        clearList(which.list);
        which.onNone();
        say(S.none(q), true);
      } else {
        showList(which.list, places, which);
        // The places are said as focus reaches them; a "Searching..." still
        // waiting would be said after them.
        unsay();
      }
    } catch (error) {
      clearList(which.list);
      if (error?.code === 'rate') say(S.rate, true);
      else if (error?.code === 'empty') say(S.empty, true);
      else say(S.noAnswer, true);
    } finally {
      running = false;
      which.press.disabled = false;
    }
  }

  /** The box around both places, with room for the walk between them. */
  function boxAround(a, b) {
    const lat = (a.lat + b.lat) / 2;
    const apartM = Math.hypot(
      (a.lat - b.lat) * 110540,
      (a.lon - b.lon) * 111320 * Math.cos((lat * Math.PI) / 180)
    );
    const marginM = Math.max(150, apartM / 4);
    const dLat = marginM / 110540;
    const dLon = marginM / (111320 * Math.cos((lat * Math.PI) / 180));
    return {
      south: Math.min(a.lat, b.lat) - dLat,
      west: Math.min(a.lon, b.lon) - dLon,
      north: Math.max(a.lat, b.lat) + dLat,
      east: Math.max(a.lon, b.lon) + dLon,
    };
  }

  /** The radius the input holds, kept inside its range. */
  function radiusM() {
    const n = Number(radius.value);
    if (!Number.isFinite(n)) return RADIUS.value;
    return Math.min(RADIUS.max, Math.max(RADIUS.min, n));
  }

  const ticked = () => boxes.filter((b) => b.checked).map((b) => b.value);
  const isRoute = () => mode === 'route' && Boolean(dest);

  /** What a pull asks for: the same key, the same data. */
  function pullKey() {
    if (!place) return null;
    const at = `${place.lat},${place.lon}`;
    return isRoute()
      ? `route:${at}:${dest.lat},${dest.lon}`
      : `place:${at}:${radiusM()}`;
  }

  function keep(data) {
    osm = data;
    onData?.(osm);
    onChange();
  }

  /** Row 27, shown, not said: the draft's sentence follows at once. */
  function countsSentence(elements, r) {
    const c = countFeatures(elements);
    return isRoute()
      ? S.gotRoute(c.n, short(place), short(dest))
      : S.got(c.n, r, c.walkways, c.crossings, c.buildings, c.landmarks);
  }

  /** A back-off's seconds, or the move to the next server (0 seconds). */
  function sayWait(seconds, next, info) {
    say(
      seconds > 0
        ? S.busyWait(seconds)
        : S.hostSwitch(info?.from, next, info?.reason)
    );
  }

  /** Pull the data for the place (or the walk); true when it arrived. */
  async function pull() {
    const key = pullKey();
    const at = place;
    const to = isRoute() ? dest : null;
    const r = radiusM();
    const where = to
      ? { box: boxAround(at, to) }
      : { lat: at.lat, lon: at.lon, radiusM: r };
    say(to ? S.gettingRoute(short(at), short(to)) : S.getting(r, at.name));
    try {
      const { elements, bytes, host } = await pullArea({
        ...where,
        onWait: sayWait,
      });
      keep({
        elements,
        center: to
          ? { lat: (at.lat + to.lat) / 2, lon: (at.lon + to.lon) / 2 }
          : { lat: at.lat, lon: at.lon },
        radiusM: to ? null : r,
        box: where.box,
        source: 'overpass',
        place: at,
        to,
        landmarks: ticked(),
        bytes,
        host,
        key,
      });
      // The draft's sentence follows at once and is the one said.
      say(countsSentence(elements, r), false, { quiet: true });
      return true;
    } catch (error) {
      say(error?.code === 'busy' ? S.busy : S.noData, true);
      return false;
    }
  }

  /** Make the map: the data (unless already here), the draft, the editor. */
  async function makeTheMap() {
    if (making) return;
    const fromFile = osm?.source === 'file';
    if (!place && !fromFile) {
      say(S.needPlace, true);
      return;
    }
    making = true;
    make.disabled = true;
    try {
      if (!fromFile && osm?.key !== pullKey()) {
        if (!(await pull())) return;
      }
      if (osm) osm = { ...osm, landmarks: ticked() };
      await onDraft?.();
    } finally {
      making = false;
      make.disabled = false;
    }
  }

  async function takeFile(file) {
    const name = file.name || 'the file';
    try {
      const { elements, center } = await readOsmFile(file);
      const at = place;
      keep({
        elements,
        center: at ? { lat: at.lat, lon: at.lon } : center,
        radiusM: radiusM(),
        source: 'file',
        place: at,
        to: isRoute() ? dest : null,
        landmarks: ticked(),
        bytes: file.size,
      });
      say(at ? S.fileLoaded(name, elements.length) : S.fileNoPlace(name));
    } catch {
      say(S.notOsm(name), true);
    } finally {
      fileInput.value = '';
    }
  }

  button.addEventListener('click', () => {
    search();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      search();
    }
  });
  toButton.addEventListener('click', () => {
    search(TO);
  });
  toInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      search(TO);
    }
  });
  // An emptied destination (typed away, or the field's own clear button)
  // makes the walk's end unknown again.
  toInput.addEventListener('input', () => {
    if (toInput.value.trim() === '' && dest) {
      clearList(toResults);
      setDest(null);
    }
  });
  make.addEventListener('click', () => {
    makeTheMap();
  });
  /** The grade the input holds, kept inside its range. */
  function gradePct() {
    const n = Number(grade.value);
    if (!Number.isFinite(n)) return GRADE.value;
    return Math.min(GRADE.max, Math.max(GRADE.min, n));
  }
  steep.addEventListener('change', () => {
    onSteep?.(steep.checked, gradePct());
  });
  grade.addEventListener('change', () => {
    grade.value = String(gradePct());
    if (steep.checked) onSteep?.(true, gradePct());
  });
  loadFile.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const chosen = fileInput.files && fileInput.files[0];
    if (chosen) takeFile(chosen);
  });

  return {
    el: section,
    refs: {
      input,
      button,
      results,
      label,
      toInput,
      toButton,
      toResults,
      radius,
      stepsChoice,
      landmarks,
      make,
      loadFile,
      fileInput,
      steep,
      grade,
      attribution,
      status,
    },
    parts,
    /** A place map reads one place; a route map two. */
    setMode(next) {
      mode = next === 'route' ? 'route' : 'place';
      label.textContent = mode === 'route' ? S.fromLabel : S.label;
    },
    getPlace: () => place,
    getDest: () => (mode === 'route' ? dest : null),
    getData: () => osm,
    avoidSteps: () => stepsRadios[1].checked,
    steepWanted: () => ({ on: steep.checked, gradePct: gradePct() }),
    destroy() {
      section.remove();
    },
  };
}
