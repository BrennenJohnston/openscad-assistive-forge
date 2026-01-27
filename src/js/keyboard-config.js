/**
 * Keyboard Configuration
 * Provides configurable keyboard shortcuts with persistence
 * @license GPL-3.0-or-later
 */

/**
 * Storage key for keyboard shortcuts
 */
const STORAGE_KEY = 'openscad-forge-keyboard-shortcuts';

/**
 * Default keyboard shortcuts
 * Format: { action: { key, ctrl?, shift?, alt?, meta?, description } }
 */
export const DEFAULT_SHORTCUTS = {
  // Rendering
  render: {
    key: 'Enter',
    ctrl: true,
    description: 'Render model (full quality)',
  },
  preview: {
    key: 'p',
    ctrl: true,
    description: 'Preview model (fast)',
  },
  cancelRender: {
    key: 'Escape',
    description: 'Cancel current render',
  },

  // Downloads
  download: {
    key: 'd',
    ctrl: true,
    description: 'Download rendered model',
  },
  exportParams: {
    key: 'e',
    ctrl: true,
    description: 'Export parameters as JSON',
  },

  // View controls
  focusMode: {
    key: 'f',
    description: 'Toggle focus mode (maximize preview)',
  },
  toggleParameters: {
    key: 'b',
    ctrl: true,
    description: 'Toggle parameter panel',
  },
  resetView: {
    key: 'r',
    description: 'Reset camera view',
  },

  // Parameter controls
  resetAllParams: {
    key: 'r',
    ctrl: true,
    shift: true,
    description: 'Reset all parameters to defaults',
  },
  searchParams: {
    key: 'f',
    ctrl: true,
    description: 'Focus parameter search',
  },

  // Theme
  toggleTheme: {
    key: 't',
    ctrl: true,
    description: 'Toggle light/dark theme',
  },
  toggleHighContrast: {
    key: 'h',
    ctrl: true,
    description: 'Toggle high contrast mode',
  },

  // Help
  showHelp: {
    key: '?',
    shift: true,
    description: 'Show keyboard shortcuts help',
  },
  showShortcutsModal: {
    key: 'k',
    ctrl: true,
    description: 'Open keyboard shortcuts settings',
  },

  // Saved Projects
  focusSavedProjects: {
    key: 'p',
    ctrl: true,
    shift: true,
    description: 'Focus saved projects list',
  },

  // Navigation
  nextParameter: {
    key: 'ArrowDown',
    alt: true,
    description: 'Focus next parameter',
  },
  prevParameter: {
    key: 'ArrowUp',
    alt: true,
    description: 'Focus previous parameter',
  },
  nextGroup: {
    key: 'ArrowDown',
    ctrl: true,
    alt: true,
    description: 'Jump to next parameter group',
  },
  prevGroup: {
    key: 'ArrowUp',
    ctrl: true,
    alt: true,
    description: 'Jump to previous parameter group',
  },
};

/**
 * Shortcut category definitions for UI organization
 */
export const SHORTCUT_CATEGORIES = {
  rendering: {
    label: 'Rendering',
    actions: ['render', 'preview', 'cancelRender'],
  },
  downloads: {
    label: 'Downloads & Export',
    actions: ['download', 'exportParams'],
  },
  view: {
    label: 'View Controls',
    actions: ['focusMode', 'toggleParameters', 'resetView'],
  },
  parameters: {
    label: 'Parameters',
    actions: ['resetAllParams', 'searchParams'],
  },
  theme: {
    label: 'Theme',
    actions: ['toggleTheme', 'toggleHighContrast'],
  },
  help: {
    label: 'Help',
    actions: ['showHelp', 'showShortcutsModal'],
  },
  navigation: {
    label: 'Navigation',
    actions: ['nextParameter', 'prevParameter', 'nextGroup', 'prevGroup'],
  },
};

/**
 * Parse a keyboard event into a shortcut key object
 * @param {KeyboardEvent} event - Keyboard event
 * @returns {Object} Shortcut key object
 */
export function parseKeyboardEvent(event) {
  return {
    key: event.key,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
    meta: event.metaKey,
  };
}

/**
 * Check if a shortcut matches a keyboard event
 * @param {Object} shortcut - Shortcut definition
 * @param {KeyboardEvent|Object} event - Keyboard event or parsed event
 * @returns {boolean}
 */
