/**
 * The Tactile Map Designer's address section: a typed address or place
 * name, a Search press, up to five places to pick from, and the sentences
 * the panel says on the way. The geocoder is injected; the announcer is
 * mocked; the panel's parameter writes land in the real stateManager.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../../src/js/ui-generator.js', async () => {
  const { stateManager } = await import('../../src/js/state.js');
  return {
    setParameterValue: vi.fn((name, value) => {
      const params = { ...(stateManager.getState().parameters || {}) };
      params[name] = value;
      stateManager.setState({ parameters: params });
      return true;
    }),
  };
});

vi.mock('../../src/js/announcer.js', () => ({
  announce: vi.fn(),
  announceChange: vi.fn(),
  announceError: vi.fn(),
  withdrawAnnouncement: vi.fn(),
}));

import {
  initMapPanel,
  destroyMapPanel,
  getMapPlace,
  getMapPlan,
} from '../../src/js/tactile-map/map-panel.js';
import { trimElement } from '../../src/js/tactile-map/osm-geometry.js';
import {
  announce,
  announceError,
  withdrawAnnouncement,
} from '../../src/js/announcer.js';
import { stateManager } from '../../src/js/state.js';
import { sampleStationPlan } from '../../src/js/tactile-map/plan.js';

const CONFIG = {
  mapFileParam: 'map_file',
  widthParam: 'map_width_mm',
  heightParam: 'map_height_mm',
  plateIdParam: 'plate_id',
  plateShowsTitleParam: 'plate_shows_title',
  plateShowsNorthParam: 'plate_shows_north',
};

const PLACES = [
  {
    name: 'The Seattle Public Library - Central Library, 1000, 4th Avenue, Seattle, Washington, 98104, United States',
    lat: 47.6067142,
    lon: -122.3326983,
    kind: 'library',
  },
  {
    name: "Howdy Y'all Coffee, 1000, 4th Avenue, Seattle, Washington, 98164, United States",
    lat: 47.6065451,
    lon: -122.3322194,
    kind: 'cafe',
  },
  {
    name: '1000, 4th Avenue, Central Business District, Seattle, Washington, 98104, United States',
    lat: 47.6064367,
    lon: -122.3328731,
    kind: 'toilets',
  },
  {
    name: 'Fountain of Wisdom, 1000, 4th Avenue, Seattle, Washington, 98104, United States',
    lat: 47.6063082,
    lon: -122.332823,
    kind: 'fountain',
  },
  {
    name: 'Seattle Central Library Garage, 1000, 4th Avenue, Seattle, Washington, 98104, United States',
    lat: 47.6069,
    lon: -122.3331,
    kind: 'parking',
  },
];

const failing = (code) =>
  vi.fn(async () => {
    const error = new Error(code);
    error.code = code;
    throw error;
  });

const input = () => document.getElementById('tactileMapAddress');
const searchBtn = () => document.getElementById('tactileMapSearch');
const results = () => document.getElementById('tactileMapResults');
const radios = () => [...results().querySelectorAll('input[type="radio"]')];
const status = () =>
  document.getElementById('tactileMapAddressStatus').textContent;

function mount(searchPlaces) {
  destroyMapPanel();
  initMapPanel(CONFIG, {
    plan: sampleStationPlan(),
    setFile: vi.fn(() => true),
    render: vi.fn(async () => new Uint8Array(84)),
    download: vi.fn(),
    searchPlaces,
  });
}

function type(text) {
  input().value = text;
  input().dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  document.body.innerHTML =
    '<div id="app"><div id="parametersContainer"></div></div>';
  stateManager.setState({
    uploadedFile: { name: 'tactile_map.scad', content: '// tile' },
    outputFormat: 'stl',
    parameters: { label_tape_width_mm: '12.7', title_text: 'Station' },
  });
  vi.clearAllMocks();
});

afterEach(() => {
  destroyMapPanel();
  document.body.innerHTML = '';
});

describe('the address section', () => {
  it('stands above the plates section with its heading, label, sentence and Search button', () => {
    mount(vi.fn(async () => PLACES));
    const section = document.getElementById('tactileMapAddressSection');
    expect(section).toBeTruthy();
    expect(section.nextElementSibling.id).toBe('tactileMapPanel');
    expect(section.querySelector('h2').textContent).toBe('Map from an address');
    expect(
      document.querySelector('label[for="tactileMapAddress"]').textContent
    ).toBe('Address or place');
    expect(document.getElementById('tactileMapAddressHelp').textContent).toBe(
      'A street address, an intersection, or the name of a place. Nothing is sent until you press Search.'
    );
    expect(input().getAttribute('type')).toBe('search');
    expect(input().getAttribute('autocomplete')).toBe('off');
    expect(searchBtn().textContent).toBe('Search');
    expect(results().hidden).toBe(true);
    // Shown, not a live region: the panel says each sentence once through
    // the announcer; a live region beside it made NVDA say each one twice.
    const line = document.getElementById('tactileMapAddressStatus');
    expect(line.getAttribute('role')).toBeNull();
    expect(line.getAttribute('aria-live')).toBeNull();
  });

  it('takes back a waiting "Searching..." when the places come back, so it is never said after them', async () => {
    mount(vi.fn(async () => PLACES));
    type('1000 4th Ave, Seattle, WA');
    searchBtn().click();
    await vi.waitFor(() => expect(radios()).toHaveLength(5));
    expect(withdrawAnnouncement).toHaveBeenCalledWith('tactile-map');
  });

  it('searches on the press, says so, lists the places as radios and focuses the first', async () => {
    const searchPlaces = vi.fn(async () => PLACES);
    mount(searchPlaces);
    type('1000 4th Ave, Seattle, WA');
    searchBtn().click();
    expect(status()).toBe('Searching for 1000 4th Ave, Seattle, WA...');
    expect(searchBtn().disabled).toBe(true);
    await vi.waitFor(() => expect(radios()).toHaveLength(5));
    expect(searchPlaces).toHaveBeenCalledWith('1000 4th Ave, Seattle, WA');
    expect(results().hidden).toBe(false);
    expect(results().querySelector('legend').textContent).toBe('Places found');
    expect(
      results().querySelector(`label[for="${radios()[0].id}"]`).textContent
    ).toBe(PLACES[0].name);
    expect(document.activeElement).toBe(radios()[0]);
    expect(status()).toBe('');
    expect(searchBtn().disabled).toBe(false);
    expect(announce).toHaveBeenCalledWith(
      'Searching for 1000 4th Ave, Seattle, WA...',
      {
        source: 'tactile-map',
      }
    );
  });

  it('searches on Enter in the field too, and says what was picked', async () => {
    mount(vi.fn(async () => PLACES));
    type('SeaTac Airport Station');
    input().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
    await vi.waitFor(() => expect(radios()).toHaveLength(5));
    radios()[1].click();
    expect(getMapPlace()).toEqual(PLACES[1]);
    expect(status()).toBe(
      `${PLACES[1].name} picked. Choose a radius and the landmarks, then get the map data. The preview shows an empty plate until you make a draft map.`
    );
  });

  it('says when nothing is found, and hides the list', async () => {
    mount(vi.fn(async () => []));
    type('zzzz qqq');
    searchBtn().click();
    await vi.waitFor(() =>
      expect(status()).toBe(
        'No place found for zzzz qqq. Try adding the city or a postal code.'
      )
    );
    expect(results().hidden).toBe(true);
    expect(getMapPlace()).toBeNull();
  });

  it('says when the search did not answer, as an error', async () => {
    mount(failing('no-answer'));
    type('Pike St');
    searchBtn().click();
    await vi.waitFor(() =>
      expect(status()).toBe(
        'The address search did not answer. Check your connection and try again, or load an OpenStreetMap file instead.'
      )
    );
    expect(announceError).toHaveBeenCalledWith(status(), {
      source: 'tactile-map',
    });
    expect(searchBtn().disabled).toBe(false);
  });

  it('says one search a second when the geocoder refuses the pace', async () => {
    mount(failing('rate'));
    type('Pike St');
    searchBtn().click();
    await vi.waitFor(() =>
      expect(status()).toBe('One search a second; try again in a moment.')
    );
  });

  it('asks for an address before searching nothing, without calling the geocoder', () => {
    const searchPlaces = vi.fn(async () => PLACES);
    mount(searchPlaces);
    type('   ');
    searchBtn().click();
    expect(searchPlaces).not.toHaveBeenCalled();
    expect(status()).toBe('Type an address or a place first.');
  });
});

describe('the pull, sentence by sentence', () => {
  const PLACE = PLACES[0];
  const MAIN = "OpenStreetMap's main server";
  const VK = "VK Maps' server";
  const getData = () => document.getElementById('tactileMapGetData');

  async function pick(pullArea) {
    destroyMapPanel();
    initMapPanel(CONFIG, {
      plan: sampleStationPlan(),
      setFile: vi.fn(() => true),
      render: vi.fn(async () => new Uint8Array(84)),
      download: vi.fn(),
      searchPlaces: vi.fn(async () => [PLACE]),
      pullArea,
    });
    type('1000 4th Ave, Seattle, WA');
    searchBtn().click();
    await vi.waitFor(() => expect(radios()).toHaveLength(1));
    radios()[0].click();
    vi.clearAllMocks();
  }

  it('says the switch to the second server once, in one sentence, when the main server refuses this site, then the counts', async () => {
    await pick(
      vi.fn(async ({ onWait }) => {
        onWait(0, VK, { from: MAIN, reason: 'refused' });
        return { elements: [], bytes: 10, ms: 1, host: VK };
      })
    );
    getData().click();
    await vi.waitFor(() =>
      expect(status()).toBe(
        '0 map features within 250 m: 0 walkways, 0 crossings, 0 buildings, 0 landmarks.'
      )
    );
    expect(announce.mock.calls.map((c) => c[0])).toEqual([
      `Getting map data within 250 m of ${PLACE.name}...`,
      "OpenStreetMap's main server refused this site's request. Trying VK Maps' server; this can take half a minute.",
      '0 map features within 250 m: 0 walkways, 0 crossings, 0 buildings, 0 landmarks.',
    ]);
    expect(announceError).not.toHaveBeenCalled();
  });

  it('names a server that ran out of time, or sent no map data, the same way', async () => {
    await pick(
      vi.fn(async ({ onWait }) => {
        onWait(0, VK, { from: MAIN, reason: 'no-answer' });
        onWait(0, VK, { from: MAIN, reason: 'no-data' });
        return { elements: [], bytes: 10, ms: 1, host: VK };
      })
    );
    getData().click();
    await vi.waitFor(() =>
      expect(announce.mock.calls.map((c) => c[0])).toContain(
        "OpenStreetMap's main server sent no map data. Trying VK Maps' server; this can take half a minute."
      )
    );
    expect(announce.mock.calls.map((c) => c[0])).toContain(
      "OpenStreetMap's main server did not answer in time. Trying VK Maps' server; this can take half a minute."
    );
  });

  it('says every stage of a pull that no server answers, in order, and ends on what to do, as an error', async () => {
    await pick(
      vi.fn(async ({ onWait }) => {
        onWait(0, VK, { from: MAIN, reason: 'refused' });
        onWait(30);
        onWait(0, VK, { from: MAIN, reason: 'refused' });
        onWait(60);
        onWait(0, VK, { from: MAIN, reason: 'refused' });
        const error = new Error('busy');
        error.code = 'busy';
        throw error;
      })
    );
    getData().click();
    const END =
      'No map server answered. Try again in a few minutes, or export the area from openstreetmap.org and use the file instead.';
    await vi.waitFor(() => expect(status()).toBe(END));
    const SWITCH =
      "OpenStreetMap's main server refused this site's request. Trying VK Maps' server; this can take half a minute.";
    expect(announce.mock.calls.map((c) => c[0])).toEqual([
      `Getting map data within 250 m of ${PLACE.name}...`,
      SWITCH,
      'No map server answered. Trying again in 30 seconds.',
      SWITCH,
      'No map server answered. Trying again in 60 seconds.',
      SWITCH,
    ]);
    expect(announceError.mock.calls.map((c) => c[0])).toEqual([END]);
    expect(getData().disabled).toBe(false);
  });
});

describe('the waiting plate and the status box', () => {
  const PLACE = PLACES[0];
  const getData = () => document.getElementById('tactileMapGetData');
  const draft = () => document.getElementById('tactileMapDraft');
  const box = () => document.getElementById('tactileMapAddressStatus');
  const reason = () => document.getElementById('tactileMapDraftReason');
  const params = () => stateManager.getState().parameters;
  const DATA = { elements: [], bytes: 10, ms: 1, host: "VK Maps' server" };

  function mountWith(extra = {}) {
    destroyMapPanel();
    initMapPanel(
      { ...CONFIG, titleParam: 'title_text' },
      {
        plan: sampleStationPlan(),
        setFile: vi.fn(() => true),
        render: vi.fn(async () => new Uint8Array(84)),
        download: vi.fn(),
        searchPlaces: vi.fn(async () => [PLACE]),
        ...extra,
      }
    );
  }

  async function pickFirst() {
    type('1000 4th Ave, Seattle, WA');
    searchBtn().click();
    await vi.waitFor(() => expect(radios()).toHaveLength(1));
    radios()[0].click();
  }

  it('is a box directly under the draft button, shown and not live, and hidden while empty', () => {
    mountWith();
    expect(box().classList.contains('tactile-map-status-box')).toBe(true);
    expect(box().previousElementSibling.id).toBe('tactileMapDraftRow');
    expect(box().getAttribute('role')).toBeNull();
    expect(box().getAttribute('aria-live')).toBeNull();
    expect(box().textContent).toBe('');
  });

  it('replaces the sample station with an empty plate of the same size the moment a place is picked, titled NO MAP YET, and says so with the pick', async () => {
    mountWith();
    expect(getMapPlan().features.length).toBeGreaterThan(0);
    await pickFirst();
    const plan = getMapPlan();
    expect(plan.features).toEqual([]);
    expect(plan.size).toEqual({ w: 480, h: 360 });
    expect(plan.meta.waiting).toBe(true);
    expect(plan.meta.title).toBe('NO MAP YET');
    expect(params().title_text).toBe('NO MAP YET');
    expect(box().textContent).toBe(
      `${PLACE.name} picked. Choose a radius and the landmarks, then get the map data. The preview shows an empty plate until you make a draft map.`
    );
    expect(announce).toHaveBeenLastCalledWith(box().textContent, {
      source: 'tactile-map',
    });
  });

  it('keeps Make a draft map disabled with its reason beside it until data arrives, then drops the reason', async () => {
    mountWith({ pullArea: vi.fn(async () => DATA) });
    expect(draft().disabled).toBe(true);
    expect(draft().getAttribute('aria-describedby')).toBe(
      'tactileMapDraftReason'
    );
    expect(reason().textContent).toBe('Get the map data first.');
    expect(reason().hidden).toBe(false);
    await pickFirst();
    getData().click();
    await vi.waitFor(() => expect(draft().disabled).toBe(false));
    expect(draft().hasAttribute('aria-describedby')).toBe(false);
    expect(reason().hidden).toBe(true);
  });

  it('shows a failed pull as a failure: the box marked failed, the failure first, Make still disabled with its reason', async () => {
    const busy = Object.assign(new Error('busy'), { code: 'busy' });
    mountWith({
      pullArea: vi.fn(async () => {
        throw busy;
      }),
    });
    await pickFirst();
    getData().click();
    await vi.waitFor(() =>
      expect(box().classList.contains('is-failed')).toBe(true)
    );
    expect(box().textContent.startsWith('No map server answered.')).toBe(true);
    expect(draft().disabled).toBe(true);
    expect(draft().getAttribute('aria-describedby')).toBe(
      'tactileMapDraftReason'
    );
    expect(reason().hidden).toBe(false);
    // The next sentence that is not a failure clears the mark.
    type('1000 4th Ave, Seattle, WA');
    searchBtn().click();
    await vi.waitFor(() =>
      expect(box().classList.contains('is-failed')).toBe(false)
    );
  });

  it('Edit drawing as a map on the empty plate says what to do instead of opening the editor', async () => {
    const editor = { open: vi.fn() };
    mountWith({ getEditor: async () => editor });
    await pickFirst();
    document.getElementById('tactileMapEditDrawing').click();
    await vi.waitFor(() =>
      expect(
        document.getElementById('tactileMapDrawingStatus').textContent
      ).toBe(
        'No map yet. Make a draft map first, or choose a drawing for the map file.'
      )
    );
    expect(editor.open).not.toHaveBeenCalled();
  });

  it('clears the NO MAP YET title when a draft is made, and keeps a title the person typed', async () => {
    const elements = JSON.parse(
      readFileSync('tests/fixtures/tactile-map/overpass-20.json', 'utf8')
    ).elements.map(trimElement);
    const editor = { open: vi.fn() };
    const pullArea = vi.fn(async () => ({ ...DATA, elements }));
    mountWith({ pullArea, getEditor: async () => editor });
    await pickFirst();
    expect(params().title_text).toBe('NO MAP YET');
    getData().click();
    await vi.waitFor(() => expect(draft().disabled).toBe(false));
    draft().click();
    await vi.waitFor(() => expect(editor.open).toHaveBeenCalled());
    expect(params().title_text).toBe('');
    expect(getMapPlan().meta.waiting).toBeFalsy();

    // A title typed while waiting stays through the draft.
    mountWith({ pullArea, getEditor: async () => editor });
    await pickFirst();
    stateManager.setState({
      parameters: { ...params(), title_text: 'Gates Center' },
    });
    getData().click();
    await vi.waitFor(() => expect(draft().disabled).toBe(false));
    draft().click();
    await vi.waitFor(() => expect(editor.open).toHaveBeenCalledTimes(2));
    expect(params().title_text).toBe('Gates Center');
  });

  it('never replaces a draft already made when another place is picked', async () => {
    const elements = JSON.parse(
      readFileSync('tests/fixtures/tactile-map/overpass-20.json', 'utf8')
    ).elements.map(trimElement);
    const editor = { open: vi.fn() };
    mountWith({
      pullArea: vi.fn(async () => ({ ...DATA, elements })),
      getEditor: async () => editor,
    });
    await pickFirst();
    getData().click();
    await vi.waitFor(() => expect(draft().disabled).toBe(false));
    draft().click();
    await vi.waitFor(() => expect(editor.open).toHaveBeenCalled());
    const drafted = getMapPlan();
    expect(drafted.features.length).toBeGreaterThan(0);
    await pickFirst();
    expect(getMapPlan()).toBe(drafted);
    expect(params().title_text).toBe('');
  });
});
