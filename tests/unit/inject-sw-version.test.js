/**
 * Unit tests for scripts/inject-sw-version.js
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  injectSwVersion,
  injectBuildStamp,
  SW_CACHE_VERSION_TOKEN,
  BUILD_STAMP_TOKEN,
} from '../../scripts/inject-sw-version.js';

describe('injectSwVersion', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'sw-inject-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('replaces every token occurrence and returns the version', () => {
    writeFileSync(
      path.join(dir, 'sw.js'),
      `const CACHE_VERSION = '${SW_CACHE_VERSION_TOKEN}';\n` +
        `const CACHE_NAME = \`openscad-forge-${SW_CACHE_VERSION_TOKEN}\`;\n`
    );

    const result = injectSwVersion(dir, 'commit-abc12345');

    expect(result).toBe('commit-abc12345');
    const out = readFileSync(path.join(dir, 'sw.js'), 'utf-8');
    expect(out).not.toContain(SW_CACHE_VERSION_TOKEN);
    expect(out).toContain(`const CACHE_VERSION = 'commit-abc12345';`);
    expect(out).toContain('openscad-forge-commit-abc12345');
  });

  it('throws when sw.js is missing', () => {
    expect(() => injectSwVersion(dir, 'commit-abc12345')).toThrow(
      /not found/i
    );
  });

  it('throws when the token is absent (public/sw.js was edited)', () => {
    writeFileSync(
      path.join(dir, 'sw.js'),
      `const CACHE_VERSION = 'hardcoded';\n`
    );
    expect(() => injectSwVersion(dir, 'commit-abc12345')).toThrow(
      /token .* not found/i
    );
  });

  it('throws on an invalid version string', () => {
    writeFileSync(
      path.join(dir, 'sw.js'),
      `const CACHE_VERSION = '${SW_CACHE_VERSION_TOKEN}';\n`
    );
    expect(() => injectSwVersion(dir, '')).toThrow(/invalid swVersion/i);
  });
});

describe('injectBuildStamp', () => {
  // Audit 19. The capability index is copied from public/ verbatim, the same
  // as sw.js, so a Vite `define` cannot reach it and the value is written
  // here instead. It throws on a miss for the same reason its neighbour
  // does: an index that silently ships the literal token is worse than a
  // build that stops, because the whole point of the line is that a tool
  // reading it can say which build answered.
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'stamp-inject-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes the stamp into the capability index and returns it', () => {
    writeFileSync(
      path.join(dir, 'forge-capabilities.txt'),
      `version: 1
build: ${BUILD_STAMP_TOKEN}
`
    );

    const result = injectBuildStamp(dir, 'build-20260915013025');

    expect(result).toBe('build-20260915013025');
    const out = readFileSync(path.join(dir, 'forge-capabilities.txt'), 'utf-8');
    expect(out).not.toContain(BUILD_STAMP_TOKEN);
    expect(out).toContain('build: build-20260915013025');
  });

  it('throws when the capability index is missing', () => {
    expect(() => injectBuildStamp(dir, 'build-1')).toThrow(/not found/i);
  });

  it('throws when the token is absent (public/ copy was edited)', () => {
    writeFileSync(
      path.join(dir, 'forge-capabilities.txt'),
      `version: 1
build: hardcoded
`
    );
    expect(() => injectBuildStamp(dir, 'build-1')).toThrow(
      /token .* not found/i
    );
  });

  it('throws on an invalid stamp', () => {
    writeFileSync(
      path.join(dir, 'forge-capabilities.txt'),
      `build: ${BUILD_STAMP_TOKEN}
`
    );
    expect(() => injectBuildStamp(dir, '')).toThrow(/invalid stamp/i);
  });

  it('the shipped public/ copy still carries the token', () => {
    // The guard above only proves the function works on a file it was handed.
    // This one proves the real file it is pointed at every build has not been
    // edited out from under it - the failure the throw exists to catch.
    const shipped = readFileSync(
      path.join(process.cwd(), 'public', 'forge-capabilities.txt'),
      'utf-8'
    );
    expect(shipped).toContain(`build: ${BUILD_STAMP_TOKEN}`);
  });
});
