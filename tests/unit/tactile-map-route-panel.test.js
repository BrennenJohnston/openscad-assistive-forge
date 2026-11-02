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
  withdrawAnnouncement: vi.fn(),
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

function mount({ type = 'route', ...options } = {}) {
  destroyMapPanel();
  initMapPanel(
    { ...CONFIG, type },
    {
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
    }
  );
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
  it('stands after the first place in the first step, with its label, its sentence, its own Search and a hidden list of destinations', () => {
    mount();
    const label = document.querySelector('label[for="tactileMapTo"]');
    expect(label.textContent).toBe('To');
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
    const order = [...$('tactileMapSteps-step-1').children].map((n) => n.id);
    expect(order.indexOf('tactileMapResults')).toBeLessThan(
      order.indexOf('tactileMapToHelp')
    );
  });

  it('with both places picked, lets the first step go on, asks for the box around both and keeps both', async () => {
    mount();
    expect($('tactileMapSteps-next').disabled).toBe(true);
    expect($('tactileMapSteps-reason').textContent).toBe(
      'Pick both places first.'
    );
    await pickFrom();
    expect($('tactileMapSteps-next').disabled).toBe(true);
    await pickTo();
    expect(addressStatus()).toBe(
      'Bill & Melinda Gates Center picked as where the walk ends.'
    );
    expect($('tactileMapSteps-next').disabled).toBe(false);
    $('tactileMapMake').click();
    expect(addressStatus()).toBe(
      S.gettingRoute('Husky Union Building', 'Bill & Melinda Gates Center')
    );
    await vi.waitFor(() => expect(getMapData()).not.toBeNull(), SETTLE);
    const pull = getMapData();
    expect(pull.place).toEqual(HUB);
    expect(pull.to).toEqual(GATES);
    // Let the draft this press started finish inside this case.
    await vi.waitFor(() => expect(opened).not.toBeNull(), SETTLE);
  });

  it('asks Overpass for a box holding both places with at least 100 m to spare', async () => {
    const pullArea = vi.fn(async () => ({ elements: ELEMENTS(), bytes: 1 }));
    mount({ pullArea });
    await pickFrom();
    await pickTo();
    $('tactileMapMake').click();
    await vi.waitFor(() => expect(pullArea).toHaveBeenCalledTimes(1), SETTLE);
    const { box, radiusM } = pullArea.mock.calls[0][0];
    expect(radiusM).toBeUndefined();
    const spare = 100 / 110540;
    expect(box.south).toBeLessThan(GATES.lat - spare);
    expect(box.north).toBeGreaterThan(HUB.lat + spare);
    expect(box.west).toBeLessThan(Math.min(HUB.lon, GATES.lon));
    expect(box.east).toBeGreaterThan(Math.max(HUB.lon, GATES.lon));
  });

  it('clearing the second address hides its places and holds the first step again', async () => {
    mount();
    await pickFrom();
    await pickTo();
    expect($('tactileMapSteps-next').disabled).toBe(false);
    const to = $('tactileMapTo');
    to.value = '';
    to.dispatchEvent(new Event('input', { bubbles: true }));
    expect($('tactileMapToResults').hidden).toBe(true);
    expect($('tactileMapSteps-next').disabled).toBe(true);
  });

  it('avoids steps where another way exists when the second step says so', async () => {
    mount();
    await pickFrom();
    await pickTo();
    const avoid = $('tactileMapSteps-avoid');
    avoid.checked = true;
    avoid.dispatchEvent(new Event('change', { bubbles: true }));
    $('tactileMapMake').click();
    await vi.waitFor(
      () => expect(addressStatus()).toMatch(/^Route map ready: /),
      SETTLE
    );
    expect(addressStatus()).toMatch(/ 0 flights of steps on the way\./);
  });
});

