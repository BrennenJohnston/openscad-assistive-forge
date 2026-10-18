/**
 * Classic Layout Controller - Applies the Classic (desktop-OpenSCAD-style)
 * layout when the UI mode is 'classic'.
 *
 * Desktop shell mapping:
 *   Editor     — #expertModePanel, moved into a titled slot (visible by
 *                default, Window > Editor / titlebar ✕ toggles it)
 *   Display    — .preview-panel (untouched)
 *   Customizer — .param-panel with the desktop-style #classicCustomizerBar
 *                at its top: titlebar, then Automatic Preview with the
 *                moved detail combobox and Reset All, then the preset row
 *   Presets    — the preset combobox and its buttons, moved into the
 *                Customizer bar's #classicPresetRow (desktop puts the
 *                preset combobox inside the Customizer dock)
 *   Camera bar — #classicCameraBar, a thin row along the bottom edge of the
 *                3D view (static markup in index.html)
 *   Bottom     — #classicBottomStrip spanning between the editor and the
 *                right column, holding Console and Error-Log side by side
 *                (plus Animate and Font List when shown)
 *
 * Moves use appendChild (event listeners survive); the original parent and
 * nextSibling are recorded so exiting Classic restores the exact DOM order.
 * The grid itself lives in classic.css, keyed exclusively off
 * body[data-ui-mode='classic'] — other modes are untouched. Pane visibility
 * is data-attribute-driven (data-classic-*-hidden on <body>)
 * so folded panes actually give up their space, and each dock field is
 * stamped data-classic-field-<name>="occupied|empty" so the grid derives its
 * track sizes from occupancy instead of needing one template per combination.
 *
 * @license GPL-3.0-or-later
 */

import { getUIModeController } from './ui-mode-controller.js';
import { announceImmediate } from './announcer.js';
import {
  cancelSlide,
  drawerChanged,
  drawerPace,
  registerLookDrawer,
  slideDrawer,
} from './drawer-motion.js';
import {
  initClassicResizers,
  destroyClassicResizers,
  getClassicResizerController,
} from './classic-resizer-controller.js';
import {
  ClassicDockModel,
  DOCK_FIELDS,
  DOCK_PANEL_IDS,
  DOCK_PANELS,
  panelLabel,
} from './classic-dock-model.js';
import {
  initClassicPanelMenus,
  getClassicPanelMenus,
  destroyClassicPanelMenus,
} from './classic-panel-menu.js';

const PANES_STORAGE_KEY = 'openscad-forge-classic-panes';

const TITLEBAR_CLASS = 'classic-pane-titlebar';
const TITLE_CLASS = 'classic-pane-title';
const STOW_BTN_CLASS = 'classic-stow-btn';
const STOW_TAB_CLASS = 'classic-stow-tab';
const STOW_RAIL_CLASS = 'classic-stow-rail';

/**
 * The dock fields that stow toward their own edge. Stowing removes the
 * whole field from the layout (its space goes to the 3D view), leaving a
 * labeled un-stow tab on the field's edge rail.
 *
 * Glyphs are text, not SVG (a stylesheet that fails to load must not leave
 * a blank button), and point where the content will
 * go: « stows the left field, » brings it back; ⌄ stows the bottom strip,
 * ⌃ brings it back.
 *
 * The bottom entry is the old strip fold, one mechanism: its `paneKey`
 * keeps the historical `consoleCollapsed` name so a folded preference
 * saved before stowing existed hydrates as stowed, and the height
 * park/restore rides the same toggle.
 *
 * `subject` is the announcement noun; `positionLabel` feeds the control and
 * tab names.
 *
 * `paneKey` joins `openscad-forge-classic-panes`; a preference saved before
 * these keys existed hydrates without them.
 * @type {ReadonlyArray<{name: string, paneKey: string,
 *   edge: 'left'|'right'|'bottom', glyphStow: string, glyphRestore: string,
 *   subject: string, positionLabel: string}>}
 */
const STOW_FIELDS = Object.freeze([
  {
    name: 'left',
    paneKey: 'stowLeft',
    edge: 'left',
    glyphStow: '«',
    glyphRestore: '»',
    subject: 'Left column',
    positionLabel: 'left column',
  },
  {
    name: 'right-top',
    paneKey: 'stowRightTop',
    edge: 'right',
    glyphStow: '»',
    glyphRestore: '«',
    subject: 'Upper right',
    positionLabel: 'upper right',
  },
  {
    name: 'right-bottom',
    paneKey: 'stowRightBottom',
    edge: 'right',
    glyphStow: '»',
    glyphRestore: '«',
    subject: 'Lower right',
    positionLabel: 'lower right',
  },
  {
    name: 'bottom',
    paneKey: 'consoleCollapsed',
    edge: 'bottom',
    glyphStow: '⌄',
    glyphRestore: '⌃',
    subject: 'Bottom panels',
    positionLabel: 'bottom panels',
  },
]);

/** The edge rails holding the un-stow tabs of stowed fields. */
const STOW_RAIL_IDS = Object.freeze({
  left: 'classicStowRailLeft',
  right: 'classicStowRailRight',
  bottom: 'classicStowRailBottom',
});

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

/** Container for the side-by-side bottom-strip panes. */
const BOTTOM_STRIP_ID = 'classicBottomStrip';

/**
 * The 3D view toolbar, declared as static markup in index.html and
 * adopted into the camera-bar row of the grid while Classic is active.
 */
