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

/** Matches any character that is not a six-dot braille cell. */
const NOT_SIX_DOT_RE = /[^\u2800-\u283F]/;

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
 * Make every whitespace character an ordinary space. liblouis hands a
 * no-break space or a tab back as itself rather than as a blank cell; the
 * word layout already splits on these same characters, so a line translated
 * whole now agrees with it. The length does not change.
 * @param {string} text
 * @returns {string}
 */
export function normalizeSpaces(text) {
  return text.replace(/\s/g, ' ');
}

/**
 * Translate, leaving out every character liblouis cannot write as six-dot
 * braille. liblouis spells a character the table does not define as an
 * escape such as '\x2603': eight cells, one with dot 7, which a six-dot
 * sign would print as a different cell. Every cell of the escape points back
 * at its character, so that character is removed and the rest translated
 * again. Each pass removes at least one character (the engine refuses a
 * position outside the text), so the loop ends.
 * @param {string} text
 * @param {(text: string) => Promise<{ translation: string, inputPos: number[] }>} translate
 * @returns {Promise<{ braille: string, inputPos: number[], leftOut: string[] }>}
 *   `inputPos` indexes the text finally translated, which is `text` itself
 *   only when `leftOut` is empty
 */
export async function translateLeavingOut(text, translate) {
  const leftOut = [];
  let rest = text;
  while (rest !== '') {
    const { translation, inputPos } = await translate(rest);
    const found = new Set();
    Array.from(translation).forEach((cell, i) => {
      if (NOT_SIX_DOT_RE.test(cell)) {
        found.add(String.fromCodePoint(rest.codePointAt(inputPos[i])));
      }
    });
    if (found.size === 0) return { braille: translation, inputPos, leftOut };
    leftOut.push(...found);
    rest = Array.from(rest)
      .filter((ch) => !found.has(ch))
      .join('');
  }
  return { braille: '', inputPos: [], leftOut };
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
 * }>} `hadUntranslatable` is true when a character with no braille in the
 *   selected table was left out. `inputPos` gives, for each cell, the index
 *   in `text` of the character it came from; it is null when stripping,
 *   lowercasing or leaving a character out changed the text, because the
 *   positions would no longer line up
 */
export async function translateText(
  text,
  table,
  { preserveCaps = false } = {}
) {
  await ensureReady();

  const { text: safeText, stripped } = stripUnsupportedChars(text);
  const input = normalizeSpaces(
    preserveCaps ? safeText : safeText.toLowerCase()
  );

  if (input === '') {
    return {
      braille: '',
      inputPos: text === '' ? [] : null,
      hadUntranslatable: stripped.length > 0,
      strippedChars: stripped,
    };
  }

  const cacheKey = `${table}\u0000${input}`;
  let cached = cache.get(cacheKey);
  if (cached === undefined) {
    try {
      cached = await translateLeavingOut(input, (rest) =>
        sendMessage('translate', { text: rest, table })
      );
    } catch (error) {
      // An engine that failed once is not trusted with the next call.
      disposeTranslator();
      throw error;
    }
    if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
    cache.set(cacheKey, cached);
  }

  return {
    braille: cached.braille,
    inputPos:
      cached.leftOut.length === 0 && input.length === text.length
        ? cached.inputPos
        : null,
    hadUntranslatable: stripped.length > 0 || cached.leftOut.length > 0,
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
