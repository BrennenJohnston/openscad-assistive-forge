/**
 * Which OpenSCAD engine the app runs, and the official engines kept in this
 * browser.
 *
 * The Forge engine is built in. The official snapshots listed in
 * /wasm/engines.json are served from this site, but a person downloads one
 * only by asking to: the download checks every file against the manifest and
 * keeps the three files (the loader, the binary, INTEGRITY.json) in their own
 * Cache API cache, which the service worker answers from first and never
 * deletes when the app updates. The app's Clear Cache removes them with
 * everything else.
 *
 * @license GPL-3.0-or-later
 */

import {
  STORAGE_KEY_ENGINE,
  safeGetItem,
  safeSetItem,
} from './storage-keys.js';
import { requestPersistentStorage } from './storage-manager.js';
import { engineFileUrl } from '../worker/engine-url.js';
import { engineFileMismatch } from '../worker/engine-integrity.js';
import { isEngineFault } from './error-translator.js';

/** The cache the downloaded engines live in; sw.js keeps it at every update. */
export const ENGINE_CACHE = 'forge-engines-v1';
export const DEFAULT_ENGINE_ID = 'forge';
export const DEFAULT_ENGINE_PATH = '/wasm/openscad-official';
const MANIFEST_URL = '/wasm/engines.json';
const OFFICIAL_ID = /^official-\d{4}-\d{2}-\d{2}$/;
const CONTENT_TYPES = {
  'INTEGRITY.json': 'application/json',
  'openscad.js': 'text/javascript',
  'openscad.wasm': 'application/wasm',
};

let manifestPromise = null;

/**
 * The engines manifest, fetched once.
 * @param {{fetchImpl?: Function}} [options]
 * @returns {Promise<{version: number, engines: Object[]}>}
 */
export function loadEnginesManifest({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      const response = await fetchImpl(MANIFEST_URL);
      if (!response.ok) {
        throw new Error(`${MANIFEST_URL}: HTTP ${response.status}`);
      }
      const manifest = await response.json();
      if (!Array.isArray(manifest?.engines)) {
        throw new Error(`${MANIFEST_URL} names no engines`);
      }
      return manifest;
    })();
    manifestPromise.catch(() => {
      manifestPromise = null;
    });
  }
  return manifestPromise;
}

/** Forget the fetched manifest (tests, and a fresh page). */
export function resetEnginesManifest() {
  manifestPromise = null;
}

/** @returns {string} The chosen engine's id; the Forge engine unless set. */
export function getChosenEngineId() {
  const id = safeGetItem(STORAGE_KEY_ENGINE, DEFAULT_ENGINE_ID);
  return id === DEFAULT_ENGINE_ID || OFFICIAL_ID.test(id)
    ? id
    : DEFAULT_ENGINE_ID;
}

/** @param {string} id */
export function setChosenEngineId(id) {
  safeSetItem(STORAGE_KEY_ENGINE, id);
}

/**
 * The folder an engine is served from. Every official engine lives at
 * /wasm/engines/<id>, so the path follows from the id alone; anything else
 * is the Forge engine.
 * @param {string} id
 * @returns {string}
 */
export function enginePathFor(id) {
  return OFFICIAL_ID.test(id ?? '')
    ? `/wasm/engines/${id}`
    : DEFAULT_ENGINE_PATH;
}

/** @returns {Object|undefined} The manifest's entry for an id. */
export function engineById(manifest, id) {
  return manifest.engines.find((engine) => engine.id === id);
}

/**
 * The three addresses an engine's files are fetched from, as the worker
 * fetches them: the binary's address carries its build (engineFileUrl).
 */
function engineUrls(engine, origin = globalThis.location?.origin ?? '') {
  const base = `${origin}${engine.path}`;
  return {
    'INTEGRITY.json': `${base}/INTEGRITY.json`,
    'openscad.js': `${base}/openscad.js`,
    'openscad.wasm': engineFileUrl(base, { files: engine.files }),
  };
}

/** The bytes an engine takes once kept: its two files. */
export function engineSize(engine) {
  return (
    (engine.files?.['openscad.js']?.size ?? 0) +
    (engine.files?.['openscad.wasm']?.size ?? 0)
  );
}

/**
 * Whether an engine can run without a download: the Forge engine always,
 * an official one when all three of its files are in the cache.
 * @param {Object} manifest
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function isDownloaded(manifest, id) {
  const engine = engineById(manifest, id);
  if (!engine) return false;
  if (engine.builtIn) return true;
  if (!globalThis.caches) return false;
  const cache = await caches.open(ENGINE_CACHE);
  const found = await Promise.all(
    Object.values(engineUrls(engine)).map((url) => cache.match(url))
  );
  return found.every(Boolean);
}

/**
 * Read a response's body, reporting each chunk's length. The bytes come back
 * as a Uint8Array: crypto.subtle takes any typed array, where a bare
 * ArrayBuffer has to come from the same JavaScript realm (Node 20 checks).
 */