const CAMERA_BAR_ID = 'classicCameraBar';

/**
 * Dock slots, in creation order. `panelId` names the element moved into the
 * slot; the optional panes (Animate, Font List, Viewport-Control) stay
 * hidden until their pane-visibility state turns them on. `parentId` places
 * a slot inside another created element rather than directly on the grid.
 *
 * Titles are upstream dock names.
 */
const SLOT_DEFS = [
  {
    id: 'classicConsoleSlot',
    className: 'classic-slot classic-console-slot',
    label: 'Console',
    panelId: 'consolePanel',
    parentId: BOTTOM_STRIP_ID,
    // No fold button: the bottom field's stow control replaces it, and
    // _ensureStowButtons owns that.
    titlebar: { text: 'Console' },
  },
  {
    // The inner live region moves, not the tabpanel wrapper — moving
    // #console-view-structured would strand a role="tabpanel" with no
    // tablist. ErrorLogPanel holds a direct element reference, which
    // appendChild preserves.
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
    panelId: 'animatePanel',
    parentId: BOTTOM_STRIP_ID,
    titlebar: { text: 'Animate' },
  },
  {
    id: 'classicFontListSlot',
    className: 'classic-slot classic-font-list-slot',
    label: 'Font List',
    panelId: 'fontListPanel',
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
    panelId: 'viewportControlPanel',
    parentId: 'classicFieldRightBottom',
    titlebar: { text: 'Viewport-Control' },
  },
];

/**
 * The dock field containers, in creation order. Each is a grid item holding
 * whichever panels the dock model has placed there; the panels move
 * between them, the containers themselves never move.
 *
 * `anchorId` inserts a container where a static panel already sits rather than
 * appending it, so adopting that panel into the dock leaves the document
 * order — and therefore the reading order — exactly as it was.
 *
 * The bottom strip predates the field model and keeps its own id and
 * class, so it is created by _ensureContainer instead of appearing here.
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
 * its header matches the desktop Customizer exactly:
 *
 *   Row 1  Automatic Preview checkbox + the detail combobox + Reset
 *   Row 2  preset combobox + [+] + [−] + save preset
 *   ────   "Forge additions", collapsed: everything upstream does not have
 *
 * Moving individual controls rather than their two container rows is what
 * lets the desktop rows hold only what desktop has. The emptied
 * #customizerHeaderRow and the #presetControls husk stay behind and are
 * hidden by classic.css; the husk-hide is also what drops the legacy preset
 * search in Classic, since the searchable combobox covers it.
 *
 * Reset and save preset sit in the rows, not in Forge additions: both are
 * controls the desktop Customizer has, and Forge additions is named for
 * what the desktop lacks. The visible label stays "Reset All" rather than
 * the desktop's "Reset", because "All" says what the button does to
 * someone who has never used desktop OpenSCAD, and it discards work. Both
 * controls also appear in Classic-Simplified, which already shows the
 * preset box with its + and −, because resetting parameters is a beginner
 * action.
 *
 * Order matters — each is appended to its target in turn — and exit()
 * restores in reverse, so every control returns to its recorded position.
 * @type {Array<{panelId: string, targetId: string}>}
 */
