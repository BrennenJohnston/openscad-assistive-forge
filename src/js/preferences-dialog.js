/**
 * Preferences dialog.
 *
 * Desktop OpenSCAD's Preferences is a six-tab dialog. This is the shell: the
 * dialog itself, an APG tab bar, focus handling, and every tab present and
 * honest about its own state. Tabs whose engine does not exist in a browser
 * build are visibly disabled and name their reason via aria-describedby --
 * the pattern this app uses, because "silently absent" tells a user
 * nothing and a missing tab cannot be asked about.
 *
 * APG tabs (tablist.js), automatic activation: exactly one tab is in the
 * page tab order (roving tabindex), Left/Right move between tabs and select
 * as they go, Home/End jump to the ends.
 *
 * Unavailable tabs keep `aria-disabled="true"`, so they are announced as
 * unavailable, but they are reachable and selectable like any other, and
 * their panel holds the explanation. Skipping them with the arrows and
 * leaving the reason to `aria-describedby` alone would make the reason text
 * invisible to every sighted user and, because a skipped tab also has
 * `tabindex="-1"`, unreachable by keyboard: only a mouse click could focus
 * it.
 *
 * @license GPL-3.0-or-later
 */

import {
  openModal,
  closeModal,
  setupModalCloseHandlers,
} from './modal-manager.js';
import { createTabList, selectTabIn } from './tablist.js';
import {
  downloadFailure,
  downloadWithStatus,
  engineSize,
  megabytes,
} from './engine-choice.js';

const TAB_IDS = [
  'prefs-tab-3dview',
  'prefs-tab-editor',
  'prefs-tab-3dprint',
  'prefs-tab-advanced',
  // Upstream's Axes and Buttons tabs are one Controller tab here. It points
  // to the Keys dialog, where the sticks and the buttons are assigned in one
  // list beside the keyboard shortcuts.
  'prefs-tab-controller',
  // Keyboard is a Forge addition: the shortcuts editor had to live
  // somewhere once Edit ▸ Preferences stopped being a synonym for it.
  'prefs-tab-keyboard',
];

/** @returns {HTMLElement|null} */
const el = (id) => document.getElementById(id);

/** Tabs in DOM order, skipping any the markup does not define. */
function tabs() {
  return TAB_IDS.map(el).filter(Boolean);
}

let wired = false;

/** @type {PreferencesHandlers} */
let activeHandlers = {};

/**
 * @typedef {Object} PreferencesHandlers
 * @property {() => void} [onOpenShortcuts]
 * @property {() => void} [onOpenController]
 * @property {(id: string) => void} [onColorSchemeChange]
 * @property {() => string} [getColorScheme]
 * @property {(enabled: boolean) => void} [onZoomToCursorChange]
 * @property {() => boolean} [getZoomToCursor]
 * @property {() => Object} [getEditorPrefs]
 * @property {(name: string, value: number|boolean) => number|boolean} [onEditorPrefChange]
 * @property {EngineHandlers} [engine]
 */

/**
 * @typedef {Object} EngineHandlers
 * @property {() => Promise<{engines: Object[]}>} manifest
 * @property {() => string} chosenId
 * @property {(id: string) => Promise<boolean>} isDownloaded
 * @property {(id: string, onProgress: (percent: number) => void) => Promise<unknown>} download
 * @property {(id: string) => Promise<boolean>} remove - true when the
 *   removed engine was the chosen one
 * @property {(id: string) => Promise<unknown>} switchTo
 * @property {(text: string, options: {announce: boolean}) => void} status
 * @property {(text: string) => void} announce
 * @property {(message: string, title: string, confirmLabel: string, cancelLabel: string) => Promise<boolean>} confirm
 * @property {(details: {title: string, message: string, technical: string}) => void} showError
 */

/** The words an engine goes by, on its radio and in what is said. */
function engineLabel(entry) {
  return entry.builtIn
    ? `${entry.name} (default, built in)`
    : `${entry.name} (official)`;
}

/** One engine change at a time: a second press waits for nothing. */
let engineBusy = false;

/**
 * Advanced ▸ Engine: one row per engine in the manifest. An official engine
 * that is not kept in this browser cannot be chosen until it is downloaded,
 * because arrowing through the radios must never start a download; its
 * Download button asks first.
 *
 * @param {{focus?: {id: string, part: 'radio'|'button'}}} [options] - where
 *   focus goes once the rows are written again
 */
