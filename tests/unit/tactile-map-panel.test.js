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

const CONFIG = {
  mapFileParam: 'map_file',
  widthParam: 'map_width_mm',
  heightParam: 'map_height_mm',
  plateIdParam: 'plate_id',
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
  it('renders the four plates in order into one archive of ten entries', async () => {
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
        'Label channels take 12.7 mm tape.\n'
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
