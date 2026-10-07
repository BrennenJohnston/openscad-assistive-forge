/**
 * The one rule for a conversion that starts itself.
 *
 * A picture may be converted without a press only when it is small and the
 * quick look calls it quick. Both, because a small picture on a very slow
 * phone is not quick, and the whole point is not to start work nobody asked
 * for on a device that cannot afford it. Every way a conversion could start
 * by itself asks here - choosing a file and changing a setting on the ink
 * panel alike - so no road starts work this rule would refuse.
 *
 * @license GPL-3.0-or-later
 */

/** At most 0.5 MP may start by itself. */
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