describe('Make a route map', () => {
  async function routeData() {
    mount();
    await pickFrom();
    await pickTo();
    $('tactileMapMake').click();
    await vi.waitFor(() => expect(getMapData()?.to).toEqual(GATES), SETTLE);
  }

  it('drafts the walk, says its length, its crossing and its steps, and opens the editor on it', async () => {
    await routeData();
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
      'Route map ready: a 244 m walk from Husky Union Building to Bill & Melinda Gates Center, 1 crossing and 1 flight of steps on the way. The map is 172 x 360 mm, fitted to the walk.'
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
    $('tactileMapMake').click();
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
    $('tactileMapMake').click();
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
    mount({ type: 'drawing' });
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

describe('focus after the editor', () => {
  async function routeDraft() {
    mount();
    await pickFrom();
    await pickTo();
    $('tactileMapMake').click();
    await vi.waitFor(() => expect(opened).not.toBeNull(), SETTLE);
    await vi.waitFor(() => expect($('tactileMapMake').disabled).toBe(false));
  }

  it('goes back to Make the map when the editor closes, and to Edit drawing as a map after it reopened the draft', async () => {
    await routeDraft();
    expect(document.activeElement).not.toBe($('tactileMapMake'));
    opened.options.onClose();
    expect(document.activeElement).toBe($('tactileMapMake'));
    opened = null;
    $('tactileMapEditDrawing').click();
    await vi.waitFor(() => expect(opened).not.toBeNull(), SETTLE);
    opened.options.onClose();
    expect(document.activeElement).toBe($('tactileMapEditDrawing'));
  });

  it('goes back to the button that opened the editor after Apply classes and after Keep original too', async () => {
    await routeDraft();
    const regions = getMapPlan().features.map((f, index) => ({
      index,
      class: f.on ? f.class : 'ignore',
    }));
    opened.options.onApply({ regions, svg: opened.svg });
    expect(document.activeElement).toBe($('tactileMapMake'));
    document.activeElement.blur();
    opened = null;
    $('tactileMapEditDrawing').click();
    await vi.waitFor(() => expect(opened).not.toBeNull(), SETTLE);
    opened.options.onKeepOriginal();
    expect(document.activeElement).toBe($('tactileMapEditDrawing'));
  });
});

describe('the plate summary', () => {
  it('says plate sizes in tenths of a millimeter at most: a 364 x 253 map on an A1 mini is 6 plates of 121.3 x 126.5 mm', async () => {
    mount({
      type: 'drawing',
      plan: { ...sampleStationPlan(), size: { w: 364, h: 253 } },
    });
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

describe('a route by bus and train', () => {
  const TRANSIT = readFileSync(
    'tests/fixtures/tactile-map/transitous-hub-downtown.json',
    'utf8'
  );
  const next = () => $('tactileMapSteps-next');
  const choose = (id) => {
    $(id).checked = true;
    $(id).dispatchEvent(new Event('change', { bubbles: true }));
  };
  let planJourneys;

  async function toStepTwo(options = {}) {
    planJourneys = vi.fn(async () => {
      const { createTransitPlanner } =
        await import('../../src/js/tactile-map/transit.js');
      return createTransitPlanner({
        fetch: async () => ({
          ok: true,
          status: 200,
          json: async () => JSON.parse(TRANSIT),
        }),
      }).planJourneys({
        from: HUB,
        to: GATES,
        mode: 'transit',
        when: new Date(),
      });
    });
    mount({ planJourneys, ...options });
    await pickFrom();
    await new Promise((r) => setTimeout(r, 1100));
    await pickTo();
    next().click();
    expect($('tactileMapSteps-heading').textContent).toBe(
      'Step 2 of 5: How you travel'
    );
  }

  beforeEach(() => {
    files = [];
    opened = null;
  });
  afterEach(() => destroyMapPanel());

  it('asks how you travel, on foot first; by bus and train it shows when to leave, Find journeys and the credit, and holds Next until a journey is picked', async () => {
    await toStepTwo();
    expect($('tactileMapTravel').querySelector('legend').textContent).toBe(
      'On foot, or by bus and train?'
    );
    const radios = [
      ...$('tactileMapTravel').querySelectorAll('input[type="radio"]'),
    ];
    expect(
      radios.map((r) => [
        document.querySelector(`label[for="${r.id}"]`).textContent,
        r.checked,
      ])
    ).toEqual([
      ['On foot', true],
      ['By bus and train', false],
    ]);
    expect($('tactileMapTransit').hidden).toBe(true);
    expect(next().disabled).toBe(false);
    choose('tactileMapTravel-transit');
    expect($('tactileMapTransit').hidden).toBe(false);
    expect($('tactileMapLeaveAt').type).toBe('datetime-local');
    expect($('tactileMapLeaveAt').value).not.toBe('');
    expect(
      document.querySelector('label[for="tactileMapLeaveAt"]').textContent
    ).toBe('Leave at');
    expect($('tactileMapFindJourneys').textContent).toBe('Find journeys');
    const credit = $('tactileMapTransitCredit');
    expect(credit.textContent).toBe(
      'Routes from Transitous (opens in new tab), on OpenStreetMap data.'
    );
    expect(credit.querySelector('a').getAttribute('href')).toBe(
      'https://transitous.org/sources'
    );
    expect(next().disabled).toBe(true);
    expect($('tactileMapSteps-reason').textContent).toBe(
      'Find and pick a journey first.'
    );
    expect(planJourneys).not.toHaveBeenCalled();
  });

  it('finds the journeys on a press, lists them in words, and asks which walk to map once one is picked', async () => {
    await toStepTwo();
    choose('tactileMapTravel-transit');
    $('tactileMapFindJourneys').click();
    await vi.waitFor(
      () => expect($('tactileMapJourneys').hidden).toBe(false),
      SETTLE
    );
    expect(planJourneys).toHaveBeenCalledTimes(1);
    const ask = planJourneys.mock.calls[0][0];
    expect([ask.from.lat, ask.to.lat, ask.mode]).toEqual([
      HUB.lat,
      GATES.lat,
      'transit',
    ]);
    expect(ask.when instanceof Date).toBe(true);
    const words = [...$('tactileMapJourneys').querySelectorAll('label')].map(
      (l) => l.textContent
    );
    expect(words).toEqual([
      '32 min, no change: the 1 Line to Symphony.',
      '32 min, no change: the 2 Line to Symphony.',
      '22 min, 1 change: the 72 to Stevens Way & Rainier Vista NE, then the 2 Line to Symphony.',
    ]);
    expect(addressStatus()).toBe('3 journeys found.');
    expect($('tactileMapWhichWalk').hidden).toBe(true);
    choose('tactileMapJourney-3');
    expect($('tactileMapWhichWalk').hidden).toBe(false);
    const walks = [
      ...$('tactileMapWhichWalk').querySelectorAll('input[type="radio"]'),
    ];
    expect(
      walks.map((r) => [
        document.querySelector(`label[for="${r.id}"]`).textContent,
        r.checked,
      ])
    ).toEqual([
      ['The walk to the stop', true],
      ['The walk from the stop', false],
    ]);
    expect(next().disabled).toBe(false);
  });

  it('maps the walk to the stop: the data around the place and the stop, the stop named with its line, the journey said', async () => {
    const pullArea = vi.fn(async () => ({
      elements: ELEMENTS(),
      bytes: 188956,
    }));
    await toStepTwo({ pullArea });
    choose('tactileMapTravel-transit');
    $('tactileMapFindJourneys').click();
    await vi.waitFor(
      () => expect($('tactileMapJourneys').hidden).toBe(false),
      SETTLE
    );
    choose('tactileMapJourney-3');
    next().click();
    next().click();
    $('tactileMapMake').click();
    await vi.waitFor(() => expect(opened).not.toBeNull(), SETTLE);
    const box = pullArea.mock.calls[0][0].box;
    const stop = JSON.parse(TRANSIT).itineraries[2].legs[1].from;
    for (const p of [HUB, stop]) {
      expect(p.lat).toBeGreaterThan(box.south);
      expect(p.lat).toBeLessThan(box.north);
      expect(p.lon).toBeGreaterThan(box.west);
      expect(p.lon).toBeLessThan(box.east);
    }
    const end = getMapPlan().features.find((f) => f.id === 'destination-stop');
    expect(end.name).toBe('East Stevens Way NE & Benton Ln, 72');
    expect(addressStatus()).toMatch(
      /^Route map ready: a \d+ m walk from Husky Union Building to East Stevens Way NE & Benton Ln, .* The journey: 22 min, 1 change: the 72 to Stevens Way & Rainier Vista NE, then the 2 Line to Symphony\.$/
    );
    expect(getMapData().travel).toMatchObject({ mode: 'transit', walk: 'to' });
  });

  it('maps the walk from the stop when asked: it starts at the last stop, named with its line', async () => {
    const pullArea = vi.fn(async () => ({
      elements: ELEMENTS(),
      bytes: 188956,
    }));
    await toStepTwo({ pullArea });
    choose('tactileMapTravel-transit');
    $('tactileMapFindJourneys').click();
    await vi.waitFor(
      () => expect($('tactileMapJourneys').hidden).toBe(false),
      SETTLE
    );
    choose('tactileMapJourney-3');
    choose('tactileMapWhichWalk-from');
    next().click();
    next().click();
    $('tactileMapMake').click();
    await vi.waitFor(() => expect(getMapData()).not.toBeNull(), SETTLE);
    const box = pullArea.mock.calls[0][0].box;
    const last = JSON.parse(TRANSIT).itineraries[2].legs[3].to;
    expect(last.name).toBe('Symphony');
    expect(last.lat).toBeGreaterThan(box.south);
    expect(last.lat).toBeLessThan(box.north);
    expect(getMapData().place.name).toBe('Symphony');
    expect(getMapData().travel).toMatchObject({
      walk: 'from',
      stopName: 'Symphony, 2 Line',
    });
  });

  it('says what went wrong when the planner refuses, and keeps Next held', async () => {
    const refusing = vi.fn(async () => {
      const e = new Error('rate');
      e.code = 'rate';
      throw e;
    });
    mount({ planJourneys: refusing });
    await pickFrom();
    await new Promise((r) => setTimeout(r, 1100));
    await pickTo();
    next().click();
    choose('tactileMapTravel-transit');
    $('tactileMapFindJourneys').click();
    await vi.waitFor(
      () =>
        expect(addressStatus()).toBe(
          'The journey planner asks for a moment between searches. Try again shortly.'
        ),
      SETTLE
    );
    expect($('tactileMapJourneys').hidden).toBe(true);
    expect(next().disabled).toBe(true);
  });
});
