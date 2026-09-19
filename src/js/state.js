/**
 * State Management - Simple pub/sub pattern
 * @license GPL-3.0-or-later
 */

import { announce, announceImmediate } from './announcer.js';
import { getAppPrefKey } from './storage-keys.js';

/**
 * Parameter History Manager for Undo/Redo functionality
 *
 * Undo-stack model: callers push the CURRENT state BEFORE making a change.
 * The undoStack holds prior snapshots; the redoStack holds snapshots
 * displaced by undo operations. The live application state is always
 * "ahead" of the undoStack top.
 */
export class ParameterHistory {
  constructor(maxSize = 50) {
    this.maxSize = maxSize;
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Record the current state before a change.
   * Clears the redo stack (new branch of history).
   * @param {Object} state - Parameter state to save
   */
  push(state) {
    this.undoStack.push(this.cloneState(state));
    this.redoStack = [];

    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
  }

  /**
   * Undo — restore the most recent snapshot.
   * @param {Object} currentLiveState - The live application state (pushed onto redoStack)
   * @returns {Object|null} Previous state or null if nothing to undo
   */
  undo(currentLiveState) {
    if (!this.canUndo()) return null;
    this.redoStack.push(this.cloneState(currentLiveState));
    return this.undoStack.pop();
  }

  /**
   * Redo — re-apply the most recently undone state.
   * @param {Object} currentLiveState - The live application state (pushed onto undoStack)
   * @returns {Object|null} Next state or null if nothing to redo
   */
  redo(currentLiveState) {
    if (!this.canRedo()) return null;
    this.undoStack.push(this.cloneState(currentLiveState));
    return this.redoStack.pop();
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }

  getStats() {
    return {
      undoDepth: this.undoStack.length,
      redoDepth: this.redoStack.length,
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
    this._createdAt = Date.now();
    this._urlRestoreConsumed = false;
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

  isManifestProject() {
    return this.state.manifestOrigin !== null;
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

  /**
   * True while an incoming link still carries a parameter payload nobody has
   * read yet. Writing in that window would serialize this session's
   * pre-restore values over the sender's, destroying the link.
   * @returns {boolean}
   */
  isURLRestorePending() {
    if (this._urlRestoreConsumed) {
      return false;
    }
    if (!hasURLParamPayload(window.location.hash)) {
      this._urlRestoreConsumed = true;
      return false;
    }
    // Backstop: several load paths set state.defaults without ever calling
    // loadFromURL(), and a payload nobody has read by now is one nobody will.
    // Without this the writer would stay silent for the rest of the session.
    if (Date.now() - this._createdAt > URL_RESTORE_GRACE_MS) {
      this._urlRestoreConsumed = true;
      return false;
    }
    return true;
  }

  /**
   * The parameters that differ from the loaded model's defaults. Short URLs
   * are the point: a link carries what the sender changed, nothing else.
   * @returns {Object|null} Non-default values, or null with nothing loaded
   */
  collectNonDefaultParameters() {
    if (!this.state.parameters || !this.state.defaults) {
      return null;
    }
    const nonDefaultParams = {};
    for (const [key, value] of Object.entries(this.state.parameters)) {
      if (this.state.defaults[key] !== value) {
        nonDefaultParams[key] = value;
      }
    }
    return nonDefaultParams;
  }

  /**
   * The fragment a shared link should carry so it opens with the values on
   * screen. Built by the same serializer the address bar uses, so a copied
   * link and the address bar can never mean different things.
   * @returns {string} `#v=1&params=...`, or '' when nothing differs
   */
  getShareFragment() {
    const nonDefaultParams = this.collectNonDefaultParameters();
    if (!nonDefaultParams) return '';
    return serializeURLParams(nonDefaultParams);
  }

  performURLSync() {
    // Only sync if we have parameters to save
    const nonDefaultParams = this.collectNonDefaultParameters();
    if (!nonDefaultParams) {
      return;
    }

    if (this.isURLRestorePending()) {
      return;
    }

    // Build URL hash, carrying any fragment keys that are not ours
    const currentHash = window.location.hash;
    const hash = serializeURLParams(nonDefaultParams, currentHash);

    // Update URL without triggering page reload. An empty hash is written as
    // an explicit path+query so the query string survives the clear.
    if (hash !== currentHash) {
      const nextUrl =
        hash === ''
          ? `${window.location.pathname}${window.location.search}`
          : hash;
      window.history.replaceState(null, '', nextUrl);
    }
  }

  async loadFromURL() {
    const params = await deserializeURLParams();
    // The payload has now been read, however it turned out; the writer is free.
    this._urlRestoreConsumed = true;
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
        manifestOrigin: this.state.manifestOrigin || null,
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
      this.updateUndoRedoButtons();
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
    const liveParams = this.state.parameters;
    const previousState = this.history.undo(liveParams);
    if (!previousState) return null;

    this.isUndoRedo = true;
    this.setState({ parameters: previousState });

    const changedParam = this.findChangedParameter(liveParams, previousState);
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
    const liveParams = this.state.parameters;
    const nextState = this.history.redo(liveParams);
    if (!nextState) return null;

    this.isUndoRedo = true;
    this.setState({ parameters: nextState });

    const changedParam = this.findChangedParameter(liveParams, nextState);
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
 * The URL fragment is a `&`-joined key=value list. Our parameter payload owns
 * exactly these two keys; every other key in the fragment belongs to whoever
 * put it there and has to survive our writes.
 */
const URL_PARAM_HASH_KEYS = ['v', 'params'];

/**
 * How long after boot the writer keeps its hands off an unread payload.
 * @see StateManager#isURLRestorePending
 */
export const URL_RESTORE_GRACE_MS = 15000;

/**
 * Split a URL fragment into ordered [key, rawValue] pairs. A bare key (no `=`)
 * keeps a null value so it can be written back exactly as it arrived.
 * @param {string} hash - Fragment, with or without the leading '#'
 * @returns {Array<[string, string|null]>}
 */
function splitHashEntries(hash) {
  const raw = (hash || '').replace(/^#/, '');
  if (!raw) return [];
  return raw.split('&').map((entry) => {
    const eq = entry.indexOf('=');
    return eq === -1
      ? [entry, null]
      : [entry.slice(0, eq), entry.slice(eq + 1)];
  });
}

/**
 * Rebuild a fragment from ordered [key, rawValue] pairs.
 * @param {Array<[string, string|null]>} entries
 * @returns {string} Fragment including '#', or '' when there is nothing to write
 */
function joinHashEntries(entries) {
  if (entries.length === 0) return '';
  return `#${entries
    .map(([key, value]) => (value === null ? key : `${key}=${value}`))
    .join('&')}`;
}

/**
 * Check whether a fragment carries a parameter payload.
 * @param {string} hash
 * @returns {boolean}
 */
function hasURLParamPayload(hash) {
  return splitHashEntries(hash).some(([key]) => key === 'params');
}

/**
 * Serialize parameters to a URL hash, preserving fragment keys that are not
 * ours.
 * @param {Object} params - Parameters object
 * @param {string} [currentHash] - The fragment currently on the URL
 * @returns {string} URL hash string
 */
function serializeURLParams(params, currentHash = '') {
  const foreign = splitHashEntries(currentHash).filter(
    ([key]) => !URL_PARAM_HASH_KEYS.includes(key)
  );

  if (!params || Object.keys(params).length === 0) {
    return joinHashEntries(foreign);
  }

  try {
    const json = JSON.stringify(params);
    const encoded = encodeURIComponent(json);
    return joinHashEntries([['v', '1'], ['params', encoded], ...foreign]);
  } catch (error) {
    console.error('Failed to serialize URL params:', error);
    return joinHashEntries(foreign);
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

    // Validate params with Ajv.
    // The schema only accepts scalar (string) values, so array-valued parameters
    // (e.g. nested tablet position data: [[x,y], ...]) must be partitioned out
    // before validation and merged back in afterward.
    // Tech-debt: widen urlParamValueSchema in validation-schemas.js to accept
    // array types natively so this split is no longer needed.
    const arrayParams = {};
    const scalarParams = {};
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) {
        arrayParams[k] = v;
      } else {
        scalarParams[k] = v;
      }
    }

    const { validateUrlParams } = await import('./validation-schemas.js');
    const validation = validateUrlParams(scalarParams);

    if (!validation.valid) {
      console.warn('[URL Params] Validation failed:', validation.errors);
      // Return sanitized scalars merged with array params.
      return { ...validation.sanitized, ...arrayParams };
    }

    return { ...scalarParams, ...arrayParams };
  } catch (error) {
    console.error('Failed to deserialize URL params:', error);
    return null;
  }
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
  lastRenderTime: null,
  // Format-agnostic generated output record.
  // { data: ArrayBuffer|string, format: string, stats: Object, paramsHash: string }
  generatedOutput: null,
  // Legacy aliases — readers should prefer generatedOutput when non-null.
  stl: null,
  stlStats: null,
  outputFormat: null,
  expandedGroups: [],
  error: null,
  // Comparison mode
  comparisonMode: false,
  activeVariantId: null,
  // Libraries
  detectedLibraries: [], // Libraries detected in current .scad file
  enabledLibraries: [], // Libraries currently enabled
  // Manifest origin tracking (set when project loaded via ?manifest= link)
  manifestOrigin: null, // { url, name, author, loadedAt } or null
  // Path to the main .scad file within the project (set by handleFile)
  mainFilePath: null,
  // Project-native presets from sidecar JSON (behind project_presets flag)
  // { presetName: { param: value, ... }, ... } or null when unused
  projectPresets: null,
  // Identity of the currently loaded project presets (for staleness checks)
  // { mainFilePath: string, sidecarFiles: string[], loadedAt: number } or null
  projectPresetIdentity: null,
  // Project-scoped companion alias map (behind project_presets flag)
  // Map<presetName, { aliases|openingsPath, resolution }> or null
  projectCompanionMap: null,
};

export const stateManager = new StateManager(initialState);
