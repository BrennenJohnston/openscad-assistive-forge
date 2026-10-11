/**
 * A grayed-out menu item is reached by the arrow keys, as the menu pattern
 * asks, so a keyboard or screen reader user learns it exists and why it is
 * off; Enter on it does nothing and the menu stays open.
 *
 * @license GPL-3.0-or-later
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getToolbarMenuController,
  resetToolbarMenuController,
} from '../../src/js/toolbar-menu-controller.js';

const INDEX = readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

function mountRealMenuMarkup() {
  const doc = new DOMParser().parseFromString(INDEX, 'text/html');
  document.body.innerHTML = '';
  document.body.append(
    document.importNode(doc.getElementById('toolbarMenuBar'), true)
  );
  for (const modal of doc.querySelectorAll('.toolbar-menu-modal')) {
    document.body.append(document.importNode(modal, true));
  }
}

const press = (key) =>
  document.activeElement.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  );

const focusedLabel = () =>
  document.activeElement?.querySelector('.menu-item-label')?.textContent;

describe('a grayed-out menu item', () => {
  let controller;
  let runs;

  beforeEach(() => {
    resetToolbarMenuController();
    mountRealMenuMarkup();
    controller = getToolbarMenuController();
    controller.init();
    runs = { Documentation: 0, 'Offline Documentation': 0, 'Cheat Sheet': 0 };
    controller.registerMenuBuilder('help', () => [
      {
        type: 'action',
        label: 'Documentation',
        handler: () => (runs.Documentation += 1),
      },
      {
        type: 'action',
        label: 'Offline Documentation',
        disabled: true,
        tooltip: 'Not available offline',
      },
      {
        type: 'action',
        label: 'Cheat Sheet',
        handler: () => (runs['Cheat Sheet'] += 1),
      },
    ]);
  });

  it('is reached by the arrow keys', () => {
    controller.openMenu('help');
    expect(focusedLabel()).toBe('Documentation');
    press('ArrowDown');
    expect(focusedLabel()).toBe('Offline Documentation');
    expect(document.activeElement.getAttribute('aria-disabled')).toBe('true');
    press('ArrowDown');
    expect(focusedLabel()).toBe('Cheat Sheet');
  });

  it('does nothing on Enter, and the menu stays open with focus on it', () => {
    controller.openMenu('help');
    press('ArrowDown');
    press('Enter');
    expect(runs['Offline Documentation']).toBe(0);
    expect(focusedLabel()).toBe('Offline Documentation');
    expect(controller._openMenuId).toBe('help');
  });
});
