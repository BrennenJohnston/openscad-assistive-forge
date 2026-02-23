/**
 * UI Mode Controller - Controls switching between Basic and Advanced interface layouts
 *
 * Basic Mode: Simplified interface showing only core parameter controls and preview
 * Advanced Mode: Full interface with all panels visible (default — preserves existing behavior)
 *
 * @license GPL-3.0-or-later
 */

import { isEnabled } from './feature-flags.js';
import { announceImmediate } from './announcer.js';

/**
 * @typedef {'basic' | 'advanced'} UIMode
 */

/**
 * @typedef {Object} PanelDefinition
 * @property {string} id - Unique panel identifier
 * @property {string} label - Human-readable label for preferences UI
 * @property {string} selector - CSS selector targeting the panel element(s)
 * @property {boolean} defaultHiddenInBasic - Whether hidden by default in Basic mode
 */

// Storage key for UI mode preference (follows openscad-forge-{feature} convention)
const UI_MODE_STORAGE_KEY = 'openscad-forge-ui-mode';

// CSS class applied to panel elements when hidden in Basic mode
const HIDDEN_CLASS = 'ui-mode-hidden';

/**
 * Registry of panels controlled by Basic/Advanced mode.
 * Selectors are verified against the current index.html DOM structure.
 * CRITICAL: Never target .param-group or .param-control elements here —
 * those are independently controlled by isSimpleGroup() and data-settings-level.
 *
 * @type {PanelDefinition[]}
 */
const PANEL_REGISTRY = [
  {
    id: 'consoleOutput',
    label: 'Console Output',
    selector: '#consolePanel',
    defaultHiddenInBasic: true,
  },
  {
    id: 'errorLog',
    label: 'Error Log',
    selector: '#errorLogPanel',
    defaultHiddenInBasic: true,
  },
  // fileActions panel removed — now in File toolbar menu
  {
    id: 'codeEditor',
    label: 'Code Editor',
    selector: '#expertModeToggle, #expertModePanel',
    defaultHiddenInBasic: true,
  },
  {
    id: 'imageMeasurement',
    label: 'Image Measurement',
    selector: '#measureSection',
    defaultHiddenInBasic: true,
  },
  {
    id: 'referenceOverlay',
    label: 'Reference Overlay',
    selector: '#overlaySection',
    defaultHiddenInBasic: true,
  },
  {
    id: 'libraries',
    label: 'Libraries',
    selector: '#libraryControls',
    defaultHiddenInBasic: true,
  },
  {
    id: 'advancedMenu',
    label: 'Advanced Menu',
    selector: '#advancedMenu',
    defaultHiddenInBasic: true,
  },
  {
    id: 'gridSettings',
    label: 'Grid Settings',
    selector: '.preview-setting-group--grid',
    defaultHiddenInBasic: true,
  },
  {
    id: 'companionFileManagement',
    label: 'Companion Files',
    selector: '#projectFilesControls',
    defaultHiddenInBasic: true,
  },
  {
    id: 'presetImportExport',
    label: 'Preset Import/Export',
    selector: '#exportParamsBtn',
    defaultHiddenInBasic: true,
  },
  {
    id: 'renderSettings',
    label: 'Render Settings',
    selector: '.preview-setting-group--quality',
    defaultHiddenInBasic: true,
  },
  // editTools panel removed — now in Edit toolbar menu
  // designTools panel removed — now in Design toolbar menu
  // displayOptions panel removed — toggles now in View toolbar menu
  // animationPanel removed from UI pending full debug; AnimationController preserved in animation-controller.js
  {
    id: 'toolbarMenuFile',
    label: 'Toolbar: File',
    selector: '#fileMenuBtn',
    defaultHiddenInBasic: true,
  },
  {
    id: 'toolbarMenuEdit',
    label: 'Toolbar: Edit',
    selector: '#editMenuBtn',
    defaultHiddenInBasic: true,
  },
  {
    id: 'toolbarMenuDesign',
    label: 'Toolbar: Design',
    selector: '#designMenuBtn',
    defaultHiddenInBasic: true,
  },
  {
    id: 'toolbarMenuView',
    label: 'Toolbar: View',
    selector: '#viewMenuBtn',
    defaultHiddenInBasic: true,
  },
  {
    id: 'toolbarMenuWindow',
    label: 'Toolbar: Window',
    selector: '#windowMenuBtn',
    defaultHiddenInBasic: true,
  },
  {
    id: 'toolbarMenuHelp',
    label: 'Toolbar: Help',
    selector: '#helpMenuBtn',
    defaultHiddenInBasic: true,
  },
];

