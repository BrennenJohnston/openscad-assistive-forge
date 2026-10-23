// @vitest-environment node
/**
 * The service worker and the downloaded engines: public/sw.js itself, run in
 * a sandbox with a stand-in Cache API. A new version of the app deletes its
 * old caches but keeps the engines; a kept engine is answered from its cache;
 * the worker never stores an engine on its own; Clear Cache still empties
 * everything.
 * @license GPL-3.0-or-later
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, it, expect, vi } from 'vitest';

const SOURCE = readFileSync(
  path.resolve(__dirname, '../../public/sw.js'),
  'utf8'
);
const ORIGIN = 'https://forge.example';
const ENGINE_URL = `${ORIGIN}/wasm/engines/official-2026-10-18/openscad.wasm?v=45ce2aedc3356ea1`;

function load(initialCaches, { client = null } = {}) {
  const stores = new Map(
    Object.entries(initialCaches).map(([name, entries]) => [
      name,
      new Map(Object.entries(entries)),
    ])
  );
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        match: async (req) =>
          store.get(typeof req === 'string' ? req : req.url),
        put: async (req, res) =>
          store.set(typeof req === 'string' ? req : req.url, res),
        delete: async (req) =>
          store.delete(typeof req === 'string' ? req : req.url),
        keys: async () => [...store.keys()].map((url) => ({ url })),
        addAll: async () => {},
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  };
  const handlers = {};
  const fetch = vi.fn(async () => ({
    status: 200,
    clone() {
      return this;
    },
    from: 'network',
  }));
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => {
      handlers[type] = fn;
    },
    skipWaiting: async () => {},
    clients: {
      claim: async () => {},
      matchAll: async () => (client ? [client] : []),
      get: async (id) => (client && id === client.id ? client : null),
    },
  };
  const context = vm.createContext({
    self,
    caches,
    fetch,
    URL,
    Promise,
    console: { log() {}, warn() {}, error() {} },
  });
  new vm.Script(SOURCE).runInContext(context);
  return { handlers, stores, fetch };
}

async function dispatchFetch(
  handlers,
  url,
  cache = 'default',
  clientId = undefined
) {
  let answer;
  handlers.fetch({
    request: { url, method: 'GET', cache, mode: 'cors' },
    clientId,
    respondWith: (promise) => {
      answer = promise;
    },
  });
  return answer;
}

/** The host's answer for a path it does not have: the page, 200, text/html. */
const fallbackHtml = () => ({
  status: 200,
  headers: {
    get: (name) =>
      name === 'content-type' ? 'text/html; charset=utf-8' : null,
  },
  clone() {
    return this;
  },
  from: 'fallback',
});

/** A real file's answer. */
const realFile = (type) => ({
  status: 200,
  headers: { get: (name) => (name === 'content-type' ? type : null) },
  clone() {
    return this;
  },
  from: 'network',
});

