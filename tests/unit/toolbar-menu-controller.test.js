/**
 * The toolbar menus, driven by keyboard after many openings.
 *
 * A menu is rebuilt every time it opens, so anything the rebuild wires up is
 * wired again on every opening. These cases open the same menu several times
 * before pressing a key, which is how a person uses it.
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

/** The menu bar and the six menu popups, as index.html ships them. */
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

const LABELS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];

function setUp() {
  resetToolbarMenuController();
  mountRealMenuMarkup();
  const controller = getToolbarMenuController();
  controller.init();
  const runs = Object.fromEntries(LABELS.map((label) => [label, 0]));
  const focusAtRun = {};
  controller.registerMenuBuilder('file', () =>
    LABELS.map((label) => ({
      type: 'action',
      label,
      handler: () => {
        runs[label] += 1;
        focusAtRun[label] = document.activeElement;
      },
    }))
  );
  return { controller, runs, focusAtRun };
}

const press = (key) =>
  document.activeElement.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  );

const focusedLabel = () =>
  document.activeElement?.querySelector('.menu-item-label')?.textContent;

describe('toolbar menus after several openings', () => {
  let ctx;
  beforeEach(() => {
    ctx = setUp();
  });

  it('moves one item for one ArrowDown, however often the menu has opened', () => {
    for (let i = 0; i < 5; i += 1) {
      ctx.controller.openMenu('file');
      ctx.controller.closeAllMenus();
    }
    ctx.controller.openMenu('file');
    expect(focusedLabel()).toBe('One');
    press('ArrowDown');
    expect(focusedLabel()).toBe('Two');
  });

  it('runs an item once for one Enter, however often the menu has opened', () => {
    for (let i = 0; i < 4; i += 1) {
      ctx.controller.openMenu('file');
      ctx.controller.closeAllMenus();
    }
    ctx.controller.openMenu('file');
    press('Enter');
    expect(ctx.runs.One).toBe(1);
  });
});

describe('where focus goes when a menu closes', () => {
  let ctx;
  beforeEach(() => {
    ctx = setUp();
  });

  it('goes back to the menu button after Escape', () => {
    ctx.controller.openMenu('file');
    press('Escape');
    expect(document.activeElement).toBe(document.getElementById('fileMenuBtn'));
  });

  it('goes back to the menu button when the menu is closed by its overlay', () => {
    ctx.controller.openMenu('file');
    document.getElementById('fileMenuOverlay').click();
    expect(document.getElementById('fileMenuModal').classList).toContain(
      'hidden'
    );
    expect(document.activeElement).toBe(document.getElementById('fileMenuBtn'));
  });

  it('is on the menu button, not a hidden item, when an item runs', () => {
    ctx.controller.openMenu('file');
    press('Enter');
    expect(ctx.focusAtRun.One).toBe(document.getElementById('fileMenuBtn'));
  });

  it('stays where it is when something else closes the menus', () => {
    const elsewhere = document.createElement('button');
    elsewhere.textContent = 'Elsewhere';
    document.body.append(elsewhere);
    ctx.controller.openMenu('file');
    elsewhere.focus();
    ctx.controller.closeAllMenus();
    expect(document.activeElement).toBe(elsewhere);
  });
});
