/**
 * OpenSCAD Library Bundle Manager
 * @license GPL-3.0-or-later
 * 
 * Manages OpenSCAD library bundles (MCAD, BOSL2, etc.)
 */

/**
 * Library definitions with metadata
 */
export const LIBRARY_DEFINITIONS = {
  MCAD: {
    id: 'MCAD',
    name: 'MCAD',
    description: 'Mechanical CAD components (gears, screws, bearings, boxes)',
    license: 'LGPL-2.1',
    repository: 'https://github.com/openscad/MCAD',
    path: '/libraries/MCAD',
    icon: '⚙️',
    enabled: false,
    popular: true,
  },
  BOSL2: {
    id: 'BOSL2',
    name: 'BOSL2',
    description: 'Advanced geometric primitives, attachments, rounding',
    license: 'BSD-2-Clause',
    repository: 'https://github.com/BelfrySCAD/BOSL2',
    path: '/libraries/BOSL2',
    icon: '🔷',
    enabled: false,
    popular: true,
    requirements: 'OpenSCAD 2021.01+',
  },
  NopSCADlib: {
    id: 'NopSCADlib',
    name: 'NopSCADlib',
    description: 'Parts library for 3D printers and enclosures',
    license: 'GPL-3.0',
    repository: 'https://github.com/nophead/NopSCADlib',
    path: '/libraries/NopSCADlib',
    icon: '🖨️',
    enabled: false,
    popular: false,
  },
  dotSCAD: {
    id: 'dotSCAD',
    name: 'dotSCAD',
    description: 'Artistic patterns, dots, and lines',
    license: 'LGPL-3.0',
    repository: 'https://github.com/JustinSDK/dotSCAD',
    path: '/libraries/dotSCAD',
    icon: '🎨',
    enabled: false,
    popular: false,
  },
};

/**
 * Detect library usage in OpenSCAD code
 * @param {string} scadContent - OpenSCAD source code
 * @returns {Array<string>} Array of detected library IDs
 */
export function detectLibraries(scadContent) {
  const detected = new Set();
  
  // Match include/use statements
  const includePattern = /(?:include|use)\s*<([^>]+)>/g;
  let match;
  
  while ((match = includePattern.exec(scadContent)) !== null) {
    const includePath = match[1];
    
    // Check which library it belongs to
    for (const libId of Object.keys(LIBRARY_DEFINITIONS)) {
      if (includePath.startsWith(libId + '/')) {
        detected.add(libId);
      }
    }
  }
  
  return Array.from(detected);
}

/**
 * LibraryManager class for managing library state and operations
 */
export class LibraryManager {
  constructor() {
    this.libraries = { ...LIBRARY_DEFINITIONS };
    this.loadState();
    this.listeners = [];
  }

