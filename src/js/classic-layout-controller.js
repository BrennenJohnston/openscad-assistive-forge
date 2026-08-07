/**
 * Classic Layout Controller - Applies the Classic (desktop-OpenSCAD-style)
 * layout when the UI mode is 'classic'.
 *
 * Desktop shell mapping (C5/C7):
 *   Editor     — #expertModePanel, moved into a titled slot (visible by
 *                default, Window > Editor / titlebar ✕ toggles it)
 *   Display    — .preview-panel (untouched)
 *   Customizer — .param-panel with the desktop-style #classicCustomizerBar
 *                at its top: titlebar, then Automatic Preview + the moved
 *                #customizerHeaderRow (Show Details / Reset All), then the
 *                preset row
 *   Presets    — #presetControls, moved INTO the Customizer bar's
 *                #classicPresetRow (desktop puts the preset combobox inside
 *                the Customizer dock)
 *   Camera bar — #classicCameraBar, a thin row along the bottom edge of the
 *                3D view (populated by sub-plan E)
 *   Bottom     — #classicBottomStrip spanning between the editor and the
 *                right column, holding Console and Error-Log side by side
 *                (plus Animate / Font List once sub-plan F builds them)
 *
 * Moves use appendChild (event listeners survive); the original parent and
 * nextSibling are recorded so exiting Classic restores the exact DOM order.
 * The grid itself lives in classic.css, keyed exclusively off
 * body[data-ui-mode='classic'] — other modes are untouched. Pane visibility
 * is data-attribute-driven (data-classic-*-hidden / -collapsed on <body>)
 * so folded panes actually give up their space, and each dock field is
 * stamped data-classic-field-<name>="occupied|empty" so the grid derives its
 * track sizes from occupancy instead of needing one template per combination.
 *
 * @license GPL-3.0-or-later
 */

import { getUIModeController } from './ui-mode-controller.js';
import { announceImmediate } from './announcer.js';

const PANES_STORAGE_KEY = 'openscad-forge-classic-panes';

/**
 * Classic startup contract: the customizer opens with all parameter
 * groups collapsed (desktop OpenSCAD behavior). Called on entering
 * Classic mode and after a project loads while Classic is active.
 * Setting `.open` fires the <details> 'toggle' event, so per-file
 * group state persistence keeps working.
 */
export function collapseCustomizerGroups() {
  document
    .querySelectorAll('#parametersContainer details.param-group')
    .forEach((group) => {
      if (group.open) group.open = false;
    });
}

/** Container for the side-by-side bottom-strip panes (D-1). */
const BOTTOM_STRIP_ID = 'classicBottomStrip';

/**
 * The camera bar. Created empty here so the grid has its row from the start;
 * sub-plan E fills it and gives it role="toolbar" and a name. An empty
 * labelled region is rotor clutter, so it stays unlabelled until populated.
 */
const CAMERA_BAR_ID = 'classicCameraBar';

/**
 * Dock slots, in creation order. `panelId` is optional — a slot without one
 * is a reserved field that sub-plan F fills (Animate, Font List,
 * Viewport-Control); it stays hidden until its pane-visibility state turns
 * it on. `parentId` places a slot inside another created element rather than
 * directly on the grid.
 *
 * Titles are upstream dock names (Appendix U), owner-approved 2026-08-06.
 */
const SLOT_DEFS = [
  {
    id: 'classicConsoleSlot',
    className: 'classic-slot classic-console-slot',
    label: 'Console',
    panelId: 'consolePanel',
    parentId: BOTTOM_STRIP_ID,
    titlebar: { text: 'Console', foldBtnId: 'classicConsoleFoldBtn' },
  },
  {
    // The inner live region moves, not the tabpanel wrapper — moving
    // #console-view-structured would strand a role="tabpanel" with no
    // tablist. ErrorLogPanel holds a direct element reference
    // (error-log-panel.js:48-49), which appendChild preserves.
    id: 'classicErrorLogSlot',
    className: 'classic-slot classic-error-log-slot',
    label: 'Error-Log',
    panelId: 'error-log-output',
    parentId: BOTTOM_STRIP_ID,
    titlebar: { text: 'Error-Log' },
  },
  {
    id: 'classicAnimateSlot',
    className: 'classic-slot classic-animate-slot',
    label: 'Animate',
    parentId: BOTTOM_STRIP_ID,
    titlebar: { text: 'Animate' },
  },
  {
    id: 'classicFontListSlot',
    className: 'classic-slot classic-font-list-slot',
    label: 'Font List',
    parentId: BOTTOM_STRIP_ID,
    titlebar: { text: 'Font List' },
  },
  {
    id: 'classicEditorSlot',
    className: 'classic-slot classic-editor-slot',
    label: 'Editor',
    panelId: 'expertModePanel',
    titlebar: { text: 'Editor', closeBtnId: 'classicEditorCloseBtn' },
  },
  {
    id: 'classicViewportControlSlot',
    className: 'classic-slot classic-viewport-control-slot',
    label: 'Viewport-Control',
    titlebar: { text: 'Viewport-Control' },
  },
];

