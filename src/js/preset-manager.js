/**
 * Preset Manager - Save and load parameter presets
 * Storage namespace/migration to preserve presets across app updates
 * @license GPL-3.0-or-later
 */

// Import validation at module level
let validatePresetsCollectionFn = null;
(async () => {
  const { validatePresetsCollection } = await import('./validation-schemas.js');
  validatePresetsCollectionFn = validatePresetsCollection;
})();

// ============================================================================
// Storage Schema Versioning
// Problem: uploading new design versions can delete saved presets.
// Solution: versioned storage with migration support.
// ============================================================================

/**
 * Current storage schema version
 * Increment when storage format changes to trigger migration
 */
export const STORAGE_SCHEMA_VERSION = 2;

/**
 * Storage keys - current and legacy
 */
const STORAGE_KEYS = {
  current: 'openscad-forge-presets-v2',
  legacy: [
    'openscad-customizer-presets', // Original format (v1, unversioned)
    'openscad-forge-presets-v1',   // If we ever used this
  ],
  backup: 'openscad-forge-presets-backup',
  migrationFlag: 'openscad-forge-migration-offered',
};

/**
 * Detect storage format version from data structure
 * @param {*} data - Parsed storage data
 * @returns {number} Version number (0 = unknown, 1 = legacy, 2+ = versioned)
 */
function detectStorageVersion(data) {
  if (!data || typeof data !== 'object') return 0;
  
  // Check for versioned wrapper
  if ('version' in data && 'presets' in data) {
    return data.version;
  }
  
  // Check for legacy format (raw presets by model name)
  // Legacy format: { "model.scad": [{ id, name, parameters, ... }], ... }
  const keys = Object.keys(data);
  if (keys.length === 0) return 0;
  
  // Check if it looks like legacy presets (arrays of preset objects)
  const firstValue = data[keys[0]];
  if (Array.isArray(firstValue)) {
    // Likely legacy format
    return 1;
  }
  
  return 0;
}

/**
 * Check if migration is available (legacy data exists)
 * @returns {Object} Migration availability info
 */
export function checkMigrationAvailable() {
  const result = {
    available: false,
    legacyKey: null,
    legacyPresetCount: 0,
    legacyModelCount: 0,
    alreadyOffered: false,
  };
  
  try {
    // Check if migration was already offered
    result.alreadyOffered = localStorage.getItem(STORAGE_KEYS.migrationFlag) === 'true';
    
    // Check each legacy key
    for (const key of STORAGE_KEYS.legacy) {
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          const data = JSON.parse(stored);
          const version = detectStorageVersion(data);
          
          if (version === 1) {
            // Count presets in legacy data
            let presetCount = 0;
            const modelCount = Object.keys(data).length;
            
            for (const modelPresets of Object.values(data)) {
              if (Array.isArray(modelPresets)) {
                presetCount += modelPresets.length;
              }
            }
            
            if (presetCount > 0) {
              result.available = true;
              result.legacyKey = key;
              result.legacyPresetCount = presetCount;
              result.legacyModelCount = modelCount;
              break; // Found legacy data, stop searching
            }
          }
        } catch {
          // Invalid JSON, skip this key
        }
      }
    }
  } catch (error) {
    console.warn('[PresetManager] Error checking migration availability:', error);
  }
  
  return result;
}

/**
 * Perform migration from legacy storage to current version
 * @param {Object} options - Migration options
 * @param {boolean} [options.createBackup=true] - Create backup before migration
 * @param {boolean} [options.deleteLegacy=false] - Delete legacy data after migration
 * @returns {Object} Migration result
 */
export function migrateFromLegacyStorage(options = {}) {
  const { createBackup = true, deleteLegacy = false } = options;
  
  const result = {
    success: false,
    migratedPresets: 0,
    migratedModels: 0,
    backupCreated: false,
    errors: [],
  };
  
  try {
    const migrationInfo = checkMigrationAvailable();
    
    if (!migrationInfo.available) {
      result.errors.push('No legacy data found to migrate');
      return result;
    }
    
    // Load legacy data
    const legacyRaw = localStorage.getItem(migrationInfo.legacyKey);
    const legacyData = JSON.parse(legacyRaw);
    
    // Create backup if requested
    if (createBackup) {
      try {
        const backupData = {
          timestamp: Date.now(),
          source: migrationInfo.legacyKey,
          data: legacyData,
        };
        localStorage.setItem(STORAGE_KEYS.backup, JSON.stringify(backupData));
        result.backupCreated = true;
        console.log('[PresetManager] Created backup of legacy presets');
      } catch (error) {
        result.errors.push(`Backup failed: ${error.message}`);
        // Continue with migration anyway
      }
    }
    
    // Load current data (if any)
    let currentData = {};
    try {
      const currentRaw = localStorage.getItem(STORAGE_KEYS.current);
      if (currentRaw) {
        const parsed = JSON.parse(currentRaw);
        if (parsed.version === STORAGE_SCHEMA_VERSION && parsed.presets) {
          currentData = parsed.presets;
        }
      }
    } catch {
      // No current data or invalid, start fresh
    }
    
    // Merge legacy presets into current data
    for (const [modelName, presets] of Object.entries(legacyData)) {
      if (!Array.isArray(presets)) continue;
      
      if (!currentData[modelName]) {
        currentData[modelName] = [];
      }
      
      // Add presets, avoiding duplicates by ID
      const existingIds = new Set(currentData[modelName].map(p => p.id));
      
      for (const preset of presets) {
        if (!existingIds.has(preset.id)) {
          // Add migration metadata
          preset.migratedFrom = migrationInfo.legacyKey;
          preset.migratedAt = Date.now();
          currentData[modelName].push(preset);
          result.migratedPresets++;
          existingIds.add(preset.id);
        }
      }
      
      result.migratedModels++;
    }
    
    // Save migrated data in versioned format
    const versionedData = {
      version: STORAGE_SCHEMA_VERSION,
      presets: currentData,
      lastMigration: Date.now(),
    };
    
    localStorage.setItem(STORAGE_KEYS.current, JSON.stringify(versionedData));
    
    // Mark migration as complete
    localStorage.setItem(STORAGE_KEYS.migrationFlag, 'true');
    
    // Optionally delete legacy data
    if (deleteLegacy) {
      try {
        localStorage.removeItem(migrationInfo.legacyKey);
        console.log(`[PresetManager] Deleted legacy storage: ${migrationInfo.legacyKey}`);
      } catch {
        // Non-critical error
      }
    }
    
    result.success = true;
    console.log(
      `[PresetManager] Migration complete: ${result.migratedPresets} presets from ${result.migratedModels} models`
    );
    
  } catch (error) {
    result.errors.push(`Migration failed: ${error.message}`);
    console.error('[PresetManager] Migration error:', error);
  }
  
  return result;
}

