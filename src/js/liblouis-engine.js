/**
 * The braille tools' liblouis engine.
 *
 * This is the whole of the JavaScript side of liblouis: load the wasm once,
 * put the translation tables into its file system, and translate one string
 * at a time. Which table, which text, and what to do with the braille belong
 * to the code that already decides them.
 *
 * The wasm and its loader are build output, written by
 * scripts/build-liblouis-wasm.sh, and they live apart for the same reasons as
 * Potrace's (see potrace-trace.js): `vendor/liblouis/liblouis.mjs` is code the
 * bundler has to see, and `public/wasm/liblouis/liblouis.wasm` keeps a stable
 * address beside its license and the README that records its checksum.
 *
 * Every buffer handed to liblouis is sized in characters, the unit liblouis
 * counts in. liblouis reports how much of the text it consumed, and a
 * translation that stopped short is never returned as if it were whole.
 *
 * @license GPL-3.0-or-later
 */

/** Where the binary is served from. Given to emscripten as its locateFile. */
export const LIBLOUIS_WASM_URL = '/wasm/liblouis/liblouis.wasm';

/** Where the tables live inside the module's file system. */
export const TABLE_DIR = '/tables';

/** The display table that makes liblouis answer in Unicode braille. */
export const DISPLAY_TABLE = 'unicode.dis';

const TABLE_NAME = /^[\w.-]+$/;
const BLANK_CELL = '⠀';
const LOG_LIMIT = 20;
/** liblouis writes 32-bit characters (the build is configured --enable-ucs4). */
const CHAR_BYTES = 4;
const RETRIES = 3;

let modulePromise = null;
let log = [];

/**
 * Load the liblouis module, once per page.
 *
 * @param {() => Promise<object>} loader where the module comes from: the app
 *   imports the built loader, and tests and the build's own verification
 *   pass one that points at a file on disk.
 * @param {object} [options]
 * @param {string} [options.wasmUrl] where the binary is, if not the served
 *   one. Node has no site to fetch from, so the tests give it a path.
 * @returns {Promise<object>} the instantiated emscripten module
 */
export function loadLiblouis(loader, options = {}) {
  if (typeof loader !== 'function') {
    throw new Error('loadLiblouis needs a function that imports the module.');
  }
  if (!modulePromise) {
    const wasmUrl = options.wasmUrl || LIBLOUIS_WASM_URL;
    log = [];
    modulePromise = Promise.resolve()
      .then(loader)
      .then((mod) => {
        const factory = mod?.default || mod;
        if (typeof factory !== 'function') {
          throw new Error('The liblouis module did not export a loader.');
        }
        return factory({
          locateFile: () => wasmUrl,
          // liblouis reports why a table did not compile on stderr; keep the
          // last few lines so an error can say more than "it failed".
          printErr: (line) => {
            log.push(String(line));
            if (log.length > LOG_LIMIT) log.shift();
          },
        });
      })
      .catch((error) => {
        // A failed load must not poison every later attempt.
        modulePromise = null;
        throw error;
      });
  }
  return modulePromise;
}

/** Forget the loaded module, so the next load starts a fresh one. */
export function resetLiblouis() {
  modulePromise = null;
  log = [];
}

function checkTableName(name) {
  if (typeof name !== 'string' || !TABLE_NAME.test(name)) {
    throw new Error(`Not a liblouis table name: ${JSON.stringify(name)}`);
  }
}

/**
 * Put translation tables into the module's file system, under /tables, where
 * liblouis finds a table's includes beside it.
 *
 * @param {object} mod the module from loadLiblouis()
 * @param {Array<{ name: string, bytes: Uint8Array|string }>} files
 */
export function installTables(mod, files) {
  if (!mod.FS.analyzePath(TABLE_DIR).exists) mod.FS.mkdir(TABLE_DIR);
  for (const { name, bytes } of files) {
    checkTableName(name);
    mod.FS.writeFile(`${TABLE_DIR}/${name}`, bytes);
  }
}

function tableList(table) {
  checkTableName(table);
  return `${TABLE_DIR}/${DISPLAY_TABLE},${TABLE_DIR}/${table}`;
}

/** liblouis counts characters as code points, so an emoji is one, not two. */
function codePointsOf(text) {
  return Array.from(text, (ch) => ch.codePointAt(0));
}

function failure(what, table) {
  const detail = log.slice(-3).join(' ').trim();
  return new Error(
    detail ? `${what} with ${table} (${detail})` : `${what} with ${table}`
  );
}

/**
 * One call into liblouis. Returns null when liblouis reports a failure, and
 * otherwise how much of the input it consumed and what it wrote.
 */
