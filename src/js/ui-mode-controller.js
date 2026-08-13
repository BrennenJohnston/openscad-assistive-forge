/**
 * UI Mode Controller - Single owner of the interface layout mode
 *
 * Simplified: core parameter controls and preview only (panels hidden)
 * Standard: full interface with all panels visible
 * Classic: desktop-OpenSCAD-style dock layout (gated on the classic_mode
 *   feature flag; layout applied via body[data-ui-mode])
 *
 * Simplified/Standard is a DENSITY that applies in Classic too, stamped as
 * body[data-classic-density] and driven by the header switch. It is stored
 * in the same field Classic returns to on exit, so choosing Simplified
 * inside Classic and then leaving Classic lands in Simplified — one
 * preference, two layouts. The panel registry below is shared, minus the
 * menus Classic cannot do without (CLASSIC_SIMPLIFIED_KEEP_VISIBLE).
 *
 * Legacy stored values migrate on load: 'basic' → 'simplified',
 * 'advanced' → 'standard'. Storage keys and panel IDs are unchanged.
 *
 * @license GPL-3.0-or-later
 */

import { isEnabled } from './feature-flags.js';
import { announceImmediate } from './announcer.js';
import {
  isViewportDesktopShaped,
  subscribeViewportShape,
} from './classic-availability.js';
import { STORAGE_KEY_UI_MODE } from './storage-keys.js';

/**
 * @typedef {'simplified' | 'standard' | 'classic'} UIMode
 */

const VALID_MODES = ['simplified', 'standard', 'classic'];

const LEGACY_MODE_MAP = {
  basic: 'simplified',
  advanced: 'standard',
};

/**
 * Normalize a mode value, accepting legacy names from old storage,
 * manifests, and ?uiMode= links.
 * @param {*} value
 * @returns {UIMode|null} Normalized mode, or null if unrecognized
 */
export function normalizeUiMode(value) {
  if (typeof value !== 'string') return null;
  const mapped = LEGACY_MODE_MAP[value] || value;
  return VALID_MODES.includes(mapped) ? mapped : null;
}

/**
 * @typedef {Object} PanelDefinition
 * @property {string} id - Unique panel identifier
 * @property {string} label - Human-readable label for preferences UI
 * @property {string} selector - CSS selector targeting the panel element(s)
 * @property {boolean} defaultHiddenInBasic - Whether hidden by default in Simplified mode
 */

// Storage key for UI mode preference (follows openscad-forge-{feature}
// convention; the string lives in storage-keys.js since UF-14 so
// ui-scoped-prefs.js can share it)
const UI_MODE_STORAGE_KEY = STORAGE_KEY_UI_MODE;

// CSS class applied to panel elements when hidden in Simplified mode
const HIDDEN_CLASS = 'ui-mode-hidden';

/**
 * Registry of panels controlled by Simplified mode.
 * Selectors are verified against the current index.html DOM structure.
 * CRITICAL: Never target .param-group or .param-control elements here —
 * those are independently controlled by isSimpleGroup() and data-settings-level.
 *
 * @type {PanelDefinition[]}
 */
