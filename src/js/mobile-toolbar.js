/**
 * U-46 / Q-73a: the mobile toolbar's fourth row, reclaimed.
 *
 * With a project open at 412px the app spent four stacked rows — 147px in
 * Simplified, 187px in Standard — before any content, and one of them was a
 * 54px row holding four 44px icons in a 396px width. The Customizer row below
 * it had 218px of free space once its visible heading stood down. So the four
 * app-chrome controls (high contrast, theme, Full Screen, Help) move there,
 * and the row they leave collapses.
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
 *  - MOBILE-SHAPED, by `isViewportDesktopShaped()` — the same predicate the
 *    Classic gate and UF-41's first-visit modal ride. Q-73c settled that the
 *    app carries ONE definition of "mobile"; a media query cannot express
 *    "at least 1024 wide AND not portrait" and a second breakpoint is the
 *    cross-file drift this project keeps paying for.
 *
 *  - PROJECT SURFACE. The Customizer row does not exist on the welcome
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

/** @type {{ parent: HTMLElement, nextSibling: Node|null }|null} */
let home = null;

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
}