/**
 * Dismiss migration offer (don't show again)
 */
export function dismissMigrationOffer() {
  try {
    localStorage.setItem(STORAGE_KEYS.migrationFlag, 'true');
    console.log('[PresetManager] Migration offer dismissed');
  } catch {
    // Non-critical
  }
}

/**
 * Reset migration flag (for testing or re-offering migration)
 */
export function resetMigrationFlag() {
  try {
    localStorage.removeItem(STORAGE_KEYS.migrationFlag);
    console.log('[PresetManager] Migration flag reset');
  } catch {
    // Non-critical
  }
}

/**
 * Detect if JSON data is in OpenSCAD native format (parameterSets)
 * OpenSCAD native format: { parameterSets: {...}, fileFormatVersion: "1" }
 * Note: fileFormatVersion may be missing in some older exports
 * @param {Object} data - Parsed JSON data
 * @returns {boolean} True if OpenSCAD native format
 */
function isOpenSCADNativeFormat(data) {
  if (!data || typeof data !== 'object') return false;
  
  // Check for parameterSets object
  if (!('parameterSets' in data) || typeof data.parameterSets !== 'object') {
    return false;
  }
  
  // Must have at least one preset in parameterSets
  const presetCount = Object.keys(data.parameterSets).length;
  if (presetCount === 0) {
    return false;
  }
  
  // fileFormatVersion is optional (some older exports may not have it)
  // If present, it should be a string
  if ('fileFormatVersion' in data && typeof data.fileFormatVersion !== 'string') {
    return false;
  }
  
  console.log(`[PresetManager] Detected OpenSCAD native format with ${presetCount} preset(s)`);
  return true;
}

/**
 * Detect if JSON data is in Forge format
 * @param {Object} data - Parsed JSON data
 * @returns {boolean} True if Forge format
 */
function isForgeFormat(data) {
  return (
    data &&
    typeof data === 'object' &&
    data.type &&
    (data.type === 'openscad-preset' ||
      data.type === 'openscad-presets-collection')
  );
}

/**
 * Coerce string values to proper types based on parameter schema
 * OpenSCAD stores all preset values as strings, but Forge needs proper types
 * @param {Object} presetValues - Raw preset values (potentially all strings)
 * @param {Object} paramSchema - Parameter schema from extractParameters()
 * @returns {Object} - Coerced values with proper types
 */
export function coercePresetValues(presetValues, paramSchema = {}) {
  const coerced = {};

  for (const [key, value] of Object.entries(presetValues)) {
    // Find parameter definition in schema
    const paramDef = paramSchema[key];

    if (!paramDef) {
      // Parameter not in schema, try to detect type from value
      coerced[key] = autoDetectType(value);
      continue;
    }

    // Coerce based on parameter type in schema
    coerced[key] = coerceToType(value, paramDef.type);
  }

  return coerced;
}

/**
 * Auto-detect type from a value (for parameters not in schema)
 * 
 * IMPORTANT: "yes"/"no" are NOT converted to boolean here because without
 * schema context we cannot distinguish between a boolean parameter (MW_version = false)
 * and a string dropdown parameter (expose_home_button = "yes"; //[yes,no]).
 * Converting "yes"/"no" to boolean breaks OpenSCAD string comparisons like
 * `if (expose_home_button == "yes")` because `true != "yes"` in OpenSCAD.
 * 
 * Only "true"/"false" are converted (these are unambiguously boolean literals).
 * 
 * @param {*} value - The value to detect type for
 * @returns {*} - Value with proper type
 */
function autoDetectType(value) {
  if (typeof value !== 'string') return value;

  // Only convert unambiguous boolean literals (not "yes"/"no" which may be string dropdowns)
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Check for array/vector notation
  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  // Check for number
  const num = parseFloat(value);
  if (!isNaN(num) && String(num) === value.trim()) {
    return num;
  }

  // Keep as string (including "yes"/"no" -- safe default without schema)
  return value;
}

/**
 * Coerce a value to a specific type
 * @param {*} value - The value to coerce
 * @param {string} targetType - Target type (integer, number, boolean, string, etc.)
 * @returns {*} - Coerced value
 */
function coerceToType(value, targetType) {
  if (value === null || value === undefined) return value;

  switch (targetType) {
    case 'integer':
      if (typeof value === 'number') return Math.round(value);
      if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? value : parsed;
      }
      return value;

    case 'number':
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? value : parsed;
      }
      return value;

    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const lower = value.toLowerCase();
        if (lower === 'true' || lower === 'yes') return true;
        if (lower === 'false' || lower === 'no') return false;
      }
      return !!value;

    case 'vector':
    case 'array':
      if (Array.isArray(value)) return value;
      if (typeof value === 'string' && value.startsWith('[')) {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;

    case 'string':
    default:
      return String(value);
  }
}

