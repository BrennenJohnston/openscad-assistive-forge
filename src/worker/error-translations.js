/**
 * Worker-side error classification — pure logic shared by the render worker
 * and tests.
 *
 * Extracted from openscad-worker.js so the parity corpus test exercises the
 * real classification table (BR-5).
 *
 * NOTE (BR-5): the main thread translates errors to rich UI content by
 * `code` (see error-translator.js TRANSLATIONS_BY_CODE). The `message`
 * prose here is retained because the posted message doubles as
 * machine-readable content for guards on the main thread (e.g.
 * auto-preview's msg.includes('cancel') skip and the dependency-guidance
 * regexes) — removing it requires auditing every consumer of
 * error.message first.
 *
 * @license GPL-3.0-or-later
 */

/**
 * Guidance for MODEL_NOT_2D — single source for a string that was
 * previously copy-pasted here, in openscad-worker.js, and in the
 * main-thread error-translator.js.
 */
export const MODEL_NOT_2D_SUGGESTION =
  'Enable "use Laser Cutting best practices" or ensure your model uses projection() to produce 2D geometry.';

/**
 * Explanation for MODEL_NOT_2D — single source for the same three copies.
 * PDF is named alongside SVG and DXF because it is a real 2D export that
 * refuses a 3D-only model in exactly the same way; naming only two of the
 * three told a user who chose PDF about formats they had not picked.
 */
export const MODEL_NOT_2D_EXPLANATION =
  'Your model produces 3D geometry, but SVG, DXF and PDF export all require 2D output.';

/**
 * Error message translations for common OpenSCAD errors
 * Maps error patterns to user-friendly messages
 */
