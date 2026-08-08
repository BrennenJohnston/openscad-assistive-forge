/**
 * Classic Dock Model (B6) — the field map behind Classic's relocatable dock.
 *
 * The desktop's dock is Qt's; this is a small from-scratch equivalent. It
 * holds ONE piece of state — which panel sits in which dock field — and
 * exposes ONE mutation, movePanel(). Everything that relocates a panel goes
 * through it: the title-bar menu (B8), the Reset item (B9), and the tests.
 *
 * Shape:
 *
 *   field   a cell of the Classic grid: left | right-top | right-bottom |
 *           bottom. `centre` is the 3D view — it is never a drop target and
 *           never appears in the map.
 *   group   an ordered list of panels sharing one cell of a field. Separate
 *           groups sit side by side (the bottom strip) or stacked (a column);
 *           a group of two or more is what B7 draws as a tab group.
 *
 *   { left: [['editor']], bottom: [['console'], ['errorLog']] }
 *
 * Groups exist because a field alone cannot express the default arrangement:
 * the bottom strip holds Console, Error-Log, Animate and Font List side by
 * side (desktop shots 1-3), so "more than one occupant" cannot by itself mean
 * "tab group" without turning the default layout into tabs.
 *
 * The model never touches CSS or announces anything; the layout controller
 * owns the data attributes, the resize event and the announcements.
 *
 * @license GPL-3.0-or-later
 */

/**
 * The dock fields, in the order the grid lays them out. `datasetSuffix` is the
 * body attribute B2 stamps (data-classic-field-<name>), kept here so the field
 * names have exactly one definition shared by the model, the controller and
 * the CSS attribute selectors.
 * @type {ReadonlyArray<{name: string, datasetSuffix: string, elementId: string}>}
 */
export const DOCK_FIELDS = Object.freeze([
  {
    name: 'left',
    datasetSuffix: 'Left',
    elementId: 'classicFieldLeft',
    label: 'Left column',
  },
  {
    name: 'right-top',
    datasetSuffix: 'RightTop',
    elementId: 'classicFieldRightTop',
    label: 'Upper right',
  },
  {
    name: 'right-bottom',
    datasetSuffix: 'RightBottom',
    elementId: 'classicFieldRightBottom',
    label: 'Lower right',
  },
  // The bottom strip predates the field model (B2) and keeps its id, so the
  // CSS and the R2a regression tests that name it still apply.
  {
    name: 'bottom',
    datasetSuffix: 'Bottom',
    elementId: 'classicBottomStrip',
    label: 'Bottom',
  },
]);

/** @type {ReadonlyArray<string>} */
export const DOCK_FIELD_NAMES = Object.freeze(DOCK_FIELDS.map((f) => f.name));

/**
 * The name a dock field goes by in the interface. Owner-approved 2026-08-07:
 * a merged field's tablist is named after the field ("Bottom panels"), which
 * is what tells two tab groups apart when both are on screen.
 * @param {string} field
 * @returns {string}
 */
export function fieldLabel(field) {
  return DOCK_FIELDS.find((f) => f.name === field)?.label || field;
}

/**
 * The 3D view. It is not a field: it holds no dock panel, it is never a move
 * target, and collapsing it would leave the app with nothing to look at.
 */
export const CENTRE_FIELD = 'centre';

/**
 * Every panel the dock can place, with the element that actually moves and the
 * field it starts in. The default arrangement is these `field` values, which
 * reproduce the owner's desktop screenshots 1-3.
 *
 * Labels are the upstream dock names (Appendix U), owner-approved 2026-08-06 —
 * the same strings the slot titlebars show, defined once here.
 * @type {ReadonlyArray<{id: string, label: string, elementId: string, field: string}>}
 */
