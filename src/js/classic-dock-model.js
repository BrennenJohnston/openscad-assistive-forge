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
  { name: 'left', datasetSuffix: 'Left', elementId: 'classicFieldLeft' },
  {
    name: 'right-top',
    datasetSuffix: 'RightTop',
    elementId: 'classicFieldRightTop',
  },
  {
    name: 'right-bottom',
    datasetSuffix: 'RightBottom',
    elementId: 'classicFieldRightBottom',
  },
  // The bottom strip predates the field model (B2) and keeps its id, so the
  // CSS and the R2a regression tests that name it still apply.
  { name: 'bottom', datasetSuffix: 'Bottom', elementId: 'classicBottomStrip' },
]);

/** @type {ReadonlyArray<string>} */
export const DOCK_FIELD_NAMES = Object.freeze(DOCK_FIELDS.map((f) => f.name));

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
    this._getElement =
      options.getElement || ((id) => document.getElementById(id));

    /** @type {Record<string, string[][]>} */
    this._map = defaultArrangement();
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
    return true;
  }

  /** Back to the default arrangement (View > Reset Panel Layout, B9). */
  reset() {
    this._map = defaultArrangement();
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

    return {
      ok: true,
      reason: null,
      field: targetField,
      merged: mergeWith !== null,
    };
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
    for (const field of DOCK_FIELDS) {
      const container = this._getElement(field.elementId);
      if (!container) continue;

      const wanted = this.getOccupants(field.name)
        .map((panelId) => this._getElement(elementIdFor(panelId)))
        .filter(Boolean);

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
