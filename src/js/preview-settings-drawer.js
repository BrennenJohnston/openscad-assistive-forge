/**
 * Preview Settings Drawer Controller
 * Overlay drawer for preview settings that sits on top of the STL preview.
 * When collapsed, only the toggle button is visible. When expanded, content overlays the preview.
 * The drawer auto-sizes to fit content and scrolls if needed. On a phone
 * held upright it is a sheet over the preview from under the status line,
 * as tall as its controls at first and then as tall as its grip sets it,
 * the height kept as a share of the screen's height.
 * @license GPL-3.0-or-later
 */

import {
  getDrawerStateKey,
  safeGetItem,
  safeSetItem,
  STORAGE_KEY_PHONE_SETTINGS_HEIGHT,
} from './storage-keys.js';
import {
  closeOtherPhoneDrawers,
  isPhoneLayout,
  isSidewaysPhone,
  registerPhoneDrawer,
} from './phone-drawers.js';
import { registerLookDrawer, slideDrawer } from './drawer-motion.js';
import { initSheetGrip } from './phone-sheet-grip.js';

// Storage key using standardized naming convention
const STORAGE_KEY_DRAWER_COLLAPSED = getDrawerStateKey('preview-settings');

/**
 * The phone sheet's first height, as a share of the screen's height: as tall
 * as its controls, at most this.
 */
export const SETTINGS_SHEET_CAP = 0.4;

/** One touch target, when the token cannot be read. */
const TOUCH_TARGET_FALLBACK_PX = 44;

/**
 * The least and most the phone sheet may be, in px: its floor (the title row
 * and one control) and the room from its top down to the bar.
 * @param {{top: number, viewportHeight: number, barReserved: number, floor: number}} m
 * @returns {{min: number, max: number}}
 */
export function settingsSheetBounds({
  top,
  viewportHeight,
  barReserved,
  floor,
}) {
  const max = Math.max(0, Math.floor(viewportHeight - barReserved - top));
  return { min: Math.min(Math.max(0, Math.ceil(floor)), max), max };
}

/**
 * The sheet's height for a saved share, within its bounds; with no share,
 * the fallback (its controls' height, capped).
 * @param {number|null} share - of the screen's height, 0 to 1
 * @param {{min: number, max: number}} bounds - px
 * @param {number} viewportHeight - px
 * @param {number} fallbackPx
 * @returns {number} px
 */
export function settingsSheetPx(
  share,
  { min, max },
  viewportHeight,
  fallbackPx
) {
  const wanted =
    Number.isFinite(share) && share > 0 && share <= 1
      ? share * viewportHeight
      : fallbackPx;
  return Math.round(Math.min(max, Math.max(min, wanted)));
}

/** @returns {number|null} the saved share of the screen's height, or null */
export function loadSettingsShare() {
  const saved = parseFloat(safeGetItem(STORAGE_KEY_PHONE_SETTINGS_HEIGHT));
  return Number.isFinite(saved) && saved > 0 && saved <= 1 ? saved : null;
}

/** A length token on the root, in px, or the fallback when it cannot be read. */
function rootPx(name, fallback) {
  const value = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(name)
  );
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Initialize the preview settings drawer controller
 * @param {Object} options - Configuration options
 * @param {Function} options.onResize - Callback when drawer is resized (for preview manager)
 */
