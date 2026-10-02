/**
 * Braille translator — lazy main-thread manager for the liblouis worker.
 *
 * The worker, and the liblouis engine it loads, is only spawned when the
 * Braille Card Customizer actually asks for a translation, so every other
 * session never pays for it. Results are memoized per (table, text) since
 * the wrap engine re-translates the same words on every keystroke.
 *
 * @license GPL-3.0-or-later
 */

const WORKER_TIMEOUT_MS = 15000;
const CACHE_MAX_ENTRIES = 2000;

/** Matches any character outside the Unicode braille block. */
const NON_BRAILLE_RE = /[^\u2800-\u28FF]/;

let worker = null;
let readyPromise = null;
let tablesPromise = null;
let messageId = 0;
const pending = new Map();
const cache = new Map();

function createWorker() {
  // A module worker: it imports the engine and the engine's WebAssembly loader.
  const w = new Worker(
    new URL('../worker/liblouis-worker.js', import.meta.url),
    { type: 'module' }
  );

  w.onmessage = (e) => {
    const { id, result } = e.data || {};
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    if (result?.success) {
      entry.resolve(result);
    } else {
      entry.reject(new Error(result?.error || 'liblouis worker error'));
    }
  };

  w.onerror = (event) => {
    console.error('[BrailleTranslator] Worker error:', event.message);
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error(`liblouis worker failed: ${event.message}`));
      pending.delete(id);
    }
  };

  return w;
}

function sendMessage(type, data) {
  return new Promise((resolve, reject) => {
    const id = ++messageId;
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error('liblouis worker timed out'));
      }
    }, WORKER_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    worker.postMessage({ id, type, data });
  });
}

/**
 * Spawn the worker and initialize liblouis (idempotent).
 * @returns {Promise<void>}
 */
export function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      worker = createWorker();
      await sendMessage('init');
    })().catch((error) => {
      // Allow a later retry instead of caching the failure forever.
      readyPromise = null;
      disposeTranslator();
      throw error;
    });
  }
  return readyPromise;
}

/**
 * Remove characters outside the Basic Multilingual Plane, such as emoji. The
 * braille tables define none of them, and liblouis would spell each one out
 * as an escape sequence in braille cells.
 * @param {string} text
 * @returns {{ text: string, stripped: string[] }}
 */
export function stripUnsupportedChars(text) {
  const stripped = [];
  let out = '';
  for (const ch of text) {
    if (ch.codePointAt(0) > 0xffff) {
      stripped.push(ch);
    } else {
      out += ch;
    }
  }
  return { text: out, stripped };
}

/**
 * Translate plain text to Unicode braille.
 *
 * @param {string} text - Plain text (word, line, or phrase)
 * @param {string} table - liblouis table file name, e.g. 'en-ueb-g1.ctb'
 * @param {Object} [opts]
 * @param {boolean} [opts.preserveCaps=false] - Keep capital letters
 *   (adds indicator cells); when false the text is lowercased first,
 *   per BANA space-saving guidance for cards and labels
 * @returns {Promise<{
 *   braille: string,
 *   inputPos: number[]|null,
 *   hadUntranslatable: boolean,
 *   strippedChars: string[],
 * }>} `inputPos` gives, for each cell, the index in `text` of the character
 *   it came from; it is null when stripping or lowercasing changed the
 *   text's length, because the positions would no longer line up
 */
export async function translateText(
  text,
  table,
  { preserveCaps = false } = {}
) {
  await ensureReady();

  const { text: safeText, stripped } = stripUnsupportedChars(text);
  const input = preserveCaps ? safeText : safeText.toLowerCase();

  if (input === '') {
    return {
      braille: '',
      inputPos: text === '' ? [] : null,
      hadUntranslatable: false,
      strippedChars: stripped,
    };
  }

  const cacheKey = `${table}\u0000${input}`;
  let cached = cache.get(cacheKey);
  if (cached === undefined) {
    let result;
    try {
      result = await sendMessage('translate', { text: input, table });
    } catch (error) {
      // An engine that failed once is not trusted with the next call.
      disposeTranslator();
      throw error;
    }
    cached = { braille: result.translation, inputPos: result.inputPos };
    if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
    cache.set(cacheKey, cached);
  }

  return {
    braille: cached.braille,
    inputPos: input.length === text.length ? cached.inputPos : null,
    // Non-braille output means liblouis passed characters through
    // untranslated (no definition in the selected table).
    hadUntranslatable:
      NON_BRAILLE_RE.test(cached.braille) || stripped.length > 0,
    strippedChars: stripped,
  };
}

/**
 * Back-translate Unicode braille to plain text via liblouis. Used by the
 * braille editor's "Translate to text" button (so a braille reader can
 * verify pasted braille) and to derive a friendly download name when
 * braille is the only input.
 *
 * @param {string} braille - Unicode braille (U+2800–U+28FF; blank cells
 *   and ASCII spaces both act as word separators)
 * @param {string} table - liblouis table file name, e.g. 'en-ueb-g1.ctb'
 * @returns {Promise<string>} Back-translated plain text
 */
export async function backTranslateText(braille, table) {
  await ensureReady();

  if (braille === '') return '';

  // liblouis expects ASCII spaces between words; the models store the
  // Unicode braille blank cell (U+2800) instead.
  const input = braille.replace(/\u2800/g, ' ');

  // 'bt' cannot collide with forward keys: those start with a table file
  // name (always contains a dot).
  const cacheKey = `bt\u0000${table}\u0000${input}`;
  let text = cache.get(cacheKey);
  if (text === undefined) {
    let result;
    try {
      result = await sendMessage('backTranslate', { braille: input, table });
    } catch (error) {
      disposeTranslator();
      throw error;
    }
    text = result.text;
    if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
    cache.set(cacheKey, text);
  }
  return text;
}

/**
 * Fetch the curated table catalog (cached).
 * @param {string} [catalogUrl='/liblouis/tables.json']
 * @returns {Promise<{ defaultTable: string, tables: Array<{file: string, label: string}> }>}
 */
export function getTables(catalogUrl = '/liblouis/tables.json') {
  if (!tablesPromise) {
    tablesPromise = fetch(catalogUrl).then((res) => {
      if (!res.ok) {
        tablesPromise = null;
        throw new Error(`Failed to load table catalog (${res.status})`);
      }
      return res.json();
    });
  }
  return tablesPromise;
}

/**
 * Terminate the worker and clear caches (e.g. when leaving the braille
 * example). Safe to call repeatedly; ensureReady() respawns on demand.
 */
export function disposeTranslator() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  for (const [, entry] of pending) {
    clearTimeout(entry.timer);
    entry.reject(new Error('liblouis worker disposed'));
  }
  pending.clear();
  cache.clear();
  readyPromise = null;
}