export async function renderEngineGroup({ focus } = {}) {
  const engine = activeHandlers.engine;
  const rows = el('engineRows');
  if (!engine || !rows) return;
  const manifest = await engine.manifest();
  const chosen = engine.chosenId();
  const kept = await Promise.all(
    manifest.engines.map((entry) => engine.isDownloaded(entry.id))
  );

  rows.textContent = '';
  manifest.engines.forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = 'engine-row';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'prefsEngine';
    radio.id = `engine-${entry.id}`;
    radio.value = entry.id;
    radio.checked = entry.id === chosen;
    radio.disabled = !kept[i];
    const label = document.createElement('label');
    label.htmlFor = radio.id;
    label.textContent = engineLabel(entry);
    // The radio and its name wrap as one, so a narrow screen never leaves
    // the radio alone on a line.
    const name = document.createElement('span');
    name.className = 'engine-name';
    name.append(radio, label);
    row.append(name);

    if (!entry.builtIn) {
      const state = document.createElement('span');
      state.className = 'engine-state';
      state.id = `engineState-${entry.id}`;
      state.textContent = kept[i]
        ? `Kept in this browser (${megabytes(engineSize(entry))} MB)`
        : `Not downloaded (${megabytes(entry.zip.size)} MB)`;
      radio.setAttribute('aria-describedby', state.id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-sm btn-outline engine-action';
      const verb = kept[i] ? 'Remove' : 'Download';
      button.textContent = verb;
      button.setAttribute('aria-label', `${verb} the ${entry.name} engine`);
      button.addEventListener('click', () =>
        kept[i] ? removeEngine(entry, manifest) : downloadEngine(entry)
      );
      row.append(state, button);
    }
    rows.append(row);
  });

  const current =
    manifest.engines.find((entry) => entry.id === chosen) ??
    manifest.engines[0];
  const currentNote = el('engineCurrent');
  if (currentNote) currentNote.textContent = `Engine: ${engineLabel(current)}`;

  if (focus) {
    const radio = el(`engine-${focus.id}`);
    const target =
      focus.part === 'radio' && !radio?.disabled
        ? radio
        : radio?.closest('.engine-row')?.querySelector('button');
    target?.focus();
  }
}

/** Ask, download with its progress in the status line, keep the choice. */
async function downloadEngine(entry) {
  const engine = activeHandlers.engine;
  if (!engine || engineBusy) return;
  const confirmed = await engine.confirm(
    `Download the ${entry.name} engine? It is about ${megabytes(entry.zip.size)} MB to download and takes ${megabytes(engineSize(entry))} MB in this browser until you remove it or clear the cache.`,
    'Download an official engine',
    'Download',
    'Not now'
  );
  if (!confirmed) return;
  engineBusy = true;
  try {
    await downloadWithStatus(engine, entry);
    engine.announce(`Engine ready: ${engineLabel(entry)}.`);
    await renderEngineGroup({ focus: { id: entry.id, part: 'radio' } });
  } catch (error) {
    engine.showError(downloadFailure(error));
    await renderEngineGroup({ focus: { id: entry.id, part: 'button' } });
  } finally {
    engineBusy = false;
  }
}

/** Switch to a kept engine and say which one runs now. */
async function chooseEngine(id) {
  const engine = activeHandlers.engine;
  if (!engine || engineBusy) return;
  engineBusy = true;
  try {
    const manifest = await engine.manifest();
    const entry = manifest.engines.find((e) => e.id === id);
    await engine.switchTo(id);
    engine.announce(`Engine: ${engineLabel(entry)}`);
    await renderEngineGroup({ focus: { id, part: 'radio' } });
  } catch (error) {
    showEngineChangeError(engine, error);
    await renderEngineGroup();
  } finally {
    engineBusy = false;
  }
}

/** Forget a kept engine; when it was in use, run the Forge engine again. */
async function removeEngine(entry, manifest) {
  const engine = activeHandlers.engine;
  if (!engine || engineBusy) return;
  engineBusy = true;
  try {
    const wasInUse = await engine.remove(entry.id);
    let sentence = `Removed the ${entry.name} engine.`;
    if (wasInUse) {
      const builtIn = manifest.engines.find((e) => e.builtIn);
      await engine.switchTo(builtIn.id);
      sentence += ` Engine: ${engineLabel(builtIn)}`;
    }
    engine.announce(sentence);
    await renderEngineGroup({ focus: { id: entry.id, part: 'button' } });
  } catch (error) {
    showEngineChangeError(engine, error);
    await renderEngineGroup();
  } finally {
    engineBusy = false;
  }
}

