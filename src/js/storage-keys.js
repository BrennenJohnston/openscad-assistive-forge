/**
 * Storage Keys - Centralized localStorage key management
 *
 * Implements the key naming convention from UI_STANDARDS.md:
 * - Drawer state keys: openscad-drawer-{name}-state
 * - Drawer size keys: openscad-drawer-{name}-width or -height
 * - App preferences: openscad-forge-{feature}
 *
 * Provides one-time migration from legacy key patterns.
 *
 * @license GPL-3.0-or-later
 */

// Migration version - increment when adding new migrations
const MIGRATION_VERSION = 1;
const MIGRATION_KEY = 'openscad-forge-storage-migration-version';

/**
 * Key mapping from legacy patterns to standardized patterns
 * Format: { legacy: new, ... }
 *
 * Categorized by:
 * - DRAWER: openscad-drawer-{name}-state
 * - APP: openscad-forge-{feature}
 */
export const KEY_MIGRATIONS = {
  // ============================================================================
  // Drawer State Keys -> openscad-drawer-{name}-state
  // ============================================================================
  'openscad-customizer-param-panel-collapsed':
    'openscad-drawer-parameters-state',
  'openscad-customizer-camera-panel-collapsed': 'openscad-drawer-camera-state',
  'openscad-customizer-camera-drawer-collapsed':
    'openscad-drawer-camera-mobile-state',
  'openscad-customizer-drawer-collapsed':
    'openscad-drawer-preview-settings-state',
  // Note: 'openscad-drawer-actions-state' already follows spec

  // Preview camera controls (not a drawer, but similar collapse pattern)
  'openscad-camera-controls-collapsed':
    'openscad-forge-camera-controls-collapsed',
  'openscad-camera-controls-position':
    'openscad-forge-camera-controls-position',

  // ============================================================================
  // Drawer Size Keys -> openscad-drawer-{name}-width/height
  // ============================================================================
  'openscad-customizer-split-sizes': 'openscad-drawer-layout-sizes',

  // ============================================================================
  // App Preferences -> openscad-forge-{feature}
  // ============================================================================

  // Theme
  'openscad-customizer-theme': 'openscad-forge-theme',
  'openscad-customizer-high-contrast': 'openscad-forge-high-contrast',

  // Preview settings
  'openscad-customizer-measurements': 'openscad-forge-measurements',
  'openscad-customizer-grid': 'openscad-forge-grid',
  'openscad-customizer-auto-bed': 'openscad-forge-auto-bed',
  'openscad-customizer-auto-rotate': 'openscad-forge-auto-rotate',
  'openscad-customizer-rotate-speed': 'openscad-forge-rotate-speed',
  'openscad-customizer-model-color': 'openscad-forge-model-color',
  'openscad-customizer-status-bar': 'openscad-forge-status-bar',

  // Overlay settings (already mostly correct, just normalize)
  'openscad-overlay-enabled': 'openscad-forge-overlay-enabled',
  'openscad-overlay-opacity': 'openscad-forge-overlay-opacity',
  'openscad-overlay-source': 'openscad-forge-overlay-source',

  // Libraries
  'openscad-customizer-libraries': 'openscad-forge-libraries',

  // Performance/debug
  'openscad-perf-metrics': 'openscad-forge-perf-metrics',
  'openscad-metrics-log': 'openscad-forge-metrics-log',
  'openscad-lazy-union': 'openscad-forge-lazy-union',

  // State/draft
  'openscad-customizer-draft': 'openscad-forge-editor-draft',

  // Hidden feature mode (keep as-is since it's intentionally obscure)
  // 'openscad-customizer-hfm-unlock': 'openscad-customizer-hfm-unlock',

  // ============================================================================
  // Bare keys -> openscad-forge-{feature}
  // ============================================================================
  autoPreviewEnabled: 'openscad-forge-auto-preview-enabled',
  previewQualityMode: 'openscad-forge-preview-quality-mode',
  'recovery-source': 'openscad-forge-recovery-source',
  'recovery-timestamp': 'openscad-forge-recovery-timestamp',
  // Note: tutorialProgress is intentionally NOT migrated — the tutorial
  // stores progress in sessionStorage (see tutorial-sandbox.js), not
  // localStorage, so a localStorage migration would never find it.
};

/**
 * Keys that should NOT be migrated (already correct or intentionally different)
 */
