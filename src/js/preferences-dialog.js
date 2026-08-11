/**
 * Preferences dialog (P11a shell).
 *
 * Desktop OpenSCAD's Preferences is a six-tab dialog. This is the shell: the
 * dialog itself, an APG tab bar, focus handling, and every tab present and
 * honest about its own state. Tabs whose engine does not exist in a browser
 * build are visibly disabled and name their reason via aria-describedby --
 * the pattern this whole plan uses, because "silently absent" tells a user
 * nothing and a missing tab cannot be asked about.
 *
 * APG tabs, automatic activation: exactly one tab is in the page tab order
 * (roving tabindex), Left/Right move between tabs and select as they go,
 * Home/End jump to the ends.
 *
 * Unavailable tabs keep `aria-disabled="true"`, so they are announced as
 * unavailable, but they are reachable and selectable like any other, and
 * their panel holds the explanation. R-III skipped them with the arrows and
 * left the reason to `aria-describedby` alone; MEASURED, that made the reason
 * text invisible to every sighted user and, because a skipped tab also has
 * `tabindex="-1"`, unreachable by keyboard at all — only a mouse click could
 * focus it. Owner decision 2026-08-09: show the reason in the panel.
 *
 * @license GPL-3.0-or-later
 */

import {
  openModal,
  closeModal,
  setupModalCloseHandlers,
} from './modal-manager.js';

const TAB_IDS = [
  'prefs-tab-3dview',
  'prefs-tab-editor',
  'prefs-tab-3dprint',
  'prefs-tab-advanced',
  'prefs-tab-axes',
  'prefs-tab-buttons',
  // Upstream's six tabs end at Buttons. Keyboard is a Forge addition: the
  // shortcuts editor had to live somewhere once Edit ▸ Preferences stopped
  // being a synonym for it.
  'prefs-tab-keyboard',
];

/** @returns {HTMLElement|null} */
const el = (id) => document.getElementById(id);

/** Tabs in DOM order, skipping any the markup does not define. */
function tabs() {
  return TAB_IDS.map(el).filter(Boolean);
}

/**
 * Select a tab: update aria-selected, the roving tabindex and panel
 * visibility. Unavailable tabs select like any other -- their panel is where
 * the reason lives, so refusing to show it is what hid the explanation.
 *
 * @param {HTMLElement} tab
 * @param {{focus?: boolean}} [options]
 */
export function selectTab(tab, { focus = true } = {}) {
  if (!tab) return;

  for (const t of tabs()) {
    const selected = t === tab;
    t.setAttribute('aria-selected', String(selected));
    // Roving tabindex: only the selected tab is a page tab stop.
    t.setAttribute('tabindex', selected ? '0' : '-1');
    t.classList.toggle('active', selected);

    const panel = el(t.getAttribute('aria-controls'));
    if (panel) panel.hidden = !selected;
  }

  if (focus) tab.focus();
}

/**
 * Move selection one step in `direction`, wrapping.
 *
 * @param {HTMLElement} from
 * @param {number} direction -1 or 1
 * @returns {boolean}
 */
function moveSelection(from, direction) {
  const list = tabs();
  const start = list.indexOf(from);
  if (start === -1) return false;

  const next = list[(start + direction + list.length) % list.length];
  if (!next) return false;
  selectTab(next);
  return true;
}

/** First/last tab, for Home/End. */
function selectEdge(fromEnd) {
  const list = tabs();
  const target = fromEnd ? list[list.length - 1] : list[0];
  if (target) selectTab(target);
}

/** @param {KeyboardEvent} event */
function onTablistKeydown(event) {
  const tab = event.target.closest('[role="tab"]');
  if (!tab) return;

  switch (event.key) {
    case 'ArrowRight':
      if (moveSelection(tab, 1)) event.preventDefault();
      break;
    case 'ArrowLeft':
      if (moveSelection(tab, -1)) event.preventDefault();
      break;
    case 'Home':
      selectEdge(false);
      event.preventDefault();
      break;
    case 'End':
      selectEdge(true);
      event.preventDefault();
      break;
    default:
      break;
  }
}

let wired = false;

/** @type {PreferencesHandlers} */
let activeHandlers = {};

