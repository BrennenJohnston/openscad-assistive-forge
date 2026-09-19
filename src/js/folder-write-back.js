/**
 * Folder Write-Back (F35 Phase C / C5.3, flag: folder_sync_writeback)
 *
 * Writes files into the connected local folder via the File System
 * Access API. The connected folder is the source of truth; IndexedDB
 * remains a cache.
 *
 * Self-trigger prevention contract (unit-tested): the watcher is told
 * about our own write BEFORE any bytes hit disk (beginSelfWrite), and
 * gets the post-write stats afterwards (endSelfWrite) — so the change
 * watcher can never observe a Forge write as an external change and
 * loop the render.
 *
 * @license GPL-3.0-or-later
 */

/**
 * Resolve (and optionally create) the parent directory chain for a
 * project-relative path and return the file handle.
 *
 * @param {FileSystemDirectoryHandle} rootHandle
 * @param {string} relPath - webkitRelativePath style; a leading segment
 *   equal to the root folder's name is stripped
 * @param {{create?: boolean}} [options]
 * @returns {Promise<FileSystemFileHandle>}
 */
async function resolveFileHandle(rootHandle, relPath, { create = true } = {}) {
  const segments = relPath.split('/').filter(Boolean);
  if (segments.length > 1 && segments[0] === rootHandle.name) {
    segments.shift();
  }
  if (segments.length === 0) {
    throw new Error(`Invalid path for write-back: "${relPath}"`);
  }
  let dir = rootHandle;
  for (let i = 0; i < segments.length - 1; i++) {
    dir = await dir.getDirectoryHandle(segments[i], { create });
  }
  return dir.getFileHandle(segments[segments.length - 1], { create });
}

export class FolderWriteBack {
  /**
   * @param {Object} deps
   * @param {() => FileSystemDirectoryHandle|null} deps.getHandle
   * @param {() => import('./folder-change-watcher.js').FolderChangeWatcher|null} [deps.getWatcher]
   * @param {typeof resolveFileHandle} [deps.resolveFileHandle] - Injectable for tests
   */
  constructor(deps) {
    if (!deps?.getHandle) {
      throw new Error('FolderWriteBack requires getHandle');
    }
    this._getHandle = deps.getHandle;
    this._getWatcher = deps.getWatcher || (() => null);
    this._resolveFileHandle = deps.resolveFileHandle || resolveFileHandle;
  }

  /** @returns {boolean} */
  isAvailable() {
    return Boolean(this._getHandle());
  }

  /**
   * Write content to a file in the connected folder, creating parent
   * directories as needed.
   *
   * @param {string} relPath - Project-relative path (webkitRelativePath style)
   * @param {string|Blob|ArrayBuffer|Uint8Array} content
   * @returns {Promise<{ok: true, path: string, size: number}>}
   * @throws When no folder is connected or the write fails
   */
  async writeFile(relPath, content) {
    const rootHandle = this._getHandle();
    if (!rootHandle) {
      throw new Error('No local folder connected');
    }

    const watcher = this._getWatcher();
    watcher?.beginSelfWrite(relPath);
    try {
      const fileHandle = await this._resolveFileHandle(rootHandle, relPath, {
        create: true,
      });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();

      const written = await fileHandle.getFile();
      watcher?.endSelfWrite(relPath, {
        lastModified: written.lastModified,
        size: written.size,
      });
      return { ok: true, path: relPath, size: written.size };
    } catch (err) {
      watcher?.endSelfWrite(relPath, null);
      throw err;
    }
  }
}