function showEngineChangeError(engine, error) {
  engine.showError({
    title: 'Engine change failed',
    message: 'The engine did not start. Choose the Forge engine to go back.',
    technical: error.message,
  });
}

/** The group, written again; a manifest that cannot be read says so. */
function syncEngineGroup() {
  renderEngineGroup().catch((error) => {
    console.error('[Preferences] The engine list could not be read:', error);
    const note = el('engineCurrent');
    if (note)
      note.textContent = `The engine list could not be read: ${error.message}`;
  });
}

/**
 * Editor-tab control ids, paired with the preference each one writes.
 * `number` controls clamp through the preference owner and echo back what was
 * actually stored, so a control can never display a value the editor is not
 * using.
 */
const EDITOR_CONTROLS = [
  { id: 'prefsEditorFontSize', pref: 'fontSize', type: 'number' },
  { id: 'prefsEditorIndentWidth', pref: 'indentWidth', type: 'number' },
  { id: 'prefsEditorTabWidth', pref: 'tabWidth', type: 'number' },
  { id: 'prefsEditorLineWrap', pref: 'lineWrapping', type: 'boolean' },
  {
    id: 'prefsEditorHighlightLine',
    pref: 'highlightActiveLine',
    type: 'boolean',
  },
  { id: 'prefsEditorWrapIndent', pref: 'wrapIndent', type: 'boolean' },
  { id: 'prefsEditorWrapArrow', pref: 'wrapArrow', type: 'boolean' },
  { id: 'prefsEditorBraceMatching', pref: 'braceMatching', type: 'boolean' },
  { id: 'prefsEditorAutocomplete', pref: 'autocomplete', type: 'boolean' },
];

/**
 * Push current app state into the dialog's controls.
 *
 * Called on every open rather than once at wire time: these settings have
 * other homes in the app (zoom-to-cursor has its own checkbox in the viewport
 * controls), so the dialog can be stale before it is ever shown. This is the
 * multi-copy rule -- two controls for one setting must never disagree.
 */
function syncControls() {
  const scheme = activeHandlers.getColorScheme?.();
  if (scheme) {
    const radio = document.querySelector(
      `input[name="prefsColorScheme"][value="${scheme}"]`
    );
    if (radio) radio.checked = true;
  }

  const zoom = activeHandlers.getZoomToCursor?.();
  const zoomBox = el('prefsMouseCentricZoom');
  if (zoomBox && typeof zoom === 'boolean') zoomBox.checked = zoom;

  const showGrid = activeHandlers.getShowGrid?.();
  const showGridBox = el('prefsShowGrid');
  if (showGridBox && typeof showGrid === 'boolean') {
    showGridBox.checked = showGrid;
  }
  syncGridSizeSelect();

  const editorPrefs = activeHandlers.getEditorPrefs?.();
  if (editorPrefs) {
    for (const control of EDITOR_CONTROLS) {
      const input = el(control.id);
      if (!input) continue;
      if (control.type === 'boolean') {
        input.checked = Boolean(editorPrefs[control.pref]);
      } else {
        input.value = String(editorPrefs[control.pref]);
      }
    }
  }

  syncEngineGroup();
}

/** Editor tab: instant-apply on the running editor. */
function wireEditorTab() {
  for (const control of EDITOR_CONTROLS) {
    const input = el(control.id);
    if (!input) continue;

    input.addEventListener('change', () => {
      const raw =
        control.type === 'boolean' ? input.checked : Number(input.value);
      const stored = activeHandlers.onEditorPrefChange?.(control.pref, raw);

      // Echo the stored value back into a number field. Typing 99 into an
      // 8-32 box otherwise leaves the box reading 99 while the editor uses
      // 32, and the control and its effect have come apart.
      if (control.type === 'number' && typeof stored === 'number') {
        input.value = String(stored);
      }
    });
  }
}

/**
 * Rebuild the Grid size select from the app's current preset list. Options
 * come from the handler on every open — the drawer is the
 * canonical preset editor, so the dialog can be stale before it is shown
 * (the same multi-copy rule syncControls() states). When the current size
 * matches no preset, a synthetic "Current" option keeps the control honest
 * instead of silently displaying a preset that is not in effect.
 */
function syncGridSizeSelect() {
  const select = el('prefsGridSizeSelect');
  if (!select) return;
  const state = activeHandlers.getGridSizeOptions?.();
  if (!state) return;

  select.textContent = '';
  let currentMatched = false;
  for (const option of state.options) {
    const node = document.createElement('option');
    node.value = option.value;
    node.textContent = option.label;
    if (option.value === state.current) {
      node.selected = true;
      currentMatched = true;
    }
    select.appendChild(node);
  }
  if (!currentMatched && state.currentLabel) {
    const node = document.createElement('option');
    node.value = '__current';
    node.textContent = state.currentLabel;
    node.selected = true;
    select.insertBefore(node, select.firstChild);
  }
}

