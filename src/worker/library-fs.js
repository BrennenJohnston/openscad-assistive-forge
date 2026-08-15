/**
 * Library filesystem writes — the Emscripten FS side of mounting a library
 * bundle, shared by the render worker and tests.
 *
 * Extracted from openscad-worker.js so the directory handling has somewhere
 * to be tested: a bundle's files arrive one at a time, and every file after
 * the first in a given folder meets a directory that already exists.
 *
 * @license GPL-3.0-or-later
 */

/**
 * Create every missing segment of a directory path.
 *
 * Existence is checked before each mkdir rather than inferred from a failed
 * one, because Emscripten's FS.ErrnoError does not carry the `code` property
 * a Node-style EEXIST check would look for.
 *
 * @param {Object} FS - Emscripten filesystem module
 * @param {string} dirPath - Absolute directory path
 */
export function ensureLibraryDir(FS, dirPath) {
  const parts = dirPath.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += `/${part}`;

    const analyzed = FS.analyzePath(current);
    if (analyzed.exists && analyzed.object?.isFolder) {
      continue;
    }
    if (analyzed.exists && !analyzed.object?.isFolder) {
      throw new Error(`Path exists as file, not directory: ${current}`);
    }

    try {
      FS.mkdir(current);
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }
}

/**
 * Write one library file into the virtual filesystem, creating the folders
 * it sits in.
 *
 * @param {Object} FS - Emscripten filesystem module
 * @param {string} libRoot - Absolute mount root, e.g. /libraries/BOSL2
 * @param {string} relativePath - Path within the bundle, e.g. utils/core/core.scad
 * @param {string|Uint8Array} content - File content
 * @returns {string} The absolute path written
 */
export function writeLibraryFile(FS, libRoot, relativePath, content) {
  const filePath = `${libRoot}/${relativePath}`;

  const parts = relativePath.split('/');
  let currentPath = libRoot;
  for (let i = 0; i < parts.length - 1; i++) {
    currentPath += '/' + parts[i];
    try {
      FS.mkdir(currentPath);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }

  FS.writeFile(filePath, content);
  return filePath;
}
