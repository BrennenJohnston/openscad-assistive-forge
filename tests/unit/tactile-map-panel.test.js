/**
 * The Tactile Map Designer panel: the bed, the plates and the plate picker
 * above the tile's controls, writing the levels file and the plate's size
 * into the parameters; and the button that renders every plate into one
 * archive.
 *
 * The UI generator and the announcer are mocked; parameter writes land in
 * the real stateManager so the panel's read-back paths run. A render is a
 * stub that answers with 84 bytes (an empty binary STL), and the download
 * is caught instead of saved.
 *
 * @license GPL-3.0-or-later
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

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
  isMapPanelActive,
  getMapPlace,
  getMapData,
  getMapPlan,
} from '../../src/js/tactile-map/map-panel.js';
import {
  projectLatLon,
  trimElement,
} from '../../src/js/tactile-map/osm-geometry.js';
import { setParameterValue } from '../../src/js/ui-generator.js';
import {
  drawingFromPlan,
  rowOrder,
} from '../../src/js/tactile-map/plan-drawing.js';
import { settingsForSet } from '../../src/js/tactile-map/levels-svg.js';
import { announce, announceError } from '../../src/js/announcer.js';
import { stateManager } from '../../src/js/state.js';
import { sampleStationPlan } from '../../src/js/tactile-map/plan.js';
import {
  BUILT_IN_SYMBOLS,
  activeLibrary,
  activeSetKey,
  setActiveSet,
} from '../../src/js/tactile-map/symbol-library.js';
import { analyzeSvg } from '../../src/js/svg-preparer.js';
import { ringsFromPathData } from '../../src/js/ring-geometry.js';
import { svgToDataUrl, dataUrlToText } from '../../src/js/svg-text-encoding.js';

const CONFIG = {
  mapFileParam: 'map_file',
  widthParam: 'map_width_mm',
  heightParam: 'map_height_mm',
  plateIdParam: 'plate_id',
  plateShowsTitleParam: 'plate_shows_title',
  plateShowsNorthParam: 'plate_shows_north',
};

const SETTLE = { timeout: 4000, interval: 25 };
const EMPTY_STL = () => new Uint8Array(84);
const summary = () => document.getElementById('tactileMapSummary').textContent;

// The panel and everything it pulls in (the levels builder, the splitter,
// the plan from a drawing, the symbol library) ride the app's entry chunk
// only if the file handler imports them statically. It must not: the map
// code loads when a map tile opens.
describe('the panel as a lazy chunk', () => {
  it('the file handler imports the panel with import(), never statically', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'js', 'file-handler.js'),
      'utf8'
    );
    expect(source).not.toMatch(
      /^import\s[^;]*from\s+'\.\/tactile-map\/map-panel\.js'/m
    );
    expect(source).toMatch(/import\(\s*'\.\/tactile-map\/map-panel\.js'\s*\)/);
    // And nothing else in the entry's reach imports a map module statically
    // (the drawing editor's own import rides its lazy chunk).
    const entryFiles = ['main.js', 'js/file-handler.js', 'js/ui-generator.js'];
    for (const file of entryFiles) {
      const text = fs.readFileSync(
        path.join(process.cwd(), 'src', file),
        'utf8'
      );
      expect(text, file).not.toMatch(
        /^import\s[^;]*from\s+'[./]*\/tactile-map\//m
      );
    }
  });
});
const status = () =>
  document.getElementById('tactileMapRenderStatus').textContent;
const params = () => stateManager.getState().parameters || {};
const click = (id) => document.getElementById(id).click();

let files;
let downloads;

/**
 * A stand-in for the braille translator: a cell per letter, none for a
 * space, so the counts are known (jsdom has no worker for the real one).
 */
const letterBraille = vi.fn(async (text) =>
  '⠁'.repeat(String(text).replace(/\s+/g, '').length)
);

function mount({ type = 'drawing', config = {}, ...options } = {}) {
  destroyMapPanel();
  initMapPanel(
    { ...CONFIG, ...config, type },
    {
      plan: sampleStationPlan(),
      setFile: vi.fn((name, fileName, svg) => {
        files.push({ name, fileName, svg });
        return true;
      }),
      render: vi.fn(async () => EMPTY_STL()),
      download: vi.fn((bytes, name, format) => {
        downloads.push({ bytes, name, format });
      }),
      translate: letterBraille,
      ...options,
    }
  );
}

async function readZip() {
  await vi.waitFor(() => expect(downloads.length).toBe(1), SETTLE);
  const zip = await JSZip.loadAsync(downloads[0].bytes);
  const names = Object.keys(zip.files).sort();
  return { zip, names, readme: await zip.file('README.txt').async('string') };
}

beforeEach(() => {
  document.body.innerHTML =
    '<div id="app"><div id="parametersContainer"></div></div>';
  stateManager.setState({
    uploadedFile: { name: 'tactile_map.scad', content: '// tile' },
    outputFormat: 'stl',
    parameters: {
      label_tape_width_mm: '12.7',
      base_thickness_mm: '0.4',
      level_step_mm: '0.6',
      symbol_step_mm: '0.8',
      levels_used: '3',
      print_style: 'Thin plates for a backing board',
      title_text: 'Station',
    },
  });
  files = [];
  downloads = [];
  vi.clearAllMocks();
  mount();
});

afterEach(() => {
  destroyMapPanel();
  document.body.innerHTML = '';
});

describe('the map types and their steps', () => {
  const heading = () => document.querySelector('#tactileMapPanel h2');
  const stepHeading = () => document.getElementById('tactileMapSteps-heading');
  const next = () => document.getElementById('tactileMapSteps-next');
  const back = () => document.getElementById('tactileMapSteps-back');

  it('with no type asks what map to make: three radios, each with its sentence, and Next waiting for a choice', () => {
    mount({ type: null });
    expect(heading().textContent).toBe('What map do you want to make?');
    expect(
      document.getElementById('tactileMapPanel').hasAttribute('data-map-type')
    ).toBe(false);
    const radios = [
      ...document.querySelectorAll('#tactileMapChooser input[type="radio"]'),
    ];
    expect(radios.map((r) => r.value)).toEqual(['place', 'route', 'drawing']);
    expect(
      radios.map(
        (r) => document.querySelector(`label[for="${r.id}"]`).textContent
      )
    ).toEqual(['A place map', 'A route map', 'A map from your drawing']);
    const described = document.getElementById(
      radios[1].getAttribute('aria-describedby')
    );
    expect(described.textContent).toBe(
      'From one place to another, on foot or by bus and train, with the turns, crossings and steps on the way.'
    );
    expect(
      document.querySelector('#tactileMapChooser legend').textContent
    ).toBe('Map type');
    const go = document.getElementById('tactileMapChooserNext');
    expect(go.disabled).toBe(true);
    expect(document.getElementById('tactileMapChooserReason').textContent).toBe(
      'Choose a map type first.'
    );
    // Nothing of a type's steps is on the page yet.
    expect(document.getElementById('tactileMapAddress')).toBeNull();
  });

  it('choosing a route map opens its steps on the first, focused, and Back returns to the choice with the route still ticked', () => {
    mount({ type: null });
    const route = document.getElementById('tactileMapType-route');
    route.checked = true;
    route.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('tactileMapChooserNext').click();
    expect(heading().textContent).toBe('A route map');
    expect(
      document.getElementById('tactileMapPanel').getAttribute('data-map-type')
    ).toBe('route');
    expect(stepHeading().textContent).toBe('Step 1 of 5: From and To');
    expect(document.activeElement).toBe(stepHeading());
    // The route's first step holds both places, labeled From and To.
    const first = document.getElementById('tactileMapSteps-step-1');
    expect(first.querySelector('#tactileMapAddress')).toBeTruthy();
    expect(first.querySelector('#tactileMapTo')).toBeTruthy();
    expect(
      document.querySelector('label[for="tactileMapAddress"]').textContent
    ).toBe('From');
    expect(
      document.querySelector('label[for="tactileMapTo"]').textContent
    ).toBe('To');
    // A route map shows the empty plate, never the sample station.
    expect(getMapPlan().meta.waiting).toBe(true);
    back().click();
    expect(heading().textContent).toBe('What map do you want to make?');
    expect(document.getElementById('tactileMapType-route').checked).toBe(true);
  });

  it("lays a place map's controls out one step at a time: where, how much ground, what to show, make, check and print", () => {
    mount({ type: 'place' });
    const step = (n) => document.getElementById(`tactileMapSteps-step-${n}`);
    expect(step(1).querySelector('#tactileMapAddress')).toBeTruthy();
    expect(step(1).querySelector('#tactileMapTo')).toBeNull();
    expect(document.getElementById('tactileMapTo')).toBeNull();
    expect(step(2).querySelector('#tactileMapScale')).toBeTruthy();
    expect(step(3).querySelector('#tactileMapDetail')).toBeTruthy();
    expect(step(3).querySelector('#tactileMapGroups')).toBeTruthy();
    expect(step(3).querySelector('#tactileMapSteep')).toBeTruthy();
    expect(step(4).querySelector('#tactileMapMake')).toBeTruthy();
    expect(step(4).querySelector('#tactileMapLoadFile')).toBeTruthy();
    expect(step(5).querySelector('#tactileMapBed')).toBeTruthy();
    expect(step(5).querySelector('#tactileMapRenderAll')).toBeTruthy();
    expect(step(5).querySelector('#tactileMapEditDrawing')).toBeTruthy();
    expect([1, 2, 3, 4, 5].map((n) => step(n).hidden)).toEqual([
      false,
      true,
      true,
      true,
      true,
    ]);
    // Next waits for a place on the first step.
    expect(next().disabled).toBe(true);
    expect(document.getElementById('tactileMapSteps-reason').textContent).toBe(
      'Pick a place first.'
    );
    // A place map shows the empty plate from the start.
    expect(getMapPlan().meta.waiting).toBe(true);
    expect(params().title_text).toBe('Station');
  });

  it("lays a route map's second step out as how you travel, then the choice of steps on the way, allowed and marked first", () => {
    mount({ type: 'route' });
    const two = document.getElementById('tactileMapSteps-step-2');
    expect(
      [...two.querySelectorAll(':scope > fieldset > legend')].map(
        (l) => l.textContent
      )
    ).toEqual(['On foot, or by bus and train?', 'Steps on the way']);
    const steps = two.querySelector('#tactileMapStepsChoice');
    const radios = [...steps.querySelectorAll('input[type="radio"]')];
    expect(
      radios.map((r) => [
        document.querySelector(`label[for="${r.id}"]`).textContent,
        r.checked,
      ])
    ).toEqual([
      ['Allowed, and marked on the map', true],
      ['Avoided where another way exists', false],
    ]);
    expect(document.getElementById('tactileMapRadius')).toBeNull();
  });

  it('lays a map from a drawing out with its width, its door and the plates, and keeps the sample station', () => {
    stateManager.setState({
      parameters: { ...params(), map_file: 'sample_station.svg' },
    });
    mount({ type: 'drawing' });
    const step = (n) => document.getElementById(`tactileMapSteps-step-${n}`);
    expect(step(1).textContent).toContain(
      'Choose an SVG or a DXF drawing, or a photo to trace. Until you choose one, the map uses the sample station.'
    );
    expect(step(2).querySelector('#tactileMapDrawingWidth')).toBeTruthy();
    expect(step(3).querySelector('#tactileMapEditDrawing')).toBeTruthy();
    expect(step(5).querySelector('#tactileMapBed')).toBeTruthy();
    expect(document.getElementById('tactileMapAddress')).toBeNull();
    expect(getMapPlan().meta.waiting).toBeFalsy();
    expect(next().disabled).toBe(false);
  });
});

