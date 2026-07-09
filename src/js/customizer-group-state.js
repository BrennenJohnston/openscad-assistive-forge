/**
 * Per-file Customizer group expand/collapse state (F5).
 *
 * Default behaviour for a freshly-loaded file is "all groups collapsed"
 * — matches the OpenSCAD desktop-style collapsed Customizer the
 * stakeholder asked for in the 2026-05-15 Volkswitch feedback. After
 * the user has expanded one or more groups, the set of open group IDs
 * is persisted in localStorage keyed by the file identifier so a
 * reload restores their work-in-progress focus.
 *
 * Storage key shape: `openscad-forge-customizer-groups-{fileId}`
 * Stored value: `{"open":["groupId1","groupId2",...]}` or `null`.
 *
 * `fileId` is provided by the caller and should uniquely identify a
 * project's source file (the simplest stable id is the file name; the
 * UI never round-trips this value to disk so collisions only cause a
 * small UX glitch, never data loss).
 *
 * @license GPL-3.0-or-later
 */

import { getAppPrefKey } from './storage-keys.js';

const KEY_PREFIX = 'customizer-groups-';

/**
 * @param {string} fileId
 * @returns {string}
 */
function buildKey(fileId) {
  return getAppPrefKey(KEY_PREFIX + fileId);
}

/**
 * Sanitise an arbitrary string into a stable key segment. Keeps storage
 * keys human-readable while preventing pathological characters from
 * breaking JSON round-trips on first read.
 *
 * @param {string} fileId
 * @returns {string}
 */
function sanitiseFileId(fileId) {
  if (typeof fileId !== 'string' || fileId.length === 0) return '';
  // Replace whitespace + path separators with hyphens; keep alnum, dots
  // dashes and underscores. Caps length for safety.
  return fileId
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 200);
}

/**
 * Load the set of open group IDs for a given file. Returns `null` when
 * no preference has been saved yet — callers should treat that as "use
 * the F5 default of all-collapsed".
 *
 * @param {string} fileId
 * @returns {Set<string>|null}
 */
export function loadOpenGroupIds(fileId) {
  const safe = sanitiseFileId(fileId);
  if (!safe) return null;
  try {
    const raw = localStorage.getItem(buildKey(safe));
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.open)) return null;
    return new Set(parsed.open.filter((v) => typeof v === 'string'));
  } catch {
    // Corrupt JSON or unavailable storage — fall back to defaults.
    return null;
  }
}

/**
 * Persist the set of open group IDs for a given file. Passing an empty
 * set is meaningful — it records "the user explicitly collapsed
 * everything" and prevents the next load from re-opening anything.
 *
 * @param {string} fileId
 * @param {Iterable<string>} groupIds
 */
export function saveOpenGroupIds(fileId, groupIds) {
  const safe = sanitiseFileId(fileId);
  if (!safe) return;
  try {
    const open = Array.from(new Set(groupIds)).filter(
      (v) => typeof v === 'string'
    );
    localStorage.setItem(buildKey(safe), JSON.stringify({ open }));
  } catch {
    // Quota exhausted, private mode, etc. — silently skip; the UI
    // remains functional, just without per-file persistence.
  }
}

/**
 * Drop the saved state for a given file. Useful when the file is
 * removed from the project, or when the schema has changed enough that
 * the previous group IDs no longer apply.
 *
 * @param {string} fileId
 */
export function clearOpenGroupIds(fileId) {
  const safe = sanitiseFileId(fileId);
  if (!safe) return;
  try {
    localStorage.removeItem(buildKey(safe));
  } catch {
    /* see saveOpenGroupIds */
  }
}

// Exported for tests.
export const __test = { sanitiseFileId, buildKey };
