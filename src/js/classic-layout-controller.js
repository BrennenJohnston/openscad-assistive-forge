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
import {
  initClassicResizers,
  destroyClassicResizers,
  getClassicResizerController,
} from './classic-resizer-controller.js';
import {
  ClassicDockModel,
  DOCK_FIELDS,
  panelLabel,
} from './classic-dock-model.js';

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
 * The 3D view toolbar, declared as static markup in index.html (E3) and
 * adopted into the camera-bar row of the grid while Classic is active.
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
    parentId: 'classicFieldLeft',
    titlebar: { text: 'Editor', closeBtnId: 'classicEditorCloseBtn' },
  },
  {
    id: 'classicViewportControlSlot',
    className: 'classic-slot classic-viewport-control-slot',
    label: 'Viewport-Control',
    parentId: 'classicFieldRightBottom',
    titlebar: { text: 'Viewport-Control' },
  },
];

/**
 * The dock field containers, in creation order. Each is a grid item holding
 * whichever panels the dock model has placed there (B6); the panels move
 * between them, the containers themselves never move.
 *
 * `anchorId` inserts a container where a static panel already sits rather than
 * appending it, so adopting that panel into the dock leaves the document
 * order — and therefore the reading order — exactly as it was.
 *
 * The bottom strip predates the field model and keeps its own id and class
 * (B2), so it is created by _ensureContainer instead of appearing here.
 * @type {Array<{id: string, className: string, anchorId?: string}>}
 */
const DOCK_FIELD_CONTAINERS = [
  {
    id: 'classicFieldRightTop',
    className: 'classic-dock-field classic-dock-field--right-top',
    anchorId: 'paramPanel',
  },
  {
    id: 'classicFieldLeft',
    className: 'classic-dock-field classic-dock-field--left',
  },
  {
    id: 'classicFieldRightBottom',
    className: 'classic-dock-field classic-dock-field--right-bottom',
  },
];

/**
 * Controls that move into the Customizer dock rather than a created slot, so
 * its header matches the desktop Customizer exactly (U4):
 *
 *   Row 1  Automatic Preview checkbox + the detail combobox
 *   Row 2  preset combobox + [+] + [−]
 *   ────   "Forge additions", collapsed: everything upstream does not have
 *
 * Moving individual controls rather than their two container rows is what
 * lets the desktop rows hold only what desktop has (D-20). The emptied
 * #customizerHeaderRow and the #presetControls husk stay behind and are
 * hidden by classic.css; the husk-hide is also what drops the legacy preset
 * search in Classic (D-22), since the searchable combobox covers it.
 *
 * Order matters — each is appended to its target in turn — and exit()
 * restores in reverse, so every control returns to its recorded position.
 * @type {Array<{panelId: string, targetId: string}>}
 */
