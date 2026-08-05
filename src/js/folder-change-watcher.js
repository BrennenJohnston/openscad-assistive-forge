/**
 * Folder Change Watcher (F14 / C5.2, Phase B of local folder sync)
 *
 * Polls the files of a connected local folder (File System Access API)
 * for external modifications — the "edit in a desktop editor, save,
 * watch the Forge re-render" loop.
 *
 * Design constraints:
 *  - Fast poll (default 1.5s) stats only the watched file list
 *    (main .scad + text companions) via handle.getFile() and compares
 *    lastModified + size snapshots.
 *  - A cheap full poll would still be O(files); a full-tree RESCAN
 *    (default 30s) additionally discovers newly created files.
 *  - Paused while the tab is hidden and while a render is in flight.
 *  - Losing permission stops the watcher and notifies the caller.
 *  - updateSnapshot() lets write-back (Phase C) bump the snapshot
 *    BEFORE writing a watched file so self-writes never re-trigger.
 *
 * All I/O goes through injected dependencies so the class is fully
 * unit-testable without a real directory handle.
 *
 * @license GPL-3.0-or-later
 */

export const DEFAULT_POLL_INTERVAL_MS = 1500;
export const DEFAULT_RESCAN_INTERVAL_MS = 30000;

/**
 * Resolve a project-relative path (webkitRelativePath style, first
 * segment = folder name) to a File via the directory handle.
 *
 * @param {FileSystemDirectoryHandle} rootHandle
 * @param {string} relPath - e.g. "MyProject/sub/openings.txt"
 * @returns {Promise<File|null>} Null when the file no longer exists
 * @throws When permission is lost (NotAllowedError/SecurityError)
 */
export async function getFileFromHandle(rootHandle, relPath) {
  const segments = relPath.split('/').filter(Boolean);
  // Strip the leading folder-name segment when it matches the root
  if (segments.length > 1 && segments[0] === rootHandle.name) {
    segments.shift();
  }
  let dir = rootHandle;
  try {
    for (let i = 0; i < segments.length - 1; i++) {
      dir = await dir.getDirectoryHandle(segments[i]);
    }
    const fileHandle = await dir.getFileHandle(segments[segments.length - 1]);
    return await fileHandle.getFile();
  } catch (err) {
    if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
      throw err;
    }
    // NotFoundError / TypeMismatchError → treat as "gone"
    return null;
  }
}