describe("a map from a drawing's first step", () => {
  const next = () => document.getElementById('tactileMapSteps-next');
  const reason = () => document.getElementById('tactileMapSteps-reason');
  const stepOne = () => document.getElementById('tactileMapSteps-step-1');
  const group = () => document.querySelector('#parametersContainer details');

  // The tile's Map file control as the Customizer builds it: a group with
  // the file control and the map's width after it.
  function buildCustomizer() {
    document.getElementById('parametersContainer').innerHTML =
      '<div class="forge-disclosure-row"><details class="param-group" open>' +
      '<summary>Map file</summary>' +
      '<div class="param-control param-control--file">' +
      '<label for="param-map_file">Map file</label>' +
      '<input type="file" id="param-map_file"></div>' +
      '<div class="param-control"><input id="param-map_width_mm"></div>' +
      '</details></div>';
    return document.getElementById('param-map_file').closest('.param-control');
  }
  const holdFile = (value) =>
    stateManager.setState({ parameters: { ...params(), map_file: value } });
  const atHome = (control) =>
    control.parentNode === group() &&
    control.nextElementSibling?.querySelector('#param-map_width_mm');

  it("holds the tile's Map file control in step 1 under its note, out of the Customizer", () => {
    holdFile('sample_station.svg');
    const control = buildCustomizer();
    mount({ type: 'drawing' });
    expect(stepOne().contains(control)).toBe(true);
    const note = stepOne().querySelector('.braille-panel-help');
    expect(note.textContent).toBe(
      'Choose an SVG or a DXF drawing, or a photo to trace. Until you choose one, the map uses the sample station.'
    );
    expect(
      note.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(group().querySelector('#param-map_file')).toBeNull();
    expect(group().querySelector('#param-map_width_mm')).toBeTruthy();
    expect(document.querySelectorAll('#param-map_file')).toHaveLength(1);
  });

  it('gives the control back to its place in the Customizer for another map type, in the Alt View and when the panel goes', async () => {
    holdFile('sample_station.svg');
    const control = buildCustomizer();
    mount({ type: 'drawing' });
    document.getElementById('tactileMapSteps-back').click();
    expect(atHome(control)).toBeTruthy();
    const place = document.getElementById('tactileMapType-place');
    place.checked = true;
    place.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('tactileMapChooserNext').click();
    expect(atHome(control)).toBeTruthy();

    mount({ type: 'drawing' });
    expect(stepOne().contains(control)).toBe(true);
    const root = document.documentElement;
    root.setAttribute('data-ui-variant', 'mono');
    try {
      await vi.waitFor(() => expect(atHome(control)).toBeTruthy(), SETTLE);
      root.removeAttribute('data-ui-variant');
      await vi.waitFor(
        () => expect(stepOne().contains(control)).toBe(true),
        SETTLE
      );
    } finally {
      root.removeAttribute('data-ui-variant');
    }

    destroyMapPanel();
    expect(atHome(control)).toBeTruthy();
  });

  it('takes the new control when the Customizer builds its controls again, and leaves no copy behind', async () => {
    holdFile('sample_station.svg');
    const first = buildCustomizer();
    mount({ type: 'drawing' });
    expect(stepOne().contains(first)).toBe(true);
    const second = buildCustomizer();
    await vi.waitFor(
      () => expect(stepOne().contains(second)).toBe(true),
      SETTLE
    );
    expect(first.isConnected).toBe(false);
    expect(document.querySelectorAll('#param-map_file')).toHaveLength(1);
    expect(group().querySelector('#param-map_file')).toBeNull();
  });

  it("shows the control at the Customizer's detail level, and follows a change of it", async () => {
    holdFile('sample_station.svg');
    const container = document.getElementById('parametersContainer');
    container.dataset.detailLevel = 'show';
    const control = buildCustomizer();
    mount({ type: 'drawing' });
    expect(control.closest('[data-detail-level]').dataset.detailLevel).toBe(
      'show'
    );
    container.dataset.detailLevel = 'hide';
    await vi.waitFor(
      () =>
        expect(control.closest('[data-detail-level]').dataset.detailLevel).toBe(
          'hide'
        ),
      SETTLE
    );
  });

  it('waits on step 1 with its reason while the control holds no file, and goes on once it holds one', async () => {
    holdFile(null);
    buildCustomizer();
    mount({ type: 'drawing' });
    expect(next().disabled).toBe(true);
    expect(reason().textContent).toBe('Choose a drawing first.');
    expect(next().getAttribute('aria-describedby')).toBe(reason().id);
    holdFile({ name: 'station.svg', data: svgToDataUrl(DRAWING) });
    await vi.waitFor(() => expect(next().disabled).toBe(false), SETTLE);
    expect(reason().textContent).toBe('');
  });
});

describe('the map panel', () => {
  it('mounts above the parameter controls with its heading and the bed menu', () => {
    const section = document.getElementById('tactileMapPanel');
    expect(section).toBeTruthy();
    expect(section.nextElementSibling.id).toBe('parametersContainer');
    // The heading names the map type the panel works on.
    expect(section.querySelector('h2').textContent).toBe(
      'A map from your drawing'
    );
    const select = document.getElementById('tactileMapBed');
    expect(select.options.length).toBe(9);
    expect(select.options[0].textContent).toBe(
      'Bambu Lab X1C, P1S or P1P (256 x 256 mm)'
    );
    expect(isMapPanelActive()).toBe(true);
  });

  // The sample's 480 x 360 mm face in its 10 mm band is a 500 x 380 mm sheet.
  it('says four plates of 250 x 190 for the sample in its band on an X1C, then nine on an A1 mini', async () => {
    await vi.waitFor(
      () => expect(summary()).toBe('4 plates of 250 x 190 mm, A1 to B2.'),
      SETTLE
    );
    const select = document.getElementById('tactileMapBed');
    select.value = 'a1-mini';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(
      () =>
        expect(summary()).toBe('9 plates of 166.7 x 126.7 mm, A1 to C3.'),
      SETTLE
    );
    const radios = [
      ...document.querySelectorAll('#tactileMapPlates input[type="radio"]'),
    ];
    expect(radios.map((r) => r.value)).toEqual([
      'whole',
      'A1',
      'A2',
      'A3',
      'B1',
      'B2',
      'B3',
      'C1',
      'C2',
      'C3',
    ]);
  });

  it('writes plate B2 as a 250 x 190 levels file and its size, then the whole sheet again', async () => {
    await vi.waitFor(() => expect(files.length).toBeGreaterThan(0), SETTLE);
    const before = files.length;
    const b2 = document.querySelector('#tactileMapPlates input[value="B2"]');
    b2.checked = true;
    b2.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(
      () => expect(files.length).toBeGreaterThan(before),
      SETTLE
    );
    const last = files[files.length - 1];
    expect(last.name).toBe('map_file');
    expect(last.fileName).toBe('levels_B2.svg');
    expect(last.svg).toMatch(/viewBox="0 0 250 190"/);
    expect(String(params().map_width_mm)).toBe('250');
    expect(String(params().map_height_mm)).toBe('190');
    expect(setParameterValue).toHaveBeenCalledWith('map_width_mm', 250);
    expect(announce).toHaveBeenCalledWith(
      'Showing plate B2.',
      expect.anything()
    );

    const whole = document.querySelector(
      '#tactileMapPlates input[value="whole"]'
    );
    whole.checked = true;
    whole.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(
      () => expect(String(params().map_width_mm)).toBe('500'),
      SETTLE
    );
    expect(String(params().map_height_mm)).toBe('380');
    expect(files[files.length - 1].fileName).toBe('levels_whole.svg');
    expect(announce).toHaveBeenCalledWith(
      'Showing the whole map.',
      expect.anything()
    );
  });

  it('turns the title and the north cue off on every plate but the top corners, and on again for the whole map', async () => {
    await vi.waitFor(() => expect(files.length).toBeGreaterThan(0), SETTLE);
    const choose = async (id) => {
      const radio = document.querySelector(
        `#tactileMapPlates input[value="${id}"]`
      );
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      const fileName = id === 'whole' ? 'levels_whole.svg' : `levels_${id}.svg`;
      await vi.waitFor(
        () => expect(files[files.length - 1].fileName).toBe(fileName),
        SETTLE
      );
      return [params().plate_shows_title, params().plate_shows_north];
    };
    expect(await choose('A1')).toEqual(['yes', 'no']);
    expect(await choose('A2')).toEqual(['no', 'yes']);
    expect(await choose('B1')).toEqual(['no', 'no']);
    expect(await choose('whole')).toEqual(['yes', 'yes']);
    // A north line runs along the whole top row.
    stateManager.setState({
      parameters: { ...params(), north_cue: 'North line' },
    });
    expect(await choose('A1')).toEqual(['yes', 'yes']);
    expect(await choose('B2')).toEqual(['no', 'no']);
  });

  // A tile that hands the panel its title gets the title on a band above
  // the map: STATION on one 16 mm line is 41 mm of band (16 x 1.35 and
  // 9.525 clear above and below, rounded up), and the 500 x 421 mm sheet still cuts
  // into two rows on an X1C, so the band rides in row A.
  it('with a title parameter the title stands on its band: no plate draws the model title, the rows go to the plates that hold them, and Inside puts it back on A1', async () => {
    mount({
      config: {
        titleParam: 'title_text',
        raisedWordsParam: 'raised_words',
        marginParam: 'margin_mm',
        titleBandParam: 'title_band_mm',
      },
    });
    await vi.waitFor(
      () => expect(summary()).toBe('4 plates of 250 x 210.5 mm, A1 to B2.'),
      SETTLE
    );
    expect(String(params().margin_mm)).toBe('10');
    expect(String(params().title_band_mm)).toBe('41');
    expect(params().plate_shows_title).toBe('no');
    expect(params().raised_words).toBe('100:3855:160:0:STATION');
    const choose = async (id) => {
      const radio = document.querySelector(
        `#tactileMapPlates input[value="${id}"]`
      );
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      await vi.waitFor(
        () => expect(files[files.length - 1].fileName).toBe(`levels_${id}.svg`),
        SETTLE
      );
    };
    await choose('A1');
    expect(params().plate_shows_title).toBe('no');
    expect(params().raised_words).toBe('100:1750:160:0:STATION');
    await choose('A2');
    expect(params().raised_words).toBe('-2400:1750:160:0:STATION');
    await choose('B1');
    expect(params().raised_words).toBe('');

    // Inside: the model draws its own title on A1 again and the band leaves.
    const place = document.getElementById('tactileMapTitlePlacement');
    expect([...place.options].map((o) => o.value)).toEqual([
      'band',
      'inside',
      'none',
    ]);
    place.value = 'inside';
    place.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(
      () => expect(summary()).toBe('4 plates of 250 x 190 mm, A1 to B2.'),
      SETTLE
    );
    await choose('A1');
    expect(params().plate_shows_title).toBe('yes');
    expect(params().raised_words).toBe('');
    expect(String(params().title_band_mm)).toBe('0');

    // A wider band: 12 mm makes a 504 x 384 mm sheet, still four plates.
    const margin = document.getElementById('tactileMapMargin');
    expect(margin.min).toBe('10');
    expect(margin.max).toBe('40');
    margin.value = '12';
    margin.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(
      () => expect(summary()).toBe('4 plates of 252 x 192 mm, A1 to B2.'),
      SETTLE
    );
    expect(String(params().margin_mm)).toBe('12');
  });

  it('rebuilds the sheet when the title or its letter height changes in the Customizer', async () => {
    mount({
      config: {
        titleParam: 'title_text',
        raisedWordsParam: 'raised_words',
        titleLetterParam: 'title_char_height_mm',
        marginParam: 'margin_mm',
        titleBandParam: 'title_band_mm',
      },
    });
    await vi.waitFor(
      () => expect(summary()).toBe('4 plates of 250 x 210.5 mm, A1 to B2.'),
      SETTLE
    );
    // The title cleared: the band leaves.
    stateManager.setState({ parameters: { ...params(), title_text: '' } });
    await vi.waitFor(
      () => expect(summary()).toBe('4 plates of 250 x 190 mm, A1 to B2.'),
      SETTLE
    );
    // A 20 mm title: 20 x 1.35 + 19.05 = 46.05 mm of band, rounded up to 47.
    stateManager.setState({
      parameters: {
        ...params(),
        title_text: 'Station',
        title_char_height_mm: '20',
      },
    });
    await vi.waitFor(
      () => expect(summary()).toBe('4 plates of 250 x 213.5 mm, A1 to B2.'),
      SETTLE
    );
    // The 427 mm sheet: the capital's top 19.525 mm from the top, the
    // baseline 20 below it, 387.475 mm up from the bottom.
    expect(String(params().title_band_mm)).toBe('47');
    expect(params().raised_words).toBe('100:3875:200:0:STATION');
  });

  // A hall from 40 to 300 by 60 to 200 and the cone inside it: the printed
  // box is 260 x 140 mm at 40, 60; in its 10 mm band a 280 x 160 sheet.
  const trimPlan = () => {
    const sample = sampleStationPlan();
    return {
      ...sample,
      meta: { ...sample.meta, title: '' },
      features: [
        {
          id: 'hall',
          class: 'area',
          kind: 'area',
          name: 'the hall',
          ring: [
            [40, 60],
            [300, 60],
            [300, 200],
            [40, 200],
          ],
          on: true,
        },
        {
          id: 'destination',
          class: 'destination',
          kind: 'point',
          name: '3600 Ferry Pl NE',
          size: 4.9,
          at: [100, 100],
          on: true,
        },
      ],
    };
  };

  it('offers Trim the empty edges above Print bed: checked for a place map, unchecked for a drawing, not for a route', () => {
    const box = () => document.getElementById('tactileMapTrim');
    expect(box()).not.toBeNull();
    expect(box().checked).toBe(false);
    expect(document.getElementById('tactileMapTrimHelp').textContent).toBe(
      'Cuts the empty plate around what prints; the margin stays.'
    );
    expect(box().getAttribute('aria-describedby')).toBe('tactileMapTrimHelp');
    expect(document.querySelector('label[for="tactileMapTrim"]').textContent).toBe(
      'Trim the empty edges'
    );
    // Above Print bed in the step.
    const bed = document.getElementById('tactileMapBed');
    expect(
      box().compareDocumentPosition(bed) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    mount({ type: 'place' });
    expect(box().checked).toBe(true);
    mount({ type: 'route' });
    expect(box()).toBeNull();
  });

  it('trims the sheet to what prints when the switch is on, moves the model rows with it, and gives the whole face back when off', async () => {
    mount({
      plan: trimPlan(),
      config: { coneMarksParam: 'cone_marks' },
    });
    await vi.waitFor(
      () => expect(summary()).toBe('4 plates of 250 x 190 mm, A1 to B2.'),
      SETTLE
    );
    await vi.waitFor(
      () => expect(params().cone_marks).toBe('1100:2700'),
      SETTLE
    );
    const box = document.getElementById('tactileMapTrim');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(
      () => expect(summary()).toBe('2 plates of 140 x 160 mm, A1 to A2.'),
      SETTLE
    );
    expect(String(params().map_width_mm)).toBe('280');
    expect(String(params().map_height_mm)).toBe('160');
    // The cone at the face's 100, 100: 60, 40 on the trimmed face, 70, 50
    // on the sheet, 110 up from its bottom.
    expect(params().cone_marks).toBe('700:1100');
    expect(files[files.length - 1].svg).toMatch(/viewBox="0 0 280 160"/);
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(
      () => expect(summary()).toBe('4 plates of 250 x 190 mm, A1 to B2.'),
      SETTLE
    );
    expect(params().cone_marks).toBe('1100:2700');
  });

  // A draft with two named places, so the map has labels: the translator
  // measures each, the note sums them, and the other grade's length stands
  // beside. (The panel labels a draft; a drawing keeps the channels drawn.)
  const withPlaces = () => {
    const p = sampleStationPlan();
    p.features.push(
      {
        id: 'pine',
        class: 'landmark',
        kind: 'point',
        at: [80, 100],
        on: true,
        name: 'Pine',
        what: 'Cafe',
      },
      {
        id: 'cafe',
        class: 'landmark',
        kind: 'point',
        at: [200, 100],
        on: true,
        name: 'Plaza Cafe',
        what: 'Restaurant',
      }
    );
    return p;
  };
  const draft = (options = {}) => {
    mount({ plan: withPlaces(), ...options });
    const p = document.getElementById('tactileMapPanel').__forgeMapPanel;
    p.source = 'draft';
    p.schedule(0);
    return p;
  };

  it('offers Braille on tape with contracted UEB first, measures the labels through the translator in both grades, and says the tape in the note', async () => {
    const p = draft();
    const select = document.getElementById('tactileMapTapeGrade');
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
      ['g2', 'Contracted (UEB Grade 2)'],
      ['g1', 'Uncontracted (Grade 1)'],
    ]);
    expect(select.value).toBe('g2');
    expect(select.getAttribute('aria-describedby')).toBe('tactileMapTapeNote');
    const note = document.getElementById('tactileMapTapeNote');
    expect(note.getAttribute('aria-live')).toBe('polite');
    await vi.waitFor(
      () => expect(note.textContent).toMatch(/^Label tape: contracted braille \(UEB Grade 2\)\. /),
      SETTLE
    );
    // Both tables were asked, the contracted one first.
    const tables = [...new Set(letterBraille.mock.calls.map((c) => c[1]))];
    expect(tables).toEqual(['en-ueb-g2.ctb', 'en-ueb-g1.ctb']);
    expect(note.textContent, note.textContent).toMatch(
      /^Label tape: contracted braille \(UEB Grade 2\)\. \d+ labels?, \d+ cells?, about \d+ mm of 12\.7 mm tape; uncontracted would need about \d+ mm\.$/
    );
    // The labels carry the measure; a stand-in cell per letter.
    const labels = p.labeled().labels;
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) {
      expect(l.measured).toBe(true);
      expect(l.grade).toBe('g2');
      expect(l.braille).toBe('⠁'.repeat(l.text.replace(/\s+/g, '').length));
    }
    // The other grade: the same sentence the other way round, no new pass.
    const calls = letterBraille.mock.calls.length;
    select.value = 'g1';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(
      () => expect(note.textContent).toMatch(/^Label tape: uncontracted braille \(Grade 1\)\. /),
      SETTLE
    );
    expect(note.textContent).toMatch(/; contracted would need about \d+ mm\.$/);
    expect(letterBraille.mock.calls.length).toBe(calls);
  });

  it('keeps the estimate, says the engine did not load, and asks it no more until the grade changes', async () => {
    const broken = vi.fn(async () => {
      throw new Error('liblouis worker failed');
    });
    const p = draft({ translate: broken });
    const note = document.getElementById('tactileMapTapeNote');
    await vi.waitFor(
      () =>
        expect(note.textContent).toMatch(
          /^Label tape: contracted braille \(UEB Grade 2\), sized by an estimate\. .* The braille engine did not load; the channels are sized by an estimate\.$/
        ),
      SETTLE
    );
    const asked = broken.mock.calls.length;
    expect(asked).toBeGreaterThan(0);
    const labels = p.labeled().labels;
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((l) => l.measured === false && l.braille === '')).toBe(true);
    // Another change asks nothing more of the engine.
    const bed = document.getElementById('tactileMapBed');
    bed.value = 'a1-mini';
    bed.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(
      () => expect(summary()).toMatch(/^9 plates/),
      SETTLE
    );
    expect(broken.mock.calls.length).toBe(asked);
    // The grade changed: one more try.
    const select = document.getElementById('tactileMapTapeGrade');
    select.value = 'g1';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(
      () => expect(broken.mock.calls.length).toBeGreaterThan(asked),
      SETTLE
    );
  });

  it('offers no title placement to a tile that keeps its title to itself, and draws the title inside the map', () => {
    expect(document.getElementById('tactileMapTitlePlacement')).toBeNull();
    expect(document.getElementById('tactileMapMargin')).not.toBeNull();
  });

  it('keeps the same radios when only the plate changes, so a screen reader says the plate once', async () => {
    await vi.waitFor(() => expect(files.length).toBeGreaterThan(0), SETTLE);
    const radio = (id) =>
      document.querySelector(`#tactileMapPlates input[value="${id}"]`);
    const a2 = radio('A2');
    const b2 = radio('B2');
    b2.focus();
    const focused = vi.fn();
    b2.addEventListener('focus', focused);
    b2.checked = true;
    b2.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(
      () => expect(files[files.length - 1].fileName).toBe('levels_B2.svg'),
      SETTLE
    );
    expect(radio('B2')).toBe(b2);
    expect(radio('A2')).toBe(a2);
    expect(b2.checked).toBe(true);
    expect(document.activeElement).toBe(b2);
    expect(focused).not.toHaveBeenCalled();
  });

  it('builds the radios again when the plates change, keeping focus on a plate still there', async () => {
    await vi.waitFor(() => expect(files.length).toBeGreaterThan(0), SETTLE);
    const whole = document.querySelector(
      '#tactileMapPlates input[value="whole"]'
    );
    whole.focus();
    const count = () =>
      document.querySelectorAll('#tactileMapPlates input[type="radio"]').length;
    const before = count();
    // A smaller bed cuts the map into more plates.
    const bed = document.getElementById('tactileMapBed');
    bed.value = 'mini';
    bed.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(count()).toBeGreaterThan(before), SETTLE);
    const again = document.querySelector(
      '#tactileMapPlates input[value="whole"]'
    );
    expect(again).not.toBe(whole);
    expect(document.activeElement).toBe(again);
  });

  it('offers the plate name style with notches first, and writes the letters only for the margin style', async () => {
    await vi.waitFor(() => expect(files.length).toBeGreaterThan(0), SETTLE);
    const style = document.getElementById('tactileMapIdStyle');
    expect(style.value).toBe('notches');
    expect([...style.options].map((o) => o.textContent)).toEqual([
      'Notches on the bottom edge',
      'Raised letters in the margin',
    ]);
    expect(
      document.querySelector('label[for="tactileMapIdStyle"]').textContent
    ).toBe('Plate name style');
    const b2 = document.querySelector('#tactileMapPlates input[value="B2"]');
    b2.checked = true;
    b2.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(
      () => expect(files[files.length - 1].fileName).toBe('levels_B2.svg'),
      SETTLE
    );
    expect(params().plate_id).toBe('');
    expect(files[files.length - 1].svg).toMatch(/<g id="cutouts"><path /);
    style.value = 'margin';
    style.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(params().plate_id).toBe('B2'), SETTLE);
    expect(files[files.length - 1].svg).toMatch(/viewBox="0 0 250 200"/);
    expect(files[files.length - 1].svg).toMatch(/<g id="cutouts"><\/g>/);
  });

  it('offers Key words with Braille only first when the model has a Key mode: a key plate starts with channels and no raised words, and Print and braille raises them', async () => {
    expect(document.getElementById('tactileMapKeyWords')).toBeNull();
    mount({
      config: {
        plateKindParam: 'plate_kind',
        raisedWordsParam: 'raised_words',
        keyLetterParam: 'key_letter_height_mm',
      },
    });
    await vi.waitFor(() => expect(files.length).toBeGreaterThan(0), SETTLE);
    const words = document.getElementById('tactileMapKeyWords');
    expect(words.value).toBe('braille');
    expect([...words.options].map((o) => o.textContent)).toEqual([
      'Braille only',
      'Print and braille',
      'Print only',
    ]);
    expect(
      document.querySelector('label[for="tactileMapKeyWords"]').textContent
    ).toBe('Key words');
    const key = document.querySelector('#tactileMapPlates input[value^="key"]');
    key.checked = true;
    key.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(params().plate_kind).toBe('Key'), SETTLE);
    expect(params().raised_words).toBe('');
    expect(files[files.length - 1].svg).toMatch(
      /<g id="channels"><path d="[^"]+"\/><\/g>/
    );
    words.value = 'both';
    words.dispatchEvent(new Event('change', { bubbles: true }));
    // Rows of x:y:h:z:TEXT: the capital 16 mm, standing on the base.
    await vi.waitFor(
      () => expect(params().raised_words).toMatch(/^\d+:\d+:160:0:KEY/),
      SETTLE
    );
  });

  it('writes cone_marks for the whole map, for the plate that holds the cone, and for the key plate with its sample, when the model has the parameter', async () => {
    const plan = sampleStationPlan();
    plan.features.push({
      id: 'destination',
      class: 'destination',
      kind: 'point',
      name: '3600 Ferry Pl NE',
      size: 4.9,
      at: [100, 50],
      on: true,
    });
    mount({
      plan,
      config: {
        plateKindParam: 'plate_kind',
        raisedWordsParam: 'raised_words',
        keyLetterParam: 'key_letter_height_mm',
        coneMarksParam: 'cone_marks',
      },
    });
    // The cone at the face's 100, 50 stands at the sheet's 110, 60: y up
    // from the sheet's bottom, 380 - 60.
    await vi.waitFor(
      () => expect(params().cone_marks).toBe('1100:3200'),
      SETTLE
    );
    const pick = (value) => {
      const radio = document.querySelector(
        `#tactileMapPlates input[value${value === 'key' ? '^' : ''}="${value}"]`
      );
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    };
    pick('A1');
    await vi.waitFor(
      () => expect(params().cone_marks).toBe('1100:1300'),
      SETTLE
    );
    pick('B2');
    await vi.waitFor(() => expect(params().cone_marks).toBe(''), SETTLE);
    pick('key');
    await vi.waitFor(() => expect(params().plate_kind).toBe('Key'), SETTLE);
    await vi.waitFor(
      () => expect(params().cone_marks).toMatch(/^\d+:\d+$/),
      SETTLE
    );
  });

  it('refuses a bed that cuts the map into plates under 100 x 75 mm, and keeps the whole map', async () => {
    await vi.waitFor(() => expect(files.length).toBeGreaterThan(0), SETTLE);
    const select = document.getElementById('tactileMapBed');
    select.value = 'custom';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const w = document.getElementById('tactileMapBedWidth');
    const d = document.getElementById('tactileMapBedDepth');
    w.value = '100';
    d.value = '100';
    w.dispatchEvent(new Event('change', { bubbles: true }));
    d.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(
      () =>
        expect(summary()).toBe(
          'A 100 x 100 mm bed cuts this map into plates of 83.3 x 95 mm, under the 100 x 75 mm minimum. Choose a larger bed.'
        ),
      SETTLE
    );
    expect(
      [
        ...document.querySelectorAll('#tactileMapPlates input[type="radio"]'),
      ].map((r) => r.value)
    ).toEqual(['whole']);
    expect(String(params().map_width_mm)).toBe('500');
    expect(files[files.length - 1].fileName).toBe('levels_whole.svg');
    click('tactileMapRenderAll');
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(downloads).toHaveLength(0);
    expect(status()).toBe('');
  });

  it('offers a custom bed size and refuses nothing under 100 mm silently', async () => {
    const select = document.getElementById('tactileMapBed');
    select.value = 'custom';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const w = document.getElementById('tactileMapBedWidth');
    const d = document.getElementById('tactileMapBedDepth');
    expect(w.min).toBe('100');
    expect(d.max).toBe('600');
    w.value = '300';
    d.value = '300';
    w.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(
      () => expect(summary()).toBe('4 plates of 250 x 190 mm, A1 to B2.'),
      SETTLE
    );
  });

  it('is removed whole by destroyMapPanel', () => {
    destroyMapPanel();
    expect(document.getElementById('tactileMapPanel')).toBeNull();
    expect(isMapPanelActive()).toBe(false);
  });
});

