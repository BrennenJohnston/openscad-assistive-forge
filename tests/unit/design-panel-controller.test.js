/**
 * Design > Display Parameters and Check Validity: each opens a real dialog,
 * says what it found, and leaves nothing behind when it closes.
 *
 * @license GPL-3.0-or-later
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/js/announcer.js', () => ({ announceImmediate: vi.fn() }));
vi.mock('../../src/js/console-panel.js', () => {
  const panel = { addSystemLine: vi.fn() };
  return { getConsolePanel: () => panel };
});

import { announceImmediate } from '../../src/js/announcer.js';
import { getConsolePanel } from '../../src/js/console-panel.js';
import { DesignPanelController } from '../../src/js/design-panel-controller.js';

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const dialogs = () => document.querySelectorAll('[role="dialog"]');
const titleOf = (dialog) =>
  document.getElementById(dialog.getAttribute('aria-labelledby'))?.textContent;
const buttonNamed = (dialog, text) =>
  [...dialog.querySelectorAll('button')].find(
    (b) => b.textContent.trim() === text
  );

/** A tetrahedron as an unindexed mesh: 4 triangles, 12 positions, 4 corners. */
function tetrahedronMesh() {
  const a = [0, 0, 0];
  const b = [1, 0, 0];
  const c = [0, 1, 0];
  const d = [0, 0, 1];
  const array = new Float32Array([
    ...a, ...b, ...c,
    ...a, ...b, ...d,
    ...a, ...c, ...d,
    ...b, ...c, ...d,
  ]);
  return {
    geometry: {
      attributes: { position: { array, itemSize: 3, count: 12 } },
      index: null,
    },
  };
}

let opener;

beforeEach(() => {
  document.body.innerHTML = '';
  opener = document.createElement('button');
  opener.textContent = 'Opener';
  document.body.append(opener);
  opener.focus();
  vi.mocked(announceImmediate).mockClear();
  vi.mocked(getConsolePanel().addSystemLine).mockClear();
});

afterEach(async () => {
  for (const dialog of dialogs()) {
    dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
  }
  // A closed dialog tries focus again 50 ms later (modal-manager.js). Let that
  // retry run here, so it never fires after the file ends and its page is gone.
  await new Promise((resolve) => setTimeout(resolve, 100));
});

function schemaController(parameters) {
  return new DesignPanelController({
    getScadContent: () => 'width = 50;',
    extractParameters: () => ({ parameters, groups: [] }),
  });
}

describe('Display Parameters', () => {
  it('opens one dialog titled Parameter Schema, with focus inside it', async () => {
    schemaController({ width: {}, height: {} }).showAST();
    await nextFrame();

    expect(dialogs()).toHaveLength(1);
    const dialog = dialogs()[0];
    expect(titleOf(dialog)).toBe('Parameter Schema');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('counts the parameters the file declares', () => {
    schemaController({ width: {}, height: {} }).showAST();
    expect(announceImmediate).toHaveBeenCalledWith(
      'Parameter schema shown: 2 parameters'
    );
  });

  it('says one parameter, not one parameters', () => {
    schemaController({ width: {} }).showAST();
    expect(announceImmediate).toHaveBeenCalledWith(
      'Parameter schema shown: 1 parameter'
    );
  });

  it('leaves nothing behind when closed, and focus goes back', async () => {
    schemaController({ width: {} }).showAST();
    await nextFrame();

    buttonNamed(dialogs()[0], 'Close').click();

    expect(dialogs()).toHaveLength(0);
    expect(document.activeElement).toBe(opener);
  });

  it('keeps one dialog however often it is asked for', () => {
    const controller = schemaController({ width: {} });
    controller.showAST();
    controller.showAST();
    expect(dialogs()).toHaveLength(1);
  });
});

describe('Check Validity', () => {
  function validityController() {
    return new DesignPanelController({
      getPreviewManager: () => ({ mesh: tetrahedronMesh() }),
    });
  }

  it('shows its result in a dialog, counting each corner once', async () => {
    validityController().checkValidity();
    await nextFrame();

    expect(dialogs()).toHaveLength(1);
    const dialog = dialogs()[0];
    expect(titleOf(dialog)).toBe('Check Validity');
    expect(dialog.textContent).toContain(
      'Valid mesh: 4 triangles, 4 unique vertices'
    );
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('writes the same result to the console', () => {
    validityController().checkValidity();
    expect(getConsolePanel().addSystemLine).toHaveBeenCalledWith(
      'Valid mesh: 4 triangles, 4 unique vertices'
    );
  });
});