export const PRESERVED_KEYS = [
  // Already follows spec
  'openscad-drawer-actions-state',

  // App preferences already using openscad-forge-*
  'openscad-forge-keyboard-shortcuts',
  'openscad-forge-feature-flags',
  'openscad-forge-user-id',
  'openscad-forge-first-visit-seen',
  'openscad-forge-storage-prefs',
  'openscad-forge-persistence-requested',
  'openscad-forge-manifold-engine',
  'openscad-forge-mode-prefs',

  // Presets have their own migration system
  'openscad-forge-presets-v2',
  'openscad-forge-presets-backup',
  'openscad-forge-migration-offered',
  'openscad-customizer-presets',
  'openscad-forge-presets-v1',

  // Grid size user presets (managed by preview.js)
  'openscad-forge-custom-grid-presets',

  // WASM crash-detection flags (set before/after WASM init; cleared on recovery)
  'openscad-forge-wasm-init-started',
  'openscad-forge-wasm-init-completed',

  // Saved projects use IndexedDB primarily
  'openscad-saved-projects',
  'openscad-saved-folders',
];

/**
 * Check if storage key migration has been run
 * @returns {boolean}
 */
export function hasMigrationRun() {
  const version = localStorage.getItem(MIGRATION_KEY);
  return version !== null && parseInt(version, 10) >= MIGRATION_VERSION;
}

/**
 * Run one-time localStorage key migration
 * Safely migrates legacy keys to new naming convention.
 * Old keys are removed only after successful copy.
 *
 * @param {Object} [options] - Migration options
 * @param {boolean} [options.dryRun=false] - If true, log changes but don't apply
 * @param {Function} [options.onMigrate] - Callback for each migrated key
 * @returns {Object} Migration results { migrated: string[], skipped: string[], errors: string[] }
 */
export function migrateStorageKeys(options = {}) {
  const { dryRun = false, onMigrate = null } = options;

  const results = {
    migrated: [],
    skipped: [],
    errors: [],
  };

  // Skip if already migrated
  if (!dryRun && hasMigrationRun()) {
    console.log('[StorageKeys] Migration already complete, skipping');
    return results;
  }

  console.log(
    `[StorageKeys] Running migration (v${MIGRATION_VERSION})${dryRun ? ' [DRY RUN]' : ''}`
  );

  for (const [oldKey, newKey] of Object.entries(KEY_MIGRATIONS)) {
    try {
      const oldValue = localStorage.getItem(oldKey);

      if (oldValue === null) {
        // Key doesn't exist, skip
        results.skipped.push(oldKey);
        continue;
      }

      // Check if new key already exists (don't overwrite)
      const newValue = localStorage.getItem(newKey);
      if (newValue !== null) {
        console.log(
          `[StorageKeys] Skipping ${oldKey} -> ${newKey} (new key already exists)`
        );
        results.skipped.push(oldKey);
        continue;
      }

      if (!dryRun) {
        // Copy value to new key
        localStorage.setItem(newKey, oldValue);

        // Verify copy succeeded
        if (localStorage.getItem(newKey) === oldValue) {
          // Remove old key only after successful copy
          localStorage.removeItem(oldKey);
          results.migrated.push(oldKey);

          if (onMigrate) {
            onMigrate(oldKey, newKey, oldValue);
          }
        } else {
          throw new Error('Copy verification failed');
        }
      } else {
        console.log(`[StorageKeys] Would migrate: ${oldKey} -> ${newKey}`);
        results.migrated.push(oldKey);
      }
    } catch (error) {
      console.error(`[StorageKeys] Error migrating ${oldKey}:`, error);
      results.errors.push(`${oldKey}: ${error.message}`);
    }
  }

  // Mark migration as complete
  if (!dryRun && results.errors.length === 0) {
    localStorage.setItem(MIGRATION_KEY, String(MIGRATION_VERSION));
    console.log(
      `[StorageKeys] Migration complete: ${results.migrated.length} keys migrated, ${results.skipped.length} skipped`
    );
  }

  return results;
}

/**
 * Get the standardized key name for a storage key
 * Returns the new key if a migration exists, otherwise returns the original
 *
 * @param {string} key - The legacy or new key name
 * @returns {string} The standardized key name
 */
export function getStandardKey(key) {
  return KEY_MIGRATIONS[key] || key;
}

/**
 * Helper to generate drawer state key
 * @param {string} drawerName - Name of the drawer (e.g., 'parameters', 'camera')
 * @returns {string} Standardized drawer state key
 */
export function getDrawerStateKey(drawerName) {
  return `openscad-drawer-${drawerName}-state`;
}

/**
 * Helper to generate drawer size key
 * @param {string} drawerName - Name of the drawer
 * @param {'width'|'height'} dimension - Size dimension
 * @returns {string} Standardized drawer size key
 */
export function getDrawerSizeKey(drawerName, dimension) {
  return `openscad-drawer-${drawerName}-${dimension}`;
}

/**
 * Helper to generate app preference key
 * @param {string} feature - Feature name (e.g., 'theme', 'auto-preview')
 * @returns {string} Standardized app preference key
 */
