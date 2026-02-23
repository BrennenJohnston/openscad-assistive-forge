/**
 * Feature Flag System
 *
 * Enables gradual rollout of new features and quick rollback if issues arise.
 * Follows the rollout-process.md specification.
 *
 * @license GPL-3.0-or-later
 */

/**
 * Deterministic hash function for user bucketing
 * cyrb53 - fast, reasonable distribution
 * @param {string} str - String to hash
 * @param {number} seed - Optional seed
 * @returns {number} Hash value
 */
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Feature flag definitions
 *
 * Each flag has:
 * - id: Unique identifier (matches object key)
 * - name: Human-readable name for UI
 * - description: What the flag controls
 * - default: Default state when not in rollout
 * - rollout: Percentage (0-100) of users who get the feature
 * - userConfigurable: Can users toggle this in settings?
 * - killSwitch: If true, flag can only disable (never enable via rollout)
 */
export const FLAGS = {
  expert_mode: {
    id: 'expert_mode',
    name: 'Expert Mode',
    description: 'Code editor with syntax highlighting for OpenSCAD',
    default: true,
    rollout: 100,
    userConfigurable: true,
    killSwitch: false,
  },
  monaco_editor: {
    id: 'monaco_editor',
    name: 'Advanced Code Editor',
    description: 'Use Monaco editor (VS Code-like) instead of simple textarea',
    default: true,
    rollout: 100,
    userConfigurable: true,
    killSwitch: false,
    requires: ['expert_mode'], // Only available when expert_mode is enabled
  },
  vector_parameters: {
    id: 'vector_parameters',
    name: 'Vector Parameters',
    description: 'Support for [x, y, z] vector parameter inputs',
    default: true,
    rollout: 100,
    userConfigurable: false,
    killSwitch: false,
  },
  memory_monitoring: {
    id: 'memory_monitoring',
    name: 'Memory Monitoring',
    description: 'Track memory usage and show warnings when high',
    default: true,
    rollout: 100,
    userConfigurable: true,
    killSwitch: false,
  },
  csp_reporting: {
    id: 'csp_reporting',
    name: 'CSP Violation Reporting',
    description: 'Log Content Security Policy violations to console',
    default: true,
    rollout: 100,
    userConfigurable: false,
    killSwitch: false,
  },
  manifold_engine: {
    id: 'manifold_engine',
    name: 'Manifold Engine (Fast)',
    description:
      'Use the Manifold geometry engine for 5-30x faster rendering. Disable for maximum compatibility with complex models.',
    default: true,
    rollout: 100,
    userConfigurable: true,
    killSwitch: false,
  },
  basic_advanced_mode: {
    id: 'basic_advanced_mode',
    name: 'Basic/Advanced Mode',
    description: 'Toggle between simplified and full interface layouts',
    default: true,
    rollout: 100,
    userConfigurable: true,
    killSwitch: false,
  },
  searchable_combobox: {
    id: 'searchable_combobox',
    name: 'Searchable Preset Combobox',
    description:
      'Replace the preset search input and native select with a combined searchable combobox widget',
    default: true,
    rollout: 100,
    userConfigurable: true,
    killSwitch: false,
  },
  folder_import: {
    id: 'folder_import',
    name: 'Import Project Folder',
    description:
      'Allow importing a directory of .scad files and companion resources via the file picker',
    default: true,
    rollout: 100,
    userConfigurable: true,
    killSwitch: false,
  },
};

// Storage key for user preferences
const STORAGE_KEY = 'openscad-forge-feature-flags';

// Storage key for user ID (stable for bucketing)
const USER_ID_KEY = 'openscad-forge-user-id';

/**
 * Get or create a stable user ID for bucketing
 * @returns {string} User ID
 */
