/**
 * Unit tests for generateMissingFileWarnings.
 *
 * Imports the real implementation from src/worker/missing-file-warnings.js —
 * the shared module the render worker uses — so these tests fail when the
 * production logic changes.
 *
 * Synthetic missing-file warnings that match desktop
 * OpenSCAD's "WARNING: Can't open include file ..." format.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { generateMissingFileWarnings } from '../../src/worker/missing-file-warnings.js';

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

// OpenSCAD never reads a directive written inside a comment, so no
// warning may come from one: the Plug Puller's single-file build explains
// its include order in comments and uses none of those files.
describe('generateMissingFileWarnings — comments', () => {
  const noFilesExist = () => false;

  it('ignores a directive in a line comment', () => {
    const scad = '// include <presets.scad>\ncube(10);';
    expect(generateMissingFileWarnings(scad, noFilesExist)).toEqual([]);
  });

  it('ignores the Plug Puller comments that were warned about', () => {
    const scad = [
      '// `include <presets.scad>`. Include order matters: OpenSCAD evaluates',
      '// main SCAD must `include <fit_measured.scad>` BEFORE `include <presets.scad>`.',
      'quality = 64;',
    ].join('\n');
    expect(generateMissingFileWarnings(scad, noFilesExist)).toEqual([]);
  });

  it('ignores a directive in a block comment over several lines', () => {
    const scad = '/* Usage:\n   use <lib/utils.scad>\n   include "config.txt"\n*/\ncube(10);';
    expect(generateMissingFileWarnings(scad, noFilesExist)).toEqual([]);
  });

  it('still warns about a real directive after a comment', () => {
    const scad = '// include <old.scad>\ninclude <real.scad> // real\n/* use <old2.scad> */ use <real2.scad>';
    const warnings = generateMissingFileWarnings(scad, noFilesExist);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("'real.scad'");
    expect(warnings[1]).toContain("'real2.scad'");
  });

  it('does not treat // inside a string as a comment', () => {
    const scad = 'echo("https://example.com"); include <real.scad>';
    const warnings = generateMissingFileWarnings(scad, noFilesExist);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("'real.scad'");
  });

  it('does not treat /* inside a string as a comment', () => {
    const scad = 'echo("/*");\ninclude <real.scad>\necho("*/");';
    const warnings = generateMissingFileWarnings(scad, noFilesExist);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("'real.scad'");
  });

  it('keeps an escaped quote inside a string from ending it', () => {
    const scad = 'echo("say \\"//\\" here"); include <real.scad>';
    const warnings = generateMissingFileWarnings(scad, noFilesExist);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("'real.scad'");
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