export function initPreviewSettingsDrawer(options = {}) {
  const toggleBtn = document.getElementById('previewDrawerToggle');
  const previewInfoSection = document.getElementById('previewInfoSection');
  const previewPanel = document.querySelector('.preview-panel');

  if (!toggleBtn || !previewInfoSection) {
    return;
  }

  let isExpanded = false; // Start collapsed, expand() will set proper state

  // The settings slide down out from under the row with the toggle, keeping
  // their open height, and the drawer's box grows with them: on a desktop
  // the box lies over the preview.
  const content = previewInfoSection.querySelector('.preview-info-content');
  const row = previewInfoSection.querySelector('.preview-drawer-header');
  const slideParts = () => {
    const height = `${content?.offsetHeight ?? 0}px`;
    return [
      // A flex item: its height alone would shrink with the growing box.
      { el: content, hold: { height, minHeight: height } },
      {
        el: previewInfoSection,
        role: 'space',
        props: {
          height: [row?.offsetHeight ?? 0, previewInfoSection.offsetHeight],
        },
      },
    ];
  };

  // ==========================================================================
  // The phone sheet: on a phone held upright the settings lie over the
  // preview as a fixed sheet, a tinted layer behind them and a grip across
  // their bottom edge (layout.css reads --phone-settings-top and
  // --phone-settings-height). Held sideways, the stylesheet's own overlay.
  // ==========================================================================
  const glass = document.querySelector(
    '.customizer-glass[data-sheet="settings"]'
  );
  const grip = document.getElementById('settingsHeightGrip');
  const onPhoneSheet = () => isPhoneLayout() && !isSidewaysPhone();
  let share = loadSettingsShare();
  let sheetTop = 0;
  let sheetPx = 0;

  /**
   * The sheet starts a small space under the status line, which sits at the
   * top of the preview and is spoken; with the line hidden, at the foot of
   * its row. Read at every open: a wider font can wrap the rows above it.
   * Nothing here reads a box of the preview, which another drawer's close
   * may still be easing.
   */
  const placeSheetTop = () => {
    const status = document.getElementById('previewStatusBar');
    const line = status ? status.getBoundingClientRect() : null;
    const lineShown =
      !!line && line.height > 0 && getComputedStyle(status).display !== 'none';
    const under = lineShown
      ? line.bottom + rootPx('--space-xs', 4)
      : (row?.getBoundingClientRect().bottom ?? 0);
    sheetTop = Math.max(0, Math.round(under));
    document.documentElement.style.setProperty(
      '--phone-settings-top',
      `${sheetTop}px`
    );
  };

  /** The least the sheet may be: its title row, one control and its padding. */
  const sheetFloor = () => {
    const title = content?.querySelector('.preview-settings-header');
    const cs = content ? getComputedStyle(content) : null;
    const padding = cs
      ? (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
      : 0;
    return (
      (title?.offsetHeight ?? 0) +
      rootPx('--size-touch-target', TOUCH_TARGET_FALLBACK_PX) +
      padding
    );
  };

  const sheetBounds = () =>
    settingsSheetBounds({
      top: sheetTop,
      viewportHeight: window.innerHeight,
      barReserved: rootPx(
        '--actions-bar-reserved',
        rootPx('--actions-bar-collapsed-offset', 0)
      ),
      floor: sheetFloor(),
    });

  let gripControl = null;

  const applySheet = () => {
    sheetPx = settingsSheetPx(
      share,
      sheetBounds(),
      window.innerHeight,
      Math.min(
        content?.scrollHeight ?? 0,
        SETTINGS_SHEET_CAP * window.innerHeight
      )
    );
    document.documentElement.style.setProperty(
      '--phone-settings-height',
      `${sheetPx}px`
    );
    gripControl?.update();
  };

  const setSheetHeight = (px, { save = true } = {}) => {
    const { min, max } = sheetBounds();
    share = Math.round(Math.min(max, Math.max(min, px))) / window.innerHeight;
    applySheet();
    if (save) {
      safeSetItem(STORAGE_KEY_PHONE_SETTINGS_HEIGHT, share.toFixed(4));
    }
  };

  gripControl = initSheetGrip({
    grip,
    axis: 'y',
    bounds: sheetBounds,
    get: () => sheetPx,
    set: setSheetHeight,
    describe: (px) =>
      `Preview Settings ${Math.round((px / window.innerHeight) * 100)}% of the screen's height`,
    origin: () => sheetTop,
  });

  // The layer behind the sheet and the grip on its edge travel with it.
  const sheetParts = () => [
    { el: content },
    { el: glass, role: 'rider' },
    { el: grip, role: 'rider' },
  ];

  const showSheet = () => {
    // Out of the flow first: in it, the content would push the status line
    // (and the whole preview) down the page before it is read.
    content?.classList.add('phone-sheet-open');
    placeSheetTop();
    if (glass) glass.hidden = false;
    if (grip) grip.hidden = false;
    applySheet();
  };

  const hideSheet = () => {
    content?.classList.remove('phone-sheet-open');
    if (glass) glass.hidden = true;
    if (grip) grip.hidden = true;
  };

  const sheetShown = () => !!content?.classList.contains('phone-sheet-open');

  /**
   * Load collapsed state from localStorage
   * Returns null if not set (use default behavior)
   */
  const loadCollapsedState = () => {
    const saved = safeGetItem(STORAGE_KEY_DRAWER_COLLAPSED);
    if (saved !== null) {
      return saved === 'true';
    }
    return null; // Not set, use default
  };

  /**
   * Save collapsed state to localStorage
   */
  const saveCollapsedState = (collapsed) => {
    safeSetItem(STORAGE_KEY_DRAWER_COLLAPSED, String(collapsed));
  };

  /**
   * Update the toggle button's ARIA state and label
   */
  const updateToggle = (expanded) => {
    toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggleBtn.setAttribute(
      'aria-label',
      expanded ? 'Collapse preview settings' : 'Expand preview settings'
    );
  };

  /** The drawer laid out closed: once its slide has ended, or at once. */
  const layOutClosed = () => {
    if (isExpanded) return;
    previewInfoSection.classList.add('preview-drawer-collapsed');
    previewInfoSection.classList.remove('preview-drawer-expanded');
    if (previewPanel) {
      previewPanel.classList.add('preview-drawer-collapsed');
    }
  };

  /**
   * Expand the drawer to show all settings (auto-sized)
   * @param {import('./drawer-motion.js').DrawerHow} [how]
   */
  const expand = ({ instant = false, remember = true } = {}) => {
    if (isExpanded) return;
    // On a phone one drawer is open at a time.
    closeOtherPhoneDrawers('preview-settings');
    const asSheet = onPhoneSheet();
    isExpanded = true;
    previewInfoSection.classList.remove('preview-drawer-collapsed');
    previewInfoSection.classList.add('preview-drawer-expanded');

    if (previewPanel) {
      previewPanel.classList.remove('preview-drawer-collapsed');
    }

    updateToggle(true);
    if (remember) saveCollapsedState(false);

    if (asSheet) {
      // The preview keeps its full size behind the sheet: nothing to resize.
      showSheet();
      return slideDrawer(sheetParts(), {
        from: 'top',
        open: true,
        instant,
        name: 'preview-settings',
      });
    }

    // Notify preview manager
    if (options.onResize) {
      requestAnimationFrame(() => options.onResize());
    }
    return slideDrawer(slideParts(), {
      from: 'top',
      open: true,
      instant,
      name: 'preview-settings',
    });
  };

  /**
   * Collapse the drawer to show only the toggle button
   * @param {import('./drawer-motion.js').DrawerHow} [how]
   */
  const collapse = ({ instant = false, remember = true } = {}) => {
    if (!isExpanded) return;
    const asSheet = sheetShown();
    isExpanded = false;
    updateToggle(false);
    if (remember) saveCollapsedState(true);

    if (asSheet) {
      return slideDrawer(sheetParts(), {
        from: 'top',
        open: false,
        instant,
        name: 'preview-settings',
        inert: [content],
        whenClosed: () => {
          if (isExpanded) return;
          hideSheet();
          layOutClosed();
        },
      });
    }

    return slideDrawer(slideParts(), {
      from: 'top',
      open: false,
      instant,
      name: 'preview-settings',
      inert: [content],
      whenClosed: () => {
        if (isExpanded) return;
        layOutClosed();

        // Notify preview manager
        if (options.onResize) {
          requestAnimationFrame(() => options.onResize());
        }
      },
    });
  };

  /**
   * Toggle between expanded and collapsed states
   */
  const toggle = (event) => {
    if (event) {
      event.preventDefault();
    }
    if (isExpanded) {
      collapse();
    } else {
      expand();
    }
  };

  /**
   * Escape in the phone sheet, or on its grip, closes it and returns focus
   * to its button.
   */
  const closeSheetOnEscape = (event) => {
    if (event.key !== 'Escape' || !isExpanded || !sheetShown()) return;
    event.preventDefault();
    event.stopPropagation();
    collapse();
    toggleBtn.focus();
  };

  // Attach click handler to toggle button
  toggleBtn.addEventListener('click', toggle);
  content?.addEventListener('keydown', closeSheetOnEscape);
  grip?.addEventListener('keydown', closeSheetOnEscape);
  registerPhoneDrawer('preview-settings', {
    isOpen: () => isExpanded,
    close: () => collapse(),
  });
  registerLookDrawer('preview-settings', {
    place: () => previewInfoSection,
    isOpen: () => isExpanded && previewInfoSection.offsetHeight > 0,
    open: expand,
    close: collapse,
  });

  // Set initial state - check saved preference first, then default based on screen size
  const isMobile = window.innerWidth < 768;
  const savedCollapsedState = loadCollapsedState();

  // Determine initial collapsed state
  const shouldStartCollapsed = isMobile || savedCollapsedState !== false;

  // Apply initial state directly
  if (shouldStartCollapsed) {
    isExpanded = false;
    previewInfoSection.classList.add('preview-drawer-collapsed');
    previewInfoSection.classList.remove('preview-drawer-expanded');
    if (previewPanel) {
      previewPanel.classList.add('preview-drawer-collapsed');
    }
    updateToggle(false);
  } else {
    isExpanded = true;
    previewInfoSection.classList.remove('preview-drawer-collapsed');
    previewInfoSection.classList.add('preview-drawer-expanded');
    if (previewPanel) {
      previewPanel.classList.remove('preview-drawer-collapsed');
    }
    updateToggle(true);
  }

  // ============================================================================
  // On-screen keyboard detection (mobile)
  // ============================================================================
  let keyboardVisible = false;

  /**
   * Detect if on-screen keyboard is visible
   * Compares visual viewport height to window height
   */
  const detectKeyboard = () => {
    if (!('visualViewport' in window) || !window.visualViewport) return;

    const viewportHeight = window.visualViewport.height;
    const windowHeight = window.innerHeight;
    const heightDiff = windowHeight - viewportHeight;

    // Keyboard is likely visible if height difference > 150px
    const isKeyboardVisible = heightDiff > 150;

    if (isKeyboardVisible !== keyboardVisible) {
      keyboardVisible = isKeyboardVisible;

      if (isKeyboardVisible) {
        previewInfoSection.classList.add('keyboard-visible');
      } else {
        previewInfoSection.classList.remove('keyboard-visible');
      }
    }
  };

  // Set up keyboard detection listener
  if ('visualViewport' in window && window.visualViewport) {
    window.visualViewport.addEventListener('resize', detectKeyboard);
    // Initial check
    detectKeyboard();
  }

  // Handle window resize
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const nowMobile = window.innerWidth < 768;
      if (nowMobile && isExpanded) {
        collapse();
      } else if (!nowMobile && !isExpanded) {
        // Only auto-expand if the user has not explicitly chosen to keep it collapsed.
        // loadCollapsedState() returns true when the user saved a collapsed preference,
        // null when no preference has been saved yet, and false when explicitly expanded.
        if (loadCollapsedState() !== true) {
          expand();
        }
      }
    }, 150);
  });

  // Return controller methods for external use
  return {
    expand,
    collapse,
    toggle,
    isExpanded: () => isExpanded,
  };
}