  /**
   * Load library state from localStorage
   */
  loadState() {
    try {
      // Check if localStorage is available (browser environment)
      if (typeof localStorage === 'undefined') {
        return; // Skip in Node.js environment
      }
      
      const saved = localStorage.getItem('openscad-customizer-libraries');
      if (saved) {
        const state = JSON.parse(saved);
        // Merge saved enabled state with definitions
        for (const [id, lib] of Object.entries(state)) {
          if (this.libraries[id]) {
            this.libraries[id].enabled = lib.enabled ?? false;
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load library state:', error);
    }
  }

  /**
   * Save library state to localStorage
   */
  saveState() {
    try {
      // Check if localStorage is available (browser environment)
      if (typeof localStorage === 'undefined') {
        return; // Skip in Node.js environment
      }
      
      const state = {};
      for (const [id, lib] of Object.entries(this.libraries)) {
        state[id] = { enabled: lib.enabled };
      }
      localStorage.setItem('openscad-customizer-libraries', JSON.stringify(state));
    } catch (error) {
      console.warn('Failed to save library state:', error);
    }
  }

  /**
   * Enable a library
   * @param {string} libraryId - Library ID to enable
   */
  enable(libraryId) {
    if (this.libraries[libraryId]) {
      this.libraries[libraryId].enabled = true;
      this.saveState();
      this.notifyListeners('enable', libraryId);
    }
  }

  /**
   * Disable a library
   * @param {string} libraryId - Library ID to disable
   */
  disable(libraryId) {
    if (this.libraries[libraryId]) {
      this.libraries[libraryId].enabled = false;
      this.saveState();
      this.notifyListeners('disable', libraryId);
    }
  }

  /**
   * Toggle a library's enabled state
   * @param {string} libraryId - Library ID to toggle
   */
  toggle(libraryId) {
    if (this.libraries[libraryId]) {
      this.libraries[libraryId].enabled = !this.libraries[libraryId].enabled;
      this.saveState();
      this.notifyListeners('toggle', libraryId);
    }
  }

  /**
   * Get list of enabled libraries
   * @returns {Array<Object>} Array of enabled library objects
   */
  getEnabled() {
    return Object.values(this.libraries).filter(lib => lib.enabled);
  }

  /**
   * Get library by ID
   * @param {string} libraryId - Library ID
   * @returns {Object|null} Library object or null
   */
  get(libraryId) {
    return this.libraries[libraryId] || null;
  }

  /**
   * Get all libraries
   * @returns {Object} All library definitions
   */
  getAll() {
    return { ...this.libraries };
  }

  /**
   * Check if a library is enabled
   * @param {string} libraryId - Library ID
   * @returns {boolean} True if enabled
   */
  isEnabled(libraryId) {
    return this.libraries[libraryId]?.enabled ?? false;
  }

  /**
   * Get library paths to mount in virtual filesystem
   * @returns {Array<Object>} Array of {id, path} objects for enabled libraries
   */
  getMountPaths() {
    return this.getEnabled().map(lib => ({
      id: lib.id,
      path: lib.path,
    }));
  }

  /**
   * Auto-enable libraries detected in code
   * @param {string} scadContent - OpenSCAD source code
   * @returns {Array<string>} Array of auto-enabled library IDs
   */
  autoEnable(scadContent) {
    const detected = detectLibraries(scadContent);
    const autoEnabled = [];
    
    for (const libId of detected) {
      if (!this.isEnabled(libId)) {
        this.enable(libId);
        autoEnabled.push(libId);
      }
    }
    
    return autoEnabled;
  }

  /**
   * Subscribe to library changes
   * @param {Function} callback - Callback function (action, libraryId)
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Notify all listeners of a change
   * @param {string} action - Action type (enable, disable, toggle)
   * @param {string} libraryId - Library ID that changed
   */
  notifyListeners(action, libraryId) {
    for (const callback of this.listeners) {
      try {
        callback(action, libraryId, this.libraries[libraryId]);
      } catch (error) {
        console.error('Library listener error:', error);
      }
    }
  }

  /**
   * Get usage statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const all = Object.values(this.libraries);
    const enabled = all.filter(lib => lib.enabled);
    const popular = all.filter(lib => lib.popular);
    
    return {
      total: all.length,
      enabled: enabled.length,
      disabled: all.length - enabled.length,
      popular: popular.length,
    };
  }

  /**
   * Reset all libraries to disabled state
   */
  reset() {
    for (const lib of Object.values(this.libraries)) {
      lib.enabled = false;
    }
    this.saveState();
    this.notifyListeners('reset', null);
  }

  /**
   * Check if libraries are available
   * @returns {Promise<Object>} Availability status for each library
   */
  async checkAvailability() {
    const availability = {};
    
    for (const [id, lib] of Object.entries(this.libraries)) {
      try {
        // Try to fetch manifest or a test file
        const response = await fetch(`${lib.path}/`, { method: 'HEAD' });
        availability[id] = response.ok;
      } catch (error) {
        availability[id] = false;
      }
    }
    
    return availability;
  }

  /**
   * Get library manifest
   * @returns {Promise<Object>} Library manifest data
   */
  async getManifest() {
    try {
      const response = await fetch('/libraries/manifest.json');
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn('Failed to load library manifest:', error);
    }
    return null;
  }
}

// Create singleton instance
export const libraryManager = new LibraryManager();

export default libraryManager;