/** 3D View tab: instant-apply, exactly like the desktop's own dialog. */
function wireThreeDViewTab() {
  // Delegated so the ten radios need one listener, and `change` rather than
  // `click` so keyboard arrow-key selection applies too.
  el('prefsColorSchemeList')?.addEventListener('change', (event) => {
    const input = event.target;
    if (input?.name !== 'prefsColorScheme') return;
    activeHandlers.onColorSchemeChange?.(input.value);
  });

  el('prefsMouseCentricZoom')?.addEventListener('change', (event) => {
    activeHandlers.onZoomToCursorChange?.(event.target.checked);
  });

  el('prefsShowGrid')?.addEventListener('change', (event) => {
    activeHandlers.onShowGridChange?.(event.target.checked);
  });

  el('prefsGridSizeSelect')?.addEventListener('change', (event) => {
    const value = event.target.value;
    if (value === '__current') return;
    activeHandlers.onGridSizeChange?.(value);
    // Re-sync so the control echoes what was actually applied (a clamped
    // or rejected size must never keep displaying the requested one).
    syncGridSizeSelect();
  });
}

/**
 * Wire the dialog once. Idempotent: the menu item, a shortcut and a future
 * settings button can all call this without stacking listeners -- the same
 * duplicate-listener trap the shortcuts modal guards with dataset.initialized.
 *
 * @param {PreferencesHandlers} [handlers]
 */
export function initPreferencesDialog(handlers = {}) {
  activeHandlers = handlers;
  const modal = el('preferencesModal');
  if (!modal || wired) return;

  const tablist = el('preferencesTablist');
  if (tablist) createTabList({ tablist, tabs });

  wireThreeDViewTab();
  wireEditorTab();

  // `change`, so a radio chosen by the arrow keys switches as a click does.
  el('engineRows')?.addEventListener('change', (event) => {
    const input = event.target;
    if (input?.name === 'prefsEngine' && input.checked) {
      chooseEngine(input.value);
    }
  });

  // The shared helper wires the close button, the overlay and Escape;
  // wiring those by hand risks a dialog without Escape, which is a WCAG
  // 2.1.2 failure and an APG dialog requirement.
  setupModalCloseHandlers(modal);

  const close = () => closeModal(modal);
  el('preferencesModalDone')?.addEventListener('click', close);

  el('preferencesOpenShortcuts')?.addEventListener('click', () => {
    // The shortcuts editor is its own dialog and stays that way:
    // its markup wires Reset All / Done / overlay / close by element id, so
    // a second copy inside this panel would drive the other dialog's
    // buttons. Closing first keeps one dialog on screen at a time.
    close();
    handlers.onOpenShortcuts?.();
  });

  // The controller's settings moved to the Keys dialog; this tab points
  // there, as the Keyboard tab does.
  el('preferencesOpenController')?.addEventListener('click', () => {
    close();
    handlers.onOpenController?.();
  });

  wired = true;
}

/**
 * Open Preferences, optionally on a named tab.
 *
 * `returnFocusTo` matters more than it looks: openModal remembers whatever
 * has focus as the element to restore on close, and a menu item is destroyed
 * when its menu closes. Restoring focus to a detached node silently drops
 * the user on <body> — so hand it an element that outlives the menu.
 *
 * @param {{tab?: string, returnFocusTo?: HTMLElement}} [options]
 */
export function openPreferencesDialog(options = {}) {
  const modal = el('preferencesModal');
  if (!modal) return;

  if (options.returnFocusTo?.focus) options.returnFocusTo.focus();

  // The first tab unless a menu asked for one: a dialog that opened on
  // whatever tab was last used read as a different dialog each time.
  const wanted = options.tab ? el(`prefs-tab-${options.tab}`) : null;
  const target = wanted || tabs()[0];

  // Controls first: a radio that still shows the previous session's choice
  // would be read out before the sync landed.
  syncControls();

  // Set state before opening so the dialog never paints a wrong tab, and do
  // not steal focus here -- openModal moves focus into the dialog itself.
  if (target) selectTabIn(tabs(), target, { focus: false });

  openModal(modal);
}

/** Test seam: forget the wiring so a fresh DOM can be wired again. */
export function _resetPreferencesDialogForTests() {
  wired = false;
  engineBusy = false;
}