/**
 * @typedef {Object} PreferencesHandlers
 * @property {() => void} [onOpenShortcuts]
 * @property {(id: string) => void} [onColorSchemeChange]
 * @property {() => string} [getColorScheme]
 * @property {(enabled: boolean) => void} [onZoomToCursorChange]
 * @property {() => boolean} [getZoomToCursor]
 * @property {() => Object} [getEditorPrefs]
 * @property {(name: string, value: number|boolean) => number|boolean} [onEditorPrefChange]
 * @property {() => {supported: boolean, padName: string|null, deadZone: number|null}} [getGamepadStatus]
 */

/**
 * The Axes tab's read-only status line (Q-32a). A user could never verify
 * that their controller was seen — the reason text names the live engine,
 * but nothing on screen reflected the actual device. This states it.
 *
 * @param {{supported: boolean, padName: string|null, deadZone: number|null}} [status]
 * @returns {string}
 */
export function formatGamepadStatus(status) {
  if (!status?.supported) {
    return 'This browser does not offer game controller input.';
  }
  if (!status.padName) {
    return 'No controller detected. Connect one and press any button.';
  }
  const deadZone =
    typeof status.deadZone === 'number'
      ? ` The camera dead zone is fixed at ${status.deadZone}.`
      : '';
  return `Controller detected: ${status.padName}.${deadZone}`;
}

/**
 * Render the status line. Skipped entirely when no handler was provided:
 * a claim about controller support with no data behind it would be the
 * exact false-reason shape R-IV removed from these tabs.
 */
function renderGamepadStatus() {
  if (!activeHandlers.getGamepadStatus) return;
  const node = el('prefsGamepadStatus');
  if (!node) return;
  node.textContent = formatGamepadStatus(activeHandlers.getGamepadStatus());
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

  renderGamepadStatus();
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
  if (tablist) {
    tablist.addEventListener('keydown', onTablistKeydown);
    tablist.addEventListener('click', (event) => {
      const tab = event.target.closest('[role="tab"]');
      if (tab) selectTab(tab);
    });
  }

  wireThreeDViewTab();
  wireEditorTab();

  // The status line heals itself while the dialog is open — without this,
  // "No controller detected" would sit beside a pad that was plugged in a
  // second after opening, and only a close-and-reopen would fix it.
  window.addEventListener('gamepadconnected', renderGamepadStatus);
  window.addEventListener('gamepaddisconnected', renderGamepadStatus);

  // The shared helper wires the close button, the overlay AND Escape. Wiring
  // those by hand is how the first cut of this dialog shipped without Escape,
  // which is a WCAG 2.1.2 failure and an APG dialog requirement.
  setupModalCloseHandlers(modal);

  const close = () => closeModal(modal);
  el('preferencesModalDone')?.addEventListener('click', close);

  el('preferencesOpenShortcuts')?.addEventListener('click', () => {
    // The shortcuts editor is its own dialog and stays that way for now:
    // its markup wires Reset All / Done / overlay / close by element id, so
    // a second copy inside this panel would drive the other dialog's
    // buttons. Closing first keeps one dialog on screen at a time.
    close();
    handlers.onOpenShortcuts?.();
  });

  wired = true;
}

/**
 * Open Preferences, optionally on a named tab.
 *
 * `returnFocusTo` matters more than it looks: openModal remembers whatever
 * has focus as the element to restore on close, and a menu item is destroyed
 * when its menu closes. Restoring focus to a detached node silently drops
 * the user on <body> — MEASURED. Hand it a element that outlives the menu.
 *
 * @param {{tab?: string, returnFocusTo?: HTMLElement}} [options]
 */
export function openPreferencesDialog(options = {}) {
  const modal = el('preferencesModal');
  if (!modal) return;

  if (options.returnFocusTo?.focus) options.returnFocusTo.focus();

  const wanted = options.tab ? el(`prefs-tab-${options.tab}`) : null;
  const target =
    wanted ||
    tabs().find((t) => t.getAttribute('aria-selected') === 'true') ||
    tabs()[0];

  // Controls first: a radio that still shows the previous session's choice
  // would be read out before the sync landed.
  syncControls();

  // Set state before opening so the dialog never paints a wrong tab, and do
  // not steal focus here -- openModal moves focus into the dialog itself.
  if (target) selectTab(target, { focus: false });

  openModal(modal);
}

/** Test seam: forget the wiring so a fresh DOM can be wired again. */
export function _resetPreferencesDialogForTests() {
  wired = false;
}
