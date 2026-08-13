/**
 * UI-Scoped Preferences (UF-14, U-25)
 *
 * Forge and Classic hold independently saved VIEWING preferences. Every
 * preference the signed Q-40 table marks PER-UI reads and writes through
 * this facade, which resolves the active interface's namespace at CALL
 * time and keeps one scoped copy per interface:
 *
 *   <base key>--forge      e.g. openscad-forge-grid--forge
 *   <base key>--classic    e.g. openscad-forge-grid--classic
 *
 * The base (pre-split) keys are never renamed or deleted — they remain as
 * a frozen archive that the one-time seeding read, and that a rolled-back
 * build could still read. The double-dash separator cannot collide with
 * any existing single-dash key name.
 *
 * Seeding (Q-40b, owner-signed): one-time and marker-gated. The Forge
 * namespace copies the user's current merged values — they are the user's
 * Forge reality. Classic copies the same values EXCEPT the three rows
 * whose desktop defaults the old first-entry stamp always intended:
 * grid (off), axes (on), axis tick markings (on). Those three are not
 * copied; they fall through to NAMESPACE_DEFAULTS below, so a fresh
 * Classic looks like the desktop out of the box and the old
 * classic-view-defaults-v2 stamp is no longer needed at all.
 *
 * Code content, parameter values and camera pose are SHARED BY ORDER and
 * never pass through here.
 *
 * @license GPL-3.0-or-later
 */

import {
  getAppPrefKey,
  safeGetItem,
  safeSetItem,
  STORAGE_KEY_UI_MODE,
  STORAGE_KEY_SCOPED_PREFS_SEEDED,
  STORAGE_KEY_GRID,
  STORAGE_KEY_GRID_SIZE,
  STORAGE_KEY_GRID_COLOR,
  STORAGE_KEY_GRID_OPACITY,
  STORAGE_KEY_MEASUREMENTS,
  STORAGE_KEY_VIEWPORT_SCHEME,
  STORAGE_KEY_STATUS_BAR,
  STORAGE_KEY_AUTO_BED,
  STORAGE_KEY_ZOOM_TO_CURSOR,
  STORAGE_KEY_MODEL_COLOR,
  STORAGE_KEY_MODEL_COLOR_ENABLED,
  STORAGE_KEY_MODEL_OPACITY,
  STORAGE_KEY_BRIGHTNESS,
  STORAGE_KEY_CONTRAST,
  STORAGE_KEY_MODEL_APPEARANCE_ENABLED,
} from './storage-keys.js';

/** @typedef {'forge'|'classic'} UiNamespace */

export const UI_NAMESPACES = Object.freeze(
  /** @type {UiNamespace[]} */ (['forge', 'classic'])
);

/**
 * The 23 storage keys the signed Q-40 classification table marks PER-UI.
 * The display-* names mirror display-options-controller.js's PREF_PREFIX
 * derivation and auto-rotate/rotate-speed mirror overlay-grid-controller's
 * — same getAppPrefKey generator, and the unit snapshot pins every derived
 * scoped key so a drifted name fails the suite.
 */
export const SCOPED_PREF_BASE_KEYS = Object.freeze([
  STORAGE_KEY_GRID,
  STORAGE_KEY_GRID_SIZE,
  STORAGE_KEY_GRID_COLOR,
  STORAGE_KEY_GRID_OPACITY,
  getAppPrefKey('display-axes'),
  getAppPrefKey('display-axisMarks'),
  getAppPrefKey('display-edges'),
  getAppPrefKey('display-edgeBudget'),
  getAppPrefKey('display-crosshairs'),
  getAppPrefKey('display-wireframe'),
  STORAGE_KEY_MEASUREMENTS,
  STORAGE_KEY_VIEWPORT_SCHEME,
  STORAGE_KEY_STATUS_BAR,
  getAppPrefKey('auto-rotate'),
  getAppPrefKey('rotate-speed'),
  STORAGE_KEY_AUTO_BED,
  STORAGE_KEY_ZOOM_TO_CURSOR,
  STORAGE_KEY_MODEL_COLOR,
  STORAGE_KEY_MODEL_COLOR_ENABLED,
  STORAGE_KEY_MODEL_OPACITY,
  STORAGE_KEY_BRIGHTNESS,
  STORAGE_KEY_CONTRAST,
  STORAGE_KEY_MODEL_APPEARANCE_ENABLED,
]);

/**
 * The rows where the two interfaces deliberately part ways when nothing is
 * saved yet — the desktop's out-of-the-box 3D view (grid off, black axes
 * with tick marks on). Forge entries are absent on purpose: a null read
 * falls through to each caller's existing single default (grid on in
 * loadGridPreference, axes/ticks off in DisplayOptionsController.DEFAULTS),
 * so no default value gains a second home.
 * @type {Readonly<Record<string, Partial<Record<UiNamespace, string>>>>}
 */
