/**
 * The mobile toolbar's fourth row, reclaimed.
 *
 * With a project open at 412px the app would spend four stacked rows (147px
 * in Simplified, 187px in Standard) before any content, and one of them is
 * a 54px row holding four 44px icons in a 396px width. The Customizer row
 * below it has 218px of free space once its visible heading stands down.
 * So the four app-chrome controls (high contrast, theme, Full Screen, Help)
 * move there, and the row they leave collapses.
 *
 * Measured at 412x915 and 412x810, project surface, both densities:
 *   Simplified  147px -> 93px    Standard  187px -> 135px
 *
 * The whole `.workflow-actions` container moves, not its children: its own
 * rules give those buttons their 44px minimum and their icon-only treatment
 * below 600px, and a container that travels with them keeps every one of
 * those rules attached.
 *
 * Two conditions, both necessary:
 *
 *  - Mobile-shaped, by `isViewportDesktopShaped()`: the same predicate the
 *    Classic gate and the first-visit modal use. The app carries one
 *    definition of "mobile"; a media query cannot express "at least 1024
 *    wide and not portrait", and a second breakpoint is the cross-file
 *    drift this project keeps paying for.
 *
 *  - Project surface. The Customizer row does not exist on the welcome
 *    screen, and components.css force-shows the workflow row there precisely
 *    so high contrast and theme stay reachable before a file is open. Moving
 *    the controls into a row that is not on screen would take them away on
 *    the first screen a low-vision user meets.
 *
 * Nothing is hidden and nothing shrinks: every control keeps its 44px box,
 * its accessible name, its tab position within the row and its focus ring, so
 * every tour step that spotlights one of them still finds it.
 *
 * @license GPL-3.0-or-later
 */

import {
  isViewportDesktopShaped,
  subscribeViewportShape,
} from './classic-availability.js';
import { onAppSurfaceChange } from './app-surface.js';
import { SIDEWAYS_PHONE_QUERY } from './phone-drawers.js';

/** @type {{ parent: HTMLElement, nextSibling: Node|null }|null} */
let home = null;

/** Where each first-row control lives off a phone, recorded on its first move. */
const firstRowHomes = new Map();

/** Where the menu bar lives when it is not in the settings row. */
let menuBarHome = null;

function shouldRelocate() {
  return (
    !isViewportDesktopShaped() && document.body.dataset.appSurface === 'project'
  );
}

/**
 * Move the row, then put focus back where it was. Re-parenting a focused
 * element is not guaranteed to keep focus, and a keyboard user who crosses
 * the breakpoint mid-row must not be dropped on <body>.
 * @param {HTMLElement} actions
 * @param {HTMLElement} parent
 * @param {Node|null} before
 */
function moveWithFocus(actions, parent, before) {
  const active = document.activeElement;
  const hadFocus = active instanceof HTMLElement && actions.contains(active);
  parent.insertBefore(actions, before);
  if (hadFocus && document.activeElement !== active) active.focus();
}

/**
 * The header's first row on a phone: the Customizer button leads it, then
 * Main Page, then the Simplified/Standard switch ahead of GitHub and Keys,
 * so the order on screen is the tab order. Its old place in the Customizer
 * row is what leaves that row room. layout.css makes the five fit 412px.
 * @param {boolean} relocate
 */
function placeFirstRow(relocate) {
  const header = document.querySelector('.header-content');
  const controls = document.querySelector('.header-controls');
  const moves = [
    [
      document.getElementById('mobileDrawerToggle'),
      header,
      document.getElementById('clearFileBtn'),
    ],
    [
      document.getElementById('uiModeToggle'),
      controls,
      controls?.querySelector(':scope > .github-link'),
    ],
  ];
  for (const [el, parent, before] of moves) {
    if (!el || !parent || !before) continue;
    if (!firstRowHomes.has(el)) {
      firstRowHomes.set(el, {
        parent: el.parentElement,
        nextSibling: el.nextSibling,
      });
    }
    const back = firstRowHomes.get(el);
    if (relocate) {
      if (el.nextSibling !== before) moveWithFocus(el, parent, before);
    } else if (
      el.parentElement !== back.parent ||
      el.nextSibling !== back.nextSibling
    ) {
      moveWithFocus(el, back.parent, back.nextSibling);
    }
  }
}

/**
 * A phone held sideways is short: the menu bar joins the Preview Settings
 * row, at its left ahead of the row's own toggle, so the order on screen is
 * the tab order it always had and the preview gains the menu bar's row.
 * layout.css lays the row out.
 * @param {boolean} relocate
 * @returns {boolean} Whether the menu bar is in the settings row
 */
function placeMenuBar(relocate) {
  const bar = document.getElementById('toolbarMenuBar');
  const row = document.querySelector('.preview-drawer-header');
  if (!bar || !row) return false;
  if (!menuBarHome) {
    menuBarHome = { parent: bar.parentElement, nextSibling: bar.nextSibling };
  }
  const merge = relocate && window.matchMedia(SIDEWAYS_PHONE_QUERY).matches;
  if (merge) {
    if (bar.parentElement !== row) {
      moveWithFocus(bar, row, row.firstElementChild);
    }
  } else if (bar.parentElement !== menuBarHome.parent) {
    moveWithFocus(bar, menuBarHome.parent, menuBarHome.nextSibling);
  }
  return merge;
}

/**
 * Put the row where the current viewport and surface say it belongs.
 * Safe to call at any time and as often as you like.
 */
export function applyMobileToolbar() {
  const actions = document.querySelector('.workflow-actions');
  if (!actions) return;

  if (!home) {
    home = { parent: actions.parentElement, nextSibling: actions.nextSibling };
  }

  const target = document.querySelector('.preview-drawer-header-right');
  const relocate = Boolean(target) && shouldRelocate();

  if (relocate) {
    if (actions.parentElement !== target) moveWithFocus(actions, target, null);
  } else if (home.parent && actions.parentElement !== home.parent) {
    moveWithFocus(actions, home.parent, home.nextSibling);
  }
  placeFirstRow(relocate);
  document.body.dataset.menuBar = placeMenuBar(relocate)
    ? 'settings-row'
    : 'home';

  // The visible heading is what pays for the four controls. It stays in the
  // DOM and keeps naming #previewInfoContent through aria-labelledby, so the
  // region's accessible name is untouched. The app's own .sr-only is used
  // rather than a copy of its declarations, so the technique has one owner.
  document
    .querySelector('.preview-drawer-title')
    ?.classList.toggle('sr-only', relocate);

  // The CSS reads this rather than re-deriving the predicate: one owner for
  // the decision, one attribute for every rule that follows from it.
  document.body.dataset.mobileToolbar = relocate ? 'relocated' : 'home';
}

/**
 * Wire the row to the two things that can change its answer.
 */
export function initMobileToolbar() {
  applyMobileToolbar();
  subscribeViewportShape(applyMobileToolbar);
  onAppSurfaceChange(applyMobileToolbar);
  // Turning a phone changes the answer without changing the viewport's
  // desktop shape.
  window
    .matchMedia(SIDEWAYS_PHONE_QUERY)
    .addEventListener('change', applyMobileToolbar);
}
