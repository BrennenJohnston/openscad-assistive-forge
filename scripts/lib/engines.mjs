/**
 * The official OpenSCAD engines the app can switch to, fetched at build time.
 *
 * OpenSCAD publishes its WebAssembly engine only as daily snapshots on
 * files.openscad.org, and serves them without cross-origin headers, so a page
 * cannot fetch them from there. The build copies the chosen snapshots onto
 * this site instead, the way the fonts arrive: public/wasm/engines.json names
 * each zip with its SHA-256 and size and the two files inside it with theirs,
 * and nothing that differs by a byte is written.
 * @license GPL-3.0-or-later
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { downloadFile } from './download-file.mjs';

const ENGINE_FILES = ['openscad.js', 'openscad.wasm'];
const OFFICIAL_SOURCE = 'https://files.openscad.org/snapshots/';
const HEX64 = /^[0-9a-f]{64}$/;

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/**
 * The engines that are downloaded rather than built in.
 * @param {{engines: Object[]}} manifest
 * @returns {Object[]}
 */
export function officialEngines(manifest) {
  return manifest.engines.filter((engine) => !engine.builtIn);
}

/**
 * What is wrong with a manifest, one sentence a problem; empty when nothing is.
 * @param {Object} manifest - the parsed public/wasm/engines.json
 * @returns {string[]}
 */
export function checkManifest(manifest) {
  const problems = [];
  if (manifest?.version !== 1) problems.push('the manifest version is not 1');
  const engines = Array.isArray(manifest?.engines) ? manifest.engines : [];
  if (engines.length === 0) problems.push('the manifest names no engine');

  const seen = new Set();
  for (const engine of engines) {
    if (seen.has(engine.id)) problems.push(`${engine.id} is named twice`);
    seen.add(engine.id);
  }

  const builtIn = engines.filter((engine) => engine.builtIn);
  if (builtIn.length !== 1 || engines[0] !== builtIn[0]) {
    problems.push('the one built-in engine must come first');
  }

  for (const engine of officialEngines({ engines })) {
    const id = engine.id;
    if (!/^official-\d{4}-\d{2}-\d{2}$/.test(id ?? '')) {
      problems.push(`${id}: the id is not official-YYYY-MM-DD`);
    }
    if (typeof engine.name !== 'string' || !engine.name) {
      problems.push(`${id}: no name`);
    }
    if (engine.path !== `/wasm/engines/${id}`) {
      problems.push(`${id}: the path is not /wasm/engines/${id}`);
    }
    const zip = engine.zip ?? {};
    if (typeof zip.url !== 'string' || !zip.url.startsWith(OFFICIAL_SOURCE)) {
      problems.push(`${id}: the zip does not come from ${OFFICIAL_SOURCE}`);
    }
    if (!HEX64.test(zip.sha256 ?? '') || !(zip.size > 0)) {
      problems.push(`${id}: the zip has no SHA-256 and size`);
    }
    for (const name of ENGINE_FILES) {
      const file = engine.files?.[name] ?? {};
      if (!HEX64.test(file.sha256 ?? '') || !(file.size > 0)) {
        problems.push(`${id}: ${name} has no SHA-256 and size`);
      }
    }
  }
  return problems;
}

/**
 * Whether data is the file the manifest describes.
 * @param {Buffer} data
 * @param {{sha256: string, size: number}} expected
 * @returns {string|null} what differs, or null when nothing does
 */
export function checkFile(data, expected) {
  if (data.length !== expected.size) {
    return `size ${data.length}, expected ${expected.size}`;
  }
  const hash = sha256(data);
  if (hash !== expected.sha256) {
    return `SHA-256 ${hash.slice(0, 16)}..., expected ${expected.sha256.slice(0, 16)}...`;
  }
  return null;
}

/**
 * One member of a zip archive, found by its file name in any folder of the
 * archive. Only what these archives use is read: the end record, the central
 * directory, stored (0) and deflated (8) members; no ZIP64.
 * @param {Buffer} zip
 * @param {string} name - the member's file name, without folders
 * @returns {Buffer}
 */
