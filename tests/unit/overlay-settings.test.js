/**
 * Per-project reference-overlay settings (DP-5).
 *
 * The thing worth pinning is not that a record round-trips - it is the two
 * ways this could quietly hurt someone: restoring a size against the wrong
 * aspect lock (which re-derives one of their two numbers), and moving the
 * shared px/mm calibration under a person who is measuring something else.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  OVERLAY_SETTINGS_PATH,
  OVERLAY_SETTINGS_VERSION,
  serializeOverlaySettings,
  applyOverlaySettings,
  readOverlaySettings,
  registerOverlaySettingsHost,
  resetOverlaySettingsHost,
  noteOverlayChanged,
  saveOverlaySettingsNow,
} from '../../src/js/overlay-settings.js';

const CONFIG = {
  enabled: true,
  opacity: 0.6,
  offsetX: 12,
  offsetY: -4,
  rotationDeg: 30,
  width: 80,
  height: 40,
  lockAspect: false,
  intrinsicAspect: 2,
  zPreset: 'model-top',
  zCustomMm: 1.5,
  sourceFileName: 'trace.png',
  svgColor: '#ff0000',
};

/** A preview manager that only records what was asked of it. */
function fakePreview() {
  return {
    calls: [],
    setOverlayAspectLock(v) {
      this.calls.push(['aspect', v]);
    },
    setOverlaySize(v) {
      this.calls.push(['size', v]);
    },
    setOverlayTransform(v) {
      this.calls.push(['transform', v]);
    },
    setOverlayZ(v) {
      this.calls.push(['z', v]);
    },
    setOverlayOpacity(v) {
      this.calls.push(['opacity', v]);
    },
  };
}

afterEach(() => {
  resetOverlaySettingsHost();
  vi.useRealTimers();
});

describe('serializeOverlaySettings', () => {
  it('records placement, size, the z preset and the calibration snapshot', () => {
    const r = serializeOverlaySettings(CONFIG, 0.25);
    expect(r.version).toBe(OVERLAY_SETTINGS_VERSION);
    expect(r).toMatchObject({
      offsetX: 12,
      offsetY: -4,
      rotationDeg: 30,
      width: 80,
      height: 40,
      lockAspect: false,
      zPreset: 'model-top',
      zCustomMm: 1.5,
      sourceFileName: 'trace.png',
      calibrationMmPerPx: 0.25,
    });
  });

  it('is JSON-safe, because it goes into a project file', () => {
    const r = serializeOverlaySettings(CONFIG, 0.25);
    expect(() => JSON.parse(JSON.stringify(r))).not.toThrow();
    // No DOM nodes, no textures, no functions rode along.
    for (const v of Object.values(r)) {
      expect(['number', 'string', 'boolean', 'object']).toContain(typeof v);
      if (typeof v === 'object') expect(v).toBeNull();
    }
  });

  it('substitutes sane values for missing numbers rather than writing NaN', () => {
    const r = serializeOverlaySettings({ zPreset: 'build-plate' });
    expect(r.offsetX).toBe(0);
    expect(r.opacity).toBe(1);
    expect(Number.isNaN(r.width)).toBe(false);
    expect(r.calibrationMmPerPx).toBeNull();
  });

  it('returns nothing when there is no config to record', () => {
    expect(serializeOverlaySettings(null)).toBeNull();
  });
});

describe('applyOverlaySettings', () => {
  it('restores the aspect lock BEFORE the size', () => {
    // setOverlaySize recomputes the other dimension from the lock, so doing
    // this in the wrong order re-derives one of the two numbers the person
    // saved and silently loses their placement.
    const pm = fakePreview();
    applyOverlaySettings(pm, serializeOverlaySettings(CONFIG, null));
    const order = pm.calls.map((c) => c[0]);
    expect(order.indexOf('aspect')).toBeLessThan(order.indexOf('size'));
    expect(pm.calls.find((c) => c[0] === 'aspect')[1]).toBe(false);
  });

  it('puts placement, size, z and opacity back', () => {
    const pm = fakePreview();
    applyOverlaySettings(pm, serializeOverlaySettings(CONFIG, null));
    const byName = Object.fromEntries(pm.calls);
    expect(byName.size).toEqual({ width: 80, height: 40 });
    expect(byName.transform).toEqual({
      offsetX: 12,
      offsetY: -4,
      rotationDeg: 30,
    });
    expect(byName.z).toEqual({ preset: 'model-top', customMm: 1.5 });
    expect(byName.opacity).toBe(0.6);
  });

  it('never touches the shared px/mm calibration', () => {
    // unit-sync's scale is shared with Image Measurement. Restoring a project
    // must not move it under someone measuring a different design, so the
    // snapshot is stored for explanation and never played back.
    const pm = fakePreview();
    pm.setScaleFactor = vi.fn();
    applyOverlaySettings(pm, serializeOverlaySettings(CONFIG, 0.25));
    expect(pm.setScaleFactor).not.toHaveBeenCalled();
  });

  it('does NOT switch the overlay image', () => {
    // Choosing the picture is the person's act, and the file named in a saved
    // record may not be in this project at all.
    const pm = fakePreview();
    pm.setOverlaySource = vi.fn();
    applyOverlaySettings(pm, serializeOverlaySettings(CONFIG, null));
    expect(pm.setOverlaySource).not.toHaveBeenCalled();
  });

  it('refuses a record from a version it does not understand', () => {
    const pm = fakePreview();
    const future = { ...serializeOverlaySettings(CONFIG, null), version: 999 };
    expect(applyOverlaySettings(pm, future)).toBe(false);
    expect(pm.calls).toEqual([]);
  });

  it('does nothing, safely, with no settings or no preview', () => {
    expect(applyOverlaySettings(fakePreview(), null)).toBe(false);
    expect(applyOverlaySettings(null, { version: 1 })).toBe(false);
  });
});

