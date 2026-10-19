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
    <button id="fileMenu" role="menuitem">File</button>
    <button id="editMenu" role="menuitem">Edit</button>
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

// The whole window as a desktop shows it: every part a person names, some
// open and some closed.
const WINDOW = `
  <header class="app-header">
    <button id="mainPage">Main Page</button>
  </header>
  <div id="workflowProgress">
    <div id="toolbarMenuBar" role="menubar"><button id="fileMenu">File</button></div>
    <div class="workflow-actions">
      <button id="contrastToggle">HC</button><button id="themeToggle">Theme</button>
    </div>
  </div>
  <section id="paramPanel">
    <button id="collapseParamPanelBtn" aria-expanded="true">Collapse customizer panel</button>
    <button id="codeBtn">Code</button>
    <input id="width" type="range" min="0" max="10" value="4" />
  </section>
  <section id="previewInfoSection">
    <button id="previewDrawerToggle" aria-expanded="false">Expand preview settings</button>
    <div id="previewInfoContent" hidden><button id="quality">Quality</button></div>
  </section>
  <div id="previewContainer"><div id="canvas" tabindex="0">3D view</div></div>
  <aside id="cameraPanel">
    <button id="cameraPanelToggle" aria-expanded="false">Expand camera controls panel</button>
    <div hidden><button id="zoomIn">Zoom in</button></div>
  </aside>
  <div id="lensDrawer"><div hidden><input id="focus" type="range" /></div></div>
  <div id="actionsBar"><button id="primaryActionBtn">Generate</button></div>
  <div id="echoDrawer">
    <button id="echoDrawerToggle" aria-expanded="true">Messages</button>
    <div id="echoDrawerContent"><button id="copyMessages">Copy</button></div>
  </div>
`;

describe("the controller jumps between the window's parts", () => {
  beforeEach(() => {
    document.body.innerHTML = WINDOW;
  });

  it('the right trigger visits every live part in order, past an open part\'s own toggle, and round again', () => {
    const nav = createGamepadNavigator();
    document.getElementById('mainPage').focus();
    const visited = [];
    for (let i = 0; i < 9; i++) {
      nav.nextRegion();
      visited.push(focused());
    }
    expect(visited).toEqual([
      'fileMenu',
      'contrastToggle',
      'codeBtn',
      'previewDrawerToggle',
      'canvas',
      'cameraPanelToggle',
      'primaryActionBtn',
      'copyMessages',
      'mainPage',
    ]);
  });

  it('the left trigger visits them backward', () => {
    const nav = createGamepadNavigator();
    document.getElementById('mainPage').focus();
    const visited = [];
    for (let i = 0; i < 4; i++) {
      nav.previousRegion();
      visited.push(focused());
    }
    expect(visited).toEqual([
      'copyMessages',
      'primaryActionBtn',
      'cameraPanelToggle',
      'canvas',
    ]);
  });

  it('a closed part lands on its toggle, and an open one on its first control', () => {
    const nav = createGamepadNavigator();
    document.getElementById('canvas').focus();
    nav.previousRegion();
    expect(focused(), 'Preview Settings, closed').toBe('previewDrawerToggle');
    const toggle = document.getElementById('previewDrawerToggle');
    toggle.setAttribute('aria-expanded', 'true');
    document.getElementById('previewInfoContent').hidden = false;
    document.getElementById('canvas').focus();
    nav.previousRegion();
    expect(focused(), 'Preview Settings, open').toBe('quality');
  });

  it('a part with nothing to reach is passed by, and visited once it opens', () => {
    const nav = createGamepadNavigator();
    document.getElementById('cameraPanelToggle').focus();
    nav.nextRegion();
    expect(focused(), 'the closed Lens drawer skipped').toBe('primaryActionBtn');
    document.querySelector('#lensDrawer > div').hidden = false;
    document.getElementById('cameraPanelToggle').focus();
    nav.nextRegion();
    expect(focused(), 'the open Lens drawer').toBe('focus');
  });

  it('a part inside another counts for itself, right after it, and its controls are visited once', () => {
    // On a phone the theme row stands in the Preview Settings row.
    const theme = document.querySelector('.workflow-actions');
    document.getElementById('previewDrawerToggle').after(theme);
    const nav = createGamepadNavigator();
    document.getElementById('codeBtn').focus();
    nav.nextRegion();
    expect(focused(), 'Preview Settings lands on its own toggle').toBe(
      'previewDrawerToggle'
    );
    nav.nextRegion();
    expect(focused(), 'then the theme row inside it').toBe('contrastToggle');
    nav.nextRegion();
    expect(focused()).toBe('canvas');
    nav.previousRegion();
    expect(focused()).toBe('contrastToggle');
    nav.previousRegion();
    expect(focused()).toBe('previewDrawerToggle');
  });

  it("a pane's title bar buttons are passed over like a toggle", () => {
    document.body.innerHTML = `
      <div id="classicEditorSlot">
        <div class="classic-pane-titlebar">
          <button id="stow" aria-expanded="true">Stow the left column</button>
          <button id="move">Move Editor</button>
        </div>
        <button id="newFile">New file</button>
      </div>
      <div id="previewContainer"><div id="canvas" tabindex="0">3D view</div></div>
    `;
    const nav = createGamepadNavigator({
      getRegions: () => [
        { selector: '#classicEditorSlot', toggle: '.classic-pane-titlebar *' },
        '#previewContainer',
      ],
    });
    document.getElementById('canvas').focus();
    nav.nextRegion();
    expect(focused()).toBe('newFile');
  });
});

