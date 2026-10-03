/**
 * Six-key braille entry, as on a Perkins brailler: f, d and s are dots 1,
 * 2 and 3, j, k and l are dots 4, 5 and 6, and keys held together make one
 * cell when the last of them is released; Space alone makes a blank cell.
 * Keys are read by their physical place (`KeyboardEvent.code`), so the home
 * row works on any keyboard layout. No DOM.
 *
 * @license GPL-3.0-or-later
 */

/** Each key's dot, as the bit it sets in a cell (dot n sets bit n - 1). */
const DOT_BITS = new Map([
  ['KeyF', 1],
  ['KeyD', 2],
  ['KeyS', 4],
  ['KeyJ', 8],
  ['KeyK', 16],
  ['KeyL', 32],
  ['Space', 0],
]);

const BRAILLE_FIRST = 0x2800;

/**
 * A chord in progress, fed with key events.
 * @returns {{
 *   keyDown: (event: { code: string, repeat?: boolean, ctrlKey?: boolean,
 *     altKey?: boolean, metaKey?: boolean, isComposing?: boolean }) => boolean,
 *   keyUp: (event: { code: string }) => string | null,
 *   reset: () => void,
 * }} `keyDown` says whether the key belongs to six-key entry (the caller
 *   then keeps it from typing); `keyUp` gives the cell when the last key of
 *   a chord is released
 */
export function createSixKeyEntry() {
  const held = new Set();
  let bits = 0;
  return {
    keyDown(event) {
      if (!DOT_BITS.has(event.code)) return false;
      if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) {
        return false;
      }
      if (!event.repeat) {
        held.add(event.code);
        bits |= DOT_BITS.get(event.code);
      }
      return true;
    },
    keyUp(event) {
      if (!held.delete(event.code) || held.size > 0) return null;
      const cell = String.fromCharCode(BRAILLE_FIRST + bits);
      bits = 0;
      return cell;
    },
    reset() {
      held.clear();
      bits = 0;
    },
  };
}

/**
 * What a screen reader is told for a cell typed with six keys: its dots, or
 * "space" for the blank cell.
 * @param {string} cell - One Unicode braille cell
 * @returns {string}
 */
export function describeCell(cell) {
  const bits = cell.codePointAt(0) - BRAILLE_FIRST;
  if (bits === 0) return 'space';
  const dots = [1, 2, 3, 4, 5, 6, 7, 8].filter(
    (dot) => bits & (1 << (dot - 1))
  );
  return `dots ${dots.join(' ')}`;
}