export function matchesShortcut(shortcut, event) {
  const parsed =
    event instanceof KeyboardEvent ? parseKeyboardEvent(event) : event;

  // Key must match (case-insensitive for letters)
  const keyMatches =
    shortcut.key.toLowerCase() === parsed.key.toLowerCase() ||
    shortcut.key === parsed.key;

  if (!keyMatches) return false;

  // Modifier checks (default to false if not specified)
  const ctrlMatch = (shortcut.ctrl || false) === (parsed.ctrl || false);
  const shiftMatch = (shortcut.shift || false) === (parsed.shift || false);
  const altMatch = (shortcut.alt || false) === (parsed.alt || false);
  const metaMatch = (shortcut.meta || false) === (parsed.meta || false);

  return ctrlMatch && shiftMatch && altMatch && metaMatch;
}

/**
 * Format a shortcut for display
 * @param {Object} shortcut - Shortcut definition
 * @param {Object} options - Formatting options
 * @returns {string}
 */
export function formatShortcut(shortcut, options = {}) {
  const { platform = detectPlatform() } = options;
  const parts = [];

  // Platform-specific modifier symbols
  const modifiers =
    platform === 'mac'
      ? { ctrl: '⌃', shift: '⇧', alt: '⌥', meta: '⌘' }
      : { ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt', meta: 'Win' };

  if (shortcut.ctrl) parts.push(modifiers.ctrl);
  if (shortcut.shift) parts.push(modifiers.shift);
  if (shortcut.alt) parts.push(modifiers.alt);
  if (shortcut.meta) parts.push(modifiers.meta);

  // Format special keys
  let key = shortcut.key;
  const specialKeys = {
    Enter: platform === 'mac' ? '↩' : 'Enter',
    Escape: platform === 'mac' ? '⎋' : 'Esc',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    ' ': 'Space',
    Tab: platform === 'mac' ? '⇥' : 'Tab',
    Backspace: platform === 'mac' ? '⌫' : 'Backspace',
    Delete: platform === 'mac' ? '⌦' : 'Delete',
  };

  if (specialKeys[key]) {
    key = specialKeys[key];
  } else if (key.length === 1) {
    key = key.toUpperCase();
  }

  parts.push(key);

  return platform === 'mac' ? parts.join('') : parts.join('+');
}

/**
 * Detect the current platform
 * @returns {'mac' | 'windows' | 'linux'}
 */
export function detectPlatform() {
  if (typeof navigator === 'undefined') return 'windows';

  const platform = navigator.platform?.toLowerCase() || '';
  if (platform.includes('mac')) return 'mac';
  if (platform.includes('linux')) return 'linux';
  return 'windows';
}

/**
 * Keyboard configuration manager
 */
class KeyboardConfig {
  constructor() {
    this.shortcuts = { ...DEFAULT_SHORTCUTS };
    this.handlers = {};
    this.enabled = true;
    this.listeners = [];

    // Bind event handler
    this._handleKeydown = this._handleKeydown.bind(this);
  }

  /**
   * Initialize keyboard shortcuts
   * @param {Object} options - Initialization options
   */
  init(options = {}) {
    // Load saved shortcuts
    this.load();

    // Apply any overrides from options
    if (options.shortcuts) {
      this.shortcuts = { ...this.shortcuts, ...options.shortcuts };
    }

    // Attach global listener
    document.addEventListener('keydown', this._handleKeydown);

    console.log('[Keyboard] Shortcuts initialized');
  }

  /**
   * Destroy the keyboard config and clean up
   */
  destroy() {
    document.removeEventListener('keydown', this._handleKeydown);
    this.handlers = {};
    this.listeners = [];
  }

  /**
   * Register a handler for an action
   * @param {string} action - Action name
   * @param {Function} handler - Handler function
   * @returns {Function} Unsubscribe function
   */
  on(action, handler) {
    if (!this.handlers[action]) {
      this.handlers[action] = [];
    }
    this.handlers[action].push(handler);

    // Return unsubscribe function
    return () => {
      this.handlers[action] = this.handlers[action].filter(
        (h) => h !== handler
      );
    };
  }

  /**
   * Remove a handler for an action
   * @param {string} action - Action name
   * @param {Function} handler - Handler to remove
   */
  off(action, handler) {
    if (this.handlers[action]) {
      this.handlers[action] = this.handlers[action].filter(
        (h) => h !== handler
      );
    }
  }

  /**
   * Add a change listener
   * @param {Function} listener - Change listener
   * @returns {Function} Unsubscribe function
   */
  addChangeListener(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Notify change listeners
   * @private
   */
  _notifyChange() {
    for (const listener of this.listeners) {
      try {
        listener(this.shortcuts);
      } catch (error) {
        console.error('[Keyboard] Error in change listener:', error);
      }
    }
  }

  /**
   * Get shortcut for an action
   * @param {string} action - Action name
   * @returns {Object|null}
   */
  getShortcut(action) {
    return this.shortcuts[action] || null;
  }

  /**
   * Get all shortcuts
   * @returns {Object}
   */
  getAllShortcuts() {
    return { ...this.shortcuts };
  }

  /**
   * Set shortcut for an action
   * @param {string} action - Action name
   * @param {Object} shortcut - New shortcut definition
   */
  setShortcut(action, shortcut) {
    if (!DEFAULT_SHORTCUTS[action]) {
      console.warn(`[Keyboard] Unknown action: ${action}`);
      return;
    }

    this.shortcuts[action] = {
      ...shortcut,
      description: DEFAULT_SHORTCUTS[action].description,
    };

    this.save();
    this._notifyChange();
  }

  /**
   * Reset a shortcut to default
   * @param {string} action - Action name
   */
  resetShortcut(action) {
    if (DEFAULT_SHORTCUTS[action]) {
      this.shortcuts[action] = { ...DEFAULT_SHORTCUTS[action] };
      this.save();
      this._notifyChange();
    }
  }

  /**
   * Reset all shortcuts to defaults
   */
  resetAll() {
    this.shortcuts = { ...DEFAULT_SHORTCUTS };
    this.save();
    this._notifyChange();
  }

  /**
   * Check if a shortcut has been customized
   * @param {string} action - Action name
   * @returns {boolean}
   */
  isCustomized(action) {
    const current = this.shortcuts[action];
    const defaultShortcut = DEFAULT_SHORTCUTS[action];
    if (!current || !defaultShortcut) return false;

    return (
      current.key !== defaultShortcut.key ||
      (current.ctrl || false) !== (defaultShortcut.ctrl || false) ||
      (current.shift || false) !== (defaultShortcut.shift || false) ||
      (current.alt || false) !== (defaultShortcut.alt || false) ||
      (current.meta || false) !== (defaultShortcut.meta || false)
    );
  }

  /**
   * Check for conflicting shortcuts
   * @param {Object} shortcut - Shortcut to check
   * @param {string} excludeAction - Action to exclude from conflict check
   * @returns {string|null} Conflicting action name or null
   */
  findConflict(shortcut, excludeAction = null) {
    for (const [action, existing] of Object.entries(this.shortcuts)) {
      if (action === excludeAction) continue;
      if (matchesShortcut(existing, shortcut)) {
        return action;
      }
    }
    return null;
  }

  /**
   * Enable/disable keyboard shortcuts
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Save shortcuts to localStorage
   */
  save() {
    try {
      const customized = {};
      for (const [action, shortcut] of Object.entries(this.shortcuts)) {
        if (this.isCustomized(action)) {
          const { description: _desc, ...rest } = shortcut;
          customized[action] = rest;
        }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customized));
    } catch (error) {
      console.error('[Keyboard] Failed to save shortcuts:', error);
    }
  }

  /**
   * Load shortcuts from localStorage
   */
  load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const customized = JSON.parse(saved);
        for (const [action, shortcut] of Object.entries(customized)) {
          if (DEFAULT_SHORTCUTS[action]) {
            this.shortcuts[action] = {
              ...shortcut,
              description: DEFAULT_SHORTCUTS[action].description,
            };
          }
        }
      }
    } catch (error) {
      console.error('[Keyboard] Failed to load shortcuts:', error);
    }
  }

  /**
   * Handle keydown events
   * @private
   */
  _handleKeydown(event) {
    if (!this.enabled) return;

    // Skip if in input field (unless it's a global shortcut)
    const target = event.target;
    const isInputField =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable;

    // Find matching shortcut
    for (const [action, shortcut] of Object.entries(this.shortcuts)) {
      if (matchesShortcut(shortcut, event)) {
        // Skip non-global shortcuts in input fields
        if (isInputField && !shortcut.global) {
          // Allow Escape in input fields
          if (event.key !== 'Escape') continue;
        }

        // Prevent default browser behavior
        event.preventDefault();

        // Call handlers
        const handlers = this.handlers[action] || [];
        for (const handler of handlers) {
          try {
            handler(event);
          } catch (error) {
            console.error(`[Keyboard] Error in ${action} handler:`, error);
          }
        }

        return;
      }
    }
  }
}