async function readBody(response, onChunk) {
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    onChunk(bytes.byteLength);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    length += value.byteLength;
    onChunk(value.byteLength);
  }
  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

/**
 * Download an official engine and keep it. Each file is checked against the
 * manifest before anything is kept; one wrong byte keeps nothing.
 *
 * @param {Object} manifest
 * @param {string} id
 * @param {Object} [options]
 * @param {(percent: number) => void} [options.onProgress] - 0 to 100
 * @param {Function} [options.fetchImpl]
 * @param {() => Promise<unknown>} [options.requestPersistence] - asked once,
 *   when the first engine is kept
 * @returns {Promise<{bytes: number}>}
 */
export async function download(
  manifest,
  id,
  {
    onProgress = () => {},
    fetchImpl = (...args) => globalThis.fetch(...args),
    requestPersistence = requestPersistentStorage,
  } = {}
) {
  const engine = engineById(manifest, id);
  if (!engine || engine.builtIn) {
    throw new Error(`${id} is not an engine to download`);
  }
  const urls = engineUrls(engine);
  const total = engineSize(engine);
  let loaded = 0;
  let lastPercent = -1;
  const report = (bytes) => {
    loaded += bytes;
    const percent = Math.min(100, Math.floor((loaded / total) * 100));
    if (percent !== lastPercent) {
      lastPercent = percent;
      onProgress(percent);
    }
  };

  const bodies = {};
  for (const name of ['INTEGRITY.json', 'openscad.js', 'openscad.wasm']) {
    const response = await fetchImpl(urls[name], { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`${name}: HTTP ${response.status}`);
    }
    bodies[name] = await readBody(
      response,
      name === 'INTEGRITY.json' ? () => {} : report
    );
    if (name !== 'INTEGRITY.json') {
      const mismatch = await engineFileMismatch(
        name,
        bodies[name],
        engine.files[name]
      );
      if (mismatch) throw new Error(mismatch);
    }
  }
  const integrity = JSON.parse(
    new TextDecoder().decode(bodies['INTEGRITY.json'])
  );
  for (const name of ['openscad.js', 'openscad.wasm']) {
    if (integrity.files?.[name]?.sha256 !== engine.files[name].sha256) {
      throw new Error(`INTEGRITY.json does not match the manifest for ${name}`);
    }
  }

  const cache = await caches.open(ENGINE_CACHE);
  const firstKept = (await cache.keys()).length === 0;
  for (const [name, body] of Object.entries(bodies)) {
    await cache.put(
      urls[name],
      new Response(body, {
        headers: {
          'Content-Type': CONTENT_TYPES[name],
          'Content-Length': String(body.byteLength),
        },
      })
    );
  }
  if (firstKept) await requestPersistence();
  onProgress(100);
  return { bytes: total };
}

/**
 * Forget a downloaded engine. When it was the chosen one, the Forge engine is
 * chosen again (the caller restarts the engine).
 * @returns {Promise<boolean>} Whether the chosen engine changed
 */
export async function remove(manifest, id) {
  const engine = engineById(manifest, id);
  if (!engine || engine.builtIn) return false;
  const cache = await caches.open(ENGINE_CACHE);
  await Promise.all(
    Object.values(engineUrls(engine)).map((url) => cache.delete(url))
  );
  if (getChosenEngineId() === id) {
    setChosenEngineId(DEFAULT_ENGINE_ID);
    return true;
  }
  return false;
}

/**
 * Forget every downloaded engine, for the app's Clear Cache. The Forge engine
 * is chosen again, since nothing else is kept.
 */
export async function clearDownloads() {
  if (globalThis.caches) await caches.delete(ENGINE_CACHE);
  setChosenEngineId(DEFAULT_ENGINE_ID);
}

/**
 * The engine to start with: the chosen one when it is kept, else the Forge
 * engine (and the choice goes back to it).
 * @param {{loadManifest?: Function}} [options]
 * @returns {Promise<string>} The engine folder's path
 */
export async function startupEnginePath({
  loadManifest = loadEnginesManifest,
} = {}) {
  const id = getChosenEngineId();
  if (id === DEFAULT_ENGINE_ID) return DEFAULT_ENGINE_PATH;
  const manifest = await loadManifest();
  if (!(await isDownloaded(manifest, id))) {
    console.warn(
      `[Engine] ${id} is chosen but not kept in this browser; starting the Forge engine`
    );
    setChosenEngineId(DEFAULT_ENGINE_ID);
    return DEFAULT_ENGINE_PATH;
  }
  return enginePathFor(id);
}

/**
 * Run a kept engine: choose it, restart the engine with it, and run the last
 * render again.
 * @param {Object} manifest
 * @param {string} id
 * @param {{renderController: {restart: Function}, rerun?: Function}} options
 * @returns {Promise<Object>} The engine's manifest entry
 */
