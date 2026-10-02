/**
 * liblouis braille translation Web Worker
 * @license GPL-3.0-or-later
 *
 * A module worker. It loads liblouis, compiled to WebAssembly by
 * scripts/build-liblouis-wasm.sh, through src/js/liblouis-engine.js, and puts
 * every table that /liblouis/tables.json lists into the engine's own file
 * system before it answers anything. Nothing is fetched synchronously.
 *
 * Message protocol (request → response, matched by id):
 *   { id, type: 'init' }
 *     → { id, type: 'init', result: { success, error? } }
 *   { id, type: 'translate', data: { text, table } }
 *     → { id, type: 'translate', result: { success, translation?, inputPos?, error? } }
 *   { id, type: 'backTranslate', data: { braille, table } }
 *     → { id, type: 'backTranslate', result: { success, text?, error? } }
 */

import {
  backTranslate,
  installTables,
  loadLiblouis,
  translate,
} from '../js/liblouis-engine.js';

const LIBLOUIS_BASE = '/liblouis/';
const ALLOWED_TYPES = ['init', 'translate', 'backTranslate'];
// Table file names are catalog-driven; keep the worker defensive anyway.
const TABLE_NAME_PATTERN = /^[\w.-]+$/;

let enginePromise = null;

async function fetchOk(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response;
}

/** The engine with its tables, started once; a failure lets the next call retry. */
function startEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const mod = await loadLiblouis(
        () => import('../../vendor/liblouis/liblouis.mjs')
      );
      const catalog = await (
        await fetchOk(`${LIBLOUIS_BASE}tables.json`)
      ).json();
      const files = await Promise.all(
        (catalog.closure || []).map(async (name) => ({
          name,
          bytes: new Uint8Array(
            await (
              await fetchOk(`${LIBLOUIS_BASE}tables/${name}`)
            ).arrayBuffer()
          ),
        }))
      );
      installTables(mod, files);
      return mod;
    })().catch((error) => {
      enginePromise = null;
      throw new Error(
        `the braille engine did not start (${String(error?.message ?? error)})`
      );
    });
  }
  return enginePromise;
}

function checkTable(table) {
  if (typeof table !== 'string' || !TABLE_NAME_PATTERN.test(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }
}

self.onmessage = async (e) => {
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
    const mod = await startEngine();
    if (type === 'init') {
      self.postMessage({ id, type, result: { success: true } });
    } else if (type === 'translate') {
      if (!data || typeof data.text !== 'string') {
        throw new Error('translate requires { text, table }');
      }
      checkTable(data.table);
      const { braille, inputPos } = translate(mod, data.table, data.text);
      self.postMessage({
        id,
        type,
        result: { success: true, translation: braille, inputPos },
      });
    } else {
      if (!data || typeof data.braille !== 'string') {
        throw new Error('backTranslate requires { braille, table }');
      }
      checkTable(data.table);
      const text = backTranslate(mod, data.table, data.braille);
      self.postMessage({ id, type, result: { success: true, text } });
    }
  } catch (error) {
    self.postMessage({
      id,
      type,
      result: { success: false, error: String(error?.message ?? error) },
    });
  }
};