export function getAppPrefKey(feature) {
  return `openscad-forge-${feature}`;
}

// ============================================================================
// Centralized STORAGE_KEY_* constants (audit Q4)
// ============================================================================
// Key strings must NEVER change — renaming a key orphans users' saved data.
// tests/unit/storage-keys.test.js snapshots every exported key value to
// guard against accidental renames.
// ============================================================================

// --- App preferences (main.js) ---
export const STORAGE_KEY_AUTO_PREVIEW_ENABLED = getAppPrefKey(
  'auto-preview-enabled'
);
export const STORAGE_KEY_PREVIEW_QUALITY = getAppPrefKey(
  'preview-quality-mode'
);
export const STORAGE_KEY_RECOVERY_SOURCE = getAppPrefKey('recovery-source');
export const STORAGE_KEY_RECOVERY_TIMESTAMP =
  getAppPrefKey('recovery-timestamp');
export const STORAGE_KEY_STATUS_BAR = getAppPrefKey('status-bar');
export const STORAGE_KEY_MODEL_COLOR = getAppPrefKey('model-color');
export const STORAGE_KEY_MODEL_COLOR_ENABLED = getAppPrefKey(
  'model-color-enabled'
);
export const STORAGE_KEY_MODEL_OPACITY = getAppPrefKey('model-opacity');
export const STORAGE_KEY_BRIGHTNESS = getAppPrefKey('brightness');
export const STORAGE_KEY_CONTRAST = getAppPrefKey('contrast');
export const STORAGE_KEY_MODEL_APPEARANCE_ENABLED = getAppPrefKey(
  'model-appearance-enabled'
);
export const STORAGE_KEY_PARAM_PANEL_COLLAPSED =
  getDrawerStateKey('parameters');
export const STORAGE_KEY_LAYOUT_SIZES = getAppPrefKey('layout-sizes');

// --- Preview settings (preview.js) ---
export const STORAGE_KEY_MEASUREMENTS = getAppPrefKey('measurements');
export const STORAGE_KEY_GRID = getAppPrefKey('grid');
export const STORAGE_KEY_GRID_SIZE = getAppPrefKey('grid-size');
export const STORAGE_KEY_CUSTOM_GRID_PRESETS = getAppPrefKey(
  'custom-grid-presets'
);
export const STORAGE_KEY_GRID_COLOR = getAppPrefKey('grid-color');
export const STORAGE_KEY_GRID_OPACITY = getAppPrefKey('grid-opacity');
export const STORAGE_KEY_AUTO_BED = getAppPrefKey('auto-bed');
export const STORAGE_KEY_ZOOM_TO_CURSOR = getAppPrefKey('zoom-to-cursor');
export const STORAGE_KEY_VIEWPORT_SCHEME = getAppPrefKey('viewport-scheme');

// --- Code editor settings (editor-prefs.js, Preferences ▸ Editor) ---
// The font-size key predates the dialog: edit-actions-controller has always
// used it for Edit ▸ Increase/Decrease Font Size. Both import it from here
// so the menu and the dialog cannot drift onto separate values.
export const STORAGE_KEY_EDITOR_FONT_SIZE = getAppPrefKey('editor-font-size');
export const STORAGE_KEY_EDITOR_INDENT_WIDTH = getAppPrefKey(
  'editor-indent-width'
);
export const STORAGE_KEY_EDITOR_TAB_WIDTH = getAppPrefKey('editor-tab-width');
export const STORAGE_KEY_EDITOR_LINE_WRAP = getAppPrefKey('editor-line-wrap');
export const STORAGE_KEY_EDITOR_HIGHLIGHT_LINE = getAppPrefKey(
  'editor-highlight-line'
);
export const STORAGE_KEY_CAMERA_COLLAPSED = getAppPrefKey(
  'camera-controls-collapsed'
);
export const STORAGE_KEY_CAMERA_POSITION = getAppPrefKey(
  'camera-controls-position'
);
export const STORAGE_KEY_LOD_WARNING_DISMISSED = getAppPrefKey(
  'lod-warning-dismissed'
);

// --- Render metrics and engine toggles (render/auto-preview controllers) ---
export const STORAGE_KEY_PERF_METRICS = getAppPrefKey('perf-metrics');
export const STORAGE_KEY_METRICS_LOG = getAppPrefKey('metrics-log');
export const STORAGE_KEY_LAZY_UNION = getAppPrefKey('lazy-union');
export const STORAGE_KEY_MANIFOLD_ENGINE = getAppPrefKey('manifold-engine');

// --- UI mode (ui-mode-controller.js) ---
// The controller has always persisted under this name; centralized here so
// ui-scoped-prefs.js can resolve the active interface without importing the
// controller. The string itself is unchanged.
export const STORAGE_KEY_UI_MODE = 'openscad-forge-ui-mode';

