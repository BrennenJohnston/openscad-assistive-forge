/**
 * The Tactile Map Designer's address section: a typed address or place
 * name, a Search press, up to five places to pick from, and the sentences
 * the panel says on the way. The geocoder is injected; the announcer is
 * mocked; the panel's parameter writes land in the real stateManager.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
}));

import {
  initMapPanel,
  destroyMapPanel,
  getMapPlace,
} from '../../src/js/tactile-map/map-panel.js';
import { announce, announceError } from '../../src/js/announcer.js';
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
    expect(
      document.getElementById('tactileMapAddressStatus').getAttribute('role')
    ).toBe('status');
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
      `${PLACES[1].name} picked. Choose a radius and the landmarks, then get the map data.`
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