export const ERROR_TRANSLATIONS = [
  {
    pattern: /Parser error/i,
    message:
      'Syntax error in your OpenSCAD file. Check for missing semicolons, brackets, or parentheses.',
    code: 'SYNTAX_ERROR',
  },
  {
    pattern: /Rendering cancelled|timeout/i,
    message:
      'Render was stopped because it was taking too long. Try reducing complexity (lower $fn value) or simplifying your design.',
    code: 'TIMEOUT',
  },
  {
    pattern: /out of memory|memory allocation failed|OOM/i,
    message:
      'This model is too complex for browser rendering. Try lowering $fn, reducing boolean operations, or simplifying the design.',
    code: 'OUT_OF_MEMORY',
  },
  {
    pattern: /Unknown module/i,
    message:
      'Your model uses a module that could not be found. Check include/use statements and ensure library files are loaded.',
    code: 'UNKNOWN_MODULE',
  },
  {
    pattern: /Unknown function/i,
    message:
      'Your model uses a function that could not be found. Check for typos or missing library includes.',
    code: 'UNKNOWN_FUNCTION',
  },
  {
    pattern: /Undefined variable/i,
    message:
      'A variable in your model is not defined. Check for typos in variable names.',
    code: 'UNDEFINED_VARIABLE',
  },
  {
    pattern: /WARNING: Object may not be a valid 2-manifold/i,
    message:
      'The model has geometry issues (non-manifold). It may still render but could cause problems for 3D printing.',
    code: 'NON_MANIFOLD_WARNING',
  },
  {
    pattern: /No top[ -]?level geometry/i,
    message:
      'Your model does not produce any geometry. Make sure you have at least one shape (cube, sphere, etc.) in your code.',
    code: 'NO_GEOMETRY',
  },
  {
    // IMPORTANT: Detect empty geometry from OpenSCAD console output
    pattern: /Current top[ -]?level object is empty/i,
    message:
      'This configuration produces no geometry. Check that the selected options are compatible — some parameter combinations may result in empty output.',
    code: 'EMPTY_GEOMETRY',
  },
  {
    pattern: /MODEL_NOT_2D|Current top level object is not a 2D object/i,
    message: MODEL_NOT_2D_EXPLANATION + ' ' + MODEL_NOT_2D_SUGGESTION,
    code: 'MODEL_NOT_2D',
  },
  {
    // Detect "not supported" ECHO messages from OpenSCAD models
    pattern: /is not supported for/i,
    message:
      'This combination of options is not supported. Please check the "generate" setting and related options.',
    code: 'UNSUPPORTED_CONFIG',
  },
  {
    pattern: /Cannot open file/i,
    message:
      'A file referenced in your model could not be found. Check include/use paths and file names.',
    code: 'FILE_NOT_FOUND',
  },
  {
    pattern: /Recursion detected|Stack overflow/i,
    message:
      'Your model has infinite recursion. Check recursive module or function calls.',
    code: 'RECURSION',
  },
  // CGAL assertion failures — root cause of projection()/roof() crashes in WASM
  // See: openscad-wasm#6, openscad#6582, CGAL#7560
  {
    pattern: /CGAL assertion|CGAL_assertion|CGAL ERROR|CGAL precondition/i,
    message:
      'This model uses a geometry feature (projection/roof) that has a known issue in the browser engine. ' +
      'Try simplifying the design or removing projection()/roof() calls. ' +
      'This is a known upstream limitation (CGAL + WebAssembly).',
    code: 'CGAL_ASSERTION',
  },
  // Emscripten abort — typically triggered by unrecoverable CGAL/C++ errors
  {
    pattern: /Aborted\(|abort\(|Emscripten.*abort/i,
    message:
      'The rendering engine encountered a fatal error and stopped. ' +
      'This often happens with projection() or roof() functions. ' +
      'Try removing these functions or simplifying your design.',
    code: 'WASM_ABORT',
  },
  // WASM RuntimeError: unreachable — compiled trap instruction hit
  {
    pattern: /RuntimeError:\s*unreachable/i,
    message:
      'The rendering engine hit an internal error (unreachable code). ' +
      'This is typically caused by projection() or roof() in the browser engine. ' +
      'Try simplifying the model or removing these functions.',
    code: 'WASM_UNREACHABLE',
  },
  // WASM RuntimeError: memory access out of bounds
  {
    pattern: /RuntimeError:\s*memory access out of bounds/i,
    message:
      'The rendering engine ran out of accessible memory. ' +
      'Try reducing model complexity (lower $fn), removing minkowski() operations, or simplifying boolean operations.',
    code: 'WASM_OOB',
  },
  {
    pattern: /\b\d{6,}\b/, // Match long numeric error codes (like 1101176)
    message:
      'An internal rendering error occurred. Try reloading the page and rendering again.',
    code: 'INTERNAL_ERROR',
  },
];

/**
 * Translate raw OpenSCAD error to user-friendly message
 * @param {string|Error|Object} rawError - Raw error from OpenSCAD (can be string, Error, or object)
 * @returns {{message: string, code: string, raw: string}} Translated error info
 */
export function translateWorkerError(rawError) {
  // Handle various error types to avoid "[object Object]"
  let errorStr;
  if (typeof rawError === 'string') {
    errorStr = rawError;
  } else if (rawError instanceof Error) {
    errorStr = rawError.message || rawError.toString();
  } else if (rawError && typeof rawError === 'object') {
    // Try to extract a meaningful message from the object
    errorStr =
      rawError.message ||
      rawError.error ||
      rawError.msg ||
      JSON.stringify(rawError).substring(0, 500);
  } else {
    errorStr = String(rawError);
  }

  for (const { pattern, message, code } of ERROR_TRANSLATIONS) {
    if (pattern.test(errorStr)) {
      return { message, code, raw: errorStr };
    }
  }

  // Fallback: return a cleaned up version of the error
  // Remove internal paths and technical details that aren't helpful
  const cleaned = errorStr
    .replace(/\/tmp\/[^\s]+/g, 'your model')
    .replace(/at line \d+/g, '')
    .trim();

  // If the error is very short or just a number, provide a generic message
  if (cleaned.length < 10 || /^\d+$/.test(cleaned)) {
    return {
      message:
        'An error occurred while rendering. Please check your model syntax and try again.',
      code: 'RENDER_FAILED',
      raw: errorStr,
    };
  }

  return {
    message: `Rendering error: ${cleaned}`,
    code: 'RENDER_FAILED',
    raw: errorStr,
  };
}
