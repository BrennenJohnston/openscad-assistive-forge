/**
 * Driving the interface with a game controller: focus steps in Tab's order,
 * jumps between the window's parts, presses, goes back, and steps sliders.
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createGamepadNavigator,
  focusOrder,
} from '../../src/js/gamepad-navigator.js';

const FIXTURE = `
  <header class="app-header">
    <button id="mainPage">Main Page</button>
    <button id="github">GitHub</button>
  </header>
  <div id="toolbarMenuBar" role="menubar">
    <button id="fileMenu">File</button>
    <button id="editMenu">Edit</button>
  </div>
  <section id="paramPanel">
    <input id="width" type="range" min="0" max="10" step="2" value="4" />
    <select id="style"><option>raised</option><option>engraved</option></select>
    <div inert><button id="inertBtn">Behind something</button></div>
    <div aria-hidden="true"><button id="hiddenFromAT">Hidden</button></div>
    <div hidden><button id="hiddenBtn">Hidden</button></div>
  </section>
  <div id="actionsBar"><button id="generate">Generate</button></div>
`;

let originalRects;

beforeEach(() => {
  document.body.innerHTML = FIXTURE;
  // jsdom lays nothing out: every element counts as having a box here.
  originalRects = Element.prototype.getClientRects;
  Element.prototype.getClientRects = function () {
    return [{ width: 10, height: 10 }];
  };
});

afterEach(() => {
  Element.prototype.getClientRects = originalRects;
  document.body.innerHTML = '';
});

const focused = () => document.activeElement?.id;

describe('the controller drives focus', () => {
  it("steps in Tab's order, skipping what is inert, hidden or hidden from assistive technology", () => {
    expect(focusOrder().map((el) => el.id)).toEqual([
      'mainPage',
      'github',
      'fileMenu',
      'editMenu',
      'width',
      'style',
      'generate',
    ]);
    const nav = createGamepadNavigator();
    nav.next();
    expect(focused()).toBe('mainPage');
    nav.next();
    expect(focused()).toBe('github');
    nav.previous();
    expect(focused()).toBe('mainPage');
    nav.previous();
    expect(focused()).toBe('generate');
  });

  it('marks a move it makes, so its focus ring shows', () => {
    const nav = createGamepadNavigator();
    nav.next();
    expect(document.activeElement.getAttribute('data-focus-source')).toBe(
      'gamepad'
    );
    nav.next();
    expect(
      document.getElementById('mainPage').hasAttribute('data-focus-source')
    ).toBe(false);
  });

  it("jumps to the first control of the window's next and previous part", () => {
    const nav = createGamepadNavigator({
      getRegions: () => [
        '.app-header',
        '#toolbarMenuBar',
        '#paramPanel',
        '#actionsBar',
      ],
    });
    document.getElementById('github').focus();
    nav.nextRegion();
    expect(focused()).toBe('fileMenu');
    nav.nextRegion();
    expect(focused()).toBe('width');
    nav.previousRegion();
    expect(focused()).toBe('fileMenu');
    document.getElementById('generate').focus();
    nav.nextRegion();
    expect(focused()).toBe('mainPage');
  });

  it('keeps to an open dialog', () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div role="dialog" aria-modal="true" id="prefs">
         <button id="ok">OK</button><button id="cancel">Cancel</button>
       </div>`
    );
    const nav = createGamepadNavigator();
    nav.next();
    expect(focused()).toBe('ok');
    nav.next();
    expect(focused()).toBe('cancel');
    nav.next();
    expect(focused()).toBe('ok');
    nav.nextRegion();
    expect(focused()).toBe('cancel');
  });

  it('A presses a button and leaves a slider and a list alone', () => {
    const nav = createGamepadNavigator();
    const file = document.getElementById('fileMenu');
    const clicked = vi.fn();
    file.addEventListener('click', clicked);
    file.focus();
    nav.activate();
    expect(clicked).toHaveBeenCalledTimes(1);
    const width = document.getElementById('width');
    const widthClicked = vi.fn();
    width.addEventListener('click', widthClicked);
    width.focus();
    nav.activate();
    expect(widthClicked).not.toHaveBeenCalled();
  });

  it('B closes what is open when nothing takes its Escape', () => {
    const closeOpen = vi.fn();
    const nav = createGamepadNavigator({ onUnhandledBack: closeOpen });
    const file = document.getElementById('fileMenu');
    file.focus();
    file.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') e.preventDefault();
      },
      { once: true }
    );
    nav.back();
    expect(closeOpen).not.toHaveBeenCalled();
    nav.back();
    expect(closeOpen).toHaveBeenCalledTimes(1);
  });

  it('Start opens Full Screen and Select the keyboard shortcuts', () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<button id="focusModeBtn">Full Screen</button><button id="shortcutsToggle">Keys</button>'
    );
    const full = vi.fn();
    const keys = vi.fn();
    document.getElementById('focusModeBtn').addEventListener('click', full);
    document.getElementById('shortcutsToggle').addEventListener('click', keys);
    const nav = createGamepadNavigator();
    nav.fullScreen();
    nav.keys();
    expect(full).toHaveBeenCalledTimes(1);
    expect(keys).toHaveBeenCalledTimes(1);
  });

  it('A presses the focused button, B sends Escape to it', () => {
    const nav = createGamepadNavigator();
    const file = document.getElementById('fileMenu');
    const clicked = vi.fn();
    const escaped = vi.fn();
    file.addEventListener('click', clicked);
    file.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') escaped();
    });
    file.focus();
    nav.activate();
    expect(clicked).toHaveBeenCalledTimes(1);
    nav.back();
    expect(escaped).toHaveBeenCalledTimes(1);
  });

  it('the D-pad steps a slider and a list, and sends other controls their arrow keys', () => {
    const nav = createGamepadNavigator();
    const width = document.getElementById('width');
    const changed = vi.fn();
    width.addEventListener('change', changed);
    width.focus();
    nav.arrow('right');
    expect(width.value).toBe('6');
    nav.arrow('down');
    expect(width.value).toBe('4');
    expect(changed).toHaveBeenCalledTimes(2);

    const style = document.getElementById('style');
    style.focus();
    nav.arrow('down');
    expect(style.selectedIndex).toBe(1);

    const file = document.getElementById('fileMenu');
    const keys = [];
    file.addEventListener('keydown', (e) => keys.push(e.key));
    file.focus();
    nav.arrow('down');
    nav.arrow('left');
    expect(keys).toEqual(['ArrowDown', 'ArrowLeft']);
  });

  it('stands down while the City Walk runs', () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div id="cityWalkLayer"><button id="inGame">Map</button></div>'
    );
    const nav = createGamepadNavigator();
    nav.next();
    expect(document.activeElement).toBe(document.body);
    document.getElementById('cityWalkLayer').hidden = true;
    nav.next();
    expect(focused()).toBe('mainPage');
  });

  it('stands down while something else has the controller', () => {
    let paused = true;
    const nav = createGamepadNavigator({ isPaused: () => paused });
    nav.next();
    expect(document.activeElement).toBe(document.body);
    paused = false;
    nav.next();
    expect(focused()).toBe('mainPage');
  });
});

// The Customizer as the controller sees it: parameters in their groups,
// each parameter's own reset button, and the Generate button. A group's
// header is focusable in a browser; jsdom needs it told.
const CUSTOMIZER = `
  <div id="parametersContainer">
    <details class="param-group" open>
      <summary class="param-group-summary" tabindex="0">Size</summary>
      <div class="param-control" data-param-name="height">
        <input id="height" type="range" min="0" max="10" value="5" />
        <button class="param-reset-btn" data-param-name="height">Reset</button>
      </div>
      <div class="param-control" data-param-name="depth">
        <input id="depth" type="number" value="3" />
      </div>
    </details>
    <details class="param-group">
      <summary class="param-group-summary" tabindex="0">Text</summary>
      <div class="param-control"><input id="label" type="text" value="x" /></div>
    </details>
  </div>
  <button id="primaryActionBtn">Generate</button>
`;

describe('the controller drives the Customizer', () => {
  beforeEach(() => {
    document
      .getElementById('paramPanel')
      .insertAdjacentHTML('beforeend', CUSTOMIZER);
  });

  it("the bumpers step through the parameters, the first from anywhere, round again, and a closed group's stay out of reach", () => {
    const nav = createGamepadNavigator();
    nav.parameter(1);
    expect(focused()).toBe('height');
    nav.parameter(1);
    expect(focused()).toBe('depth');
    nav.parameter(1);
    expect(focused(), 'the closed group skipped').toBe('height');
    nav.parameter(-1);
    expect(focused()).toBe('depth');
    document.getElementById('mainPage').focus();
    nav.parameter(-1);
    expect(focused(), 'the last from anywhere, going back').toBe('depth');
  });

  it('the triggers step through the groups by their headers, round again', () => {
    const nav = createGamepadNavigator();
    nav.group(1);
    expect(document.activeElement.textContent).toBe('Size');
    nav.group(1);
    expect(document.activeElement.textContent).toBe('Text');
    nav.group(1);
    expect(document.activeElement.textContent).toBe('Size');
    nav.group(-1);
    expect(document.activeElement.textContent).toBe('Text');
  });

  it('X presses the focused parameter\'s own reset button, Y presses Generate', () => {
    const nav = createGamepadNavigator();
    const reset = vi.fn();
    const generate = vi.fn();
    document
      .querySelector('.param-reset-btn')
      .addEventListener('click', reset);
    document
      .getElementById('primaryActionBtn')
      .addEventListener('click', generate);
    document.getElementById('height').focus();
    nav.resetParameter();
    expect(reset).toHaveBeenCalledTimes(1);
    document.getElementById('depth').focus();
    nav.resetParameter();
    expect(reset, 'a parameter without one').toHaveBeenCalledTimes(1);
    nav.generate();
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
