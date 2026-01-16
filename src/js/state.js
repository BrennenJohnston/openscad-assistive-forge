/**
 * State Management - Simple pub/sub pattern
 * @license GPL-3.0-or-later
 */

export class StateManager {
  constructor(initialState) {
    this.state = initialState;
    this.subscribers = [];
    this.syncTimeout = null;
    this.saveTimeout = null;
    this.localStorageKey = 'openscad-customizer-draft';
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

  loadFromURL() {
    const params = deserializeURLParams();
    if (params && Object.keys(params).length > 0) {
      // Merge URL params with current parameters
      this.setState({
        parameters: { ...this.state.parameters, ...params }
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

  loadFromLocalStorage() {
    if (!isLocalStorageAvailable()) {
      return null;
    }

    try {
      const stored = localStorage.getItem(this.localStorageKey);
      if (!stored) return null;

      const draft = JSON.parse(stored);
      
      // Check if draft is recent (within 7 days)
      const age = Date.now() - draft.timestamp;
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
function deserializeURLParams() {
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
  } catch (e) {
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
  enabledLibraries: [],  // Libraries currently enabled
};

export const stateManager = new StateManager(initialState);
