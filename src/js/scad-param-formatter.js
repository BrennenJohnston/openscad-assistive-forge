/**
 * OpenSCAD Parameter Formatting — Single Source of Truth
 *
 * Provides the canonical formatting logic for converting JavaScript parameter
 * values into OpenSCAD-compatible string representations. Used by:
 *   - Worker `buildDefineArgs()` for -D flag generation
 *   - Worker `_applyOverrides()` for source-level parameter replacement
 *   - Worker `parametersToScad()` for prepend-style parameter injection
 *   - Main-thread `dumpRenderArgs()` for diagnostic logging
 *
 * Having one implementation prevents serialization drift where the same
 * parameter could be formatted differently across preview, export, and debug
 * paths (e.g. string enum "yes" rendered as boolean `true`).
 *
 * @license GPL-3.0-or-later
 */

import { hexToRgb } from './color-utils.js';

/**
 * Escape a string for use in a RegExp
 * @param {string} s
 * @returns {string}
 */
export function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Recursively serialize a JS array to OpenSCAD vector syntax.
 * @param {Array} arr
 * @returns {string} e.g. "[[1,2],[3,4]]"
 */
export function serializeScadVector(arr) {
  const parts = arr.map((item) =>
    Array.isArray(item) ? serializeScadVector(item) : String(item)
  );
  return `[${parts.join(',')}]`;
}

/**
 * Detect how a color parameter is declared in the SCAD source.
 * Preserves the author's literal style (string vs vector, with/without #).
 *
 * @param {string} scadContent
 * @param {string} key
 * @returns {{style: 'string'|'vector'|'unknown', hasHashPrefix: boolean}}
 */
export function detectColorParamLiteralStyle(scadContent, key) {
  if (!scadContent || typeof scadContent !== 'string' || !key) {
    return { style: 'unknown', hasHashPrefix: false };
  }

  const keyRe = escapeRegExp(key);
  const assignmentRe = new RegExp(`^\\s*${keyRe}\\s*=\\s*([^;]+);`, 'm');
  const match = scadContent.match(assignmentRe);
  if (!match) {
    return { style: 'unknown', hasHashPrefix: false };
  }

  const rhs = String(match[1] || '').trim();
  if (rhs.startsWith('[')) {
    return { style: 'vector', hasHashPrefix: false };
  }

  const quote = rhs[0];
  if ((quote === '"' || quote === "'") && rhs.endsWith(quote)) {
    const inner = rhs.slice(1, -1).trim();
    return { style: 'string', hasHashPrefix: inner.startsWith('#') };
  }

  return { style: 'unknown', hasHashPrefix: false };
}

/**
 * Format a single parameter value for OpenSCAD consumption.
 *
 * The returned string is suitable for both `-D key=<value>` CLI arguments
 * and `key = <value>;` source-level assignments.
 *
 * @param {string} key - Parameter name
 * @param {*} value - Parameter value (string, number, boolean, array, or file object)
 * @param {Object} [paramTypes={}] - Map of param names to schema types
 * @param {string} [scadContent=''] - SCAD source for color literal style detection
 * @returns {string|null} Formatted value string, or null if the value should be skipped
 */
export function formatScadValue(key, value, paramTypes = {}, scadContent = '') {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    const lowerValue = value.toLowerCase();
    const isBooleanParam = paramTypes[key] === 'boolean';

    if (isBooleanParam && (lowerValue === 'true' || lowerValue === 'yes')) {
      return 'true';
    }
    if (isBooleanParam && (lowerValue === 'false' || lowerValue === 'no')) {
      return 'false';
    }

    if (/^#?[0-9A-Fa-f]{6}$/.test(value)) {
      const colorStyle =
        paramTypes[key] === 'color'
          ? detectColorParamLiteralStyle(scadContent, key)
          : { style: 'unknown', hasHashPrefix: false };

      if (paramTypes[key] === 'color' && colorStyle.style === 'string') {
        const normalizedHex = value.replace(/^#/, '').toUpperCase();
        const literal = colorStyle.hasHashPrefix
          ? `#${normalizedHex}`
          : normalizedHex;
        return `"${literal}"`;
      }
      const rgb = hexToRgb(value);
      return `[${rgb[0]},${rgb[1]},${rgb[2]}]`;
    }

    if (
      (paramTypes[key] === 'integer' || paramTypes[key] === 'number') &&
      value.trim() !== '' &&
      !isNaN(Number(value))
    ) {
      return String(Number(value));
    }

    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }

  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (Array.isArray(value)) {
    return serializeScadVector(value);
  }
  if (typeof value === 'object' && value.data) {
    const escaped = (value.name || 'uploaded_file')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
    return `"${escaped}"`;
  }

  return JSON.stringify(value);
}

/**
 * Build -D command-line arguments from parameters.
 *
 * @param {Object} parameters - Parameter key-value pairs
 * @param {Object} [paramTypes={}] - Map of parameter names to their schema types
 * @param {string} [scadContent=''] - Source used to infer color literal style
 * @returns {Array<string>} Array of -D arguments
 */
export function buildDefineArgs(parameters, paramTypes = {}, scadContent = '') {
  if (!parameters || Object.keys(parameters).length === 0) {
    return [];
  }

  const args = [];

  for (const [key, value] of Object.entries(parameters)) {
    const formattedValue = formatScadValue(key, value, paramTypes, scadContent);
    if (formattedValue === null) {
      continue;
    }
    args.push('-D');
    args.push(`${key}=${formattedValue}`);
  }

  return args;
}