/**
 * UIModeController - Central controller for Basic/Advanced interface mode switching
 *
 * Responsibilities:
 * - Track current UI mode (basic/advanced)
 * - Handle mode switching with screen reader announcements
 * - Persist mode preference to localStorage
 * - Apply panel visibility via CSS class (PR 2 wires the actual hiding)
 * - Expose panel registry for preferences UI (PR 3)
 */
export class UIModeController {
  /**
   * @param {Object} options
   * @param {Function} [options.onModeChange] - Callback when mode changes
   */
  constructor(options = {}) {
    /** @type {UIMode} */
    this.currentMode = 'basic';

    /** @type {Function} */
    this.onModeChange = options.onModeChange || (() => {});

    /** @type {Set<Function>} */
    this.subscribers = new Set();

    /** @type {string[]} Hidden panel IDs for current project (overrides defaults) */
    this._projectHiddenPanels = null;

    // Load saved preferences
    this._loadPreferences();
  }

  /**
   * Check if Basic/Advanced mode feature is enabled via feature flag
   * @returns {boolean}
   */
  isFeatureEnabled() {
    return isEnabled('basic_advanced_mode');
  }

  /**
   * Get current UI mode
   * @returns {UIMode}
   */
  getMode() {
    return this.currentMode;
  }

  /**
   * Get a deep copy of the panel registry (safe for external mutation)
   * @returns {PanelDefinition[]}
   */
  getRegistry() {
    return PANEL_REGISTRY.map((panel) => ({ ...panel }));
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
   * Switch to a specific UI mode
   * @param {UIMode} targetMode - 'basic' or 'advanced'
   * @param {Object} [options]
   * @param {boolean} [options.skipAnnouncement] - Skip screen reader announcement
   * @param {boolean} [options.skipFocus] - Skip focus management
   * @returns {boolean} True if switch was successful
   */
  switchMode(targetMode, options = {}) {
    if (!['basic', 'advanced'].includes(targetMode)) {
      console.warn(`[UIModeController] Invalid mode: ${targetMode}`);
      return false;
    }

    if (targetMode === this.currentMode) {
      console.log(`[UIModeController] Already in ${targetMode} mode`);
      return true;
    }

    const previousMode = this.currentMode;

    console.log(
      `[UIModeController] Switching from ${previousMode} to ${targetMode}`
    );

    this.currentMode = targetMode;
    this.applyMode(targetMode);
    this._updateToggleButton();
    this._notifySubscribers(targetMode, previousMode);
    this.onModeChange(targetMode, previousMode);

    if (!options.skipAnnouncement) {
      this._announceSwitch(targetMode);
    }

    // WCAG 2.4.3: move focus to a meaningful element after mode switch
    if (!options.skipFocus) {
      requestAnimationFrame(() => this._manageFocusAfterSwitch(targetMode));
    }
    this._savePreferences();

    return true;
  }

  /**
   * Toggle between Basic and Advanced modes
   * @returns {UIMode} New mode after toggle
   */
  toggleMode() {
    const newMode = this.currentMode === 'advanced' ? 'basic' : 'advanced';
    this.switchMode(newMode);
    return this.currentMode;
  }

  /**
   * Apply panel visibility for the given mode.
   * Adds/removes HIDDEN_CLASS on panel elements.
   *
   * CRITICAL: Never hides .param-group or .param-control elements.
   * Parameter group visibility is independently controlled by isSimpleGroup()
   * and data-settings-level attributes — those mechanisms are separate.
   *
   * @param {UIMode} mode
   */
  applyMode(mode) {
    const hiddenPanelIds = this._getEffectiveHiddenPanels();
    const panelResults = [];

    for (const panel of PANEL_REGISTRY) {
      const elements = this._queryPanelElements(panel.selector);
      const shouldHide = mode === 'basic' && hiddenPanelIds.includes(panel.id);

      if (shouldHide) {
        elements.forEach((el) => el.classList.add(HIDDEN_CLASS));
      } else {
        elements.forEach((el) => el.classList.remove(HIDDEN_CLASS));
      }

      panelResults.push({
        id: panel.id,
        selector: panel.selector,
        elementsFound: elements.length,
        hidden: shouldHide,
      });
    }
  }

  /**
   * Apply the current mode (re-apply after DOM changes)
   */
  applyCurrentMode() {
    this.applyMode(this.currentMode);
  }

  /**
   * Set per-project hidden panel overrides.
   * Null resets to user/default preferences.
   * @param {string[]|null} hiddenPanelIds
   */
  setProjectHiddenPanels(hiddenPanelIds) {
    this._projectHiddenPanels = hiddenPanelIds;
  }

  /**
   * Get the current hidden panel list for export (project save / manifest sharing).
   * @returns {{ defaultMode: UIMode, hiddenPanelsInBasic: string[] }}
   */
  getPreferencesForExport() {
    return {
      defaultMode: this.currentMode,
      hiddenPanelsInBasic: this._getEffectiveHiddenPanels(),
    };
  }

  /**
   * Import UI preferences (from project metadata or manifest defaults).
   * @param {Object} prefs
   * @param {UIMode} [prefs.defaultMode]
   * @param {string[]} [prefs.hiddenPanelsInBasic]
   * @param {Object} [options]
   * @param {boolean} [options.applyImmediately] - Apply mode after import
   */
  importPreferences(prefs, options = {}) {
    if (!prefs || typeof prefs !== 'object') return;

    if (Array.isArray(prefs.hiddenPanelsInBasic)) {
      this._projectHiddenPanels = prefs.hiddenPanelsInBasic;
    }

    if (prefs.defaultMode === 'basic' || prefs.defaultMode === 'advanced') {
      this.currentMode = prefs.defaultMode;
    }

    if (options.applyImmediately !== false) {
      this.applyMode(this.currentMode);
      this._updateToggleButton();
    }
  }

  /**
   * Update the user's default hidden panel list (saved to localStorage).
   * @param {string} panelId - Panel ID to toggle
   * @param {boolean} hidden - Whether the panel should be hidden in Basic mode
   */
  setPanelHidden(panelId, hidden) {
    const validIds = PANEL_REGISTRY.map((p) => p.id);
    if (!validIds.includes(panelId)) return;

    const current = this._getEffectiveHiddenPanels();
    const updated = hidden
      ? [...new Set([...current, panelId])]
      : current.filter((id) => id !== panelId);

    this._saveHiddenPanels(updated);

    if (this.currentMode === 'basic') {
      this.applyMode('basic');
    }
  }

  /**
   * Reset hidden panel preferences to PANEL_REGISTRY defaults.
   */
  resetHiddenPanelsToDefaults() {
    const defaults = PANEL_REGISTRY.filter((p) => p.defaultHiddenInBasic).map(
      (p) => p.id
    );
    this._saveHiddenPanels(defaults);
    this._projectHiddenPanels = null;

    if (this.currentMode === 'basic') {
      this.applyMode('basic');
    }
  }

  /**
   * Render the preferences panel into the given container element.
   * Uses safe DOM building (createElement + textContent) — no innerHTML.
   * @param {HTMLElement} container - Element to render the preferences into
   */
  renderPreferencesPanel(container) {
    if (!container) return;

    container.textContent = '';

    const heading = document.createElement('h4');
    heading.className = 'ui-prefs-heading';
    heading.textContent = 'Basic Mode: Hidden Panels';
    heading.id = 'uiPrefsHeading';
    container.appendChild(heading);

    const description = document.createElement('p');
    description.className = 'ui-prefs-description';
    description.textContent =
      'Select which panels are hidden when Basic mode is active. Parameter controls always remain visible.';
    container.appendChild(description);

    const group = document.createElement('div');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-labelledby', 'uiPrefsHeading');
    group.className = 'ui-prefs-group';

    const hiddenPanels = this._getEffectiveHiddenPanels();

    for (const panel of PANEL_REGISTRY) {
      const row = document.createElement('div');
      row.className = 'ui-prefs-item';

      const label = document.createElement('label');
      label.className = 'ui-prefs-item-label';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = hiddenPanels.includes(panel.id);
      checkbox.dataset.panelId = panel.id;
      checkbox.setAttribute('aria-label', `Hide ${panel.label} in Basic mode`);

      checkbox.addEventListener('change', () => {
        this.setPanelHidden(panel.id, checkbox.checked);
        announceImmediate(
          `${panel.label} will be ${checkbox.checked ? 'hidden' : 'visible'} in Basic mode`,
          { clearDelayMs: 2000 }
        );
      });

      const text = document.createElement('span');
      text.textContent = panel.label;

      label.appendChild(checkbox);
      label.appendChild(text);
      row.appendChild(label);

      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'btn btn-xs ui-prefs-quick-toggle';
      toggleBtn.textContent = 'Toggle';
      toggleBtn.setAttribute('aria-label', `Toggle ${panel.label} now`);
      toggleBtn.addEventListener('click', () => {
        this.togglePanelVisibility(panel.id);
      });
      row.appendChild(toggleBtn);

      group.appendChild(row);
    }

    container.appendChild(group);

    const actions = document.createElement('div');
    actions.className = 'ui-prefs-actions';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn btn-sm btn-outline';
    resetBtn.textContent = 'Reset to Defaults';
    resetBtn.addEventListener('click', () => {
      this.resetHiddenPanelsToDefaults();
      this.renderPreferencesPanel(container);
      announceImmediate('Panel preferences reset to defaults', {
        clearDelayMs: 2000,
      });
    });
    actions.appendChild(resetBtn);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-sm btn-primary ui-prefs-save-project';
    saveBtn.textContent = 'Save to Project';
    saveBtn.title =
      'Save these preferences to the current project so they transfer when shared';
    saveBtn.addEventListener('click', () => {
      this._savePreferencesToProject();
    });
    actions.appendChild(saveBtn);

    container.appendChild(actions);
  }

  /**
   * Instantly toggle a panel's visibility (open/close for details, hidden class for others).
   * @param {string} panelId - ID from PANEL_REGISTRY
   */
  togglePanelVisibility(panelId) {
    const panel = PANEL_REGISTRY.find((p) => p.id === panelId);
    if (!panel) return;

    const elements = this._queryPanelElements(panel.selector);
    if (elements.length === 0) return;

    const primary = elements[0];
    if (primary.tagName === 'DETAILS') {
      primary.open = !primary.open;
      announceImmediate(
        `${panel.label} ${primary.open ? 'opened' : 'closed'}`,
        { clearDelayMs: 1500 }
      );
      if (primary.open) {
        primary.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } else {
      const isHidden = primary.classList.toggle(HIDDEN_CLASS);
      announceImmediate(`${panel.label} ${isHidden ? 'hidden' : 'shown'}`, {
        clearDelayMs: 1500,
      });
    }
  }

  /**
   * Cycle focus to the next visible disclosure panel.
   * @param {number} direction - 1 for next, -1 for previous
   */
  cyclePanel(direction = 1) {
    const detailsPanels = PANEL_REGISTRY.map((p) => {
      const el = document.querySelector(p.selector.split(',')[0].trim());
      return el &&
        el.tagName === 'DETAILS' &&
        !el.classList.contains(HIDDEN_CLASS)
        ? { el, label: p.label }
        : null;
    }).filter(Boolean);

    if (detailsPanels.length === 0) return;

    const focused = document.activeElement;
    let currentIdx = detailsPanels.findIndex(
      ({ el }) => el.contains(focused) || el === focused
    );

    if (currentIdx === -1) {
      currentIdx = direction === 1 ? -1 : 0;
    }

    const nextIdx =
      (currentIdx + direction + detailsPanels.length) % detailsPanels.length;
    const target = detailsPanels[nextIdx];

    if (!target.el.open) {
      target.el.open = true;
    }
    const summary = target.el.querySelector('summary');
    if (summary) {
      summary.focus();
      summary.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    announceImmediate(target.label, { clearDelayMs: 1500 });
  }

  /**
   * Initialize the controller: show/hide toggle button per feature flag,
   * wire click handler, apply initial mode.
   */
  init() {
    const btn = document.getElementById('uiModeToggle');
    if (!btn) return;

    if (this.isFeatureEnabled()) {
      btn.classList.remove('hidden');
    } else {
      btn.classList.add('hidden');
      return;
    }

    btn.addEventListener('click', () => this.toggleMode());
    this._updateToggleButton();

    const prefsContainer = document.getElementById('uiPrefsPanel');
    if (prefsContainer) {
      this.renderPreferencesPanel(prefsContainer);
    }
  }

  // ============================================================================
  // Private methods
  // ============================================================================

  /**
   * Get the effective list of hidden panel IDs for the current context.
   * Resolution order: per-project override > localStorage defaults > PANEL_REGISTRY defaults
   * @returns {string[]}
   * @private
   */
  _getEffectiveHiddenPanels() {
    if (this._projectHiddenPanels !== null) {
      return this._projectHiddenPanels;
    }

    try {
      const stored = localStorage.getItem(UI_MODE_STORAGE_KEY);
      if (stored) {
        const prefs = JSON.parse(stored);
        if (Array.isArray(prefs.hiddenPanels)) {
          return prefs.hiddenPanels;
        }
      }
    } catch {
      // Fall through to defaults
    }

    return PANEL_REGISTRY.filter((p) => p.defaultHiddenInBasic).map(
      (p) => p.id
    );
  }

  /**
   * Query DOM elements for a panel selector, skipping param-group elements.
   * @param {string} selector
   * @returns {Element[]}
   * @private
   */
  _queryPanelElements(selector) {
    const elements = [];
    const parts = selector.split(',').map((s) => s.trim());

    for (const part of parts) {
      try {
        const found = document.querySelectorAll(part);
        found.forEach((el) => {
          // Safety: never hide param-group or param-control elements
          if (
            !el.classList.contains('param-group') &&
            !el.classList.contains('param-control')
          ) {
            elements.push(el);
          }
        });
      } catch (error) {
        console.warn(`[UIModeController] Invalid selector: ${part}`, error);
      }
    }

    return elements;
  }

  /**
   * Notify all subscribers of mode change
   * @param {UIMode} newMode
   * @param {UIMode} oldMode
   * @private
   */
  _notifySubscribers(newMode, oldMode) {
    this.subscribers.forEach((callback) => {
      try {
        callback(newMode, oldMode);
      } catch (error) {
        console.error('[UIModeController] Subscriber error:', error);
      }
    });
  }

  /**
   * Update toggle button ARIA attributes and slider position class
   * @private
   */
  _updateToggleButton() {
    const btn = document.getElementById('uiModeToggle');
    if (!btn) return;

    const isAdvanced = this.currentMode === 'advanced';
    btn.setAttribute('aria-checked', String(isAdvanced));

    if (isAdvanced) {
      btn.setAttribute(
        'aria-label',
        'Interface mode: Advanced. Click to switch to Basic mode'
      );
      btn.classList.remove('ui-mode-toggle--basic');
    } else {
      btn.setAttribute(
        'aria-label',
        'Interface mode: Basic. Click to switch to Advanced mode'
      );
      btn.classList.add('ui-mode-toggle--basic');
    }
  }

  /**
   * Move focus to an appropriate element after mode switch (WCAG 2.4.3)
   * @param {UIMode} mode
   * @private
   */
  _manageFocusAfterSwitch(mode) {
    try {
      if (mode === 'basic') {
        // Focus the first visible parameter control
        const firstInput = document.querySelector(
          '.param-control:not(.ui-mode-hidden) input:not([type="hidden"]), ' +
            '.param-control:not(.ui-mode-hidden) select'
        );
        if (firstInput) {
          firstInput.focus();
          return;
        }
      }
      // Fallback: return focus to the toggle button
      const btn = document.getElementById('uiModeToggle');
      if (btn) {
        btn.focus();
      }
    } catch (error) {
      console.warn('[UIModeController] Focus management error:', error);
    }
  }

  /**
   * Announce mode switch to screen readers
   * @param {UIMode} mode
   * @private
   */
  _announceSwitch(mode) {
    const messages = {
      basic:
        'Switched to Basic mode. Advanced panels are now hidden. Parameter controls remain accessible.',
      advanced: 'Switched to Advanced mode. All panels are now visible.',
    };

    announceImmediate(messages[mode] || `Switched to ${mode} mode`, {
      clearDelayMs: 3000,
    });
  }

  /**
   * Load mode preference from localStorage
   * @private
   */
  _loadPreferences() {
    try {
      const stored = localStorage.getItem(UI_MODE_STORAGE_KEY);
      if (stored) {
        const prefs = JSON.parse(stored);
        if (prefs.mode === 'basic' || prefs.mode === 'advanced') {
          this.currentMode = prefs.mode;
        }
      }
    } catch (error) {
      console.warn('[UIModeController] Could not load preferences:', error);
    }
  }

  /**
   * Save current mode preference to localStorage.
   * Gracefully handles QuotaExceededError.
   * @private
   */
  _savePreferences() {
    try {
      const stored = localStorage.getItem(UI_MODE_STORAGE_KEY);
      const existing = stored ? JSON.parse(stored) : {};
      const prefs = { ...existing, mode: this.currentMode };
      localStorage.setItem(UI_MODE_STORAGE_KEY, JSON.stringify(prefs));
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        console.warn(
          '[UIModeController] localStorage quota exceeded — mode preference not saved'
        );
      } else {
        console.warn('[UIModeController] Could not save preferences:', error);
      }
    }
  }

  /**
   * Save the hidden panels list to localStorage (user default preferences).
   * @param {string[]} hiddenPanelIds
   * @private
   */
  _saveHiddenPanels(hiddenPanelIds) {
    try {
      const stored = localStorage.getItem(UI_MODE_STORAGE_KEY);
      const existing = stored ? JSON.parse(stored) : {};
      const prefs = { ...existing, hiddenPanels: hiddenPanelIds };
      localStorage.setItem(UI_MODE_STORAGE_KEY, JSON.stringify(prefs));
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        console.warn(
          '[UIModeController] localStorage quota exceeded — hidden panels not saved'
        );
      } else {
        console.warn('[UIModeController] Could not save hidden panels:', error);
      }
    }
  }

  /**
   * Save UI preferences to the currently loaded project (dispatches custom event).
   * The main app listens for this event and writes to IndexedDB project metadata.
   * @private
   */
  _savePreferencesToProject() {
    const prefs = this.getPreferencesForExport();

    const event = new CustomEvent('ui-mode-save-to-project', {
      detail: { uiPreferences: prefs },
      bubbles: true,
    });
    document.dispatchEvent(event);

    announceImmediate('UI preferences saved to current project', {
      clearDelayMs: 2000,
    });

    console.log(
      '[UIModeController] Preferences dispatched for project save:',
      prefs
    );
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create the UIModeController singleton
 * @param {Object} [options] - Options for new instance (only used on first call)
 * @returns {UIModeController}
 */
export function getUIModeController(options = {}) {
  if (!instance) {
    instance = new UIModeController(options);
  }
  return instance;
}

/**
 * Reset UIModeController singleton (for testing)
 */
export function resetUIModeController() {
  instance = null;
}
