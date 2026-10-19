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

/**
 * A part of the window the triggers move between: where it is, and the
 * controls that only show or hide it (its toggle), which a jump passes over
 * when the part has anything else to reach. A plain selector is a part with
 * no toggle.
 * @typedef {{selector: string, toggle?: string}|string} Region
 */

/** The parts of the window, in order, as a desktop or a phone shows them. */
export const DEFAULT_REGIONS = [
  '.app-header',
  '#toolbarMenuBar',
  '.workflow-actions',
  {
    selector: '#paramPanel',
    toggle: '#collapseParamPanelBtn, #mobileDrawerToggle, #drawerCloseBtn',
  },
  { selector: '#previewInfoSection', toggle: '#previewDrawerToggle' },
  '#previewContainer',
  {
    selector: '#cameraPanel, #cameraDrawer',
    toggle: '#cameraPanelToggle, #cameraDrawerToggle',
  },
  {
    selector: '#lensDrawer, #asciiDrawer',
    toggle: '#lensDrawerToggle, #asciiDrawerToggle',
  },
  '#actionsBar',
  { selector: '#echoDrawer', toggle: '#echoDrawerToggle' },
];

/** A Classic pane's own buttons: move, stow, hide. */
const PANE_BUTTONS = '.classic-pane-titlebar, .classic-pane-titlebar *';

/** The parts of the window in the Classic interface, in order. */
export const CLASSIC_REGIONS = [
  '.app-header',
  '#toolbarMenuBar',
  '#classicToolbar',
  { selector: '#classicEditorSlot', toggle: PANE_BUTTONS },
  { selector: '#paramPanel', toggle: PANE_BUTTONS },
  '#previewContainer',
  '#classicCameraBar',
  { selector: '#classicBottomStrip', toggle: PANE_BUTTONS },
  '#classicStatusBar',
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
 * The parts that hold a reachable control now, in order, each with the
 * controls it owns. A control inside two parts belongs to the inner one, so
 * a part nested in another (on a phone the theme row stands in the Preview
 * Settings row) is visited for itself, right after the part that holds it,
 * and nothing twice.
 * @param {Region[]} regions
 * @param {HTMLElement[]} order
 * @returns {{el: Element, toggle: string|null, controls: HTMLElement[]}[]}
 */
function liveParts(regions, order) {
  const parts = regions
    .map((region) =>
      typeof region === 'string' ? { selector: region } : region
    )
    .map(({ selector, toggle = null }) => ({
      el: [...document.querySelectorAll(selector)].find(
        (el) => reachable(el) && order.some((c) => el.contains(c))
      ),
      toggle,
      controls: [],
    }))
    .filter((part) => part.el);
  for (const control of order) {
    let owner = null;
    for (const part of parts) {
      if (part.el.contains(control) && (!owner || owner.el.contains(part.el))) {
        owner = part;
      }
    }
    owner?.controls.push(control);
  }
  const live = parts.filter((part) => part.controls.length > 0);
  const holderOf = (part) =>
    live
      .filter((other) => other !== part && other.el.contains(part.el))
      .reduce(
        (inner, other) =>
          inner?.el.contains(other.el) ? other : (inner ?? other),
        null
      );
  const ordered = [];
  const place = (part) => {
    ordered.push(part);
    live.filter((other) => holderOf(other) === part).forEach(place);
  };
  live.filter((part) => !holderOf(part)).forEach(place);
  return ordered;
}

/**
 * Where a jump into a part lands: its first control that is not its toggle,
 * or the toggle when nothing else of the part shows (a closed drawer).
 * @param {{toggle: string|null, controls: HTMLElement[]}} part
 * @returns {HTMLElement}
 */
function landingOf(part) {
  return (
    part.controls.find((c) => !(part.toggle && c.matches(part.toggle))) ||
    part.controls[0]
  );
}

/**
 * @param {Object} [options]
 * @param {() => Region[]} [options.getRegions] - the window's parts, in
 *   order
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

  const jump = (by) => {
    if (isPaused()) return;
    if (openDialog()) {
      step(by);
      return;
    }
    const parts = liveParts(getRegions(), focusOrder());
    if (!parts.length) return;
    const active = document.activeElement;
    let at = parts.findIndex((part) => part.controls.includes(active));
    if (at < 0) at = parts.findIndex((part) => part.el.contains(active));
    const next =
      at < 0
        ? by > 0
          ? 0
          : parts.length - 1
        : (at + by + parts.length) % parts.length;
    focusFromPad(landingOf(parts[next]));
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

  // The previous or next of a list, from its first (or its last) when
  // focus is elsewhere, round again.
  const walk = (list, by) => {
    if (!list.length) return;
    const at = list.indexOf(document.activeElement);
    const next =
      at < 0
        ? by > 0
          ? 0
          : list.length - 1
        : (at + by + list.length) % list.length;
    focusFromPad(list[next]);
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

    /**
     * The previous or next parameter in the Customizer, as Tab reaches
     * them: the fields and lists in its parameter rows, from the first (or
     * the last) when focus is elsewhere, round again. A closed group's
     * parameters are out of reach until it is opened.
     * @param {-1|1} by
     */
    parameter(by) {
      if (isPaused()) return;
      walk(
        focusOrder().filter(
          (el) =>
            /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) &&
            el.closest('#parametersContainer .param-control') &&
            !el.closest('details:not([open])')
        ),
        by
      );
    },

    /**
     * The previous or next parameter group in the Customizer, by its
     * header, round again.
     * @param {-1|1} by
     */
    group(by) {
      if (isPaused()) return;
      walk(
        [
          ...document.querySelectorAll(
            '#parametersContainer .param-group > summary'
          ),
        ].filter(reachable),
        by
      );
    },

    /** The focused parameter back to its default, by its own reset button. */
    resetParameter() {
      if (isPaused()) return;
      const name =
        document.activeElement?.closest('[data-param-name]')?.dataset.paramName;
      if (!name) return;
      for (const button of document.querySelectorAll('.param-reset-btn')) {
        if (button.dataset.paramName === name) {
          button.click();
          return;
        }
      }
    },

    /** Generate, as its button does. */
    generate: () => clickById('primaryActionBtn'),
  };
}
