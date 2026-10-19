// @vitest-environment node
/**
 * The official OpenSCAD engines arrive at build time: the manifest names
 * each one with its checksums, the build downloads its zip, takes the two
 * engine files out with a small zip reader, and refuses anything whose
 * SHA-256 or size differs from the manifest.
 * @license GPL-3.0-or-later
 */

import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { describe, it, expect } from 'vitest';
import {
  checkManifest,
  checkFile,
  extractMember,
  officialEngines,
  setupEngines,
} from '../../scripts/lib/engines.mjs';

const MANIFEST_PATH = path.resolve(__dirname, '../../public/wasm/engines.json');
const manifest = () => JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/**
 * A zip built by hand: each member with its local header and data, then the
 * central directory and its end record. Method 8 is raw deflate, 0 stored.
 */
function buildZip(members) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data, method } of members) {
    const body = method === 8 ? deflateRawSync(data) : data;
    const nameBytes = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(members.length, 8);
  end.writeUInt16LE(members.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

describe('the engines manifest', () => {
  it('passes its own check', () => {
    expect(checkManifest(manifest())).toEqual([]);
  });

  it('names the Forge engine first, then four official snapshots, newest first', () => {
    const { engines } = manifest();
    expect(engines).toHaveLength(5);
    expect(engines[0]).toMatchObject({
      id: 'forge',
      builtIn: true,
      path: '/wasm/openscad-official',
    });
    const official = officialEngines(manifest());
    expect(official.map((e) => e.id)).toEqual([
      'official-2026-10-18',
      'official-2026-04-03',
      'official-2026-01-03',
      'official-2025-03-25',
    ]);
    for (const e of official) {
      expect(e.zip.url).toMatch(/^https:\/\/files\.openscad\.org\/snapshots\//);
      expect(e.zip.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(e.zip.size).toBeGreaterThan(0);
      expect(e.path).toBe(`/wasm/engines/${e.id}`);
      for (const name of ['openscad.js', 'openscad.wasm']) {
        expect(e.files[name].sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(e.files[name].size).toBeGreaterThan(0);
      }
    }
  });

  it('refuses a manifest that names one engine twice', () => {
    const m = manifest();
    m.engines[2].id = m.engines[1].id;
    expect(checkManifest(m).join(' ')).toMatch(/twice/);
  });

  it('refuses an engine from anywhere but the official snapshots, or without a checksum', () => {
    const m = manifest();
    m.engines[1].zip.url = 'http://example.com/engine.zip';
    m.engines[2].files['openscad.wasm'].sha256 = 'not-a-hash';
    const problems = checkManifest(m).join(' ');
    expect(problems).toMatch(/official-2026-10-18.*files\.openscad\.org/);
    expect(problems).toMatch(/official-2026-04-03.*openscad\.wasm/);
  });
});

describe('the zip reader', () => {
  const js = Buffer.from('export default function OpenSCAD() {}\n'.repeat(40));
  const wasm = Buffer.from([0x00, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 9, 8, 7]);
  const zip = buildZip([
    { name: 'openscad.js', data: js, method: 8 },
    { name: 'openscad.wasm', data: wasm, method: 0 },
  ]);

  it('takes a deflated and a stored member out unchanged', () => {
    expect(extractMember(zip, 'openscad.js').equals(js)).toBe(true);
    expect(extractMember(zip, 'openscad.wasm').equals(wasm)).toBe(true);
  });

  it('finds a member inside a folder of the archive by its file name', () => {
    const nested = buildZip([{ name: 'OpenSCAD/openscad.js', data: js, method: 8 }]);
    expect(extractMember(nested, 'openscad.js').equals(js)).toBe(true);
  });

  it('says so when a member is missing', () => {
    expect(() => extractMember(zip, 'openscad.data')).toThrow(/openscad\.data/);
  });

  it('refuses a file whose SHA-256 or size differs from the manifest', () => {
    expect(checkFile(js, { sha256: sha256(js), size: js.length })).toBeNull();
    expect(checkFile(js, { sha256: '0'.repeat(64), size: js.length })).toMatch(
      /SHA-256/
    );
    expect(checkFile(js, { sha256: sha256(js), size: js.length + 1 })).toMatch(
      /size/
    );
  });
});

describe('the build step', () => {
  const js = Buffer.from('export default function OpenSCAD() {}\n');
  const wasm = Buffer.from([0x00, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);
  const zip = buildZip([
    { name: 'openscad.js', data: js, method: 8 },
    { name: 'openscad.wasm', data: wasm, method: 0 },
  ]);
  const id = 'official-2026-10-18';

  /** A scratch repository holding a one-engine manifest for that zip. */
  function scratchRoot() {
    const root = mkdtempSync(path.join(tmpdir(), 'engines-'));
    mkdirSync(path.join(root, 'public', 'wasm'), { recursive: true });
    const m = {
      version: 1,
      engines: [
        { id: 'forge', name: 'Forge', builtIn: true, path: '/wasm/openscad-official' },
        {
          id,
          name: 'OpenSCAD snapshot 2026.10.18',
          path: `/wasm/engines/${id}`,
          zip: {
            url: 'https://files.openscad.org/snapshots/OpenSCAD-2026.10.18-WebAssembly-web.zip',
            sha256: sha256(zip),
            size: zip.length,
          },
          files: {
            'openscad.js': { sha256: sha256(js), size: js.length },
            'openscad.wasm': { sha256: sha256(wasm), size: wasm.length },
          },
        },
      ],
    };
    writeFileSync(path.join(root, 'public', 'wasm', 'engines.json'), JSON.stringify(m));
    return root;
  }

  it('downloads once, writes the engine, and a second run downloads nothing', async () => {
    const root = scratchRoot();
    try {
      const fetched = [];
      const download = async (url, dest) => {
        fetched.push(url);
        writeFileSync(dest, zip);
      };
      const first = await setupEngines({ root, download, log: () => {} });
      expect(first).toMatchObject({ fetched: [id], written: [id], found: [], problems: [] });
      const dir = path.join(root, 'public', 'wasm', 'engines', id);
      expect(readFileSync(path.join(dir, 'openscad.wasm')).equals(wasm)).toBe(true);
      const integrity = JSON.parse(readFileSync(path.join(dir, 'INTEGRITY.json'), 'utf8'));
      expect(integrity.files['openscad.js']).toEqual({ sha256: sha256(js), size: js.length });

      const second = await setupEngines({ root, download, log: () => {} });
      expect(second).toMatchObject({ fetched: [], written: [], found: [id], problems: [] });
      expect(fetched).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses a download that differs from the manifest and writes nothing', async () => {
    const root = scratchRoot();
    try {
      const download = async (_url, dest) => writeFileSync(dest, Buffer.concat([zip, Buffer.from('x')]));
      const result = await setupEngines({ root, download, log: () => {} });
      expect(result.problems.join(' ')).toMatch(/official-2026-10-18: the zip's size/);
      expect(existsSync(path.join(root, 'public', 'wasm', 'engines', id))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