export const DOCK_PANELS = Object.freeze([
  {
    id: 'editor',
    label: 'Editor',
    elementId: 'classicEditorSlot',
    field: 'left',
  },
  // The Customizer is the Forge parameter panel itself, not a created slot —
  // its Classic titlebar lives inside it (#classicCustomizerBar).
  {
    id: 'customizer',
    label: 'Customizer',
    elementId: 'paramPanel',
    field: 'right-top',
  },
  {
    id: 'viewportControl',
    label: 'Viewport-Control',
    elementId: 'classicViewportControlSlot',
    field: 'right-bottom',
  },
  {
    id: 'console',
    label: 'Console',
    elementId: 'classicConsoleSlot',
    field: 'bottom',
  },
  {
    id: 'errorLog',
    label: 'Error-Log',
    elementId: 'classicErrorLogSlot',
    field: 'bottom',
  },
  {
    id: 'animate',
    label: 'Animate',
    elementId: 'classicAnimateSlot',
    field: 'bottom',
  },
  {
    id: 'fontList',
    label: 'Font List',
    elementId: 'classicFontListSlot',
    field: 'bottom',
  },
]);

/** @type {ReadonlyArray<string>} */
export const DOCK_PANEL_IDS = Object.freeze(DOCK_PANELS.map((p) => p.id));

/**
 * The upstream dock name for a panel id.
 * @param {string} panelId
 * @returns {string} the label, or the id itself if it is not a dock panel
 */
export function panelLabel(panelId) {
  return DOCK_PANELS.find((p) => p.id === panelId)?.label || panelId;
}

/**
 * The default arrangement — one group per panel, in the order the desktop
 * shows them.
 * @returns {Record<string, string[][]>}
 */
export function defaultArrangement() {
  /** @type {Record<string, string[][]>} */
  const map = {};
  for (const field of DOCK_FIELD_NAMES) map[field] = [];
  for (const panel of DOCK_PANELS) map[panel.field].push([panel.id]);
  return map;
}

/**
 * Tab-group chrome (B7). These are Classic-owned and deliberately share no id
 * or class with the Forge console's own `.console-view-tabs`, which Classic
 * hides (D-9) — two tab systems on one page must not style or select each
 * other.
 */
export const TAB_GROUP_CLASS = 'classic-dock-tabgroup';
export const TAB_BAR_CLASS = 'classic-dock-tabbar';
export const TABLIST_CLASS = 'classic-dock-tablist';
export const TAB_CLASS = 'classic-dock-tab';

/** The pane titlebar built by classic-layout-controller's _ensureSlot. */
const TITLEBAR_CLASS = 'classic-pane-titlebar';

/**
 * @param {string} panelId
 * @returns {string} the id of that panel's tab, referenced by aria-labelledby
 */
export function tabIdFor(panelId) {
  return `classicDockTab-${panelId}`;
}

/** Why a move was refused. Consumed by B8 to keep illegal targets off the menu. */
export const MOVE_REJECTED = Object.freeze({
  UNKNOWN_PANEL: 'unknown-panel',
  UNKNOWN_FIELD: 'unknown-field',
  CENTRE: 'centre-not-a-target',
  FIELD_UNAVAILABLE: 'field-unavailable',
  UNKNOWN_MERGE_TARGET: 'unknown-merge-target',
  NO_CHANGE: 'no-change',
});

