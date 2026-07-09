/**
 * Keyboard Shortcuts Binder (MC-1)
 *
 * Advertises keyboard shortcuts to assistive technology by applying
 * aria-keyshortcuts to the DOM elements that activate each action.
 * Screen readers announce these when the element receives focus, making
 * shortcuts like F6 (render) discoverable without opening the help modal.
 *
 * Attribute syntax follows WAI-ARIA:
 * https://www.w3.org/TR/wai-aria-1.2/#aria-keyshortcuts
 *
 * @license GPL-3.0-or-later
 */

/**
 * Maps shortcut action names (keys of DEFAULT_SHORTCUTS in
 * keyboard-config.js) to CSS selectors for the element(s) that perform
 * the same action when activated. Selectors may match several elements
 * (e.g. desktop and mobile variants of the same control).
 *
 * Only actions with a discoverable, always-present UI control are
 * listed; purely-keyboard actions (panel cycling, editor find, etc.)
 * have no element to annotate.
 */
const ACTION_TARGETS = {
  render: '#primaryActionBtn',
  download: '#primaryActionBtn',
  focusMode: '#focusModeBtn',
  toggleExpertMode: '#expertModeToggle',
  toggleTheme: '#themeToggle',
  resetAllParams: '#resetAllBtn',
  searchParams: '#paramSearchInput',
  showShortcutsModal: '#shortcutsToggle',
  resetView: '#cameraResetView, #mobileCameraResetView',
  toggleProjection: '#projectionToggle, #mobileProjectionToggle',
  viewTop: '.camera-view-btn[data-view="top"]',
  viewBottom: '.camera-view-btn[data-view="bottom"]',
  viewFront: '.camera-view-btn[data-view="front"]',
  viewBack: '.camera-view-btn[data-view="back"]',
  viewLeft: '.camera-view-btn[data-view="left"]',
  viewRight: '.camera-view-btn[data-view="right"]',
  viewDiagonal: '.camera-view-btn[data-view="diagonal"]',
};

/**
 * Convert a shortcut definition from keyboard-config.js
 * ({ key, ctrl?, shift?, alt?, meta? }) to WAI-ARIA aria-keyshortcuts
 * syntax, e.g. { key: 'e', ctrl: true } -> "Control+E".
 *
 * @param {Object} shortcut - Shortcut definition
 * @returns {string} aria-keyshortcuts value for this shortcut
 */
export function toAriaKeyshortcut(shortcut) {
  const parts = [];
  if (shortcut.ctrl) parts.push('Control');
  if (shortcut.alt) parts.push('Alt');
  if (shortcut.shift) parts.push('Shift');
  if (shortcut.meta) parts.push('Meta');

  let key = shortcut.key;
  if (key === ' ') {
    key = 'Space';
  } else if (key.length === 1 && /[a-z]/i.test(key)) {
    key = key.toUpperCase();
  }
  parts.push(key);

  return parts.join('+');
}

/**
 * Apply aria-keyshortcuts attributes for the given shortcut config.
 * Safe to call repeatedly (e.g. after the user re-maps a shortcut):
 * each element's attribute is fully recomputed on every call.
 *
 * @param {Object} shortcutConfig - Map of action name -> shortcut
 *   definition (e.g. keyboardConfig.getAllShortcuts() or
 *   DEFAULT_SHORTCUTS)
 * @param {Document|HTMLElement} [root=document] - Root to query within
 * @returns {number} Number of elements annotated
 */
export function applyAriaKeyshortcuts(shortcutConfig, root = document) {
  /** @type {Map<Element, string[]>} */
  const byElement = new Map();

  for (const [action, selector] of Object.entries(ACTION_TARGETS)) {
    const shortcut = shortcutConfig[action];
    if (!shortcut || !shortcut.key) continue;

    const value = toAriaKeyshortcut(shortcut);
    for (const el of root.querySelectorAll(selector)) {
      const list = byElement.get(el) || [];
      if (!list.includes(value)) list.push(value);
      byElement.set(el, list);
    }
  }

  for (const [el, values] of byElement) {
    el.setAttribute('aria-keyshortcuts', values.join(' '));
  }

  return byElement.size;
}
