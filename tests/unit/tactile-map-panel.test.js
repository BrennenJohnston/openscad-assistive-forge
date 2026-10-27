/**
 * The Tactile Map Designer panel: the bed, the plates and the plate picker
 * above the tile's controls, writing the levels file and the plate's size
 * into the parameters.
 *
 * The UI generator and the announcer are mocked; parameter writes land in
 * the real stateManager so the panel's read-back paths run.
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
  isMapPanelActive,
} from '../../src/js/tactile-map/map-panel.js';
import { setParameterValue } from '../../src/js/ui-generator.js';
import { announce } from '../../src/js/announcer.js';
import { stateManager } from '../../src/js/state.js';
import { sampleStationPlan } from '../../src/js/tactile-map/plan.js';

const CONFIG = {
  mapFileParam: 'map_file',
  widthParam: 'map_width_mm',
  heightParam: 'map_height_mm',
  plateIdParam: 'plate_id',
};

const SETTLE = { timeout: 4000, interval: 25 };
const summary = () => document.getElementById('tactileMapSummary').textContent;
const params = () => stateManager.getState().parameters || {};

let files;

beforeEach(() => {
  document.body.innerHTML =
    '<div id="app"><div id="parametersContainer"></div></div>';
  stateManager.setState({ parameters: { label_tape_width_mm: '12.7' } });
  files = [];
  vi.clearAllMocks();
  initMapPanel(CONFIG, {
    plan: sampleStationPlan(),
    setFile: vi.fn((name, fileName, svg) => {
      files.push({ name, fileName, svg });
      return true;
    }),
  });
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