export class ClassicDockModel {
  /**
   * @param {Object} [options]
   * @param {(panelId: string) => boolean} [options.isPanelVisible] - whether a
   *   panel is currently on screen (pane toggles and density). Drives field
   *   occupancy: a field holding only hidden panels is empty, so its track
   *   collapses.
   * @param {(field: string) => boolean} [options.isFieldAvailable] - whether a
   *   field is rendered at all right now. Moving into a field that is not
   *   rendered would strand the panel with no way back, so those moves are
   *   refused rather than offered and ignored.
   * @param {(id: string) => Element|null} [options.getElement] - element
   *   lookup, injectable for tests.
   */
  constructor(options = {}) {
    this._isPanelVisible = options.isPanelVisible || (() => true);
    this._isFieldAvailable = options.isFieldAvailable || (() => true);
    const resolve = options.getElement;
    // The injected resolver answers for the panels and fields a test sets up;
    // the tab chrome this module creates is only ever in the document.
    this._getElement = resolve
      ? (id) => resolve(id) || document.getElementById(id)
      : (id) => document.getElementById(id);

    /** @type {Record<string, string[][]>} */
    this._map = defaultArrangement();

    /**
     * The selected panel of each merged group (B7). Exactly one member of
     * every group of two or more is in here; solo panels never are.
     * @type {Set<string>}
     */
    this._active = new Set();

    /**
     * What a panel element looked like before it was pressed into service as a
     * tabpanel, so splitting a group hands it back unchanged.
     * @type {Map<Element, {role: string|null, labelledBy: string|null}>}
     */
    this._panelRoles = new Map();

    /**
     * Where each relocated pane titlebar came from. A merged group shows ONE
     * titlebar — the active panel's, moved into the shared bar — so the fold
     * and close buttons on it keep working instead of disappearing.
     * @type {Map<Element, {parent: Element, nextSibling: Node|null}>}
     */
    this._titlebarHomes = new Map();
  }

  /**
   * A copy of the field map. Callers cannot mutate the model through it.
   * @returns {Record<string, string[][]>}
   */
  getArrangement() {
    /** @type {Record<string, string[][]>} */
    const copy = {};
    for (const field of DOCK_FIELD_NAMES) {
      copy[field] = this._map[field].map((group) => [...group]);
    }
    return copy;
  }

  /**
   * Replace the whole arrangement (B9 hydration). Rejected in full rather than
   * applied in part: a half-restored dock is worse than the default one.
   * @param {unknown} candidate
   * @returns {boolean} whether the candidate was accepted
   */
  setArrangement(candidate) {
    const validated = validateArrangement(candidate);
    if (!validated) return false;
    this._map = validated;
    this._normalizeActive();
    return true;
  }

  /** Back to the default arrangement (View > Reset Panel Layout, B9). */
  reset() {
    this._map = defaultArrangement();
    this._normalizeActive();
  }

  /**
   * @param {string} panelId
   * @returns {string|null} the field the panel sits in
   */
  getFieldOf(panelId) {
    for (const field of DOCK_FIELD_NAMES) {
      if (this._map[field].some((group) => group.includes(panelId))) {
        return field;
      }
    }
    return null;
  }

  /**
   * The panels sharing a cell with this one, itself included.
   * @param {string} panelId
   * @returns {string[]}
   */
  getGroupOf(panelId) {
    for (const field of DOCK_FIELD_NAMES) {
      const group = this._map[field].find((g) => g.includes(panelId));
      if (group) return [...group];
    }
    return [];
  }

  /**
   * The panels in a field, flattened into layout order.
   * @param {string} field
   * @returns {string[]}
   */
  getOccupants(field) {
    return (this._map[field] || []).flat();
  }

  /**
   * Which fields hold at least one panel that is actually on screen. The grid
   * collapses the rest to a zero track (B2).
   * @returns {Record<string, boolean>}
   */
  getOccupancy() {
    /** @type {Record<string, boolean>} */
    const occupancy = {};
    for (const field of DOCK_FIELD_NAMES) {
      occupancy[field] = this.getOccupants(field).some((id) =>
        this._isPanelVisible(id)
      );
    }
    return occupancy;
  }

  /**
   * Whether a panel may legally move to a field. B8 uses this so an illegal
   * target is never offered as a menu item that does nothing.
   * @param {string} panelId
   * @param {string} targetField
   * @returns {boolean}
   */
  canMove(panelId, targetField) {
    return this._checkMove(panelId, targetField) === null;
  }

