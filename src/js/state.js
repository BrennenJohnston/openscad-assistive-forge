/**
 * State Management - Simple pub/sub pattern
 * @license GPL-3.0-or-later
 */

import { announce, announceImmediate } from './announcer.js';
import { getAppPrefKey } from './storage-keys.js';

/**
 * Parameter History Manager for Undo/Redo functionality
 * Uses a past/present/future pattern for state management
 */
export class ParameterHistory {
  constructor(maxSize = 50) {
    this.maxSize = maxSize;
    this.history = [];
    this.currentIndex = -1;
  }

  /**
   * Push a new state to history
   * @param {Object} state - Parameter state to save
   */
  push(state) {
    // Remove any future states if we're not at the end
    this.history = this.history.slice(0, this.currentIndex + 1);

    // Add new state
    this.history.push(this.cloneState(state));
    this.currentIndex++;

    // Trim history if it exceeds max size
    if (this.history.length > this.maxSize) {
      this.history.shift();
      this.currentIndex--;
    }
  }

  /**
   * Undo - go back to previous state
   * @returns {Object|null} Previous state or null if at beginning
   */
  undo() {
    if (!this.canUndo()) return null;

    this.currentIndex--;
    return this.cloneState(this.history[this.currentIndex]);
  }

  /**
   * Redo - go forward to next state
   * @returns {Object|null} Next state or null if at end
   */
  redo() {
    if (!this.canRedo()) return null;

    this.currentIndex++;
    return this.cloneState(this.history[this.currentIndex]);
  }

  /**
   * Check if undo is possible
   * @returns {boolean}
   */
  canUndo() {
    return this.currentIndex > 0;
  }

  /**
   * Check if redo is possible
   * @returns {boolean}
   */
  canRedo() {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * Clear all history
   */
  clear() {
    this.history = [];
    this.currentIndex = -1;
  }

  /**
   * Get statistics about history
   * @returns {Object}
   */
  getStats() {
    return {
      total: this.history.length,
      current: this.currentIndex,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
    };
  }

  /**
   * Deep clone a state object
   * @param {Object} state - State to clone
   * @returns {Object} Cloned state
   */
  cloneState(state) {
    try {
      return JSON.parse(JSON.stringify(state));
    } catch (e) {
      // Fallback for non-serializable values (functions, circular refs, etc.)
      console.warn(
        '[State] Could not serialize state, using shallow clone:',
        e
      );
      return { ...state };
    }
  }
}

export class StateManager {
  constructor(initialState) {
    this.state = initialState;
    this.subscribers = [];
    this.syncTimeout = null;
    this.saveTimeout = null;
    this.localStorageKey = getAppPrefKey('editor-draft');
    this.history = new ParameterHistory();
    this.isUndoRedo = false; // Flag to prevent recording during undo/redo
    this.historyEnabled = true; // Flag to disable during rendering
    this._announceTimeout = null;
    this._announceClearTimeout = null;
  }