const NAMESPACE_DEFAULTS = Object.freeze({
  [STORAGE_KEY_GRID]: Object.freeze({ classic: 'false' }),
  [getAppPrefKey('display-axes')]: Object.freeze({ classic: 'true' }),
  [getAppPrefKey('display-axisMarks')]: Object.freeze({ classic: 'true' }),
});

/**
 * The three keys above are also the ones seeding must NOT copy into the
 * Classic namespace (Q-40b): Classic starts at the desktop defaults, not
 * at the user's merged Forge-era values.
 */
const CLASSIC_SEED_SKIP = new Set(Object.keys(NAMESPACE_DEFAULTS));

/**
 * The interface namespace preferences resolve to right now.
 *
 * body[data-ui-mode] is the live truth (stamped by UIModeController before
 * any scoped read site runs — measured boot order: ui-mode init precedes
 * display-options init, and the PreviewManager is lazier still). The
 * stored-mode fallback covers reads that could ever precede the stamp;
 * absent both, Forge — the app's base interface.
 *
 * @returns {UiNamespace}
 */
export function getActiveUiNamespace() {
  const mode =
    typeof document !== 'undefined' ? document.body?.dataset?.uiMode : null;
  if (mode) return mode === 'classic' ? 'classic' : 'forge';
  const stored = safeGetItem(STORAGE_KEY_UI_MODE, null, { silent: true });
  if (stored) {
    try {
      if (JSON.parse(stored)?.mode === 'classic') return 'classic';
    } catch {
      // Unparseable mode prefs — treat as Forge below.
    }
  }
  return 'forge';
}

/**
 * @param {string} baseKey - A key from SCOPED_PREF_BASE_KEYS
 * @param {UiNamespace} [ns] - Defaults to the active interface
 * @returns {string} The namespaced storage key
 */
export function getScopedKey(baseKey, ns = getActiveUiNamespace()) {
  return `${baseKey}--${ns}`;
}

/** Re-entrancy guard: seeding reads storage, and reads trigger seeding. */
let seedingInProgress = false;

/**
 * One-time split of existing profiles (Q-40b). Marker-gated; safe to call
 * from every read/write. Copies current merged values into the Forge
 * namespace, and into Classic except the desktop-default trio. Absent base
 * keys are not written — reads fall through to defaults.
 *
 * @returns {boolean} whether the seed ran this call
 */
export function ensureScopedPrefsSeeded() {
  if (seedingInProgress) return false;
  if (safeGetItem(STORAGE_KEY_SCOPED_PREFS_SEEDED, null, { silent: true })) {
    return false;
  }
  seedingInProgress = true;
  try {
    for (const baseKey of SCOPED_PREF_BASE_KEYS) {
      const current = safeGetItem(baseKey, null, { silent: true });
      if (current === null) continue;
      // Never clobber a scoped value that somehow already exists — a
      // half-finished seed (storage quota mid-loop) must stay resumable
      // without undoing what the user changed since.
      if (
        safeGetItem(getScopedKey(baseKey, 'forge'), null, { silent: true }) ===
        null
      ) {
        safeSetItem(getScopedKey(baseKey, 'forge'), current);
      }
      if (
        !CLASSIC_SEED_SKIP.has(baseKey) &&
        safeGetItem(getScopedKey(baseKey, 'classic'), null, {
          silent: true,
        }) === null
      ) {
        safeSetItem(getScopedKey(baseKey, 'classic'), current);
      }
    }
    safeSetItem(STORAGE_KEY_SCOPED_PREFS_SEEDED, 'true');
  } finally {
    seedingInProgress = false;
  }
  return true;
}

/**
 * Read a PER-UI preference for the active (or given) interface.
 * Same contract as localStorage.getItem: a string, or null when unset —
 * except the desktop-default trio, whose Classic value is never null.
 *
 * @param {string} baseKey - A key from SCOPED_PREF_BASE_KEYS
 * @param {{ns?: UiNamespace}} [options]
 * @returns {string|null}
 */
export function readScopedPref(baseKey, { ns = getActiveUiNamespace() } = {}) {
  ensureScopedPrefsSeeded();
  const value = safeGetItem(getScopedKey(baseKey, ns), null, { silent: true });
  if (value !== null) return value;
  return NAMESPACE_DEFAULTS[baseKey]?.[ns] ?? null;
}

/**
 * Write a PER-UI preference for the active (or given) interface. The base
 * key is deliberately left untouched (frozen pre-split archive).
 *
 * @param {string} baseKey - A key from SCOPED_PREF_BASE_KEYS
 * @param {string} value
 * @param {{ns?: UiNamespace}} [options]
 * @returns {boolean} True when the write succeeded
 */
export function writeScopedPref(
  baseKey,
  value,
  { ns = getActiveUiNamespace() } = {}
) {
  ensureScopedPrefsSeeded();
  return safeSetItem(getScopedKey(baseKey, ns), String(value));
}