  /**
   * @param {string} panelId
   * @param {string} targetField
   * @returns {string|null} a MOVE_REJECTED reason, or null if the move is legal
   * @private
   */
  _checkMove(panelId, targetField) {
    if (!DOCK_PANEL_IDS.includes(panelId)) return MOVE_REJECTED.UNKNOWN_PANEL;
    if (targetField === CENTRE_FIELD) return MOVE_REJECTED.CENTRE;
    if (!DOCK_FIELD_NAMES.includes(targetField)) {
      return MOVE_REJECTED.UNKNOWN_FIELD;
    }
    if (!this._isFieldAvailable(targetField)) {
      return MOVE_REJECTED.FIELD_UNAVAILABLE;
    }
    return null;
  }

  /**
   * The only mutation. Moves a panel into `targetField` as its own group at
   * `index`, or into an existing occupant's group when `mergeWith` names one
   * (that is the tab-merge B7 draws).
   *
   * @param {string} panelId
   * @param {string} targetField
   * @param {number|null} [index] - position among the field's groups; appended
   *   when omitted. Ignored when merging.
   * @param {Object} [options]
   * @param {string|null} [options.mergeWith] - a panel already in the target
   *   field whose group this panel joins.
   * @returns {{ok: boolean, reason: string|null, field: string|null, merged: boolean}}
   */
  movePanel(panelId, targetField, index = null, options = {}) {
    const mergeWith = options.mergeWith || null;

    const rejection = this._checkMove(panelId, targetField);
    if (rejection) {
      return { ok: false, reason: rejection, field: null, merged: false };
    }
    if (mergeWith !== null) {
      if (mergeWith === panelId || !DOCK_PANEL_IDS.includes(mergeWith)) {
        return {
          ok: false,
          reason: MOVE_REJECTED.UNKNOWN_MERGE_TARGET,
          field: null,
          merged: false,
        };
      }
      if (this.getFieldOf(mergeWith) !== targetField) {
        return {
          ok: false,
          reason: MOVE_REJECTED.UNKNOWN_MERGE_TARGET,
          field: null,
          merged: false,
        };
      }
    }

    const before = JSON.stringify(this._map);
    this._detach(panelId);

    if (mergeWith !== null) {
      const group = this._map[targetField].find((g) => g.includes(mergeWith));
      // _detach can empty and drop the merge target's own group only when the
      // two shared it, which the field check above already excludes.
      group.push(panelId);
    } else {
      const groups = this._map[targetField];
      const at =
        index === null || index === undefined
          ? groups.length
          : Math.max(0, Math.min(groups.length, Math.trunc(index)));
      groups.splice(at, 0, [panelId]);
    }

    if (JSON.stringify(this._map) === before) {
      return {
        ok: false,
        reason: MOVE_REJECTED.NO_CHANGE,
        field: targetField,
        merged: false,
      };
    }

    // A panel the user just merged is the one they want to see (B7).
    this._active.delete(panelId);
    this._normalizeActive();
    if (mergeWith !== null) this.setActivePanel(panelId);

    return {
      ok: true,
      reason: null,
      field: targetField,
      merged: mergeWith !== null,
    };
  }

  /**
   * Which panel of a merged group is showing. Solo panels are always their own
   * answer, so callers do not have to special-case them.
   * @param {string} panelId - any member of the group
   * @returns {string|null}
   */
  getActivePanel(panelId) {
    const group = this.getGroupOf(panelId);
    if (group.length === 0) return null;
    if (group.length === 1) return group[0];
    return group.find((id) => this._active.has(id)) || group[0];
  }

  /**
   * Select a tab. Its group-mates give up the selection.
   * @param {string} panelId
   */
  setActivePanel(panelId) {
    const group = this.getGroupOf(panelId);
    if (group.length < 2 || !group.includes(panelId)) return;
    for (const id of group) this._active.delete(id);
    this._active.add(panelId);
  }

  /**
   * Keep the invariant: exactly one selected member per merged group, none
   * anywhere else. Called after every mutation so no code path can leave a
   * group with two selections or none.
   * @private
   */
  _normalizeActive() {
    const kept = new Set();
    for (const field of DOCK_FIELD_NAMES) {
      for (const group of this._map[field]) {
        if (group.length < 2) continue;
        const current = group.find((id) => this._active.has(id));
        kept.add(current || group[0]);
      }
    }
    this._active = kept;
  }

