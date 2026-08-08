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
  // which fonts exist, and public/fonts/ is what the worker can actually
  // fetch. If they disagree, the Font List shows a font text() cannot use, or
  // hides one it can.
  it('names every .ttf that is really served, and no others', () => {
    const dir = path.join(process.cwd(), 'public', FONT_ASSET_DIR);
    const onDisk = fs
      .readdirSync(dir)
      .filter((name) => name.toLowerCase().endsWith('.ttf'))
      .sort();
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