/**
 * The dock fields the grid is built from. Each is stamped on <body> as
 * data-classic-field-<name>="occupied|empty"; classic.css collapses an empty
 * field's track to zero and hides its slot, so no arrangement can leave a
 * stray auto-placed cell. `centre` (the 3D view) is always occupied and has
 * no attribute.
 * @type {Array<{name: string, datasetSuffix: string}>}
 */
const DOCK_FIELDS = [
  { name: 'left', datasetSuffix: 'Left' },
  { name: 'right-top', datasetSuffix: 'RightTop' },
  { name: 'right-bottom', datasetSuffix: 'RightBottom' },
  { name: 'bottom', datasetSuffix: 'Bottom' },
];

/**
 * Panels that move into the Customizer dock rather than a created slot, so
 * its header block matches the desktop Customizer: the Show Details / Reset
 * row on the first line, the preset combobox and its +/−/save buttons on the
 * second. Order matters — each is appended to its target in turn.
 * @type {Array<{panelId: string, targetId: string}>}
 */
const CUSTOMIZER_DOCK_MOVES = [
  { panelId: 'customizerHeaderRow', targetId: 'classicCustomizerControls' },
  { panelId: 'presetControls', targetId: 'classicPresetRow' },
];

export class ClassicLayoutController {
  /**
   * @param {Object} [options]
   * @param {Function} [options.onEnter] - Called after the Classic layout is
   *   applied (main.js uses this to destroy the Split.js instance whose
   *   inline styles would fight the grid)
   * @param {Function} [options.onExit] - Called after the original layout is
   *   restored (main.js re-creates the split)
   */
  constructor(options = {}) {
    this.onEnter = options.onEnter || (() => {});
    this.onExit = options.onExit || (() => {});

    /** @type {boolean} */
    this.active = false;

    /**
     * Restore records for moved panels, in move order.
     * @type {Array<{el: Element, parent: Element, nextSibling: Node|null, wasOpen: boolean|null}>}
     */
    this._moved = [];

    /**
     * Which Forge console tab was selected when Classic took over, so exit()
     * can hand the panel back as found (D-9).
     * @type {'log'|'structured'|null}
     */
    this._consoleTabOnEnter = null;

    /** Pane visibility state, persisted. Desktop defaults: editor shown. */
    this._panes = this._loadPaneState();
  }

  /**
   * Subscribe to UI mode changes and apply the current mode.
   */
  init() {
    const ui = getUIModeController();
    ui.subscribe((newMode) => {
      if (newMode === 'classic') {
        this.enter();
      } else {
        this.exit();
      }
    });

    // Simplified drops the editor dock entirely, so CodeMirror must not be
    // initialized into a display:none container — activate it only when the
    // density brings the pane back.
    document.addEventListener('classic-density-change', () => {
      if (!this.active) return;
      // Simplified empties the left and bottom fields, so the grid's
      // occupancy attributes have to be re-stamped, not just the editor's
      // activation state.
      this._applyPaneAttributes();
      document.dispatchEvent(
        new CustomEvent(
          this._isEditorAvailable()
            ? 'classic-editor-activate'
            : 'classic-editor-deactivate'
        )
      );
    });

    if (ui.getMode() === 'classic') {
      this.enter();
    }
  }

  /**
   * Whether the editor dock is actually on screen: the pane toggle says so
   * AND the Simplified density has not dropped it.
   * @returns {boolean}
   * @private
   */
  _isEditorAvailable() {
    return (
      this._panes.editorVisible &&
      getUIModeController().getClassicDensity() !== 'simplified'
    );
  }