  subscribe(callback) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter((cb) => cb !== callback);
    };
  }

  setState(updates) {
    const prevState = this.state;
    this.state = { ...this.state, ...updates };
    this.subscribers.forEach((cb) => cb(this.state, prevState));
    this.syncToURL();
    this.saveToLocalStorage();
  }

  getState() {
    return this.state;
  }

  syncToURL() {
    // Debounce URL updates to avoid excessive history entries
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }

    this.syncTimeout = setTimeout(() => {
      this.performURLSync();
    }, 1000); // 1 second debounce
  }

  performURLSync() {
    // Only sync if we have parameters to save
    if (!this.state.parameters || !this.state.defaults) {
      return;
    }

    // Only include non-default parameters to keep URLs short
    const nonDefaultParams = {};
    for (const [key, value] of Object.entries(this.state.parameters)) {
      if (this.state.defaults[key] !== value) {
        nonDefaultParams[key] = value;
      }
    }

    // Build URL hash
    const hash = serializeURLParams(nonDefaultParams);

    // Update URL without triggering page reload
    if (hash !== window.location.hash) {
      window.history.replaceState(null, '', hash);
    }
  }

  async loadFromURL() {
    const params = await deserializeURLParams();
    if (params && Object.keys(params).length > 0) {
      // Merge URL params with current parameters
      this.setState({
        parameters: { ...this.state.parameters, ...params },
      });
      return params;
    }
    return null;
  }

  saveToLocalStorage() {
    // Debounce saves to avoid excessive writes
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.performLocalStorageSave();
    }, 2000); // 2 second debounce
  }

  performLocalStorageSave() {
    // Check if localStorage is available
    if (!isLocalStorageAvailable()) {
      return;
    }

    // Only save if we have meaningful data
    if (!this.state.uploadedFile || !this.state.parameters) {
      return;
    }

    try {
      const draft = {
        version: '1.0.0',
        timestamp: Date.now(),
        fileName: this.state.uploadedFile.name,
        fileContent: this.state.uploadedFile.content,
        parameters: this.state.parameters,
        defaults: this.state.defaults,
      };

      localStorage.setItem(this.localStorageKey, JSON.stringify(draft));
      console.log('Draft saved to localStorage');
    } catch (error) {
      console.error('Failed to save draft to localStorage:', error);
      // Might be quota exceeded or other storage error
    }
  }

  async loadFromLocalStorage() {
    if (!isLocalStorageAvailable()) {
      return null;
    }

    try {
      const stored = localStorage.getItem(this.localStorageKey);
      if (!stored) return null;

      const draft = JSON.parse(stored);

      // Validate draft with Ajv
      const { validateDraftState } = await import('./validation-schemas.js');
      const isValid = validateDraftState(draft);
      if (!isValid) {
        console.warn(
          '[LocalStorage] Invalid draft state, clearing:',
          validateDraftState.errors
        );
        this.clearLocalStorage();
        return null;
      }

      // Check if draft is recent (within 7 days)
      const age = Date.now() - (draft.timestamp || 0);
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

      if (age > maxAge) {
        console.log('Draft is too old, ignoring');
        this.clearLocalStorage();
        return null;
      }

      console.log('Found draft from localStorage:', draft.fileName);
      return draft;
    } catch (error) {
      console.error('Failed to load draft from localStorage:', error);
      return null;
    }
  }

  clearLocalStorage() {
    if (!isLocalStorageAvailable()) {
      return;
    }

    try {
      localStorage.removeItem(this.localStorageKey);
      console.log('Draft cleared from localStorage');
    } catch (error) {
      console.error('Failed to clear localStorage:', error);
    }
  }

  /**
   * Record current parameter state to history
   * Call this before making parameter changes
   */
  recordParameterState() {
    if (this.isUndoRedo || !this.historyEnabled) return;

    if (
      this.state.parameters &&
      Object.keys(this.state.parameters).length > 0
    ) {
      this.history.push(this.state.parameters);
    }
  }

  /**
   * Update a single parameter value with history tracking
   * @param {string} name - Parameter name
   * @param {*} value - New value
   */
  updateParameter(name, value) {
    // Record current state before change (unless during undo/redo)
    if (!this.isUndoRedo && this.historyEnabled) {
      this.recordParameterState();
    }

    const newParameters = { ...this.state.parameters, [name]: value };
    this.setState({ parameters: newParameters });
    this.updateUndoRedoButtons();
  }

  /**
   * Undo last parameter change
   * @returns {Object|null} Previous parameters or null
   */
  undo() {
    const previousState = this.history.undo();
    if (!previousState) return null;

    this.isUndoRedo = true;

    const prevParams = { ...this.state.parameters };
    this.setState({ parameters: previousState });

    // Find what changed for screen reader announcement
    const changedParam = this.findChangedParameter(prevParams, previousState);
    if (changedParam) {
      this.announceChange(
        `Undid: ${changedParam.name.replace(/_/g, ' ')} → ${changedParam.value}`
      );
    }

    this.updateUndoRedoButtons();
    this.isUndoRedo = false;

    return previousState;
  }

  /**
   * Redo previously undone parameter change
   * @returns {Object|null} Next parameters or null
   */
  redo() {
    const nextState = this.history.redo();
    if (!nextState) return null;

    this.isUndoRedo = true;

    const prevParams = { ...this.state.parameters };
    this.setState({ parameters: nextState });

    // Find what changed for screen reader announcement
    const changedParam = this.findChangedParameter(prevParams, nextState);
    if (changedParam) {
      this.announceChange(
        `Redid: ${changedParam.name.replace(/_/g, ' ')} → ${changedParam.value}`
      );
    }

    this.updateUndoRedoButtons();
    this.isUndoRedo = false;

    return nextState;
  }

  /**
   * Check if undo is available
   * @returns {boolean}
   */
  canUndo() {
    return this.history.canUndo();
  }

  /**
   * Check if redo is available
   * @returns {boolean}
   */
  canRedo() {
    return this.history.canRedo();
  }

  /**
   * Clear undo/redo history (e.g., on new file upload)
   */
  clearHistory() {
    this.history.clear();
    this.updateUndoRedoButtons();
  }

  /**
   * Enable/disable history recording (disable during rendering)
   * @param {boolean} enabled
   */
  setHistoryEnabled(enabled) {
    this.historyEnabled = enabled;
    this.updateUndoRedoButtons();
  }

  /**
   * Get history statistics
   * @returns {Object}
   */
  getHistoryStats() {
    return this.history.getStats();
  }

  /**
   * Find which parameter changed between two states
   * @param {Object} prevState - Previous parameters
   * @param {Object} newState - New parameters
   * @returns {Object|null} Changed parameter { name, value }
   */
  findChangedParameter(prevState, newState) {
    for (const [key, value] of Object.entries(newState)) {
      if (prevState[key] !== value) {
        return { name: key, value };
      }
    }
    return null;
  }

  /**
   * Update undo/redo button states
   */
  updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');

    if (undoBtn) {
      undoBtn.disabled = !this.canUndo() || !this.historyEnabled;
      undoBtn.setAttribute(
        'aria-disabled',
        String(!this.canUndo() || !this.historyEnabled)
      );
    }

    if (redoBtn) {
      redoBtn.disabled = !this.canRedo() || !this.historyEnabled;
      redoBtn.setAttribute(
        'aria-disabled',
        String(!this.canRedo() || !this.historyEnabled)
      );
    }
  }

  /**
   * Announce changes to screen readers via centralized announcer.
   * Delegates to shared announcer.js utility for consistent behavior.
   * @param {string} message
   * @param {boolean} debounce - Whether to debounce (for rapid updates like sliders)
   */
  announceChange(message, debounce = false) {
    if (debounce) {
      // Debounced: use announce() with default 350ms debounce
      announce(message);
    } else {
      // Immediate: use announceImmediate() for discrete actions
      announceImmediate(message);
    }
  }
}

