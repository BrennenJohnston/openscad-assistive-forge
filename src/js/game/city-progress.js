/**
 * What a player has found in a city, remembered between sessions.
 *
 * Without this, closing the game would forget everything: a player who found
 * eleven of twelve landmarks would come back to twelve unfound. The fireworks
 * and the traveler both stand on this record.
 *
 * The value is an object, and unknown fields survive a write. A later feature
 * adds its own flag here rather than minting a sibling key, and an older
 * build loading a newer one's progress must not silently eat it. That costs
 * one spread and buys forward compatibility for free.
 *
 * Every failure is a clean slate, never a crash. Storage can be off,
 * full, or hold something another program wrote; none of that may stop a
 * player from walking around a city. What it must not do is fail SILENTLY in
 * the sense of hiding a bug, so a malformed value is treated as absent rather
 * than half-read.
 *
 * @license GPL-3.0-or-later
 */

import {
  getCityWalkProgressKey,
  safeGetItem,
  safeSetItem,
} from '../storage-keys.js';

/** @typedef {{visited: string[], allFound: boolean}} CityProgress */

const EMPTY = Object.freeze({ visited: [], allFound: false });

/**
 * Read one city's progress. Always returns a usable object.
 *
 * @param {string} citySlug
 * @returns {{visited: Set<string>, allFound: boolean, raw: object}}
 */
export function readCityProgress(citySlug) {
  const raw = safeGetItem(getCityWalkProgressKey(citySlug));
  if (!raw) return { visited: new Set(), allFound: false, raw: {} };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Not ours, or truncated. A clean slate is the honest reading: half a
    // player's progress is worse than none, because it cannot be told apart
    // from a real one.
    return { visited: new Set(), allFound: false, raw: {} };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { visited: new Set(), allFound: false, raw: {} };
  }
  const names = Array.isArray(parsed.visited)
    ? parsed.visited.filter((n) => typeof n === 'string' && n !== '')
    : [];
  return {
    visited: new Set(names),
    allFound: parsed.allFound === true,
    // Everything else the object carried, so a write puts it back.
    raw: parsed,
  };
}

/**
 * Write one city's progress, preserving any field this build does not know
 * about.
 *
 * @param {string} citySlug
 * @param {{visited: Set<string>|string[], allFound: boolean, raw?: object}} next
 * @returns {boolean} whether the write landed
 */
export function writeCityProgress(citySlug, next) {
  const visited = [...(next?.visited ?? [])].filter(
    (n) => typeof n === 'string' && n !== ''
  );
  const value = {
    ...(next?.raw && typeof next.raw === 'object' ? next.raw : {}),
    visited,
    allFound: Boolean(next?.allFound),
  };
  return safeSetItem(getCityWalkProgressKey(citySlug), JSON.stringify(value));
}

export { EMPTY as EMPTY_CITY_PROGRESS };
