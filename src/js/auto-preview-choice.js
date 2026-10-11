/**
 * The Automatic preview choice, kept across visits. Recovery mode writes it
 * off before a reboot; a person's own switch is theirs until they switch
 * back. Without a reader for the key, both were forgotten at the next start.
 *
 * @license GPL-3.0-or-later
 */

import { STORAGE_KEY_AUTO_PREVIEW_ENABLED } from './storage-keys.js';

/**
 * @returns {boolean} On unless the key says "false"; on where storage is
 *   closed to us (a private window).
 */
export function readAutoPreviewChoice() {
  try {
    return localStorage.getItem(STORAGE_KEY_AUTO_PREVIEW_ENABLED) !== 'false';
  } catch {
    return true;
  }
}

/** @param {boolean} enabled */
export function writeAutoPreviewChoice(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY_AUTO_PREVIEW_ENABLED, String(enabled));
  } catch {
    // Storage closed to us: the choice lasts the visit.
  }
}
