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
  let match;

  while ((match = directiveRegex.exec(scadContent)) !== null) {
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
