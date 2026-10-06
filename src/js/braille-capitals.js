/**
 * Capitals in a sign's braille. ADA 703.3.1 gives sign braille a capital only
 * before the first word of a sentence, names, single letters, initials and
 * acronyms, and nothing else, whatever the print shows. Software cannot tell
 * a name from an ordinary word, so the rule keeps the one kind it can: a
 * capital letter standing alone, with no letter right before or after it (the
 * B of 3B, the C of Wing C, the J of J. Smith). Every other letter is
 * lowercased. The Braille Authority of North America's signage examples come
 * out as it prints them.
 *
 * @license GPL-3.0-or-later
 */

const LETTER = /\p{L}/u;
const MARK = /\p{M}/u;
const UPPERCASE = /\p{Lu}/u;

/**
 * Whether the nearest character on one side is a letter. Combining marks
 * belong to the letter before them, so an accent typed as its own mark does
 * not make its letter stand alone.
 * @param {string[]} chars
 * @param {number} index
 * @param {-1|1} step - -1 looks before, 1 after
 * @returns {boolean}
 */
function letterBeside(chars, index, step) {
  for (let i = index + step; i >= 0 && i < chars.length; i += step) {
    if (!MARK.test(chars[i])) return LETTER.test(chars[i]);
  }
  return false;
}

/**
 * Lowercase every letter except a capital standing alone.
 * @param {string} text - The sign's text as typed
 * @returns {string}
 */
export function adaSignCapitals(text) {
  const chars = [...text];
  return chars
    .map((ch, i) =>
      UPPERCASE.test(ch) &&
      !letterBeside(chars, i, -1) &&
      !letterBeside(chars, i, 1)
        ? ch
        : ch.toLowerCase()
    )
    .join('');
}