const CUSTOMIZER_DOCK_MOVES = [
  // Row 1: the detail combobox joins the Automatic Preview checkbox
  { panelId: 'paramDetailLevelWrap', targetId: 'classicCustomizerControls' },
  // Row 2: preset combobox then the +/− pair, in upstream order
  { panelId: 'presetComboboxContainer', targetId: 'classicPresetRow' },
  { panelId: 'presetSelector', targetId: 'classicPresetRow' },
  { panelId: 'addPresetBtn', targetId: 'classicPresetRow' },
  { panelId: 'deletePresetBtn', targetId: 'classicPresetRow' },
  // Forge additions, in the order they read best when expanded
  { panelId: 'resetAllBtn', targetId: 'classicForgeExtrasRow' },
  { panelId: 'customizerGroupToggles', targetId: 'classicForgeExtrasRow' },
  { panelId: 'savePresetBtn', targetId: 'classicForgeExtrasRow' },
  { panelId: 'copyPresetBtn', targetId: 'classicForgeExtrasRow' },
  { panelId: 'copyPresetNameBtn', targetId: 'classicForgeExtrasRow' },
  { panelId: 'managePresetsBtn', targetId: 'classicForgeExtrasRow' },
  { panelId: 'presetSortToolbar', targetId: 'classicForgeExtrasRow' },
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

    /**
     * Which panel sits in which dock field (B6). The only thing that moves a
     * panel is its movePanel(); this controller owns the DOM containers, the
     * occupancy attributes and the resize event that follow from it.
     * @type {ClassicDockModel}
     */
    this._dock = new ClassicDockModel({
      isPanelVisible: (panelId) => this._isPanelVisible(panelId),
      isFieldAvailable: (field) => this._isFieldAvailable(field),
    });
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

    // The right-top container is created around the Customizer, and the strip
    // and camera bar keep the positions they had before the field model, so
    // adopting the dock does not reshuffle the document order.
    this._ensureField(mainInterface, DOCK_FIELD_CONTAINERS[0]);
    this._ensureContainer(
      mainInterface,
      BOTTOM_STRIP_ID,
      'classic-dock-field classic-bottom-strip'
    );
    // The camera bar is static markup in index.html (E3), so it is adopted
    // into the grid rather than created — same appendChild contract as every
    // other move, and exit() puts it back where it came from.
    this._adoptIntoGrid(mainInterface, CAMERA_BAR_ID);

    for (const def of DOCK_FIELD_CONTAINERS.slice(1)) {
      this._ensureField(mainInterface, def);
    }

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

    // Slots are created in their default fields, so this is a no-op on a first
    // entry and puts a user's saved arrangement back in place afterwards (B9).
    this._dock.applyToDom();

    this._applyPaneAttributes();
    if (this._isEditorAvailable()) {
      document.dispatchEvent(new CustomEvent('classic-editor-activate'));
    }

    initClassicResizers();
    if (this._panes.consoleCollapsed) {
      getClassicResizerController()?.parkBottomSize();
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

    // Before the moves, so the separators cannot outlive the grid areas they
    // are placed in and leave custom properties behind for Split.js to fight.
    destroyClassicResizers();

    for (const record of [...this._moved].reverse()) {
      const { el, parent, nextSibling, wasOpen } = record;
      if (parent && parent.isConnected) {
        // Reverse order means a recorded sibling is normally back in place by
        // now, and the markup's indentation whitespace makes most anchors
        // text nodes that never move at all. Falling back to appendChild if
        // the anchor is missing keeps a NotFoundError from stranding the user
        // in a half-restored layout — insertBefore throws on a foreign anchor.
        if (nextSibling && nextSibling.parentNode === parent) {
          parent.insertBefore(el, nextSibling);
        } else {
          parent.appendChild(el);
        }
      }
      if (el.tagName === 'DETAILS' && wasOpen !== null) {
        el.open = wasOpen;
      }
    }
    this._moved = [];

    for (const def of SLOT_DEFS) {
      document.getElementById(def.id)?.remove();
    }
    // The strip and the field containers are created here, so they are removed
    // here. The camera bar and the Customizer are static markup that was
    // adopted, so the move-restore loop above has already put them back —
    // removing those would delete them from the document.
    document.getElementById(BOTTOM_STRIP_ID)?.remove();
    for (const def of DOCK_FIELD_CONTAINERS) {
      document.getElementById(def.id)?.remove();
    }

    delete document.body.dataset.classicEditorHidden;
    delete document.body.dataset.classicCustomizerHidden;
    delete document.body.dataset.classicConsoleCollapsed;
    delete document.body.dataset.classicAnimateVisible;
    delete document.body.dataset.classicFontListVisible;
    delete document.body.dataset.classicViewportControlVisible;
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

  /** @returns {boolean} */
  isAnimateVisible() {
    return this._panes.animateVisible;
  }

  /** @returns {boolean} */
  isFontListVisible() {
    return this._panes.fontListVisible;
  }

  /** @returns {boolean} */
  isViewportControlVisible() {
    return this._panes.viewportControlVisible;
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
   * Show/hide one of the optional panes (Window menu, titlebar ✕). Same
   * shape as toggleCustomizer, driven by a table so the three panes cannot
   * drift apart. Announcement wording owner-approved 2026-08-06.
   * @param {'animate'|'fontList'|'viewportControl'} pane
   * @returns {boolean} the new visibility
   * @private
   */
  _toggleOptionalPane(pane) {
    const key = `${pane}Visible`;
    this._panes[key] = !this._panes[key];
    this._applyPaneAttributes();
    this._savePaneState();
    announceImmediate(
      `${panelLabel(pane)} ${this._panes[key] ? 'shown' : 'hidden'}`
    );
    return this._panes[key];
  }

  /** Show/hide the Animate pane (Window > Animate). */
  toggleAnimate() {
    return this._toggleOptionalPane('animate');
  }

  /** Show/hide the Font List pane (Window > Font List). */
  toggleFontList() {
    return this._toggleOptionalPane('fontList');
  }

  /** Show/hide the Viewport-Control pane (Window > Viewport-Control). */
  toggleViewportControl() {
    return this._toggleOptionalPane('viewportControl');
  }

  /**
   * Fold/unfold the bottom strip (titlebar button). Per D-8 this folds the
   * whole strip, not the Console pane alone — the storage key and data
   * attribute keep their historical `console` names so existing preferences
   * survive. Wording owner-approved 2026-08-06.
   */
  setConsoleCollapsed(collapsed) {
    this._panes.consoleCollapsed = Boolean(collapsed);

    // The fold and the row resizer both own --classic-row-bottom, so the
    // resizer parks its value for the duration instead of the two writing
    // over each other. Unfolding returns the height the user chose, not the
    // default (B4/D-8).
    const resizers = getClassicResizerController();
    if (this._panes.consoleCollapsed) resizers?.parkBottomSize();
    else resizers?.restoreBottomSize();

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
   * Whether a dock panel is currently on screen — its pane toggle is on AND
   * the density has not dropped it. This is what makes a field occupied, so
   * moving a panel moves its contribution to the grid with it.
   * @param {string} panelId
   * @returns {boolean}
   * @private
   */
  _isPanelVisible(panelId) {
    const simplified =
      getUIModeController().getClassicDensity() === 'simplified';
    switch (panelId) {
      case 'editor':
        return this._panes.editorVisible && !simplified;
      case 'customizer':
        return this._panes.customizerVisible;
      // Viewport-Control is Standard-only for v1 (D-7). Simplified treats it
      // as hidden without clearing the preference, so returning to Standard
      // brings it back rather than silently resetting the arrangement.
      case 'viewportControl':
        return this._panes.viewportControlVisible && !simplified;
      case 'animate':
        return this._panes.animateVisible && !simplified;
      case 'fontList':
        return this._panes.fontListVisible && !simplified;
      // Console and Error-Log have no toggle yet — Window > Error-Log arrives
      // with F1. Simplified drops both with the rest of the code-facing docks.
      case 'console':
      case 'errorLog':
        return !simplified;
      default:
        return false;
    }
  }

  /**
   * Whether a field is rendered at all right now. Moving a panel into a field
   * the current density does not draw would strand it with no way back, so
   * those moves are refused rather than offered and quietly ignored.
   * @param {string} field
   * @returns {boolean}
   * @private
   */
  _isFieldAvailable(field) {
    const simplified =
      getUIModeController().getClassicDensity() === 'simplified';
    return simplified ? field === 'right-top' : true;
  }

  /**
   * Which dock fields currently hold a visible panel. The grid derives its
   * track sizes from this, so every arrangement is described by data rather
   * than by a hand-written template per combination.
   * @returns {Record<string, boolean>}
   * @private
   */
  _fieldOccupancy() {
    return this._dock.getOccupancy();
  }

  /**
   * Move a dock panel into another field (B6) — the one mutation the dock
   * has. Re-parents the panel, re-stamps the pane and occupancy attributes,
   * and fires the resize event so the 3D view re-measures against its new
   * track (B5). Announcement and focus are the title-bar menu's job (B8).
   *
   * @param {string} panelId - a dock panel id, e.g. 'console' (NOT an element id)
   * @param {string} targetField - 'left' | 'right-top' | 'right-bottom' | 'bottom'
   * @param {number|null} [index] - position among the field's occupants
   * @param {{mergeWith?: string|null}} [options] - join an occupant's tab group
   * @returns {{ok: boolean, reason: string|null, field: string|null, merged: boolean}}
   */
  movePanel(panelId, targetField, index = null, options = {}) {
    const result = this._dock.movePanel(panelId, targetField, index, options);
    if (!result.ok) return result;

    this._dock.applyToDom();
    this._applyPaneAttributes();
    document.dispatchEvent(new CustomEvent('classic-layout-resize'));
    return result;
  }

  /**
   * The dock's field map (B6), for the title-bar menu and the tests.
   * @returns {Record<string, string[][]>}
   */
  getArrangement() {
    return this._dock.getArrangement();
  }

  /**
   * Which field a panel currently sits in.
   * @param {string} panelId
   * @returns {string|null}
   */
  getPanelField(panelId) {
    return this._dock.getFieldOf(panelId);
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

    // Simplified hides Viewport-Control without clearing its preference, so
    // the visible-attribute follows the same rule the occupancy does.
    const simplified =
      getUIModeController().getClassicDensity() === 'simplified';
    body.dataset.classicAnimateVisible = String(this._panes.animateVisible);
    body.dataset.classicFontListVisible = String(this._panes.fontListVisible);
    body.dataset.classicViewportControlVisible = String(
      this._panes.viewportControlVisible && !simplified
    );

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

  /**
   * Find or create a dock field container. When the definition names an
   * anchor, the container takes that element's place in the document and the
   * element moves inside it — that is how the Customizer joins the dock
   * without changing where it falls in the reading order.
   * @param {Element} mainInterface
   * @param {{id: string, className: string, anchorId?: string}} def
   * @returns {Element}
   * @private
   */
  _ensureField(mainInterface, def) {
    let el = document.getElementById(def.id);
    if (el) return el;

    el = document.createElement('div');
    el.id = def.id;
    el.className = def.className;

    const anchor = def.anchorId ? document.getElementById(def.anchorId) : null;
    if (anchor && anchor.parentElement) {
      anchor.parentElement.insertBefore(el, anchor);
      this._moved.push({
        el: anchor,
        parent: anchor.parentElement,
        nextSibling: anchor.nextSibling,
        wasOpen: anchor.tagName === 'DETAILS' ? anchor.open : null,
      });
      el.appendChild(anchor);
    } else {
      mainInterface.appendChild(el);
    }
    return el;
  }

  /**
   * Move an existing static element onto the grid, recording where it came
   * from so exit() restores it. Used for markup that must live in index.html
   * (the camera bar) but occupy a grid cell while Classic is active.
   * @param {Element} mainInterface
   * @param {string} id
   * @returns {Element|null}
   * @private
   */
  _adoptIntoGrid(mainInterface, id) {
    const el = document.getElementById(id);
    if (!el || el.parentElement === mainInterface) return el;

    this._moved.push({
      el,
      parent: el.parentElement,
      nextSibling: el.nextSibling,
      wasOpen: null,
    });
    mainInterface.appendChild(el);
    return el;
  }

  /**
   * Desktop defaults: editor and Customizer shown, the optional panes off
   * until the user asks for them (upstream starts the same way).
   * Every key is validated independently, so a preference written before the
   * optional panes existed hydrates without a half-restored state.
   * @private
   */
  _loadPaneState() {
    const defaults = {
      editorVisible: true,
      customizerVisible: true,
      consoleCollapsed: false,
      animateVisible: false,
      fontListVisible: false,
      viewportControlVisible: false,
    };
    try {
      const stored = localStorage.getItem(PANES_STORAGE_KEY);
      if (!stored) return defaults;
      const parsed = JSON.parse(stored);
      const hydrated = { ...defaults };
      for (const key of Object.keys(defaults)) {
        if (typeof parsed?.[key] === 'boolean') hydrated[key] = parsed[key];
      }
      return hydrated;
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