  /**
   * Remove a panel from wherever it currently sits, dropping the group it
   * leaves behind if that empties it.
   * @param {string} panelId
   * @private
   */
  _detach(panelId) {
    for (const field of DOCK_FIELD_NAMES) {
      const groups = this._map[field];
      for (let i = groups.length - 1; i >= 0; i -= 1) {
        const at = groups[i].indexOf(panelId);
        if (at === -1) continue;
        groups[i].splice(at, 1);
        if (groups[i].length === 0) groups.splice(i, 1);
      }
    }
  }

  /**
   * Re-parent every panel element into its field container, in arrangement
   * order. Moves go through appendChild, so listeners and live references
   * survive exactly as they do for the entry moves
   * (classic-layout-controller.js header contract).
   *
   * Panels whose element does not exist yet (the reserved Animate / Font List
   * slots before sub-plan F, or any slot outside Classic) are skipped.
   */
  applyToDom() {
    // Tab groups are torn down and rebuilt rather than reconciled in place: a
    // move is a deliberate, infrequent action, and rebuilding is the only way
    // to be sure a panel that has left a group takes none of the group's ARIA
    // with it. Selecting a tab does NOT come through here.
    this.dissolveTabGroups();

    for (const field of DOCK_FIELDS) {
      const container = this._getElement(field.elementId);
      if (!container) continue;

      /** @type {Element[]} */
      const wanted = [];
      for (const group of this._map[field.name]) {
        const els = group
          .map((panelId) => this._getElement(elementIdFor(panelId)))
          .filter(Boolean);
        if (els.length === 0) continue;
        // A group whose other members have no element yet — the reserved
        // Animate and Font List slots before sub-plan F — is not a tab group.
        if (els.length === 1) wanted.push(els[0]);
        else wanted.push(this._buildTabGroup(field.name, group, els));
      }

      // Re-appending an element that is already where it belongs still detaches
      // and re-inserts it, which costs CodeMirror a re-measure on every entry.
      // Only touch the DOM when the order actually differs.
      const current = [...container.children].filter((el) =>
        wanted.includes(el)
      );
      const settled =
        current.length === wanted.length &&
        wanted.every((el, i) => current[i] === el);
      if (settled) continue;

      for (const el of wanted) container.appendChild(el);
    }
  }

  /**
   * Return every panel currently inside a tab group to its field container and
   * strip the tab wiring back off it. Public because exiting Classic has to
   * undo the tab chrome BEFORE the layout controller moves the panels home —
   * otherwise a panel leaves with role="tabpanel" and hidden still on it.
   */
  dissolveTabGroups() {
    for (const wrapper of document.querySelectorAll(`.${TAB_GROUP_CLASS}`)) {
      const parent = wrapper.parentElement;
      const titlebar = wrapper.querySelector(
        `.${TAB_BAR_CLASS} .${TITLEBAR_CLASS}`
      );
      if (titlebar) this._restoreTitlebar(titlebar);

      for (const child of [...wrapper.children]) {
        if (child.classList.contains(TAB_BAR_CLASS)) continue;
        this._restorePanelRole(child);
        parent?.appendChild(child);
      }
      wrapper.remove();
    }
  }

