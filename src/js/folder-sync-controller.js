/**
 * Folder-sync controller (F35 Phase A).
 *
 * Owns the "is the user connected to a folder on disk?" state and the
 * UX flow that gets / restores / drops that connection. Phase A only
 * handles connect / restore / disconnect plus the initial file load
 * — Phase B adds the polling watcher and Phase C adds write-back.
 *
 * Architecture intent:
 *   - This module is feature-flag gated (`local_folder_sync`) and
 *     additionally guarded by `isFolderHandleStorageSupported()` so it
 *     does literally nothing on Firefox / Safari.
 *   - It re-uses the existing `collectFilesFromDir` walker and
 *     `handleFolderImport` snapshot loader from `file-handler.js`.
 *     Phase A intentionally does NOT change how files are loaded —
 *     only the persistence of the root directory handle.
 *   - Permission-grant calls (`requestPermission`) MUST happen inside
 *     a user-gesture event handler. The connect / restore methods are
 *     therefore designed to be called directly from `click` listeners.
 *
 * @license GPL-3.0-or-later
 */

import {
  isFolderHandleStorageSupported,
  loadFolderHandle,
  saveFolderHandle,
  clearFolderHandle,
} from './folder-handle-store.js';

/**
 * @typedef {'idle'|'connected'|'pending-restore'|'denied'} SyncState
 */

/**
 * @typedef {Object} ConnectResult
 * @property {boolean} ok
 * @property {SyncState} state
 * @property {FileSystemDirectoryHandle|null} handle
 * @property {string|null} folderName
 * @property {string} [reason]
 */

/**
 * @typedef {Object} ControllerDeps
 * @property {Function} [showDirectoryPicker]   Inject for tests; defaults to `window.showDirectoryPicker`.
 * @property {Function} [getStoredHandle]       Inject for tests; defaults to {@link loadFolderHandle}.
 * @property {Function} [persistHandle]         Inject for tests; defaults to {@link saveFolderHandle}.
 * @property {Function} [forgetHandle]          Inject for tests; defaults to {@link clearFolderHandle}.
 */

export class FolderSyncController {
  /**
   * @param {ControllerDeps} [deps]
   */
  constructor(deps = {}) {
    this._showDirectoryPicker =
      deps.showDirectoryPicker ??
      ((opts) =>
        globalThis.showDirectoryPicker &&
        globalThis.showDirectoryPicker(opts));
    this._getStoredHandle = deps.getStoredHandle ?? loadFolderHandle;
    this._persistHandle = deps.persistHandle ?? saveFolderHandle;
    this._forgetHandle = deps.forgetHandle ?? clearFolderHandle;

    /** @type {FileSystemDirectoryHandle|null} */
    this._handle = null;
    /** @type {SyncState} */
    this._state = 'idle';
    /** @type {Set<(state: SyncState, handle: FileSystemDirectoryHandle|null) => void>} */
    this._listeners = new Set();
  }

  /**
   * @returns {boolean} True iff the runtime supports the API surface
   *   Phase A relies on. Callers should hide UI when false.
   */
  isSupported() {
    return isFolderHandleStorageSupported();
  }

  /** @returns {SyncState} */
  getState() {
    return this._state;
  }

  /** @returns {FileSystemDirectoryHandle|null} */
  getHandle() {
    return this._handle;
  }

  /** @returns {string|null} */
  getFolderName() {
    return this._handle ? this._handle.name : null;
  }

