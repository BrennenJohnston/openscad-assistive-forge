/**
 * Mode Manager - Controls switching between Standard and Expert modes
 *
 * Standard Mode: Customizer UI with parameter sliders/inputs
 * Expert Mode: Code editor (Monaco or textarea fallback)
 *
 * @license GPL-3.0-or-later
 */

import { isEnabled } from './feature-flags.js';
import { announceImmediate } from './announcer.js';

/**
 * @typedef {'standard' | 'expert'} EditorMode
 */

/**
 * @typedef {'monaco' | 'textarea' | 'auto'} EditorType
 */

/**
 * @typedef {Object} ModeState
 * @property {EditorMode} currentMode - Current editing mode
 * @property {EditorType} preferredEditor - User's preferred editor type
 * @property {boolean} expertModeAvailable - Whether expert mode is enabled via feature flag
 */

// Storage key for mode preferences
const MODE_STORAGE_KEY = 'openscad-forge-mode-prefs';

/**
 * ModeManager - Central controller for Standard/Expert mode switching
 *
 * Responsibilities:
 * - Track current mode
 * - Handle mode switching
 * - Preserve state across switches
 * - Manage focus and screen reader announcements
 * - Coordinate with EditorStateManager for state sync
 */
export class ModeManager {
  /**
   * @param {Object} options
   * @param {Function} options.onModeChange - Callback when mode changes
   * @param {Function} options.announceToScreenReader - Screen reader announcement function
   */
  constructor(options = {}) {
    /** @type {EditorMode} */
    this.currentMode = 'standard';

    /** @type {EditorType} */
    this.preferredEditor = 'auto';

    /** @type {Function} */
    this.onModeChange = options.onModeChange || (() => {});

    /** @type {Function} */
    this.announceToScreenReader =
      options.announceToScreenReader || this._defaultAnnounce.bind(this);

    /** @type {Set<Function>} */
    this.subscribers = new Set();

    /** @type {EditorStateManager|null} */
    this.stateManager = null;

    // Load saved preferences
    this._loadPreferences();
  }

  /**
   * Set the EditorStateManager for state synchronization
   * @param {EditorStateManager} stateManager
   */
  setStateManager(stateManager) {
    this.stateManager = stateManager;
  }

  /**
   * Check if Expert Mode is available (feature flag enabled)
   * @returns {boolean}
   */
  isExpertModeAvailable() {
    return isEnabled('expert_mode');
  }

  /**
   * Get current mode
   * @returns {EditorMode}
   */
  getMode() {
    return this.currentMode;
  }

  /**
   * Get preferred editor type
   * @returns {EditorType}
   */
  getPreferredEditor() {
    return this.preferredEditor;
  }

  /**
   * Set preferred editor type
   * @param {EditorType} type
   */
  setPreferredEditor(type) {
    if (!['monaco', 'textarea', 'auto'].includes(type)) {
      console.warn(`[ModeManager] Invalid editor type: ${type}`);
      return;
    }

    this.preferredEditor = type;
    this._savePreferences();

    console.log(`[ModeManager] Preferred editor set to: ${type}`);
  }

  /**
   * Subscribe to mode changes
   * @param {Function} callback - Called with (newMode, oldMode)
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Switch to a different mode
   * @param {EditorMode} targetMode - Mode to switch to
   * @param {Object} options - Switch options
   * @param {boolean} options.skipAnnouncement - Skip screen reader announcement
   * @returns {boolean} True if switch was successful
   */
  switchMode(targetMode, options = {}) {
    if (targetMode === this.currentMode) {
      console.log(`[ModeManager] Already in ${targetMode} mode`);
      return true;
    }

    // Check if expert mode is allowed
    if (targetMode === 'expert' && !this.isExpertModeAvailable()) {
      console.warn('[ModeManager] Expert mode is not enabled');
      return false;
    }

    const previousMode = this.currentMode;

    console.log(`[ModeManager] Switching from ${previousMode} to ${targetMode}`);

    // Capture state before switching
    if (this.stateManager) {
      this.stateManager.captureState(previousMode);
    }

    // Update mode
    this.currentMode = targetMode;

    // Restore state for new mode
    if (this.stateManager) {
      this.stateManager.restoreState(targetMode);
    }

    // Notify subscribers
    this._notifySubscribers(targetMode, previousMode);

    // Call mode change callback
    this.onModeChange(targetMode, previousMode);

    // Announce to screen reader
    if (!options.skipAnnouncement) {
      this._announceSwitch(targetMode);
    }

    // Move focus to the appropriate target after switch (WCAG 2.4.3 Focus Order)
    if (!options.skipFocus) {
      requestAnimationFrame(() => this._manageFocusAfterSwitch(targetMode));
    }

    // Save mode to preferences
    this._savePreferences();

    return true;
  }

  /**
   * Toggle between Standard and Expert modes
   * @returns {EditorMode} New mode after toggle
   */
  toggleMode() {
    const newMode = this.currentMode === 'standard' ? 'expert' : 'standard';
    this.switchMode(newMode);
    return this.currentMode;
  }