  /**
   * Apply the Classic layout: create slots, move panels in, open the
   * disclosure panels, stamp pane-state attributes.
   */
  enter() {
    if (this.active) return;

    const mainInterface = document.getElementById('mainInterface');
    if (!mainInterface) return;

    // Classic replaces the console's Log/Structured tabs with side-by-side
    // panes and hides the tablist, so a Structured selection left behind
    // would hide the Log view with no visible control to bring it back.
    // Reset to Log, remembering what was found so exit() can restore it (D-9).
    this._consoleTabOnEnter = this._sanitizeConsoleTabs();

    this._ensureContainer(
      mainInterface,
      BOTTOM_STRIP_ID,
      'classic-bottom-strip'
    );
    this._ensureContainer(mainInterface, CAMERA_BAR_ID, 'classic-camera-bar');

    for (const def of SLOT_DEFS) {
      const panel = def.panelId ? document.getElementById(def.panelId) : null;
      if (def.panelId && !panel) continue;

      const parent = def.parentId
        ? document.getElementById(def.parentId)
        : mainInterface;
      if (!parent) continue;

      const slot = this._ensureSlot(parent, def);
      if (!panel) continue;

      this._moved.push({
        el: panel,
        parent: panel.parentElement,
        nextSibling: panel.nextSibling,
        wasOpen: panel.tagName === 'DETAILS' ? panel.open : null,
      });

      slot.appendChild(panel);
      if (panel.tagName === 'DETAILS') {
        panel.open = true;
      }
    }

    // Header row + presets join the Customizer dock (desktop layout)
    for (const move of CUSTOMIZER_DOCK_MOVES) {
      const panel = document.getElementById(move.panelId);
      const target = document.getElementById(move.targetId);
      if (!panel || !target) continue;

      this._moved.push({
        el: panel,
        parent: panel.parentElement,
        nextSibling: panel.nextSibling,
        wasOpen: panel.tagName === 'DETAILS' ? panel.open : null,
      });
      target.appendChild(panel);
      if (panel.tagName === 'DETAILS') {
        panel.open = true;
      }
    }

    this._applyPaneAttributes();
    if (this._isEditorAvailable()) {
      document.dispatchEvent(new CustomEvent('classic-editor-activate'));
    }

    this.active = true;
    this.onEnter();
  }

  /**
   * Restore the original layout: move panels back to their recorded
   * positions (reverse order) and remove the slots.
   */
  exit() {
    if (!this.active) return;

    for (const record of [...this._moved].reverse()) {
      const { el, parent, nextSibling, wasOpen } = record;
      if (parent && parent.isConnected) {
        parent.insertBefore(el, nextSibling);
      }
      if (el.tagName === 'DETAILS' && wasOpen !== null) {
        el.open = wasOpen;
      }
    }
    this._moved = [];

    for (const def of SLOT_DEFS) {
      document.getElementById(def.id)?.remove();
    }
    document.getElementById(BOTTOM_STRIP_ID)?.remove();
    document.getElementById(CAMERA_BAR_ID)?.remove();

    delete document.body.dataset.classicEditorHidden;
    delete document.body.dataset.classicCustomizerHidden;
    delete document.body.dataset.classicConsoleCollapsed;
    for (const field of DOCK_FIELDS) {
      delete document.body.dataset[`classicField${field.datasetSuffix}`];
    }

    // The panel is handed back exactly as found — tab selection included.
    this._restoreConsoleTab();

    document.dispatchEvent(new CustomEvent('classic-editor-deactivate'));

    this.active = false;
    this.onExit();
  }

  /**
   * Re-assert the editor pane's activation. Called after a project loads
   * while Classic is active so the pane shows the new file's source
   * instead of whatever was open before.
   */
  syncEditorPane() {
    if (!this.active || !this._isEditorAvailable()) return;
    document.dispatchEvent(new CustomEvent('classic-editor-activate'));
  }

  /** @returns {boolean} */
  isEditorVisible() {
    return this._panes.editorVisible;
  }

  /** @returns {boolean} */
  isCustomizerVisible() {
    return this._panes.customizerVisible;
  }

  /** @returns {boolean} */
  isConsoleCollapsed() {
    return this._panes.consoleCollapsed;
  }

