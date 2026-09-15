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
export const BUILD_STAMP_TOKEN = '__BUILD_STAMP__';

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

/**
 * Write the build stamp into the capability index (audit 19).
 *
 * `forge-capabilities.txt` is copied from public/ verbatim and never passes
 * through the bundle, exactly like sw.js, so a `define` cannot reach it and
 * the value has to be written here.
 *
 * It throws on a miss for the same reason its neighbour does: a capability
 * index that silently ships the literal token is worse than a build that
 * stops, because the whole point of the line is that a tool reading it can
 * say which build answered.
 *
 * @param {string} distDir
 * @param {string} stamp
 * @returns {string} the stamp written
 */
export function injectBuildStamp(distDir, stamp) {
  if (!stamp || typeof stamp !== 'string') {
    throw new Error(`[capabilities] invalid stamp: ${JSON.stringify(stamp)}`);
  }

  const filePath = path.join(distDir, 'forge-capabilities.txt');
  if (!existsSync(filePath)) {
    throw new Error(
      `[capabilities] ${filePath} not found - was the build output moved?`
    );
  }

  const source = readFileSync(filePath, 'utf-8');
  if (!source.includes(BUILD_STAMP_TOKEN)) {
    throw new Error(
      `[capabilities] token ${BUILD_STAMP_TOKEN} not found in ${filePath} - public/forge-capabilities.txt may have been edited`
    );
  }

  const injected = source.replaceAll(BUILD_STAMP_TOKEN, stamp);
  if (injected.includes(BUILD_STAMP_TOKEN)) {
    throw new Error(`[capabilities] token survived replacement in ${filePath}`);
  }

  writeFileSync(filePath, injected, 'utf-8');
  return stamp;
}
