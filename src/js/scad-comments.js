/**
 * Comment masking for OpenSCAD source, shared by the code that looks for
 * include/use/import directives: the render worker's missing-file warnings
 * and the upload dependency check.
 *
 * @license GPL-3.0-or-later
 */

/**
 * Blank out // and block comments, which OpenSCAD never reads directives
 * from (D-198, D-201). String literals are copied whole, so a // or /* inside
 * one starts no comment, and a quoted directive path is still found.
 *
 * @param {string} scadContent
 * @returns {string}
 */
export function withoutComments(scadContent) {
  let out = '';
  let i = 0;
  const n = scadContent.length;
  while (i < n) {
    const ch = scadContent[i];
    const next = scadContent[i + 1];
    if (ch === '"') {
      let j = i + 1;
      while (j < n && scadContent[j] !== '"') {
        j += scadContent[j] === '\\' ? 2 : 1;
      }
      out += scadContent.slice(i, j + 1);
      i = j + 1;
    } else if (ch === '/' && next === '/') {
      const end = scadContent.indexOf('\n', i);
      i = end === -1 ? n : end;
    } else if (ch === '/' && next === '*') {
      const end = scadContent.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      out += ' ';
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}