describe('what the map file holds, told to the model', () => {
  it('says drawing while the file control holds a drawing not classed yet, and levels for a levels file', async () => {
    destroyMapPanel();
    initMapPanel(
      { ...CONFIG, mapFileKindParam: 'map_file_kind', type: 'drawing' },
      {
        plan: sampleStationPlan(),
        setFile: vi.fn((name, fileName, svg) => {
          files.push({ name, fileName, svg });
          return true;
        }),
        render: vi.fn(async () => EMPTY_STL()),
        download: vi.fn(),
      }
    );
    // The panel's own levels file goes to the model as levels.
    await vi.waitFor(() => expect(files.length).toBeGreaterThan(0), SETTLE);
    expect(params().map_file_kind).toBe('levels');
    // A drawing chosen in the control: the model raises it whole until its
    // shapes are classed.
    stateManager.setState({
      parameters: {
        ...params(),
        map_file: { name: 'station.svg', data: svgToDataUrl(DRAWING) },
      },
    });
    await vi.waitFor(
      () => expect(params().map_file_kind).toBe('drawing'),
      SETTLE
    );
    // A levels file a person saved and chose again is levels.
    const saved = files[files.length - 1].svg;
    stateManager.setState({
      parameters: {
        ...params(),
        map_file: { name: 'levels_whole.svg', data: svgToDataUrl(saved) },
      },
    });
    await vi.waitFor(
      () => expect(params().map_file_kind).toBe('levels'),
      SETTLE
    );
  });
});