/**
 * Singleton keyboard config instance
 */
export const keyboardConfig = new KeyboardConfig();

/**
 * Initialize keyboard shortcuts (convenience function)
 * @param {Object} options - Initialization options
 */
export function initKeyboardShortcuts(options = {}) {
  keyboardConfig.init(options);
  return keyboardConfig;
}

/**
 * Generate keyboard shortcuts help HTML (read-only)
 * @returns {string} HTML string
 */
export function generateShortcutsHelpHTML() {
  const shortcuts = keyboardConfig.getAllShortcuts();
  let html = '<div class="shortcuts-help">';

  for (const [categoryId, category] of Object.entries(SHORTCUT_CATEGORIES)) {
    html += `<div class="shortcuts-category" data-category="${categoryId}">`;
    html += `<h4>${category.label}</h4>`;
    html += '<dl>';

    for (const action of category.actions) {
      const shortcut = shortcuts[action];
      if (shortcut) {
        const formatted = formatShortcut(shortcut);
        html += `<dt><kbd>${formatted}</kbd></dt>`;
        html += `<dd>${shortcut.description}</dd>`;
      }
    }

    html += '</dl></div>';
  }

  html += '</div>';
  return html;
}

/**
 * Generate keyboard shortcuts editor HTML (with remapping)
 * @returns {string} HTML string
 */
