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
  SW_CACHE_VERSION_TOKEN,
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
