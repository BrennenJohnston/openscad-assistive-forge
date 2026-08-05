#!/usr/bin/env node
/**
 * Inject the build's cache version into dist/sw.js.
 * @license GPL-3.0-or-later
 *
 * sw.js lives in public/ and is copied to dist/ verbatim by Vite's
 * copyPublicDir — it never enters the Rollup bundle, so a generateBundle
 * plugin can never see it. This runs after the copy (closeBundle) and
 * rewrites the file on disk. Every failure throws so a broken injection
 * fails the build instead of shipping a frozen cache name.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';

export const SW_CACHE_VERSION_TOKEN = '__SW_CACHE_VERSION__';

/**
 * Replace the cache-version token in <distDir>/sw.js with swVersion.
 * @param {string} distDir - Build output directory containing sw.js
 * @param {string} swVersion - Version string (e.g. "commit-abc12345")
 * @returns {string} the injected version
 * @throws when sw.js is missing, the token is absent (someone edited
 *   public/sw.js), or the token survives the replacement
 */
export function injectSwVersion(distDir, swVersion) {
  if (!swVersion || typeof swVersion !== 'string') {
    throw new Error(`[sw] invalid swVersion: ${JSON.stringify(swVersion)}`);
  }

  const swPath = path.join(distDir, 'sw.js');
  if (!existsSync(swPath)) {
    throw new Error(`[sw] ${swPath} not found — was the build output moved?`);
  }

  const source = readFileSync(swPath, 'utf-8');
  if (!source.includes(SW_CACHE_VERSION_TOKEN)) {
    throw new Error(
      `[sw] token ${SW_CACHE_VERSION_TOKEN} not found in ${swPath} — public/sw.js may have been edited`
    );
  }

  const injected = source.replaceAll(SW_CACHE_VERSION_TOKEN, swVersion);
  if (injected.includes(SW_CACHE_VERSION_TOKEN)) {
    throw new Error(`[sw] token survived replacement in ${swPath}`);
  }

  writeFileSync(swPath, injected, 'utf-8');
  return swVersion;
}
