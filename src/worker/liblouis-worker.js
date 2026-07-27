/**
 * liblouis braille translation Web Worker
 * @license GPL-3.0-or-later
 *
 * Classic (non-module) worker: liblouis's engine and Easy API are plain
 * scripts loaded via importScripts from /liblouis/ (static assets copied
 * by scripts/setup-liblouis.js). The worker is required because liblouis's
 * on-demand table loading uses synchronous XHR, which is deprecated on the
 * main thread.
 *
 * Adapted from the braille-cylinder-stl-generator project (formerly
 * braille-card-and-cylinder-stl-generator; Copyright 2024-2026 Brennen
 * Johnston, PolyForm Noncommercial 1.0.0).
 *
 * Message protocol (request → response, matched by id):
 *   { id, type: 'init' }
 *     → { id, type: 'init', result: { success, error? } }
 *   { id, type: 'translate', data: { text, table } }
 *     → { id, type: 'translate', result: { success, translation?, error? } }
 */

/* global LiblouisEasyApi, liblouisBuild */

let liblouisInstance = null;
let liblouisReady = false;
const recentLogs = [];

const LIBLOUIS_BASE = '/liblouis/';
const ALLOWED_TYPES = ['init', 'translate'];
// Table file names are catalog-driven; keep the worker defensive anyway.
const TABLE_NAME_PATTERN = /^[\w.-]+$/;

function initializeLiblouis() {
  try {
    importScripts(`${LIBLOUIS_BASE}build-no-tables-utf16.js`);
    importScripts(`${LIBLOUIS_BASE}easy-api.js`);

    liblouisInstance = new LiblouisEasyApi(liblouisBuild);

    // Keep a short log tail so translation failures can surface the real
    // liblouis error (missing table, bad include, etc.).
    liblouisInstance.registerLogCallback((level, msg) => {
      recentLogs.push(`[${level}] ${msg}`);
      if (recentLogs.length > 50) recentLogs.shift();
    });

    const origin = self.location?.origin || '';
    liblouisInstance.enableOnDemandTableLoading(
      `${origin}${LIBLOUIS_BASE}tables/`
    );

    // Preload the default chain so the first user keystroke is fast.
    try {
      liblouisInstance.checkTable('unicode.dis,en-ueb-g1.ctb');
    } catch (_e) {
      // Non-fatal: tables load on first translate instead.
    }

    liblouisReady = true;
    return { success: true };
  } catch (error) {
    console.error('[liblouis-worker] init failed:', error);
    return { success: false, error: error.message };
  }
}

function translate(text, table) {
  if (!liblouisReady || !liblouisInstance) {
    throw new Error('liblouis is not initialized');
  }
  if (!TABLE_NAME_PATTERN.test(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }

  // unicode.dis first in the chain forces Unicode braille output.
  const chain = `unicode.dis,${table}`;

  let result;
  try {
    result = liblouisInstance.translateString(chain, text);
  } catch (error) {
    throw withLogTail(
      new Error(`Translation crashed for table ${table}: ${error.message}`)
    );
  }

  if (typeof result !== 'string') {
    throw withLogTail(
      new Error(`Translation failed for table ${table} (no output)`)
    );
  }
  return result;
}

function withLogTail(error) {
  const tail = recentLogs.slice(-8).join('\n');
  if (tail) error.message += `\nRecent liblouis logs:\n${tail}`;
  return error;
}

self.onmessage = (e) => {
  const { id, type, data } = e.data || {};

  if (id === undefined || id === null) {
    self.postMessage({
      type: 'error',
      result: { success: false, error: 'Missing message id' },
    });
    return;
  }
  if (!ALLOWED_TYPES.includes(type)) {
    self.postMessage({
      id,
      type: 'error',
      result: { success: false, error: `Invalid message type: ${type}` },
    });
    return;
  }

  try {
    if (type === 'init') {
      self.postMessage({ id, type, result: initializeLiblouis() });
    } else {
      if (!data || typeof data.text !== 'string' || !data.table) {
        throw new Error('translate requires { text, table }');
      }
      const translation = translate(data.text, data.table);
      self.postMessage({ id, type, result: { success: true, translation } });
    }
  } catch (error) {
    self.postMessage({
      id,
      type,
      result: { success: false, error: error.message },
    });
  }
};
