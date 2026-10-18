/**
 * The Lens drawer on a desktop: the Alt View's four sliders (Edges, Focus,
 * Glow and Surfaces) in a drawer that rises from the actions bar's row,
 * its toggle just left of Generate, the way Preview Settings & Info drops
 * from its row at the top. Closed, only the toggle shows; open, the drawer
 * lies over the bottom of the preview, as tall as its sliders. It is shown
 * only while the Alt View is on (hfm-controller.js shows and hides it); on
 * a phone the bar's own Lens drawer serves instead (layout.css hides this
 * one there).
 * @license GPL-3.0-or-later
 */

import { getDrawerStateKey, safeGetItem, safeSetItem } from './storage-keys.js';
import { registerLookDrawer, slideDrawer } from './drawer-motion.js';

const STORAGE_KEY_DRAWER_COLLAPSED = getDrawerStateKey('lens');

/**
 * Wire the desktop Lens drawer. Safe where the page has none.
 * @returns {{open: Function, close: Function, isOpen: () => boolean}|null}
 */
export function initLensDrawer() {
  const toggleBtn = document.getElementById('lensDrawerToggle');
  const drawer = document.getElementById('lensDrawer');
  const body = document.getElementById('lensDrawerBody');
  if (!toggleBtn || !drawer || !body) return null;

  let isOpen = false;

  // The drawer slides up out from under the bar as one piece, its own
  // height the way it travels, the part still under the bar clipped.
  const slideParts = () => [{ el: drawer }];

  const updateToggle = (expanded) => {
    toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggleBtn.setAttribute(
      'aria-label',
      expanded ? 'Collapse Lens controls' : 'Expand Lens controls'
    );
  };

  const open = ({ instant = false, remember = true } = {}) => {
    if (isOpen) return;
    isOpen = true;
    drawer.classList.remove('collapsed');
    updateToggle(true);
    if (remember) safeSetItem(STORAGE_KEY_DRAWER_COLLAPSED, 'false');
    return slideDrawer(slideParts(), {
      from: 'bottom',
      open: true,
      instant,
      name: 'lens',
    });
  };

  const close = ({ instant = false, remember = true } = {}) => {
    if (!isOpen) return;
    isOpen = false;
    updateToggle(false);
    if (remember) safeSetItem(STORAGE_KEY_DRAWER_COLLAPSED, 'true');
    return slideDrawer(slideParts(), {
      from: 'bottom',
      open: false,
      instant,
      name: 'lens',
      inert: [body],
      whenClosed: () => {
        if (!isOpen) drawer.classList.add('collapsed');
      },
    });
  };

  toggleBtn.addEventListener('click', (event) => {
    event.preventDefault();
    if (isOpen) close();
    else open();
  });
  // Escape in the drawer closes it and puts the focus back on its toggle.
  drawer.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen) return;
    event.stopPropagation();
    close();
    toggleBtn.focus();
  });

  registerLookDrawer('lens', {
    place: () => drawer,
    isOpen: () => isOpen && drawer.offsetHeight > 0,
    open,
    close,
  });

  // A drawer left open last time opens again, with no motion.
  if (safeGetItem(STORAGE_KEY_DRAWER_COLLAPSED) === 'false') {
    open({ instant: true, remember: false });
  }

  return { open, close, isOpen: () => isOpen };
}