const CUSTOMIZER_DOCK_MOVES = [
  // Row 1: the detail combobox joins the Automatic Preview checkbox, then Reset
  // ends the line — upstream's row 1 is exactly these three.
  { panelId: 'paramDetailLevelWrap', targetId: 'classicCustomizerControls' },
  { panelId: 'resetAllBtn', targetId: 'classicCustomizerControls' },
  // Row 2: preset combobox, the +/− pair, then save preset, in upstream order
  { panelId: 'presetComboboxContainer', targetId: 'classicPresetRow' },
  { panelId: 'presetSelector', targetId: 'classicPresetRow' },
  { panelId: 'addPresetBtn', targetId: 'classicPresetRow' },
  { panelId: 'deletePresetBtn', targetId: 'classicPresetRow' },
  { panelId: 'savePresetBtn', targetId: 'classicPresetRow' },
  // Forge additions, in the order they read best when expanded
  { panelId: 'customizerGroupToggles', targetId: 'classicForgeExtrasRow' },
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

    // A docked <details> is its pane's whole body, with its summary hidden:
    // closed, it would leave the dock an empty frame with nothing in it to
    // open it again. Whatever closes one while docked, it opens again.
    this._keepDockedOpen = (event) => {
      if (!event.target.open) event.target.open = true;
    };

    /**
     * Which Forge console tab was selected when Classic took over, so exit()
     * can hand the panel back as found.
     * @type {'log'|'structured'|null}
     */
    this._consoleTabOnEnter = null;

    /** Pane visibility state, persisted. Desktop defaults: editor shown. */
    this._panes = this._loadPaneState();

    /**
     * Which panel sits in which dock field. The only thing that moves a
     * panel is its movePanel(); this controller owns the DOM containers, the
     * occupancy attributes and the resize event that follow from it.
     * @type {ClassicDockModel}
     */
    this._dock = new ClassicDockModel({
      isPanelVisible: (panelId) => this._isPanelVisible(panelId),
      isFieldAvailable: (field) => this._isFieldAvailable(field),
      // Switching tabs moves a different panel's titlebar into the shared bar,
      // and its menu button has to be re-labelled for the panels it now serves.
      onGroupChange: () => this._refreshTitlebarControls(),
      isDesktop: () => this._isDesktopWidth(),
    });

    /** @type {number|undefined} */
    this._breakpointTimer = undefined;
    this._wasDesktop = null;
    this._onWindowResize = () => {
      clearTimeout(this._breakpointTimer);
      this._breakpointTimer = setTimeout(() => this._checkBreakpoint(), 150);
    };
  }

  /**
   * Subscribe to UI mode changes and apply the current mode.
   */
  init() {
    this._registerLookDrawers();
    document
      .getElementById('classicAsciiSettingsBtn')
      ?.addEventListener('click', () => this.showAsciiSettings());
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
      // Simplified leaves only one field standing, so the legal move targets
      // change with the density and the menus have to be rebuilt.
      this._refreshTitlebarControls();
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
   * and the Simplified density has not dropped it.
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
    // Reset to Log, remembering what was found so exit() can restore it.
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
    // The camera bar is static markup in index.html, so it is adopted
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
        panel.addEventListener('toggle', this._keepDockedOpen);
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
    // entry and puts a user's saved arrangement back in place afterwards.
    this._dock.applyToDom();

    this._applyPaneAttributes();
    if (this._isEditorAvailable()) {
      document.dispatchEvent(new CustomEvent('classic-editor-activate'));
    }

    initClassicResizers();
    if (this._panes.consoleCollapsed) {
      getClassicResizerController()?.parkBottomSize();
    }

    // Stow machinery: the rails first, so a hydrated stow preference
    // has somewhere to hang its un-stow tab, then the title-bar controls.
    this._ensureStowRails();
    this._ensureStowButtons();
    this._refreshStowRails();

    // The title-bar menus go on last, once every title bar exists.
    initClassicPanelMenus({
      getAllPanels: () => [...DOCK_PANEL_IDS],
      getFieldOf: (panelId) => this._dock.getFieldOf(panelId),
      getGroupOf: (panelId) => this._dock.getGroupOf(panelId),
      canMove: (panelId, field) => this._dock.canMove(panelId, field),
      getMergeCandidates: (panelId) => this._mergeCandidates(panelId),
      movePanel: (panelId, field, index, options) =>
        this.movePanel(panelId, field, index, options),
    });

    this._wasDesktop = this._isDesktopWidth();
    window.addEventListener('resize', this._onWindowResize);

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
    window.removeEventListener('resize', this._onWindowResize);
    clearTimeout(this._breakpointTimer);

    // Also before the moves: a merged panel carries role="tabpanel", a hidden
    // flag and a titlebar living in the shared bar. Undoing that first is what
    // lets a panel leave Classic exactly as it arrived. The menu buttons
    // go with it — the Customizer's title bar is static markup that survives
    // the exit, so a button left on it would follow the user into Forge.
    destroyClassicPanelMenus();
    this._destroyStowButtons();
    this._destroyStowRails();
    this._dock.dissolveTabGroups();

    for (const record of [...this._moved].reverse()) {
      const { el, parent, nextSibling, wasOpen } = record;
      el.removeEventListener('toggle', this._keepDockedOpen);
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
    delete document.body.dataset.classicAnimateVisible;
    delete document.body.dataset.classicFontListVisible;
    delete document.body.dataset.classicViewportControlVisible;
    for (const field of DOCK_FIELDS) {
      delete document.body.dataset[`classicField${field.datasetSuffix}`];
      delete document.body.dataset[`classicStow${field.datasetSuffix}`];
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

  /**
   * The element of a pane, to tell whether focus is inside it.
   * @param {string} pane - a DOCK_PANELS id
   * @returns {HTMLElement|null}
   * @private
   */
  _paneElement(pane) {
    const def = DOCK_PANELS.find((p) => p.id === pane);
    return def ? document.getElementById(def.elementId) : null;
  }

  /**
   * The editor, the bottom strip and the Customizer as the look's drawers,
   * open while Classic shows them.
   * @private
   */
  _registerLookDrawers() {
    const strip = STOW_FIELDS.find((f) => f.name === 'bottom');
    const shown = (el) => this.active && el?.offsetWidth > 0;
    for (const pane of ['editor', 'customizer']) {
      registerLookDrawer(`classic-${pane}`, {
        place: () => this._paneElement(pane),
        isOpen: () => shown(this._paneElement(pane)),
        open: (how) => this._setPaneVisible(pane, true, how),
        close: (how) => this._setPaneVisible(pane, false, how),
      });
    }
    registerLookDrawer('classic-console', {
      place: () => document.getElementById('classicBottomStrip'),
      isOpen: () =>
        !this._panes[strip.paneKey] &&
        shown(document.getElementById('classicBottomStrip')),
      open: (how) => this._moveFieldStowed(strip, false, how),
      close: (how) => this._moveFieldStowed(strip, true, how),
    });
  }

  /**
   * After a pane hid with focus inside it (its own ✕, or a shortcut pressed
   * there), focus would fall to the page body: it goes to the control that
   * brings the pane back, the toolbar's Customizer button for the
   * Customizer, else the Window menu's button.
   * @param {string} pane - a DOCK_PANELS id
   * @private
   */
  _focusRestoreControl(pane) {
    const ids =
      pane === 'customizer'
        ? ['classicTbCustomizerBtn', 'windowMenuBtn']
        : ['windowMenuBtn'];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (
        !el ||
        (typeof el.checkVisibility === 'function' && !el.checkVisibility())
      ) {
        continue;
      }
      el.focus();
      if (document.activeElement === el) return;
    }
  }

  /** Show/hide the editor pane (Window > Editor, titlebar ✕). */
  toggleEditor() {
    this._setPaneVisible('editor', !this._panes.editorVisible);
    return this._panes.editorVisible;
  }

  /** Show/hide the Customizer dock (Window > Customizer, titlebar ✕). */
  toggleCustomizer() {
    this._setPaneVisible('customizer', !this._panes.customizerVisible);
    return this._panes.customizerVisible;
  }

  /**
   * Show or hide the editor or the Customizer.
   * @param {'editor'|'customizer'} pane
   * @param {boolean} visible
   * @param {import('./drawer-motion.js').DrawerHow} [how] - quiet: no
   *   sentence; remember false: the change is not saved
   * @returns {Promise<boolean>|null} its slide in the look
   * @private
   */
  _setPaneVisible(
    pane,
    visible,
    { instant = false, quiet = false, remember = true } = {}
  ) {
    const key = `${pane}Visible`;
    if (this._panes[key] === visible) return null;
    const hadFocus = this._paneElement(pane)?.contains(document.activeElement);
    this._panes[key] = visible;
    const slide = this._applyPaneAttributesMoving({
      instant,
      drawer: `classic-${pane}`,
    });
    if (remember) this._savePaneState();
    if (!visible && hadFocus) this._focusRestoreControl(pane);
    if (pane === 'editor' && this.active) {
      document.dispatchEvent(
        new CustomEvent(
          this._isEditorAvailable()
            ? 'classic-editor-activate'
            : 'classic-editor-deactivate'
        )
      );
    }
    if (!quiet) {
      const label = pane === 'editor' ? 'Editor' : 'Customizer';
      announceImmediate(`${label} ${visible ? 'shown' : 'hidden'}`);
    }
    return slide;
  }

  /**
   * Show/hide one of the optional panes (Window menu, titlebar ✕). Same
   * shape as toggleCustomizer, driven by a table so the three panes cannot
   * drift apart.
   * @param {'animate'|'fontList'|'viewportControl'} pane
   * @returns {boolean} the new visibility
   * @private
   */
  _toggleOptionalPane(pane) {
    const key = `${pane}Visible`;
    const hadFocus = this._paneElement(pane)?.contains(document.activeElement);
    this._panes[key] = !this._panes[key];
    this._applyPaneAttributes();
    this._savePaneState();
    if (this._panes[key]) this._revealPane(pane);
    else if (hadFocus) this._focusRestoreControl(pane);
    announceImmediate(
      `${panelLabel(pane)} ${this._panes[key] ? 'shown' : 'hidden'}`
    );
    return this._panes[key];
  }

  /**
   * Bring a just-shown pane into view. Four open panes do not fit the bottom
   * strip's width at their minimum size, so the strip scrolls — without
   * this, turning on the fourth panel would scroll it in beyond the right edge
   * and the menu item would look like it had done nothing.
   * @param {string} pane
   * @private
   */
  _revealPane(pane) {
    const panel = DOCK_PANELS.find((p) => p.id === pane);
    const el = panel && document.getElementById(panel.elementId);
    // 'nearest' scrolls only the container that actually overflows, so the
    // page itself never jumps.
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
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
   * The 3D view toolbar's ASCII settings button, in the Alt View: put the
   * look's sliders on the screen and the focus on the first. Standard keeps
   * them in Viewport-Control; Simplified, which has no Viewport-Control, at
   * the foot of the Customizer.
   * @returns {HTMLInputElement|null} the slider given the focus
   */
  showAsciiSettings() {
    const simplified =
      getUIModeController().getClassicDensity() === 'simplified';
    const pane = simplified ? 'customizer' : 'viewportControl';
    if (!this._panes[`${pane}Visible`]) {
      if (simplified) this.toggleCustomizer();
      else this.toggleViewportControl();
    }
    // A pane in a stowed field is out of sight with its field.
    const stowDef = STOW_FIELDS.find(
      (f) => f.name === this.getPanelField(pane)
    );
    if (stowDef && this._panes[stowDef.paneKey]) {
      this._setFieldStowed(stowDef, false, { focus: false });
    }
    const slider = document
      .getElementById(simplified ? 'classicAsciiSimplified' : 'vpAsciiGroup')
      ?.querySelector('input[type="range"]');
    if (!slider) return null;
    slider.focus();
    slider.scrollIntoView({ block: 'nearest' });
    return slider;
  }

  /**
   * Re-hang the title bars' own controls after anything that rebuilds them.
   * @private
   */
  _refreshTitlebarControls() {
    this._ensureStowButtons();
    getClassicPanelMenus()?.refresh();
  }

  /**
   * A panel's own title bar, wherever it currently lives. Merging a field moves
   * the active panel's bar into the group's shared bar (_adoptTitlebar), so it
   * is no longer inside the panel; the other members keep theirs. The panel's
   * first bar is its own — anything deeper belongs to something nested in it.
   * @param {Element} el - the panel's element
   * @returns {Element|null}
   * @private
   */
  _titlebarOf(el) {
    return (
      el.querySelector(`.${TITLEBAR_CLASS}`) ||
      el
        .closest('.classic-dock-tabgroup')
        ?.querySelector(`.classic-dock-tabbar > .${TITLEBAR_CLASS}`) ||
      null
    );
  }

  /**
   * Put a stow control on each stowable field's first title bar, at its
   * outer-edge corner (far-left of the left field's bar, far-right of the
   * right fields'), and keep its name current. Bars rebuild on merges, so
   * this runs on the title-bar lifecycle and removes strays it left behind.
   * @private
   */
  _ensureStowButtons() {
    for (const def of STOW_FIELDS) {
      const field = DOCK_FIELDS.find((f) => f.name === def.name);
      const container = document.getElementById(field.elementId);
      if (!container) continue;

      const bar = container.querySelector(`.${TITLEBAR_CLASS}`);
      let btn = bar ? bar.querySelector(`.${STOW_BTN_CLASS}`) : null;
      if (bar && !btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `btn btn-sm btn-icon classic-pane-btn ${STOW_BTN_CLASS}`;
        btn.dataset.classicStowField = def.name;
        // Text glyph, not SVG: a stylesheet that fails to load must not leave
        // a blank button. aria-expanded carries the state; the bar being
        // visible at all means the field is expanded.
        const glyph = document.createElement('span');
        glyph.className = 'classic-stow-glyph';
        glyph.setAttribute('aria-hidden', 'true');
        glyph.textContent = def.glyphStow;
        btn.appendChild(glyph);
        btn.addEventListener('click', () => this.toggleFieldStowed(def.name));
        // The control sits nearest the edge the field stows toward. The ⋮ skips
        // aria-expanded buttons when placing itself, so this leaves the order
        // [title … ▾ ⋮ ✕] intact either side.
        if (def.edge === 'left') {
          bar.insertBefore(btn, bar.firstChild);
        } else {
          bar.appendChild(btn);
        }
      }
      if (btn) {
        btn.setAttribute('aria-expanded', 'true');
        const label = `Stow the ${def.positionLabel}`;
        btn.setAttribute('aria-label', label);
        btn.setAttribute('title', label);
      }
      // A merge rebuild can leave a button on a bar that is no longer the
      // field's first; one control per field.
      for (const stray of container.querySelectorAll(`.${STOW_BTN_CLASS}`)) {
        if (stray !== btn) stray.remove();
      }
    }
  }

  /** @private */
  _destroyStowButtons() {
    for (const btn of document.querySelectorAll(`.${STOW_BTN_CLASS}`)) {
      btn.remove();
    }
  }

  /**
   * Create the edge rails the un-stow tabs live on. They overlay the grid's
   * left/right edges (classic.css) and are removed on exit — #mainInterface
   * outlives Classic, so they cannot be left behind.
   * @private
   */
  _ensureStowRails() {
    const mainInterface = document.getElementById('mainInterface');
    if (!mainInterface) return;
    for (const edge of Object.keys(STOW_RAIL_IDS)) {
      if (document.getElementById(STOW_RAIL_IDS[edge])) continue;
      const rail = document.createElement('div');
      rail.id = STOW_RAIL_IDS[edge];
      rail.className = `${STOW_RAIL_CLASS} ${STOW_RAIL_CLASS}--${edge}`;
      mainInterface.appendChild(rail);
    }
  }

  /** @private */
  _destroyStowRails() {
    for (const edge of Object.keys(STOW_RAIL_IDS)) {
      document.getElementById(STOW_RAIL_IDS[edge])?.remove();
    }
  }

  /**
   * Reconcile the rails' un-stow tabs with the stow state: one labeled tab
   * per stowed, occupied field (an empty field has nothing to restore, so a
   * stowed-but-emptied field shows no tab until a pane returns to it).
   * Reconciles rather than rebuilds — this runs from _applyPaneAttributes,
   * and rebuilding would destroy a tab the user has focused.
   * @private
   */
  _refreshStowRails() {
    const occupancy = this._fieldOccupancy();
    for (const def of STOW_FIELDS) {
      const rail = document.getElementById(STOW_RAIL_IDS[def.edge]);
      if (!rail) continue;
      const show = Boolean(this._panes[def.paneKey]) && occupancy[def.name];

      let tab = rail.querySelector(`[data-classic-stow-field="${def.name}"]`);
      if (!show) {
        tab?.remove();
        continue;
      }
      if (!tab) {
        tab = document.createElement('button');
        tab.type = 'button';
        tab.className = STOW_TAB_CLASS;
        tab.dataset.classicStowField = def.name;
        tab.setAttribute('aria-expanded', 'false');
        const glyph = document.createElement('span');
        glyph.className = 'classic-stow-glyph';
        glyph.setAttribute('aria-hidden', 'true');
        glyph.textContent = def.glyphRestore;
        const label = document.createElement('span');
        label.className = 'classic-stow-tab-label';
        tab.append(glyph, label);
        tab.addEventListener('click', () => this.toggleFieldStowed(def.name));
        // Rail order follows field order (right-top above right-bottom):
        // insert before the first tab of a later field, else append.
        const later = STOW_FIELDS.slice(STOW_FIELDS.indexOf(def) + 1)
          .map((f) =>
            rail.querySelector(`[data-classic-stow-field="${f.name}"]`)
          )
          .find(Boolean);
        rail.insertBefore(tab, later || null);
      }
      // The visible label names what is inside; the accessible name starts
      // with it (SC 2.5.3) and says what pressing does.
      const contents = (this.getArrangement()[def.name] || [])
        .flat()
        .filter((id) => this._isPanelVisible(id))
        .map((id) => panelLabel(id))
        .join(', ');
      tab.querySelector('.classic-stow-tab-label').textContent = contents;
      const name = `${contents}. Restore the ${def.positionLabel}`;
      tab.setAttribute('aria-label', name);
      tab.setAttribute('title', name);
    }
  }

  /**
   * Programmatic strip stow/restore. The strip fold is the bottom field's
   * stow (one mechanism); this wrapper keeps the historical API for callers
   * like the Error-Log jump, which restores the strip before moving focus
   * into it and must not have its focus stolen. The storage key keeps its
   * historical `console` name so existing preferences survive: a profile
   * folded before stowing existed hydrates as stowed.
   */
  setConsoleCollapsed(collapsed) {
    const def = STOW_FIELDS.find((f) => f.name === 'bottom');
    if (Boolean(collapsed) === Boolean(this._panes[def.paneKey])) {
      return this._panes[def.paneKey];
    }
    return this._setFieldStowed(def, Boolean(collapsed), { focus: false });
  }

  /**
   * Whether a dock field is stowed to its edge.
   * @param {string} fieldName - 'left' | 'right-top' | 'right-bottom' | 'bottom'
   * @returns {boolean}
   */
  isFieldStowed(fieldName) {
    const def = STOW_FIELDS.find((f) => f.name === fieldName);
    return def ? Boolean(this._panes[def.paneKey]) : false;
  }

  /**
   * Stow a field toward its edge, or bring it back. The field's
   * whole content leaves the layout and the tab order; the un-stow tab on the
   * edge rail is the way back. Focus follows the action to the control that
   * undoes it, so the keyboard user is never left on a control that just
   * display:none'd itself.
   * @param {string} fieldName - 'left' | 'right-top' | 'right-bottom' | 'bottom'
   * @returns {boolean} the new stowed state
   */
  toggleFieldStowed(fieldName) {
    const def = STOW_FIELDS.find((f) => f.name === fieldName);
    if (!def) return false;
    return this._setFieldStowed(def, !this._panes[def.paneKey], {
      focus: true,
    });
  }

  /**
   * @param {(typeof STOW_FIELDS)[number]} def
   * @param {boolean} stowed
   * @param {{focus?: boolean}} [options] - focus:false for programmatic
   *   callers (the Error-Log jump), which manage focus themselves
   * @returns {boolean}
   * @private
   */
  _setFieldStowed(def, stowed, { focus = true } = {}) {
    this._moveFieldStowed(def, stowed);

    if (focus) {
      if (stowed) {
        document
          .querySelector(
            `.${STOW_TAB_CLASS}[data-classic-stow-field="${def.name}"]`
          )
          ?.focus();
      } else {
        const field = DOCK_FIELDS.find((f) => f.name === def.name);
        document
          .getElementById(field.elementId)
          ?.querySelector(`.${STOW_BTN_CLASS}`)
          ?.focus();
      }
    }
    return stowed;
  }

  /**
   * Stow a field or bring it back, without moving focus.
   * @param {(typeof STOW_FIELDS)[number]} def
   * @param {boolean} stowed
   * @param {import('./drawer-motion.js').DrawerHow} [how]
   * @returns {Promise<boolean>|null} its slide in the look
   * @private
   */
  _moveFieldStowed(
    def,
    stowed,
    { instant = false, quiet = false, remember = true } = {}
  ) {
    this._panes[def.paneKey] = stowed;

    // The bottom stow and the row resizer both own --classic-row-bottom,
    // so the resizer parks its value for the duration. Un-stowing returns the
    // height the user chose, not the default.
    if (def.name === 'bottom') {
      const resizers = getClassicResizerController();
      if (stowed) resizers?.parkBottomSize();
      else resizers?.restoreBottomSize();
    }

    const slide = this._applyPaneAttributesMoving({
      instant,
      drawer: def.name === 'bottom' ? 'classic-console' : `classic-${def.name}`,
    });
    this._refreshTitlebarControls();
    if (remember) this._savePaneState();
    // The 3D view's track just changed size.
    document.dispatchEvent(new CustomEvent('classic-layout-resize'));

    // announceImmediate, not announce(): a debounced disclosure that
    // sometimes says nothing is worse than one that repeats.
    if (!quiet) {
      announceImmediate(
        stowed ? `${def.subject} stowed` : `${def.subject} restored`
      );
    }
    return slide;
  }

  /**
   * Stamp the grid's attributes. In the Alt View's look on a desktop, a
   * field that opens or closes moves like a drawer: the grid's tracks go
   * from their old sizes to their new ones with the field's slide, the
   * field's panes keep their open size and ride its moving edge, and a
   * closing field keeps its old layout until it has slid shut.
   * @param {import('./drawer-motion.js').DrawerHow & {drawer?: string}} [how]
   *   - drawer: the name the look hears the field's move by
   * @returns {Promise<boolean>|null}
   * @private
   */
  _applyPaneAttributesMoving({ instant = false, drawer } = {}) {
    const main = document.querySelector('.main-interface');
    cancelSlide(main);
    if (instant || !main || !this.active || !this._isDesktopWidth()) {
      this._applyPaneAttributes();
      return null;
    }
    const body = document.body;
    const occupied = () =>
      DOCK_FIELDS.filter(
        (f) => body.dataset[`classicField${f.datasetSuffix}`] === 'occupied'
      ).map((f) => f.name);
    if (!drawerPace()) {
      // Nothing slides, but a field that opens or closes is still heard.
      const was = occupied();
      this._applyPaneAttributes();
      const now = occupied();
      const opening = now.some((name) => !was.includes(name));
      if (opening || was.some((name) => !now.includes(name))) {
        drawerChanged(drawer, opening);
      }
      return null;
    }
    const read = () => {
      const style = getComputedStyle(main);
      const px = (list) => list.split(/\s+/).map(parseFloat);
      return {
        cols: px(style.gridTemplateColumns),
        rows: px(style.gridTemplateRows),
        attrs: Object.entries(body.dataset).filter(([name]) =>
          name.startsWith('classic')
        ),
        open: occupied(),
      };
    };
    const before = read();
    this._applyPaneAttributes();
    const after = read();
    const opened = after.open.filter((name) => !before.open.includes(name));
    const closed = before.open.filter((name) => !after.open.includes(name));
    const name = opened[0] ?? closed[0];
    if (!name) return null;
    const opening = opened.length > 0;
    const [shut, shown] = opening ? [before, after] : [after, before];
    if (!opening) {
      // Laid out open again until the field has slid shut.
      for (const [key] of after.attrs) delete body.dataset[key];
      for (const [key, value] of before.attrs) body.dataset[key] = value;
    }
    const from =
      name === 'left' ? 'left' : name === 'bottom' ? 'bottom' : 'right';
    const across = from !== 'bottom';
    const track = name === 'left' ? 0 : name === 'bottom' ? 2 : 4;
    const list = across ? 'cols' : 'rows';
    const travel = shown[list][track] - shut[list][track];
    const field = document.getElementById(
      DOCK_FIELDS.find((f) => f.name === name).elementId
    );
    const grid = across
      ? {
          gridTemplateColumns: [shut.cols, shown.cols],
          gridTemplateRows: [shut.rows, shown.rows],
        }
      : {
          gridTemplateRows: [shut.rows, shown.rows],
          gridTemplateColumns: [shut.cols, shown.cols],
        };
    const panes = [...(field?.children ?? [])]
      .filter((child) => child.offsetWidth > 0 && child.offsetHeight > 0)
      .map((child) => {
        const size = across
          ? { width: `${child.offsetWidth}px` }
          : {
              height: `${child.offsetHeight}px`,
              minHeight: `${child.offsetHeight}px`,
            };
        return {
          el: child,
          role: from === 'left' ? 'rider' : 'held',
          hold: size,
        };
      });
    return slideDrawer(
      [
        { el: main, role: 'space', props: grid },
        { el: field, role: 'clip' },
        ...panes,
      ],
      {
        from,
        open: opening,
        travel,
        name: drawer,
        inert: opening ? [] : [field],
        whenClosed: () => this._applyPaneAttributes(),
      }
    );
  }

  /**
   * Whether a dock panel is currently on screen — its pane toggle is on and
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
      // Viewport-Control is Standard-only. Simplified treats it
      // as hidden without clearing the preference, so returning to Standard
      // brings it back rather than silently resetting the arrangement.
      case 'viewportControl':
        return this._panes.viewportControlVisible && !simplified;
      case 'animate':
        return this._panes.animateVisible && !simplified;
      case 'fontList':
        return this._panes.fontListVisible && !simplified;
      // Console and Error-Log cannot be hidden in Classic: Window > Error-Log
      // moves focus into the pane rather than toggling it. Simplified drops
      // both with the rest of the code-facing docks.
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
   * Move a dock panel into another field, the one mutation the dock has.
   * Re-parents the panel, re-stamps the pane and occupancy attributes, fires
   * the resize event so the 3D view re-measures against its new track, and
   * puts focus where the panel landed. The announcement is the title-bar
   * menu's job.
   *
   * @param {string} panelId - a dock panel id such as 'console', not an
   *   element id
   * @param {string} targetField - 'left' | 'right-top' | 'right-bottom' | 'bottom'
   * @param {number|null} [index] - position among the field's occupants
   * @param {{mergeWith?: string|null}} [options] - join an occupant's tab group
   * @returns {{ok: boolean, reason: string|null, field: string|null, merged: boolean}}
   */
  movePanel(panelId, targetField, index = null, options = {}) {
    const result = this._dock.movePanel(panelId, targetField, index, options);
    if (!result.ok) return result;

    // A stowed target would swallow the panel invisibly (its field is
    // display:none), so landing there brings the field back first.
    const stowDef = STOW_FIELDS.find((f) => f.name === targetField);
    if (stowDef && this._panes[stowDef.paneKey]) {
      this._panes[stowDef.paneKey] = false;
      this._savePaneState();
    }

    this._dock.save();
    this._dock.applyToDom();
    this._applyPaneAttributes();
    document.dispatchEvent(new CustomEvent('classic-layout-resize'));

    // Rebuilding the tab groups discards and recreates the shared bars, so the
    // menus have to be re-hung before focus is sent to one of their buttons.
    this._refreshTitlebarControls();

    // Focus goes to the moved panel's title bar, or to its tab when the
    // target field merged.
    this._focusAfterMove(panelId);
    return result;
  }

  /**
   * Put focus where the panel landed. A title bar is not focusable itself, so
   * its menu button — the control the user just came from — takes the focus,
   * which also leaves them able to move the panel straight on again.
   * @param {string} panelId
   * @private
   */
  _focusAfterMove(panelId) {
    const target = this._dock.focusTargetFor(panelId);
    if (!target) return;
    const focusable =
      target.getAttribute?.('role') === 'tab'
        ? target
        : target.querySelector?.('.classic-panel-menu-btn') || target;
    focusable.focus?.();
  }

  /**
   * The panels this one could merge with: everything else on screen that is
   * not already sharing its cell. Hidden panels are left out — merging into
   * something invisible is not a move a user can make sense of.
   * @param {string} panelId
   * @returns {string[]}
   * @private
   */
  _mergeCandidates(panelId) {
    const group = this._dock.getGroupOf(panelId);
    return DOCK_PANEL_IDS.filter(
      (id) => id !== panelId && !group.includes(id) && this._isPanelVisible(id)
    );
  }

  /**
   * Back to the default arrangement (View > Reset Panel Layout), the escape
   * hatch when a dock has been rearranged into something the user cannot
   * find their way out of.
   * @returns {boolean} whether anything changed
   */
  resetPanelLayout() {
    this._dock.reset();
    this._dock.save();
    this._dock.applyToDom();
    this._applyPaneAttributes();
    document.dispatchEvent(new CustomEvent('classic-layout-resize'));
    this._refreshTitlebarControls();
    announceImmediate('Panel layout reset');
    return true;
  }

  /**
   * Whether the dock is at desktop width. The 1024px breakpoint itself lives
   * only in classic.css; this reads the flag that media query sets, so the two
   * cannot drift apart.
   * @returns {boolean}
   * @private
   */
  _isDesktopWidth() {
    if (!document.body) return true;
    const flag = getComputedStyle(document.body)
      .getPropertyValue('--classic-dock-desktop')
      .trim();
    // Outside Classic the property is unset; the dock is not on screen then,
    // and treating it as desktop keeps the stored arrangement in play.
    return flag === '' ? true : flag === '1';
  }

  /**
   * Re-apply the arrangement when the window crosses the breakpoint. Below it
   * the stack shows the default; the user's arrangement is neither applied nor
   * touched, and comes back unchanged on the way up.
   * @private
   */
  _checkBreakpoint() {
    if (!this.active) return;
    const isDesktop = this._isDesktopWidth();
    if (isDesktop === this._wasDesktop) return;
    this._wasDesktop = isDesktop;

    this._dock.applyToDom();
    this._applyPaneAttributes();
    this._refreshTitlebarControls();
    document.dispatchEvent(new CustomEvent('classic-layout-resize'));
  }

  /**
   * The dock's field map, for the title-bar menu and the tests.
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
    // The toolbar's Customizer button says whether the pane is shown, however
    // it was shown or hidden (its own press, the ✕, the Window menu, a key).
    document
      .getElementById('classicTbCustomizerBtn')
      ?.setAttribute('aria-pressed', String(this._panes.customizerVisible));

    // Simplified hides Viewport-Control without clearing its preference, so
    // the visible-attribute follows the same rule the occupancy does.
    const simplified =
      getUIModeController().getClassicDensity() === 'simplified';
    body.dataset.classicAnimateVisible = String(this._panes.animateVisible);
    body.dataset.classicFontListVisible = String(this._panes.fontListVisible);
    body.dataset.classicViewportControlVisible = String(
      this._panes.viewportControlVisible && !simplified
    );

    // A stowed field reports 'empty' so the existing track math hands its
    // space to the 3D view, and the empty-field display:none rule takes its
    // content out of the tab order. Desktop only: below the breakpoint
    // occupancy stays truthful and the stow attributes alone drive the
    // stacked presentation. A stowed section leaves the flow and its rail
    // renders as a full-width restore bar in the field's stack position, so a
    // stowed preference can never strand a pane unreachable. _checkBreakpoint
    // re-stamps on every crossing.
    const occupancy = this._fieldOccupancy();
    const desktop = this._isDesktopWidth();
    for (const field of DOCK_FIELDS) {
      const stowed = desktop && this.isFieldStowed(field.name);
      body.dataset[`classicField${field.datasetSuffix}`] =
        occupancy[field.name] && !stowed ? 'occupied' : 'empty';
    }
    // Effective stow, not the raw preference: a stowed field whose panes are
    // all hidden has no tab to restore it, so the attribute (which drives the
    // rails and the sibling-pinning grid rules) must not fire for it.
    for (const def of STOW_FIELDS) {
      const field = DOCK_FIELDS.find((f) => f.name === def.name);
      body.dataset[`classicStow${field.datasetSuffix}`] = String(
        Boolean(this._panes[def.paneKey]) && Boolean(occupancy[def.name])
      );
    }
    this._refreshStowRails();
  }

  /**
   * Reset the Forge console to its Log tab on entering Classic, reporting
   * which tab was selected so exit() can put it back.
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
      // Field stow. Absent from older preferences; each key is validated on
      // its own below, so old profiles hydrate to false.
      stowLeft: false,
      stowRightTop: false,
      stowRightBottom: false,
      // A panel folded by the Collapse button an earlier version had is not
      // read back: no control is left to unfold it.
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
   * Find or create a labeled slot section inside `parent`, with an optional
   * desktop-style titlebar (text + optional close button).
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
        bar.className = TITLEBAR_CLASS;
        const title = document.createElement('span');
        title.className = TITLE_CLASS;
        title.textContent = def.titlebar.text;
        bar.appendChild(title);

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
