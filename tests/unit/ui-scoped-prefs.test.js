/**
 * UI-Scoped Preferences Unit Tests (UF-14, U-25)
 *
 * Proves the facade alone: namespace resolution at call time, the derived
 * scoped-key names (snapshot-pinned — a renamed scoped key orphans saved
 * data exactly like a renamed base key), the Q-40b seeding matrix, and the
 * desktop-default trio's per-namespace fallbacks.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  UI_NAMESPACES,
  SCOPED_PREF_BASE_KEYS,
  getActiveUiNamespace,
  getScopedKey,
  ensureScopedPrefsSeeded,
  readScopedPref,
  writeScopedPref,
  removeScopedPref,
} from '../../src/js/ui-scoped-prefs.js';
import {
  STORAGE_KEY_UI_MODE,
  STORAGE_KEY_SCOPED_PREFS_SEEDED,
  STORAGE_KEY_GRID,
  STORAGE_KEY_GRID_SIZE,
  STORAGE_KEY_MODEL_COLOR,
  STORAGE_KEY_VIEWPORT_SCHEME,
  getAppPrefKey,
} from '../../src/js/storage-keys.js';

const AXES_KEY = getAppPrefKey('display-axes');
const AXIS_MARKS_KEY = getAppPrefKey('display-axisMarks');
const EDGES_KEY = getAppPrefKey('display-edges');

/**
 * Frozen snapshot of every base key the signed Q-40 table marks PER-UI.
 * DO NOT update casually — each row is an owner-signed contract, and each
 * derived `--forge` / `--classic` key is a user-data contract.
 */
const EXPECTED_BASE_KEYS = [
  'openscad-forge-grid',
  'openscad-forge-grid-size',
  'openscad-forge-grid-color',
  'openscad-forge-grid-opacity',
  'openscad-forge-display-axes',
  'openscad-forge-display-axisMarks',
  'openscad-forge-display-edges',
  'openscad-forge-display-edgeBudget',
  'openscad-forge-display-crosshairs',
  'openscad-forge-display-wireframe',
  'openscad-forge-measurements',
  'openscad-forge-viewport-scheme',
  'openscad-forge-status-bar',
  'openscad-forge-auto-rotate',
  'openscad-forge-rotate-speed',
  'openscad-forge-auto-bed',
  'openscad-forge-zoom-to-cursor',
  'openscad-forge-model-color',
  'openscad-forge-model-color-enabled',
  'openscad-forge-model-opacity',
  'openscad-forge-brightness',
  'openscad-forge-contrast',
  'openscad-forge-model-appearance-enabled',
];

beforeEach(() => {
  localStorage.clear();
  delete document.body.dataset.uiMode;
});

describe('scoped key names (snapshot)', () => {
  it('the PER-UI base key list matches the signed Q-40 table exactly', () => {
    expect([...SCOPED_PREF_BASE_KEYS]).toEqual(EXPECTED_BASE_KEYS);
  });

  it('every derived scoped key is base plus a double-dash namespace suffix', () => {
    for (const base of SCOPED_PREF_BASE_KEYS) {
      expect(getScopedKey(base, 'forge')).toBe(`${base}--forge`);
      expect(getScopedKey(base, 'classic')).toBe(`${base}--classic`);
    }
  });

  it('no derived scoped key collides with a base key', () => {
    const derived = SCOPED_PREF_BASE_KEYS.flatMap((base) =>
      UI_NAMESPACES.map((ns) => getScopedKey(base, ns))
    );
    for (const key of derived) {
      expect(EXPECTED_BASE_KEYS).not.toContain(key);
    }
    expect(new Set(derived).size).toBe(derived.length);
  });
});

describe('getActiveUiNamespace', () => {
  it('resolves classic from body[data-ui-mode]', () => {
    document.body.dataset.uiMode = 'classic';
    expect(getActiveUiNamespace()).toBe('classic');
  });

  it('resolves forge for both custom densities', () => {
    document.body.dataset.uiMode = 'simplified';
    expect(getActiveUiNamespace()).toBe('forge');
    document.body.dataset.uiMode = 'standard';
    expect(getActiveUiNamespace()).toBe('forge');
  });

  it('falls back to the persisted ui-mode before the body is stamped', () => {
    localStorage.setItem(
      STORAGE_KEY_UI_MODE,
      JSON.stringify({ mode: 'classic' })
    );
    expect(getActiveUiNamespace()).toBe('classic');
  });

  it('defaults to forge with no body stamp and no (or unparseable) stored mode', () => {
    expect(getActiveUiNamespace()).toBe('forge');
    localStorage.setItem(STORAGE_KEY_UI_MODE, 'not json');
    expect(getActiveUiNamespace()).toBe('forge');
  });
});

