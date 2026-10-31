/**
 * The Tactile Map Designer's address section: a typed address or place
 * name, a Search press, up to five places to pick from; then the map's
 * radius, the landmarks to show, Get map data, and a door for an
 * OpenStreetMap export kept on the device. Nothing is sent until a press
 * (Nominatim forbids autocomplete), one search a second, and every
 * sentence goes once through the announcer under the panel's source, on a
 * status line of its own.
 *
 * The network and file work is handed in (the panel loads each module as a
 * lazy chunk on the first press; a test stubs them):
 * - `searchPlaces(query)` resolves `[{ name, lat, lon, kind }]`, or rejects
 *   with a `code`: 'empty', 'rate', 'no-answer';
 * - `pullArea({ lat, lon, radiusM, onWait })` resolves `{ elements, bytes }`,
 *   calling `onWait(seconds)` before each back-off, or rejects with 'busy'
 *   or 'no-answer';
 * - `readOsmFile(file)` resolves `{ elements, center }` or rejects with
 *   'not-osm'.
 *
 * The data kept for the draft: `{ elements, center, radiusM, source, place,
 * landmarks, bytes }` with `source` 'overpass' or 'file'.
 *
 * @license GPL-3.0-or-later
 */

export const ADDRESS_STRINGS = Object.freeze({
  heading: 'Map from an address',
  label: 'Address or place',
  help: 'A street address, an intersection, or the name of a place. Nothing is sent until you press Search.',
  search: 'Search',
  /** A11Y: the status line while a search runs. */
  searching: (q) => `Searching for ${q}...`,
  /** A11Y: nothing found. */
  none: (q) => `No place found for ${q}. Try adding the city or a postal code.`,
  /** A11Y: the results group's name. */
  found: 'Places found',
  /** A11Y: after a pick. */
  picked: (name) =>
    `${name} picked. Choose a radius and the landmarks, then get the map data.`,
  /** A11Y: the search did not answer. */
  noAnswer:
    'The address search did not answer. Check your connection and try again, or load an OpenStreetMap file instead.',
  /** A11Y: a second search within a second. */
  rate: 'One search a second; try again in a moment.',
  /** A11Y: nothing typed. */
  empty: 'Type an address or a place first.',
  toLabel: 'To (optional)',
  toHelp:
    'Pick a destination and the draft follows the walk between the two places.',
  /** A11Y: the destinations group's name. */
  toFound: 'Destinations found',
  /** A11Y: after a destination is picked. */
  toPicked: (name) =>
    `${name} picked as the destination. Get the map data for the walk between the two places.`,
  radiusLabel: 'Map radius (m)',
  radiusHelp:
    'How far from the address the map reaches, 100 to 600 m. The map is twice this wide.',
  radiusRouteHelp:
    'The map covers both places and the walk between them, so the radius is not used.',
  landmarks: 'Landmarks to show',
  getData: 'Get map data',
  /** A11Y: the status line while a pull runs. */
  getting: (r, place) => `Getting map data within ${r} m of ${place}...`,
  /** A11Y: the status line while a pull for two places runs. */
  gettingRoute: (from, to) => `Getting map data around ${from} and ${to}...`,
  /** A11Y: the status line after a pull for two places. */
  gotRoute: (n, from, to) => `${n} map features around ${from} and ${to}.`,
  /** A11Y: the status line after a pull. */
  got: (n, r, w, c, b, l) =>
    `${n} map features within ${r} m: ${w} walkways, ${c} crossings, ${b} buildings, ${l} landmarks.`,
  /** A11Y: the server refused, or gave no answer; a back-off runs. */
  busyWait: (s) => `The map server is busy. Trying again in ${s} seconds.`,
  /** A11Y: the second back-off failed too. */
  busy: 'The map server is still busy. Try again in a few minutes, or export the area from openstreetmap.org and load it with Load an OpenStreetMap file.',
  /** A11Y: the pull did not answer. */
  noData:
    'The map data did not arrive. Check your connection and try again, or load an OpenStreetMap file instead.',
  attribution: ['Map data from ', 'OpenStreetMap contributors', ', ODbL'],
  loadFile: 'Load an OpenStreetMap file',
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
  draft: 'Make a draft map',
  routeDraft: 'Make a route map',
  /** A11Y: the status line after a route draft. */
  routeReady: (m, from, to, crossings, steps, w, h) =>
    `Route map ready: a ${m} m walk from ${from} to ${to}, ${crossings === 1 ? '1 crossing' : `${crossings} crossings`} and ${steps === 1 ? '1 flight of steps' : `${steps} flights of steps`} on the way. The map is ${w} x ${h} mm, fitted to the walk. Open the drawing editor to check it.`,
  /** A11Y: no walk joins the two places. */
  noWalk: (from, to) =>
    `No walking route joins ${from} and ${to} in this map data. Try other places, or load an OpenStreetMap file of the area.`,
  /** The route draft's name in the editor's header. */
  routeName: (from, to) => `Route map from ${from} to ${to}`,
  /** A11Y: the status line after a draft, with warnings. */
  draftReady: (on, total, w) =>
    `Draft map ready: ${on} of ${total} features on; ${w} warnings. Open the drawing editor to choose what stays.`,
  /** A11Y: the same, no warnings. */
  draftReadyClean: (on, total) =>
    `Draft map ready: ${on} of ${total} features on; no warnings. Open the drawing editor to choose what stays.`,
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
 * Build the section.
 *
 * @param {object} args
 * @param {(query: string) => Promise<Array<{name: string, lat: number, lon: number, kind: string}>>} args.searchPlaces
 * @param {(where: {lat: number, lon: number, radiusM: number, onWait: Function}) => Promise<{elements: object[], bytes: number}>} args.pullArea
 * @param {(file: File) => Promise<{elements: object[], center: {lat: number, lon: number}|null}>} args.readOsmFile
 * @param {(text: string, failed?: boolean) => void} args.say - writes the status line and announces once
 * @param {(place: object) => void} [args.onPlace]
 * @param {(osm: object) => void} [args.onData]
 * @param {() => void} [args.onDraft] - Make a draft map pressed (enabled once data exists)
 * @param {(on: boolean, gradePct: number) => void} [args.onSteep] - the switch moved (enabled once a draft exists)
 * @returns {{ el: HTMLElement, refs: object, getPlace: () => object|null, getData: () => object|null, destroy: () => void }}
 */
export function createAddressSection({
  searchPlaces,
  pullArea,
  readOsmFile,
  say,
  onPlace,
  onData,
  onDraft,
  onSteep,
}) {
  const S = ADDRESS_STRINGS;
  const section = el(
    'section',
    'braille-panel tactile-map-panel tactile-map-address'
  );
  section.id = 'tactileMapAddressSection';
  section.setAttribute('aria-labelledby', 'tactileMapAddressHeading');

  const heading = el('h2', 'braille-panel-heading', S.heading);
  heading.id = 'tactileMapAddressHeading';
  section.appendChild(heading);

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

  const getRow = el('div', 'braille-translate-row tactile-map-get-row');
  const getData = el(
    'button',
    'btn btn-primary braille-translate-btn',
    S.getData
  );
  getData.type = 'button';
  getData.id = 'tactileMapGetData';
  getData.disabled = true;
  getRow.appendChild(getData);
  section.appendChild(getRow);

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

  const draftRow = el('div', 'braille-translate-row tactile-map-draft-row');
  draftRow.id = 'tactileMapDraftRow';
  const draft = el('button', 'btn btn-primary braille-translate-btn', S.draft);
  draft.type = 'button';
  draft.id = 'tactileMapDraft';
  draft.disabled = true;
  draftRow.appendChild(draft);
  section.appendChild(draftRow);

  const steepRow = el('div', 'braille-panel-toggle-row tactile-map-steep-row');
  const steep = document.createElement('input');
  steep.type = 'checkbox';
  steep.id = 'tactileMapSteep';
  steep.disabled = true;
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

  const attribution = el(
    'p',
    'braille-panel-help tactile-map-attribution',
    S.attribution[0]
  );
  attribution.id = 'tactileMapAttribution';
  const link = el('a', '', S.attribution[1]);
  link.href = ATTRIBUTION_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.appendChild(el('span', 'sr-only', ' (opens in new tab)'));
  attribution.appendChild(link);
  attribution.appendChild(document.createTextNode(S.attribution[2]));
  section.appendChild(attribution);

  const status = el('p', 'braille-panel-help');
  status.id = 'tactileMapAddressStatus';
  status.setAttribute('role', 'status');
  section.appendChild(status);

  let place = null;
  let dest = null;
  let osm = null;
  let running = false;
  let pulling = false;

  /** A place's own name: the first part of the geocoder's long one. */
  const short = (p) => (p?.name || '').split(',')[0].trim();

  function clearList(list) {
    list.hidden = true;
    for (const node of [...list.children]) {
      if (node.tagName !== 'LEGEND') node.remove();
    }
  }

  function setPlace(p) {
    place = p;
    getData.disabled = !place || pulling;
    if (place) onPlace?.(place);
  }

  /**
   * The destination: with one, the map covers the walk between the two
   * places; data pulled for another destination is let go, a file kept.
   */
  function setDest(p) {
    dest = p;
    radiusHelp.textContent = dest ? S.radiusRouteHelp : S.radiusHelp;
    draft.textContent = dest ? S.routeDraft : S.draft;
    if (osm?.source === 'file') {
      keep({ ...osm, to: dest });
    } else if (osm) {
      osm = null;
      draft.disabled = true;
      onData?.(null);
    }
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
      setPlace(p);
      say(S.picked(p.name));
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

  function keep(data) {
    osm = data;
    draft.disabled = !osm;
    onData?.(osm);
  }

  /** Row 27 and, over 2 MB, row 37 in the same breath. */
  function sayCounts(elements, r, bytes) {
    const c = countFeatures(elements);
    let text = S.got(c.n, r, c.walkways, c.crossings, c.buildings, c.landmarks);
    if (bytes > BIG_BYTES) {
      text += ' ' + S.big((bytes / (1024 * 1024)).toFixed(1));
    }
    say(text);
  }

  async function pullRoute() {
    const at = place;
    const to = dest;
    const box = boxAround(at, to);
    say(S.gettingRoute(short(at), short(to)));
    const { elements, bytes } = await pullArea({
      box,
      onWait: (s) => say(S.busyWait(s)),
    });
    keep({
      elements,
      center: { lat: (at.lat + to.lat) / 2, lon: (at.lon + to.lon) / 2 },
      radiusM: null,
      box,
      source: 'overpass',
      place: at,
      to,
      landmarks: ticked(),
      bytes,
    });
    let text = S.gotRoute(countFeatures(elements).n, short(at), short(to));
    if (bytes > BIG_BYTES) {
      text += ' ' + S.big((bytes / (1024 * 1024)).toFixed(1));
    }
    say(text);
  }

  async function pull() {
    if (pulling || !place) return;
    pulling = true;
    getData.disabled = true;
    if (dest) {
      try {
        await pullRoute();
      } catch (error) {
        say(error?.code === 'busy' ? S.busy : S.noData, true);
      } finally {
        pulling = false;
        getData.disabled = !place;
      }
      return;
    }
    const r = radiusM();
    const at = place;
    say(S.getting(r, at.name));
    try {
      const { elements, bytes } = await pullArea({
        lat: at.lat,
        lon: at.lon,
        radiusM: r,
        onWait: (s) => say(S.busyWait(s)),
      });
      keep({
        elements,
        center: { lat: at.lat, lon: at.lon },
        radiusM: r,
        source: 'overpass',
        place: at,
        landmarks: ticked(),
        bytes,
      });
      sayCounts(elements, r, bytes);
    } catch (error) {
      say(error?.code === 'busy' ? S.busy : S.noData, true);
    } finally {
      pulling = false;
      getData.disabled = !place;
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
        to: dest,
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
  // makes the map a one-place map again.
  toInput.addEventListener('input', () => {
    if (toInput.value.trim() === '' && dest) {
      clearList(toResults);
      setDest(null);
    }
  });
  getData.addEventListener('click', () => {
    pull();
  });
  draft.addEventListener('click', () => {
    if (osm) onDraft?.();
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
      toInput,
      toButton,
      toResults,
      radius,
      landmarks,
      getData,
      loadFile,
      fileInput,
      draft,
      steep,
      grade,
      attribution,
      status,
    },
    getPlace: () => place,
    getDest: () => dest,
    getData: () => osm,
    /** A draft exists: the switch may be used; off: the switch rests and clears. */
    setDraftReady(ready) {
      steep.disabled = !ready;
      if (!ready) steep.checked = false;
    },
    destroy() {
      section.remove();
    },
  };
}
