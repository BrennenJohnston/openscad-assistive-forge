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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
}));

import {
  initMapPanel,
  destroyMapPanel,
  isMapPanelActive,
} from '../../src/js/tactile-map/map-panel.js';
import { setParameterValue } from '../../src/js/ui-generator.js';
import { announce, announceError } from '../../src/js/announcer.js';
import { stateManager } from '../../src/js/state.js';
import { sampleStationPlan } from '../../src/js/tactile-map/plan.js';
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
const status = () =>
  document.getElementById('tactileMapRenderStatus').textContent;
const params = () => stateManager.getState().parameters || {};
const click = (id) => document.getElementById(id).click();

let files;
let downloads;

function mount(options = {}) {
  destroyMapPanel();
  initMapPanel(CONFIG, {
    plan: sampleStationPlan(),
    setFile: vi.fn((name, fileName, svg) => {
      files.push({ name, fileName, svg });
      return true;
    }),
    render: vi.fn(async () => EMPTY_STL()),
    download: vi.fn((bytes, name, format) => {
      downloads.push({ bytes, name, format });
    }),
    ...options,
  });
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

describe('the map panel', () => {
  it('mounts above the parameter controls with its heading and the bed menu', () => {
    const section = document.getElementById('tactileMapPanel');
    expect(section).toBeTruthy();
    expect(section.nextElementSibling.id).toBe('parametersContainer');
    expect(section.querySelector('h2').textContent).toBe('Tactile map plates');
    const select = document.getElementById('tactileMapBed');
    expect(select.options.length).toBe(9);
    expect(select.options[0].textContent).toBe(
      'Bambu Lab X1C, P1S or P1P (256 x 256 mm)'
    );
    expect(isMapPanelActive()).toBe(true);
  });

  it('says four plates of 240 x 180 for the sample on an X1C, then nine on an A1 mini', async () => {
    await vi.waitFor(
      () => expect(summary()).toBe('4 plates of 240 x 180 mm, A1 to B2.'),
      SETTLE
    );
    const select = document.getElementById('tactileMapBed');
    select.value = 'a1-mini';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(
      () => expect(summary()).toBe('9 plates of 160 x 120 mm, A1 to C3.'),
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

  it('writes plate B2 as a 240 x 180 levels file and its size, then the whole map again', async () => {
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
    expect(last.svg).toMatch(/viewBox="0 0 240 180"/);
    expect(String(params().map_width_mm)).toBe('240');
    expect(String(params().map_height_mm)).toBe('180');
    expect(setParameterValue).toHaveBeenCalledWith('map_width_mm', 240);
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
      () => expect(String(params().map_width_mm)).toBe('480'),
      SETTLE
    );
    expect(String(params().map_height_mm)).toBe('360');
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
    expect(files[files.length - 1].svg).toMatch(/viewBox="0 0 240 190"/);
    expect(files[files.length - 1].svg).toMatch(/<g id="cutouts"><\/g>/);
  });

  it('refuses a bed that cuts the map into plates under 100 x 75 mm, and keeps the whole map', async () => {
    await vi.waitFor(() => expect(files.length).toBeGreaterThan(0), SETTLE);
    const select = document.getElementById('tactileMapBed');
    select.value = 'custom';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const w = document.getElementById('tactileMapBedWidth');
    const d = document.getElementById('tactileMapBedDepth');
    w.value = '110';
    d.value = '110';
    w.dispatchEvent(new Event('change', { bubbles: true }));
    d.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(
      () =>
        expect(summary()).toBe(
          'A 110 x 110 mm bed cuts this map into plates of 96 x 90 mm, under the 100 x 75 mm minimum. Choose a larger bed.'
        ),
      SETTLE
    );
    expect(
      [
        ...document.querySelectorAll('#tactileMapPlates input[type="radio"]'),
      ].map((r) => r.value)
    ).toEqual(['whole']);
    expect(String(params().map_width_mm)).toBe('480');
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
      () => expect(summary()).toBe('4 plates of 240 x 180 mm, A1 to B2.'),
      SETTLE
    );
  });

  it('is removed whole by destroyMapPanel', () => {
    destroyMapPanel();
    expect(document.getElementById('tactileMapPanel')).toBeNull();
    expect(isMapPanelActive()).toBe(false);
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
      'plate_grid.svg',
      'tactile_map_A1.stl',
      'tactile_map_A2.stl',
      'tactile_map_B1.stl',
      'tactile_map_B2.stl',
    ]);
    expect(
      (await zip.file('tactile_map_A1.stl').async('uint8array')).length
    ).toBe(84);
    expect(await zip.file('levels_B2.svg').async('string')).toMatch(
      /viewBox="0 0 240 180"/
    );
    expect(
      JSON.parse(await zip.file('map_plan.json').async('string')).size
    ).toEqual({ w: 480, h: 360 });
    expect(readme).toBe(
      'Station: 4 plates for a Bambu Lab X1C, P1S or P1P (256 x 256 mm) bed, each 240 x 180 mm. ' +
        'Print one of each: A1, A2, B1, B2. ' +
        'Lay them out as the grid reads, row A at the top, column 1 at the left, and glue them edge to edge onto a backing board of 480 x 360 mm. ' +
        'Levels, measured from the underside: base 0.4 mm, then 1.0, 1.8, 2.4 mm. ' +
        'Label channels take 12.7 mm tape. ' +
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
    expect(first.map_width_mm).toBe(240);
    expect(first.map_height_mm).toBe(180);
    expect(first.plate_id).toBe('');
    expect(first.plate_shows_title).toBe('yes');
    expect(first.plate_shows_north).toBe('no');
    expect(calls[1].parameters.plate_shows_north).toBe('yes');
    expect(calls[3].parameters.plate_shows_title).toBe('no');
    expect(first.map_file.data).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(first.title_text).toBe('Station');
    expect(calls[0].options).toEqual({ format: 'stl', timeoutMs: 60000 });
    expect(String(params().map_width_mm)).toBe('480');
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
      () => expect(String(params().map_width_mm)).toBe('240'),
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
    expect(String(params().map_width_mm)).toBe('240');
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
    await vi.waitFor(
      () => expect(summary()).toBe('2 plates of 151 x 202 mm, A1 to A2.'),
      SETTLE
    );
    await vi.waitFor(
      () => expect(files.length).toBeGreaterThan(before),
      SETTLE
    );
    const last = files[files.length - 1];
    expect(last.fileName).toBe('levels_whole.svg');
    expect(last.svg).toMatch(/viewBox="0 0 302 202"/);
    expect(last.svg).toMatch(/<g id="level3">\s*<path/);
    expect(String(params().map_width_mm)).toBe('302');
    expect(String(params().map_height_mm)).toBe('202');
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
      () => expect(summary()).toBe('2 plates of 151 x 202 mm, A1 to A2.'),
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
      () => expect(summary()).toBe('2 plates of 151 x 202 mm, A1 to A2.'),
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
          'One plate of 152 x 102 mm; the whole map fits.'
        ),
      SETTLE
    );
    expect(String(params().map_width_mm)).toBe('152');
  });
});