describe('ensureScopedPrefsSeeded (the Q-40b matrix)', () => {
  it('copies current merged values into forge, and into classic except the desktop trio', () => {
    localStorage.setItem(STORAGE_KEY_GRID, 'true');
    localStorage.setItem(AXES_KEY, 'false');
    localStorage.setItem(AXIS_MARKS_KEY, 'false');
    localStorage.setItem(
      STORAGE_KEY_GRID_SIZE,
      '{"widthMm":250,"heightMm":210}'
    );
    localStorage.setItem(STORAGE_KEY_VIEWPORT_SCHEME, 'nature');
    localStorage.setItem(STORAGE_KEY_MODEL_COLOR, '#aabbcc');

    expect(ensureScopedPrefsSeeded()).toBe(true);

    // Forge = the user's current reality, every row
    expect(localStorage.getItem(`${STORAGE_KEY_GRID}--forge`)).toBe('true');
    expect(localStorage.getItem(`${AXES_KEY}--forge`)).toBe('false');
    expect(localStorage.getItem(`${STORAGE_KEY_GRID_SIZE}--forge`)).toBe(
      '{"widthMm":250,"heightMm":210}'
    );
    expect(localStorage.getItem(`${STORAGE_KEY_VIEWPORT_SCHEME}--forge`)).toBe(
      'nature'
    );
    expect(localStorage.getItem(`${STORAGE_KEY_MODEL_COLOR}--forge`)).toBe(
      '#aabbcc'
    );

    // Classic copies the neutral rows...
    expect(localStorage.getItem(`${STORAGE_KEY_GRID_SIZE}--classic`)).toBe(
      '{"widthMm":250,"heightMm":210}'
    );
    expect(
      localStorage.getItem(`${STORAGE_KEY_VIEWPORT_SCHEME}--classic`)
    ).toBe('nature');
    // ...but NOT the desktop-default trio
    expect(localStorage.getItem(`${STORAGE_KEY_GRID}--classic`)).toBeNull();
    expect(localStorage.getItem(`${AXES_KEY}--classic`)).toBeNull();
    expect(localStorage.getItem(`${AXIS_MARKS_KEY}--classic`)).toBeNull();

    expect(localStorage.getItem(STORAGE_KEY_SCOPED_PREFS_SEEDED)).toBe('true');
  });

  it('writes nothing for absent base keys (fresh profile) but still sets the marker', () => {
    expect(ensureScopedPrefsSeeded()).toBe(true);
    for (const base of SCOPED_PREF_BASE_KEYS) {
      expect(localStorage.getItem(`${base}--forge`)).toBeNull();
      expect(localStorage.getItem(`${base}--classic`)).toBeNull();
    }
    expect(localStorage.getItem(STORAGE_KEY_SCOPED_PREFS_SEEDED)).toBe('true');
  });

  it('runs once: later base-key changes are never re-copied', () => {
    localStorage.setItem(STORAGE_KEY_GRID, 'true');
    ensureScopedPrefsSeeded();
    localStorage.setItem(STORAGE_KEY_GRID, 'false');
    expect(ensureScopedPrefsSeeded()).toBe(false);
    expect(localStorage.getItem(`${STORAGE_KEY_GRID}--forge`)).toBe('true');
  });

  it('never clobbers an existing scoped value (resumable half-seed)', () => {
    localStorage.setItem(STORAGE_KEY_MODEL_COLOR, '#111111');
    localStorage.setItem(`${STORAGE_KEY_MODEL_COLOR}--forge`, '#222222');
    ensureScopedPrefsSeeded();
    expect(localStorage.getItem(`${STORAGE_KEY_MODEL_COLOR}--forge`)).toBe(
      '#222222'
    );
    expect(localStorage.getItem(`${STORAGE_KEY_MODEL_COLOR}--classic`)).toBe(
      '#111111'
    );
  });
});

