/**
 * The Preferences dialog's Controller tab: one live tab in place of the old
 * Axes and Buttons tabs, the status sentence, the layout and preset pickers,
 * and the list of actions, each with its button and a Change button that
 * waits for one press and assigns it.
 *
 * @license GPL-3.0-or-later
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  formatGamepadStatus,
  initPreferencesDialog,
  openPreferencesDialog,
  _resetPreferencesDialogForTests,
} from '../../src/js/preferences-dialog.js';
import { createGamepadMapping } from '../../src/js/gamepad-controller.js';

const INDEX = readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
const XBOX = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)';

describe('formatGamepadStatus', () => {
  it('reports an unsupported browser, including when no status exists', () => {
    const unsupported = 'This browser does not offer game controller input.';
    expect(formatGamepadStatus(undefined)).toBe(unsupported);
    expect(formatGamepadStatus(null)).toBe(unsupported);
    expect(formatGamepadStatus({ supported: false, padName: null })).toBe(
      unsupported
    );
  });

  it('invites connecting when the API exists but no pad is seen', () => {
    expect(formatGamepadStatus({ supported: true, padName: null })).toBe(
      'No controller detected. Connect one and press any button.'
    );
  });

  it('names the detected pad, and nothing about a dead zone', () => {
    expect(
      formatGamepadStatus({
        supported: true,
        padName: 'Xbox Wireless Controller',
        deadZone: 0.15,
      })
    ).toBe('Controller detected: Xbox Wireless Controller.');
  });
});

describe('the Controller tab', () => {
  let mapping;
  let capture;
  let pending;
  let announce;
  let cancelCapture;
  let originalRects;

  function mount() {
    const doc = new DOMParser().parseFromString(INDEX, 'text/html');
    document.body.innerHTML = '';
    document.body.append(
      document.importNode(doc.getElementById('preferencesModal'), true)
    );
  }

  beforeEach(() => {
    localStorage.clear();
    mount();
    _resetPreferencesDialogForTests();
    // jsdom lays nothing out: every element counts as having a box here.
    originalRects = Element.prototype.getClientRects;
    Element.prototype.getClientRects = function () {
      return [{ width: 10, height: 10 }];
    };
    mapping = createGamepadMapping({ getPadId: () => XBOX });
    pending = null;
    capture = vi.fn(
      () =>
        new Promise((resolve) => {
          pending = resolve;
        })
    );
    cancelCapture = vi.fn(() => pending?.(null));
    announce = vi.fn();
    initPreferencesDialog({
      getGamepadStatus: () => ({
        supported: true,
        padName: 'Xbox Wireless Controller',
      }),
      gamepad: { mapping, capture, cancelCapture, announce },
    });
    openPreferencesDialog({ tab: 'controller' });
  });

  afterEach(() => {
    Element.prototype.getClientRects = originalRects;
    document.body.innerHTML = '';
    document.body.style.overflow = '';
  });

  const row = (action) =>
    document.querySelector(
      `#prefsGamepadAssignments tr[data-action="${action}"]`
    );
  const buttonOf = (action) =>
    row(action).querySelector('.gamepad-input').textContent.trim();
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('is one enabled tab where Axes and Buttons were', () => {
    const labels = [
      ...document.querySelectorAll('#preferencesTablist [role="tab"]'),
    ].map((t) => t.textContent.trim());
    expect(labels).toEqual([
      '3D View',
      'Editor',
      '3D Print',
      'Advanced',
      'Controller',
      'Keyboard',
    ]);
    const tab = document.getElementById('prefs-tab-controller');
    expect(tab.hasAttribute('aria-disabled')).toBe(false);
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('prefs-panel-controller').hidden).toBe(
      false
    );
  });

  it('shows the status, the layout, the preset, and every action with its button', () => {
    expect(document.getElementById('prefsGamepadStatus').textContent).toBe(
      'Controller detected: Xbox Wireless Controller.'
    );
    expect(document.getElementById('prefsGamepadFamily').value).toBe('xbox');
    expect(document.getElementById('prefsGamepadPreset').value).toBe('menus');
    const rows = document.querySelectorAll('#prefsGamepadAssignments tbody tr');
    expect(rows).toHaveLength(16);
    expect(row('previous').querySelector('th').textContent.trim()).toBe(
      'Previous control'
    );
    expect(buttonOf('previous')).toBe('LB');
    expect(buttonOf('resetView')).toBe('Not assigned');
    const change = row('activate').querySelector('button');
    expect(change.textContent.trim()).toBe('Change');
    // Its name says which action it changes.
    const name = change
      .getAttribute('aria-labelledby')
      .split(' ')
      .map((id) => document.getElementById(id).textContent.trim())
      .join(' ');
    expect(name).toBe('Change Activate');
    const diagramLabel = document.querySelector(
      '#prefsGamepadDiagram [data-part="lb"]'
    );
    expect(diagramLabel.textContent).toBe('LB');
    expect(
      document.getElementById('prefsGamepadDiagram').getAttribute('aria-hidden')
    ).toBe('true');
  });

  it('Change waits for one press, assigns it, and says what changed', async () => {
    row('activate').querySelector('button').click();
    expect(capture).toHaveBeenCalledWith(5000);
    expect(buttonOf('activate')).toBe(
      'Press a button on your controller. Esc cancels.'
    );
    pending('x');
    await flush();
    expect(buttonOf('activate')).toBe('X');
    expect(buttonOf('zoomOut')).toBe('A');
    expect(announce).toHaveBeenLastCalledWith('Activate: X. Zoom out: A.');
    expect(mapping.get().assignments.activate).toBe('x');
  });

  it('Escape cancels the wait, changes nothing and keeps the dialog open', async () => {
    const change = row('activate').querySelector('button');
    change.focus();
    change.click();
    change.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      })
    );
    await flush();
    expect(cancelCapture).toHaveBeenCalledTimes(1);
    expect(buttonOf('activate')).toBe('A');
    expect(announce).toHaveBeenLastCalledWith('Nothing changed.');
    expect(
      document.getElementById('preferencesModal').classList.contains('hidden')
    ).toBe(false);
    expect(mapping.get().assignments.activate).toBe('a');
  });

  it('the pickers relabel and reassign; Reset to preset restores', async () => {
    const family = document.getElementById('prefsGamepadFamily');
    family.value = 'playstation';
    family.dispatchEvent(new Event('change', { bubbles: true }));
    expect(buttonOf('activate')).toBe('Cross');
    expect(
      document.querySelector('#prefsGamepadDiagram [data-part="lb"]')
        .textContent
    ).toBe('L1');

    const preset = document.getElementById('prefsGamepadPreset');
    preset.value = 'camera';
    preset.dispatchEvent(new Event('change', { bubbles: true }));
    expect(buttonOf('zoomIn')).toBe('R2');
    expect(buttonOf('resetView')).toBe('Square');

    row('back').querySelector('button').click();
    pending('r3');
    await flush();
    expect(buttonOf('back')).toBe('R3');
    document.getElementById('prefsGamepadReset').click();
    expect(buttonOf('back')).toBe('Circle');
  });
});
