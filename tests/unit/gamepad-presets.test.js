/**
 * A person's own controller presets: named copies of the app's controller
 * table, kept in the browser and in a file, read back action by action so
 * a table saved by an earlier version still loads.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GAMEPAD_ACTIONS,
  GAMEPAD_PRESETS,
  createGamepadMapping,
} from '../../src/js/gamepad-controller.js';
import {
  PRESETS_FILE_TYPE,
  createGamepadPresetStore,
  readPresetTable,
} from '../../src/js/gamepad-presets.js';

const KEY = 'openscad-forge-gamepad-presets';
const CAMERA = GAMEPAD_PRESETS.camera.assignments;
const XBOX = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)';
const NINTENDO = 'Pro Controller (STANDARD GAMEPAD Vendor: 057e)';

describe('a saved table read back', () => {
  it('keeps every action this version has, each input it knows once', () => {
    const table = readPresetTable({
      activate: 'x',
      back: 'x',
      zoomIn: 'paddle-1',
      aRemovedAction: 'y',
    });
    expect(Object.keys(table)).toEqual(GAMEPAD_ACTIONS.map((a) => a.id));
    expect(table.activate).toBe('x');
    // The second use of an input and an input this version lacks: unassigned.
    expect(table.back).toBeNull();
    expect(table.zoomIn).toBeNull();
    expect(table).not.toHaveProperty('aRemovedAction');
    expect(readPresetTable(null).activate).toBeNull();
  });
});

describe('the store', () => {
  beforeEach(() => localStorage.clear());

  it('saves, lists, finds and removes a preset by name', () => {
    const store = createGamepadPresetStore();
    expect(store.list()).toEqual([]);
    const result = store.save('  Racing  ', { ...CAMERA, activate: 'x', resetView: 'a' });
    expect(result).toEqual({ saved: true, id: 'mine:Racing', replaced: false });
    expect(store.list().map((p) => [p.id, p.name])).toEqual([
      ['mine:Racing', 'Racing'],
    ]);
    expect(store.get('mine:racing').assignments.activate).toBe('x');
    expect(store.remove('mine:Racing')).toBe(true);
    expect(store.list()).toEqual([]);
    expect(store.remove('mine:Racing')).toBe(false);
  });

  it('the same name again replaces it', () => {
    const store = createGamepadPresetStore();
    store.save('Racing', CAMERA);
    const again = store.save('racing', { ...CAMERA, back: 'y', viewAll: 'b' });
    expect(again.replaced).toBe(true);
    expect(store.list()).toHaveLength(1);
    expect(store.get('mine:Racing').assignments.back).toBe('y');
  });

  it('refuses no name, a built-in name and a name too long, and says why', () => {
    const store = createGamepadPresetStore();
    expect(store.save('   ', CAMERA)).toEqual({
      saved: false,
      error: 'Give the preset a name.',
    });
    expect(store.save('camera', CAMERA)).toEqual({
      saved: false,
      error: 'That name belongs to a built-in preset. Choose another.',
    });
    expect(store.save('x'.repeat(61), CAMERA)).toEqual({
      saved: false,
      error: 'A preset name has at most 60 characters.',
    });
    expect(store.list()).toEqual([]);
  });

  it('keeps the presets for the next visit, and tells the listeners', () => {
    const store = createGamepadPresetStore();
    const heard = vi.fn();
    store.subscribe(heard);
    store.save('One', CAMERA);
    store.save('Two', CAMERA);
    expect(heard).toHaveBeenCalledTimes(2);
    expect(JSON.parse(localStorage.getItem(KEY)).version).toBe(1);
    expect(createGamepadPresetStore().list().map((p) => p.name)).toEqual([
      'One',
      'Two',
    ]);
  });

  it('loads a table an earlier version saved: an action added since starts unassigned', () => {
    const older = { ...CAMERA, activate: 'x', resetView: 'a' };
    delete older.nextPreset;
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        presets: [{ name: 'Old', assignments: { ...older, gone: 'rb' } }],
      })
    );
    const { assignments } = createGamepadPresetStore().get('mine:Old');
    expect(assignments.activate).toBe('x');
    expect(assignments.nextPreset).toBeNull();
    expect(assignments).not.toHaveProperty('gone');
  });

  it('a damaged value reads as none and is kept aside, not written over', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(KEY, '{not json');
    const store = createGamepadPresetStore();
    expect(store.list()).toEqual([]);
    expect(warn).toHaveBeenCalled();
    expect(localStorage.getItem(`${KEY}-unreadable`)).toBe('{not json');
    warn.mockRestore();
  });
});

describe('the file', () => {
  beforeEach(() => localStorage.clear());

  it('carries the presets to another browser', () => {
    const here = createGamepadPresetStore();
    here.save('Racing', { ...CAMERA, activate: 'x', resetView: 'a' });
    here.save('Reading', CAMERA);
    const text = here.toFile();
    expect(JSON.parse(text)).toMatchObject({ type: PRESETS_FILE_TYPE, version: 1 });

    localStorage.clear();
    const there = createGamepadPresetStore();
    there.save('Racing', CAMERA);
    there.save('Mine only', CAMERA);
    expect(there.fromFile(text)).toEqual({ count: 2 });
    expect(there.list().map((p) => p.name)).toEqual([
      'Mine only',
      'Racing',
      'Reading',
    ]);
    // The file's preset of the same name replaces the one kept.
    expect(there.get('mine:Racing').assignments.activate).toBe('x');
  });

  it('says what is wrong with a file it cannot take, and changes nothing', () => {
    const store = createGamepadPresetStore();
    store.save('Kept', CAMERA);
    expect(store.fromFile('not json')).toEqual({
      count: 0,
      error: 'That file is not a controller presets file.',
    });
    expect(store.fromFile(JSON.stringify({ type: 'openscad-preset' }))).toEqual({
      count: 0,
      error: 'That file is not a controller presets file.',
    });
    expect(
      store.fromFile(JSON.stringify({ type: PRESETS_FILE_TYPE, presets: [] }))
    ).toEqual({ count: 0, error: 'That file holds no controller presets.' });
    expect(store.list().map((p) => p.name)).toEqual(['Kept']);
  });
});

describe('the mapping with a person\'s presets', () => {
  let store;
  let mapping;

  beforeEach(() => {
    localStorage.clear();
    store = createGamepadPresetStore();
    mapping = createGamepadMapping({ getPadId: () => XBOX, userPresets: store });
  });

  it('a person\'s preset gives its own table, and Reset to preset goes back to it', () => {
    store.save('Racing', { ...CAMERA, activate: 'x', resetView: 'a' });
    mapping.setPreset('mine:Racing');
    expect(mapping.get().preset).toBe('mine:Racing');
    expect(mapping.get().assignments.activate).toBe('x');
    mapping.assign('activate', 'y');
    expect(mapping.get().assignments.activate).toBe('y');
    mapping.reset();
    expect(mapping.get().assignments.activate).toBe('x');
    expect(mapping.presetName('mine:Racing')).toBe('Racing');
    expect(mapping.presetName('menus')).toBe('Menus');
  });

  it('keeps its buttons on a Nintendo layout, where the built-in ones swap A and B', () => {
    const nintendo = createGamepadMapping({
      getPadId: () => NINTENDO,
      userPresets: store,
    });
    store.save('Racing', CAMERA);
    nintendo.setPreset('mine:Racing');
    expect(nintendo.get().assignments.activate).toBe('a');
    nintendo.setPreset('camera');
    expect(nintendo.get().assignments.activate).toBe('b');
  });

  it('Next preset steps through the built-in ones, then the person\'s, round again', () => {
    store.save('Racing', CAMERA);
    store.save('Reading', CAMERA);
    const seen = [mapping.get().preset];
    for (let i = 0; i < 5; i++) seen.push(mapping.nextPreset());
    expect(seen).toEqual([
      'camera',
      'customizer',
      'menus',
      'mine:Racing',
      'mine:Reading',
      'camera',
    ]);
  });

  it('is kept for the next visit, and a deleted preset in use leaves its buttons in use', () => {
    store.save('Racing', { ...CAMERA, activate: 'x', resetView: 'a' });
    mapping.setPreset('mine:Racing');
    const next = createGamepadMapping({
      getPadId: () => XBOX,
      userPresets: createGamepadPresetStore(),
    });
    expect(next.get().preset).toBe('mine:Racing');

    mapping.keepButtons();
    store.remove('mine:Racing');
    expect(mapping.get().preset).toBe('camera');
    expect(mapping.get().assignments.activate).toBe('x');
  });

  it('a preset gone from the store reads as the default', () => {
    store.save('Racing', CAMERA);
    mapping.setPreset('mine:Racing');
    store.remove('mine:Racing');
    expect(mapping.get().preset).toBe('camera');
    expect(mapping.get().assignments).toEqual(CAMERA);
  });

  it('a change to the person\'s presets tells the mapping\'s listeners', () => {
    const heard = vi.fn();
    mapping.subscribe(heard);
    store.save('Racing', CAMERA);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