  /** Show/hide the editor pane (Window > Editor, titlebar ✕). */
  toggleEditor() {
    this._panes.editorVisible = !this._panes.editorVisible;
    this._applyPaneAttributes();
    this._savePaneState();
    if (this.active) {
      document.dispatchEvent(
        new CustomEvent(
          this._isEditorAvailable()
            ? 'classic-editor-activate'
            : 'classic-editor-deactivate'
        )
      );
    }
    announceImmediate(
      this._panes.editorVisible ? 'Editor shown' : 'Editor hidden'
    );
    return this._panes.editorVisible;
  }

  /** Show/hide the Customizer dock (Window > Customizer, titlebar ✕). */
  toggleCustomizer() {
    this._panes.customizerVisible = !this._panes.customizerVisible;
    this._applyPaneAttributes();
    this._savePaneState();
    announceImmediate(
      this._panes.customizerVisible ? 'Customizer shown' : 'Customizer hidden'
    );
    return this._panes.customizerVisible;
  }

  /**
   * Fold/unfold the bottom strip (titlebar button). Per D-8 this folds the
   * whole strip, not the Console pane alone — the storage key and data
   * attribute keep their historical `console` names so existing preferences
   * survive. Wording owner-approved 2026-08-06.
   */
  setConsoleCollapsed(collapsed) {
    this._panes.consoleCollapsed = Boolean(collapsed);
    this._applyPaneAttributes();
    this._savePaneState();
    announceImmediate(
      this._panes.consoleCollapsed
        ? 'Bottom panels folded'
        : 'Bottom panels unfolded'
    );
    return this._panes.consoleCollapsed;
  }

  /**
   * Which dock fields currently hold a visible panel. The grid derives its
   * track sizes from this, so every arrangement is described by data rather
   * than by a hand-written template per combination.
   * @returns {Record<string, boolean>}
   * @private
   */
  _fieldOccupancy() {
    const simplified =
      getUIModeController().getClassicDensity() === 'simplified';
    return {
      left: this._panes.editorVisible && !simplified,
      'right-top': this._panes.customizerVisible,
      // Viewport-Control is Standard-only for v1 (D-7) and has no visibility
      // state until B3, so it reads as empty here.
      'right-bottom':
        this._panes.viewportControlVisible === true && !simplified,
      // Simplified drops the code-facing docks, which empties the strip.
      bottom: !simplified,
    };
  }

  /**
   * Stamp the pane-visibility and field-occupancy data attributes the
   * classic.css grid keys on.
   * @private
   */
  _applyPaneAttributes() {
    const body = document.body;
    if (!body) return;
    body.dataset.classicEditorHidden = String(!this._panes.editorVisible);
    body.dataset.classicCustomizerHidden = String(
      !this._panes.customizerVisible
    );
    body.dataset.classicConsoleCollapsed = String(this._panes.consoleCollapsed);

    const occupancy = this._fieldOccupancy();
    for (const field of DOCK_FIELDS) {
      body.dataset[`classicField${field.datasetSuffix}`] = occupancy[field.name]
        ? 'occupied'
        : 'empty';
    }

    const foldBtn = document.getElementById('classicConsoleFoldBtn');
    if (foldBtn) {
      foldBtn.setAttribute(
        'aria-expanded',
        String(!this._panes.consoleCollapsed)
      );
    }
  }

  /**
   * Reset the Forge console to its Log tab on entering Classic, reporting
   * which tab was selected so exit() can put it back (D-9).
   * @returns {'log'|'structured'|null}
   * @private
   */
  _sanitizeConsoleTabs() {
    const structuredTab = document.getElementById('console-tab-structured');
    if (!structuredTab) return null;
    const wasStructured =
      structuredTab.getAttribute('aria-selected') === 'true';
    if (wasStructured) {
      document.getElementById('console-tab-log')?.click();
    }
    return wasStructured ? 'structured' : 'log';
  }

  /**
   * Re-select whichever console tab was active before Classic took over.
   * @private
   */
  _restoreConsoleTab() {
    if (this._consoleTabOnEnter === 'structured') {
      document.getElementById('console-tab-structured')?.click();
    }
    this._consoleTabOnEnter = null;
  }

