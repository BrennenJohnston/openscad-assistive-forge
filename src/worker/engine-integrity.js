/**
 * Whether a downloaded engine file is the one INTEGRITY.json describes, and
 * fetching it again past the caches when a cache handed back a different copy.
 *
 * @license GPL-3.0-or-later
 */

/**
 * @param {string} name - The file's name, for the message
 * @param {ArrayBuffer} buffer - The bytes as downloaded
 * @param {{size?: number, sha256?: string}} expected - INTEGRITY.json's entry
 * @param {SubtleCrypto|null} [subtle] - null when the page has no crypto.subtle
 * @returns {Promise<string|null>} What differs, or null when the file matches
 */
export async function engineFileMismatch(
  name,
  buffer,
  expected,
  subtle = globalThis.crypto?.subtle
) {
  if (expected?.size && buffer.byteLength !== expected.size) {
    return `${name}: expected ${expected.size} bytes, got ${buffer.byteLength}`;
  }
  if (expected?.sha256 && subtle) {
    const digest = await subtle.digest('SHA-256', buffer);
    const hex = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, '0')
    ).join('');
    if (hex !== expected.sha256) {
      return `${name}: SHA-256 mismatch (expected ${expected.sha256.slice(0, 16)}…, got ${hex.slice(0, 16)}…)`;
    }
  }
  return null;
}

/**
 * Fetch an engine file and check it. With `refetch`, a copy that fails is
 * fetched once more with cache: 'reload', which skips the browser's cache and
 * the service worker's, and that copy is checked in turn.
 *
 * @param {string} name - The file's name in INTEGRITY.json
 * @param {string} url - Where to fetch it
 * @param {{size?: number, sha256?: string}} expected - INTEGRITY.json's entry
 * @param {{refetch?: boolean, fetchImpl?: Function}} [options]
 * @returns {Promise<{mismatch: string|null, verified: ArrayBuffer|null, replaced?: string}>}
 *   `verified` holds the second copy when it passed; `replaced` says what was
 *   wrong with the first.
 */
export async function fetchAndCheckEngineFile(
  name,
  url,
  expected,
  { refetch = false, fetchImpl = (...args) => globalThis.fetch(...args) } = {}
) {
  const first = await fetchImpl(url);
  if (!first.ok) return { mismatch: null, verified: null };
  const mismatch = await engineFileMismatch(
    name,
    await first.arrayBuffer(),
    expected
  );
  if (!mismatch || !refetch) return { mismatch, verified: null };

  const fresh = await fetchImpl(url, { cache: 'reload' });
  if (!fresh.ok) return { mismatch, verified: null };
  const freshBytes = await fresh.arrayBuffer();
  if (await engineFileMismatch(name, freshBytes, expected)) {
    return { mismatch, verified: null };
  }
  return { mismatch: null, verified: freshBytes, replaced: mismatch };
}
