/**
 * One drawer at a time on a phone.
 *
 * On a phone the Customizer, Preview Settings & Info, the camera drawer and
 * the Alt View's ASCII drawer each cover part of the preview, and the camera
 * and ASCII drawers open into the same space. So opening one first closes
 * whichever other one is open, and the one asked for then opens. On a
 * desktop window the panels sit side by side and none of this applies.
 *
 * The measures the phone drawers share live here too: how tall the preview
 * stays while a sheet is open, and where a sideways column starts.
 * @license GPL-3.0-or-later
 */

/** The phone layout: under the width the stylesheets switch at (767px). */
const DESKTOP_MIN_WIDTH_PX = 768;

/**
 * A phone held sideways: a touch screen, landscape, a phone's height. It can
 * be wider than a small desktop window; layout.css uses the same query.
 */
export const SIDEWAYS_PHONE_QUERY =
  '(orientation: landscape) and (pointer: coarse) and (max-height: 500px)';

/**
 * @returns {boolean} True when the page is on a phone held sideways.
 */
export function isSidewaysPhone() {
  return window.matchMedia(SIDEWAYS_PHONE_QUERY).matches;
}

/** @type {Map<string, {isOpen: () => boolean, close: (options?: {restoreFocus?: boolean}) => void}>} */
const drawers = new Map();

/**
 * @returns {boolean} True when the page is in its phone layout.
 */
export function isPhoneLayout() {
  return window.innerWidth < DESKTOP_MIN_WIDTH_PX;
}

/**
 * Make a drawer known, so another drawer's opening can close it.
 * @param {string} name
 * @param {{isOpen: () => boolean, close: (options?: {restoreFocus?: boolean}) => void}} drawer
 */
export function registerPhoneDrawer(name, drawer) {
  drawers.set(name, drawer);
}

/**
 * Close every open drawer but the named one, on a phone only. Focus stays
 * where it is: on the control that is opening the named drawer. Answers
 * once every close has ended (a close that slides answers with its slide),
 * so an opener can wait before it measures anything a close still moves;
 * the opener's own slide need not wait.
 * @param {string} name - The drawer about to open
 * @returns {Promise<PromiseSettledResult<unknown>[]>}
 */
export function closeOtherPhoneDrawers(name) {
  const closes = [];
  if (isPhoneLayout()) {
    for (const [other, drawer] of drawers) {
      if (other !== name && drawer.isOpen()) {
        closes.push(drawer.close({ restoreFocus: false }));
      }
    }
  }
  return Promise.allSettled(
    closes.filter((c) => c && typeof c.then === 'function')
  );
}

/**
 * Close one named drawer if it is open.
 * @param {string} name
 */
export function closePhoneDrawer(name) {
  const drawer = drawers.get(name);
  if (drawer?.isOpen()) drawer.close({ restoreFocus: false });
}

/**
 * How tall the preview stays while a sheet is open on a phone: half the
 * screen's height, and a sliver more (the small spacing token) so it never
 * reads as less than half.
 * @returns {number} px
 */
export function previewKeepsPx() {
  const sliver = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--space-sm')
  );
  return Math.ceil(window.innerHeight / 2 + (sliver || 0));
}

/**
 * Held sideways, a drawer opens as a column from the preview's top down
 * (layout.css); the column starts below the preview's own header row.
 */
export function placeDrawerColumnTop() {
  const header = document.querySelector('.preview-drawer-header');
  const top = header ? header.getBoundingClientRect().bottom : 0;
  document.documentElement.style.setProperty(
    '--phone-drawer-top',
    `${Math.max(0, Math.round(top))}px`
  );
}