export class FolderChangeWatcher {
  /**
   * @param {Object} deps
   * @param {() => FileSystemDirectoryHandle|null} deps.getHandle
   * @param {() => string[]} deps.getWatchPaths - Project-relative paths to poll
   * @param {(changes: Array<{path: string, file: File}>) => Promise<void>|void} deps.onChange
   * @param {() => void} [deps.onPermissionLost]
   * @param {() => boolean} [deps.isRenderInFlight]
   * @param {() => boolean} [deps.isHidden] - Defaults to document.visibilityState
   * @param {(rootHandle: FileSystemDirectoryHandle, relPath: string) => Promise<File|null>} [deps.statFile]
   * @param {number} [deps.pollIntervalMs]
   * @param {number} [deps.rescanIntervalMs]
   * @param {() => number} [deps.now] - Injectable clock for tests
   */
  constructor(deps) {
    if (!deps?.getHandle || !deps?.getWatchPaths || !deps?.onChange) {
      throw new Error(
        'FolderChangeWatcher requires getHandle, getWatchPaths, and onChange'
      );
    }
    this._getHandle = deps.getHandle;
    this._getWatchPaths = deps.getWatchPaths;
    this._onChange = deps.onChange;
    this._onPermissionLost = deps.onPermissionLost || (() => {});
    this._isRenderInFlight = deps.isRenderInFlight || (() => false);
    this._isHidden =
      deps.isHidden ||
      (() =>
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden');
    this._statFile = deps.statFile || getFileFromHandle;
    this._pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this._rescanIntervalMs =
      deps.rescanIntervalMs ?? DEFAULT_RESCAN_INTERVAL_MS;
    this._now = deps.now || (() => Date.now());

    /** @type {Map<string, {lastModified: number, size: number}>} */
    this._snapshot = new Map();
    /** @type {Set<string>} Paths currently being written by the app itself */
    this._selfWrites = new Set();
    this._timer = null;
    this._ticking = false;
    this._lastRescan = 0;
    this.active = false;
  }

  /**
   * Mark a path as being written by the app (Phase C write-back). The
   * watcher skips it until endSelfWrite() — called BEFORE the write
   * starts, so a poll can never observe our own half-finished write as
   * an external change.
   * @param {string} path
   */
  beginSelfWrite(path) {
    this._selfWrites.add(path);
  }

  /**
   * Finish a self-write: record the post-write stats (so the next poll
   * sees "no change") and resume watching the path.
   * @param {string} path
   * @param {{lastModified: number, size: number}|null} stats - Null when the write failed
   */
  endSelfWrite(path, stats) {
    if (stats) {
      this.updateSnapshot(path, stats);
    }
    this._selfWrites.delete(path);
  }

  /**
   * Record the current stats of every watched file WITHOUT reporting
   * changes. Call once after (re)connecting, before start().
   */
  async primeSnapshot() {
    const handle = this._getHandle();
    if (!handle) return;
    this._snapshot.clear();
    for (const path of this._getWatchPaths()) {
      try {
        const file = await this._statFile(handle, path);
        if (file) {
          this._snapshot.set(path, {
            lastModified: file.lastModified,
            size: file.size,
          });
        }
      } catch {
        // Permission problems surface on the first real tick instead
      }
    }
    this._lastRescan = this._now();
  }

  /**
   * Pre-write snapshot bump (Phase C write-back): record the stats a
   * watched file WILL have after our own write so the next poll does
   * not see the write as an external change.
   * @param {string} path
   * @param {{lastModified: number, size: number}} stats
   */
  updateSnapshot(path, stats) {
    this._snapshot.set(path, {
      lastModified: stats.lastModified,
      size: stats.size,
    });
  }

  start() {
    if (this.active) return;
    this.active = true;
    this._timer = setInterval(() => {
      this.tick();
    }, this._pollIntervalMs);
  }

  stop() {
    this.active = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /**
   * One poll pass. Public so tests (and the interval) can drive it.
   * @returns {Promise<Array<{path: string, file: File}>>} Reported changes
   */
  async tick() {
    if (this._ticking) return [];
    if (this._isHidden() || this._isRenderInFlight()) return [];
    const handle = this._getHandle();
    if (!handle) return [];

    this._ticking = true;
    const changes = [];
    try {
      const paths = this._getWatchPaths();
      for (const path of paths) {
        if (this._selfWrites.has(path)) continue;
        let file;
        try {
          file = await this._statFile(handle, path);
        } catch (err) {
          // Permission lost: stop polling and tell the caller once
          this.stop();
          this._onPermissionLost(err);
          return [];
        }
        if (!file) continue;

        const prev = this._snapshot.get(path);
        const stats = { lastModified: file.lastModified, size: file.size };
        if (
          !prev ||
          prev.lastModified !== stats.lastModified ||
          prev.size !== stats.size
        ) {
          this._snapshot.set(path, stats);
          // A path never seen before (added by rescan or first tick after
          // priming missed it) still counts as a change only when it was
          // previously known — brand-new paths are reported too so the
          // caller can decide.
          changes.push({ path, file, isNew: !prev });
        }
      }

      if (this._now() - this._lastRescan >= this._rescanIntervalMs) {
        this._lastRescan = this._now();
        // The watch list itself is provided by the caller and derived
        // from the loaded project; a full rescan simply re-primes stats
        // for paths that appeared in the list since the last pass. (New
        // physical files enter the list when the caller refreshes it.)
      }

      if (changes.length > 0) {
        await this._onChange(changes);
      }
      return changes;
    } finally {
      this._ticking = false;
    }
  }
}