describe('the warnings in Check and print', () => {
  // Two landmarks 12 mm apart: one "too close" warning; four of them, two.
  const landmark = (id, x, y) => ({
    id,
    class: 'landmark',
    kind: 'point',
    symbol: 'landmark-triangle',
    at: [x, y],
    on: true,
  });
  const planWith = (pairs) => {
    const plan = sampleStationPlan();
    for (let i = 0; i < pairs; i += 1) {
      plan.features.push(
        landmark(`w${i}a`, 60 + i * 80, 300),
        landmark(`w${i}b`, 72 + i * 80, 300)
      );
    }
    return plan;
  };
  const box = () => document.getElementById('tactileMapWarningsBox');

  it('folds the list into a closed disclosure that says how many there are', async () => {
    mount({ type: 'drawing', plan: planWith(2) });
    await vi.waitFor(
      () =>
        expect(
          document.getElementById('tactileMapWarnings').children.length
        ).toBe(2),
      SETTLE
    );
    expect(box().tagName).toBe('DETAILS');
    expect(box().classList.contains('forge-disclosure')).toBe(true);
    expect(box().open).toBe(false);
    expect(box().hidden).toBe(false);
    expect(box().querySelector('summary').textContent).toBe('2 warnings');
    expect(box().contains(document.getElementById('tactileMapWarnings'))).toBe(
      true
    );
    // It stands before the render button, as the list did.
    expect(
      box().compareDocumentPosition(
        document.getElementById('tactileMapRenderAll')
      ) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('says one warning in the singular, and hides with none', async () => {
    mount({ type: 'drawing', plan: planWith(1) });
    await vi.waitFor(
      () =>
        expect(box().querySelector('summary').textContent).toBe('1 warning'),
      SETTLE
    );
    mount({ type: 'drawing', plan: sampleStationPlan() });
    await vi.waitFor(() => expect(box().hidden).toBe(true), SETTLE);
    expect(document.getElementById('tactileMapWarnings').children.length).toBe(
      0
    );
  });
});

describe('render every plate and download', () => {
  it('renders the four plates in order into one archive of eleven entries', async () => {
    await vi.waitFor(() => expect(files.length).toBeGreaterThan(0), SETTLE);
    const render = document.getElementById('tactileMapRenderAll');
    expect(render.textContent).toBe('Render every plate and download');
    expect(document.getElementById('tactileMapRenderCancel').hidden).toBe(true);
    render.click();
    const { names, zip, readme } = await readZip();
    expect(downloads[0].name).toBe('tactile_map_plates.zip');
    expect(names).toEqual([
      'README.txt',
      'levels_A1.svg',
      'levels_A2.svg',
      'levels_B1.svg',
      'levels_B2.svg',
      'map_plan.json',
      'map_print.pdf',
      'plate_grid.svg',
      'tactile_map_A1.stl',
      'tactile_map_A2.stl',
      'tactile_map_B1.stl',
      'tactile_map_B2.stl',
    ]);
    const pdf = await zip.file('map_print.pdf').async('uint8array');
    expect(String.fromCharCode(...pdf.slice(0, 5))).toBe('%PDF-');
    expect(readme).toMatch(/^map_print\.pdf shows where each label goes/);
    expect(
      (await zip.file('tactile_map_A1.stl').async('uint8array')).length
    ).toBe(84);
    expect(await zip.file('levels_B2.svg').async('string')).toMatch(
      /viewBox="0 0 250 190"/
    );
    // The plan keeps the face; the plates and the board are the sheet.
    expect(
      JSON.parse(await zip.file('map_plan.json').async('string')).size
    ).toEqual({ w: 480, h: 360 });
    expect(readme).toBe(
      'map_print.pdf shows where each label goes, with its text, for assembly and labeling.\n' +
        'A map from a drawing.\n' +
        'Station: 4 plates for a Bambu Lab X1C, P1S or P1P (256 x 256 mm) bed, each 250 x 190 mm. ' +
        'Print one of each: A1, A2, B1, B2. ' +
        'Lay them out as the grid reads, row A at the top, column 1 at the left, and glue them edge to edge onto a backing board of 500 x 380 mm. ' +
        'Levels, measured from the underside: base 0.4 mm, then 1.0, 1.8, 2.4 mm. ' +
        'Label channels take 12.7 mm tape. ' +
        'Label tape: contracted braille (UEB Grade 2). No labels on the map. ' +
        'The picture plate_grid.svg shows the layout.\n'
    );
    expect(await zip.file('plate_grid.svg').async('string')).toContain(
      '>B2</text>'
    );
    expect(status()).toBe('All 4 plates are in tactile_map_plates.zip.');
    expect(announce).toHaveBeenCalledWith(
      'All 4 plates are in tactile_map_plates.zip.',
      expect.anything()
    );
    expect(announce).toHaveBeenCalledWith(
      'Plate 1 of 4 rendered.',
      expect.anything()
    );
    expect(render.hidden).toBe(false);
    expect(document.getElementById('tactileMapRenderCancel').hidden).toBe(true);
  });

  it('hands each plate to the render as the radio would write it, as STL within 60 seconds', async () => {
    const calls = [];
    mount({
      render: vi.fn(async (parameters, options) => {
        calls.push({ parameters, options });
        return EMPTY_STL();
      }),
    });
    await vi.waitFor(() => expect(files.length).toBeGreaterThan(0), SETTLE);
    click('tactileMapRenderAll');
    await readZip();
    expect(calls.length).toBe(4);
    expect(calls.map((c) => c.parameters.map_file.name)).toEqual([
      'levels_A1.svg',
      'levels_A2.svg',
      'levels_B1.svg',
      'levels_B2.svg',
    ]);
    const first = calls[0].parameters;
    expect(first.map_width_mm).toBe(250);
    expect(first.map_height_mm).toBe(190);
    expect(first.plate_id).toBe('');
    expect(first.plate_shows_title).toBe('yes');
    expect(first.plate_shows_north).toBe('no');
    expect(calls[1].parameters.plate_shows_north).toBe('yes');
    expect(calls[3].parameters.plate_shows_title).toBe('no');
    expect(first.map_file.data).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(first.title_text).toBe('Station');
    expect(calls[0].options).toEqual({ format: 'stl', timeoutMs: 60000 });
    expect(String(params().map_width_mm)).toBe('500');
  });

  it('stops after the current plate on Cancel and keeps the chosen plate', async () => {
    const pending = [];
    mount({
      render: vi.fn(
        () =>
          new Promise((resolve, reject) => {
            pending.push({ resolve, reject });
          })
      ),
    });
    await vi.waitFor(() => expect(files.length).toBeGreaterThan(0), SETTLE);
    const b2 = document.querySelector('#tactileMapPlates input[value="B2"]');
    b2.checked = true;
    b2.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(
      () => expect(String(params().map_width_mm)).toBe('250'),
      SETTLE
    );

    const render = document.getElementById('tactileMapRenderAll');
    const cancel = document.getElementById('tactileMapRenderCancel');
    render.click();
    expect(render.hidden).toBe(true);
    expect(cancel.hidden).toBe(false);
    expect(document.activeElement).toBe(cancel);
    await vi.waitFor(() => expect(pending.length).toBe(1), SETTLE);
    pending[0].resolve(EMPTY_STL());
    await vi.waitFor(
      () => expect(status()).toBe('Plate 1 of 4 rendered.'),
      SETTLE
    );
    await vi.waitFor(() => expect(pending.length).toBe(2), SETTLE);
    cancel.click();
    expect(status()).toBe('Stopping after this plate.');
    pending[1].resolve(EMPTY_STL());

    const { names, readme } = await readZip();
    expect(names.filter((n) => n.endsWith('.stl'))).toEqual([
      'tactile_map_A1.stl',
      'tactile_map_A2.stl',
    ]);
    expect(readme).toContain('Print one of each: A1, A2, B1, B2.');
    expect(readme).not.toContain('Stopped');
    expect(pending.length).toBe(2);
    expect(status()).toBe(
      'Stopped after plate 2; the zip holds the plates finished so far.'
    );
    expect(announce).toHaveBeenCalledWith(
      'Stopped after plate 2; the zip holds the plates finished so far.',
      expect.anything()
    );
    expect(b2.checked).toBe(true);
    expect(String(params().map_width_mm)).toBe('250');
    expect(render.hidden).toBe(false);
    expect(cancel.hidden).toBe(true);
    expect(document.activeElement).toBe(render);
  });

  it('stops with the error after a plate fails, keeping the plates done', async () => {
    let n = 0;
    mount({
      render: vi.fn(async () => {
        n += 1;
        if (n === 3) throw new Error('The engine stopped.');
        return EMPTY_STL();
      }),
    });
    await vi.waitFor(() => expect(files.length).toBeGreaterThan(0), SETTLE);
    click('tactileMapRenderAll');
    const { names } = await readZip();
    expect(names.filter((name) => name.endsWith('.stl')).length).toBe(2);
    expect(n).toBe(3);
    expect(announceError).toHaveBeenCalledWith(
      'Stopped after plate 2; the zip holds the plates finished so far. The engine stopped.',
      expect.anything()
    );
    expect(document.getElementById('tactileMapRenderAll').hidden).toBe(false);
  });

  it('downloads nothing when the first plate fails', async () => {
    mount({
      render: vi.fn(async () => {
        throw new Error('The engine stopped.');
      }),
    });
    await vi.waitFor(() => expect(files.length).toBeGreaterThan(0), SETTLE);
    click('tactileMapRenderAll');
    await vi.waitFor(
      () =>
        expect(announceError).toHaveBeenCalledWith(
          'Stopped before the first plate finished; nothing to download. The engine stopped.',
          expect.anything()
        ),
      SETTLE
    );
    expect(downloads.length).toBe(0);
  });
});

/**
 * A drawing at 340 x 240 mm: a 300 x 2 mm bar and a 20 x 20 mm square at
 * its far corner, so the shapes span 300 x 200 mm.
 */
const DRAWING =
  '<svg xmlns="http://www.w3.org/2000/svg" width="340mm" height="240mm" viewBox="0 0 340 240">' +
  '<rect x="20" y="20" width="300" height="2"/>' +
  '<rect x="300" y="200" width="20" height="20"/>' +
  '</svg>';

/** The regions the editor's map purpose hands back for a drawing. */
function regionsOf(svg, classes) {
  return analyzeSvg(svg).elements.map((el, i) => ({
    key: `shape-${i}`,
    index: i,
    name: `Shape ${i + 1}`,
    class: classes[i] || 'ignore',
    pathData: el.pathData,
    rings: ringsFromPathData(el.pathData),
  }));
}

describe('the drawing door', () => {
  let editor;
  let opens;

  function mountWithDoor(options = {}) {
    opens = [];
    editor = {
      open: vi.fn((svg, analysis, opts) => {
        opens.push({ svg, analysis, options: opts });
      }),
      isOpen: vi.fn(() => false),
    };
    mount({ getEditor: vi.fn(async () => editor), ...options });
  }

  const holdDrawing = () => {
    stateManager.setState({
      parameters: {
        ...params(),
        map_file: { name: 'station.svg', data: svgToDataUrl(DRAWING) },
      },
    });
  };

  it('stands above the symbol buttons with its width control, never between the render button and its status', () => {
    mountWithDoor();
    const door = document.getElementById('tactileMapEditDrawing');
    expect(door.textContent).toBe('Edit drawing as a map');
    expect(door.type).toBe('button');
    const width = document.getElementById('tactileMapDrawingWidth');
    expect(width.type).toBe('number');
    expect(
      document.querySelector('label[for="tactileMapDrawingWidth"]').textContent
    ).toBe('Drawing width (mm)');
    expect(width.value).toBe('480');
    const order = [
      ...document.querySelectorAll(
        '#tactileMapDrawingWidth, #tactileMapEditDrawing, .tactile-map-symbols, #tactileMapRenderAll, #tactileMapRenderStatus'
      ),
    ].map((el) => el.id || el.className);
    expect(order).toEqual([
      'tactileMapDrawingWidth',
      'tactileMapEditDrawing',
      'braille-translate-row tactile-map-symbols',
      'tactileMapRenderAll',
      'tactileMapRenderStatus',
    ]);
  });

  it('opens the editor as a map on the picture in the file control, and Apply classes makes the plan', async () => {
    mountWithDoor();
    await vi.waitFor(() => expect(files.length).toBeGreaterThan(0), SETTLE);
    holdDrawing();
    click('tactileMapEditDrawing');
    await vi.waitFor(() => expect(opens.length).toBe(1), SETTLE);
    const [{ svg, analysis, options }] = opens;
    expect(svg).toBe(DRAWING);
    expect(analysis.elements).toHaveLength(2);
    expect(options.purpose).toBe('map');
    expect(options.sourceName).toBe('station.svg');
    expect(options.initialClasses).toBeNull();
    expect(document.getElementById('tactileMapDrawingWidth').value).toBe('340');

    const before = files.length;
    options.onApply({
      regions: regionsOf(DRAWING, { 0: 'wall', 1: 'area' }),
      svg: DRAWING,
    });
    // The drawing's 302 x 202 mm in its 10 mm band.
    await vi.waitFor(
      () => expect(summary()).toBe('2 plates of 161 x 222 mm, A1 to A2.'),
      SETTLE
    );
    await vi.waitFor(
      () => expect(files.length).toBeGreaterThan(before),
      SETTLE
    );
    const last = files[files.length - 1];
    expect(last.fileName).toBe('levels_whole.svg');
    expect(last.svg).toMatch(/viewBox="0 0 322 222"/);
    expect(last.svg).toMatch(/<g id="level3">\s*<path/);
    expect(String(params().map_width_mm)).toBe('322');
    expect(String(params().map_height_mm)).toBe('222');
    expect(document.getElementById('tactileMapWarnings').children.length).toBe(
      0
    );
  });

  it('reopens on the drawing it kept, with the classes applied before, when the control holds the levels file', async () => {
    mountWithDoor();
    await vi.waitFor(() => expect(files.length).toBeGreaterThan(0), SETTLE);
    holdDrawing();
    click('tactileMapEditDrawing');
    await vi.waitFor(() => expect(opens.length).toBe(1), SETTLE);
    opens[0].options.onApply({
      regions: regionsOf(DRAWING, { 0: 'wall', 1: 'area' }),
      svg: DRAWING,
    });
    await vi.waitFor(
      () => expect(summary()).toBe('2 plates of 161 x 222 mm, A1 to A2.'),
      SETTLE
    );
    const levels = files[files.length - 1];
    stateManager.setState({
      parameters: {
        ...params(),
        map_file: { name: levels.fileName, data: svgToDataUrl(levels.svg) },
      },
    });
    click('tactileMapEditDrawing');
    await vi.waitFor(() => expect(opens.length).toBe(2), SETTLE);
    expect(opens[1].svg).toBe(DRAWING);
    expect(opens[1].options.initialClasses).toEqual({ 0: 'wall', 1: 'area' });
    expect(dataUrlToText(svgToDataUrl(levels.svg))).toBe(levels.svg);
  });

  it('says the scale when the drawing width changes, and rebuilds the plan at it', async () => {
    mountWithDoor();
    await vi.waitFor(() => expect(files.length).toBeGreaterThan(0), SETTLE);
    holdDrawing();
    click('tactileMapEditDrawing');
    await vi.waitFor(() => expect(opens.length).toBe(1), SETTLE);
    opens[0].options.onApply({
      regions: regionsOf(DRAWING, { 0: 'wall', 1: 'area' }),
      svg: DRAWING,
    });
    await vi.waitFor(
      () => expect(summary()).toBe('2 plates of 161 x 222 mm, A1 to A2.'),
      SETTLE
    );
    const width = document.getElementById('tactileMapDrawingWidth');
    width.value = '170';
    width.dispatchEvent(new Event('change', { bubbles: true }));
    expect(announce).toHaveBeenCalledWith(
      'Scale set: one drawing unit is 0.5 mm.',
      expect.anything()
    );
    await vi.waitFor(
      () =>
        expect(summary()).toBe(
          'One plate of 172 x 122 mm; the whole map fits.'
        ),
      SETTLE
    );
    expect(String(params().map_width_mm)).toBe('172');
  });
});

describe('the map data row', () => {
  const PLACE = {
    name: 'Central Library, 1000, 4th Avenue, Seattle, Washington, United States',
    lat: 47.6067,
    lon: -122.3327,
    kind: 'library',
  };
  const OVERPASS = JSON.parse(
    readFileSync('tests/fixtures/tactile-map/overpass-20.json', 'utf8')
  );
  const OSM = readFileSync('tests/fixtures/tactile-map/export.osm', 'utf8');
  const trimmed = () => OVERPASS.elements.map(trimElement).filter(Boolean);
  const answered = (extra = {}) =>
    vi.fn(async () => ({
      elements: trimmed(),
      bytes: 5363,
      ms: 1200,
      ...extra,
    }));
  const refusing = (code, waits = []) =>
    vi.fn(async ({ onWait }) => {
      for (const s of waits) onWait(s);
      const error = new Error(code);
      error.code = code;
      throw error;
    });
  const addressStatus = () =>
    document.getElementById('tactileMapAddressStatus').textContent;
  const make = () => document.getElementById('tactileMapMake');
  const scaleRadios = () => [
    ...document.querySelectorAll('#tactileMapScale input[type="radio"]'),
  ];
  const chooseScale = (key) => {
    const radio = document.getElementById(`tactileMapScale-${key}`);
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
  };
  let opened;
  const editor = {
    open: vi.fn((svg, analysis, options) => {
      opened = { svg, analysis, options };
    }),
  };

  beforeEach(() => {
    opened = null;
    mount({ type: 'place', getEditor: async () => editor });
  });
  const tiers = () => [
    ...document.querySelectorAll('#tactileMapDetail input[type="radio"]'),
  ];
  const labelOf = (control) =>
    document.querySelector(`label[for="${control.id}"]`).textContent;

  async function pickPlace(options) {
    mount({
      type: 'place',
      searchPlaces: vi.fn(async () => [PLACE]),
      getEditor: async () => editor,
      ...options,
    });
    const input = document.getElementById('tactileMapAddress');
    input.value = 'Central Library';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('tactileMapSearch').click();
    await vi.waitFor(() =>
      expect(
        document.querySelectorAll('#tactileMapResults input[type="radio"]')
      ).toHaveLength(1)
    );
    document.querySelector('#tactileMapResults input[type="radio"]').click();
    expect(getMapPlace()).toEqual(PLACE);
  }

  function dropFile(name, text) {
    const fileInput = document.getElementById('tactileMapOsmFile');
    Object.defineProperty(fileInput, 'files', {
      value: [new File([text], name, { type: 'text/xml' })],
      configurable: true,
    });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  it('offers the scales by the ground they fit, A block ticked, each saying what it fits on the plate; a custom ratio from 200 to 10000; the detail tiers; the attribution link', () => {
    expect(document.querySelector('#tactileMapScale legend').textContent).toBe(
      'Map scale'
    );
    expect(
      scaleRadios().map((r) => [
        document.querySelector(`label[for="${r.id}"]`).textContent,
        r.checked,
      ])
    ).toEqual([
      ['A building and its doors, 1:500', false],
      ['A block, 1:1000', true],
      ['A few blocks, 1:2000', false],
      ['A neighborhood, 1:4000', false],
      ['Custom', false],
    ]);
    const said = (r) =>
      document.getElementById(r.getAttribute('aria-describedby')).textContent;
    expect(said(scaleRadios()[1])).toBe(
      '480 m across on this plate. A 10 mm symbol stands for 10 m. Sidewalks and crossings draw.'
    );
    expect(said(scaleRadios()[3])).toBe(
      '1920 m across on this plate. A 10 mm symbol stands for 40 m. Streets draw as one line; crossings, side paths and landmarks leave.'
    );
    // Custom's ratio waits until Custom is chosen.
    const custom = document.getElementById('tactileMapScaleCustom');
    expect(custom.closest('.tactile-map-scale-custom').hidden).toBe(true);
    expect([custom.type, custom.min, custom.max, custom.value]).toEqual([
      'number',
      '200',
      '10000',
      '1500',
    ]);
    chooseScale('custom');
    expect(custom.closest('.tactile-map-scale-custom').hidden).toBe(false);
    expect(
      document.querySelector('label[for="tactileMapScaleCustom"]').textContent
    ).toBe('Custom scale, 1 to');
    expect(said(scaleRadios()[4])).toBe(
      '720 m across on this plate. A 10 mm symbol stands for 15 m. Sidewalks and crossings draw.'
    );
    custom.value = '3500';
    custom.dispatchEvent(new Event('input', { bubbles: true }));
    expect(said(scaleRadios()[4])).toBe(
      '1680 m across on this plate. A 10 mm symbol stands for 35 m. Streets draw as one line; crossings, side paths and landmarks leave.'
    );
    expect(document.getElementById('tactileMapRadius')).toBeNull();
    expect(document.querySelector('#tactileMapDetail legend').textContent).toBe(
      'How much to show'
    );
    expect(tiers().map((r) => [labelOf(r), r.checked])).toEqual([
      ['The way and its doors', false],
      ['Named places', true],
      ['Every building', false],
      ['Everything in the data', false],
    ]);
    expect(said(tiers()[1])).toBe(
      'The way, the named places and transit stops the scale has room for, and the buildings along the way.'
    );
    expect(document.getElementById('tactileMapDetailCount').hidden).toBe(true);
    expect(make().textContent).toBe('Make the map');
    expect(make().disabled).toBe(false);
    expect(document.getElementById('tactileMapLoadFile').textContent).toBe(
      'Use a file instead'
    );
    expect(document.getElementById('tactileMapOsmFile').accept).toBe(
      '.osm,.geojson,.json,application/json,text/xml'
    );
    expect(document.getElementById('tactileMapFileHelp').textContent).toBe(
      'An .osm export from openstreetmap.org, or a .geojson file. The file stays on your device.'
    );
    const link = document.querySelector('#tactileMapAttribution a');
    expect(link.getAttribute('href')).toBe(
      'https://www.openstreetmap.org/copyright'
    );
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.textContent).toContain('OpenStreetMap contributors');
    // The map tiles' service asks for its own credit, with its link.
    const links = [...document.querySelectorAll('#tactileMapAttribution a')];
    expect(links).toHaveLength(2);
    expect(links[1].getAttribute('href')).toBe(
      'https://tiles.openstreetmap.us'
    );
    expect(links[1].getAttribute('target')).toBe('_blank');
    expect(links[1].getAttribute('rel')).toContain('noopener');
    expect(document.getElementById('tactileMapAttribution').textContent).toBe(
      'Map data from OpenStreetMap contributors (opens in new tab), ODbL. Tiles by OSM US (opens in new tab).'
    );
  });

  it('Make the map with no place and no file says to pick one, and asks no server', async () => {
    const pullArea = answered();
    mount({ type: 'place', pullArea, getEditor: async () => editor });
    make().click();
    await vi.waitFor(() =>
      expect(addressStatus()).toBe('Pick a place first, or use a file instead.')
    );
    expect(pullArea).not.toHaveBeenCalled();
    expect(announceError).toHaveBeenCalledWith(addressStatus(), {
      source: 'tactile-map',
    });
  });

  it('Make the map pulls the ground of the chosen scale, keeps the data, shows the counts without saying them, and drafts', async () => {
    const pullArea = answered();
    await pickPlace({ pullArea });
    chooseScale('blocks');
    const shown = [];
    const watcher = new MutationObserver(() => shown.push(addressStatus()));
    watcher.observe(document.getElementById('tactileMapAddressStatus'), {
      childList: true,
      characterData: true,
      subtree: true,
    });
    make().click();
    expect(addressStatus()).toBe(
      `Getting map data for 960 by 720 m around ${PLACE.name}...`
    );
    expect(make().disabled).toBe(true);
    await vi.waitFor(() => expect(opened).not.toBeNull());
    watcher.disconnect();
    expect(addressStatus()).toMatch(/^Draft map ready: /);
    // The points are named by what they are in the draft, not all landmarks.
    const counts =
      '21 map features in 960 by 720 m: 11 walkways, 4 crossings, 3 buildings, 3 other points.';
    expect(shown).toContain(counts);
    expect(announce).not.toHaveBeenCalledWith(counts, expect.anything());
    expect(make().disabled).toBe(false);
    // The ground of 1:2000 on a 480 x 360 mm plate, centered on the place.
    const call = pullArea.mock.calls[0][0];
    const [west, south] = projectLatLon(call.box.south, call.box.west, PLACE);
    const [east, north] = projectLatLon(call.box.north, call.box.east, PLACE);
    expect(east - west).toBeCloseTo(960, 0);
    expect(north - south).toBeCloseTo(720, 0);
    expect(east + west).toBeCloseTo(0, 3);
    expect(typeof call.onWait).toBe('function');
    const osm = getMapData();
    expect(osm.elements).toHaveLength(21);
    expect(osm.center).toEqual({ lat: PLACE.lat, lon: PLACE.lon });
    expect([osm.scale.key, osm.scale.ratio]).toEqual(['blocks', 2000]);
    expect(osm.radiusM).toBe(480);
    expect(osm.source).toBe('overpass');
    expect(osm.place).toEqual(PLACE);
    expect(osm.landmarks).toEqual(['entrance', 'transit-stop']);
    expect(announce).toHaveBeenCalledWith(addressStatus(), {
      source: 'tactile-map',
    });
  });

  it('says the wait when no server answers, and gives up after the second wait', async () => {
    await pickPlace({ pullArea: refusing('busy', [30, 60]) });
    make().click();
    await vi.waitFor(() =>
      expect(addressStatus()).toBe(
        'No map server answered. Try again in a few minutes, or export the area from openstreetmap.org and use the file instead.'
      )
    );
    expect(announce).toHaveBeenCalledWith(
      'No map server answered. Trying again in 30 seconds.',
      { source: 'tactile-map' }
    );
    expect(announce).toHaveBeenCalledWith(
      'No map server answered. Trying again in 60 seconds.',
      { source: 'tactile-map' }
    );
    expect(announceError).toHaveBeenCalledWith(addressStatus(), {
      source: 'tactile-map',
    });
    expect(getMapData()).toBeNull();
    expect(make().disabled).toBe(false);
    expect(opened).toBeNull();
  });

  it('says the data did not arrive when the pull fails', async () => {
    await pickPlace({ pullArea: refusing('no-answer') });
    make().click();
    await vi.waitFor(() =>
      expect(addressStatus()).toBe(
        'The map data did not arrive. Check your connection and try again, or use a file instead.'
      )
    );
  });

  it('warns over 2 MB in the same breath as the draft', async () => {
    await pickPlace({ pullArea: answered({ bytes: 2_600_000 }) });
    make().click();
    await vi.waitFor(() => expect(opened).not.toBeNull());
    expect(addressStatus()).toMatch(
      /^Draft map ready: .* Choose what stays\. 2\.5 MB of map data arrived\. A scale with less ground makes a lighter map\. The key has \d+ symbols? and \d+ abbreviations?\.$/
    );
  });

  it('says how many far features a draft left out to stay within what the editor lists', async () => {
    // 1100 sidewalks around the library, 6 m each, all on the plate, and
    // one beside it, which the draft turns on.
    const many = [
      {
        type: 'way',
        id: 4999,
        tags: { highway: 'footway', footway: 'sidewalk' },
        geometry: [
          { lat: PLACE.lat + 5 / 110540, lon: PLACE.lon - 0.0001 },
          { lat: PLACE.lat + 5 / 110540, lon: PLACE.lon + 0.0001 },
        ],
      },
    ];
    for (let i = 0; i < 1100; i += 1) {
      const r = 40 + i * 0.12;
      const a = (i * 137.5 * Math.PI) / 180;
      const lat = PLACE.lat + (r * Math.sin(a)) / 110540;
      const lon =
        PLACE.lon +
        (r * Math.cos(a)) / (111320 * Math.cos((PLACE.lat * Math.PI) / 180));
      many.push({
        type: 'way',
        id: 5000 + i,
        tags: { highway: 'footway', footway: 'sidewalk' },
        geometry: [
          { lat, lon },
          {
            lat,
            lon: lon + 6 / (111320 * Math.cos((PLACE.lat * Math.PI) / 180)),
          },
        ],
      });
    }
    const pullArea = vi.fn(async () => ({
      elements: many,
      bytes: 1000,
      ms: 10,
    }));
    await pickPlace({ pullArea });
    make().click();
    await vi.waitFor(() => expect(opened).not.toBeNull(), { timeout: 15000 });
    expect(getMapPlan().features).toHaveLength(1000);
    // Two of the thousand seats are the marks', the destination and You
    // are here.
    expect(addressStatus()).toMatch(
      / 103 features far from the address were left out: the editor works with 1,000 at a time\. The key has \d+ symbols? and \d+ abbreviations?\.$/
    );
  });

  it('a new scale asks for its ground again; the same scale does not', async () => {
    const pullArea = answered();
    await pickPlace({ pullArea });
    make().click();
    await vi.waitFor(() => expect(opened).not.toBeNull());
    expect(pullArea).toHaveBeenCalledTimes(1);
    opened = null;
    make().click();
    await vi.waitFor(() => expect(opened).not.toBeNull());
    expect(pullArea).toHaveBeenCalledTimes(1);
    opened = null;
    chooseScale('blocks');
    make().click();
    await vi.waitFor(() => expect(opened).not.toBeNull());
    expect(pullArea).toHaveBeenCalledTimes(2);
    expect(getMapData().scale.key).toBe('blocks');
    expect(getMapPlan().meta.geo.mmPerM).toBe(0.5);
    // Over a neighborhood only streets draw, and this data has none.
    opened = null;
    chooseScale('neighborhood');
    make().click();
    await vi.waitFor(() =>
      expect(addressStatus()).toBe(
        'No streets in the map data at this scale. Try another scale or another address.'
      )
    );
    expect(opened).toBeNull();
    expect(pullArea).toHaveBeenCalledTimes(3);
  });

  it('a second press for the same place drafts again without asking the server again', async () => {
    const pullArea = answered();
    await pickPlace({ pullArea });
    make().click();
    await vi.waitFor(() => expect(opened).not.toBeNull());
    opened = null;
    make().click();
    await vi.waitFor(() => expect(opened).not.toBeNull());
    expect(pullArea).toHaveBeenCalledTimes(1);
  });

  it('puts one choice a group under the tier, each with its words; a group changed marks the tier, and another tier puts the groups back', () => {
    const groups = document.getElementById('tactileMapGroups');
    expect(groups.tagName).toBe('DETAILS');
    expect(groups.querySelector('summary').textContent).toBe('Change a group');
    const selects = [...groups.querySelectorAll('select')];
    expect(
      selects.map((s) => [
        labelOf(s),
        s.value,
        [...s.options].map((o) => o.textContent),
      ])
    ).toEqual([
      ['Sidewalks', 'way', ['Near the address', 'All']],
      ['Crossings', 'way', ['Near the address', 'All']],
      ['Entrances', 'address', ["The address's door", 'All']],
      ['Buildings', 'along', ['None', 'Along the way', 'Named ones', 'All']],
      [
        'Named places and points',
        'named',
        ['None', 'Named places', 'All points'],
      ],
      ['Transit stops', 'on', ['Off', 'On']],
      ['Benches, bins and racks', 'off', ['Off', 'On']],
      ['Curb ramps and raised curbs', 'on', ['Off', 'On']],
    ]);
    const furniture = document.getElementById('tactileMapGroup-furniture');
    furniture.value = 'on';
    furniture.dispatchEvent(new Event('change', { bubbles: true }));
    expect(labelOf(tiers()[1])).toBe('Named places (changed)');
    tiers()[2].click();
    expect(labelOf(tiers()[1])).toBe('Named places');
    expect(labelOf(tiers()[2])).toBe('Every building');
    expect(furniture.value).toBe('off');
    expect(document.getElementById('tactileMapGroup-buildings').value).toBe(
      'all'
    );
    // Everything shows each group at its most.
    tiers()[3].click();
    expect(selects.map((s) => s.value)).toEqual([
      'all',
      'all',
      'all',
      'all',
      'all',
      'on',
      'on',
      'on',
    ]);
  });

  it('the file door takes an export, centered on the picked place', async () => {
    await pickPlace({ pullArea: answered() });
    dropFile('export.osm', OSM);
    await vi.waitFor(() =>
      expect(addressStatus()).toBe('export.osm: 5 map features loaded.')
    );
    const osm = getMapData();
    expect(osm.source).toBe('file');
    expect(osm.elements).toHaveLength(5);
    expect(osm.center).toEqual({ lat: PLACE.lat, lon: PLACE.lon });
    // The file is drafted at the scale chosen; its ground reaches 240 m.
    expect(osm.scale.key).toBe('block');
    expect(osm.radiusM).toBe(240);
    expect(document.getElementById('tactileMapOsmFile').value).toBe('');
  });

  it('a wrong file says so', async () => {
    mount({ type: 'place' });
    dropFile('notes.txt', 'hello there');
    await vi.waitFor(() =>
      expect(addressStatus()).toBe(
        'notes.txt is not an OpenStreetMap export or a GeoJSON file.'
      )
    );
    expect(announceError).toHaveBeenCalledWith(addressStatus(), {
      source: 'tactile-map',
    });
    expect(getMapData()).toBeNull();
  });

  it('a file with no place picked centers on the middle of the file and says so', async () => {
    mount({ type: 'place' });
    dropFile('export.osm', OSM);
    await vi.waitFor(() =>
      expect(addressStatus()).toBe(
        'export.osm loaded; the map centers on the middle of the file. Pick an address first to center it there.'
      )
    );
    const osm = getMapData();
    expect(osm.center.lat).toBeCloseTo(47.6085, 4);
    expect(osm.center.lon).toBeCloseTo(-122.3355, 4);
    expect(osm.place).toBeNull();
  });
});

describe('the map Make the map drafts', () => {
  const PLACE = {
    name: 'Central Library, 1000, 4th Avenue, Seattle, Washington, United States',
    lat: 47.6067,
    lon: -122.3327,
    kind: 'library',
  };
  const OVERPASS = JSON.parse(
    readFileSync('tests/fixtures/tactile-map/overpass-20.json', 'utf8')
  );
  const trimmed = () => OVERPASS.elements.map(trimElement).filter(Boolean);
  const make = () => document.getElementById('tactileMapMake');
  const addressStatus = () =>
    document.getElementById('tactileMapAddressStatus').textContent;

  let opened;
  const editor = {
    open: vi.fn((svg, analysis, options) => {
      opened = { svg, analysis, options };
    }),
  };

  async function pullData(elements = trimmed(), options = {}) {
    opened = null;
    mount({
      type: 'place',
      searchPlaces: vi.fn(async () => [PLACE]),
      pullArea: vi.fn(async () => ({ elements, bytes: 5363, ms: 1 })),
      getEditor: async () => editor,
      ...options,
    });
    const input = document.getElementById('tactileMapAddress');
    input.value = 'Central Library';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('tactileMapSearch').click();
    await vi.waitFor(() =>
      expect(
        document.querySelectorAll('#tactileMapResults input[type="radio"]')
      ).toHaveLength(1)
    );
    document.querySelector('#tactileMapResults input[type="radio"]').click();
    make().click();
    await vi.waitFor(() => expect(getMapData()).not.toBeNull());
  }

  it('stands first in its step, the status box under it, then the file door and the credit', () => {
    mount({ type: 'place' });
    expect(make().textContent).toBe('Make the map');
    const step = make().closest('section');
    expect([...step.children].map((n) => n.id)).toEqual([
      'tactileMapMakeRow',
      'tactileMapAddressStatus',
      '',
      'tactileMapFileHelp',
      'tactileMapAttribution',
    ]);
    expect(step.querySelector('#tactileMapLoadFile')).toBeTruthy();
  });

  it('drafts the plan from the data, says how much is on, and opens the editor as a draft', async () => {
    await pullData();
    await vi.waitFor(() => expect(opened).not.toBeNull());
    expect(addressStatus()).toMatch(
      /^Draft map ready: \d+ of 22 features on; (\d+ warnings|no warnings)\. Choose what stays\. The key has \d+ symbols? and \d+ abbreviations?\.$/
    );
    expect(announce).toHaveBeenCalledWith(addressStatus(), {
      source: 'tactile-map',
    });
    expect(opened.options.purpose).toBe('map');
    expect(opened.options.draft).toBe(true);
    expect(opened.options.sourceName).toBe('Draft map of Central Library');
    expect(opened.svg).toContain('data-feature="destination"');
    // You are here rides along off, a row the person switches on or places.
    expect(opened.svg).toContain('data-feature="you-are-here"');
    expect(opened.analysis.elements).toHaveLength(22);
    const classes = opened.options.initialClasses;
    expect(Object.keys(classes)).toHaveLength(22);
    const plan = getMapPlan();
    // The rows: what is on first, then what is off, curbs last within each;
    // the editor gets the features in that order and the map's own width.
    const rows = opened.options.features;
    expect(rows.map((f) => f.id)).toEqual(
      rowOrder(plan.features).map((i) => plan.features[i].id)
    );
    rows.forEach((f, i) => {
      expect(classes[i]).toBe(f.on ? f.class : 'ignore');
    });
    const firstOff = rows.findIndex((f) => !f.on);
    expect(rows.slice(firstOff).every((f) => !f.on)).toBe(true);
    expect(classes[rows.findIndex((f) => f.id === 'destination')]).toBe(
      'destination'
    );
    expect(opened.options.designWidthMm).toBe(plan.size.w);
    expect(plan.meta.title).toBe('Central Library');
  });

  it('offers the symbol set in step 3, the basic shapes first: a set chosen is said once and redraws the levels with its shapes, and Your own set reveals the file door', async () => {
    await pullData();
    await vi.waitFor(() => expect(opened).not.toBeNull());
    const choice = document.getElementById('tactileMapSymbolSet');
    expect(choice.parentElement).toBe(
      document.getElementById('tactileMapDetail').parentElement
    );
    expect(choice.querySelector('legend').textContent).toBe('Symbol set');
    const radios = [...choice.querySelectorAll('input[type="radio"]')];
    expect(radios.map((r) => r.value)).toEqual([
      'forge-basic',
      'oregon-2012',
      'file',
    ]);
    expect(
      radios.map(
        (r) => choice.querySelector(`label[for="${r.id}"]`).textContent
      )
    ).toEqual([
      'Forge basic shapes',
      'University of Oregon symbols',
      'Your own set (a file)',
    ]);
    expect(radios[0].checked).toBe(true);
    const door = document.getElementById('tactileMapSymbolDoor');
    expect(door.hidden).toBe(true);
    try {
      const before = files[files.length - 1].svg;
      announce.mockClear();
      radios[1].click();
      expect(activeSetKey()).toBe('oregon-2012');
      await vi.waitFor(
        () => expect(files[files.length - 1].svg).not.toBe(before),
        SETTLE
      );
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith(
        'Symbols: University of Oregon symbols.',
        { source: 'tactile-map' }
      );
      expect(
        document.getElementById('tactileMapAddressStatus').textContent
      ).toBe('Symbols: University of Oregon symbols.');
      radios[2].click();
      expect(door.hidden).toBe(false);
      expect(
        door.contains(document.getElementById('tactileMapSymbolFile'))
      ).toBe(true);
      expect(activeSetKey()).toBe('forge-basic');
      // No file yet: the map goes back to the basic shapes, nothing said.
      await vi.waitFor(
        () => expect(files[files.length - 1].svg).toBe(before),
        SETTLE
      );
      expect(announce).toHaveBeenCalledTimes(1);
      radios[0].click();
      expect(door.hidden).toBe(true);
    } finally {
      setActiveSet('forge-basic');
    }
  });

  it('draws the set at its own size: step 2 says 13 mm, the editor draws 13 mm, the README names the set, and closing the panel puts the basic shapes back', async () => {
    await pullData(undefined, {
      config: {
        plateKindParam: 'plate_kind',
        raisedWordsParam: 'raised_words',
        keyLetterParam: 'key_letter_height_mm',
      },
    });
    await vi.waitFor(() => expect(opened).not.toBeNull());
    const block = document.getElementById('tactileMapScale-block');
    const said = () =>
      document.getElementById(block.getAttribute('aria-describedby'))
        .textContent;
    expect(said()).toContain('A 10 mm symbol stands for 10 m.');
    try {
      document.getElementById('tactileMapSymbolSet-oregon-2012').click();
      expect(said()).toContain('A 13 mm symbol stands for 13 m.');
      opened = null;
      make().click();
      await vi.waitFor(() => expect(opened).not.toBeNull());
      const plan = getMapPlan();
      const order = rowOrder(plan.features);
      expect(opened.svg).toBe(
        drawingFromPlan(plan, settingsForSet('oregon-2012'), { order })
      );
      document.getElementById('tactileMapRenderAll').click();
      const { readme } = await readZip();
      expect(readme).toContain(
        '\nKey\nSymbols: University of Oregon symbols.\n'
      );
      expect(readme).toContain(
        'Symbols: Lobben and Lawrence 2012, University of Oregon, GPL-3'
      );
      destroyMapPanel();
      expect(activeSetKey()).toBe('forge-basic');
      expect(activeLibrary()).toBe(BUILT_IN_SYMBOLS);
    } finally {
      setActiveSet('forge-basic');
    }
  });

  it("drafts at step 3's tier: the live line says what is on once the data is here, a new tier is said once and the next draft takes it", async () => {
    await pullData();
    await vi.waitFor(() => expect(opened).not.toBeNull());
    const line = document.getElementById('tactileMapDetailCount');
    const plan = getMapPlan();
    const on = plan.features.filter((f) => f.on).length;
    expect(line.hidden).toBe(false);
    expect(line.textContent).toMatch(
      new RegExp(`^${on} features on, \\d+ different symbols?\\.`)
    );
    // Named places: no building away from the way, no bench.
    expect(
      plan.features.filter((f) => f.class === 'furniture' && f.on)
    ).toEqual([]);

    announce.mockClear();
    document.getElementById('tactileMapDetail-everything').click();
    await vi.waitFor(() =>
      expect(line.textContent).toMatch(
        /^21 features on, \d+ different symbols?\./
      )
    );
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(line.textContent, {
      source: 'tactile-map',
    });
    opened = null;
    make().click();
    await vi.waitFor(() => expect(opened).not.toBeNull());
    // Everything but You are here, which waits for the person to place it.
    expect(
      getMapPlan().features.every((f) => f.on || f.class === 'you-are-here')
    ).toBe(true);
    expect(addressStatus()).toMatch(/^Draft map ready: 21 of 22 features on;/);

    document.getElementById('tactileMapDetail-way').click();
    await vi.waitFor(() => expect(line.textContent).not.toMatch(/^21 /));
    opened = null;
    make().click();
    await vi.waitFor(() => expect(opened).not.toBeNull());
    const way = getMapPlan().features.filter((f) => f.on);
    expect(
      way.filter((f) => ['landmark', 'area', 'transit-stop'].includes(f.class))
    ).toEqual([]);
    expect(way.some((f) => f.class === 'walkway')).toBe(true);
    expect(way.some((f) => f.class === 'destination')).toBe(true);
    expect(way.some((f) => f.class === 'you-are-here')).toBe(false);
  });

  it('takes the rows back by index: a feature off keeps its class, one on takes the class, and the plan is rebuilt', async () => {
    await pullData();
    await vi.waitFor(() => expect(opened).not.toBeNull());
    const before = JSON.parse(JSON.stringify(getMapPlan()));
    const filesBefore = files.length;
    // The regions come back by the editor's row, which is not the plan's.
    const rows = opened.options.features;
    const regions = rows.map((f, index) => ({
      index,
      class: f.on ? f.class : 'ignore',
    }));
    const onRow = rows.findIndex((f) => f.on && f.kind === 'line');
    const offRow = rows.findIndex((f) => !f.on && f.kind === 'area');
    regions[onRow].class = 'ignore';
    regions[offRow].class = 'area';
    const onIndex = before.features.findIndex((f) => f.id === rows[onRow].id);
    const offIndex = before.features.findIndex((f) => f.id === rows[offRow].id);
    opened.options.onApply({ regions, svg: opened.svg });
    const after = getMapPlan();
    expect(after.features[onIndex].on).toBe(false);
    expect(after.features[onIndex].class).toBe(before.features[onIndex].class);
    expect(after.features[offIndex].on).toBe(true);
    expect(after.features[offIndex].class).toBe('area');
    after.features.forEach((f, i) => {
      expect(f.points ?? f.ring ?? f.at).toEqual(
        before.features[i].points ??
          before.features[i].ring ??
          before.features[i].at
      );
    });
    await vi.waitFor(
      () => expect(files.length).toBeGreaterThan(filesBefore),
      SETTLE
    );
  });

  it('says there is nothing near when no sidewalk lies within reach', async () => {
    const far = trimmed().filter((e) => e.type === 'way' && e.tags.building);
    await pullData(far);
    await vi.waitFor(() =>
      expect(addressStatus()).toBe(
        'No sidewalks within 30 m of the address. Try a scale with more ground, or another address.'
      )
    );
    expect(announceError).toHaveBeenCalledWith(addressStatus(), {
      source: 'tactile-map',
    });
    expect(opened).toBeNull();
  });
});

describe('the steep switch', () => {
  const PLACE = {
    name: 'Central Library, 1000, 4th Avenue, Seattle, Washington, United States',
    lat: 47.6067,
    lon: -122.3327,
    kind: 'library',
  };
  const OVERPASS = JSON.parse(
    readFileSync('tests/fixtures/tactile-map/overpass-20.json', 'utf8')
  );
  const trimmed = () => OVERPASS.elements.map(trimElement).filter(Boolean);
  const M_PER_DEG_LON = 111320 * Math.cos((PLACE.lat * Math.PI) / 180);
  /** A plane rising 10 % to the east. */
  const slope = (lat, lon) => 100 + (lon - PLACE.lon) * M_PER_DEG_LON * 0.1;
  const steepBox = () => document.getElementById('tactileMapSteep');
  const gradeInput = () => document.getElementById('tactileMapGrade');
  const addressStatus = () =>
    document.getElementById('tactileMapAddressStatus').textContent;
  const editor = { open: vi.fn() };

  async function drafted(options = {}) {
    mount({
      type: 'place',
      searchPlaces: vi.fn(async () => [PLACE]),
      pullArea: vi.fn(async () => ({ elements: trimmed(), bytes: 1, ms: 1 })),
      getEditor: async () => editor,
      elevationAt: slope,
      ...options,
    });
    const input = document.getElementById('tactileMapAddress');
    input.value = 'Central Library';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('tactileMapSearch').click();
    await vi.waitFor(() =>
      expect(
        document.querySelectorAll('#tactileMapResults input[type="radio"]')
      ).toHaveLength(1)
    );
    document.querySelector('#tactileMapResults input[type="radio"]').click();
    if (options.steepFirst) {
      steepBox().checked = true;
      steepBox().dispatchEvent(new Event('change', { bubbles: true }));
    }
    document.getElementById('tactileMapMake').click();
    await vi.waitFor(() => expect(getMapPlan().meta.geo).toBeTruthy());
  }

  it('is a choice in What to show, unticked, with the grade at 5 from 3 to 12 by 0.5', async () => {
    mount({ type: 'place' });
    expect(steepBox().disabled).toBe(false);
    expect(steepBox().checked).toBe(false);
    expect(
      document.querySelector('label[for="tactileMapSteep"]').textContent
    ).toBe('Mark steep sidewalks');
    expect(document.getElementById('tactileMapSteepHelp').textContent).toBe(
      "Chevrons along sidewalks steeper than the grade below, pointing uphill. A sidewalk's slope comes from the map data where it gives one, otherwise from public terrain tiles at about 3 m per pixel, which can miss a short steep step."
    );
    expect(
      document.querySelector('label[for="tactileMapGrade"]').textContent
    ).toBe('Steep grade (%)');
    expect([
      gradeInput().min,
      gradeInput().max,
      gradeInput().step,
      gradeInput().value,
    ]).toEqual(['3', '12', '0.5', '5']);
    expect(document.getElementById('tactileMapGradeHelp').textContent).toBe(
      'Sidewalks steeper than this get chevrons, 3 to 12 %. 5 % is a gentle slope; 8 % is near the most a ramp may be; 15 % is a steep hill.'
    );
  });

  it('ticked before the map is made, marks the steep runs as the draft is made', async () => {
    await drafted({ steepFirst: true });
    await vi.waitFor(() =>
      expect(
        getMapPlan().features.filter((f) => f.class === 'steep').length
      ).toBeGreaterThan(0)
    );
    expect(steepBox().checked).toBe(true);
  });

  it('on, reads the heights, marks the steep runs, says so and writes the levels file; off removes them', async () => {
    await drafted();
    const filesBefore = files.length;
    steepBox().checked = true;
    steepBox().dispatchEvent(new Event('change', { bubbles: true }));
    expect(addressStatus()).toMatch(
      /^Reading heights along \d+ sidewalks\.\.\.$/
    );
    await vi.waitFor(() =>
      expect(addressStatus()).toMatch(
        /^\d+ steep segments marked, steeper than 5 %\.$/
      )
    );
    const steep = getMapPlan().features.filter((f) => f.class === 'steep');
    expect(steep.length).toBeGreaterThan(0);
    expect(steep.every((f) => f.style === 'chevrons' && f.on)).toBe(true);
    await vi.waitFor(
      () => expect(files.length).toBeGreaterThan(filesBefore),
      SETTLE
    );
    expect(announce).toHaveBeenCalledWith(addressStatus(), {
      source: 'tactile-map',
    });
    steepBox().checked = false;
    steepBox().dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() =>
      expect(
        getMapPlan().features.filter((f) => f.class === 'steep')
      ).toHaveLength(0)
    );
  });

  it('says no sidewalk is steeper on flat ground, and reads again at a new grade', async () => {
    await drafted({ elevationAt: () => 100 });
    steepBox().checked = true;
    steepBox().dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() =>
      expect(addressStatus()).toBe('No sidewalk is steeper than 5 %.')
    );
    gradeInput().value = '8';
    gradeInput().dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() =>
      expect(addressStatus()).toBe('No sidewalk is steeper than 8 %.')
    );
    gradeInput().value = '20';
    gradeInput().dispatchEvent(new Event('change', { bubbles: true }));
    expect(gradeInput().value).toBe('12');
  });

  it('takes the incline of each sidewalk from the map data and fetches no terrain tile when every one has a number', async () => {
    const fetchTiles = vi.fn(async () => ({ ok: false, status: 403 }));
    const tagged = () =>
      trimmed().map((el) =>
        el.type === 'way' ? { ...el, tags: { ...el.tags, incline: '8%' } } : el
      );
    await drafted({
      elevationAt: null,
      fetchTiles,
      pullArea: vi.fn(async () => ({ elements: tagged(), bytes: 1, ms: 1 })),
    });
    steepBox().checked = true;
    steepBox().dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() =>
      expect(addressStatus()).toMatch(
        /^\d+ steep segments marked, steeper than 5 %\.$/
      )
    );
    expect(fetchTiles).not.toHaveBeenCalled();
    const read = getMapPlan().features.filter(
      (f) =>
        f.kind === 'line' &&
        f.on &&
        (f.class === 'walkway' || f.class === 'crossing')
    );
    expect(
      getMapPlan().features.filter((f) => f.class === 'steep')
    ).toHaveLength(read.length);
  });

  it('says the tiles did not answer and rests the switch when the heights cannot be read', async () => {
    await drafted({
      elevationAt: null,
      fetchTiles: vi.fn(async () => ({ ok: false, status: 403 })),
    });
    steepBox().checked = true;
    steepBox().dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() =>
      expect(addressStatus()).toBe(
        'The height tiles did not answer. Steep sidewalks are not marked this time.'
      )
    );
    expect(steepBox().checked).toBe(false);
    expect(announceError).toHaveBeenCalledWith(addressStatus(), {
      source: 'tactile-map',
    });
  });
});