// --- UI-scoped preference split marker (ui-scoped-prefs.js, UF-14) ---
// Gates the one-time Q-40b seeding of the per-interface namespaces.
export const STORAGE_KEY_SCOPED_PREFS_SEEDED = getAppPrefKey(
  'scoped-prefs-seeded-v1'
);

// --- Preset dropdown sort order ---
export const PRESET_SORT_KEY = 'openscad-forge-preset-sort';

// --- WASM crash-detection flags (set before/after init; cleared on recovery) ---
export const STORAGE_KEY_WASM_INIT_STARTED = 'openscad-forge-wasm-init-started';
export const STORAGE_KEY_WASM_INIT_COMPLETED =
  'openscad-forge-wasm-init-completed';

// ============================================================================
// Safe localStorage access (audit Q3)
// ============================================================================
// localStorage throws in several legitimate situations (private browsing,
// storage quota exceeded, third-party-cookie lockdown). These wrappers give
// call sites one consistent, non-throwing behavior with an audit trail via
// console.warn instead of dozens of ad-hoc try/catch blocks.
// ============================================================================

/**
 * Read a localStorage value without throwing.
 *
 * @param {string} key - Storage key
 * @param {string|null} [fallback=null] - Returned when the key is absent or
 *   storage is unavailable
 * @param {Object} [options]
 * @param {boolean} [options.silent=false] - Suppress the console.warn (for
 *   hot paths where a warn per read would be noisy)
 * @returns {string|null}
 */
export function safeGetItem(key, fallback = null, { silent = false } = {}) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch (error) {
    if (!silent) {
      console.warn(`[Storage] Failed to read ${key}:`, error);
    }
    return fallback;
  }
}

/**
 * Write a localStorage value without throwing.
 *
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 * @param {Object} [options]
 * @param {boolean} [options.silent=false] - Suppress the console.warn
 * @returns {boolean} True when the write succeeded
 */
export function safeSetItem(key, value, { silent = false } = {}) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (!silent) {
      console.warn(`[Storage] Failed to write ${key}:`, error);
    }
    return false;
  }
}

/**
 * Remove a localStorage key without throwing.
 *
 * @param {string} key - Storage key
 * @param {Object} [options]
 * @param {boolean} [options.silent=false] - Suppress the console.warn
 * @returns {boolean} True when the removal succeeded
 */
export function safeRemoveItem(key, { silent = false } = {}) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    if (!silent) {
      console.warn(`[Storage] Failed to remove ${key}:`, error);
    }
    return false;
  }
}

// ============================================================================
// Developer debug toggles (KI-012)
// ============================================================================

/**
 * Developer debug-toggle keys. Presence-based: storing ANY value under a
 * key activates the toggle; removing the key deactivates it. The key
 * strings are documented in docs/KNOWN_ISSUES.md (KI-012) and must not
 * change.
 */
export const DEBUG_PREFS = Object.freeze({
  previewParity: 'openscad-forge-debug-preview-parity',
  desktopQuality: 'openscad-forge-debug-desktop-quality',
  noCsgColors: 'openscad-forge-debug-no-csg-colors',
  sourceOverrides: 'openscad-forge-debug-source-overrides',
});

/**
 * Whether a developer debug toggle is active (KI-012).
 *
 * @param {'previewParity'|'desktopQuality'|'noCsgColors'|'sourceOverrides'} name
 * @returns {boolean} True when any value is stored under the toggle's key
 */
export function isDebugPrefEnabled(name) {
  const key = DEBUG_PREFS[name];
  if (!key) return false;
  return (
    typeof localStorage !== 'undefined' && localStorage.getItem(key) !== null
  );
}

// ============================================================================
// HFM (Alt View) persistent settings
// ============================================================================

/**
 * localStorage key for the user's saved HFM contrast (edge) scale.
 * Value is a decimal string matching the _HFM_CONTRAST_RANGE in main.js.
 */
export const STORAGE_KEY_HFM_CONTRAST_SCALE =
  'openscad-forge-hfm-contrast-scale';

/**
 * localStorage key for the user's saved HFM font scale.
 * Value is a decimal string matching the _HFM_FONT_SCALE_RANGE in main.js.
 */
export const STORAGE_KEY_HFM_FONT_SCALE = 'openscad-forge-hfm-font-scale';

/**
 * localStorage key for the user's saved HFM persist-fade (afterglow intensity).
 * Value is a decimal string in [0, 1] matching _HFM_PERSIST_FADE_RANGE in main.js.
 */
export const STORAGE_KEY_HFM_PERSIST_FADE = 'openscad-forge-hfm-persist-fade';