function callLiblouis(mod, list, input, capacity, forward) {
  const pointers = [];
  const alloc = (bytes) => {
    const ptr = mod._malloc(bytes);
    if (!ptr) throw new Error('liblouis ran out of memory.');
    pointers.push(ptr);
    return ptr;
  };
  try {
    const listBytes = mod.lengthBytesUTF8(list) + 1;
    const listPtr = alloc(listBytes);
    const inPtr = alloc(Math.max(input.length, 1) * CHAR_BYTES);
    const inLenPtr = alloc(4);
    const outPtr = alloc(capacity * CHAR_BYTES);
    const outLenPtr = alloc(4);
    const posPtr = forward ? alloc(capacity * 4) : 0;

    // Every view is taken after the last allocation: the module is built with
    // ALLOW_MEMORY_GROWTH, and a growth swaps the buffer out from under any
    // view taken earlier.
    mod.stringToUTF8(list, listPtr, listBytes);
    mod.HEAPU32.set(input, inPtr >> 2);
    mod.HEAP32[inLenPtr >> 2] = input.length;
    mod.HEAP32[outLenPtr >> 2] = capacity;
    log.length = 0;

    const ok = forward
      ? mod._lou_translate(
          listPtr,
          inPtr,
          inLenPtr,
          outPtr,
          outLenPtr,
          0,
          0,
          0,
          posPtr,
          0,
          0
        )
      : mod._lou_backTranslateString(
          listPtr,
          inPtr,
          inLenPtr,
          outPtr,
          outLenPtr,
          0,
          0,
          0
        );
    if (!ok) return null;

    // Read after the call too, which may itself have grown the memory.
    const used = mod.HEAP32[inLenPtr >> 2];
    const length = mod.HEAP32[outLenPtr >> 2];
    const chars = Array.from(
      mod.HEAPU32.subarray(outPtr >> 2, (outPtr >> 2) + length)
    );
    const positions = forward
      ? Array.from(mod.HEAP32.subarray(posPtr >> 2, (posPtr >> 2) + length))
      : null;
    return { used, chars, positions };
  } finally {
    for (const ptr of pointers) mod._free(ptr);
  }
}

/** liblouis's own positions count code points; JavaScript strings count UTF-16 units. */
function toStringIndexes(positions, text, length) {
  const offsets = [];
  let index = 0;
  for (const ch of text) {
    offsets.push(index);
    index += ch.length;
  }
  return positions.map((p) => {
    if (!(p >= 0 && p < length)) {
      throw new Error(
        `liblouis placed a cell at character ${p} of a ${length}-character text`
      );
    }
    return offsets[p];
  });
}

/**
 * Translate text to Unicode braille.
 *
 * @param {object} mod the module from loadLiblouis(), with tables installed
 * @param {string} table a table file name, e.g. 'en-ueb-g2.ctb'
 * @param {string} text plain text
 * @param {object} [options]
 * @param {number} [options.capacity] the first output size to try, in cells.
 *   Only the build's own check sets it, to prove the retry works.
 * @returns {{ braille: string, inputPos: number[] }} the braille, with every
 *   blank cell as U+2800, and for each cell the index in `text` of the
 *   character it came from
 */
export function translate(mod, table, text, options = {}) {
  const list = tableList(table);
  const input = codePointsOf(text);
  let capacity = options.capacity || Math.max(input.length * 4 + 64, 256);
  for (let attempt = 0; ; attempt++) {
    const result = callLiblouis(mod, list, input, capacity, true);
    if (!result) throw failure('liblouis could not translate this text', table);
    if (result.used >= input.length) {
      let braille = '';
      // liblouis's unicode.dis has written a blank cell as an ASCII space in
      // some releases and as U+2800 in others; the models want U+2800.
      for (const c of result.chars) {
        braille += c === 0x20 ? BLANK_CELL : String.fromCodePoint(c);
      }
      return {
        braille,
        inputPos: toStringIndexes(result.positions, text, input.length),
      };
    }
    if (attempt === RETRIES) {
      throw new Error(
        `liblouis translated only ${result.used} of ${input.length} characters`
      );
    }
    capacity *= 2;
  }
}

/**
 * Translate Unicode braille back to text.
 *
 * @param {object} mod the module from loadLiblouis(), with tables installed
 * @param {string} table a table file name, e.g. 'en-ueb-g2.ctb'
 * @param {string} braille Unicode braille; a blank cell or a space separates words
 * @param {object} [options]
 * @param {number} [options.capacity] the first output size to try, in characters
 * @returns {string}
 */
export function backTranslate(mod, table, braille, options = {}) {
  const list = tableList(table);
  const input = codePointsOf(braille);
  let capacity = options.capacity || Math.max(input.length * 16 + 64, 256);
  for (let attempt = 0; ; attempt++) {
    const result = callLiblouis(mod, list, input, capacity, false);
    if (!result) {
      throw failure('liblouis could not back-translate this braille', table);
    }
    if (result.used >= input.length) {
      let text = '';
      for (const c of result.chars) text += String.fromCodePoint(c);
      return text;
    }
    if (attempt === RETRIES) {
      throw new Error(
        `liblouis back-translated only ${result.used} of ${input.length} cells`
      );
    }
    capacity *= 2;
  }
}

/** The liblouis release the module was built from, e.g. "3.39.0". */
export function version(mod) {
  return mod.UTF8ToString(mod._lou_version());
}
