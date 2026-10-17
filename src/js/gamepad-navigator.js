/**
 * Driving the interface with a game controller: step from control to
 * control in the order Tab uses, jump from one part of the window to the
 * next, press the control that has focus, do what Escape does, and send the
 * arrow keys to it. Focus shows its ring as it does for a keyboard. The game
 * controller module tells the pad's buttons; main.js runs these calls for
 * them by the preset.
 * @license GPL-3.0-or-later
 */

import { getFocusableElements } from './focus-trap.js';

/** The parts of the window the triggers move between, in order. */
export const DEFAULT_REGIONS = [
  '.app-header',
  '#toolbarMenuBar',
  '#paramPanel',
  '#previewContainer',
  '#cameraPanel, #cameraDrawer',
  '#actionsBar',
];

const FOCUS_SOURCE = 'gamepad';

/** Whether the City Walk is up: it reads the controller itself then. */
function cityWalkRunning() {
  const layer = document.getElementById('cityWalkLayer');
  return !!layer && !layer.hidden;
}

/**
 * Whether an element can take focus now: shown, and not inside something
 * inert, hidden or hidden from assistive technology.
 * @param {Element} el
 * @returns {boolean}
 */
function reachable(el) {
  if (el.closest('[inert], [hidden], [aria-hidden="true"]')) return false;
  if (typeof el.checkVisibility === 'function') {
    return el.checkVisibility({ visibilityProperty: true });
  }
  return true;
}

/**
 * The open modal dialog that holds focus, if one is shown: the last one in
 * the document, the one drawn on top.
 * @returns {Element|null}
 */
function openDialog() {
  const dialogs = [
    ...document.querySelectorAll(
      '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"], dialog[open]'
    ),
  ].filter(reachable);
  return dialogs[dialogs.length - 1] || null;
}

/**
 * The controls focus can step through now, in Tab's order: within the open
 * dialog when there is one, else the whole page.
 * @returns {HTMLElement[]}
 */
export function focusOrder() {
  const scope = openDialog() || document.body;
  const elements = getFocusableElements(scope).filter(reachable);
  // Tab visits positive tabindex values first, in their order, then the rest
  // in the document's order.
  const positive = elements
    .filter((el) => el.tabIndex > 0)
    .sort((a, b) => a.tabIndex - b.tabIndex);
  return [...positive, ...elements.filter((el) => !(el.tabIndex > 0))];
}

/**
 * Focus an element the way a keyboard would, its ring showing.
 * @param {HTMLElement} el
 */
function focusFromPad(el) {
  if (!el) return;
  el.setAttribute('data-focus-source', FOCUS_SOURCE);
  el.addEventListener(
    'blur',
    () => {
      if (el.getAttribute('data-focus-source') === FOCUS_SOURCE) {
        el.removeAttribute('data-focus-source');
      }
    },
    { once: true }
  );
  try {
    el.focus({ focusVisible: true });
  } catch (_unsupported) {
    el.focus();
  }
}

/**
 * @param {Object} [options]
 * @param {() => string[]} [options.getRegions] - selectors of the window's
 *   parts, in order
 * @param {() => boolean} [options.isPaused] - true while something else has
 *   the controller (by default, while the City Walk runs)
 * @param {() => void} [options.onUnhandledBack] - closes what is open when
 *   nothing takes the Escape that Back sends
 */
export function createGamepadNavigator({
  getRegions = () => DEFAULT_REGIONS,
  isPaused = cityWalkRunning,
  onUnhandledBack = () => {},
} = {}) {
  const step = (by) => {
    if (isPaused()) return;
    const order = focusOrder();
    if (!order.length) return;
    const at = order.indexOf(document.activeElement);
    const next =
      at < 0
        ? by > 0
          ? 0
          : order.length - 1
        : (at + by + order.length) % order.length;
    focusFromPad(order[next]);
  };

  /** The region parts that hold a reachable control now, in order. */
  const liveRegions = () =>
    getRegions()
      .map((selector) =>
        [...document.querySelectorAll(selector)].find(
          (el) => reachable(el) && focusOrder().some((c) => el.contains(c))
        )
      )
      .filter(Boolean);

  const jump = (by) => {
    if (isPaused()) return;
    if (openDialog()) {
      step(by);
      return;
    }
    const parts = liveRegions();
    if (!parts.length) return;
    const active = document.activeElement;
    const at = parts.findIndex((part) => part.contains(active));
    const next =
      at < 0
        ? by > 0
          ? 0
          : parts.length - 1
        : (at + by + parts.length) % parts.length;
    const first = focusOrder().find((c) => parts[next].contains(c));
    focusFromPad(first);
  };

  const keyTo = (target, key) =>
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        code: key,
        bubbles: true,
        cancelable: true,
      })
    );

  const clickById = (id) => {
    if (isPaused()) return;
    document.getElementById(id)?.click();
  };

  return {
    isPaused: () => isPaused(),
    next: () => step(1),
    previous: () => step(-1),
    nextRegion: () => jump(1),
    previousRegion: () => jump(-1),

    /** Press the focused control, as Enter or a click would. */
    activate() {
      if (isPaused()) return;
      const el = document.activeElement;
      if (!el || el === document.body) return;
      if (el instanceof HTMLSelectElement) return;
      if (
        el instanceof HTMLInputElement &&
        !['checkbox', 'radio', 'button', 'submit', 'reset', 'file'].includes(
          el.type
        )
      ) {
        return;
      }
      el.click();
    },

    /**
     * What Escape does where focus is; when nothing takes it, close what is
     * open.
     */
    back() {
      if (isPaused()) return;
      const taken = !keyTo(document.activeElement || document.body, 'Escape');
      if (!taken) onUnhandledBack();
    },

    /** Full Screen, as its button does. */
    fullScreen: () => clickById('focusModeBtn'),

    /** The keyboard shortcuts, as the Keys button opens them. */
    keys: () => clickById('shortcutsToggle'),

    /**
     * An arrow key to the focused control. A slider, a number box and a
     * list box are stepped directly, as their own arrow keys would.
     * @param {'up'|'down'|'left'|'right'} direction
     */
    arrow(direction) {
      if (isPaused()) return;
      const el = document.activeElement || document.body;
      const up = direction === 'up' || direction === 'right';
      if (
        el instanceof HTMLInputElement &&
        (el.type === 'range' || el.type === 'number')
      ) {
        const before = el.value;
        if (up) el.stepUp();
        else el.stepDown();
        if (el.value !== before) {
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
      }
      if (el instanceof HTMLSelectElement) {
        // A list box's Down moves to the next option.
        const forward = direction === 'down' || direction === 'right';
        const index = Math.min(
          el.options.length - 1,
          Math.max(0, el.selectedIndex + (forward ? 1 : -1))
        );
        if (index !== el.selectedIndex) {
          el.selectedIndex = index;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
      }
      const key = {
        up: 'ArrowUp',
        down: 'ArrowDown',
        left: 'ArrowLeft',
        right: 'ArrowRight',
      }[direction];
      keyTo(el, key);
    },
  };
}