/**
 * Convert a Forge preset value to OpenSCAD string format
 * @param {*} value - Value to stringify
 * @returns {string} - Stringified value
 */
function stringifyForOpenSCAD(value) {
  if (value === null || value === undefined) return '';

  if (typeof value === 'boolean') {
    // OpenSCAD conventionally uses "true"/"false" strings
    return value ? 'true' : 'false';
  }

  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * Detect if JSON data is in OpenSCAD native format (parameterSets)
 * @param {Object} data - Parsed JSON data
 * @returns {boolean} True if OpenSCAD native format
 */
function isOpenSCADNativeFormat(data) {
  return (
    data &&
    typeof data === 'object' &&
    'parameterSets' in data &&
    typeof data.parameterSets === 'object' &&
    'fileFormatVersion' in data
  );
}

/**
 * Detect if JSON data is in Forge format
 * @param {Object} data - Parsed JSON data
 * @returns {boolean} True if Forge format
 */
function isForgeFormat(data) {
  return (
    data &&
    typeof data === 'object' &&
    data.type &&
    (data.type === 'openscad-preset' ||
      data.type === 'openscad-presets-collection')
  );
}

/**
 * Coerce string values to proper types based on parameter schema
 * OpenSCAD stores all preset values as strings, but Forge needs proper types
 * @param {Object} presetValues - Raw preset values (potentially all strings)
 * @param {Object} paramSchema - Parameter schema from extractParameters()
 * @returns {Object} - Coerced values with proper types
 */
export function coercePresetValues(presetValues, paramSchema = {}) {
  const coerced = {};

  for (const [key, value] of Object.entries(presetValues)) {
    // Find parameter definition in schema
    const paramDef = paramSchema[key];

    if (!paramDef) {
      // Parameter not in schema, try to detect type from value
      coerced[key] = autoDetectType(value);
      continue;
    }

    // Coerce based on parameter type in schema
    coerced[key] = coerceToType(value, paramDef.type);
  }

  return coerced;
}

/**
 * Auto-detect type from a value (for parameters not in schema)
 * @param {*} value - The value to detect type for
 * @returns {*} - Value with proper type
 */
function autoDetectType(value) {
  if (typeof value !== 'string') return value;

  // Check for boolean strings
  if (value === 'true' || value === 'yes') return true;
  if (value === 'false' || value === 'no') return false;

  // Check for array/vector notation
  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  // Check for number
  const num = parseFloat(value);
  if (!isNaN(num) && String(num) === value.trim()) {
    return num;
  }

  // Keep as string
  return value;
}

/**
 * Coerce a value to a specific type
 * @param {*} value - The value to coerce
 * @param {string} targetType - Target type (integer, number, boolean, string, etc.)
 * @returns {*} - Coerced value
 */
function coerceToType(value, targetType) {
  if (value === null || value === undefined) return value;

  switch (targetType) {
    case 'integer':
      if (typeof value === 'number') return Math.round(value);
      if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? value : parsed;
      }
      return value;

    case 'number':
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? value : parsed;
      }
      return value;

    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const lower = value.toLowerCase();
        if (lower === 'true' || lower === 'yes') return true;
        if (lower === 'false' || lower === 'no') return false;
      }
      return !!value;

    case 'vector':
    case 'array':
      if (Array.isArray(value)) return value;
      if (typeof value === 'string' && value.startsWith('[')) {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;

    case 'string':
    default:
      return String(value);
  }
}

/**
 * Convert a Forge preset value to OpenSCAD string format
 * @param {*} value - Value to stringify
 * @returns {string} - Stringified value
 */
