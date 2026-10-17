/**
 * Whether an OpenSCAD file only defines things: at least one module or
 * function, and nothing at its top level that draws. Such a file is a
 * library, meant to be used by another file, and its empty result is not a
 * missing option.
 *
 * It reads the top level with a small scanner, not a parser: comments and
 * string literals are set aside, the source is cut into statements at the
 * semicolons and closing braces that sit outside any bracket, and each
 * statement is a declaration (`module`, `function`), a `use` or `include`,
 * an assignment, or something that draws. Its limits: a statement it cannot
 * name counts as drawing, so an odd file is never called a library.
 *
 * @license GPL-3.0-or-later
 */

/** The source with comments and string contents blanked out. */
function blankCommentsAndStrings(source) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end < 0 ? source.length : end + 2;
      out += ' ';
      continue;
    }
    if (c === '"') {
      out += '""';
      i += 1;
      while (i < source.length && source[i] !== '"') {
        i += source[i] === '\\' ? 2 : 1;
      }
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** The top-level statements, each as written. */
function topLevelStatements(code) {
  const statements = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < code.length; i += 1) {
    const c = code[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        statements.push(code.slice(start, i + 1));
        start = i + 1;
      }
    } else if (c === ';' && depth === 0) {
      statements.push(code.slice(start, i + 1));
      start = i + 1;
    }
  }
  statements.push(code.slice(start));
  return statements.map((s) => s.trim()).filter(Boolean);
}

const USE_OR_INCLUDE = /^(use|include)\s*<[^>]*>\s*;?$/;
const DECLARATION = /^(module|function)\s+[A-Za-z_$][\w$]*\s*\(/;
const ASSIGNMENT = /^[A-Za-z_$][\w$]*\s*=(?!=)/;

/**
 * @param {string} source - the file's OpenSCAD source
 * @returns {boolean} true when it defines a module or function and draws
 *   nothing at its top level
 */
export function isLibraryOnlySource(source) {
  if (typeof source !== 'string' || !source.trim()) return false;
  // A use or include line has no semicolon of its own; cut them out first.
  const code = blankCommentsAndStrings(source)
    .split('\n')
    .filter((line) => !USE_OR_INCLUDE.test(line.trim()))
    .join('\n');
  let declarations = 0;
  for (const statement of topLevelStatements(code)) {
    if (DECLARATION.test(statement)) {
      declarations += 1;
    } else if (!ASSIGNMENT.test(statement)) {
      return false;
    }
  }
  return declarations > 0;
}
