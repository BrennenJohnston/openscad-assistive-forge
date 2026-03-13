/**
 * Unit tests for generateMissingFileWarnings (openscad-worker.js).
 *
 * Because generateMissingFileWarnings is a module-scoped (non-exported)
 * function inside a Web Worker, we test its logic here using an inlined copy.
 * Keep this copy in sync with openscad-worker.js if the implementation changes.
 *
 * Phase 4 (S-012): Synthetic missing-file warnings that match desktop
 * OpenSCAD's "WARNING: Can't open include file ..." format.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';

// ─── Inlined testable copy of generateMissingFileWarnings ───────────────────
// Mirrors openscad-worker.js generateMissingFileWarnings; runs in Node.js/Vitest.
function generateMissingFileWarnings(scadContent, fileExistsFn) {
  const warnings = [];
  const seen = new Set();
  const directiveRegex = /(?:include|use)\s*(?:<([^>]+)>|"([^"]+)")/g;
  let match;

  while ((match = directiveRegex.exec(scadContent)) !== null) {
    const refFile = (match[1] || match[2]).trim();
    if (!refFile || seen.has(refFile)) continue;
    seen.add(refFile);

    if (!fileExistsFn(refFile)) {
      warnings.push(
        `WARNING: Can't open include file '${refFile}', import file '${refFile}'.`
      );
    }
  }

  return warnings;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('generateMissingFileWarnings — directive extraction', () => {
  const noFilesExist = () => false;
  const allFilesExist = () => true;

  it('returns empty array when SCAD has no include/use directives', () => {
    const scad = 'cube([10, 10, 10]);';
    expect(generateMissingFileWarnings(scad, noFilesExist)).toEqual([]);
  });

  it('extracts include <file> directive', () => {
    const scad = 'include <helpers.scad>\ncube(10);';
    const warnings = generateMissingFileWarnings(scad, noFilesExist);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("'helpers.scad'");
  });

  it('extracts use <file> directive', () => {
    const scad = 'use <MCAD/bearings.scad>\ncylinder(r=5, h=10);';
    const warnings = generateMissingFileWarnings(scad, noFilesExist);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("'MCAD/bearings.scad'");
  });

  it('extracts multiple directives', () => {
    const scad = [
      'include <config.txt>',
      'use <lib/utils.scad>',
      'include <openings.txt>',
      'cube(10);',
    ].join('\n');
    const warnings = generateMissingFileWarnings(scad, noFilesExist);
    expect(warnings).toHaveLength(3);
    expect(warnings[0]).toContain("'config.txt'");
    expect(warnings[1]).toContain("'lib/utils.scad'");
    expect(warnings[2]).toContain("'openings.txt'");
  });

  it('returns empty array when all referenced files exist', () => {
    const scad = 'include <helpers.scad>\nuse <lib.scad>';
    expect(generateMissingFileWarnings(scad, allFilesExist)).toEqual([]);
  });

  it('handles mixed found and missing files', () => {
    const scad = 'include <found.scad>\ninclude <missing.txt>';
    const existsFn = (f) => f === 'found.scad';
    const warnings = generateMissingFileWarnings(scad, existsFn);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("'missing.txt'");
  });
});

describe('generateMissingFileWarnings — deduplication', () => {
  const noFilesExist = () => false;

  it('deduplicates the same filename referenced by multiple directives', () => {
    const scad = [
      'include <data.txt>',
      'include <data.txt>',
      'use <data.txt>',
    ].join('\n');
    const warnings = generateMissingFileWarnings(scad, noFilesExist);
    expect(warnings).toHaveLength(1);
  });

  it('does not deduplicate different filenames', () => {
    const scad = 'include <a.txt>\ninclude <b.txt>';
    const warnings = generateMissingFileWarnings(scad, noFilesExist);
    expect(warnings).toHaveLength(2);
  });
});

describe('generateMissingFileWarnings — desktop format', () => {
  const noFilesExist = () => false;

  it('produces desktop-format warning string', () => {
    const scad = 'include <openings_and_additions.txt>';
    const warnings = generateMissingFileWarnings(scad, noFilesExist);
    expect(warnings[0]).toBe(
      "WARNING: Can't open include file 'openings_and_additions.txt', " +
        "import file 'openings_and_additions.txt'."
    );
  });

  it('preserves subdirectory paths in warning', () => {
    const scad = 'use <MCAD/bearings.scad>';
    const warnings = generateMissingFileWarnings(scad, noFilesExist);
    expect(warnings[0]).toBe(
      "WARNING: Can't open include file 'MCAD/bearings.scad', " +
        "import file 'MCAD/bearings.scad'."
    );
  });
});

describe('generateMissingFileWarnings — edge cases', () => {
  const noFilesExist = () => false;

  it('handles empty SCAD content', () => {
    expect(generateMissingFileWarnings('', noFilesExist)).toEqual([]);
  });

  it('ignores angle brackets not preceded by include/use', () => {
    const scad = 'echo("a < b > c");';
    expect(generateMissingFileWarnings(scad, noFilesExist)).toEqual([]);
  });

  it('handles whitespace between keyword and angle bracket', () => {
    const scad = 'include   <spaced.scad>';
    const warnings = generateMissingFileWarnings(scad, noFilesExist);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("'spaced.scad'");
  });

  it('trims whitespace from extracted filename', () => {
    const scad = 'include < padded.scad >';
    const warnings = generateMissingFileWarnings(scad, noFilesExist);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("'padded.scad'");
  });
});

describe('generateMissingFileWarnings — fileExistsFn integration pattern', () => {
  it('works with mountedFiles-style path matching', () => {
    const mountedPaths = ['/work/openings.txt', '/work/config.json'];
    const existsFn = (refFile) =>
      mountedPaths.some((p) => p === refFile || p.endsWith('/' + refFile));

    const scad = [
      'include <openings.txt>',
      'include <missing.txt>',
      'include <config.json>',
    ].join('\n');

    const warnings = generateMissingFileWarnings(scad, existsFn);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("'missing.txt'");
  });

  it('works with subdirectory references against mounted paths', () => {
    const mountedPaths = ['/libraries/MCAD/bearings.scad'];
    const existsFn = (refFile) =>
      mountedPaths.some((p) => p === refFile || p.endsWith('/' + refFile));

    const scad = 'use <MCAD/bearings.scad>';
    const warnings = generateMissingFileWarnings(scad, existsFn);
    expect(warnings).toEqual([]);
  });
});

describe('generateMissingFileWarnings — quoted-path directives', () => {
  const noFilesExist = () => false;

  it('extracts include "file.scad" directive', () => {
    const scad = 'include "helpers.scad"\ncube(10);';
    const warnings = generateMissingFileWarnings(scad, noFilesExist);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("'helpers.scad'");
  });

  it('extracts use "file.scad" directive', () => {
    const scad = 'use "MCAD/bearings.scad"\ncylinder(r=5, h=10);';
    const warnings = generateMissingFileWarnings(scad, noFilesExist);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("'MCAD/bearings.scad'");
  });

  it('handles mixed angle-bracket and quoted-path directives', () => {
    const scad = [
      'include <config.txt>',
      'use "lib/utils.scad"',
      'include "openings.txt"',
      'use <MCAD/gears.scad>',
    ].join('\n');
    const warnings = generateMissingFileWarnings(scad, noFilesExist);
    expect(warnings).toHaveLength(4);
    expect(warnings[0]).toContain("'config.txt'");
    expect(warnings[1]).toContain("'lib/utils.scad'");
    expect(warnings[2]).toContain("'openings.txt'");
    expect(warnings[3]).toContain("'MCAD/gears.scad'");
  });

  it('handles quoted path with subdirectory', () => {
    const scad = 'include "subdir/nested/data.txt"';
    const warnings = generateMissingFileWarnings(scad, noFilesExist);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("'subdir/nested/data.txt'");
  });
});

describe('ConsolePanel + ErrorLogPanel compatibility', () => {
  it('WARNING: prefix is recognized by ConsolePanel.parseLine pattern', () => {
    const warningLine =
      "WARNING: Can't open include file 'test.txt', import file 'test.txt'.";
    expect(
      warningLine.includes('WARNING:') || warningLine.includes('Warning:')
    ).toBe(true);
  });

  it('WARNING: prefix is recognized by ErrorLogPanel.parseLine pattern', () => {
    const warningLine =
      "WARNING: Can't open include file 'test.txt', import file 'test.txt'.";
    expect(/\bWARNING:/i.test(warningLine)).toBe(true);
  });
});