describe('the D-pad where arrow keys mean nothing', () => {
  beforeEach(() => {
    document.body.innerHTML = WINDOW;
  });

  it('on a button, Down steps to the next control and Up to the previous, within its part', () => {
    const nav = createGamepadNavigator();
    document.getElementById('codeBtn').focus();
    nav.arrow('up');
    expect(focused()).toBe('collapseParamPanelBtn');
    expect(document.activeElement.getAttribute('data-focus-source')).toBe(
      'gamepad'
    );
    nav.arrow('up');
    expect(focused(), 'no step out of the part').toBe('collapseParamPanelBtn');
    nav.arrow('down');
    nav.arrow('down');
    expect(focused()).toBe('width');
    const width = document.getElementById('width');
    nav.arrow('down');
    expect(focused(), 'a slider keeps its arrows').toBe('width');
    expect(width.value).toBe('3');
    document.getElementById('codeBtn').focus();
    document.getElementById('width').remove();
    nav.arrow('down');
    expect(focused(), 'no step out of the part at its end').toBe('codeBtn');
  });

  it('Left and Right still send their keys to a button', () => {
    const nav = createGamepadNavigator();
    const code = document.getElementById('codeBtn');
    const keys = [];
    code.addEventListener('keydown', (e) => keys.push(e.key));
    code.focus();
    nav.arrow('left');
    nav.arrow('right');
    expect(keys).toEqual(['ArrowLeft', 'ArrowRight']);
    expect(focused()).toBe('codeBtn');
  });

  it.each([
    ['a menu item', '<button role="menuitem">Open</button>'],
    ['a tab', '<button role="tab">Editor</button>'],
    ['a radio button', '<input type="radio" name="r" />'],
    ['a text field', '<input type="text" />'],
    ['the code editor', '<div class="cm-editor"><div contenteditable="true">x</div></div>'],
    ['a menu button', '<button aria-haspopup="menu">More</button>'],
  ])('%s keeps its arrow keys', (_name, html) => {
    document
      .getElementById('paramPanel')
      .insertAdjacentHTML('afterbegin', `<div id="probe">${html}</div>`);
    const target =
      document.querySelector('#probe [contenteditable]') ||
      document.querySelector('#probe').firstElementChild;
    if (!target.matches('button, input')) target.tabIndex = 0;
    const keys = [];
    target.addEventListener('keydown', (e) => keys.push(e.key));
    target.focus();
    const nav = createGamepadNavigator();
    nav.arrow('down');
    nav.arrow('up');
    expect(keys).toEqual(['ArrowDown', 'ArrowUp']);
    expect(document.activeElement).toBe(target);
  });

  it('a control the step lands under a sticky header is scrolled clear of it', () => {
    const panel = document.getElementById('paramPanel');
    panel.style.overflowY = 'auto';
    Object.defineProperty(panel, 'scrollHeight', { value: 1000 });
    Object.defineProperty(panel, 'clientHeight', { value: 300 });
    panel.scrollTop = 100;
    const header = document.createElement('div');
    header.style.position = 'sticky';
    panel.prepend(header);
    header.getBoundingClientRect = () => ({ top: 0, bottom: 50, left: 0, right: 300, width: 300, height: 50 });
    document.getElementById('codeBtn').getBoundingClientRect = () => ({ top: 30, bottom: 60, left: 0, right: 100, width: 100, height: 30 });
    const nav = createGamepadNavigator();
    document.getElementById('collapseParamPanelBtn').focus();
    nav.arrow('down');
    expect(focused()).toBe('codeBtn');
    expect(panel.scrollTop, 'scrolled back by the 20 px the header covered').toBe(80);
  });
});
