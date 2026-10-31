/**
 * A route map in the Tactile Map Designer panel: a second address, "To",
 * with its own search; Get map data asks for the box around both places;
 * Make a route map drafts the walk between them and opens it in the editor;
 * Edit drawing as a map reopens whatever the plan came from, a draft or a
 * drawing, with its classes; the plate sizes are said in whole tenths.
 *
 * The data is the fixture of the walk from the Husky Union Building to the
 * Bill & Melinda Gates Center (OpenStreetMap contributors, ODbL).
 *
 * @license GPL-3.0-or-later
 */
import { readFileSync } from 'node:fs';
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
  getMapData,
  getMapPlan,
} from '../../src/js/tactile-map/map-panel.js';
import { ADDRESS_STRINGS as S } from '../../src/js/tactile-map/address-section.js';
import { trimElement } from '../../src/js/tactile-map/osm-geometry.js';
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
const HUB = {
  name: 'Husky Union Building, 4001, East Stevens Way Northeast, Seattle, Washington, 98195, United States',
  lat: 47.6553685,
  lon: -122.3051021,
  kind: 'university',
};
const GATES = {
  name: 'Bill & Melinda Gates Center, 3800, East Stevens Way Northeast, Seattle, Washington, 98195, United States',
  lat: 47.652873,
  lon: -122.3044814,
  kind: 'university',
};
const FIXTURE = JSON.parse(
  readFileSync('tests/fixtures/tactile-map/uw-hub-gates.json', 'utf8')
);
const ELEMENTS = () => FIXTURE.elements.map(trimElement).filter(Boolean);
// Drafting the walk took 2.4 s with 32 other test files running beside it;
// the default wait is 1 s.
const SETTLE = { timeout: 10_000, interval: 25 };

const $ = (id) => document.getElementById(id);
const addressStatus = () => $('tactileMapAddressStatus').textContent;

let opened;
let files;
const editor = {
  open: vi.fn((svg, analysis, options) => {
    opened = { svg, analysis, options };
  }),
};

function mount(options = {}) {
  destroyMapPanel();
  initMapPanel(CONFIG, {
    plan: sampleStationPlan(),
    setFile: vi.fn((name, fileName, svg) => {
      files.push({ name, fileName, svg });
      return true;
    }),
    render: vi.fn(async () => new Uint8Array(84)),
    download: vi.fn(),
    getEditor: async () => editor,
    searchPlaces: vi.fn(async (q) => (/gates/i.test(q) ? [GATES] : [HUB])),
    pullArea: vi.fn(async () => ({ elements: ELEMENTS(), bytes: 188956 })),
    ...options,
  });
}

async function pick(inputId, buttonId, resultsId, text) {
  const input = $(inputId);
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  $(buttonId).click();
  await vi.waitFor(
    () =>
      expect(
        document.querySelectorAll(`#${resultsId} input[type="radio"]`)
      ).toHaveLength(1),
    SETTLE
  );
  document.querySelector(`#${resultsId} input[type="radio"]`).click();
}

const pickFrom = () =>
  pick('tactileMapAddress', 'tactileMapSearch', 'tactileMapResults', 'HUB');
const pickTo = () =>
  pick('tactileMapTo', 'tactileMapToSearch', 'tactileMapToResults', 'Gates');

beforeEach(() => {
  document.body.innerHTML =
    '<div id="app"><div id="parametersContainer"></div></div>';
  stateManager.setState({
    uploadedFile: { name: 'tactile_map.scad', content: '// tile' },
    outputFormat: 'stl',
    parameters: { label_tape_width_mm: '12.7', title_text: '' },
  });
  opened = null;
  files = [];
  vi.clearAllMocks();
});

afterEach(() => {
  destroyMapPanel();
  document.body.innerHTML = '';
});