describe('the service worker and the downloaded engines', () => {
  it('a new version deletes its old caches and keeps the engines', async () => {
    const { handlers, stores } = load({
      'openscad-forge-build-old': { a: 1 },
      'openscad-forge-__SW_CACHE_VERSION__': { b: 1 },
      'forge-engines-v1': { [ENGINE_URL]: { kept: true } },
    });
    let done;
    handlers.activate({ waitUntil: (p) => (done = p) });
    await done;
    expect([...stores.keys()].sort()).toEqual(
      ['forge-engines-v1', 'openscad-forge-__SW_CACHE_VERSION__'].sort()
    );
  });

  it('answers a kept engine from its cache without asking the network', async () => {
    const kept = { kept: true };
    const { handlers, fetch } = load({
      'forge-engines-v1': { [ENGINE_URL]: kept },
    });
    expect(await dispatchFetch(handlers, ENGINE_URL)).toBe(kept);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches an engine that is not kept and stores it nowhere', async () => {
    const { handlers, fetch, stores } = load({});
    const answer = await dispatchFetch(handlers, ENGINE_URL);
    expect(answer.from).toBe('network');
    expect(fetch).toHaveBeenCalledTimes(1);
    for (const store of stores.values()) expect(store.size).toBe(0);
  });

  it('goes to the network past a kept copy when asked to reload it', async () => {
    const { handlers, fetch } = load({
      'forge-engines-v1': { [ENGINE_URL]: { kept: true } },
    });
    const answer = await dispatchFetch(handlers, ENGINE_URL, 'reload');
    expect(answer.from).toBe('network');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('Clear Cache empties the engines too', async () => {
    const { handlers, stores } = load({
      'openscad-forge-__SW_CACHE_VERSION__': { b: 1 },
      'forge-engines-v1': { [ENGINE_URL]: { kept: true } },
    });
    let done;
    handlers.message({
      data: { type: 'CLEAR_CACHE' },
      ports: [],
      waitUntil: (p) => (done = p),
    });
    await done;
    expect(stores.size).toBe(0);
  });
});

describe('the service worker after a deploy', () => {
  it("does not store the host's HTML fallback under an asset's address, and sends the page to reload once", async () => {
    const client = {
      id: 'page-1',
      url: `${ORIGIN}/`,
      navigate: vi.fn(async () => {}),
    };
    const { handlers, stores, fetch } = load(
      { 'openscad-forge-v9': {} },
      { client }
    );
    fetch.mockImplementation(async () => fallbackHtml());
    const answer = await dispatchFetch(
      handlers,
      `${ORIGIN}/assets/index-old.css`,
      'default',
      'page-1'
    );
    expect(answer.from).toBe('fallback');
    const stored = [...stores.values()].flatMap((store) => [...store.keys()]);
    expect(stored).not.toContain(`${ORIGIN}/assets/index-old.css`);
    expect(client.navigate).toHaveBeenCalledWith(`${ORIGIN}/`);
    await dispatchFetch(
      handlers,
      `${ORIGIN}/assets/index-old.js`,
      'default',
      'page-1'
    );
    expect(client.navigate).toHaveBeenCalledTimes(1);
  });

  it('does not store an HTML fallback for a font either, and leaves the page alone', async () => {
    const client = {
      id: 'page-2',
      url: `${ORIGIN}/`,
      navigate: vi.fn(async () => {}),
    };
    const { handlers, stores, fetch } = load({}, { client });
    fetch.mockImplementation(async () => fallbackHtml());
    await dispatchFetch(
      handlers,
      `${ORIGIN}/fonts/Missing.ttf`,
      'default',
      'page-2'
    );
    const stored = [...stores.values()].flatMap((store) => [...store.keys()]);
    expect(stored).not.toContain(`${ORIGIN}/fonts/Missing.ttf`);
    expect(client.navigate).not.toHaveBeenCalled();
  });

  it('stores a real stylesheet as before', async () => {
    const { handlers, stores, fetch } = load({});
    fetch.mockImplementation(async () => realFile('text/css'));
    await dispatchFetch(handlers, `${ORIGIN}/assets/index-new.css`);
    const stored = [...stores.values()].flatMap((store) => [...store.keys()]);
    expect(stored).toContain(`${ORIGIN}/assets/index-new.css`);
  });

  it("the trim never removes the shell's own files", async () => {
    const entries = {
      [`${ORIGIN}/`]: { from: 'shell' },
      [`${ORIGIN}/index.html`]: { from: 'shell' },
      [`${ORIGIN}/assets/index-abc.js`]: { from: 'shell' },
      [`${ORIGIN}/assets/index-abc.css`]: { from: 'shell' },
    };
    for (let i = 0; i < 420; i++)
      entries[`${ORIGIN}/sounds/set/file-${i}.wav`] = { from: 'sound' };
    // The worker's own cache in the sandbox carries the uninjected version token.
    const { handlers, stores, fetch } = load({
      'openscad-forge-__SW_CACHE_VERSION__': entries,
    });
    fetch.mockImplementation(async () => realFile('application/wasm'));
    await dispatchFetch(
      handlers,
      `${ORIGIN}/wasm/openscad-official/openscad.wasm`
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const keys = [...stores.values()].flatMap((store) => [...store.keys()]);
    expect(keys).toEqual(
      expect.arrayContaining([
        `${ORIGIN}/`,
        `${ORIGIN}/index.html`,
        `${ORIGIN}/assets/index-abc.js`,
        `${ORIGIN}/assets/index-abc.css`,
      ])
    );
    expect(keys.filter((k) => k.includes('/sounds/')).length).toBeLessThan(420);
  });
});
