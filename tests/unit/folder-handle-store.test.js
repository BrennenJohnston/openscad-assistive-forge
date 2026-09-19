/**
 * Tests for the F35 Phase A folder-handle persistence layer.
 *
 * IndexedDB calls go through jsdom's built-in IDB shim (vitest's
 * `jsdom` environment provides one via `fake-indexeddb` is NOT
 * required because vitest uses jsdom which ships its own subset).
 * Where the shim is missing pieces we inject a tiny in-memory
 * factory.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isFolderHandleStorageSupported,
  loadFolderHandle,
  listFolderHandles,
  saveFolderHandle,
  clearFolderHandle,
  ROOT_KEY,
  __test,
} from '../../src/js/folder-handle-store.js';

// ---------------------------------------------------------------------------
// In-memory IDBFactory shim — tracks one DB, one store, one entry. Plenty
// for the storage layer's behaviour, and lets us assert directly against
// the underlying state without coupling to the real IDB internals.
// ---------------------------------------------------------------------------
function makeMemoryIdb() {
  const dbs = new Map();

  function makeRequest(work) {
    const req = {
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      onblocked: null,
      result: undefined,
      error: null,
    };
    queueMicrotask(() => {
      try {
        const result = work(req);
        req.result = result;
        req.onsuccess?.();
      } catch (err) {
        req.error = err;
        req.onerror?.();
      }
    });
    return req;
  }

  function makeStore(state) {
    return {
      get(key) {
        return makeRequest(() => state.records.get(key));
      },
      put(value, key) {
        return makeRequest(() => {
          state.records.set(key, value);
          return key;
        });
      },
      delete(key) {
        return makeRequest(() => {
          state.records.delete(key);
        });
      },
      getAllKeys() {
        return makeRequest(() => [...state.records.keys()]);
      },
      getAll() {
        return makeRequest(() => [...state.records.values()]);
      },
    };
  }

  function makeTx(state) {
    state.txCount += 1;
    return {
      objectStore: () => makeStore(state),
    };
  }

  function makeDb(state) {
    return {
      objectStoreNames: {
        contains: (n) => state.stores.has(n),
      },
      createObjectStore(n) {
        state.stores.add(n);
      },
      transaction: () => makeTx(state),
      close() {},
    };
  }

  return {
    open(name, version) {
      const req = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        onblocked: null,
        result: undefined,
        error: null,
      };
      queueMicrotask(() => {
        let state = dbs.get(name);
        const isNew = !state;
        if (!state) {
          state = {
            stores: new Set(),
            records: new Map(),
            version: 0,
            txCount: 0,
          };
          dbs.set(name, state);
        }
        const db = makeDb(state);
        if (isNew || state.version < version) {
          state.version = version;
          req.result = db;
          req.onupgradeneeded?.();
        }
        req.result = db;
        req.onsuccess?.();
      });
      return req;
    },
    _state: dbs,
  };
}

describe('folder-handle-store (F35 Phase A)', () => {
  let memIdb;

  beforeEach(() => {
    memIdb = makeMemoryIdb();
  });

  describe('isFolderHandleStorageSupported', () => {
    it('reports true when both IDB and FSA are present', () => {
      expect(
        isFolderHandleStorageSupported({
          indexedDB: {},
          showDirectoryPicker: () => {},
        })
      ).toBe(true);
    });

    it('reports false when IDB is missing', () => {
      expect(
        isFolderHandleStorageSupported({
          showDirectoryPicker: () => {},
        })
      ).toBe(false);
    });

    it('reports false when showDirectoryPicker is missing', () => {
      expect(
        isFolderHandleStorageSupported({
          indexedDB: {},
        })
      ).toBe(false);
    });
  });

  describe('round-trip', () => {
    it('returns null when nothing is stored', async () => {
      const result = await loadFolderHandle({ idbFactory: memIdb });
      expect(result).toBeNull();
    });

    it('persists and reloads a handle-shaped object', async () => {
      const fakeHandle = { name: 'my-project', kind: 'directory' };
      await saveFolderHandle(fakeHandle, { idbFactory: memIdb });

      const restored = await loadFolderHandle({ idbFactory: memIdb });
      expect(restored).toEqual(fakeHandle);
    });

    it('overwrites a previously-stored handle on a second save', async () => {
      await saveFolderHandle(
        { name: 'first', kind: 'directory' },
        { idbFactory: memIdb }
      );
      await saveFolderHandle(
        { name: 'second', kind: 'directory' },
        { idbFactory: memIdb }
      );
      const restored = await loadFolderHandle({ idbFactory: memIdb });
      expect(restored.name).toBe('second');
    });

    it('clear() removes the stored handle', async () => {
      await saveFolderHandle(
        { name: 'temp', kind: 'directory' },
        { idbFactory: memIdb }
      );
      await clearFolderHandle({ idbFactory: memIdb });
      expect(await loadFolderHandle({ idbFactory: memIdb })).toBeNull();
    });

    it('clear() is idempotent when nothing is stored', async () => {
      await expect(
        clearFolderHandle({ idbFactory: memIdb })
      ).resolves.not.toThrow();
    });
  });

  describe('keyed storage (folder-link projects)', () => {
    it('round-trips a handle under a custom key without touching root', async () => {
      const rootHandle = { name: 'root-folder', kind: 'directory' };
      const linkedHandle = { name: 'keyguard-folder', kind: 'directory' };
      await saveFolderHandle(rootHandle, { idbFactory: memIdb });
      await saveFolderHandle(linkedHandle, {
        idbFactory: memIdb,
        key: 'fh-123-abc',
      });

      expect(
        await loadFolderHandle({ idbFactory: memIdb, key: 'fh-123-abc' })
      ).toEqual(linkedHandle);
      expect(await loadFolderHandle({ idbFactory: memIdb })).toEqual(
        rootHandle
      );
    });

    it('loading an unknown key returns null', async () => {
      expect(
        await loadFolderHandle({ idbFactory: memIdb, key: 'fh-nope' })
      ).toBeNull();
    });

    it('clear({key}) removes only that key and leaves root intact', async () => {
      await saveFolderHandle(
        { name: 'root-folder', kind: 'directory' },
        { idbFactory: memIdb }
      );
      await saveFolderHandle(
        { name: 'linked', kind: 'directory' },
        { idbFactory: memIdb, key: 'fh-1' }
      );

      await clearFolderHandle({ idbFactory: memIdb, key: 'fh-1' });

      expect(
        await loadFolderHandle({ idbFactory: memIdb, key: 'fh-1' })
      ).toBeNull();
      expect((await loadFolderHandle({ idbFactory: memIdb })).name).toBe(
        'root-folder'
      );
    });
  });

  describe('listFolderHandles (H1 — multi-folder enumeration)', () => {
    it('returns an empty list when nothing is stored', async () => {
      expect(await listFolderHandles({ idbFactory: memIdb })).toEqual([]);
    });

    it('lists the root slot and every folder-link key with its handle', async () => {
      const root = { name: 'keyguard', kind: 'directory' };
      const linkedA = { name: 'switch-mount', kind: 'directory' };
      const linkedB = { name: 'braille-tags', kind: 'directory' };
      await saveFolderHandle(root, { idbFactory: memIdb });
      await saveFolderHandle(linkedA, { idbFactory: memIdb, key: 'fh-a' });
      await saveFolderHandle(linkedB, { idbFactory: memIdb, key: 'fh-b' });

      const listed = await listFolderHandles({ idbFactory: memIdb });

      expect(listed).toHaveLength(3);
      // Each key must carry ITS OWN handle — the pairing is the point.
      const byKey = Object.fromEntries(listed.map((e) => [e.key, e.handle]));
      expect(byKey[ROOT_KEY]).toEqual(root);
      expect(byKey['fh-a']).toEqual(linkedA);
      expect(byKey['fh-b']).toEqual(linkedB);
    });

    it('reads keys and values inside ONE transaction', async () => {
      await saveFolderHandle(
        { name: 'one', kind: 'directory' },
        { idbFactory: memIdb }
      );
      const state = memIdb._state.get(__test.DB_NAME);
      state.txCount = 0;

      await listFolderHandles({ idbFactory: memIdb });

      expect(state.txCount).toBe(1);
    });

    it('skips an unusable stored value and warns rather than listing it', async () => {
      await saveFolderHandle(
        { name: 'real', kind: 'directory' },
        { idbFactory: memIdb, key: 'fh-real' }
      );
      // A value the store never writes today, but a corrupt/legacy record
      // must not reach the UI as a nameless folder.
      memIdb._state
        .get(__test.DB_NAME)
        .records.set('fh-corrupt', 'not-a-handle');

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const listed = await listFolderHandles({ idbFactory: memIdb });
      expect(listed.map((e) => e.key)).toEqual(['fh-real']);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('unusable stored entry'),
        'fh-corrupt'
      );
      warnSpy.mockRestore();
    });

    it('returns an empty list and warns when the store cannot be opened', async () => {
      const brokenIdb = {
        open() {
          const req = {
            onsuccess: null,
            onerror: null,
            onupgradeneeded: null,
            error: new Error('quota'),
          };
          queueMicrotask(() => req.onerror?.());
          return req;
        },
      };
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(await listFolderHandles({ idbFactory: brokenIdb })).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('input validation', () => {
    it('rejects null/undefined handle on save', async () => {
      await expect(
        saveFolderHandle(null, { idbFactory: memIdb })
      ).rejects.toThrow(/requires a directory handle/);
      await expect(
        saveFolderHandle(undefined, { idbFactory: memIdb })
      ).rejects.toThrow(/requires a directory handle/);
    });

    it('rejects non-object handle on save', async () => {
      await expect(
        saveFolderHandle('not a handle', { idbFactory: memIdb })
      ).rejects.toThrow(/requires a directory handle/);
    });
  });

  describe('error handling', () => {
    it('returns null when IDB open errors', async () => {
      const brokenIdb = {
        open() {
          const req = {
            onsuccess: null,
            onerror: null,
            onupgradeneeded: null,
            error: new Error('quota'),
          };
          queueMicrotask(() => req.onerror?.());
          return req;
        },
      };
      const result = await loadFolderHandle({ idbFactory: brokenIdb });
      expect(result).toBeNull();
    });

    it('clear() swallows IDB errors silently', async () => {
      const brokenIdb = {
        open() {
          const req = {
            onsuccess: null,
            onerror: null,
            error: new Error('disk full'),
          };
          queueMicrotask(() => req.onerror?.());
          return req;
        },
      };
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await expect(
        clearFolderHandle({ idbFactory: brokenIdb })
      ).resolves.not.toThrow();
      warnSpy.mockRestore();
    });
  });

  describe('storage layout constants', () => {
    it('exposes the expected DB / store / key for diagnostics', () => {
      expect(__test.DB_NAME).toBe('openscad-forge-folder-sync');
      expect(__test.STORE_NAME).toBe('handles');
      expect(__test.ROOT_KEY).toBe('root');
      expect(__test.DB_VERSION).toBe(1);
    });

    it('exports ROOT_KEY for callers that must tell the root slot apart', () => {
      expect(ROOT_KEY).toBe(__test.ROOT_KEY);
    });
  });
});