describe('the second address', () => {
  it('stands after the first place, with its label, its sentence, its own Search and a hidden list of destinations', () => {
    mount();
    const label = document.querySelector('label[for="tactileMapTo"]');
    expect(label.textContent).toBe(S.toLabel);
    expect($('tactileMapTo').type).toBe('search');
    expect($('tactileMapTo').getAttribute('aria-describedby')).toBe(
      'tactileMapToHelp'
    );
    expect($('tactileMapToHelp').textContent).toBe(S.toHelp);
    expect($('tactileMapToSearch').textContent).toBe('Search');
    expect($('tactileMapToResults').hidden).toBe(true);
    expect($('tactileMapToResults').querySelector('legend').textContent).toBe(
      S.toFound
    );
    const order = [...$('tactileMapAddressSection').children].map((n) => n.id);
    expect(order.indexOf('tactileMapResults')).toBeLessThan(
      order.indexOf('tactileMapToHelp')
    );
  });

  it('with both places picked, asks for the box around both and keeps both, and the radius sentence says it is not used', async () => {
    mount();
    await pickFrom();
    await pickTo();
    expect(addressStatus()).toBe(S.toPicked('Bill & Melinda Gates Center'));
    expect($('tactileMapRadiusHelp').textContent).toBe(S.radiusRouteHelp);
    $('tactileMapGetData').click();
    expect(addressStatus()).toBe(
      S.gettingRoute('Husky Union Building', 'Bill & Melinda Gates Center')
    );
    await vi.waitFor(() => expect(getMapData()).not.toBeNull(), SETTLE);
    const pull = getMapData();
    expect(pull.place).toEqual(HUB);
    expect(pull.to).toEqual(GATES);
    expect(addressStatus()).toMatch(
      /^\d+ map features around Husky Union Building and Bill & Melinda Gates Center\.$/
    );
  });

  it('asks Overpass for a box holding both places with at least 100 m to spare', async () => {
    const pullArea = vi.fn(async () => ({ elements: ELEMENTS(), bytes: 1 }));
    mount({ pullArea });
    await pickFrom();
    await pickTo();
    $('tactileMapGetData').click();
    await vi.waitFor(() => expect(pullArea).toHaveBeenCalledTimes(1), SETTLE);
    const { box, radiusM } = pullArea.mock.calls[0][0];
    expect(radiusM).toBeUndefined();
    const spare = 100 / 110540;
    expect(box.south).toBeLessThan(GATES.lat - spare);
    expect(box.north).toBeGreaterThan(HUB.lat + spare);
    expect(box.west).toBeLessThan(Math.min(HUB.lon, GATES.lon));
    expect(box.east).toBeGreaterThan(Math.max(HUB.lon, GATES.lon));
  });

  it('turns the draft button into Make a route map, and clearing the second address turns it back', async () => {
    mount();
    await pickFrom();
    expect($('tactileMapDraft').textContent).toBe(S.draft);
    await pickTo();
    expect($('tactileMapDraft').textContent).toBe(S.routeDraft);
    const to = $('tactileMapTo');
    to.value = '';
    to.dispatchEvent(new Event('input', { bubbles: true }));
    expect($('tactileMapDraft').textContent).toBe(S.draft);
    expect($('tactileMapRadiusHelp').textContent).toBe(S.radiusHelp);
    expect($('tactileMapToResults').hidden).toBe(true);
  });
});

