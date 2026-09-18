/**
 * The one rule for a conversion that starts itself (DP-Q32; DP-57, D-157).
 *
 * A picture may be converted without a press only when it is small AND the
 * quick look calls it quick. Both, because a small picture on a very slow
 * phone is not quick, and the whole point is not to start work nobody asked
 * for on a device that cannot afford it. The rule used to live inline where a
 * file is chosen and nowhere else, so a setting changed on the ink panel
 * re-ran the conversion by itself on any picture at any speed (MEASURED at 6x
 * on a phone-sized page: Colors chosen, a conversion running 300 ms later, on
 * a picture the same rule had just refused to start by itself). Now every way
 * a conversion could start by itself asks here.
 *
 * @license GPL-3.0-or-later
 */

/** The owner's number, signed at DP-Q32: at most 0.5 MP may start by itself. */
export const AUTO_START_MAX_PIXELS = 500_000;

/**
 * @param {object} facts
 * @param {number} facts.pixelCount - The picture's pixels, width times height
 * @param {string} [facts.costBand] - The quick look's band ('quick' or slower)
 * @param {boolean} [facts.asked] - Somebody already pressed for this (the
 *   overlay's "Use as design"): a press is a press, whatever the picture
 * @returns {boolean} Whether the conversion may begin without a press
 */
export function startsBySelf({ pixelCount, costBand, asked = false } = {}) {
  if (asked) return true;
  return (
    Number.isFinite(pixelCount) &&
    pixelCount <= AUTO_START_MAX_PIXELS &&
    costBand === 'quick'
  );
}
