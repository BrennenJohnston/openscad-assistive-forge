/**
 * A person's own controller presets: named copies of the app's controller
 * table (Keys > Controller), kept in the browser and in a file a person can
 * keep or carry to another browser. Each table is read back action by
 * action, so one saved by an earlier version still loads: an action added
 * since starts unassigned, and one that is gone is dropped.
 * @license GPL-3.0-or-later
 */

import {
  GAMEPAD_ACTIONS,
  GAMEPAD_INPUT_NAMES,
  GAMEPAD_PRESETS,
} from './gamepad-controller.js';
import {
  STORAGE_KEY_GAMEPAD_PRESETS,
  safeGetItem,
  safeSetItem,
} from './storage-keys.js';

/** A person's preset's id: this, then its name. */
export const USER_PRESET_PREFIX = 'mine:';
/** The longest name a preset takes. */
export const PRESET_NAME_MAX = 60;
/** What a presets file says it is, and the version that wrote it. */
export const PRESETS_FILE_TYPE = 'openscad-forge-controller-presets';
export const PRESETS_FILE_VERSION = 1;

const BUILT_IN_NAMES = new Set(
  Object.values(GAMEPAD_PRESETS).map((preset) => preset.name.toLowerCase())
);

/**
 * A saved table read back: every action this version has, each with the
 * input it was given when this version knows that input and no action
 * before it took it, else unassigned.
 * @param {unknown} table
 * @returns {Object<string, string|null>}
 */
export function readPresetTable(table) {
  const given = table && typeof table === 'object' ? table : {};
  const taken = new Set();
  const out = {};
  for (const { id } of GAMEPAD_ACTIONS) {
    const input = given[id];
    if (GAMEPAD_INPUT_NAMES.includes(input) && !taken.has(input)) {
      taken.add(input);
      out[id] = input;
    } else {
      out[id] = null;
    }
  }
  return out;
}

/**
 * The presets in a stored or exported value, each with a usable name; a
 * later one with the same name as an earlier one replaces it.
 * @param {unknown} value
 * @returns {{name: string, assignments: Object<string, string|null>}[]}
 */
function readPresets(value) {
  const list = Array.isArray(value?.presets) ? value.presets : [];
  const byName = new Map();
  for (const item of list) {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    if (!name || name.length > PRESET_NAME_MAX) continue;
    if (BUILT_IN_NAMES.has(name.toLowerCase())) continue;
    byName.set(name.toLowerCase(), {
      name,
      assignments: readPresetTable(item.assignments),
    });
  }
  return [...byName.values()];
}

/**
 * Why a name cannot be a preset's, or null when it can.
 * @param {string} name - already trimmed
 * @returns {string|null}
 */
function nameProblem(name) {
  if (!name) return 'Give the preset a name.';
  if (name.length > PRESET_NAME_MAX) {
    return `A preset name has at most ${PRESET_NAME_MAX} characters.`;
  }
  if (BUILT_IN_NAMES.has(name.toLowerCase())) {
    return 'That name belongs to a built-in preset. Choose another.';
  }
  return null;
}

/**
 * The person's presets, kept under one storage key.
 * @param {{storageKey?: string}} [options]
 */
export function createGamepadPresetStore({
  storageKey = STORAGE_KEY_GAMEPAD_PRESETS,
} = {}) {
  const listeners = new Set();
  let presets = read();

  function read() {
    const raw = safeGetItem(storageKey);
    if (!raw) return [];
    try {
      return readPresets(JSON.parse(raw));
    } catch (error) {
      // Kept aside before a later save writes over it, so nothing a person
      // made is lost to a damaged value.
      console.warn(
        '[Gamepad] The saved controller presets are unreadable:',
        error
      );
      safeSetItem(`${storageKey}-unreadable`, raw);
      return [];
    }
  }

  function write() {
    safeSetItem(
      storageKey,
      JSON.stringify({ version: PRESETS_FILE_VERSION, presets })
    );
    for (const listener of listeners) listener();
  }

  const idOf = (name) => `${USER_PRESET_PREFIX}${name}`;
  const at = (id) =>
    typeof id === 'string' && id.startsWith(USER_PRESET_PREFIX)
      ? presets.findIndex(
          (preset) =>
            preset.name.toLowerCase() ===
            id.slice(USER_PRESET_PREFIX.length).toLowerCase()
        )
      : -1;
  const shown = (preset) => ({
    id: idOf(preset.name),
    name: preset.name,
    assignments: { ...preset.assignments },
  });

  return {
    /** @returns {{id: string, name: string, assignments: Object}[]} */
    list() {
      return presets.map(shown);
    },

    /** @param {string} id @returns {{id: string, name: string, assignments: Object}|null} */
    get(id) {
      const index = at(id);
      return index < 0 ? null : shown(presets[index]);
    },

    /**
     * Keep a table under a name; a preset of the same name is replaced.
     * @param {string} name
     * @param {Object<string, string|null>} assignments
     * @returns {{saved: boolean, error?: string, id?: string, replaced?: boolean}}
     */
    save(name, assignments) {
      const trimmed = String(name ?? '').trim();
      const error = nameProblem(trimmed);
      if (error) return { saved: false, error };
      const index = at(idOf(trimmed));
      const preset = {
        name: trimmed,
        assignments: readPresetTable(assignments),
      };
      if (index < 0) presets = [...presets, preset];
      else presets = presets.map((p, i) => (i === index ? preset : p));
      write();
      return { saved: true, id: idOf(trimmed), replaced: index >= 0 };
    },

    /** @param {string} id @returns {boolean} whether one was removed */
    remove(id) {
      const index = at(id);
      if (index < 0) return false;
      presets = presets.filter((_, i) => i !== index);
      write();
      return true;
    },

    /** The presets as a file's text. @returns {string} */
    toFile() {
      return JSON.stringify(
        {
          type: PRESETS_FILE_TYPE,
          version: PRESETS_FILE_VERSION,
          exported: new Date().toISOString(),
          presets,
        },
        null,
        2
      );
    },

    /**
     * Add the presets a file holds; one with the name of a kept preset
     * replaces it.
     * @param {string} text
     * @returns {{count: number, error?: string}}
     */
    fromFile(text) {
      let value = null;
      try {
        value = JSON.parse(text);
      } catch {
        return {
          count: 0,
          error: 'That file is not a controller presets file.',
        };
      }
      if (value?.type !== PRESETS_FILE_TYPE) {
        return {
          count: 0,
          error: 'That file is not a controller presets file.',
        };
      }
      const found = readPresets(value);
      if (!found.length) {
        return { count: 0, error: 'That file holds no controller presets.' };
      }
      const names = new Set(found.map((p) => p.name.toLowerCase()));
      presets = [
        ...presets.filter((p) => !names.has(p.name.toLowerCase())),
        ...found,
      ];
      write();
      return { count: found.length };
    },

    /** @param {() => void} listener @returns {() => void} unsubscribe */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