  /**
   * Find or create an unlabelled layout container on the grid. Used for the
   * bottom strip and the camera bar, which group other elements rather than
   * being regions in their own right.
   * @param {Element} mainInterface
   * @param {string} id
   * @param {string} className
   * @returns {Element}
   * @private
   */
  _ensureContainer(mainInterface, id, className) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = className;
      mainInterface.appendChild(el);
    }
    return el;
  }

  /** @private */
  _loadPaneState() {
    const defaults = {
      editorVisible: true,
      customizerVisible: true,
      consoleCollapsed: false,
    };
    try {
      const stored = localStorage.getItem(PANES_STORAGE_KEY);
      if (!stored) return defaults;
      const parsed = JSON.parse(stored);
      return {
        editorVisible:
          typeof parsed.editorVisible === 'boolean'
            ? parsed.editorVisible
            : defaults.editorVisible,
        customizerVisible:
          typeof parsed.customizerVisible === 'boolean'
            ? parsed.customizerVisible
            : defaults.customizerVisible,
        consoleCollapsed:
          typeof parsed.consoleCollapsed === 'boolean'
            ? parsed.consoleCollapsed
            : defaults.consoleCollapsed,
      };
    } catch {
      return defaults;
    }
  }

  /** @private */
  _savePaneState() {
    try {
      localStorage.setItem(PANES_STORAGE_KEY, JSON.stringify(this._panes));
    } catch {
      // Preference persistence is best-effort.
    }
  }

  /**
   * Find or create a labelled slot section inside `parent`, with an optional
   * desktop-style titlebar (text + fold/close button).
   * @param {Element} parent - the grid, or a container such as the bottom strip
   * @param {{id: string, className: string, label: string, titlebar?: Object}} def
   * @returns {Element} the element moved panels are appended into
   * @private
   */
  _ensureSlot(parent, def) {
    let slot = document.getElementById(def.id);
    if (!slot) {
      slot = document.createElement('section');
      slot.id = def.id;
      slot.className = def.className;
      slot.setAttribute('aria-label', def.label);

      if (def.titlebar) {
        const bar = document.createElement('div');
        bar.className = 'classic-pane-titlebar';
        const title = document.createElement('span');
        title.className = 'classic-pane-title';
        title.textContent = def.titlebar.text;
        bar.appendChild(title);

        if (def.titlebar.foldBtnId) {
          const fold = document.createElement('button');
          fold.type = 'button';
          fold.id = def.titlebar.foldBtnId;
          fold.className = 'btn btn-sm btn-icon classic-pane-btn';
          // Static name + aria-expanded is the APG disclosure pattern; the
          // state is not repeated in the name. D-8: this folds the whole
          // strip, so the name does not mention Console.
          fold.setAttribute('aria-label', 'Fold bottom panels');
          fold.setAttribute('aria-expanded', 'true');
          fold.textContent = '▾';
          fold.addEventListener('click', () => {
            this.setConsoleCollapsed(!this._panes.consoleCollapsed);
          });
          bar.appendChild(fold);
        }
        if (def.titlebar.closeBtnId) {
          const close = document.createElement('button');
          close.type = 'button';
          close.id = def.titlebar.closeBtnId;
          close.className = 'btn btn-sm btn-icon classic-pane-btn';
          close.setAttribute('aria-label', `Hide ${def.titlebar.text}`);
          close.textContent = '✕';
          close.addEventListener('click', () => {
            this.toggleEditor();
          });
          bar.appendChild(close);
        }
        slot.appendChild(bar);
      }

      // Folding animates via grid-template-rows 0fr/1fr on this wrapper
      const body = document.createElement('div');
      body.className = 'classic-fold';
      const inner = document.createElement('div');
      inner.className = 'classic-fold-inner';
      body.appendChild(inner);
      slot.appendChild(body);

      parent.appendChild(slot);
    }
    return slot.querySelector('.classic-fold-inner') || slot;
  }
}

// Singleton instance
let instance = null;

/**
 * Create (once) and initialize the ClassicLayoutController singleton.
 * @param {Object} [options] - Options for new instance (only used on first call)
 * @returns {ClassicLayoutController}
 */
export function initClassicLayoutController(options = {}) {
  if (!instance) {
    instance = new ClassicLayoutController(options);
    instance.init();
  }
  return instance;
}

/**
 * @returns {ClassicLayoutController|null} The singleton, if initialized.
 */
export function getClassicLayoutController() {
  return instance;
}

/**
 * Reset the singleton. Used in unit tests.
 */
export function resetClassicLayoutController() {
  instance = null;
}
