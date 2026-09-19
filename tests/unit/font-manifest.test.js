import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  FONT_ASSET_DIR,
  FONT_FILES,
  FONT_MANIFEST,
  FONT_MOUNT_DIR,
  fontScadName,
} from '../../src/js/font-manifest.js';

describe('font manifest (F2)', () => {
  it('describes exactly the four mounted Liberation fonts', () => {
    expect(FONT_MANIFEST).toHaveLength(4);
    expect(FONT_FILES).toEqual([
      'LiberationSans-Regular.ttf',
      'LiberationSans-Bold.ttf',
      'LiberationSans-Italic.ttf',
      'LiberationMono-Regular.ttf',
    ]);
  });

  it('gives every entry a file, family, style and mount path', () => {
    for (const entry of FONT_MANIFEST) {
      expect(typeof entry.file).toBe('string');
      expect(entry.file).toMatch(/\.ttf$/);
      expect(entry.family).toMatch(/^Liberation (Sans|Mono)$/);
      expect(['Regular', 'Bold', 'Italic']).toContain(entry.style);
      expect(entry.mountPath).toBe(`${FONT_MOUNT_DIR}/${entry.file}`);
    }
  });

  it('mounts under a path fontconfig searches', () => {
    expect(FONT_MOUNT_DIR.startsWith('/usr/share/fonts')).toBe(true);
  });

  // The drift guard this module exists for: the manifest is the UI's idea of
  // which fonts exist, and what the worker can actually fetch is whatever the
  // downloader put in public/fonts/. If they disagree, the Font List shows a
  // font text() cannot use, or hides one it can.
  //
  // The downloader is the source of truth, not the folder: `public/fonts/*.ttf`
  // is gitignored (.gitignore:12) and only appears after `npm run setup-wasm`,
  // which the Unit Tests CI job does not run. Its list is read from source
  // text because the module cannot be imported — it calls setup() on load.
  it('names every font the downloader fetches, and no others', () => {
    const script = fs.readFileSync(
      path.join(process.cwd(), 'scripts', 'download-wasm.js'),
      'utf8'
    );
    const block = script.match(/const REQUIRED_FONTS\s*=\s*\[([\s\S]*?)\]/);
    if (!block) {
      // Renaming the list must fail loudly, not quietly stop guarding.
      throw new Error(
        'REQUIRED_FONTS not found in scripts/download-wasm.js — the font ' +
          'drift guard can no longer see what the downloader fetches'
      );
    }
    const fetched = [...block[1].matchAll(/'([^']+\.ttf)'/g)]
      .map((m) => m[1])
      .sort();
    expect(fetched).toEqual([...FONT_FILES].sort());
  });

  it('matches what is on disk, wherever the fonts have been downloaded', () => {
    const dir = path.join(process.cwd(), 'public', FONT_ASSET_DIR);
    const onDisk = fs
      .readdirSync(dir)
      .filter((name) => name.toLowerCase().endsWith('.ttf'))
      .sort();
    // Empty means setup-wasm has not run in this environment, not that the
    // manifest is wrong; the assertion above covers that case.
    if (onDisk.length === 0) return;
    expect(onDisk).toEqual([...FONT_FILES].sort());
  });

  it('freezes the manifest so a caller cannot edit the shared list', () => {
    expect(Object.isFrozen(FONT_MANIFEST)).toBe(true);
    expect(Object.isFrozen(FONT_MANIFEST[0])).toBe(true);
  });

  describe('fontScadName', () => {
    it('uses the bare family for a Regular face', () => {
      const sans = FONT_MANIFEST.find(
        (f) => f.family === 'Liberation Sans' && f.style === 'Regular'
      );
      expect(fontScadName(sans)).toBe('Liberation Sans');
    });

    it('appends a style suffix for the others', () => {
      const bold = FONT_MANIFEST.find((f) => f.style === 'Bold');
      expect(fontScadName(bold)).toBe('Liberation Sans:style=Bold');
      const italic = FONT_MANIFEST.find((f) => f.style === 'Italic');
      expect(fontScadName(italic)).toBe('Liberation Sans:style=Italic');
    });

    it('returns an empty string rather than throwing on a missing entry', () => {
      expect(fontScadName(undefined)).toBe('');
    });
  });
});