describe('the Alt View', () => {
  const root = document.documentElement;
  const SENTENCE =
    'The Tactile Map Designer is not available in the Alt View. Its controls return when the Alt View is off.';

  afterEach(() => {
    root.removeAttribute('data-ui-variant');
  });

  it('hides the panel and says so once when the Alt View comes on, and shows it again when it goes off', async () => {
    mount();
    const panel = document.getElementById('tactileMapPanel');
    expect(panel.hidden).toBe(false);
    root.setAttribute('data-ui-variant', 'mono');
    await vi.waitFor(() => expect(panel.hidden).toBe(true));
    expect(announce).toHaveBeenCalledWith(SENTENCE, { source: 'tactile-map' });
    const said = announce.mock.calls.filter((c) => c[0] === SENTENCE).length;
    expect(said).toBe(1);
    root.removeAttribute('data-ui-variant');
    await vi.waitFor(() => expect(panel.hidden).toBe(false));
    expect(announce.mock.calls.filter((c) => c[0] === SENTENCE).length).toBe(1);
  });

  it('mounts hidden when the Alt View is already on, and leaves no observer behind', async () => {
    root.setAttribute('data-ui-variant', 'mono');
    mount();
    const panel = document.getElementById('tactileMapPanel');
    expect(panel.hidden).toBe(true);
    expect(announce).toHaveBeenCalledWith(SENTENCE, { source: 'tactile-map' });
    destroyMapPanel();
    announce.mockClear();
    root.removeAttribute('data-ui-variant');
    root.setAttribute('data-ui-variant', 'mono');
    await new Promise((r) => setTimeout(r, 20));
    expect(announce).not.toHaveBeenCalled();
  });
});