  /**
   * Build one merged group: a shared bar carrying the tablist and the active
   * panel's own titlebar, then the panels themselves as tabpanels. Arrow keys
   * move the selection and the group is a single tab stop.
   *
   * Native <button>s carry the tabs — activation, focusability and the
   * accessible name all come from the element. The tab/tablist/tabpanel roles
   * are the repair on top, because HTML has no tab primitive.
   *
   * @param {string} field
   * @param {string[]} group
   * @param {Element[]} els - the group's panel elements, in the same order
   * @returns {Element} the tab-group wrapper
   * @private
   */
  _buildTabGroup(field, group, els) {
    const active = this.getActivePanel(group[0]);

    const wrapper = document.createElement('div');
    wrapper.className = TAB_GROUP_CLASS;
    wrapper.dataset.classicField = field;

    const bar = document.createElement('div');
    bar.className = TAB_BAR_CLASS;

    const tablist = document.createElement('div');
    tablist.className = TABLIST_CLASS;
    tablist.setAttribute('role', 'tablist');
    // Named after its field, so two merged groups on screen are told apart.
    tablist.setAttribute('aria-label', `${fieldLabel(field)} panels`);

    group.forEach((panelId, i) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.id = tabIdFor(panelId);
      tab.className = TAB_CLASS;
      tab.setAttribute('role', 'tab');
      tab.dataset.classicPanel = panelId;
      tab.setAttribute('aria-controls', els[i].id);
      tab.setAttribute('aria-selected', String(panelId === active));
      tab.tabIndex = panelId === active ? 0 : -1;
      tab.textContent = panelLabel(panelId);
      tab.addEventListener('click', () => this._selectTab(panelId));
      tablist.appendChild(tab);
    });

    tablist.addEventListener('keydown', (event) =>
      this._onTablistKeydown(event, group)
    );
    bar.appendChild(tablist);

    // The active panel's own titlebar joins the shared bar so its fold and
    // close buttons stay live; the tab already carries the name, so the title
    // text inside the bar is hidden by CSS rather than read out twice.
    this._adoptTitlebar(bar, els[group.indexOf(active)]);
    wrapper.appendChild(bar);

    group.forEach((panelId, i) => {
      this._makeTabPanel(els[i], panelId, panelId === active);
      wrapper.appendChild(els[i]);
    });