/**
 * Serialize parameters to URL hash
 * @param {Object} params - Parameters object
 * @returns {string} URL hash string
 */
function serializeURLParams(params) {
  if (!params || Object.keys(params).length === 0) {
    return '';
  }

  try {
    const json = JSON.stringify(params);
    const encoded = encodeURIComponent(json);
    return `#v=1&params=${encoded}`;
  } catch (error) {
    console.error('Failed to serialize URL params:', error);
    return '';
  }
}

/**
 * Deserialize parameters from URL hash
 * @returns {Object|null} Parameters object or null if invalid
 */
async function deserializeURLParams() {
  const hash = window.location.hash;
  if (!hash || !hash.includes('params=')) {
    return null;
  }

  try {
    // Extract params value from hash
    const match = hash.match(/params=([^&]*)/);
    if (!match) return null;

    const encoded = match[1];
    const json = decodeURIComponent(encoded);
    const params = JSON.parse(json);

    // Validate params with Ajv
    const { validateUrlParams } = await import('./validation-schemas.js');
    const validation = validateUrlParams(params);

    if (!validation.valid) {
      console.warn('[URL Params] Validation failed:', validation.errors);
      // Return sanitized params (invalid ones removed)
      return validation.sanitized;
    }

    return params;
  } catch (error) {
    console.error('Failed to deserialize URL params:', error);
    return null;
  }
}

/**
 * Get shareable URL for current parameters
 * @param {Object} params - Parameters object
 * @returns {string} Full URL with parameters
 */
export function getShareableURL(params) {
  const hash = serializeURLParams(params);
  return `${window.location.origin}${window.location.pathname}${hash}`;
}

/**
 * Check if localStorage is available and working
 * @returns {boolean} True if localStorage is available
 */
function isLocalStorageAvailable() {
  try {
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (_e) {
    return false;
  }
}

// Initial state
const initialState = {
  uploadedFile: null,
  schema: null,
  parameters: {},
  defaults: {},
  rendering: false,
  renderProgress: 0,
  lastRenderTime: null,
  stl: null,
  stlStats: null,
  expandedGroups: [],
  error: null,
  // Comparison mode
  comparisonMode: false,
  activeVariantId: null,
  // Libraries
  detectedLibraries: [], // Libraries detected in current .scad file
  enabledLibraries: [], // Libraries currently enabled
};

export const stateManager = new StateManager(initialState);
