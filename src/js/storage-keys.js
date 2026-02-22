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
  tutorialProgress: 'openscad-forge-tutorial-progress',
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