  /**
   * Subscribe to state changes. Returns an unsubscribe function.
   *
   * @param {(state: SyncState, handle: FileSystemDirectoryHandle|null) => void} fn
   * @returns {() => void}
   */
  subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    this._listeners.add(fn);
    // Fire once immediately so subscribers can sync to the current state.
    try {
      fn(this._state, this._handle);
    } catch (err) {
      console.error('[FolderSync] subscriber threw on initial fire:', err);
    }
    return () => this._listeners.delete(fn);
  }

  /**
   * Probe IndexedDB for a previously-stored handle. Does NOT request
   * permission — that requires a user gesture, see
   * {@link restoreFromStored}.
   *
   * After this resolves the controller is in either:
   *   - `idle` (no handle in IDB), or
   *   - `pending-restore` (handle in IDB, awaiting permission re-grant)
   */
  async hydrateFromStorage() {
    if (!this.isSupported()) return;
    try {
      const stored = await this._getStoredHandle();
      if (!stored) return;
      this._handle = stored;
      this._setState('pending-restore');
    } catch (err) {
      console.warn('[FolderSync] hydrateFromStorage failed:', err);
    }
  }

  /**
   * Open the directory picker and persist the resulting handle. MUST
   * be called from inside a user gesture (e.g. button click), per the
   * File System Access API contract.
   *
   * @returns {Promise<ConnectResult>}
   */
  async connect() {
    if (!this.isSupported()) {
      return {
        ok: false,
        state: this._state,
        handle: null,
        folderName: null,
        reason: 'unsupported',
      };
    }
    try {
      const picked = await this._showDirectoryPicker({ mode: 'readwrite' });
      if (!picked) {
        return {
          ok: false,
          state: this._state,
          handle: null,
          folderName: null,
          reason: 'no-handle-returned',
        };
      }
      // The picker grants permission as part of the dialog, so the
      // returned handle should already be `granted` for readwrite.
      // We still verify so we never claim "connected" without it.
      const perm = await this._queryReadwrite(picked);
      if (perm !== 'granted') {
        const requested = await this._requestReadwrite(picked);
        if (requested !== 'granted') {
          this._handle = picked;
          this._setState('denied');
          return {
            ok: false,
            state: 'denied',
            handle: picked,
            folderName: picked.name,
            reason: 'permission-denied',
          };
        }
      }
      await this._persistHandle(picked);
      this._handle = picked;
      this._setState('connected');
      return {
        ok: true,
        state: 'connected',
        handle: picked,
        folderName: picked.name,
      };
    } catch (err) {
      if (err?.name === 'AbortError') {
        return {
          ok: false,
          state: this._state,
          handle: null,
          folderName: null,
          reason: 'cancelled',
        };
      }
      console.warn('[FolderSync] connect failed:', err);
      return {
        ok: false,
        state: this._state,
        handle: null,
        folderName: null,
        reason: err?.message ?? String(err),
      };
    }
  }

  /**
   * Re-grant permission for the previously-stored handle. Like
   * {@link connect} this must be called from inside a user gesture.
   *
   * @returns {Promise<ConnectResult>}
   */
  async restoreFromStored() {
    if (!this.isSupported()) {
      return {
        ok: false,
        state: this._state,
        handle: null,
        folderName: null,
        reason: 'unsupported',
      };
    }
    let handle = this._handle;
    if (!handle) {
      try {
        handle = await this._getStoredHandle();
      } catch (err) {
        console.warn('[FolderSync] restore: read failed', err);
        handle = null;
      }
    }
    if (!handle) {
      return {
        ok: false,
        state: 'idle',
        handle: null,
        folderName: null,
        reason: 'no-stored-handle',
      };
    }
    try {
      const queried = await this._queryReadwrite(handle);
      if (queried !== 'granted') {
        const requested = await this._requestReadwrite(handle);
        if (requested !== 'granted') {
          this._handle = handle;
          this._setState('denied');
          return {
            ok: false,
            state: 'denied',
            handle,
            folderName: handle.name,
            reason: 'permission-denied',
          };
        }
      }
      this._handle = handle;
      this._setState('connected');
      return {
        ok: true,
        state: 'connected',
        handle,
        folderName: handle.name,
      };
    } catch (err) {
      console.warn('[FolderSync] restore failed:', err);
      return {
        ok: false,
        state: this._state,
        handle,
        folderName: handle?.name ?? null,
        reason: err?.message ?? String(err),
      };
    }
  }

  /**
   * Forget the connection: drop the in-memory handle, clear IDB, and
   * fire a state change. Does not (and cannot) revoke the granted
   * permission — only the user can do that via browser UI.
   */
  async disconnect() {
    try {
      await this._forgetHandle();
    } catch (err) {
      console.warn('[FolderSync] disconnect: clear failed', err);
    }
    this._handle = null;
    this._setState('idle');
  }

  /**
   * @param {FileSystemDirectoryHandle} handle
   * @returns {Promise<PermissionState>}
   */
  async _queryReadwrite(handle) {
    if (typeof handle?.queryPermission !== 'function') return 'prompt';
    try {
      return await handle.queryPermission({ mode: 'readwrite' });
    } catch {
      return 'prompt';
    }
  }

  /**
   * @param {FileSystemDirectoryHandle} handle
   * @returns {Promise<PermissionState>}
   */
  async _requestReadwrite(handle) {
    if (typeof handle?.requestPermission !== 'function') return 'denied';
    try {
      return await handle.requestPermission({ mode: 'readwrite' });
    } catch (err) {
      console.warn('[FolderSync] requestPermission threw:', err);
      return 'denied';
    }
  }

  /** @param {SyncState} state */
  _setState(state) {
    if (state === this._state) return;
    this._state = state;
    for (const fn of this._listeners) {
      try {
        fn(this._state, this._handle);
      } catch (err) {
        console.error('[FolderSync] subscriber threw:', err);
      }
    }
  }
}

let _instance = null;

/**
 * Singleton accessor. Tests can rely on {@link resetFolderSyncController}
 * to clear instance state between cases.
 * @param {ControllerDeps} [deps]
 * @returns {FolderSyncController}
 */
export function getFolderSyncController(deps) {
  if (!_instance) _instance = new FolderSyncController(deps);
  return _instance;
}

export function resetFolderSyncController() {
  _instance = null;
}
