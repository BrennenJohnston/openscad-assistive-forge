/**
 * Parameter Detail Level Controller
 *
 * Controls how parameter descriptions are displayed in the customizer panel.
 * Maps to desktop OpenSCAD's comboBoxDetails / DescLoD enum:
 *
 * - show:      Description below parameter name (full layout — default)
 * - inline:    Description inline next to parameter name
 * - hide:      Description hidden, tooltip-only
 * - desc-only: Only description shown; parameter name visually hidden when description exists
 *
 * @license GPL-3.0-or-later
 */

import { getAppPrefKey } from './storage-keys.js';
import { announceImmediate } from './announcer.js';

const STORAGE_KEY = getAppPrefKey('param-detail-level');

/** @type {readonly ['show', 'inline', 'hide', 'desc-only']} */
const VALID_LEVELS = /** @type {const} */ ([
  'show',
  'inline',
  'hide',
  'desc-only',
]);

const DEFAULT_LEVEL = 'show';

/**
 * @typedef {'show' | 'inline' | 'hide' | 'desc-only'} DetailLevel
 */

/** @type {DetailLevel} */
let currentLevel = DEFAULT_LEVEL;

const LEVEL_LABELS = {
  show: 'Show Details: descriptions shown below parameter names',
  inline: 'Inline Details: descriptions shown next to parameter names',
  hide: 'Hide Details: descriptions available as tooltips only',
  'desc-only':
    'Description Only: showing descriptions instead of parameter names',
};

/**
 * Apply the detail level data attribute to the parameters container.
 * @param {DetailLevel} level
 */
function applyLevel(level) {
  const container = document.getElementById('parametersContainer');
  if (container) {
    container.dataset.detailLevel = level;
  }
}

/**
 * Load the saved detail level from localStorage.
 * @returns {DetailLevel}
 */
function loadLevel() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && VALID_LEVELS.includes(/** @type {DetailLevel} */ (saved))) {
      return /** @type {DetailLevel} */ (saved);
    }
  } catch {
    // Fall through to default
  }
  return DEFAULT_LEVEL;
}

/**
 * Save the detail level to localStorage.
 * @param {DetailLevel} level
 */
function saveLevel(level) {
  try {
    localStorage.setItem(STORAGE_KEY, level);
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      console.warn('[ParamDetail] localStorage quota exceeded');
    }
  }
}

/**
 * Set the parameter detail level.
 * @param {DetailLevel} level
 * @param {Object} [options]
 * @param {boolean} [options.skipAnnouncement] - Skip screen reader announcement
 */
export function setDetailLevel(level, options = {}) {
  if (!VALID_LEVELS.includes(level)) return;

  currentLevel = level;
  applyLevel(level);
  saveLevel(level);

  const select = document.getElementById('paramDetailLevel');
  if (select && /** @type {HTMLSelectElement} */ (select).value !== level) {
    /** @type {HTMLSelectElement} */ (select).value = level;
  }

  if (!options.skipAnnouncement) {
    announceImmediate(LEVEL_LABELS[level] || `Detail level: ${level}`, {
      clearDelayMs: 3000,
    });
  }
}

/**
 * Get the current detail level.
 * @returns {DetailLevel}
 */
export function getDetailLevel() {
  return currentLevel;
}

/**
 * Re-apply the current detail level to the DOM.
 * Call after parameters are re-rendered.
 */
export function reapplyDetailLevel() {
  applyLevel(currentLevel);
}

/**
 * Initialize the param detail controller.
 * Restores saved preference and wires the dropdown.
 */
export function initParamDetailController() {
  currentLevel = loadLevel();
  applyLevel(currentLevel);

  const select = /** @type {HTMLSelectElement|null} */ (
    document.getElementById('paramDetailLevel')
  );
  if (!select) return;

  select.value = currentLevel;

  select.addEventListener('change', () => {
    setDetailLevel(/** @type {DetailLevel} */ (select.value));
  });
}
