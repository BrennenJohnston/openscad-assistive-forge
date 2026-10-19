/**
 * Preferences ▸ Advanced ▸ Engine: one row per engine in the manifest, its
 * state and its button; an engine that is not kept cannot be chosen until it
 * is downloaded, and Download asks first; choosing a kept engine switches;
 * Remove forgets an engine and gives the Forge engine back when it was in
 * use; a failed download changes nothing and says why.
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  initPreferencesDialog,
  renderEngineGroup,
  _resetPreferencesDialogForTests,
} from '../../src/js/preferences-dialog.js';

const files = (js, wasm) => ({
  'openscad.js': { sha256: 'a'.repeat(64), size: js },
  'openscad.wasm': { sha256: 'b'.repeat(64), size: wasm },
});
const MANIFEST = {
  version: 1,
  engines: [
    {
      id: 'forge',
      name: 'Forge build of OpenSCAD 2026.04.03',
      builtIn: true,
      path: '/wasm/openscad-official',
    },
    ...[
      ['2026-10-18', '2026.10.18', 3353874, 99853, 11000299],
      ['2026-04-03', '2026.04.03', 3284651, 100183, 10712276],
      ['2026-01-03', '2026.01.03', 3222966, 99718, 10531804],
      ['2025-03-25', '2025.03.25', 2947329, 124567, 9603115],
    ].map(([id, date, zip, js, wasm]) => ({
      id: `official-${id}`,
      name: `OpenSCAD snapshot ${date}`,
      date,
      path: `/wasm/engines/official-${id}`,
      zip: { url: 'https://files.openscad.org/snapshots/x.zip', sha256: 'c'.repeat(64), size: zip },
      files: files(js, wasm),
    })),
  ],
};
const NEW = 'official-2026-10-18';

function stubEngine({ kept = [], chosen = 'forge' } = {}) {
  const state = { kept: new Set(['forge', ...kept]), chosen };
  return {
    state,
    manifest: async () => MANIFEST,
    chosenId: () => state.chosen,
    isDownloaded: async (id) => state.kept.has(id),
    download: vi.fn(async (id, onProgress) => {
      for (const p of [0, 12, 50, 77, 100]) onProgress(p);
      state.kept.add(id);
    }),
    remove: vi.fn(async (id) => {
      state.kept.delete(id);
      if (state.chosen !== id) return false;
      state.chosen = 'forge';
      return true;
    }),
    switchTo: vi.fn(async (id) => {
      state.chosen = id;
    }),
    status: vi.fn(),
    announce: vi.fn(),
    confirm: vi.fn(async () => true),
    showError: vi.fn(),
  };
}

const rowOf = (id) => document.getElementById(`engine-${id}`).closest('.engine-row');
const buttonOf = (id) => rowOf(id).querySelector('button');
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function setUp(engine) {
  document.body.innerHTML = `
    <div id="preferencesModal" class="modal hidden" role="dialog" aria-modal="true">
      <fieldset id="engineGroup" class="preferences-fieldset">
        <legend class="preferences-legend">Engine</legend>
        <div id="engineRows"></div>
        <p id="engineCurrent" class="preferences-field-note"></p>
      </fieldset>
    </div>`;
  _resetPreferencesDialogForTests();
  initPreferencesDialog({ engine });
  await renderEngineGroup();
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('the Engine group', () => {
  it('writes one row per engine: its name, its state and its button', async () => {
    const engine = stubEngine({ kept: ['official-2026-01-03'] });
    await setUp(engine);
    const rows = [...document.querySelectorAll('#engineRows .engine-row')];
    expect(rows).toHaveLength(5);
    const label = (id) => document.querySelector(`label[for="engine-${id}"]`).textContent;
    expect(label('forge')).toBe('Forge build of OpenSCAD 2026.04.03 (default, built in)');
    expect(label(NEW)).toBe('OpenSCAD snapshot 2026.10.18 (official)');
    expect(document.getElementById('engine-forge').checked).toBe(true);
    expect(rowOf('forge').querySelector('button')).toBeNull();

    expect(document.getElementById(`engine-${NEW}`).disabled).toBe(true);
    expect(document.getElementById(`engineState-${NEW}`).textContent).toBe('Not downloaded (3.4 MB)');
    expect(buttonOf(NEW).textContent).toBe('Download');
    expect(buttonOf(NEW).getAttribute('aria-label')).toBe(
      'Download the OpenSCAD snapshot 2026.10.18 engine'
    );

    expect(document.getElementById('engine-official-2026-01-03').disabled).toBe(false);
    expect(document.getElementById('engineState-official-2026-01-03').textContent).toBe(
      'Kept in this browser (10.6 MB)'
    );
    expect(buttonOf('official-2026-01-03').textContent).toBe('Remove');
    expect(document.getElementById(`engine-${NEW}`).getAttribute('aria-describedby')).toBe(
      `engineState-${NEW}`
    );
    expect(document.getElementById('engineCurrent').textContent).toBe(
      'Engine: Forge build of OpenSCAD 2026.04.03 (default, built in)'
    );
  });

  it('Download asks first, and Not now downloads nothing', async () => {
    const engine = stubEngine();
    engine.confirm.mockResolvedValue(false);
    await setUp(engine);
    buttonOf(NEW).click();
    await settle();
    expect(engine.confirm).toHaveBeenCalledWith(
      'Download the OpenSCAD snapshot 2026.10.18 engine? It is about 3.4 MB to download and takes 11.1 MB in this browser until you remove it or clear the cache.',
      'Download an official engine',
      'Download',
      'Not now'
    );
    expect(engine.download).not.toHaveBeenCalled();
    expect(buttonOf(NEW).textContent).toBe('Download');
  });

  it('a confirmed download shows its progress, speaks it at 0, 50 and 100 percent, and keeps the choice', async () => {
    const engine = stubEngine();
    await setUp(engine);
    buttonOf(NEW).click();
    await vi.waitFor(() => expect(buttonOf(NEW).textContent).toBe('Remove'));
    const said = engine.status.mock.calls.filter(([, o]) => o?.announce).map(([t]) => t);
    expect(said).toEqual([
      'Downloading the OpenSCAD snapshot 2026.10.18 engine: 0%',
      'Downloading the OpenSCAD snapshot 2026.10.18 engine: 50%',
    ]);
    expect(engine.status.mock.calls.map(([t]) => t)).toContain(
      'Downloading the OpenSCAD snapshot 2026.10.18 engine: 77%'
    );
    expect(engine.announce).toHaveBeenCalledWith(
      'Engine ready: OpenSCAD snapshot 2026.10.18 (official).'
    );
    expect(engine.switchTo).not.toHaveBeenCalled();
    expect(document.getElementById(`engine-${NEW}`).disabled).toBe(false);
    expect(document.activeElement.id).toBe(`engine-${NEW}`);
  });

  it('choosing a kept engine switches to it and says so once', async () => {
    const engine = stubEngine({ kept: [NEW] });
    await setUp(engine);
    const radio = document.getElementById(`engine-${NEW}`);
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(engine.switchTo).toHaveBeenCalledWith(NEW));
    await vi.waitFor(() =>
      expect(engine.announce).toHaveBeenCalledWith(
        'Engine: OpenSCAD snapshot 2026.10.18 (official)'
      )
    );
    expect(engine.announce).toHaveBeenCalledTimes(1);
    expect(document.getElementById('engineCurrent').textContent).toBe(
      'Engine: OpenSCAD snapshot 2026.10.18 (official)'
    );
  });

  it('Remove forgets the engine in use and gives the Forge engine back, in one sentence', async () => {
    const engine = stubEngine({ kept: [NEW], chosen: NEW });
    await setUp(engine);
    buttonOf(NEW).click();
    await vi.waitFor(() => expect(buttonOf(NEW).textContent).toBe('Download'));
    expect(engine.remove).toHaveBeenCalledWith(NEW);
    expect(engine.switchTo).toHaveBeenCalledWith('forge');
    expect(engine.announce).toHaveBeenCalledTimes(1);
    expect(engine.announce).toHaveBeenCalledWith(
      'Removed the OpenSCAD snapshot 2026.10.18 engine. Engine: Forge build of OpenSCAD 2026.04.03 (default, built in)'
    );
    expect(document.getElementById('engine-forge').checked).toBe(true);
    expect(document.activeElement).toBe(buttonOf(NEW));
  });

  it('a failed download keeps nothing, leaves the row as it was and says why', async () => {
    const engine = stubEngine();
    engine.download.mockRejectedValue(new Error('openscad.wasm: HTTP 503'));
    await setUp(engine);
    buttonOf(NEW).click();
    await vi.waitFor(() => expect(engine.showError).toHaveBeenCalled());
    expect(engine.showError).toHaveBeenCalledWith({
      title: 'Engine download failed',
      message: 'Nothing was kept. Check your connection and try again.',
      technical: 'openscad.wasm: HTTP 503',
    });
    expect(buttonOf(NEW).textContent).toBe('Download');
    expect(document.getElementById(`engine-${NEW}`).disabled).toBe(true);
  });
});