describe('readOverlaySettings', () => {
  it('finds the record in a project file list', () => {
    const files = [
      { path: 'svg-uploads/a.svg', textContent: '<svg/>' },
      { path: OVERLAY_SETTINGS_PATH, textContent: '{"version":1,"width":3}' },
    ];
    expect(readOverlaySettings(files).width).toBe(3);
  });

  it('a corrupt record opens the project anyway', () => {
    // Falling back to the app-level preferences is the same behaviour as a
    // project that never had a settings file, which is the ordinary case.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const files = [{ path: OVERLAY_SETTINGS_PATH, textContent: '{not json' }];
    expect(readOverlaySettings(files)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a project with no settings file is left alone', () => {
    expect(readOverlaySettings([{ path: 'other.json', textContent: '{}' }])).toBeNull();
    expect(readOverlaySettings(null)).toBeNull();
  });
});

describe('saving', () => {
  let written;

  beforeEach(() => {
    written = [];
    registerOverlaySettingsHost({
      getProjectId: () => 'proj-1',
      getConfig: () => CONFIG,
      getCalibration: () => 0.25,
      writeFile: async (args) => {
        written.push(args);
      },
    });
  });

  it('writes one additive JSON into the project store', async () => {
    expect(await saveOverlaySettingsNow()).toBe(true);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      projectId: 'proj-1',
      path: OVERLAY_SETTINGS_PATH,
      kind: 'json',
      mimeType: 'application/json',
    });
    expect(JSON.parse(written[0].textContent).zPreset).toBe('model-top');
  });

  it('writes nothing when no project is open', async () => {
    registerOverlaySettingsHost({
      getProjectId: () => null,
      getConfig: () => CONFIG,
      writeFile: async (a) => written.push(a),
    });
    expect(await saveOverlaySettingsNow()).toBe(false);
    expect(written).toHaveLength(0);
  });

  it('debounces, so dragging a slider does not spend the storage budget', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 40; i++) noteOverlayChanged();
    expect(written).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(written).toHaveLength(1);
  });

  it('a failing store does not throw at the caller', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registerOverlaySettingsHost({
      getProjectId: () => 'proj-1',
      getConfig: () => CONFIG,
      writeFile: async () => {
        throw new Error('quota');
      },
    });
    await expect(saveOverlaySettingsNow()).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does nothing at all before a host is registered', async () => {
    resetOverlaySettingsHost();
    noteOverlayChanged();
    expect(await saveOverlaySettingsNow()).toBe(false);
  });
});

describe('the whole round trip', () => {
  it('save, read back, apply - and the numbers survive', async () => {
    let stored = null;
    registerOverlaySettingsHost({
      getProjectId: () => 'p',
      getConfig: () => CONFIG,
      getCalibration: () => 0.5,
      writeFile: async (a) => {
        stored = a;
      },
    });
    await saveOverlaySettingsNow();

    const settings = readOverlaySettings([
      { path: stored.path, textContent: stored.textContent },
    ]);
    const pm = fakePreview();
    expect(applyOverlaySettings(pm, settings)).toBe(true);
    const byName = Object.fromEntries(pm.calls);
    expect(byName.size).toEqual({ width: 80, height: 40 });
    expect(byName.z).toEqual({ preset: 'model-top', customMm: 1.5 });
    expect(byName.transform.rotationDeg).toBe(30);
  });
});
