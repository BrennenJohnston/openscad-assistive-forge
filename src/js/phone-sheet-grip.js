/**
 * A grip on a phone sheet's edge: a finger or a mouse drags it, and the
 * arrow keys move it as they move the desktop divider (Shift for bigger
 * steps, Home and End for the ends). The Customizer's grip on its right edge
 * sets its width (axis x); the Preview Settings grip on its bottom edge sets
 * its height (axis y). The sheet keeps its own size and its saved share; the
 * grip only asks for a new size and tells assistive technology where it is.
 * @license GPL-3.0-or-later
 */

/** The arrow-key steps, in percent of the screen's size along the axis. */
const STEP = 2;
const BIG_STEP = 5;

/**
 * @typedef {Object} SheetGrip
 * @property {HTMLElement|null} grip
 * @property {'x'|'y'} axis - the direction the grip moves the sheet's edge
 * @property {() => {min: number, max: number}} bounds - the least and most
 *   the sheet may be, in px
 * @property {() => number} get - the sheet's size now, in px
 * @property {(px: number, options?: {save?: boolean}) => void} set - a new
 *   size, in px (the sheet keeps it within its bounds; saved unless told not
 *   to, as mid-drag)
 * @property {(px: number) => string} describe - the size in words, for the
 *   grip's value text
 * @property {() => number} [origin] - where the sheet's fixed edge is on the
 *   axis, in px from the screen's edge (0 when the sheet starts at it): a
 *   pointer's position less this is the size it asks for
 */

/**
 * @param {SheetGrip} parts
 * @returns {{update: () => void}} `update` rewrites the grip's value
 *   attributes from the sheet's size and bounds; the sheet calls it after
 *   it applies a size
 */
export function initSheetGrip({
  grip,
  axis,
  bounds,
  get,
  set,
  describe,
  origin = () => 0,
}) {
  const screen = () => (axis === 'x' ? window.innerWidth : window.innerHeight);
  const percent = (px) => Math.round((px / screen()) * 100);

  function update() {
    if (!grip) return;
    const { min, max } = bounds();
    const now = get();
    grip.setAttribute('aria-valuemin', String(percent(min)));
    grip.setAttribute('aria-valuemax', String(percent(max)));
    grip.setAttribute('aria-valuenow', String(percent(now)));
    grip.setAttribute('aria-valuetext', describe(now));
  }

  if (!grip) return { update };

  const [less, more] =
    axis === 'x' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
  grip.addEventListener('keydown', (event) => {
    const now = get();
    const { min, max } = bounds();
    const step = ((event.shiftKey ? BIG_STEP : STEP) / 100) * screen();
    const next = {
      [less]: now - step,
      [more]: now + step,
      Home: min,
      End: max,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    set(next);
  });

  // Where the pointer took hold, relative to the edge: the edge follows the
  // pointer from there, with no jump when the grip is taken off its middle.
  let dragging = false;
  let grab = 0;
  const position = (event) => (axis === 'x' ? event.clientX : event.clientY);
  grip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragging = true;
    grab = get() - (position(event) - origin());
    grip.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  grip.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    set(position(event) - origin() + grab, { save: false });
  });
  const endDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    grip.releasePointerCapture?.(event.pointerId);
    set(get(), { save: true });
  };
  grip.addEventListener('pointerup', endDrag);
  grip.addEventListener('pointercancel', endDrag);

  return { update };
}
