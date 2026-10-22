/**
 * Which engine runs, and the official engines kept in this browser: the
 * choice and its fallbacks, a download that checks every byte before it keeps
 * anything, removal, the engine to start with, and the render controller
 * passing the chosen engine's folder to the worker.
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/js/feature-flags.js', () => ({
  isEnabled: vi.fn(() => false),
}));

import {
  ENGINE_CACHE,
  clearDownloads,
  download,
  enginePathFor,
  getChosenEngineId,
  isDownloaded,
  othersSentence,
  remove,
  setChosenEngineId,
  startupEnginePath,
  switchTo,
} from '../../src/js/engine-choice.js';
import { RenderController } from '../../src/js/render-controller.js';

const ORIGIN = window.location.origin;
const ID = 'official-2026-10-18';

const hex = async (bytes) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (b) => b.toString(16).padStart(2, '0')
  ).join('');

/** A Map-backed Cache API, enough of it for these cases. */
function stubCaches() {
  const stores = new Map();
  const keyOf = (request) => (typeof request === 'string' ? request : request.url);
  const api = {
    stores,
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async match(request) {
          const hit = store.get(keyOf(request));
          return hit ? hit.clone() : undefined;
        },
        async put(request, response) {
          store.set(keyOf(request), response);
        },
        async delete(request) {
          return store.delete(keyOf(request));
        },
        async keys() {
          return [...store.keys()].map((url) => ({ url }));
        },
      };
    },
    async delete(name) {
      return stores.delete(name);
    },
    async keys() {
      return [...stores.keys()];
    },
  };
  vi.stubGlobal('caches', api);
  return api;
}

let js;
let wasm;
let manifest;
let integrity;

