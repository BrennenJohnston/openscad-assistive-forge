/**
 * AF-12: unpack a library archive into { path, text } entries.
 *
 * Turning a library on used to fetch every file it has - 695 sequential
 * requests for dotSCAD on a slow connection. Each library now ships a
 * single archive.zip built by scripts/setup-libraries.js; this module is
 * the worker-side half. Kept pure (bytes in, entries out) so the unit
 * suite can prove it without a worker or a network.
 *
 * @license GPL-3.0-or-later
 */
import JSZip from 'jszip';

/**
 * @param {ArrayBuffer} buffer - the archive's bytes
 * @returns {Promise<Array<{path: string, text: string}>>} file entries;
 *   directory entries are skipped. Rejects on a corrupt or non-zip buffer -
 *   the caller treats that as "fall back to per-file fetching".
 */
export async function unpackLibraryArchive(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const entries = [];
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (entry.dir) continue;
    entries.push({ path: name, text: await entry.async('string') });
  }
  return entries;
}
