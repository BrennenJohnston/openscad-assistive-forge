/**
 * Synthetic missing-file warnings — pure logic shared by the render worker
 * and tests.
 *
 * Extracted from openscad-worker.js so unit tests exercise the real
 * implementation instead of a mirrored copy.
 *
 * @license GPL-3.0-or-later
 */

/**
 * Blank out // and block comments, which OpenSCAD never reads directives
 * from (D-198). String literals are copied whole, so a // or /* inside one
 * starts no comment, and a quoted directive path is still found.
 *
 * @param {string} scadContent
 * @returns {string}
 */
function withoutComments(scadContent) {
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

/**
 * Scan SCAD source for include/use directives and return desktop-format
 * warnings for any referenced files that cannot be found.
 *
 * Desktop OpenSCAD emits "WARNING: Can't open include file ..." when a
 * referenced companion file is missing. The WASM build silently ignores
 * missing includes. This function generates equivalent synthetic warnings
 * so the user sees actionable feedback in the console panel.
 *
 * @param {string} scadContent - Raw SCAD source code
 * @param {(filename: string) => boolean} fileExistsFn - Returns true if the
 *   referenced filename can be resolved in the virtual filesystem
 * @returns {string[]} Array of desktop-format warning strings
 */
export function generateMissingFileWarnings(scadContent, fileExistsFn) {
  const warnings = [];
  const seen = new Set();
  const directiveRegex = /(?:include|use)\s*(?:<([^>]+)>|"([^"]+)")/g;
  const source = withoutComments(scadContent);
  let match;

  while ((match = directiveRegex.exec(source)) !== null) {
    const refFile = (match[1] || match[2]).trim();
    if (!refFile || seen.has(refFile)) continue;
    seen.add(refFile);

    if (!fileExistsFn(refFile)) {
      warnings.push(
        `WARNING: Can't open include file '${refFile}', import file '${refFile}'.`
      );
    }
  }

  return warnings;
}