    return wrapper;
  }

  /**
   * @param {Element} bar
   * @param {Element|undefined} activeEl
   * @private
   */
  _adoptTitlebar(bar, activeEl) {
    const titlebar = activeEl?.querySelector(`.${TITLEBAR_CLASS}`);
    if (!titlebar) return;
    this._titlebarHomes.set(titlebar, {
      parent: titlebar.parentElement,
      nextSibling: titlebar.nextSibling,
    });
    bar.appendChild(titlebar);
  }

  /**
   * @param {Element} panel
   * @param {string} panelId
   * @param {boolean} isActive
   * @private
   */
  _makeTabPanel(panel, panelId, isActive) {
    if (!this._panelRoles.has(panel)) {
      this._panelRoles.set(panel, {
        role: panel.getAttribute('role'),
        labelledBy: panel.getAttribute('aria-labelledby'),
      });
    }
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tabIdFor(panelId));
    panel.hidden = !isActive;
  }

  /**
   * @param {Element} panel
   * @private
   */
  _restorePanelRole(panel) {
    panel.hidden = false;
    const previous = this._panelRoles.get(panel);
    if (!previous) return;
    if (previous.role) panel.setAttribute('role', previous.role);
    else panel.removeAttribute('role');
    if (previous.labelledBy) {
      panel.setAttribute('aria-labelledby', previous.labelledBy);
    } else {
      panel.removeAttribute('aria-labelledby');
    }
    this._panelRoles.delete(panel);
  }

  /**
   * @param {Element} titlebar
   * @private
   */
  _restoreTitlebar(titlebar) {
    const home = this._titlebarHomes.get(titlebar);
    this._titlebarHomes.delete(titlebar);
    if (!home?.parent?.isConnected) return;
    if (home.nextSibling && home.nextSibling.parentNode === home.parent) {
      home.parent.insertBefore(titlebar, home.nextSibling);
    } else {
      home.parent.insertBefore(titlebar, home.parent.firstChild);
    }
  }

  /**
   * Show a tab's panel. Only ARIA, visibility and the shared titlebar change —
   * no panel is re-parented, so the editor keeps its scroll position and the
   * 3D view needs no re-measure.
   * @param {string} panelId
   * @private
   */
  _selectTab(panelId) {
    const group = this.getGroupOf(panelId);
    if (group.length < 2) return;
    if (this.getActivePanel(panelId) === panelId) return;

    const tab = this._getElement(tabIdFor(panelId));
    const bar = tab
      ?.closest(`.${TAB_GROUP_CLASS}`)
      ?.querySelector(`.${TAB_BAR_CLASS}`);
    if (!bar) return;

    this.setActivePanel(panelId);

    const previousTitlebar = bar.querySelector(`.${TITLEBAR_CLASS}`);
    if (previousTitlebar) this._restoreTitlebar(previousTitlebar);

    for (const id of group) {
      const isActive = id === panelId;
      const memberTab = this._getElement(tabIdFor(id));
      if (memberTab) {
        memberTab.setAttribute('aria-selected', String(isActive));
        memberTab.tabIndex = isActive ? 0 : -1;
      }
      const panel = this._getElement(elementIdFor(id));
      if (panel) panel.hidden = !isActive;
    }

    this._adoptTitlebar(bar, this._getElement(elementIdFor(panelId)));
  }

  /**
   * APG tabs keyboard model: arrows move the selection, Home/End jump to the
   * ends, and roving tabindex keeps the group to one tab stop.
   * @param {KeyboardEvent} event
   * @param {string[]} group
   * @private
   */
  _onTablistKeydown(event, group) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

    const from =
      event.target?.dataset?.classicPanel || this.getActivePanel(group[0]);
    const current = group.indexOf(from);
    if (current === -1) return;

    let next;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = group.length - 1;
    else {
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      next = (current + delta + group.length) % group.length;
    }

    event.preventDefault();
    this._selectTab(group[next]);
    this._getElement(tabIdFor(group[next]))?.focus();
  }

  /**
   * Where focus belongs after a panel moves (B7/B8): its tab when the target
   * field merged, otherwise the title bar the panel travels with.
   * @param {string} panelId
   * @returns {Element|null}
   */
  focusTargetFor(panelId) {
    if (this.getGroupOf(panelId).length > 1) {
      return this._getElement(tabIdFor(panelId));
    }
    const panel = this._getElement(elementIdFor(panelId));
    return panel?.querySelector(`.${TITLEBAR_CLASS}`) || panel;
  }
}

/**
 * @param {string} panelId
 * @returns {string} the id of the element that moves for this panel
 */
export function elementIdFor(panelId) {
  return DOCK_PANELS.find((p) => p.id === panelId)?.elementId || panelId;
}

/**
 * Accept a stored arrangement only if it names every dock panel exactly once
 * across known fields. Anything else — a renamed panel, a duplicate, a missing
 * one, a non-array — is refused whole, so hydration can fall back to the
 * default instead of leaving a panel with no home (B9).
 *
 * @param {unknown} candidate
 * @returns {Record<string, string[][]>|null} a normalized copy, or null
 */
export function validateArrangement(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return null;
  }
  const fields = Object.keys(candidate);
  if (fields.length !== DOCK_FIELD_NAMES.length) return null;
  if (!fields.every((name) => DOCK_FIELD_NAMES.includes(name))) return null;

  /** @type {Record<string, string[][]>} */
  const normalized = {};
  const seen = new Set();

  for (const field of DOCK_FIELD_NAMES) {
    const groups = candidate[field];
    if (!Array.isArray(groups)) return null;
    normalized[field] = [];
    for (const group of groups) {
      if (!Array.isArray(group) || group.length === 0) return null;
      for (const panelId of group) {
        if (typeof panelId !== 'string') return null;
        if (!DOCK_PANEL_IDS.includes(panelId)) return null;
        if (seen.has(panelId)) return null;
        seen.add(panelId);
      }
      normalized[field].push([...group]);
    }
  }

  if (seen.size !== DOCK_PANEL_IDS.length) return null;
  return normalized;
}
