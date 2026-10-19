/**
 * How many times the Alt View's code has been found in this browser, and what
 * each finding brings: the first the key's arrival, the second a crack in the
 * glass around it, the third the key for good. The count is never forgotten,
 * so the three findings can be days or years apart. Storage only, no page.
 *
 * @license GPL-3.0-or-later
 */

import {
  STORAGE_KEY_ALT_UNLOCK,
  safeGetItem,
  safeSetItem,
} from './storage-keys.js';

const NOTHING_FOUND = Object.freeze({
  entries: 0,
  permanent: false,
  pendingBreak: false,
});

/**
 * The count as stored. A value that is not the shape written here reads as
 * nothing found, and the next finding writes over it.
 * @returns {{entries: number, permanent: boolean, pendingBreak: boolean}}
 */
export function readUnlockState() {
  const raw = safeGetItem(STORAGE_KEY_ALT_UNLOCK);
  if (raw === null) return { ...NOTHING_FOUND };
  let value = null;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    console.warn('[Alt View] The key count could not be read:', error);
    return { ...NOTHING_FOUND };
  }
  if (
    !value ||
    typeof value !== 'object' ||
    !Number.isInteger(value.entries) ||
    value.entries < 0
  ) {
    console.warn('[Alt View] The key count is not a count:', raw);
    return { ...NOTHING_FOUND };
  }
  const permanent = value.permanent === true;
  return {
    entries: value.entries,
    permanent,
    pendingBreak: permanent && value.pendingBreak === true,
  };
}

function writeUnlockState(state) {
  safeSetItem(STORAGE_KEY_ALT_UNLOCK, JSON.stringify(state));
}

/**
 * Counts one finding of the code and says what it brings.
 * @param {{altViewOn?: boolean}} [options] - whether the Alt View is on now
 * @returns {'arrival'|'crack'|'break'|'break-pending'|'none'} 'none' once the
 *   key is permanent
 */
export function recordCodeEntry({ altViewOn = false } = {}) {
  const state = readUnlockState();
  if (state.permanent) return 'none';
  state.entries += 1;
  let stage = 'arrival';
  if (state.entries === 2) {
    stage = 'crack';
  } else if (state.entries >= 3) {
    // The key stays from this finding on. The break-through is seen from
    // outside the look, so one found inside it waits for the look to go off.
    state.permanent = true;
    state.pendingBreak = altViewOn;
    stage = altViewOn ? 'break-pending' : 'break';
  }
  writeUnlockState(state);
  return stage;
}

/** A developer's door opened the key: found once, with nothing played. */
export function noteDevUnlock() {
  const state = readUnlockState();
  if (state.entries >= 1) return;
  state.entries = 1;
  writeUnlockState(state);
}

/**
 * Whether a break-through is waiting to be seen; true only once.
 * @returns {boolean}
 */
export function takePendingBreak() {
  const state = readUnlockState();
  if (!state.pendingBreak) return false;
  state.pendingBreak = false;
  writeUnlockState(state);
  return true;
}

/** @returns {boolean} whether the key stays without the code */
export function isPermanent() {
  return readUnlockState().permanent;
}