describe('readScopedPref / writeScopedPref', () => {
  it('reads the active namespace at call time', () => {
    localStorage.setItem(STORAGE_KEY_SCOPED_PREFS_SEEDED, 'true');
    localStorage.setItem(`${EDGES_KEY}--forge`, 'true');
    localStorage.setItem(`${EDGES_KEY}--classic`, 'false');

    document.body.dataset.uiMode = 'standard';
    expect(readScopedPref(EDGES_KEY)).toBe('true');
    document.body.dataset.uiMode = 'classic';
    expect(readScopedPref(EDGES_KEY)).toBe('false');
  });

  it('the desktop trio falls back per namespace when unset', () => {
    localStorage.setItem(STORAGE_KEY_SCOPED_PREFS_SEEDED, 'true');

    document.body.dataset.uiMode = 'classic';
    expect(readScopedPref(STORAGE_KEY_GRID)).toBe('false');
    expect(readScopedPref(AXES_KEY)).toBe('true');
    expect(readScopedPref(AXIS_MARKS_KEY)).toBe('true');

    // Forge stays null — each caller's existing single default applies
    document.body.dataset.uiMode = 'standard';
    expect(readScopedPref(STORAGE_KEY_GRID)).toBeNull();
    expect(readScopedPref(AXES_KEY)).toBeNull();
    expect(readScopedPref(AXIS_MARKS_KEY)).toBeNull();
  });

  it('neutral rows read null when unset in both namespaces', () => {
    localStorage.setItem(STORAGE_KEY_SCOPED_PREFS_SEEDED, 'true');
    for (const ns of UI_NAMESPACES) {
      expect(readScopedPref(EDGES_KEY, { ns })).toBeNull();
      expect(readScopedPref(STORAGE_KEY_GRID_SIZE, { ns })).toBeNull();
    }
  });

  it('writes touch only the active namespace and never the base key', () => {
    localStorage.setItem(STORAGE_KEY_SCOPED_PREFS_SEEDED, 'true');
    localStorage.setItem(STORAGE_KEY_GRID, 'true');

    document.body.dataset.uiMode = 'classic';
    expect(writeScopedPref(STORAGE_KEY_GRID, 'true')).toBe(true);

    expect(localStorage.getItem(`${STORAGE_KEY_GRID}--classic`)).toBe('true');
    expect(localStorage.getItem(`${STORAGE_KEY_GRID}--forge`)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY_GRID)).toBe('true');

    document.body.dataset.uiMode = 'standard';
    expect(writeScopedPref(STORAGE_KEY_GRID, 'false')).toBe(true);
    expect(localStorage.getItem(`${STORAGE_KEY_GRID}--forge`)).toBe('false');
    expect(localStorage.getItem(`${STORAGE_KEY_GRID}--classic`)).toBe('true');
  });

  it('removeScopedPref resets only the active namespace (reset-to-default)', () => {
    localStorage.setItem(STORAGE_KEY_SCOPED_PREFS_SEEDED, 'true');
    localStorage.setItem(`${STORAGE_KEY_MODEL_COLOR}--forge`, '#111111');
    localStorage.setItem(`${STORAGE_KEY_MODEL_COLOR}--classic`, '#222222');
    localStorage.setItem(STORAGE_KEY_MODEL_COLOR, '#333333');

    document.body.dataset.uiMode = 'classic';
    expect(removeScopedPref(STORAGE_KEY_MODEL_COLOR)).toBe(true);

    expect(
      localStorage.getItem(`${STORAGE_KEY_MODEL_COLOR}--classic`)
    ).toBeNull();
    expect(localStorage.getItem(`${STORAGE_KEY_MODEL_COLOR}--forge`)).toBe(
      '#111111'
    );
    expect(localStorage.getItem(STORAGE_KEY_MODEL_COLOR)).toBe('#333333');
  });

  it('a read before the boot seed call still seeds first (defensive ordering)', () => {
    localStorage.setItem(STORAGE_KEY_GRID, 'true');
    document.body.dataset.uiMode = 'standard';
    expect(readScopedPref(STORAGE_KEY_GRID)).toBe('true');
    expect(localStorage.getItem(STORAGE_KEY_SCOPED_PREFS_SEEDED)).toBe('true');
  });
});