export function generateShortcutsEditorHTML() {
  const shortcuts = keyboardConfig.getAllShortcuts();
  let html = '<div class="shortcuts-editor">';
  html +=
    '<p class="shortcuts-editor-intro">Click on a shortcut to change it. Press Escape to cancel.</p>';

  for (const [categoryId, category] of Object.entries(SHORTCUT_CATEGORIES)) {
    html += `<div class="shortcuts-category" data-category="${categoryId}">`;
    html += `<h4>${category.label}</h4>`;
    html += '<div class="shortcuts-list">';

    for (const action of category.actions) {
      const shortcut = shortcuts[action];
      if (shortcut) {
        const formatted = formatShortcut(shortcut);
        const isCustomized = keyboardConfig.isCustomized(action);
        const customizedClass = isCustomized ? ' shortcut-customized' : '';

        html += `<div class="shortcut-item${customizedClass}" data-action="${action}">`;
        html += `  <span class="shortcut-description">${shortcut.description}</span>`;
        html += `  <div class="shortcut-key-group">`;
        html += `    <button type="button" class="shortcut-key-btn" data-action="${action}" aria-label="Change shortcut for ${shortcut.description}">`;
        html += `      <kbd>${formatted}</kbd>`;
        html += `    </button>`;
        if (isCustomized) {
          html += `    <button type="button" class="shortcut-reset-btn" data-action="${action}" aria-label="Reset to default" title="Reset to default">`;
          html += `      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">`;
          html += `        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>`;
          html += `        <path d="M3 3v5h5"/>`;
          html += `      </svg>`;
          html += `    </button>`;
        }
        html += `  </div>`;
        html += `</div>`;
      }
    }

    html += '</div></div>';
  }

  html += '</div>';
  return html;
}

/**
 * State for key capture mode
 */
let keyCaptureState = {
  active: false,
  action: null,
  button: null,
  originalContent: null,
  keydownHandler: null,
};

/**
 * Start capturing a new key binding
 * @param {string} action - Action to rebind
 * @param {HTMLElement} button - Button element that was clicked
 */
export function startKeyCapture(action, button) {
  // Cancel any existing capture
  if (keyCaptureState.active) {
    cancelKeyCapture();
  }

  keyCaptureState.active = true;
  keyCaptureState.action = action;
  keyCaptureState.button = button;
  keyCaptureState.originalContent = button.innerHTML;

  // Update button to show capture mode
  button.innerHTML = '<span class="key-capture-prompt">Press a key...</span>';
  button.classList.add('capturing');
  button.focus();

  // Temporarily disable the keyboard config to prevent shortcuts from firing
  keyboardConfig.setEnabled(false);

  // Create keydown handler
  keyCaptureState.keydownHandler = (event) => {
    event.preventDefault();
    event.stopPropagation();

    // Escape cancels capture
    if (event.key === 'Escape') {
      cancelKeyCapture();
      return;
    }

    // Ignore modifier-only keys
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
      return;
    }

    // Parse the new shortcut
    const newShortcut = parseKeyboardEvent(event);

    // Check for conflicts
    const conflict = keyboardConfig.findConflict(newShortcut, action);
    if (conflict) {
      const conflictShortcut = keyboardConfig.getShortcut(conflict);
      showConflictWarning(button, conflictShortcut.description);
      return;
    }

    // Apply the new shortcut
    keyboardConfig.setShortcut(action, newShortcut);

    // End capture mode
    endKeyCapture(true);
  };

  // Add event listener
  document.addEventListener('keydown', keyCaptureState.keydownHandler, true);

  // Add click-outside handler to cancel
  setTimeout(() => {
    document.addEventListener('click', handleClickOutside, true);
  }, 0);
}

