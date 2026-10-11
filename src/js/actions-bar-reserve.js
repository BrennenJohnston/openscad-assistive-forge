/**
 * The room the page leaves under its content for the Actions bar.
 *
 * On a phone the bar is fixed to the bottom of the screen and holds two rows
 * (Actions and Camera, then the main button), and larger text or zoom makes
 * it taller still. A reserve made of fixed sizes came up short, and the
 * preview's messages bar sat underneath it. This keeps `--actions-bar-reserved`
 * equal to the bar's real height while the bar is fixed.
 *
 * @license GPL-3.0-or-later
 */

/**
 * @param {HTMLElement|null} bar - The Actions bar
 * @param {HTMLElement} [root] - Where the custom property is written
 * @returns {() => void} Stops watching
 */
export function reserveSpaceForActionsBar(
  bar,
  root = document.documentElement
) {
  if (!bar) return () => {};
  const update = () => {
    if (getComputedStyle(bar).position === 'fixed') {
      const height = Math.ceil(bar.getBoundingClientRect().height);
      root.style.setProperty('--actions-bar-reserved', `${height}px`);
    } else {
      root.style.removeProperty('--actions-bar-reserved');
    }
  };
  const observer =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
  observer?.observe(bar);
  window.addEventListener('resize', update);
  update();
  return () => {
    observer?.disconnect();
    window.removeEventListener('resize', update);
  };
}