const PANEL_REGISTRY = [
  {
    id: 'consoleOutput',
    label: 'Console',
    selector: '#consolePanel',
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
    label: 'Reference Image',
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
    id: 'companionFileManagement',
    label: 'Companion Files',
    selector: '#projectFilesControls',
    defaultHiddenInBasic: true,
  },
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
 * Panels the Simplified density hides everywhere EXCEPT Classic: the desktop
 * shell routes File/Export, rendering, view and help through its menu bar, so
 * hiding those four would strand the actions with no other home. Edit and
 * Window stay in the hidden list — Edit is editor-only and Window toggles
 * panes Simplified has already dropped.
 * @type {Set<string>}
 */
const CLASSIC_SIMPLIFIED_KEEP_VISIBLE = new Set([
  'toolbarMenuFile',
  'toolbarMenuDesign',
  'toolbarMenuView',
  'toolbarMenuHelp',
]);

/**
 * UIModeController - Central controller for interface mode switching
 *
 * Responsibilities:
 * - Track current UI mode (simplified/standard/classic)
 * - Handle mode switching with screen reader announcements
 * - Persist mode preference to localStorage (with legacy-name migration)
 * - Apply panel visibility via CSS class and body[data-ui-mode]
 * - Expose panel registry for preferences UI
 */
export class UIModeController {
  /**
   * @param {Object} options
   * @param {Function} [options.onModeChange] - Callback when mode changes
   */
  constructor(options = {}) {
    /** @type {UIMode} */
    this.currentMode = 'simplified';

    /**
     * @type {'simplified'|'standard'} The custom mode to return to when the
     * header Classic toggle switches back out of classic.
     */
    this._lastCustomMode = 'standard';

    /** @type {Function} */
    this.onModeChange = options.onModeChange || (() => {});

    /** @type {Set<Function>} */
    this.subscribers = new Set();

    /** @type {string[]} Hidden panel IDs for current project (overrides defaults) */
    this._projectHiddenPanels = null;

    /**
     * @type {boolean} U-10: a saved Classic preference was deferred at
     * boot because the viewport is mobile-shaped. While true, preference
     * writes keep the stored 'classic' so the next desktop visit boots
     * Classic; an explicit mode switch clears it (the user's new choice
     * wins).
     */
    this._classicDeferredByViewport = false;

    // Load saved preferences
    this._loadPreferences();
  }

  /**
   * Check if the mode toggle feature is enabled via feature flag
   * @returns {boolean}
   */
  isFeatureEnabled() {
    return isEnabled('basic_advanced_mode');
  }

  /**
   * Check if Classic mode can be ENTERED right now: the classic_mode
   * feature flag AND a desktop-shaped viewport (U-10, Q-24a — the gate
   * governs entry only; a live Classic session is never ejected). The
   * flag decides whether Classic exists at all; the viewport decides
   * whether entry is open. Callers needing the flag alone (header button
   * visibility) use isEnabled('classic_mode') directly.
   * @returns {boolean}
   */
  isClassicAvailable() {
    return isEnabled('classic_mode') && isViewportDesktopShaped();
  }

  /**
   * True when this boot found a saved Classic preference but the viewport
   * gate deferred it (U-10): the session runs a custom mode, the saved
   * preference is preserved, and the one-time notice should show.
   * @returns {boolean}
   */
  isClassicDeferredByViewport() {
    return this._classicDeferredByViewport;
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
   * @param {UIMode} targetMode - 'simplified', 'standard', or 'classic'
   *   (legacy 'basic'/'advanced' accepted and migrated)
   * @param {Object} [options]
   * @param {boolean} [options.skipAnnouncement] - Skip screen reader announcement
   * @param {boolean} [options.skipFocus] - Skip focus management
   * @returns {boolean} True if switch was successful
   */
  switchMode(targetMode, options = {}) {
    targetMode = normalizeUiMode(targetMode);
    if (!targetMode) {
      console.warn(`[UIModeController] Invalid mode: ${targetMode}`);
      return false;
    }

    if (targetMode === 'classic' && !this.isClassicAvailable()) {
      console.warn(
        '[UIModeController] Classic mode requested but classic_mode flag is disabled'
      );
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

    // A real mode switch is a new choice: stop protecting the deferred
    // Classic preference (U-10) — the switch below persists targetMode.
    this._classicDeferredByViewport = false;

    if (previousMode !== 'classic') {
      this._lastCustomMode = previousMode;
    }

    this.currentMode = targetMode;
    this.applyMode(targetMode);
    this._updateToggleButton();
    this._updateClassicToggleButton();
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
   * Toggle between Simplified and Standard modes.
   * From Classic mode, toggling returns to Simplified.
   * @returns {UIMode} New mode after toggle
   */
  toggleMode() {
    const newMode =
      this.currentMode === 'simplified' ? 'standard' : 'simplified';
    this.switchMode(newMode);
    return this.currentMode;
  }

  /**
   * Toggle Classic mode from the always-visible header button: enter classic
   * from any custom mode, or return to the custom mode the user came from.
   * @returns {UIMode} New mode after toggle
   */
  toggleClassic() {
    if (this.currentMode === 'classic') {
      this.switchMode(this._lastCustomMode || 'standard');
    } else {
      this.switchMode('classic');
    }
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
    const inClassic = mode === 'classic';

    if (document.body) {
      document.body.dataset.uiMode = mode;
      if (inClassic) {
        document.body.dataset.classicDensity = this._lastCustomMode;
      } else {
        delete document.body.dataset.classicDensity;
      }
    }

    const hiddenPanelIds = this._getEffectiveHiddenPanels();
    const simplifiedActive =
      mode === 'simplified' ||
      (inClassic && this._lastCustomMode === 'simplified');

    for (const panel of PANEL_REGISTRY) {
      const elements = this._queryPanelElements(panel.selector);
      const shouldHide =
        simplifiedActive &&
        hiddenPanelIds.includes(panel.id) &&
        !(inClassic && CLASSIC_SIMPLIFIED_KEEP_VISIBLE.has(panel.id));

      if (shouldHide) {
        elements.forEach((el) => el.classList.add(HIDDEN_CLASS));
      } else {
        elements.forEach((el) => el.classList.remove(HIDDEN_CLASS));
      }
    }

    this._updateClassicDensityButton();

    // Document-level notification for modules that must react to the layout
    // mode without importing this controller (import order would decide who
    // constructs the singleton). First consumer: the mobile drawer closes
    // itself when Classic takes over the Customizer.
    document.dispatchEvent(
      new CustomEvent('ui-mode-changed', { detail: { mode } })
    );
  }

  /**
   * The Simplified/Standard density in effect inside Classic. Shared with
   * the custom mode Classic returns to on exit.
   * @returns {'simplified'|'standard'}
   */
  getClassicDensity() {
    return this._lastCustomMode === 'simplified' ? 'simplified' : 'standard';
  }

  /**
   * Choose the Simplified or Standard density. In Classic this re-applies
   * the shell in place; outside Classic it only records the preference,
   * which is also the mode Classic returns to.
   * @param {'simplified'|'standard'} density
   * @param {Object} [options]
   * @param {boolean} [options.skipAnnouncement]
   * @returns {'simplified'|'standard'} The density in effect after the call
   */
  setClassicDensity(density, options = {}) {
    const normalized = normalizeUiMode(density);
    if (normalized !== 'simplified' && normalized !== 'standard') {
      console.warn(`[UIModeController] Invalid classic density: ${density}`);
      return this.getClassicDensity();
    }
    if (normalized === this._lastCustomMode) return normalized;

    this._lastCustomMode = normalized;
    this._savePreferences();

    if (this.currentMode === 'classic') {
      this.applyMode('classic');
      document.dispatchEvent(
        new CustomEvent('classic-density-change', {
          detail: { density: normalized },
        })
      );
      if (!options.skipAnnouncement) {
        announceImmediate(
          normalized === 'simplified'
            ? 'Simplified Classic view. The editor and console panes, the file and undo toolbar buttons, and the Edit and Window menus are hidden.'
            : 'Standard Classic view. All panes, toolbar buttons, and menus are shown.',
          { clearDelayMs: 4000 }
        );
      }
    } else {
      this._updateClassicDensityButton();
    }

    return normalized;
  }

  /**
   * Flip the Classic density between Simplified and Standard.
   * @returns {'simplified'|'standard'} The density in effect after the call
   */
  toggleClassicDensity() {
    return this.setClassicDensity(
      this.getClassicDensity() === 'simplified' ? 'standard' : 'simplified'
    );
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

    const normalized = normalizeUiMode(prefs.defaultMode);
    if (normalized) {
      this.currentMode =
        normalized === 'classic' && !this.isClassicAvailable()
          ? 'standard'
          : normalized;
    }

    if (options.applyImmediately !== false) {
      this.applyMode(this.currentMode);
      this._updateToggleButton();
    }
  }

  /**
   * Update the user's default hidden panel list (saved to localStorage).
   * @param {string} panelId - Panel ID to toggle
   * @param {boolean} hidden - Whether the panel should be hidden in Simplified mode
   */
  setPanelHidden(panelId, hidden) {
    const validIds = PANEL_REGISTRY.map((p) => p.id);
    if (!validIds.includes(panelId)) return;

    const current = this._getEffectiveHiddenPanels();
    const updated = hidden
      ? [...new Set([...current, panelId])]
      : current.filter((id) => id !== panelId);

    this._saveHiddenPanels(updated);

    if (this.currentMode === 'simplified') {
      this.applyMode('simplified');
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

    if (this.currentMode === 'simplified') {
      this.applyMode('simplified');
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
    heading.textContent = 'Simplified Mode: Hidden Panels';
    heading.id = 'uiPrefsHeading';
    container.appendChild(heading);

    const description = document.createElement('p');
    description.className = 'ui-prefs-description';
    description.textContent =
      'Select which panels are hidden when Simplified mode is active. Parameter controls always remain visible.';
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
      checkbox.setAttribute(
        'aria-label',
        `Hide ${panel.label} in Simplified mode`
      );

      checkbox.addEventListener('change', () => {
        this.setPanelHidden(panel.id, checkbox.checked);
        announceImmediate(
          `${panel.label} will be ${checkbox.checked ? 'hidden' : 'visible'} in Simplified mode`,
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
  /**
   * The disclosure panels a user can move focus to right now, in registry
   * order. Window ▸ Jump To… and panel cycling share this list, so the two
   * cannot disagree about what counts as a panel.
   * @returns {{id: string, label: string, el: HTMLElement}[]}
   */
  /**
   * Is a registered panel on screen right now? This asks the DOM rather than
   * the Simplified-view preference, because Classic's dock adopts some of
   * these panels and shows them whatever that preference says.
   * @param {string} panelId
   * @returns {boolean}
   */
  isPanelShowing(panelId) {
    const panel = PANEL_REGISTRY.find((p) => p.id === panelId);
    if (!panel) return false;
    const el = document.querySelector(panel.selector.split(',')[0].trim());
    if (!el || el.classList.contains(HIDDEN_CLASS)) return false;
    return el.tagName === 'DETAILS' ? el.open : true;
  }

  listFocusablePanels() {
    return PANEL_REGISTRY.map((p) => {
      const el = document.querySelector(p.selector.split(',')[0].trim());
      return el &&
        el.tagName === 'DETAILS' &&
        !el.classList.contains(HIDDEN_CLASS)
        ? { id: p.id, el, label: p.label }
        : null;
    }).filter(Boolean);
  }

  cyclePanel(direction = 1) {
    const detailsPanels = this.listFocusablePanels();

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
    // Full apply, not a bare uiMode stamp: a reload straight into Classic
    // must land with the density attribute and the Simplified panel hiding
    // already in place, not only once a project finishes loading.
    this.applyMode(this.currentMode);

    // Header Classic toggle: wired BEFORE the basic_advanced_mode early
    // return below — that flag gates the Simplified/Standard switch only
    // and must never take the Classic entry point down with it.
    //
    // Visibility is the FLAG's job; usability is the VIEWPORT's (U-10).
    // With the flag on but the viewport mobile-shaped, the button shows
    // disabled-with-reason instead of vanishing, and re-enables live when
    // a desktop-shaped window returns.
    const classicBtn = document.getElementById('classicModeToggle');
    if (classicBtn) {
      if (isEnabled('classic_mode')) {
        classicBtn.classList.remove('hidden');
        classicBtn.addEventListener('click', (event) => {
          // Gated means aria-disabled, not disabled: the click still
          // arrives — say why instead of doing nothing (house pattern).
          if (classicBtn.getAttribute('aria-disabled') === 'true') {
            event.preventDefault();
            this._announceClassicUnavailable();
            return;
          }
          this.toggleClassic();
        });
        this._updateClassicToggleButton();
        subscribeViewportShape(() => this._updateClassicToggleButton());
      } else {
        classicBtn.classList.add('hidden');
      }
    }

    // The Classic density switch is Classic-only chrome (classic.css keeps
    // it out of the custom modes), so it is wired alongside the Classic
    // entry point rather than behind the basic_advanced_mode flag.
    const densityBtn = document.getElementById('classicDensityToggle');
    if (densityBtn) {
      densityBtn.addEventListener('click', () => this.toggleClassicDensity());
      this._updateClassicDensityButton();
    }

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

    const isSimplified = this.currentMode === 'simplified';
    btn.setAttribute('aria-checked', String(!isSimplified));

    if (isSimplified) {
      btn.setAttribute(
        'aria-label',
        'Interface mode: Simplified. Click to switch to Standard mode'
      );
      btn.classList.add('ui-mode-toggle--basic');
    } else {
      const modeName = this.currentMode === 'classic' ? 'Classic' : 'Standard';
      btn.setAttribute(
        'aria-label',
        `Interface mode: ${modeName}. Click to switch to Simplified mode`
      );
      btn.classList.remove('ui-mode-toggle--basic');
    }
  }

  /**
   * Update the always-visible header Classic toggle's pressed state + labels
   * @private
   */
  _updateClassicToggleButton() {
    const btn = document.getElementById('classicModeToggle');
    if (!btn) return;

    const isClassic = this.currentMode === 'classic';
    btn.setAttribute('aria-pressed', String(isClassic));
    // The button names what pressing it DOES, like the theme toggles (U-7):
    // inside Classic it is the way back to the Assistive Forge interface,
    // and the visible label says so rather than only changing color.
    const label = isClassic
      ? 'Switch back to the Assistive Forge interface'
      : 'Switch to Classic desktop layout';
    btn.setAttribute('aria-label', label);
    const visibleLabel = btn.querySelector('.classic-label');
    if (visibleLabel) {
      visibleLabel.textContent = isClassic ? 'A. Forge' : 'Classic';
    }

    // U-10: the button locks only while it points INTO Classic on a
    // mobile-shaped viewport. The way OUT of Classic is never gated.
    const gated = !isClassic && !isViewportDesktopShaped();
    if (gated) {
      btn.setAttribute('aria-disabled', 'true');
      btn.setAttribute('aria-describedby', 'classicModeToggleReason');
      const reason = document
        .getElementById('classicModeToggleReason')
        ?.textContent.replace(/\s+/g, ' ')
        .trim();
      btn.setAttribute('title', reason ? `${label}. ${reason}` : label);
    } else {
      btn.removeAttribute('aria-disabled');
      btn.removeAttribute('aria-describedby');
      btn.setAttribute('title', label);
    }
  }

  /**
   * Say why the Classic toggle refuses right now (the U-10 viewport gate),
   * composing the control's name with its reason text the same way the
   * Classic editor toolbar announces its gated buttons.
   * @private
   */
  _announceClassicUnavailable() {
    const reason = document
      .getElementById('classicModeToggleReason')
      ?.textContent.replace(/\s+/g, ' ')
      .trim();
    announceImmediate(
      reason ? `Classic unavailable. ${reason}` : 'Classic unavailable.'
    );
  }

  /**
   * Update the Classic density switch's pressed state and label.
   * @private
   */
  _updateClassicDensityButton() {
    const btn = document.getElementById('classicDensityToggle');
    if (!btn) return;

    const isSimplified = this.getClassicDensity() === 'simplified';
    btn.setAttribute('aria-checked', String(!isSimplified));
    btn.classList.toggle('ui-mode-toggle--basic', isSimplified);
    btn.setAttribute(
      'aria-label',
      isSimplified
        ? 'Classic view: Simplified. Click to switch to Standard'
        : 'Classic view: Standard. Click to switch to Simplified'
    );
  }

  /**
   * Move focus to an appropriate element after mode switch (WCAG 2.4.3)
   * @param {UIMode} mode
   * @private
   */
  _manageFocusAfterSwitch(mode) {
    try {
      if (mode === 'simplified') {
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
      simplified:
        'Switched to Simplified mode. Extra panels are now hidden. Parameter controls remain accessible.',
      standard: 'Switched to Standard mode. All panels are now visible.',
      classic: `Switched to Classic mode, ${this.getClassicDensity()} view. Desktop-style layout with display, customizer, presets, and console panes.${this._suspendedAppearanceNote()}`,
    };

    announceImmediate(messages[mode] || `Switched to ${mode} mode`, {
      clearDelayMs: 3000,
    });
  }

  /**
   * Classic renders one fixed desktop appearance, so a dark or high-contrast
   * preference does not apply there. Say so instead of letting the setting
   * silently stop working (owner decision 2026-08-05).
   * @returns {string} Sentence to append, or '' when nothing is suspended
   * @private
   */
  _suspendedAppearanceNote() {
    const root = document.documentElement;
    const highContrast = root?.getAttribute('data-high-contrast') === 'true';
    const dark = root?.getAttribute('data-theme') === 'dark';
    if (!highContrast && !dark) return '';

    const suspended =
      highContrast && dark
        ? 'Dark theme and high contrast are'
        : highContrast
          ? 'High contrast is'
          : 'Dark theme is';
    return ` Classic uses the desktop light appearance, so ${suspended} paused until you leave Classic.`;
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
        const normalized = normalizeUiMode(prefs.mode);
        if (normalized) {
          if (normalized === 'classic' && !this.isClassicAvailable()) {
            this.currentMode = 'standard';
            // Only the viewport gate is a deferral (U-10): the choice
            // stays saved and the boot notice shows. A disabled flag is
            // the pre-existing silent fallback, unchanged.
            this._classicDeferredByViewport =
              isEnabled('classic_mode') && !isViewportDesktopShaped();
          } else {
            this.currentMode = normalized;
          }
        }
        const lastCustom = normalizeUiMode(prefs.lastCustomMode);
        if (lastCustom === 'simplified' || lastCustom === 'standard') {
          this._lastCustomMode = lastCustom;
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
      const prefs = {
        ...existing,
        mode: this.currentMode,
        lastCustomMode: this._lastCustomMode,
      };
      // U-10: while a saved Classic sits deferred behind the viewport
      // gate, incidental writes (a density flip, hidden-panel edits) must
      // not overwrite it — the next desktop visit still boots Classic.
      // switchMode clears the deferral first, so explicit choices win.
      if (this._classicDeferredByViewport && existing.mode === 'classic') {
        prefs.mode = 'classic';
      }
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
