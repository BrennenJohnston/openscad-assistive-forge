/**
 * Folder-handle persistence layer (F35 Phase A).
 *
 * Wraps IndexedDB so a single FileSystemDirectoryHandle can be saved,
 * restored across page reloads, and forgotten on demand. The
 * higher-level `folder-sync-controller` calls into this module; this
 * file knows nothing about UI, picker flow, or permission state — it
 * just round-trips the handle through IDB.
 *
 * Storage layout:
 *   db:    `openscad-forge-folder-sync`
 *   store: `handles`
 *     key "root"        — the most recent connection (status pill/Reconnect)
 *     key `fh-*`        — per-project handles for folder-link saved projects
 *                         (the record's `folderRef` field names its key)
 *
 * The handle is stored verbatim. Browsers that support the File
 * System Access API guarantee structured-cloning of the handle, so
 * IDB persists it natively without serialization tricks.
 *
 * @license GPL-3.0-or-later
 */

const DB_NAME = 'openscad-forge-folder-sync';
const DB_VERSION = 1;
const STORE_NAME = 'handles';
export const ROOT_KEY = 'root';

/**
 * @returns {boolean} True when both IDB and FSA are present in the
 *   current realm. Phase A is dark on browsers that lack either.
 */
export function isFolderHandleStorageSupported(globalRef = globalThis) {
  return !!(globalRef?.indexedDB && globalRef?.showDirectoryPicker);
}

/**
 * @param {IDBFactory} [idbFactory] Inject for tests; defaults to `indexedDB`.
 * @returns {Promise<IDBDatabase>}
 */
function openDb(idbFactory) {
  const factory = idbFactory ?? globalThis.indexedDB;
  if (!factory) {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    req.onblocked = () =>
      reject(new Error('IndexedDB open blocked by another connection'));
  });
}

/**
 * @template T
 * @param {IDBDatabase} db
 * @param {'readonly'|'readwrite'} mode
 * @param {(store: IDBObjectStore) => IDBRequest<T>} fn
 * @returns {Promise<T>}
 */
function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error || new Error('IndexedDB request failed'));
  });
}

/**
 * Like {@link tx}, but for a step that needs more than one request inside
 * the SAME transaction. Enumeration reads keys and values as two requests;
 * running them in separate transactions would let a concurrent write land
 * between them and pair key *i* with the handle *i* of a different read.
 *
 * @template T
 * @param {IDBDatabase} db
 * @param {'readonly'|'readwrite'} mode
 * @param {(store: IDBObjectStore) => IDBRequest<T>[]} fn
 * @returns {Promise<T[]>} Results in the same order as the requests.
 */
function txAll(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const requests = fn(store);
    const results = new Array(requests.length);
    let pending = requests.length;
    if (pending === 0) {
      resolve(results);
      return;
    }
    requests.forEach((req, index) => {
      req.onsuccess = () => {
        results[index] = req.result;
        pending -= 1;
        if (pending === 0) resolve(results);
      };
      req.onerror = () =>
        reject(req.error || new Error('IndexedDB request failed'));
    });
  });
}

/**
 * Read the persisted root directory handle, or `null` if none has
 * been stored. Callers must perform their own
 * queryPermission/requestPermission flow before using the handle.
 *
 * @param {Object} [deps]
 * @param {IDBFactory} [deps.idbFactory]
 * @param {string} [deps.key] Storage key; defaults to the root slot.
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
export async function loadFolderHandle(deps = {}) {
  const key = deps.key ?? ROOT_KEY;
  try {
    const db = await openDb(deps.idbFactory);
    try {
      const result = await tx(db, 'readonly', (store) => store.get(key));
      return result ?? null;
    } finally {
      db.close();
    }
  } catch (error) {
    console.warn('[FolderHandleStore] loadFolderHandle failed:', error);
    return null;
  }
}

/**
 * @typedef {Object} StoredFolderHandle
 * @property {string} key Storage key — {@link ROOT_KEY} or an `fh-*` folder-link ref.
 * @property {FileSystemDirectoryHandle} handle The stored handle.
 */

/**
 * Enumerate every stored directory handle, root slot included. Like
 * {@link loadFolderHandle} this does NOT touch permissions — `handle.name`
 * is readable without a re-grant, which is what lets the welcome screen
 * list folders the user has not re-authorised yet.
 *
 * @param {Object} [deps]
 * @param {IDBFactory} [deps.idbFactory]
 * @returns {Promise<StoredFolderHandle[]>} Empty when nothing is stored or
 *   the store cannot be read (the failure is logged, never silent).
 */
export async function listFolderHandles(deps = {}) {
  try {
    const db = await openDb(deps.idbFactory);
    try {
      const [keys, handles] = await txAll(db, 'readonly', (store) => [
        store.getAllKeys(),
        store.getAll(),
      ]);
      const entries = [];
      for (let i = 0; i < (keys?.length ?? 0); i += 1) {
        const key = keys[i];
        const handle = handles?.[i];
        if (typeof key !== 'string' || !handle || typeof handle !== 'object') {
          console.warn(
            '[FolderHandleStore] Skipping unusable stored entry:',
            key
          );
          continue;
        }
        entries.push({ key, handle });
      }
      return entries;
    } finally {
      db.close();
    }
  } catch (error) {
    console.warn('[FolderHandleStore] listFolderHandles failed:', error);
    return [];
  }
}

/**
 * Persist a directory handle as the project's root. Replaces any
 * previously-stored handle.
 *
 * @param {FileSystemDirectoryHandle} handle
 * @param {Object} [deps]
 * @param {IDBFactory} [deps.idbFactory]
 * @param {string} [deps.key] Storage key; defaults to the root slot.
 * @returns {Promise<void>}
 */
export async function saveFolderHandle(handle, deps = {}) {
  if (!handle || typeof handle !== 'object') {
    throw new Error('saveFolderHandle requires a directory handle');
  }
  const key = deps.key ?? ROOT_KEY;
  const db = await openDb(deps.idbFactory);
  try {
    await tx(db, 'readwrite', (store) => store.put(handle, key));
  } finally {
    db.close();
  }
}

/**
 * Drop the stored handle. Idempotent — safe to call when nothing is
 * stored.
 *
 * @param {Object} [deps]
 * @param {IDBFactory} [deps.idbFactory]
 * @param {string} [deps.key] Storage key; defaults to the root slot.
 * @returns {Promise<void>}
 */
export async function clearFolderHandle(deps = {}) {
  const key = deps.key ?? ROOT_KEY;
  try {
    const db = await openDb(deps.idbFactory);
    try {
      await tx(db, 'readwrite', (store) => store.delete(key));
    } finally {
      db.close();
    }
  } catch (error) {
    console.warn('[FolderHandleStore] clearFolderHandle failed:', error);
  }
}

// Test-only exports.
export const __test = {
  DB_NAME,
  DB_VERSION,
  STORE_NAME,
  ROOT_KEY,
};