describe('the PDF for the transcriber', () => {
  const mediaBox = (bytes) => {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(s).slice(1).map(Number);
  };

  it('the button downloads the PDF alone, on Letter, and the Paper choice turns it to A4', async () => {
    await vi.waitFor(() => expect(files.length).toBeGreaterThan(0), SETTLE);
    const button = document.getElementById('tactileMapPdf');
    expect(button.textContent).toBe('Download the PDF');
    button.click();
    await vi.waitFor(() => expect(downloads.length).toBe(1), SETTLE);
    expect(downloads[0].name).toBe('tactile_map_print.pdf');
    expect(downloads[0].format).toBe('pdf');
    expect(mediaBox(downloads[0].bytes)).toEqual([792, 612]);
    const paper = document.getElementById('tactileMapPaperSize');
    expect([...paper.options].map((o) => o.textContent)).toEqual([
      'Letter',
      'A4',
    ]);
    paper.value = 'a4';
    paper.dispatchEvent(new Event('change'));
    button.click();
    await vi.waitFor(() => expect(downloads.length).toBe(2), SETTLE);
    expect(mediaBox(downloads[1].bytes)).toEqual([841.89, 595.28]);
    expect(status()).toBe('The PDF is in tactile_map_print.pdf.');
  });
});

describe('the map paper under the plate', () => {
  let pm;
  const toggle = () => document.getElementById('overlayToggle');
  const paperBox = () => document.getElementById('tactileMapPaper');

  beforeEach(() => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<input type="checkbox" id="overlayToggle">'
    );
    pm = {
      setReferenceOverlaySource: vi.fn(async () => {}),
      setOverlayEnabled: vi.fn(),
      setOverlayZ: vi.fn(),
      setOverlayTransform: vi.fn(),
    };
    mount({ getAutoPreviewController: () => ({ previewManager: pm }) });
  });

  it("loads the whole map's paper, in its own colours, 2 mm under the plate, and turns the overlay on", async () => {
    await vi.waitFor(
      () => expect(pm.setReferenceOverlaySource).toHaveBeenCalled(),
      SETTLE
    );
    const call = pm.setReferenceOverlaySource.mock.calls.at(-1)[0];
    expect(call.kind).toBe('svg');
    expect(call.name).toBe('paper_whole.svg');
    expect(call.keepColors).toBe(true);
    expect(call.dataUrlOrText).toMatch(/the waiting area/);
    await vi.waitFor(
      () => expect(pm.setOverlayEnabled).toHaveBeenLastCalledWith(true),
      SETTLE
    );
    expect(pm.setOverlayZ).toHaveBeenLastCalledWith({
      preset: 'model-bottom',
      customMm: -2,
    });
    expect(pm.setOverlayTransform).toHaveBeenLastCalledWith({
      offsetX: 0,
      offsetY: 0,
      rotationDeg: 0,
    });
    expect(toggle().checked).toBe(true);
    expect(paperBox().checked).toBe(true);
  });

  it('follows the plate shown, and the checkbox clears the paper and brings it back', async () => {
    await vi.waitFor(
      () => expect(pm.setOverlayEnabled).toHaveBeenLastCalledWith(true),
      SETTLE
    );
    click('tactileMapPlate-A1');
    await vi.waitFor(
      () =>
        expect(pm.setReferenceOverlaySource.mock.calls.at(-1)[0].name).toBe(
          'paper_A1.svg'
        ),
      SETTLE
    );
    paperBox().click();
    await vi.waitFor(
      () => expect(pm.setOverlayEnabled).toHaveBeenLastCalledWith(false),
      SETTLE
    );
    expect(pm.setReferenceOverlaySource.mock.calls.at(-1)[0]).toEqual({
      kind: null,
      name: null,
      dataUrlOrText: null,
    });
    expect(toggle().checked).toBe(false);
    paperBox().click();
    await vi.waitFor(
      () => expect(pm.setOverlayEnabled).toHaveBeenLastCalledWith(true),
      SETTLE
    );
    expect(pm.setReferenceOverlaySource.mock.calls.at(-1)[0].name).toBe(
      'paper_A1.svg'
    );
  });

  it('clears the paper when the panel goes', async () => {
    await vi.waitFor(
      () => expect(pm.setOverlayEnabled).toHaveBeenLastCalledWith(true),
      SETTLE
    );
    destroyMapPanel();
    expect(pm.setReferenceOverlaySource.mock.calls.at(-1)[0].kind).toBe(null);
    expect(pm.setOverlayEnabled).toHaveBeenLastCalledWith(false);
    expect(toggle().checked).toBe(false);
  });

  it('draws no paper without a preview to put it on', async () => {
    mount();
    await new Promise((r) => setTimeout(r, 450));
    expect(pm.setReferenceOverlaySource).not.toHaveBeenCalled();
  });
});
