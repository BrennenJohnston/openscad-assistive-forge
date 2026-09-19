/**
 * WASM mount filtering — decouples the storage cap from the render cap.
 *
 * Projects may now store hundreds of MB of companions (IndexedDB writes
 * blobs to disk), but everything passed to a render is structured-cloned
 * into the worker and written into the Emscripten MEMFS heap alongside
 * geometry. Mounting a 500 MB folder per render would exhaust the WASM
 * heap, so: the main .scad and all TEXT companions always mount, while
 * BINARY companions (images as data URLs, byte arrays) mount only when
 * the render can actually use them — i.e. they are referenced from the
 * include/use/import graph — unless the whole binary set is small enough
 * not to matter.
 *
 * @license GPL-3.0-or-later
 */

import { scanAllDependencies } from './dependency-checker.js';
import { WASM_MOUNT_BUDGET } from './validation-constants.js';

/** Below this total, all binaries mount unconditionally (cheap fast path). */
const SMALL_BINARY_FAST_PATH = 32 * 1024 * 1024; // 32 MB

/**
 * Whether a stored companion is binary content (not renderable as SCAD text).
 * @param {*} content
 * @returns {boolean}
 */
export function isBinaryCompanion(content) {
  return (
    content instanceof Uint8Array ||
    content instanceof ArrayBuffer ||
    (typeof content === 'string' && content.startsWith('data:'))
  );
}

function contentSize(content) {
  if (content instanceof Uint8Array || content instanceof ArrayBuffer) {
    return content.byteLength;
  }
  return typeof content === 'string' ? content.length : 0;
}

function basenameLower(path) {
  return String(path).split('/').pop().toLowerCase();
}

/**
 * Filter a project's files down to what the render should mount.
 *
 * @param {Map<string, *>} files - path → content
 * @param {string|null|undefined} mainFile - Entry-point path within files
 * @returns {{ files: Map<string, *>, dropped: string[], mountBytes: number }}
 *   Returns the input Map untouched (dropped: []) when no filtering is
 *   needed; never mutates the input.
 */
export function filterFilesForMount(files, mainFile) {
  if (!files || typeof files.entries !== 'function' || files.size === 0) {
    return { files, dropped: [], mountBytes: 0 };
  }

  let binaryBytes = 0;
  let hasBinaries = false;
  let totalBytes = 0;
  for (const content of files.values()) {
    const size = contentSize(content);
    totalBytes += size;
    if (isBinaryCompanion(content)) {
      hasBinaries = true;
      binaryBytes += size;
    }
  }

  if (!hasBinaries || binaryBytes < SMALL_BINARY_FAST_PATH || !mainFile) {
    return { files, dropped: [], mountBytes: totalBytes };
  }

  const deps = scanAllDependencies(files, mainFile);
  const referenced = new Set(
    [...deps.includes, ...deps.uses, ...deps.imports].map((p) =>
      String(p).toLowerCase()
    )
  );
  const referencedBasenames = new Set(
    [...referenced].map((p) => basenameLower(p))
  );

  const filtered = new Map();
  const dropped = [];
  let mountBytes = 0;

  for (const [path, content] of files.entries()) {
    if (!isBinaryCompanion(content)) {
      filtered.set(path, content);
      mountBytes += contentSize(content);
      continue;
    }
    const lower = String(path).toLowerCase();
    const isReferenced =
      referenced.has(lower) || referencedBasenames.has(basenameLower(lower));
    if (isReferenced) {
      filtered.set(path, content);
      mountBytes += contentSize(content);
    } else {
      dropped.push(path);
    }
  }

  if (mountBytes > WASM_MOUNT_BUDGET) {
    // The user's model genuinely references this much data — warn about
    // memory pressure but proceed rather than breaking the render.
    console.warn(
      `[MountFilter] Referenced files total ${(mountBytes / 1024 / 1024).toFixed(1)} MB, ` +
        `above the ${WASM_MOUNT_BUDGET / 1024 / 1024} MB mount budget — ` +
        'renders may be slow or run out of memory.'
    );
  }

  return { files: filtered, dropped, mountBytes };
}