export async function switchTo(manifest, id, { renderController, rerun }) {
  const engine = engineById(manifest, id);
  if (!engine) throw new Error(`${id} is not in the engines manifest`);
  if (!(await isDownloaded(manifest, id))) {
    throw new Error(`${id} is not downloaded`);
  }
  setChosenEngineId(id);
  await renderController.restart({ enginePath: engine.path });
  if (rerun) await rerun();
  return engine;
}

/** "Not now" for this file: no offer until the next file opens. */
let offerDeclined = false;

/** A file opened: the engine may be offered again. */
export function resetEngineOffer() {
  offerDeclined = false;
}

/** Decimal megabytes with one decimal, the unit the engine words speak in. */
export const megabytes = (bytes) => (bytes / 1e6).toFixed(1);

/**
 * Download an engine with its count in the status line, spoken at 0 and 50
 * percent only: what follows the download speaks instead of a third count.
 * @param {{download: Function, status: Function}} handlers - download(id,
 *   onProgress) and status(text, {announce})
 * @param {Object} entry - the engine's manifest entry
 */
export async function downloadWithStatus(handlers, entry) {
  let spoken = -1;
  await handlers.download(entry.id, (percent) => {
    const mark = [0, 50].filter((m) => percent >= m && spoken < m).pop();
    if (mark !== undefined) spoken = mark;
    handlers.status(`Downloading the ${entry.name} engine: ${percent}%`, {
      announce: mark !== undefined,
    });
  });
}

/** What the error dialog says when a download failed. */
export const downloadFailure = (error) => ({
  title: 'Engine download failed',
  message: 'Nothing was kept. Check your connection and try again.',
  technical: error.message,
});

/**
 * What the error dialog offers when a failure may be the engine's: one more
 * paragraph and its buttons, or null when there is nothing to offer (the
 * failure is the model's, "Not now" was chosen for this file, or no official
 * engine is listed). With the Forge engine in use the offer is the newest
 * official engine; when an official engine failed as well, the other
 * official snapshots and the Forge engine again.
 *
 * @param {Object} options
 * @param {string} [options.code] - the failure's code
 * @param {Object} options.handlers - manifest(), chosenId(), isDownloaded(id),
 *   download(id, onProgress), status(text, {announce}), showError(details)
 * @param {(id: string) => Promise<unknown>} options.run - start that engine
 *   and do again what failed
 * @returns {Promise<{extra: string, actions: Object[]}|null>}
 */
export async function offerEngineAfterFault({ code, handlers, run }) {
  if (!isEngineFault(code) || offerDeclined) return null;
  const manifest = await handlers.manifest();
  const official = manifest.engines.filter((entry) => !entry.builtIn);
  if (official.length === 0) return null;
  const builtIn = manifest.engines.find((entry) => entry.builtIn);
  const inUse = handlers.chosenId();

  const tryEngine = async (entry) => {
    try {
      if (!(await handlers.isDownloaded(entry.id))) {
        await downloadWithStatus(handlers, entry);
      }
    } catch (error) {
      handlers.showError(downloadFailure(error));
      return;
    }
    handlers.status(`Trying the model again with the ${entry.name} engine.`, {
      announce: true,
    });
    await run(entry.id);
  };

  if (inUse === builtIn?.id || !official.some((e) => e.id === inUse)) {
    const newest = official[0];
    const kept = await handlers.isDownloaded(newest.id);
    const size = kept
      ? 'already kept in this browser'
      : `about ${megabytes(newest.zip.size)} MB to download, ${megabytes(engineSize(newest))} MB kept in this browser`;
    return {
      extra: `This may be a fault in the rendering engine rather than in the model. You can try the official OpenSCAD engine (snapshot ${newest.date}, ${size}).`,
      actions: [
        {
          label: kept ? 'Try it' : 'Download and try it',
          primary: true,
          onClick: () => tryEngine(newest),
        },
        {
          label: 'Not now',
          focus: true,
          onClick: () => {
            offerDeclined = true;
          },
        },
      ],
    };
  }

  const others = official.filter((entry) => entry.id !== inUse);
  const kept = await Promise.all(
    others.map((entry) => handlers.isDownloaded(entry.id))
  );
  return {
    extra: `The official engine failed on this model too. The other ${others.length === 3 ? 'three' : others.length} official snapshots are here to try, or you can go back to the Forge engine.`,
    actions: [
      ...others.map((entry, i) => ({
        label: `${entry.name} (official), ${kept[i] ? 'kept' : `${megabytes(entry.zip.size)} MB`}`,
        onClick: () => tryEngine(entry),
      })),
      {
        label: 'Back to the Forge engine',
        onClick: () => run(builtIn.id),
      },
      { label: 'Keep the official engine', focus: true, onClick: () => {} },
    ],
  };
}
