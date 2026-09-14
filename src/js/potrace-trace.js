/**
 * The picture tracer's Potrace engine.
 *
 * This is the whole of the JavaScript side: load the wasm once, hand it an ink
 * mask, get back SVG path data. Deciding what counts as ink, and what to do
 * with the drawing afterwards, belongs to the code that already does it.
 *
 * The wasm and its loader are build output, written by
 * scripts/build-potrace-wasm.sh and committed under public/wasm/potrace/ with
 * a README naming the source tarball, its checksum and the compiler. This file
 * is the only hand-written part, which is why it lives in src/ where the tests
 * can reach it rather than beside the binary.
 *
 * @license GPL-3.0-or-later
 */

/** Where the built loader sits once it has been fetched by the page. */
export const POTRACE_MODULE_URL = '/wasm/potrace/potrace.mjs';

/**
 * Potrace's own defaults, copied from potracelib.c so that "leave it alone"
 * means the same thing here as it does in the library.
 */
export const POTRACE_DEFAULTS = Object.freeze({
  /** Ignore any speck smaller than this many pixels. */
  turdsize: 2,
  /** How an ambiguous turn is resolved. 4 is potrace's MINORITY. */
  turnpolicy: 4,
  /** Corner threshold. 0 makes every corner sharp; 1.34 rounds everything. */
  alphamax: 1.0,
  /** How far an optimised curve may stray from the one it replaces. */
  opttolerance: 0.2,
});

let modulePromise = null;

/**
 * Load the Potrace module, once per page.
 *
 * @param {() => Promise<object>} [loader] where the module comes from. The
 *   default fetches the built loader from the site; tests and the build's own
 *   verification pass their own so they can point at a local file.
 * @returns {Promise<object>} the instantiated emscripten module
 */
export function loadPotrace(loader) {
  if (!modulePromise) {
    const importModule =
      loader || (() => import(/* @vite-ignore */ POTRACE_MODULE_URL));
    modulePromise = Promise.resolve()
      .then(importModule)
      .then((mod) => {
        const factory = mod?.default || mod;
        if (typeof factory !== 'function') {
          throw new Error('The Potrace module did not export a loader.');
        }
        return factory();
      })
      .catch((error) => {
        // A failed load must not poison every later attempt: a person who
        // loses the network mid-session can retry by tracing again.
        modulePromise = null;
        throw error;
      });
  }
  return modulePromise;
}

/** Forget the loaded module. Tests use this; nothing in the app does. */
export function resetPotrace() {
  modulePromise = null;
}

/**
 * Trace an ink mask.
 *
 * @param {Uint8Array|Uint8ClampedArray} mask one byte per pixel, non-zero is
 *   ink, row 0 at the top
 * @param {number} width pixels
 * @param {number} height pixels
 * @param {object} [options] any of POTRACE_DEFAULTS, plus `loader`
 * @returns {Promise<string>} SVG path data, to be filled EVEN-ODD. Empty when
 *   the picture held no ink.
 */
export async function trace(mask, width, height, options = {}) {
  if (!(width > 0) || !(height > 0)) {
    throw new Error(`Cannot trace a ${width}x${height} picture.`);
  }
  if (mask.length !== width * height) {
    throw new Error(
      `The mask does not match its size: ${width}x${height} needs ${width * height} bytes, got ${mask.length}.`
    );
  }

  const settings = { ...POTRACE_DEFAULTS, ...options };
  const mod = await loadPotrace(options.loader);

  const ptr = mod._malloc(mask.length);
  if (!ptr) throw new Error('Potrace ran out of memory reading the picture.');

  let pathData;
  try {
    // Read HEAPU8 after the allocation, never before: the module is built with
    // ALLOW_MEMORY_GROWTH, and a growth swaps the buffer out from under any
    // view taken earlier.
    mod.HEAPU8.set(mask, ptr);
    const resultPtr = mod._potrace_trace_to_path(
      ptr,
      width,
      height,
      settings.turdsize,
      settings.turnpolicy,
      settings.alphamax,
      settings.opttolerance
    );
    if (!resultPtr) throw new Error('Potrace could not trace this picture.');
    try {
      pathData = mod.UTF8ToString(resultPtr);
    } finally {
      mod._potrace_free_result(resultPtr);
    }
  } finally {
    mod._free(ptr);
  }

  return pathData;
}

/**
 * How many closed shapes a piece of path data holds. Each 'M' starts one, so
 * this counts boundaries and holes alike - which is what the census compares.
 *
 * @param {string} pathData
 * @returns {number}
 */
export function countSubpaths(pathData) {
  if (!pathData) return 0;
  let count = 0;
  for (let i = 0; i < pathData.length; i++) {
    if (pathData[i] === 'M') count++;
  }
  return count;
}
