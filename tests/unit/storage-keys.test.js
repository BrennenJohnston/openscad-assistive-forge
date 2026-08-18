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

import { describe, it, expect, afterEach, vi } from 'vitest';
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
  STORAGE_KEY_ZOOM_TO_CURSOR: 'openscad-forge-zoom-to-cursor',
  STORAGE_KEY_VIEWPORT_SCHEME: 'openscad-forge-viewport-scheme',
  STORAGE_KEY_EDITOR_FONT_SIZE: 'openscad-forge-editor-font-size',
  STORAGE_KEY_EDITOR_INDENT_WIDTH: 'openscad-forge-editor-indent-width',
  STORAGE_KEY_EDITOR_TAB_WIDTH: 'openscad-forge-editor-tab-width',
  STORAGE_KEY_EDITOR_LINE_WRAP: 'openscad-forge-editor-line-wrap',
  STORAGE_KEY_EDITOR_HIGHLIGHT_LINE: 'openscad-forge-editor-highlight-line',
  // Two keys, not one: the desktop keeps the hanging indent and the
  // wrap-return marker as separate settings and Q-58 chose to mirror that.
  STORAGE_KEY_EDITOR_WRAP_INDENT: 'openscad-forge-editor-wrap-indent',
  STORAGE_KEY_EDITOR_WRAP_ARROW: 'openscad-forge-editor-wrap-arrow',
  STORAGE_KEY_EDITOR_BRACE_MATCHING: 'openscad-forge-editor-brace-matching',
  STORAGE_KEY_CAMERA_COLLAPSED: 'openscad-forge-camera-controls-collapsed',
  STORAGE_KEY_CAMERA_POSITION: 'openscad-forge-camera-controls-position',
  STORAGE_KEY_LOD_WARNING_DISMISSED: 'openscad-forge-lod-warning-dismissed',

  // Render metrics and engine toggles
  STORAGE_KEY_PERF_METRICS: 'openscad-forge-perf-metrics',
  STORAGE_KEY_METRICS_LOG: 'openscad-forge-metrics-log',
  STORAGE_KEY_LAZY_UNION: 'openscad-forge-lazy-union',
  STORAGE_KEY_MANIFOLD_ENGINE: 'openscad-forge-manifold-engine',

  // UI mode (ui-mode-controller.js; centralized in UF-14)
  STORAGE_KEY_UI_MODE: 'openscad-forge-ui-mode',

  // UI-scoped preference split marker (ui-scoped-prefs.js, UF-14)
  STORAGE_KEY_SCOPED_PREFS_SEEDED: 'openscad-forge-scoped-prefs-seeded-v1',

  // Persistent tutorial registry (tutorial-sandbox.js, UF-16)
  STORAGE_KEY_TUTORIAL_STATE: 'openscad-forge-tutorial-state',

  // Welcome tour nudge, permanent suppression (tour-nudge.js, UF-22)
  STORAGE_KEY_TOUR_NUDGE_SUPPRESSED: 'openscad-forge-tour-nudge-suppressed',

  // Preset dropdown sort order
  PRESET_SORT_KEY: 'openscad-forge-preset-sort',

  // WASM crash-detection flags
  STORAGE_KEY_WASM_INIT_STARTED: 'openscad-forge-wasm-init-started',
  STORAGE_KEY_WASM_INIT_COMPLETED: 'openscad-forge-wasm-init-completed',

  // HFM (Alt View) persistent settings
  STORAGE_KEY_HFM_CONTRAST_SCALE: 'openscad-forge-hfm-contrast-scale',
  STORAGE_KEY_HFM_FONT_SCALE: 'openscad-forge-hfm-font-scale',
  STORAGE_KEY_HFM_PERSIST_FADE: 'openscad-forge-hfm-persist-fade',

  // City Walk game (CW-Q8): persistent walking-speed multiplier
  STORAGE_KEY_CITY_WALK_SPEED: 'openscad-forge-city-walk-speed',
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

describe('safeGetItem / safeSetItem / safeRemoveItem', () => {
  // localStorage methods are the vi.fn-based mocks from tests/setup.js;
  // mockImplementationOnce lets a single call throw and then reverts to
  // the working implementation automatically.
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('safe-test-key');
  });

  it('reads stored values and applies the fallback for missing keys', () => {
    localStorage.setItem('safe-test-key', 'value');
    expect(storageKeys.safeGetItem('safe-test-key')).toBe('value');
    expect(storageKeys.safeGetItem('missing-key', 'fallback')).toBe('fallback');
    expect(storageKeys.safeGetItem('missing-key')).toBeNull();
  });

  it('returns the fallback and warns when getItem throws (SecurityError)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.getItem.mockImplementationOnce(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    expect(storageKeys.safeGetItem('any-key', 'fb')).toBe('fb');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('any-key'),
      expect.any(DOMException)
    );
  });

  it('returns false and warns when setItem throws (QuotaExceededError)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem.mockImplementationOnce(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    expect(storageKeys.safeSetItem('any-key', 'v')).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('suppresses the warning when silent is set', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.getItem.mockImplementationOnce(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    expect(storageKeys.safeGetItem('k', null, { silent: true })).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('safeRemoveItem returns true on success and false on failure', () => {
    expect(storageKeys.safeRemoveItem('safe-test-key')).toBe(true);

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.removeItem.mockImplementationOnce(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(storageKeys.safeRemoveItem('safe-test-key')).toBe(false);
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