  /**
   * Get mode state for UI
   * @returns {ModeState}
   */
  getModeState() {
    return {
      currentMode: this.currentMode,
      preferredEditor: this.preferredEditor,
      expertModeAvailable: this.isExpertModeAvailable(),
    };
  }

  /**
   * Determine which editor to use based on preferences and detection
   * @returns {'monaco' | 'textarea'}
   */
  resolveEditorType() {
    if (this.preferredEditor === 'monaco') {
      return 'monaco';
    }

    if (this.preferredEditor === 'textarea') {
      return 'textarea';
    }

    // Auto-detect
    return this._detectPreferredEditor();
  }

  /**
   * Auto-detect preferred editor based on user preferences and environment
   * @returns {'monaco' | 'textarea'}
   * @private
   */
  _detectPreferredEditor() {
    // Check accessibility hints
    const hints = {
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)')
        .matches,
      highContrast: window.matchMedia('(prefers-contrast: more)').matches,
      // Note: Direct AT detection is unreliable; prefer user preference
    };

    // Conservative default: if any hint suggests AT, offer textarea
    if (hints.highContrast) {
      console.log(
        '[ModeManager] High contrast detected, preferring textarea editor'
      );
      return 'textarea';
    }

    // Default to Monaco for most users
    return 'monaco';
  }

  /**
   * Notify all subscribers of mode change
   * @param {EditorMode} newMode
   * @param {EditorMode} oldMode
   * @private
   */
  _notifySubscribers(newMode, oldMode) {
    this.subscribers.forEach((callback) => {
      try {
        callback(newMode, oldMode);
      } catch (error) {
        console.error('[ModeManager] Subscriber error:', error);
      }
    });
  }

  /**
   * Move focus to appropriate element after mode switch (WCAG 2.4.3)
   * Standard mode: focus first parameter input
   * Expert mode: focus the code editor (textarea or Monaco)
   * @param {EditorMode} mode
   * @private
   */
  _manageFocusAfterSwitch(mode) {
    try {
      if (mode === 'standard') {
        // Focus the first parameter control input
        const firstInput = document.querySelector(
          '.param-control input:not([type="hidden"]), .param-control select, .param-control textarea'
        );
        if (firstInput) {
          firstInput.focus();
          return;
        }
      } else if (mode === 'expert') {
        // Focus the code editor (textarea fallback or Monaco container)
        const textarea = document.querySelector('#textareaEditor, .textarea-editor textarea');
        if (textarea) {
          textarea.focus();
          return;
        }
        const monacoContainer = document.querySelector('.monaco-editor textarea');
        if (monacoContainer) {
          monacoContainer.focus();
          return;
        }
      }
      // Fallback: focus the mode toggle button itself
      const modeToggle = document.querySelector('#expertModeToggle, [data-action="toggle-mode"]');
      if (modeToggle) {
        modeToggle.focus();
      }
    } catch (error) {
      console.warn('[ModeManager] Focus management error:', error);
    }
  }

  /**
   * Announce mode switch to screen reader
   * @param {EditorMode} mode
   * @private
   */
  _announceSwitch(mode) {
    const messages = {
      standard:
        'Switched to Standard Mode. Parameter controls are now active. Tab through parameters to customize.',
      expert:
        'Switched to Expert Mode. Code editor is now active. Press Escape then Tab to access other controls.',
    };

    this.announceToScreenReader(messages[mode] || `Switched to ${mode} mode`);
  }

  /**
   * Default screen reader announcement implementation.
   * Delegates to shared announcer.js utility for consistent behavior.
   * @param {string} message
   * @private
   */
  _defaultAnnounce(message) {
    // Use shared announcer with longer clear delay for mode changes
    announceImmediate(message, { clearDelayMs: 3000 });
  }

  /**
   * Load preferences from localStorage
   * @private
   */
  _loadPreferences() {
    try {
      const stored = localStorage.getItem(MODE_STORAGE_KEY);
      if (stored) {
        const prefs = JSON.parse(stored);
        if (prefs.preferredEditor) {
          this.preferredEditor = prefs.preferredEditor;
        }
        // Note: We don't restore currentMode on load - always start in standard
      }
    } catch (error) {
      console.warn('[ModeManager] Could not load preferences:', error);
    }
  }

  /**
   * Save preferences to localStorage
   * @private
   */
  _savePreferences() {
    try {
      const prefs = {
        preferredEditor: this.preferredEditor,
        lastMode: this.currentMode,
      };
      localStorage.setItem(MODE_STORAGE_KEY, JSON.stringify(prefs));
    } catch (error) {
      console.warn('[ModeManager] Could not save preferences:', error);
    }
  }
}

// Export singleton instance for convenience
let instance = null;

/**
 * Get or create ModeManager singleton
 * @param {Object} options - Options for new instance
 * @returns {ModeManager}
 */
export function getModeManager(options = {}) {
  if (!instance) {
    instance = new ModeManager(options);
  }
  return instance;
}

/**
 * Reset ModeManager instance (for testing)
 */
export function resetModeManager() {
  instance = null;
}