function getUserId() {
  try {
    let userId = localStorage.getItem(USER_ID_KEY);
    if (!userId) {
      // Generate a random ID
      userId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      localStorage.setItem(USER_ID_KEY, userId);
    }
    return userId;
  } catch {
    // localStorage unavailable, use session-only ID
    return `session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}

/**
 * Get user preferences from localStorage
 * @returns {Object} User preferences map
 */
function getUserPreferences() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

/**
 * Save user preferences to localStorage
 * @param {Object} prefs - Preferences to save
 */
function saveUserPreferences(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (error) {
    console.warn('[FeatureFlags] Could not save preferences:', error);
  }
}

/**
 * Convert user ID + flag ID to a bucket (0-99)
 * @param {string} userId - User identifier
 * @param {string} flagId - Flag identifier
 * @returns {number} Bucket 0-99
 */
function hashToBucket(userId, flagId) {
  const hash = cyrb53(`${userId}-${flagId}`);
  return hash % 100;
}

/**
 * Check if a feature flag is enabled
 *
 * Resolution order:
 * 1. Kill switch (if flag.killSwitch && user disabled, always disabled)
 * 2. URL override (?flag_<id>=true/false)
 * 3. User preference (if userConfigurable)
 * 4. Rollout percentage
 * 5. Default value
 *
 * @param {string} flagId - Flag identifier
 * @returns {boolean} Whether the flag is enabled
 */
export function isEnabled(flagId) {
  const flag = FLAGS[flagId];
  if (!flag) {
    console.warn(`[FeatureFlags] Unknown flag: ${flagId}`);
    return false;
  }

  // Check URL override first (useful for testing)
  const urlOverride = getUrlOverride(flagId);
  if (urlOverride !== null) {
    return urlOverride;
  }

  // Check user preference (if configurable)
  if (flag.userConfigurable) {
    const prefs = getUserPreferences();
    const pref = prefs[flagId];
    if (pref !== undefined) {
      // Kill switch: if user disabled and killSwitch is true, honor it
      if (flag.killSwitch && pref === false) {
        return false;
      }
      return pref;
    }
  }

  // Check rollout percentage
  if (flag.rollout > 0 && flag.rollout < 100) {
    const userId = getUserId();
    const bucket = hashToBucket(userId, flagId);
    return bucket < flag.rollout;
  }

  // Full rollout or default
  if (flag.rollout >= 100) {
    return true;
  }

  return flag.default;
}

/**
 * Get URL override for a flag
 * Supports ?flag_<id>=true|false|1|0
 * @param {string} flagId - Flag identifier
 * @returns {boolean|null} Override value or null if not set
 */
function getUrlOverride(flagId) {
  try {
    const params = new URLSearchParams(window.location.search);
    const value = params.get(`flag_${flagId}`);
    if (value === null) return null;

    const normalized = value.toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return null;
  } catch {
    return null;
  }
}

/**
 * Set user preference for a flag
 * Only works for userConfigurable flags
 * @param {string} flagId - Flag identifier
 * @param {boolean} enabled - Desired state
 * @returns {boolean} True if preference was set
 */
export function setUserPreference(flagId, enabled) {
  const flag = FLAGS[flagId];
  if (!flag) {
    console.warn(`[FeatureFlags] Unknown flag: ${flagId}`);
    return false;
  }

  if (!flag.userConfigurable) {
    console.warn(`[FeatureFlags] Flag ${flagId} is not user configurable`);
    return false;
  }

  const prefs = getUserPreferences();
  prefs[flagId] = enabled;
  saveUserPreferences(prefs);

  console.log(`[FeatureFlags] ${flagId} set to ${enabled}`);
  return true;
}

/**
 * Clear user preference for a flag (revert to default/rollout)
 * @param {string} flagId - Flag identifier
 */
export function clearUserPreference(flagId) {
  const prefs = getUserPreferences();
  delete prefs[flagId];
  saveUserPreferences(prefs);
  console.log(`[FeatureFlags] ${flagId} preference cleared`);
}

/**
 * Get all flag states (for debugging/settings UI)
 * @returns {Object} Map of flagId -> { flag, enabled, source }
 */
export function getAllFlagStates() {
  const states = {};
  const prefs = getUserPreferences();

  for (const [id, flag] of Object.entries(FLAGS)) {
    const urlOverride = getUrlOverride(id);
    let source = 'default';

    if (urlOverride !== null) {
      source = 'url';
    } else if (flag.userConfigurable && prefs[id] !== undefined) {
      source = 'user';
    } else if (flag.rollout > 0 && flag.rollout < 100) {
      source = 'rollout';
    } else if (flag.rollout >= 100) {
      source = 'full_rollout';
    }

    states[id] = {
      flag,
      enabled: isEnabled(id),
      source,
      userPreference: prefs[id],
    };
  }

  return states;
}

/**
 * Get user-configurable flags for settings UI
 * @returns {Array} Array of flags that users can toggle
 */
export function getConfigurableFlags() {
  return Object.values(FLAGS).filter((flag) => flag.userConfigurable);
}

/**
 * Log all flag states to console (for debugging)
 */
export function debugFlags() {
  console.group('[FeatureFlags] Current States');
  const states = getAllFlagStates();
  for (const [id, state] of Object.entries(states)) {
    console.log(
      `${id}: ${state.enabled ? '✅' : '❌'} (source: ${state.source})`
    );
  }
  console.groupEnd();
}

// Export for testing
export const _internal = {
  cyrb53,
  getUserId,
  getUserPreferences,
  saveUserPreferences,
  hashToBucket,
  getUrlOverride,
  STORAGE_KEY,
  USER_ID_KEY,
};
