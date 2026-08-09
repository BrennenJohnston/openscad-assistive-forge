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
 * Home/End jump to the ends. Disabled tabs are SKIPPED by the arrow keys
 * rather than removed, so their reason stays reachable: a disabled tab still
 * takes focus from a direct Tab or click, and a screen reader reads its
 * description there.
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

const isDisabled = (tab) => tab.getAttribute('aria-disabled') === 'true';

/**
 * Select a tab: update aria-selected, the roving tabindex and panel
 * visibility. A disabled tab can be focused but never selected -- selecting
 * it would show an empty panel and hide the one the user was reading.
 *
 * @param {HTMLElement} tab
 * @param {{focus?: boolean}} [options]
 */
export function selectTab(tab, { focus = true } = {}) {
  if (!tab || isDisabled(tab)) return;

  for (const t of tabs()) {
    const selected = t === tab;
    t.setAttribute('aria-selected', String(selected));
    // Roving tabindex: only the selected tab is a page tab stop. Disabled
    // tabs keep tabindex="-1" so Tab does not stop on a dead control, but
    // they stay clickable and their reason stays readable.
    t.setAttribute('tabindex', selected ? '0' : '-1');
    t.classList.toggle('active', selected);

    const panel = el(t.getAttribute('aria-controls'));
    if (panel) panel.hidden = !selected;
  }

  if (focus) tab.focus();
}

/**
 * Move selection to the next enabled tab in `direction`, wrapping. Returns
 * false when no enabled tab exists in that direction, so the caller can
 * leave the key alone rather than swallowing it.
 *
 * @param {HTMLElement} from
 * @param {number} direction -1 or 1
 * @returns {boolean}
 */
function moveSelection(from, direction) {
  const list = tabs();
  const start = list.indexOf(from);
  if (start === -1) return false;

  for (let step = 1; step <= list.length; step++) {
    const next = list[(start + direction * step + list.length) % list.length];
    if (next && !isDisabled(next)) {
      selectTab(next);
      return true;
    }
  }
  return false;
}

/** First/last enabled tab, for Home/End. */
function selectEdge(fromEnd) {
  const list = fromEnd ? tabs().reverse() : tabs();
  const target = list.find((t) => !isDisabled(t));
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

/**
 * Wire the dialog once. Idempotent: the menu item, a shortcut and a future
 * settings button can all call this without stacking listeners -- the same
 * duplicate-listener trap the shortcuts modal guards with dataset.initialized.
 *
 * @param {{onOpenShortcuts?: () => void}} [handlers]
 */
export function initPreferencesDialog(handlers = {}) {
  const modal = el('preferencesModal');
  if (!modal || wired) return;

  const tablist = el('preferencesTablist');
  if (tablist) {
    tablist.addEventListener('keydown', onTablistKeydown);
    // A click on a disabled tab focuses it (so its reason is announced) but
    // must not select it.
    tablist.addEventListener('click', (event) => {
      const tab = event.target.closest('[role="tab"]');
      if (!tab) return;
      if (isDisabled(tab)) {
        tab.focus();
        return;
      }
      selectTab(tab);
    });
  }

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
    wanted && !isDisabled(wanted)
      ? wanted
      : tabs().find((t) => t.getAttribute('aria-selected') === 'true') ||
        tabs().find((t) => !isDisabled(t));

  // Set state before opening so the dialog never paints a wrong tab, and do
  // not steal focus here -- openModal moves focus into the dialog itself.
  if (target) selectTab(target, { focus: false });

  openModal(modal);
}

/** Test seam: forget the wiring so a fresh DOM can be wired again. */
export function _resetPreferencesDialogForTests() {
  wired = false;
}
