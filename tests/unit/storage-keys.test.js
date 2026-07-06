/**
 * Storage Keys Unit Tests
 *
 * Snapshot-guards every exported STORAGE_KEY_* constant. These strings are
 * user-data contracts: renaming a key orphans whatever users have saved
 * under the old name. If a change here is intentional, it needs a
 * corresponding entry in KEY_MIGRATIONS — never a silent rename.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import * as storageKeys from '../../src/js/storage-keys.js';

/**
 * Frozen snapshot of every exported key constant.
 * DO NOT update casually — see file header.
 */
const EXPECTED_KEYS = {
  // App preferences (main.js)
  STORAGE_KEY_AUTO_PREVIEW_ENABLED: 'openscad-forge-auto-preview-enabled',
  STORAGE_KEY_PREVIEW_QUALITY: 'openscad-forge-preview-quality-mode',
  STORAGE_KEY_RECOVERY_SOURCE: 'openscad-forge-recovery-source',
  STORAGE_KEY_RECOVERY_TIMESTAMP: 'openscad-forge-recovery-timestamp',
  STORAGE_KEY_STATUS_BAR: 'openscad-forge-status-bar',
  STORAGE_KEY_MODEL_COLOR: 'openscad-forge-model-color',
  STORAGE_KEY_MODEL_COLOR_ENABLED: 'openscad-forge-model-color-enabled',
  STORAGE_KEY_MODEL_OPACITY: 'openscad-forge-model-opacity',
  STORAGE_KEY_BRIGHTNESS: 'openscad-forge-brightness',
  STORAGE_KEY_CONTRAST: 'openscad-forge-contrast',
  STORAGE_KEY_MODEL_APPEARANCE_ENABLED:
    'openscad-forge-model-appearance-enabled',
  STORAGE_KEY_PARAM_PANEL_COLLAPSED: 'openscad-drawer-parameters-state',
  STORAGE_KEY_LAYOUT_SIZES: 'openscad-forge-layout-sizes',

  // Preview settings (preview.js)
  STORAGE_KEY_MEASUREMENTS: 'openscad-forge-measurements',
  STORAGE_KEY_GRID: 'openscad-forge-grid',
  STORAGE_KEY_GRID_SIZE: 'openscad-forge-grid-size',
  STORAGE_KEY_CUSTOM_GRID_PRESETS: 'openscad-forge-custom-grid-presets',
  STORAGE_KEY_GRID_COLOR: 'openscad-forge-grid-color',
  STORAGE_KEY_GRID_OPACITY: 'openscad-forge-grid-opacity',
  STORAGE_KEY_AUTO_BED: 'openscad-forge-auto-bed',
  STORAGE_KEY_CAMERA_COLLAPSED: 'openscad-forge-camera-controls-collapsed',
  STORAGE_KEY_CAMERA_POSITION: 'openscad-forge-camera-controls-position',
  STORAGE_KEY_LOD_WARNING_DISMISSED: 'openscad-forge-lod-warning-dismissed',

  // Render metrics and engine toggles
  STORAGE_KEY_PERF_METRICS: 'openscad-forge-perf-metrics',
  STORAGE_KEY_METRICS_LOG: 'openscad-forge-metrics-log',
  STORAGE_KEY_LAZY_UNION: 'openscad-forge-lazy-union',
  STORAGE_KEY_MANIFOLD_ENGINE: 'openscad-forge-manifold-engine',

  // Preset dropdown sort order
  PRESET_SORT_KEY: 'openscad-forge-preset-sort',

  // WASM crash-detection flags
  STORAGE_KEY_WASM_INIT_STARTED: 'openscad-forge-wasm-init-started',
  STORAGE_KEY_WASM_INIT_COMPLETED: 'openscad-forge-wasm-init-completed',

  // HFM (Alt View) persistent settings
  STORAGE_KEY_HFM_CONTRAST_SCALE: 'openscad-forge-hfm-contrast-scale',
  STORAGE_KEY_HFM_FONT_SCALE: 'openscad-forge-hfm-font-scale',
  STORAGE_KEY_HFM_PERSIST_FADE: 'openscad-forge-hfm-persist-fade',
};

describe('storage-keys exported constants', () => {
  it('every key constant matches the frozen snapshot exactly', () => {
    for (const [name, expected] of Object.entries(EXPECTED_KEYS)) {
      expect(storageKeys[name], `export ${name}`).toBe(expected);
    }
  });

  it('no key constant was added without extending the snapshot', () => {
    const exportedKeyNames = Object.keys(storageKeys).filter(
      (name) => name.startsWith('STORAGE_KEY_') || name.endsWith('_SORT_KEY')
    );
    expect(exportedKeyNames.sort()).toEqual(Object.keys(EXPECTED_KEYS).sort());
  });

  it('all keys are unique (no two constants share a string)', () => {
    const values = Object.values(EXPECTED_KEYS);
    expect(new Set(values).size).toBe(values.length);
  });

  it('DEBUG_PREFS keys match the KI-012 documented strings exactly', () => {
    expect(storageKeys.DEBUG_PREFS).toEqual({
      previewParity: 'openscad-forge-debug-preview-parity',
      desktopQuality: 'openscad-forge-debug-desktop-quality',
      noCsgColors: 'openscad-forge-debug-no-csg-colors',
      sourceOverrides: 'openscad-forge-debug-source-overrides',
    });
  });
});

describe('isDebugPrefEnabled', () => {
  it('is presence-based: any stored value activates the toggle', () => {
    localStorage.removeItem(storageKeys.DEBUG_PREFS.desktopQuality);
    expect(storageKeys.isDebugPrefEnabled('desktopQuality')).toBe(false);

    localStorage.setItem(storageKeys.DEBUG_PREFS.desktopQuality, '1');
    expect(storageKeys.isDebugPrefEnabled('desktopQuality')).toBe(true);

    // Non-'1' values count too — presence is what matters
    localStorage.setItem(storageKeys.DEBUG_PREFS.desktopQuality, 'false');
    expect(storageKeys.isDebugPrefEnabled('desktopQuality')).toBe(true);

    localStorage.removeItem(storageKeys.DEBUG_PREFS.desktopQuality);
    expect(storageKeys.isDebugPrefEnabled('desktopQuality')).toBe(false);
  });

  it('returns false for unknown toggle names', () => {
    expect(storageKeys.isDebugPrefEnabled('nonsense')).toBe(false);
  });
});

describe('storage-keys helpers', () => {
  it('getAppPrefKey generates openscad-forge-* keys', () => {
    expect(storageKeys.getAppPrefKey('theme')).toBe('openscad-forge-theme');
  });

  it('getDrawerStateKey generates openscad-drawer-*-state keys', () => {
    expect(storageKeys.getDrawerStateKey('camera')).toBe(
      'openscad-drawer-camera-state'
    );
  });

  it('getDrawerSizeKey generates openscad-drawer-*-width/height keys', () => {
    expect(storageKeys.getDrawerSizeKey('parameters', 'width')).toBe(
      'openscad-drawer-parameters-width'
    );
  });
});