describe('Make a route map', () => {
  async function routeData() {
    mount();
    await pickFrom();
    await pickTo();
    $('tactileMapGetData').click();
    await vi.waitFor(() => expect(getMapData()?.to).toEqual(GATES), SETTLE);
  }

  it('drafts the walk, says its length, its crossing and its steps, and opens the editor on it', async () => {
    await routeData();
    $('tactileMapDraft').click();
    await vi.waitFor(() => expect(opened).not.toBeNull(), SETTLE);
    expect(addressStatus()).toBe(
      S.routeReady(
        244,
        'Husky Union Building',
        'Bill & Melinda Gates Center',
        1,
        1,
        172,
        360
      )
    );
    expect(addressStatus()).toBe(
      'Route map ready: a 244 m walk from Husky Union Building to Bill & Melinda Gates Center, 1 crossing and 1 flight of steps on the way. The map is 172 x 360 mm, fitted to the walk. Open the drawing editor to check it.'
    );
    // The model is told the fitted size.
    await vi.waitFor(() => {
      const p = stateManager.getState().parameters;
      expect(Number(p.map_width_mm)).toBe(172);
      expect(Number(p.map_height_mm)).toBe(360);
    }, SETTLE);
    const plan = getMapPlan();
    expect(plan.features.filter((f) => f.class === 'route')).toHaveLength(1);
    expect(opened.options.purpose).toBe('map');
    expect(opened.options.draft).toBe(true);
    expect(opened.options.sourceName).toBe(
      S.routeName('Husky Union Building', 'Bill & Melinda Gates Center')
    );
    expect(plan.meta.title).toBe(
      'Husky Union Building to Bill & Melinda Gates Center'
    );
  });

  it('says there is no walk when nothing joins the places', async () => {
    mount({ pullArea: vi.fn(async () => ({ elements: [], bytes: 2 })) });
    await pickFrom();
    await pickTo();
    $('tactileMapGetData').click();
    await vi.waitFor(() => expect(getMapData()?.to).toEqual(GATES), SETTLE);
    $('tactileMapDraft').click();
    await vi.waitFor(
      () =>
        expect(addressStatus()).toBe(
          S.noWalk('Husky Union Building', 'Bill & Melinda Gates Center')
        ),
      SETTLE
    );
    expect(opened).toBeNull();
  });
});

describe('Edit drawing as a map', () => {
  it('reopens a draft with its classes after Apply, never the sample beneath it', async () => {
    mount();
    await pickFrom();
    await pickTo();
    $('tactileMapGetData').click();
    await vi.waitFor(() => expect(getMapData()?.to).toEqual(GATES), SETTLE);
    $('tactileMapDraft').click();
    await vi.waitFor(() => expect(opened).not.toBeNull(), SETTLE);
    const first = opened;
    const regions = getMapPlan().features.map((f, index) => ({
      index,
      class: f.on ? f.class : 'ignore',
    }));
    first.options.onApply({ regions, svg: first.svg });
    opened = null;
    $('tactileMapEditDrawing').click();
    await vi.waitFor(() => expect(opened).not.toBeNull(), SETTLE);
    expect(opened.options.draft).toBe(true);
    const plan = getMapPlan();
    expect(Object.keys(opened.options.initialClasses)).toHaveLength(
      plan.features.length
    );
    plan.features.forEach((f, i) => {
      expect(opened.options.initialClasses[i]).toBe(f.on ? f.class : 'ignore');
    });
  });

  it('opens the sample station with its classes, not every shape at Ignore', async () => {
    mount();
    // The panel writes its levels file into the file control; the control
    // then holds it, as it does on the page.
    await vi.waitFor(() => expect(files.length).toBeGreaterThan(0), SETTLE);
    stateManager.setState({
      parameters: {
        ...stateManager.getState().parameters,
        map_file: {
          name: 'levels_whole.svg',
          data: 'data:image/svg+xml;base64,' + btoa(files.at(-1)?.svg || ''),
        },
      },
    });
    $('tactileMapEditDrawing').click();
    await vi.waitFor(() => expect(opened).not.toBeNull(), SETTLE);
    const classes = Object.values(opened.options.initialClasses);
    expect(classes.some((c) => c !== 'ignore')).toBe(true);
  });
});

describe('the plate summary', () => {
  it('says plate sizes in tenths of a millimeter at most: a 364 x 253 map on an A1 mini is 6 plates of 121.3 x 126.5 mm', async () => {
    mount({ plan: { ...sampleStationPlan(), size: { w: 364, h: 253 } } });
    const bed = $('tactileMapBed');
    bed.value = 'a1-mini';
    bed.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(
      () =>
        expect($('tactileMapSummary').textContent).toBe(
          '6 plates of 121.3 x 126.5 mm, A1 to B3.'
        ),
      SETTLE
    );
  });
});
