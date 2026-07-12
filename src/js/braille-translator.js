/**
 * Braille translator — lazy main-thread manager for the liblouis worker.
 *
 * The worker (and liblouis's ~1.7 MB engine) is only spawned when the
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
  // Classic worker (importScripts inside) — do NOT pass { type: 'module' }.
  const w = new Worker(new URL('../worker/liblouis-worker.js', import.meta.url));

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
 * Remove characters the UTF-16 liblouis build cannot represent (astral
 * plane code points such as emoji abort the WASM instance outright).
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
 *   hadUntranslatable: boolean,
 *   strippedChars: string[],
 * }>}
 */
export async function translateText(text, table, { preserveCaps = false } = {}) {
  await ensureReady();

  const { text: safeText, stripped } = stripUnsupportedChars(text);
  const input = preserveCaps ? safeText : safeText.toLowerCase();

  if (input === '') {
    return { braille: '', hadUntranslatable: false, strippedChars: stripped };
  }

  const cacheKey = `${table}\u0000${input}`;
  let braille = cache.get(cacheKey);
  if (braille === undefined) {
    const result = await sendMessage('translate', { text: input, table });
    // liblouis emits ASCII spaces between words; the SCAD models expect
    // the Unicode braille blank cell (U+2800) everywhere.
    braille = result.translation.replace(/ /g, '\u2800');
    if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
    cache.set(cacheKey, braille);
  }

  return {
    braille,
    // Non-braille output means liblouis passed characters through
    // untranslated (no definition in the selected table).
    hadUntranslatable: NON_BRAILLE_RE.test(braille) || stripped.length > 0,
    strippedChars: stripped,
  };
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
