/**
 * The Tactile Map Designer's address controls: a typed address or place
 * name, a Search press, up to five places to pick from (and, for a route
 * map, where the walk ends); the map's scale; the steps on the way; the
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
 * - `pullArea({ box, onWait })` resolves `{ elements, bytes,
 *   host }`, calling `onWait(seconds)` before each back-off and
 *   `onWait(0, nextServer, { from, reason })` when it moves to the next
 *   server at once, or rejects with 'busy' or 'no-answer';
 * - `readOsmFile(file)` resolves `{ elements, center }` or rejects with
 *   'not-osm'.
 *
 * The data kept for the draft: `{ elements, center, radiusM, scale, source,
 * place, landmarks, bytes, host, key }` with `scale` the choice's `{ key,
 * name, ratio, rules }`, `radiusM` how far its ground reaches, `source`
 * 'overpass' or 'file', `host`
 * the name of the source that answered, and `key` what was asked for, so a
 * second press for the same place reuses it.
 *
 * @license GPL-3.0-or-later
 */
import {
  SCALES,
  CUSTOM_RANGE,
  scaleChoice as scaleChoiceOf,
  nearestRule,
  groundAcrossM,
  groundBox,
  sentenceFor,
} from './scales.js';
import { TRANSIT_STRINGS } from './transit.js';

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
  /** A11Y: the scale choices' group name. */
  scaleLegend: 'Map scale',
  /** A11Y: a scale choice's name, with its ratio. */
  scaleLabel: (name, ratio) => `${name}, 1:${ratio}`,
  /** A11Y: Custom's ratio field. */
  customLabel: 'Custom scale, 1 to',
  /** A11Y: the route's steps choice, its group name and its two answers. */
  stepsLegend: 'Steps on the way',
  stepsAllow: 'Allowed, and marked on the map',
  stepsAvoid: 'Avoided where another way exists',
  /** A11Y: a route's mode question and its two answers (row 15). */
  travelLegend: 'On foot, or by bus and train?',
  travelWalk: 'On foot',
  travelTransit: 'By bus and train',
  /** A11Y: the time a trip by bus and train leaves. */
  leaveAt: 'Leave at',
  findJourneys: 'Find journeys',
  /** A11Y: the journeys' group name; the walk's question and its answers. */
  journeysLegend: 'Journeys',
  whichWalkLegend: 'Which walk to map',
  walkTo: 'The walk to the stop',
  walkFrom: 'The walk from the stop',
  /** A11Y: while the planner is asked, and its answers. */
  findingJourneys: (from, to) => `Finding journeys from ${from} to ${to}...`,
  journeysFound: (n) => (n === 1 ? '1 journey found.' : `${n} journeys found.`),
  journeysNone:
    'No journey by bus and train joins these places at that time. Try another time, or go on foot.',
  journeysRate:
    'The journey planner asks for a moment between searches. Try again shortly.',
  journeysNoAnswer:
    'The journey planner did not answer. Check your connection and try again, or go on foot.',
  /** A11Y: after a route's ready sentence, the journey the walk is part of. */
  journeyNote: (words) => ` The journey: ${words}`,
  landmarks: 'Landmarks to show',
  /** The one button: gets the data, drafts, opens the editor. */
  make: 'Make the map',
  /** A11Y: the status line while a pull runs. */
  getting: (w, h, place) =>
    `Getting map data for ${w} by ${h} m around ${place}...`,
  /** A11Y: the status line while a pull for two places runs. */
  gettingRoute: (from, to) => `Getting map data around ${from} and ${to}...`,
  /** A11Y: the status line after a pull for two places. */
  gotRoute: (n, from, to) => `${n} map features around ${from} and ${to}.`,
  /** A11Y: the status line after a pull. */
  got: (n, gw, gh, w, c, b, l) =>
    `${n} map features in ${gw} by ${gh} m: ${w} walkways, ${c} crossings, ${b} buildings, ${l} landmarks.`,
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
    `${mb} MB of map data arrived. A scale with less ground makes a lighter map.`,
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
    `No sidewalks within ${d} m of the address. Try a scale with more ground, or another address.`,
  /** A11Y: after the ready sentence when a draft was over the editor's limit. */
  leftOut: (n) =>
    ` ${n} features far from the address were left out: the editor works with 1,000 at a time.`,
  /** A11Y: a scale that draws no sidewalks found no street either. */
  nothingDrawn:
    'No streets in the map data at this scale. Try another scale or another address.',
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
/** The scale a place map starts at, and Custom's first ratio. */
export const SCALE_START = 'block';
export const CUSTOM_START = 1500;
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
  plateSize = () => ({ w: 480, h: 360 }),
  planJourneys = null,
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

  // The scale: named for the ground it fits, each saying what it fits on
  // the plate and what draws; Custom takes a ratio.
  const scaleChoice = el('fieldset', 'braille-panel-choice tactile-map-scale');
  scaleChoice.id = 'tactileMapScale';
  scaleChoice.appendChild(el('legend', '', S.scaleLegend));
  const placeScales = SCALES.filter((c) => c.key !== 'route');
  const scaleSentences = new Map();
  const scaleRadios = placeScales.map((choice) => {
    const line = el('div', 'braille-panel-toggle-row tactile-map-scale-row');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'tactileMapScale';
    radio.id = `tactileMapScale-${choice.key}`;
    radio.value = choice.key;
    radio.checked = choice.key === SCALE_START;
    const words = el(
      'label',
      '',
      choice.ratio ? S.scaleLabel(choice.name, choice.ratio) : choice.name
    );
    words.htmlFor = radio.id;
    const sentence = el('p', 'braille-panel-help tactile-map-scale-sentence');
    sentence.id = `${radio.id}-sentence`;
    radio.setAttribute('aria-describedby', sentence.id);
    scaleSentences.set(choice.key, sentence);
    line.appendChild(radio);
    line.appendChild(words);
    scaleChoice.appendChild(line);
    scaleChoice.appendChild(sentence);
    return radio;
  });
  const customRow = el(
    'div',
    'braille-panel-field-row tactile-map-scale-custom'
  );
  const customLabel = el('label', '', S.customLabel);
  customLabel.htmlFor = 'tactileMapScaleCustom';
  const custom = document.createElement('input');
  custom.type = 'number';
  custom.id = 'tactileMapScaleCustom';
  custom.className = 'braille-panel-number';
  custom.min = String(CUSTOM_RANGE.min);
  custom.max = String(CUSTOM_RANGE.max);
  custom.step = '50';
  custom.value = String(CUSTOM_START);
  custom.inputMode = 'numeric';
  custom.setAttribute('aria-describedby', 'tactileMapScale-custom-sentence');
  customRow.appendChild(customLabel);
  customRow.appendChild(custom);
  customRow.hidden = true;
  scaleChoice.appendChild(customRow);
  section.appendChild(scaleChoice);

  // A route: on foot, or by bus and train, a journey the planner finds on
  // a press; a trip's map is one of its walks, to the first stop or from
  // the last.
  const choiceRow = (name, id, value, text, on) => {
    const line = el('div', 'braille-panel-toggle-row');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = name;
    radio.id = id;
    radio.value = value;
    radio.checked = on;
    const words = el('label', '', text);
    words.htmlFor = id;
    line.appendChild(radio);
    line.appendChild(words);
    return { line, radio };
  };
  const travelChoice = el(
    'fieldset',
    'braille-panel-choice tactile-map-travel'
  );
  travelChoice.id = 'tactileMapTravel';
  travelChoice.appendChild(el('legend', '', S.travelLegend));
  const travelRadios = [
    ['walk', S.travelWalk, true],
    ['transit', S.travelTransit, false],
  ].map(([value, text, on]) => {
    const { line, radio } = choiceRow(
      'tactileMapTravel',
      `tactileMapTravel-${value}`,
      value,
      text,
      on
    );
    travelChoice.appendChild(line);
    return radio;
  });
  section.appendChild(travelChoice);

  const transitBox = el('div', 'tactile-map-transit');
  transitBox.id = 'tactileMapTransit';
  transitBox.hidden = true;
  const leaveRow = el('div', 'braille-panel-field-row');
  const leaveLabel = el('label', '', S.leaveAt);
  leaveLabel.htmlFor = 'tactileMapLeaveAt';
  const leaveAt = document.createElement('input');
  leaveAt.type = 'datetime-local';
  leaveAt.id = 'tactileMapLeaveAt';
  leaveAt.className = 'braille-panel-number';
  {
    const d = new Date();
    d.setSeconds(0, 0);
    leaveAt.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  }
  leaveRow.appendChild(leaveLabel);
  leaveRow.appendChild(leaveAt);
  transitBox.appendChild(leaveRow);
  const findRow = el('div', 'braille-translate-row');
  const find = el(
    'button',
    'btn btn-secondary braille-translate-btn',
    S.findJourneys
  );
  find.type = 'button';
  find.id = 'tactileMapFindJourneys';
  findRow.appendChild(find);
  transitBox.appendChild(findRow);
  // Shown, not live: the same sentence goes once through the announcer.
  const journeyStatus = el('p', 'braille-panel-help');
  journeyStatus.id = 'tactileMapJourneyStatus';
  transitBox.appendChild(journeyStatus);
  const journeysBox = el(
    'fieldset',
    'braille-panel-choice tactile-map-journeys'
  );
  journeysBox.id = 'tactileMapJourneys';
  journeysBox.hidden = true;
  transitBox.appendChild(journeysBox);
  const whichWalk = el(
    'fieldset',
    'braille-panel-choice tactile-map-which-walk'
  );
  whichWalk.id = 'tactileMapWhichWalk';
  whichWalk.hidden = true;
  whichWalk.appendChild(el('legend', '', S.whichWalkLegend));
  const walkRadios = [
    ['to', S.walkTo, true],
    ['from', S.walkFrom, false],
  ].map(([value, text, on]) => {
    const { line, radio } = choiceRow(
      'tactileMapWhichWalk',
      `tactileMapWhichWalk-${value}`,
      value,
      text,
      on
    );
    whichWalk.appendChild(line);
    return radio;
  });
  transitBox.appendChild(whichWalk);
  const transitCredit = el('p', 'braille-panel-help tactile-map-attribution');
  transitCredit.id = 'tactileMapTransitCredit';
  transitBox.appendChild(transitCredit);
  section.appendChild(transitBox);

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
  transitCredit.appendChild(
    document.createTextNode(TRANSIT_STRINGS.attribution[0])
  );
  transitCredit.appendChild(
    outLink(TRANSIT_STRINGS.attribution[1], TRANSIT_STRINGS.sourcesUrl)
  );
  transitCredit.appendChild(
    document.createTextNode(TRANSIT_STRINGS.attribution[2])
  );

  /** The groups the panel's steps lay out. */
  const parts = {
    where: [label, help, row, results],
    to: [toLabel, toHelp, toRow, toResults],
    scale: [scaleChoice],
    travel: [travelChoice, transitBox],
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

  /** Custom's ratio, kept inside its range. */
  function customRatio() {
    const n = Number(custom.value);
    if (!Number.isFinite(n)) return CUSTOM_START;
    return Math.min(CUSTOM_RANGE.max, Math.max(CUSTOM_RANGE.min, n));
  }

  /** The scale chosen: its key, name, ratio and drawing rules. */
  function currentScale() {
    const key = scaleRadios.find((r) => r.checked)?.value || SCALE_START;
    const choice = scaleChoiceOf(key);
    const ratio = choice.ratio || customRatio();
    return {
      key,
      name: choice.name,
      ratio,
      rules: choice.rules || nearestRule(ratio),
    };
  }

  /** The ground the chosen scale covers on the plate, in whole meters. */
  function ground() {
    const { ratio } = currentScale();
    const plate = plateSize();
    return {
      w: Math.round(groundAcrossM(ratio, plate.w)),
      h: Math.round(groundAcrossM(ratio, plate.h)),
    };
  }

  /** Each choice's sentence for the plate as it is now; Custom's ratio. */
  function refreshScale() {
    const plate = plateSize();
    for (const radio of scaleRadios) {
      const choice = scaleChoiceOf(radio.value);
      scaleSentences.get(choice.key).textContent = sentenceFor(
        choice,
        plate,
        choice.ratio || customRatio()
      );
    }
    customRow.hidden = currentScale().key !== 'custom';
  }

  const ticked = () => boxes.filter((b) => b.checked).map((b) => b.value);
  const isRoute = () => mode === 'route' && Boolean(dest);

  let journeys = [];
  let journey = null;
  const byTransit = () => travelRadios[1].checked;

  /** How the route goes: on foot, or the journey picked and which walk. */
  function getTravel() {
    if (!byTransit()) return { mode: 'walk' };
    return {
      mode: 'transit',
      journey,
      walk: walkRadios[1].checked ? 'from' : 'to',
    };
  }

  /**
   * The walk a route map draws: between the two places on foot; by bus and
   * train, from the first place to the first stop, or from the last stop to
   * the second place, the stop named with its line.
   */
  function walkEnds() {
    const travel = getTravel();
    if (travel.mode !== 'transit' || !travel.journey) {
      return { from: place, to: dest, stopName: null };
    }
    const rides = travel.journey.legs.filter((l) => l.mode !== 'WALK');
    const ride = travel.walk === 'from' ? rides[rides.length - 1] : rides[0];
    const stop = travel.walk === 'from' ? ride.to : ride.from;
    const at = { name: stop.name, lat: stop.lat, lon: stop.lon };
    const stopName = `${stop.name}, ${ride.routeShortName || ride.mode}`;
    return travel.walk === 'from'
      ? { from: at, to: dest, stopName }
      : { from: place, to: at, stopName };
  }

  /** What a pull asks for: the same key, the same data. */
  function pullKey() {
    if (!place) return null;
    const plate = plateSize();
    if (isRoute()) {
      const ends = walkEnds();
      return `route:${ends.from.lat},${ends.from.lon}:${ends.to.lat},${ends.to.lon}`;
    }
    return `place:${place.lat},${place.lon}:${currentScale().ratio}:${plate.w}x${plate.h}`;
  }

  function leaveTime() {
    const t = new Date(leaveAt.value);
    return Number.isFinite(t.getTime()) ? t : new Date();
  }

  function showJourneys() {
    journeysBox.replaceChildren(el('legend', '', S.journeysLegend));
    journeys.forEach((j, i) => {
      const { line, radio } = choiceRow(
        'tactileMapJourney',
        `tactileMapJourney-${i + 1}`,
        String(i),
        j.words,
        false
      );
      radio.addEventListener('change', () => {
        journey = journeys[i];
        whichWalk.hidden = false;
        onChange();
      });
      journeysBox.appendChild(line);
    });
    journeysBox.hidden = journeys.length === 0;
    whichWalk.hidden = true;
    journey = null;
  }

  /** Find journeys by bus and train between the two places: one request a press. */
  async function findJourneys() {
    if (!place || !dest || !planJourneys) {
      say(S.needBoth, true);
      return;
    }
    find.disabled = true;
    const asking = S.findingJourneys(short(place), short(dest));
    say(asking);
    journeyStatus.textContent = asking;
    try {
      journeys = await planJourneys({
        from: place,
        to: dest,
        when: leaveTime(),
        mode: 'transit',
      });
      showJourneys();
      const found = S.journeysFound(journeys.length);
      say(found);
      journeyStatus.textContent = found;
    } catch (error) {
      journeys = [];
      showJourneys();
      const failed =
        error?.code === 'rate'
          ? S.journeysRate
          : error?.code === 'none-found'
            ? S.journeysNone
            : S.journeysNoAnswer;
      say(failed, true);
      journeyStatus.textContent = failed;
    } finally {
      find.disabled = false;
      onChange();
    }
  }

  function keep(data) {
    osm = data;
    onData?.(osm);
    onChange();
  }

  /** Row 27, shown, not said: the draft's sentence follows at once. */
  function countsSentence(elements, g, from, to) {
    const c = countFeatures(elements);
    return to
      ? S.gotRoute(c.n, short(from), short(to))
      : S.got(c.n, g.w, g.h, c.walkways, c.crossings, c.buildings, c.landmarks);
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
    const ends = isRoute() ? walkEnds() : null;
    const at = ends ? ends.from : place;
    const to = ends ? ends.to : null;
    const scale = currentScale();
    const g = ground();
    const where = to
      ? { box: boxAround(at, to) }
      : { box: groundBox(at, scale.ratio, plateSize()) };
    say(
      to ? S.gettingRoute(short(at), short(to)) : S.getting(g.w, g.h, at.name)
    );
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
        // How far the ground reaches from the place, for the height tiles.
        radiusM: to ? null : Math.max(g.w, g.h) / 2,
        scale: to ? null : scale,
        box: where.box,
        source: 'overpass',
        place: at,
        to,
        travel: ends
          ? {
              ...getTravel(),
              stopName: ends.stopName,
              words: journey?.words || null,
            }
          : null,
        landmarks: ticked(),
        bytes,
        host,
        key,
      });
      // The draft's sentence follows at once and is the one said.
      say(countsSentence(elements, g, at, to), false, { quiet: true });
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
        radiusM: Math.max(ground().w, ground().h) / 2,
        scale: currentScale(),
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
  for (const radio of travelRadios) {
    radio.addEventListener('change', () => {
      transitBox.hidden = !byTransit();
      onChange();
    });
  }
  for (const radio of walkRadios) {
    radio.addEventListener('change', () => onChange());
  }
  find.addEventListener('click', () => {
    findJourneys();
  });

  for (const radio of scaleRadios) {
    radio.addEventListener('change', () => {
      refreshScale();
      onChange();
    });
  }
  custom.addEventListener('input', () => refreshScale());
  custom.addEventListener('change', () => refreshScale());
  refreshScale();

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
      scale: scaleChoice,
      custom,
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
    getTravel,
    getScale: () => currentScale(),
    /** The plate's size changed: the ground each choice covers did too. */
    refreshScale,
    steepWanted: () => ({ on: steep.checked, gradePct: gradePct() }),
    destroy() {
      section.remove();
    },
  };
}