export function extractMember(zip, name) {
  const endAt = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endAt < 0 || zip.length - endAt < 22) {
    throw new Error('not a zip archive: no end of central directory');
  }
  const count = zip.readUInt16LE(endAt + 10);
  let at = zip.readUInt32LE(endAt + 16);
  const found = [];
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) {
      throw new Error(`a damaged central directory at byte ${at}`);
    }
    const method = zip.readUInt16LE(at + 10);
    const compressedSize = zip.readUInt32LE(at + 20);
    const size = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const localAt = zip.readUInt32LE(at + 42);
    const memberName = zip.toString('utf8', at + 46, at + 46 + nameLength);
    if (memberName.split('/').pop() === name) {
      found.push({ method, compressedSize, size, localAt });
    }
    at += 46 + nameLength + extraLength + commentLength;
  }
  if (found.length !== 1) {
    throw new Error(
      found.length ? `${name} is in the archive twice` : `${name} is not in the archive`
    );
  }
  const { method, compressedSize, size, localAt } = found[0];
  if (zip.readUInt32LE(localAt) !== 0x04034b50) {
    throw new Error(`a damaged local header for ${name}`);
  }
  const dataAt =
    localAt + 30 + zip.readUInt16LE(localAt + 26) + zip.readUInt16LE(localAt + 28);
  const body = zip.subarray(dataAt, dataAt + compressedSize);
  let data;
  if (method === 0) data = Buffer.from(body);
  else if (method === 8) data = inflateRawSync(body);
  else throw new Error(`${name} is packed with method ${method}, which this reader does not read`);
  if (data.length !== size) {
    throw new Error(`${name} unpacked to ${data.length} bytes, the archive says ${size}`);
  }
  return data;
}

/**
 * Whether an engine's folder already holds both files as the manifest
 * describes them.
 */
async function engineInPlace(dir, engine) {
  for (const name of ENGINE_FILES) {
    const path = join(dir, name);
    if (!existsSync(path)) return false;
    if (checkFile(await readFile(path), engine.files[name])) return false;
  }
  return existsSync(join(dir, 'INTEGRITY.json'));
}

/**
 * Download each official engine's zip into the cache (once), check it, and
 * write its two files and an INTEGRITY.json into public/wasm/engines/<id>/.
 *
 * @param {Object} options
 * @param {string} options.root - the repository's root folder
 * @param {(url: string, dest: string) => Promise<void>} [options.download]
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<{fetched: string[], written: string[], found: string[], problems: string[]}>}
 *   fetched: zips downloaded; written: engines unpacked into place; found:
 *   engines already in place; problems: one sentence each
 */
export async function setupEngines({ root, download = downloadFile, log = console.log }) {
  const manifest = JSON.parse(
    await readFile(join(root, 'public', 'wasm', 'engines.json'), 'utf8')
  );
  const result = { fetched: [], written: [], found: [], problems: checkManifest(manifest) };
  if (result.problems.length) return result;

  const cacheDir = join(root, 'build', 'engines-cache');
  await mkdir(cacheDir, { recursive: true });

  for (const engine of officialEngines(manifest)) {
    const dir = join(root, 'public', 'wasm', 'engines', engine.id);
    try {
      if (await engineInPlace(dir, engine)) {
        result.found.push(engine.id);
        log(`✓ ${engine.name}: already in place`);
        continue;
      }
      const zipPath = join(cacheDir, basename(new URL(engine.zip.url).pathname));
      let zip = existsSync(zipPath) ? await readFile(zipPath) : null;
      if (!zip || checkFile(zip, engine.zip)) {
        log(`  ${engine.name}: downloading ${engine.zip.url}`);
        const partial = `${zipPath}.part`;
        await download(engine.zip.url, partial);
        zip = await readFile(partial);
        const wrong = checkFile(zip, engine.zip);
        if (wrong) {
          await rm(partial, { force: true });
          throw new Error(`the zip's ${wrong}`);
        }
        await rename(partial, zipPath);
        result.fetched.push(engine.id);
      }
      await mkdir(dir, { recursive: true });
      for (const name of ENGINE_FILES) {
        const data = extractMember(zip, name);
        const wrong = checkFile(data, engine.files[name]);
        if (wrong) throw new Error(`${name}'s ${wrong}`);
        await writeFile(join(dir, name), data);
      }
      const integrity = {
        version: '1.0',
        build: engine.name,
        source: engine.zip.url,
        files: Object.fromEntries(
          ENGINE_FILES.map((name) => [name, { ...engine.files[name] }])
        ),
      };
      await writeFile(join(dir, 'INTEGRITY.json'), `${JSON.stringify(integrity, null, 2)}\n`);
      result.written.push(engine.id);
      log(`✓ ${engine.name}: written to public/wasm/engines/${engine.id}/`);
    } catch (error) {
      result.problems.push(`${engine.id}: ${error.message}`);
    }
  }
  return result;
}
