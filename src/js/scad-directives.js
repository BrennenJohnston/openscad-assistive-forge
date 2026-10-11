/**
 * What OpenSCAD source names in its include and use statements, read the
 * same way wherever the app looks: the render worker's missing-file
 * warnings, the dependency check before a project opens, the ZIP scan and
 * the library detector.
 *
 * @license GPL-3.0-or-later
 */

/**
 * The include and use statements, in order. The angled form is OpenSCAD's
 * own, and OpenSCAD reads it wherever the word stands whole, two to a line
 * included. The quoted form is not OpenSCAD's but the app has always taken
 * it; since a quote also opens a string, it counts only as a statement of its
 * own (at a line's start or after `;`, `{` or `}`). Without the whole word,
 * `color("Chartreuse")` read as `use "..."` up to the next quote, and a run
 * of code was reported as a missing file. Nothing inside a string counts, as
 * in OpenSCAD: `echo("include <a.txt>")` names no file. Comments are the
 * caller's to strip first (withoutComments in scad-comments.js).
 *
 * @param {string} source - OpenSCAD source
 * @returns {{ kind: 'include'|'use', path: string }[]}
 */
export function includeStatements(source) {
  const statements = [];
  if (!source) return statements;
  const masked = blankStrings(source);
  const pattern =
    /(?<![\w$])(include|use)\s*<([^\t\r\n>]+)>|(?:^|[;{}])[ \t]*(include|use)\b[ \t]*"([^"\n]*)"/gm;
  let match;
  while ((match = pattern.exec(masked)) !== null) {
    let path;
    if (match[2] !== undefined) {
      path = match[2];
    } else {
      // The quoted path was blanked with the string; read it from the source.
      const close = match.index + match[0].length - 1;
      path = source.slice(close - match[4].length, close);
    }
    path = path.trim();
    if (path) statements.push({ kind: match[1] || match[3], path });
  }
  return statements;
}

// Same length and same quotes, every character inside a string a space
// (line breaks kept), so positions in the result are positions in the source.
function blankStrings(source) {
  let out = '';
  let i = 0;
  const n = source.length;
  while (i < n) {
    if (source[i] !== '"') {
      out += source[i];
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < n && source[j] !== '"') {
      j += source[j] === '\\' ? 2 : 1;
    }
    const end = Math.min(j, n);
    out += '"' + source.slice(i + 1, end).replace(/[^\n]/g, ' ');
    if (j < n) out += '"';
    i = j + 1;
  }
  return out;
}

/**
 * Patterns for the files an `import(str(...))` may name at run time, from
 * the literal pieces of its `str()`: `str("frog_", n, ".stl")` reaches
 * `frog_1.stl`, `frog_12.stl` and so on. Each pattern matches a path's last
 * segment; an import whose name has no literal piece gives none.
 *
 * @param {string} source - OpenSCAD source, comments stripped
 * @returns {string[]} RegExp sources, to be compiled case-insensitively
 */
export function computedImportPatterns(source) {
  const patterns = [];
  if (!source) return patterns;
  const call = /\bimport\s*\(\s*str\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
  let match;
  while ((match = call.exec(source)) !== null) {
    const pieces = [...match[1].matchAll(/"([^"\n]*)"|'([^'\n]*)'/g)].map(
      (m) => m[1] ?? m[2]
    );
    if (pieces.length === 0) continue;
    const escaped = pieces.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = `(?:^|/)${escaped.join('[^/]*')}$`;
    if (!patterns.includes(pattern)) patterns.push(pattern);
  }
  return patterns;
}