function stringifyForOpenSCAD(value) {
  if (value === null || value === undefined) return '';

  if (typeof value === 'boolean') {
    // OpenSCAD conventionally uses "true"/"false" strings
    return value ? 'true' : 'false';
  }

  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * PresetManager handles saving, loading, and managing parameter presets
 * Storage versioning to preserve presets across app updates
 */
export class PresetManager {
  constructor() {
    // Use versioned storage key
    this.storageKey = STORAGE_KEYS.current;
    this.legacyStorageKey = STORAGE_KEYS.legacy[0]; // For backwards compatibility
    this.presets = this.loadAllPresets();
    this.listeners = [];
  }

  /**
   * Get all presets for the current model
   * @param {string} modelName - Name of the model
   * @returns {Array} Array of presets for this model
   */
  getPresetsForModel(modelName) {
    if (!modelName) return [];
    return this.presets[modelName] || [];
  }

  /**
   * Save a new preset
   * @param {string} modelName - Name of the model
   * @param {string} presetName - Name for the preset
   * @param {Object} parameters - Parameter values to save
   * @param {Object} options - Optional metadata (description, etc.)
   * @returns {Object} The saved preset
   */
  savePreset(modelName, presetName, parameters, options = {}) {
    if (!modelName || !presetName || !parameters) {
      throw new Error('Model name, preset name, and parameters are required');
    }

    // Sanitize preset name
    const sanitized = presetName.trim();
    if (!sanitized) {
      throw new Error('Preset name cannot be empty');
    }

    // Initialize model presets if needed
    if (!this.presets[modelName]) {
      this.presets[modelName] = [];
    }

    // Check for duplicate name
    const existingIndex = this.presets[modelName].findIndex(
      (p) => p.name === sanitized
    );

    const preset = {
      id:
        existingIndex >= 0
          ? this.presets[modelName][existingIndex].id
          : this.generateId(),
      name: sanitized,
      parameters: { ...parameters },
      description: options.description || '',
      created:
        existingIndex >= 0
          ? this.presets[modelName][existingIndex].created
          : Date.now(),
      modified: Date.now(),
    };

    // Replace existing or add new
    if (existingIndex >= 0) {
      this.presets[modelName][existingIndex] = preset;
      console.log(`Updated preset: ${sanitized}`);
    } else {
      this.presets[modelName].push(preset);
      console.log(`Saved preset: ${sanitized}`);
    }

    this.persist();
    this.notifyListeners('save', preset, modelName);
    return preset;
  }

  /**
   * Load a preset by ID
   * @param {string} modelName - Name of the model
   * @param {string} presetId - ID of the preset
   * @returns {Object|null} The preset or null if not found
   */
  loadPreset(modelName, presetId) {
    if (!modelName || !presetId) return null;

    const modelPresets = this.presets[modelName];
    if (!modelPresets) return null;

    const preset = modelPresets.find((p) => p.id === presetId);
    if (preset) {
      console.log(`Loaded preset: ${preset.name}`);
      console.debug('[PresetManager] Preset load details:', {
        name: preset.name,
        id: preset.id,
        parameterCount: Object.keys(preset.parameters || {}).length,
        parameterKeys: Object.keys(preset.parameters || {}),
      });
      this.notifyListeners('load', preset, modelName);
    }
    return preset;
  }

  /**
   * Delete a preset
   * @param {string} modelName - Name of the model
   * @param {string} presetId - ID of the preset to delete
   * @returns {boolean} True if deleted successfully
   */
  deletePreset(modelName, presetId) {
    if (!modelName || !presetId) return false;

    const modelPresets = this.presets[modelName];
    if (!modelPresets) return false;

    const index = modelPresets.findIndex((p) => p.id === presetId);
    if (index < 0) return false;

    const deleted = modelPresets.splice(index, 1)[0];

    // Clean up empty model entries
    if (modelPresets.length === 0) {
      delete this.presets[modelName];
    }

    this.persist();
    console.log(`Deleted preset: ${deleted.name}`);
    this.notifyListeners('delete', deleted, modelName);
    return true;
  }

  /**
   * Rename a preset
   * @param {string} modelName - Name of the model
   * @param {string} presetId - ID of the preset
   * @param {string} newName - New name for the preset
   * @returns {boolean} True if renamed successfully
   */
  renamePreset(modelName, presetId, newName) {
    const preset = this.loadPreset(modelName, presetId);
    if (!preset) return false;

    const sanitized = newName.trim();
    if (!sanitized) return false;

    // Check for duplicate name
    const modelPresets = this.presets[modelName];
    const duplicate = modelPresets.find(
      (p) => p.id !== presetId && p.name === sanitized
    );
    if (duplicate) {
      throw new Error('A preset with this name already exists');
    }

    preset.name = sanitized;
    preset.modified = Date.now();
    this.persist();
    this.notifyListeners('rename', preset, modelName);
    return true;
  }

  /**
   * Export preset as JSON
   * @param {string} modelName - Name of the model
   * @param {string} presetId - ID of the preset
   * @returns {string} JSON string
   */
  exportPreset(modelName, presetId) {
    const preset = this.loadPreset(modelName, presetId);
    if (!preset) return null;

    const exportData = {
      version: '1.0.0',
      type: 'openscad-preset',
      modelName,
      preset: {
        name: preset.name,
        description: preset.description,
        parameters: preset.parameters,
        created: preset.created,
      },
      exported: Date.now(),
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export all presets for a model
   * @param {string} modelName - Name of the model
   * @returns {string} JSON string
   */
  exportAllPresets(modelName) {
    const presets = this.getPresetsForModel(modelName);
    if (!presets || presets.length === 0) return null;

    const exportData = {
      version: '1.0.0',
      type: 'openscad-presets-collection',
      modelName,
      presets: presets.map((p) => ({
        name: p.name,
        description: p.description,
        parameters: p.parameters,
        created: p.created,
      })),
      exported: Date.now(),
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export presets to OpenSCAD native format (parameterSets)
   * This format is compatible with OpenSCAD's built-in Customizer
   * @param {string} modelName - Name of the model
   * @returns {string} JSON string in OpenSCAD native format
   */
  exportOpenSCADNativeFormat(modelName, hiddenParameters = {}) {
    const presets = this.getPresetsForModel(modelName);

    // Build parameterSets object
    const parameterSets = {};

    // "design default values" is ALWAYS first in export (desktop OpenSCAD parity)
    // Empty object {} signals "use whatever the .scad source defines"
    parameterSets['design default values'] = {};

    if (presets && presets.length > 0) {
      for (const preset of presets) {
        // Convert all values to strings (OpenSCAD requirement)
        const stringifiedParams = {};
        for (const [key, value] of Object.entries(preset.parameters)) {
          stringifiedParams[key] = stringifyForOpenSCAD(value);
        }
        // Desktop parity: Hidden parameters ARE included in exported JSON
        // (current values at time of export, not from the preset itself)
        if (hiddenParameters && Object.keys(hiddenParameters).length > 0) {
          for (const [key, hiddenDef] of Object.entries(hiddenParameters)) {
            if (!(key in stringifiedParams)) {
              stringifiedParams[key] = stringifyForOpenSCAD(hiddenDef.value);
            }
          }
        }
        parameterSets[preset.name] = stringifiedParams;
      }
    }

    // Create OpenSCAD native structure
    const openscadJSON = {
      parameterSets: parameterSets,
      fileFormatVersion: '1',
    };

    return JSON.stringify(openscadJSON, null, 2);
  }

  /**
   * Export a single preset to OpenSCAD native format
   * @param {string} modelName - Name of the model
   * @param {string} presetId - ID of the preset
   * @returns {string} JSON string in OpenSCAD native format
   */
  exportPresetOpenSCADNative(modelName, presetId) {
    const preset = this.loadPreset(modelName, presetId);
    if (!preset) return null;

    // Convert values to strings
    const stringifiedParams = {};
    for (const [key, value] of Object.entries(preset.parameters)) {
      stringifiedParams[key] = stringifyForOpenSCAD(value);
    }

    // Create OpenSCAD native structure with single preset
    const openscadJSON = {
      parameterSets: {
        [preset.name]: stringifiedParams,
      },
      fileFormatVersion: '1',
    };

    return JSON.stringify(openscadJSON, null, 2);
  }

  /**
   * Export changed parameters (diff from defaults)
   * Useful for troubleshooting and sharing minimal configurations
   * @param {Object} currentParams - Current parameter values
   * @param {Object} defaultParams - Default parameter values (from extractParameters)
   * @returns {Object} Object containing only changed parameters
   */
  getChangedParameters(currentParams, defaultParams) {
    const changed = {};

    for (const [key, value] of Object.entries(currentParams)) {
      const defaultValue = defaultParams[key]?.default;

      // Compare values (handle type differences)
      if (!this.valuesEqual(value, defaultValue)) {
        changed[key] = {
          current: value,
          default: defaultValue,
        };
      }
    }

    return changed;
  }

  /**
   * Compare two values for equality (handles type coercion)
   * @param {*} a - First value
   * @param {*} b - Second value
   * @returns {boolean} True if values are equal
   */
  valuesEqual(a, b) {
    // Handle null/undefined
    if (a === null || a === undefined) return b === null || b === undefined;
    if (b === null || b === undefined) return false;

    // Handle arrays
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, idx) => this.valuesEqual(val, b[idx]));
    }

    // Handle numbers with floating point tolerance
    if (typeof a === 'number' && typeof b === 'number') {
      return Math.abs(a - b) < 0.0001;
    }

    // Handle string/number comparison
    if (typeof a === 'string' && typeof b === 'number') {
      return parseFloat(a) === b;
    }
    if (typeof a === 'number' && typeof b === 'string') {
      return a === parseFloat(b);
    }

    // Handle boolean/string comparison (OpenSCAD "yes"/"no")
    if (typeof a === 'boolean' && typeof b === 'string') {
      const bLower = b.toLowerCase();
      return (
        (a === true && (bLower === 'yes' || bLower === 'true')) ||
        (a === false && (bLower === 'no' || bLower === 'false'))
      );
    }
    if (typeof a === 'string' && typeof b === 'boolean') {
      const aLower = a.toLowerCase();
      return (
        (b === true && (aLower === 'yes' || aLower === 'true')) ||
        (b === false && (aLower === 'no' || aLower === 'false'))
      );
    }

    // Default strict equality
    return a === b;
  }

  /**
   * Export changed parameters as JSON (for troubleshooting/support)
   * @param {Object} currentParams - Current parameter values
   * @param {Object} defaultParams - Default parameter values
   * @param {string} modelName - Name of the model
   * @returns {string} JSON string with changed parameters
   */
  exportChangedParametersJSON(currentParams, defaultParams, modelName) {
    const changed = this.getChangedParameters(currentParams, defaultParams);

    // Count changes
    const changeCount = Object.keys(changed).length;
    if (changeCount === 0) {
      return JSON.stringify(
        {
          message: 'No parameters have been changed from defaults',
          modelName,
          exported: new Date().toISOString(),
        },
        null,
        2
      );
    }

    // Build export structure
    const exportData = {
      type: 'openscad-changed-parameters',
      modelName,
      changeCount,
      parameters: changed,
      exported: new Date().toISOString(),
      note: 'Only non-default parameter values are shown',
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import multiple preset files and merge them
   * @param {Array<string>} jsonStrings - Array of JSON strings to import
   * @param {string} modelName - Model name for OpenSCAD native format
   * @param {Object} paramSchema - Parameter schema for type coercion
   * @param {string} conflictStrategy - 'keep', 'overwrite', or 'rename'
   * @returns {Object} Merge result
   */
  importAndMergePresets(
    jsonStrings,
    modelName,
    paramSchema = {},
    conflictStrategy = 'rename'
  ) {
    const allResults = [];
    let totalImported = 0;
    let totalSkipped = 0;
    const errors = [];
    const presetNames = new Set();

    // Get existing preset names
    const existingPresets = this.getPresetsForModel(modelName);
    existingPresets.forEach((p) => presetNames.add(p.name));

    for (let i = 0; i < jsonStrings.length; i++) {
      try {
        const data = JSON.parse(jsonStrings[i]);
        let presetsToImport = [];

        // Convert to common format
        if (isOpenSCADNativeFormat(data)) {
          for (const [name, params] of Object.entries(data.parameterSets)) {
            presetsToImport.push({
              name,
              parameters: coercePresetValues(params, paramSchema),
            });
          }
        } else if (isForgeFormat(data)) {
          if (data.type === 'openscad-preset') {
            presetsToImport.push({
              name: data.preset.name,
              parameters: data.preset.parameters,
            });
          } else {
            presetsToImport = data.presets.map((p) => ({
              name: p.name,
              parameters: p.parameters,
            }));
          }
        } else {
          errors.push(`File ${i + 1}: Invalid format`);
          continue;
        }

        // Process presets with conflict handling
        for (const preset of presetsToImport) {
          let finalName = preset.name;

          if (presetNames.has(finalName)) {
            switch (conflictStrategy) {
              case 'keep':
                // Skip duplicate
                totalSkipped++;
                continue;
              case 'overwrite':
                // Will overwrite via savePreset
                break;
              case 'rename':
              default: {
                // Append (2), (3), etc.
                let counter = 2;
                while (presetNames.has(finalName)) {
                  finalName = `${preset.name} (${counter})`;
                  counter++;
                }
                break;
              }
            }
          }

          presetNames.add(finalName);
          const result = this.savePreset(
            modelName,
            finalName,
            preset.parameters,
            {
              description:
                preset.name !== finalName
                  ? `Renamed from "${preset.name}"`
                  : '',
            }
          );
          allResults.push(result);
          totalImported++;
        }
      } catch (error) {
        errors.push(`File ${i + 1}: ${error.message}`);
      }
    }

    return {
      success: errors.length === 0,
      imported: totalImported,
      skipped: totalSkipped,
      presets: allResults,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Import preset from JSON
   * Supports both Forge format and OpenSCAD native format (parameterSets)
   * Multi-preset JSON import must work reliably
   * @param {string} json - JSON string
   * @param {string} modelName - Optional model name (required for OpenSCAD native format)
   * @param {Object} paramSchema - Optional parameter schema for type coercion
   * @returns {Object} Import result with status and details
   */
  importPreset(json, modelName = null, paramSchema = {}, hiddenParameterNames = []) {
    try {
      const data = JSON.parse(json);

      // Debug logging for preset import diagnostics
      console.log('[PresetManager] Import attempt:', {
        modelName,
        hasParamSchema: Object.keys(paramSchema || {}).length > 0,
        dataKeys: Object.keys(data),
        hasParameterSets: 'parameterSets' in data,
        hasType: 'type' in data,
      });

      // Check for OpenSCAD native format first
      if (isOpenSCADNativeFormat(data)) {
        console.log('[PresetManager] Detected OpenSCAD native format');
        return this.importOpenSCADNativePresets(data, modelName, paramSchema, hiddenParameterNames);
      }

      // Check for Forge format
      if (isForgeFormat(data)) {
        console.log('[PresetManager] Detected Forge format');
        return this.importForgePresets(data, paramSchema);
      }

      // Unknown format - provide detailed error
      const formatHints = [];
      if (data.parameterSets) {
        formatHints.push('Has parameterSets but may be malformed');
      }
      if (data.type) {
        formatHints.push(`Has type: "${data.type}"`);
      }
      if (Array.isArray(data)) {
        formatHints.push('File is an array, not an object');
      }
      
      console.error('[PresetManager] Unknown format:', {
        dataType: typeof data,
        keys: Object.keys(data),
        hints: formatHints,
      });

      throw new Error(
        `Invalid preset file format. Expected Forge format (type: "openscad-preset") or OpenSCAD native format (parameterSets). ${formatHints.join('. ')}`
      );
    } catch (error) {
      console.error('[PresetManager] Import failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Import presets from Forge format JSON
   * @param {Object} data - Parsed Forge format data
   * @param {Object} paramSchema - Parameter schema for type coercion
   * @returns {Object} Import result
   */
  importForgePresets(data, paramSchema = {}) {
    let imported = 0;
    let skipped = 0;
    const results = [];

    if (data.type === 'openscad-preset') {
      // Single preset import
      const coercedParams = coercePresetValues(
        data.preset.parameters,
        paramSchema
      );
      const result = this.savePreset(
        data.modelName,
        data.preset.name,
        coercedParams,
        { description: data.preset.description }
      );
      imported = 1;
      results.push(result);
    } else if (data.type === 'openscad-presets-collection') {
      // Multiple presets import
      for (const preset of data.presets) {
        try {
          const coercedParams = coercePresetValues(
            preset.parameters,
            paramSchema
          );
          const result = this.savePreset(
            data.modelName,
            preset.name,
            coercedParams,
            { description: preset.description }
          );
          imported++;
          results.push(result);
        } catch (error) {
          console.warn(`Skipped preset ${preset.name}:`, error.message);
          skipped++;
        }
      }
    }

    return {
      success: true,
      imported,
      skipped,
      modelName: data.modelName,
      presets: results,
      format: 'forge',
    };
  }

  /**
   * Import presets from OpenSCAD native format (parameterSets)
   * { "parameterSets": { "iPad Pro 11 TouchChat": {...}, "iPad 9th Gen LAMP": {...} }, "fileFormatVersion": "1" }
   * @param {Object} data - Parsed OpenSCAD native format data
   * @param {string} modelName - Model name to associate presets with
   * @param {Object} paramSchema - Parameter schema for type coercion
   * @returns {Object} Import result
   */
  importOpenSCADNativePresets(data, modelName, paramSchema = {}, hiddenParameterNames = []) {
    const { parameterSets, fileFormatVersion } = data;

    // Validate format version (warn but continue for unknown versions)
    if (fileFormatVersion && fileFormatVersion !== '1') {
      console.warn(
        `[PresetManager] Unknown OpenSCAD preset file format version: ${fileFormatVersion}. Attempting import anyway.`
      );
    }

    // Defensive: ensure paramSchema is at least an empty object
    const safeSchema = paramSchema || {};

    // Desktop parity: Hidden parameter values in imported presets are IGNORED
    // "stored in the JSON file, but are not retrieved from the JSON file"
    const hiddenNames = new Set(hiddenParameterNames);

    // Model name is required for OpenSCAD native format
    // IMPORTANT: This must match state.uploadedFile.name for presets to show in dropdown
    const effectiveModelName = modelName || 'Unknown Model';

    let imported = 0;
    let skipped = 0;
    const results = [];
    const errors = [];
    const presetNames = Object.keys(parameterSets);

    console.log(
      `[PresetManager] Importing ${presetNames.length} OpenSCAD native preset(s)`,
      {
        modelName: effectiveModelName,
        presetNames,
        schemaParamCount: Object.keys(safeSchema).length,
      }
    );

    for (const [presetName, presetValues] of Object.entries(parameterSets)) {
      try {
        // Skip "design default values" -- it's a virtual entry (empty {}) that
        // the Forge generates from .scad source. Importing it would create a
        // stored preset that collides with the immutable virtual preset.
        if (presetName === 'design default values') {
          console.log(`[PresetManager] Skipping virtual preset: "${presetName}"`);
          continue;
        }

        // Debug: log first preset's structure
        if (imported === 0 && skipped === 0) {
          console.log(`[PresetManager] Sample preset "${presetName}":`, {
            paramCount: Object.keys(presetValues || {}).length,
            sampleParams: Object.keys(presetValues || {}).slice(0, 5),
          });
        }

        // Defensive: skip presets with no values or non-object values
        if (!presetValues || typeof presetValues !== 'object') {
          console.warn(`[PresetManager] Skipping preset "${presetName}": invalid values`);
          errors.push({ presetName, error: 'Invalid preset values (not an object)' });
          skipped++;
          continue;
        }

        // Coerce string values to proper types using schema
        // Try/catch per-preset so one bad preset doesn't block others
        let coercedValues;
        try {
          coercedValues = coercePresetValues(presetValues, safeSchema);
        } catch (coercionError) {
          console.warn(`[PresetManager] Coercion failed for "${presetName}", storing raw values:`, coercionError.message);
          // Fallback: store raw values without coercion
          coercedValues = { ...presetValues };
        }

        // Desktop parity: Strip hidden parameters from imported preset values
        // "stored in the JSON file, but are not retrieved from the JSON file"
        if (hiddenNames.size > 0) {
          for (const hiddenName of hiddenNames) {
            if (hiddenName in coercedValues) {
              delete coercedValues[hiddenName];
            }
          }
        }

        // Save the preset
        const result = this.savePreset(
          effectiveModelName,
          presetName,
          coercedValues,
          {
            description: `Imported from OpenSCAD preset file`,
          }
        );

        imported++;
        results.push(result);
        console.log(`[PresetManager] Imported preset: "${presetName}"`);
      } catch (error) {
        console.warn(
          `[PresetManager] Skipped preset "${presetName}":`,
          error.message
        );
        errors.push({ presetName, error: error.message });
        skipped++;
      }
    }

    console.log(`[PresetManager] Import complete:`, {
      imported,
      skipped,
      modelName: effectiveModelName,
      errors: errors.length > 0 ? errors : undefined,
    });

    return {
      success: true,
      imported,
      skipped,
      modelName: effectiveModelName,
      presets: results,
      format: 'openscad-native',
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Load all presets from localStorage
   * Supports both versioned (v2+) and legacy (v1) formats
   * @returns {Object} All presets organized by model name
   */
  loadAllPresets() {
    if (!this.isStorageAvailable()) {
      return {};
    }

    try {
      // Try loading from versioned storage first
      const stored = localStorage.getItem(this.storageKey);
      
      let presets = {};
      
      if (stored) {
        const data = JSON.parse(stored);
        
        // Check for versioned wrapper
        if (data.version && data.presets) {
          // Versioned format (v2+)
          presets = data.presets;
          console.log(
            `[PresetManager] Loaded v${data.version} presets: ${Object.keys(presets).length} models`
          );
        } else {
          // Unexpected format in versioned key - treat as presets
          presets = data;
        }
      } else {
        // No versioned data - check for legacy data (auto-migrate on first use)
        const legacyStored = localStorage.getItem(this.legacyStorageKey);
        if (legacyStored) {
          const legacyData = JSON.parse(legacyStored);
          const version = detectStorageVersion(legacyData);
          
          if (version === 1) {
            // Legacy format - use it directly but also save in new format
            presets = legacyData;
            console.log(
              `[PresetManager] Loaded legacy presets: ${Object.keys(presets).length} models (will migrate on save)`
            );
          }
        }
      }

      // Validate presets collections with Ajv (if available)
      if (validatePresetsCollectionFn && Object.keys(presets).length > 0) {
        const validatedData = {};

        for (const [modelName, modelPresets] of Object.entries(presets)) {
          const isValid = validatePresetsCollectionFn(modelPresets);
          if (isValid) {
            validatedData[modelName] = modelPresets;
          } else {
            console.warn(
              `[PresetManager] Invalid presets for model '${modelName}', skipping:`,
              validatePresetsCollectionFn.errors
            );
          }
        }

        console.log(
          `[PresetManager] Validated ${Object.keys(validatedData).length} model preset collections`
        );
        return validatedData;
      }

      return presets;
    } catch (error) {
      console.error('[PresetManager] Failed to load presets:', error);
      return {};
    }
  }

  /**
   * Persist presets to localStorage in versioned format
   * Storage versioning ensures presets survive app updates
   */
  persist() {
    if (!this.isStorageAvailable()) {
      console.warn('[PresetManager] localStorage not available, presets not saved');
      return;
    }

    try {
      // Save in versioned format
      const versionedData = {
        version: STORAGE_SCHEMA_VERSION,
        presets: this.presets,
        lastSaved: Date.now(),
      };
      
      const serialized = JSON.stringify(versionedData);
      localStorage.setItem(this.storageKey, serialized);
      console.log('[PresetManager] Presets saved (v' + STORAGE_SCHEMA_VERSION + ')');
    } catch (error) {
      console.error('[PresetManager] Failed to save presets:', error);
      if (error.name === 'QuotaExceededError') {
        // Dispatch a custom event for the UI layer to handle gracefully
        // instead of a raw alert() that blocks the thread.
        const event = new CustomEvent('storage-quota-exceeded', {
          detail: {
            source: 'preset-manager',
            message:
              'Storage is full. Your presets could not be saved. ' +
              'Try exporting your presets to a file, then clear old projects to free space.',
          },
        });
        document.dispatchEvent(event);
      }
    }
  }

  /**
   * Clear all presets (dangerous!)
   * @param {string} modelName - Optional: clear only for specific model
   */
  clearPresets(modelName = null) {
    if (modelName) {
      delete this.presets[modelName];
      console.log(`Cleared presets for model: ${modelName}`);
    } else {
      this.presets = {};
      console.log('Cleared all presets');
    }
    this.persist();
    this.notifyListeners('clear', null, modelName);
  }

  /**
   * Subscribe to preset changes
   * @param {Function} callback - Called with (action, preset, modelName)
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  /**
   * Notify all listeners of changes
   */
  notifyListeners(action, preset, modelName) {
    this.listeners.forEach((callback) => {
      try {
        callback(action, preset, modelName);
      } catch (error) {
        console.error('Preset listener error:', error);
      }
    });
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if localStorage is available
   */
  isStorageAvailable() {
    try {
      const test = '__preset_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get statistics about presets
   * @returns {Object} Statistics
   */
  getStats() {
    const modelCount = Object.keys(this.presets).length;
    let totalPresets = 0;
    for (const modelName in this.presets) {
      totalPresets += this.presets[modelName].length;
    }
    return {
      modelCount,
      totalPresets,
      models: Object.keys(this.presets),
    };
  }

  /**
   * Analyze preset compatibility with current schema
   * Detects missing, extra, and type-mismatched parameters
   * @param {Object} presetParams - Parameters from the preset
   * @param {Object} currentSchema - Current parameter schema
   * @returns {Object} Compatibility analysis
   */
  analyzePresetCompatibility(presetParams, currentSchema) {
    const presetKeys = new Set(Object.keys(presetParams));
    const schemaKeys = new Set(Object.keys(currentSchema));

    // Find parameters that exist in preset but not in schema (removed/renamed)
    const extraParams = [];
    for (const key of presetKeys) {
      if (!schemaKeys.has(key)) {
        extraParams.push(key);
      }
    }

    // Find parameters in schema that are missing from preset (new params)
    const missingParams = [];
    for (const key of schemaKeys) {
      if (!presetKeys.has(key)) {
        missingParams.push(key);
      }
    }

    // Find type mismatches for overlapping parameters
    const typeMismatches = [];
    for (const key of presetKeys) {
      if (schemaKeys.has(key) && currentSchema[key]) {
        const presetValue = presetParams[key];
        const expectedType = currentSchema[key].type;
        const actualType = Array.isArray(presetValue)
          ? 'array'
          : typeof presetValue;

        // Check for obvious type mismatches
        if (
          expectedType === 'boolean' &&
          typeof presetValue === 'string' &&
          !['true', 'false', 'yes', 'no'].includes(presetValue.toLowerCase())
        ) {
          typeMismatches.push({
            key,
            expected: expectedType,
            actual: actualType,
          });
        } else if (
          expectedType === 'integer' &&
          typeof presetValue === 'string' &&
          isNaN(parseInt(presetValue, 10))
        ) {
          typeMismatches.push({
            key,
            expected: expectedType,
            actual: actualType,
          });
        } else if (
          expectedType === 'number' &&
          typeof presetValue === 'string' &&
          isNaN(parseFloat(presetValue))
        ) {
          typeMismatches.push({
            key,
            expected: expectedType,
            actual: actualType,
          });
        }
      }
    }

    const isCompatible = extraParams.length === 0 && missingParams.length === 0;
    const hasMinorIssues = typeMismatches.length > 0;

    return {
      isCompatible,
      hasMinorIssues,
      extraParams, // In preset but not in schema (may be obsolete)
      missingParams, // In schema but not in preset (will use defaults)
      typeMismatches, // Type coercion may be needed
      compatibleCount: presetKeys.size - extraParams.length,
      totalPresetParams: presetKeys.size,
      totalSchemaParams: schemaKeys.size,
    };
  }
}

/**
 * Extract version information from SCAD file content
 * Looks for common version comment patterns:
 * - // Version: v74
 * - /* Version 2.0 *\/
 * - // v1.2.3
 * @param {string} scadContent - OpenSCAD source code
 * @returns {Object} Version info or null if not found
 */
export function extractScadVersion(scadContent) {
  if (!scadContent) return null;

  // Common version patterns
  const patterns = [
    // "// Version: v74" or "// Version: 74"
    /\/\/\s*Version\s*:\s*v?(\d+(?:\.\d+)*)/i,
    // "/* Version 2.0 */"
    /\/\*\s*Version\s*:?\s*v?(\d+(?:\.\d+)*)\s*\*\//i,
    // "// v1.2.3" at start of comment
    /\/\/\s*v(\d+(?:\.\d+)*)/i,
    // "$version = "1.0";" variable
    /\$version\s*=\s*["']v?(\d+(?:\.\d+)*)["']/i,
    // "version = 74;" variable
    /^\s*version\s*=\s*(\d+(?:\.\d+)*)\s*;/im,
  ];

  for (const pattern of patterns) {
    const match = scadContent.match(pattern);
    if (match) {
      return {
        version: match[1],
        raw: match[0],
      };
    }
  }

  return null;
}

/**
 * Compare two version strings
 * @param {string} v1 - First version
 * @param {string} v2 - Second version
 * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
export function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  const maxLength = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLength; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;

    if (p1 < p2) return -1;
    if (p1 > p2) return 1;
  }

  return 0;
}

// Create singleton instance
export const presetManager = new PresetManager();