/**
 * Handle click outside the capture button
 */
function handleClickOutside(event) {
  if (
    keyCaptureState.active &&
    !keyCaptureState.button.contains(event.target)
  ) {
    cancelKeyCapture();
  }
}

/**
 * Cancel key capture mode
 */
export function cancelKeyCapture() {
  if (!keyCaptureState.active) return;

  // Restore button content
  if (keyCaptureState.button && keyCaptureState.originalContent) {
    keyCaptureState.button.innerHTML = keyCaptureState.originalContent;
    keyCaptureState.button.classList.remove('capturing');
  }

  endKeyCapture(false);
}

/**
 * End key capture mode
 * @param {boolean} success - Whether capture was successful
 */
function endKeyCapture(success) {
  // Remove event listeners
  if (keyCaptureState.keydownHandler) {
    document.removeEventListener(
      'keydown',
      keyCaptureState.keydownHandler,
      true
    );
  }
  document.removeEventListener('click', handleClickOutside, true);

  // Re-enable keyboard shortcuts
  keyboardConfig.setEnabled(true);

  // If successful, refresh the UI
  if (success) {
    refreshShortcutsEditor();
  }

  // Reset state
  keyCaptureState = {
    active: false,
    action: null,
    button: null,
    originalContent: null,
    keydownHandler: null,
  };
}

/**
 * Show conflict warning on a button
 * @param {HTMLElement} button - Button element
 * @param {string} conflictDescription - Description of conflicting action
 */
function showConflictWarning(button, conflictDescription) {
  const _originalContent = button.innerHTML;
  button.innerHTML = `<span class="key-conflict-warning">Already used by: ${conflictDescription}</span>`;
  button.classList.add('conflict');

  setTimeout(() => {
    if (keyCaptureState.active && keyCaptureState.button === button) {
      button.innerHTML =
        '<span class="key-capture-prompt">Press a key...</span>';
      button.classList.remove('conflict');
    }
  }, 2000);
}

/**
 * Refresh the shortcuts editor UI after a change
 */
export function refreshShortcutsEditor() {
  const container = document.getElementById('shortcutsModalBody');
  if (container) {
    container.innerHTML = generateShortcutsEditorHTML();
    attachShortcutsEditorListeners(container);
  }
}

/**
 * Attach event listeners to shortcuts editor
 * @param {HTMLElement} container - Container element
 */
export function attachShortcutsEditorListeners(container) {
  // Key buttons - click to start capture
  container.querySelectorAll('.shortcut-key-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const action = btn.dataset.action;
      startKeyCapture(action, btn);
    });
  });

  // Reset buttons - click to reset individual shortcut
  container.querySelectorAll('.shortcut-reset-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const action = btn.dataset.action;
      keyboardConfig.resetShortcut(action);
      refreshShortcutsEditor();
    });
  });
}

/**
 * Initialize the shortcuts modal
 * @param {HTMLElement} modalBody - Modal body element
 * @param {Function} closeModal - Function to close the modal
 */
export function initShortcutsModal(modalBody, closeModal) {
  // Generate and insert the editor HTML
  modalBody.innerHTML = generateShortcutsEditorHTML();
  attachShortcutsEditorListeners(modalBody);

  // Handle Reset All button
  const resetAllBtn = document.getElementById('shortcutsResetAll');
  if (resetAllBtn) {
    resetAllBtn.addEventListener('click', () => {
      keyboardConfig.resetAll();
      refreshShortcutsEditor();
    });
  }

  // Handle Done button
  const doneBtn = document.getElementById('shortcutsModalDone');
  if (doneBtn) {
    doneBtn.addEventListener('click', closeModal);
  }

  // Handle overlay click
  const overlay = document.getElementById('shortcutsModalOverlay');
  if (overlay) {
    overlay.addEventListener('click', closeModal);
  }

  // Handle close button
  const closeBtn = document.getElementById('shortcutsModalClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }
}
