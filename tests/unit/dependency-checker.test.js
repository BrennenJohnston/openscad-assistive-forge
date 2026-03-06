/**
 * Unit tests for dependency-checker.js
 *
 * Covers the single-file preflight path: parse SCAD includes/uses/imports,
 * check which are missing, format the warning message.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import {
  extractDependencies,
  checkDependencies,
  scanAllDependencies,
  formatMissingDependencies,
  runPreflightCheck,
} from '../../src/js/dependency-checker.js';

// ---------------------------------------------------------------------------
// extractDependencies
// ---------------------------------------------------------------------------

describe('extractDependencies', () => {
  it('returns empty arrays for empty string', () => {
    const result = extractDependencies('');
    expect(result.includes).toEqual([]);
    expect(result.uses).toEqual([]);
    expect(result.imports).toEqual([]);
  });

  it('returns empty arrays for null', () => {
    const result = extractDependencies(null);
    expect(result.includes).toEqual([]);
    expect(result.uses).toEqual([]);
    expect(result.imports).toEqual([]);
  });

  it('parses include <file.scad>', () => {
    const result = extractDependencies('include <helper.scad>');
    expect(result.includes).toContain('helper.scad');
  });

  it('parses include "file.scad"', () => {
    const result = extractDependencies('include "helper.scad"');
    expect(result.includes).toContain('helper.scad');
  });

  it('parses use <library.scad>', () => {
    const result = extractDependencies('use <MCAD/wheels.scad>');
    expect(result.uses).toContain('MCAD/wheels.scad');
  });

  it('parses import("file.svg")', () => {
    const result = extractDependencies('import("logo.svg");');
    expect(result.imports).toContain('logo.svg');
  });

  it('deduplicates identical includes', () => {
    const result = extractDependencies(
      'include <helper.scad>\ninclude <helper.scad>'
    );
    expect(result.includes.filter((f) => f === 'helper.scad')).toHaveLength(1);
  });

  it('parses multiple include types together', () => {
    const scad = [
      'include <helper.scad>',
      'use <MCAD/wheels.scad>',
      'import("logo.svg");',
    ].join('\n');
    const result = extractDependencies(scad);
    expect(result.includes).toContain('helper.scad');
    expect(result.uses).toContain('MCAD/wheels.scad');
    expect(result.imports).toContain('logo.svg');
  });

  it('parses include with path separators', () => {
    const result = extractDependencies('include <subdir/params.scad>');
    expect(result.includes).toContain('subdir/params.scad');
  });

  it('parses import with extra comma argument', () => {
    const result = extractDependencies('import("profile.dxf", convexity=10);');
    expect(result.imports).toContain('profile.dxf');
  });
});

// ---------------------------------------------------------------------------
// checkDependencies
// ---------------------------------------------------------------------------

describe('checkDependencies', () => {
  it('reports missing include when file not uploaded', () => {
    const deps = { includes: ['helper.scad'], uses: [], imports: [] };
    const { hasMissing, missing } = checkDependencies(deps, []);
    expect(hasMissing).toBe(true);
    expect(missing.includes).toContain('helper.scad');
  });

  it('does not report missing when file is uploaded', () => {
    const deps = { includes: ['helper.scad'], uses: [], imports: [] };
    const { hasMissing } = checkDependencies(deps, ['helper.scad']);
    expect(hasMissing).toBe(false);
  });

  it('matches by basename even with path prefix', () => {
    const deps = { includes: ['subdir/helper.scad'], uses: [], imports: [] };
    const { hasMissing } = checkDependencies(deps, ['helper.scad']);
    expect(hasMissing).toBe(false);
  });

  it('is case-insensitive for filenames', () => {
    const deps = { includes: ['Helper.SCAD'], uses: [], imports: [] };
    const { hasMissing } = checkDependencies(deps, ['helper.scad']);
    expect(hasMissing).toBe(false);
  });

  it('exempts known library paths when library is available', () => {
    const deps = { includes: ['MCAD/wheels.scad'], uses: [], imports: [] };
    const { hasMissing } = checkDependencies(deps, [], {
      availableLibraries: new Set(['mcad']),
    });
    expect(hasMissing).toBe(false);
  });

  it('reports missing library path when library not available', () => {
    const deps = { includes: ['MCAD/wheels.scad'], uses: [], imports: [] };
    const { hasMissing } = checkDependencies(deps, [], {
      availableLibraries: new Set(),
    });
    expect(hasMissing).toBe(true);
  });

  it('reports missing import file', () => {
    const deps = { includes: [], uses: [], imports: ['logo.svg'] };
    const { hasMissing, missing } = checkDependencies(deps, []);
    expect(hasMissing).toBe(true);
    expect(missing.imports).toContain('logo.svg');
  });
});

// ---------------------------------------------------------------------------
// formatMissingDependencies
// ---------------------------------------------------------------------------

describe('formatMissingDependencies', () => {
  it('returns empty string for no missing files', () => {
    const msg = formatMissingDependencies({
      includes: [],
      uses: [],
      imports: [],
    });
    expect(msg).toBe('');
  });

  it('lists include files', () => {
    const msg = formatMissingDependencies({
      includes: ['helper.scad'],
      uses: [],
      imports: [],
    });
    expect(msg).toContain('helper.scad');
    expect(msg).toContain('Include files');
  });

  it('lists use files as library files', () => {
    const msg = formatMissingDependencies({
      includes: [],
      uses: ['lib.scad'],
      imports: [],
    });
    expect(msg).toContain('lib.scad');
    expect(msg).toContain('Library files');
  });

  it('lists import files', () => {
    const msg = formatMissingDependencies({
      includes: [],
      uses: [],
      imports: ['logo.svg'],
    });
    expect(msg).toContain('logo.svg');
    expect(msg).toContain('Import files');
  });
});

// ---------------------------------------------------------------------------
// runPreflightCheck — single-file upload scenarios
// ---------------------------------------------------------------------------

describe('runPreflightCheck — single-file upload', () => {
  it('returns success when file has no external dependencies', () => {
    const scad = 'cube([10, 10, 10]);';
    const result = runPreflightCheck(scad, ['model.scad']);
    expect(result.success).toBe(true);
    expect(result.totalDependencies).toBe(0);
    expect(result.message).toBe('No external dependencies');
  });

  it('returns success when all included files are uploaded', () => {
    const scad = 'include <helper.scad>\ncube([10, 10, 10]);';
    const result = runPreflightCheck(scad, ['model.scad', 'helper.scad']);
    expect(result.success).toBe(true);
    expect(result.totalMissing).toBe(0);
  });

  it('returns failure when companion include file is absent (single-file upload)', () => {
    const scad = 'include <helper.scad>\ncube([10, 10, 10]);';
    // Only the main file is in uploadedFilenames — companion missing
    const result = runPreflightCheck(scad, ['model.scad']);
    expect(result.success).toBe(false);
    expect(result.totalMissing).toBe(1);
    expect(result.missing.includes).toContain('helper.scad');
  });

  it('counts all dependency types in totalDependencies', () => {
    const scad = [
      'include <helper.scad>',
      'use <MCAD/wheels.scad>',
      'import("logo.svg");',
    ].join('\n');
    const result = runPreflightCheck(scad, ['model.scad']);
    expect(result.totalDependencies).toBe(3);
  });

  it('reports missing file count in message', () => {
    const scad = 'include <a.scad>\ninclude <b.scad>';
    const result = runPreflightCheck(scad, ['model.scad']);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Missing 2 required files/);
  });

  it('exempts available library files from missing count', () => {
    const scad = 'use <MCAD/wheels.scad>';
    const result = runPreflightCheck(scad, ['model.scad'], {
      availableLibraries: new Set(['mcad']),
    });
    expect(result.success).toBe(true);
  });

  it('returns message for single missing file', () => {
    const scad = 'include <helper.scad>';
    const result = runPreflightCheck(scad, ['model.scad']);
    expect(result.message).toBe('Missing 1 required file');
  });
});

// ---------------------------------------------------------------------------
// scanAllDependencies — recursive scanning
// ---------------------------------------------------------------------------

describe('scanAllDependencies', () => {
  it('scans the main file for dependencies', () => {
    const files = new Map([
      ['model.scad', 'include <helper.scad>'],
    ]);
    const result = scanAllDependencies(files, 'model.scad');
    expect(result.includes).toContain('helper.scad');
  });

  it('recursively scans included files', () => {
    const files = new Map([
      ['model.scad', 'include <helper.scad>'],
      ['helper.scad', 'include <utils.scad>'],
    ]);
    const result = scanAllDependencies(files, 'model.scad');
    expect(result.includes).toContain('helper.scad');
    expect(result.includes).toContain('utils.scad');
  });

  it('handles circular includes without infinite loop', () => {
    const files = new Map([
      ['a.scad', 'include <b.scad>'],
      ['b.scad', 'include <a.scad>'],
    ]);
    // Should not throw or hang
    const result = scanAllDependencies(files, 'a.scad');
    expect(result.includes).toContain('b.scad');
  });
});
