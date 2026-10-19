/**
 * When the engine itself may be at fault: which codes count, the error
 * dialog's offer (one more paragraph and its buttons), and the offer's
 * ladder: the newest official engine first; when an official engine failed
 * too, the other official snapshots or the Forge engine again. "Not now" is
 * remembered until the next file.
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/js/feature-flags.js', () => ({
  isEnabled: vi.fn(() => false),
}));

import { isEngineFault, showErrorModal } from '../../src/js/error-translator.js';
import {
  offerEngineAfterFault,
  resetEngineOffer,
} from '../../src/js/engine-choice.js';

const files = (js, wasm) => ({
  'openscad.js': { sha256: 'a'.repeat(64), size: js },
  'openscad.wasm': { sha256: 'b'.repeat(64), size: wasm },
});
const MANIFEST = {
  version: 1,
  engines: [
    { id: 'forge', name: 'Forge build of OpenSCAD 2026.04.03', builtIn: true, path: '/wasm/openscad-official' },
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
const NEWEST = 'official-2026-10-18';

function stubHandlers({ kept = [], chosen = 'forge', manifest = MANIFEST } = {}) {
  const state = { kept: new Set(['forge', ...kept]), chosen };
  return {
    state,
    manifest: async () => manifest,
    chosenId: () => state.chosen,
    isDownloaded: async (id) => state.kept.has(id),
    download: vi.fn(async (id, onProgress) => {
      for (const p of [0, 50, 100]) onProgress(p);
      state.kept.add(id);
    }),
    status: vi.fn(),
    showError: vi.fn(),
  };
}

beforeEach(() => {
  resetEngineOffer();
  document.body.innerHTML = '';
});

describe('which failures may be the engine', () => {
  it.each([
    'CGAL_ASSERTION',
    'WASM_ABORT',
    'WASM_UNREACHABLE',
    'WASM_OOB',
    'INTERNAL_ERROR',
    'ENGINE_OUT_OF_ROOM',
    'WASM_DOUBLE_INVOKE',
    'ENGINE_RESTART_FAILED',
    'INIT_FAILED',
    'ENGINE_COPY_MISMATCH',
  ])('%s is', (code) => {
    expect(isEngineFault(code)).toBe(true);
  });

  it.each([
    'RECURSION',
    'TIMEOUT',
    'RENDER_TIMEOUT',
    'OUT_OF_MEMORY',
    'SYNTAX_ERROR',
    'NO_GEOMETRY',
    'MODEL_NOT_2D',
    'MODEL_IS_2D',
    'FILE_NOT_FOUND',
    'UNKNOWN_MODULE',
    'RENDER_FAILED',
    undefined,
  ])('%s is not', (code) => {
    expect(isEngineFault(code)).toBe(false);
  });
});

describe('the error dialog with an offer', () => {
  it('adds the paragraph, draws the actions in place of OK, and an action closes the dialog first', async () => {
    const order = [];
    const closed = showErrorModal({
      title: 'Engine Initialization Failed',
      message: 'The engine did not start.',
      extra: 'This may be a fault in the rendering engine.',
      actions: [
        { label: 'Download and try it', primary: true, onClick: () => order.push('try') },
        { label: 'Not now', focus: true, onClick: () => order.push('not now') },
      ],
    });
    const dialog = document.querySelector('[data-testid="friendly-error-modal"]');
    const body = dialog.querySelector('.friendly-error-modal-body');
    expect(body.textContent).toContain('This may be a fault in the rendering engine.');
    const buttons = [...dialog.querySelectorAll('.friendly-error-modal-footer button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Download and try it', 'Not now']);
    expect(buttons[0].className).toBe('btn btn-primary');
    expect(buttons[1].className).toBe('btn btn-secondary');
    expect(document.activeElement).toBe(buttons[1]);
    buttons[0].click();
    await closed;
    expect(document.querySelector('[data-testid="friendly-error-modal"]')).toBeNull();
    expect(order).toEqual(['try']);
  });

  it('stacks more than two actions one per line, and leaves two side by side', () => {
    const footer = () => document.querySelector('.friendly-error-modal-footer');
    const action = (label) => ({ label, onClick: () => {} });
    showErrorModal({ title: 'T', message: 'M', actions: ['a', 'b'].map(action) });
    expect(footer().classList.contains('friendly-error-modal-footer--stacked')).toBe(false);
    document.body.innerHTML = '';
    showErrorModal({ title: 'T', message: 'M', actions: ['a', 'b', 'c'].map(action) });
    expect(footer().classList.contains('friendly-error-modal-footer--stacked')).toBe(true);
  });

  it('without actions keeps its one OK button', () => {
    showErrorModal({ title: 'T', message: 'M' });
    const buttons = [...document.querySelectorAll('.friendly-error-modal-footer button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['OK']);
  });
});

describe('the offer after a fault', () => {
  it('offers nothing for a failure that is not the engine', async () => {
    const handlers = stubHandlers();
    for (const code of ['RECURSION', 'TIMEOUT', 'SYNTAX_ERROR']) {
      expect(await offerEngineAfterFault({ code, handlers, run: vi.fn() })).toBeNull();
    }
  });

  it('with the Forge engine: the newest official engine, its sizes, Download and try it, Not now', async () => {
    const handlers = stubHandlers();
    const run = vi.fn(async () => {});
    const offer = await offerEngineAfterFault({ code: 'CGAL_ASSERTION', handlers, run });
    expect(offer.extra).toBe(
      'This may be a fault in the rendering engine rather than in the model. You can try the official OpenSCAD engine (snapshot 2026.10.18, about 3.4 MB to download, 11.1 MB kept in this browser).'
    );
    expect(offer.actions.map((a) => a.label)).toEqual(['Download and try it', 'Not now']);
    expect(offer.actions[0].primary).toBe(true);
    expect(offer.actions[1].focus).toBe(true);

    await offer.actions[0].onClick();
    expect(handlers.download).toHaveBeenCalledWith(NEWEST, expect.any(Function));
    expect(handlers.status).toHaveBeenCalledWith(
      'Trying the model again with the OpenSCAD snapshot 2026.10.18 engine.',
      { announce: true }
    );
    expect(run).toHaveBeenCalledWith(NEWEST);
  });

  it('with the newest engine already kept: Try it, and no download', async () => {
    const handlers = stubHandlers({ kept: [NEWEST] });
    const run = vi.fn(async () => {});
    const offer = await offerEngineAfterFault({ code: 'WASM_ABORT', handlers, run });
    expect(offer.extra).toBe(
      'This may be a fault in the rendering engine rather than in the model. You can try the official OpenSCAD engine (snapshot 2026.10.18, already kept in this browser).'
    );
    expect(offer.actions.map((a) => a.label)).toEqual(['Try it', 'Not now']);
    await offer.actions[0].onClick();
    expect(handlers.download).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith(NEWEST);
  });

  it('Not now is remembered until the next file', async () => {
    const handlers = stubHandlers();
    const offer = await offerEngineAfterFault({ code: 'INIT_FAILED', handlers, run: vi.fn() });
    offer.actions[1].onClick();
    expect(await offerEngineAfterFault({ code: 'INIT_FAILED', handlers, run: vi.fn() })).toBeNull();
    resetEngineOffer();
    expect(await offerEngineAfterFault({ code: 'INIT_FAILED', handlers, run: vi.fn() })).not.toBeNull();
  });

  it('when an official engine failed too: the other three, Back to the Forge engine, Keep the official engine', async () => {
    const handlers = stubHandlers({ kept: [NEWEST, 'official-2026-01-03'], chosen: NEWEST });
    const run = vi.fn(async () => {});
    const offer = await offerEngineAfterFault({ code: 'ENGINE_COPY_MISMATCH', handlers, run });
    expect(offer.extra).toBe(
      'The official engine failed on this model too. The other three official snapshots are here to try, or you can go back to the Forge engine.'
    );
    expect(offer.actions.map((a) => a.label)).toEqual([
      'OpenSCAD snapshot 2026.04.03 (official), 3.3 MB',
      'OpenSCAD snapshot 2026.01.03 (official), kept',
      'OpenSCAD snapshot 2025.03.25 (official), 2.9 MB',
      'Back to the Forge engine',
      'Keep the official engine',
    ]);
    expect(offer.actions[4].focus).toBe(true);
    await offer.actions[3].onClick();
    expect(run).toHaveBeenCalledWith('forge');
    await offer.actions[1].onClick();
    expect(handlers.download).not.toHaveBeenCalled();
    expect(run).toHaveBeenLastCalledWith('official-2026-01-03');
  });

  it('a failed download says so and runs nothing', async () => {
    const handlers = stubHandlers();
    handlers.download.mockRejectedValue(new Error('openscad.wasm: HTTP 503'));
    const run = vi.fn();
    const offer = await offerEngineAfterFault({ code: 'CGAL_ASSERTION', handlers, run });
    await offer.actions[0].onClick();
    expect(handlers.showError).toHaveBeenCalledWith({
      title: 'Engine download failed',
      message: 'Nothing was kept. Check your connection and try again.',
      technical: 'openscad.wasm: HTTP 503',
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('offers nothing when the manifest names no official engine', async () => {
    const handlers = stubHandlers({ manifest: { version: 1, engines: [MANIFEST.engines[0]] } });
    expect(await offerEngineAfterFault({ code: 'CGAL_ASSERTION', handlers, run: vi.fn() })).toBeNull();
  });
});