beforeEach(async () => {
  for (const method of ['error', 'warn', 'log', 'info', 'debug']) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
  localStorage.clear();
  stubCaches();
  js = new TextEncoder().encode('export default async function OpenSCAD() {}');
  wasm = new Uint8Array(4096).map((_, i) => i % 251);
  const files = {
    'openscad.js': { sha256: await hex(js), size: js.byteLength },
    'openscad.wasm': { sha256: await hex(wasm), size: wasm.byteLength },
  };
  integrity = { version: '1.0', build: 'OpenSCAD snapshot 2026.10.18', files };
  manifest = {
    version: 1,
    engines: [
      { id: 'forge', name: 'Forge', builtIn: true, path: '/wasm/openscad-official' },
      { id: ID, name: 'OpenSCAD snapshot 2026.10.18', path: `/wasm/engines/${ID}`, files },
    ],
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** What the server answers for each of the engine's files. */
function serve(overrides = {}) {
  const bodies = {
    'INTEGRITY.json': new TextEncoder().encode(JSON.stringify(integrity)),
    'openscad.js': js,
    'openscad.wasm': wasm,
    ...overrides,
  };
  const asked = [];
  const fetchImpl = vi.fn(async (url) => {
    asked.push(url);
    const name = Object.keys(bodies).find((n) => url.split('?')[0].endsWith(`/${n}`));
    if (!name) return new Response('', { status: 404 });
    const body = bodies[name];
    if (typeof body === 'number') return new Response('', { status: body });
    return new Response(body, { status: 200 });
  });
  return { fetchImpl, asked };
}

describe('the chosen engine', () => {
  it('is the Forge engine unless one was chosen', () => {
    expect(getChosenEngineId()).toBe('forge');
    setChosenEngineId(ID);
    expect(getChosenEngineId()).toBe(ID);
  });

  it('falls back to the Forge engine for an id that names no engine', () => {
    setChosenEngineId('../../somewhere-else');
    expect(getChosenEngineId()).toBe('forge');
    expect(enginePathFor('../../somewhere-else')).toBe('/wasm/openscad-official');
    expect(enginePathFor(ID)).toBe(`/wasm/engines/${ID}`);
  });
});

describe('downloading an official engine', () => {
  it('keeps its three files under the addresses the worker asks for, and counts up to 100', async () => {
    const { fetchImpl } = serve();
    const progress = [];
    const requestPersistence = vi.fn(async () => ({ granted: true }));
    await download(manifest, ID, {
      fetchImpl,
      onProgress: (p) => progress.push(p),
      requestPersistence,
    });
    const kept = [...caches.stores.get(ENGINE_CACHE).keys()].sort();
    const v = integrity.files['openscad.wasm'].sha256.slice(0, 16);
    expect(kept).toEqual(
      [
        `${ORIGIN}/wasm/engines/${ID}/INTEGRITY.json`,
        `${ORIGIN}/wasm/engines/${ID}/openscad.js`,
        `${ORIGIN}/wasm/engines/${ID}/openscad.wasm?v=${v}`,
      ].sort()
    );
    const keptWasm = await (await caches.open(ENGINE_CACHE)).match(kept.find((u) => u.includes('.wasm')));
    expect(keptWasm.headers.get('Content-Type')).toBe('application/wasm');
    expect(progress[progress.length - 1]).toBe(100);
    expect(progress.every((p, i) => i === 0 || p >= progress[i - 1])).toBe(true);
    expect(requestPersistence).toHaveBeenCalledTimes(1);
    expect(await isDownloaded(manifest, ID)).toBe(true);
  });

  it('finishes while the browser still waits for an answer about persistent storage', async () => {
    // Firefox settles navigator.storage.persist() only once the person
    // answers its permission prompt, which may be never.
    const { fetchImpl } = serve();
    const progress = [];
    const requestPersistence = vi.fn(() => new Promise(() => {}));
    const finished = download(manifest, ID, {
      fetchImpl,
      onProgress: (p) => progress.push(p),
      requestPersistence,
    }).then(() => 'finished');
    const waited = new Promise((resolve) => setTimeout(() => resolve('still waiting'), 1000));
    expect(await Promise.race([finished, waited])).toBe('finished');
    expect(requestPersistence).toHaveBeenCalledTimes(1);
    expect(progress[progress.length - 1]).toBe(100);
  });

  it('keeps nothing when one byte differs from the manifest', async () => {
    const damaged = wasm.slice();
    damaged[10] ^= 1;
    const { fetchImpl } = serve({ 'openscad.wasm': damaged });
    await expect(download(manifest, ID, { fetchImpl, requestPersistence: vi.fn() })).rejects.toThrow(
      /openscad\.wasm: SHA-256 mismatch/
    );
    expect(caches.stores.get(ENGINE_CACHE)?.size ?? 0).toBe(0);
    expect(await isDownloaded(manifest, ID)).toBe(false);
  });

  it('says the status when the server refuses a file', async () => {
    const { fetchImpl } = serve({ 'openscad.js': 503 });
    await expect(download(manifest, ID, { fetchImpl, requestPersistence: vi.fn() })).rejects.toThrow(
      /openscad\.js: HTTP 503/
    );
  });

  it('refuses the built-in engine', async () => {
    await expect(download(manifest, 'forge')).rejects.toThrow(/not an engine to download/);
  });
});

describe('removing kept engines', () => {
  it('Remove deletes the three files and gives the Forge engine back when it was chosen', async () => {
    const { fetchImpl } = serve();
    await download(manifest, ID, { fetchImpl, requestPersistence: vi.fn() });
    setChosenEngineId(ID);
    expect(await remove(manifest, ID)).toBe(true);
    expect(caches.stores.get(ENGINE_CACHE).size).toBe(0);
    expect(getChosenEngineId()).toBe('forge');
  });

  it('Clear Cache deletes the whole cache and chooses the Forge engine', async () => {
    const { fetchImpl } = serve();
    await download(manifest, ID, { fetchImpl, requestPersistence: vi.fn() });
    setChosenEngineId(ID);
    await clearDownloads();
    expect(caches.stores.has(ENGINE_CACHE)).toBe(false);
    expect(getChosenEngineId()).toBe('forge');
  });
});

describe('the engine to start with', () => {
  it('the chosen engine when it is kept', async () => {
    const { fetchImpl } = serve();
    await download(manifest, ID, { fetchImpl, requestPersistence: vi.fn() });
    setChosenEngineId(ID);
    expect(await startupEnginePath({ loadManifest: async () => manifest })).toBe(
      `/wasm/engines/${ID}`
    );
  });

  it('the Forge engine, chosen again, when the chosen one is not kept', async () => {
    setChosenEngineId(ID);
    expect(await startupEnginePath({ loadManifest: async () => manifest })).toBe(
      '/wasm/openscad-official'
    );
    expect(getChosenEngineId()).toBe('forge');
  });
});

describe('switching engines', () => {
  it('chooses the kept engine, restarts with its folder, and runs the render again', async () => {
    const { fetchImpl } = serve();
    await download(manifest, ID, { fetchImpl, requestPersistence: vi.fn() });
    const renderController = { restart: vi.fn(async () => {}) };
    const rerun = vi.fn(async () => {});
    await switchTo(manifest, ID, { renderController, rerun });
    expect(getChosenEngineId()).toBe(ID);
    expect(renderController.restart).toHaveBeenCalledWith({ enginePath: `/wasm/engines/${ID}` });
    expect(rerun).toHaveBeenCalledTimes(1);
  });

  it('refuses an engine that is not downloaded', async () => {
    const renderController = { restart: vi.fn() };
    await expect(switchTo(manifest, ID, { renderController })).rejects.toThrow(/not downloaded/);
    expect(renderController.restart).not.toHaveBeenCalled();
    expect(getChosenEngineId()).toBe('forge');
  });
});

describe('the render controller passes the engine folder to the worker', () => {
  let posted;
  beforeEach(() => {
    posted = [];
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          this.messages = posted;
        }
        postMessage(message) {
          posted.push(message);
          // Answer INIT as a worker that started.
          if (message.type === 'INIT') {
            queueMicrotask(() =>
              this.onmessage?.({
                data: { type: 'READY', payload: { capabilities: { hasManifold: true } } },
              })
            );
          }
        }
        terminate() {}
      }
    );
  });

  it('starts the chosen engine when it is kept, and a switch starts the other one asking for its capabilities', async () => {
    const { fetchImpl } = serve();
    await download(manifest, ID, { fetchImpl, requestPersistence: vi.fn() });
    setChosenEngineId(ID);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(manifest))));
    const controller = new RenderController();
    await controller.init();
    const first = posted.filter((m) => m.type === 'INIT');
    expect(first[0].payload.enginePath).toBe(`/wasm/engines/${ID}`);
    expect(controller.getEnginePath()).toBe(`/wasm/engines/${ID}`);

    await controller.restart({ enginePath: '/wasm/openscad-official' });
    const inits = posted.filter((m) => m.type === 'INIT');
    const last = inits[inits.length - 1];
    expect(last.payload.enginePath).toBe('/wasm/openscad-official');
    expect(last.payload.cachedCapabilities).toBeUndefined();
    controller.terminate();
  });
});

describe('the sentence that offers the other official snapshots', () => {
  it('counts them in words up to three, and says one snapshot as one', () => {
    expect(othersSentence(1)).toBe(
      'The other official snapshot is here to try, or you can go back to the Forge engine.'
    );
    expect(othersSentence(2)).toBe(
      'The other two official snapshots are here to try, or you can go back to the Forge engine.'
    );
    expect(othersSentence(3)).toBe(
      'The other three official snapshots are here to try, or you can go back to the Forge engine.'
    );
    expect(othersSentence(5)).toBe(
      'The other 5 official snapshots are here to try, or you can go back to the Forge engine.'
    );
  });
});
